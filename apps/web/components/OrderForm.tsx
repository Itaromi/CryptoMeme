'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type OrderInput, orderSchema, quoteSchema } from '@cryptomeme/shared';
import { api } from '@/lib/api';
import { useMe, usePortfolio } from '@/lib/hooks';
import { queryKeys } from '@/lib/queryKeys';
import { useFormat } from '@/lib/format';
import { useApiMutation } from '@/lib/mutation';
import { useErrorMessage } from '@/lib/texts';
import { KeyValueRow } from '@/components/market/KeyValueRow';

interface Quote {
  amountIn: string;
  amountOut: string;
  fee: string;
  avgPrice: string;
  priceAfter: string;
  slippageBps: number;
}

interface OrderResult {
  quantity: string;
  cash: string;
  realizedPnl: string | null;
}

type Side = OrderInput['side'];

const SLIPPAGES = [50, 200, 500, 1500];
const FRACTIONS = [0.1, 0.25, 0.5, 1];

function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function OrderForm({ symbol, name }: { symbol: string; name: string }) {
  const errorMessage = useErrorMessage();
  const t = useTranslations('market.order');
  const f = useFormat();
  const { data: me } = useMe();
  const { data: pf } = usePortfolio(!!me);
  const [side, setSide] = useState<Side>('BUY');
  const [amount, setAmount] = useState('');
  const [slip, setSlip] = useState(200);

  const position = pf?.positions.find((p) => p.symbol === symbol);
  const available = side === 'BUY' ? Number(pf?.cash ?? 0) : Number(position?.quantity ?? 0);
  const debounced = useDebounced(amount);
  // Même règle que l'API : montant décimal strictement positif
  const valid = quoteSchema.safeParse({ symbol, side, amount: debounced }).success;

  const quote = useQuery({
    queryKey: queryKeys.quote(symbol, side, debounced),
    queryFn: () => api<Quote>('/market/quote', { method: 'POST', json: { symbol, side, amount: debounced } }),
    enabled: !!me && valid,
    refetchInterval: 5_000,
    retry: false,
  });

  const order = useApiMutation<OrderInput, OrderResult>({
    mutationFn: (json) => api<OrderResult>('/orders', { method: 'POST', json }),
    // Un ordre touche le portefeuille, l'historique, l'actif (trades, détenteurs), le classement et les succès
    invalidate: [queryKeys.portfolio, queryKeys.history, queryKeys.asset(symbol), queryKeys.leaderboard.all, queryKeys.achievements],
    onSuccess: () => setAmount(''),
  });

  if (!me) {
    return (
      <div className="border-2 border-ink p-5">
        <p className="display mb-4 text-3xl font-bold">{t('cta', { name })}</p>
        <Link href="/register" className="btn w-full bg-acid">
          {t('register')}
        </Link>
      </div>
    );
  }

  const setFraction = (fr: number) => {
    const v = available * fr;
    setAmount(side === 'BUY' ? (Math.floor(v * 100) / 100).toFixed(2) : (Math.floor(v * 1e8) / 1e8).toString());
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = orderSchema.safeParse({ symbol, side, amount, maxSlippageBps: slip, clientOrderId: crypto.randomUUID() });
    if (parsed.success) order.mutate(parsed.data);
  }

  const q = quote.data;
  const tooMuch = Number(amount) > available + 1e-9;
  const slipTooHigh = q && q.slippageBps > slip;

  return (
    <form onSubmit={submit} className="border-2 border-ink">
      <div className="grid grid-cols-2 border-b-2 border-ink text-lg font-bold">
        {(['BUY', 'SELL'] as const).map((s) => (
          <button
            type="button"
            key={s}
            aria-pressed={side === s}
            onClick={() => {
              setSide(s);
              setAmount('');
              order.reset();
            }}
            className={`py-3 ${side === s ? (s === 'BUY' ? 'bg-up text-paper' : 'bg-down text-paper') : 'hover:bg-paper-2'}`}
          >
            {t(`tabs.${s}`)}
          </button>
        ))}
      </div>
      <div className="space-y-4 p-5">
        <label className="block">
          <span className="mb-1.5 flex justify-between text-sm">
            <span className="font-semibold">{side === 'BUY' ? t('amountBuy') : t('amountSell', { symbol })}</span>
            <span className="num text-ink-2">{t('available', { value: side === 'BUY' ? f.money(available) : f.qty(available) })}</span>
          </span>
          <input
            className="field num text-xl"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
          />
        </label>
        <div className="grid grid-cols-4 gap-1 text-sm">
          {FRACTIONS.map((fr) => (
            <button type="button" key={fr} onClick={() => setFraction(fr)} className="border border-ink py-1 hover:bg-paper-2" disabled={!available}>
              {fr === 1 ? t('max') : f.number(fr, { style: 'percent' })}
            </button>
          ))}
        </div>

        <dl className="num space-y-1.5 border-t border-line pt-4 text-sm">
          <KeyValueRow label={side === 'BUY' ? t('receive') : t('get')}>
            {q ? (side === 'BUY' ? `${f.qty(q.amountOut)} ${symbol}` : f.money(q.amountOut)) : '—'}
          </KeyValueRow>
          <KeyValueRow label={t('avgPrice')}>{q ? f.price(q.avgPrice) : '—'}</KeyValueRow>
          <KeyValueRow label={t('fee')}>{q ? f.money(q.fee) : '—'}</KeyValueRow>
          <KeyValueRow label={t('impact')} className={q && q.slippageBps > 500 ? 'text-down' : ''}>
            {q ? f.pct(q.slippageBps / 10_000, false) : '—'}
          </KeyValueRow>
          {quote.error && <p className="text-down">{errorMessage(quote.error)}</p>}
        </dl>

        <fieldset className="text-sm">
          <legend className="mb-1.5 text-ink-2">{t('slippage')}</legend>
          <div className="flex gap-1">
            {SLIPPAGES.map((s) => (
              <button
                type="button"
                key={s}
                aria-pressed={slip === s}
                onClick={() => setSlip(s)}
                className={`num flex-1 py-1 ${slip === s ? 'bg-ink text-paper' : 'border border-line hover:bg-paper-2'}`}
              >
                {f.number(s / 10_000, { style: 'percent', maximumFractionDigits: 1 })}
              </button>
            ))}
          </div>
        </fieldset>

        {slipTooHigh && <p className="text-sm text-down">{t('slippageTooHigh')}</p>}
        <button
          className={`btn w-full text-lg ${side === 'BUY' ? 'bg-acid' : 'bg-paper-3'}`}
          disabled={order.isPending || !valid || tooMuch || !!slipTooHigh || amount !== debounced}
        >
          {order.isPending ? t('pending') : tooMuch ? t('insufficient') : t(`submit.${side}`, { symbol })}
        </button>
        {order.isSuccess && (
          <p role="status" className="text-sm font-semibold text-up">
            {t(order.variables.side === 'BUY' ? 'bought' : 'sold', {
              quantity: f.qty(order.data.quantity),
              symbol,
              cash: f.money(order.data.cash),
            })}
            {order.data.realizedPnl != null &&
              t('pnl', { pnl: `${Number(order.data.realizedPnl) >= 0 ? '+' : ''}${f.money(order.data.realizedPnl)}` })}
          </p>
        )}
        {order.error && (
          <p role="status" className="text-sm font-semibold text-down">
            {errorMessage(order.error)}
          </p>
        )}
      </div>
    </form>
  );
}
