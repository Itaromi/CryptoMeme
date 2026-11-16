'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { price } from '@/lib/format';
import { ALGO_LABEL, hash, POOL_TYPE } from '@/lib/mining';

interface Overview {
  networks: Array<{ symbol: string; algo: string; price: string; blockReward: string; npcHashrate: number; baseNpcHashrate: number; playerHashrate: number; halvingEveryDays: number; lastHalvingAt: string; totalMined: string }>;
  pools: Array<{ id: string; name: string; symbol: string; type: string; feeBps: number; scamRisk: number; active: boolean; rigs: number }>;
  rigs: number;
  running: number;
  items: Record<string, number>;
  incidents24h: Record<string, number>;
}

export function AdminMining({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'mining'], queryFn: () => api<Overview>('/admin/mining'), refetchInterval: 15_000 });
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (path: string, json: object) => {
    setMsg(null);
    try {
      await api(`/admin/mining/${path}`, { method: 'PATCH', json: { ...json, reason } });
      setMsg('Enregistré.');
      qc.invalidateQueries({ queryKey: ['admin', 'mining'] });
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  if (!data) return null;
  return (
    <div className="space-y-10">
      <dl className="num grid gap-6 sm:grid-cols-4">
        <div><dt className="text-xs uppercase tracking-wider text-ink-2">Rigs (en marche)</dt><dd className="text-2xl font-semibold">{data.running} / {data.rigs}</dd></div>
        <div><dt className="text-xs uppercase tracking-wider text-ink-2">Composants</dt><dd className="text-sm">OK {data.items.OK ?? 0} · panne {data.items.BROKEN ?? 0} · carbonisés {data.items.DESTROYED ?? 0}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-wider text-ink-2">Incidents 24 h</dt><dd className="text-sm">{Object.entries(data.incidents24h).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</dd></div>
      </dl>

      {isAdmin && <input className="field max-w-md" placeholder="Motif (obligatoire pour toute modification)" value={reason} onChange={(e) => setReason(e.target.value)} />}
      {msg && <p className="text-sm font-semibold">{msg}</p>}

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest">Réseaux</h3>
        <table className="num w-full text-left text-sm">
          <thead>
            <tr className="border-y-2 border-ink text-xs uppercase text-ink-2">
              <th className="py-2">Coin</th><th>Prix</th><th>Récompense / min</th><th>PNJ (base)</th><th>Joueurs</th><th>Halving (j)</th><th>Total miné joueurs</th>
            </tr>
          </thead>
          <tbody>
            {data.networks.map((n) => <NetworkRow key={n.symbol} n={n} disabled={!isAdmin || reason.length < 3} save={save} />)}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest">Pools</h3>
        <table className="num w-full text-left text-sm">
          <tbody>
            {data.pools.map((p) => (
              <tr key={p.id} className="border-b border-line">
                <td className="py-2 font-semibold">{p.name}</td>
                <td>{p.symbol} · {POOL_TYPE[p.type].label}</td>
                <td>frais {(p.feeBps / 100).toFixed(1)} %</td>
                <td>{p.scamRisk ? `fuite ${(p.scamRisk * 100).toFixed(0)} %/j` : ''}</td>
                <td>{p.rigs} rigs</td>
                <td className="text-right">
                  <button className="font-semibold underline disabled:opacity-40" disabled={!isAdmin || reason.length < 3} onClick={() => save(`pools/${p.id}`, { active: !p.active })}>
                    {p.active ? 'Désactiver' : 'Réactiver'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function NetworkRow({ n, disabled, save }: { n: Overview['networks'][0]; disabled: boolean; save: (p: string, j: object) => void }) {
  const [reward, setReward] = useState('');
  const [npc, setNpc] = useState('');
  const [halving, setHalving] = useState('');
  const changed = reward || npc || halving;
  return (
    <tr className="border-b border-line">
      <td className="py-2 font-semibold">{n.symbol} <span className="text-xs font-normal text-ink-2">{ALGO_LABEL[n.algo]}</span></td>
      <td>{price(n.price)}</td>
      <td><input className="field w-28 py-1 text-xs" placeholder={Number(n.blockReward).toPrecision(4)} value={reward} onChange={(e) => setReward(e.target.value)} disabled={disabled} /></td>
      <td>
        <input className="field w-28 py-1 text-xs" placeholder={n.baseNpcHashrate.toPrecision(4)} value={npc} onChange={(e) => setNpc(e.target.value)} disabled={disabled} />
        <span className="text-xs text-ink-2">actuel {hash(n.npcHashrate)}</span>
      </td>
      <td>{hash(n.playerHashrate)}</td>
      <td><input className="field w-16 py-1 text-xs" placeholder={String(n.halvingEveryDays)} value={halving} onChange={(e) => setHalving(e.target.value)} disabled={disabled} /></td>
      <td>{Number(n.totalMined).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</td>
      <td>
        <button
          className="font-semibold underline disabled:opacity-40"
          disabled={disabled || !changed}
          onClick={() =>
            save(`networks/${n.symbol}`, {
              ...(reward ? { blockReward: reward } : {}),
              ...(npc ? { baseNpcHashrate: Number(npc) } : {}),
              ...(halving ? { halvingEveryDays: Number(halving) } : {}),
            })
          }
        >
          OK
        </button>
      </td>
    </tr>
  );
}
