'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useEvents } from '@/lib/economy';
import { useFormat } from '@/lib/format';
import { useApiMutation } from '@/lib/mutation';
import { queryKeys } from '@/lib/queryKeys';
import { BankRow, type AdminBank, type EconomyAction, type EventTypeRow, type Run, TypeRow } from './EconomyRows';
import { Feedback } from './Feedback';

/** Événements de jeu (fréquences, déclenchement manuel) et réglages des banques. */
export function AdminEconomy({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('admin.economy');
  const tc = useTranslations('common.actions');
  const f = useFormat();
  const [reason, setReason] = useState('');
  const { data: types } = useQuery({ queryKey: queryKeys.admin.eventTypes, queryFn: () => api<EventTypeRow[]>('/admin/economy/event-types') });
  const { data: banks } = useQuery({ queryKey: queryKeys.admin.banks, queryFn: () => api<AdminBank[]>('/admin/economy/banks') });
  const { data: feed } = useEvents();
  const action = useApiMutation<EconomyAction>({
    mutationFn: ({ path, method, json }) => api(path, { method, json: { ...json, reason } }),
    // types, banques et audit côté admin ; fil d'événements et banques côté joueurs
    invalidate: [queryKeys.admin.all, queryKeys.gameEvents, queryKeys.banks],
  });
  const disabled = !isAdmin || reason.length < 3 || action.isPending;
  const run: Run = (a) => action.mutate(a);
  const pending = [...(feed?.upcoming ?? []), ...(feed?.active ?? [])];

  return (
    <div className="space-y-10">
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-3">
          <input className="field max-w-md" placeholder={t('reason')} aria-label={t('reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <Feedback m={action} />
        </div>
      )}

      {pending.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-widest">{t('pending.title')}</h3>
          <ul className="space-y-1 text-sm">
            {pending.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-4 border-b border-line py-1.5">
                <span>
                  <strong>{e.title}</strong>{' '}
                  <span className="text-ink-2">{e.status === 'SCHEDULED' ? t('pending.scheduled', { date: f.dateTime(e.startsAt) }) : t('pending.active')}</span>
                </span>
                <button
                  className="font-semibold text-down underline disabled:opacity-40"
                  disabled={disabled}
                  onClick={() => run({ path: `/admin/economy/events/${e.id}/cancel`, method: 'POST', json: {} })}
                >
                  {tc('cancel')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest">{t('types.title')}</h3>
        <table className="num w-full text-left text-sm">
          <thead>
            <tr className="border-y-2 border-ink text-xs uppercase text-ink-2">
              <th className="py-2">{t('types.columns.event')}</th>
              <th>{t('types.columns.rate')}</th>
              <th>{t('types.columns.cooldown')}</th>
              <th>{t('types.columns.notice')}</th>
              <th>{t('types.columns.fired')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {types?.map((type) => (
              <TypeRow key={type.id} type={type} disabled={disabled} run={run} banks={banks ?? []} />
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest">{t('banks.title')}</h3>
        <table className="num w-full text-left text-sm">
          <thead>
            <tr className="border-y-2 border-ink text-xs uppercase text-ink-2">
              <th className="py-2">{t('banks.columns.bank')}</th>
              <th>{t('banks.columns.fee')}</th>
              <th>{t('banks.columns.trading')}</th>
              <th>{t('banks.columns.interest')}</th>
              <th>{t('banks.columns.failRisk')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {banks?.map((b) => (
              <BankRow key={b.id} b={b} disabled={disabled} run={run} />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
