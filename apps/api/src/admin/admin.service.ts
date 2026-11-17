import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { adminAssetParamsSchema, ReasonBody } from '@cryptomeme/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from '../seasons/seasons.service';
import { PlayersService } from '../players/players.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth.decorators';
import { D, money } from '../common/decimal';
import { applyCash } from '../economy/ledger';
import { paramsJson, paramsOf } from '../market/asset-state';

export type AssetUpdate = z.infer<typeof adminAssetParamsSchema> & ReasonBody;

/** Administration générale : économie, utilisateurs, actifs, saisons. Chaque action est tracée dans le journal d'audit. */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonsService,
    private readonly players: PlayersService,
    private readonly audit: AuditService,
  ) {}

  // ─── Vue d'ensemble de l'économie ─────────────────────────────────
  async overview() {
    const season = await this.seasons.active();
    const since = new Date(Date.now() - 86_400_000);
    const [players, wallets, trades24h, users, events] = await Promise.all([
      this.prisma.wallet.count({ where: { seasonId: season.id } }),
      this.prisma.wallet.aggregate({ where: { seasonId: season.id }, _sum: { cash: true, netWorth: true } }),
      this.prisma.trade.aggregate({ where: { walletId: { not: null }, createdAt: { gte: since } }, _count: true, _sum: { cash: true, fee: true } }),
      this.prisma.user.count(),
      this.prisma.marketEvent.count({ where: { createdAt: { gte: since } } }),
    ]);
    const injected = D(season.startingCash).mul(players);
    return {
      season: { number: season.number, name: season.name, startsAt: season.startsAt },
      users,
      players,
      totalCash: wallets._sum.cash?.toString() ?? '0',
      totalNetWorth: wallets._sum.netWorth?.toString() ?? '0',
      /** Création (ou destruction) de valeur nette des joueurs par rapport au capital injecté. */
      netCreation: money(D(wallets._sum.netWorth).sub(injected)),
      trades24h: trades24h._count,
      volume24h: trades24h._sum.cash?.toString() ?? '0',
      fees24h: trades24h._sum.fee?.toString() ?? '0',
      events24h: events,
    };
  }

  // ─── Utilisateurs ─────────────────────────────────────────────────
  async users(q: string, page: number) {
    const where: Prisma.UserWhereInput = q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }] } : {};
    const season = await this.seasons.active();
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 50,
        take: 50,
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          bannedAt: true,
          banReason: true,
          emailVerifiedAt: true,
          createdAt: true,
          lastLoginAt: true,
          wallets: { where: { seasonId: season.id }, select: { cash: true, netWorth: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      total,
      page,
      items: items.map(({ wallets, ...u }) => ({ ...u, cash: wallets[0]?.cash.toString() ?? null, netWorth: wallets[0]?.netWorth.toString() ?? null })),
    };
  }

  async user(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, username: true, role: true, bannedAt: true, banReason: true, emailVerifiedAt: true, createdAt: true, lastLoginAt: true },
    });
    if (!user) throw new NotFoundException();
    const season = await this.seasons.active();
    const wallet = await this.prisma.wallet.findUnique({ where: { userId_seasonId: { userId: id, seasonId: season.id } } });
    const [ledger, sessions] = await Promise.all([
      wallet ? this.prisma.ledgerEntry.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: 'desc' }, take: 100 }) : [],
      this.prisma.refreshToken.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { ip: true, userAgent: true, createdAt: true, revokedAt: true },
      }),
    ]);
    return { user, wallet, ledger, sessions };
  }

  async ban(actor: AuthUser, id: string, reason: string) {
    if (id === actor.id) throw new BadRequestException('Impossible de se bannir soi-même');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { bannedAt: new Date(), banReason: reason } });
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log({ actorId: actor.id, action: 'USER_BAN', targetType: 'User', targetId: id, reason }, tx);
    });
    return { ok: true };
  }

  async unban(actor: AuthUser, id: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { bannedAt: null, banReason: null } });
      await this.audit.log({ actorId: actor.id, action: 'USER_UNBAN', targetType: 'User', targetId: id, reason }, tx);
    });
    return { ok: true };
  }

  async setRole(actor: AuthUser, id: string, role: Role, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { role } });
      await this.audit.log({ actorId: actor.id, action: 'USER_ROLE', targetType: 'User', targetId: id, reason, payload: { role } }, tx);
    });
    return { ok: true };
  }

  /** Ajustement manuel de cash : grand livre + journal d'audit, dans la même transaction. */
  async adjustCash(actor: AuthUser, userId: string, amount: string, reason: string) {
    const wallet = await this.seasons.wallet(userId);
    const after = await this.prisma.$transaction(async (tx) => {
      await applyCash(tx, wallet.id, D(amount), 'ADMIN_ADJUST', reason, { type: 'Admin', id: actor.id }, { strict: true, message: 'Le solde deviendrait négatif' });
      await this.audit.log({ actorId: actor.id, action: 'CASH_ADJUST', targetType: 'User', targetId: userId, reason, payload: { amount } }, tx);
      return (await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id }, select: { cash: true } })).cash;
    });
    this.players.requestRecompute();
    return { cash: money(after) };
  }

  // ─── Actifs ───────────────────────────────────────────────────────
  async assets() {
    const assets = await this.prisma.asset.findMany({ orderBy: { symbol: 'asc' } });
    return assets.map((a) => ({
      symbol: a.symbol,
      name: a.name,
      tier: a.tier,
      emoji: a.emoji,
      price: a.price.toString(),
      liquidity: a.quoteReserve.toString(),
      params: a.params,
      state: a.state,
      frozen: a.frozen,
      feeBps: a.feeBps,
    }));
  }

  async updateAsset(actor: AuthUser, symbol: string, body: AssetUpdate) {
    const { frozen, reason, ...changes } = body;
    await this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { symbol: symbol.toUpperCase() } });
      if (!asset) throw new NotFoundException();
      const defined = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
      await tx.asset.update({
        where: { id: asset.id },
        data: { ...(frozen !== undefined ? { frozen } : {}), params: paramsJson({ ...paramsOf(asset), ...defined }) },
      });
      await this.audit.log({ actorId: actor.id, action: 'ASSET_UPDATE', targetType: 'Asset', targetId: asset.symbol, reason, payload: { ...body } }, tx);
    });
    return { ok: true };
  }

  // ─── Saisons ──────────────────────────────────────────────────────
  async rollover(actor: AuthUser, body: { name: string; startingCash: string; reason: string }) {
    await this.players.recompute(true); // fige le classement final
    const current = await this.seasons.active();
    const next = await this.prisma.$transaction(async (tx) => {
      await tx.season.update({ where: { id: current.id }, data: { status: 'ENDED', endsAt: new Date() } });
      const next = await tx.season.create({ data: { number: current.number + 1, name: body.name, startingCash: body.startingCash } });
      await this.audit.log(
        { actorId: actor.id, action: 'SEASON_ROLLOVER', targetType: 'Season', targetId: next.id, reason: body.reason, payload: { from: current.number, to: next.number } },
        tx,
      );
      return next;
    });
    this.seasons.invalidate();
    return next;
  }

  auditLog(page: number) {
    return this.audit.page(page);
  }
}
