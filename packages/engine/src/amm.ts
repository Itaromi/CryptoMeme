import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });

/**
 * Pool à produit constant (x · y = k) entre un actif (base) et le cash du jeu (quote).
 * Tous les joueurs ET les traders PNJ tradent contre ce pool : un seul prix.
 */
export interface Pool {
  base: Decimal; // réserve de l'actif
  quote: Decimal; // réserve de cash
  feeBps: number; // frais de swap en points de base
}

export interface SwapResult {
  amountIn: Decimal;
  amountOut: Decimal;
  fee: Decimal; // frais prélevés, dans la devise d'entrée
  avgPrice: Decimal; // cash par unité d'actif
  priceBefore: Decimal;
  priceAfter: Decimal;
  /** Écart entre prix moyen d'exécution et prix spot avant, en bps (toujours ≥ 0). */
  slippageBps: number;
  pool: Pool;
}

export const CASH_DP = 2;
export const QTY_DP = 8;
const BPS = 10_000;

/** Échange impossible. `code` est un code d'erreur stable de l'API (traduit par le site), `message` son repli français. */
export class SwapError extends Error {
  constructor(
    readonly code: 'AMOUNT_ZERO' | 'AMOUNT_TOO_SMALL' | 'QTY_ZERO',
    message: string,
  ) {
    super(message);
  }
}

export function spotPrice(pool: Pool): Decimal {
  return pool.quote.div(pool.base);
}

function feeOf(amount: Decimal, feeBps: number): Decimal {
  return amount.mul(feeBps).div(BPS);
}

function slippage(avg: Decimal, ref: Decimal): number {
  return avg.sub(ref).abs().div(ref).mul(BPS).toNumber();
}

/** Achat : on dépense `cashIn` (frais inclus), on reçoit de l'actif. */
export function buyWithCash(pool: Pool, cashIn: Decimal.Value, feeBps = pool.feeBps): SwapResult {
  const amountIn = new Decimal(cashIn).toDecimalPlaces(CASH_DP, Decimal.ROUND_DOWN);
  if (amountIn.lte(0)) throw new SwapError('AMOUNT_ZERO', 'Montant nul');
  const fee = feeOf(amountIn, feeBps).toDecimalPlaces(CASH_DP, Decimal.ROUND_UP);
  const net = amountIn.sub(fee);
  const k = pool.base.mul(pool.quote);
  const newQuote = pool.quote.add(net);
  const newBase = k.div(newQuote);
  const amountOut = pool.base.sub(newBase).toDecimalPlaces(QTY_DP, Decimal.ROUND_DOWN);
  if (amountOut.lte(0)) throw new SwapError('AMOUNT_TOO_SMALL', 'Montant trop faible');
  const priceBefore = spotPrice(pool);
  const next: Pool = { base: pool.base.sub(amountOut), quote: pool.quote.add(net), feeBps: pool.feeBps };
  const avgPrice = amountIn.div(amountOut);
  return {
    amountIn,
    amountOut,
    fee,
    avgPrice,
    priceBefore,
    priceAfter: spotPrice(next),
    slippageBps: slippage(avgPrice, priceBefore),
    pool: next,
  };
}

/** Vente : on vend `qtyIn` d'actif, on reçoit du cash (frais déduits). */
export function sellForCash(pool: Pool, qtyIn: Decimal.Value, feeBps = pool.feeBps): SwapResult {
  const amountIn = new Decimal(qtyIn).toDecimalPlaces(QTY_DP, Decimal.ROUND_DOWN);
  if (amountIn.lte(0)) throw new SwapError('QTY_ZERO', 'Quantité nulle');
  const k = pool.base.mul(pool.quote);
  const newBase = pool.base.add(amountIn);
  const gross = pool.quote.sub(k.div(newBase));
  const fee = feeOf(gross, feeBps).toDecimalPlaces(CASH_DP, Decimal.ROUND_UP);
  const amountOut = gross.sub(fee).toDecimalPlaces(CASH_DP, Decimal.ROUND_DOWN);
  if (amountOut.lte(0)) throw new SwapError('AMOUNT_TOO_SMALL', 'Montant trop faible');
  const priceBefore = spotPrice(pool);
  // le pool garde les frais (ils restent dans la réserve quote)
  const next: Pool = { base: newBase, quote: pool.quote.sub(amountOut), feeBps: pool.feeBps };
  const avgPrice = amountOut.div(amountIn);
  return {
    amountIn,
    amountOut,
    fee,
    avgPrice,
    priceBefore,
    priceAfter: spotPrice(next),
    slippageBps: slippage(avgPrice, priceBefore),
    pool: next,
  };
}

/**
 * Valeur liquidative : ce qu'on toucherait vraiment en vendant tout maintenant.
 * Utilisée pour le classement → impossible de gonfler son patrimoine avec une coin illiquide.
 */
export function liquidationValue(pool: Pool, qty: Decimal.Value): Decimal {
  const q = new Decimal(qty);
  if (q.lte(0)) return new Decimal(0);
  try {
    return sellForCash(pool, q).amountOut;
  } catch {
    return new Decimal(0);
  }
}

/**
 * Cash à injecter (positif) ou à retirer (négatif) dans le pool pour amener le prix spot à `target`.
 * Avec x·y = k et p = y/x : y' = √(k·p).
 */
export function cashToReachPrice(pool: Pool, target: Decimal.Value): Decimal {
  const k = pool.base.mul(pool.quote);
  return k.mul(target).sqrt().sub(pool.quote);
}
