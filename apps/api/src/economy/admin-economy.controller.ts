import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { reasonBodySchema } from '@cryptomeme/shared';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AdminEconomyService, bankSchema, eventTypeSchema, triggerSchema } from './admin-economy.service';

@Controller('admin/economy')
@Roles('ADMIN', 'MODERATOR')
export class AdminEconomyController {
  constructor(private readonly economy: AdminEconomyService) {}

  @Get('event-types')
  types() {
    return this.economy.eventTypes();
  }

  @Roles('ADMIN')
  @Patch('event-types/:id')
  updateType(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(eventTypeSchema)) body: z.infer<typeof eventTypeSchema>) {
    const { reason, ...data } = body;
    return this.economy.updateEventType(actor, id, data, reason);
  }

  /** Déclenche un événement à la main (avec ou sans préavis). */
  @Roles('ADMIN')
  @Post('trigger')
  trigger(@CurrentUser() actor: AuthUser, @Body(new ZodPipe(triggerSchema)) body: z.infer<typeof triggerSchema>) {
    return this.economy.trigger(actor, body);
  }

  @Roles('ADMIN')
  @Post('events/:id/cancel')
  cancel(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(reasonBodySchema)) body: z.infer<typeof reasonBodySchema>) {
    return this.economy.cancelEvent(actor, id, body.reason);
  }

  @Get('banks')
  banks() {
    return this.economy.banksList();
  }

  @Roles('ADMIN')
  @Patch('banks/:id')
  updateBank(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(bankSchema)) body: z.infer<typeof bankSchema>) {
    const { reason, ...data } = body;
    return this.economy.updateBank(actor, id, data, reason);
  }
}
