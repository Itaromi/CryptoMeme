import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Tx } from './ledger';

export interface NotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  amount?: number | string | null;
  link?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async push(items: NotificationInput[], tx: Tx | PrismaService = this.prisma) {
    if (!items.length) return;
    await tx.notification.createMany({
      data: items.map((n) => ({ ...n, amount: n.amount == null ? null : Number(n.amount).toFixed(2) })),
    });
  }

  async list(userId: string) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { unread, items: items.map((n) => ({ ...n, amount: n.amount?.toString() ?? null })) };
  }

  /** Marque comme lues les notifications données (toutes si `ids` est absent). */
  async markRead(userId: string, ids?: string[]) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
