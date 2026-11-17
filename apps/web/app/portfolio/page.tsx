'use client';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMe, usePortfolio } from '@/lib/hooks';
import { ago, money, pct, price, qty, tone } from '@/lib/format';
import { Glyph } from '@/lib/icons';

interface TradeRow {
  id: string;
  symbol: string;
  emoji: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  cash: string;
  fee: string;
  price: string;
  slippageBps: number;
  realizedPnl: string | null;
  at: string;
}

export default function PortfolioPage() {
  const { data: me, isLoading: meLoading } = useMe();
  const { data: pf } = usePortfolio(!!me);
  const history = useInfiniteQuery({
    queryKey: ['history'],
    queryFn: ({ pageParam }) => api<{ items: TradeRow[]; nextCursor: string | null }>(`/portfolio/trades${pageParam ? `?cursor=${pageParam}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!me,
  });

  if (meLoading) return null;
  if (!me)
    return (
      <p className="display text-4xl">
        <Link href="/login" className="underline">Connecte-toi</Link> pour voir ton portefeuille.
      </p>
    );
  if (!pf) return <div className="h-96 animate-pulse bg-paper-2" />;

  const perf = Number(pf.netWorth) / Number(pf.season.startingCash) - 1;
  const total = Number(pf.netWorth) || 1;
  const trades = history.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="rise space-y-14">
      <section className="grid gap-8 border-b-2 border-ink pb-10 md:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-ink-2">{pf.season.name}</p>
          <p className="display num mt-2 text-[clamp(3rem,8vw,7rem)] font-extrabold">{money(pf.netWorth)}</p>
          <p className={`num text-xl font-semibold ${tone(perf)}`}>
            {pct(perf)} depuis le début de saison
          </p>
        </div>
        <dl className="num grid grid-cols-2 content-end gap-6 text-lg">
          <div>
            <dt className="text-xs uppercase tracking-wider text-ink-2">Cash</dt>
            <dd className="font-semibold">{money(pf.cash)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-ink-2">Positions</dt>
            <dd className="font-semibold">{money(pf.holdingsValue)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-ink-2">Banque</dt>
            <dd className="font-semibold">
              <Link href="/banks" className="underline decoration-2 underline-offset-4 hover:bg-acid" style={{ textDecorationColor: pf.bank.color }}>
                {pf.bank.name}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-ink-2">Frais de trading</dt>
            <dd className="font-semibold">{(pf.bank.tradingFeeBps / 100).toFixed(2)} %</dd>
          </div>
        </dl>
      </section>

      {/* Barre de répartition */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest">Répartition</h2>
        <div className="flex h-8 w-full overflow-hidden border-2 border-ink">
          {pf.positions.map((p) => (
            <div key={p.symbol} title={`${p.symbol} ${money(p.liquidationValue)}`} style={{ width: `${(Number(p.liquidationValue) / total) * 100}%`, background: p.color }} />
          ))}
          <div title={`Cash ${money(pf.cash)}`} className="bg-paper-3" style={{ width: `${(Number(pf.cash) / total) * 100}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {pf.positions.map((p) => (
            <span key={p.symbol} className="num flex items-center gap-1.5">
              <span className="size-2.5" style={{ background: p.color }} /> {p.symbol} {((Number(p.liquidationValue) / total) * 100).toFixed(1)} %
            </span>
          ))}
          <span className="num flex items-center gap-1.5">
            <span className="size-2.5 bg-paper-3" /> Cash {((Number(pf.cash) / total) * 100).toFixed(1)} %
          </span>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest">Positions</h2>
        {pf.positions.length === 0 ? (
          <p className="text-lg">
            Tout est en cash. Ça ne fera pas de toi un millionnaire.{' '}
            <Link href="/market" className="font-semibold underline">Choisir une première crypto →</Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="num w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-y-2 border-ink text-xs uppercase tracking-wider text-ink-2">
                  <th className="py-2 pr-4">Actif</th>
                  <th className="py-2 pr-4 text-right">Quantité</th>
                  <th className="py-2 pr-4 text-right">PRU</th>
                  <th className="py-2 pr-4 text-right">Prix</th>
                  <th className="py-2 pr-4 text-right" title="Ce que tu toucherais en vendant tout maintenant (slippage inclus)">Valeur de revente</th>
                  <th className="py-2 pr-4 text-right">PnL latent</th>
                  <th className="py-2 text-right">PnL réalisé</th>
                </tr>
              </thead>
              <tbody>
                {pf.positions.map((p) => {
                  const u = Number(p.unrealizedPnl);
                  return (
                    <tr key={p.symbol} className="border-b border-line hover:bg-paper-2">
                      <td className="py-3 pr-4">
                        <Link href={`/market/${p.symbol}`} className="font-semibold hover:underline">
                          <Glyph name={p.emoji} color={p.color} /> {p.name}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-right">{qty(p.quantity)}</td>
                      <td className="py-3 pr-4 text-right">{price(p.avgCost)}</td>
                      <td className="py-3 pr-4 text-right">{price(p.price)}</td>
                      <td className="py-3 pr-4 text-right font-semibold">{money(p.liquidationValue)}</td>
                      <td className={`py-3 pr-4 text-right font-semibold ${tone(u)}`}>
                        {money(u)} <span className="text-xs">({pct(Number(p.costBasis) ? u / Number(p.costBasis) : 0)})</span>
                      </td>
                      <td className={`py-3 text-right ${tone(Number(p.realizedPnl))}`}>{money(p.realizedPnl)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest">Historique des ordres</h2>
        {trades.length === 0 ? (
          <p className="text-ink-2">Aucun ordre cette saison.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="num w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-y-2 border-ink text-xs uppercase tracking-wider text-ink-2">
                  <th className="py-2 pr-4">Quand</th>
                  <th className="py-2 pr-4">Ordre</th>
                  <th className="py-2 pr-4 text-right">Quantité</th>
                  <th className="py-2 pr-4 text-right">Montant</th>
                  <th className="py-2 pr-4 text-right">Prix moyen</th>
                  <th className="py-2 pr-4 text-right">Frais</th>
                  <th className="py-2 pr-4 text-right">Impact</th>
                  <th className="py-2 text-right">PnL</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id} className="border-b border-line">
                    <td className="py-2 pr-4 text-ink-2">{ago(t.at)}</td>
                    <td className="py-2 pr-4">
                      <span className={`font-semibold ${t.side === 'BUY' ? 'text-up' : 'text-down'}`}>{t.side === 'BUY' ? 'Achat' : 'Vente'}</span> <Glyph name={t.emoji} /> {t.symbol}
                    </td>
                    <td className="py-2 pr-4 text-right">{qty(t.quantity)}</td>
                    <td className="py-2 pr-4 text-right">{money(t.cash)}</td>
                    <td className="py-2 pr-4 text-right">{price(t.price)}</td>
                    <td className="py-2 pr-4 text-right text-ink-2">{money(t.fee)}</td>
                    <td className="py-2 pr-4 text-right text-ink-2">{(t.slippageBps / 100).toFixed(2)} %</td>
                    <td className={`py-2 text-right font-semibold ${t.realizedPnl ? tone(Number(t.realizedPnl)) : 'text-ink-3'}`}>
                      {t.realizedPnl ? money(t.realizedPnl) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.hasNextPage && (
              <button className="mt-4 font-semibold underline" onClick={() => history.fetchNextPage()}>
                Voir plus
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
