import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { QuoteInput, quoteSchema } from '@cryptomeme/shared';
import { MarketService } from './market.service';
import { INTERVALS, Interval } from './candles';
import { AuthUser, CurrentUser, Public } from '../common/auth.decorators';
import { optionalParam, ZodPipe } from '../common/zod.pipe';

const candlesQuery = z.object({
  interval: optionalParam(z.enum(Object.keys(INTERVALS) as [Interval, ...Interval[]])).transform((v) => v ?? '5m'),
  limit: optionalParam(z.coerce.number().int().min(1).max(1000)).transform((v) => v ?? 300),
});

@Controller('market')
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Public()
  @Get('assets')
  list() {
    return this.market.list();
  }

  @Public()
  @Get('assets/:symbol')
  detail(@Param('symbol') symbol: string) {
    return this.market.detail(symbol);
  }

  @Public()
  @Get('assets/:symbol/candles')
  candles(@Param('symbol') symbol: string, @Query(new ZodPipe(candlesQuery)) q: z.infer<typeof candlesQuery>) {
    return this.market.candles(symbol, q.interval, q.limit);
  }

  @Public()
  @Get('events')
  events() {
    return this.market.recentEvents();
  }

  @Post('quote')
  quote(@CurrentUser() u: AuthUser, @Body(new ZodPipe(quoteSchema)) body: QuoteInput) {
    return this.market.quoteFor(u.id, body);
  }
}
