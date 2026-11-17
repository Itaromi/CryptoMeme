import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AdminMiningService, modelSchema, networkSchema, poolSchema } from './admin-mining.service';

@Controller('admin/mining')
@Roles('ADMIN', 'MODERATOR')
export class AdminMiningController {
  constructor(private readonly mining: AdminMiningService) {}

  @Get()
  overview() {
    return this.mining.overview();
  }

  @Roles('ADMIN')
  @Patch('networks/:symbol')
  network(@CurrentUser() actor: AuthUser, @Param('symbol') symbol: string, @Body(new ZodPipe(networkSchema)) body: z.infer<typeof networkSchema>) {
    const { reason, ...data } = body;
    return this.mining.updateNetwork(actor, symbol, data, reason);
  }

  @Roles('ADMIN')
  @Patch('pools/:id')
  pool(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(poolSchema)) body: z.infer<typeof poolSchema>) {
    const { reason, ...data } = body;
    return this.mining.updatePool(actor, id, data, reason);
  }

  @Roles('ADMIN')
  @Patch('models/:id')
  model(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(modelSchema)) body: z.infer<typeof modelSchema>) {
    const { reason, ...data } = body;
    return this.mining.updateModel(actor, id, data, reason);
  }
}
