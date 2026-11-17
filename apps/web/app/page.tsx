'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { STARTING_CASH } from '@cryptomeme/shared';
import { api } from '@/lib/api';
import { useAssets, useMe } from '@/lib/hooks';
import { money, pct, tone } from '@/lib/format';
import { EventFeed } from '@/components/EventFeed';
import { LivePrice } from '@/components/LivePrice';
import { Glyph } from '@/lib/icons';

interface Board {
  season: { name: string };
  entries: Array<{ rank: number; username: string; netWorth: string; performance: number }>;
}

export default function Home() {
  const { data: me } = useMe();
  const { data: assets } = useAssets();
  const { data: board } = useQuery({ queryKey: ['leaderboard', null], queryFn: () => api<Board>('/leaderboard'), refetchInterval: 30_000 });
  const sorted = [...(assets ?? [])].sort((a, b) => b.change24h - a.change24h);
  const top = sorted[0];
  const flop = sorted.at(-1);

  return (
    <div className="space-y-16">
      <section className="rise grid gap-10 border-b-2 border-ink pb-12 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-ink-2">{board?.season.name ?? 'Saison en cours'}</p>
          <h1 className="display text-[clamp(3.5rem,10vw,9rem)] font-extrabold">
            Achète haut.
            <br />
            Vends <span className="bg-acid px-2">bas.</span>
          </h1>
          <p className="mt-6 max-w-xl text-xl leading-relaxed">
            Tu démarres avec {money(STARTING_CASH)} fictifs. Des cryptos absurdes, des rug pulls, des PNJ qui paniquent. Le marché réagit à chacun
            de tes ordres. À la fin de la saison, une seule personne est #1.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href={me ? '/market' : '/register'} className="btn bg-acid text-lg">
              {me ? 'Aller au marché' : 'Commencer à trader'}
            </Link>
            <Link href="/leaderboard" className="btn bg-paper text-lg">
              Voir le classement
            </Link>
          </div>
        </div>
        <div className="rise space-y-6 [animation-delay:150ms]">
          {top && (
            <Link href={`/market/${top.symbol}`} className="block border-2 border-ink bg-up-bg p-5 hover:bg-paper-2">
              <p className="text-xs font-bold uppercase tracking-widest">En feu aujourd'hui</p>
              <p className="display mt-2 text-4xl font-bold">
                <Glyph name={top.emoji} color={top.color} /> {top.name}
              </p>
              <p className="num mt-1 text-lg">
                <LivePrice value={top.price} /> <span className={`font-semibold ${tone(top.change24h)}`}>{pct(top.change24h)}</span>
              </p>
            </Link>
          )}
          {flop && flop !== top && (
            <Link href={`/market/${flop.symbol}`} className="block border-2 border-ink bg-down-bg p-5 hover:bg-paper-2">
              <p className="text-xs font-bold uppercase tracking-widest">Dans le rouge</p>
              <p className="display mt-2 text-4xl font-bold">
                <Glyph name={flop.emoji} color={flop.color} /> {flop.name}
              </p>
              <p className="num mt-1 text-lg">
                <LivePrice value={flop.price} /> <span className={`font-semibold ${tone(flop.change24h)}`}>{pct(flop.change24h)}</span>
              </p>
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-12 lg:grid-cols-[1fr_1fr]">
        <div>
          <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Top 10</h2>
          {!board?.entries.length ? (
            <p className="text-ink-2">Le classement est vide. La place de #1 t'attend.</p>
          ) : (
            <ol className="num">
              {board.entries.slice(0, 10).map((e) => (
                <li key={e.username} className="flex items-baseline gap-4 border-b border-line py-2">
                  <span className={`w-10 font-bold ${e.rank === 1 ? 'display text-3xl' : 'text-lg'}`}>#{e.rank}</span>
                  <Link href={`/u/${e.username}`} className="flex-1 font-semibold hover:underline">@{e.username}</Link>
                  <span className="font-semibold">{money(e.netWorth)}</span>
                  <span className={`w-24 text-right text-sm ${tone(e.performance)}`}>{pct(e.performance)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <EventFeed limit={10} />
      </section>
    </div>
  );
}
