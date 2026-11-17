'use client';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { WS_EVENTS, type MarketTick } from '@cryptomeme/shared';
import { api, ApiError } from './api';
import { queryKeys } from './queryKeys';

// ─── Types de réponse ───────────────────────────────────────────────
export interface Me {
  id: string;
  email: string;
  username: string;
  role: 'PLAYER' | 'MODERATOR' | 'ADMIN';
  emailVerifiedAt: string | null;
  bio: string | null;
}

export interface AssetRow {
  symbol: string;
  name: string;
  kind?: 'CRYPTO' | 'STOCK';
  tier: string;
  emoji: string;
  color: string;
  description: string;
  price: string;
  change24h: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
  regime: string;
  frozen: boolean;
  spark: number[];
}

export interface Portfolio {
  season: { number: number; name: string; startingCash: string };
  bank: { name: string; tradingFeeBps: number; color: string; interestMonthly: number };
  cash: string;
  holdingsValue: string;
  /** Valeur de revente du matériel et des locaux de minage */
  hardwareValue: string;
  /** Cash + positions + matériel : même calcul que le classement */
  netWorth: string;
  positions: Array<{
    symbol: string;
    name: string;
    emoji: string;
    color: string;
    quantity: string;
    price: string;
    avgCost: string;
    costBasis: string;
    markValue: string;
    liquidationValue: string;
    unrealizedPnl: string;
    realizedPnl: string;
  }>;
}

// ─── Socket temps réel ──────────────────────────────────────────────
let socket: Socket | null = null;
export function getSocket() {
  // Prod : même origine (le reverse proxy route /socket.io vers l'API). Dev : l'API écoute sur :4000.
  const url = process.env.NEXT_PUBLIC_WS_URL || (window.location.port === '3000' ? 'http://localhost:4000' : undefined);
  socket ??= url ? io(url, { transports: ['websocket'] }) : io({ transports: ['websocket'] });
  return socket;
}

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      try {
        return await api<Me>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

/** Liste des actifs, tenue à jour par le flux WebSocket. */
export function useAssets() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.assets, queryFn: () => api<AssetRow[]>('/market/assets'), staleTime: 30_000 });

  useEffect(() => {
    const s = getSocket();
    const onTick = (ticks: MarketTick[]) => {
      const bySym = new Map(ticks.map((t) => [t.symbol, t]));
      qc.setQueryData<AssetRow[]>(queryKeys.assets, (old) =>
        old?.map((a) => {
          const t = bySym.get(a.symbol);
          return t ? { ...a, price: t.price, change24h: t.change24h, volume24h: Number(t.volume24h), regime: t.regime } : a;
        }),
      );
    };
    s.on(WS_EVENTS.TICK, onTick);
    return () => {
      s.off(WS_EVENTS.TICK, onTick);
    };
  }, [qc]);

  return query;
}

export function usePortfolio(enabled = true) {
  return useQuery({ queryKey: queryKeys.portfolio, queryFn: () => api<Portfolio>('/portfolio'), enabled, refetchInterval: 10_000 });
}
