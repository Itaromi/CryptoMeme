import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AssetTier, EventType, GameEvent, Prisma } from '@prisma/client';
import { z } from 'zod';
import { MarketState, mathRng, pick, poissonHit, shuffle } from '@cryptomeme/engine';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from '../seasons/seasons.service';
import { LeaseService } from '../common/lease.service';
import { MarketGateway } from '../market/market.gateway';
import { PlayersService } from '../players/players.service';
import { D, money } from '../common/decimal';
import { applyAsset, applyCash } from './ledger';
import { stateJson, stateOf } from '../market/asset-state';
import { NotificationInput, NotificationsService } from './notifications';
import { type GameText, param, type TextParams } from '@cryptomeme/shared';
import { eventTitle, textColumns } from '../common/texts';
import { ModifiersService } from './modifiers.service';

/** Paramètres d'un événement (colonne JSON, éditable en admin) : lus via num / str / les schémas ci-dessous. */
type Params = Record<string, unknown>;
/** Bilan d'un événement (colonne JSON) : `detail` est le repli français de `detailText`. */
type Result = { affected: number; total: number; detail?: string; detailText?: GameText };
type Event = GameEvent & { type: EventType };
const ref = (e: GameEvent) => ({ type: 'GameEvent', id: e.id });
const between = (a: number, b: number) => a + mathRng() * (b - a);

