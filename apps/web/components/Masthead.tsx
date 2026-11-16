'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAssets, useMe, usePortfolio } from '@/lib/hooks';
import { money, pct, price } from '@/lib/format';
import { NotificationBell } from './NotificationBell';

function TickerTape() {
  const { data } = useAssets();
  if (!data?.length) return <div className="h-9 border-b-2 border-ink bg-ink" />;
  const items = [...data, ...data]; // doublé pour une boucle continue
  return (
    <div className="overflow-hidden border-b-2 border-ink bg-ink text-paper" aria-label="Cours en direct">
      <div className="tape flex w-max gap-8 py-2 text-sm">
        {items.map((a, i) => (
          <Link key={`${a.symbol}-${i}`} href={`/market/${a.symbol}`} className="num flex items-center gap-2 whitespace-nowrap hover:text-acid">
            <span className="font-semibold">{a.symbol}</span>
            <span>{price(a.price)}</span>
            <span className={a.change24h >= 0 ? 'text-[oklch(0.8_0.15_150)]' : 'text-[oklch(0.75_0.17_27)]'}>
              {a.change24h >= 0 ? '▲' : '▼'} {pct(a.change24h, false)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const NAV = [
  { href: '/market', label: 'Marché' },
  { href: '/portfolio', label: 'Portefeuille' },
  { href: '/mining', label: 'Minage' },
  { href: '/banks', label: 'Banques' },
  { href: '/events', label: 'Actu' },
  { href: '/leaderboard', label: 'Classement' },
];

export function Masthead() {
  const { data: me } = useMe();
  const { data: pf } = usePortfolio(!!me);
  const path = usePathname();
  const router = useRouter();
  const qc = useQueryClient();

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    qc.clear();
    router.push('/');
  }

  return (
    <header className="mb-8">
      <TickerTape />
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b-2 border-ink px-4 py-4 sm:px-8">
        <Link href="/" className="display text-4xl font-extrabold sm:text-5xl">
          Crypto<span className="bg-acid px-1">Meme</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm font-semibold">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`px-3 py-1.5 ${path.startsWith(n.href) ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}
            >
              {n.label}
            </Link>
          ))}
          {me && (me.role === 'ADMIN' || me.role === 'MODERATOR') && (
            <Link href="/admin" className={`px-3 py-1.5 ${path.startsWith('/admin') ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}>
              Admin
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-4 text-sm">
          {me ? (
            <>
              {pf && (
                <div className="num text-right leading-tight">
                  <div className="text-xs text-ink-2">Patrimoine</div>
                  <div className="font-semibold">{money(pf.netWorth)}</div>
                </div>
              )}
              <NotificationBell />
              <Link href={`/u/${me.username}`} className="font-semibold underline decoration-2 underline-offset-4 hover:bg-acid">
                @{me.username}
              </Link>
              <button onClick={logout} className="text-ink-2 hover:text-ink">
                Déconnexion
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="font-semibold hover:underline">
                Connexion
              </Link>
              <Link href="/register" className="btn bg-acid py-1.5 text-sm">
                Jouer
              </Link>
            </>
          )}
        </div>
      </div>
      {me && !me.emailVerifiedAt && <VerifyBanner />}
    </header>
  );
}

function VerifyBanner() {
  return (
    <div className="border-b-2 border-ink bg-paper-2 px-4 py-2 text-center text-sm sm:px-8">
      Confirme ton email pour sécuriser ton compte.{' '}
      <button className="font-semibold underline" onClick={() => api('/auth/resend-verification', { method: 'POST' }).then(() => alert('Email renvoyé.'))}>
        Renvoyer le lien
      </button>
    </div>
  );
}
