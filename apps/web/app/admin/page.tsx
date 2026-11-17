'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMe } from '@/lib/hooks';
import { Overview } from '@/components/admin/Overview';
import { Users } from '@/components/admin/Users';
import { AdminCreations } from '@/components/admin/AdminCreations';
import { Assets } from '@/components/admin/Assets';
import { AdminStocks } from '@/components/admin/AdminStocks';
import { AdminMining } from '@/components/admin/AdminMining';
import { AdminEconomy } from '@/components/admin/AdminEconomy';
import { Seasons } from '@/components/admin/Seasons';
import { Audit } from '@/components/admin/Audit';

const TABS = ['overview', 'users', 'creations', 'assets', 'stocks', 'mining', 'economy', 'seasons', 'audit'] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const t = useTranslations('admin');
  const { data: me, isLoading } = useMe();
  const [tab, setTab] = useState<Tab>('overview');
  if (isLoading) return null;
  if (!me || (me.role !== 'ADMIN' && me.role !== 'MODERATOR')) return <p className="display text-4xl">{t('restricted')}</p>;
  const isAdmin = me.role === 'ADMIN';
  return (
    <div className="rise">
      <h1 className="display mb-6 text-6xl font-extrabold">{t('title')}</h1>
      <div className="mb-8 flex flex-wrap gap-1 border-b-2 border-ink text-sm font-semibold" role="tablist">
        {TABS.map((id) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`px-4 py-2 ${tab === id ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}>
            {t(`tabs.${id}`)}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'users' && <Users isAdmin={isAdmin} />}
      {tab === 'assets' && <Assets isAdmin={isAdmin} />}
      {tab === 'creations' && <AdminCreations />}
      {tab === 'stocks' && <AdminStocks isAdmin={isAdmin} />}
      {tab === 'mining' && <AdminMining isAdmin={isAdmin} />}
      {tab === 'economy' && <AdminEconomy isAdmin={isAdmin} />}
      {tab === 'seasons' && <Seasons isAdmin={isAdmin} />}
      {tab === 'audit' && <Audit />}
    </div>
  );
}