/** Paramètre numérique (valeur par défaut si absent, erreur explicite sinon). */
function num(p: Params, key: string, fallback?: number): number {
  const v = p[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Paramètre « ${key} » manquant ou invalide`);
}
const str = (p: Params, key: string): string | undefined => {
  const v = p[key];
  return typeof v === 'string' ? v : undefined;
};
const bracketsSchema = z.array(z.tuple([z.number(), z.number()])).min(1);
const tiersSchema = z.array(z.enum(AssetTier)).optional();

/** Valeur de « {clé} » dans un texte d'événement (`mult` et `ambient` sont des alias). */
const paramValue = (p: Params, k: string) => (k === 'mult' ? (p.elecMultiplier ?? p.hardwareMultiplier ?? p.failureMultiplier) : k === 'ambient' ? p.ambientDelta : p[k]);

/** Remplit « {clé} » avec les paramètres de l'événement. */
export function fill(template: string, p: Params) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = paramValue(p, k);
    if (v === undefined) return `{${k}}`;
    if (typeof v === 'number') return v.toLocaleString('fr-FR');
    return typeof v === 'string' || typeof v === 'boolean' ? String(v) : JSON.stringify(v);
  });
}

/**
 * Paramètres d'affichage d'un événement (titre, description, notifications) : nombres et textes seulement,
 * plus les alias `mult` et `ambient`. Le site les injecte dans game.events.<slug>.
 */
export function eventTextParams(p: Params): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(p)) if (typeof v === 'number' || typeof v === 'string') out[k] = v;
  for (const k of ['mult', 'ambient']) {
    const v = paramValue(p, k);
    if (typeof v === 'number') out[k] = v;
  }
  return out;
}

/** Titre traduisible d'un événement, en paramètre de texte. */
const titleOf = (e: Event) => eventTitle({ slug: e.type.slug, title: e.title }, eventTextParams(e.params as Params));

@Injectable()
export class EventsService {
  private readonly log = new Logger('Events');
  private busy = false;
  private last = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonsService,
    private readonly lease: LeaseService,
    private readonly gateway: MarketGateway,
    private readonly players: PlayersService,
    private readonly notify: NotificationsService,
    private readonly modifiers: ModifiersService,
  ) {}

  // ─── Boucle ───────────────────────────────────────────────────────
  @Interval(60_000)
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      if (!(await this.lease.acquire('events-tick', 180_000))) return;
      const now = Date.now();
      const minutes = Math.min((now - this.last) / 60_000, 10);
      this.last = now;

      // 1. Fin des événements à durée
      const ended = await this.prisma.gameEvent.updateMany({ where: { status: 'ACTIVE', endsAt: { lte: new Date() } }, data: { status: 'DONE' } });
      if (ended.count) this.changed();

      // 2. Événements programmés dont l'heure est venue
      const due = await this.prisma.gameEvent.findMany({ where: { status: 'SCHEDULED', startsAt: { lte: new Date() } }, include: { type: true } });
      for (const e of due) await this.fire(e);

      // 3. Hasard : au plus un nouvel événement par minute
      const types = await this.prisma.eventType.findMany({ where: { enabled: true, ratePerDay: { gt: 0 } } });
      for (const t of shuffle(mathRng, types)) {
        if (!poissonHit(mathRng, t.ratePerDay, minutes / 1440)) continue;
        if (await this.onCooldown(t)) continue;
        await this.schedule(t);
        break;
      }

      // 4. Faillites bancaires (probabilité propre à chaque banque)
      const risky = await this.prisma.bank.findMany({ where: { failRiskPerDay: { gt: 0 }, available: true } });
      const run = await this.prisma.eventType.findUnique({ where: { slug: 'bank-run' } });
      for (const b of risky) {
        if (run?.enabled && poissonHit(mathRng, b.failRiskPerDay, minutes / 1440) && !(await this.onCooldown(run))) {
          await this.schedule(run, { bankId: b.id, bank: b.name });
        }
      }
    } catch (e) {
      this.log.error(e);
    } finally {
      this.busy = false;
    }
  }

  private async onCooldown(t: EventType) {
    const recent = await this.prisma.gameEvent.findFirst({
      where: {
        typeId: t.id,
        OR: [{ status: { in: ['SCHEDULED', 'ACTIVE'] } }, { startsAt: { gt: new Date(Date.now() - t.cooldownHours * 3_600_000) } }],
      },
    });
    return !!recent;
  }

  private changed() {
    this.modifiers.invalidate();
    this.gateway.broadcastEventsChanged();
  }

  /** Annule un événement programmé ou en cours (ses effets globaux cessent immédiatement). */
  async cancel(id: string) {
    const r = await this.prisma.gameEvent.updateMany({ where: { id, status: { in: ['SCHEDULED', 'ACTIVE'] } }, data: { status: 'CANCELLED', endsAt: new Date() } });
    if (r.count) this.changed();
    return r.count > 0;
  }

  // ─── Programmation ────────────────────────────────────────────────
  /** Programme un événement (avec préavis) en choisissant sa cible tout de suite pour pouvoir l'annoncer. */
  async schedule(t: EventType, overrides: Params = {}, opts: { triggeredBy?: string; immediate?: boolean } = {}) {
    const params: Params = { ...(t.params as Params), ...overrides };
    if (!(await this.chooseTarget(t.slug, params))) return null;
    const notice = opts.immediate ? 0 : t.noticeMinutes;
    const startsAt = new Date(Date.now() + notice * 60_000);
    const e = await this.prisma.gameEvent.create({
      data: {
        typeId: t.id,
        title: fill(t.name, params),
        description: fill(t.description, params),
        params: params as Prisma.InputJsonObject,
        startsAt,
        triggeredBy: opts.triggeredBy,
      },
      include: { type: true },
    });
    this.changed();
    if (notice === 0) await this.fire(e);
    return e;
  }

  private async chooseTarget(slug: string, p: Params): Promise<boolean> {
    if (['airdrop', 'exceptional-dividend', 'elon-tweet', 'rug-pull'].includes(slug) && !p.assetId) {
      const tiers = tiersSchema.parse(p.tiers);
      const where: Prisma.AssetWhereInput = { frozen: false, ...(tiers ? { tier: { in: tiers } } : {}) };
      // Airdrops, tweets et rug pulls, c'est un truc de crypto
      if (slug !== 'exceptional-dividend') where.kind = 'CRYPTO';
      if (slug === 'exceptional-dividend') where.holdings = { some: { quantity: { gt: 0 } } };
      const a = pick(mathRng, await this.prisma.asset.findMany({ where, select: { id: true, symbol: true } }));
      if (!a) return false;
      p.assetId = a.id;
      p.symbol = a.symbol;
    }
    if (slug === 'bank-hack' && !p.bankId) {
      const season = await this.seasons.active();
      const used = await this.prisma.wallet.groupBy({ by: ['bankId'], where: { seasonId: season.id }, _count: true });
      const b = pick(mathRng, used);
      if (!b) return false;
      const bank = await this.prisma.bank.findUniqueOrThrow({ where: { id: b.bankId } });
      p.bankId = bank.id;
      p.bank = bank.name;
    }
    if (slug === 'bank-run' && !p.bankId) return false;
    return true;
  }

  /** Déclenche l'effet. Les événements à durée passent ACTIVE (leurs paramètres modifient le jeu). */
  async fire(e: GameEvent & { type: EventType }) {
    const claimed = await this.prisma.gameEvent.updateMany({ where: { id: e.id, status: 'SCHEDULED' }, data: { status: 'ACTIVE' } });
    if (!claimed.count) return;
    let result: Result = { affected: 0, total: 0 };
    try {
      const handler = this.handlers[e.type.slug];
      if (handler) result = await handler(e, e.params as Params);
    } catch (err) {
      this.log.error(`Événement ${e.type.slug} : ${(err as Error).message}`);
      result.detail = 'Erreur pendant l’exécution';
      result.detailText = { key: 'game.eventResult.error' };
    }
    const duration = e.type.durationMinutes;
    await this.prisma.gameEvent.update({
      where: { id: e.id },
      data: { status: duration > 0 ? 'ACTIVE' : 'DONE', endsAt: duration > 0 ? new Date(Date.now() + duration * 60_000) : new Date(), result },
    });
    this.changed();
    this.players.requestRecompute();
  }

  // ─── Cibles ───────────────────────────────────────────────────────
  private async wallets(where: Prisma.WalletWhereInput = {}) {
    const season = await this.seasons.active();
    return this.prisma.wallet.findMany({
      where: { seasonId: season.id, user: { bannedAt: null }, ...where },
      include: { bank: true, user: { select: { id: true } } },
    });
  }

  /**
   * Applique une variation de cash à chaque wallet + notification. `body` est le corps français (« {amount} » =
   * montant appliqué) ; `params` complète le texte traduisible game.notif.events.<slug>.
   */
  private async cashEach(e: Event, items: Array<{ walletId: string; userId: string; delta: number; body: string; params?: TextParams }>, kind: 'TAX' | 'EVENT' = 'EVENT') {
    const notes: NotificationInput[] = [];
    let total = 0;
    let affected = 0;
    for (const it of items) {
      if (Math.abs(it.delta) < 0.01) continue;
      const applied = await this.prisma.$transaction((tx) => applyCash(tx, it.walletId, D(it.delta.toFixed(2)), kind, e.title, ref(e)));
      if (applied.isZero()) continue;
      affected++;
      total += Number(applied);
      notes.push({
        userId: it.userId,
        type: 'EVENT',
        title: e.title,
        body: it.body.replace('{amount}', `${money(applied.abs())} $`),
        text: { key: `game.notif.events.${e.type.slug}`, params: { ...it.params, event: titleOf(e), amount: param.money(applied.abs()) } },
        amount: applied.toString(),
        link: '/events',
      });
    }
    await this.notify.push(notes);
    return { affected, total };
  }

  private async nudgeMarket(e: Event, assetIds: string[] | 'ALL', logMove: number, regime: MarketState['regime']) {
    const assets = await this.prisma.asset.findMany({ where: assetIds === 'ALL' ? { frozen: false } : { id: { in: assetIds } }, select: { id: true } });
    for (const { id } of assets) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${id} FOR UPDATE`;
        const a = await tx.asset.findUniqueOrThrow({ where: { id } });
        const s = stateOf(a);
        const next = { ...s, logFair: s.logFair + logMove, logAnchor: s.logAnchor + logMove * 0.6, regime };
        await tx.asset.update({ where: { id }, data: { state: stateJson(next) } });
        await tx.marketEvent.create({ data: { assetId: id, type: 'EVENT', detail: e.title, ...textColumns('game.market.event', { event: titleOf(e) }) } });
      });
    }
    return assets.length;
  }

  // ─── Effets ───────────────────────────────────────────────────────
  private readonly handlers: Record<string, (e: Event, p: Params) => Promise<Result>> = {
    'flat-tax': async (e, p) => {
      const since = new Date(Date.now() - num(p, 'windowHours', 24) * 3_600_000);
      const rate = num(p, 'rate');
      const gains = await this.prisma.trade.groupBy({ by: ['walletId'], where: { createdAt: { gte: since }, realizedPnl: { not: null }, walletId: { not: null } }, _sum: { realizedPnl: true } });
      const ws = await this.wallets({ id: { in: gains.flatMap((g) => (g.walletId ? [g.walletId] : [])) } });
      return this.cashEach(
        e,
        ws.map((w) => {
          const g = Number(gains.find((x) => x.walletId === w.id)?._sum.realizedPnl ?? 0);
          return { walletId: w.id, userId: w.user.id, delta: -Math.max(0, g) * (rate / 100) * (1 - w.bank.taxShield), body: `Flat tax sur tes plus-values : −{amount}.` };
        }),
        'TAX',
      );
    },

    'wealth-tax': async (e, p) => {
      await this.players.recompute();
      const brackets = bracketsSchema.parse(p.brackets);
      const ws = await this.wallets({ netWorth: { gt: brackets[0][0] } });
      return this.cashEach(
        e,
        ws.map((w) => {
          const nw = Number(w.netWorth);
          let tax = 0;
          brackets.forEach(([from, rate], i) => {
            const to = brackets[i + 1]?.[0] ?? Infinity;
            if (nw > from) tax += (Math.min(nw, to) - from) * rate;
          });
          return { walletId: w.id, userId: w.user.id, delta: -tax * (1 - w.bank.taxShield), body: `Impôt sur la fortune : −{amount}.` };
        }),
        'TAX',
      );
    },

    'tax-audit': async (e, p) => {
      const chance = num(p, 'chance');
      const rate = num(p, 'rate');
      const ws = await this.wallets({ bank: { taxShield: { gt: 0 } } });
      return this.cashEach(
        e,
        ws
          .filter(() => mathRng() < chance)
          .map((w) => ({ walletId: w.id, userId: w.user.id, delta: -Number(w.cash) * (rate / 100), body: `Contrôle fiscal chez ${w.bank.name} : amende de {amount}.`, params: { bank: w.bank.name } })),
        'TAX',
      );
    },

    'tax-refund': async (e, p) => {
      const since = new Date(Date.now() - num(p, 'windowDays', 7) * 86_400_000);
      const rate = num(p, 'rate');
      const paid = await this.prisma.ledgerEntry.groupBy({ by: ['walletId'], where: { kind: 'TAX', createdAt: { gte: since } }, _sum: { delta: true } });
      const ws = await this.wallets({ id: { in: paid.map((x) => x.walletId) } });
      return this.cashEach(
        e,
        ws.map((w) => ({ walletId: w.id, userId: w.user.id, delta: -Number(paid.find((x) => x.walletId === w.id)?._sum.delta ?? 0) * (rate / 100), body: 'Le fisc te rembourse {amount}. Ne t’habitue pas.' })),
      );
    },

    'bank-hack': async (e, p) => {
      const [min, max] = [num(p, 'min'), num(p, 'max')];
      const ws = await this.wallets({ bankId: str(p, 'bankId') });
      return this.cashEach(
        e,
        ws.map((w) => {
          const pct = between(min, max) / 100;
          const covered = w.bank.hackShield > 0 ? ` (${Math.round(w.bank.hackShield * 100)} % couverts par ta banque)` : '';
          return {
            walletId: w.id,
            userId: w.user.id,
            delta: -Number(w.cash) * pct * (1 - w.bank.hackShield),
            body: `Piratage de ${str(p, 'bank')} : tu perds {amount}${covered}.`,
            params: { bank: str(p, 'bank') ?? w.bank.name, shield: Math.round(w.bank.hackShield * 100) },
          };
        }),
      );
    },

    'bank-run': async (e, p) => {
      const rate = num(p, 'rate');
      const ws = await this.wallets({ bankId: str(p, 'bankId') });
      const free = await this.prisma.bank.findFirstOrThrow({ where: { isDefault: true } });
      const guarantee = Number(ws[0]?.bank.depositGuarantee ?? Infinity);
      const res = await this.cashEach(
        e,
        ws.map((w) => ({
          walletId: w.id,
          userId: w.user.id,
          delta: -Math.max(0, Number(w.cash) - guarantee) * (rate / 100),
          body: `${str(p, 'bank')} a fait faillite : tu perds {amount} au-delà de la garantie des dépôts.`,
          params: { bank: str(p, 'bank') ?? w.bank.name },
        })),
      );
      await this.prisma.wallet.updateMany({ where: { id: { in: ws.map((w) => w.id) } }, data: { bankId: free.id, bankSince: new Date(0), bankAccrued: 0 } });
      return { ...res, affected: ws.length, detail: `${ws.length} clients transférés à ${free.name}`, detailText: { key: 'game.eventResult.bankRun', params: { count: ws.length, bank: free.name } } };
    },

    'wallet-hack': async (e, p) => {
      const rate = num(p, 'rate');
      const ws = await this.wallets({ holdings: { some: { quantity: { gt: 0 } } } });
      const victims = shuffle(mathRng, ws).slice(0, num(p, 'count'));
      const notes: NotificationInput[] = [];
      let total = 0;
      for (const w of victims) {
        const h = pick(mathRng, await this.prisma.holding.findMany({ where: { walletId: w.id, quantity: { gt: 0 } }, include: { asset: true } }));
        if (!h) continue;
        const qty = D(h.quantity).mul((rate / 100) * (1 - w.bank.hackShield));
        const applied = await this.prisma.$transaction((tx) => applyAsset(tx, w.id, h.assetId, qty.neg(), 'EVENT', e.title, ref(e)));
        const usd = Number(applied.abs()) * Number(h.asset.price);
        total -= usd;
        notes.push({
          userId: w.user.id,
          type: 'EVENT',
          title: e.title,
          body: `Un hacker t'a volé ${applied.abs().toFixed(4)} ${h.asset.symbol} (~${money(usd)} $).`,
          text: { key: 'game.notif.events.wallet-hack', params: { event: titleOf(e), qty: param.qty(applied.abs()), symbol: h.asset.symbol, amount: param.money(usd) } },
          amount: (-usd).toFixed(2),
          link: '/portfolio',
        });
      }
      await this.notify.push(notes);
      return { affected: notes.length, total };
    },

    airdrop: async (e, p) => {
      const usd = num(p, 'usd');
      const asset = await this.prisma.asset.findUniqueOrThrow({ where: { id: str(p, 'assetId') } });
      const qty = D(usd).div(D(asset.price)).toDecimalPlaces(8);
      const ws = await this.wallets();
      for (const w of ws) await this.prisma.$transaction((tx) => applyAsset(tx, w.id, asset.id, qty, 'EVENT', e.title, ref(e)));
      await this.notify.push(
        ws.map((w) => ({
          userId: w.user.id,
          type: 'EVENT',
          title: e.title,
          body: `Tu reçois ${qty.toFixed(4)} ${asset.symbol} gratuitement.`,
          text: { key: 'game.notif.events.airdrop', params: { event: titleOf(e), qty: param.qty(qty), symbol: asset.symbol, amount: param.money(usd) } },
          amount: usd,
          link: `/market/${asset.symbol}`,
        })),
      );
      return { affected: ws.length, total: usd * ws.length };
    },

    inheritance: async (e, p) => {
      const [min, max] = [num(p, 'min'), num(p, 'max')];
      const ws = shuffle(mathRng, await this.wallets()).slice(0, num(p, 'count'));
      return this.cashEach(e, ws.map((w) => ({ walletId: w.id, userId: w.user.id, delta: between(min, max), body: "Un oncle d'Amérique que tu n'as jamais vu te lègue {amount}." })));
    },

    'exceptional-dividend': async (e, p) => {
      const rate = num(p, 'rate');
      const asset = await this.prisma.asset.findUniqueOrThrow({ where: { id: str(p, 'assetId') } });
      const holders = await this.prisma.holding.findMany({ where: { assetId: asset.id, quantity: { gt: 0 } } });
      const ws = await this.wallets({ id: { in: holders.map((h) => h.walletId) } });
      return this.cashEach(
        e,
        ws.map((w) => {
          const q = Number(holders.find((h) => h.walletId === w.id)?.quantity ?? 0);
          return { walletId: w.id, userId: w.user.id, delta: q * Number(asset.price) * (rate / 100), body: `Dividende exceptionnel sur ${asset.symbol} : +{amount}.`, params: { symbol: asset.symbol } };
        }),
      );
    },

    'bull-run': async (e, p) => ({ affected: await this.nudgeMarket(e, 'ALL', Math.log(1 + num(p, 'pct') / 100), 'HYPE'), total: 0 }),
    crash: async (e, p) => ({ affected: await this.nudgeMarket(e, 'ALL', Math.log(1 - num(p, 'pct') / 100), 'PANIC'), total: 0 }),
    'elon-tweet': async (e, p) => ({ affected: await this.nudgeMarket(e, this.targetAsset(p), Math.log(1 + num(p, 'pct') / 100), 'HYPE'), total: 0 }),
    'rug-pull': async (e, p) => ({ affected: await this.nudgeMarket(e, this.targetAsset(p), Math.log(1 - num(p, 'pct') / 100), 'PANIC'), total: 0 }),
  };

  /** Actif ciblé par l'événement (choisi à la programmation). */
  private targetAsset(p: Params): string[] {
    const id = str(p, 'assetId');
    if (!id) throw new Error('Paramètre « assetId » manquant');
    return [id];
  }

  // ─── Lecture ──────────────────────────────────────────────────────
  async feed() {
    const [upcoming, active, recent] = await Promise.all([
      this.prisma.gameEvent.findMany({ where: { status: 'SCHEDULED' }, orderBy: { startsAt: 'asc' }, include: { type: true } }),
      this.prisma.gameEvent.findMany({ where: { status: 'ACTIVE' }, orderBy: { endsAt: 'asc' }, include: { type: true } }),
      this.prisma.gameEvent.findMany({ where: { status: { in: ['DONE', 'CANCELLED'] } }, orderBy: { startsAt: 'desc' }, take: 30, include: { type: true } }),
    ]);
    const view = (e: GameEvent & { type: EventType }) => ({
      id: e.id,
      slug: e.type.slug,
      mood: e.type.mood,
      status: e.status,
      title: e.title,
      description: e.description,
      /** Clé de l'objet { title, description } des messages du site (repli : title et description ci-dessus) */
      text: { key: `game.events.${e.type.slug}`, params: eventTextParams(e.params as Params) },
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      result: e.result,
      byAdmin: !!e.triggeredBy,
    });
    return { upcoming: upcoming.map(view), active: active.map(view), recent: recent.map(view) };
  }
}
