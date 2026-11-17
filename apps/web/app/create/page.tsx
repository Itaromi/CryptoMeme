'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { useFormat } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { CreateForm } from '@/components/create/CreateForm';
import { MineRow } from '@/components/create/MineRow';
import type { CreationConfig, Kind, MyCreation } from '@/components/create/types';

const KINDS: readonly Kind[] = ['CRYPTO', 'COMPANY', 'POOL'];

export default function CreatePage() {
  const t = useTranslations('create');
  const f = useFormat();
  const { data: me } = useMe();
  const { data: cfg } = useQuery({ queryKey: queryKeys.creations.config, queryFn: () => api<CreationConfig>('/creations/config') });
  const { data: mine } = useQuery({
    queryKey: queryKeys.creations.mine,
    queryFn: () => api<MyCreation[]>('/creations/mine'),
    enabled: !!me,
    refetchInterval: 30_000,
  });
  const [kind, setKind] = useState<Kind>('CRYPTO');
  const b = (c: React.ReactNode) => <strong>{c}</strong>;

  return (
    <div className="rise">
      <h1 className="display text-[clamp(3rem,8vw,6.5rem)] font-extrabold">{t('title')}</h1>
      <p className="mt-2 max-w-3xl text-lg text-ink-2">{t('intro')}</p>
      {cfg && (
        <ul className="mt-4 grid max-w-4xl gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <li>{t.rich('rules.locked', { b })}</li>
          <li>{t.rich('rules.share', { b, share: f.number(cfg.costs.creatorShare, { style: 'percent' }), days: cfg.costs.vestDays })}</li>
          <li>{t.rich('rules.royalties', { b, share: f.number(cfg.costs.royaltyShare, { style: 'percent', maximumFractionDigits: 0 }) })}</li>
          <li>{t.rich('rules.refund', { b, max: cfg.costs.maxPerKind })}</li>
        </ul>
      )}

      <div className="mt-10 grid gap-12 lg:grid-cols-[1.2fr_1fr]">
        <section>
          <div className="mb-6 flex flex-wrap gap-1 text-sm font-semibold" role="tablist">
            {KINDS.map((k) => (
              <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={`px-3 py-1.5 ${kind === k ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}>
                {t(`tabs.${k}.label`)}
              </button>
            ))}
          </div>
          <p className="mb-6 max-w-xl text-ink-2">{t(`tabs.${kind}.pitch`)}</p>
          {cfg &&
            (me ? (
              <CreateForm key={kind} kind={kind} cfg={cfg} />
            ) : (
              <p>{t.rich('loginCta', { link: (c) => <Link href="/login" className="font-semibold underline">{c}</Link> })}</p>
            ))}
        </section>

        <section>
          <h2 className="mb-4 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">{t('mine.title')}</h2>
          {!mine?.length ? (
            <p className="text-ink-2">{t('mine.empty')}</p>
          ) : (
            <ul className="space-y-6">
              {mine.map((c) => (
                <MineRow key={c.id} c={c} cfg={cfg} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
