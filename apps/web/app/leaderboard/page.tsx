'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { money, pct, tone } from '@/lib/format';
import type { Look } from '@/lib/meta';
import { Avatar, Name, PlayerTag } from '@/components/PlayerTag';

const CATS = [
  { id: 'general', label: 'Général', hint: 'Patrimoine net' },
  { id: 'day', label: '24 h', hint: 'Progression du patrimoine sur 24 h' },
  { id: 'week', label: '7 jours', hint: 'Progression du patrimoine sur 7 jours' },
  { id: 'trader', label: 'Trader', hint: 'Plus-values réalisées sur la saison' },
  { id: 'miner', label: 'Mineur', hint: 'Valeur des cryptos minées (prix actuel)' },
  { id: 'best-trade', label: 'Plus gros gain', hint: 'Meilleure vente de la saison' },
  { id: 'worst-trade', label: 'Plus grosse perte 💀', hint: 'Pire vente de la saison' },
] as const;
type Cat = (typeof CATS)[number]['id'];

interface Board {
  season: { number: number; name: string; status: string; startsAt: string; endsAt: string | null };
  category: Cat;
  unit: 'money' | 'pct';
  entries: Array<{ rank: number; username: string; look?: Look; netWorth: string; performance: number; value: number }>;
}
interface SeasonRow {
  number: number;
  name: string;
  status: string;
}

export default function LeaderboardPage() {
  const [season, setSeason] = useState<number | null>(null);
  const [cat, setCat] = useState<Cat>('general');
  const { data: me } = useMe();
  const { data: seasons } = useQuery({ queryKey: ['seasons'], queryFn: () => api<SeasonRow[]>('/seasons') });
  const { data } = useQuery({
    queryKey: ['leaderboard', season, cat],
    queryFn: () => api<Board>(`/leaderboard?category=${cat}${season ? `&season=${season}` : ''}`),
    refetchInterval: 30_000,
  });
  const { data: myRank } = useQuery({
    queryKey: ['myRank'],
    queryFn: () => api<{ rank: number; total: number }>('/me/rank'),
    enabled: !!me && !season,
  });
  const fmt = (e: Board['entries'][number]) => (data?.unit === 'pct' ? pct(e.value) : money(cat === 'general' ? e.netWorth : e.value));
  const sub = (e: Board['entries'][number]) => (cat === 'general' ? pct(e.performance) : data?.unit === 'pct' ? money(e.netWorth) : null);
  const subTone = (e: Board['entries'][number]) => (cat === 'general' ? tone(e.performance) : 'text-ink-2');
  const valueTone = (e: Board['entries'][number]) => (cat === 'general' ? '' : tone(e.value));

  const podium = data?.entries.slice(0, 3) ?? [];
  const rest = data?.entries.slice(3) ?? [];

  return (
    <div className="rise">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-ink-2">{data?.season.name ?? 'Classement'}</p>
          <h1 className="display text-[clamp(3rem,8vw,6.5rem)] font-extrabold">Qui a les plus grosses mains de diamant ?</h1>
        </div>
        <div className="flex items-center gap-4">
          {myRank && (
            <p className="num text-lg">
              Toi : <strong className="bg-acid px-1">#{myRank.rank}</strong> sur {myRank.total}
            </p>
          )}
          {seasons && seasons.length > 1 && (
            <select className="field w-auto py-1.5" value={season ?? ''} onChange={(e) => setSeason(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Saison en cours</option>
              {seasons
                .filter((s) => s.status === 'ENDED')
                .map((s) => (
                  <option key={s.number} value={s.number}>
                    {s.name}
                  </option>
                ))}
            </select>
          )}
        </div>
      </div>

      <div className="mb-8 flex flex-wrap gap-1 text-sm font-semibold" role="tablist">
        {CATS.map((c) => (
          <button key={c.id} role="tab" title={c.hint} aria-selected={cat === c.id} onClick={() => setCat(c.id)} className={`px-3 py-1.5 ${cat === c.id ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}>
            {c.label}
          </button>
        ))}
      </div>
      <p className="-mt-5 mb-8 text-sm text-ink-2">{CATS.find((c) => c.id === cat)?.hint}</p>

      {data && data.entries.length === 0 && <p className="text-xl">Personne dans cette catégorie. La première place est libre.</p>}

      {/* Podium : la 1re place domine, volontairement asymétrique */}
      <div className="mb-12 grid items-end gap-6 md:grid-cols-[1.6fr_1fr_1fr]">
        {podium.map((e, i) => (
          <Link
            key={e.username}
            href={`/u/${e.username}`}
            className={`group block border-2 border-ink p-5 ${i === 0 ? 'bg-acid md:p-8' : 'bg-paper-2'} ${me?.username === e.username ? 'outline-4 outline-ink' : ''}`}
          >
            <span className="flex items-start justify-between gap-3">
              <span className={`display font-extrabold ${i === 0 ? 'text-8xl' : 'text-6xl'}`}>#{e.rank}</span>
              <Avatar look={e.look} size={i === 0 ? 'lg' : 'md'} />
            </span>
            <span className={`mt-2 block font-bold group-hover:underline ${i === 0 ? 'text-3xl' : 'text-xl'}`}>
              <Name username={e.username} look={e.look} />
              {e.look?.badges.map((b) => <span key={b.name} className="ml-1.5 text-[0.7em]">{b.icon}</span>)}
            </span>
            {e.look?.title && <span className="block text-xs uppercase tracking-widest text-ink-2">{e.look.title}</span>}
            <span className={`num mt-1 block text-lg font-semibold ${valueTone(e)}`}>{fmt(e)}</span>
            {sub(e) && <span className={`num text-sm font-semibold ${subTone(e)}`}>{sub(e)}</span>}
          </Link>
        ))}
      </div>

      {rest.length > 0 && (
        <table className="num w-full text-left">
          <tbody>
            {rest.map((e) => (
              <tr key={e.username} className={`border-b border-line ${me?.username === e.username ? 'bg-acid' : 'hover:bg-paper-2'}`}>
                <td className="w-16 py-3 text-xl font-bold">#{e.rank}</td>
                <td className="py-3">
                  <Link href={`/u/${e.username}`} className="hover:underline"><PlayerTag username={e.username} look={e.look} /></Link>
                </td>
                <td className={`py-3 text-right font-semibold ${valueTone(e)}`}>{fmt(e)}</td>
                <td className={`w-32 py-3 text-right font-semibold ${subTone(e)}`}>{sub(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-6 text-sm text-ink-3">
        Patrimoine = cash + valeur de revente réelle des positions (slippage inclus). Recalculé toutes les 30 secondes.
      </p>
    </div>
  );
}
