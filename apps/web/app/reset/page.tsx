'use client';
import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AuthShell, Field, FormError } from '@/components/AuthShell';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { useErrorMessage } from '@/lib/texts';

function ResetForm() {
  const errorMessage = useErrorMessage();
  const t = useTranslations('auth.reset');
  const token = useSearchParams().get('token') ?? '';
  const reset = useApiMutation({
    mutationFn: (f: FormData) => api('/auth/reset-password', { method: 'POST', json: { token, newPassword: f.get('password') } }),
  });
  if (reset.isSuccess)
    return (
      <p className="text-lg">
        {t('done')} <Link href="/login" className="font-semibold underline">{t('login')}</Link>
      </p>
    );
  return (
    <form action={(f) => reset.mutate(f)} className="space-y-4">
      <Field label={t('password')} name="password" type="password" autoComplete="new-password" required />
      <FormError message={reset.error && errorMessage(reset.error)} />
      <button className="btn w-full bg-acid" disabled={reset.isPending || !token}>
        {t('submit')}
      </button>
    </form>
  );
}

export default function ResetPage() {
  const t = useTranslations('auth.reset');
  return (
    <AuthShell kicker={t('kicker')} title={t('title')}>
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
