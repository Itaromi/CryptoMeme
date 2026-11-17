'use client';
import { useTranslations } from 'next-intl';
import { AuthShell, Field, FormError } from '@/components/AuthShell';
import { api } from '@/lib/api';
import { errorMessage, useApiMutation } from '@/lib/mutation';

export default function ForgotPage() {
  const t = useTranslations('auth.forgot');
  const tf = useTranslations('auth.fields');
  const forgot = useApiMutation({
    mutationFn: (f: FormData) => api('/auth/forgot-password', { method: 'POST', json: { email: f.get('email') } }),
  });
  return (
    <AuthShell kicker={t('kicker')} title={t('title')}>
      {forgot.isSuccess ? (
        <p className="text-lg">{t('sent')}</p>
      ) : (
        <form action={(f) => forgot.mutate(f)} className="space-y-4">
          <Field label={tf('email')} name="email" type="email" required />
          <FormError message={forgot.error && errorMessage(forgot.error)} />
          <button className="btn w-full bg-acid" disabled={forgot.isPending}>
            {t('submit')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
