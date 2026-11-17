import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AssetTier, Creation, Prisma } from '@prisma/client';
import { DEFAULT_PARAMS, STOCK_PARAMS, initialState } from '@cryptomeme/engine';
import { CREATION, CreationInput, QUARTER_MS, SECTORS } from '@cryptomeme/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from '../seasons/seasons.service';
import { LeaseService } from '../common/lease.service';
import { D, Decimal, money } from '../common/decimal';
import { applyAsset, applyCash } from '../economy/ledger';
import { NotificationsService } from '../economy/notifications';

const DAY = 86_400_000;
const KIND_LABEL = { CRYPTO: 'ta crypto', COMPANY: 'ton entreprise', POOL: 'ton pool de minage' } as const;

/**
 * Création d'actifs par les joueurs : crypto, entreprise cotée, pool de minage.
 *
 * Garde-fous économiques :
 * - frais de création + dépôt séquestrés à la demande, remboursés si l'admin refuse ;
 * - la liquidité déposée est verrouillée à vie dans le pool (pas de rug pull du créateur) ;
 * - la part du créateur (10 %) est versée progressivement (vesting 7 jours) ;
 * - royalties = 1/3 des frais de trading des autres joueurs (pas d'argent créé : prélevé sur les frais) ;
 * - la commission d'un pool est prise sur l'émission du réseau, comme les frais des pools PNJ.
 */
