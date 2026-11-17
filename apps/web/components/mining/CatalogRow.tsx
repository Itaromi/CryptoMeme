'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { ALGO_LABEL, type Model, useMiningFormat } from '@/lib/mining';
import { errorMessage, useApiMutation } from '@/lib/mutation';
import { queryKeys } from '@/lib/queryKeys';

/** Une ligne du catalogue : caractéristiques du modèle et achat en quantité. */
export function CatalogRow({ m, algo, cash, canBuy }: { m: Model; algo: string; cash: number; canBuy: boolean }) {
  const t = useTranslations('mining.catalog');
  const f = useFormat();
  const mf = useMiningFormat();
  const [n, setN] = useState(1);
  const total = Number(m.price) * n;
  // L'algo le plus rentable d'abord (les unités ne sont pas comparables d'un algo à l'autre)
  const algos = Object.entries(m.hashrates)
    .filter(([a, v]) => (v ?? 0) > 0 && (!algo || a === algo))
    .sort((a, b) => (a[0] === m.bestAlgo ? -1 : b[0] === m.bestAlgo ? 1 : 0));

  // Le cash part dans le matériel : ferme, portefeuille et classement bougent.
  const buy = useApiMutation({
    mutationFn: () => api('/mining/buy', { method: 'POST', json: { modelId: m.id, quantity: n } }),
    invalidate: [queryKeys.mining.farm, queryKeys.portfolio, queryKeys.leaderboard.all],
  });

  return (
    <tr className="border-b border-line align-top hover:bg-paper-2">
      <td className="py-2.5 pr-4">
        <span className="block font-semibold">
          {m.brand} {m.name}
        </span>
        {m.description && <span className="block text-xs italic text-ink-2">{m.description}</span>}
      </td>
      <td className="py-2.5 pr-4">
        {m.kind === 'PSU' && t('psu', { power: mf.watts(m.watts), efficiency: mf.pct(m.efficiency ?? 0) })}
        {m.kind === 'MOTHERBOARD' && t('motherboard', { socket: m.socket ?? '—', slots: m.gpuSlots ?? 0 })}
        {m.kind === 'COOLING' && t('cooling', { cooling: mf.watts(m.coolingW ?? 0) })}
        {m.kind === 'RACK' && t('rack', { slots: m.rackSlots ?? 0, airflow: f.number(m.airflow ?? 0) })}
        {(m.kind === 'GPU' || m.kind === 'CPU' || m.kind === 'ASIC') && (
          <span className="flex flex-wrap gap-x-3">
            {algos.slice(0, algo ? 1 : 2).map(([a, v]) => (
              <span key={a}>
                <strong>{mf.hash(v ?? 0)}</strong> <span className="text-xs text-ink-2">{ALGO_LABEL[a] ?? a}</span>
              </span>
            ))}
            {m.socket && <span className="text-xs text-ink-2">{m.socket}</span>}
            {!!m.usdPerDay && m.bestAlgo && (
              <span className="w-full text-xs text-ink-2">{t('grossPerDay', { value: f.money(m.usdPerDay), algo: ALGO_LABEL[m.bestAlgo] ?? m.bestAlgo })}</span>
            )}
            {m.kind === 'ASIC' && <span className="text-xs text-ink-2">{t('asicCooling', { cooling: mf.watts(m.coolingW ?? 0) })}</span>}
          </span>
        )}
      </td>
      <td className="py-2.5 pr-4 text-right">{m.kind === 'PSU' || m.kind === 'RACK' ? '—' : mf.watts(m.watts)}</td>
      <td className="py-2.5 pr-4 text-right font-semibold">{f.money(m.price)}</td>
      <td className="py-2.5 text-right">
        {canBuy && (
          <span className="inline-flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={20}
              value={n}
              onChange={(e) => {
                setN(Math.max(1, Math.min(20, Number(e.target.value) || 1)));
                buy.reset();
              }}
              className="field w-16 py-1 text-center"
              aria-label={t('quantity')}
            />
            <button className="btn bg-acid px-3 py-1 text-sm" disabled={buy.isPending || total > cash} onClick={() => buy.mutate()}>
              {total > cash ? t('tooExpensive') : n > 1 ? t('buyTotal', { total: f.money(total) }) : t('buy')}
            </button>
          </span>
        )}
        {buy.isSuccess && <span className="mt-1 block text-xs text-up">{t('added')}</span>}
        {buy.error && <span className="mt-1 block text-xs text-down">{errorMessage(buy.error)}</span>}
      </td>
    </tr>
  );
}
