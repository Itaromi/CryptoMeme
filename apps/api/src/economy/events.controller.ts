import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { EventsService } from './events.service';
import { bankView } from './banks.service';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Public()
  @Get()
  feed() {
    return this.events.feed();
  }
}

const reason = z.string().min(3).max(500);
const typeSchema = z.object({
  ratePerDay: z.number().min(0).max(50).optional(),
  cooldownHours: z.number().min(0).max(720).optional(),
  noticeMinutes: z.number().int().min(0).max(10_080).optional(),
  durationMinutes: z.number().int().min(0).max(10_080).optional(),
  enabled: z.boolean().optional(),
  params: z.record(z.string(), z.any()).optional(),
  reason,
});
const triggerSchema = z.object({ typeId: z.string().min(1), immediate: z.boolean().default(false), params: z.record(z.string(), z.any()).default({}), reason });
const bankSchema = z.object({
  monthlyFee: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  openingFee: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  minNetWorth: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  tradingFeeBps: z.number().int().min(0).max(500).optional(),
  interestMonthly: z.number().min(0).max(50).optional(),
  elecDiscount: z.number().min(0).max(1).optional(),
  insuranceRate: z.number().min(0).max(1).optional(),
  taxShield: z.number().min(0).max(1).optional(),
  hackShield: z.number().min(0).max(1).optional(),
  failRiskPerDay: z.number().min(0).max(1).optional(),
  available: z.boolean().optional(),
  reason,
});

@Controller('admin/economy')
@Roles('ADMIN', 'MODERATOR')
export class AdminEconomyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  private audit(actor: AuthUser, action: string, targetId: string, reason: string, payload: object) {
    return this.prisma.auditLog.create({ data: { actorId: actor.id, action, targetType: 'Economy', targetId, reason, payload } });
  }

  @Get('event-types')
  async types() {
    const types = await this.prisma.eventType.findMany({ orderBy: [{ mood: 'asc' }, { name: 'asc' }], include: { _count: { select: { events: true } } } });
    return types.map(({ _count, ...t }) => ({ ...t, fired: _count.events }));
  }

  @Roles('ADMIN')
  @Patch('event-types/:id')
  async updateType(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(typeSchema)) body: z.infer<typeof typeSchema>) {
    const { reason: r, ...data } = body;
    await this.prisma.eventType.update({ where: { id }, data });
    await this.audit(actor, 'EVENT_TYPE_UPDATE', id, r, data);
    return { ok: true };
  }

  /** Déclenche un événement à la main (avec ou sans préavis). */
  @Roles('ADMIN')
  @Post('trigger')
  async trigger(@CurrentUser() actor: AuthUser, @Body(new ZodPipe(triggerSchema)) body: z.infer<typeof triggerSchema>) {
    const type = await this.prisma.eventType.findUnique({ where: { id: body.typeId } });
    if (!type) throw new NotFoundException();
    if (type.slug === 'bank-run' && !body.params.bankId) throw new BadRequestException('Précise la banque (params.bankId)');
    if (body.params.bankId && !body.params.bank) {
      const b = await this.prisma.bank.findUnique({ where: { id: body.params.bankId } });
      if (!b) throw new NotFoundException('Banque inconnue');
      body.params.bank = b.name;
    }
    const e = await this.events.schedule(type, body.params, { triggeredBy: actor.id, immediate: body.immediate });
    if (!e) throw new BadRequestException('Aucune cible possible pour cet événement');
    await this.audit(actor, 'EVENT_TRIGGER', e.id, body.reason, { type: type.slug, immediate: body.immediate, params: body.params });
    return { id: e.id, title: e.title, startsAt: e.startsAt };
  }

  @Roles('ADMIN')
  @Post('events/:id/cancel')
  async cancel(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(z.object({ reason }))) body: { reason: string }) {
    const r = await this.prisma.gameEvent.updateMany({ where: { id, status: { in: ['SCHEDULED', 'ACTIVE'] } }, data: { status: 'CANCELLED', endsAt: new Date() } });
    if (!r.count) throw new BadRequestException('Événement déjà terminé');
    await this.audit(actor, 'EVENT_CANCEL', id, body.reason, {});
    return { ok: true };
  }

  @Get('banks')
  async banks() {
    return (await this.prisma.bank.findMany({ orderBy: { monthlyFee: 'asc' } })).map((b) => ({ ...bankView(b), available: b.available }));
  }

  @Roles('ADMIN')
  @Patch('banks/:id')
  async updateBank(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(bankSchema)) body: z.infer<typeof bankSchema>) {
    const { reason: r, ...data } = body;
    await this.prisma.bank.update({ where: { id }, data });
    await this.audit(actor, 'BANK_UPDATE', id, r, data);
    return { ok: true };
  }
}
