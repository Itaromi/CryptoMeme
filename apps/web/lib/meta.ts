'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { queryKeys } from './queryKeys';

export interface Look {
  avatar: string;
  frame: string | null;
  banner: string | null;
  title: string | null;
  /** Slug du titre équipé : le titre est traduit par slug, `title` est le repli */
  titleSlug: string | null;
  nameEffect: string | null;
  badges: Array<{ slug: string; icon: string; name: string }>;
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
  /** Succès qui offre l'objet (null : secret, ou objet en vente) */
  unlockedBy: { slug: string; name: string } | null;
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
  /** Succès caché pas encore débloqué : nom et description masqués */
  secret: boolean;
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

export const useShop = () => useQuery({ queryKey: queryKeys.shop, queryFn: () => api<ShopResponse>('/shop') });
export const useAchievements = () =>
  useQuery({ queryKey: queryKeys.achievements, queryFn: () => api<{ season: number; players: number; items: AchievementView[] }>('/achievements') });

// ─── Classement ─────────────────────────────────────────────────────
export const LEADERBOARD_CATEGORIES = ['general', 'day', 'week', 'trader', 'miner', 'best-trade', 'worst-trade'] as const;
export type LeaderboardCategory = (typeof LEADERBOARD_CATEGORIES)[number];

export interface LeaderboardView {
  season: { number: number; name: string; status: string; startsAt: string; endsAt: string | null };
  category: LeaderboardCategory;
  unit: 'money' | 'pct';
  entries: Array<{ rank: number; username: string; look?: Look; netWorth: string; performance: number; value: number }>;
}

/** Classement d'une saison (`null` : saison en cours) et d'une catégorie ; partagé par l'accueil et la page Classement. */
export const useLeaderboard = (season: number | null, category: LeaderboardCategory) =>
  useQuery({
    queryKey: queryKeys.leaderboard.list(season, category),
    queryFn: () => api<LeaderboardView>(`/leaderboard?category=${category}${season ? `&season=${season}` : ''}`),
    refetchInterval: 30_000,
  });

/** Couleur des étiquettes de rareté (libellés : messages `shop.rarity.*`). */
export const RARITY_CLS: Record<Rarity, string> = {
  COMMON: 'bg-paper-3 text-ink',
  RARE: 'bg-up-bg text-up',
  EPIC: 'bg-acid text-acid-ink',
  LEGENDARY: 'bg-ink text-paper',
};

/** Couleur des paliers de succès (libellés : messages `achievements.tier.*`). */
export const TIER_CLS: Record<Tier, string> = {
  BRONZE: 'bg-[oklch(0.86_0.06_55)]',
  SILVER: 'bg-paper-3',
  GOLD: 'bg-[oklch(0.88_0.12_90)]',
  LEGENDARY: 'bg-ink text-paper',
};

/** Apparence d'un objet appliqué à une apparence de base (aperçu en boutique). */
export function withItem(base: Look, item: ShopItem): Look {
  switch (item.kind) {
    case 'FRAME':
      return { ...base, frame: item.data.style ?? null };
    case 'BANNER':
      return { ...base, banner: item.data.style ?? null };
    case 'TITLE':
      return { ...base, title: item.data.text ?? null, titleSlug: item.slug };
    case 'NAME_EFFECT':
      return { ...base, nameEffect: item.data.style ?? null };
    case 'BADGE':
      return { ...base, badges: [{ slug: item.slug, icon: item.data.icon ?? '', name: item.name }] };
  }
}
