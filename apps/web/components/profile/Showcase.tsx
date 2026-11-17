'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { TIER_CLS, useAchievements } from '@/lib/meta';
import { useApiMutation } from '@/lib/mutation';
import { useTexts } from '@/lib/texts';
import { queryKeys } from '@/lib/queryKeys';
import { Glyph } from '@/lib/icons';
import type { Profile } from './types';

const MAX_FEATURED = 4;

/** Vitrine de succès (le joueur choisit jusqu’à 4 succès à afficher). */
export function Showcase({ data, isMe }: { data: Profile; isMe: boolean }) {
  const texts = useTexts();
  const errorMessage = texts.error;
  const t = useTranslations('profile.showcase');
  const tc = useTranslations('common.actions');
  const [editing, setEditing] = useState(false);
  const { data: all } = useAchievements();
  const a = data.achievements;
  const unlocked = all?.items.filter((i) => i.unlockedAt) ?? [];
  const [pick, setPick] = useState<string[]>([]);
  const save = useApiMutation({
    mutationFn: (showcase: string[]) => api('/me/look', { method: 'PATCH', json: { showcase } }),
    invalidate: [queryKeys.profile.one(data.username)],
    onSuccess: () => setEditing(false),
  });

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between border-b-2 border-ink pb-1">
        <h2 className="text-sm font-bold uppercase tracking-widest">{t('title', { count: a.count, total: a.total })}</h2>
        {isMe && !editing && unlocked.length > 0 && (
          <button
            className="text-sm font-semibold underline"
            onClick={() => {
              setPick(a.featured.map((f) => f.slug));
              setEditing(true);
            }}
          >
            {t('choose')}
          </button>
        )}
      </div>
      {editing ? (
        <div>
          <p className="mb-3 text-sm text-ink-2">{t('pickHint', { count: pick.length, max: MAX_FEATURED })}</p>
          <div className="flex flex-wrap gap-2">
            {unlocked.map((u) => {
              const on = pick.includes(u.slug);
              return (
                <button
                  key={u.slug}
                  aria-pressed={on}
                  onClick={() => setPick(on ? pick.filter((x) => x !== u.slug) : [...pick, u.slug].slice(-MAX_FEATURED))}
                  className={`border-2 border-ink px-2 py-1 text-sm ${on ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}
                >
                  <Glyph name={u.icon} /> {texts.catalog(`achievements.${u.slug}.name`, u.name)}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex gap-3">
            <button className="btn bg-acid py-1.5 text-sm" disabled={save.isPending} onClick={() => save.mutate(pick)}>
              {tc('save')}
            </button>
            <button className="text-sm underline" onClick={() => setEditing(false)}>
              {tc('cancel')}
            </button>
          </div>
          {save.isError && <p className="mt-2 text-sm text-down">{errorMessage(save.error)}</p>}
        </div>
      ) : !a.featured.length ? (
        <p className="text-ink-2">
          {isMe
            ? t.rich('emptyMine', { link: (c) => <Link href="/achievements" className="font-semibold text-ink underline">{c}</Link> })
            : t('empty')}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {a.featured.map((f) => (
            <li key={f.slug} className={`border-2 border-ink p-4 ${TIER_CLS[f.tier]}`}>
              <span className="block text-4xl" aria-hidden><Glyph name={f.icon} /></span>
              <p className="mt-2 font-bold">{texts.catalog(`achievements.${f.slug}.name`, f.name)}</p>
              <p className="text-sm opacity-80">{texts.catalog(`achievements.${f.slug}.description`, f.description)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
