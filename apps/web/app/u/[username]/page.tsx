'use client';
import Link from 'next/link';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { useFormat } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { Glyph } from '@/lib/icons';
import { Avatar, Name } from '@/components/PlayerTag';
import { Bio } from '@/components/profile/Bio';
import { SeasonStats } from '@/components/profile/SeasonStats';
import { Showcase } from '@/components/profile/Showcase';
import type { Profile } from '@/components/profile/types';

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const t = useTranslations('profile');
  const f = useFormat();
  const { data, error } = useQuery({ queryKey: queryKeys.profile.one(username), queryFn: () => api<Profile>(`/players/${username}`) });
  const { data: me } = useMe();

  if (error) return <p className="display text-4xl">{t('notFound')}</p>;
  if (!data) return <div className="h-96 animate-pulse bg-paper-2" />;
  const s = data.stats;
  const isMe = me?.username === data.username;

  return (
    <div className="rise space-y-12">
      <header className="border-2 border-ink">
        <div className={`banner h-36 border-b-2 border-ink sm:h-48 ${data.look.banner ? `banner-${data.look.banner}` : ''}`} />
        <div className="grid gap-6 px-5 pb-6 sm:px-8 md:grid-cols-[1fr_auto] md:items-end">
          <div className="-mt-16 min-w-0">
            <Avatar look={data.look} size="lg" />
            <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-ink-2">
              {data.look.title && <span className="mr-2 bg-ink px-1.5 text-paper">{data.look.title}</span>}
              {t('joined', { date: f.date(data.joinedAt) })}
              {data.role !== 'PLAYER' && <span className="ml-2 bg-ink px-1.5 text-paper">{t(`role.${data.role}`)}</span>}
            </p>
            <h1 className="display break-words text-[clamp(2.75rem,8vw,6.5rem)] font-extrabold">
              <Name username={data.username} look={data.look} />
              {data.look.badges.map((b) => (
                <span key={b.name} title={b.name} className="ml-3 align-middle text-[0.5em]"><Glyph name={b.icon} /></span>
              ))}
            </h1>
            <Bio bio={data.bio} editable={isMe} username={data.username} />
            {isMe && <Link href="/shop" className="mt-2 inline-block text-sm font-semibold underline">{t('customize')}</Link>}
          </div>
          {s && (
            <div className="text-right">
              <p className="display text-8xl font-extrabold">#{s.rank}</p>
              <p className="text-ink-2">{t('rankOf', { players: s.players, season: data.season })}</p>
            </div>
          )}
        </div>
      </header>

      <Showcase data={data} isMe={isMe} />

      {s ? <SeasonStats s={s} /> : <p className="text-xl">{t('notPlaying')}</p>}
    </div>
  );
}
