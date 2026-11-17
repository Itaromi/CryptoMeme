'use client';
import { useMemo } from 'react';
import { useLocale } from 'next-intl';
import type { Locale } from '@/i18n/config';

const TAGS: Record<Locale, string> = { fr: 'fr-FR', en: 'en-US' };

/**
 * Formateurs liés à une langue. Les montants sont des dollars fictifs :
 * « 1 234,56 $ » en français, « $1,234.56 » en anglais.
 */
export function makeFormat(locale: Locale) {
  const tag = TAGS[locale];
  const dollars = (n: string) => (locale === 'fr' ? `${n} $` : `$${n}`);
  const num = (v: number, opts: Intl.NumberFormatOptions) => v.toLocaleString(tag, opts);
  const compact = new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 1 });
  const relative = new Intl.RelativeTimeFormat(tag, { numeric: 'always', style: 'short' });

  return {
    locale,
    money: (v: number | string) => dollars(num(Number(v), { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
    compactMoney: (v: number | string) => dollars(compact.format(Number(v))),
    /** Prix d'actif : précision adaptée (les shitcoins valent 0,000069 $). */
    price(v: number | string) {
      const n = Number(v);
      if (n === 0) return dollars('0');
      const digits = n >= 1000 ? 2 : n >= 1 ? 4 : Math.min(10, 2 - Math.floor(Math.log10(n)) + 2);
      return dollars(num(n, { minimumFractionDigits: Math.min(digits, 2), maximumFractionDigits: digits }));
    },
    qty: (v: number | string) => num(Number(v), { maximumFractionDigits: Number(v) >= 100 ? 2 : 6 }),
    /** Pourcentage depuis un ratio (0,05 → +5,00 %). */
    pct(v: number | null | undefined, signed = true) {
      if (v == null || !Number.isFinite(v)) return '—';
      const body = num(v * 100, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
      return `${signed && v > 0 ? '+' : ''}${body}${locale === 'fr' ? ' %' : '%'}`;
    },
    number: (v: number | string, opts: Intl.NumberFormatOptions = {}) => num(Number(v), opts),
    date: (d: string | number | Date, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) =>
      new Date(d).toLocaleDateString(tag, opts),
    dateTime: (d: string | number | Date, opts: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }) =>
      new Date(d).toLocaleString(tag, opts),
    /** Temps restant jusqu'à `to` : « 12 s », « 32 min », « 1 h 05 » (« 12s », « 32m », « 1h 05m » en anglais). */
    countdown(to: string | number | Date, now: Date | number) {
      const s = Math.max(0, Math.round((new Date(to).getTime() - new Date(now).getTime()) / 1000));
      const fr = locale === 'fr';
      if (s < 60) return fr ? `${s} s` : `${s}s`;
      const m = Math.floor(s / 60);
      if (m < 60) return fr ? `${m} min` : `${m}m`;
      const rest = String(m % 60).padStart(2, '0');
      return fr ? `${Math.floor(m / 60)} h ${rest}` : `${Math.floor(m / 60)}h ${rest}m`;
    },
    /** Temps écoulé depuis `d`. `now` vient de `useNow()` de next-intl, pour rester pur pendant le rendu. */
    ago(d: string | number | Date, now: Date) {
      const s = Math.round((now.getTime() - new Date(d).getTime()) / 1000);
      if (s < 60) return relative.format(-Math.max(s, 0), 'second');
      if (s < 3600) return relative.format(-Math.floor(s / 60), 'minute');
      if (s < 86400) return relative.format(-Math.floor(s / 3600), 'hour');
      return new Date(d).toLocaleDateString(tag);
    },
  };
}

export type Format = ReturnType<typeof makeFormat>;

/** Formateurs de la langue courante. */
export function useFormat(): Format {
  const locale = useLocale();
  return useMemo(() => makeFormat(locale), [locale]);
}

/** Classe de couleur selon le signe (hausse, baisse, neutre). */
export const tone = (v: number) => (v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-ink-2');
