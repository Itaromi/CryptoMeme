import { describe, expect, it } from 'vitest';
import {
  type ComponentSpec,
  coinsPerMinute,
  computeRig,
  effectiveFee,
  facilityResale,
  FEDERATION_DISCOUNT_BPS,
  FEDERATION_MIN_POOLS,
  federationCounts,
  hardwarePrice,
  itemResale,
  poolOwnerCut,
  poolPayout,
  REPAIR_RATIO,
  repairCost,
  stepNpcHashrate,
  wearPerMinute,
} from './mining';
import { createRng } from './random';

const part = (p: Partial<ComponentSpec> & Pick<ComponentSpec, 'kind'>): ComponentSpec => ({
  id: Math.random().toString(),
  name: p.kind,
  watts: 0,
  hashrates: {},
  failureRate: 0.0005,
  wear: 0,
  ...p,
});
const garage = { ambientTemp: 25, elecPrice: 2, maxPowerKw: 5 };
const rack = { slots: 4, airflow: 1 };
const gpuRig = (gpus: number, cooling = 1500, psuW = 1600) => [
  part({ kind: 'MOTHERBOARD', watts: 40, socket: 'AM5', gpuSlots: 6 }),
  part({ kind: 'CPU', watts: 90, socket: 'AM5', hashrates: { PROOF_OF_VIBE: 10 } }),
  ...Array.from({ length: gpus }, () => part({ kind: 'GPU', watts: 220, hashrates: { SCRYPT_LOL: 100, KEKHASH: 50 } })),
  part({ kind: 'PSU', watts: psuW, efficiency: 0.9 }),
  part({ kind: 'COOLING', watts: 20, coolingW: cooling }),
];

describe('computeRig', () => {
  it('rig GPU valide additionne les hashrates', () => {
    const r = computeRig(gpuRig(4), 0, garage, rack);
    expect(r.valid).toBe(true);
    expect(r.hashrates.SCRYPT_LOL).toBeCloseTo(400);
    expect(r.wallPower).toBeGreaterThan(r.power);
  });

  it('refuse une alimentation trop faible et un socket incompatible', () => {
    const parts = gpuRig(6, 3000, 800);
    parts[1].socket = 'LGA1700';
    const r = computeRig(parts, 0, garage, rack);
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toMatch(/Alimentation/);
    expect(r.errors.join()).toMatch(/socket/);
  });

  it('refroidissement insuffisant ⇒ surchauffe, bridage et risque de panne', () => {
    const cool = computeRig(gpuRig(4, 2000), 0, garage, rack);
    const hot = computeRig(gpuRig(4, 500), 0, garage, rack);
    expect(hot.temperature).toBeGreaterThan(cool.temperature);
    expect(hot.throttle).toBeLessThan(1);
    expect(hot.failurePerHour).toBeGreaterThan(cool.failurePerHour * 5);
    expect(hot.firePerHour).toBeGreaterThan(0);
  });

  it("l'overclock augmente hashrate, conso et usure", () => {
    const a = computeRig(gpuRig(2), 0, garage, rack);
    const b = computeRig(gpuRig(2), 2, garage, rack);
    expect(b.hashrates.SCRYPT_LOL!).toBeGreaterThan(a.hashrates.SCRYPT_LOL!);
    expect(b.power).toBeGreaterThan(a.power);
    expect(wearPerMinute(b.temperature, 2)).toBeGreaterThan(wearPerMinute(a.temperature, 0));
  });

  it('un ASIC ne se combine pas avec une carte mère', () => {
    const r = computeRig([part({ kind: 'ASIC', watts: 3000, coolingW: 3500, hashrates: { SHA_MEME: 1e5 } }), part({ kind: 'MOTHERBOARD', socket: 'AM5', gpuSlots: 2 }), part({ kind: 'PSU', watts: 3600, efficiency: 0.93 })], 0, garage, rack);
    expect(r.valid).toBe(false);
  });
});

