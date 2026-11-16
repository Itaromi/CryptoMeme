'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ago } from '@/lib/format';

interface Ev {
  symbol: string;
  emoji: string;
  type: string;
  detail: string;
  at: string;
}

const HEADLINE: Record<string, (e: Ev) => string> = {
  RUG_PULL: (e) => `RUG PULL sur ${e.symbol} : ${e.detail}. Les devs sont aux Bahamas.`,
  JUMP: (e) => `${e.symbol} fait un saut de ${e.detail}.`,
  REGIME: (e) => `${e.symbol} change d'ambiance : ${e.detail.replace('HYPE', 'hype').replace('PANIC', 'panique').replace('CALM', 'calme').replace('NORMAL', 'normal')}.`,
};

export function EventFeed({ limit = 8 }: { limit?: number }) {
  const { data } = useQuery({ queryKey: ['events'], queryFn: () => api<Ev[]>('/market/events'), refetchInterval: 15_000 });
  return (
    <section>
      <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Dernières nouvelles</h2>
      {!data?.length ? (
        <p className="text-sm text-ink-2">Le marché est calme. Trop calme.</p>
      ) : (
        <ul className="divide-y divide-line">
          {data.slice(0, limit).map((e, i) => (
            <li key={i} className="py-2.5">
              <Link href={`/market/${e.symbol}`} className={`block text-sm leading-snug hover:underline ${e.type === 'RUG_PULL' ? 'font-bold text-down' : ''}`}>
                <span className="mr-1">{e.emoji}</span>
                {(HEADLINE[e.type] ?? ((x: Ev) => `${x.symbol} : ${x.detail}`))(e)}
              </Link>
              <span className="text-xs text-ink-3">{ago(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
