import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ComponentKind, Prisma } from '@prisma/client';
import { Algo, ALGOS, computeRig, Hashrates, MAX_OVERCLOCK, resaleValue } from '@cryptomeme/engine';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from '../seasons/seasons.service';
import { D, money } from '../common/decimal';
import { ModifiersService } from '../economy/modifiers.service';
import {
  coinsPerMinute,
  effectiveFee,
  facilitySpec,
  federationCounts,
  FullRig,
  rackSpec,
  rigStats,
  toSpec,
} from './specs';

const RIG_INCLUDE = {
  parts: { include: { model: true } },
  rack: { include: { model: true, facility: { include: { type: true } } } },
  pool: true,
} satisfies Prisma.RigInclude;

const REPAIR_RATIO = 0.3;
const MAX_BUY = 20;

type Tx = Prisma.TransactionClient;

@Injectable()
export class MiningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonsService,
    private readonly modifiers: ModifiersService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────
  /** Débite/crédite le cash du wallet (verrou de ligne) + écriture au grand livre. */
  private async moveCash(tx: Tx, walletId: string, delta: Prisma.Decimal | string | number, kind: 'HARDWARE_BUY' | 'HARDWARE_SELL' | 'REPAIR', memo: string, refId?: string) {
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;
    const w = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });
    const next = D(w.cash).add(D(delta));
    if (next.lt(0)) throw new BadRequestException('Cash insuffisant');
    await tx.wallet.update({ where: { id: walletId }, data: { cash: money(next), ...(next.gt(0) ? { powerCut: false } : {}) } });
    await tx.ledgerEntry.create({
      data: { walletId, kind, delta: money(D(delta)), balanceAfter: money(next), memo, refType: 'Mining', refId },
    });
  }

  private async ownedItem(tx: Tx | PrismaService, walletId: string, id: string) {
    const item = await tx.componentItem.findUnique({ where: { id }, include: { model: true, rigsInRack: true } });
    if (!item || item.walletId !== walletId) throw new NotFoundException('Composant introuvable');
    return item;
  }

  /** Tout joueur démarre avec une chambre d'ado et une caisse en bois. */
  async ensureStarter(walletId: string) {
    const has = await this.prisma.facility.count({ where: { walletId } });
    if (has) return;
    const [room, crate] = await Promise.all([
      this.prisma.facilityType.findUnique({ where: { slug: 'chambre-ado' } }),
      this.prisma.componentModel.findUnique({ where: { slug: 'recup-caisse-en-bois' } }),
    ]);
    if (!room) return;
    await this.prisma.$transaction(async (tx) => {
      const again = await tx.facility.count({ where: { walletId } });
      if (again) return;
      const f = await tx.facility.create({ data: { walletId, typeId: room.id, name: 'Ma chambre' } });
      if (crate) await tx.componentItem.create({ data: { walletId, modelId: crate.id, purchasePrice: 0, facilityId: f.id } });
      await tx.miningLog.create({ data: { walletId, type: 'INFO', message: 'Tu as récupéré ta chambre et une vieille caisse en bois. Ta ferme commence ici.' } });
    });
  }

  // ─── Catalogue & boutique ─────────────────────────────────────────
  async catalog(q: { kind?: string; search?: string; algo?: string; sort?: string; page?: number }) {
    const where: Prisma.ComponentModelWhereInput = { available: true };
    if (q.kind && q.kind in ComponentKind) where.kind = q.kind as ComponentKind;
    if (q.search) where.OR = [{ name: { contains: q.search, mode: 'insensitive' } }, { brand: { contains: q.search, mode: 'insensitive' } }];
    const { hardwareMultiplier: hw } = await this.modifiers.current();
    const [models, nets] = await Promise.all([
      this.prisma.componentModel.findMany({ where, orderBy: { price: 'asc' } }),
      this.prisma.miningNetwork.findMany({ include: { asset: { select: { price: true } } } }),
    ]);
    // $/jour pour 1 MH/s sur chaque algo, au cours actuel
    const usdPerMh = new Map(nets.map((n) => [n.algo, coinsPerMinute(1, n) * 1440 * Number(n.asset.price)]));
    const algo = (ALGOS as readonly string[]).includes(q.algo ?? '') ? (q.algo as Algo) : null;
    const rows = models.map((m) => {
      const h = m.hashrates as Hashrates;
      const values = (Object.entries(h) as [Algo, number][])
        .filter(([a]) => !algo || a === algo)
        .map(([a, v]) => ({ algo: a, usd: v * (usdPerMh.get(a) ?? 0) }))
        .sort((x, y) => y.usd - x.usd);
      const best = values[0]?.usd ?? 0;
      return {
        id: m.id,
        kind: m.kind,
        brand: m.brand,
        name: m.name,
        tier: m.tier,
        price: D(m.price).mul(hw).toFixed(2),
        watts: m.watts,
        hashrates: h,
        efficiency: m.efficiency,
        socket: m.socket,
        gpuSlots: m.gpuSlots,
        coolingW: m.coolingW,
        rackSlots: m.rackSlots,
        airflow: m.airflow,
        failureRate: m.failureRate,
        description: m.description,
        /** Algo le plus rentable et revenu brut estimé ($/jour) */
        bestAlgo: values[0]?.algo ?? null,
        usdPerDay: best,
        perWatt: m.watts ? best / m.watts : 0,
        perDollar: best / (Number(m.price) * hw || 1),
      };
    });
    const sorters: Record<string, (a: (typeof rows)[0], b: (typeof rows)[0]) => number> = {
      price: (a, b) => Number(a.price) - Number(b.price),
      '-price': (a, b) => Number(b.price) - Number(a.price),
      perWatt: (a, b) => b.perWatt - a.perWatt,
      perDollar: (a, b) => b.perDollar - a.perDollar,
    };
    rows.sort(sorters[q.sort ?? 'price'] ?? sorters.price);
    const page = Math.max(1, q.page ?? 1);
    return { total: rows.length, page, items: rows.slice((page - 1) * 40, page * 40) };
  }

  async buy(userId: string, modelId: string, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_BUY) throw new BadRequestException(`Quantité entre 1 et ${MAX_BUY}`);
    const wallet = await this.seasons.wallet(userId);
    const model = await this.prisma.componentModel.findUnique({ where: { id: modelId } });
    if (!model || !model.available) throw new NotFoundException('Modèle indisponible');
    const { hardwareMultiplier } = await this.modifiers.current();
    const total = D(model.price).mul(hardwareMultiplier).toDecimalPlaces(2).mul(quantity);
    await this.prisma.$transaction(async (tx) => {
      await this.moveCash(tx, wallet.id, total.neg().toString(), 'HARDWARE_BUY', `${quantity} × ${model.brand} ${model.name}`, model.id);
      await tx.componentItem.createMany({
        data: Array.from({ length: quantity }, () => ({ walletId: wallet.id, modelId: model.id, purchasePrice: model.price })),
      });
    });
    return { ok: true, spent: money(total) };
  }

  async sell(userId: string, itemId: string) {
    const wallet = await this.seasons.wallet(userId);
    return this.prisma.$transaction(async (tx) => {
      const item = await this.ownedItem(tx, wallet.id, itemId);
      if (item.rigId) throw new BadRequestException("Démonte d'abord la rig qui utilise ce composant");
      if (item.rigsInRack.length) throw new BadRequestException('Ce rack contient encore des rigs');
      const { hardwareMultiplier } = await this.modifiers.current();
      const value = item.status === 'DESTROYED' ? 0 : resaleValue(Number(item.model.price), item.wear, item.status === 'BROKEN') * hardwareMultiplier;
      await tx.componentItem.delete({ where: { id: item.id } });
      if (value > 0) await this.moveCash(tx, wallet.id, value.toFixed(2), 'HARDWARE_SELL', `Revente ${item.model.brand} ${item.model.name}`, item.id);
      return { received: value.toFixed(2) };
    });
  }

  async repair(userId: string, itemId: string) {
    const wallet = await this.seasons.wallet(userId);
    return this.prisma.$transaction(async (tx) => {
      const item = await this.ownedItem(tx, wallet.id, itemId);
      if (item.status !== 'BROKEN') throw new BadRequestException(item.status === 'DESTROYED' ? 'Carbonisé. Irréparable.' : "Ce composant n'est pas en panne");
      const cost = D(item.model.price).mul(REPAIR_RATIO).toDecimalPlaces(2);
      await this.moveCash(tx, wallet.id, cost.neg().toString(), 'REPAIR', `Réparation ${item.model.name}`, item.id);
      await tx.componentItem.update({ where: { id: item.id }, data: { status: 'OK', wear: Math.min(item.wear, 0.9) } });
      return { cost: cost.toFixed(2) };
    });
  }

  // ─── Locaux & racks ───────────────────────────────────────────────
  facilityTypes() {
    return this.prisma.facilityType.findMany({ orderBy: { price: 'asc' } });
  }

  async buyFacility(userId: string, typeId: string, name: string) {
    const wallet = await this.seasons.wallet(userId);
    const type = await this.prisma.facilityType.findUnique({ where: { id: typeId } });
    if (!type) throw new NotFoundException('Local inconnu');
    if (Number(type.price) === 0) throw new BadRequestException('Tu ne peux avoir qu’une seule chambre');
    return this.prisma.$transaction(async (tx) => {
      await this.moveCash(tx, wallet.id, D(type.price).neg().toString(), 'HARDWARE_BUY', `Achat local : ${type.name}`, type.id);
      return tx.facility.create({ data: { walletId: wallet.id, typeId: type.id, name: name.trim() || type.name } });
    });
  }

  async sellFacility(userId: string, facilityId: string) {
    const wallet = await this.seasons.wallet(userId);
    return this.prisma.$transaction(async (tx) => {
      const f = await tx.facility.findUnique({ where: { id: facilityId }, include: { type: true, racks: true } });
      if (!f || f.walletId !== wallet.id) throw new NotFoundException();
      if (f.racks.length) throw new BadRequestException("Retire d'abord les racks de ce local");
      await tx.facility.delete({ where: { id: f.id } });
      const value = D(f.type.price).mul(0.5);
      if (value.gt(0)) await this.moveCash(tx, wallet.id, value.toString(), 'HARDWARE_SELL', `Revente local : ${f.type.name}`, f.id);
      return { received: money(value) };
    });
  }

  async installRack(userId: string, itemId: string, facilityId: string | null) {
    const wallet = await this.seasons.wallet(userId);
    return this.prisma.$transaction(async (tx) => {
      const item = await this.ownedItem(tx, wallet.id, itemId);
      if (item.model.kind !== 'RACK') throw new BadRequestException("Ce n'est pas un rack");
      if (item.status !== 'OK') throw new BadRequestException('Rack hors service');
      if (item.rigsInRack.length) throw new BadRequestException('Démonte d’abord les rigs de ce rack');
      if (facilityId) {
        const f = await tx.facility.findUnique({ where: { id: facilityId }, include: { type: true, racks: true } });
        if (!f || f.walletId !== wallet.id) throw new NotFoundException('Local introuvable');
        if (f.racks.filter((r) => r.id !== item.id).length >= f.type.rackSlots) throw new BadRequestException(`${f.type.name} : ${f.type.rackSlots} rack(s) maximum`);
      }
      await tx.componentItem.update({ where: { id: item.id }, data: { facilityId } });
      return { ok: true };
    });
  }

  // ─── Rigs ─────────────────────────────────────────────────────────
  async preview(userId: string, rackId: string | null, partIds: string[], overclock: number) {
    const wallet = await this.seasons.wallet(userId);
    const parts = await this.prisma.componentItem.findMany({ where: { id: { in: partIds }, walletId: wallet.id }, include: { model: true } });
    let facility = { ambientTemp: 22, elecPrice: 1.8, maxPowerKw: 10 };
    let rack = { slots: 1, airflow: 1 };
    if (rackId) {
      const r = await this.prisma.componentItem.findFirst({ where: { id: rackId, walletId: wallet.id }, include: { model: true, facility: { include: { type: true } } } });
      if (r?.facility) facility = facilitySpec(r.facility.type);
      if (r) rack = rackSpec(r.model);
    }
    const stats = computeRig(parts.map(toSpec), overclock, facility, rack);
    return { ...stats, revenue: await this.estimateRevenue(stats.hashrates) };
  }

  /** $/jour estimés pour chaque réseau minable avec ces hashrates (avant frais). */
  private async estimateRevenue(h: Hashrates) {
    const nets = await this.prisma.miningNetwork.findMany({ include: { asset: true } });
    return nets.map((n) => {
      const hash = h[n.algo as Algo] ?? 0;
      const coins = coinsPerMinute(hash, n, true) * 1440;
      return { symbol: n.asset.symbol, algo: n.algo, hashrate: hash, coinsPerDay: coins, usdPerDay: coins * Number(n.asset.price) };
    });
  }

  async createRig(userId: string, body: { name: string; rackId: string; partIds: string[] }) {
    const wallet = await this.seasons.wallet(userId);
    return this.prisma.$transaction(async (tx) => {
      const rack = await tx.componentItem.findUnique({
        where: { id: body.rackId },
        include: { model: true, rigsInRack: true, facility: { include: { type: true } } },
      });
      if (!rack || rack.walletId !== wallet.id || rack.model.kind !== 'RACK') throw new NotFoundException('Rack introuvable');
      if (!rack.facility) throw new BadRequestException("Installe d'abord ce rack dans un local");
      if (rack.rigsInRack.length >= (rack.model.rackSlots ?? 1)) throw new BadRequestException('Rack plein');

      const ids = [...new Set(body.partIds)];
      const parts = await tx.componentItem.findMany({ where: { id: { in: ids }, walletId: wallet.id }, include: { model: true } });
      if (parts.length !== ids.length) throw new BadRequestException('Composant introuvable');
      for (const p of parts) {
        if (p.rigId) throw new BadRequestException(`${p.model.name} est déjà monté dans une rig`);
        if (p.status !== 'OK') throw new BadRequestException(`${p.model.name} est hors service`);
        if (p.model.kind === 'RACK') throw new BadRequestException('Un rack ne se monte pas dans une rig');
      }
      const stats = computeRig(parts.map(toSpec), 0, facilitySpec(rack.facility.type), rackSpec(rack.model));
      if (!stats.valid) throw new BadRequestException(stats.errors[0]);

      const count = await tx.rig.count({ where: { walletId: wallet.id } });
      const rig = await tx.rig.create({ data: { walletId: wallet.id, rackId: rack.id, name: body.name.trim() || `Rig #${count + 1}` } });
      await tx.componentItem.updateMany({ where: { id: { in: ids } }, data: { rigId: rig.id } });
      return rig;
    });
  }

  async updateRig(userId: string, rigId: string, body: { name?: string; poolId?: string | null; overclock?: number; running?: boolean }) {
    const wallet = await this.seasons.wallet(userId);
    const rig = await this.prisma.rig.findUnique({ where: { id: rigId }, include: RIG_INCLUDE });
    if (!rig || rig.walletId !== wallet.id) throw new NotFoundException('Rig introuvable');

    const data: Prisma.RigUpdateInput = {};
    if (body.name !== undefined) data.name = body.name.trim().slice(0, 40) || rig.name;
    if (body.overclock !== undefined) {
      if (!Number.isInteger(body.overclock) || body.overclock < 0 || body.overclock > MAX_OVERCLOCK) throw new BadRequestException('Overclock invalide');
      data.overclock = body.overclock;
    }
    let pool = rig.pool;
    if (body.poolId !== undefined) {
      pool = body.poolId ? await this.prisma.miningPool.findUnique({ where: { id: body.poolId } }) : null;
      if (body.poolId && (!pool || !pool.active)) throw new BadRequestException('Pool indisponible');
      data.pool = pool ? { connect: { id: pool.id } } : { disconnect: true };
    }
    const running = body.running ?? rig.running;
    if (running) {
      const next = { ...rig, overclock: body.overclock ?? rig.overclock, pool } as FullRig;
      const stats = rigStats(next);
      if (!stats) throw new BadRequestException('Le rack de cette rig n’est installé nulle part');
      if (!stats.valid) throw new BadRequestException(stats.errors[0]);
      if (rig.parts.some((p) => p.status !== 'OK')) throw new BadRequestException('Un composant est en panne : répare-le ou remplace-le');
      if (!pool) throw new BadRequestException('Choisis un pool avant de démarrer');
      const w = await this.prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      if (D(w.cash).lte(0)) throw new BadRequestException("Plus de cash pour payer l'électricité");
      await this.checkPower(rig.rack.facility!.id, rig.id, stats.wallPower);
    }
    if (body.running !== undefined) data.running = body.running;
    return this.prisma.rig.update({ where: { id: rig.id }, data });
  }

  /** Vérifie que le local peut fournir la puissance demandée en plus des rigs déjà en marche. */
  private async checkPower(facilityId: string, rigId: string, wallPower: number) {
    const others = await this.prisma.rig.findMany({ where: { running: true, id: { not: rigId }, rack: { facilityId } }, include: RIG_INCLUDE });
    const used = others.reduce((s, r) => s + (rigStats(r)?.wallPower ?? 0), 0);
    const f = await this.prisma.facility.findUniqueOrThrow({ where: { id: facilityId }, include: { type: true } });
    if (used + wallPower > f.type.maxPowerKw * 1000) {
      throw new BadRequestException(
        `${f.type.name} : ${((used + wallPower) / 1000).toFixed(2)} kW demandés pour ${f.type.maxPowerKw} kW disponibles. Ça va disjoncter.`,
      );
    }
  }

  async dismantle(userId: string, rigId: string) {
    const wallet = await this.seasons.wallet(userId);
    const rig = await this.prisma.rig.findUnique({ where: { id: rigId } });
    if (!rig || rig.walletId !== wallet.id) throw new NotFoundException();
    await this.prisma.$transaction([
      this.prisma.componentItem.updateMany({ where: { rigId }, data: { rigId: null } }),
      this.prisma.rig.delete({ where: { id: rigId } }),
    ]);
    return { ok: true };
  }

  // ─── Lecture ──────────────────────────────────────────────────────
  async pools() {
    const [nets, pools] = await Promise.all([
      this.prisma.miningNetwork.findMany({ include: { asset: true } }),
      this.prisma.miningPool.findMany({ where: { active: true }, include: { asset: true, owner: { select: { username: true } }, _count: { select: { rigs: { where: { running: true } } } } } }),
    ]);
    return {
      networks: nets.map((n) => ({
        symbol: n.asset.symbol,
        name: n.asset.name,
        emoji: n.asset.emoji,
        algo: n.algo,
        price: n.asset.price.toString(),
        blockReward: Number(n.blockReward),
        networkHashrate: n.npcHashrate + n.playerHashrate,
        playerHashrate: n.playerHashrate,
        usdPerMhDay: coinsPerMinute(1, n) * 1440 * Number(n.asset.price),
        nextHalving: new Date(n.lastHalvingAt.getTime() + n.halvingEveryDays * 86_400_000),
        totalMined: n.totalMined.toString(),
      })),
      pools: pools.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        symbol: p.asset.symbol,
        emoji: p.asset.emoji,
        type: p.type,
        feeBps: p.feeBps,
        federation: p.federation,
        scamRisk: p.scamRisk,
        miners: p._count.rigs,
        owner: p.owner?.username ?? null,
      })),
    };
  }

  async farm(userId: string) {
    const wallet = await this.seasons.wallet(userId);
    await this.ensureStarter(wallet.id);
    const [w, facilities, rigs, loose, balances, logs, nets] = await Promise.all([
      this.prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } }),
      this.prisma.facility.findMany({ where: { walletId: wallet.id }, include: { type: true, racks: { include: { model: true } } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.rig.findMany({ where: { walletId: wallet.id }, include: RIG_INCLUDE, orderBy: { createdAt: 'asc' } }),
      this.prisma.componentItem.findMany({
        where: { walletId: wallet.id, rigId: null, facilityId: null },
        include: { model: true },
        orderBy: [{ model: { kind: 'asc' } }, { createdAt: 'asc' }],
      }),
      this.prisma.poolBalance.findMany({ where: { walletId: wallet.id, pending: { gt: 0 } }, include: { pool: { include: { asset: true } } } }),
      this.prisma.miningLog.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.miningNetwork.findMany({ include: { asset: true } }),
    ]);
    const netByAsset = new Map(nets.map((n) => [n.assetId, n]));
    const fed = federationCounts(rigs.filter((r) => r.running));
    const [mods, bank] = await Promise.all([this.modifiers.current(), this.prisma.bank.findUniqueOrThrow({ where: { id: w.bankId } })]);
    const env = { ambientDelta: mods.ambientDelta, elecFactor: mods.elecMultiplier * (1 - bank.elecDiscount) };

    const rigViews = rigs.map((r) => {
      const stats = rigStats(r, env);
      const net = r.pool ? netByAsset.get(r.pool.assetId) : undefined;
      const hash = stats && net ? (stats.hashrates[net.algo as Algo] ?? 0) : 0;
      const fee = r.pool ? effectiveFee(r.pool, fed) : 0;
      const coinsDay = net ? coinsPerMinute(hash, net, !r.running) * 1440 * (1 - fee / 10_000) : 0;
      const usdDay = net ? coinsDay * Number(net.asset.price) : 0;
      return {
        id: r.id,
        name: r.name,
        rackId: r.rackId,
        facilityId: r.rack.facilityId,
        running: r.running,
        overclock: r.overclock,
        pool: r.pool ? { id: r.pool.id, name: r.pool.name, type: r.pool.type, symbol: net?.asset.symbol, fee } : null,
        minedTotal: r.minedTotal.toString(),
        lastTemperature: r.temperature,
        parts: r.parts.map((p) => this.itemView(p)),
        stats: stats && {
          valid: stats.valid,
          errors: stats.errors,
          power: stats.power,
          wallPower: stats.wallPower,
          psuCapacity: stats.psuCapacity,
          coolingCapacity: stats.coolingCapacity,
          temperature: stats.temperature,
          throttle: stats.throttle,
          hashrates: stats.hashrates,
          failurePerHour: stats.failurePerHour,
          firePerHour: stats.firePerHour,
          elecCostPerDay: stats.elecCostPerDay,
        },
        poolHashrate: hash,
        estCoinsPerDay: coinsDay,
        estUsdPerDay: usdDay,
      };
    });

    const running = rigViews.filter((r) => r.running);
    return {
      cash: w.cash.toString(),
      powerCut: w.powerCut,
      hardwareValue: w.hardwareValue.toString(),
      summary: {
        rigs: rigViews.length,
        running: running.length,
        usdPerDay: running.reduce((s, r) => s + r.estUsdPerDay, 0),
        elecPerDay: running.reduce((s, r) => s + (r.stats?.elecCostPerDay ?? 0), 0),
        wallPower: running.reduce((s, r) => s + (r.stats?.wallPower ?? 0), 0),
        federations: Object.fromEntries(fed),
      },
      facilities: facilities.map((f) => {
        const used = running.filter((r) => r.facilityId === f.id).reduce((s, r) => s + (r.stats?.wallPower ?? 0), 0);
        return {
          id: f.id,
          name: f.name,
          type: { ...f.type, price: f.type.price.toString() },
          powerUsed: used,
          racks: f.racks.map((rack) => ({ ...this.itemView(rack), rigs: rigViews.filter((r) => r.rackId === rack.id) })),
        };
      }),
      inventory: loose.map((i) => this.itemView(i)),
      pending: balances.map((b) => ({ pool: b.pool.name, symbol: b.pool.asset.symbol, amount: b.pending.toString(), lastPaidAt: b.lastPaidAt })),
      logs: logs.map((l) => ({ type: l.type, message: l.message, at: l.createdAt })),
    };
  }

  private itemView(i: { id: string; wear: number; status: string; model: { id: string; kind: string; brand: string; name: string; price: Prisma.Decimal; watts: number; hashrates: Prisma.JsonValue; socket: string | null; gpuSlots: number | null; coolingW: number | null; efficiency: number | null; rackSlots: number | null; airflow: number | null } }) {
    return {
      id: i.id,
      wear: i.wear,
      status: i.status,
      resale: resaleValue(Number(i.model.price), i.wear, i.status === 'BROKEN') * (i.status === 'DESTROYED' ? 0 : 1),
      repairCost: Number(i.model.price) * REPAIR_RATIO,
      model: { ...i.model, price: i.model.price.toString() },
    };
  }

  /** Valeur de revente totale du matériel + locaux d'un wallet (pour le patrimoine). */
  async hardwareValue(walletIds: string[]) {
    const [items, facilities] = await Promise.all([
      this.prisma.componentItem.findMany({ where: { walletId: { in: walletIds }, status: { not: 'DESTROYED' } }, include: { model: { select: { price: true } } } }),
      this.prisma.facility.findMany({ where: { walletId: { in: walletIds } }, include: { type: { select: { price: true } } } }),
    ]);
    const out = new Map<string, number>();
    const { hardwareMultiplier } = await this.modifiers.current();
    for (const i of items) out.set(i.walletId, (out.get(i.walletId) ?? 0) + resaleValue(Number(i.model.price), i.wear, i.status === 'BROKEN') * hardwareMultiplier);
    for (const f of facilities) out.set(f.walletId, (out.get(f.walletId) ?? 0) + Number(f.type.price) * 0.5);
    return out;
  }

  ensureOwner(walletId: string, ownerWalletId: string) {
    if (walletId !== ownerWalletId) throw new ForbiddenException();
  }
}
