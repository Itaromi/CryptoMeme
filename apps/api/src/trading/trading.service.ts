import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buyWithCash, CASH_DP, liquidationValue, QTY_DP, sellForCash, SwapError, SwapResult } from '@cryptomeme/engine';
import { MIN_ORDER_CASH, ORDER_COOLDOWN_MS, OrderInput, stockMarketStatus } from '@cryptomeme/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from '../seasons/seasons.service';
import { MarketGateway } from '../market/market.gateway';
import { poolOf } from '../market/market.service';
import { recordCandle } from '../market/candles';
import { D, Decimal, money } from '../common/decimal';
import { applyAsset, applyCash, costOfSale, lockWallets } from '../economy/ledger';
import { NetWorthService } from '../economy/net-worth.service';

@Injectable()
export class TradingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonsService,
    private readonly gateway: MarketGateway,
    private readonly netWorth: NetWorthService,
  ) {}

  /**
   * Exécute un ordre au marché contre le pool AMM.
   * Tout se fait dans une transaction avec verrous de ligne (wallet puis actif, cf. ledger.ts) : pas de double dépense possible.
   * Les mouvements de cash et d'actif passent par le grand livre (applyCash / applyAsset).
   */
  async execute(userId: string, order: OrderInput) {
    const { id: walletId } = await this.seasons.wallet(userId);
    const symbol = order.symbol.toUpperCase();
    const isBuy = order.side === 'BUY';

    const result = await this.prisma.$transaction(
      async (tx) => {
        await lockWallets(tx, [walletId]);

        // Idempotence : même clientOrderId ⇒ on renvoie le trade déjà exécuté
        const dup = await tx.trade.findUnique({ where: { walletId_clientOrderId: { walletId, clientOrderId: order.clientOrderId } } });
        if (dup) return { trade: dup, duplicate: true };

        const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId }, include: { bank: true } });
        if (wallet.lastOrderAt && Date.now() - wallet.lastOrderAt.getTime() < ORDER_COOLDOWN_MS) {
          throw new ConflictException('Doucement ! Attends une seconde entre deux ordres.');
        }

        const found = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Asset" WHERE symbol = ${symbol} FOR UPDATE`;
        if (!found.length) throw new NotFoundException('Actif inconnu');
        const asset = await tx.asset.findUniqueOrThrow({ where: { id: found[0].id } });
        if (asset.kind === 'STOCK') {
          const company = await tx.company.findUnique({ where: { assetId: asset.id } });
          if (company && !['LISTED', 'TAKEOVER'].includes(company.status)) throw new BadRequestException('Cette action est retirée de la cote');
          if (!stockMarketStatus().open) throw new BadRequestException('La Bourse est fermée (ouverture de 9 h à 22 h, heure de Paris)');
        }
        if (asset.frozen) throw new BadRequestException('Marché gelé par un administrateur');

        const holding = await tx.holding.findUnique({ where: { walletId_assetId: { walletId, assetId: asset.id } } });
        const heldQty = D(holding?.quantity);
        const feeBps = wallet.bank.tradingFeeBps;

        let swap: SwapResult;
        try {
          if (isBuy) {
            const spend = D(order.amount).toDecimalPlaces(CASH_DP, Decimal.ROUND_DOWN);
            if (spend.lt(MIN_ORDER_CASH)) throw new BadRequestException(`Ordre minimum : ${MIN_ORDER_CASH} $`);
            if (spend.gt(D(wallet.cash))) throw new BadRequestException('Cash insuffisant');
            swap = buyWithCash(poolOf(asset), spend, feeBps);
          } else {
            const qty = D(order.amount).toDecimalPlaces(QTY_DP, Decimal.ROUND_DOWN);
            if (qty.gt(heldQty)) throw new BadRequestException('Quantité insuffisante');
            swap = sellForCash(poolOf(asset), qty, feeBps);
          }
        } catch (e) {
          if (e instanceof SwapError) throw new BadRequestException(e.message);
          throw e;
        }

        if (swap.slippageBps > order.maxSlippageBps) {
          throw new BadRequestException(
            `Slippage de ${(swap.slippageBps / 100).toFixed(2)} % supérieur à ta limite de ${(order.maxSlippageBps / 100).toFixed(2)} %`,
          );
        }

        // Royalties du créateur (actif créé par un joueur) : prélevées sur les frais, jamais créées
        const royalty =
          asset.creatorId && asset.creatorId !== wallet.userId && asset.royaltyShare > 0
            ? swap.fee.mul(asset.royaltyShare).toDecimalPlaces(QTY_DP, Decimal.ROUND_DOWN)
            : D(0);
        const quote = isBuy ? swap.pool.quote : swap.pool.quote.sub(royalty);
        const price = quote.div(swap.pool.base);
        await tx.asset.update({
          where: { id: asset.id },
          data: {
            baseReserve: swap.pool.base.toString(),
            quoteReserve: quote.toString(),
            price: price.toString(),
            ...(royalty.gt(0) ? { royaltyAccrued: { increment: royalty.toString() } } : {}),
          },
        });
        await tx.wallet.update({ where: { id: walletId }, data: { lastOrderAt: new Date() } });

        // Montants déjà au centime / à 8 décimales (moteur AMM)
        const qty = isBuy ? swap.amountOut : swap.amountIn;
        const cashMoved = isBuy ? swap.amountIn : swap.amountOut;
        const realized = isBuy ? null : cashMoved.sub(costOfSale(D(holding?.costBasis), heldQty, qty));
        const trade = await tx.trade.create({
          data: {
            walletId,
            assetId: asset.id,
            side: order.side,
            quantity: qty.toString(),
            cash: money(cashMoved),
            fee: money(swap.fee),
            price: swap.avgPrice.toString(),
            slippageBps: Math.round(swap.slippageBps),
            realizedPnl: realized ? money(realized) : null,
            clientOrderId: order.clientOrderId,
          },
        });

        const ref = { type: 'Trade', id: trade.id };
        const memo = `${isBuy ? 'Achat' : 'Vente'} ${asset.symbol}`;
        await applyCash(tx, walletId, isBuy ? cashMoved.neg() : cashMoved, 'TRADE', memo, ref, { strict: true });
        await applyAsset(tx, walletId, asset.id, isBuy ? qty : qty.neg(), 'TRADE', memo, ref, isBuy ? { cost: cashMoved } : { realizedPnl: realized ?? undefined });
        await recordCandle(tx, asset.id, price.toString(), cashMoved.toString());
        return { trade, duplicate: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 },
    );

    if (!result.duplicate) {
      const t = result.trade;
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
      this.gateway.broadcastTrade(symbol, {
        id: t.id,
        by: user?.username ?? null,
        side: t.side,
        quantity: t.quantity.toString(),
        cash: t.cash.toString(),
        price: t.price.toString(),
        at: t.createdAt.toISOString(),
      });
    }
    return result.trade;
  }

  async portfolio(userId: string) {
    const wallet = await this.seasons.wallet(userId);
    const [full, season] = await Promise.all([
      this.prisma.wallet.findUniqueOrThrow({
        where: { id: wallet.id },
        include: { bank: true, holdings: { where: { quantity: { gt: 0 } }, include: { asset: true } } },
      }),
      this.seasons.active(),
    ]);
    const positions = full.holdings.map((h) => {
      const qty = D(h.quantity);
      const value = liquidationValue(poolOf(h.asset), qty);
      const markValue = qty.mul(D(h.asset.price));
      return {
        symbol: h.asset.symbol,
        name: h.asset.name,
        emoji: h.asset.emoji,
        color: h.asset.color,
        quantity: qty.toString(),
        price: h.asset.price.toString(),
        avgCost: qty.isZero() ? '0' : D(h.costBasis).div(qty).toString(),
        costBasis: h.costBasis.toString(),
        markValue: money(markValue),
        liquidationValue: money(value),
        unrealizedPnl: money(value.sub(D(h.costBasis))),
        realizedPnl: h.realizedPnl.toString(),
      };
    });
    const nw = (await this.netWorth.netWorthOf([wallet.id])).get(wallet.id);
    const holdingsValue = positions.reduce((s, p) => s.add(p.liquidationValue), D(0));
    const hardware = nw?.hardware ?? D(0);
    return {
      season: { number: season.number, name: season.name, startingCash: season.startingCash.toString() },
      bank: { name: full.bank.name, tradingFeeBps: full.bank.tradingFeeBps, color: full.bank.color, interestMonthly: full.bank.interestMonthly },
      cash: full.cash.toString(),
      holdingsValue: money(holdingsValue),
      /** Revente du matériel de minage et des locaux (comprise dans netWorth) */
      hardwareValue: money(hardware),
      /** Patrimoine net : même calcul que le classement (NetWorthService) */
      netWorth: money(nw?.total ?? D(full.cash).add(holdingsValue)),
      positions,
    };
  }

  async history(userId: string, cursor?: string) {
    const wallet = await this.seasons.wallet(userId);
    const trades = await this.prisma.trade.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { asset: { select: { symbol: true, emoji: true } } },
    });
    return {
      items: trades.slice(0, 50).map((t) => ({
        id: t.id,
        symbol: t.asset.symbol,
        emoji: t.asset.emoji,
        side: t.side,
        quantity: t.quantity.toString(),
        cash: t.cash.toString(),
        fee: t.fee.toString(),
        price: t.price.toString(),
        slippageBps: t.slippageBps,
        realizedPnl: t.realizedPnl?.toString() ?? null,
        at: t.createdAt,
      })),
      nextCursor: trades.length > 50 ? trades[49].id : null,
    };
  }
}
