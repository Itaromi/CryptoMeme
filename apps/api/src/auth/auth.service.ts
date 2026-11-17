import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenKind } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { LoginInput, RegisterInput } from '@cryptomeme/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';

const ACCESS_TTL_S = 15 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterInput, meta: SessionMeta) {
    const email = input.email.toLowerCase().trim();
    const taken = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username: { equals: input.username, mode: 'insensitive' } }] },
      select: { email: true },
    });
    if (taken) throw new ConflictException(taken.email === email ? 'Email déjà utilisé' : 'Pseudo déjà pris');

    const user = await this.prisma.user.create({
      data: { email, username: input.username, passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }) },
    });
    await this.sendVerification(user.id, user.email);
    return this.issueSession(user.id, meta);
  }

  async login(input: LoginInput, meta: SessionMeta) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase().trim() } });
    // Hash factice pour un temps de réponse constant même si l'email n'existe pas
    const ok = user
      ? await argon2.verify(user.passwordHash, input.password)
      : (await argon2.hash(input.password), false);
    if (!user || !ok) throw new UnauthorizedException('Email ou mot de passe incorrect');
    if (user.bannedAt) throw new ForbiddenException(`Compte suspendu${user.banReason ? ` : ${user.banReason}` : ''}`);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueSession(user.id, meta);
  }

  /** Rotation du refresh token. Réutilisation d'un token déjà consommé ⇒ toute la famille est révoquée. */
  async refresh(raw: string | undefined, meta: SessionMeta) {
    if (!raw) throw new UnauthorizedException();
    const rt = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (!rt) throw new UnauthorizedException();
    if (rt.revokedAt) {
      await this.prisma.refreshToken.updateMany({ where: { family: rt.family, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Session invalide');
    }
    if (rt.expiresAt < new Date()) throw new UnauthorizedException('Session expirée');
    await this.prisma.refreshToken.update({ where: { id: rt.id }, data: { revokedAt: new Date() } });
    return this.issueSession(rt.userId, meta, rt.family);
  }

  async logout(raw: string | undefined) {
    if (!raw) return;
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: sha256(raw), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async issueSession(userId: string, meta: SessionMeta, family: string = randomUUID()) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.bannedAt) throw new ForbiddenException('Compte suspendu');
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role }, { expiresIn: ACCESS_TTL_S });
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        family,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 255),
      },
    });
    return { accessToken, refreshToken, accessTtlMs: ACCESS_TTL_S * 1000 };
  }

  // ─── Tokens à usage unique (vérif email, reset mdp) ───────────────
  private async createUserToken(userId: string, kind: TokenKind, ttlMs: number) {
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.userToken.create({
      data: { userId, kind, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + ttlMs) },
    });
    return raw;
  }

  private async consumeUserToken(raw: string, kind: TokenKind) {
    const t = await this.prisma.userToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (!t || t.kind !== kind || t.usedAt || t.expiresAt < new Date()) throw new BadRequestException('Lien invalide ou expiré');
    // Usage unique, même en cas de double clic simultané
    const used = await this.prisma.userToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } });
    if (!used.count) throw new BadRequestException('Lien invalide ou expiré');
    return t.userId;
  }

  /** Profil du joueur connecté. */
  me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, username: true, role: true, emailVerifiedAt: true, bio: true, createdAt: true },
    });
  }

  /** Renvoie l'e-mail de vérification si l'adresse n'est pas encore confirmée. */
  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, emailVerifiedAt: true } });
    if (!user.emailVerifiedAt) await this.sendVerification(user.id, user.email);
  }

  async sendVerification(userId: string, email: string) {
    const raw = await this.createUserToken(userId, 'EMAIL_VERIFY', 48 * 3600 * 1000);
    const url = `${this.config.get('WEB_URL')}/verify?token=${raw}`;
    await this.mail.send(email, {
      subject: 'Confirme ton e-mail — CryptoMeme',
      heading: 'Bienvenue sur le marché !',
      paragraphs: ['Tu as 10 000 $ fictifs, des cryptos absurdes et une saison pour finir premier.', 'Confirme ton adresse pour sécuriser ton compte (et pouvoir récupérer ton mot de passe).'],
      cta: { label: 'Confirmer mon e-mail', url },
      footnote: 'Ce lien expire dans 48 heures.',
    });
  }

  async verifyEmail(raw: string) {
    const userId = await this.consumeUserToken(raw, 'EMAIL_VERIFY');
    await this.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user) return; // ne révèle pas si l'email existe
    const raw = await this.createUserToken(user.id, 'PASSWORD_RESET', 3600 * 1000);
    const url = `${this.config.get('WEB_URL')}/reset?token=${raw}`;
    await this.mail.send(user.email, {
      subject: 'Réinitialisation du mot de passe — CryptoMeme',
      heading: 'Mot de passe oublié ?',
      paragraphs: [`Quelqu'un (toi, espérons-le) a demandé à réinitialiser le mot de passe du compte @${user.username}.`],
      cta: { label: 'Choisir un nouveau mot de passe', url },
      footnote: 'Ce lien expire dans 1 heure et ne fonctionne qu’une fois.',
    });
  }

  async resetPassword(raw: string, password: string) {
    const userId = await this.consumeUserToken(raw, 'PASSWORD_RESET');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(password, { type: argon2.argon2id }) } }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, username: true } });
    await this.mail.send(user.email, {
      subject: 'Ton mot de passe a été modifié — CryptoMeme',
      heading: 'Mot de passe modifié',
      paragraphs: [`Le mot de passe du compte @${user.username} vient d'être changé et toutes tes sessions ont été déconnectées.`, "Si ce n'est pas toi, réinitialise-le immédiatement depuis la page « Mot de passe oublié »."],
      cta: { label: 'Me connecter', url: `${this.config.get('WEB_URL')}/login` },
    });
  }
}