@Injectable()
export class CreationsService {
  private readonly log = new Logger('Creations');
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonsService,
    private readonly lease: LeaseService,
    private readonly notify: NotificationsService,
  ) {}

  async config() {
    const networks = await this.prisma.miningNetwork.findMany({ include: { asset: { select: { symbol: true, name: true, emoji: true } } } });
    return { costs: CREATION, sectors: SECTORS, networks: networks.map((n) => ({ symbol: n.asset.symbol, name: n.asset.name, emoji: n.asset.emoji, algo: n.algo })) };
  }

  // ─── Demande ──────────────────────────────────────────────────────
  async request(userId: string, input: CreationInput) {
    const cost = CREATION[input.kind];
    const deposit = input.kind === 'POOL' ? 0 : input.deposit;
    const total = D(cost.fee).add(deposit);

    const live = await this.prisma.creation.count({ where: { userId, kind: input.kind, status: { in: ['PENDING', 'APPROVED'] } } });
    if (live >= CREATION.maxPerKind) throw new BadRequestException(`Maximum ${CREATION.maxPerKind} créations de ce type par joueur`);

    let params: Record<string, unknown>;
    let symbol: string | null = null;
    if (input.kind === 'POOL') {
      const net = await this.prisma.miningNetwork.findFirst({ where: { asset: { symbol: input.network } } });
      if (!net) throw new BadRequestException('Réseau de minage inconnu');
      if (await this.prisma.miningPool.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } } })) throw new BadRequestException('Un pool porte déjà ce nom');
      params = { network: input.network, poolType: input.poolType, feeBps: input.feeBps };
    } else {
      symbol = input.symbol;
      const taken =
        (await this.prisma.asset.findUnique({ where: { symbol } })) ||
        (await this.prisma.creation.findFirst({ where: { symbol, status: 'PENDING' } }));
      if (taken) throw new BadRequestException('Ce symbole est déjà pris');
      params = input.kind === 'CRYPTO' ? { price: input.price } : { price: input.price, sector: input.sector, payout: input.payout };
    }

    const { id: walletId } = await this.seasons.wallet(userId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;
      const w = await tx.wallet.findUniqueOrThrow({ where: { id: walletId }, select: { cash: true } });
      if (D(w.cash).lt(total)) throw new BadRequestException(`Il te faut ${money(total)} $ (frais ${money(D(cost.fee))} $ + dépôt ${money(D(deposit))} $)`);
      const c = await tx.creation.create({
        data: {
          kind: input.kind,
          userId,
          walletId,
          name: input.name,
          symbol,
          emoji: input.emoji,
          color: input.color,
          description: input.description,
          params: params as object,
          fee: cost.fee,
          deposit,
        },
      });
      await applyCash(tx, walletId, total.neg(), 'CREATION', `Demande de création : ${input.name}`, { type: 'Creation', id: c.id });
      return { id: c.id, status: c.status };
    });
  }

  // ─── Modération ───────────────────────────────────────────────────
  async adminList(status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    const rows = await this.prisma.creation.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { username: true } } },
    });
    return rows.map((c) => ({ ...c, fee: c.fee.toString(), deposit: c.deposit.toString(), username: c.user.username }));
  }

  async reject(id: string, actorId: string, note: string) {
    const c = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.creation.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'REJECTED', reviewNote: note, reviewedBy: actorId, decidedAt: new Date() } });
      if (!claimed.count) throw new BadRequestException('Demande introuvable ou déjà traitée');
      const c = await tx.creation.findUniqueOrThrow({ where: { id } });
      await applyCash(tx, c.walletId, D(c.fee).add(D(c.deposit)), 'CREATION_REFUND', `Création refusée : ${c.name}`, { type: 'Creation', id: c.id });
      return c;
    });
    await this.notify.push([{ userId: c.userId, type: 'CREATION', title: `Création refusée : ${c.name}`, body: `Motif : ${note}. Frais et dépôt remboursés.`, amount: D(c.fee).add(D(c.deposit)).toString(), link: '/create' }]);
    return { ok: true };
  }

  async approve(id: string, actorId: string, note?: string) {
    const c = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.creation.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'APPROVED', reviewNote: note, reviewedBy: actorId, decidedAt: new Date() } });
      if (!claimed.count) throw new BadRequestException('Demande introuvable ou déjà traitée');
      const c = await tx.creation.findUniqueOrThrow({ where: { id } });
      if (c.kind === 'POOL') await this.launchPool(tx, c);
      else await this.launchAsset(tx, c);
      return c;
    });
    await this.notify.push([
      {
        userId: c.userId,
        type: 'CREATION',
        title: `${c.name} est en ligne !`,
        body: c.kind === 'POOL' ? 'Ton pool accepte maintenant les mineurs. Tu touches sa commission.' : `${KIND_LABEL[c.kind]} est cotée. Ta part arrive en ${CREATION.vestDays} jours, les royalties dès le premier trade.`,
        link: c.kind === 'POOL' ? '/mining/pools' : `/market/${c.symbol}`,
      },
    ]);
    return { ok: true };
  }

  private async launchAsset(tx: Prisma.TransactionClient, c: Creation) {
    const p = c.params as { price: number; sector?: string; payout?: number };
    const deposit = Number(c.deposit);
    const base = deposit / p.price;
    const isStock = c.kind === 'COMPANY';
    const tier: AssetTier = isStock ? (deposit >= 500_000 ? 'BLUE_CHIP' : 'MID_CAP') : deposit >= 200_000 ? 'MID_CAP' : 'SHITCOIN';
    // Liquidité verrouillée : pas de rug pull aléatoire sur une coin de joueur
    const params = isStock ? STOCK_PARAMS : { ...DEFAULT_PARAMS[tier], rugRisk: 0 };
    const now = new Date();
    const asset = await tx.asset.create({
      data: {
        symbol: c.symbol!,
        name: c.name,
        kind: isStock ? 'STOCK' : 'CRYPTO',
        tier,
        description: c.description,
        emoji: c.emoji,
        color: c.color,
        params: params as object,
        state: initialState(p.price) as object,
        quoteReserve: deposit,
        baseReserve: base,
        price: p.price,
        creatorId: c.userId,
        vestTotal: (base * CREATION.creatorShare).toFixed(8),
        vestStart: now,
        vestEnd: new Date(now.getTime() + CREATION.vestDays * DAY),
        royaltyShare: CREATION.royaltyShare,
        ...(isStock
          ? {
              company: {
                create: {
                  sector: p.sector!,
                  ceo: '', // rempli juste après avec le pseudo du fondateur
                  eps: p.price / (4 * SECTORS[p.sector!]),
                  growth: 0.02 - (p.payout ?? 0) * 0.015,
                  epsVol: 0.1,
                  pe: SECTORS[p.sector!],
                  payout: p.payout ?? 0,
                  health: 0.6,
                  consensus: (p.price / (4 * SECTORS[p.sector!])) * Math.exp(0.02 - (p.payout ?? 0) * 0.015),
                  ipoPrice: p.price,
                  nextEarningsAt: new Date(now.getTime() + QUARTER_MS / 2),
                },
              },
            }
          : {}),
      },
    });
    if (isStock) {
      const u = await tx.user.findUniqueOrThrow({ where: { id: c.userId }, select: { username: true } });
      await tx.company.update({ where: { assetId: asset.id }, data: { ceo: `@${u.username}` } });
    }
    await tx.creation.update({ where: { id: c.id }, data: { assetId: asset.id } });
    await tx.marketEvent.create({ data: { assetId: asset.id, type: 'IPO', detail: `${c.name} fait son entrée sur le marché à ${p.price} $ (création d'un joueur)` } });
  }

  private async launchPool(tx: Prisma.TransactionClient, c: Creation) {
    const p = c.params as { network: string; poolType: 'PPS' | 'PPLNS' | 'SOLO'; feeBps: number };
    const net = await tx.miningNetwork.findFirstOrThrow({ where: { asset: { symbol: p.network } } });
    const pool = await tx.miningPool.create({
      data: {
        slug: `joueur-${c.id}`,
        name: c.name,
        description: c.description,
        assetId: net.assetId,
        type: p.poolType,
        feeBps: p.feeBps,
        ownerId: c.userId,
      },
    });
    await tx.creation.update({ where: { id: c.id }, data: { poolId: pool.id } });
  }

  // ─── Gestion par le créateur ──────────────────────────────────────
  private async own(userId: string, id: string) {
    const c = await this.prisma.creation.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Création introuvable');
    if (c.userId !== userId) throw new ForbiddenException('Ce n’est pas ta création');
    if (c.status !== 'APPROVED') throw new BadRequestException('Création pas encore en ligne');
    return c;
  }

  async setPayout(userId: string, id: string, payout: number) {
    const c = await this.own(userId, id);
    if (c.kind !== 'COMPANY' || !c.assetId) throw new BadRequestException('Seule une entreprise verse des dividendes');
    // Plus on distribue, moins on réinvestit : croissance attendue plus faible
    await this.prisma.company.update({ where: { assetId: c.assetId }, data: { payout, growth: 0.02 - payout * 0.015 } });
    return { ok: true };
  }

  async setPoolFee(userId: string, id: string, feeBps: number) {
    const c = await this.own(userId, id);
    if (c.kind !== 'POOL' || !c.poolId) throw new BadRequestException('Pas un pool');
    await this.prisma.miningPool.update({ where: { id: c.poolId }, data: { feeBps } });
    return { ok: true };
  }

  async mine(userId: string) {
    const rows = await this.prisma.creation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        asset: { include: { company: true, _count: { select: { holdings: { where: { quantity: { gt: 0 } } } } } } },
        pool: { include: { asset: { select: { symbol: true, price: true } }, _count: { select: { rigs: true } } } },
      },
    });
    return rows.map((c) => ({
      id: c.id,
      kind: c.kind,
      status: c.status,
      name: c.name,
      symbol: c.symbol,
      emoji: c.emoji,
      color: c.color,
      fee: c.fee.toString(),
      deposit: c.deposit.toString(),
      reviewNote: c.reviewNote,
      createdAt: c.createdAt,
      decidedAt: c.decidedAt,
      asset: c.asset && {
        symbol: c.asset.symbol,
        price: c.asset.price.toString(),
        liquidity: c.asset.quoteReserve.toString(),
        holders: c.asset._count.holdings,
        vestTotal: c.asset.vestTotal.toString(),
        vestDone: c.asset.vestDone.toString(),
        vestEnd: c.asset.vestEnd,
        royaltiesPaid: c.asset.royaltiesPaid.toString(),
        royaltyAccrued: c.asset.royaltyAccrued.toString(),
        payout: c.asset.company?.payout ?? null,
        status: c.asset.company?.status ?? null,
      },
      pool: c.pool && {
        symbol: c.pool.asset.symbol,
        type: c.pool.type,
        feeBps: c.pool.feeBps,
        rigs: c.pool._count.rigs,
        earned: c.pool.earned.toString(),
        earnedValue: Number(c.pool.earned) * Number(c.pool.asset.price),
      },
    }));
  }

  // ─── Vesting et royalties (chaque minute) ─────────────────────────
  @Interval(60_000)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      if (!(await this.lease.acquire('creations-tick', 5 * 60_000))) return;
      await this.vest();
      await this.payRoyalties();
    } catch (e) {
      this.log.error(e);
    } finally {
      this.running = false;
    }
  }

  private async vest() {
    const now = Date.now();
    const assets = await this.prisma.asset.findMany({ where: { creatorId: { not: null }, vestStart: { not: null } }, select: { id: true } });
    for (const { id } of assets) {
      await this.prisma.$transaction(async (tx) => {
        // Ordre des verrous : actif puis position (comme le trading) → pas d'interblocage
        await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${id} FOR UPDATE`;
        const a = await tx.asset.findUniqueOrThrow({ where: { id }, include: { company: { select: { status: true } } } });
        if (D(a.vestDone).gte(D(a.vestTotal)) || !a.creatorId || !a.vestStart || !a.vestEnd) return;
        if (a.company && !['LISTED', 'TAKEOVER'].includes(a.company.status)) return;
        const frac = Math.min(1, (now - a.vestStart.getTime()) / (a.vestEnd.getTime() - a.vestStart.getTime()));
        const due = D(a.vestTotal).mul(frac).sub(D(a.vestDone)).toDecimalPlaces(8, Decimal.ROUND_DOWN);
        if (due.lte(0)) return;
        const wallet = await this.seasons.wallet(a.creatorId);
        await tx.asset.update({ where: { id }, data: { vestDone: D(a.vestDone).add(due).toString() } });
        await applyAsset(tx, wallet.id, id, due, 'VESTING', `Part du créateur ${a.symbol}`, { type: 'Asset', id });
      });
    }
  }

  private async payRoyalties() {
    const due = await this.prisma.asset.findMany({ where: { creatorId: { not: null }, royaltyAccrued: { gte: 0.01 } }, select: { id: true } });
    for (const { id } of due) {
      // 1) On retire le montant de l'actif (verrou actif seul)…
      const taken = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${id} FOR UPDATE`;
        const a = await tx.asset.findUniqueOrThrow({ where: { id } });
        const amount = D(a.royaltyAccrued).toDecimalPlaces(2, Decimal.ROUND_DOWN);
        if (amount.lte(0) || !a.creatorId) return null;
        await tx.asset.update({ where: { id }, data: { royaltyAccrued: D(a.royaltyAccrued).sub(amount).toString(), royaltiesPaid: { increment: money(amount) } } });
        return { amount, creatorId: a.creatorId, symbol: a.symbol };
      });
      if (!taken) continue;
      // 2) …puis on crédite le créateur (verrou wallet seul)
      try {
        const wallet = await this.seasons.wallet(taken.creatorId);
        await this.prisma.$transaction((tx) => applyCash(tx, wallet.id, taken.amount, 'ROYALTY', `Royalties ${taken.symbol}`, { type: 'Asset', id }));
      } catch (e) {
        this.log.error(`Royalties ${taken.symbol} : ${(e as Error).message}`);
        await this.prisma.asset.update({ where: { id }, data: { royaltyAccrued: { increment: taken.amount.toString() }, royaltiesPaid: { decrement: money(taken.amount) } } });
      }
    }
  }
}
