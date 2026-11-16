import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser, Public } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { EquipInput, MetaService } from './meta.service';

const slug = z.string().min(1).max(60);
const equipSchema = z.object({
  avatar: z.string().max(16).optional(),
  frame: slug.nullable().optional(),
  banner: slug.nullable().optional(),
  title: slug.nullable().optional(),
  nameEffect: slug.nullable().optional(),
  badges: z.array(slug).max(3).optional(),
  showcase: z.array(slug).max(4).optional(),
});

@Controller()
export class MetaController {
  constructor(private readonly meta: MetaService) {}

  @Public()
  @Get('shop')
  shop(@CurrentUser() u?: AuthUser) {
    return this.meta.shop(u?.id);
  }

  @Post('shop/buy')
  buy(@CurrentUser() u: AuthUser, @Body(new ZodPipe(z.object({ slug }))) body: { slug: string }) {
    return this.meta.buy(u.id, body.slug);
  }

  @Patch('me/look')
  equip(@CurrentUser() u: AuthUser, @Body(new ZodPipe(equipSchema)) body: EquipInput) {
    return this.meta.equip(u.id, body);
  }

  @Public()
  @Get('achievements')
  achievements(@CurrentUser() u?: AuthUser) {
    return this.meta.achievements(u?.id);
  }
}
