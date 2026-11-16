'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAssets } from '@/lib/hooks';
import { countdown } from '@/lib/economy';
import { compactMoney, pct, tone } from '@/lib/format';
import { healthLabel, pctFr, STATUS_LABEL, useMarketClock, useStocks, VERDICT } from '@/lib/stocks';
import { LivePrice } from '@/components/LivePrice';
import { Spark } from '@/components/Spark';

type SortKey = 'change24h' | 'marketCap' | 'yield' | 'earnings';

export default function StocksPage() {
  const { data, isLoading } = useStocks();
  const { data: live } = useAssets();
  const clock = useMarketClock();
  const [sort, setSort] = useState<SortKey>('marketCap');

  const rows = useMemo(() => {
    const merged = (data?.stocks ?? []).map((s) => {
      const l = live?.find((a) => a.symbol === s.symbol);
      return l ? { ...s, price: l.price, change24h: l.change24h } : s;
    });
    const key = (s: (typeof merged)[number]) =>
      sort === 'yield' ? s.company.dividendYield : sort === 'earnings' ? -new Date(s.company.nextEarningsAt).getTime() : s[sort];
    return merged.sort((a, b) => key(b) - key(a));
  }, [data, live, sort]);

  const calendar = useMemo(
    () =>
      (data?.stocks ?? [])
        .filter((s) => s.company.status === 'LISTED' || s.company.status === 'TAKEOVER')
        .sort((a, b) => new Date(a.company.nextEarningsAt).getTime() - new Date(b.company.nextEarningsAt).getTime())
        .slice(0, 6),
    [data],
  );

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_320px]">
      <div className="rise min-w-0">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="display text-6xl font-extrabold">La Bourse</h1>
            <p className="mt-2 max-w-xl text-ink-2">
              Des sociétés (presque) sérieuses. Le cours suit les résultats trimestriels, les actionnaires touchent des dividendes, et
              parfois quelqu'un rachète tout. Ou tout s'effondre.
            </p>
          </div>
          <div className={`border-2 border-ink px-4 py-3 ${clock.open ? 'bg-acid' : 'bg-paper-2'}`} aria-live="polite">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
              <span className={`inline-block size-2.5 rounded-full ${clock.open ? 'animate-pulse bg-up' : 'bg-ink-3'}`} aria-hidden />
              {clock.open ? 'Séance ouverte' : 'Séance fermée'}
            </p>
            <p className="num mt-1 text-2xl font-bold">
              {clock.open ? 'Clôture' : 'Ouverture'} dans {countdown(new Date(clock.nextChangeAt), clock.now)}
            </p>
            <p className="text-xs text-ink-2">Cotations de 9 h à 22 h (Paris)</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="border-y-2 border-ink text-xs uppercase tracking-wider text-ink-2">
                <th className="py-2 pr-4 font-semibold">Société</th>
                <th className="py-2 pr-4 text-right font-semibold">Cours</th>
                <SortTh label="24 h" k="change24h" sort={sort} setSort={setSort} />
                <th className="py-2 pr-4 font-semibold">Tendance</th>
                <SortTh label="Capi." k="marketCap" sort={sort} setSort={setSort} />
                <th className="py-2 pr-4 text-right font-semibold">PER</th>
                <SortTh label="Rendement" k="yield" sort={sort} setSort={setSort} />
                <th className="py-2 pr-4 font-semibold">Santé</th>
                <SortTh label="Résultats" k="earnings" sort={sort} setSort={setSort} />
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-line">
                    <td colSpan={9} className="py-4"><div className="h-5 w-2/3 animate-pulse bg-paper-2" /></td>
                  </tr>
                ))}
              {rows.map((s) => {
                const c = s.company;
                const off = c.status === 'ACQUIRED' || c.status === 'BANKRUPT';
                const h = healthLabel(c.health);
                return (
                  <tr key={s.symbol} className={`group border-b border-line hover:bg-paper-2 ${off ? 'text-ink-3' : ''}`}>
                    <td className="py-3 pr-4">
                      <Link href={`/market/${s.symbol}`} className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center text-xl" style={{ background: `color-mix(in oklch, ${s.color} 30%, transparent)` }}>{s.emoji}</span>
                        <span>
                          <span className="block font-semibold group-hover:underline">{s.name}</span>
                          <span className="text-xs text-ink-2">
                            {s.symbol} · {c.sector}
                            {c.status !== 'LISTED' && (
                              <span className={`ml-1 px-1 font-bold ${c.status === 'TAKEOVER' ? 'bg-acid text-ink' : 'bg-ink text-paper'}`}>{STATUS_LABEL[c.status]}</span>
                            )}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold">{off ? '—' : <LivePrice value={s.price} className="px-1" />}</td>
                    <td className={`num whitespace-nowrap py-3 pr-4 text-right font-semibold ${off ? "" : tone(s.change24h)}`}>{off ? '—' : pct(s.change24h)}</td>
                    <td className="py-3 pr-4">{!off && <Spark data={s.spark} />}</td>
                    <td className="num py-3 pr-4 text-right">{off ? '—' : compactMoney(s.marketCap)}</td>
                    <td className="num py-3 pr-4 text-right">{c.pe && !off ? c.pe.toFixed(1).replace('.', ',') : '—'}</td>
                    <td className="num py-3 pr-4 text-right">{off || !c.dividendYield ? '—' : `${(c.dividendYield * 100).toFixed(1).replace('.', ',')} %`}</td>
                    <td className={`py-3 pr-4 text-sm ${off ? '' : h.cls}`}>{off ? STATUS_LABEL[c.status] : h.label}</td>
                    <td className="num py-3 text-right text-sm">
                      {off ? (
                        <span className="text-xs">Retour en bourse sous 24 h</span>
                      ) : (
                        <>
                          dans {countdown(c.nextEarningsAt, clock.now)}
                          <span className="block text-xs text-ink-2">BPA attendu {c.consensus.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} $</span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="rise space-y-10 [animation-delay:120ms]">
        <section>
          <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Calendrier des résultats</h2>
          <ol className="space-y-2">
            {calendar.map((s) => (
              <li key={s.symbol} className="flex items-baseline justify-between gap-3">
                <Link href={`/market/${s.symbol}`} className="font-semibold hover:underline">{s.emoji} {s.name}</Link>
                <span className="num whitespace-nowrap text-sm text-ink-2">{countdown(s.company.nextEarningsAt, clock.now)}</span>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Dernières publications</h2>
          {!data?.recentReports.length ? (
            <p className="text-sm text-ink-2">Aucune publication pour l'instant. La première tombe bientôt.</p>
          ) : (
            <ul className="space-y-4">
              {data.recentReports.map((r, i) => (
                <li key={i}>
                  <p className="flex items-baseline justify-between gap-2">
                    <Link href={`/market/${r.symbol}`} className="font-semibold hover:underline">{r.emoji} {r.name}</Link>
                    <span className={`num px-1 text-sm font-bold ${VERDICT[r.verdict].cls}`}>{pctFr(r.reaction)}</span>
                  </p>
                  <p className="text-sm text-ink-2">{r.headline}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
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
