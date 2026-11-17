/** Langues du site. Les e-mails sont les seuls textes rédigés par l'API dans la langue du joueur. */
export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as readonly string[]).includes(v);

/** Cookie posé par le site quand le joueur choisit sa langue (même origine : il accompagne les appels à l'API). */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** Langue d'une requête : cookie du site, sinon la première langue reconnue d'Accept-Language, sinon le français. */
export function headersLocale(headers: Headers | undefined): Locale {
  const cookie = (headers?.get('cookie') ?? '')
    .split(';')
    .map((c) => c.trim().split('='))
    .find(([name]) => name === LOCALE_COOKIE)?.[1];
  if (isLocale(cookie)) return cookie;
  const wanted = (headers?.get('accept-language') ?? '')
    .split(',')
    .map((part) => {
      const [tag = '', q = 'q=1'] = part.trim().split(';');
      return { lang: tag.toLowerCase().split('-')[0], q: Number(q.replace('q=', '')) || 0 };
    })
    .sort((a, b) => b.q - a.q);
  return wanted.map((w) => w.lang).find(isLocale) ?? 'fr';
}
