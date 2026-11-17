import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { reasonBodySchema } from '@cryptomeme/shared';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { optionalParam, ZodPipe } from '../common/zod.pipe';
import { CreationsService } from './creations.service';

const listQuery = z.object({ status: optionalParam(z.enum(['PENDING', 'APPROVED', 'REJECTED'])) });

@Controller('admin/creations')
@Roles('ADMIN', 'MODERATOR')
export class AdminCreationsController {
  constructor(private readonly creations: CreationsService) {}

  @Get()
  list(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.creations.adminList(q.status);
  }

  @Post(':id/approve')
  approve(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(reasonBodySchema)) body: z.infer<typeof reasonBodySchema>) {
    return this.creations.approve(id, actor.id, body.reason);
  }

  @Post(':id/reject')
  reject(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(reasonBodySchema)) body: z.infer<typeof reasonBodySchema>) {
    return this.creations.reject(id, actor.id, body.reason);
  }
}
