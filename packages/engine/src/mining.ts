import Decimal from 'decimal.js';
import { type Rng, gaussian, poissonHit } from './random';

/**
 * Moteur de minage (pur, sans I/O).
 *
 * Une rig = carte mère + CPU + GPUs + alimentation + refroidissement, OU un ASIC + alimentation.
 * Elle est posée dans un rack, lui-même installé dans un local (garage, entrepôt, data-center…).
 * Le local fixe le prix de l'électricité, la température ambiante et la puissance max.
 */

export const ALGOS = ['SHA_MEME', 'SCRYPT_LOL', 'KEKHASH', 'PROOF_OF_VIBE'] as const;
export type Algo = (typeof ALGOS)[number];
export type Hashrates = Partial<Record<Algo, number>>; // MH/s

export type ComponentKind = 'CPU' | 'GPU' | 'ASIC' | 'PSU' | 'MOTHERBOARD' | 'COOLING' | 'RACK';

export interface ComponentSpec {
  id: string;
  kind: ComponentKind;
  name: string;
  /** Consommation (W). Pour une alimentation : puissance max délivrable. */
  watts: number;
  hashrates: Hashrates;
  /** Rendement de l'alimentation (0.8 → 0.96). */
  efficiency?: number;
  socket?: string;
  gpuSlots?: number;
  /** Capacité de dissipation (W) d'un refroidissement ou d'un ASIC (ventilos intégrés). */
  coolingW?: number;
  /** Probabilité de panne de base par heure à température nominale. */
  failureRate: number;
  wear: number; // 0 → 1
  broken?: boolean;
}

export interface RackSpec {
  slots: number;
  /** Multiplicateur de dissipation grâce au flux d'air (1 → 1.4). */
  airflow: number;
}

export interface FacilitySpec {
  ambientTemp: number; // °C
  elecPrice: number; // $ / kWh
  maxPowerKw: number;
}

export interface RigStats {
  valid: boolean;
  errors: string[];
  /** Consommation des composants (W) */
  power: number;
  /** Consommation à la prise, pertes de l'alimentation incluses (W) */
  wallPower: number;
  psuCapacity: number;
  coolingCapacity: number;
  temperature: number;
  /** 1 = pleine puissance, < 1 = bridage thermique */
  throttle: number;
  hashrates: Hashrates;
  /** Probabilité qu'au moins un composant tombe en panne dans l'heure */
  failurePerHour: number;
  /** Risque d'incendie par heure (au-delà de 95 °C) */
  firePerHour: number;
  elecCostPerDay: number;
}

export const MAX_OVERCLOCK = 3;
const OC_HASH = 0.12; // +12 % de hashrate par cran
const OC_POWER = 0.22; // +22 % de conso par cran

