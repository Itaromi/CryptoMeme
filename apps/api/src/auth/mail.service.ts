import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  private readonly transport: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transport = nodemailer.createTransport({
      host: config.get('SMTP_HOST', 'localhost'),
      port: Number(config.get('SMTP_PORT', 1025)),
      secure: false,
      auth: config.get('SMTP_USER') ? { user: config.get('SMTP_USER'), pass: config.get('SMTP_PASS') } : undefined,
    });
  }

  async send(to: string, subject: string, text: string) {
    try {
      await this.transport.sendMail({ from: this.config.get('MAIL_FROM'), to, subject, text });
    } catch (e) {
      this.log.warn(`Envoi impossible (${(e as Error).message}). Contenu : ${text}`);
    }
  }
}
