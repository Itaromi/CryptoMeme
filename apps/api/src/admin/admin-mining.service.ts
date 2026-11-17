import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { reasonSchema } from '@cryptomeme/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth.decorators';

export const networkSchema = z.object({
  blockReward: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  baseNpcHashrate: z.number().min(0).optional(),
  halvingEveryDays: z.number().min(0.1).max(365).optional(),
  reason: reasonSchema,
});
export const poolSchema = z.object({
  feeBps: z.number().int().min(-2000).max(5000).optional(),
  scamRisk: z.number().min(0).max(1).optional(),
  active: z.boolean().optional(),
  reason: reasonSchema,
});
export const modelSchema = z.object({ price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(), available: z.boolean().optional(), reason: reasonSchema });

type Changes<S extends z.ZodType> = Omit<z.infer<S>, 'reason'>;

/** Réglages du minage (réseaux, pools, catalogue), tracés dans le journal d'audit. */
@Injectable()
export class AdminMiningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async overview() {
    const [networks, pools, rigs, running, items, logs] = await Promise.all([
      this.prisma.miningNetwork.findMany({ include: { asset: { select: { symbol: true, price: true } } } }),
      this.prisma.miningPool.findMany({ include: { asset: { select: { symbol: true } }, _count: { select: { rigs: true } } } }),
      this.prisma.rig.count(),
      this.prisma.rig.count({ where: { running: true } }),
      this.prisma.componentItem.groupBy({ by: ['status'], _count: true }),
      this.prisma.miningLog.groupBy({ by: ['type'], _count: true, where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
    ]);
    return {
      networks: networks.map((n) => ({
        symbol: n.asset.symbol,
        algo: n.algo,
        price: n.asset.price.toString(),
        blockReward: n.blockReward.toString(),
        npcHashrate: n.npcHashrate,
        baseNpcHashrate: n.baseNpcHashrate,
        playerHashrate: n.playerHashrate,
        halvingEveryDays: n.halvingEveryDays,
        lastHalvingAt: n.lastHalvingAt,
        totalMined: n.totalMined.toString(),
      })),
      pools: pools.map((p) => ({ id: p.id, name: p.name, symbol: p.asset.symbol, type: p.type, feeBps: p.feeBps, scamRisk: p.scamRisk, active: p.active, rigs: p._count.rigs })),
      rigs,
      running,
      items: Object.fromEntries(items.map((i) => [i.status, i._count])),
      incidents24h: Object.fromEntries(logs.map((l) => [l.type, l._count])),
    };
  }

  async updateNetwork(actor: AuthUser, symbol: string, data: Changes<typeof networkSchema>, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { symbol: symbol.toUpperCase() } });
      if (!asset) throw new NotFoundException();
      await tx.miningNetwork.update({ where: { assetId: asset.id }, data });
      await this.audit.log({ actorId: actor.id, action: 'MINING_NETWORK_UPDATE', targetType: 'Mining', targetId: asset.symbol, reason, payload: data }, tx);
    });
    return { ok: true };
  }

  async updatePool(actor: AuthUser, id: string, data: Changes<typeof poolSchema>, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.miningPool.update({ where: { id }, data });
      await this.audit.log({ actorId: actor.id, action: 'MINING_POOL_UPDATE', targetType: 'Mining', targetId: id, reason, payload: data }, tx);
    });
    return { ok: true };
  }

  async updateModel(actor: AuthUser, id: string, data: Changes<typeof modelSchema>, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.componentModel.update({ where: { id }, data });
      await this.audit.log({ actorId: actor.id, action: 'MINING_MODEL_UPDATE', targetType: 'Mining', targetId: id, reason, payload: data }, tx);
    });
    return { ok: true };
  }
}
