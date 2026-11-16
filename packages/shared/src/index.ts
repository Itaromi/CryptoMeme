import { z } from 'zod';

// ─── Constantes de jeu ──────────────────────────────────────────────
export const STARTING_CASH = '10000.00';
export const TICK_MS = 5_000;
export const CASH_DECIMALS = 2;
export const QTY_DECIMALS = 8;
export const MIN_ORDER_CASH = 1;
export const ORDER_COOLDOWN_MS = 1_000;

// ─── Bourse (actions) ───────────────────────────────────────────────
export const STOCK_OPEN_MINUTE = 9 * 60; // 9 h, heure de Paris
export const STOCK_CLOSE_MINUTE = 22 * 60; // 22 h
export const STOCK_TZ = 'Europe/Paris';
/** Un « trimestre » de jeu dure 3 jours réels (≈ 10 publications par saison). */
export const QUARTER_MS = 3 * 86_400_000;

/** Bourse ouverte ? et dans combien de ms elle change d'état. */
export function stockMarketStatus(now = new Date()): { open: boolean; nextChangeAt: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: STOCK_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(now)
    .reduce<Record<string, number>>((o, p) => (p.type === 'literal' ? o : { ...o, [p.type]: Number(p.value) }), {});
  const m = parts.hour * 60 + parts.minute + parts.second / 60;
  const open = m >= STOCK_OPEN_MINUTE && m < STOCK_CLOSE_MINUTE;
  const wait = open ? STOCK_CLOSE_MINUTE - m : m < STOCK_OPEN_MINUTE ? STOCK_OPEN_MINUTE - m : 1440 - m + STOCK_OPEN_MINUTE;
  return { open, nextChangeAt: now.getTime() + Math.round(wait * 60_000) };
}

export const WS_EVENTS = {
  TICK: 'market:tick',
  TRADE: 'market:trade',
  SUBSCRIBE: 'market:subscribe',
  UNSUBSCRIBE: 'market:unsubscribe',
} as const;

// ─── Auth ───────────────────────────────────────────────────────────
export const usernameSchema = z
  .string()
  .min(3, '3 caractères minimum')
  .max(20, '20 caractères maximum')
  .regex(/^[a-zA-Z0-9_]+$/, 'Lettres, chiffres et _ uniquement');

export const registerSchema = z.object({
  email: z.string().email('Email invalide').max(254),
  username: usernameSchema,
  password: z
    .string()
    .min(8, '8 caractères minimum')
    .max(128)
    .regex(/[A-Za-z]/, 'Au moins une lettre')
    .regex(/[0-9]/, 'Au moins un chiffre'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ─── Trading ────────────────────────────────────────────────────────
const positiveDecimal = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Montant invalide')
  .refine((v) => Number(v) > 0, 'Doit être positif');

export const orderSchema = z.object({
  symbol: z.string().min(1).max(12),
  side: z.enum(['BUY', 'SELL']),
  /** BUY : montant en cash à dépenser. SELL : quantité de l'actif à vendre. */
  amount: positiveDecimal,
  /** Slippage max toléré en points de base (100 = 1 %). */
  maxSlippageBps: z.number().int().min(0).max(5000).default(200),
  clientOrderId: z.string().uuid(),
});
export type OrderInput = z.infer<typeof orderSchema>;

export const quoteSchema = orderSchema.pick({ symbol: true, side: true, amount: true });
export type QuoteInput = z.infer<typeof quoteSchema>;

// ─── Admin ──────────────────────────────────────────────────────────
export const adminCashAdjustSchema = z.object({
  amount: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
  reason: z.string().min(5).max(500),
});

export const adminAssetParamsSchema = z.object({
  volatility: z.number().min(0).max(5).optional(),
  meanReversion: z.number().min(0).max(10).optional(),
  jumpIntensity: z.number().min(0).max(50).optional(),
  rugRisk: z.number().min(0).max(1).optional(),
  npcActivity: z.number().min(0).max(1).optional(),
  herding: z.number().min(0).max(1).optional(),
  frozen: z.boolean().optional(),
});

// ─── DTO de réponse ─────────────────────────────────────────────────
export type AssetKind = 'CRYPTO' | 'STOCK';
export type AssetTier = 'BLUE_CHIP' | 'MID_CAP' | 'SHITCOIN';

export interface MarketTick {
  symbol: string;
  price: string;
  change24h: number;
  volume24h: string;
  regime: string;
  t: number;
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}
