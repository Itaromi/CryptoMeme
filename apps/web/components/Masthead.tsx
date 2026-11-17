'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
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
      {/* Logo à gauche, compte à droite ; le menu se place entre les deux à partir de 1680 px (place suffisante), en dessous sinon */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 border-b-2 border-ink px-4 py-3 sm:gap-x-8 sm:px-8 sm:py-4 min-[1680px]:grid-cols-[auto_minmax(0,1fr)_auto] 2xl:px-12">
        <Link href="/" className="display order-1 shrink-0 text-3xl font-extrabold sm:text-4xl md:text-5xl">
          Crypto<span className="bg-acid px-1">Meme</span>
        </Link>
        {/* Sur mobile : bandeau qui défile au doigt, bord à bord. Centrage par marges auto : jamais d'élément coupé à gauche */}
        <nav className="order-3 col-span-2 -mx-4 flex min-w-0 items-center gap-1 overflow-x-auto px-3 text-sm font-semibold whitespace-nowrap [scrollbar-width:none] sm:-mx-1 sm:px-0 min-[1680px]:order-2 min-[1680px]:col-span-1 min-[1680px]:[&>:first-child]:ml-auto min-[1680px]:[&>:last-child]:mr-auto">
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
        <div className="order-2 flex items-center justify-end gap-2 text-sm lg:gap-4 min-[1680px]:order-3">
          {/* Grand écran : tout est affiché ; mobile et tablette : langue, patrimoine et compte passent dans le menu */}
          <div className="hidden lg:block">
            <LocaleSwitcher />
          </div>
          {me ? (
            <>
              {pf && (
                <div className="num hidden border-r border-line pr-4 text-right leading-tight lg:block">
                  <div className="text-xs text-ink-2">{t('masthead.netWorth')}</div>
                  <div className="font-semibold">{f.money(pf.netWorth)}</div>
                </div>
              )}
              <NotificationBell />
              <Link href={`/u/${me.username}`} className="hidden font-semibold underline decoration-2 underline-offset-4 hover:bg-acid lg:inline">
                @{me.username}
              </Link>
              <button onClick={() => logout.mutate()} disabled={logout.isPending} className="hidden text-ink-2 hover:text-ink lg:inline">
                {t('masthead.logout')}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="hidden font-semibold hover:underline lg:inline">
                {t('masthead.login')}
              </Link>
              <Link href="/register" className="btn bg-acid px-3 py-1.5 text-sm">
                {t('masthead.play')}
              </Link>
            </>
          )}
          <MobileMenu>
            <LocaleSwitcher />
            {me ? (
              <>
                {pf && (
                  <p className="num flex items-baseline justify-between gap-3">
                    <span className="text-xs text-ink-2">{t('masthead.netWorth')}</span>
                    <span className="font-semibold">{f.money(pf.netWorth)}</span>
                  </p>
                )}
                <Link href={`/u/${me.username}`} className="py-1 font-semibold underline decoration-2 underline-offset-4">
                  @{me.username}
                </Link>
                <button onClick={() => logout.mutate()} disabled={logout.isPending} className="py-1 text-left text-ink-2">
                  {t('masthead.logout')}
                </button>
              </>
            ) : (
              <Link href="/login" className="py-1 font-semibold underline decoration-2 underline-offset-4">
                {t('masthead.login')}
              </Link>
            )}
          </MobileMenu>
        </div>
      </div>
      {me && !me.emailVerified && <VerifyBanner email={me.email} />}
    </header>
  );
}

/** Menu du compte sur mobile et tablette (masqué à partir de lg). Se ferme au clic extérieur, avec Échap ou en suivant un lien. */
function MobileMenu({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common.masthead');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (e.target instanceof Node && !ref.current?.contains(e.target)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative lg:hidden">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label={t('menu')} className="grid size-10 place-items-center border-2 border-ink hover:bg-paper-2">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <div
          // Un lien suivi referme le menu
          onClick={(e) => e.target instanceof Element && e.target.closest('a') && setOpen(false)}
          className="absolute right-0 z-50 mt-2 flex w-64 max-w-[calc(100vw-2rem)] flex-col items-start gap-3 border-2 border-ink bg-paper p-4 shadow-[4px_4px_0_var(--color-ink)] [&>p]:w-full"
        >
          {children}
        </div>
      )}
    </div>
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
