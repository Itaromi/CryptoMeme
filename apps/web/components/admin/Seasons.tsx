'use client';
import { useState } from 'react';
import { useQuery, type QueryKey } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useApiMutation } from '@/lib/mutation';
import { queryKeys } from '@/lib/queryKeys';
import { Feedback } from './Feedback';

interface SeasonRow {
  number: number;
  name: string;
  status: 'ACTIVE' | 'ENDED';
  startsAt: string;
  endsAt: string | null;
}

/** Clé vide : préfixe de toutes les requêtes. Une nouvelle saison change portefeuilles, classement, profils… */
const EVERYTHING: QueryKey = [];

/** Historique des saisons et passage à la suivante. */
export function Seasons({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('admin.seasons');
  const f = useFormat();
  const { data } = useQuery({ queryKey: queryKeys.seasons, queryFn: () => api<SeasonRow[]>('/seasons') });
  const [name, setName] = useState('');
  const [cash, setCash] = useState('10000');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const rollover = useApiMutation({
    mutationFn: () => api('/admin/seasons/rollover', { method: 'POST', json: { name, startingCash: cash, reason } }),
    invalidate: [EVERYTHING],
  });
  const active = data?.find((s) => s.status === 'ACTIVE');
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <ul className="divide-y divide-line">
        {data?.map((s) => (
          <li key={s.number} className="py-2">
            <span className="font-semibold">{s.name}</span>{' '}
            <span className="text-sm text-ink-2">{s.status === 'ACTIVE' ? t('running') : t('ended', { date: s.endsAt ? f.date(s.endsAt) : '—' })}</span>
          </li>
        ))}
      </ul>
      {isAdmin && active && (
        <div className="space-y-3 border-2 border-down p-5">
          <p className="font-bold">{t('rollover.title', { name: active.name })}</p>
          <p className="text-sm text-ink-2">{t('rollover.warning')}</p>
          <input className="field" placeholder={t('rollover.name')} aria-label={t('rollover.name')} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="field num" placeholder={t('rollover.cash')} aria-label={t('rollover.cash')} value={cash} onChange={(e) => setCash(e.target.value)} />
          <input className="field" placeholder={t('rollover.reason')} aria-label={t('rollover.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <input
            className="field"
            placeholder={t('rollover.confirm', { number: active.number })}
            aria-label={t('rollover.confirm', { number: active.number })}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <button
            className="btn bg-down text-paper"
            disabled={rollover.isPending || name.length < 3 || reason.length < 3 || confirm !== String(active.number)}
            onClick={() => rollover.mutate()}
          >
            {t('rollover.submit')}
          </button>
          <p>
            <Feedback m={rollover} success={t('rollover.done')} />
          </p>
        </div>
      )}
    </div>
  );
}
