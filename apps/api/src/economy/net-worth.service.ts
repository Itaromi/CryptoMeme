import { Injectable } from '@nestjs/common';
import { facilityResale, itemResale, liquidationValue } from '@cryptomeme/engine';
import { PrismaService } from '../prisma/prisma.service';
import { D, Decimal } from '../common/decimal';
import { poolOf } from '../market/market.service';
import { ModifiersService } from './modifiers.service';

/** Patrimoine net d'un wallet, détaillé. */
export interface NetWorth {
  cash: Decimal;
  /** Positions au prix de liquidation (ce qu'on toucherait en vendant tout maintenant) */
  holdings: Decimal;
  /** Revente du matériel de minage et des locaux */
  hardware: Decimal;
  total: Decimal;
}

/**
 * Source unique du patrimoine net (classement, portefeuille, succès…) :
 * cash + positions en valeur liquidative + valeur de revente du matériel et des locaux.
 */
@Injectable()
export class NetWorthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly modifiers: ModifiersService,
  ) {}

  async netWorthOf(walletIds: string[]): Promise<Map<string, NetWorth>> {
    const out = new Map<string, NetWorth>();
    if (!walletIds.length) return out;
    const [wallets, holdings, hardware] = await Promise.all([
      this.prisma.wallet.findMany({ where: { id: { in: walletIds } }, select: { id: true, cash: true } }),
      this.prisma.holding.findMany({ where: { walletId: { in: walletIds }, quantity: { gt: 0 } }, select: { walletId: true, assetId: true, quantity: true } }),
      this.hardwareValue(walletIds),
    ]);
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: [...new Set(holdings.map((h) => h.assetId))] } },
      select: { id: true, baseReserve: true, quoteReserve: true, feeBps: true },
    });
    const pools = new Map(assets.map((a) => [a.id, poolOf(a)]));
    for (const w of wallets) {
      const hw = hardware.get(w.id) ?? D(0);
      out.set(w.id, { cash: D(w.cash), holdings: D(0), hardware: hw, total: D(w.cash).add(hw) });
    }
    for (const h of holdings) {
      const nw = out.get(h.walletId);
      const pool = pools.get(h.assetId);
      if (!nw || !pool) continue;
      const value = liquidationValue(pool, D(h.quantity));
      nw.holdings = nw.holdings.add(value);
      nw.total = nw.total.add(value);
    }
    return out;
  }

  /** Valeur de revente du matériel (hors carbonisé) et des locaux, par wallet. */
  private async hardwareValue(walletIds: string[]) {
    const [items, facilities, { hardwareMultiplier }] = await Promise.all([
      this.prisma.componentItem.findMany({
        where: { walletId: { in: walletIds }, status: { not: 'DESTROYED' } },
        select: { walletId: true, wear: true, status: true, model: { select: { price: true } } },
      }),
      this.prisma.facility.findMany({ where: { walletId: { in: walletIds } }, select: { walletId: true, type: { select: { price: true } } } }),
      this.modifiers.current(),
    ]);
    const out = new Map<string, Decimal>();
    const add = (walletId: string, v: number) => out.set(walletId, (out.get(walletId) ?? D(0)).add(v));
    for (const i of items) add(i.walletId, itemResale(Number(i.model.price), i.wear, i.status, hardwareMultiplier));
    for (const f of facilities) add(f.walletId, facilityResale(Number(f.type.price)));
    return out;
  }
}
