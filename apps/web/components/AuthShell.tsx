'use client';
import { useState } from 'react';

export function AuthShell({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) {
  return (
    <div className="rise grid gap-10 pt-6 md:grid-cols-[1.1fr_1fr] md:gap-16">
      <div>
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-ink-2">{kicker}</p>
        <h1 className="display text-[clamp(3rem,7vw,6rem)] font-extrabold">{title}</h1>
      </div>
      <div className="max-w-md">{children}</div>
    </div>
  );
}

export function Field({
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      <input className="field" {...props} />
      {error && <span className="mt-1 block text-sm text-down">{error}</span>}
    </label>
  );
}

/** Petit helper pour gérer soumission + erreur serveur. */
export function useSubmit<T>(fn: (v: T) => Promise<unknown>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (v: T) => {
    setPending(true);
    setError(null);
    try {
      await fn(v);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  return { submit, pending, error };
}
