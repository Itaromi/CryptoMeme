import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { reasonSchema } from '@cryptomeme/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth.decorators';
import { EventsService } from './events.service';
import { BanksService } from './banks.service';

const amount = z.string().regex(/^\d+(\.\d{1,2})?$/);
/** Paramètres libres d'un événement : n'importe quelle valeur JSON. */
const eventParams = z.record(z.string(), z.json());

export const eventTypeSchema = z.object({
  ratePerDay: z.number().min(0).max(50).optional(),
  cooldownHours: z.number().min(0).max(720).optional(),
  noticeMinutes: z.number().int().min(0).max(10_080).optional(),
  durationMinutes: z.number().int().min(0).max(10_080).optional(),
  enabled: z.boolean().optional(),
  params: eventParams.optional(),
  reason: reasonSchema,
});
export const triggerSchema = z.object({ typeId: z.string().min(1), immediate: z.boolean().default(false), params: eventParams.default({}), reason: reasonSchema });
export const bankSchema = z.object({
  monthlyFee: amount.optional(),
  openingFee: amount.optional(),
  minNetWorth: amount.optional(),
  tradingFeeBps: z.number().int().min(0).max(500).optional(),
  interestMonthly: z.number().min(0).max(50).optional(),
  elecDiscount: z.number().min(0).max(1).optional(),
  insuranceRate: z.number().min(0).max(1).optional(),
  taxShield: z.number().min(0).max(1).optional(),
  hackShield: z.number().min(0).max(1).optional(),
  failRiskPerDay: z.number().min(0).max(1).optional(),
  available: z.boolean().optional(),
  reason: reasonSchema,
});

type Changes<S extends z.ZodType> = Omit<z.infer<S>, 'reason'>;

/** Pilotage de l'économie : types d'événements, déclenchements manuels, banques. Tracé dans le journal d'audit. */
@Injectable()
export class AdminEconomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly banks: BanksService,
  ) {}

  async eventTypes() {
    const types = await this.prisma.eventType.findMany({ orderBy: [{ mood: 'asc' }, { name: 'asc' }], include: { _count: { select: { events: true } } } });
    return types.map(({ _count, ...t }) => ({ ...t, fired: _count.events }));
  }

  async updateEventType(actor: AuthUser, id: string, data: Changes<typeof eventTypeSchema>, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.eventType.update({ where: { id }, data });
      await this.audit.log({ actorId: actor.id, action: 'EVENT_TYPE_UPDATE', targetType: 'Economy', targetId: id, reason, payload: data }, tx);
    });
    return { ok: true };
  }

  /** Déclenche un événement à la main (avec ou sans préavis). */
  async trigger(actor: AuthUser, body: z.infer<typeof triggerSchema>) {
    const type = await this.prisma.eventType.findUnique({ where: { id: body.typeId } });
    if (!type) throw new NotFoundException();
    const params = { ...body.params };
    const bankId = typeof params.bankId === 'string' ? params.bankId : undefined;
    if (type.slug === 'bank-run' && !bankId) throw new BadRequestException('Précise la banque (params.bankId)');
    if (bankId && !params.bank) {
      const b = await this.prisma.bank.findUnique({ where: { id: bankId } });
      if (!b) throw new NotFoundException('Banque inconnue');
      params.bank = b.name;
    }
    const e = await this.events.schedule(type, params, { triggeredBy: actor.id, immediate: body.immediate });
    if (!e) throw new BadRequestException('Aucune cible possible pour cet événement');
    await this.audit.log({ actorId: actor.id, action: 'EVENT_TRIGGER', targetType: 'Economy', targetId: e.id, reason: body.reason, payload: { type: type.slug, immediate: body.immediate, params } });
    return { id: e.id, title: e.title, startsAt: e.startsAt };
  }

  async cancelEvent(actor: AuthUser, id: string, reason: string) {
    if (!(await this.events.cancel(id))) throw new BadRequestException('Événement déjà terminé');
    await this.audit.log({ actorId: actor.id, action: 'EVENT_CANCEL', targetType: 'Economy', targetId: id, reason, payload: {} });
    return { ok: true };
  }

  banksList() {
    return this.banks.adminList();
  }

  async updateBank(actor: AuthUser, id: string, data: Changes<typeof bankSchema>, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.bank.update({ where: { id }, data });
      await this.audit.log({ actorId: actor.id, action: 'BANK_UPDATE', targetType: 'Economy', targetId: id, reason, payload: data }, tx);
    });
    return { ok: true };
  }
}
