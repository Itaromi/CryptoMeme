import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import {
  type Pool,
  buyWithCash,
  sellForCash,
  spotPrice,
  liquidationValue,
  cashToReachPrice,
} from './amm';
import { DEFAULT_PARAMS, initialState, stepMarket } from './market';
import { createRng, pick, shuffle } from './random';

const pool = (): Pool => ({ base: new Decimal(1_000_000), quote: new Decimal(100_000), feeBps: 30 });

describe('AMM', () => {
  it('prix spot = quote / base', () => {
    expect(spotPrice(pool()).toNumber()).toBe(0.1);
  });

  it('acheter fait monter le prix, vendre le fait baisser', () => {
    const b = buyWithCash(pool(), 1000);
    expect(b.priceAfter.gt(b.priceBefore)).toBe(true);
    const s = sellForCash(pool(), 10_000);
    expect(s.priceAfter.lt(s.priceBefore)).toBe(true);
  });

  it('k ne diminue jamais (les frais restent dans le pool)', () => {
    const p = pool();
    const k0 = p.base.mul(p.quote);
    const b = buyWithCash(p, 5000);
    expect(b.pool.base.mul(b.pool.quote).gte(k0)).toBe(true);
    const s = sellForCash(b.pool, b.amountOut);
    expect(s.pool.base.mul(s.pool.quote).gte(k0)).toBe(true);
  });

  it('aller-retour immédiat = perte (frais + arrondis), jamais de gain', () => {
    const b = buyWithCash(pool(), 1000);
    const s = sellForCash(b.pool, b.amountOut);
    expect(s.amountOut.lt(1000)).toBe(true);
  });

  it('gros ordre = plus de slippage', () => {
    const small = buyWithCash(pool(), 100);
    const big = buyWithCash(pool(), 20_000);
    expect(big.slippageBps).toBeGreaterThan(small.slippageBps);
  });

  it('valeur liquidative < quantité × prix spot', () => {
    const qty = 200_000;
    expect(liquidationValue(pool(), qty).lt(spotPrice(pool()).mul(qty))).toBe(true);
  });

  it('cashToReachPrice atteint le prix cible', () => {
    const p = pool();
    const cash = cashToReachPrice(p, 0.2);
    const b = buyWithCash(p, cash, 0);
    expect(b.priceAfter.toNumber()).toBeCloseTo(0.2, 4);
  });
});

describe('marché PNJ', () => {
  it('reste positif et borné sur 2 jours simulés (tous tiers)', { timeout: 60_000 }, () => {
    for (const tier of ['BLUE_CHIP', 'MID_CAP', 'SHITCOIN'] as const) {
      const rng = createRng(42);
      let p = pool();
      let st = initialState(0.1);
      for (let i = 0; i < 2 * 17_280; i++) {
        const r = stepMarket(p, st, DEFAULT_PARAMS[tier], 5000, rng);
        p = r.pool;
        st = r.state;
      }
      const price = spotPrice(p).toNumber();
      expect(price).toBeGreaterThan(0);
      expect(Number.isFinite(price)).toBe(true);
    }
  });

  it('un pump de joueur est en partie résorbé par les PNJ', () => {
    const rng = createRng(1);
    const params = { ...DEFAULT_PARAMS.BLUE_CHIP, volatility: 0, jumpIntensity: 0, noiseVolume: 0 };
    let p = buyWithCash(pool(), 30_000).pool; // pump massif
    let st = initialState(0.1);
    const pumped = spotPrice(p).toNumber();
    for (let i = 0; i < 720; i++) {
      const r = stepMarket(p, st, params, 5000, rng);
      p = r.pool;
      st = r.state;
    }
    const after = spotPrice(p).toNumber();
    expect(after).toBeLessThan(pumped);
    expect(after).toBeGreaterThan(0.1); // l'effet troupeau en garde une partie
  });
});

describe('hasard', () => {
  it('pick renvoie un élément de la liste, undefined si vide', () => {
    const rng = createRng(7);
    const xs = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) expect(xs).toContain(pick(rng, xs));
    expect(pick(rng, [])).toBeUndefined();
  });

  it('shuffle garde les mêmes éléments sans modifier l’original', () => {
    const xs = [1, 2, 3, 4, 5, 6];
    const out = shuffle(createRng(3), xs);
    expect([...out].sort()).toEqual(xs);
    expect(xs).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
