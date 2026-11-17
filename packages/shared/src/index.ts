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

// ─── Icônes (Phosphor) ──────────────────────────────────────────────
/** Icônes autorisées pour les logos d'actifs, succès, badges et avatars (noms Phosphor). */
export const ICON_GROUPS = {
  Finance: ['Coin', 'CurrencyBtc', 'CurrencyEth', 'CurrencyCircleDollar', 'Coins', 'Money', 'Wallet', 'CreditCard', 'PiggyBank', 'Bank', 'Vault', 'HandCoins', 'ChartLineUp', 'ChartLineDown', 'TrendUp', 'TrendDown', 'ChartPie', 'Receipt', 'Scales', 'Scroll'],
  Mèmes: ['Rocket', 'RocketLaunch', 'MoonStars', 'Diamond', 'Crown', 'Trophy', 'Fire', 'Lightning', 'Skull', 'Ghost', 'Alien', 'Robot', 'Bomb', 'Sparkle', 'ShootingStar', 'MagicWand', 'DiceFive', 'Spade', 'Club', 'ToiletPaper', 'HandFist', 'Parachute', 'Target', 'Infinity', 'Spiral', 'Cube', 'Hexagon'],
  Animaux: ['Dog', 'Cat', 'Bird', 'Fish', 'Horse', 'Butterfly', 'Cow', 'Rabbit', 'Bug', 'PawPrint', 'Waves'],
  Bouffe: ['Bread', 'Grains', 'Hamburger', 'Pizza', 'Coffee', 'Cookie', 'Cake', 'IceCream', 'Carrot', 'OrangeSlice', 'Pepper', 'Avocado', 'Cheese', 'Popcorn', 'Egg', 'Wine', 'BeerStein', 'BowlFood', 'Brandy'],
  Industrie: ['Car', 'AirplaneTilt', 'Train', 'Package', 'ShoppingCart', 'Storefront', 'Factory', 'Buildings', 'GasPump', 'Drop', 'Cpu', 'Desktop', 'DeviceMobile', 'AppWindow', 'FilmStrip', 'FilmSlate', 'Hammer', 'Wrench', 'Shovel', 'Handbag', 'Tote', 'Plug', 'Atom', 'Flask', 'Brain', 'Leaf', 'Plant', 'Tree', 'Cactus', 'Flower', 'Sun', 'Planet', 'Mountains', 'Island', 'Yarn', 'Couch', 'Barbell', 'Handshake', 'CursorClick', 'BatteryWarning', 'FireExtinguisher', 'Gavel', 'Megaphone', 'Newspaper'],
  Têtes: ['Smiley', 'SmileyWink', 'SmileySticker', 'SmileyXEyes', 'SmileyMelting', 'SmileyNervous', 'SmileyAngry', 'SmileyBlank', 'Sunglasses', 'MaskHappy', 'Detective'],
} as const;
export type IconName = (typeof ICON_GROUPS)[keyof typeof ICON_GROUPS][number];
export const ICON_NAMES: readonly IconName[] = Object.values(ICON_GROUPS).flat();
export const isIconName = (v: string): v is IconName => (ICON_NAMES as readonly string[]).includes(v);

// ─── Création d'actifs ──────────────────────────────────────────────
export const CREATION = {
  CRYPTO: { fee: 25_000, minDeposit: 20_000, maxDeposit: 500_000 },
  COMPANY: { fee: 50_000, minDeposit: 50_000, maxDeposit: 1_000_000 },
  POOL: { fee: 15_000, minDeposit: 0, maxDeposit: 0 },
  /** Part de l'offre (ou des actions) réservée au créateur, versée sur VEST_DAYS jours */
  creatorShare: 0.1,
  vestDays: 7,
  /** Part des frais de trading des joueurs reversée au créateur */
  royaltyShare: 1 / 3,
  /** Créations vivantes (en attente ou acceptées) max par joueur et par type */
  maxPerKind: 2,
  poolMaxFeeBps: 500,
} as const;

export const SECTORS: Record<string, number> = {
  Tech: 30,
  'E-commerce': 40,
  Médias: 30,
  Restauration: 22,
  Distribution: 16,
  Agroalimentaire: 15,
  Énergie: 9,
  Transport: 10,
  Luxe: 26,
  Automobile: 25,
  'Semi-conducteurs': 45,
  'Jeux vidéo': 28,
};

const symbolRe = /^[A-Z0-9]{2,8}$/;
const hex = /^#[0-9a-fA-F]{6}$/;
const baseCreation = {
  name: z.string().trim().min(3).max(40),
  emoji: z.string().refine(isIconName, 'Icône inconnue'),
  color: z.string().regex(hex),
  description: z.string().trim().min(10).max(280),
};
export const creationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('CRYPTO'),
    ...baseCreation,
    symbol: z.string().trim().toUpperCase().regex(symbolRe, '2 à 8 lettres ou chiffres'),
    price: z.number().min(0.000001).max(1000),
    deposit: z.number().min(CREATION.CRYPTO.minDeposit).max(CREATION.CRYPTO.maxDeposit),
  }),
  z.object({
    kind: z.literal('COMPANY'),
    ...baseCreation,
    symbol: z.string().trim().toUpperCase().regex(symbolRe, '2 à 8 lettres ou chiffres'),
    price: z.number().min(1).max(1000),
    deposit: z.number().min(CREATION.COMPANY.minDeposit).max(CREATION.COMPANY.maxDeposit),
    sector: z.string().refine((s) => s in SECTORS, 'Secteur inconnu'),
    payout: z.number().min(0).max(0.8),
  }),
  z.object({
    kind: z.literal('POOL'),
    ...baseCreation,
    network: z.string().trim().toUpperCase(),
    poolType: z.enum(['PPS', 'PPLNS', 'SOLO']),
    feeBps: z.number().int().min(0).max(CREATION.poolMaxFeeBps),
  }),
]);
export type CreationInput = z.infer<typeof creationSchema>;

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
