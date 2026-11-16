'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { registerSchema, STARTING_CASH } from '@cryptomeme/shared';
import { AuthShell, Field, useSubmit } from '@/components/AuthShell';
import { api } from '@/lib/api';
import { money } from '@/lib/format';

export default function RegisterPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { submit, pending, error } = useSubmit(async (f: FormData) => {
    const parsed = registerSchema.safeParse(Object.fromEntries(f));
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setFieldErrors({});
    await api('/auth/register', { method: 'POST', json: parsed.data });
    await qc.invalidateQueries();
    router.push('/market');
  });
  return (
    <AuthShell kicker="Inscription" title={`${money(STARTING_CASH)} pour devenir une légende.`}>
      <form action={submit} className="space-y-4" noValidate>
        <Field label="Pseudo" name="username" autoComplete="username" error={fieldErrors.username} />
        <Field label="Email" name="email" type="email" autoComplete="email" error={fieldErrors.email} />
        <Field label="Mot de passe" name="password" type="password" autoComplete="new-password" error={fieldErrors.password} />
        <p className="text-xs text-ink-2">8 caractères minimum, avec au moins une lettre et un chiffre.</p>
        {error && <p className="text-sm text-down">{error}</p>}
        <button className="btn w-full bg-acid" disabled={pending}>
          {pending ? 'Création…' : 'Ouvrir mon compte'}
        </button>
        <p className="text-sm">
          Déjà un compte ? <Link href="/login" className="font-semibold underline">Se connecter</Link>
        </p>
        <p className="text-xs text-ink-3">Argent 100 % fictif. Aucune vraie crypto n'a été maltraitée.</p>
      </form>
    </AuthShell>
  );
}
