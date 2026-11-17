'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ALL_QUERIES, AuthShell, Field, FormError } from '@/components/AuthShell';
import { api } from '@/lib/api';
import { errorMessage, useApiMutation } from '@/lib/mutation';

export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const login = useApiMutation({
    mutationFn: (f: FormData) => api('/auth/login', { method: 'POST', json: { email: f.get('email'), password: f.get('password') } }),
    invalidate: [ALL_QUERIES],
    onSuccess: () => router.push('/market'),
  });
  return (
    <AuthShell kicker={t('login.kicker')} title={t('login.title')}>
      <form action={(f) => login.mutate(f)} className="space-y-4">
        <Field label={t('fields.email')} name="email" type="email" autoComplete="email" required />
        <Field label={t('fields.password')} name="password" type="password" autoComplete="current-password" required />
        <FormError message={login.error && errorMessage(login.error)} />
        <button className="btn w-full bg-acid" disabled={login.isPending}>
          {login.isPending ? t('login.pending') : t('login.submit')}
        </button>
        <div className="flex justify-between text-sm">
          <Link href="/forgot" className="underline">{t('login.forgot')}</Link>
          <Link href="/register" className="font-semibold underline">{t('login.register')}</Link>
        </div>
      </form>
    </AuthShell>
  );
}
