import { Body, Controller, Get, Injectable, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';

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

  async push(items: NotificationInput[], tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    if (!items.length) return;
    await tx.notification.createMany({
      data: items.map((n) => ({ ...n, amount: n.amount == null ? null : Number(n.amount).toFixed(2) })),
    });
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() u: AuthUser) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.notification.count({ where: { userId: u.id, readAt: null } }),
    ]);
    return { unread, items: items.map((n) => ({ ...n, amount: n.amount?.toString() ?? null })) };
  }

  @Post('read')
  async read(@CurrentUser() u: AuthUser, @Body(new ZodPipe(z.object({ ids: z.array(z.string()).max(100).optional() }))) body: { ids?: string[] }) {
    await this.prisma.notification.updateMany({
      where: { userId: u.id, readAt: null, ...(body.ids ? { id: { in: body.ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
