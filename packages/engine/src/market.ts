import Decimal from 'decimal.js';
import { Pool, buyWithCash, cashToReachPrice, sellForCash, spotPrice, SwapResult } from './amm';
import { Rng, gaussian, poissonHit } from './random';

/**
 * Moteur de flux des traders PNJ.
 *
 * Chaque actif a une « valeur juste » (log-prix) qui suit un processus d'Ornstein-Uhlenbeck
 * autour d'un ancrage lent, avec volatilité à régimes et sauts de Poisson.
 * À chaque tick, les PNJ tradent contre le pool AMM pour rapprocher le prix spot de la valeur juste
 * (fraction `npcActivity`) + un bruit de volume. Les joueurs déplacent le prix ; les PNJ le
 * ramènent partiellement, mais l'effet de troupeau (`herding`) fait aussi dériver la valeur juste
 * dans le sens des joueurs → les pumps de joueurs peuvent tenir… un temps.
 */

export type Regime = 'CALM' | 'NORMAL' | 'HYPE' | 'PANIC';

export interface AssetParams {
  /** Volatilité quotidienne du log-prix (0.05 = ~5 %/jour en régime normal). */
  volatility: number;
  /** Vitesse de retour de la valeur juste vers l'ancrage (par jour). */
  meanReversion: number;
  /** Nombre moyen de sauts par jour. */
  jumpIntensity: number;
  /** Écart-type de l'amplitude d'un saut (en log). */
  jumpSize: number;
  /** Probabilité par jour d'un rug pull (chute de ~90 %). */
  rugRisk: number;
  /** Vitesse (par jour) à laquelle les PNJ ramènent le prix vers la valeur juste. 288 ≈ demi-vie de 3,5 min. */
  npcActivity: number;
  /** Vitesse (par jour) à laquelle la valeur juste suit le prix réel (effet troupeau / FOMO). */
  herding: number;
  /** Volume de bruit des PNJ, en fraction de la réserve cash par √jour. */
  noiseVolume: number;
  /** Sensibilité aux régimes hype/panique (0 = ignore, 1 = plein effet). */
  regimeSensitivity: number;
}

export interface MarketState {
  /** log de la valeur juste */
  logFair: number;
  /** log de l'ancrage de long terme (le « narratif » de la coin) */
  logAnchor: number;
  regime: Regime;
}

export interface TickEvent {
  type: 'JUMP' | 'RUG_PULL' | 'REGIME';
  detail: string;
}

export interface TickResult {
  pool: Pool;
  state: MarketState;
  trades: Array<{ side: 'BUY' | 'SELL'; swap: SwapResult }>;
  events: TickEvent[];
}

const REGIMES: Record<Regime, { volMul: number; drift: number; next: Partial<Record<Regime, number>> }> = {
  // drift en log par jour ; next = probabilité de transition par jour
  CALM: { volMul: 0.5, drift: 0, next: { NORMAL: 1.5, HYPE: 0.1 } },
  NORMAL: { volMul: 1, drift: 0, next: { CALM: 0.8, HYPE: 0.4, PANIC: 0.3 } },
  HYPE: { volMul: 2, drift: 0.6, next: { NORMAL: 2, PANIC: 1 } },
  PANIC: { volMul: 2.5, drift: -0.8, next: { NORMAL: 2.5, CALM: 0.5 } },
};

const DAY_MS = 86_400_000;

export function initialState(price: number): MarketState {
  const l = Math.log(price);
  return { logFair: l, logAnchor: l, regime: 'NORMAL' };
}

function nextRegime(rng: Rng, regime: Regime, dtDays: number): Regime {
  for (const [to, rate] of Object.entries(REGIMES[regime].next) as [Regime, number][]) {
    if (poissonHit(rng, rate, dtDays)) return to;
  }
  return regime;
}

