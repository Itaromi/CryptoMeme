import { describe, expect, it } from 'vitest';
import { createRng } from './random';
import { BANKRUPTCY_HEALTH, bankruptcyRisk, consensusEps, DIVIDEND_MIN_HEALTH, fundamentalValue, reportEarnings, splitRatio, type Fundamentals } from './stocks';

const base: Fundamentals = { eps: 1, growth: 0.02, epsVol: 0.08, pe: 20, payout: 0.4, health: 0.7 };

describe('actions', () => {
  it('valeur fondamentale = BPA annualisé × PER', () => {
    expect(fundamentalValue(base)).toBeCloseTo(80);
  });

  it('les résultats sont centrés sur le consensus et la réaction suit la surprise', () => {
    const rng = createRng(42);
    let beats = 0;
    let sumSurprise = 0;
    for (let i = 0; i < 2000; i++) {
      const r = reportEarnings(base, consensusEps(base, rng), rng);
      sumSurprise += r.surprise;
      if (r.surprise > 0) {
        beats++;
        expect(r.logJump).toBeGreaterThan(-0.2);
      }
      expect(Math.abs(Math.exp(r.logJump) - 1)).toBeLessThanOrEqual(0.4500001);
      expect(r.next.health).toBeGreaterThanOrEqual(0);
      expect(r.next.health).toBeLessThanOrEqual(1);
    }
    expect(beats / 2000).toBeGreaterThan(0.4);
    expect(beats / 2000).toBeLessThan(0.7);
    expect(Math.abs(sumSurprise / 2000)).toBeLessThan(0.05);
  });

  it('dividende suspendu quand la santé est mauvaise', () => {
    const rng = createRng(1);
    const sick = { ...base, health: 0, growth: -0.1 };
    const r = reportEarnings(sick, consensusEps(sick, rng) * 3, rng); // grosse déception
    expect(r.dividend).toBe(0);
    expect(bankruptcyRisk(r.next.health)).toBeGreaterThan(0);
    expect(bankruptcyRisk(0.7)).toBe(0);
  });

  it('seuils de santé : faillite possible seulement sous BANKRUPTCY_HEALTH', () => {
    expect(BANKRUPTCY_HEALTH).toBeLessThan(DIVIDEND_MIN_HEALTH);
    expect(bankruptcyRisk(BANKRUPTCY_HEALTH)).toBe(0);
    expect(bankruptcyRisk(BANKRUPTCY_HEALTH - 0.05)).toBeCloseTo(0.1);
  });

  it('split seulement au-dessus du seuil, ramène sous 500 $', () => {
    expect(splitRatio(1500)).toBeNull();
    expect(splitRatio(2400)).toBe(5);
    expect(4100 / splitRatio(4100)!).toBeLessThan(500);
  });
});
