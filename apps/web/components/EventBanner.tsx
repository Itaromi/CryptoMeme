'use client';
import Link from 'next/link';
import { useNow, useTranslations } from 'next-intl';
import { useFormat } from '@/lib/format';
import { MOOD_STYLE, useEvents } from '@/lib/economy';
import { useTexts } from '@/lib/texts';

/** Bandeau « flash info » : événements annoncés (compte à rebours) et en cours. Titres et descriptions traduits depuis la clé de l'API (repli : textes stockés). */
export function EventBanner() {
  const t = useTranslations('events.banner');
  const f = useFormat();
  const texts = useTexts();
  const { data } = useEvents();
  const now = useNow({ updateInterval: 1000 });
  const upcoming = (data?.upcoming ?? []).map((e) => ({ e, label: t('flash'), time: t('in', { time: f.countdown(e.startsAt, now) }) }));
  const active = (data?.active ?? []).flatMap((e) =>
    e.endsAt && new Date(e.endsAt) > now ? [{ e, label: t('ongoing'), time: t('remaining', { time: f.countdown(e.endsAt, now) }) }] : [],
  );
  const items = [...upcoming, ...active];
  if (!items.length) return null;
  return (
    <aside aria-label={t('label')} className="-mt-8 mb-8 border-b-2 border-ink">
      {items.map(({ e, label, time }) => (
        <Link key={e.id} href="/events" className={`flex flex-wrap items-baseline gap-x-3 px-4 py-2 text-sm hover:underline sm:px-8 ${MOOD_STYLE[e.mood].bg}`}>
          <span className="bg-ink px-1.5 text-xs font-bold uppercase tracking-widest text-paper">{label}</span>
          <strong>{texts.text(e.text, e.title, 'title')}</strong>
          <span className="num font-semibold">{time}</span>
          <span className="hidden text-ink-2 md:inline">{texts.text(e.text, e.description, 'description')}</span>
        </Link>
      ))}
    </aside>
  );
}
