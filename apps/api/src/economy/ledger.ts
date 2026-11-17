import { BadRequestException } from '@nestjs/common';
import { LedgerKind, Prisma } from '@prisma/client';
import { CASH_DP, QTY_DP } from '@cryptomeme/engine';
import { D, Decimal, money } from '../common/decimal';

/** Client Prisma d'une transaction interactive. */
export type Tx = Prisma.TransactionClient;

/** Référence de l'objet à l'origine d'une écriture (Trade, Dividend, GameEvent…). */
export interface LedgerRef {
  type: string;
  id: string;
}

/**
 * Grand livre : TOUTE variation de cash ou d'actif d'un wallet passe par applyCash / applyAsset,
 * dans une transaction, sous verrou de ligne du wallet.
 *
 * Ordre de verrouillage unique (sinon interblocages entre transactions concurrentes) :
 *   1. les wallets, par id croissant (lockWallets, en une seule requête s'il y en a plusieurs) ;
 *   2. puis les actifs (Asset).
 * applyCash / applyAsset verrouillent le wallet : une transaction qui verrouille aussi un actif
 * doit donc verrouiller le(s) wallet(s) concerné(s) AVANT l'actif. Re-verrouiller un wallet déjà
 * verrouillé par la même transaction est sans effet.
 */
export async function lockWallets(tx: Tx, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  if (unique.length === 1) {
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${unique[0]} FOR UPDATE`;
    return;
  }
  // ORDER BY avant le verrouillage : les lignes sont verrouillées dans l'ordre des id
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ANY(${unique}) ORDER BY id FOR UPDATE`;
}

export interface CashOptions {
  /** Débit strict : lève une erreur 400 si le cash ne suffit pas (au lieu de plafonner le débit). */
  strict?: boolean;
  /** Message de l'erreur en mode strict. */
  message?: string;
}

/**
 * Mouvement de cash d'un wallet : verrou de ligne + écriture au grand livre.
 * Par défaut, un débit est plafonné au cash disponible (jamais de solde négatif) ; en mode `strict`,
 * un débit supérieur au cash est refusé. Renvoie le montant réellement appliqué (au centime inférieur).
 */
export async function applyCash(tx: Tx, walletId: string, delta: Decimal, kind: LedgerKind, memo: string, ref?: LedgerRef, opts: CashOptions = {}) {
  await lockWallets(tx, [walletId]);
  const w = await tx.wallet.findUniqueOrThrow({ where: { id: walletId }, select: { cash: true } });
  const cash = D(w.cash);
  const wanted = delta.toDecimalPlaces(CASH_DP, Decimal.ROUND_DOWN);
  if (opts.strict && cash.add(wanted).lt(0)) throw new BadRequestException(opts.message ?? 'Cash insuffisant');
  const applied = wanted.lt(0) ? Decimal.max(wanted, cash.neg()) : wanted;
  if (applied.isZero()) return applied;
  const after = cash.add(applied);
  await tx.wallet.update({ where: { id: walletId }, data: { cash: money(after) } });
  await tx.ledgerEntry.create({
    data: { walletId, kind, delta: money(applied), balanceAfter: money(after), memo, refType: ref?.type, refId: ref?.id },
  });
  return applied;
}

/** Coût d'acquisition de `qty` unités prélevées sur une position (`held` unités pour un coût total `cost`), au prorata. */
export function costOfSale(cost: Decimal, held: Decimal, qty: Decimal): Decimal {
  return held.isZero() ? D(0) : cost.mul(qty).div(held).toDecimalPlaces(CASH_DP);
}

export interface AssetOptions {
  /** Crédit : coût d'acquisition ajouté à la position (achat). 0 par défaut (minage, airdrop, vesting, split…). */
  cost?: Decimal;
  /** Débit : plus-value réalisée à cumuler sur la position (vente). */
  realizedPnl?: Decimal;
}

/**
 * Mouvement d'un actif : verrou de ligne du wallet + écriture au grand livre.
 * Un débit est plafonné à la quantité détenue ; il réduit le coût d'acquisition au prorata (costOfSale).
 * Renvoie la quantité réellement appliquée (8 décimales, arrondi inférieur).
 */
export async function applyAsset(
  tx: Tx,
  walletId: string,
  assetId: string,
  delta: Decimal,
  kind: LedgerKind,
  memo: string,
  ref?: LedgerRef,
  opts: AssetOptions = {},
) {
  await lockWallets(tx, [walletId]);
  const h = await tx.holding.findUnique({ where: { walletId_assetId: { walletId, assetId } } });
  const held = D(h?.quantity);
  const applied = (delta.lt(0) ? Decimal.max(delta, held.neg()) : delta).toDecimalPlaces(QTY_DP, Decimal.ROUND_DOWN);
  if (applied.isZero()) return applied;
  const after = held.add(applied);
  const cost = D(h?.costBasis);
  const costAfter = applied.gt(0)
    ? cost.add(opts.cost ?? 0)
    : after.isZero()
      ? D(0)
      : Decimal.max(cost.sub(costOfSale(cost, held, applied.neg())), 0);
  const realized = opts.realizedPnl ? { realizedPnl: { increment: money(opts.realizedPnl) } } : {};
  await tx.holding.upsert({
    where: { walletId_assetId: { walletId, assetId } },
    update: { quantity: after.toString(), costBasis: money(costAfter), ...realized },
    create: { walletId, assetId, quantity: after.toString(), costBasis: money(costAfter) },
  });
  await tx.ledgerEntry.create({
    data: { walletId, kind, assetId, delta: applied.toString(), balanceAfter: after.toString(), memo, refType: ref?.type, refId: ref?.id },
  });
  return applied;
}
