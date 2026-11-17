'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useNow, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { type BankView, useBanks } from '@/lib/economy';
import { useFormat } from '@/lib/format';
import { useApiMutation } from '@/lib/mutation';
import { useErrorMessage } from '@/lib/texts';
import { queryKeys } from '@/lib/queryKeys';
import { BankCard } from '@/components/banks/BankCard';

export default function BanksPage() {
  const errorMessage = useErrorMessage();
  const t = useTranslations('banks');
  const tc = useTranslations('common.actions');
  const f = useFormat();
  const now = useNow({ updateInterval: 1000 });
  const { data: me } = useMe();
  const { data } = useBanks();
  const [confirm, setConfirm] = useState<string | null>(null);

  // Les frais d'ouverture sortent du cash ; la banque apparaît dans le portefeuille.
  const join = useApiMutation<BankView>({
    mutationFn: (b) => api('/banks/switch', { method: 'POST', json: { bankId: b.id } }),
    invalidate: [queryKeys.banks, queryKeys.portfolio, queryKeys.leaderboard.all],
    onSuccess: () => setConfirm(null),
  });

  const cooldown = data?.current && new Date(data.current.canSwitchAt) > now ? data.current.canSwitchAt : null;

  return (
    <div className="rise">
      <h1 className="display mb-2 text-6xl font-extrabold">{t('title')}</h1>
      <p className="mb-10 max-w-2xl text-lg text-ink-2">{t('intro')}</p>
      {cooldown && <p className="mb-6 text-sm text-ink-2">{t('cooldown', { time: f.countdown(cooldown, now) })}</p>}

      <div className="grid gap-x-8 gap-y-12 md:grid-cols-2 xl:grid-cols-3">
        {data?.banks.map((b) => {
          const current = data.current?.bankId === b.id;
          const tooPoor = data.netWorth != null && Number(data.netWorth) < Number(b.minNetWorth);
          const mine = join.variables?.id === b.id;
          return (
            <BankCard key={b.id} bank={b} current={current}>
              {me && !current && (
                <div className="mt-4">
                  {confirm === b.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button className="btn bg-acid py-1.5 text-sm" disabled={join.isPending} onClick={() => join.mutate(b)}>
                        {Number(b.openingFee) ? t('confirmFee', { fee: f.money(b.openingFee) }) : t('confirm')}
                      </button>
                      <button className="text-sm underline" onClick={() => setConfirm(null)}>
                        {tc('cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn bg-paper py-1.5 text-sm"
                      disabled={!!cooldown || tooPoor}
                      onClick={() => {
                        join.reset();
                        setConfirm(b.id);
                      }}
                    >
                      {tooPoor ? t('tooPoor') : t('open')}
                    </button>
                  )}
                  {mine && join.error && <p className="mt-2 text-sm font-semibold text-down">{errorMessage(join.error)}</p>}
                </div>
              )}
              {current && mine && join.isSuccess && <p className="mt-2 text-sm font-semibold text-up">{t('welcome', { name: b.name })}</p>}
            </BankCard>
          );
        })}
      </div>
      {!me && (
        <p className="mt-10 text-lg">
          {t.rich('signupPrompt', {
            link: (c) => (
              <Link href="/register" className="font-semibold underline">
                {c}
              </Link>
            ),
          })}
        </p>
      )}
    </div>
  );
}
