import { Global, Injectable, Module, NotFoundException } from '@nestjs/common';
import { Prisma, Season } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { lockWallets } from '../economy/ledger';
import { apiError } from '../common/errors';

@Injectable()
export class SeasonsService {
  private cache: { season: Season; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async active(): Promise<Season> {
    if (this.cache && Date.now() - this.cache.at < 10_000) return this.cache.season;
    const season = await this.prisma.season.findFirst({ where: { status: 'ACTIVE' }, orderBy: { number: 'desc' } });
    if (!season) throw new NotFoundException(apiError('NO_ACTIVE_SEASON', 'Aucune saison active'));
    this.cache = { season, at: Date.now() };
    return season;
  }

  invalidate() {
    this.cache = null;
  }

  list() {
    return this.prisma.season.findMany({ orderBy: { number: 'desc' }, select: { number: true, name: true, status: true, startsAt: true, endsAt: true } });
  }

  /** Wallet du joueur pour la saison active — créé à la volée avec le capital de départ. */
  async wallet(userId: string) {
    const season = await this.active();
    const existing = await this.prisma.wallet.findUnique({ where: { userId_seasonId: { userId, seasonId: season.id } } });
    if (existing) return existing;
    try {
      return await this.createWallet(userId, season);
    } catch (e) {
      // Deux requêtes simultanées du même joueur : la seconde perd la course sur (userId, seasonId)
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.wallet.findUniqueOrThrow({ where: { userId_seasonId: { userId, seasonId: season.id } } });
      }
      throw e;
    }
  }

  private async createWallet(userId: string, season: Season) {
    const bank = await this.prisma.bank.findFirstOrThrow({ where: { isDefault: true } });
    return this.prisma.$transaction(async (tx) => {
      const w = await tx.wallet.upsert({
        where: { userId_seasonId: { userId, seasonId: season.id } },
        update: {},
        create: {
          userId,
          seasonId: season.id,
          bankId: bank.id,
          bankSince: new Date(0), // pas de délai pour quitter la banque par défaut
          cash: season.startingCash,
          netWorth: season.startingCash,
          peakNetWorth: season.startingCash,
        },
      });
      // Verrou du wallet AVANT de vérifier la dotation : deux créations concurrentes ne l'écrivent qu'une fois
      await lockWallets(tx, [w.id]);
      const granted = await tx.ledgerEntry.count({ where: { walletId: w.id, kind: 'SEASON_GRANT' } });
      if (!granted) {
        await tx.ledgerEntry.create({
          data: { walletId: w.id, kind: 'SEASON_GRANT', delta: season.startingCash, balanceAfter: season.startingCash, memo: season.name },
        });
        await tx.netWorthSnapshot.create({ data: { walletId: w.id, t: new Date(), netWorth: season.startingCash, cash: season.startingCash } });
      }
      return w;
    });
  }
}

@Global()
@Module({ providers: [SeasonsService], exports: [SeasonsService] })
export class SeasonsModule {}
