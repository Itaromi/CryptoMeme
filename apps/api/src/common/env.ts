import { z } from 'zod';

const WEAK = ['change-me', 'changeme', 'secret', 'password', 'admin1234'];

/**
 * Validation des variables d'environnement au démarrage.
 * En production, l'API refuse de démarrer avec un secret faible ou une config d'e-mail absente.
 */
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET doit faire au moins 32 caractères'),
    WEB_URL: z.string().url(),
    /** Nombre de proxys de confiance devant l'API (Caddy, cloudflared…) */
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),
    /** Faire confiance à l'en-tête CF-Connecting-IP (derrière un tunnel Cloudflare) */
    TRUST_CLOUDFLARE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    RESEND_API_KEY: z.string().startsWith('re_').optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().min(3).default('CryptoMeme <no-reply@cryptomeme.local>'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (WEAK.some((w) => env.JWT_SECRET.toLowerCase().includes(w))) {
      ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'JWT_SECRET trop faible pour la production' });
    }
    if (!env.WEB_URL.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['WEB_URL'], message: 'WEB_URL doit être en https en production' });
    }
    if (!env.RESEND_API_KEY && !env.SMTP_HOST) {
      ctx.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'Configure RESEND_API_KEY (ou SMTP_HOST) pour les e-mails' });
    }
  });

export type Env = z.infer<typeof schema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  - ${i.path.join('.')} : ${i.message}`).join('\n');
    throw new Error(`Configuration invalide :\n${lines}`);
  }
  return r.data;
}
