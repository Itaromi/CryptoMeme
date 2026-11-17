import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Asset, Company } from '@prisma/client';
import {
  bankruptcyRisk,
  consensusEps,
  DIVIDEND_MIN_HEALTH,
  fundamentalValue,
  Fundamentals,
  initialState,
  mathRng,
  pick,
  poissonHit,
  reportEarnings,
  splitRatio,
} from '@cryptomeme/engine';
import { param, QUARTER_MS, stockMarketStatus, type TextParam } from '@cryptomeme/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from '../seasons/seasons.service';
import { LeaseService } from '../common/lease.service';
import { MarketService } from '../market/market.service';
import { D, Decimal, money } from '../common/decimal';
import { applyAsset, applyCash, lockWallets, Tx } from '../economy/ledger';
import { stateJson, stateOf } from '../market/asset-state';
import { NotificationInput, NotificationsService } from '../economy/notifications';
import { ACQUIRERS, NEWS } from './catalog';
import { apiError } from '../common/errors';
import { textColumns } from '../common/texts';

type WithCompany = Asset & { company: Company };

const HOUR = 3_600_000;
const TICK = 60_000;
/** Brèves par société et par jour */
const NEWS_RATE = 1.2;
/** OPA par société et par jour */
const TAKEOVER_RATE = 0.006;
const TAKEOVER_SUCCESS = 0.6;
const DIVIDEND_DELAY = 6 * HOUR;
const RELIST_AFTER = 24 * HOUR;
const LIQUIDITY: Record<string, number> = { BLUE_CHIP: 3_000_000, MID_CAP: 800_000, SHITCOIN: 300_000 };

export const VERDICT_LABEL: Record<string, string> = {
  BLOWOUT: 'Explosion des attentes',
  BEAT: 'Au-dessus des attentes',
  INLINE: 'Conforme aux attentes',
  MISS: 'Déception',
  DISASTER: 'Catastrophe',
};

