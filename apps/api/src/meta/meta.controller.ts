import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser, Public } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { buyCosmeticSchema, equipSchema, MetaService } from './meta.service';

@Controller()
export class MetaController {
  constructor(private readonly meta: MetaService) {}

  @Public()
  @Get('shop')
  shop(@CurrentUser() u?: AuthUser) {
    return this.meta.shop(u?.id);
  }

  @Post('shop/buy')
  buy(@CurrentUser() u: AuthUser, @Body(new ZodPipe(buyCosmeticSchema)) body: z.infer<typeof buyCosmeticSchema>) {
    return this.meta.buy(u.id, body.slug);
  }

  @Patch('me/look')
  equip(@CurrentUser() u: AuthUser, @Body(new ZodPipe(equipSchema)) body: z.infer<typeof equipSchema>) {
    return this.meta.equip(u.id, body);
  }

  @Public()
  @Get('achievements')
  achievements(@CurrentUser() u?: AuthUser) {
    return this.meta.achievements(u?.id);
  }
}
