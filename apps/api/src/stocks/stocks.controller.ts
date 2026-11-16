import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { StocksService } from './stocks.service';

@Controller('stocks')
export class StocksController {
  constructor(private readonly stocks: StocksService) {}

  @Public()
  @Get()
  list() {
    return this.stocks.list();
  }

  @Public()
  @Get(':symbol')
  detail(@Param('symbol') symbol: string) {
    return this.stocks.detail(symbol);
  }
}

const actionSchema = z.object({
  action: z.enum(['earnings', 'news-good', 'news-bad', 'split', 'takeover', 'takeover-success', 'takeover-fail', 'bankrupt', 'relist']),
  ratio: z.number().int().min(2).max(100).optional(),
  premium: z.number().min(0.05).max(2).optional(),
  reason: z.string().min(3).max(500),
});

@Controller('admin/stocks')
@Roles('ADMIN')
export class AdminStocksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stocks: StocksService,
  ) {}

  @Post(':symbol')
  async act(@CurrentUser() actor: AuthUser, @Param('symbol') symbol: string, @Body(new ZodPipe(actionSchema)) body: z.infer<typeof actionSchema>) {
    const a = await this.prisma.asset.findUnique({ where: { symbol: symbol.toUpperCase() }, select: { id: true, kind: true } });
    if (!a || a.kind !== 'STOCK') throw new NotFoundException('Action inconnue');
    const id = a.id;
    const result = await (async () => {
      switch (body.action) {
        case 'earnings':
          return this.stocks.earnings(id);
        case 'news-good':
          return this.stocks.news(id, 1);
        case 'news-bad':
          return this.stocks.news(id, -1);
        case 'split':
          if (!body.ratio) throw new BadRequestException('Ratio requis');
          return this.stocks.split(id, body.ratio);
        case 'takeover':
          return this.stocks.announceTakeover(id, body.premium);
        case 'takeover-success':
          return this.stocks.resolveTakeover(id, true);
        case 'takeover-fail':
          return this.stocks.resolveTakeover(id, false);
        case 'bankrupt':
          return this.stocks.bankrupt(id);
        case 'relist':
          return this.stocks.relist(id);
      }
    })();
    await this.prisma.auditLog.create({
      data: { actorId: actor.id, action: `stock.${body.action}`, targetType: 'Asset', targetId: id, reason: body.reason, payload: { ...body, result } as object },
    });
    return result;
  }
}
