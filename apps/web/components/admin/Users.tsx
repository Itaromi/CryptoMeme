'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNow, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useApiMutation } from '@/lib/mutation';
import { queryKeys } from '@/lib/queryKeys';
import type { Me } from '@/lib/hooks';
import { Feedback } from './Feedback';

interface UserRow {
  id: string;
  email: string;
  username: string;
  role: Me['role'];
  bannedAt: string | null;
  banReason: string | null;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  cash: string | null;
  netWorth: string | null;
}

interface UserDetail {
  ledger: Array<{ id: string; kind: string; assetId: string | null; delta: string; balanceAfter: string; memo: string | null; createdAt: string }>;
  sessions: Array<{ ip: string | null; userAgent: string | null; createdAt: string }>;
}

/** Actions de modération sur un compte (POST /admin/users/:id/<action>) */
type UserAction = { path: 'ban' | 'unban'; body: { reason: string } } | { path: 'cash'; body: { amount: string; reason: string } };

const CASH_RE = /^-?\d+(\.\d{1,2})?$/;

/** Recherche de comptes, bannissement et ajustements de cash. */
export function Users({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('admin.users');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: queryKeys.admin.users(q),
    queryFn: () => api<{ total: number; items: UserRow[] }>(`/admin/users?q=${encodeURIComponent(q)}`),
  });
  return (
    <div>
      <input className="field mb-4 max-w-md" placeholder={t('search')} aria-label={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="mb-2 text-sm text-ink-2">{t('total', { count: data?.total ?? 0 })}</p>
      <table className="num w-full text-left text-sm">
        <thead>
          <tr className="border-y-2 border-ink text-xs uppercase tracking-wider text-ink-2">
            <th className="py-2">{t('columns.player')}</th>
            <th className="py-2">{t('columns.email')}</th>
            <th className="py-2">{t('columns.role')}</th>
            <th className="py-2 text-right">{t('columns.netWorth')}</th>
            <th className="py-2 text-right">{t('columns.lastLogin')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.items.map((u) => (
            <UserLine key={u.id} u={u} open={open === u.id} toggle={() => setOpen(open === u.id ? null : u.id)} isAdmin={isAdmin} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserLine({ u, open, toggle, isAdmin }: { u: UserRow; open: boolean; toggle: () => void; isAdmin: boolean }) {
  const t = useTranslations('admin.users');
  const tc = useTranslations('common.actions');
  const f = useFormat();
  const now = useNow({ updateInterval: 30_000 });
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const detail = useQuery({
    queryKey: queryKeys.admin.user(u.id),
    queryFn: () => api<UserDetail>(`/admin/users/${u.id}`),
    enabled: open,
  });
  const act = useApiMutation<UserAction>({
    mutationFn: ({ path, body }) => api(`/admin/users/${u.id}/${path}`, { method: 'POST', json: body }),
    // liste, fiche, vue d'ensemble et audit ; le cash ajusté change aussi le classement
    invalidate: [queryKeys.admin.all, queryKeys.leaderboard.all],
    onSuccess: () => setAmount(''),
  });
  const fmt8 = (v: string) => f.number(v, { maximumFractionDigits: 8 });
  return (
    <>
      <tr className={`border-b border-line ${u.bannedAt ? 'text-ink-3 line-through' : ''}`}>
        <td className="py-2 font-semibold">@{u.username}</td>
        <td className="py-2">
          {u.email} {!u.emailVerified && <span className="text-xs text-ink-3">{t('unverified')}</span>}
        </td>
        <td className="py-2">{u.role}</td>
        <td className="py-2 text-right">{u.netWorth ? f.money(u.netWorth) : '—'}</td>
        <td className="py-2 text-right text-ink-2">{u.lastLoginAt ? f.ago(u.lastLoginAt, now) : '—'}</td>
        <td className="py-2 text-right">
          <button className="font-semibold underline" onClick={toggle}>
            {open ? tc('close') : t('manage')}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="border-b-2 border-ink bg-paper-2">
          <td colSpan={6} className="p-4">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <input className="field" placeholder={t('reason')} aria-label={t('reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  {u.bannedAt ? (
                    <button className="btn bg-paper py-1.5 text-sm" disabled={act.isPending || reason.length < 3} onClick={() => act.mutate({ path: 'unban', body: { reason } })}>
                      {t('unban')}
                    </button>
                  ) : (
                    <button className="btn bg-down py-1.5 text-sm text-paper" disabled={act.isPending || reason.length < 3} onClick={() => act.mutate({ path: 'ban', body: { reason } })}>
                      {t('ban')}
                    </button>
                  )}
                </div>
                {u.bannedAt && <p className="text-sm text-down">{t('banned', { reason: u.banReason ?? '' })}</p>}
                {isAdmin && (
                  <div className="flex gap-2">
                    <input className="field num" placeholder={t('cashPlaceholder')} aria-label={t('cashPlaceholder')} value={amount} onChange={(e) => setAmount(e.target.value)} />
                    <button
                      className="btn bg-acid py-1.5 text-sm"
                      disabled={act.isPending || reason.length < 5 || !CASH_RE.test(amount)}
                      onClick={() => act.mutate({ path: 'cash', body: { amount, reason } })}
                    >
                      {t('apply')}
                    </button>
                  </div>
                )}
                <p>
                  <Feedback m={act} />
                </p>
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-widest">{t('sessions')}</p>
                  <ul className="text-xs text-ink-2">
                    {detail.data?.sessions.slice(0, 6).map((s, i) => (
                      <li key={i}>
                        {f.ago(s.createdAt, now)} · {s.ip} · {s.userAgent?.slice(0, 60)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-widest">{t('ledger')}</p>
                <div className="max-h-72 overflow-y-auto">
                  <table className="num w-full text-xs">
                    <tbody>
                      {detail.data?.ledger.map((l) => (
                        <tr key={l.id} className="border-b border-line">
                          <td className="py-1 text-ink-2">{f.ago(l.createdAt, now)}</td>
                          <td className="py-1">
                            {l.kind}
                            {l.assetId ? ` ${t('assetEntry')}` : ''}
                          </td>
                          <td className={`py-1 text-right ${Number(l.delta) >= 0 ? 'text-up' : 'text-down'}`}>{fmt8(l.delta)}</td>
                          <td className="py-1 text-right">{fmt8(l.balanceAfter)}</td>
                          <td className="py-1 pl-2 text-ink-2">{l.memo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
