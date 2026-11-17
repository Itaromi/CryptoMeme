/** Générateur pseudo-aléatoire déterministe (mulberry32) : reproductible pour les tests et simulations. */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mathRng: Rng = Math.random;

/** Loi normale centrée réduite (Box-Muller). */
export function gaussian(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Probabilité qu'un processus de Poisson d'intensité `ratePerDay` se déclenche pendant `dtDays`. */
export function poissonHit(rng: Rng, ratePerDay: number, dtDays: number): boolean {
  return rng() < 1 - Math.exp(-ratePerDay * dtDays);
}

/** Élément au hasard (undefined si la liste est vide). */
export function pick<T>(rng: Rng, xs: readonly T[]): T | undefined {
  return xs[Math.floor(rng() * xs.length)];
}

/** Copie mélangée (Fisher-Yates). */
export function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
