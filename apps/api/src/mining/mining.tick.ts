import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { MiningNetwork, Asset } from '@prisma/client';
import {
  Algo,
  effectiveFee,
  federationCounts,
  mathRng,
  pick,
  poissonHit,
  poolOwnerCut,
  poolPayout,
  repairCost,
  stepNpcHashrate,
  wearPerMinute,
} from '@cryptomeme/engine';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from '../seasons/seasons.service';
import { D } from '../common/decimal';
import { RIG_INCLUDE, rigStats } from './specs';
import { LeaseService } from '../common/lease.service';
import { Modifiers, ModifiersService } from '../economy/modifiers.service';
import { BanksService } from '../economy/banks.service';
import { applyAsset, applyCash, lockWallets } from '../economy/ledger';

const TICK_MS = 60_000;
const SHADY_PAYOUT_MS = 6 * 3600_000;

type Network = MiningNetwork & { asset: Asset };

/** Fait tourner les fermes : gains, facture d'électricité, usure, pannes, incendies, pools louches, halvings. */
@Injectable()
export class MiningTickService {
  private readonly log = new Logger('Mining');
  private running = false;
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
    const mods = await this.modifiers.current();

    // 1. Hashrate des joueurs par réseau (photo avant le tick : sert à calculer la part de chacun)
    const rigs = await this.prisma.rig.findMany({
      where: { running: true, wallet: { seasonId: season.id } },
      include: { ...RIG_INCLUDE, wallet: { select: { bank: { select: { elecDiscount: true } } } } },
    });
    const playerHash = new Map<string, number>();
    for (const rig of rigs) {
      const stats = rigStats(rig, { ambientDelta: mods.ambientDelta, elecFactor: mods.elecMultiplier * (1 - rig.wallet.bank.elecDiscount) });
      const net = rig.pool ? netByAsset.get(rig.pool.assetId) : undefined;
      if (!stats || !net) continue;
      playerHash.set(net.assetId, (playerHash.get(net.assetId) ?? 0) + (stats.hashrates[net.algo as Algo] ?? 0));
    }

    // 2. Par wallet (les rigs sont relues sous verrou du wallet)
    const minted = new Map<string, number>();
    const cuts = new Map<string, number>(); // poolId → commission (pièces) due au propriétaire
    for (const walletId of new Set(rigs.map((r) => r.walletId))) {
      try {
        const { minted: m, cuts: c } = await this.runWallet(walletId, mods, netByAsset, playerHash, minutes);
        for (const [a, v] of m) minted.set(a, (minted.get(a) ?? 0) + v);
        for (const [p, v] of c) cuts.set(p, (cuts.get(p) ?? 0) + v);
      } catch (e) {
        this.log.error(`Wallet ${walletId} : ${(e as Error).message}`);
      }
    }

    // 3. Commission des pools créés par des joueurs (après coup : jamais deux wallets verrouillés à la fois)
    for (const [poolId, coins] of cuts) {
      try {
        const pool = await this.prisma.miningPool.findUniqueOrThrow({ where: { id: poolId } });
        if (!pool.ownerId || coins <= 0) continue;
        const owner = await this.seasons.wallet(pool.ownerId);
        const paid = await this.prisma.$transaction(async (tx) => {
          const applied = await applyAsset(tx, owner.id, pool.assetId, D(coins), 'POOL_FEE', `Commission du pool ${pool.name}`, { type: 'MiningPool', id: pool.id });
          if (applied.gt(0)) await tx.miningPool.update({ where: { id: poolId }, data: { earned: { increment: applied.toString() } } });
          return applied;
        });
        minted.set(pool.assetId, (minted.get(pool.assetId) ?? 0) + paid.toNumber());
      } catch (e) {
        this.log.error(`Commission pool ${poolId} : ${(e as Error).message}`);
      }
    }

    // 4. Pools louches : paiements différés et exit scams
    await this.shadyPools(minutes);

