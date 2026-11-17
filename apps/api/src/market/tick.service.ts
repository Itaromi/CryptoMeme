import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { mathRng, stepMarket } from '@cryptomeme/engine';
import { TICK_MS, stockMarketStatus } from '@cryptomeme/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MarketGateway } from './market.gateway';
import { MarketService, poolOf } from './market.service';
import { recordCandle } from './candles';
import { LeaseService } from '../common/lease.service';
import { paramsOf, stateJson, stateOf, StoredState } from './asset-state';

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
        const open = stockMarketStatus(new Date(now)).open;
        for (const { id } of ids) await this.stepAsset(id, dt, open);
        const list = await this.market.list();
        this.gateway.broadcastTicks(
          list.map((a) => ({ symbol: a.symbol, price: a.price, change24h: a.change24h, volume24h: String(a.volume24h), regime: a.regime, t: now })),
        );
      }
    } catch (e) {
      this.log.error(e);
    } finally {
      this.running = false;
    }
  }

  private async stepAsset(id: string, dt: number, stocksOpen: boolean) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${id} FOR UPDATE`;
      const a = await tx.asset.findUniqueOrThrow({ where: { id } });
      if (a.frozen) return;
      const st = stateOf(a);
      const isStock = a.kind === 'STOCK';
      // Bourse fermée : la valeur juste continue de bouger (news, résultats) mais personne ne trade.
      // À l'ouverture, enchère : le prix saute d'un coup à la valeur juste → gap.
      const closed = isStock && !stocksOpen;
      const opening = isStock && stocksOpen && st.closed;
      const r = stepMarket(poolOf(a), st, paramsOf(a), dt, mathRng, closed ? { noTrade: true } : opening ? { pull: 1 } : {});
      const price = r.pool.quote.div(r.pool.base);
      const state: StoredState = isStock ? { ...r.state, closed } : r.state;
      if (closed) {
        await tx.asset.update({ where: { id }, data: { state: stateJson(state) } });
        return;
      }
      if (opening) {
        const gap = price.div(a.price).toNumber() - 1;
        await tx.marketEvent.create({ data: { assetId: id, type: 'OPEN', detail: `Ouverture : ${gap >= 0 ? '+' : ''}${(gap * 100).toFixed(1).replace('.', ',')} % par rapport à la clôture` } });
      }
      await tx.asset.update({
        where: { id },
        data: {
          baseReserve: r.pool.base.toString(),
          quoteReserve: r.pool.quote.toString(),
          price: price.toString(),
          state: stateJson(state),
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
