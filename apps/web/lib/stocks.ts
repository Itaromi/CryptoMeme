'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { stockMarketStatus } from '@cryptomeme/shared';
import { api } from './api';
import type { AssetRow } from './hooks';

export type CompanyStatus = 'LISTED' | 'TAKEOVER' | 'ACQUIRED' | 'BANKRUPT';

export interface CompanyView {
  sector: string;
  ceo: string;
  eps: number;
  pe: number | null;
  fairPe: number;
  fundamental: number;
  dividendYield: number;
  payout: number;
  health: number;
  growth: number;
  quarter: number;
  nextEarningsAt: string;
  consensus: number;
  status: CompanyStatus;
  statusSince: string;
  offer: { price: string; by: string; endsAt: string } | null;
}

export interface StockRow extends AssetRow {
  company: CompanyView;
}

export interface ReportView {
  quarter: number;
  consensus: number;
  actual: number;
  surprise: number;
  verdict: Verdict;
  reaction: number;
  dividend: number;
  headline: string;
  at: string;
}

export type Verdict = 'BLOWOUT' | 'BEAT' | 'INLINE' | 'MISS' | 'DISASTER';

export interface StocksResponse {
  market: { open: boolean; nextChangeAt: number };
  stocks: StockRow[];
  recentReports: Array<Pick<ReportView, 'quarter' | 'verdict' | 'surprise' | 'reaction' | 'headline' | 'at'> & { symbol: string; name: string; emoji: string }>;
}

export interface StockDetail extends CompanyView {
  market: { open: boolean; nextChangeAt: number };
  reports: ReportView[];
  dividends: Array<{ perShare: string; recordAt: string; paidAt: string | null; total: string; holders: number }>;
}

export const useStocks = () => useQuery({ queryKey: ['stocks'], queryFn: () => api<StocksResponse>('/stocks'), refetchInterval: 20_000 });

export const useStock = (symbol: string, enabled = true) =>
  useQuery({ queryKey: ['stock', symbol], queryFn: () => api<StockDetail>(`/stocks/${symbol}`), refetchInterval: 20_000, enabled });

/** État de la Bourse recalculé chaque seconde côté client (même règle que le serveur). */
export function useMarketClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return { now, ...stockMarketStatus(new Date(now)) };
}

export const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  BLOWOUT: { label: 'Explosion', cls: 'bg-up text-paper' },
  BEAT: { label: 'Au-dessus', cls: 'text-up' },
  INLINE: { label: 'Conforme', cls: 'text-ink-2' },
  MISS: { label: 'Déception', cls: 'text-down' },
  DISASTER: { label: 'Catastrophe', cls: 'bg-down text-paper' },
};

export const STATUS_LABEL: Record<CompanyStatus, string> = {
  LISTED: 'Cotée',
  TAKEOVER: 'OPA en cours',
  ACQUIRED: 'Rachetée',
  BANKRUPT: 'En faillite',
};

/** Santé financière lisible. */
export function healthLabel(h: number): { label: string; cls: string } {
  if (h >= 0.75) return { label: 'Solide', cls: 'text-up' };
  if (h >= 0.45) return { label: 'Correcte', cls: '' };
  if (h >= 0.3) return { label: 'Fragile', cls: 'text-down' };
  if (h >= 0.15) return { label: 'Dividende suspendu', cls: 'font-bold text-down' };
  return { label: 'Risque de faillite', cls: 'bg-down px-1 font-bold text-paper' };
}

export const pctFr = (x: number, digits = 1) => `${x >= 0 ? '+' : ''}${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits })} %`;
