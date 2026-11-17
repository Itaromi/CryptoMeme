import type { Look, PublicAchievement } from '@/lib/meta';

/** Profil public d'un joueur (`GET /players/:username`). */
export interface Profile {
  username: string;
  bio: string | null;
  joinedAt: string;
  role: 'PLAYER' | 'MODERATOR' | 'ADMIN';
  look: Look;
  achievements: { count: number; total: number; featured: PublicAchievement[]; recent: PublicAchievement[] };
  season: number;
  stats: null | SeasonStatsView;
}

/** Statistiques de la saison en cours (absentes si le joueur n'a pas encore joué). */
export interface SeasonStatsView {
  rank: number;
  players: number;
  netWorth: string;
  peakNetWorth: string;
  performance: number;
  trades: number;
  volume: number;
  fees: number;
  realizedPnl: number;
  winRate: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
  favorite: string | null;
  maxDrawdown: number;
  sharpe: number | null;
  allocation: Array<{ symbol: string; emoji: string; color: string; value: number }>;
  mining: { rigs: number; minedValue: number; electricity: number; hardwareValue: number };
  history: Array<{ t: number; v: number }>;
  flows: { taxes: number; dividends: number; bankNet: number; events: number; shop: number };
  exposure: Exposition;
  heatmap: number[][];
}

export interface Exposition {
  crypto: number;
  stocks: number;
  mining: number;
  cash: number;
}
