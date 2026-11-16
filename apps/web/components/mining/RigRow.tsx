'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { money, qty } from '@/lib/format';
import { ALGO_LABEL, hash, POOL_TYPE, PoolsInfo, RigView, tempTone, watts, KIND_SHORT } from '@/lib/mining';

const OC_LABEL = ['Stock', 'OC léger', 'OC costaud', 'OC suicidaire'];

export function RigRow({ rig, pools }: { rig: RigView; pools?: PoolsInfo }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const s = rig.stats;
  const broken = rig.parts.some((p) => p.status !== 'OK');
  const destroyed = rig.parts.every((p) => p.status === 'DESTROYED');

  async function patch(body: object) {
    setBusy(true);
    setError(null);
    try {
      await api(`/mining/rigs/${rig.id}`, { method: 'PATCH', json: body });
      await qc.invalidateQueries({ queryKey: ['farm'] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function itemAction(id: string, action: 'repair' | 'sell') {
    setError(null);
    try {
      await api(`/mining/items/${id}/${action}`, { method: 'POST' });
      qc.invalidateQueries({ queryKey: ['farm'] });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function dismantle() {
    await api(`/mining/rigs/${rig.id}`, { method: 'DELETE' });
    qc.invalidateQueries({ queryKey: ['farm'] });
  }

  // Pools compatibles : ceux dont le réseau a un hashrate non nul pour cette rig
  const compatible = pools?.pools.filter((p) => {
    const net = pools.networks.find((n) => n.symbol === p.symbol);
    return net && (s?.hashrates[net.algo] ?? 0) > 0;
  });

  const status = destroyed ? 'Carbonisée' : broken ? 'En panne' : rig.running ? 'En marche' : 'À l’arrêt';
  const dot = destroyed || broken ? 'bg-down' : rig.running ? 'bg-up animate-pulse' : 'bg-ink-3';

  return (
    <div className="border-b border-line py-3">
      <div className="grid items-center gap-x-4 gap-y-2 md:grid-cols-[minmax(160px,1.3fr)_90px_120px_minmax(170px,1.3fr)_130px_110px_auto]">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-left">
          <span className={`size-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />
          <span>
            <span className="block font-semibold hover:underline">{rig.name}</span>
            <span className="text-xs text-ink-2">{status} · {rig.parts.length} pièces</span>
          </span>
        </button>
        <span className={`num text-sm ${s ? tempTone(s.temperature) : ''}`} title="Température estimée">
          {s ? `${Math.round(s.temperature)} °C` : '—'}
        </span>
        <span className="num text-sm">{rig.pool ? hash(rig.poolHashrate) : '—'}</span>
        <select
          className="field py-1 text-sm"
          value={rig.pool?.id ?? ''}
          disabled={busy || destroyed}
          onChange={(e) => patch({ poolId: e.target.value || null, ...(e.target.value ? {} : { running: false }) })}
          aria-label="Pool"
        >
          <option value="">Choisir un pool…</option>
          {compatible?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.emoji} {p.symbol} · {p.name} ({POOL_TYPE[p.type].label})
            </option>
          ))}
        </select>
        <select className="field py-1 text-sm" value={rig.overclock} disabled={busy || destroyed} onChange={(e) => patch({ overclock: Number(e.target.value) })} aria-label="Overclock">
          {OC_LABEL.map((l, i) => <option key={i} value={i}>{l}</option>)}
        </select>
        <span className="num text-right text-sm">
          <span className={`block font-semibold ${rig.estUsdPerDay - (s?.elecCostPerDay ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>
            {rig.pool ? `${money(rig.estUsdPerDay - (s?.elecCostPerDay ?? 0))}/j` : '—'}
          </span>
          <span className="text-xs text-ink-2">net d’élec.</span>
        </span>
        <button
          className={`btn py-1.5 text-sm ${rig.running ? 'bg-paper' : 'bg-acid'}`}
          disabled={busy || destroyed || (!rig.running && (!rig.pool || broken))}
          onClick={() => patch({ running: !rig.running })}
        >
          {rig.running ? 'Arrêter' : 'Démarrer'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-down">{error}</p>}

      {open && (
        <div className="mt-3 grid gap-6 bg-paper-2 p-4 text-sm lg:grid-cols-[1.4fr_1fr]">
          <table className="num w-full">
            <tbody>
              {rig.parts.map((p) => (
                <tr key={p.id} className="border-b border-line">
                  <td className="py-1.5 pr-2 text-xs text-ink-2">{KIND_SHORT[p.model.kind]}</td>
                  <td className="py-1.5">
                    <span className={p.status !== 'OK' ? 'text-down line-through' : ''}>{p.model.brand} {p.model.name}</span>
                    {p.status === 'BROKEN' && <span className="ml-2 text-xs font-semibold text-down">EN PANNE</span>}
                    {p.status === 'DESTROYED' && <span className="ml-2 text-xs font-semibold text-down">CARBONISÉ</span>}
                  </td>
                  <td className="w-28 py-1.5">
                    <div className="h-1.5 bg-paper-3" title={`Usure ${Math.round(p.wear * 100)} %`}>
                      <div className={`h-full ${p.wear > 0.7 ? 'bg-down' : 'bg-ink'}`} style={{ width: `${p.wear * 100}%` }} />
                    </div>
                  </td>
                  <td className="py-1.5 pl-2 text-right">
                    {p.status === 'BROKEN' && (
                      <button className="font-semibold underline" onClick={() => itemAction(p.id, 'repair')}>Réparer ({money(p.repairCost)})</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {s && (
            <dl className="num grid grid-cols-2 gap-x-4 gap-y-1">
              <dt className="text-ink-2">Conso / alim</dt>
              <dd className={`text-right ${s.power > s.psuCapacity ? 'text-down' : ''}`}>{watts(s.power)} / {watts(s.psuCapacity)}</dd>
              <dt className="text-ink-2">À la prise</dt>
              <dd className="text-right">{watts(s.wallPower)}</dd>
              <dt className="text-ink-2">Électricité</dt>
              <dd className="text-right">{money(s.elecCostPerDay)}/j</dd>
              <dt className="text-ink-2">Revenu estimé</dt>
              <dd className="text-right">{qty(rig.estCoinsPerDay)} {rig.pool?.symbol}/j</dd>
              <dt className="text-ink-2">Frais du pool</dt>
              <dd className="text-right">{rig.pool ? `${(rig.pool.fee / 100).toFixed(2)} %` : '—'}</dd>
              <dt className="text-ink-2">Risque de panne</dt>
              <dd className="text-right">{(s.failurePerHour * 2400).toFixed(1)} %/j</dd>
              {s.firePerHour > 0 && (
                <>
                  <dt className="font-semibold text-down">Risque d’incendie</dt>
                  <dd className="text-right font-semibold text-down">{(s.firePerHour * 2400).toFixed(1)} %/j</dd>
                </>
              )}
              <dt className="text-ink-2">Total miné</dt>
              <dd className="text-right">{qty(rig.minedTotal)} {rig.pool?.symbol ?? ''}</dd>
              <dt className="col-span-2 mt-1 text-xs text-ink-2">
                {Object.entries(s.hashrates).filter(([, v]) => (v ?? 0) > 0).map(([a, v]) => `${ALGO_LABEL[a]} ${hash(v ?? 0)}`).join(' · ')}
              </dt>
              <dd className="col-span-2 mt-2">
                <button className="text-sm font-semibold text-down underline disabled:opacity-40" disabled={rig.running} onClick={dismantle}>
                  Démonter la rig (les pièces retournent à l’inventaire)
                </button>
              </dd>
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
