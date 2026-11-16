import { Decimal } from '@cryptomeme/engine';

/** Convertit un Prisma.Decimal / string / number en Decimal du moteur. */
export const D = (v: { toString(): string } | number | string | null | undefined): Decimal =>
  new Decimal(v == null ? 0 : v.toString());

export const money = (v: { toString(): string } | number) => D(v).toFixed(2);
export { Decimal };
