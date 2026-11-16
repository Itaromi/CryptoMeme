import { Global, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bail en base pour les jobs planifiés (tick du marché, tick de minage…).
 * Contrairement à pg_advisory_lock (lié à une connexion du pool), il fonctionne
 * quelle que soit la connexion utilisée et expire tout seul si l'instance meurt.
 */
@Injectable()
export class LeaseService implements OnApplicationShutdown {
  private readonly holder = randomUUID();

  constructor(private readonly prisma: PrismaService) {}

  /** Libère les baux à l'arrêt pour que la prochaine instance reprenne sans attendre l'expiration. */
  async onApplicationShutdown() {
    await this.prisma.jobLease.deleteMany({ where: { holder: this.holder } }).catch(() => undefined);
  }

  async acquire(name: string, ttlMs: number): Promise<boolean> {
    const until = new Date(Date.now() + ttlMs);
    const rows = await this.prisma.$queryRaw<{ name: string }[]>`
      INSERT INTO "JobLease" ("name", "holder", "expiresAt") VALUES (${name}, ${this.holder}, ${until})
      ON CONFLICT ("name") DO UPDATE SET "holder" = EXCLUDED."holder", "expiresAt" = EXCLUDED."expiresAt"
      WHERE "JobLease"."holder" = ${this.holder} OR "JobLease"."expiresAt" < now()
      RETURNING "name"`;
    return rows.length > 0;
  }
}

@Global()
@Module({ providers: [LeaseService], exports: [LeaseService] })
export class LeaseModule {}
