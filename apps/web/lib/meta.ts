'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface Look {
  avatar: string;
  frame: string | null;
  banner: string | null;
  title: string | null;
  nameEffect: string | null;
  badges: Array<{ icon: string; name: string }>;
}

export type CosmeticKind = 'FRAME' | 'BANNER' | 'TITLE' | 'BADGE' | 'NAME_EFFECT';
export type Rarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
export type Tier = 'BRONZE' | 'SILVER' | 'GOLD' | 'LEGENDARY';

export interface ShopItem {
  slug: string;
  kind: CosmeticKind;
  name: string;
  description: string;
  rarity: Rarity;
  price: string | null;
  data: { style?: string; text?: string; icon?: string };
  owned: boolean;
  unlockedBy: string | null;
}

export interface Equipped {
  avatar: string;
  frame: string | null;
  banner: string | null;
  title: string | null;
  nameEffect: string | null;
  badges: string[];
  showcase: string[];
}

export interface ShopResponse {
  avatars: string[];
  equipped: Equipped | null;
  items: ShopItem[];
}

export interface AchievementView {
  slug: string;
  name: string;
  description: string;
  icon: string;
  tier: Tier;
  hidden: boolean;
  rewardSlug: string | null;
  unlockedAt: string | null;
  rarity: number;
}

export interface PublicAchievement {
  slug: string;
  name: string;
  icon: string;
  tier: Tier;
  description: string;
  unlockedAt: string;
}

export const useShop = () => useQuery({ queryKey: ['shop'], queryFn: () => api<ShopResponse>('/shop') });
export const useAchievements = () =>
  useQuery({ queryKey: ['achievements'], queryFn: () => api<{ season: number; players: number; items: AchievementView[] }>('/achievements') });

export const KIND_LABEL: Record<CosmeticKind, string> = {
  FRAME: 'Cadres',
  BANNER: 'Bannières',
  TITLE: 'Titres',
  BADGE: 'Badges',
  NAME_EFFECT: 'Effets de pseudo',
};

export const RARITY: Record<Rarity, { label: string; cls: string }> = {
  COMMON: { label: 'Commun', cls: 'bg-paper-3 text-ink' },
  RARE: { label: 'Rare', cls: 'bg-up-bg text-up' },
  EPIC: { label: 'Épique', cls: 'bg-acid text-acid-ink' },
  LEGENDARY: { label: 'Légendaire', cls: 'bg-ink text-paper' },
};

export const TIER: Record<Tier, { label: string; cls: string }> = {
  BRONZE: { label: 'Bronze', cls: 'bg-[oklch(0.86_0.06_55)]' },
  SILVER: { label: 'Argent', cls: 'bg-paper-3' },
  GOLD: { label: 'Or', cls: 'bg-[oklch(0.88_0.12_90)]' },
  LEGENDARY: { label: 'Légendaire', cls: 'bg-ink text-paper' },
};

/** Apparence d'un objet appliqué à une apparence de base (aperçu en boutique). */
export function withItem(base: Look, item: ShopItem): Look {
  switch (item.kind) {
    case 'FRAME':
      return { ...base, frame: item.data.style ?? null };
    case 'BANNER':
      return { ...base, banner: item.data.style ?? null };
    case 'TITLE':
      return { ...base, title: item.data.text ?? null };
    case 'NAME_EFFECT':
      return { ...base, nameEffect: item.data.style ?? null };
    case 'BADGE':
      return { ...base, badges: [{ icon: item.data.icon ?? '', name: item.name }] };
  }
}
