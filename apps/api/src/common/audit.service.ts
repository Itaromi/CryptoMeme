import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Tx } from '../economy/ledger';

/** Actions tracées dans le journal d'audit (SCREAMING_CASE). */
export const AUDIT_ACTIONS = [
  'USER_BAN',
  'USER_UNBAN',
  'USER_ROLE',
  'CASH_ADJUST',
  'ASSET_UPDATE',
  'SEASON_ROLLOVER',
  'MINING_NETWORK_UPDATE',
  'MINING_POOL_UPDATE',
  'MINING_MODEL_UPDATE',
  'EVENT_TYPE_UPDATE',
  'EVENT_TRIGGER',
  'EVENT_CANCEL',
  'BANK_UPDATE',
  'CREATION_APPROVE',
  'CREATION_REJECT',
  'STOCK_EARNINGS',
  'STOCK_NEWS_GOOD',
  'STOCK_NEWS_BAD',
  'STOCK_SPLIT',
  'STOCK_TAKEOVER',
  'STOCK_TAKEOVER_SUCCESS',
  'STOCK_TAKEOVER_FAIL',
  'STOCK_BANKRUPT',
  'STOCK_RELIST',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  actorId: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  reason?: string;
  payload?: Prisma.InputJsonValue;
}

/** Journal d'audit des actions d'administration. Passer `tx` pour écrire dans la même transaction que l'action. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, tx: Tx | PrismaService = this.prisma) {
    await tx.auditLog.create({ data: entry });
  }

  page(page: number, size = 50) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
      include: { actor: { select: { username: true } } },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
