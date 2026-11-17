'use client';
import { useQuery } from '@tanstack/react-query';
import { useNow, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';

interface AuditRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  payload: unknown;
  createdAt: string;
  actor: { username: string };
}

/** Journal des actions de l'équipe (50 dernières). */
export function Audit() {
  const t = useTranslations('admin.audit');
  const f = useFormat();
  const now = useNow({ updateInterval: 30_000 });
  const { data } = useQuery({ queryKey: queryKeys.admin.audit, queryFn: () => api<AuditRow[]>('/admin/audit') });
  if (!data?.length) return <p className="text-ink-2">{t('empty')}</p>;
  return (
    <table className="w-full text-left text-sm">
      <tbody>
        {data.map((a) => (
          <tr key={a.id} className="border-b border-line align-top">
            <td className="py-2 pr-4 text-ink-2">{f.ago(a.createdAt, now)}</td>
            <td className="py-2 pr-4 font-semibold">@{a.actor.username}</td>
            <td className="py-2 pr-4">{a.action}</td>
            <td className="py-2 pr-4 text-ink-2">
              {a.targetType} {a.targetId.slice(0, 10)}
            </td>
            <td className="py-2 pr-4">{a.reason}</td>
            <td className="num py-2 text-xs text-ink-3">{a.payload ? JSON.stringify(a.payload) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
