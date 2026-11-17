'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { STARTING_CASH } from '@cryptomeme/shared';
import { type AssetRow, useAssets, useMe } from '@/lib/hooks';
import { tone, useFormat } from '@/lib/format';
import { useLeaderboard } from '@/lib/meta';
import { EventFeed } from '@/components/EventFeed';
import { LivePrice } from '@/components/LivePrice';
import { Glyph } from '@/lib/icons';

export default function Home() {
  const t = useTranslations('home');
  const f = useFormat();
  const { data: me } = useMe();
  const { data: assets } = useAssets();
  // même requête que l'onglet « Général » de la saison en cours sur la page Classement
  const { data: board } = useLeaderboard(null, 'general');
  const sorted = [...(assets ?? [])].sort((a, b) => b.change24h - a.change24h);
  const top = sorted[0];
  const flop = sorted.at(-1);

  return (
    <div className="space-y-16">
      <section className="rise grid gap-10 border-b-2 border-ink pb-12 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-ink-2">{board?.season.name ?? t('currentSeason')}</p>
          <h1 className="display text-[clamp(3.5rem,10vw,9rem)] font-extrabold">
            {t('hero.line1')}
            <br />
            {t.rich('hero.line2', { hl: (c) => <span className="bg-acid px-2">{c}</span> })}
          </h1>
          <p className="mt-6 max-w-xl text-xl leading-relaxed">{t('hero.pitch', { cash: f.money(STARTING_CASH) })}</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href={me ? '/market' : '/register'} className="btn bg-acid text-lg">
              {me ? t('hero.toMarket') : t('hero.start')}
            </Link>
            <Link href="/leaderboard" className="btn bg-paper text-lg">
              {t('hero.leaderboard')}
            </Link>
          </div>
        </div>
        <div className="rise space-y-6 [animation-delay:150ms]">
          {top && <Mover asset={top} label={t('movers.top')} bg="bg-up-bg" />}
          {flop && flop !== top && <Mover asset={flop} label={t('movers.flop')} bg="bg-down-bg" />}
        </div>
      </section>

      <section className="grid gap-12 lg:grid-cols-[1fr_1fr]">
        <div>
          <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">{t('top10.title')}</h2>
          {!board?.entries.length ? (
            <p className="text-ink-2">{t('top10.empty')}</p>
          ) : (
            <ol className="num">
              {board.entries.slice(0, 10).map((e) => (
                <li key={e.username} className="flex items-baseline gap-4 border-b border-line py-2">
                  <span className={`w-10 font-bold ${e.rank === 1 ? 'display text-3xl' : 'text-lg'}`}>#{e.rank}</span>
                  <Link href={`/u/${e.username}`} className="flex-1 font-semibold hover:underline">@{e.username}</Link>
                  <span className="font-semibold">{f.money(e.netWorth)}</span>
                  <span className={`w-24 text-right text-sm ${tone(e.performance)}`}>{f.pct(e.performance)}</span>
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

/** Carte « plus forte hausse » / « plus forte baisse » du jour. */
function Mover({ asset, label, bg }: { asset: AssetRow; label: string; bg: string }) {
  const f = useFormat();
  return (
    <Link href={`/market/${asset.symbol}`} className={`block border-2 border-ink ${bg} p-5 hover:bg-paper-2`}>
      <p className="text-xs font-bold uppercase tracking-widest">{label}</p>
      <p className="display mt-2 text-4xl font-bold">
        <Glyph name={asset.emoji} color={asset.color} /> {asset.name}
      </p>
      <p className="num mt-1 text-lg">
        <LivePrice value={asset.price} /> <span className={`font-semibold ${tone(asset.change24h)}`}>{f.pct(asset.change24h)}</span>
      </p>
    </Link>
  );
}
