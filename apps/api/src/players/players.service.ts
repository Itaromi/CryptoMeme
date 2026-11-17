import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { liquidationValue, Pool } from '@cryptomeme/engine';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from '../seasons/seasons.service';
import { poolOf } from '../market/market.service';
import { D, money } from '../common/decimal';
import { MiningService } from '../mining/mining.service';
import { MetaService } from '../meta/meta.service';

export const CATEGORIES = ['general', 'day', 'week', 'trader', 'miner', 'best-trade', 'worst-trade'] as const;
export type Category = (typeof CATEGORIES)[number];

@Injectable()
export class PlayersService {
  private readonly log = new Logger('Leaderboard');
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonsService,
    private readonly mining: MiningService,
    private readonly meta: MetaService,
  ) {}

  private catCache = new Map<string, { at: number; data: unknown }>();

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

  async leaderboard(seasonNumber?: number, category: Category = 'general', take = 100) {
    const season = seasonNumber
      ? await this.prisma.season.findUnique({ where: { number: seasonNumber } })
      : await this.seasons.active();
    if (!season) throw new NotFoundException('Saison inconnue');
    const key = `${season.id}:${category}`;
    const hit = this.catCache.get(key);
    if (hit && Date.now() - hit.at < (category === 'general' ? 10_000 : 60_000)) return hit.data;

    const wallets = await this.prisma.wallet.findMany({
      where: { seasonId: season.id, user: { bannedAt: null, role: 'PLAYER' } },
      include: { user: { select: { username: true, ...MetaService.LOOK_SELECT } } },
    });
    const ids = wallets.map((w) => w.id);
    const start = D(season.startingCash);
    let score = new Map<string, number>();
    let unit: 'money' | 'pct' = 'money';

    if (category === 'general') {
      score = new Map(wallets.map((w) => [w.id, Number(w.netWorth)]));
    } else if (category === 'day' || category === 'week') {
      unit = 'pct';
      const since = new Date(Date.now() - (category === 'day' ? 1 : 7) * 86_400_000);
      const base = await this.prisma.$queryRaw<Array<{ walletId: string; netWorth: string }>>`
        SELECT DISTINCT ON ("walletId") "walletId", "netWorth"::text AS "netWorth"
        FROM "NetWorthSnapshot" WHERE "walletId" = ANY(${ids}) AND t <= ${since}
        ORDER BY "walletId", t DESC`;
      const b = new Map(base.map((r) => [r.walletId, Number(r.netWorth)]));
      score = new Map(
        wallets.map((w) => {
          const ref = b.get(w.id) ?? Number(start);
          return [w.id, ref > 0 ? Number(w.netWorth) / ref - 1 : 0];
        }),
      );
    } else if (category === 'trader' || category === 'best-trade' || category === 'worst-trade') {
      const rows = await this.prisma.trade.groupBy({
        by: ['walletId'],
        where: { walletId: { in: ids }, realizedPnl: { not: null } },
        _sum: { realizedPnl: true },
        _max: { realizedPnl: true },
        _min: { realizedPnl: true },
      });
      score = new Map(
        rows.map((r) => [r.walletId!, Number(category === 'trader' ? r._sum.realizedPnl : category === 'best-trade' ? r._max.realizedPnl : r._min.realizedPnl)]),
      );
    } else if (category === 'miner') {
      const rows = await this.prisma.ledgerEntry.groupBy({ by: ['walletId', 'assetId'], where: { walletId: { in: ids }, kind: 'MINING_REWARD' }, _sum: { delta: true } });
      const prices = new Map((await this.prisma.asset.findMany({ select: { id: true, price: true } })).map((a) => [a.id, Number(a.price)]));
      for (const r of rows) score.set(r.walletId, (score.get(r.walletId) ?? 0) + Number(r._sum.delta ?? 0) * (prices.get(r.assetId!) ?? 0));
    }

    const asc = category === 'worst-trade';
    const ranked = wallets
      .filter((w) => score.has(w.id) && (category !== 'worst-trade' || score.get(w.id)! < 0) && (category !== 'best-trade' || score.get(w.id)! > 0))
      .sort((a, b) => (asc ? score.get(a.id)! - score.get(b.id)! : score.get(b.id)! - score.get(a.id)!) || a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, Math.min(take, 500));
    const looks = await this.meta.looks(ranked.map((w) => w.user));
    const data = {
      season: { number: season.number, name: season.name, status: season.status, startsAt: season.startsAt, endsAt: season.endsAt },
      category,
      unit,
      entries: ranked.map((w, i) => ({
        rank: i + 1,
        username: w.user.username,
        look: looks.get(w.user.id),
        netWorth: w.netWorth.toString(),
        performance: D(w.netWorth).div(start).sub(1).toNumber(),
        value: score.get(w.id)!,
      })),
    };
    this.catCache.set(key, { at: Date.now(), data });
    return data;
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
      select: { username: true, bio: true, createdAt: true, role: true, bannedAt: true, showcase: true, ...MetaService.LOOK_SELECT },
    });
    if (!user || user.bannedAt) throw new NotFoundException('Joueur introuvable');
    const season = await this.seasons.active();
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId_seasonId: { userId: user.id, seasonId: season.id } },
      include: { holdings: { where: { quantity: { gt: 0 } }, include: { asset: true } } },
    });
    const [looks, achievements] = await Promise.all([this.meta.looks([user]), this.meta.publicAchievements(user.id, user.showcase)]);
    const base = { username: user.username, bio: user.bio, joinedAt: user.createdAt, role: user.role, look: looks.get(user.id)!, achievements };
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
    // Au moins une journée de données, sinon le ratio ne veut rien dire
    const sharpe = sd > 0 && rets.length >= 96 ? (mean / sd) * Math.sqrt(96 * 365) : null; // annualisé (96 snapshots / jour)

    const allocation = wallet.holdings.map((h) => ({
      symbol: h.asset.symbol,
      emoji: h.asset.emoji,
      color: h.asset.color,
      value: Number(liquidationValue(poolOf(h.asset), D(h.quantity))),
    }));
    allocation.push({ symbol: 'CASH', emoji: 'Money', color: '#94a3b8', value: Number(wallet.cash) });
    allocation.push({ symbol: 'MATÉRIEL', emoji: 'Shovel', color: '#78716c', value: Number(wallet.hardwareValue) });
    const [rigCount, mined, elec] = await Promise.all([
      this.prisma.rig.count({ where: { walletId: wallet.id } }),
      this.prisma.ledgerEntry.groupBy({ by: ['assetId'], where: { walletId: wallet.id, kind: 'MINING_REWARD' }, _sum: { delta: true } }),
      this.prisma.ledgerEntry.aggregate({ where: { walletId: wallet.id, kind: 'ELECTRICITY' }, _sum: { delta: true } }),
    ]);
    const minedAssets = await this.prisma.asset.findMany({ where: { id: { in: mined.map((m) => m.assetId!) } }, select: { id: true, price: true } });
    const [flowRows, heat] = await Promise.all([
      this.prisma.ledgerEntry.groupBy({
        by: ['kind'],
        where: { walletId: wallet.id, assetId: null, kind: { in: ['TAX', 'DIVIDEND', 'BANK_FEE', 'BANK_INTEREST', 'SHOP', 'EVENT', 'INSURANCE'] } },
        _sum: { delta: true },
      }),
      this.prisma.$queryRaw<Array<{ dow: number; hour: number; n: number }>>`
        SELECT EXTRACT(ISODOW FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::int AS dow,
               EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::int AS hour,
               COUNT(*)::int AS n
        FROM "Trade" WHERE "walletId" = ${wallet.id} GROUP BY 1, 2`,
    ]);
    const led = (k: string) => Number(flowRows.find((m) => m.kind === k)?._sum.delta ?? 0);
    const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    for (const h of heat) heatmap[h.dow - 1][h.hour] = h.n;
    const exposure = { crypto: 0, stocks: 0, mining: Number(wallet.hardwareValue), cash: Number(wallet.cash) };
    for (const h of wallet.holdings) exposure[h.asset.kind === 'STOCK' ? 'stocks' : 'crypto'] += Number(liquidationValue(poolOf(h.asset), D(h.quantity)));
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
        flows: {
          taxes: -led('TAX'),
          dividends: led('DIVIDEND'),
          bankNet: led('BANK_FEE') + led('BANK_INTEREST'),
          events: led('EVENT') + led('INSURANCE'),
          shop: -led('SHOP'),
        },
        exposure,
        heatmap,
        history: [
          ...snapshots.map((s) => ({ t: s.t.getTime(), v: Number(s.netWorth) })),
          { t: Date.now(), v: Number(wallet.netWorth) },
        ],
      },
    };
  }
}
