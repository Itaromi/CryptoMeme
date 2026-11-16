'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AuthShell, Field, useSubmit } from '@/components/AuthShell';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { submit, pending, error } = useSubmit(async (f: FormData) => {
    await api('/auth/login', { method: 'POST', json: { email: f.get('email'), password: f.get('password') } });
    await qc.invalidateQueries();
    router.push('/market');
  });
  return (
    <AuthShell kicker="Connexion" title="Le marché n'attend pas.">
      <form action={submit} className="space-y-4">
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Mot de passe" name="password" type="password" autoComplete="current-password" required />
        {error && <p className="text-sm text-down">{error}</p>}
        <button className="btn w-full bg-acid" disabled={pending}>
          {pending ? 'Connexion…' : 'Se connecter'}
        </button>
        <div className="flex justify-between text-sm">
          <Link href="/forgot" className="underline">Mot de passe oublié</Link>
          <Link href="/register" className="font-semibold underline">Créer un compte</Link>
        </div>
      </form>
    </AuthShell>
  );
}
