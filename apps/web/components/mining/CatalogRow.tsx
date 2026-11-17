'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { ALGO_LABEL, type Model, useMiningFormat } from '@/lib/mining';
import { useApiMutation } from '@/lib/mutation';
import { useTexts } from '@/lib/texts';
import { queryKeys } from '@/lib/queryKeys';

/** Une ligne du catalogue : caractéristiques du modèle et achat en quantité. */
export function CatalogRow({ m, algo, cash, canBuy }: { m: Model; algo: string; cash: number; canBuy: boolean }) {
  const texts = useTexts();
  const errorMessage = texts.error;
  const t = useTranslations('mining.catalog');
  const tc = useTranslations('mining.shop.cols');
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
    <tr className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 border-b border-line py-3 align-top hover:bg-paper-2 lg:table-row lg:py-0">
      <td className="col-span-2 lg:py-2.5 lg:pr-4">
        <span className="block font-semibold">
          {m.brand} {m.name}
        </span>
        {m.description && (
          <span className="block text-xs italic text-ink-2">{m.descriptionKey ? texts.translate(m.descriptionKey, undefined, m.description) : m.description}</span>
        )}
      </td>
      <td className="col-span-2 lg:py-2.5 lg:pr-4">
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
      <td className="lg:py-2.5 lg:pr-4 lg:text-right">
        {m.kind !== 'PSU' && m.kind !== 'RACK' && <span className="text-xs text-ink-2 lg:hidden">{tc('power')} </span>}
        {m.kind === 'PSU' || m.kind === 'RACK' ? <span className="max-lg:hidden">—</span> : mf.watts(m.watts)}
      </td>
      <td className="text-right font-semibold lg:py-2.5 lg:pr-4">{f.money(m.price)}</td>
      <td className="col-span-2 pt-1 lg:py-2.5 lg:text-right">
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
              className="field w-16 py-2 text-center lg:py-1"
              aria-label={t('quantity')}
            />
            <button className="btn bg-acid px-3 py-2 text-sm lg:py-1" disabled={buy.isPending || total > cash} onClick={() => buy.mutate()}>
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
