import { Prisma } from '@prisma/client';

export const INTERVALS = { '1m': 60_000, '5m': 300_000, '1h': 3_600_000, '1d': 86_400_000 } as const;
export type Interval = keyof typeof INTERVALS;

const bucket = (t: number, ms: number) => new Date(Math.floor(t / ms) * ms);

/** Met à jour les bougies de tous les intervalles avec un nouveau prix et un volume (en cash). */
export async function recordCandle(
  tx: Prisma.TransactionClient,
  assetId: string,
  price: string,
  volume: string,
  at = Date.now(),
) {
  for (const [interval, ms] of Object.entries(INTERVALS)) {
    const t = bucket(at, ms);
    await tx.$executeRaw`
      INSERT INTO "Candle" ("assetId", "interval", "t", "o", "h", "l", "c", "v")
      VALUES (${assetId}, ${interval}, ${t}, ${price}::numeric, ${price}::numeric, ${price}::numeric, ${price}::numeric, ${volume}::numeric)
      ON CONFLICT ("assetId", "interval", "t") DO UPDATE SET
        "h" = GREATEST("Candle"."h", EXCLUDED."h"),
        "l" = LEAST("Candle"."l", EXCLUDED."l"),
        "c" = EXCLUDED."c",
        "v" = "Candle"."v" + EXCLUDED."v"`;
  }
}
