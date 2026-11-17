import { Body, Controller, Get, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { NotificationsService } from './notifications';

const readSchema = z.object({ ids: z.array(z.string()).max(100).optional() });

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.notifications.list(u.id);
  }

  @Post('read')
  read(@CurrentUser() u: AuthUser, @Body(new ZodPipe(readSchema)) body: z.infer<typeof readSchema>) {
    return this.notifications.markRead(u.id, body.ids);
  }
}
