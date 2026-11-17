'use client';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from './api';
import { type Format, useFormat } from './format';
import { queryKeys } from './queryKeys';

export type Kind = 'CPU' | 'GPU' | 'ASIC' | 'PSU' | 'MOTHERBOARD' | 'COOLING' | 'RACK';
export type Hashrates = Partial<Record<string, number>>;

/** Familles de composants, dans l'ordre des onglets de la boutique. */
export const KINDS = ['GPU', 'CPU', 'ASIC', 'MOTHERBOARD', 'PSU', 'COOLING', 'RACK'] as const satisfies readonly Kind[];
export const isKind = (v: unknown): v is Kind => typeof v === 'string' && (KINDS as readonly string[]).includes(v);

/** Noms des algorithmes : des noms propres, identiques dans toutes les langues. */
export const ALGO_LABEL: Record<string, string> = {
  SHA_MEME: 'SHA-Meme',
  SCRYPT_LOL: 'Scrypt-LOL',
  KEKHASH: 'KekHash',
  PROOF_OF_VIBE: 'ProofOfVibe',
};

/** Types de pool (libellés et explications dans messages/<langue>/mining.json, clé `poolType`). */
export const POOL_TYPES = ['PPS', 'PPLNS', 'SOLO', 'SHADY'] as const;
export type PoolType = (typeof POOL_TYPES)[number];
export const isPoolType = (v: unknown): v is PoolType => typeof v === 'string' && (POOL_TYPES as readonly string[]).includes(v);

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
  pools: Array<{ id: string; name: string; description: string; symbol: string; emoji: string; type: string; feeBps: number; federation: string | null; scamRisk: number; miners: number; owner: string | null }>;
}

export interface FacilityType {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: string;
  elecPrice: number;
  maxPowerKw: number;
  rackSlots: number;
  ambientTemp: number;
}

export const useFarm = (enabled = true) =>
  useQuery({ queryKey: queryKeys.mining.farm, queryFn: () => api<Farm>('/mining/farm'), enabled, refetchInterval: 15_000 });
export const usePools = () => useQuery({ queryKey: queryKeys.mining.pools, queryFn: () => api<PoolsInfo>('/mining/pools'), staleTime: 30_000 });
export const useFacilityTypes = () =>
  useQuery({ queryKey: queryKeys.mining.facilityTypes, queryFn: () => api<FacilityType[]>('/mining/facility-types') });

export const tempTone = (t: number) => (t >= 95 ? 'text-down font-bold' : t >= 85 ? 'text-down' : t >= 75 ? 'text-[oklch(0.6_0.15_60)]' : 'text-up');

/** Hashrate lisible : 1 234 MH/s, 12,3 GH/s, 4,5 TH/s (séparateurs selon la langue). */
export function hash(mh: number, f: Format) {
  if (!mh) return '0 MH/s';
  if (mh >= 1e6) return `${f.number(mh / 1e6, { maximumFractionDigits: 2 })} TH/s`;
  if (mh >= 1e3) return `${f.number(mh / 1e3, { maximumFractionDigits: 2 })} GH/s`;
  return `${f.number(mh, { maximumFractionDigits: mh < 10 ? 2 : 0 })} MH/s`;
}
/** Puissance lisible : 850 W, 1,25 kW. */
export const watts = (w: number, f: Format) => (w >= 1000 ? `${f.number(w / 1000, { maximumFractionDigits: 2 })} kW` : `${Math.round(w)} W`);
/** Pourcentage depuis un ratio, avec `digits` décimales (0,92 → « 92 % »). */
export const ratioPct = (v: number, f: Format, digits = 0) =>
  f.number(v, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * Libellés et mises en forme du minage dans la langue courante :
 * `const m = useMiningFormat()` puis `m.hash(mh)`, `m.watts(w)`, `m.kindShort('GPU')`, `m.poolType('SHADY')`…
 */
export function useMiningFormat() {
  const t = useTranslations('mining');
  const f = useFormat();
  return useMemo(() => {
    const h = (mh: number) => hash(mh, f);
    const w = (n: number) => watts(n, f);
    return {
      hash: h,
      watts: w,
      pct: (v: number, digits = 0) => ratioPct(v, f, digits),
      kind: (k: Kind) => t(`kind.${k}`),
      kindShort: (k: Kind) => t(`kindShort.${k}`),
      /** Libellé d'un type de pool (le type brut s'il est inconnu). */
      poolType: (type: string) => (isPoolType(type) ? t(`poolType.${type}.label`) : type),
      poolTypeHelp: (type: PoolType) => t(`poolType.${type}.help`),
      /** Caractéristiques d'un modèle en une ligne. */
      modelSpecs(m: Model): string {
        switch (m.kind) {
          case 'PSU':
            return t('specs.psu', { power: w(m.watts), efficiency: ratioPct(m.efficiency ?? 0, f) });
          case 'MOTHERBOARD':
            return t('specs.motherboard', { socket: m.socket ?? '—', slots: m.gpuSlots ?? 0 });
          case 'COOLING':
            return m.watts ? t('specs.coolingPowered', { cooling: w(m.coolingW ?? 0), power: w(m.watts) }) : t('specs.cooling', { cooling: w(m.coolingW ?? 0) });
          case 'RACK':
            return t('specs.rack', { slots: m.rackSlots ?? 0, airflow: f.number(m.airflow ?? 0) });
          default: {
            const best = Object.entries(m.hashrates).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
            return [best ? `${h(best[1] ?? 0)} ${ALGO_LABEL[best[0]] ?? best[0]}` : '', `${m.watts} W`, m.socket].filter(Boolean).join(' · ');
          }
        }
      },
    };
  }, [t, f]);
}
