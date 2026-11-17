'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { ago, money, qty } from '@/lib/format';
import { Farm, Item, KIND_SHORT, modelSpecs, useFarm, usePools, watts } from '@/lib/mining';
import { MiningNav } from '@/components/mining/MiningNav';
import { RigBuilder } from '@/components/mining/RigBuilder';
import { RigRow } from '@/components/mining/RigRow';
import { Lightning } from '@phosphor-icons/react';

const LOG_STYLE: Record<string, string> = {
  FIRE: 'font-bold text-down',
  BREAK: 'text-down',
  SCAM: 'font-bold text-down',
  POWER: 'font-semibold text-down',
  BLOCK: 'font-bold text-up',
  PAYOUT: 'text-up',
};

export default function MiningPage() {
  const { data: me, isLoading } = useMe();
  const { data: farm } = useFarm(!!me);
  const { data: pools } = usePools();
  const [building, setBuilding] = useState<string | null>(null);

  if (isLoading) return null;
  if (!me)
    return (
      <p className="display text-4xl">
        <Link href="/login" className="underline">Connecte-toi</Link> pour monter ta ferme de minage.
      </p>
    );
  if (!farm) return <div className="h-96 animate-pulse bg-paper-2" />;

  const s = farm.summary;
  const net = s.usdPerDay - s.elecPerDay;
  const looseRacks = farm.inventory.filter((i) => i.model.kind === 'RACK');

  return (
    <div className="rise">
      <h1 className="display mb-2 text-6xl font-extrabold">Ferme de minage</h1>
      <p className="mb-6 max-w-2xl text-lg text-ink-2">Achète du matos, monte des rigs dans tes racks, branche-les sur un pool. Surveille la température : le feu ne prévient pas.</p>
      <MiningNav />

      {farm.powerCut && (
        <p className="mb-6 border-2 border-down bg-down-bg p-4 font-semibold">
          <Lightning weight="fill" className="mr-1 inline align-[-0.15em]" />Coupure de courant : tu n’avais plus de cash pour payer l’électricité. Rentre du cash (vends des coins) puis redémarre tes rigs.
        </p>
      )}

      <dl className="num mb-12 grid grid-cols-2 gap-x-10 gap-y-5 border-b-2 border-ink pb-8 md:grid-cols-5">
        <Stat label="Rigs en marche" value={`${s.running} / ${s.rigs}`} />
        <Stat label="Revenu estimé" value={`${money(s.usdPerDay)}/j`} />
        <Stat label="Électricité" value={`−${money(s.elecPerDay)}/j`} />
        <Stat label="Bénéfice net" value={`${money(net)}/j`} cls={net >= 0 ? 'text-up' : 'text-down'} big />
        <Stat label="Valeur du matériel" value={money(farm.hardwareValue)} />
      </dl>

      <div className="grid gap-12 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-12">
          {farm.facilities.map((f) => (
            <section key={f.id}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-2">
                <div>
                  <h2 className="display text-3xl font-bold">{f.name}</h2>
                  <p className="text-sm text-ink-2">
                    {f.type.name} · {f.type.elecPrice.toLocaleString('fr-FR')} $/kWh · {f.type.ambientTemp} °C ambiant · {f.racks.length}/{f.type.rackSlots} racks
                  </p>
                </div>
                <PowerBar used={f.powerUsed} max={f.type.maxPowerKw * 1000} />
              </div>
              {f.racks.length === 0 && (
                <p className="py-4 text-ink-2">Aucun rack ici. Installe un rack depuis ton inventaire, ou <Link href="/mining/shop?kind=RACK" className="font-semibold text-ink underline">achètes-en un</Link>.</p>
              )}
              {f.racks.map((rack) => {
                const free = (rack.model.rackSlots ?? 1) - rack.rigs.length;
                return (
                  <div key={rack.id} className="mb-6">
                    <div className="flex items-center justify-between py-2 text-sm">
                      <span className="font-semibold uppercase tracking-wider">
                        {rack.model.brand} {rack.model.name} <span className="font-normal normal-case tracking-normal text-ink-2">· {rack.rigs.length}/{rack.model.rackSlots} rigs · flux d’air ×{rack.model.airflow}</span>
                      </span>
                      {rack.rigs.length === 0 && <UninstallRack id={rack.id} />}
                    </div>
                    {rack.rigs.map((r) => <RigRow key={r.id} rig={r} pools={pools} />)}
                    {free > 0 &&
                      (building === rack.id ? (
                        <div className="mt-3"><RigBuilder rackId={rack.id} inventory={farm.inventory} onDone={() => setBuilding(null)} /></div>
                      ) : (
                        <button className="mt-2 w-full border-2 border-dashed border-ink-3 py-3 text-sm font-semibold text-ink-2 hover:border-ink hover:text-ink" onClick={() => setBuilding(rack.id)}>
                          + Monter une rig ({free} emplacement{free > 1 ? 's' : ''} libre{free > 1 ? 's' : ''})
                        </button>
                      ))}
                  </div>
                );
              })}
            </section>
          ))}
          <Link href="/mining/shop?tab=facilities" className="btn bg-paper">Acheter un nouveau local</Link>

          <Inventory farm={farm} looseRacks={looseRacks} />
        </div>

        <aside className="space-y-8">
          {farm.pending.length > 0 && (
            <section>
              <h2 className="mb-2 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">En attente (pools louches)</h2>
              <ul className="num space-y-1 text-sm">
                {farm.pending.map((p) => (
                  <li key={p.pool} className="flex justify-between"><span>{p.pool}</span><span className="font-semibold">{qty(p.amount)} {p.symbol}</span></li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-ink-3">Versé toutes les 6 h. En théorie.</p>
            </section>
          )}
          {Object.keys(s.federations).length > 0 && (
            <section>
              <h2 className="mb-2 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Fédérations</h2>
              <ul className="space-y-1 text-sm">
                {Object.entries(s.federations).map(([fed, n]) => (
                  <li key={fed} className="flex justify-between">
                    <span>{fed}</span>
                    <span className={n >= 3 ? 'font-semibold text-up' : 'text-ink-2'}>{n}/3 pools {n >= 3 ? '· −1 % de frais' : ''}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h2 className="mb-2 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Journal de la ferme</h2>
            <ul className="divide-y divide-line">
              {farm.logs.map((l, i) => (
                <li key={i} className="py-2 text-sm leading-snug">
                  <span className={LOG_STYLE[l.type] ?? ''}>{l.message}</span>
                  <span className="block text-xs text-ink-3">{ago(l.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, cls = '', big }: { label: string; value: string; cls?: string; big?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink-2">{label}</dt>
      <dd className={`font-semibold ${big ? 'display text-3xl' : 'text-xl'} ${cls}`}>{value}</dd>
    </div>
  );
}

function PowerBar({ used, max }: { used: number; max: number }) {
  const r = max ? used / max : 0;
  return (
    <div className="num w-56 text-xs">
      <div className="flex justify-between">
        <span className="text-ink-2">Puissance</span>
        <span className={r > 0.9 ? 'font-semibold text-down' : ''}>{watts(used)} / {watts(max)}</span>
      </div>
      <div className="mt-1 h-2 bg-paper-2">
        <div className={`h-full ${r > 0.9 ? 'bg-down' : 'bg-ink'}`} style={{ width: `${Math.min(100, r * 100)}%` }} />
      </div>
    </div>
  );
}

function UninstallRack({ id }: { id: string }) {
  const qc = useQueryClient();
  return (
    <button
      className="text-xs text-ink-2 underline hover:text-ink"
      onClick={async () => {
        await api(`/mining/items/${id}/install`, { method: 'POST', json: { facilityId: null } });
        qc.invalidateQueries({ queryKey: ['farm'] });
      }}
    >
      Retirer le rack
    </button>
  );
}

function Inventory({ farm, looseRacks }: { farm: Farm; looseRacks: Item[] }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const act = async (path: string, json?: object) => {
    setError(null);
    try {
      await api(path, { method: 'POST', json });
      qc.invalidateQueries({ queryKey: ['farm'] });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section>
      <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Inventaire ({farm.inventory.length})</h2>
      {error && <p className="mb-2 text-sm text-down">{error}</p>}
      {farm.inventory.length === 0 ? (
        <p className="text-ink-2">Rien en stock. <Link href="/mining/shop" className="font-semibold text-ink underline">La boutique est par là.</Link></p>
      ) : (
        <table className="num w-full text-left text-sm">
          <tbody>
            {farm.inventory.map((i) => (
              <tr key={i.id} className="border-b border-line">
                <td className="w-20 py-2 text-xs text-ink-2">{KIND_SHORT[i.model.kind]}</td>
                <td className="py-2">
                  <span className={`font-semibold ${i.status !== 'OK' ? 'text-down' : ''}`}>{i.model.brand} {i.model.name}</span>
                  {i.status !== 'OK' && <span className="ml-2 text-xs font-semibold text-down">{i.status === 'BROKEN' ? 'EN PANNE' : 'CARBONISÉ'}</span>}
                  <span className="block text-xs text-ink-2">{modelSpecs(i.model)} · usure {Math.round(i.wear * 100)} %</span>
                </td>
                <td className="py-2 text-right">
                  <span className="flex flex-wrap justify-end gap-3">
                    {i.model.kind === 'RACK' && looseRacks.includes(i) && i.status === 'OK' && (
                      <select
                        className="field w-auto py-1 text-xs"
                        value=""
                        onChange={(e) => e.target.value && act(`/mining/items/${i.id}/install`, { facilityId: e.target.value })}
                      >
                        <option value="">Installer dans…</option>
                        {farm.facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    )}
                    {i.status === 'BROKEN' && <button className="font-semibold underline" onClick={() => act(`/mining/items/${i.id}/repair`)}>Réparer ({money(i.repairCost)})</button>}
                    <button className="text-ink-2 underline hover:text-ink" onClick={() => act(`/mining/items/${i.id}/sell`)}>
                      {i.status === 'DESTROYED' ? 'Jeter' : `Revendre ${money(i.resale)}`}
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
