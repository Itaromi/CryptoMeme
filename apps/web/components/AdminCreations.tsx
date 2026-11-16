'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ago, money } from '@/lib/format';

interface Row {
  id: string;
  kind: 'CRYPTO' | 'COMPANY' | 'POOL';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  username: string;
  name: string;
  symbol: string | null;
  emoji: string;
  color: string;
  description: string;
  params: Record<string, unknown>;
  fee: string;
  deposit: string;
  reviewNote: string | null;
  createdAt: string;
}

const KIND = { CRYPTO: 'Crypto', COMPANY: 'Entreprise', POOL: 'Pool' } as const;

/** File de modération des créations de joueurs (nom, symbole, description). */
export function AdminCreations() {
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const { data } = useQuery({ queryKey: ['admin', 'creations', status], queryFn: () => api<Row[]>(`/admin/creations?status=${status}`) });
  return (
    <div className="space-y-6">
      <div className="flex gap-1 text-sm font-semibold">
        {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 ${status === s ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}>
            {s === 'PENDING' ? 'À modérer' : s === 'APPROVED' ? 'Acceptées' : 'Refusées'}
          </button>
        ))}
      </div>
      {!data?.length && <p className="text-ink-2">Rien ici.</p>}
      <ul className="space-y-6">
        {data?.map((c) => <Item key={c.id} c={c} />)}
      </ul>
    </div>
  );
}

function Item({ c }: { c: Row }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (what: 'approve' | 'reject') => {
    setMsg(null);
    try {
      await api(`/admin/creations/${c.id}/${what}`, { method: 'POST', json: { reason } });
      qc.invalidateQueries({ queryKey: ['admin', 'creations'] });
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <li className="border-2 border-ink p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center text-3xl" style={{ background: `color-mix(in oklch, ${c.color} 35%, transparent)` }}>{c.emoji}</span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-2">{KIND[c.kind]} · par @{c.username} · {ago(c.createdAt)}</p>
            <p className="text-xl font-bold">{c.name} {c.symbol && <span className="text-ink-2">({c.symbol})</span>}</p>
          </div>
        </div>
        <p className="num text-right text-sm">Frais {money(c.fee)}<br />Dépôt {money(c.deposit)}</p>
      </div>
      <p className="mt-3">{c.description}</p>
      <p className="num mt-2 text-xs text-ink-2">{Object.entries(c.params).map(([k, v]) => `${k} : ${v}`).join(' · ')}</p>
      {c.status === 'PENDING' ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input className="field max-w-sm py-1.5" placeholder="Motif (obligatoire, visible par le joueur si refus)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn bg-acid py-1.5 text-sm" disabled={reason.length < 3} onClick={() => act('approve')}>Accepter</button>
          <button className="btn bg-paper py-1.5 text-sm text-down" disabled={reason.length < 3} onClick={() => act('reject')}>Refuser et rembourser</button>
          {msg && <span className="text-sm font-semibold text-down">{msg}</span>}
        </div>
      ) : (
        c.reviewNote && <p className="mt-2 text-sm text-ink-2">Note : {c.reviewNote}</p>
      )}
    </li>
  );
}
