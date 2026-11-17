'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { ALGO_LABEL, type PoolsInfo, type RigView, tempTone, useMiningFormat } from '@/lib/mining';
import { errorMessage, useApiMutation } from '@/lib/mutation';
import { queryKeys } from '@/lib/queryKeys';

/** Niveaux d'overclock, dans l'ordre de l'API (0 = stock). */
const OC_LEVELS = ['stock', 'light', 'heavy', 'suicidal'] as const;

/** Mise à jour d'une rig : pool, marche/arrêt, overclock. */
type RigPatch = { poolId?: string | null; running?: boolean; overclock?: number };

export function RigRow({ rig, pools }: { rig: RigView; pools?: PoolsInfo }) {
  const t = useTranslations('mining');
  const f = useFormat();
  const m = useMiningFormat();
  const [open, setOpen] = useState(false);
  const s = rig.stats;
  const broken = rig.parts.some((p) => p.status !== 'OK');
  const destroyed = rig.parts.every((p) => p.status === 'DESTROYED');

  // Changer de pool ou démonter fait aussi bouger le nombre de mineurs des pools.
  const patch = useApiMutation<RigPatch>({
    mutationFn: (body) => api(`/mining/rigs/${rig.id}`, { method: 'PATCH', json: body }),
    invalidate: [queryKeys.mining.farm, queryKeys.mining.pools],
  });
  const repair = useApiMutation<string>({
    mutationFn: (id) => api(`/mining/items/${id}/repair`, { method: 'POST' }),
    invalidate: [queryKeys.mining.farm, queryKeys.portfolio, queryKeys.leaderboard.all],
  });
  const dismantle = useApiMutation({
    mutationFn: () => api(`/mining/rigs/${rig.id}`, { method: 'DELETE' }),
    invalidate: [queryKeys.mining.farm, queryKeys.mining.pools],
  });
  const busy = patch.isPending || dismantle.isPending;
  const error = patch.error ?? repair.error ?? dismantle.error;

  // Pools compatibles : ceux dont le réseau a un hashrate non nul pour cette rig
  const compatible = pools?.pools.filter((p) => {
    const net = pools.networks.find((n) => n.symbol === p.symbol);
    return net && (s?.hashrates[net.algo] ?? 0) > 0;
  });

  const status = t(`rig.status.${destroyed ? 'destroyed' : broken ? 'broken' : rig.running ? 'running' : 'stopped'}`);
  const dot = destroyed || broken ? 'bg-down' : rig.running ? 'bg-up animate-pulse' : 'bg-ink-3';
  const net = rig.estUsdPerDay - (s?.elecCostPerDay ?? 0);

  return (
    <div className="border-b border-line py-3">
      <div className="grid items-center gap-x-4 gap-y-2 md:grid-cols-[minmax(160px,1.3fr)_90px_120px_minmax(170px,1.3fr)_130px_110px_auto]">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-left" aria-expanded={open}>
          <span className={`size-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />
          <span>
            <span className="block font-semibold hover:underline">{rig.name}</span>
            <span className="text-xs text-ink-2">{t('rig.summary', { status, count: rig.parts.length })}</span>
          </span>
        </button>
        <span className={`num text-sm ${s ? tempTone(s.temperature) : ''}`} title={t('rig.tempHint')}>
          {s ? `${Math.round(s.temperature)} °C` : '—'}
        </span>
        <span className="num text-sm">{rig.pool ? m.hash(rig.poolHashrate) : '—'}</span>
        <select
          className="field py-1 text-sm"
          value={rig.pool?.id ?? ''}
          disabled={busy || destroyed}
          onChange={(e) => patch.mutate({ poolId: e.target.value || null, ...(e.target.value ? {} : { running: false }) })}
          aria-label={t('rig.pool')}
        >
          <option value="">{t('rig.choosePool')}</option>
          {compatible?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.symbol} · {p.name} ({m.poolType(p.type)})
            </option>
          ))}
        </select>
        <select
          className="field py-1 text-sm"
          value={rig.overclock}
          disabled={busy || destroyed}
          onChange={(e) => patch.mutate({ overclock: Number(e.target.value) })}
          aria-label={t('rig.overclock')}
        >
          {OC_LEVELS.map((l, i) => (
            <option key={l} value={i}>
              {t(`rig.oc.${l}`)}
            </option>
          ))}
        </select>
        <span className="num text-right text-sm">
          <span className={`block font-semibold ${net >= 0 ? 'text-up' : 'text-down'}`}>{rig.pool ? t('perDay', { value: f.money(net) }) : '—'}</span>
          <span className="text-xs text-ink-2">{t('rig.netOfElec')}</span>
        </span>
        <button
          className={`btn py-1.5 text-sm ${rig.running ? 'bg-paper' : 'bg-acid'}`}
          disabled={busy || destroyed || (!rig.running && (!rig.pool || broken))}
          onClick={() => patch.mutate({ running: !rig.running })}
        >
          {rig.running ? t('rig.stop') : t('rig.start')}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-down">{errorMessage(error)}</p>}

      {open && (
        <div className="mt-3 grid gap-6 bg-paper-2 p-4 text-sm lg:grid-cols-[1.4fr_1fr]">
          <table className="num w-full">
            <tbody>
              {rig.parts.map((p) => (
                <tr key={p.id} className="border-b border-line">
                  <td className="py-1.5 pr-2 text-xs text-ink-2">{m.kindShort(p.model.kind)}</td>
                  <td className="py-1.5">
                    <span className={p.status !== 'OK' ? 'text-down line-through' : ''}>
                      {p.model.brand} {p.model.name}
                    </span>
                    {p.status !== 'OK' && <span className="ml-2 text-xs font-semibold text-down">{t(`item.${p.status}`)}</span>}
                  </td>
                  <td className="w-28 py-1.5">
                    <div className="h-1.5 bg-paper-3" title={t('item.wearHint', { value: m.pct(p.wear) })}>
                      <div className={`h-full ${p.wear > 0.7 ? 'bg-down' : 'bg-ink'}`} style={{ width: `${p.wear * 100}%` }} />
                    </div>
                  </td>
                  <td className="py-1.5 pl-2 text-right">
                    {p.status === 'BROKEN' && (
                      <button className="font-semibold underline" disabled={repair.isPending} onClick={() => repair.mutate(p.id)}>
                        {t('item.repair', { cost: f.money(p.repairCost) })}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {s && (
            <dl className="num grid grid-cols-2 gap-x-4 gap-y-1">
              <dt className="text-ink-2">{t('rig.stats.psuLoad')}</dt>
              <dd className={`text-right ${s.power > s.psuCapacity ? 'text-down' : ''}`}>
                {m.watts(s.power)} / {m.watts(s.psuCapacity)}
              </dd>
              <dt className="text-ink-2">{t('rig.stats.wall')}</dt>
              <dd className="text-right">{m.watts(s.wallPower)}</dd>
              <dt className="text-ink-2">{t('rig.stats.elec')}</dt>
              <dd className="text-right">{t('perDay', { value: f.money(s.elecCostPerDay) })}</dd>
              <dt className="text-ink-2">{t('rig.stats.revenue')}</dt>
              <dd className="text-right">{t('perDay', { value: `${f.qty(rig.estCoinsPerDay)} ${rig.pool?.symbol ?? ''}`.trim() })}</dd>
              <dt className="text-ink-2">{t('rig.stats.poolFee')}</dt>
              <dd className="text-right">{rig.pool ? f.pct(rig.pool.fee / 10_000, false) : '—'}</dd>
              <dt className="text-ink-2">{t('rig.stats.failRisk')}</dt>
              <dd className="text-right">{t('perDay', { value: m.pct(s.failurePerHour * 24, 1) })}</dd>
              {s.firePerHour > 0 && (
                <>
                  <dt className="font-semibold text-down">{t('rig.stats.fireRisk')}</dt>
                  <dd className="text-right font-semibold text-down">{t('perDay', { value: m.pct(s.firePerHour * 24, 1) })}</dd>
                </>
              )}
              <dt className="text-ink-2">{t('rig.stats.mined')}</dt>
              <dd className="text-right">
                {f.qty(rig.minedTotal)} {rig.pool?.symbol ?? ''}
              </dd>
              <dt className="col-span-2 mt-1 text-xs text-ink-2">
                {Object.entries(s.hashrates)
                  .filter(([, v]) => (v ?? 0) > 0)
                  .map(([a, v]) => `${ALGO_LABEL[a] ?? a} ${m.hash(v ?? 0)}`)
                  .join(' · ')}
              </dt>
              <dd className="col-span-2 mt-2">
                <button
                  className="text-sm font-semibold text-down underline disabled:opacity-40"
                  disabled={rig.running || dismantle.isPending}
                  onClick={() => dismantle.mutate()}
                >
                  {t('rig.dismantle')}
                </button>
              </dd>
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
