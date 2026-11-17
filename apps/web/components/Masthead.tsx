'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAssets, useMe, usePortfolio } from '@/lib/hooks';
import { useFormat } from '@/lib/format';
import { useApiMutation } from '@/lib/mutation';
import { LocaleSwitcher } from './LocaleSwitcher';
import { NotificationBell } from './NotificationBell';

function TickerTape() {
  const t = useTranslations('common.masthead');
  const f = useFormat();
  const { data } = useAssets();
  if (!data?.length) return <div className="h-9 border-b-2 border-ink bg-ink" />;
  const items = [...data, ...data]; // doublé pour une boucle continue
  return (
    <div className="overflow-hidden border-b-2 border-ink bg-ink text-paper" aria-label={t('liveTape')}>
      <div className="tape flex w-max gap-8 py-2 text-sm">
        {items.map((a, i) => (
          <Link key={`${a.symbol}-${i}`} href={`/market/${a.symbol}`} className="num flex items-center gap-2 whitespace-nowrap hover:text-acid">
            <span className="font-semibold">{a.symbol}</span>
            <span>{f.price(a.price)}</span>
            <span className={a.change24h >= 0 ? 'text-[oklch(0.8_0.15_150)]' : 'text-[oklch(0.75_0.17_27)]'}>
              {a.change24h >= 0 ? '▲' : '▼'} {f.pct(a.change24h, false)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const NAV = ['market', 'stocks', 'portfolio', 'mining', 'banks', 'events', 'leaderboard', 'shop', 'create'] as const;

export function Masthead() {
  const t = useTranslations('common');
  const f = useFormat();
  const { data: me } = useMe();
  const { data: pf } = usePortfolio(!!me);
  const path = usePathname();
  const router = useRouter();
  const { data: assets } = useAssets();
  // une fiche d'action vit sous /market/… mais appartient à la Bourse
  const sym = path.startsWith('/market/') ? path.split('/')[2]?.toUpperCase() : null;
  const section = sym && assets?.find((a) => a.symbol === sym)?.kind === 'STOCK' ? '/stocks' : path;
  const qc = useQueryClient();

  const logout = useApiMutation({
    mutationFn: () => api('/auth/sign-out', { method: 'POST', json: {} }),
    onSuccess: () => {
      qc.clear();
      router.push('/');
    },
  });

  return (
    <header className="mb-8">
      <TickerTape />
      {/* Logo à gauche, compte à droite ; le menu se place entre les deux sur grand écran, en dessous sinon */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-8 gap-y-3 border-b-2 border-ink px-4 py-4 sm:px-8 2xl:px-12 xl:grid-cols-[auto_1fr_auto]">
        <Link href="/" className="display order-1 shrink-0 text-4xl font-extrabold sm:text-5xl">
          Crypto<span className="bg-acid px-1">Meme</span>
        </Link>
        <nav className="order-3 col-span-2 -mx-1 flex items-center gap-1 overflow-x-auto text-sm font-semibold whitespace-nowrap xl:order-2 xl:col-span-1 xl:justify-center">
          {NAV.map((key) => {
            const href = `/${key}`;
            return (
              <Link key={key} href={href} className={`px-3 py-1.5 ${section.startsWith(href) ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}>
                {t(`nav.${key}`)}
              </Link>
            );
          })}
          {me && (me.role === 'ADMIN' || me.role === 'MODERATOR') && (
            <Link href="/admin" className={`px-3 py-1.5 ${path.startsWith('/admin') ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}>
              {t('nav.admin')}
            </Link>
          )}
        </nav>
        <div className="order-2 flex items-center justify-end gap-4 text-sm xl:order-3">
          <LocaleSwitcher />
          {me ? (
            <>
              {pf && (
                <div className="num border-r border-line pr-4 text-right leading-tight">
                  <div className="text-xs text-ink-2">{t('masthead.netWorth')}</div>
                  <div className="font-semibold">{f.money(pf.netWorth)}</div>
                </div>
              )}
              <NotificationBell />
              <Link href={`/u/${me.username}`} className="font-semibold underline decoration-2 underline-offset-4 hover:bg-acid">
                @{me.username}
              </Link>
              <button onClick={() => logout.mutate()} disabled={logout.isPending} className="text-ink-2 hover:text-ink">
                {t('masthead.logout')}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="font-semibold hover:underline">
                {t('masthead.login')}
              </Link>
              <Link href="/register" className="btn bg-acid py-1.5 text-sm">
                {t('masthead.play')}
              </Link>
            </>
          )}
        </div>
      </div>
      {me && !me.emailVerified && <VerifyBanner email={me.email} />}
    </header>
  );
}

function VerifyBanner({ email }: { email: string }) {
  const t = useTranslations('common.masthead');
  const resend = useApiMutation({ mutationFn: () => api('/auth/send-verification-email', { method: 'POST', json: { email } }) });
  return (
    <div className="border-b-2 border-ink bg-paper-2 px-4 py-2 text-center text-sm sm:px-8">
      {t('verifyPrompt')}{' '}
      {resend.isSuccess ? (
        <span className="font-semibold">{t('verifySent')}</span>
      ) : (
        <button className="font-semibold underline" disabled={resend.isPending} onClick={() => resend.mutate()}>
          {t('verifyResend')}
        </button>
      )}
    </div>
  );
}
