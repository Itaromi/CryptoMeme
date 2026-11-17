'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Check, X } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { ALGO_LABEL, type Item, type Kind, type RigStatsView, tempTone, useMiningFormat } from '@/lib/mining';
import { useApiMutation } from '@/lib/mutation';
import { useTexts } from '@/lib/texts';
import { queryKeys } from '@/lib/queryKeys';

interface Preview extends RigStatsView {
  revenue: Array<{ symbol: string; algo: string; hashrate: number; usdPerDay: number }>;
}

const ORDER: Kind[] = ['MOTHERBOARD', 'CPU', 'GPU', 'ASIC', 'PSU', 'COOLING'];

/** Monte une rig dans un rack à partir de l'inventaire, avec un aperçu en direct (erreurs de configuration renvoyées par l'API). */
export function RigBuilder({ rackId, inventory, onDone }: { rackId: string; inventory: Item[]; onDone: () => void }) {
  const texts = useTexts();
  const errorMessage = texts.error;
  const t = useTranslations('mining');
  const tc = useTranslations('common.actions');
  const f = useFormat();
  const m = useMiningFormat();
  const usable = inventory.filter((i) => i.status === 'OK' && i.model.kind !== 'RACK');
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState('');
  const key = useMemo(() => [...picked].sort().join(','), [picked]);
  const [debounced, setDebounced] = useState(key);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(key), 200);
    return () => clearTimeout(t);
  }, [key]);

  const partIds = useMemo(() => (debounced ? debounced.split(',') : []), [debounced]);

  // L'aperçu est un calcul sans effet de bord : une requête (POST côté API), pas une action.
  const preview = useQuery({
    queryKey: queryKeys.mining.rigPreview(rackId, partIds),
    queryFn: () => api<Preview>('/mining/rigs/preview', { method: 'POST', json: { rackId, partIds, overclock: 0 } }),
    enabled: partIds.length > 0,
  });

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const create = useApiMutation({
    mutationFn: () => api('/mining/rigs', { method: 'POST', json: { name, rackId, partIds: picked } }),
    invalidate: [queryKeys.mining.farm],
    onSuccess: onDone,
  });

  if (!usable.length)
    return (
      <div className="border-2 border-dashed border-ink p-5">
        <p className="mb-2 font-semibold">{t('builder.emptyTitle')}</p>
        <p className="text-sm text-ink-2">
          {t.rich('builder.emptyHelp', {
            link: (c) => (
              <Link href="/mining/shop" className="font-semibold text-ink underline">
                {c}
              </Link>
            ),
          })}
        </p>
      </div>
    );

  const p = preview.data;
  const best = p?.revenue.slice().sort((a, b) => b.usdPerDay - a.usdPerDay)[0];

  return (
    <div className="grid gap-6 border-2 border-ink bg-paper p-5 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <p className="mb-3 text-sm font-bold uppercase tracking-widest">{t('builder.pick')}</p>
        <div className="max-h-96 space-y-4 overflow-y-auto pr-2">
          {ORDER.map((kind) => {
            const items = usable.filter((i) => i.model.kind === kind);
            if (!items.length) return null;
            return (
              <fieldset key={kind}>
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-2">{m.kindShort(kind)}</legend>
                {items.map((i) => (
                  <label key={i.id} className={`flex cursor-pointer items-center gap-3 border-b border-line py-1.5 text-sm ${picked.includes(i.id) ? 'bg-acid' : 'hover:bg-paper-2'}`}>
                    <input type="checkbox" className="ml-1 size-4 accent-[oklch(0.2_0.02_95)]" checked={picked.includes(i.id)} onChange={() => toggle(i.id)} />
                    <span className="flex-1">
                      <span className="font-semibold">{i.model.brand} {i.model.name}</span>
                      <span className="block text-xs text-ink-2">
                        {m.modelSpecs(i.model)}
                        {i.wear > 0.01 && ` · ${t('item.wear', { value: m.pct(i.wear) })}`}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>
      </div>

      <div className="num space-y-3 text-sm">
        <p className="text-sm font-bold uppercase tracking-widest">{t('builder.preview')}</p>
        {!p ? (
          <p className="text-ink-2">{t('builder.previewEmpty')}</p>
        ) : (
          <>
            {p.errors.length > 0 ? (
              <ul className="space-y-1 text-down">
                {p.errors.map((e) => (
                  <li key={e.code} className="flex items-start gap-1.5">
                    <X weight="bold" className="mt-1 shrink-0" />
                    {texts.translate(`errors.${e.code}`, e.params, e.message)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-semibold text-up"><Check weight="bold" className="mr-1 inline align-[-0.15em]" />
                {t('builder.valid')}
              </p>
            )}
            <Bar label={t('builder.psu')} value={p.power} max={p.psuCapacity} fmt={m.watts} />
            <Bar label={t('builder.cooling')} value={p.power} max={p.coolingCapacity} fmt={m.watts} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <dt className="text-ink-2">{t('builder.temperature')}</dt>
              <dd className={`text-right font-semibold ${tempTone(p.temperature)}`}>
                {Math.round(p.temperature)} °C{p.throttle < 1 && ` ${t('builder.throttled', { value: m.pct(p.throttle) })}`}
              </dd>
              <dt className="text-ink-2">{t('builder.wall')}</dt>
              <dd className="text-right">{m.watts(p.wallPower)}</dd>
              <dt className="text-ink-2">{t('builder.elec')}</dt>
              <dd className="text-right">{t('builder.perDayLong', { value: f.money(p.elecCostPerDay) })}</dd>
              <dt className="text-ink-2">{t('builder.failRisk')}</dt>
              <dd className="text-right">{t('builder.perDayLong', { value: m.pct(p.failurePerHour * 24, 1) })}</dd>
            </dl>
            <table className="w-full">
              <tbody>
                {p.revenue.filter((r) => r.hashrate > 0).sort((a, b) => b.usdPerDay - a.usdPerDay).map((r) => (
                  <tr key={r.symbol} className={`border-b border-line ${r === best ? 'font-semibold' : ''}`}>
                    <td className="py-1">
                      {r.symbol} <span className="text-xs text-ink-2">{ALGO_LABEL[r.algo] ?? r.algo}</span>
                    </td>
                    <td className="py-1 text-right">{m.hash(r.hashrate)}</td>
                    <td className="py-1 text-right">{t('perDay', { value: f.money(r.usdPerDay) })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {best && (
              <p className="text-ink-2">
                {t.rich('builder.netEstimate', {
                  symbol: best.symbol,
                  value: f.money(best.usdPerDay - p.elecCostPerDay),
                  b: (c) => <strong className={best.usdPerDay - p.elecCostPerDay > 0 ? 'text-up' : 'text-down'}>{c}</strong>,
                })}
              </p>
            )}
          </>
        )}
        <input
          className="field"
          placeholder={t('builder.namePlaceholder')}
          aria-label={t('builder.namePlaceholder')}
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {create.error && <p className="text-down">{errorMessage(create.error)}</p>}
        <div className="flex gap-2">
          <button className="btn flex-1 bg-acid" disabled={create.isPending || !p?.valid} onClick={() => create.mutate()}>
            {t('builder.create')}
          </button>
          <button className="btn bg-paper" onClick={onDone}>
            {tc('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Bar({ label, value, max, fmt }: { label: string; value: number; max: number; fmt: (n: number) => string }) {
  const ratio = max > 0 ? value / max : value > 0 ? 2 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-ink-2">{label}</span>
        <span className={ratio > 1 ? 'font-semibold text-down' : ''}>{fmt(value)} / {fmt(max)}</span>
      </div>
      <div className="mt-1 h-2 bg-paper-2">
        <div className={`h-full ${ratio > 1 ? 'bg-down' : ratio > 0.85 ? 'bg-[oklch(0.75_0.15_70)]' : 'bg-ink'}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
    </div>
  );
}
