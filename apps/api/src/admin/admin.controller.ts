import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { STARTING_CASH, adminAssetParamsSchema, adminCashAdjustSchema, reasonBodySchema, reasonSchema } from '@cryptomeme/shared';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { optionalParam, pageParam, ZodPipe } from '../common/zod.pipe';
import { AdminService } from './admin.service';

const newSeasonSchema = z.object({
  name: z.string().min(3).max(80),
  startingCash: z.string().regex(/^\d+(\.\d{1,2})?$/).default(STARTING_CASH),
  reason: reasonSchema,
});
const roleSchema = z.object({ role: z.enum(['PLAYER', 'MODERATOR', 'ADMIN']), reason: reasonSchema });
const assetSchema = adminAssetParamsSchema.extend({ reason: reasonSchema });
const usersQuery = z.object({ q: optionalParam(z.string().trim().max(100)).transform((v) => v ?? ''), page: pageParam });
const pageQuery = z.object({ page: pageParam });

@Controller('admin')
@Roles('ADMIN', 'MODERATOR')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('users')
  users(@Query(new ZodPipe(usersQuery)) q: z.infer<typeof usersQuery>) {
    return this.admin.users(q.q, q.page);
  }

  @Get('users/:id')
  user(@Param('id') id: string) {
    return this.admin.user(id);
  }

  @Post('users/:id/ban')
  ban(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(reasonBodySchema)) body: z.infer<typeof reasonBodySchema>) {
    return this.admin.ban(actor, id, body.reason);
  }

  @Post('users/:id/unban')
  unban(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(reasonBodySchema)) body: z.infer<typeof reasonBodySchema>) {
    return this.admin.unban(actor, id, body.reason);
  }

  @Roles('ADMIN')
  @Post('users/:id/role')
  role(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(roleSchema)) body: z.infer<typeof roleSchema>) {
    return this.admin.setRole(actor, id, body.role, body.reason);
  }

  /** Ajustement manuel de cash — tracé dans le grand livre ET le journal d'audit. */
  @Roles('ADMIN')
  @Post('users/:id/cash')
  adjustCash(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(adminCashAdjustSchema)) body: z.infer<typeof adminCashAdjustSchema>) {
    return this.admin.adjustCash(actor, id, body.amount, body.reason);
  }

  @Get('assets')
  assets() {
    return this.admin.assets();
  }

  @Roles('ADMIN')
  @Patch('assets/:symbol')
  updateAsset(@CurrentUser() actor: AuthUser, @Param('symbol') symbol: string, @Body(new ZodPipe(assetSchema)) body: z.infer<typeof assetSchema>) {
    return this.admin.updateAsset(actor, symbol, body);
  }

  @Roles('ADMIN')
  @Post('seasons/rollover')
  rollover(@CurrentUser() actor: AuthUser, @Body(new ZodPipe(newSeasonSchema)) body: z.infer<typeof newSeasonSchema>) {
    return this.admin.rollover(actor, body);
  }

  @Get('audit')
  audit(@Query(new ZodPipe(pageQuery)) q: z.infer<typeof pageQuery>) {
    return this.admin.auditLog(q.page);
  }
}
