import { LedgerKind, Prisma } from '@prisma/client';
import { D, Decimal, money } from '../common/decimal';

type Tx = Prisma.TransactionClient;

/**
 * Mouvement de cash d'un wallet, verrou de ligne + écriture au grand livre.
 * Un débit est plafonné au cash disponible (jamais de solde négatif) : renvoie le montant réellement appliqué.
 */
export async function applyCash(tx: Tx, walletId: string, delta: Decimal, kind: LedgerKind, memo: string, ref?: { type: string; id: string }) {
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;
  const w = await tx.wallet.findUniqueOrThrow({ where: { id: walletId }, select: { cash: true } });
  const cash = D(w.cash);
  const applied = (delta.lt(0) ? Decimal.max(delta, cash.neg()) : delta).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  if (applied.isZero()) return applied;
  const after = cash.add(applied);
  await tx.wallet.update({ where: { id: walletId }, data: { cash: money(after) } });
  await tx.ledgerEntry.create({
    data: { walletId, kind, delta: money(applied), balanceAfter: money(after), memo, refType: ref?.type, refId: ref?.id },
  });
  return applied;
}

/** Mouvement d'un actif (crédit ou débit plafonné à la quantité détenue). Coût d'acquisition ajusté au prorata. */
export async function applyAsset(tx: Tx, walletId: string, assetId: string, delta: Decimal, kind: LedgerKind, memo: string, ref?: { type: string; id: string }) {
  const h = await tx.holding.findUnique({ where: { walletId_assetId: { walletId, assetId } } });
  const held = D(h?.quantity);
  const applied = (delta.lt(0) ? Decimal.max(delta, held.neg()) : delta).toDecimalPlaces(8, Decimal.ROUND_DOWN);
  if (applied.isZero()) return applied;
  const after = held.add(applied);
  const cost = D(h?.costBasis);
  const costAfter = applied.lt(0) && held.gt(0) ? cost.mul(after).div(held).toDecimalPlaces(2) : cost;
  await tx.holding.upsert({
    where: { walletId_assetId: { walletId, assetId } },
    update: { quantity: after.toString(), costBasis: money(costAfter) },
    create: { walletId, assetId, quantity: after.toString(), costBasis: 0 },
  });
  await tx.ledgerEntry.create({
    data: { walletId, kind, assetId, delta: applied.toString(), balanceAfter: after.toString(), memo, refType: ref?.type, refId: ref?.id },
  });
  return applied;
}
