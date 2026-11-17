'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { type RegisterInput, registerSchema, STARTING_CASH } from '@cryptomeme/shared';
import { ALL_QUERIES, AuthShell, Field, FormError } from '@/components/AuthShell';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { errorMessage, useApiMutation } from '@/lib/mutation';

export default function RegisterPage() {
  const t = useTranslations('auth');
  const f = useFormat();
  const router = useRouter();
  // Messages de validation du schéma partagé, affichés tels quels
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const register = useApiMutation({
    mutationFn: (input: RegisterInput) => api('/auth/register', { method: 'POST', json: input }),
    invalidate: [ALL_QUERIES],
    onSuccess: () => router.push('/market'),
  });

  function submit(form: FormData) {
    const parsed = registerSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setFieldErrors({});
    register.mutate(parsed.data);
  }

  return (
    <AuthShell kicker={t('register.kicker')} title={t('register.title', { cash: f.money(STARTING_CASH) })}>
      <form action={submit} className="space-y-4" noValidate>
        <Field label={t('fields.username')} name="username" autoComplete="username" error={fieldErrors.username} />
        <Field label={t('fields.email')} name="email" type="email" autoComplete="email" error={fieldErrors.email} />
        <Field label={t('fields.password')} name="password" type="password" autoComplete="new-password" error={fieldErrors.password} />
        <p className="text-xs text-ink-2">{t('register.passwordHint')}</p>
        <FormError message={register.error && errorMessage(register.error)} />
        <button className="btn w-full bg-acid" disabled={register.isPending}>
          {register.isPending ? t('register.pending') : t('register.submit')}
        </button>
        <p className="text-sm">
          {t('register.hasAccount')} <Link href="/login" className="font-semibold underline">{t('register.login')}</Link>
        </p>
        <p className="text-xs text-ink-3">{t('register.disclaimer')}</p>
      </form>
    </AuthShell>
  );
}
