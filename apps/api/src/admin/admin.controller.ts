import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { STARTING_CASH, adminAssetParamsSchema, adminCashAdjustSchema } from '@cryptomeme/shared';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from '../seasons/seasons.service';
import { PlayersService } from '../players/players.service';
import { D, money } from '../common/decimal';

const banSchema = z.object({ reason: z.string().min(3).max(500) });
const reasonSchema = z.object({ reason: z.string().min(3).max(500) });
const newSeasonSchema = z.object({
  name: z.string().min(3).max(80),
  startingCash: z.string().regex(/^\d+(\.\d{1,2})?$/).default(STARTING_CASH),
  reason: z.string().min(3).max(500),
});
const roleSchema = z.object({ role: z.enum(['PLAYER', 'MODERATOR', 'ADMIN']), reason: z.string().min(3).max(500) });

@Controller('admin')
@Roles('ADMIN', 'MODERATOR')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonsService,
    private readonly players: PlayersService,
  ) {}

  private audit(actor: AuthUser, action: string, targetType: string, targetId: string, reason?: string, payload?: object) {
    return this.prisma.auditLog.create({ data: { actorId: actor.id, action, targetType, targetId, reason, payload } });
  }

  // ─── Vue d'ensemble de l'économie ─────────────────────────────────
  @Get('overview')
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
  @Get('users')
  async users(@Query('q') q = '', @Query('page') page = '1') {
    const where: Prisma.UserWhereInput = q
      ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }] }
      : {};
    const p = Math.max(1, Number(page) || 1);
    const season = await this.seasons.active();
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * 50,
        take: 50,
        select: {
          id: true, email: true, username: true, role: true, bannedAt: true, banReason: true, emailVerifiedAt: true, createdAt: true, lastLoginAt: true,
          wallets: { where: { seasonId: season.id }, select: { cash: true, netWorth: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      total,
      page: p,
      items: items.map(({ wallets, ...u }) => ({ ...u, cash: wallets[0]?.cash.toString() ?? null, netWorth: wallets[0]?.netWorth.toString() ?? null })),
    };
  }

  @Get('users/:id')
  async user(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, username: true, role: true, bannedAt: true, banReason: true, emailVerifiedAt: true, createdAt: true, lastLoginAt: true },
    });
    if (!user) throw new NotFoundException();
    const season = await this.seasons.active();
    const wallet = await this.prisma.wallet.findUnique({ where: { userId_seasonId: { userId: id, seasonId: season.id } } });
    const [ledger, sessions] = await Promise.all([
      wallet
        ? this.prisma.ledgerEntry.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: 'desc' }, take: 100 })
        : [],
      this.prisma.refreshToken.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { ip: true, userAgent: true, createdAt: true, revokedAt: true },
      }),
    ]);
    return { user, wallet, ledger, sessions };
  }

  @Post('users/:id/ban')
  async ban(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(banSchema)) body: { reason: string }) {
    if (id === actor.id) throw new BadRequestException('Impossible de se bannir soi-même');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { bannedAt: new Date(), banReason: body.reason } }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit(actor, 'USER_BAN', 'User', id, body.reason);
    return { ok: true };
  }

  @Post('users/:id/unban')
  async unban(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(reasonSchema)) body: { reason: string }) {
    await this.prisma.user.update({ where: { id }, data: { bannedAt: null, banReason: null } });
    await this.audit(actor, 'USER_UNBAN', 'User', id, body.reason);
    return { ok: true };
  }

  @Roles('ADMIN')
  @Post('users/:id/role')
  async role(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodPipe(roleSchema)) body: z.infer<typeof roleSchema>) {
    await this.prisma.user.update({ where: { id }, data: { role: body.role } });
    await this.audit(actor, 'USER_ROLE', 'User', id, body.reason, { role: body.role });
    return { ok: true };
  }

  /** Ajustement manuel de cash — tracé dans le grand livre ET le journal d'audit. */
  @Roles('ADMIN')
  @Post('users/:id/cash')
  async adjustCash(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(adminCashAdjustSchema)) body: { amount: string; reason: string },
  ) {
    const wallet = await this.seasons.wallet(id);
    const amount = D(body.amount);
    const after = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${wallet.id} FOR UPDATE`;
      const w = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      const next = D(w.cash).add(amount);
      if (next.lt(0)) throw new BadRequestException('Le solde deviendrait négatif');
      await tx.wallet.update({ where: { id: w.id }, data: { cash: money(next) } });
      await tx.ledgerEntry.create({
        data: { walletId: w.id, kind: 'ADMIN_ADJUST', delta: money(amount), balanceAfter: money(next), memo: body.reason, refType: 'Admin', refId: actor.id },
      });
      return next;
    });
    await this.audit(actor, 'CASH_ADJUST', 'User', id, body.reason, { amount: body.amount });
    void this.players.recompute();
    return { cash: money(after) };
  }

  // ─── Actifs ───────────────────────────────────────────────────────
  @Get('assets')
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

  @Roles('ADMIN')
  @Patch('assets/:symbol')
  async updateAsset(
    @CurrentUser() actor: AuthUser,
    @Param('symbol') symbol: string,
    @Body(new ZodPipe(adminAssetParamsSchema.extend({ reason: z.string().min(3).max(500) })))
    body: z.infer<typeof adminAssetParamsSchema> & { reason: string },
  ) {
    const asset = await this.prisma.asset.findUnique({ where: { symbol: symbol.toUpperCase() } });
    if (!asset) throw new NotFoundException();
    const { frozen, reason, ...params } = body;
    await this.prisma.asset.update({
      where: { id: asset.id },
      data: { ...(frozen !== undefined ? { frozen } : {}), params: { ...(asset.params as object), ...params } },
    });
    await this.audit(actor, 'ASSET_UPDATE', 'Asset', asset.symbol, reason, body);
    return { ok: true };
  }

  // ─── Saisons ──────────────────────────────────────────────────────
  @Roles('ADMIN')
  @Post('seasons/rollover')
  async rollover(@CurrentUser() actor: AuthUser, @Body(new ZodPipe(newSeasonSchema)) body: z.infer<typeof newSeasonSchema>) {
    await this.players.recompute(true); // fige le classement final
    const current = await this.seasons.active();
    const next = await this.prisma.$transaction(async (tx) => {
      await tx.season.update({ where: { id: current.id }, data: { status: 'ENDED', endsAt: new Date() } });
      return tx.season.create({ data: { number: current.number + 1, name: body.name, startingCash: body.startingCash } });
    });
    this.seasons.invalidate();
    await this.audit(actor, 'SEASON_ROLLOVER', 'Season', next.id, body.reason, { from: current.number, to: next.number });
    return next;
  }

  // ─── Audit ────────────────────────────────────────────────────────
  @Get('audit')
  audit_(@Query('page') page = '1') {
    const p = Math.max(1, Number(page) || 1);
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * 50,
      take: 50,
      include: { actor: { select: { username: true } } },
    });
  }
}