export function computeRig(parts: ComponentSpec[], overclock: number, facility: FacilitySpec, rack: RackSpec): RigStats {
  const errors: string[] = [];
  const by = (k: ComponentKind) => parts.filter((p) => p.kind === k);
  const mobos = by('MOTHERBOARD');
  const cpus = by('CPU');
  const gpus = by('GPU');
  const asics = by('ASIC');
  const psus = by('PSU');
  const coolers = by('COOLING');
  if (by('RACK').length) errors.push("Un rack ne fait pas partie d'une rig");

  if (asics.length) {
    if (asics.length > 1) errors.push('Un seul ASIC par rig');
    if (mobos.length || cpus.length || gpus.length) errors.push("Un ASIC tourne seul : pas de carte mère, CPU ni GPU");
  } else {
    if (mobos.length !== 1) errors.push('Il faut exactement une carte mère');
    if (cpus.length !== 1) errors.push('Il faut exactement un CPU');
    if (coolers.length !== 1) errors.push('Il faut exactement un refroidissement');
    const mobo = mobos[0];
    if (mobo && cpus[0] && mobo.socket !== cpus[0].socket) errors.push(`CPU incompatible (socket ${cpus[0].socket} ≠ ${mobo.socket})`);
    if (mobo && gpus.length > (mobo.gpuSlots ?? 0)) errors.push(`Trop de GPU : ${gpus.length} pour ${mobo.gpuSlots} slots`);
  }
  if (psus.length !== 1) errors.push('Il faut exactement une alimentation');
  if (coolers.length > 1) errors.push('Un seul refroidissement par rig');

  const oc = Math.max(0, Math.min(MAX_OVERCLOCK, Math.round(overclock)));
  const consumers = parts.filter((p) => p.kind !== 'PSU' && p.kind !== 'RACK' && !p.broken);
  const power = consumers.reduce((s, p) => s + p.watts * (p.kind === 'GPU' || p.kind === 'ASIC' || p.kind === 'CPU' ? 1 + OC_POWER * oc : 1), 0);
  const psu = psus[0];
  const efficiency = psu?.efficiency ?? 0.8;
  const wallPower = power / efficiency;
  const psuCapacity = psu?.watts ?? 0;
  if (psu && power > psuCapacity) errors.push(`Alimentation trop faible : ${Math.round(power)} W demandés pour ${psuCapacity} W`);

  const coolingCapacity =
    (coolers.reduce((s, c) => s + (c.coolingW ?? 0), 0) + asics.reduce((s, a) => s + (a.coolingW ?? 0), 0)) * rack.airflow;
  // Température : l'ambiante + l'échauffement selon la charge thermique relative
  const load = coolingCapacity > 0 ? power / coolingCapacity : 5;
  const temperature = facility.ambientTemp + 45 * load + (load > 1 ? 60 * (load - 1) ** 1.5 : 0);
  const throttle = temperature <= 85 ? 1 : Math.max(0.3, 1 - (temperature - 85) / 30);

  const hashrates: Hashrates = {};
  for (const p of parts) {
    if (p.broken) continue;
    for (const [algo, h] of Object.entries(p.hashrates) as [Algo, number][]) {
      if (!h) continue;
      hashrates[algo] = (hashrates[algo] ?? 0) + h * (1 + OC_HASH * oc) * throttle * (1 - 0.35 * p.wear);
    }
  }

  // Panne : croît exponentiellement avec la température, l'usure et l'overclock
  const thermal = Math.exp((temperature - 70) / 10);
  const survive = consumers.reduce((s, p) => s * (1 - Math.min(0.9, p.failureRate * thermal * (1 + 2 * p.wear) * (1 + 0.5 * oc))), 1);
  const failurePerHour = 1 - survive;
  const firePerHour = temperature > 95 ? Math.min(0.5, 0.01 * Math.exp((temperature - 95) / 8)) : 0;

  return {
    valid: errors.length === 0,
    errors,
    power,
    wallPower,
    psuCapacity,
    coolingCapacity,
    temperature,
    throttle,
    hashrates,
    failurePerHour,
    firePerHour,
    elecCostPerDay: (wallPower / 1000) * 24 * facility.elecPrice,
  };
}

/** Usure gagnée par minute de fonctionnement. ~0,2 %/jour au calme, bien plus en surchauffe + OC. */
export function wearPerMinute(temperature: number, overclock: number): number {
  return (0.002 / 1440) * Math.exp(Math.max(0, temperature - 65) / 15) * (1 + 0.8 * overclock);
}

// ─── Pools ──────────────────────────────────────────────────────────
export type PoolType = 'PPS' | 'PPLNS' | 'SOLO' | 'SHADY';

export interface NetworkState {
  /** Pièces émises par minute pour tout le réseau */
  blockReward: number;
  /** Hashrate des mineurs PNJ (MH/s) */
  npcHashrate: number;
}

/**
 * Paiement d'une minute de minage dans un pool.
 * `share` = part du hashrate du joueur dans le réseau.
 */
export function poolPayout(type: PoolType, feeBps: number, share: number, net: NetworkState, rng: Rng, minutes = 1): number {
  const expected = share * net.blockReward * minutes;
  const fee = 1 - feeBps / 10_000;
  switch (type) {
    case 'PPS':
      return expected * fee;
    case 'PPLNS': {
      // Le pool trouve des blocs avec de la chance : variance modérée
      const luck = Math.exp(0.35 * gaussian(rng) - 0.35 ** 2 / 2);
      return expected * luck * fee;
    }
    case 'SOLO':
      // Tout ou rien : on trouve un bloc entier (= 1 minute d'émission du réseau) avec la probabilité `share`
      return poissonHit(rng, share * minutes, 1) ? net.blockReward * fee : 0;
    case 'SHADY':
      return expected * fee; // fee négatif = bonus ; versé plus tard… si le pool existe encore
  }
}

/** Dérive du hashrate PNJ : de nouveaux mineurs arrivent quand le prix monte, partent quand il baisse. */
export function stepNpcHashrate(npc: number, base: number, price: number, initialPrice: number, minutes = 1): number {
  const target = base * Math.sqrt(Math.max(price, 1e-12) / initialPrice);
  const k = 1 - Math.exp(-minutes / (6 * 60)); // demi-vie ~4 h
  return npc + (target - npc) * k;
}