    // 5. Réseaux : PNJ, halving, total miné
    for (const n of nets) await this.updateNetwork(n, playerHash.get(n.assetId) ?? 0, minted.get(n.assetId) ?? 0, minutes);
  }

  private async runWallet(walletId: string, mods: Modifiers, netByAsset: Map<string, Network>, playerHash: Map<string, number>, minutes: number) {
    const minted = new Map<string, number>();
    const cuts = new Map<string, number>();
    const logs: Array<[type: string, message: string]> = [];
    await this.prisma.$transaction(
      async (tx) => {
        // Verrou du wallet d'abord : les actions du joueur (vente, réparation, réglage d'une rig…) attendent la fin du tick
        await lockWallets(tx, [walletId]);
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId }, include: { bank: { select: { elecDiscount: true } } } });
        const env = { ambientDelta: mods.ambientDelta, elecFactor: mods.elecMultiplier * (1 - wallet.bank.elecDiscount) };
        const list = (await tx.rig.findMany({ where: { walletId, running: true }, include: RIG_INCLUDE })).map((rig) => ({ rig, stats: rigStats(rig, env) }));
        if (!list.length) return;

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

        const active = list.flatMap(({ rig, stats }) => {
          const pool = rig.pool;
          const net = pool ? netByAsset.get(pool.assetId) : undefined;
          return stats?.valid && pool && net && rig.rack.facility && !tripped.has(rig.rack.facility.id) ? [{ rig, stats, pool, net }] : [];
        });
        const activeIds = new Set(active.map((a) => a.rig.id));
        const toStop = list.filter((c) => !activeIds.has(c.rig.id)).map((c) => c.rig.id);

        // Facture d'électricité (stats.elecCostPerDay intègre déjà les événements et la remise de la banque).
        // On accumule les fractions de centime et on ne facture que des centimes entiers.
        const elec = active.reduce((s, { stats }) => s + (stats.elecCostPerDay / 1440) * minutes, 0);
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
        if (charge.gt(0)) await applyCash(tx, walletId, charge.neg(), 'ELECTRICITY', `${minutes.toFixed(1)} min`, undefined, { strict: true });
        await tx.wallet.update({ where: { id: walletId }, data: { elecAccrued: accrued.sub(charge).toFixed(8), powerCut: false } });
        if (toStop.length) await tx.rig.updateMany({ where: { id: { in: toStop } }, data: { running: false } });

        const fed = federationCounts(active.map((c) => c.rig));
        const rewards = new Map<string, number>(); // assetId → pièces
        const shady = new Map<string, number>(); // poolId → pièces

        for (const { rig, stats: s, pool, net } of active) {
          const hash = s.hashrates[net.algo as Algo] ?? 0;
          const total = net.npcHashrate + (playerHash.get(net.assetId) ?? 0);
          const share = total > 0 ? hash / total : 0;
          const fee = effectiveFee(pool, fed);
          const coins = poolPayout(pool.type, fee, share, { blockReward: Number(net.blockReward), npcHashrate: net.npcHashrate }, mathRng, minutes);

          if (coins > 0 && pool.ownerId && pool.type !== 'SHADY') {
            // La part retenue par le pool revient à son propriétaire (au lieu de disparaître)
            const cut = poolOwnerCut(coins, fee);
            if (cut > 0) cuts.set(pool.id, (cuts.get(pool.id) ?? 0) + cut);
          }
          if (coins > 0) {
            if (pool.type === 'SHADY') shady.set(pool.id, (shady.get(pool.id) ?? 0) + coins);
            else rewards.set(pool.assetId, (rewards.get(pool.assetId) ?? 0) + coins);
            if (pool.type === 'SOLO') logs.push(['BLOCK', `BLOC TROUVÉ ! ${rig.name} remporte ${coins.toFixed(4)} ${net.asset.symbol} en solo.`]);
          }

          // Usure, pannes, incendie (composants relus sous verrou : l'usure repart de la valeur à jour)
          const dWear = wearPerMinute(s.temperature, rig.overclock) * minutes;
          let stopped = false;
          if (poissonHit(mathRng, s.firePerHour * 24, minutes / 1440)) {
            await tx.componentItem.updateMany({ where: { rigId: rig.id }, data: { status: 'DESTROYED', wear: 1 } });
            logs.push(['FIRE', `INCENDIE dans ${rig.name} (${Math.round(s.temperature)} °C). Tous les composants sont carbonisés.`]);
            const loss = rig.parts.reduce((sum, p) => sum + Number(p.model.price) * 0.6 * (1 - p.wear), 0);
            await this.banks.insure(tx, walletId, wallet.userId, loss, `incendie de ${rig.name}`);
            stopped = true;
          } else {
            const failed = poissonHit(mathRng, Math.min(1, s.failurePerHour * mods.failureMultiplier) * 24, minutes / 1440);
            const victim = failed ? pick(mathRng, rig.parts) : undefined;
            for (const p of rig.parts) {
              const wear = Math.min(1, p.wear + dWear);
              const broken = p.id === victim?.id || wear >= 1;
              await tx.componentItem.update({ where: { id: p.id }, data: { wear, ...(broken ? { status: 'BROKEN' } : {}) } });
              if (broken) {
                // Perte assurée : le coût de la réparation
                await this.banks.insure(tx, walletId, wallet.userId, repairCost(Number(p.model.price)), `panne ${p.model.name}`);
                logs.push(['BREAK', `${p.model.brand} ${p.model.name} a lâché dans ${rig.name}${wear >= 1 ? ' (usure totale)' : ''}. Rig arrêtée.`]);
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
          const applied = await applyAsset(tx, walletId, assetId, D(coins), 'MINING_REWARD', 'Récompense de minage');
          minted.set(assetId, (minted.get(assetId) ?? 0) + applied.toNumber());
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
    return { minted, cuts };
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
              data: { walletId: v.walletId, type: 'SCAM', message: `EXIT SCAM : ${pool.name} a disparu avec tes ${Number(v.pending).toFixed(4)} ${pool.asset.symbol} en attente. Le site affiche maintenant une page « En maintenance ».` },
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
          await lockWallets(tx, [b.walletId]);
          const fresh = await tx.poolBalance.findUniqueOrThrow({ where: { walletId_poolId: { walletId: b.walletId, poolId: pool.id } } });
          if (D(fresh.pending).lte(0)) return;
          await applyAsset(tx, b.walletId, pool.assetId, D(fresh.pending), 'MINING_REWARD', `Paiement ${pool.name}`, { type: 'MiningPool', id: pool.id });
          await tx.poolBalance.update({ where: { walletId_poolId: { walletId: b.walletId, poolId: pool.id } }, data: { pending: 0, lastPaidAt: new Date() } });
          await tx.miningLog.create({ data: { walletId: b.walletId, type: 'PAYOUT', message: `${pool.name} a (pour une fois) payé ${Number(fresh.pending).toFixed(4)} ${pool.asset.symbol}.` } });
        });
      }
    }
  }

  private async updateNetwork(n: Network, players: number, minted: number, minutes: number) {
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
