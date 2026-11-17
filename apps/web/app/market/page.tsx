'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAssets } from '@/lib/hooks';
import { tone, useFormat } from '@/lib/format';
import { LivePrice } from '@/components/LivePrice';
import { Spark } from '@/components/Spark';
import { EventFeed } from '@/components/EventFeed';
import { SortTh } from '@/components/market/SortTh';
import { regimeCls, useAssetLabels } from '@/components/market/labels';
import { Glyph } from '@/lib/icons';

const FILTERS = ['ALL', 'BLUE_CHIP', 'MID_CAP', 'SHITCOIN'] as const;
type Filter = (typeof FILTERS)[number];

type SortKey = 'change24h' | 'volume24h' | 'marketCap';

export default function MarketPage() {
  const t = useTranslations('market.list');
  const f = useFormat();
  const labels = useAssetLabels();
  const { data, isLoading } = useAssets();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [sort, setSort] = useState<SortKey>('marketCap');

  const rows = useMemo(
    () => (data ?? []).filter((a) => a.kind !== 'STOCK' && (filter === 'ALL' || a.tier === filter)).sort((a, b) => b[sort] - a[sort]),
    [data, filter, sort],
  );
  const movers = useMemo(() => [...(data ?? [])].filter((a) => a.kind !== 'STOCK').sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))[0], [data]);

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_300px]">
      <div className="rise min-w-0">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="display text-6xl font-extrabold">{t('title')}</h1>
            {movers && (
              <p className="mt-2 text-ink-2">
                {t('star')}{' '}
                <Link href={`/market/${movers.symbol}`} className="font-semibold text-ink underline">
                  <Glyph name={movers.emoji} color={movers.color} /> {movers.name}
                </Link>{' '}
                <span className={`num font-semibold ${tone(movers.change24h)}`}>{f.pct(movers.change24h)}</span>
              </p>
            )}
          </div>
          <div className="flex gap-1 text-sm font-semibold" role="tablist" aria-label={t('filtersLabel')}>
            {FILTERS.map((id) => (
              <button
                key={id}
                role="tab"
                aria-selected={filter === id}
                onClick={() => setFilter(id)}
                className={`px-3 py-1.5 ${filter === id ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}
              >
                {t(`filters.${id}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-y-2 border-ink text-xs uppercase tracking-wider text-ink-2">
                <th className="py-2 pr-4 font-semibold">{t('columns.asset')}</th>
                <th className="py-2 pr-4 text-right font-semibold">{t('columns.price')}</th>
                <SortTh label={t('columns.change24h')} k="change24h" sort={sort} setSort={setSort} />
                <th className="py-2 pr-4 font-semibold">{t('columns.trend')}</th>
                <SortTh label={t('columns.volume')} k="volume24h" sort={sort} setSort={setSort} />
                <SortTh label={t('columns.marketCap')} k="marketCap" sort={sort} setSort={setSort} />
                <th className="py-2 font-semibold">{t('columns.mood')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-line">
                    <td colSpan={7} className="py-4">
                      <div className="h-5 w-2/3 animate-pulse bg-paper-2" />
                    </td>
                  </tr>
                ))}
              {rows.map((a) => (
                <tr key={a.symbol} className="group border-b border-line hover:bg-paper-2">
                  <td className="py-3 pr-4">
                    <Link href={`/market/${a.symbol}`} className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center text-xl" style={{ background: `color-mix(in oklch, ${a.color} 30%, transparent)` }}>
                        <Glyph name={a.emoji} color={a.color} />
                      </span>
                      <span>
                        <span className="block font-semibold group-hover:underline">{a.name}</span>
                        <span className="text-xs text-ink-2">
                          {a.symbol} · {labels.tier(a.tier)}
                          {a.frozen && <span className="ml-1 font-semibold text-down">· {t('frozen')}</span>}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-right font-semibold">
                    <LivePrice value={a.price} className="px-1" />
                  </td>
                  <td className={`num py-3 pr-4 text-right font-semibold ${tone(a.change24h)}`}>{f.pct(a.change24h)}</td>
                  <td className="py-3 pr-4">
                    <Spark data={a.spark} />
                  </td>
                  <td className="num py-3 pr-4 text-right text-ink-2">{f.compactMoney(a.volume24h)}</td>
                  <td className="num py-3 pr-4 text-right">{f.compactMoney(a.marketCap)}</td>
                  <td className="py-3 text-sm">
                    <span className={regimeCls(a.regime) ? `font-semibold ${regimeCls(a.regime)}` : 'text-ink-2'}>{labels.regime(a.regime)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <aside className="rise [animation-delay:120ms]">
        <EventFeed limit={12} />
      </aside>
    </div>
  );
}
