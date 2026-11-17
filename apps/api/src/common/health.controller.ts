import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from './auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

/** Sonde de santé (Docker healthcheck, supervision) : l'API répond et la base est joignable. */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @SkipThrottle()
  @Get()
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch {
      throw new ServiceUnavailableException({ ok: false });
    }
  }
}
