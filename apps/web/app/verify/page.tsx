'use client';
import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AuthShell } from '@/components/AuthShell';
import { api } from '@/lib/api';

function Verify() {
  const token = useSearchParams().get('token');
  const qc = useQueryClient();
  const [state, setState] = useState<string>('pending');
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || !token) return;
    ran.current = true;
    api('/auth/verify-email', { method: 'POST', json: { token } })
      .then(() => {
        setState('ok');
        qc.invalidateQueries({ queryKey: ['me'] });
      })
      .catch((e: Error) => setState(e.message));
  }, [token, qc]);
  if (!token) return <p>Lien incomplet.</p>;
  if (state === 'pending') return <p>Vérification…</p>;
  if (state === 'ok')
    return (
      <p className="text-lg">
        Email confirmé. <Link href="/market" className="font-semibold underline">Direction le marché</Link>
      </p>
    );
  return <p className="text-down">{state}</p>;
}

export default function VerifyPage() {
  return (
    <AuthShell kicker="Vérification" title="Presque prêt.">
      <Suspense>
        <Verify />
      </Suspense>
    </AuthShell>
  );
}
