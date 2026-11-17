'use client';
import Link from 'next/link';
import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AuthShell } from '@/components/AuthShell';
import { api } from '@/lib/api';
import { errorMessage, useApiMutation } from '@/lib/mutation';
import { queryKeys } from '@/lib/queryKeys';

function Verify() {
  const t = useTranslations('auth.verify');
  const token = useSearchParams().get('token');
  const verify = useApiMutation({
    mutationFn: (tok: string) => api('/auth/verify-email', { method: 'POST', json: { token: tok } }),
    invalidate: [queryKeys.me],
  });
  const { mutate } = verify;
  // Le jeton est à usage unique : une seule tentative, même si l'effet est rejoué (mode strict)
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || !token) return;
    ran.current = true;
    mutate(token);
  }, [token, mutate]);

  if (!token) return <p>{t('incomplete')}</p>;
  if (verify.isError) return <p className="text-down">{errorMessage(verify.error)}</p>;
  if (!verify.isSuccess) return <p>{t('pending')}</p>;
  return (
    <p className="text-lg">
      {t('done')} <Link href="/market" className="font-semibold underline">{t('toMarket')}</Link>
    </p>
  );
}

export default function VerifyPage() {
  const t = useTranslations('auth.verify');
  return (
    <AuthShell kicker={t('kicker')} title={t('title')}>
      <Suspense>
        <Verify />
      </Suspense>
    </AuthShell>
  );
}
