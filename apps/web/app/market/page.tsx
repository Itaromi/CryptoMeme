'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAssets } from '@/lib/hooks';
import { compactMoney, pct, REGIME_LABEL, TIER_LABEL, tone } from '@/lib/format';
import { LivePrice } from '@/components/LivePrice';
import { Spark } from '@/components/Spark';
import { EventFeed } from '@/components/EventFeed';

const FILTERS = [
  { id: 'ALL', label: 'Tout' },
  { id: 'BLUE_CHIP', label: 'Blue chips' },
  { id: 'MID_CAP', label: 'Mid caps' },
  { id: 'SHITCOIN', label: 'Shitcoins' },
];

type SortKey = 'change24h' | 'volume24h' | 'marketCap';

export default function MarketPage() {
  const { data, isLoading } = useAssets();
  const [filter, setFilter] = useState('ALL');
  const [sort, setSort] = useState<SortKey>('marketCap');

  const rows = useMemo(
    () => (data ?? []).filter((a) => filter === 'ALL' || a.tier === filter).sort((a, b) => b[sort] - a[sort]),
    [data, filter, sort],
  );
  const movers = useMemo(() => [...(data ?? [])].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))[0], [data]);

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_300px]">
      <div className="rise min-w-0">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="display text-6xl font-extrabold">Le marché</h1>
            {movers && (
              <p className="mt-2 text-ink-2">
                La star du jour :{' '}
                <Link href={`/market/${movers.symbol}`} className="font-semibold text-ink underline">
                  {movers.emoji} {movers.name}
                </Link>{' '}
                <span className={`num font-semibold ${tone(movers.change24h)}`}>{pct(movers.change24h)}</span>
              </p>
            )}
          </div>
          <div className="flex gap-1 text-sm font-semibold" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 ${filter === f.id ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-y-2 border-ink text-xs uppercase tracking-wider text-ink-2">
                <th className="py-2 pr-4 font-semibold">Actif</th>
                <th className="py-2 pr-4 text-right font-semibold">Prix</th>
                <SortTh label="24 h" k="change24h" sort={sort} setSort={setSort} />
                <th className="py-2 pr-4 font-semibold">Tendance 24 h</th>
                <SortTh label="Volume" k="volume24h" sort={sort} setSort={setSort} />
                <SortTh label="Capi." k="marketCap" sort={sort} setSort={setSort} />
                <th className="py-2 font-semibold">Ambiance</th>
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
                        {a.emoji}
                      </span>
                      <span>
                        <span className="block font-semibold group-hover:underline">{a.name}</span>
                        <span className="text-xs text-ink-2">
                          {a.symbol} · {TIER_LABEL[a.tier]}
                          {a.frozen && <span className="ml-1 font-semibold text-down">· gelé</span>}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-right font-semibold">
                    <LivePrice value={a.price} className="px-1" />
                  </td>
                  <td className={`num py-3 pr-4 text-right font-semibold ${tone(a.change24h)}`}>{pct(a.change24h)}</td>
                  <td className="py-3 pr-4">
                    <Spark data={a.spark} />
                  </td>
                  <td className="num py-3 pr-4 text-right text-ink-2">{compactMoney(a.volume24h)}</td>
                  <td className="num py-3 pr-4 text-right">{compactMoney(a.marketCap)}</td>
                  <td className="py-3 text-sm">
                    <span className={a.regime === 'PANIC' ? 'font-semibold text-down' : a.regime === 'HYPE' ? 'font-semibold text-up' : 'text-ink-2'}>
                      {REGIME_LABEL[a.regime] ?? a.regime}
                    </span>
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

function SortTh({ label, k, sort, setSort }: { label: string; k: SortKey; sort: SortKey; setSort: (k: SortKey) => void }) {
  return (
    <th className="py-2 pr-4 text-right font-semibold" aria-sort={sort === k ? 'descending' : 'none'}>
      <button onClick={() => setSort(k)} className={`uppercase ${sort === k ? 'text-ink underline decoration-2' : 'hover:text-ink'}`}>
        {label}
        {sort === k && ' ↓'}
      </button>
    </th>
  );
}
