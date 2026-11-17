import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { AssetParams, MarketState, Regime } from '@cryptomeme/engine';

/**
 * Colonnes JSON d'un actif (Asset.state / Asset.params) : lecture validée, écriture typée.
 * Remplace les `a.state as unknown as MarketState` : une donnée corrompue lève une erreur explicite.
 */

const regimeSchema = z.enum(['CALM', 'NORMAL', 'HYPE', 'PANIC']) satisfies z.ZodType<Regime>;

/** État du moteur tel que stocké ; `closed` = Bourse fermée au dernier tick (actions uniquement). */
export type StoredState = MarketState & { closed?: boolean };

const stateSchema = z.object({
  logFair: z.number(),
  logAnchor: z.number(),
  regime: regimeSchema,
  closed: z.boolean().optional(),
}) satisfies z.ZodType<StoredState>;

const paramsSchema = z.object({
  volatility: z.number(),
  meanReversion: z.number(),
  jumpIntensity: z.number(),
  jumpSize: z.number(),
  rugRisk: z.number(),
  npcActivity: z.number(),
  herding: z.number(),
  noiseVolume: z.number(),
  regimeSensitivity: z.number(),
}) satisfies z.ZodType<AssetParams>;

type Json = { state?: Prisma.JsonValue; params?: Prisma.JsonValue; symbol?: string };

function parse<T>(schema: z.ZodType<T>, value: unknown, what: string, symbol?: string): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new Error(`${what} invalide${symbol ? ` pour ${symbol}` : ''} : ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message}`);
  return r.data;
}

export const stateOf = (a: Pick<Json, 'state' | 'symbol'>): StoredState => parse(stateSchema, a.state, 'État du moteur', a.symbol);
export const paramsOf = (a: Pick<Json, 'params' | 'symbol'>): AssetParams => parse(paramsSchema, a.params, 'Paramètres du moteur', a.symbol);

/** Régime affiché (lecture tolérante : NORMAL si l'état est illisible). */
export const regimeOf = (a: Pick<Json, 'state'>): Regime => stateSchema.safeParse(a.state).data?.regime ?? 'NORMAL';

/** Écriture JSON d'un état du moteur. */
export function stateJson(s: StoredState): Prisma.InputJsonObject {
  return { logFair: s.logFair, logAnchor: s.logAnchor, regime: s.regime, ...(s.closed === undefined ? {} : { closed: s.closed }) };
}

/** Écriture JSON des paramètres du moteur. */
export function paramsJson(p: AssetParams): Prisma.InputJsonObject {
  return {
    volatility: p.volatility,
    meanReversion: p.meanReversion,
    jumpIntensity: p.jumpIntensity,
    jumpSize: p.jumpSize,
    rugRisk: p.rugRisk,
    npcActivity: p.npcActivity,
    herding: p.herding,
    noiseVolume: p.noiseVolume,
    regimeSensitivity: p.regimeSensitivity,
  };
}
