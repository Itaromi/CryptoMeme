'use client';
import type { QueryKey } from '@tanstack/react-query';

/** Préfixe vide : toutes les requêtes. À invalider quand l'utilisateur connecté change (connexion, inscription). */
export const ALL_QUERIES: QueryKey = [];

export function AuthShell({ title, kicker, children }: { title: React.ReactNode; kicker: React.ReactNode; children: React.ReactNode }) {
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

/** Champ de formulaire d'authentification, avec son erreur éventuelle (message du schéma partagé, affiché tel quel). */
export function Field({
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      <input className="field" {...props} />
      {error && <span className="mt-1 block text-sm text-down">{error}</span>}
    </label>
  );
}

/** Erreur renvoyée par l'API, sous le formulaire. */
export function FormError({ message }: { message: string | null }) {
  return message ? <p className="text-sm text-down">{message}</p> : null;
}
