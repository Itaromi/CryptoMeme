'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { countdown } from '@/lib/economy';
import { money } from '@/lib/format';
import { healthLabel, STATUS_LABEL, StockRow, useStocks } from '@/lib/stocks';
import { Glyph } from '@/lib/icons';

const ACTIONS = [
  { id: 'earnings', label: 'Publier les résultats maintenant' },
  { id: 'news-good', label: 'Bonne nouvelle' },
  { id: 'news-bad', label: 'Mauvaise nouvelle' },
  { id: 'takeover', label: 'Lancer une OPA' },
  { id: 'takeover-success', label: 'OPA : forcer la réussite' },
  { id: 'takeover-fail', label: 'OPA : forcer l’échec' },
  { id: 'split', label: 'Split' },
  { id: 'bankrupt', label: 'Faillite' },
  { id: 'relist', label: 'Réintroduire en bourse' },
] as const;

const DANGEROUS = new Set(['bankrupt', 'takeover-success']);

export function AdminStocks({ isAdmin }: { isAdmin: boolean }) {
  const { data } = useStocks();
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  const run = async (symbol: string, json: object) => {
    setMsg(null);
    try {
      const r = await api<{ detail?: string; headline?: string; text?: string }>(`/admin/stocks/${symbol}`, { method: 'POST', json: { ...json, reason } });
      setMsg(r.detail ?? r.headline ?? r.text ?? 'Fait.');
      qc.invalidateQueries({ queryKey: ['stocks'] });
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {isAdmin ? (
        <div className="flex flex-wrap items-center gap-3">
          <input className="field max-w-md" placeholder="Motif (obligatoire, tracé dans l’audit)" value={reason} onChange={(e) => setReason(e.target.value)} />
          {msg && <span className="text-sm font-semibold">{msg}</span>}
        </div>
      ) : (
        <p className="text-sm text-ink-2">Lecture seule : seuls les admins peuvent agir sur les sociétés.</p>
      )}
      <table className="num w-full text-left text-sm">
        <thead>
          <tr className="border-y-2 border-ink text-xs uppercase text-ink-2">
            <th className="py-2">Société</th><th>Statut</th><th>Cours</th><th>BPA / attendu</th><th>Santé</th><th>Résultats</th><th />
          </tr>
        </thead>
        <tbody>
          {data?.stocks.map((s) => <Row key={s.symbol} s={s} disabled={!isAdmin || reason.length < 3} run={run} />)}
        </tbody>
      </table>
    </div>
  );
}

function Row({ s, disabled, run }: { s: StockRow; disabled: boolean; run: (symbol: string, json: object) => Promise<void> }) {
  const [action, setAction] = useState<(typeof ACTIONS)[number]['id']>('earnings');
  const [ratio, setRatio] = useState('2');
  const [armed, setArmed] = useState(false);
  const c = s.company;
  const go = () => {
    if (DANGEROUS.has(action) && !armed) return setArmed(true);
    setArmed(false);
    run(s.symbol, { action, ...(action === 'split' ? { ratio: Number(ratio) } : {}) });
  };
  return (
    <tr className="border-b border-line">
      <td className="py-2 font-semibold"><Glyph name={s.emoji} color={s.color} /> {s.name} <span className="text-xs text-ink-2">{s.symbol}</span></td>
      <td>{STATUS_LABEL[c.status]}</td>
      <td>{money(s.price)}</td>
      <td>{c.eps.toFixed(2)} / {c.consensus.toFixed(2)}</td>
      <td className={healthLabel(c.health).cls}>{(c.health * 100).toFixed(0)} %</td>
      <td>{countdown(c.nextEarningsAt)}</td>
      <td className="space-x-2 text-right whitespace-nowrap">
        <select className="field inline-block w-auto py-0.5 text-xs" value={action} onChange={(e) => { setAction(e.target.value as typeof action); setArmed(false); }} disabled={disabled}>
          {ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        {action === 'split' && <input className="field inline-block w-14 py-0.5 text-xs" value={ratio} onChange={(e) => setRatio(e.target.value)} disabled={disabled} aria-label="Ratio du split" />}
        <button className={`font-semibold underline disabled:opacity-40 ${armed ? 'text-down' : ''}`} disabled={disabled} onClick={go}>
          {armed ? 'Confirmer ?' : 'Exécuter'}
        </button>
      </td>
    </tr>
  );
}
