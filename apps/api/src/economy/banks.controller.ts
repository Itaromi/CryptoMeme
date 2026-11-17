import { Body, Controller, Get, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser, Public } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { BanksService } from './banks.service';

const switchSchema = z.object({ bankId: z.string().min(1) });

@Controller('banks')
export class BanksController {
  constructor(private readonly banks: BanksService) {}

  @Public()
  @Get()
  list(@CurrentUser() u?: AuthUser) {
    return this.banks.list(u?.id);
  }

  @Post('switch')
  switch(@CurrentUser() u: AuthUser, @Body(new ZodPipe(switchSchema)) b: z.infer<typeof switchSchema>) {
    return this.banks.switchBank(u.id, b.bankId);
  }
}
