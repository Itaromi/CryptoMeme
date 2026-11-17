'use client';
import { useTranslations } from 'next-intl';
import type { AssetTier } from '@cryptomeme/shared';

const TIERS = ['BLUE_CHIP', 'MID_CAP', 'SHITCOIN'] as const satisfies readonly AssetTier[];
const REGIMES = ['CALM', 'NORMAL', 'HYPE', 'PANIC'] as const;
type Regime = (typeof REGIMES)[number];

const isTier = (v: string): v is AssetTier => (TIERS as readonly string[]).includes(v);
const isRegime = (v: string): v is Regime => (REGIMES as readonly string[]).includes(v);

/** Libellés traduits de la catégorie et de l'ambiance d'un actif (valeur brute si l'API en invente une nouvelle). */
export function useAssetLabels() {
  const t = useTranslations('common');
  return {
    tier: (v: string) => (isTier(v) ? t(`tier.${v}`) : v),
    regime: (v: string) => (isRegime(v) ? t(`regime.${v}`) : v),
  };
}

/** Couleur de l'ambiance de marché. */
export const regimeCls = (regime: string) => (regime === 'PANIC' ? 'text-down' : regime === 'HYPE' ? 'text-up' : '');
