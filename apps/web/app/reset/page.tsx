'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthShell, Field, useSubmit } from '@/components/AuthShell';
import { api } from '@/lib/api';

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState(false);
  const { submit, pending, error } = useSubmit(async (f: FormData) => {
    await api('/auth/reset-password', { method: 'POST', json: { token, password: f.get('password') } });
    setDone(true);
  });
  if (done)
    return (
      <p className="text-lg">
        Mot de passe changé, toutes tes sessions ont été fermées.{' '}
        <Link href="/login" className="font-semibold underline">Se connecter</Link>
      </p>
    );
  return (
    <form action={submit} className="space-y-4">
      <Field label="Nouveau mot de passe" name="password" type="password" autoComplete="new-password" required />
      {error && <p className="text-sm text-down">{error}</p>}
      <button className="btn w-full bg-acid" disabled={pending || !token}>
        Changer le mot de passe
      </button>
    </form>
  );
}

export default function ResetPage() {
  return (
    <AuthShell kicker="Réinitialisation" title="Nouveau départ.">
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
