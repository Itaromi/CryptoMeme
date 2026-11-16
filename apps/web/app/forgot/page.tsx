'use client';
import { useState } from 'react';
import { AuthShell, Field, useSubmit } from '@/components/AuthShell';
import { api } from '@/lib/api';

export default function ForgotPage() {
  const [sent, setSent] = useState(false);
  const { submit, pending, error } = useSubmit(async (f: FormData) => {
    await api('/auth/forgot-password', { method: 'POST', json: { email: f.get('email') } });
    setSent(true);
  });
  return (
    <AuthShell kicker="Mot de passe oublié" title="Ça arrive aux meilleurs.">
      {sent ? (
        <p className="text-lg">
          Si un compte existe pour cet email, un lien de réinitialisation vient d'être envoyé. Il est valable 1 heure.
        </p>
      ) : (
        <form action={submit} className="space-y-4">
          <Field label="Email" name="email" type="email" required />
          {error && <p className="text-sm text-down">{error}</p>}
          <button className="btn w-full bg-acid" disabled={pending}>
            Envoyer le lien
          </button>
        </form>
      )}
    </AuthShell>
  );
}
