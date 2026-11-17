import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Agrégats de trading d'un wallet. */
export interface TradeStats {
  trades: number;
  /** Volume échangé ($) */
  volume: number;
  fees: number;
  /** Plus-values réalisées cumulées */
  realizedPnl: number;
  /** Ventes avec plus-value calculée */
  closed: number;
  /** Ventes gagnantes */
  wins: number;
  bestTrade: number | null;
  worstTrade: number | null;
}

/**
 * Source unique des statistiques de jeu calculées depuis les trades et le grand livre
 * (classements par catégorie, succès, profil public).
 */
@Injectable()
export class WalletStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async tradeStats(walletIds: string[]): Promise<Map<string, TradeStats>> {
    const out = new Map<string, TradeStats>();
    if (!walletIds.length) return out;
    const inW = { walletId: { in: walletIds } };
    const [all, closed, wins] = await Promise.all([
      this.prisma.trade.groupBy({ by: ['walletId'], where: inW, _count: true, _sum: { cash: true, fee: true } }),
      this.prisma.trade.groupBy({
        by: ['walletId'],
        where: { ...inW, realizedPnl: { not: null } },
        _count: true,
        _sum: { realizedPnl: true },
        _max: { realizedPnl: true },
        _min: { realizedPnl: true },
      }),
      this.prisma.trade.groupBy({ by: ['walletId'], where: { ...inW, realizedPnl: { gt: 0 } }, _count: true }),
    ]);
    for (const r of all) {
      if (!r.walletId) continue;
      out.set(r.walletId, {
        trades: r._count,
        volume: Number(r._sum.cash ?? 0),
        fees: Number(r._sum.fee ?? 0),
        realizedPnl: 0,
        closed: 0,
        wins: 0,
        bestTrade: null,
        worstTrade: null,
      });
    }
    for (const r of closed) {
      const s = r.walletId ? out.get(r.walletId) : undefined;
      if (!s) continue;
      s.closed = r._count;
      s.realizedPnl = Number(r._sum.realizedPnl ?? 0);
      s.bestTrade = r._max.realizedPnl == null ? null : Number(r._max.realizedPnl);
      s.worstTrade = r._min.realizedPnl == null ? null : Number(r._min.realizedPnl);
    }
    for (const r of wins) {
      const s = r.walletId ? out.get(r.walletId) : undefined;
      if (s) s.wins = r._count;
    }
    return out;
  }

  /** « Valeur minée » : pièces reçues en récompense de minage, valorisées au cours actuel. Seuls les wallets ayant miné figurent. */
  async minedValue(walletIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!walletIds.length) return out;
    const rows = await this.prisma.ledgerEntry.groupBy({
      by: ['walletId', 'assetId'],
      where: { walletId: { in: walletIds }, kind: 'MINING_REWARD' },
      _sum: { delta: true },
    });
    const assetIds = [...new Set(rows.flatMap((r) => (r.assetId ? [r.assetId] : [])))];
    const prices = new Map((await this.prisma.asset.findMany({ where: { id: { in: assetIds } }, select: { id: true, price: true } })).map((a) => [a.id, Number(a.price)]));
    for (const r of rows) {
      const value = Number(r._sum.delta ?? 0) * (r.assetId ? (prices.get(r.assetId) ?? 0) : 0);
      out.set(r.walletId, (out.get(r.walletId) ?? 0) + value);
    }
    return out;
  }
}
