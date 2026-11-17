/**
 * Simulation hors-ligne du marché PNJ : `pnpm --filter @cryptomeme/engine simulate [jours] [seed]`
 * Affiche, par tier, la distribution des rendements journaliers et des drawdowns.
 */
import Decimal from 'decimal.js';
import { DEFAULT_PARAMS, initialState, stepMarket, spotPrice, createRng, type Pool } from '../src';

const days = Number(process.argv[2] ?? 30);
const seed = Number(process.argv[3] ?? 7);
const TICK = 5000;
const perDay = 86_400_000 / TICK;

for (const tier of Object.keys(DEFAULT_PARAMS) as (keyof typeof DEFAULT_PARAMS)[]) {
  const rng = createRng(seed);
  let pool: Pool = { base: new Decimal(1_000_000), quote: new Decimal(100_000), feeBps: 30 };
  let st = initialState(0.1);
  const daily: number[] = [];
  let peak = 0.1;
  let maxDd = 0;
  let rugs = 0;
  let jumps = 0;
  let prevClose = 0.1;
  for (let d = 0; d < days; d++) {
    for (let i = 0; i < perDay; i++) {
      const r = stepMarket(pool, st, DEFAULT_PARAMS[tier], TICK, rng);
      pool = r.pool;
      st = r.state;
      for (const e of r.events) {
        if (e.type === 'RUG_PULL') rugs++;
        if (e.type === 'JUMP') jumps++;
      }
      const p = spotPrice(pool).toNumber();
      peak = Math.max(peak, p);
      maxDd = Math.max(maxDd, 1 - p / peak);
    }
    const close = spotPrice(pool).toNumber();
    daily.push(close / prevClose - 1);
    prevClose = close;
  }
  const mean = daily.reduce((a, b) => a + b, 0) / daily.length;
  const sd = Math.sqrt(daily.reduce((a, b) => a + (b - mean) ** 2, 0) / daily.length);
  const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
  console.log(
    `${tier.padEnd(10)} prix final ${prevClose.toPrecision(4).padStart(9)} | vol/jour ${pct(sd).padStart(7)} | ` +
      `min ${pct(Math.min(...daily)).padStart(8)} | max ${pct(Math.max(...daily)).padStart(8)} | ` +
      `drawdown max ${pct(maxDd).padStart(7)} | sauts ${jumps} | rugs ${rugs}`,
  );
}
