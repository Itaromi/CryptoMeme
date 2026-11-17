import { Body, Controller, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AdminStocksService, stockActionSchema } from './admin-stocks.service';

@Controller('admin/stocks')
@Roles('ADMIN')
export class AdminStocksController {
  constructor(private readonly admin: AdminStocksService) {}

  @Post(':symbol')
  act(@CurrentUser() actor: AuthUser, @Param('symbol') symbol: string, @Body(new ZodPipe(stockActionSchema)) body: z.infer<typeof stockActionSchema>) {
    return this.admin.act(actor, symbol, body);
  }
}
