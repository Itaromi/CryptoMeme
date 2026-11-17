import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { liquidationValue } from '@cryptomeme/engine';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from '../seasons/seasons.service';
import { LeaseService } from '../common/lease.service';
import { poolOf } from '../market/market.service';
import { D, money } from '../common/decimal';
import { MetaService } from '../meta/meta.service';
import { NetWorthService } from '../economy/net-worth.service';
import { WalletStatsService } from './wallet-stats.service';

export const CATEGORIES = ['general', 'day', 'week', 'trader', 'miner', 'best-trade', 'worst-trade'] as const;
export type Category = (typeof CATEGORIES)[number];

const RECOMPUTE_MS = 30_000;

@Injectable()
export class PlayersService {
  private readonly log = new Logger('Leaderboard');
  /** Calcul en cours (partagé par tous les appelants) */
  private current: { promise: Promise<void>; snapshot: boolean } | null = null;
  /** Calcul avec snapshot demandé pendant un calcul sans snapshot : relancé juste après */
  private queuedSnapshot: Promise<void> | null = null;
  private catCache = new Map<string, { at: number; data: unknown }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonsService,
    private readonly lease: LeaseService,
    private readonly meta: MetaService,
    private readonly netWorth: NetWorthService,
    private readonly stats: WalletStatsService,
  ) {}

  // ─── Jobs planifiés (sous bail : une seule instance de l'API) ─────
  @Interval(RECOMPUTE_MS)
  async tick() {
    await this.scheduled(false);
  }

  /** Snapshot du patrimoine toutes les 15 minutes (courbes, classements jour / semaine). */
  @Cron('0 */15 * * * *')
  async snapshotTick() {
    await this.scheduled(true);
  }

  private async scheduled(snapshot: boolean) {
    try {
      if (!(await this.lease.acquire('leaderboard-tick', 3 * RECOMPUTE_MS))) return;
      await this.recompute(snapshot);
    } catch (e) {
      this.log.error(e);
    }
  }

  /** Recalcul en arrière-plan (après un événement, un ajustement admin…) : les erreurs sont journalisées, jamais propagées. */
  requestRecompute() {
    this.recompute().catch((e: unknown) => this.log.error(e));
  }

  /**
   * Recalcule le patrimoine net de tous les wallets de la saison (et fige un snapshot si demandé).
   * Un seul calcul à la fois : un appel pendant un calcul en cours en partage le résultat ; si un snapshot
   * est demandé pendant un calcul sans snapshot, un second calcul avec snapshot est enchaîné (jamais perdu).
   */
  recompute(snapshot = false): Promise<void> {
    const cur = this.current;
    if (!cur) return this.start(snapshot);
    if (!snapshot || cur.snapshot) return cur.promise;
    this.queuedSnapshot ??= cur.promise
      .catch(() => undefined)
      .then(() => {
        this.queuedSnapshot = null;
        return this.recompute(true);
      });
    return this.queuedSnapshot;
  }

  private start(snapshot: boolean) {
    const promise: Promise<void> = this.compute(snapshot).finally(() => {
      if (this.current?.promise === promise) this.current = null;
    });
    this.current = { promise, snapshot };
    return promise;
  }

  private async compute(snapshot: boolean) {
    const season = await this.seasons.active();
    const wallets = await this.prisma.wallet.findMany({ where: { seasonId: season.id }, select: { id: true, peakNetWorth: true } });
    const values = await this.netWorth.netWorthOf(wallets.map((w) => w.id));
    const now = new Date();
    for (const w of wallets) {
      const v = values.get(w.id);
      if (!v) continue;
      const nw = money(v.total);
      await this.prisma.wallet.update({
        where: { id: w.id },
        data: { netWorth: nw, hardwareValue: money(v.hardware), ...(v.total.gt(D(w.peakNetWorth)) ? { peakNetWorth: nw } : {}) },
      });
      if (snapshot) {
        await this.prisma.netWorthSnapshot.create({ data: { walletId: w.id, t: now, netWorth: nw, cash: money(v.cash) } });
      }
    }
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
      for (const [walletId, t] of await this.stats.tradeStats(ids)) {
        if (!t.closed) continue;
        score.set(walletId, category === 'trader' ? t.realizedPnl : category === 'best-trade' ? (t.bestTrade ?? 0) : (t.worstTrade ?? 0));
      }
    } else if (category === 'miner') {
      score = await this.stats.minedValue(ids);
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

  /** Rang du joueur connecté dans la saison active. */
  async myRank(userId: string) {
    const w = await this.seasons.wallet(userId);
    return this.rankOf(w.id, w.seasonId, w.netWorth.toString());
  }

  async updateBio(userId: string, bio: string | null) {
    await this.prisma.user.update({ where: { id: userId }, data: { bio } });
    return { ok: true };
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

    const [tradeStats, byAsset, snapshots, rank, minedValue] = await Promise.all([
      this.stats.tradeStats([wallet.id]),
      this.prisma.trade.groupBy({ by: ['assetId'], where: { walletId: wallet.id }, _sum: { cash: true } }),
      this.prisma.netWorthSnapshot.findMany({ where: { walletId: wallet.id }, orderBy: { t: 'asc' }, select: { t: true, netWorth: true } }),
      this.rankOf(wallet.id, season.id, wallet.netWorth.toString()),
      this.stats.minedValue([wallet.id]),
    ]);
    const t = tradeStats.get(wallet.id);
    // Actif le plus échangé (en volume)
    const top = [...byAsset].sort((a, b) => Number(b._sum.cash ?? 0) - Number(a._sum.cash ?? 0))[0];
    const favorite = top ? ((await this.prisma.asset.findUnique({ where: { id: top.assetId }, select: { symbol: true } }))?.symbol ?? null) : null;

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
    const [rigCount, elec] = await Promise.all([
      this.prisma.rig.count({ where: { walletId: wallet.id } }),
      this.prisma.ledgerEntry.aggregate({ where: { walletId: wallet.id, kind: 'ELECTRICITY' }, _sum: { delta: true } }),
    ]);
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

    return {
      ...base,
      season: season.number,
      stats: {
        rank: rank.rank,
        players: rank.total,
        netWorth: wallet.netWorth.toString(),
        peakNetWorth: wallet.peakNetWorth.toString(),
        performance: Number(wallet.netWorth) / Number(season.startingCash) - 1,
        trades: t?.trades ?? 0,
        volume: t?.volume ?? 0,
        fees: t?.fees ?? 0,
        realizedPnl: t?.realizedPnl ?? 0,
        winRate: t?.closed ? t.wins / t.closed : null,
        bestTrade: t?.bestTrade ?? null,
        worstTrade: t?.worstTrade ?? null,
        favorite,
        maxDrawdown: maxDd,
        sharpe,
        allocation: allocation.filter((a) => a.value > 0.005),
        mining: { rigs: rigCount, minedValue: minedValue.get(wallet.id) ?? 0, electricity: -Number(elec._sum.delta ?? 0), hardwareValue: Number(wallet.hardwareValue) },
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
