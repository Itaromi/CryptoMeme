import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CREATION, creationSchema, CreationInput } from '@cryptomeme/shared';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { CreationsService } from './creations.service';

@Controller('creations')
export class CreationsController {
  constructor(private readonly creations: CreationsService) {}

  @Public()
  @Get('config')
  config() {
    return this.creations.config();
  }

  @Get('mine')
  mine(@CurrentUser() u: AuthUser) {
    return this.creations.mine(u.id);
  }

  @Post()
  request(@CurrentUser() u: AuthUser, @Body(new ZodPipe(creationSchema)) body: CreationInput) {
    return this.creations.request(u.id, body);
  }

  @Patch(':id/payout')
  payout(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(z.object({ payout: z.number().min(0).max(0.8) }))) body: { payout: number }) {
    return this.creations.setPayout(u.id, id, body.payout);
  }

  @Patch(':id/pool-fee')
  poolFee(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(z.object({ feeBps: z.number().int().min(0).max(CREATION.poolMaxFeeBps) }))) body: { feeBps: number },
  ) {
    return this.creations.setPoolFee(u.id, id, body.feeBps);
  }
}

const decision = z.object({ reason: z.string().min(3).max(500) });

@Controller('admin/creations')
@Roles('ADMIN', 'MODERATOR')
export class AdminCreationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creations: CreationsService,
  ) {}

  @Get()
  list(@Query('status') status?: string) {
    const s = status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED' ? status : undefined;
    return this.creations.adminList(s);
  }

  @Post(':id/approve')
  async approve(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(decision)) body: { reason: string }) {
    const r = await this.creations.approve(id, actor.id, body.reason);
    await this.prisma.auditLog.create({ data: { actorId: actor.id, action: 'creation.approve', targetType: 'Creation', targetId: id, reason: body.reason, payload: {} } });
    return r;
  }

  @Post(':id/reject')
  async reject(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(decision)) body: { reason: string }) {
    const r = await this.creations.reject(id, actor.id, body.reason);
    await this.prisma.auditLog.create({ data: { actorId: actor.id, action: 'creation.reject', targetType: 'Creation', targetId: id, reason: body.reason, payload: {} } });
    return r;
  }
}
