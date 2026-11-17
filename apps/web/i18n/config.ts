export const locales = ['fr', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'fr';
export const LOCALE_COOKIE = 'NEXT_LOCALE';
/** Fuseau du jeu : la Bourse ouvre de 9 h à 22 h, heure de Paris. */
export const TIME_ZONE = 'Europe/Paris';

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (locales as readonly string[]).includes(v);

/** Langue du cookie, sinon la première langue reconnue de l'en-tête Accept-Language, sinon le français. */
export function resolveLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) return cookie;
  const wanted = (acceptLanguage ?? '')
    .split(',')
    .map((part) => {
      const [tag = '', q = 'q=1'] = part.trim().split(';');
      return { lang: tag.toLowerCase().split('-')[0], q: Number(q.replace('q=', '')) || 0 };
    })
    .sort((a, b) => b.q - a.q);
  return wanted.map((w) => w.lang).find(isLocale) ?? defaultLocale;
}
