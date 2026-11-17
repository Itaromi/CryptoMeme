'use client';
import { useQuery } from '@tanstack/react-query';
import { useNow } from 'next-intl';
import { stockMarketStatus } from '@cryptomeme/shared';
import { api } from './api';
import type { AssetRow } from './hooks';
import { queryKeys } from './queryKeys';

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

export const useStocks = () => useQuery({ queryKey: queryKeys.stocks, queryFn: () => api<StocksResponse>('/stocks'), refetchInterval: 20_000 });

export const useStock = (symbol: string, enabled = true) =>
  useQuery({ queryKey: queryKeys.stock(symbol), queryFn: () => api<StockDetail>(`/stocks/${symbol}`), refetchInterval: 20_000, enabled });

/** État de la Bourse recalculé chaque seconde côté client (même règle que le serveur). */
export function useMarketClock() {
  const date = useNow({ updateInterval: 1000 });
  return { now: date.getTime(), ...stockMarketStatus(date) };
}

/** Style de chaque verdict de résultats ; le libellé est dans les messages (`stocks.verdict.*`). */
export const VERDICT_CLS: Record<Verdict, string> = {
  BLOWOUT: 'bg-up text-paper',
  BEAT: 'text-up',
  INLINE: 'text-ink-2',
  MISS: 'text-down',
  DISASTER: 'bg-down text-paper',
};

export type HealthLevel = 'solid' | 'fair' | 'fragile' | 'dividendSuspended' | 'bankruptcyRisk';

/** Santé financière par palier ; le libellé est dans les messages (`stocks.health.*`). */
export function healthLevel(h: number): { level: HealthLevel; cls: string } {
  if (h >= 0.75) return { level: 'solid', cls: 'text-up' };
  if (h >= 0.45) return { level: 'fair', cls: '' };
  if (h >= 0.3) return { level: 'fragile', cls: 'text-down' };
  if (h >= 0.15) return { level: 'dividendSuspended', cls: 'font-bold text-down' };
  return { level: 'bankruptcyRisk', cls: 'bg-down px-1 font-bold text-paper' };
}
