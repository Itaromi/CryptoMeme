'use client';
import { useQuery } from '@tanstack/react-query';
import { useNow, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { Stat } from '@/components/ui/Stat';

/** Réponse de GET /admin/overview (montants en chaînes décimales). */
interface AdminOverview {
  season: { number: number; name: string; startsAt: string };
  users: number;
  players: number;
  totalCash: string;
  totalNetWorth: string;
  netCreation: string;
  trades24h: number;
  volume24h: string;
  fees24h: string;
  events24h: number;
}

/** Tableau de bord de l'économie : masse monétaire, activité des dernières 24 h. */
export function Overview() {
  const t = useTranslations('admin.overview');
  const f = useFormat();
  const now = useNow({ updateInterval: 30_000 });
  const { data } = useQuery({ queryKey: queryKeys.admin.overview, queryFn: () => api<AdminOverview>('/admin/overview'), refetchInterval: 15_000 });
  if (!data) return null;
  const items = [
    ['users', f.number(data.users)],
    ['players', f.number(data.players)],
    ['totalCash', f.money(data.totalCash)],
    ['totalNetWorth', f.money(data.totalNetWorth)],
    ['netCreation', f.money(data.netCreation)],
    ['trades24h', f.number(data.trades24h)],
    ['volume24h', f.money(data.volume24h)],
    ['fees24h', f.money(data.fees24h)],
    ['events24h', f.number(data.events24h)],
  ] as const;
  return (
    <div>
      <p className="mb-6 text-ink-2">{t('intro', { season: data.season.name, since: f.ago(data.season.startsAt, now) })}</p>
      <dl className="num grid gap-x-10 gap-y-6 sm:grid-cols-3">
        {items.map(([key, value]) => (
          <Stat key={key} label={t(`stats.${key}`)} size="lg">
            {value}
          </Stat>
        ))}
      </dl>
    </div>
  );
}
