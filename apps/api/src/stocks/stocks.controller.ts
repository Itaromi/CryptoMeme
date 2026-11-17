import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../common/auth.decorators';
import { StocksService } from './stocks.service';

@Controller('stocks')
export class StocksController {
  constructor(private readonly stocks: StocksService) {}

  @Public()
  @Get()
  list() {
    return this.stocks.list();
  }

  @Public()
  @Get(':symbol')
  detail(@Param('symbol') symbol: string) {
    return this.stocks.detail(symbol);
  }
}
