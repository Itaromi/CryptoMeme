import { ComponentItem, ComponentModel, Facility, FacilityType, MiningNetwork, MiningPool, Rig } from '@prisma/client';
import { Algo, ComponentSpec, computeRig, FacilitySpec, Hashrates, RackSpec, RigStats } from '@cryptomeme/engine';

export type ItemWithModel = ComponentItem & { model: ComponentModel };
export type RackWithFacility = ItemWithModel & { facility: (Facility & { type: FacilityType }) | null };
export type FullRig = Rig & { parts: ItemWithModel[]; rack: RackWithFacility; pool: MiningPool | null };

export const FEDERATION_MIN_POOLS = 3;
export const FEDERATION_DISCOUNT_BPS = 100;

export const toSpec = (i: ItemWithModel): ComponentSpec => ({
  id: i.id,
  kind: i.model.kind,
  name: `${i.model.brand} ${i.model.name}`,
  watts: i.model.watts,
  hashrates: i.model.hashrates as Hashrates,
  efficiency: i.model.efficiency ?? undefined,
  socket: i.model.socket ?? undefined,
  gpuSlots: i.model.gpuSlots ?? undefined,
  coolingW: i.model.coolingW ?? undefined,
  failureRate: i.model.failureRate,
  wear: i.wear,
  broken: i.status !== 'OK',
});

export const facilitySpec = (t: FacilityType): FacilitySpec => ({ ambientTemp: t.ambientTemp, elecPrice: t.elecPrice, maxPowerKw: t.maxPowerKw });
export const rackSpec = (m: ComponentModel): RackSpec => ({ slots: m.rackSlots ?? 1, airflow: m.airflow ?? 1 });

export interface Env {
  ambientDelta: number;
  /** Multiplicateur final du prix du kWh (événements × remise bancaire) */
  elecFactor: number;
}
export const NO_ENV: Env = { ambientDelta: 0, elecFactor: 1 };

export function rigStats(rig: FullRig, env: Env = NO_ENV): RigStats | null {
  if (!rig.rack.facility) return null;
  const f = facilitySpec(rig.rack.facility.type);
  return computeRig(
    rig.parts.map(toSpec),
    rig.overclock,
    { ...f, ambientTemp: f.ambientTemp + env.ambientDelta, elecPrice: f.elecPrice * env.elecFactor },
    rackSpec(rig.rack.model),
  );
}

/** Frais effectifs d'un pool pour un joueur, avec la remise de fédération. */
export function effectiveFee(pool: MiningPool, federationCounts: Map<string, number>): number {
  if (pool.federation && (federationCounts.get(pool.federation) ?? 0) >= FEDERATION_MIN_POOLS) {
    return pool.feeBps - FEDERATION_DISCOUNT_BPS;
  }
  return pool.feeBps;
}

/** Nombre de pools distincts utilisés par fédération (rigs en marche ou configurées). */
export function federationCounts(rigs: Array<{ pool: MiningPool | null }>): Map<string, number> {
  const sets = new Map<string, Set<string>>();
  for (const r of rigs) {
    if (!r.pool?.federation) continue;
    if (!sets.has(r.pool.federation)) sets.set(r.pool.federation, new Set());
    sets.get(r.pool.federation)!.add(r.pool.id);
  }
  return new Map([...sets].map(([k, v]) => [k, v.size]));
}

/** Gain attendu en pièces par minute pour `hash` MH/s sur un réseau. */
export function coinsPerMinute(hash: number, net: Pick<MiningNetwork, 'blockReward' | 'npcHashrate' | 'playerHashrate'>, includeSelf = false) {
  const total = net.npcHashrate + net.playerHashrate + (includeSelf ? hash : 0);
  return total > 0 ? (hash / total) * Number(net.blockReward) : 0;
}

export const algoOf = (net: MiningNetwork) => net.algo as Algo;
