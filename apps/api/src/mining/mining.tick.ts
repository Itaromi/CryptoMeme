import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { MiningNetwork, Asset, Prisma } from '@prisma/client';
import { Algo, mathRng, poissonHit, poolPayout, stepNpcHashrate, wearPerMinute, PoolType } from '@cryptomeme/engine';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from '../seasons/seasons.service';
import { D, money } from '../common/decimal';
import { effectiveFee, federationCounts, FullRig, rigStats } from './specs';
import { LeaseService } from '../common/lease.service';
import { ModifiersService } from '../economy/modifiers.service';
import { BanksService } from '../economy/banks.service';

const TICK_MS = 60_000;
const SHADY_PAYOUT_MS = 6 * 3600_000;

const RIG_INCLUDE = {
  parts: { include: { model: true } },
  rack: { include: { model: true, facility: { include: { type: true } } } },
  pool: true,
} satisfies Prisma.RigInclude;

/** Fait tourner les fermes : gains, facture d'électricité, usure, pannes, incendies, pools louches, halvings. */
@Injectable()
export class MiningTickService {
  private readonly log = new Logger('Mining');
  private running = false;
  private failureMultiplier = 1;
  private last = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonsService,
    private readonly lease: LeaseService,
    private readonly modifiers: ModifiersService,
    private readonly banks: BanksService,
  ) {}

  @Interval(TICK_MS)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      if (!(await this.lease.acquire('mining-tick', TICK_MS * 3))) return;
      const now = Date.now();
      const minutes = Math.min((now - this.last) / 60_000, 10);
      this.last = now;
      await this.run(minutes);
    } catch (e) {
      this.log.error(e);
    } finally {
      this.running = false;
    }
  }

  async run(minutes: number) {
    const season = await this.seasons.active();
    const nets = await this.prisma.miningNetwork.findMany({ include: { asset: true } });
    const netByAsset = new Map(nets.map((n) => [n.assetId, n]));
    const rigs = await this.prisma.rig.findMany({
      where: { running: true, wallet: { seasonId: season.id } },
      include: { ...RIG_INCLUDE, wallet: { select: { userId: true, bank: { select: { elecDiscount: true } } } } },
    });
    const mods = await this.modifiers.current();
    this.failureMultiplier = mods.failureMultiplier;

    // 1. Stats de chaque rig (canicule, crise énergétique, remise bancaire) + hashrate joueurs par réseau
    const computed = rigs.map((r) => ({
      rig: r,
      stats: rigStats(r, { ambientDelta: mods.ambientDelta, elecFactor: mods.elecMultiplier * (1 - r.wallet.bank.elecDiscount) }),
      userId: r.wallet.userId,
    }));
    const playerHash = new Map<string, number>();
    for (const { rig, stats } of computed) {
      if (!stats || !rig.pool) continue;
      const net = netByAsset.get(rig.pool.assetId);
      if (!net) continue;
      playerHash.set(net.assetId, (playerHash.get(net.assetId) ?? 0) + (stats.hashrates[net.algo as Algo] ?? 0));
    }

    // 2. Par wallet
    const byWallet = new Map<string, typeof computed>();
    for (const c of computed) byWallet.set(c.rig.walletId, [...(byWallet.get(c.rig.walletId) ?? []), c]);
    const minted = new Map<string, number>();

    for (const [walletId, list] of byWallet) {
      try {
        const m = await this.runWallet(walletId, list, netByAsset, playerHash, minutes);
        for (const [a, v] of m) minted.set(a, (minted.get(a) ?? 0) + v);
      } catch (e) {
        this.log.error(`Wallet ${walletId} : ${(e as Error).message}`);
      }
    }

    // 3. Pools louches : paiements différés et exit scams
    await this.shadyPools(minutes);

    // 4. Réseaux : PNJ, halving, total miné
    for (const n of nets) await this.updateNetwork(n, playerHash.get(n.assetId) ?? 0, minted.get(n.assetId) ?? 0, minutes);
  }

  private async runWallet(
    walletId: string,
    list: Array<{ rig: FullRig; stats: ReturnType<typeof rigStats>; userId: string }>,
    netByAsset: Map<string, MiningNetwork & { asset: Asset }>,
    playerHash: Map<string, number>,
    minutes: number,
  ) {
    const minted = new Map<string, number>();
    const logs: string[][] = [];
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });

        // Disjoncteur : un local en surcharge coupe toutes ses rigs
        const loadByFacility = new Map<string, number>();
        for (const { rig, stats } of list) {
          const f = rig.rack.facility;
          if (f && stats) loadByFacility.set(f.id, (loadByFacility.get(f.id) ?? 0) + stats.wallPower);
        }
        const tripped = new Set<string>();
        for (const { rig } of list) {
          const f = rig.rack.facility;
          if (f && !tripped.has(f.id) && (loadByFacility.get(f.id) ?? 0) > f.type.maxPowerKw * 1000) {
            tripped.add(f.id);
            logs.push(['POWER', `Disjoncteur ! ${f.name} dépasse ${f.type.maxPowerKw} kW. Toutes ses rigs sont coupées.`]);
          }
        }

        const active = list.filter(({ rig, stats }) => stats?.valid && rig.pool && rig.rack.facility && !tripped.has(rig.rack.facility.id));
        const toStop = list.filter((c) => !active.includes(c)).map((c) => c.rig.id);

        // Facture d'électricité
        // stats.elecCostPerDay intègre déjà les événements et la remise de la banque
        const elec = active.reduce((s, { stats }) => s + (stats!.elecCostPerDay / 1440) * minutes, 0);
        // On accumule les fractions de centime et on ne facture que des centimes entiers
        const accrued = D(wallet.elecAccrued).add(elec);
        const charge = accrued.toDecimalPlaces(2, 1 /* ROUND_DOWN */);
        const cash = D(wallet.cash);
        if (cash.lt(charge) || (cash.isZero() && elec > 0)) {
          await tx.rig.updateMany({ where: { walletId, running: true }, data: { running: false } });
          await tx.wallet.update({ where: { id: walletId }, data: { powerCut: true } });
          logs.push(['POWER', "Coupure de courant : plus assez de cash pour payer l'électricité. Toutes tes rigs sont à l'arrêt."]);
          for (const [type, message] of logs) await tx.miningLog.create({ data: { walletId, type, message } });
          return;
        }
        const after = cash.sub(charge);
        await tx.wallet.update({ where: { id: walletId }, data: { cash: money(after), elecAccrued: accrued.sub(charge).toFixed(8), powerCut: false } });
        if (charge.gt(0)) {
          await tx.ledgerEntry.create({ data: { walletId, kind: 'ELECTRICITY', delta: money(charge.neg()), balanceAfter: money(after), memo: `${minutes.toFixed(1)} min` } });
        }
        if (toStop.length) await tx.rig.updateMany({ where: { id: { in: toStop } }, data: { running: false } });

        const fed = federationCounts(active.map((c) => c.rig));
        const rewards = new Map<string, number>(); // assetId → pièces
        const shady = new Map<string, number>(); // poolId → pièces

        for (const { rig, stats } of active) {
          const s = stats!;
          const pool = rig.pool!;
          const net = netByAsset.get(pool.assetId)!;
          const hash = s.hashrates[net.algo as Algo] ?? 0;
          const total = net.npcHashrate + (playerHash.get(net.assetId) ?? 0);
          const share = total > 0 ? hash / total : 0;
          const coins = poolPayout(pool.type as PoolType, effectiveFee(pool, fed), share, { blockReward: Number(net.blockReward), npcHashrate: net.npcHashrate }, mathRng, minutes);

          if (coins > 0) {
            if (pool.type === 'SHADY') shady.set(pool.id, (shady.get(pool.id) ?? 0) + coins);
            else rewards.set(pool.assetId, (rewards.get(pool.assetId) ?? 0) + coins);
            if (pool.type === 'SOLO') logs.push(['BLOCK', `BLOC TROUVÉ ! ${rig.name} remporte ${coins.toFixed(4)} ${net.asset.symbol} en solo.`]);
          }

          // Usure, pannes, incendie
          const dWear = wearPerMinute(s.temperature, rig.overclock) * minutes;
          let stopped = false;
          const userId = list[0].userId;
          if (poissonHit(mathRng, s.firePerHour * 24, minutes / 1440)) {
            await tx.componentItem.updateMany({ where: { rigId: rig.id }, data: { status: 'DESTROYED', wear: 1 } });
            logs.push(['FIRE', `🔥 INCENDIE dans ${rig.name} (${Math.round(s.temperature)} °C). Tous les composants sont carbonisés.`]);
            const loss = rig.parts.reduce((sum, p) => sum + Number(p.model.price) * 0.6 * (1 - p.wear), 0);
            await this.banks.insure(tx, walletId, userId, loss, `incendie de ${rig.name}`);
            stopped = true;
          } else {
            const failed = poissonHit(mathRng, Math.min(1, s.failurePerHour * this.failureMultiplier) * 24, minutes / 1440);
            const victim = failed ? rig.parts[Math.floor(mathRng() * rig.parts.length)] : null;
            for (const p of rig.parts) {
              const wear = Math.min(1, p.wear + dWear);
              const broken = p.id === victim?.id || wear >= 1;
              await tx.componentItem.update({ where: { id: p.id }, data: { wear, ...(broken ? { status: 'BROKEN' } : {}) } });
              if (broken) {
                await this.banks.insure(tx, walletId, userId, Number(p.model.price) * 0.3, `panne ${p.model.name}`);
                logs.push(['BREAK', `💥 ${p.model.brand} ${p.model.name} a lâché dans ${rig.name}${wear >= 1 ? ' (usure totale)' : ''}. Rig arrêtée.`]);
                stopped = true;
              }
            }
          }
          await tx.rig.update({
            where: { id: rig.id },
            data: {
              temperature: s.temperature,
              hashrate: hash,
              lastMinedAt: new Date(),
              ...(pool.type !== 'SHADY' && coins > 0 ? { minedTotal: { increment: coins.toFixed(8) } } : {}),
              ...(stopped ? { running: false } : {}),
            },
          });
        }

        for (const [assetId, coins] of rewards) {
          minted.set(assetId, (minted.get(assetId) ?? 0) + coins);
          await this.credit(tx, walletId, assetId, coins, 'Récompense de minage');
        }
        for (const [poolId, coins] of shady) {
          await tx.poolBalance.upsert({
            where: { walletId_poolId: { walletId, poolId } },
            update: { pending: { increment: coins.toFixed(8) } },
            create: { walletId, poolId, pending: coins.toFixed(8) },
          });
        }
        for (const [type, message] of logs) await tx.miningLog.create({ data: { walletId, type, message } });
      },
      { timeout: 20_000 },
    );
    return minted;
  }

  /** Crédite des pièces minées (coût d'acquisition nul) + grand livre. */
  private async credit(tx: Prisma.TransactionClient, walletId: string, assetId: string, coins: number, memo: string) {
    const qty = coins.toFixed(8);
    if (Number(qty) <= 0) return;
    const h = await tx.holding.upsert({
      where: { walletId_assetId: { walletId, assetId } },
      update: { quantity: { increment: qty } },
      create: { walletId, assetId, quantity: qty, costBasis: 0 },
    });
    await tx.ledgerEntry.create({ data: { walletId, kind: 'MINING_REWARD', assetId, delta: qty, balanceAfter: h.quantity, memo } });
  }

  private async shadyPools(minutes: number) {
    const pools = await this.prisma.miningPool.findMany({ where: { type: 'SHADY', active: true }, include: { asset: true } });
    for (const pool of pools) {
      if (poissonHit(mathRng, pool.scamRisk, minutes / 1440)) {
        const victims = await this.prisma.poolBalance.findMany({ where: { poolId: pool.id, pending: { gt: 0 } } });
        await this.prisma.$transaction([
          this.prisma.poolBalance.updateMany({ where: { poolId: pool.id }, data: { pending: 0, lastPaidAt: new Date() } }),
          ...victims.map((v) =>
            this.prisma.miningLog.create({
              data: { walletId: v.walletId, type: 'SCAM', message: `🏃 EXIT SCAM : ${pool.name} a disparu avec tes ${Number(v.pending).toFixed(4)} ${pool.asset.symbol} en attente. Le site affiche maintenant une page « En maintenance ».` },
            }),
          ),
          this.prisma.marketEvent.create({ data: { assetId: pool.assetId, type: 'POOL_SCAM', detail: `${pool.name} part avec la caisse` } }),
        ]);
        continue;
      }
      const due = await this.prisma.poolBalance.findMany({
        where: { poolId: pool.id, pending: { gt: 0 }, lastPaidAt: { lt: new Date(Date.now() - SHADY_PAYOUT_MS) } },
      });
      for (const b of due) {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${b.walletId} FOR UPDATE`;
          const fresh = await tx.poolBalance.findUniqueOrThrow({ where: { walletId_poolId: { walletId: b.walletId, poolId: pool.id } } });
          await this.credit(tx, b.walletId, pool.assetId, Number(fresh.pending), `Paiement ${pool.name}`);
          await tx.poolBalance.update({ where: { walletId_poolId: { walletId: b.walletId, poolId: pool.id } }, data: { pending: 0, lastPaidAt: new Date() } });
          await tx.miningLog.create({ data: { walletId: b.walletId, type: 'PAYOUT', message: `${pool.name} a (pour une fois) payé ${Number(fresh.pending).toFixed(4)} ${pool.asset.symbol}.` } });
        });
      }
    }
  }

  private async updateNetwork(n: MiningNetwork & { asset: Asset }, players: number, minted: number, minutes: number) {
    const npc = stepNpcHashrate(n.npcHashrate, n.baseNpcHashrate, Number(n.asset.price), n.initialPrice, minutes);
    const halving = Date.now() - n.lastHalvingAt.getTime() > n.halvingEveryDays * 86_400_000;
    await this.prisma.miningNetwork.update({
      where: { assetId: n.assetId },
      data: {
        npcHashrate: npc,
        playerHashrate: players,
        totalMined: { increment: minted.toFixed(8) },
        ...(halving ? { blockReward: D(n.blockReward).div(2).toFixed(8), lastHalvingAt: new Date() } : {}),
      },
    });
    if (halving) {
      await this.prisma.marketEvent.create({ data: { assetId: n.assetId, type: 'HALVING', detail: 'La récompense de bloc est divisée par deux' } });
    }
  }
}
