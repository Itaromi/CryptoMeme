'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { setLocale } from '@/i18n/actions';
import { locales } from '@/i18n/config';

/** Bascule FR / EN : mémorise le choix dans un cookie puis recharge les composants serveur. */
export function LocaleSwitcher() {
  const t = useTranslations('common.locale');
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex border-2 border-ink text-xs font-semibold" role="group" aria-label={t('label')}>
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          disabled={pending || l === current}
          aria-pressed={l === current}
          title={t(l)}
          onClick={() =>
            startTransition(async () => {
              await setLocale(l);
              router.refresh();
            })
          }
          className={`px-2 py-0.5 uppercase ${l === current ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
