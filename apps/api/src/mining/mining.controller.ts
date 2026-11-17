import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { ComponentKind } from '@prisma/client';
import { ALGOS, MAX_BUY, MAX_OVERCLOCK, MAX_RIG_PARTS } from '@cryptomeme/engine';
import { CATALOG_SORTS, MiningService } from './mining.service';
import { AuthUser, CurrentUser, Public } from '../common/auth.decorators';
import { optionalParam, pageParam, ZodPipe } from '../common/zod.pipe';

const overclock = z.number().int().min(0).max(MAX_OVERCLOCK);
const buySchema = z.object({ modelId: z.string().min(1), quantity: z.number().int().min(1).max(MAX_BUY).default(1) });
const facilitySchema = z.object({ typeId: z.string().min(1), name: z.string().max(40).default('') });
const installSchema = z.object({ facilityId: z.string().min(1).nullable() });
const rigSchema = z.object({ name: z.string().max(40).default(''), rackId: z.string().min(1), partIds: z.array(z.string().min(1)).min(1).max(MAX_RIG_PARTS) });
const previewSchema = z.object({ rackId: z.string().nullable().default(null), partIds: z.array(z.string()).max(MAX_RIG_PARTS), overclock: overclock.default(0) });
const updateRigSchema = z.object({
  name: z.string().max(40).optional(),
  poolId: z.string().nullable().optional(),
  overclock: overclock.optional(),
  running: z.boolean().optional(),
});
const catalogQuery = z.object({
  kind: optionalParam(z.enum(ComponentKind)),
  q: optionalParam(z.string().trim().max(60)),
  algo: optionalParam(z.enum(ALGOS)),
  sort: optionalParam(z.enum(CATALOG_SORTS)),
  page: pageParam,
});

@Controller('mining')
export class MiningController {
  constructor(private readonly mining: MiningService) {}

  @Public()
  @Get('catalog')
  catalog(@Query(new ZodPipe(catalogQuery)) q: z.infer<typeof catalogQuery>) {
    return this.mining.catalog(q);
  }

  @Public()
  @Get('facility-types')
  facilityTypes() {
    return this.mining.facilityTypes();
  }

  @Public()
  @Get('pools')
  pools() {
    return this.mining.pools();
  }

  @Get('farm')
  farm(@CurrentUser() u: AuthUser) {
    return this.mining.farm(u.id);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('buy')
  buy(@CurrentUser() u: AuthUser, @Body(new ZodPipe(buySchema)) b: z.infer<typeof buySchema>) {
    return this.mining.buy(u.id, b.modelId, b.quantity);
  }

  @Post('items/:id/sell')
  sell(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.mining.sell(u.id, id);
  }

  @Post('items/:id/repair')
  repair(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.mining.repair(u.id, id);
  }

  @Post('items/:id/install')
  install(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(installSchema)) b: z.infer<typeof installSchema>) {
    return this.mining.installRack(u.id, id, b.facilityId);
  }

  @Post('facilities')
  buyFacility(@CurrentUser() u: AuthUser, @Body(new ZodPipe(facilitySchema)) b: z.infer<typeof facilitySchema>) {
    return this.mining.buyFacility(u.id, b.typeId, b.name);
  }

  @Post('facilities/:id/sell')
  sellFacility(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.mining.sellFacility(u.id, id);
  }

  @Post('rigs/preview')
  preview(@CurrentUser() u: AuthUser, @Body(new ZodPipe(previewSchema)) b: z.infer<typeof previewSchema>) {
    return this.mining.preview(u.id, b.rackId, b.partIds, b.overclock);
  }

  @Post('rigs')
  createRig(@CurrentUser() u: AuthUser, @Body(new ZodPipe(rigSchema)) b: z.infer<typeof rigSchema>) {
    return this.mining.createRig(u.id, b);
  }

  @Patch('rigs/:id')
  updateRig(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(updateRigSchema)) b: z.infer<typeof updateRigSchema>) {
    return this.mining.updateRig(u.id, id, b);
  }

  @Delete('rigs/:id')
  dismantle(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.mining.dismantle(u.id, id);
  }
}
