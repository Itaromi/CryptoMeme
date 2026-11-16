'use client';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { getSocket } from './hooks';

export interface GameEventView {
  id: string;
  slug: string;
  mood: 'POSITIVE' | 'NEGATIVE' | 'MARKET';
  status: 'SCHEDULED' | 'ACTIVE' | 'DONE' | 'CANCELLED';
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  result: { affected: number; total: number; detail?: string } | null;
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
  amount: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export const MOOD_STYLE: Record<GameEventView['mood'], { bg: string; label: string }> = {
  NEGATIVE: { bg: 'bg-down-bg', label: 'Mauvaise nouvelle' },
  POSITIVE: { bg: 'bg-up-bg', label: 'Bonne nouvelle' },
  MARKET: { bg: 'bg-acid', label: 'Marché' },
};

/** Fil des événements, rafraîchi en direct quand le serveur signale un changement. */
export function useEvents() {
  const qc = useQueryClient();
  useEffect(() => {
    const s = getSocket();
    const onChange = () => {
      qc.invalidateQueries({ queryKey: ['events-feed'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    };
    s.on('events:changed', onChange);
    return () => {
      s.off('events:changed', onChange);
    };
  }, [qc]);
  return useQuery({
    queryKey: ['events-feed'],
    queryFn: () => api<{ upcoming: GameEventView[]; active: GameEventView[]; recent: GameEventView[] }>('/events'),
    refetchInterval: 60_000,
  });
}

export const useNotifications = (enabled: boolean) =>
  useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ unread: number; items: NotificationView[] }>('/notifications'),
    enabled,
    refetchInterval: 30_000,
  });

export const useBanks = () =>
  useQuery({
    queryKey: ['banks'],
    queryFn: () => api<{ current: { bankId: string; since: string; canSwitchAt: string } | null; netWorth: string | null; banks: BankView[] }>('/banks'),
  });

/** « dans 1 h 05 », « dans 32 s » */
export function countdown(to: string | Date, now = Date.now()) {
  const s = Math.max(0, Math.round((new Date(to).getTime() - now) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, '0')}`;
}
