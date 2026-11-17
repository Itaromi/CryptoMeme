'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMe } from '@/lib/hooks';
import { useFormat } from '@/lib/format';
import { TIER_CLS, useAchievements } from '@/lib/meta';
import { Glyph } from '@/lib/icons';
import { useTexts } from '@/lib/texts';

export default function AchievementsPage() {
  const t = useTranslations('achievements');
  const f = useFormat();
  const texts = useTexts();
  const { data } = useAchievements();
  const { data: me } = useMe();
  const got = data?.items.filter((i) => i.unlockedAt).length ?? 0;

  return (
    <div className="rise">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6 border-b-2 border-ink pb-6">
        <div>
          <h1 className="display text-6xl font-extrabold">{t('title')}</h1>
          <p className="mt-2 max-w-xl text-ink-2">{t('intro')}</p>
        </div>
        {me && data && (
          <p className="num text-right">
            <span className="display block text-7xl font-extrabold">{got}<span className="text-ink-3">/{data.items.length}</span></span>
            <span className="text-ink-2">{t('unlocked', { count: got })}</span>
          </p>
        )}
      </div>

      <ul className="grid gap-x-10 gap-y-2 md:grid-cols-2">
        {data?.items.map((a) => {
          const done = !!a.unlockedAt;
          return (
            <li key={a.slug} className={`flex items-start gap-4 border-b border-line py-4 ${done ? '' : 'text-ink-2'}`}>
              <span className={`grid size-14 shrink-0 place-items-center border-2 text-3xl ${done ? `border-ink ${TIER_CLS[a.tier]}` : 'border-dashed border-ink-3 opacity-60'}`} aria-hidden>
                <Glyph name={a.icon} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <strong className={`text-lg ${done ? 'text-ink' : ''}`}>{a.secret ? t('secret.name') : texts.catalog(`achievements.${a.slug}.name`, a.name)}</strong>
                  <span className="text-xs font-semibold uppercase tracking-wider">{t(`tier.${a.tier}`)}</span>
                </p>
                <p className="text-sm">{a.secret ? t('secret.description') : texts.catalog(`achievements.${a.slug}.description`, a.description)}</p>
                <p className="mt-1 text-xs text-ink-3">
                  {a.unlockedAt ? t('unlockedOn', { date: f.date(a.unlockedAt) }) : t('notYet')}
                  {' · '}
                  {a.rarity ? t('rarity', { share: f.number(a.rarity, { style: 'percent', maximumFractionDigits: 1 }) }) : t('nobody')}
                  {a.rewardSlug && (
                    <>
                      {' · '}
                      <Link href="/shop" className="font-semibold text-ink underline">{t('reward')}</Link>
                    </>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {!me && (
        <p className="mt-8">
          {t.rich('signupCta', { link: (c) => <Link href="/register" className="font-semibold underline">{c}</Link> })}
        </p>
      )}
    </div>
  );
}
