import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Cosmetic, CosmeticKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from '../seasons/seasons.service';
import { LeaseService } from '../common/lease.service';
import { D, money } from '../common/decimal';
import { applyCash } from '../economy/ledger';
import { NotificationInput, NotificationsService } from '../economy/notifications';

export { AVATARS } from './catalog';
import { AVATARS } from './catalog';

export interface EquipInput {
  avatar?: string;
  frame?: string | null;
  banner?: string | null;
  title?: string | null;
  nameEffect?: string | null;
  badges?: string[];
  showcase?: string[];
}

const SLOT: Record<'frame' | 'banner' | 'title' | 'nameEffect', CosmeticKind> = { frame: 'FRAME', banner: 'BANNER', title: 'TITLE', nameEffect: 'NAME_EFFECT' };

/** Apparence publique d'un joueur (résolue depuis les slugs équipés). */
export interface Look {
  avatar: string;
  frame: string | null;
  banner: string | null;
  title: string | null;
  nameEffect: string | null;
  badges: Array<{ icon: string; name: string }>;
}

@Injectable()
export class MetaService {
  private readonly log = new Logger('Meta');
  private running = false;
  private lastRugCheck = new Date(Date.now() - 5 * 60_000);
  private cosmetics = new Map<string, Cosmetic>();
  private cosmeticsAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonsService,
    private readonly lease: LeaseService,
    private readonly notify: NotificationsService,
  ) {}

  // ─── Apparence ────────────────────────────────────────────────────
  private async cosmeticMap() {
    if (Date.now() - this.cosmeticsAt > 60_000) {
      this.cosmetics = new Map((await this.prisma.cosmetic.findMany()).map((c) => [c.slug, c]));
      this.cosmeticsAt = Date.now();
    }
    return this.cosmetics;
  }

  async looks(users: Array<{ id: string; avatar: string; frame: string | null; banner: string | null; title: string | null; nameEffect: string | null; badges: string[] }>) {
    const map = await this.cosmeticMap();
    const style = (slug: string | null) => (slug ? ((map.get(slug)?.data as { style?: string })?.style ?? null) : null);
    return new Map<string, Look>(
      users.map((u) => [
        u.id,
        {
          avatar: u.avatar,
          frame: style(u.frame),
          banner: style(u.banner),
          title: u.title ? ((map.get(u.title)?.data as { text?: string })?.text ?? null) : null,
          nameEffect: style(u.nameEffect),
          badges: u.badges.flatMap((b) => {
            const c = map.get(b);
            return c ? [{ icon: (c.data as { icon: string }).icon, name: c.name }] : [];
          }),
        },
      ]),
    );
  }

  static readonly LOOK_SELECT = { id: true, avatar: true, frame: true, banner: true, title: true, nameEffect: true, badges: true } as const;

  // ─── Boutique ─────────────────────────────────────────────────────
  async shop(userId?: string) {
    const [items, owned, achievements] = await Promise.all([
      this.prisma.cosmetic.findMany({ where: { available: true }, orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] }),
      userId ? this.prisma.userCosmetic.findMany({ where: { userId }, select: { cosmeticId: true } }) : [],
      this.prisma.achievement.findMany({ where: { rewardSlug: { not: null } }, select: { rewardSlug: true, name: true, hidden: true } }),
    ]);
    const mine = new Set(owned.map((o) => o.cosmeticId));
    const user = userId ? await this.prisma.user.findUnique({ where: { id: userId }, select: { avatar: true, frame: true, banner: true, title: true, nameEffect: true, badges: true, showcase: true } }) : null;
    return {
      avatars: AVATARS,
      equipped: user,
      items: items.map((c) => {
        const ach = achievements.find((a) => a.rewardSlug === c.slug);
        return {
          slug: c.slug,
          kind: c.kind,
          name: c.name,
          description: c.description,
          rarity: c.rarity,
          price: c.price?.toString() ?? null,
          data: c.data,
          owned: mine.has(c.id),
          unlockedBy: ach ? (ach.hidden ? 'Succès secret' : ach.name) : null,
        };
      }),
    };
  }

  async buy(userId: string, slug: string) {
    const c = await this.prisma.cosmetic.findUnique({ where: { slug } });
    if (!c || !c.available) throw new NotFoundException('Objet introuvable');
    if (!c.price) throw new BadRequestException('Cet objet ne s’achète pas : il se mérite (succès).');
    const { id: walletId } = await this.seasons.wallet(userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;
      if (await tx.userCosmetic.findUnique({ where: { userId_cosmeticId: { userId, cosmeticId: c.id } } })) throw new ConflictException('Tu possèdes déjà cet objet');
      const w = await tx.wallet.findUniqueOrThrow({ where: { id: walletId }, select: { cash: true } });
      if (D(w.cash).lt(D(c.price))) throw new BadRequestException('Cash insuffisant');
      await applyCash(tx, walletId, D(c.price).neg(), 'SHOP', `Boutique : ${c.name}`, { type: 'Cosmetic', id: c.id });
      await tx.userCosmetic.create({ data: { userId, cosmeticId: c.id, source: 'SHOP' } });
    });
    await this.check([userId]);
    return { ok: true, price: money(D(c.price)) };
  }

  async equip(userId: string, body: EquipInput) {
    const owned = await this.prisma.userCosmetic.findMany({ where: { userId }, include: { cosmetic: { select: { slug: true, kind: true } } } });
    const has = (slug: string, kind: CosmeticKind) => owned.some((o) => o.cosmetic.slug === slug && o.cosmetic.kind === kind);
    const data: Prisma.UserUpdateInput = {};
    if (body.avatar !== undefined) {
      if (!AVATARS.includes(body.avatar)) throw new BadRequestException('Avatar inconnu');
      data.avatar = body.avatar;
    }
    for (const key of ['frame', 'banner', 'title', 'nameEffect'] as const) {
      const v = body[key];
      if (v === undefined) continue;
      if (v !== null && !has(v, SLOT[key])) throw new BadRequestException('Tu ne possèdes pas cet objet');
      data[key] = v;
    }
    if (body.badges) {
      const badges = [...new Set(body.badges)].slice(0, 3);
      if (badges.some((b) => !has(b, 'BADGE'))) throw new BadRequestException('Tu ne possèdes pas ce badge');
      data.badges = badges;
    }
    if (body.showcase) {
      const show = [...new Set(body.showcase)].slice(0, 4);
      const mine = await this.prisma.userAchievement.findMany({ where: { userId, achievement: { slug: { in: show } } }, select: { achievement: { select: { slug: true } } } });
      if (mine.length !== show.length) throw new BadRequestException('Succès non débloqué');
      data.showcase = show;
    }
    await this.prisma.user.update({ where: { id: userId }, data });
    return { ok: true };
  }

  // ─── Succès ───────────────────────────────────────────────────────
  async achievements(userId?: string) {
    const season = await this.seasons.active();
    const [all, players, counts, mine] = await Promise.all([
      this.prisma.achievement.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.user.count({ where: { bannedAt: null, role: 'PLAYER' } }),
      this.prisma.userAchievement.groupBy({ by: ['achievementId'], _count: true }),
      userId ? this.prisma.userAchievement.findMany({ where: { userId } }) : [],
    ]);
    return {
      season: season.number,
      players,
      items: all.map((a) => {
        const got = mine.find((m) => m.achievementId === a.id);
        const secret = a.hidden && !got;
        return {
          slug: a.slug,
          name: secret ? '???' : a.name,
          description: secret ? 'Succès secret. Continue de jouer… ou de perdre.' : a.description,
          icon: secret ? 'Spiral' : a.icon,
          tier: a.tier,
          hidden: a.hidden,
          rewardSlug: secret ? null : a.rewardSlug,
          unlockedAt: got?.unlockedAt ?? null,
          rarity: players ? (counts.find((c) => c.achievementId === a.id)?._count ?? 0) / players : 0,
        };
      }),
    };
  }

  /** Débloque des succès (idempotent), offre les cosmétiques associés et notifie. */
  private async unlock(pairs: Array<[userId: string, slug: string]>, seasonNumber: number) {
    if (!pairs.length) return 0;
    const defs = new Map((await this.prisma.achievement.findMany()).map((a) => [a.slug, a]));
    const map = await this.cosmeticMap();
    const notes: NotificationInput[] = [];
    for (const [userId, slug] of pairs) {
      const a = defs.get(slug);
      if (!a) continue;
      const created = await this.prisma.userAchievement.createMany({ data: [{ userId, achievementId: a.id, seasonNumber }], skipDuplicates: true });
      if (!created.count) continue;
      const reward = a.rewardSlug ? map.get(a.rewardSlug) : undefined;
      if (reward) await this.prisma.userCosmetic.createMany({ data: [{ userId, cosmeticId: reward.id, source: 'ACHIEVEMENT' }], skipDuplicates: true });
      notes.push({
        userId,
        type: 'ACHIEVEMENT',
        title: `Succès débloqué : ${a.name}`,
        body: `${a.description}${reward ? ` Récompense : ${reward.name}.` : ''}`,
        link: '/achievements',
      });
    }
    await this.notify.push(notes);
    return notes.length;
  }

  @Interval(120_000)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      if (!(await this.lease.acquire('achievements-tick', 10 * 60_000))) return;
      await this.check();
    } catch (e) {
      this.log.error(e);
    } finally {
      this.running = false;
    }
  }

  /**
   * Évalue les succès des joueurs de la saison (tous, ou seulement `userIds`).
   * Requêtes groupées : quelques requêtes quel que soit le nombre de joueurs.
   */
  async check(userIds?: string[]) {
    const season = await this.seasons.active();
    const wallets = await this.prisma.wallet.findMany({
      where: { seasonId: season.id, user: { bannedAt: null, ...(userIds ? { id: { in: userIds } } : {}) } },
      select: { id: true, userId: true, netWorth: true, peakNetWorth: true, bank: { select: { slug: true, monthlyFee: true } }, user: { select: { role: true } } },
    });
    if (!wallets.length) return 0;
    const ids = wallets.map((w) => w.id);
    const inW = { walletId: { in: ids } };

    const [tradeAgg, pnlAgg, ledger, rigs, fires, holdings, cosmetics, minedRows, ranked] = await Promise.all([
      this.prisma.trade.groupBy({ by: ['walletId'], where: inW, _count: true, _sum: { cash: true } }),
      this.prisma.trade.groupBy({ by: ['walletId'], where: { ...inW, realizedPnl: { not: null } }, _sum: { realizedPnl: true }, _max: { realizedPnl: true }, _min: { realizedPnl: true } }),
      this.prisma.ledgerEntry.groupBy({ by: ['walletId', 'kind'], where: { ...inW, assetId: null, kind: { in: ['DIVIDEND', 'TAX', 'TAKEOVER'] } }, _sum: { delta: true } }),
      this.prisma.rig.groupBy({ by: ['walletId'], where: inW, _count: true }),
      this.prisma.miningLog.groupBy({ by: ['walletId'], where: { ...inW, type: 'FIRE' }, _count: true }),
      this.prisma.holding.findMany({ where: { ...inW, quantity: { gt: 0 } }, select: { walletId: true, quantity: true, costBasis: true, asset: { select: { kind: true, price: true } } } }),
      this.prisma.userCosmetic.groupBy({ by: ['userId'], where: { userId: { in: wallets.map((w) => w.userId) } }, _count: true }),
      this.prisma.ledgerEntry.groupBy({ by: ['walletId', 'assetId'], where: { ...inW, kind: 'MINING_REWARD' }, _sum: { delta: true } }),
      this.prisma.wallet.findMany({ where: { seasonId: season.id, user: { bannedAt: null, role: 'PLAYER' } }, orderBy: { netWorth: 'desc' }, select: { id: true } }),
    ]);
    const bankruptHolders = await this.prisma.ledgerEntry.groupBy({ by: ['walletId'], where: { ...inW, kind: 'BANKRUPTCY' }, _count: true });
    const prices = new Map((await this.prisma.asset.findMany({ select: { id: true, price: true } })).map((a) => [a.id, Number(a.price)]));

    // Rug pulls survenus depuis le dernier passage : les détenteurs actuels étaient là
    const since = this.lastRugCheck;
    this.lastRugCheck = new Date();
    const rugs = await this.prisma.marketEvent.findMany({ where: { type: 'RUG_PULL', createdAt: { gt: since } }, select: { assetId: true } });
    const rugHolders = rugs.length
      ? new Set((await this.prisma.holding.findMany({ where: { ...inW, assetId: { in: rugs.map((r) => r.assetId) }, quantity: { gt: 0 } }, select: { walletId: true } })).map((h) => h.walletId))
      : new Set<string>();

    const top3 = ranked.length >= 10 ? new Set(ranked.slice(0, 3).map((r) => r.id)) : new Set<string>();
    const sumLedger = (wid: string, kind: string) => Number(ledger.find((l) => l.walletId === wid && l.kind === kind)?._sum.delta ?? 0);

    const pairs: Array<[string, string]> = [];
    for (const w of wallets) {
      const add = (slug: string, cond: boolean) => cond && pairs.push([w.userId, slug]);
      const t = tradeAgg.find((x) => x.walletId === w.id);
      const p = pnlAgg.find((x) => x.walletId === w.id);
      const nTrades = t?._count ?? 0;
      const nw = Number(w.netWorth);
      const peak = Math.max(Number(w.peakNetWorth), nw);
      const hs = holdings.filter((h) => h.walletId === w.id);
      const loss = (h: (typeof hs)[number]) => Number(h.costBasis) > 0 && (Number(h.quantity) * Number(h.asset.price)) / Number(h.costBasis);
      const mined = minedRows.filter((m) => m.walletId === w.id).reduce((s, m) => s + Number(m._sum.delta ?? 0) * (prices.get(m.assetId!) ?? 0), 0);
      const nRigs = rigs.find((r) => r.walletId === w.id)?._count ?? 0;
      const nFires = fires.find((f) => f.walletId === w.id)?._count ?? 0;

      add('first-trade', nTrades >= 1);
      add('hyperactive', nTrades >= 100);
      add('big-volume', Number(t?._sum.cash ?? 0) >= 1_000_000);
      add('profit-10k', Number(p?._sum.realizedPnl ?? 0) >= 10_000);
      add('big-win', Number(p?._max.realizedPnl ?? 0) >= 5_000);
      add('big-loss', Number(p?._min.realizedPnl ?? 0) <= -5_000);
      add('diamond-hands', hs.some((h) => { const r = loss(h); return r !== false && r <= 0.1; }));
      add('diamond-hands-title', hs.some((h) => { const r = loss(h); return r !== false && r <= 0.05 && Number(h.costBasis) >= 1_000; }));
      add('rug-survivor', rugHolders.has(w.id));
      add('first-100k', peak >= 100_000);
      add('first-million', peak >= 1_000_000);
      add('millionaire-title', peak >= 2_000_000);
      add('gold-frame', peak >= 5_000_000);
      add('podium', top3.has(w.id));
      add('broke', nw > 0 && nw < 100);
      add('first-rig', nRigs >= 1);
      add('industrial', nRigs >= 10);
      add('pyromane', nFires >= 1);
      add('pyro-badge', nFires >= 3);
      add('arsonist', nFires >= 5);
      add('miner-10k', mined >= 10_000);
      add('shareholder', hs.some((h) => h.asset.kind === 'STOCK'));
      add('rentier', sumLedger(w.id, 'DIVIDEND') >= 500);
      add('takeover', sumLedger(w.id, 'TAKEOVER') > 0);
      add('bankrupt', bankruptHolders.some((b) => b.walletId === w.id));
      add('premium', Number(w.bank.monthlyFee) > 0);
      add('offshore', w.bank.slug === 'banque-suisse-discrete');
      add('taxpayer', -sumLedger(w.id, 'TAX') >= 1_000);
      add('fashion', (cosmetics.find((c) => c.userId === w.userId)?._count ?? 0) >= 5);
    }

    // On ne retente pas ce qui est déjà débloqué
    const done = new Set(
      (await this.prisma.userAchievement.findMany({ where: { userId: { in: wallets.map((w) => w.userId) } }, select: { userId: true, achievement: { select: { slug: true } } } })).map(
        (u) => `${u.userId}:${u.achievement.slug}`,
      ),
    );
    return this.unlock(pairs.filter(([u, s]) => !done.has(`${u}:${s}`)), season.number);
  }

  /** Vitrine publique : succès mis en avant (ou les plus rares à défaut). */
  async publicAchievements(userId: string, showcase: string[]) {
    const got = await this.prisma.userAchievement.findMany({ where: { userId }, include: { achievement: true }, orderBy: { unlockedAt: 'desc' } });
    const order = { LEGENDARY: 0, GOLD: 1, SILVER: 2, BRONZE: 3 } as const;
    const featured = showcase.length
      ? showcase.flatMap((s) => got.filter((g) => g.achievement.slug === s))
      : [...got].sort((a, b) => order[a.achievement.tier] - order[b.achievement.tier]).slice(0, 4);
    const view = (g: (typeof got)[number]) => ({ slug: g.achievement.slug, name: g.achievement.name, icon: g.achievement.icon, tier: g.achievement.tier, description: g.achievement.description, unlockedAt: g.unlockedAt });
    return { count: got.length, total: await this.prisma.achievement.count(), featured: featured.map(view), recent: got.slice(0, 8).map(view) };
  }
}
