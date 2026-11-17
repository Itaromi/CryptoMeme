'use client';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNow, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useMe, usePortfolio } from '@/lib/hooks';
import { queryKeys } from '@/lib/queryKeys';
import { tone, useFormat } from '@/lib/format';
import { Glyph } from '@/lib/icons';
import { Stat } from '@/components/ui/Stat';

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
  const t = useTranslations('portfolio');
  const tc = useTranslations('common');
  const f = useFormat();
  const now = useNow({ updateInterval: 30_000 });
  const { data: me, isLoading: meLoading } = useMe();
  const { data: pf } = usePortfolio(!!me);
  const history = useInfiniteQuery({
    queryKey: queryKeys.history,
    queryFn: ({ pageParam }) => api<{ items: TradeRow[]; nextCursor: string | null }>(`/portfolio/trades${pageParam ? `?cursor=${pageParam}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!me,
  });

  if (meLoading) return null;
  if (!me)
    return (
      <p className="display text-4xl">
        {t.rich('loginPrompt', {
          link: (c) => (
            <Link href="/login" className="underline">
              {c}
            </Link>
          ),
        })}
      </p>
    );
  if (!pf) return <div className="h-96 animate-pulse bg-paper-2" />;

  const perf = Number(pf.netWorth) / Number(pf.season.startingCash) - 1;
  const total = Number(pf.netWorth) || 1;
  const trades = history.data?.pages.flatMap((p) => p.items) ?? [];
  const share = (v: string) => f.number(Number(v) / total, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div className="rise space-y-14">
      <section className="grid gap-8 border-b-2 border-ink pb-10 md:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-ink-2">{pf.season.name}</p>
          <p className="display num mt-2 text-[clamp(3rem,8vw,7rem)] font-extrabold">{f.money(pf.netWorth)}</p>
          <p className={`num text-xl font-semibold ${tone(perf)}`}>{t('sinceStart', { perf: f.pct(perf) })}</p>
        </div>
        <dl className="num grid grid-cols-2 content-end gap-6 sm:grid-cols-3">
          <Stat label={t('stats.cash')}>{f.money(pf.cash)}</Stat>
          <Stat label={t('stats.positions')}>{f.money(pf.holdingsValue)}</Stat>
          <Stat label={t('stats.hardware')}>{f.money(pf.hardwareValue)}</Stat>
          <Stat label={t('stats.bank')}>
            <Link href="/banks" className="underline decoration-2 underline-offset-4 hover:bg-acid" style={{ textDecorationColor: pf.bank.color }}>
              {pf.bank.name}
            </Link>
          </Stat>
          <Stat label={t('stats.tradingFee')}>{f.pct(pf.bank.tradingFeeBps / 10_000, false)}</Stat>
        </dl>
      </section>

      {/* Barre de répartition */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest">{t('allocation.title')}</h2>
        <div className="flex h-8 w-full overflow-hidden border-2 border-ink">
          {pf.positions.map((p) => (
            <div key={p.symbol} title={`${p.symbol} ${f.money(p.liquidationValue)}`} style={{ width: `${(Number(p.liquidationValue) / total) * 100}%`, background: p.color }} />
          ))}
          <div title={`${t('allocation.cash')} ${f.money(pf.cash)}`} className="bg-paper-3" style={{ width: `${(Number(pf.cash) / total) * 100}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {pf.positions.map((p) => (
            <span key={p.symbol} className="num flex items-center gap-1.5">
              <span className="size-2.5" style={{ background: p.color }} /> {p.symbol} {share(p.liquidationValue)}
            </span>
          ))}
          <span className="num flex items-center gap-1.5">
            <span className="size-2.5 bg-paper-3" /> {t('allocation.cash')} {share(pf.cash)}
          </span>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest">{t('positions.title')}</h2>
        {pf.positions.length === 0 ? (
          <p className="text-lg">
            {t('positions.empty')}{' '}
            <Link href="/market" className="font-semibold underline">
              {t('positions.emptyCta')}
            </Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
            {/* Mobile : actif (quantité dessous) et valeur (PnL latent dessous) ; le détail apparaît avec la place */}
            <table className="num w-full text-left lg:min-w-[720px]">
              <thead>
                <tr className="border-y-2 border-ink text-xs uppercase tracking-wider text-ink-2">
                  <th className="py-2 pr-4">{t('positions.columns.asset')}</th>
                  <th className="hidden py-2 pr-4 text-right md:table-cell">{t('positions.columns.quantity')}</th>
                  <th className="hidden py-2 pr-4 text-right lg:table-cell">{t('positions.columns.avgCost')}</th>
                  <th className="hidden py-2 pr-4 text-right lg:table-cell">{t('positions.columns.price')}</th>
                  <th className="py-2 text-right sm:pr-4" title={t('positions.columns.liquidationHint')}>
                    {t('positions.columns.liquidationValue')}
                  </th>
                  <th className="hidden py-2 pr-4 text-right sm:table-cell">{t('positions.columns.unrealizedPnl')}</th>
                  <th className="hidden py-2 text-right md:table-cell">{t('positions.columns.realizedPnl')}</th>
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
                        <span className="block text-sm text-ink-2 md:hidden">
                          {f.qty(p.quantity)} {p.symbol}
                        </span>
                      </td>
                      <td className="hidden py-3 pr-4 text-right md:table-cell">{f.qty(p.quantity)}</td>
                      <td className="hidden py-3 pr-4 text-right lg:table-cell">{f.price(p.avgCost)}</td>
                      <td className="hidden py-3 pr-4 text-right lg:table-cell">{f.price(p.price)}</td>
                      <td className="py-3 text-right font-semibold whitespace-nowrap sm:pr-4">
                        {f.money(p.liquidationValue)}
                        <span className={`block text-sm sm:hidden ${tone(u)}`}>
                          {f.money(u)} ({f.pct(Number(p.costBasis) ? u / Number(p.costBasis) : 0)})
                        </span>
                      </td>
                      <td className={`hidden py-3 pr-4 text-right font-semibold sm:table-cell ${tone(u)}`}>
                        {f.money(u)} <span className="text-xs">({f.pct(Number(p.costBasis) ? u / Number(p.costBasis) : 0)})</span>
                      </td>
                      <td className={`hidden py-3 text-right md:table-cell ${tone(Number(p.realizedPnl))}`}>{f.money(p.realizedPnl)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest">{t('history.title')}</h2>
        {trades.length === 0 ? (
          <p className="text-ink-2">{t('history.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            {/* Mobile : ordre (date dessous) et montant (PnL dessous) ; le détail apparaît avec la place */}
            <table className="num w-full text-left text-sm lg:min-w-[720px]">
              <thead>
                <tr className="border-y-2 border-ink text-xs uppercase tracking-wider text-ink-2">
                  <th className="hidden py-2 pr-4 sm:table-cell">{t('history.columns.when')}</th>
                  <th className="py-2 pr-4">{t('history.columns.order')}</th>
                  <th className="hidden py-2 pr-4 text-right md:table-cell">{t('history.columns.quantity')}</th>
                  <th className="py-2 text-right sm:pr-4">{t('history.columns.amount')}</th>
                  <th className="hidden py-2 pr-4 text-right lg:table-cell">{t('history.columns.avgPrice')}</th>
                  <th className="hidden py-2 pr-4 text-right lg:table-cell">{t('history.columns.fee')}</th>
                  <th className="hidden py-2 pr-4 text-right lg:table-cell">{t('history.columns.impact')}</th>
                  <th className="hidden py-2 text-right sm:table-cell">{t('history.columns.pnl')}</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((tr) => (
                  <tr key={tr.id} className="border-b border-line">
                    <td className="hidden py-2 pr-4 text-ink-2 sm:table-cell">{f.ago(tr.at, now)}</td>
                    <td className="py-2 pr-4">
                      <span className={`font-semibold ${tr.side === 'BUY' ? 'text-up' : 'text-down'}`}>{tc(`side.${tr.side}`)}</span> <Glyph name={tr.emoji} /> {tr.symbol}
                      <span className="block text-xs text-ink-2 sm:hidden">{f.ago(tr.at, now)}</span>
                    </td>
                    <td className="hidden py-2 pr-4 text-right md:table-cell">{f.qty(tr.quantity)}</td>
                    <td className="py-2 text-right whitespace-nowrap sm:pr-4">
                      {f.money(tr.cash)}
                      {tr.realizedPnl && <span className={`block text-xs font-semibold sm:hidden ${tone(Number(tr.realizedPnl))}`}>{f.money(tr.realizedPnl)}</span>}
                    </td>
                    <td className="hidden py-2 pr-4 text-right lg:table-cell">{f.price(tr.price)}</td>
                    <td className="hidden py-2 pr-4 text-right text-ink-2 lg:table-cell">{f.money(tr.fee)}</td>
                    <td className="hidden py-2 pr-4 text-right text-ink-2 lg:table-cell">{f.pct(tr.slippageBps / 10_000, false)}</td>
                    <td className={`hidden py-2 text-right font-semibold sm:table-cell ${tr.realizedPnl ? tone(Number(tr.realizedPnl)) : 'text-ink-3'}`}>
                      {tr.realizedPnl ? f.money(tr.realizedPnl) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.hasNextPage && (
              <button className="mt-4 py-2 font-semibold underline" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
                {tc('actions.loadMore')}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
