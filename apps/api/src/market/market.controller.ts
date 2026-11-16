import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { QuoteInput, quoteSchema } from '@cryptomeme/shared';
import { MarketService } from './market.service';
import { Interval } from './candles';
import { AuthUser, CurrentUser, Public } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { SeasonsService } from '../seasons/seasons.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('market')
export class MarketController {
  constructor(
    private readonly market: MarketService,
    private readonly seasons: SeasonsService,
    private readonly prisma: PrismaService,
  ) {}

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
  candles(@Param('symbol') symbol: string, @Query('interval') interval: Interval = '5m', @Query('limit') limit = '300') {
    return this.market.candles(symbol, interval, Number(limit) || 300);
  }

  @Public()
  @Get('events')
  async events() {
    const ev = await this.prisma.marketEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { asset: { select: { symbol: true, emoji: true } } },
    });
    return ev.map((e) => ({ symbol: e.asset.symbol, emoji: e.asset.emoji, type: e.type, detail: e.detail, at: e.createdAt }));
  }

  @Post('quote')
  async quote(@CurrentUser() u: AuthUser, @Body(new ZodPipe(quoteSchema)) body: QuoteInput) {
    const wallet = await this.seasons.wallet(u.id);
    const bank = await this.prisma.bank.findUniqueOrThrow({ where: { id: wallet.bankId } });
    return this.market.quote(body, bank.tradingFeeBps);
  }
}
