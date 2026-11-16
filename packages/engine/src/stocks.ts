import { Rng, gaussian } from './random';

/**
 * Fondamentaux d'une société cotée.
 *
 * La valeur « fondamentale » = BPA annualisé × PER cible. Elle sert d'ancrage au processus de prix
 * (Ornstein-Uhlenbeck du moteur de marché) : ce sont les résultats trimestriels qui la font bouger,
 * pas le hasard.
 */
export interface Fundamentals {
  /** Bénéfice par action du dernier trimestre ($). */
  eps: number;
  /** Croissance attendue du BPA par trimestre (log). */
  growth: number;
  /** Dispersion des résultats autour des attentes (log). */
  epsVol: number;
  /** PER « normal » du secteur. */
  pe: number;
  /** Part du bénéfice reversée en dividende (0..1). */
  payout: number;
  /** Santé financière 0..1. En dessous de 0,3 : dividende suspendu ; en dessous de 0,15 : risque de faillite. */
  health: number;
}

export interface EarningsResult {
  consensus: number;
  actual: number;
  /** actual / consensus − 1 */
  surprise: number;
  /** Variation à appliquer à la valeur juste (log). */
  logJump: number;
  /** Dividende par action déclaré (0 si suspendu). */
  dividend: number;
  next: Fundamentals;
  verdict: 'BEAT' | 'INLINE' | 'MISS' | 'DISASTER' | 'BLOWOUT';
}

export const fundamentalValue = (f: Pick<Fundamentals, 'eps' | 'pe'>) => Math.max(f.eps, 0.0001) * 4 * f.pe;

/** BPA attendu par les analystes pour le prochain trimestre (avec leur petite erreur). */
export function consensusEps(f: Fundamentals, rng: Rng) {
  return Math.max(0.0001, f.eps * Math.exp(f.growth + 0.02 * gaussian(rng)));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Publication des résultats trimestriels : beat, miss, révision des perspectives. */
export function reportEarnings(f: Fundamentals, consensus: number, rng: Rng): EarningsResult {
  // Queues épaisses : de temps en temps un trimestre catastrophique ou exceptionnel
  const tail = rng() < 0.06 ? (rng() < 0.5 ? -1 : 1) * (0.25 + rng() * 0.35) : 0;
  // Une société en mauvaise santé a tendance à décevoir
  const bias = (f.health - 0.5) * 0.04;
  const actual = Math.max(0.0001, f.eps * Math.exp(f.growth + bias + f.epsVol * gaussian(rng) + tail));
  const surprise = actual / consensus - 1;

  // Perspectives : la croissance attendue se met à jour (persistance + surprise + bruit)
  const growth = clamp(f.growth * 0.6 + 0.25 * clamp(surprise, -0.5, 0.5) + 0.015 * gaussian(rng), -0.12, 0.15);
  const health = clamp(f.health + clamp(surprise, -0.5, 0.5) * 0.9 + 0.02, 0, 1);
  const next: Fundamentals = { ...f, eps: actual, growth, health };

  // Réaction du marché : surprise amplifiée + révision des perspectives, bornée à ±45 %
  const reaction = clamp(2 * surprise + 3 * (growth - f.growth), -0.45, 0.45);
  const logJump = Math.log(1 + reaction);

  const verdict: EarningsResult['verdict'] =
    surprise <= -0.2 ? 'DISASTER' : surprise <= -0.03 ? 'MISS' : surprise < 0.03 ? 'INLINE' : surprise < 0.2 ? 'BEAT' : 'BLOWOUT';
  const dividend = health >= 0.3 ? actual * f.payout : 0;
  return { consensus, actual, surprise, logJump, dividend, next, verdict };
}

/** Probabilité de faillite par jour selon la santé financière. */
export const bankruptcyRisk = (health: number) => (health < 0.15 ? (0.15 - health) * 2 : 0);

/** Ratio de split pour ramener le prix sous ~500 $ (null si inutile). */
export function splitRatio(price: number, threshold = 2_000): number | null {
  if (price < threshold) return null;
  return [2, 3, 4, 5, 10, 20, 50].find((r) => price / r < 500) ?? 100;
}
