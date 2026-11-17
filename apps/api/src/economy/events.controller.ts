import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/auth.decorators';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Public()
  @Get()
  feed() {
    return this.events.feed();
  }
}
