import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { RealIpThrottlerGuard } from './common/security';
import { validateEnv } from './common/env';
import { HealthController } from './common/health.controller';
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
import { AdminService } from './admin/admin.service';
import { AdminMiningService } from './admin/admin-mining.service';
import { AuditModule } from './common/audit.service';
import { MiningController } from './mining/mining.controller';
import { MiningService } from './mining/mining.service';
import { MiningTickService } from './mining/mining.tick';
import { AdminMiningController } from './admin/admin-mining.controller';
import { ModifiersModule } from './economy/modifiers.service';
import { NotificationsService } from './economy/notifications';
import { NotificationsController } from './economy/notifications.controller';
import { BanksService } from './economy/banks.service';
import { BanksController } from './economy/banks.controller';
import { NetWorthService } from './economy/net-worth.service';
import { WalletStatsService } from './players/wallet-stats.service';
import { EventsService } from './economy/events.service';
import { StocksService } from './stocks/stocks.service';
import { MetaService } from './meta/meta.service';
import { MetaController } from './meta/meta.controller';
import { CreationsService } from './creations/creations.service';
import { CreationsController } from './creations/creations.controller';
import { AdminCreationsController } from './creations/admin-creations.controller';
import { StocksController } from './stocks/stocks.controller';
import { AdminStocksController } from './stocks/admin-stocks.controller';
import { AdminStocksService } from './stocks/admin-stocks.service';
import { EventsController } from './economy/events.controller';
import { AdminEconomyController } from './economy/admin-economy.controller';
import { AdminEconomyService } from './economy/admin-economy.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
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
    AuditModule,
    ModifiersModule,
    AuthModule,
  ],
  controllers: [
    HealthController,
    MarketController,
    TradingController,
    PlayersController,
    AdminController,
    MiningController,
    AdminMiningController,
    NotificationsController,
    BanksController,
    EventsController,
    AdminEconomyController,
    StocksController,
    AdminStocksController,
    MetaController,
    CreationsController,
    AdminCreationsController,
  ],
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
    MetaService,
    CreationsService,
    NetWorthService,
    WalletStatsService,
    AdminService,
    AdminMiningService,
    AdminEconomyService,
    AdminStocksService,
    { provide: APP_GUARD, useClass: RealIpThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
