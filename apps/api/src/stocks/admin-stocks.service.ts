import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { reasonSchema } from '@cryptomeme/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth.decorators';
import { StocksService } from './stocks.service';

export const STOCK_ACTIONS = ['earnings', 'news-good', 'news-bad', 'split', 'takeover', 'takeover-success', 'takeover-fail', 'bankrupt', 'relist'] as const;
type StockAction = (typeof STOCK_ACTIONS)[number];

export const stockActionSchema = z.object({
  action: z.enum(STOCK_ACTIONS),
  ratio: z.number().int().min(2).max(100).optional(),
  premium: z.number().min(0.05).max(2).optional(),
  reason: reasonSchema,
});

const AUDIT: Record<StockAction, AuditAction> = {
  earnings: 'STOCK_EARNINGS',
  'news-good': 'STOCK_NEWS_GOOD',
  'news-bad': 'STOCK_NEWS_BAD',
  split: 'STOCK_SPLIT',
  takeover: 'STOCK_TAKEOVER',
  'takeover-success': 'STOCK_TAKEOVER_SUCCESS',
  'takeover-fail': 'STOCK_TAKEOVER_FAIL',
  bankrupt: 'STOCK_BANKRUPT',
  relist: 'STOCK_RELIST',
};

/** Vie d'une société déclenchée à la main par un admin (résultats, OPA, faillite…), tracée dans le journal d'audit. */
@Injectable()
export class AdminStocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stocks: StocksService,
    private readonly audit: AuditService,
  ) {}

  async act(actor: AuthUser, symbol: string, body: z.infer<typeof stockActionSchema>) {
    const a = await this.prisma.asset.findUnique({ where: { symbol: symbol.toUpperCase() }, select: { id: true, kind: true } });
    if (!a || a.kind !== 'STOCK') throw new NotFoundException('Action inconnue');
    const result = await this.run(a.id, body);
    await this.audit.log({ actorId: actor.id, action: AUDIT[body.action], targetType: 'Asset', targetId: a.id, reason: body.reason, payload: { ...body, result } });
    return result;
  }

  private run(id: string, body: z.infer<typeof stockActionSchema>) {
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
  }
}