describe('pools', () => {
  const net = { blockReward: 100, npcHashrate: 1000 };
  it('PPS = espérance moins frais, PPLNS a la même espérance', () => {
    const rng = createRng(3);
    expect(poolPayout('PPS', 400, 0.1, net, rng)).toBeCloseTo(9.6);
    let s = 0;
    for (let i = 0; i < 20000; i++) s += poolPayout('PPLNS', 0, 0.1, net, rng);
    expect(s / 20000).toBeCloseTo(10, 0);
  });
  it('SOLO : tout ou rien, même espérance', () => {
    const rng = createRng(9);
    let s = 0;
    let zeros = 0;
    for (let i = 0; i < 50000; i++) {
      const p = poolPayout('SOLO', 0, 0.02, net, rng);
      s += p;
      if (p === 0) zeros++;
    }
    expect(zeros / 50000).toBeGreaterThan(0.95);
    expect(s / 50000).toBeGreaterThan(1.6);
    expect(s / 50000).toBeLessThan(2.4);
  });
  it('les PNJ suivent le prix', () => {
    let npc = 1000;
    for (let i = 0; i < 3000; i++) npc = stepNpcHashrate(npc, 1000, 4, 1);
    expect(npc).toBeCloseTo(2000, -1);
  });
});

describe('économie du minage', () => {
  const pool = (id: string, federation: string | null, feeBps = 200) => ({ id, federation, feeBps });

  it('compte les pools distincts par fédération', () => {
    const counts = federationCounts([
      { pool: pool('a', 'F') },
      { pool: pool('a', 'F') },
      { pool: pool('b', 'F') },
      { pool: pool('c', null) },
      { pool: null },
    ]);
    expect(counts.get('F')).toBe(2);
    expect(counts.size).toBe(1);
  });

  it('la remise de fédération s’applique à partir de 3 pools distincts', () => {
    const p = pool('a', 'F', 250);
    expect(effectiveFee(p, new Map([['F', FEDERATION_MIN_POOLS - 1]]))).toBe(250);
    expect(effectiveFee(p, new Map([['F', FEDERATION_MIN_POOLS]]))).toBe(250 - FEDERATION_DISCOUNT_BPS);
    expect(effectiveFee(pool('x', null, 250), new Map([['F', 10]]))).toBe(250);
  });

  it('la commission du propriétaire reconstitue exactement la retenue du pool', () => {
    // brut 100 pièces, 2 % de frais → 98 versées au mineur, 2 au propriétaire
    expect(poolOwnerCut(98, 200)).toBeCloseTo(2);
    expect(poolOwnerCut(0, 200)).toBe(0);
    expect(poolOwnerCut(50, 0)).toBe(0);
    expect(poolOwnerCut(50, -100)).toBe(0); // bonus (pool louche) : rien à reverser
    expect(poolOwnerCut(50, 10_000)).toBe(0);
  });

  it('gain par minute proportionnel à la part du réseau', () => {
    const net = { blockReward: 10, npcHashrate: 900, playerHashrate: 100 };
    expect(coinsPerMinute(100, net)).toBeCloseTo(1);
    expect(coinsPerMinute(1000, net, true)).toBeCloseTo(5);
    expect(coinsPerMinute(1, { blockReward: 10, npcHashrate: 0, playerHashrate: 0 })).toBe(0);
  });

  it('prix, revente et réparation du matériel au centime', () => {
    expect(hardwarePrice(199.99, 1.5)).toBe(299.98); // 299.985 → centime inférieur
    expect(itemResale(1000, 0.5, 'OK', 1)).toBe(300);
    expect(itemResale(1000, 0.5, 'OK', 2)).toBe(600);
    expect(itemResale(1000, 0, 'BROKEN', 1)).toBe(100);
    expect(itemResale(1000, 0, 'DESTROYED', 3)).toBe(0);
    expect(repairCost(1000)).toBe(1000 * REPAIR_RATIO);
    expect(facilityResale(15_000)).toBe(7_500);
  });
});
