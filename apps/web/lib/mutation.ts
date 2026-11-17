'use client';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

interface ApiMutationOptions<TVars, TData> {
  mutationFn: (vars: TVars) => Promise<TData>;
  /** Familles de requêtes à rafraîchir après succès (attendues avant `onSuccess`) */
  invalidate?: readonly QueryKey[];
  onSuccess?: (data: TData, vars: TVars) => void;
}

/**
 * Mutation API qui rafraîchit les données touchées. À utiliser pour toute action (achat, vente, sauvegarde…)
 * plutôt qu'un état `busy` manuel : `isPending`, `error` et `reset` sont fournis.
 */
export function useApiMutation<TVars = void, TData = unknown>({ mutationFn, invalidate = [], onSuccess }: ApiMutationOptions<TVars, TData>) {
  const qc = useQueryClient();
  return useMutation<TData, Error, TVars>({
    mutationFn,
    onSuccess: async (data, vars) => {
      await Promise.all(invalidate.map((queryKey) => qc.invalidateQueries({ queryKey })));
      onSuccess?.(data, vars);
    },
  });
}

/** Message d'erreur à afficher (celui renvoyé par l'API, sinon celui de l'exception). */
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
