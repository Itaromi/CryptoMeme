'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WS_EVENTS } from '@cryptomeme/shared';
import { api } from '@/lib/api';
import { getSocket, useAssets, useMe, usePortfolio } from '@/lib/hooks';
import { ago, compactMoney, money, pct, price, qty, REGIME_LABEL, TIER_LABEL, tone } from '@/lib/format';
import { LivePrice } from '@/components/LivePrice';
import { PriceChart } from '@/components/PriceChart';
import { OrderForm } from '@/components/OrderForm';
import { CompanyPanel } from '@/components/CompanyPanel';
import { countdown } from '@/lib/economy';
import { useMarketClock, useStock } from '@/lib/stocks';

interface Trade {
  id: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  cash: string;
  price: string;
  by?: string | null;
  at: string;
}

interface Detail {
  symbol: string;
  name: string;
  kind: 'CRYPTO' | 'STOCK';
  tier: string;
  emoji: string;
  color: string;
  description: string;
  price: string;
  change24h: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
  regime: string;
  frozen: boolean;
  feeBps: number;
  holders: number;
  trades: Trade[];
  events: Array<{ type: string; detail: string; at: string }>;
}

export default function AssetPage({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = use(params).symbol.toUpperCase();
  const { data, error } = useQuery({
    queryKey: ['asset', symbol],
    queryFn: () => api<Detail>(`/market/assets/${symbol}`),
    refetchInterval: 30_000,
  });
  const { data: list } = useAssets();
  const live = list?.find((a) => a.symbol === symbol);
  const { data: me } = useMe();
  const { data: pf } = usePortfolio(!!me);
  const position = pf?.positions.find((p) => p.symbol === symbol);
  const [liveTrades, setLiveTrades] = useState<Trade[]>([]);
  const isStock = data?.kind === 'STOCK';
  const { data: company } = useStock(symbol, isStock);
  const clock = useMarketClock();

  useEffect(() => {
    const s = getSocket();
    const onTrade = (t: Trade) => setLiveTrades((prev) => [t, ...prev].slice(0, 30));
    s.emit(WS_EVENTS.SUBSCRIBE, symbol);
    s.on(WS_EVENTS.TRADE, onTrade);
    return () => {
      s.emit(WS_EVENTS.UNSUBSCRIBE, symbol);
      s.off(WS_EVENTS.TRADE, onTrade);
    };
  }, [symbol]);

  if (error) return <p className="display text-4xl">Cet actif n'existe pas (encore).</p>;
  if (!data) return <div className="h-96 animate-pulse bg-paper-2" />;

  const p = live?.price ?? data.price;
  const change = live?.change24h ?? data.change24h;
  const regime = live?.regime ?? data.regime;
  const seen = new Set(liveTrades.map((t) => t.id));
  const trades = [...liveTrades, ...data.trades.filter((t) => !seen.has(t.id))].slice(0, 30);

  return (
    <div className="rise">
      <Link href={isStock ? '/stocks' : '/market'} className="text-sm text-ink-2 hover:text-ink">← {isStock ? 'Bourse' : 'Marché'}</Link>
      <header className="mt-3 mb-8 flex flex-wrap items-end justify-between gap-6 border-b-2 border-ink pb-6">
        <div className="flex items-end gap-5">
          <span className="grid size-20 place-items-center text-5xl" style={{ background: `color-mix(in oklch, ${data.color} 35%, transparent)` }}>
            {data.emoji}
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-ink-2">
              {data.symbol} · {isStock ? (company?.sector ?? 'Action') : TIER_LABEL[data.tier]}
              {data.frozen && <span className="ml-2 bg-down px-1.5 text-paper">Marché gelé</span>}
            </p>
            <h1 className="display text-[clamp(2.5rem,6vw,5rem)] font-extrabold">{data.name}</h1>
          </div>
        </div>
        <div className="text-right">
          <LivePrice value={p} className="display block px-1 text-5xl font-bold" />
          <span className={`num text-lg font-semibold ${tone(change)}`}>{pct(change)} sur 24 h</span>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-10">
          <PriceChart symbol={symbol} livePrice={p} />

          <dl className="num grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 2xl:grid-cols-6">
            <Stat label="Capitalisation">{compactMoney(data.marketCap)}</Stat>
            <Stat label="Liquidité du pool">{compactMoney(data.liquidity)}</Stat>
            <Stat label="Volume 24 h">{compactMoney(live?.volume24h ?? data.volume24h)}</Stat>
            <Stat label="Détenteurs">{data.holders}</Stat>
            <Stat label="Frais du pool">{(data.feeBps / 100).toFixed(2)} %</Stat>
            <Stat label="Ambiance">
              <span className={regime === 'PANIC' ? 'text-down' : regime === 'HYPE' ? 'text-up' : ''}>{REGIME_LABEL[regime]}</span>
            </Stat>
          </dl>

          <p className="max-w-2xl text-xl leading-relaxed">{data.description}</p>

          {company && <CompanyPanel c={company} />}

          <div className="grid gap-10 md:grid-cols-2">
            <section>
              <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Derniers trades joueurs</h2>
              {trades.length === 0 ? (
                <p className="text-sm text-ink-2">Personne n'a encore osé. Sois le premier.</p>
              ) : (
                <table className="num w-full text-sm">
                  <tbody>
                    {trades.map((t) => (
                      <tr key={t.id} className="border-b border-line">
                        <td className={`py-1.5 font-semibold ${t.side === 'BUY' ? 'text-up' : 'text-down'}`}>{t.side === 'BUY' ? 'Achat' : 'Vente'}</td>
                        <td className="py-1.5 text-right">{qty(t.quantity)}</td>
                        <td className="py-1.5 text-right">{money(t.cash)}</td>
                        <td className="py-1.5 text-right text-ink-2">
                          {t.by ? <Link href={`/u/${t.by}`} className="hover:underline">@{t.by}</Link> : ''}
                        </td>
                        <td className="py-1.5 text-right text-xs text-ink-3">{ago(t.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section>
              <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Historique de l'actif</h2>
              {data.events.length === 0 ? (
                <p className="text-sm text-ink-2">Rien à signaler. Pour l'instant.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.events.map((e, i) => (
                    <li key={i} className={e.type === 'RUG_PULL' ? 'font-bold text-down' : ''}>
                      {EVENT_LABEL[e.type] ?? 'Changement d’ambiance'} : {e.detail}
                      <span className="ml-2 text-xs font-normal text-ink-3">{ago(e.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          {company && company.status !== 'LISTED' && company.status !== 'TAKEOVER' ? (
            <p className="border-2 border-ink p-5 font-semibold">{data.name} n'est plus cotée : impossible d'acheter ou de vendre.</p>
          ) : data.frozen ? (
            <p className="border-2 border-down p-5 font-semibold text-down">Les échanges sur {data.name} sont suspendus par l'administration.</p>
          ) : isStock && !clock.open ? (
            <div className="border-2 border-ink bg-paper-2 p-5">
              <p className="text-xs font-bold uppercase tracking-widest">Séance fermée</p>
              <p className="display mt-1 text-3xl font-bold">Ouverture dans {countdown(new Date(clock.nextChangeAt), clock.now)}</p>
              <p className="mt-2 text-sm text-ink-2">La Bourse cote de 9 h à 22 h (Paris). Les nouvelles de la nuit se répercutent d'un coup à l'ouverture.</p>
            </div>
          ) : (
            <OrderForm symbol={symbol} name={data.name} />
          )}
          {position && (
            <div className="num border-2 border-ink bg-paper-2 p-5 text-sm">
              <p className="mb-3 font-bold uppercase tracking-widest">Ta position</p>
              <div className="space-y-1.5">
                <div className="flex justify-between"><span className="text-ink-2">Quantité</span><span className="font-semibold">{qty(position.quantity)}</span></div>
                <div className="flex justify-between"><span className="text-ink-2">PRU</span><span>{price(position.avgCost)}</span></div>
                <div className="flex justify-between"><span className="text-ink-2">Valeur de revente</span><span className="font-semibold">{money(position.liquidationValue)}</span></div>
                <div className="flex justify-between">
                  <span className="text-ink-2">PnL latent</span>
                  <span className={`font-semibold ${tone(Number(position.unrealizedPnl))}`}>{money(position.unrealizedPnl)}</span>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = {
  RUG_PULL: 'Rug pull',
  JUMP: 'Saut',
  EVENT: 'Événement',
  EARNINGS: 'Résultats',
  NEWS: 'Brève',
  DIVIDEND: 'Dividende',
  OPEN: 'Ouverture',
  TAKEOVER: 'OPA',
  BANKRUPTCY: 'Faillite',
  SPLIT: 'Split',
  IPO: 'Introduction en bourse',
};

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink-2">{label}</dt>
      <dd className="text-lg font-semibold">{children}</dd>
    </div>
  );
}
