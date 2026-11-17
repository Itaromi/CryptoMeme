'use client';
import Link from 'next/link';
import { useNow, useTranslations } from 'next-intl';
import type { MarketTrade } from '@cryptomeme/shared';
import { useFormat } from '@/lib/format';

/** Derniers trades des joueurs sur un actif. */
export function RecentTrades({ trades }: { trades: MarketTrade[] }) {
  const t = useTranslations('market.asset.trades');
  const tc = useTranslations('common');
  const f = useFormat();
  const now = useNow({ updateInterval: 30_000 });
  return (
    <section>
      <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">{t('title')}</h2>
      {trades.length === 0 ? (
        <p className="text-sm text-ink-2">{t('empty')}</p>
      ) : (
        <table className="num w-full text-sm">
          <tbody>
            {trades.map((tr) => (
              <tr key={tr.id} className="border-b border-line">
                <td className={`py-1.5 font-semibold ${tr.side === 'BUY' ? 'text-up' : 'text-down'}`}>{tc(`side.${tr.side}`)}</td>
                <td className="py-1.5 text-right">{f.qty(tr.quantity)}</td>
                <td className="py-1.5 text-right">{f.money(tr.cash)}</td>
                <td className="py-1.5 text-right text-ink-2">
                  {tr.by ? <Link href={`/u/${tr.by}`} className="hover:underline">@{tr.by}</Link> : ''}
                </td>
                <td className="py-1.5 text-right text-xs text-ink-3">{f.ago(tr.at, now)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
