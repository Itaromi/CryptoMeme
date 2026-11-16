import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EventType, GameEvent, Prisma } from '@prisma/client';
import { MarketState, mathRng, poissonHit } from '@cryptomeme/engine';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from '../seasons/seasons.service';
import { LeaseService } from '../common/lease.service';
import { MarketGateway } from '../market/market.gateway';
import { PlayersService } from '../players/players.service';
import { D, money } from '../common/decimal';
import { applyAsset, applyCash } from './ledger';
import { NotificationInput, NotificationsService } from './notifications';
import { ModifiersService } from './modifiers.service';

type Params = Record<string, any>;
type Result = { affected: number; total: number; detail?: string };
const ref = (e: GameEvent) => ({ type: 'GameEvent', id: e.id });
const pick = <T>(arr: T[]): T | undefined => arr[Math.floor(mathRng() * arr.length)];
const between = (a: number, b: number) => a + mathRng() * (b - a);

/** Remplit « {clé} » avec les paramètres de l'événement. */
export function fill(template: string, p: Params) {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = k === 'mult' ? (p.elecMultiplier ?? p.hardwareMultiplier ?? p.failureMultiplier) : k === 'ambient' ? p.ambientDelta : p[k];
    return v === undefined ? `{${k}}` : typeof v === 'number' ? v.toLocaleString('fr-FR') : String(v);
  });
}

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
      for (const t of types.sort(() => mathRng() - 0.5)) {
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
    this.gateway.server?.emit('events:changed');
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
        params,
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
      const where: Prisma.AssetWhereInput = { frozen: false, ...(p.tiers ? { tier: { in: p.tiers } } : {}) };
      if (slug === 'exceptional-dividend') where.holdings = { some: { quantity: { gt: 0 } } };
      const a = pick(await this.prisma.asset.findMany({ where, select: { id: true, symbol: true } }));
      if (!a) return false;
      p.assetId = a.id;
      p.symbol = a.symbol;
    }
    if (slug === 'bank-hack' && !p.bankId) {
      const season = await this.seasons.active();
      const used = await this.prisma.wallet.groupBy({ by: ['bankId'], where: { seasonId: season.id }, _count: true });
      const b = pick(used);
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
    }
    const duration = e.type.durationMinutes;
    await this.prisma.gameEvent.update({
      where: { id: e.id },
      data: { status: duration > 0 ? 'ACTIVE' : 'DONE', endsAt: duration > 0 ? new Date(Date.now() + duration * 60_000) : new Date(), result },
    });
    this.changed();
    void this.players.recompute();
  }

  // ─── Cibles ───────────────────────────────────────────────────────
  private async wallets(where: Prisma.WalletWhereInput = {}) {
    const season = await this.seasons.active();
    return this.prisma.wallet.findMany({
      where: { seasonId: season.id, user: { bannedAt: null }, ...where },
      include: { bank: true, user: { select: { id: true } } },
    });
  }

  /** Applique une variation de cash à chaque wallet + notification. */
  private async cashEach(e: GameEvent, items: Array<{ walletId: string; userId: string; delta: number; body: string }>, kind: 'TAX' | 'EVENT' = 'EVENT') {
    const notes: NotificationInput[] = [];
    let total = 0;
    let affected = 0;
    for (const it of items) {
      if (Math.abs(it.delta) < 0.01) continue;
      const applied = await this.prisma.$transaction((tx) => applyCash(tx, it.walletId, D(it.delta.toFixed(2)), kind, e.title, ref(e)));
      if (applied.isZero()) continue;
      affected++;
      total += Number(applied);
      notes.push({ userId: it.userId, type: 'EVENT', title: e.title, body: it.body.replace('{amount}', `${money(applied.abs())} $`), amount: applied.toString(), link: '/events' });
    }
    await this.notify.push(notes);
    return { affected, total };
  }

  private async nudgeMarket(assetIds: string[] | 'ALL', logMove: number, regime: MarketState['regime'], detail: string) {
    const assets = await this.prisma.asset.findMany({ where: assetIds === 'ALL' ? { frozen: false } : { id: { in: assetIds } }, select: { id: true } });
    for (const { id } of assets) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${id} FOR UPDATE`;
        const a = await tx.asset.findUniqueOrThrow({ where: { id } });
        const s = a.state as unknown as MarketState;
        const next = { ...s, logFair: s.logFair + logMove, logAnchor: s.logAnchor + logMove * 0.6, regime };
        await tx.asset.update({ where: { id }, data: { state: next as object } });
        await tx.marketEvent.create({ data: { assetId: id, type: 'EVENT', detail } });
      });
    }
    return assets.length;
  }

  // ─── Effets ───────────────────────────────────────────────────────
  private readonly handlers: Record<string, (e: GameEvent, p: Params) => Promise<Result>> = {
    'flat-tax': async (e, p) => {
      const since = new Date(Date.now() - (p.windowHours ?? 24) * 3_600_000);
      const gains = await this.prisma.trade.groupBy({ by: ['walletId'], where: { createdAt: { gte: since }, realizedPnl: { not: null }, walletId: { not: null } }, _sum: { realizedPnl: true } });
      const ws = await this.wallets({ id: { in: gains.map((g) => g.walletId!) } });
      return this.cashEach(
        e,
        ws.map((w) => {
          const g = Number(gains.find((x) => x.walletId === w.id)?._sum.realizedPnl ?? 0);
          return { walletId: w.id, userId: w.user.id, delta: -Math.max(0, g) * (p.rate / 100) * (1 - w.bank.taxShield), body: `Flat tax sur tes plus-values : −{amount}.` };
        }),
        'TAX',
      );
    },

    'wealth-tax': async (e, p) => {
      await this.players.recompute();
      const brackets: [number, number][] = p.brackets;
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
      const ws = await this.wallets({ bank: { taxShield: { gt: 0 } } });
      return this.cashEach(
        e,
        ws.filter(() => mathRng() < p.chance).map((w) => ({ walletId: w.id, userId: w.user.id, delta: -Number(w.cash) * (p.rate / 100), body: `Contrôle fiscal chez ${w.bank.name} : amende de {amount}.` })),
        'TAX',
      );
    },

    'tax-refund': async (e, p) => {
      const since = new Date(Date.now() - (p.windowDays ?? 7) * 86_400_000);
      const paid = await this.prisma.ledgerEntry.groupBy({ by: ['walletId'], where: { kind: 'TAX', createdAt: { gte: since } }, _sum: { delta: true } });
      const ws = await this.wallets({ id: { in: paid.map((x) => x.walletId) } });
      return this.cashEach(
        e,
        ws.map((w) => ({ walletId: w.id, userId: w.user.id, delta: -Number(paid.find((x) => x.walletId === w.id)?._sum.delta ?? 0) * (p.rate / 100), body: 'Le fisc te rembourse {amount}. Ne t’habitue pas.' })),
      );
    },

    'bank-hack': async (e, p) => {
      const ws = await this.wallets({ bankId: p.bankId });
      return this.cashEach(
        e,
        ws.map((w) => {
          const pct = between(p.min, p.max) / 100;
          const covered = w.bank.hackShield > 0 ? ` (${Math.round(w.bank.hackShield * 100)} % couverts par ta banque)` : '';
          return { walletId: w.id, userId: w.user.id, delta: -Number(w.cash) * pct * (1 - w.bank.hackShield), body: `Piratage de ${p.bank} : tu perds {amount}${covered}.` };
        }),
      );
    },

    'bank-run': async (e, p) => {
      const ws = await this.wallets({ bankId: p.bankId });
      const free = await this.prisma.bank.findFirstOrThrow({ where: { isDefault: true } });
      const guarantee = Number(ws[0]?.bank.depositGuarantee ?? Infinity);
      const res = await this.cashEach(
        e,
        ws.map((w) => ({ walletId: w.id, userId: w.user.id, delta: -Math.max(0, Number(w.cash) - guarantee) * (p.rate / 100), body: `${p.bank} a fait faillite : tu perds {amount} au-delà de la garantie des dépôts.` })),
      );
      await this.prisma.wallet.updateMany({ where: { id: { in: ws.map((w) => w.id) } }, data: { bankId: free.id, bankSince: new Date(0), bankAccrued: 0 } });
      return { ...res, affected: ws.length, detail: `${ws.length} clients transférés à ${free.name}` };
    },

    'wallet-hack': async (e, p) => {
      const ws = await this.wallets({ holdings: { some: { quantity: { gt: 0 } } } });
      const victims = ws.sort(() => mathRng() - 0.5).slice(0, p.count);
      const notes: NotificationInput[] = [];
      let total = 0;
      for (const w of victims) {
        const h = pick(await this.prisma.holding.findMany({ where: { walletId: w.id, quantity: { gt: 0 } }, include: { asset: true } }));
        if (!h) continue;
        const qty = D(h.quantity).mul((p.rate / 100) * (1 - w.bank.hackShield));
        const applied = await this.prisma.$transaction((tx) => applyAsset(tx, w.id, h.assetId, qty.neg(), 'EVENT', e.title, ref(e)));
        const usd = Number(applied.abs()) * Number(h.asset.price);
        total -= usd;
        notes.push({ userId: w.user.id, type: 'EVENT', title: e.title, body: `Un hacker t'a volé ${applied.abs().toFixed(4)} ${h.asset.symbol} (~${money(usd)} $).`, amount: (-usd).toFixed(2), link: '/portfolio' });
      }
      await this.notify.push(notes);
      return { affected: notes.length, total };
    },

    airdrop: async (e, p) => {
      const asset = await this.prisma.asset.findUniqueOrThrow({ where: { id: p.assetId } });
      const qty = D(p.usd).div(D(asset.price)).toDecimalPlaces(8);
      const ws = await this.wallets();
      for (const w of ws) await this.prisma.$transaction((tx) => applyAsset(tx, w.id, asset.id, qty, 'EVENT', e.title, ref(e)));
      await this.notify.push(ws.map((w) => ({ userId: w.user.id, type: 'EVENT', title: e.title, body: `Tu reçois ${qty.toFixed(4)} ${asset.symbol} gratuitement.`, amount: p.usd, link: `/market/${asset.symbol}` })));
      return { affected: ws.length, total: p.usd * ws.length };
    },

    inheritance: async (e, p) => {
      const ws = (await this.wallets()).sort(() => mathRng() - 0.5).slice(0, p.count);
      return this.cashEach(e, ws.map((w) => ({ walletId: w.id, userId: w.user.id, delta: between(p.min, p.max), body: "Un oncle d'Amérique que tu n'as jamais vu te lègue {amount}." })));
    },

    'exceptional-dividend': async (e, p) => {
      const asset = await this.prisma.asset.findUniqueOrThrow({ where: { id: p.assetId } });
      const holders = await this.prisma.holding.findMany({ where: { assetId: asset.id, quantity: { gt: 0 } } });
      const ws = await this.wallets({ id: { in: holders.map((h) => h.walletId) } });
      return this.cashEach(
        e,
        ws.map((w) => {
          const q = Number(holders.find((h) => h.walletId === w.id)?.quantity ?? 0);
          return { walletId: w.id, userId: w.user.id, delta: q * Number(asset.price) * (p.rate / 100), body: `Dividende exceptionnel sur ${asset.symbol} : +{amount}.` };
        }),
      );
    },

    'bull-run': async (e, p) => ({ affected: await this.nudgeMarket('ALL', Math.log(1 + p.pct / 100), 'HYPE', e.title), total: 0 }),
    crash: async (e, p) => ({ affected: await this.nudgeMarket('ALL', Math.log(1 - p.pct / 100), 'PANIC', e.title), total: 0 }),
    'elon-tweet': async (e, p) => ({ affected: await this.nudgeMarket([p.assetId], Math.log(1 + p.pct / 100), 'HYPE', e.title), total: 0 }),
    'rug-pull': async (e, p) => ({ affected: await this.nudgeMarket([p.assetId], Math.log(1 - p.pct / 100), 'PANIC', e.title), total: 0 }),
  };

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
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      result: e.result,
      byAdmin: !!e.triggeredBy,
    });
    return { upcoming: upcoming.map(view), active: active.map(view), recent: recent.map(view) };
  }
}
