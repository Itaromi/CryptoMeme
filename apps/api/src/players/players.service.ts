import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { liquidationValue, Pool } from '@cryptomeme/engine';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from '../seasons/seasons.service';
import { poolOf } from '../market/market.service';
import { D, money } from '../common/decimal';
import { MiningService } from '../mining/mining.service';

@Injectable()
export class PlayersService {
  private readonly log = new Logger('Leaderboard');
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonsService,
    private readonly mining: MiningService,
  ) {}

  /** Recalcule le patrimoine net (valeur liquidative) de tous les wallets de la saison. */
  @Interval(30_000)
  async recompute(snapshot = false) {
    if (this.busy) return;
    this.busy = true;
    try {
      const season = await this.seasons.active();
      const assets = await this.prisma.asset.findMany();
      const pools = new Map<string, Pool>(assets.map((a) => [a.id, poolOf(a)]));
      const wallets = await this.prisma.wallet.findMany({
        where: { seasonId: season.id },
        include: { holdings: { where: { quantity: { gt: 0 } } } },
      });
      const now = new Date();
      const hardware = await this.mining.hardwareValue(wallets.map((w) => w.id));
      for (const w of wallets) {
        const hw = D((hardware.get(w.id) ?? 0).toFixed(2));
        const value = w.holdings.reduce((s, h) => s.add(liquidationValue(pools.get(h.assetId)!, D(h.quantity))), D(w.cash)).add(hw);
        const nw = money(value);
        await this.prisma.wallet.update({
          where: { id: w.id },
          data: { netWorth: nw, hardwareValue: money(hw), ...(value.gt(D(w.peakNetWorth)) ? { peakNetWorth: nw } : {}) },
        });
        if (snapshot) {
          await this.prisma.netWorthSnapshot.create({ data: { walletId: w.id, t: now, netWorth: nw, cash: w.cash } });
        }
      }
    } catch (e) {
      this.log.error(e);
    } finally {
      this.busy = false;
    }
  }

  @Cron('0 */15 * * * *')
  async snapshot() {
    await this.recompute(true);
  }

  async leaderboard(seasonNumber?: number, take = 100) {
    const season = seasonNumber
      ? await this.prisma.season.findUnique({ where: { number: seasonNumber } })
      : await this.seasons.active();
    if (!season) throw new NotFoundException('Saison inconnue');
    const wallets = await this.prisma.wallet.findMany({
      where: { seasonId: season.id, user: { bannedAt: null, role: 'PLAYER' } },
      orderBy: [{ netWorth: 'desc' }, { createdAt: 'asc' }],
      take: Math.min(take, 500),
      include: { user: { select: { username: true } } },
    });
    const start = D(season.startingCash);
    return {
      season: { number: season.number, name: season.name, status: season.status, startsAt: season.startsAt, endsAt: season.endsAt },
      entries: wallets.map((w, i) => ({
        rank: i + 1,
        username: w.user.username,
        netWorth: w.netWorth.toString(),
        performance: D(w.netWorth).div(start).sub(1).toNumber(),
      })),
    };
  }

  async rankOf(walletId: string, seasonId: string, netWorth: string) {
    const better = await this.prisma.wallet.count({
      where: { seasonId, netWorth: { gt: netWorth }, user: { bannedAt: null, role: 'PLAYER' } },
    });
    const total = await this.prisma.wallet.count({ where: { seasonId, user: { bannedAt: null, role: 'PLAYER' } } });
    return { rank: better + 1, total };
  }

  /** Profil public + statistiques avancées de la saison active. */
  async profile(username: string) {
    const user = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: { id: true, username: true, bio: true, createdAt: true, role: true, bannedAt: true },
    });
    if (!user || user.bannedAt) throw new NotFoundException('Joueur introuvable');
    const season = await this.seasons.active();
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId_seasonId: { userId: user.id, seasonId: season.id } },
      include: { holdings: { where: { quantity: { gt: 0 } }, include: { asset: true } } },
    });
    const base = { username: user.username, bio: user.bio, joinedAt: user.createdAt, role: user.role };
    if (!wallet) return { ...base, season: season.number, stats: null };

    const [trades, snapshots, rank] = await Promise.all([
      this.prisma.trade.findMany({
        where: { walletId: wallet.id },
        select: { side: true, cash: true, fee: true, realizedPnl: true, assetId: true, createdAt: true, asset: { select: { symbol: true } } },
      }),
      this.prisma.netWorthSnapshot.findMany({ where: { walletId: wallet.id }, orderBy: { t: 'asc' }, select: { t: true, netWorth: true } }),
      this.rankOf(wallet.id, season.id, wallet.netWorth.toString()),
    ]);

    const sells = trades.filter((t) => t.side === 'SELL' && t.realizedPnl != null);
    const pnls = sells.map((t) => Number(t.realizedPnl));
    const volume = trades.reduce((s, t) => s + Number(t.cash), 0);
    const fees = trades.reduce((s, t) => s + Number(t.fee), 0);
    const bySymbol = new Map<string, number>();
    for (const t of trades) bySymbol.set(t.asset.symbol, (bySymbol.get(t.asset.symbol) ?? 0) + Number(t.cash));
    const favorite = [...bySymbol.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Drawdown max & Sharpe sur la courbe de patrimoine (snapshots 15 min)
    const curve = [...snapshots.map((s) => Number(s.netWorth)), Number(wallet.netWorth)];
    let peak = curve[0] ?? 0;
    let maxDd = 0;
    const rets: number[] = [];
    for (let i = 0; i < curve.length; i++) {
      peak = Math.max(peak, curve[i]);
      if (peak > 0) maxDd = Math.max(maxDd, 1 - curve[i] / peak);
      if (i > 0 && curve[i - 1] > 0) rets.push(curve[i] / curve[i - 1] - 1);
    }
    const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
    const sd = rets.length > 1 ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1)) : 0;
    const sharpe = sd > 0 ? (mean / sd) * Math.sqrt(96 * 365) : null; // annualisé (96 snapshots / jour)

    const allocation = wallet.holdings.map((h) => ({
      symbol: h.asset.symbol,
      emoji: h.asset.emoji,
      color: h.asset.color,
      value: Number(liquidationValue(poolOf(h.asset), D(h.quantity))),
    }));
    allocation.push({ symbol: 'CASH', emoji: '💵', color: '#94a3b8', value: Number(wallet.cash) });
    allocation.push({ symbol: 'MATÉRIEL', emoji: '⛏️', color: '#78716c', value: Number(wallet.hardwareValue) });
    const [rigCount, mined, elec] = await Promise.all([
      this.prisma.rig.count({ where: { walletId: wallet.id } }),
      this.prisma.ledgerEntry.groupBy({ by: ['assetId'], where: { walletId: wallet.id, kind: 'MINING_REWARD' }, _sum: { delta: true } }),
      this.prisma.ledgerEntry.aggregate({ where: { walletId: wallet.id, kind: 'ELECTRICITY' }, _sum: { delta: true } }),
    ]);
    const minedAssets = await this.prisma.asset.findMany({ where: { id: { in: mined.map((m) => m.assetId!) } }, select: { id: true, price: true } });
    const minedValue = mined.reduce((s, m) => s + Number(m._sum.delta ?? 0) * Number(minedAssets.find((a) => a.id === m.assetId)?.price ?? 0), 0);

    return {
      ...base,
      season: season.number,
      stats: {
        rank: rank.rank,
        players: rank.total,
        netWorth: wallet.netWorth.toString(),
        peakNetWorth: wallet.peakNetWorth.toString(),
        performance: Number(wallet.netWorth) / Number(season.startingCash) - 1,
        trades: trades.length,
        volume,
        fees,
        realizedPnl: pnls.reduce((a, b) => a + b, 0),
        winRate: pnls.length ? pnls.filter((p) => p > 0).length / pnls.length : null,
        bestTrade: pnls.length ? Math.max(...pnls) : null,
        worstTrade: pnls.length ? Math.min(...pnls) : null,
        favorite,
        maxDrawdown: maxDd,
        sharpe,
        allocation: allocation.filter((a) => a.value > 0.005),
        mining: { rigs: rigCount, minedValue, electricity: -Number(elec._sum.delta ?? 0), hardwareValue: Number(wallet.hardwareValue) },
        history: [
          ...snapshots.map((s) => ({ t: s.t.getTime(), v: Number(s.netWorth) })),
          { t: Date.now(), v: Number(wallet.netWorth) },
        ],
      },
    };
  }
}
