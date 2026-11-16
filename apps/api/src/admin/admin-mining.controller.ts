import { Body, Controller, Get, NotFoundException, Param, Patch } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

const reason = z.string().min(3).max(500);
const networkSchema = z.object({
  blockReward: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  baseNpcHashrate: z.number().min(0).optional(),
  halvingEveryDays: z.number().min(0.1).max(365).optional(),
  reason,
});
const poolSchema = z.object({
  feeBps: z.number().int().min(-2000).max(5000).optional(),
  scamRisk: z.number().min(0).max(1).optional(),
  active: z.boolean().optional(),
  reason,
});
const modelSchema = z.object({ price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(), available: z.boolean().optional(), reason });

@Controller('admin/mining')
@Roles('ADMIN', 'MODERATOR')
export class AdminMiningController {
  constructor(private readonly prisma: PrismaService) {}

  private audit(actor: AuthUser, action: string, targetId: string, reason: string, payload: object) {
    return this.prisma.auditLog.create({ data: { actorId: actor.id, action, targetType: 'Mining', targetId, reason, payload } });
  }

  @Get()
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

  @Roles('ADMIN')
  @Patch('networks/:symbol')
  async network(@CurrentUser() actor: AuthUser, @Param('symbol') symbol: string, @Body(new ZodPipe(networkSchema)) body: z.infer<typeof networkSchema>) {
    const asset = await this.prisma.asset.findUnique({ where: { symbol: symbol.toUpperCase() } });
    if (!asset) throw new NotFoundException();
    const { reason: r, ...data } = body;
    await this.prisma.miningNetwork.update({ where: { assetId: asset.id }, data });
    await this.audit(actor, 'MINING_NETWORK_UPDATE', asset.symbol, r, data);
    return { ok: true };
  }

  @Roles('ADMIN')
  @Patch('pools/:id')
  async pool(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(poolSchema)) body: z.infer<typeof poolSchema>) {
    const { reason: r, ...data } = body;
    await this.prisma.miningPool.update({ where: { id }, data });
    await this.audit(actor, 'MINING_POOL_UPDATE', id, r, data);
    return { ok: true };
  }

  @Roles('ADMIN')
  @Patch('models/:id')
  async model(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(modelSchema)) body: z.infer<typeof modelSchema>) {
    const { reason: r, ...data } = body;
    await this.prisma.componentModel.update({ where: { id }, data });
    await this.audit(actor, 'MINING_MODEL_UPDATE', id, r, data);
    return { ok: true };
  }
}
