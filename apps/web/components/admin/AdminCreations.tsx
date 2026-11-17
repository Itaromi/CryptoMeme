'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNow, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { type Format, useFormat } from '@/lib/format';
import { Glyph } from '@/lib/icons';
import { useApiMutation } from '@/lib/mutation';
import { queryKeys } from '@/lib/queryKeys';
import { Feedback } from './Feedback';

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
type Status = (typeof STATUSES)[number];

interface Row {
  id: string;
  kind: 'CRYPTO' | 'COMPANY' | 'POOL';
  status: Status;
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

/** Valeur d'un paramètre de création, quel que soit son type (nombre, texte, objet). */
function paramValue(v: unknown, f: Format): string {
  if (typeof v === 'number') return f.number(v, { maximumFractionDigits: 6 });
  if (typeof v === 'string') return v;
  return JSON.stringify(v) ?? '—';
}

/** File de modération des créations de joueurs (nom, symbole, description). */
export function AdminCreations() {
  const t = useTranslations('admin.creations');
  const [status, setStatus] = useState<Status>('PENDING');
  const { data } = useQuery({ queryKey: queryKeys.admin.creations(status), queryFn: () => api<Row[]>(`/admin/creations?status=${status}`) });
  return (
    <div className="space-y-6">
      <div className="flex gap-1 text-sm font-semibold">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 ${status === s ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}>
            {t(`status.${s}`)}
          </button>
        ))}
      </div>
      {!data?.length && <p className="text-ink-2">{t('empty')}</p>}
      <ul className="space-y-6">{data?.map((c) => <Item key={c.id} c={c} />)}</ul>
    </div>
  );
}

function Item({ c }: { c: Row }) {
  const t = useTranslations('admin.creations');
  const f = useFormat();
  const now = useNow({ updateInterval: 30_000 });
  const [reason, setReason] = useState('');
  const review = useApiMutation<'approve' | 'reject'>({
    mutationFn: (what) => api(`/admin/creations/${c.id}/${what}`, { method: 'POST', json: { reason } }),
    // toutes les files de modération et l'audit ; une création acceptée apparaît sur le marché, en bourse ou dans les pools
    invalidate: [queryKeys.admin.all, queryKeys.assets, queryKeys.stocks, queryKeys.mining.pools],
  });
  return (
    <li className="border-2 border-ink p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center text-3xl" style={{ background: `color-mix(in oklch, ${c.color} 35%, transparent)` }}>
            <Glyph name={c.emoji} color={c.color} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-2">
              {t('meta', { kind: t(`kind.${c.kind}`), username: c.username, ago: f.ago(c.createdAt, now) })}
            </p>
            <p className="text-xl font-bold">
              {c.name} {c.symbol && <span className="text-ink-2">({c.symbol})</span>}
            </p>
          </div>
        </div>
        <p className="num text-right text-sm">
          {t('fee', { amount: f.money(c.fee) })}
          <br />
          {t('deposit', { amount: f.money(c.deposit) })}
        </p>
      </div>
      <p className="mt-3">{c.description}</p>
      <p className="num mt-2 text-xs text-ink-2">
        {Object.entries(c.params)
          .map(([k, v]) => t('param', { name: k, value: paramValue(v, f) }))
          .join(' · ')}
      </p>
      {c.status === 'PENDING' ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input className="field max-w-sm py-1.5" placeholder={t('reason')} aria-label={t('reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn bg-acid py-1.5 text-sm" disabled={review.isPending || reason.length < 3} onClick={() => review.mutate('approve')}>
            {t('approve')}
          </button>
          <button className="btn bg-paper py-1.5 text-sm text-down" disabled={review.isPending || reason.length < 3} onClick={() => review.mutate('reject')}>
            {t('reject')}
          </button>
          <Feedback m={review} />
        </div>
      ) : (
        c.reviewNote && <p className="mt-2 text-sm text-ink-2">{t('note', { note: c.reviewNote })}</p>
      )}
    </li>
  );
}
