import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AssetParams, MarketState, mathRng, stepMarket } from '@cryptomeme/engine';
import { TICK_MS } from '@cryptomeme/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MarketGateway } from './market.gateway';
import { MarketService, poolOf } from './market.service';
import { recordCandle } from './candles';
import { LeaseService } from '../common/lease.service';

/** Fait vivre le marché : à chaque tick, les PNJ tradent contre chaque pool. */
@Injectable()
export class TickService {
  private readonly log = new Logger('Tick');
  private running = false;
  private lastTick = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MarketGateway,
    private readonly market: MarketService,
    private readonly lease: LeaseService,
  ) {}

  @Interval(TICK_MS)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      // Bail en base : une seule instance de l'API fait tourner le marché
      if (!(await this.lease.acquire('market-tick', TICK_MS * 6))) return;
      {
        const now = Date.now();
        const dt = Math.min(now - this.lastTick, 60_000);
        this.lastTick = now;
        const ids = await this.prisma.asset.findMany({ where: { frozen: false }, select: { id: true } });
        for (const { id } of ids) await this.stepAsset(id, dt);
        const list = await this.market.list();
        this.gateway.broadcastTicks(
          list.map((a) => ({ symbol: a.symbol, price: a.price, change24h: a.change24h, volume24h: a.volume24h, regime: a.regime, t: now })),
        );
      }
    } catch (e) {
      this.log.error(e);
    } finally {
      this.running = false;
    }
  }

  private async stepAsset(id: string, dt: number) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${id} FOR UPDATE`;
      const a = await tx.asset.findUniqueOrThrow({ where: { id } });
      if (a.frozen) return;
      const r = stepMarket(poolOf(a), a.state as unknown as MarketState, a.params as unknown as AssetParams, dt, mathRng);
      const price = r.pool.quote.div(r.pool.base);
      await tx.asset.update({
        where: { id },
        data: {
          baseReserve: r.pool.base.toString(),
          quoteReserve: r.pool.quote.toString(),
          price: price.toString(),
          state: r.state as object,
        },
      });
      const volume = r.trades.reduce((s, t) => s + Number(t.side === 'BUY' ? t.swap.amountIn : t.swap.amountOut), 0);
      await recordCandle(tx, id, price.toString(), volume.toFixed(8));
      for (const e of r.events) {
        if (e.type === 'REGIME' && a.tier === 'BLUE_CHIP') continue;
        await tx.marketEvent.create({ data: { assetId: id, type: e.type, detail: e.detail } });
      }
    });
  }
}
