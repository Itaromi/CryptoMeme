import { Injectable } from '@nestjs/common';
import type { GameText } from '@cryptomeme/shared';
import { PrismaService } from '../prisma/prisma.service';
import { textColumns, textView } from '../common/texts';
import type { Tx } from './ledger';

export interface NotificationInput {
  userId: string;
  type: string;
  /** Titre et corps français : repli si le site ne connaît pas la clé de `text` */
  title: string;
  body: string;
  /** Texte traduisible : la clé désigne un objet { title, body } des messages du site (« game.notif.… ») */
  text?: GameText;
  amount?: number | string | null;
  link?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async push(items: NotificationInput[], tx: Tx | PrismaService = this.prisma) {
    if (!items.length) return;
    await tx.notification.createMany({
      data: items.map(({ text, amount, ...n }) => ({
        ...n,
        ...(text ? textColumns(text.key, text.params) : {}),
        amount: amount == null ? null : Number(amount).toFixed(2),
      })),
    });
  }

  async list(userId: string) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      unread,
      items: items.map(({ textKey, textParams, ...n }) => ({ ...n, text: textView({ textKey, textParams }), amount: n.amount?.toString() ?? null })),
    };
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