/** Les détenteurs ont changé pendant la préparation d'un split : on recommence. */
class HoldersChanged extends Error {}
const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: n < 1 ? 4 : 2 });
const holdersStr = (n: number) => `${n} actionnaire${n > 1 ? 's' : ''} payé${n > 1 ? 's' : ''}`;
const pctStr = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1).replace('.', ',')} %`;

/** Repreneur d'une OPA en paramètre de texte (traduit s'il vient du catalogue, sinon tel quel). */
function acquirer(name: string | null): TextParam {
  const a = ACQUIRERS.find((x) => x.name === name);
  return a ? param.t(`game.acquirers.${a.id}`, a.name) : (name ?? '?');
}
/** Verdict de résultats en paramètre de texte. */
const verdict = (v: string): TextParam => param.t(`game.verdict.${v}`, VERDICT_LABEL[v] ?? v);

/**
 * Vie des sociétés cotées : résultats trimestriels, dividendes, brèves, OPA, faillites, splits, réintroductions.
 * Tourne chaque minute sous bail (une seule instance de l'API).
 */
@Injectable()
export class StocksService {
  private readonly log = new Logger('Stocks');
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonsService,
    private readonly lease: LeaseService,
    private readonly market: MarketService,
    private readonly notify: NotificationsService,
  ) {}

  @Interval(TICK)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      if (!(await this.lease.acquire('stocks-tick', 5 * TICK))) return;
      const now = new Date();
      const dt = TICK / 86_400_000;

      for (const c of await this.prisma.company.findMany({ where: { status: { in: ['LISTED', 'TAKEOVER'] }, nextEarningsAt: { lte: now } } })) {
        await this.earnings(c.assetId);
      }
      for (const d of await this.prisma.dividend.findMany({ where: { paidAt: null, recordAt: { lte: now } } })) {
        await this.payDividend(d.id);
      }
      for (const c of await this.prisma.company.findMany({ where: { status: 'TAKEOVER', offerEndsAt: { lte: now } } })) {
        await this.resolveTakeover(c.assetId, mathRng() < TAKEOVER_SUCCESS);
      }
      // Reprise des rachats / radiations interrompus (idempotent : seuls les actionnaires restants sont traités)
      for (const c of await this.prisma.company.findMany({ where: { status: { in: ['ACQUIRED', 'BANKRUPT'] }, statusSince: { gt: new Date(now.getTime() - RELIST_AFTER) } } })) {
        await this.settleDelisted(c.assetId);
      }
      for (const c of await this.prisma.company.findMany({ where: { status: { in: ['ACQUIRED', 'BANKRUPT'] }, statusSince: { lte: new Date(now.getTime() - RELIST_AFTER) } } })) {
        await this.relist(c.assetId);
      }

      const listed = await this.prisma.asset.findMany({ where: { kind: 'STOCK', frozen: false, company: { status: 'LISTED' } }, include: { company: true } });
      for (const a of listed as WithCompany[]) {
        if (poissonHit(mathRng, bankruptcyRisk(a.company.health), dt)) {
          await this.bankrupt(a.id);
          continue;
        }
        if (poissonHit(mathRng, NEWS_RATE, dt)) await this.news(a.id);
        if (poissonHit(mathRng, TAKEOVER_RATE, dt)) await this.announceTakeover(a.id);
        const ratio = splitRatio(Number(a.price));
        if (ratio) await this.split(a.id, ratio);
      }
    } catch (e) {
      this.log.error(e);
    } finally {
      this.running = false;
    }
  }

  // ─── Outils ───────────────────────────────────────────────────────
  private async lockAsset(tx: Tx, assetId: string): Promise<WithCompany> {
    await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${assetId} FOR UPDATE`;
    const a = await tx.asset.findUniqueOrThrow({ where: { id: assetId }, include: { company: true } });
    if (!a.company) throw new BadRequestException(apiError('NOT_A_STOCK', "Ce n'est pas une action"));
    return a as WithCompany;
  }

  private fundamentals(c: Company): Fundamentals {
    return { eps: c.eps, growth: c.growth, epsVol: c.epsVol, pe: c.pe, payout: c.payout, health: c.health };
  }

  /** Détenteurs de la saison en cours. */
  private async holders(assetId: string) {
    const season = await this.seasons.active();
    return this.prisma.holding.findMany({
      where: { assetId, quantity: { gt: 0 }, wallet: { seasonId: season.id } },
      include: { wallet: { select: { userId: true } } },
    });
  }

  private async notifyHolders(assetId: string, build: (qty: Decimal) => Omit<NotificationInput, 'userId'> | null) {
    const hs = await this.holders(assetId);
    const items = hs.flatMap((h) => {
      const n = build(D(h.quantity));
      return n ? [{ userId: h.wallet.userId, ...n }] : [];
    });
    await this.notify.push(items);
    return hs.length;
  }

  // ─── Résultats trimestriels ───────────────────────────────────────
  async earnings(assetId: string) {
    const out = await this.prisma.$transaction(async (tx) => {
      const a = await this.lockAsset(tx, assetId);
      const c = a.company;
      const r = reportEarnings(this.fundamentals(c), c.consensus, mathRng);
      const s = stateOf(a);
      const takeover = c.status === 'TAKEOVER';
      // Pendant une OPA, le cours est collé à l'offre : les résultats ne comptent presque plus
      const jump = takeover ? r.logJump * 0.15 : r.logJump;
      const state = {
        ...s,
        logFair: s.logFair + jump,
        logAnchor: takeover ? s.logAnchor : Math.log(fundamentalValue(r.next)),
      };
      const quarter = c.quarter + 1;
      const headline = `T${quarter} : BPA ${fmt(r.actual)} $ pour ${fmt(r.consensus)} $ attendus. ${VERDICT_LABEL[r.verdict]}.`;
      const headlineParams = { quarter, actual: param.price(r.actual), consensus: param.price(r.consensus), verdict: verdict(r.verdict) };
      await tx.asset.update({ where: { id: a.id }, data: { state: stateJson(state) } });
      await tx.company.update({
        where: { assetId: a.id },
        data: {
          eps: r.next.eps,
          growth: r.next.growth,
          health: r.next.health,
          quarter,
          consensus: consensusEps(r.next, mathRng),
          nextEarningsAt: new Date(Date.now() + QUARTER_MS + (mathRng() - 0.5) * 4 * HOUR),
        },
      });
      await tx.earningsReport.create({
        data: {
          assetId: a.id,
          quarter,
          consensus: r.consensus,
          actual: r.actual,
          surprise: r.surprise,
          verdict: r.verdict,
          reaction: Math.exp(jump) - 1,
          dividend: r.dividend,
          priceBefore: a.price,
          headline,
        },
      });
      if (r.dividend > 0) {
        await tx.dividend.create({ data: { assetId: a.id, perShare: r.dividend.toFixed(8), recordAt: new Date(Date.now() + DIVIDEND_DELAY) } });
      }
      await tx.marketEvent.create({
        data: {
          assetId: a.id,
          type: 'EARNINGS',
          detail: `${headline} ${pctStr(Math.exp(jump) - 1)}`,
          ...textColumns('game.market.earnings', { ...headlineParams, reaction: param.pct(Math.exp(jump) - 1) }),
        },
      });
      return { a, r, headline, headlineParams, jump };
    });
    await this.notifyHolders(assetId, () => ({
      type: 'STOCK',
      title: `Résultats ${out.a.name}`,
      body: `${out.headline}${out.r.dividend > 0 ? ` Dividende de ${fmt(out.r.dividend)} $ par action dans 6 h.` : ' Pas de dividende ce trimestre.'}`,
      text: { key: 'game.notif.earnings', params: { ...out.headlineParams, name: out.a.name, dividend: out.r.dividend > 0 ? param.price(out.r.dividend) : 'none' } },
      link: `/market/${out.a.symbol}`,
    }));
    return { headline: out.headline, verdict: out.r.verdict, reaction: Math.exp(out.jump) - 1, dividend: out.r.dividend };
  }

  // ─── Dividendes ───────────────────────────────────────────────────
  /**
   * Verse un dividende. Idempotent par bénéficiaire : un wallet déjà crédité pour ce dividende (écriture DIVIDEND
   * au grand livre) est sauté. Le dividende n'est marqué payé (et le coupon détaché) qu'une fois tous les versements
   * faits : après une erreur, le tick suivant reprend là où il s'était arrêté.
   */
  async payDividend(dividendId: string) {
    const d = await this.prisma.dividend.findUniqueOrThrow({ where: { id: dividendId }, include: { company: { include: { asset: true } } } });
    if (d.paidAt) return { paid: 0, holders: 0 };
    const asset = d.company.asset;
    if (!['LISTED', 'TAKEOVER'].includes(d.company.status)) {
      await this.prisma.dividend.updateMany({ where: { id: d.id, paidAt: null }, data: { paidAt: new Date() } });
      return { paid: 0, holders: 0 };
    }

    const ref = { type: 'Dividend', id: d.id };
    const perShare = D(d.perShare);
    const notes: NotificationInput[] = [];
    for (const h of await this.holders(asset.id)) {
      const paid = await this.prisma.$transaction(async (tx) => {
        await lockWallets(tx, [h.walletId]);
        const done = await tx.ledgerEntry.count({ where: { walletId: h.walletId, kind: 'DIVIDEND', refType: ref.type, refId: ref.id } });
        if (done) return null;
        const holding = await tx.holding.findUnique({ where: { walletId_assetId: { walletId: h.walletId, assetId: asset.id } } });
        const qty = D(holding?.quantity);
        if (qty.lte(0)) return null;
        const applied = await applyCash(tx, h.walletId, qty.mul(perShare), 'DIVIDEND', `Dividende ${asset.symbol}`, ref);
        return applied.isZero() ? null : { qty, applied };
      });
      if (!paid) continue;
      notes.push({
        userId: h.wallet.userId,
        type: 'STOCK',
        title: `Dividende ${asset.name}`,
        body: `${fmt(paid.qty.toNumber())} actions × ${fmt(perShare.toNumber())} $ : +${money(paid.applied)} $.`,
        text: {
          key: 'game.notif.dividend',
          params: { name: asset.name, qty: param.qty(paid.qty), perShare: param.price(perShare), amount: param.money(paid.applied) },
        },
        amount: paid.applied.toString(),
        link: '/portfolio',
      });
    }
    await this.notify.push(notes);

    // Statut final : payé + détachement du coupon (le cours baisse du montant du dividende), une seule fois
    const done = await this.prisma.$transaction(async (tx) => {
      const a = await this.lockAsset(tx, asset.id);
      const claimed = await tx.dividend.updateMany({ where: { id: d.id, paidAt: null }, data: { paidAt: new Date() } });
      if (!claimed.count) return null;
      const agg = await tx.ledgerEntry.aggregate({ where: { kind: 'DIVIDEND', refType: ref.type, refId: ref.id }, _sum: { delta: true }, _count: true });
      const total = D(agg._sum.delta);
      const y = Math.min(0.2, Number(d.perShare) / Number(a.price));
      const quote = D(a.quoteReserve).mul(1 - y);
      const s = stateOf(a);
      await tx.asset.update({
        where: { id: a.id },
        data: {
          quoteReserve: quote.toString(),
          price: quote.div(D(a.baseReserve)).toString(),
          state: stateJson({ ...s, logFair: s.logFair + Math.log(1 - y) }),
        },
      });
      await tx.dividend.update({ where: { id: d.id }, data: { total: money(total), holders: agg._count } });
      await tx.marketEvent.create({
        data: {
          assetId: a.id,
          type: 'DIVIDEND',
          detail: `Détachement d'un dividende de ${fmt(Number(d.perShare))} $ (${holdersStr(agg._count)})`,
          ...textColumns('game.market.dividend', { perShare: param.price(d.perShare), holders: agg._count }),
        },
      });
      return { total, holders: agg._count };
    });
    return { paid: Number(done?.total ?? 0), holders: done?.holders ?? 0 };
  }

  // ─── Brèves ───────────────────────────────────────────────────────
  async news(assetId: string, forced?: 1 | -1) {
    return this.prisma.$transaction(async (tx) => {
      const a = await this.lockAsset(tx, assetId);
      const pool = forced ? NEWS.filter((n) => n.sign === forced) : NEWS;
      const n = pick(mathRng, pool) ?? NEWS[0];
      const move = n.sign * (0.01 + Math.abs(mathRng() + mathRng() - 1) * 0.08);
      const s = stateOf(a);
      await tx.asset.update({ where: { id: a.id }, data: { state: stateJson({ ...s, logFair: s.logFair + move, logAnchor: s.logAnchor + move * 0.3 }) } });
      const text = n.text.replace('{name}', a.name).replace('{ceo}', a.company.ceo);
      await tx.marketEvent.create({ data: { assetId: a.id, type: 'NEWS', detail: text, ...textColumns(`game.news.${n.id}`, { name: a.name, ceo: a.company.ceo }) } });
      return { text, move: Math.exp(move) - 1 };
    });
  }

  // ─── OPA ──────────────────────────────────────────────────────────
  async announceTakeover(assetId: string, premium?: number) {
    const out = await this.prisma.$transaction(async (tx) => {
      const a = await this.lockAsset(tx, assetId);
      if (a.company.status !== 'LISTED') throw new BadRequestException(apiError('TAKEOVER_NOT_ALLOWED', 'Une OPA est déjà en cours ou la société est retirée de la cote'));
      const prem = premium ?? 0.25 + mathRng() * 0.35;
      const offer = D(a.price).mul(1 + prem);
      const by = (pick(mathRng, ACQUIRERS) ?? ACQUIRERS[0]).name;
      const s = stateOf(a);
      const target = Math.log(offer.toNumber() * 0.96);
      await tx.asset.update({ where: { id: a.id }, data: { state: stateJson({ ...s, logFair: target, logAnchor: target }) } });
      await tx.company.update({
        where: { assetId: a.id },
        data: { status: 'TAKEOVER', statusSince: new Date(), offerPrice: offer.toString(), offerBy: by, offerEndsAt: new Date(Date.now() + 24 * HOUR), preOfferLogFair: s.logFair },
      });
      const detail = `OPA de ${by} sur ${a.name} à ${fmt(offer.toNumber())} $ par action (${pctStr(prem)}). Verdict dans 24 h.`;
      const params = { by: acquirer(by), name: a.name, offer: param.price(offer), premium: param.pct(prem) };
      await tx.marketEvent.create({ data: { assetId: a.id, type: 'TAKEOVER', detail, ...textColumns('game.market.takeoverOffer', params) } });
      return { a, detail, params };
    });
    await this.notifyHolders(assetId, () => ({
      type: 'STOCK',
      title: `OPA sur ${out.a.name}`,
      body: `${out.detail} Si elle réussit, tes actions seront rachetées à ce prix.`,
      text: { key: 'game.notif.takeoverOffer', params: out.params },
      link: `/market/${out.a.symbol}`,
    }));
    return { detail: out.detail };
  }

  async resolveTakeover(assetId: string, success: boolean) {
    if (!success) {
      const out = await this.prisma.$transaction(async (tx) => {
        const a = await this.lockAsset(tx, assetId);
        if (a.company.status !== 'TAKEOVER') throw new BadRequestException(apiError('NO_TAKEOVER', "Pas d'OPA en cours"));
        const s = stateOf(a);
        const back = a.company.preOfferLogFair ?? Math.log(fundamentalValue(a.company));
        await tx.asset.update({ where: { id: a.id }, data: { state: stateJson({ ...s, logFair: back, logAnchor: Math.log(fundamentalValue(a.company)) }) } });
        await tx.company.update({ where: { assetId: a.id }, data: { status: 'LISTED', statusSince: new Date(), offerPrice: null, offerBy: null, offerEndsAt: null, preOfferLogFair: null } });
        const detail = `L'OPA de ${a.company.offerBy} sur ${a.name} échoue : les régulateurs disent non.`;
        const params = { by: acquirer(a.company.offerBy), name: a.name };
        await tx.marketEvent.create({ data: { assetId: a.id, type: 'TAKEOVER', detail, ...textColumns('game.market.takeoverFailed', params) } });
        return { a, detail, params };
      });
      await this.notifyHolders(assetId, () => ({
        type: 'STOCK',
        title: `OPA ratée sur ${out.a.name}`,
        body: `${out.detail} Le cours retombe.`,
        text: { key: 'game.notif.takeoverFailed', params: out.params },
        link: `/market/${out.a.symbol}`,
      }));
      return { success, detail: out.detail };
    }

    // Succès : on gèle d'abord le titre (plus aucun ordre possible), puis on rachète les actionnaires un par un
    const a = await this.prisma.$transaction(async (tx) => {
      const a = await this.lockAsset(tx, assetId);
      if (a.company.status !== 'TAKEOVER' || !a.company.offerPrice) throw new BadRequestException(apiError('NO_TAKEOVER', "Pas d'OPA en cours"));
      await tx.asset.update({ where: { id: a.id }, data: { frozen: true, price: a.company.offerPrice } });
      await tx.company.update({ where: { assetId: a.id }, data: { status: 'ACQUIRED', statusSince: new Date() } });
      return a;
    });
    const { count, total } = await this.settleDelisted(a.id);
    const detail = `${a.company.offerBy} rachète ${a.name}. Retrait de la cote, ${holdersStr(count)} (${money(total)} $).`;
    await this.prisma.marketEvent.create({
      data: { assetId: a.id, type: 'TAKEOVER', detail, ...textColumns('game.market.takeoverDone', { by: acquirer(a.company.offerBy), name: a.name, holders: count, total: param.money(total) }) },
    });
    return { success, detail };
  }

  // ─── Faillite ─────────────────────────────────────────────────────
  async bankrupt(assetId: string) {
    const a = await this.prisma.$transaction(async (tx) => {
      const a = await this.lockAsset(tx, assetId);
      if (!['LISTED', 'TAKEOVER'].includes(a.company.status)) throw new BadRequestException(apiError('ALREADY_DELISTED', 'Déjà retirée de la cote'));
      const quote = D(a.quoteReserve).mul(0.001);
      await tx.asset.update({ where: { id: a.id }, data: { frozen: true, quoteReserve: quote.toString(), price: quote.div(D(a.baseReserve)).toString() } });
      await tx.company.update({ where: { assetId: a.id }, data: { status: 'BANKRUPT', statusSince: new Date(), offerPrice: null, offerBy: null, offerEndsAt: null } });
      await tx.dividend.updateMany({ where: { assetId: a.id, paidAt: null }, data: { paidAt: new Date() } });
      return a;
    });
    // Valeur perdue estimée au cours d'avant la faillite
    const { count } = await this.settleDelisted(a.id, Number(a.price));
    const detail = `${a.name} dépose le bilan. ${a.company.ceo} est introuvable. Action rayée de la cote.`;
    await this.prisma.marketEvent.create({ data: { assetId: a.id, type: 'BANKRUPTCY', detail, ...textColumns('game.market.bankruptcy', { name: a.name, ceo: a.company.ceo }) } });
    return { detail, holders: count };
  }

  /**
   * Solde les actionnaires d'une société retirée de la cote : rachat au prix de l'offre (ACQUIRED) ou radiation (BANKRUPT).
   * Idempotent par bénéficiaire : chaque position est relue sous verrou du wallet et soldée en entier ; une position déjà
   * soldée est sautée. Le statut (posé avant, il gèle le titre) n'empêche donc pas la reprise après une erreur.
   */
  async settleDelisted(assetId: string, lossPrice?: number) {
    const a = await this.prisma.asset.findUniqueOrThrow({ where: { id: assetId }, include: { company: true } });
    const c = a.company;
    const ref = { type: 'Asset', id: a.id };
    let count = 0;
    let total = new Decimal(0);
    if (!c || !['ACQUIRED', 'BANKRUPT'].includes(c.status)) return { count, total };
    const offer = c.status === 'ACQUIRED' && c.offerPrice ? D(c.offerPrice) : null;
    if (c.status === 'ACQUIRED' && !offer) return { count, total };
    const notes: NotificationInput[] = [];
    for (const h of await this.holders(a.id)) {
      try {
        const done = await this.prisma.$transaction(async (tx) => {
          await lockWallets(tx, [h.walletId]);
          const holding = await tx.holding.findUnique({ where: { walletId_assetId: { walletId: h.walletId, assetId: a.id } } });
          const qty = D(holding?.quantity);
          if (qty.lte(0)) return null;
          if (offer) {
            const sold = await applyAsset(tx, h.walletId, a.id, qty.neg(), 'TAKEOVER', `OPA ${a.symbol}`, ref);
            const paid = await applyCash(tx, h.walletId, sold.neg().mul(offer), 'TAKEOVER', `OPA ${a.symbol} : rachat à ${offer.toString()} $`, ref);
            return { qty, paid };
          }
          await applyAsset(tx, h.walletId, a.id, qty.neg(), 'BANKRUPTCY', `Faillite ${a.symbol}`, ref);
          return { qty, paid: D(0) };
        });
        if (!done) continue;
        count++;
        total = total.add(done.paid);
        const q = done.qty.toNumber();
        if (offer) {
          notes.push({
            userId: h.wallet.userId,
            type: 'STOCK',
            title: `OPA réussie sur ${a.name}`,
            body: `Tes ${fmt(q)} actions sont rachetées à ${fmt(offer.toNumber())} $ : +${money(done.paid)} $.`,
            text: { key: 'game.notif.takeoverSold', params: { name: a.name, qty: param.qty(q), offer: param.price(offer), amount: param.money(done.paid) } },
            amount: done.paid.toString(),
            link: '/portfolio',
          });
        } else {
          const lost = q * (lossPrice ?? Number(a.price));
          notes.push({
            userId: h.wallet.userId,
            type: 'STOCK',
            title: `${a.name} fait faillite`,
            body: `Tes ${fmt(q)} actions ne valent plus rien (environ ${money(lost)} $ partis en fumée).`,
            text: { key: 'game.notif.bankrupt', params: { name: a.name, qty: param.qty(q), amount: param.money(lost) } },
            amount: (-lost).toFixed(2),
            link: '/portfolio',
          });
        }
      } catch (e) {
        this.log.error(`Solde ${a.symbol} / wallet ${h.walletId} : ${(e as Error).message}`);
      }
    }
    await this.notify.push(notes);
    return { count, total };
  }

  // ─── Split ────────────────────────────────────────────────────────
  async split(assetId: string, ratio: number) {
    // Ordre de verrouillage : wallets des détenteurs puis actif. Si un nouveau détenteur apparaît entre la lecture
    // et les verrous, on recommence (quelques tentatives).
    for (let attempt = 1; ; attempt++) {
      const walletIds = (await this.prisma.holding.findMany({ where: { assetId, quantity: { gt: 0 } }, select: { walletId: true } })).map((h) => h.walletId);
      try {
        const out = await this.prisma.$transaction((tx) => this.splitTx(tx, assetId, ratio, walletIds), { timeout: 30_000 });
        await this.notifyHolders(assetId, (q) => ({
          type: 'STOCK',
          title: `Split ${out.a.name}`,
          body: `${out.detail} Tu as maintenant ${fmt(q.toNumber())} actions.`,
          text: { key: 'game.notif.split', params: { ...out.params, name: out.a.name, qty: param.qty(q) } },
          link: '/portfolio',
        }));
        return { detail: out.detail };
      } catch (e) {
        if (e instanceof HoldersChanged && attempt < 3) continue;
        throw e;
      }
    }
  }

  private async splitTx(tx: Tx, assetId: string, ratio: number, walletIds: string[]) {
    await lockWallets(tx, walletIds);
    const a = await this.lockAsset(tx, assetId);
    // Toutes les positions (y compris saisons passées) sont multipliées : le grand livre trace chaque crédit
    const hs = await tx.holding.findMany({ where: { assetId: a.id, quantity: { gt: 0 } } });
    const locked = new Set(walletIds);
    if (hs.some((h) => !locked.has(h.walletId))) throw new HoldersChanged();
    const r = new Decimal(ratio);
    const lr = Math.log(ratio);
    const s = stateOf(a);
    await tx.asset.update({
      where: { id: a.id },
      data: {
        baseReserve: D(a.baseReserve).mul(r).toString(),
        price: D(a.price).div(r).toString(),
        state: stateJson({ ...s, logFair: s.logFair - lr, logAnchor: s.logAnchor - lr }),
      },
    });
    const c = a.company;
    await tx.company.update({
      where: { assetId: a.id },
      data: {
        eps: c.eps / ratio,
        consensus: c.consensus / ratio,
        ipoPrice: D(c.ipoPrice).div(r).toString(),
        offerPrice: c.offerPrice ? D(c.offerPrice).div(r).toString() : null,
        preOfferLogFair: c.preOfferLogFair == null ? null : c.preOfferLogFair - lr,
      },
    });
    const pending = await tx.dividend.findMany({ where: { assetId: a.id, paidAt: null } });
    for (const d of pending) await tx.dividend.update({ where: { id: d.id }, data: { perShare: D(d.perShare).div(r).toFixed(8) } });
    await tx.$executeRaw`UPDATE "Candle" SET o = o / ${ratio}, h = h / ${ratio}, l = l / ${ratio}, c = c / ${ratio}, v = v * ${ratio} WHERE "assetId" = ${a.id}`;
    for (const h of hs) await applyAsset(tx, h.walletId, a.id, D(h.quantity).mul(ratio - 1), 'SPLIT', `Split ${ratio}:1 ${a.symbol}`, { type: 'Asset', id: a.id });
    const detail = `Split ${ratio} pour 1 : chaque action ${a.symbol} devient ${ratio} actions à ${fmt(D(a.price).div(r).toNumber())} $.`;
    const params = { ratio, symbol: a.symbol, price: param.price(D(a.price).div(r)) };
    await tx.marketEvent.create({ data: { assetId: a.id, type: 'SPLIT', detail, ...textColumns('game.market.split', params) } });
    return { a, detail, params };
  }

  // ─── Réintroduction en bourse ─────────────────────────────────────
  async relist(assetId: string) {
    // Jamais de réintroduction tant que des actionnaires n'ont pas été soldés
    await this.settleDelisted(assetId);
    const season = await this.seasons.active();
    const left = await this.prisma.holding.count({ where: { assetId, quantity: { gt: 0 }, wallet: { seasonId: season.id } } });
    if (left) throw new BadRequestException(apiError('HOLDERS_LEFT', `${left} actionnaire(s) encore à solder avant la réintroduction`, { count: left }));
    return this.prisma.$transaction(async (tx) => {
      const a = await this.lockAsset(tx, assetId);
      if (!['ACQUIRED', 'BANKRUPT'].includes(a.company.status)) throw new BadRequestException(apiError('ALREADY_LISTED', 'La société est déjà cotée'));
      const price = Number(a.company.ipoPrice) * (0.6 + mathRng() * 0.6);
      const liq = LIQUIDITY[a.tier] ?? 500_000;
      const c = a.company;
      const eps = price / (4 * c.pe);
      await tx.asset.update({
        where: { id: a.id },
        data: { frozen: false, quoteReserve: liq, baseReserve: liq / price, price, state: stateJson(initialState(price)) },
      });
      await tx.company.update({
        where: { assetId: a.id },
        data: {
          status: 'LISTED',
          statusSince: new Date(),
          eps,
          health: 0.6,
          growth: 0.01,
          consensus: eps * Math.exp(0.01),
          nextEarningsAt: new Date(Date.now() + QUARTER_MS / 2),
          offerPrice: null,
          offerBy: null,
          offerEndsAt: null,
          preOfferLogFair: null,
        },
      });
      const detail = `${a.name} fait son retour en bourse à ${fmt(price)} $. Nouvelle direction, mêmes promesses.`;
      await tx.marketEvent.create({ data: { assetId: a.id, type: 'IPO', detail, ...textColumns('game.market.relist', { name: a.name, price: param.price(price) }) } });
      return { detail };
    });
  }

  // ─── Lecture ──────────────────────────────────────────────────────
  private view(a: WithCompany) {
    const c = a.company;
    const price = Number(a.price);
    const annualEps = c.eps * 4;
    const lastDiv = c.eps * c.payout * (c.health >= DIVIDEND_MIN_HEALTH ? 1 : 0);
    return {
      sector: c.sector,
      ceo: c.ceo,
      eps: c.eps,
      pe: annualEps > 0 ? price / annualEps : null,
      fairPe: c.pe,
      fundamental: fundamentalValue(c),
      dividendYield: price > 0 ? (lastDiv * 4) / price : 0,
      payout: c.payout,
      health: c.health,
      growth: c.growth,
      quarter: c.quarter,
      nextEarningsAt: c.nextEarningsAt,
      consensus: c.consensus,
      status: c.status,
      statusSince: c.statusSince,
      offer: c.offerPrice ? { price: c.offerPrice.toString(), by: c.offerBy, byText: acquirer(c.offerBy), endsAt: c.offerEndsAt } : null,
    };
  }

  async list() {
    const [assets, stats] = await Promise.all([
      this.prisma.asset.findMany({ where: { kind: 'STOCK' }, include: { company: true }, orderBy: { symbol: 'asc' } }),
      this.market.dayStats(),
    ]);
    const rows = (assets.filter((a) => a.company) as WithCompany[]).map((a) => ({ ...this.market.serialize(a, stats.get(a.id)), company: this.view(a) }));
    const reports = await this.prisma.earningsReport.findMany({ orderBy: { createdAt: 'desc' }, take: 12, include: { company: { include: { asset: { select: { symbol: true, name: true, emoji: true } } } } } });
    return {
      market: stockMarketStatus(),
      stocks: rows,
      recentReports: reports.map((r) => ({ symbol: r.company.asset.symbol, name: r.company.asset.name, emoji: r.company.asset.emoji, quarter: r.quarter, consensus: r.consensus, actual: r.actual, verdict: r.verdict, surprise: r.surprise, reaction: r.reaction, headline: r.headline, at: r.createdAt })),
    };
  }

  async detail(symbol: string) {
    const a = await this.prisma.asset.findUnique({ where: { symbol: symbol.toUpperCase() }, include: { company: true } });
    if (!a?.company) throw new NotFoundException(apiError('STOCK_UNKNOWN', 'Action inconnue'));
    const [reports, dividends] = await Promise.all([
      this.prisma.earningsReport.findMany({ where: { assetId: a.id }, orderBy: { createdAt: 'desc' }, take: 8 }),
      this.prisma.dividend.findMany({ where: { assetId: a.id }, orderBy: { createdAt: 'desc' }, take: 8 }),
    ]);
    return {
      market: stockMarketStatus(),
      ...this.view(a as WithCompany),
      reports: reports.map((r) => ({ quarter: r.quarter, consensus: r.consensus, actual: r.actual, surprise: r.surprise, verdict: r.verdict, reaction: r.reaction, dividend: r.dividend, headline: r.headline, at: r.createdAt })),
      dividends: dividends.map((d) => ({ perShare: d.perShare.toString(), recordAt: d.recordAt, paidAt: d.paidAt, total: d.total.toString(), holders: d.holders })),
    };
  }
}
