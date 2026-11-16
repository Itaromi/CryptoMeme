import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.service';
import { SeasonsModule } from './seasons/seasons.service';
import { AuthGuard } from './common/auth.guard';
import { LeaseModule } from './common/lease.service';
import { AuthModule } from './auth/auth.module';
import { MarketController } from './market/market.controller';
import { MarketService } from './market/market.service';
import { MarketGateway } from './market/market.gateway';
import { TickService } from './market/tick.service';
import { TradingController } from './trading/trading.controller';
import { TradingService } from './trading/trading.service';
import { PlayersController } from './players/players.controller';
import { PlayersService } from './players/players.service';
import { AdminController } from './admin/admin.controller';
import { MiningController } from './mining/mining.controller';
import { MiningService } from './mining/mining.service';
import { MiningTickService } from './mining/mining.tick';
import { AdminMiningController } from './admin/admin-mining.controller';
import { ModifiersModule } from './economy/modifiers.service';
import { NotificationsController, NotificationsService } from './economy/notifications';
import { BanksController, BanksService } from './economy/banks.service';
import { EventsService } from './economy/events.service';
import { StocksService } from './stocks/stocks.service';
import { AdminStocksController, StocksController } from './stocks/stocks.controller';
import { AdminEconomyController, EventsController } from './economy/events.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => {
        const secret = c.get<string>('JWT_SECRET');
        if (!secret || secret.length < 32) throw new Error('JWT_SECRET manquant ou trop court (32 caractères min.)');
        return { secret };
      },
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    SeasonsModule,
    LeaseModule,
    ModifiersModule,
    AuthModule,
  ],
  controllers: [MarketController, TradingController, PlayersController, AdminController, MiningController, AdminMiningController, NotificationsController, BanksController, EventsController, AdminEconomyController, StocksController, AdminStocksController],
  providers: [
    MarketService,
    MarketGateway,
    TickService,
    TradingService,
    PlayersService,
    MiningService,
    MiningTickService,
    NotificationsService,
    BanksService,
    EventsService,
    StocksService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
