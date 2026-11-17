import { CASH_DP, Decimal } from '@cryptomeme/engine';

/** Convertit un Prisma.Decimal / string / number en Decimal du moteur. */
export const D = (v: { toString(): string } | number | string | null | undefined): Decimal =>
  new Decimal(v == null ? 0 : v.toString());

/** Montant en cash au format du grand livre (centimes, arrondi du moteur). */
export const money = (v: { toString(): string } | number) => D(v).toFixed(CASH_DP);
export { Decimal };
