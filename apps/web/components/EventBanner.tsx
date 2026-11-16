'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { countdown, MOOD_STYLE, useEvents } from '@/lib/economy';

/** Bandeau « flash info » : événements annoncés (compte à rebours) et en cours. */
export function EventBanner() {
  const { data } = useEvents();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const items = [...(data?.upcoming ?? []), ...(data?.active ?? []).filter((e) => e.endsAt && new Date(e.endsAt).getTime() > now)];
  if (!items.length) return null;
  return (
    <div className="-mt-8 mb-8 border-b-2 border-ink">
      {items.map((e) => (
        <Link key={e.id} href="/events" className={`flex flex-wrap items-baseline gap-x-3 px-4 py-2 text-sm hover:underline sm:px-8 ${MOOD_STYLE[e.mood].bg}`}>
          <span className="bg-ink px-1.5 text-xs font-bold uppercase tracking-widest text-paper">
            {e.status === 'SCHEDULED' ? 'Flash info' : 'En cours'}
          </span>
          <strong>{e.title}</strong>
          <span className="num font-semibold">
            {e.status === 'SCHEDULED' ? `dans ${countdown(e.startsAt, now)}` : `encore ${countdown(e.endsAt!, now)}`}
          </span>
          <span className="hidden text-ink-2 md:inline">{e.description}</span>
        </Link>
      ))}
    </div>
  );
}
