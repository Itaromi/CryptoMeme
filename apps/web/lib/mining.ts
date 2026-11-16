'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export type Kind = 'CPU' | 'GPU' | 'ASIC' | 'PSU' | 'MOTHERBOARD' | 'COOLING' | 'RACK';
export type Hashrates = Partial<Record<string, number>>;

export const KIND_LABEL: Record<Kind, string> = {
  GPU: 'Cartes graphiques',
  CPU: 'Processeurs',
  ASIC: 'ASIC',
  MOTHERBOARD: 'Cartes mères',
  PSU: 'Alimentations',
  COOLING: 'Refroidissement',
  RACK: 'Racks',
};
export const KIND_SHORT: Record<Kind, string> = {
  GPU: 'GPU',
  CPU: 'CPU',
  ASIC: 'ASIC',
  MOTHERBOARD: 'Carte mère',
  PSU: 'Alim',
  COOLING: 'Refroid.',
  RACK: 'Rack',
};
export const ALGO_LABEL: Record<string, string> = {
  SHA_MEME: 'SHA-Meme',
  SCRYPT_LOL: 'Scrypt-LOL',
  KEKHASH: 'KekHash',
  PROOF_OF_VIBE: 'ProofOfVibe',
};
export const POOL_TYPE: Record<string, { label: string; help: string }> = {
  PPS: { label: 'PPS', help: 'Paiement fixe à chaque part. Zéro variance, frais élevés.' },
  PPLNS: { label: 'PPLNS', help: 'Payé selon la chance du pool. Variance modérée, frais bas.' },
  SOLO: { label: 'Solo', help: 'Tout ou rien : tu touches un bloc entier quand tu le trouves.' },
  SHADY: { label: 'Louche', help: 'Bonus juteux, paiement toutes les 6 h… s’il ne part pas avec la caisse.' },
};

export interface Model {
  id: string;
  kind: Kind;
  brand: string;
  name: string;
  tier?: number;
  price: string;
  watts: number;
  hashrates: Hashrates;
  efficiency: number | null;
  socket: string | null;
  gpuSlots: number | null;
  coolingW: number | null;
  rackSlots: number | null;
  airflow: number | null;
  failureRate?: number;
  description?: string | null;
  bestAlgo?: string | null;
  usdPerDay?: number;
}

export interface Item {
  id: string;
  wear: number;
  status: 'OK' | 'BROKEN' | 'DESTROYED';
  resale: number;
  repairCost: number;
  model: Model;
}

export interface RigStatsView {
  valid: boolean;
  errors: string[];
  power: number;
  wallPower: number;
  psuCapacity: number;
  coolingCapacity: number;
  temperature: number;
  throttle: number;
  hashrates: Hashrates;
  failurePerHour: number;
  firePerHour: number;
  elecCostPerDay: number;
}

export interface RigView {
  id: string;
  name: string;
  rackId: string;
  facilityId: string | null;
  running: boolean;
  overclock: number;
  pool: { id: string; name: string; type: string; symbol?: string; fee: number } | null;
  minedTotal: string;
  parts: Item[];
  stats: RigStatsView | null;
  poolHashrate: number;
  estCoinsPerDay: number;
  estUsdPerDay: number;
}

export interface Farm {
  cash: string;
  powerCut: boolean;
  hardwareValue: string;
  summary: { rigs: number; running: number; usdPerDay: number; elecPerDay: number; wallPower: number; federations: Record<string, number> };
  facilities: Array<{
    id: string;
    name: string;
    powerUsed: number;
    type: { id: string; name: string; description: string; price: string; elecPrice: number; maxPowerKw: number; rackSlots: number; ambientTemp: number };
    racks: Array<Item & { rigs: RigView[] }>;
  }>;
  inventory: Item[];
  pending: Array<{ pool: string; symbol: string; amount: string; lastPaidAt: string }>;
  logs: Array<{ type: string; message: string; at: string }>;
}

export interface PoolsInfo {
  networks: Array<{
    symbol: string;
    name: string;
    emoji: string;
    algo: string;
    price: string;
    blockReward: number;
    networkHashrate: number;
    playerHashrate: number;
    usdPerMhDay: number;
    nextHalving: string;
    totalMined: string;
  }>;
  pools: Array<{ id: string; name: string; description: string; symbol: string; emoji: string; type: string; feeBps: number; federation: string | null; scamRisk: number; miners: number }>;
}

export const useFarm = (enabled = true) =>
  useQuery({ queryKey: ['farm'], queryFn: () => api<Farm>('/mining/farm'), enabled, refetchInterval: 15_000 });
export const usePools = () => useQuery({ queryKey: ['pools'], queryFn: () => api<PoolsInfo>('/mining/pools'), staleTime: 30_000 });

/** Hashrate lisible : 1 234 MH/s, 12,3 GH/s, 4,5 TH/s */
export function hash(mh: number) {
  if (!mh) return '0 MH/s';
  if (mh >= 1e6) return `${(mh / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} TH/s`;
  if (mh >= 1e3) return `${(mh / 1e3).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} GH/s`;
  return `${mh.toLocaleString('fr-FR', { maximumFractionDigits: mh < 10 ? 2 : 0 })} MH/s`;
}
export const watts = (w: number) => (w >= 1000 ? `${(w / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kW` : `${Math.round(w)} W`);

export const tempTone = (t: number) => (t >= 95 ? 'text-down font-bold' : t >= 85 ? 'text-down' : t >= 75 ? 'text-[oklch(0.6_0.15_60)]' : 'text-up');

export function modelSpecs(m: Model): string {
  switch (m.kind) {
    case 'PSU':
      return `${m.watts} W · rendement ${Math.round((m.efficiency ?? 0) * 100)} %`;
    case 'MOTHERBOARD':
      return `${m.socket} · ${m.gpuSlots} slot${(m.gpuSlots ?? 0) > 1 ? 's' : ''} GPU`;
    case 'COOLING':
      return `dissipe ${watts(m.coolingW ?? 0)}${m.watts ? ` · ${m.watts} W` : ''}`;
    case 'RACK':
      return `${m.rackSlots} rig${(m.rackSlots ?? 0) > 1 ? 's' : ''} · flux d'air ×${m.airflow}`;
    default: {
      const best = Object.entries(m.hashrates).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
      return `${best ? `${hash(best[1] ?? 0)} ${ALGO_LABEL[best[0]]}` : ''} · ${m.watts} W${m.socket ? ` · ${m.socket}` : ''}`;
    }
  }
}
