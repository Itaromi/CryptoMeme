/**
 * Clés TanStack Query, en un seul endroit. Les préfixes servent à invalider une famille entière
 * (ex. `queryKeys.admin.all` invalide tout le back-office).
 */
export const queryKeys = {
  me: ['me'] as const,
  assets: ['assets'] as const,
  asset: (symbol: string) => ['asset', symbol] as const,
  candles: (symbol: string, interval: string) => ['candles', symbol, interval] as const,
  quote: (symbol: string, side: string, amount: string) => ['quote', symbol, side, amount] as const,
  portfolio: ['portfolio'] as const,
  history: ['history'] as const,
  notifications: ['notifications'] as const,
  /** Événements de marché (trades, brèves) */
  marketEvents: ['market-events'] as const,
  /** Événements de jeu (flat tax, krach…) */
  gameEvents: ['game-events'] as const,
  stocks: ['stocks'] as const,
  stock: (symbol: string) => ['stock', symbol] as const,
  mining: {
    all: ['mining'] as const,
    farm: ['mining', 'farm'] as const,
    pools: ['mining', 'pools'] as const,
    facilityTypes: ['mining', 'facility-types'] as const,
    catalog: (filters: Record<string, string | number>) => ['mining', 'catalog', filters] as const,
    rigPreview: (rackId: string | null, partIds: readonly string[]) => ['mining', 'rig-preview', rackId, partIds] as const,
  },
  banks: ['banks'] as const,
  shop: ['shop'] as const,
  achievements: ['achievements'] as const,
  seasons: ['seasons'] as const,
  leaderboard: {
    all: ['leaderboard'] as const,
    list: (season: number | null, category: string) => ['leaderboard', season, category] as const,
    myRank: ['leaderboard', 'my-rank'] as const,
  },
  profile: {
    all: ['profile'] as const,
    one: (username: string) => ['profile', username] as const,
  },
  creations: {
    all: ['creations'] as const,
    config: ['creations', 'config'] as const,
    mine: ['creations', 'mine'] as const,
  },
  admin: {
    all: ['admin'] as const,
    overview: ['admin', 'overview'] as const,
    users: (q: string) => ['admin', 'users', q] as const,
    user: (id: string) => ['admin', 'user', id] as const,
    assets: ['admin', 'assets'] as const,
    audit: ['admin', 'audit'] as const,
    banks: ['admin', 'banks'] as const,
    eventTypes: ['admin', 'event-types'] as const,
    mining: ['admin', 'mining'] as const,
    creations: (status?: string) => ['admin', 'creations', status ?? 'ALL'] as const,
  },
};
