import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import * as argon2 from 'argon2';
import { issueError, registerSchema } from '@cryptomeme/shared';
import type { PrismaClient } from '@prisma/client';
import type { z } from 'zod';
import type { Env } from '../common/env';
import { apiError } from '../common/errors';
import { headersLocale } from '../common/locale';
import type { MailService } from './mail.service';
import { MAIL_TEXTS } from './mail.texts';

/** Jeton d'injection de l'instance Better Auth (voir AuthModule). */
export const BETTER_AUTH = Symbol('BETTER_AUTH');

/** Durée d'une session : 30 jours, prolongée au plus une fois par jour tant que le joueur revient. */
const SESSION_TTL_S = 30 * 24 * 3600;

/** Erreur Better Auth au format de l'API (`{ code, message, params }`, traduit par le site). */
const fail = (status: 'BAD_REQUEST' | 'CONFLICT' | 'FORBIDDEN', ...args: Parameters<typeof apiError>) => new APIError(status, apiError(...args));

/** Envoi d'e-mail sans l'attendre : le temps de réponse ne révèle pas si l'adresse existe (MailService journalise les échecs). */
const background = (sending: Promise<void>) => {
  void sending;
  return Promise.resolve();
};

/** Erreur de validation : le premier problème Zod, au format de l'API. */
function invalid(issues: readonly z.core.$ZodIssue[]): APIError {
  const first = issues[0];
  return new APIError('BAD_REQUEST', { ...(first ? issueError(first) : { code: 'BAD_REQUEST' }), message: 'Requête invalide' });
}

/** Valide le corps d'une inscription avec le schéma partagé (mêmes règles que le formulaire du site). */
function validateSignUp(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const r = registerSchema.safeParse({ email: b.email, username: b.name, password: b.password });
  if (!r.success) throw invalid(r.error.issues);
  return r.data;
}

/** Le nouveau mot de passe d'une réinitialisation suit les mêmes règles qu'à l'inscription. */
function validatePassword(body: unknown) {
  const r = registerSchema.shape.password.safeParse((body as Record<string, unknown> | undefined)?.newPassword);
  if (!r.success) throw invalid(r.error.issues);
}

/**
 * Authentification (Better Auth) : e-mail + mot de passe, vérification d'adresse, mot de passe oublié.
 * Le handler est monté sur /api/auth/* (voir main.ts) ; les autres routes lisent la session via AuthGuard.
 */
export function createAuth(prisma: PrismaClient, mail: MailService, env: Env) {
  const web = env.WEB_URL.replace(/\/$/, '');

  return betterAuth({
    appName: 'CryptoMeme',
    baseURL: web,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(web).origin],
    database: prismaAdapter(prisma, { provider: 'postgresql', transaction: true }),
    telemetry: { enabled: false },

    // Le pseudo du joueur sert de « name » Better Auth
    user: { fields: { name: 'username' } },
    session: { expiresIn: SESSION_TTL_S, updateAge: 24 * 3600 },

    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      // Hachage argon2id : les mots de passe d'avant Better Auth restent valides
      password: {
        hash: (password) => argon2.hash(password, { type: argon2.argon2id }),
        verify: ({ hash, password }) => argon2.verify(hash, password),
      },
      sendResetPassword: ({ user, token }, request) => {
        const locale = headersLocale(request?.headers);
        return background(mail.send(user.email, MAIL_TEXTS[locale].reset(`${web}/reset?token=${token}`, user.name), locale));
      },
      onPasswordReset: ({ user }, request) => {
        const locale = headersLocale(request?.headers);
        return background(mail.send(user.email, MAIL_TEXTS[locale].changed(`${web}/login`, user.name), locale));
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      expiresIn: 48 * 3600,
      sendVerificationEmail: ({ user, token }, request) => {
        const locale = headersLocale(request?.headers);
        return background(mail.send(user.email, MAIL_TEXTS[locale].verify(`${web}/verify?token=${token}`), locale));
      },
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/reset-password') return validatePassword(ctx.body);
        if (ctx.path !== '/sign-up/email') return;
        const input = validateSignUp(ctx.body);
        const email = input.email.toLowerCase().trim();
        const taken = await prisma.user.findFirst({
          where: { OR: [{ email }, { username: { equals: input.username, mode: 'insensitive' } }] },
          select: { email: true },
        });
        if (taken) throw taken.email === email ? fail('CONFLICT', 'EMAIL_TAKEN', 'Email déjà utilisé') : fail('CONFLICT', 'USERNAME_TAKEN', 'Pseudo déjà pris');
      }),
    },

    databaseHooks: {
      session: {
        create: {
          // Un compte suspendu ne peut pas ouvrir de session
          before: async (session) => {
            const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { bannedAt: true, banReason: true } });
            if (user?.bannedAt) {
              throw fail('FORBIDDEN', 'ACCOUNT_SUSPENDED', `Compte suspendu${user.banReason ? ` : ${user.banReason}` : ''}`, { reason: user.banReason ?? 'none' });
            }
          },
          after: async (session) => {
            await prisma.user.update({ where: { id: session.userId }, data: { lastLoginAt: new Date() } });
          },
        },
      },
    },

    rateLimit: {
      enabled: env.NODE_ENV === 'production',
      window: 60,
      max: 100,
      customRules: {
        '/sign-up/email': { window: 60, max: 5 },
        '/sign-in/email': { window: 60, max: 10 },
        '/request-password-reset': { window: 300, max: 3 },
        '/send-verification-email': { window: 300, max: 3 },
        '/reset-password': { window: 300, max: 5 },
      },
    },

    advanced: {
      cookiePrefix: 'cm',
      useSecureCookies: env.NODE_ENV === 'production',
      // Derrière le tunnel Cloudflare, l'IP réelle du joueur est dans CF-Connecting-IP
      ipAddress: { ipAddressHeaders: env.TRUST_CLOUDFLARE ? ['cf-connecting-ip'] : ['x-forwarded-for'] },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
