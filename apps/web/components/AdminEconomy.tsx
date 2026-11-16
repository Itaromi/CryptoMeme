'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { BankView, MOOD_STYLE, useEvents } from '@/lib/economy';
import { money } from '@/lib/format';

interface EventTypeRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  mood: 'POSITIVE' | 'NEGATIVE' | 'MARKET';
  ratePerDay: number;
  cooldownHours: number;
  noticeMinutes: number;
  durationMinutes: number;
  params: Record<string, unknown>;
  enabled: boolean;
  fired: number;
}

export function AdminEconomy({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const { data: types } = useQuery({ queryKey: ['admin', 'event-types'], queryFn: () => api<EventTypeRow[]>('/admin/economy/event-types') });
  const { data: banks } = useQuery({ queryKey: ['admin', 'banks'], queryFn: () => api<(BankView & { available: boolean })[]>('/admin/economy/banks') });
  const { data: feed } = useEvents();
  const disabled = !isAdmin || reason.length < 3;

  const run = async (path: string, method: 'POST' | 'PATCH', json: object) => {
    setMsg(null);
    try {
      await api(path, { method, json: { ...json, reason } });
      setMsg('Fait.');
      qc.invalidateQueries({ queryKey: ['admin'] });
      qc.invalidateQueries({ queryKey: ['events-feed'] });
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div className="space-y-10">
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-3">
          <input className="field max-w-md" placeholder="Motif (obligatoire, tracé dans l’audit)" value={reason} onChange={(e) => setReason(e.target.value)} />
          {msg && <span className="text-sm font-semibold">{msg}</span>}
        </div>
      )}

      {!!(feed?.upcoming.length || feed?.active.length) && (
        <section>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-widest">En attente / en cours</h3>
          <ul className="space-y-1 text-sm">
            {[...(feed?.upcoming ?? []), ...(feed?.active ?? [])].map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-4 border-b border-line py-1.5">
                <span><strong>{e.title}</strong> <span className="text-ink-2">{e.status === 'SCHEDULED' ? `le ${new Date(e.startsAt).toLocaleString('fr-FR')}` : 'en cours'}</span></span>
                <button className="font-semibold text-down underline disabled:opacity-40" disabled={disabled} onClick={() => run(`/admin/economy/events/${e.id}/cancel`, 'POST', {})}>Annuler</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest">Types d’événements</h3>
        <table className="num w-full text-left text-sm">
          <thead>
            <tr className="border-y-2 border-ink text-xs uppercase text-ink-2">
              <th className="py-2">Événement</th><th>Fréquence / jour</th><th>Cooldown (h)</th><th>Préavis (min)</th><th>Déclenchés</th><th />
            </tr>
          </thead>
          <tbody>
            {types?.map((t) => <TypeRow key={t.id} t={t} disabled={disabled} run={run} banks={banks ?? []} />)}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest">Banques</h3>
        <table className="num w-full text-left text-sm">
          <thead>
            <tr className="border-y-2 border-ink text-xs uppercase text-ink-2">
              <th className="py-2">Banque</th><th>Abonnement</th><th>Trading</th><th>Intérêts/mois</th><th>Faillite/jour</th><th />
            </tr>
          </thead>
          <tbody>
            {banks?.map((b) => <BankRow key={b.id} b={b} disabled={disabled} run={run} />)}
          </tbody>
        </table>
      </section>
    </div>
  );
}

type Run = (path: string, method: 'POST' | 'PATCH', json: object) => Promise<void>;

function TypeRow({ t, disabled, run, banks }: { t: EventTypeRow; disabled: boolean; run: Run; banks: BankView[] }) {
  const [rate, setRate] = useState('');
  const [cool, setCool] = useState('');
  const [notice, setNotice] = useState('');
  const [bankId, setBankId] = useState('');
  const changed = rate || cool || notice;
  const needsBank = t.slug === 'bank-run' || t.slug === 'bank-hack';
  return (
    <tr className={`border-b border-line ${t.enabled ? '' : 'text-ink-3'}`}>
      <td className="py-2 pr-2">
        <span className={`mr-2 inline-block size-2.5 border border-ink ${MOOD_STYLE[t.mood].bg}`} aria-hidden />
        <strong>{t.name}</strong>
        {t.durationMinutes > 0 && <span className="ml-1 text-xs text-ink-2">({t.durationMinutes / 60} h)</span>}
      </td>
      <td><input className="field w-20 py-1 text-xs" placeholder={String(t.ratePerDay)} value={rate} onChange={(e) => setRate(e.target.value)} disabled={disabled} /></td>
      <td><input className="field w-16 py-1 text-xs" placeholder={String(t.cooldownHours)} value={cool} onChange={(e) => setCool(e.target.value)} disabled={disabled} /></td>
      <td><input className="field w-16 py-1 text-xs" placeholder={String(t.noticeMinutes)} value={notice} onChange={(e) => setNotice(e.target.value)} disabled={disabled} /></td>
      <td>{t.fired}</td>
      <td className="space-x-3 text-right whitespace-nowrap">
        {changed && (
          <button
            className="font-semibold underline disabled:opacity-40"
            disabled={disabled}
            onClick={() =>
              run(`/admin/economy/event-types/${t.id}`, 'PATCH', {
                ...(rate ? { ratePerDay: Number(rate) } : {}),
                ...(cool ? { cooldownHours: Number(cool) } : {}),
                ...(notice ? { noticeMinutes: Number(notice) } : {}),
              })
            }
          >
            Enregistrer
          </button>
        )}
        <button className="underline disabled:opacity-40" disabled={disabled} onClick={() => run(`/admin/economy/event-types/${t.id}`, 'PATCH', { enabled: !t.enabled })}>
          {t.enabled ? 'Désactiver' : 'Activer'}
        </button>
        {needsBank && (
          <select className="field inline-block w-auto py-0.5 text-xs" value={bankId} onChange={(e) => setBankId(e.target.value)} disabled={disabled}>
            <option value="">{t.slug === 'bank-hack' ? 'Banque au hasard' : 'Choisir la banque'}</option>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <button
          className="font-semibold underline disabled:opacity-40"
          disabled={disabled || (t.slug === 'bank-run' && !bankId)}
          onClick={() => run('/admin/economy/trigger', 'POST', { typeId: t.id, immediate: false, params: bankId ? { bankId } : {} })}
        >
          Déclencher
        </button>
        <button
          className="font-semibold text-down underline disabled:opacity-40"
          disabled={disabled || (t.slug === 'bank-run' && !bankId)}
          onClick={() => run('/admin/economy/trigger', 'POST', { typeId: t.id, immediate: true, params: bankId ? { bankId } : {} })}
          title="Sans préavis"
        >
          Maintenant
        </button>
      </td>
    </tr>
  );
}

function BankRow({ b, disabled, run }: { b: BankView & { available: boolean }; disabled: boolean; run: Run }) {
  const [fee, setFee] = useState('');
  const [bps, setBps] = useState('');
  const [interest, setInterest] = useState('');
  const [fail, setFail] = useState('');
  const changed = fee || bps || interest || fail;
  return (
    <tr className="border-b border-line">
      <td className="py-2 font-semibold"><span className="mr-2 inline-block size-2.5" style={{ background: b.color }} aria-hidden />{b.name}</td>
      <td><input className="field w-24 py-1 text-xs" placeholder={money(b.monthlyFee)} value={fee} onChange={(e) => setFee(e.target.value)} disabled={disabled} /></td>
      <td><input className="field w-16 py-1 text-xs" placeholder={`${b.tradingFeeBps} bps`} value={bps} onChange={(e) => setBps(e.target.value)} disabled={disabled} /></td>
      <td><input className="field w-16 py-1 text-xs" placeholder={`${b.interestMonthly} %`} value={interest} onChange={(e) => setInterest(e.target.value)} disabled={disabled} /></td>
      <td><input className="field w-20 py-1 text-xs" placeholder={String(b.failRiskPerDay)} value={fail} onChange={(e) => setFail(e.target.value)} disabled={disabled} /></td>
      <td className="space-x-3 text-right">
        {changed && (
          <button
            className="font-semibold underline disabled:opacity-40"
            disabled={disabled}
            onClick={() =>
              run(`/admin/economy/banks/${b.id}`, 'PATCH', {
                ...(fee ? { monthlyFee: fee } : {}),
                ...(bps ? { tradingFeeBps: Number(bps) } : {}),
                ...(interest ? { interestMonthly: Number(interest) } : {}),
                ...(fail ? { failRiskPerDay: Number(fail) } : {}),
              })
            }
          >
            Enregistrer
          </button>
        )}
        {!b.isDefault && (
          <button className="underline disabled:opacity-40" disabled={disabled} onClick={() => run(`/admin/economy/banks/${b.id}`, 'PATCH', { available: !b.available })}>
            {b.available ? 'Fermer aux nouveaux' : 'Rouvrir'}
          </button>
        )}
      </td>
    </tr>
  );
}
