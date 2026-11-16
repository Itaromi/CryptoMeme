import { Injectable, NotFoundException } from '@nestjs/common';
import { Asset } from '@prisma/client';
import { Pool, buyWithCash, sellForCash, SwapError } from '@cryptomeme/engine';
import { Candle, QuoteInput } from '@cryptomeme/shared';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { D } from '../common/decimal';
import { INTERVALS, Interval } from './candles';

export interface DayStats {
  open: number;
  volume: number;
  spark: number[];
}

export const poolOf = (a: Pick<Asset, 'baseReserve' | 'quoteReserve' | 'feeBps'>): Pool => ({
  base: D(a.baseReserve),
  quote: D(a.quoteReserve),
  feeBps: a.feeBps,
});

@Injectable()
export class MarketService {
  private stats = new Map<string, DayStats>();
  private statsAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  /** Ouverture 24 h, volume 24 h et mini-graphe, mis en cache 30 s. */
  async dayStats(): Promise<Map<string, DayStats>> {
    if (Date.now() - this.statsAt < 30_000) return this.stats;
    const since = new Date(Date.now() - 86_400_000);
    const rows = await this.prisma.$queryRaw<Array<{ assetId: string; open: string; volume: string; spark: string[] }>>`
      SELECT "assetId",
             (array_agg("o" ORDER BY "t"))[1]::text AS open,
             COALESCE(SUM("v"), 0)::text AS volume,
             array_agg("c"::text ORDER BY "t") AS spark
      FROM "Candle"
      WHERE "interval" = '1h' AND "t" >= ${since}
      GROUP BY "assetId"`;
    this.stats = new Map(
      rows.map((r) => [r.assetId, { open: Number(r.open), volume: Number(r.volume), spark: r.spark.map(Number) }]),
    );
    this.statsAt = Date.now();
    return this.stats;
  }

  serialize(a: Asset, s?: DayStats) {
    const price = Number(a.price);
    return {
      symbol: a.symbol,
      name: a.name,
      kind: a.kind,
      tier: a.tier,
      emoji: a.emoji,
      color: a.color,
      description: a.description,
      price: a.price.toString(),
      change24h: s?.open ? price / s.open - 1 : 0,
      volume24h: s?.volume ?? 0,
      liquidity: Number(a.quoteReserve),
      marketCap: price * Number(a.baseReserve),
      regime: (a.state as { regime?: string })?.regime ?? 'NORMAL',
      frozen: a.frozen,
      spark: s?.spark ?? [],
    };
  }

  async list() {
    const [assets, stats] = await Promise.all([
      this.prisma.asset.findMany({ orderBy: [{ tier: 'asc' }, { symbol: 'asc' }] }),
      this.dayStats(),
    ]);
    return assets.map((a) => this.serialize(a, stats.get(a.id)));
  }

  async bySymbol(symbol: string) {
    const a = await this.prisma.asset.findUnique({ where: { symbol: symbol.toUpperCase() } });
    if (!a) throw new NotFoundException('Actif inconnu');
    return a;
  }

  async detail(symbol: string) {
    const a = await this.bySymbol(symbol);
    const stats = await this.dayStats();
    const [trades, events, holders] = await Promise.all([
      this.prisma.trade.findMany({
        where: { assetId: a.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { wallet: { select: { user: { select: { username: true } } } } },
      }),
      this.prisma.marketEvent.findMany({ where: { assetId: a.id }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.prisma.holding.count({ where: { assetId: a.id, quantity: { gt: 0 } } }),
    ]);
    return {
      ...this.serialize(a, stats.get(a.id)),
      feeBps: a.feeBps,
      holders,
      trades: trades.map((t) => ({
        id: t.id,
        side: t.side,
        quantity: t.quantity.toString(),
        cash: t.cash.toString(),
        price: t.price.toString(),
        by: t.wallet?.user.username ?? null,
        at: t.createdAt,
      })),
      events: events.map((e) => ({ type: e.type, detail: e.detail, at: e.createdAt })),
    };
  }

  async candles(symbol: string, interval: Interval, limit = 300): Promise<Candle[]> {
    if (!(interval in INTERVALS)) throw new BadRequestException('Intervalle invalide');
    const a = await this.bySymbol(symbol);
    const rows = await this.prisma.candle.findMany({
      where: { assetId: a.id, interval },
      orderBy: { t: 'desc' },
      take: Math.min(limit, 1000),
    });
    return rows.reverse().map((c) => ({
      t: c.t.getTime(),
      o: Number(c.o),
      h: Number(c.h),
      l: Number(c.l),
      c: Number(c.c),
      v: Number(c.v),
    }));
  }

  /** Devis sans exécution (prévisualisation du slippage dans le formulaire). */
  async quote(q: QuoteInput, feeBps: number) {
    const a = await this.bySymbol(q.symbol);
    try {
      const swap = q.side === 'BUY' ? buyWithCash(poolOf(a), q.amount, feeBps) : sellForCash(poolOf(a), q.amount, feeBps);
      return {
        amountIn: swap.amountIn.toString(),
        amountOut: swap.amountOut.toString(),
        fee: swap.fee.toString(),
        avgPrice: swap.avgPrice.toString(),
        priceAfter: swap.priceAfter.toString(),
        slippageBps: Math.round(swap.slippageBps),
      };
    } catch (e) {
      if (e instanceof SwapError) throw new BadRequestException(e.message);
      throw e;
    }
  }
}
