'use client';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type GameText, WS_EVENTS } from '@cryptomeme/shared';
import { api } from './api';
import { getSocket } from './hooks';
import { queryKeys } from './queryKeys';

export interface GameEventView {
  id: string;
  slug: string;
  mood: 'POSITIVE' | 'NEGATIVE' | 'MARKET';
  status: 'SCHEDULED' | 'ACTIVE' | 'DONE' | 'CANCELLED';
  title: string;
  description: string;
  /** Objet { title, description } des messages (repli : title et description ci-dessus) */
  text: GameText | null;
  startsAt: string;
  endsAt: string | null;
  result: { affected: number; total: number; detail?: string; detailText?: GameText } | null;
  byAdmin: boolean;
}

export interface BankView {
  id: string;
  slug: string;
  name: string;
  description: string;
  color: string;
  monthlyFee: string;
  openingFee: string;
  minNetWorth: string;
  tradingFeeBps: number;
  interestMonthly: number;
  elecDiscount: number;
  insuranceRate: number;
  taxShield: number;
  hackShield: number;
  failRiskPerDay: number;
  depositGuarantee: string | null;
  isDefault: boolean;
  clients?: number;
  available?: boolean;
}

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  /** Objet { title, body } des messages (null : notification antérieure aux clés) */
  text: GameText | null;
  amount: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Couleur de fond selon le ton de l'événement (libellés : messages/<langue>/events.json, clé `mood`). */
export const MOOD_STYLE: Record<GameEventView['mood'], { bg: string }> = {
  NEGATIVE: { bg: 'bg-down-bg' },
  POSITIVE: { bg: 'bg-up-bg' },
  MARKET: { bg: 'bg-acid' },
};

/** Fil des événements de jeu, rafraîchi en direct quand le serveur signale un changement. */
export function useEvents() {
  const qc = useQueryClient();
  useEffect(() => {
    const s = getSocket();
    // Un événement touche le cash, les banques (faillite) ou la ferme (canicule, coupure) : on recharge tout ça.
    const touched = [queryKeys.gameEvents, queryKeys.notifications, queryKeys.portfolio, queryKeys.banks, queryKeys.mining.farm];
    const refresh = () => Promise.all(touched.map((queryKey) => qc.invalidateQueries({ queryKey })));
    // Un écouteur de socket ne peut pas être attendu : l'échec d'un rafraîchissement est sans conséquence.
    const onChange = () => void refresh();
    s.on(WS_EVENTS.EVENTS_CHANGED, onChange);
    return () => {
      s.off(WS_EVENTS.EVENTS_CHANGED, onChange);
    };
  }, [qc]);
  return useQuery({
    queryKey: queryKeys.gameEvents,
    queryFn: () => api<{ upcoming: GameEventView[]; active: GameEventView[]; recent: GameEventView[] }>('/events'),
    refetchInterval: 60_000,
  });
}

/** Événement de marché (rug pull, saut de prix, changement d'ambiance) tel que renvoyé par l'API. */
export interface MarketEventView {
  symbol: string;
  emoji: string;
  type: string;
  detail: string;
  text: GameText | null;
  at: string;
}

/** Brèves du marché. */
export const useMarketEvents = () =>
  useQuery({ queryKey: queryKeys.marketEvents, queryFn: () => api<MarketEventView[]>('/market/events'), refetchInterval: 15_000 });

export const useNotifications = (enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => api<{ unread: number; items: NotificationView[] }>('/notifications'),
    enabled,
    refetchInterval: 30_000,
  });

export const useBanks = () =>
  useQuery({
    queryKey: queryKeys.banks,
    queryFn: () => api<{ current: { bankId: string; since: string; canSwitchAt: string } | null; netWorth: string | null; banks: BankView[] }>('/banks'),
  });

/**
 * Durée restante : « 1 h 05 », « 32 s » (unités communes au français et à l'anglais).
 * Dans un composant, passe `now` depuis `useNow()` de next-intl : la valeur par défaut n'est là que pour le code hors rendu.
 */
