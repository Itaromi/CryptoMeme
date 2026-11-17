import type { CREATION, CreationInput, SECTORS } from '@cryptomeme/shared';

export type Kind = CreationInput['kind'];
export type PoolType = Extract<CreationInput, { kind: 'POOL' }>['poolType'];

/** Règles de création (`GET /creations/config`) : constantes partagées + réseaux minables. */
export interface CreationConfig {
  costs: typeof CREATION;
  sectors: typeof SECTORS;
  networks: Array<{ symbol: string; name: string; emoji: string; algo: string }>;
}

export type CreationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Une de mes créations (`GET /creations/mine`). */
export interface MyCreation {
  id: string;
  kind: Kind;
  status: CreationStatus;
  name: string;
  symbol: string | null;
  emoji: string;
  color: string;
  fee: string;
  deposit: string;
  reviewNote: string | null;
  createdAt: string;
  asset: null | {
    symbol: string;
    price: string;
    liquidity: string;
    holders: number;
    vestTotal: string;
    vestDone: string;
    vestEnd: string | null;
    royaltiesPaid: string;
    royaltyAccrued: string;
    payout: number | null;
    status: string | null;
  };
  pool: null | { symbol: string; type: string; feeBps: number; rigs: number; earned: string; earnedValue: number };
}
