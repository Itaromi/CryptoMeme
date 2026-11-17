import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { CREATION, creationSchema, CreationInput } from '@cryptomeme/shared';
import { AuthUser, CurrentUser, Public } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { CreationsService } from './creations.service';

const payoutSchema = z.object({ payout: z.number().min(0).max(0.8) });
const poolFeeSchema = z.object({ feeBps: z.number().int().min(0).max(CREATION.poolMaxFeeBps) });

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
  payout(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(payoutSchema)) body: z.infer<typeof payoutSchema>) {
    return this.creations.setPayout(u.id, id, body.payout);
  }

  @Patch(':id/pool-fee')
  poolFee(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(poolFeeSchema)) body: z.infer<typeof poolFeeSchema>) {
    return this.creations.setPoolFee(u.id, id, body.feeBps);
  }
}
