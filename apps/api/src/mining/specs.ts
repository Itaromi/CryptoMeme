import { ComponentItem, ComponentModel, Facility, FacilityType, MiningNetwork, MiningPool, Prisma, Rig } from '@prisma/client';
import { ComponentSpec, computeRig, FacilitySpec, Hashrates, NetworkLoad, RackSpec, RigStats } from '@cryptomeme/engine';

export type ItemWithModel = ComponentItem & { model: ComponentModel };
export type RackWithFacility = ItemWithModel & { facility: (Facility & { type: FacilityType }) | null };
export type FullRig = Rig & { parts: ItemWithModel[]; rack: RackWithFacility; pool: MiningPool | null };

/** Relations chargées pour calculer une rig (composants, rack, local, pool). */
export const RIG_INCLUDE = {
  parts: { include: { model: true } },
  rack: { include: { model: true, facility: { include: { type: true } } } },
  pool: true,
} satisfies Prisma.RigInclude;

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

/** Charge d'un réseau au format du moteur. */
export const networkLoad = (n: Pick<MiningNetwork, 'blockReward' | 'npcHashrate' | 'playerHashrate'>): NetworkLoad => ({
  blockReward: Number(n.blockReward),
  npcHashrate: n.npcHashrate,
  playerHashrate: n.playerHashrate,
});

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
