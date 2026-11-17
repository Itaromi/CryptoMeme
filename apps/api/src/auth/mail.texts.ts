import type { Locale } from '../common/locale';
import type { MailContent } from './mail.service';

/** Textes des e-mails transactionnels, par langue. */
export const MAIL_TEXTS = {
  fr: {
    lang: 'fr',
    copyLink: 'Ou copie ce lien :',
    footer: "Jeu de trading 100 % fictif. Aucun argent réel n'est en jeu. Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.",
    verify: (url: string): MailContent => ({
      subject: 'Confirme ton e-mail — CryptoMeme',
      heading: 'Bienvenue sur le marché !',
      paragraphs: ['Tu as 10 000 $ fictifs, des cryptos absurdes et une saison pour finir premier.', 'Confirme ton adresse pour sécuriser ton compte (et pouvoir récupérer ton mot de passe).'],
      cta: { label: 'Confirmer mon e-mail', url },
      footnote: 'Ce lien expire dans 48 heures.',
    }),
    reset: (url: string, username: string): MailContent => ({
      subject: 'Réinitialisation du mot de passe — CryptoMeme',
      heading: 'Mot de passe oublié ?',
      paragraphs: [`Quelqu'un (toi, espérons-le) a demandé à réinitialiser le mot de passe du compte @${username}.`],
      cta: { label: 'Choisir un nouveau mot de passe', url },
      footnote: 'Ce lien expire dans 1 heure et ne fonctionne qu’une fois.',
    }),
    changed: (url: string, username: string): MailContent => ({
      subject: 'Ton mot de passe a été modifié — CryptoMeme',
      heading: 'Mot de passe modifié',
      paragraphs: [
        `Le mot de passe du compte @${username} vient d'être changé et toutes tes sessions ont été déconnectées.`,
        "Si ce n'est pas toi, réinitialise-le immédiatement depuis la page « Mot de passe oublié ».",
      ],
      cta: { label: 'Me connecter', url },
    }),
  },
  en: {
    lang: 'en',
    copyLink: 'Or copy this link:',
    footer: 'A 100% fictional trading game. No real money is involved. If you did not make this request, just ignore this e-mail.',
    verify: (url: string): MailContent => ({
      subject: 'Confirm your e-mail — CryptoMeme',
      heading: 'Welcome to the market!',
      paragraphs: ['You have $10,000 of play money, absurd cryptos and one season to finish first.', 'Confirm your address to secure your account (and to be able to recover your password).'],
      cta: { label: 'Confirm my e-mail', url },
      footnote: 'This link expires in 48 hours.',
    }),
    reset: (url: string, username: string): MailContent => ({
      subject: 'Password reset — CryptoMeme',
      heading: 'Forgot your password?',
      paragraphs: [`Someone (you, hopefully) asked to reset the password of the account @${username}.`],
      cta: { label: 'Choose a new password', url },
      footnote: 'This link expires in 1 hour and only works once.',
    }),
    changed: (url: string, username: string): MailContent => ({
      subject: 'Your password was changed — CryptoMeme',
      heading: 'Password changed',
      paragraphs: [
        `The password of the account @${username} was just changed and all your sessions were signed out.`,
        'If this was not you, reset it right away from the “Forgot password” page.',
      ],
      cta: { label: 'Sign in', url },
    }),
  },
} satisfies Record<Locale, unknown>;
