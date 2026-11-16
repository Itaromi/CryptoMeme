import { BadRequestException, Body, Controller, Get, Injectable, Logger, NotFoundException, Post } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Bank } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from '../seasons/seasons.service';
import { LeaseService } from '../common/lease.service';
import { AuthUser, CurrentUser, Public } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { D, Decimal, money } from '../common/decimal';
import { applyCash } from './ledger';
import { NotificationsService } from './notifications';

const HOUR = 3_600_000;
const SWITCH_COOLDOWN_MS = 24 * HOUR;

export const bankView = (b: Bank) => ({
  id: b.id,
  slug: b.slug,
  name: b.name,
  description: b.description,
  color: b.color,
  monthlyFee: b.monthlyFee.toString(),
  openingFee: b.openingFee.toString(),
  minNetWorth: b.minNetWorth.toString(),
  tradingFeeBps: b.tradingFeeBps,
  interestMonthly: b.interestMonthly,
  elecDiscount: b.elecDiscount,
  insuranceRate: b.insuranceRate,
  taxShield: b.taxShield,
  hackShield: b.hackShield,
  failRiskPerDay: b.failRiskPerDay,
  depositGuarantee: b.depositGuarantee?.toString() ?? null,
  isDefault: b.isDefault,
});

@Injectable()
export class BanksService {
  private readonly log = new Logger('Banks');
  private last = Date.now();
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonsService,
    private readonly lease: LeaseService,
    private readonly notify: NotificationsService,
  ) {}

  async list(userId?: string) {
    const banks = await this.prisma.bank.findMany({ where: { available: true }, orderBy: { monthlyFee: 'asc' } });
    const wallet = userId ? await this.seasons.wallet(userId) : null;
    const clients = await this.prisma.wallet.groupBy({ by: ['bankId'], _count: true, where: { seasonId: (await this.seasons.active()).id } });
    return {
      current: wallet ? { bankId: wallet.bankId, since: wallet.bankSince, canSwitchAt: new Date(wallet.bankSince.getTime() + SWITCH_COOLDOWN_MS) } : null,
      netWorth: wallet?.netWorth.toString() ?? null,
      banks: banks.map((b) => ({ ...bankView(b), clients: clients.find((c) => c.bankId === b.id)?._count ?? 0 })),
    };
  }

  async switchBank(userId: string, bankId: string) {
    const wallet = await this.seasons.wallet(userId);
    const bank = await this.prisma.bank.findUnique({ where: { id: bankId } });
    if (!bank || !bank.available) throw new NotFoundException('Banque indisponible');
    if (bank.id === wallet.bankId) throw new BadRequestException('Tu es déjà client de cette banque');
    if (Date.now() - wallet.bankSince.getTime() < SWITCH_COOLDOWN_MS) throw new BadRequestException('Un seul changement de banque par 24 h');
    if (D(wallet.netWorth).lt(D(bank.minNetWorth))) throw new BadRequestException(`Patrimoine minimum requis : ${money(bank.minNetWorth)} $`);
    return this.prisma.$transaction(async (tx) => {
      const fee = D(bank.openingFee);
      if (fee.gt(0)) {
        const w = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
        if (D(w.cash).lt(fee)) throw new BadRequestException(`Frais d'ouverture : ${money(fee)} $ en cash`);
        await applyCash(tx, wallet.id, fee.neg(), 'BANK_SWITCH', `Ouverture de compte : ${bank.name}`, { type: 'Bank', id: bank.id });
      }
      await tx.wallet.update({ where: { id: wallet.id }, data: { bankId: bank.id, bankSince: new Date(), bankAccrued: 0 } });
      return { ok: true, bank: bank.name };
    });
  }

  /**
   * Toutes les 5 minutes : intérêts sur le cash et abonnement, au prorata du temps écoulé.
   * Les fractions de centime s'accumulent dans `bankAccrued` (même principe que l'électricité).
   * Si le cash ne couvre plus l'abonnement, le joueur est rétrogradé à la banque gratuite.
   */
  @Interval(300_000)
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      if (!(await this.lease.acquire('bank-tick', 900_000))) return;
      const now = Date.now();
      const hours = Math.min((now - this.last) / HOUR, 1);
      this.last = now;
      const season = await this.seasons.active();
      const free = await this.prisma.bank.findFirstOrThrow({ where: { isDefault: true } });
      const wallets = await this.prisma.wallet.findMany({
        where: { seasonId: season.id, OR: [{ bank: { monthlyFee: { gt: 0 } } }, { bank: { interestMonthly: { gt: 0 } } }] },
        include: { bank: true, user: { select: { id: true } } },
      });
      for (const w of wallets) {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${w.id} FOR UPDATE`;
          const fresh = await tx.wallet.findUniqueOrThrow({ where: { id: w.id } });
          const cash = D(fresh.cash);
          const interest = cash.mul(w.bank.interestMonthly / 100).mul(hours / 720);
          const fee = D(w.bank.monthlyFee).mul(hours / 720);
          const accrued = D(fresh.bankAccrued).add(interest).sub(fee);
          const settle = accrued.toDecimalPlaces(2, Decimal.ROUND_DOWN);
          if (settle.lt(0) && cash.lt(settle.neg())) {
            await tx.wallet.update({ where: { id: w.id }, data: { bankId: free.id, bankSince: new Date(), bankAccrued: 0 } });
            await this.notify.push(
              [{ userId: w.user.id, type: 'BANK', title: 'Compte clôturé', body: `${w.bank.name} a fermé ton compte faute de provision. Retour à ${free.name}.`, link: '/banks' }],
              tx,
            );
            return;
          }
          if (!settle.isZero()) {
            await applyCash(tx, w.id, settle, settle.gt(0) ? 'BANK_INTEREST' : 'BANK_FEE', settle.gt(0) ? `Intérêts ${w.bank.name}` : `Abonnement ${w.bank.name}`);
          }
          await tx.wallet.update({ where: { id: w.id }, data: { bankAccrued: accrued.sub(settle).toFixed(8) } });
        });
      }
    } catch (e) {
      this.log.error(e);
    } finally {
      this.busy = false;
    }
  }

  /** Remboursement par l'assurance de la banque (pannes, incendies). Appelé par le tick de minage. */
  async insure(tx: Parameters<typeof applyCash>[0], walletId: string, userId: string | null, loss: number, what: string) {
    const w = await tx.wallet.findUniqueOrThrow({ where: { id: walletId }, include: { bank: true } });
    if (w.bank.insuranceRate <= 0 || loss <= 0) return 0;
    const refund = D(loss * w.bank.insuranceRate);
    const applied = await applyCash(tx, walletId, refund, 'INSURANCE', `Assurance ${w.bank.name} : ${what}`);
    if (userId && applied.gt(0)) {
      await this.notify.push([{ userId, type: 'INSURANCE', title: 'Assurance', body: `${w.bank.name} te rembourse ${money(applied)} $ (${what}).`, amount: applied.toString() }], tx);
    }
    return Number(applied);
  }
}

@Controller('banks')
export class BanksController {
  constructor(private readonly banks: BanksService) {}

  @Public()
  @Get()
  list(@CurrentUser() u?: AuthUser) {
    return this.banks.list(u?.id);
  }

  @Post('switch')
  switch(@CurrentUser() u: AuthUser, @Body(new ZodPipe(z.object({ bankId: z.string().min(1) }))) b: { bankId: string }) {
    return this.banks.switchBank(u.id, b.bankId);
  }
}
