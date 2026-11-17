'use client';
import Link from 'next/link';
import { useNow, useTranslations } from 'next-intl';
import { type MarketEventView, useMarketEvents } from '@/lib/economy';
import { useFormat } from '@/lib/format';
import { Glyph } from '@/lib/icons';

const REGIMES = ['CALM', 'NORMAL', 'HYPE', 'PANIC'] as const;
type Regime = (typeof REGIMES)[number];
const isRegime = (v: string): v is Regime => (REGIMES as readonly string[]).includes(v);

/** Brèves du marché (le `detail` vient de l'API ; seuls les noms d'ambiance « CALM → HYPE » sont traduits). */
export function EventFeed({ limit = 8 }: { limit?: number }) {
  const t = useTranslations('events.feed');
  const tc = useTranslations('common.regime');
  const f = useFormat();
  const now = useNow({ updateInterval: 30_000 });
  const { data } = useMarketEvents();

  const headline = (e: MarketEventView) => {
    switch (e.type) {
      case 'RUG_PULL':
        return t('rugPull', { symbol: e.symbol, detail: e.detail });
      case 'JUMP':
        return t('jump', { symbol: e.symbol, detail: e.detail });
      case 'REGIME': {
        const detail = e.detail.replace(/\b[A-Z]+\b/g, (r) => (isRegime(r) ? tc(r).toLocaleLowerCase(f.locale) : r));
        return t('regime', { symbol: e.symbol, detail });
      }
      default:
        return t('other', { symbol: e.symbol, detail: e.detail });
    }
  };

  return (
    <section>
      <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">{t('title')}</h2>
      {!data?.length ? (
        <p className="text-sm text-ink-2">{t('empty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {data.slice(0, limit).map((e, i) => (
            <li key={i} className="py-2.5">
              <Link href={`/market/${e.symbol}`} className={`block text-sm leading-snug hover:underline ${e.type === 'RUG_PULL' ? 'font-bold text-down' : ''}`}>
                <span className="mr-1">
                  <Glyph name={e.emoji} />
                </span>
                {headline(e)}
              </Link>
              <span className="text-xs text-ink-3">{f.ago(e.at, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
