'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMe, usePortfolio } from '@/lib/hooks';
import { money, price, qty } from '@/lib/format';

interface Quote {
  amountIn: string;
  amountOut: string;
  fee: string;
  avgPrice: string;
  priceAfter: string;
  slippageBps: number;
}

const SLIPPAGES = [50, 200, 500, 1500];

function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function OrderForm({ symbol, name }: { symbol: string; name: string }) {
  const { data: me } = useMe();
  const { data: pf } = usePortfolio(!!me);
  const qc = useQueryClient();
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [amount, setAmount] = useState('');
  const [slip, setSlip] = useState(200);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const position = pf?.positions.find((p) => p.symbol === symbol);
  const available = side === 'BUY' ? Number(pf?.cash ?? 0) : Number(position?.quantity ?? 0);
  const debounced = useDebounced(amount);
  const valid = /^\d+(\.\d+)?$/.test(debounced) && Number(debounced) > 0;

  const quote = useQuery({
    queryKey: ['quote', symbol, side, debounced],
    queryFn: () => api<Quote>('/market/quote', { method: 'POST', json: { symbol, side, amount: debounced } }),
    enabled: !!me && valid,
    refetchInterval: 5_000,
    retry: false,
  });

  if (!me) {
    return (
      <div className="border-2 border-ink p-5">
        <p className="display mb-4 text-3xl font-bold">Envie de trader {name} ?</p>
        <Link href="/register" className="btn w-full bg-acid">Créer un compte</Link>
      </div>
    );
  }

  const setFraction = (f: number) => {
    const v = available * f;
    setAmount(side === 'BUY' ? (Math.floor(v * 100) / 100).toFixed(2) : (Math.floor(v * 1e8) / 1e8).toString());
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setResult(null);
    try {
      const t = await api<{ quantity: string; cash: string; realizedPnl: string | null }>('/orders', {
        method: 'POST',
        json: { symbol, side, amount, maxSlippageBps: slip, clientOrderId: crypto.randomUUID() },
      });
      const pnl = t.realizedPnl != null ? ` · PnL ${Number(t.realizedPnl) >= 0 ? '+' : ''}${money(t.realizedPnl)}` : '';
      setResult({
        ok: true,
        text: side === 'BUY' ? `Acheté ${qty(t.quantity)} ${symbol} pour ${money(t.cash)}` : `Vendu ${qty(t.quantity)} ${symbol} pour ${money(t.cash)}${pnl}`,
      });
      setAmount('');
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['asset', symbol] });
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message });
    } finally {
      setPending(false);
    }
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
            onClick={() => {
              setSide(s);
              setAmount('');
              setResult(null);
            }}
            className={`py-3 ${side === s ? (s === 'BUY' ? 'bg-up text-paper' : 'bg-down text-paper') : 'hover:bg-paper-2'}`}
          >
            {s === 'BUY' ? 'Acheter' : 'Vendre'}
          </button>
        ))}
      </div>
      <div className="space-y-4 p-5">
        <label className="block">
          <span className="mb-1.5 flex justify-between text-sm">
            <span className="font-semibold">{side === 'BUY' ? 'Montant à investir ($)' : `Quantité de ${symbol}`}</span>
            <span className="num text-ink-2">
              Dispo : {side === 'BUY' ? money(available) : qty(available)}
            </span>
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
          {[0.1, 0.25, 0.5, 1].map((f) => (
            <button type="button" key={f} onClick={() => setFraction(f)} className="border border-ink py-1 hover:bg-paper-2" disabled={!available}>
              {f === 1 ? 'Max' : `${f * 100} %`}
            </button>
          ))}
        </div>

        <dl className="num space-y-1.5 border-t border-line pt-4 text-sm">
          <Row label={side === 'BUY' ? 'Tu reçois' : 'Tu touches'}>
            {q ? (side === 'BUY' ? `${qty(q.amountOut)} ${symbol}` : money(q.amountOut)) : '—'}
          </Row>
          <Row label="Prix moyen">{q ? price(q.avgPrice) : '—'}</Row>
          <Row label="Frais">{q ? money(q.fee) : '—'}</Row>
          <Row label="Impact sur le prix">
            <span className={q && q.slippageBps > 500 ? 'font-semibold text-down' : ''}>{q ? `${(q.slippageBps / 100).toFixed(2)} %` : '—'}</span>
          </Row>
          {quote.error && <p className="text-down">{(quote.error as Error).message}</p>}
        </dl>

        <fieldset className="text-sm">
          <legend className="mb-1.5 text-ink-2">Slippage max toléré</legend>
          <div className="flex gap-1">
            {SLIPPAGES.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setSlip(s)}
                className={`num flex-1 py-1 ${slip === s ? 'bg-ink text-paper' : 'border border-line hover:bg-paper-2'}`}
              >
                {s / 100} %
              </button>
            ))}
          </div>
        </fieldset>

        {slipTooHigh && (
          <p className="text-sm text-down">L'impact dépasse ta limite : réduis le montant ou augmente le slippage toléré.</p>
        )}
        <button
          className={`btn w-full text-lg ${side === 'BUY' ? 'bg-acid' : 'bg-paper-3'}`}
          disabled={pending || !valid || tooMuch || !!slipTooHigh || amount !== debounced}
        >
          {pending ? 'Exécution…' : tooMuch ? 'Solde insuffisant' : side === 'BUY' ? `Acheter ${symbol}` : `Vendre ${symbol}`}
        </button>
        {result && (
          <p role="status" className={`text-sm font-semibold ${result.ok ? 'text-up' : 'text-down'}`}>
            {result.text}
          </p>
        )}
      </div>
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  );
}