export function stepMarket(
  pool: Pool,
  state: MarketState,
  params: AssetParams,
  dtMs: number,
  rng: Rng,
): TickResult {
  const dt = dtMs / DAY_MS;
  const events: TickEvent[] = [];
  const s: MarketState = { ...state };

  // 1. Régime
  const regime = nextRegime(rng, s.regime, dt);
  if (regime !== s.regime) events.push({ type: 'REGIME', detail: `${s.regime} → ${regime}` });
  s.regime = regime;
  const rs = params.regimeSensitivity;
  const r = { volMul: 1 + (REGIMES[regime].volMul - 1) * rs, drift: REGIMES[regime].drift * rs };

  // 2. Effet troupeau : la valeur juste suit en partie le prix réel (actions des joueurs)
  const logSpot = Math.log(spotPrice(pool).toNumber());
  s.logFair += (logSpot - s.logFair) * (1 - Math.exp(-params.herding * dt));

  // 3. Ornstein-Uhlenbeck + régime + bruit
  const sigma = params.volatility * r.volMul;
  s.logFair +=
    params.meanReversion * (s.logAnchor - s.logFair) * dt + r.drift * dt + sigma * Math.sqrt(dt) * gaussian(rng);

  // L'ancrage dérive très lentement (le narratif évolue)
  s.logAnchor += 0.1 * (s.logFair - s.logAnchor) * dt + params.volatility * 0.3 * Math.sqrt(dt) * gaussian(rng);

  // 4. Sauts
  if (poissonHit(rng, params.jumpIntensity, dt)) {
    const j = gaussian(rng) * params.jumpSize;
    s.logFair += j;
    events.push({ type: 'JUMP', detail: `${j >= 0 ? '+' : ''}${((Math.exp(j) - 1) * 100).toFixed(1)} %` });
  }
  if (poissonHit(rng, params.rugRisk, dt)) {
    const drop = Math.log(0.05 + rng() * 0.1); // -85 % à -95 %
    s.logFair += drop;
    s.logAnchor += drop;
    s.regime = 'PANIC';
    events.push({ type: 'RUG_PULL', detail: `${((Math.exp(drop) - 1) * 100).toFixed(0)} %` });
  }

  // 5. Les PNJ tradent contre le pool
  const trades: TickResult['trades'] = [];
  let p = pool;

  const fair = new Decimal(Math.exp(s.logFair));
  const rug = events.some((e) => e.type === 'RUG_PULL');
  const pull = rug ? 1 : 1 - Math.exp(-params.npcActivity * dt);
  const correction = cashToReachPrice(p, fair).mul(pull);
  const noise = p.quote.mul(params.noiseVolume * r.volMul * Math.sqrt(dt) * gaussian(rng));
  const flow = correction.add(noise);

  // garde-fou : jamais plus de 50 % de la réserve en un tick
  const cap = p.quote.mul(0.5);
  const cashFlow = Decimal.min(Decimal.max(flow, cap.neg()), cap);

  try {
    if (cashFlow.gt(0.01)) {
      const swap = buyWithCash(p, cashFlow, 0);
      p = swap.pool;
      trades.push({ side: 'BUY', swap });
    } else if (cashFlow.lt(-0.01)) {
      // vendre la quantité d'actif qui retire ~|cashFlow| de cash
      const target = p.quote.add(cashFlow); // nouvelle réserve quote
      const qty = p.base.mul(p.quote).div(target).sub(p.base);
      const swap = sellForCash(p, qty, 0);
      p = swap.pool;
      trades.push({ side: 'SELL', swap });
    }
  } catch {
    // trade trop petit : on ignore
  }

  return { pool: p, state: s, trades, events };
}

export const DEFAULT_PARAMS: Record<'BLUE_CHIP' | 'MID_CAP' | 'SHITCOIN', AssetParams> = {
  BLUE_CHIP: {
    volatility: 0.04,
    meanReversion: 0.5,
    jumpIntensity: 0.1,
    jumpSize: 0.08,
    rugRisk: 0,
    npcActivity: 400,
    herding: 4,
    noiseVolume: 0.05,
    regimeSensitivity: 0.15,
  },
  MID_CAP: {
    volatility: 0.1,
    meanReversion: 0.8,
    jumpIntensity: 0.4,
    jumpSize: 0.15,
    rugRisk: 0.002,
    npcActivity: 250,
    herding: 10,
    noiseVolume: 0.1,
    regimeSensitivity: 0.5,
  },
  SHITCOIN: {
    volatility: 0.35,
    meanReversion: 1.2,
    jumpIntensity: 2,
    jumpSize: 0.35,
    rugRisk: 0.02,
    npcActivity: 120,
    herding: 25,
    noiseVolume: 0.25,
    regimeSensitivity: 1,
  },
};
