import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrderInput, orderSchema } from '@cryptomeme/shared';
import { TradingService } from './trading.service';
import { AuthUser, CurrentUser } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';

@Controller()
export class TradingController {
  constructor(private readonly trading: TradingService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('orders')
  async order(@CurrentUser() u: AuthUser, @Body(new ZodPipe(orderSchema)) body: OrderInput) {
    const t = await this.trading.execute(u.id, body);
    return {
      id: t.id,
      side: t.side,
      quantity: t.quantity.toString(),
      cash: t.cash.toString(),
      fee: t.fee.toString(),
      price: t.price.toString(),
      slippageBps: t.slippageBps,
      realizedPnl: t.realizedPnl?.toString() ?? null,
    };
  }

  @Get('portfolio')
  portfolio(@CurrentUser() u: AuthUser) {
    return this.trading.portfolio(u.id);
  }

  @Get('portfolio/trades')
  history(@CurrentUser() u: AuthUser, @Query('cursor') cursor?: string) {
    return this.trading.history(u.id, cursor);
  }
}
