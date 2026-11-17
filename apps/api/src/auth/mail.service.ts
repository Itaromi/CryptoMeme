import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Locale } from '../common/locale';
import { MAIL_TEXTS } from './mail.texts';

export interface MailContent {
  subject: string;
  /** Titre affiché en gros dans l'e-mail */
  heading: string;
  /** Paragraphes de texte (non HTML) */
  paragraphs: string[];
  /** Bouton d'action */
  cta?: { label: string; url: string };
  /** Petite ligne en bas (ex. « Ce lien expire dans 1 h ») */
  footnote?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Gabarit HTML sobre aux couleurs du jeu (tables + styles en ligne pour les clients mail). */
function render(m: MailContent, locale: Locale) {
  const l = MAIL_TEXTS[locale];
  const html = `<!doctype html><html lang="${l.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(m.subject)}</title></head>
<body style="margin:0;background:#f5f1e3;font-family:Helvetica,Arial,sans-serif;color:#22201a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1e3;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fbf8ee;border:2px solid #22201a">
<tr><td style="padding:20px 28px;border-bottom:2px solid #22201a;font-size:26px;font-weight:800;letter-spacing:-0.5px">Crypto<span style="background:#e4ef3a;padding:0 4px">Meme</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.2">${esc(m.heading)}</h1>
${m.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5">${esc(p)}</p>`).join('')}
${m.cta ? `<p style="margin:24px 0"><a href="${esc(m.cta.url)}" style="display:inline-block;background:#e4ef3a;color:#22201a;border:2px solid #22201a;padding:12px 20px;font-weight:700;text-decoration:none">${esc(m.cta.label)}</a></p>
<p style="margin:0 0 14px;font-size:13px;color:#6b6656;word-break:break-all">${esc(l.copyLink)} ${esc(m.cta.url)}</p>` : ''}
${m.footnote ? `<p style="margin:20px 0 0;font-size:13px;color:#6b6656">${esc(m.footnote)}</p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #d9d3bf;font-size:12px;color:#6b6656">${esc(l.footer)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [m.heading, '', ...m.paragraphs, ...(m.cta ? ['', `${m.cta.label}${locale === 'fr' ? ' :' : ':'} ${m.cta.url}`] : []), ...(m.footnote ? ['', m.footnote] : [])].join('\n');
  return { html, text };
}

/**
 * E-mails transactionnels.
 * - Production : API Resend (RESEND_API_KEY), domaine d'envoi vérifié chez Resend.
 * - Développement : SMTP (Mailpit sur http://localhost:8025).
 */
@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  private readonly transport: nodemailer.Transporter | null;
  private readonly resendKey: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.resendKey = config.get<string>('RESEND_API_KEY') || undefined;
    this.transport = this.resendKey
      ? null
      : nodemailer.createTransport({
          host: config.get('SMTP_HOST', 'localhost'),
          port: Number(config.get('SMTP_PORT', 1025)),
          secure: Number(config.get('SMTP_PORT', 1025)) === 465,
          auth: config.get('SMTP_USER') ? { user: config.get('SMTP_USER'), pass: config.get('SMTP_PASS') } : undefined,
        });
    this.log.log(`Transport e-mail : ${this.resendKey ? 'Resend' : 'SMTP'}`);
  }

  async send(to: string, content: MailContent, locale: Locale = 'fr') {
    const { html, text } = render(content, locale);
    const from = this.config.get<string>('MAIL_FROM', 'CryptoMeme <no-reply@cryptomeme.local>');
    try {
      if (this.resendKey) {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [to], subject: content.subject, html, text }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!r.ok) throw new Error(`Resend ${r.status} : ${(await r.text()).slice(0, 200)}`);
      } else {
        await this.transport!.sendMail({ from, to, subject: content.subject, html, text });
      }
    } catch (e) {
      // Jamais le contenu (il contient un lien secret) dans les logs de production
      this.log.warn(`Envoi impossible à ${to.replace(/(.).*@/, '$1***@')} : ${(e as Error).message}`);
    }
  }
}
