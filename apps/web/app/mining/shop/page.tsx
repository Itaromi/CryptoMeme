'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { money } from '@/lib/format';
import { ALGO_LABEL, hash, Kind, KIND_LABEL, Model, useFarm, watts } from '@/lib/mining';
import { MiningNav } from '@/components/mining/MiningNav';

const KINDS: Kind[] = ['GPU', 'CPU', 'ASIC', 'MOTHERBOARD', 'PSU', 'COOLING', 'RACK'];
const SORTS = [
  { id: 'price', label: 'Prix ↑' },
  { id: '-price', label: 'Prix ↓' },
  { id: 'perDollar', label: 'Rentabilité / $' },
  { id: 'perWatt', label: 'Rentabilité / W' },
];

export default function ShopPage() {
  return (
    <Suspense>
      <Shop />
    </Suspense>
  );
}

function Shop() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Kind | 'FACILITIES'>(params.get('tab') === 'facilities' ? 'FACILITIES' : ((params.get('kind') as Kind) ?? 'GPU'));
  const [sort, setSort] = useState('price');
  const [algo, setAlgo] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data: me } = useMe();
  const { data: farm } = useFarm(!!me);
  const mines = tab === 'GPU' || tab === 'CPU' || tab === 'ASIC';

  const { data } = useQuery({
    queryKey: ['catalog', tab, sort, algo, q, page],
    queryFn: () => api<{ total: number; items: Model[] }>(`/mining/catalog?kind=${tab}&sort=${sort}&algo=${algo}&q=${encodeURIComponent(q)}&page=${page}`),
    enabled: tab !== 'FACILITIES',
    placeholderData: (prev) => prev,
  });

  return (
    <div className="rise">
      <h1 className="display mb-6 text-6xl font-extrabold">Boutique matos</h1>
      <MiningNav />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1 text-sm font-semibold" role="tablist">
          {[...KINDS, 'FACILITIES' as const].map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => { setTab(k); setPage(1); }}
              className={`px-3 py-1.5 ${tab === k ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}
            >
              {k === 'FACILITIES' ? 'Locaux' : KIND_LABEL[k]}
            </button>
          ))}
        </div>
        {farm && <p className="num text-sm">Cash dispo : <strong>{money(farm.cash)}</strong></p>}
      </div>

      {tab === 'FACILITIES' ? (
        <Facilities />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <input className="field max-w-xs py-1.5" placeholder="Rechercher un modèle…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            {mines && (
              <select className="field w-auto py-1.5" value={algo} onChange={(e) => setAlgo(e.target.value)}>
                <option value="">Tous algos</option>
                {Object.entries(ALGO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            )}
            <div className="flex gap-1 text-sm">
              {SORTS.filter((s) => mines || s.id.includes('price')).map((s) => (
                <button key={s.id} onClick={() => setSort(s.id)} className={`px-3 py-1.5 ${sort === s.id ? 'bg-ink text-paper' : 'border border-line hover:bg-paper-2'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <p className="mb-2 text-sm text-ink-2">{data?.total ?? 0} modèles</p>
          <div className="overflow-x-auto">
            <table className="num w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-y-2 border-ink text-xs uppercase tracking-wider text-ink-2">
                  <th className="py-2 pr-4">Modèle</th>
                  <th className="py-2 pr-4">{mines ? 'Hashrate' : 'Caractéristiques'}</th>
                  <th className="py-2 pr-4 text-right">Conso</th>
                  <th className="py-2 pr-4 text-right">Prix</th>
                  <th className="py-2 text-right" />
                </tr>
              </thead>
              <tbody>
                {data?.items.map((m) => <ModelRow key={m.id} m={m} algo={algo} cash={Number(farm?.cash ?? 0)} canBuy={!!me} />)}
              </tbody>
            </table>
          </div>
          {data && data.total > page * 40 && (
            <div className="mt-4 flex gap-4">
              {page > 1 && <button className="font-semibold underline" onClick={() => setPage(page - 1)}>← Précédents</button>}
              <button className="font-semibold underline" onClick={() => setPage(page + 1)}>Suivants →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ModelRow({ m, algo, cash, canBuy }: { m: Model; algo: string; cash: number; canBuy: boolean }) {
  const qc = useQueryClient();
  const [n, setN] = useState(1);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const total = Number(m.price) * n;
  // L'algo le plus rentable d'abord (les unités ne sont pas comparables d'un algo à l'autre)
  const algos = Object.entries(m.hashrates)
    .filter(([a, v]) => (v ?? 0) > 0 && (!algo || a === algo))
    .sort((a, b) => (a[0] === m.bestAlgo ? -1 : b[0] === m.bestAlgo ? 1 : 0));

  async function buy() {
    setBusy(true);
    setMsg(null);
    try {
      await api('/mining/buy', { method: 'POST', json: { modelId: m.id, quantity: n } });
      setMsg({ ok: true, t: 'Ajouté à l’inventaire' });
      qc.invalidateQueries({ queryKey: ['farm'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    } catch (e) {
      setMsg({ ok: false, t: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-line align-top hover:bg-paper-2">
      <td className="py-2.5 pr-4">
        <span className="block font-semibold">{m.brand} {m.name}</span>
        {m.description && <span className="block text-xs italic text-ink-2">{m.description}</span>}
      </td>
      <td className="py-2.5 pr-4">
        {m.kind === 'PSU' && `${watts(m.watts)} max · rendement ${Math.round((m.efficiency ?? 0) * 100)} %`}
        {m.kind === 'MOTHERBOARD' && `Socket ${m.socket} · ${m.gpuSlots} slot(s) GPU`}
        {m.kind === 'COOLING' && `Dissipe ${watts(m.coolingW ?? 0)}`}
        {m.kind === 'RACK' && `${m.rackSlots} rig(s) · flux d’air ×${m.airflow}`}
        {(m.kind === 'GPU' || m.kind === 'CPU' || m.kind === 'ASIC') && (
          <span className="flex flex-wrap gap-x-3">
            {algos.slice(0, algo ? 1 : 2).map(([a, v]) => (
              <span key={a}><strong>{hash(v ?? 0)}</strong> <span className="text-xs text-ink-2">{ALGO_LABEL[a]}</span></span>
            ))}
            {m.socket && <span className="text-xs text-ink-2">{m.socket}</span>}
            {!!m.usdPerDay && <span className="w-full text-xs text-ink-2">≈ {money(m.usdPerDay)}/j brut en {ALGO_LABEL[m.bestAlgo ?? '']}</span>}
            {m.kind === 'ASIC' && <span className="text-xs text-ink-2">refroidit {watts(m.coolingW ?? 0)}</span>}
          </span>
        )}
      </td>
      <td className="py-2.5 pr-4 text-right">{m.kind === 'PSU' || m.kind === 'RACK' ? '—' : watts(m.watts)}</td>
      <td className="py-2.5 pr-4 text-right font-semibold">{money(m.price)}</td>
      <td className="py-2.5 text-right">
        {canBuy && (
          <span className="inline-flex items-center gap-2">
            <input type="number" min={1} max={20} value={n} onChange={(e) => setN(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} className="field w-16 py-1 text-center" aria-label="Quantité" />
            <button className="btn bg-acid px-3 py-1 text-sm" disabled={busy || total > cash} onClick={buy}>
              {total > cash ? 'Trop cher' : `Acheter${n > 1 ? ` (${money(total)})` : ''}`}
            </button>
          </span>
        )}
        {msg && <span className={`mt-1 block text-xs ${msg.ok ? 'text-up' : 'text-down'}`}>{msg.t}</span>}
      </td>
    </tr>
  );
}

interface FacilityType {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: string;
  elecPrice: number;
  maxPowerKw: number;
  rackSlots: number;
  ambientTemp: number;
}

function Facilities() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: farm } = useFarm(!!me);
  const { data } = useQuery({ queryKey: ['facility-types'], queryFn: () => api<FacilityType[]>('/mining/facility-types') });
  const [msg, setMsg] = useState<Record<string, string>>({});
  return (
    <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
      {data?.map((f) => {
        const owned = farm?.facilities.filter((x) => x.type.id === f.id).length ?? 0;
        return (
          <article key={f.id} className="border-t-2 border-ink pt-4">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="display text-3xl font-bold">{f.name}</h3>
              <span className="num text-xl font-semibold">{Number(f.price) ? money(f.price) : 'Gratuit'}</span>
            </div>
            <p className="mt-1 text-ink-2">{f.description}</p>
            <dl className="num mt-3 grid grid-cols-4 gap-2 text-sm">
              <div><dt className="text-xs text-ink-2">Électricité</dt><dd className="font-semibold">{f.elecPrice} $/kWh</dd></div>
              <div><dt className="text-xs text-ink-2">Puissance</dt><dd className="font-semibold">{f.maxPowerKw} kW</dd></div>
              <div><dt className="text-xs text-ink-2">Racks</dt><dd className="font-semibold">{f.rackSlots}</dd></div>
              <div><dt className="text-xs text-ink-2">Ambiant</dt><dd className="font-semibold">{f.ambientTemp} °C</dd></div>
            </dl>
            {me && Number(f.price) > 0 && (
              <div className="mt-3 flex items-center gap-3">
                <button
                  className="btn bg-acid py-1.5 text-sm"
                  disabled={Number(farm?.cash ?? 0) < Number(f.price)}
                  onClick={async () => {
                    try {
                      await api('/mining/facilities', { method: 'POST', json: { typeId: f.id, name: '' } });
                      setMsg({ ...msg, [f.id]: 'Local acheté. Installe-y un rack depuis ta ferme.' });
                      qc.invalidateQueries({ queryKey: ['farm'] });
                    } catch (e) {
                      setMsg({ ...msg, [f.id]: (e as Error).message });
                    }
                  }}
                >
                  Acheter
                </button>
                {owned > 0 && <span className="text-sm text-ink-2">Tu en as {owned}</span>}
                {msg[f.id] && <span className="text-sm font-semibold">{msg[f.id]}</span>}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