/** Valeur de revente d'un composant (comptée dans le patrimoine). */
export function resaleValue(price: number, wear: number, broken: boolean): number {
  return price * (broken ? 0.1 : 0.6 * (1 - wear));
}

// ─── Économie du minage (pools, fédérations, matériel) ──────────────
/** Achat de matériel : nombre max d'exemplaires par commande. */
export const MAX_BUY = 20;
/** Nombre max de composants dans une rig. */
export const MAX_RIG_PARTS = 20;
/** Une fédération accorde sa remise à partir de ce nombre de pools distincts utilisés. */
export const FEDERATION_MIN_POOLS = 3;
/** Remise de fédération sur les frais de pool (bps). */
export const FEDERATION_DISCOUNT_BPS = 100;
/** Coût d'une réparation, en fraction du prix catalogue. */
export const REPAIR_RATIO = 0.3;
/** Revente d'un local : fraction du prix d'achat. */
export const FACILITY_RESALE_RATIO = 0.5;

export interface PoolFeeSpec {
  id: string;
  feeBps: number;
  federation: string | null;
}

/** Nombre de pools distincts utilisés par fédération (par les rigs fournies). */
export function federationCounts(rigs: Array<{ pool: Pick<PoolFeeSpec, 'id' | 'federation'> | null }>): Map<string, number> {
  const sets = new Map<string, Set<string>>();
  for (const r of rigs) {
    const fed = r.pool?.federation;
    if (!r.pool || !fed) continue;
    const set = sets.get(fed) ?? new Set<string>();
    set.add(r.pool.id);
    sets.set(fed, set);
  }
  return new Map([...sets].map(([k, v]) => [k, v.size]));
}

/** Frais effectifs d'un pool pour un joueur (bps), remise de fédération comprise. */
export function effectiveFee(pool: Pick<PoolFeeSpec, 'feeBps' | 'federation'>, counts: Map<string, number>): number {
  if (pool.federation && (counts.get(pool.federation) ?? 0) >= FEDERATION_MIN_POOLS) return pool.feeBps - FEDERATION_DISCOUNT_BPS;
  return pool.feeBps;
}

/**
 * Commission du propriétaire d'un pool : `paid` pièces ont été versées au mineur après une retenue de `feeBps`,
 * la part retenue (paid × fee / (1 − fee)) revient au propriétaire au lieu de disparaître.
 */
export function poolOwnerCut(paid: number, feeBps: number): number {
  if (paid <= 0 || feeBps <= 0 || feeBps >= 10_000) return 0;
  return (paid * feeBps) / (10_000 - feeBps);
}

export interface NetworkLoad {
  /** Pièces émises par minute pour tout le réseau */
  blockReward: number;
  npcHashrate: number;
  playerHashrate: number;
}

/** Gain attendu (pièces / minute) pour `hash` MH/s ; `includeSelf` ajoute ce hashrate au réseau (rig pas encore en marche). */
export function coinsPerMinute(hash: number, net: NetworkLoad, includeSelf = false): number {
  const total = net.npcHashrate + net.playerHashrate + (includeSelf ? hash : 0);
  return total > 0 ? (hash / total) * net.blockReward : 0;
}

/** Arrondi au centime inférieur, en décimal exact (même règle que les montants du grand livre). */
const cents = (v: Decimal.Value) => new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();

/** Prix payé pour un composant : prix catalogue × multiplicateur des événements (pénurie…), au centime. */
export function hardwarePrice(catalogPrice: number, multiplier: number): number {
  return cents(new Decimal(catalogPrice).mul(multiplier));
}

export type ItemCondition = 'OK' | 'BROKEN' | 'DESTROYED';

/** Valeur de revente d'un exemplaire (au centime), multiplicateur des événements compris. Carbonisé = 0. */
export function itemResale(catalogPrice: number, wear: number, status: ItemCondition, multiplier: number): number {
  if (status === 'DESTROYED') return 0;
  return cents(new Decimal(resaleValue(catalogPrice, wear, status === 'BROKEN')).mul(multiplier));
}

/** Coût d'une réparation (au centime). */
export function repairCost(catalogPrice: number): number {
  return cents(new Decimal(catalogPrice).mul(REPAIR_RATIO));
}

/** Valeur de revente d'un local (au centime). */
export function facilityResale(price: number): number {
  return cents(new Decimal(price).mul(FACILITY_RESALE_RATIO));
}
