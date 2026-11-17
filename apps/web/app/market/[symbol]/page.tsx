'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type MarketTrade, WS_EVENTS } from '@cryptomeme/shared';
import { api } from '@/lib/api';
import { getSocket, useAssets, useMe, usePortfolio } from '@/lib/hooks';
import { queryKeys } from '@/lib/queryKeys';
import { tone, useFormat } from '@/lib/format';
import { useStock } from '@/lib/stocks';
import { Glyph } from '@/lib/icons';
import { Stat } from '@/components/ui/Stat';
import { LivePrice } from '@/components/LivePrice';
import { PriceChart } from '@/components/PriceChart';
import { CompanyPanel } from '@/components/CompanyPanel';
import { RecentTrades } from '@/components/market/RecentTrades';
import { AssetEvents } from '@/components/market/AssetEvents';
import { TradePanel } from '@/components/market/TradePanel';
import { regimeCls, useAssetLabels } from '@/components/market/labels';

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
  creator: string | null;
  trades: MarketTrade[];
  events: Array<{ type: string; detail: string; at: string }>;
}

export default function AssetPage({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = use(params).symbol.toUpperCase();
  const t = useTranslations('market.asset');
  const f = useFormat();
  const labels = useAssetLabels();
  const { data, error } = useQuery({
    queryKey: queryKeys.asset(symbol),
    queryFn: () => api<Detail>(`/market/assets/${symbol}`),
    refetchInterval: 30_000,
  });
  const { data: list } = useAssets();
  const live = list?.find((a) => a.symbol === symbol);
  const { data: me } = useMe();
  const { data: pf } = usePortfolio(!!me);
  const position = pf?.positions.find((p) => p.symbol === symbol);
  const [liveTrades, setLiveTrades] = useState<MarketTrade[]>([]);
  const isStock = data?.kind === 'STOCK';
  const { data: company } = useStock(symbol, isStock);

  useEffect(() => {
    const s = getSocket();
    const onTrade = (tr: MarketTrade) => setLiveTrades((prev) => [tr, ...prev].slice(0, 30));
    s.emit(WS_EVENTS.SUBSCRIBE, symbol);
    s.on(WS_EVENTS.TRADE, onTrade);
    return () => {
      s.emit(WS_EVENTS.UNSUBSCRIBE, symbol);
      s.off(WS_EVENTS.TRADE, onTrade);
    };
  }, [symbol]);

  if (error) return <p className="display text-4xl">{t('notFound')}</p>;
  if (!data) return <div className="h-96 animate-pulse bg-paper-2" />;

  const p = live?.price ?? data.price;
  const change = live?.change24h ?? data.change24h;
  const regime = live?.regime ?? data.regime;
  const seen = new Set(liveTrades.map((tr) => tr.id));
  const trades = [...liveTrades, ...data.trades.filter((tr) => !seen.has(tr.id))].slice(0, 30);

  return (
    <div className="rise">
      <Link href={isStock ? '/stocks' : '/market'} className="text-sm text-ink-2 hover:text-ink">
        ← {isStock ? t('backStocks') : t('backMarket')}
      </Link>
      <header className="mt-3 mb-8 flex flex-wrap items-end justify-between gap-6 border-b-2 border-ink pb-6">
        <div className="flex items-end gap-5">
          <span className="grid size-20 place-items-center text-5xl" style={{ background: `color-mix(in oklch, ${data.color} 35%, transparent)` }}>
            <Glyph name={data.emoji} color={data.color} />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-ink-2">
              {data.symbol} · {isStock ? (company?.sector ?? t('stockFallback')) : labels.tier(data.tier)}
              {data.frozen && <span className="ml-2 bg-down px-1.5 text-paper">{t('frozenBadge')}</span>}
            </p>
            <h1 className="display text-[clamp(2.5rem,6vw,5rem)] font-extrabold">{data.name}</h1>
          </div>
        </div>
        <div className="text-right">
          <LivePrice value={p} className="display block px-1 text-5xl font-bold" />
          <span className={`num text-lg font-semibold ${tone(change)}`}>{t('change24h', { change: f.pct(change) })}</span>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-10">
          <PriceChart symbol={symbol} livePrice={p} />

          <dl className="num grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 2xl:grid-cols-6">
            <Stat label={t('stats.marketCap')}>{f.compactMoney(data.marketCap)}</Stat>
            <Stat label={t('stats.liquidity')}>{f.compactMoney(data.liquidity)}</Stat>
            <Stat label={t('stats.volume24h')}>{f.compactMoney(live?.volume24h ?? data.volume24h)}</Stat>
            <Stat label={t('stats.holders')}>{f.number(data.holders)}</Stat>
            <Stat label={t('stats.fee')}>{f.pct(data.feeBps / 10_000, false)}</Stat>
            <Stat label={t('stats.mood')}>
              <span className={regimeCls(regime)}>{labels.regime(regime)}</span>
            </Stat>
          </dl>

          <p className="max-w-2xl text-xl leading-relaxed">{data.description}</p>
          {data.creator && (
            <p className="-mt-6 text-sm text-ink-2">
              {t.rich('createdBy', {
                username: data.creator,
                link: (c) => (
                  <Link href={`/u/${data.creator}`} className="font-semibold text-ink underline">
                    {c}
                  </Link>
                ),
              })}
            </p>
          )}

          {company && <CompanyPanel c={company} />}

          <div className="grid gap-10 md:grid-cols-2">
            <RecentTrades trades={trades} />
            <AssetEvents events={data.events} />
          </div>
        </div>

        <TradePanel symbol={symbol} name={data.name} frozen={data.frozen} isStock={isStock} company={company} position={position} />
      </div>
    </div>
  );
}
