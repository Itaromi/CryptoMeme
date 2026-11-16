import { PrismaClient, AssetTier } from '@prisma/client';
import * as argon2 from 'argon2';
import { DEFAULT_PARAMS, initialState } from '@cryptomeme/engine';
import { STARTING_CASH } from '@cryptomeme/shared';
import { CATALOG, FACILITY_TYPES, NETWORKS, POOLS } from './catalog';
import { BANKS, EVENT_TYPES } from './economy-catalog';

const prisma = new PrismaClient();

const LIQUIDITY: Record<AssetTier, number> = {
  BLUE_CHIP: 5_000_000,
  MID_CAP: 500_000,
  SHITCOIN: 50_000,
};

const COINS: Array<{ symbol: string; name: string; tier: AssetTier; price: number; emoji: string; color: string; description: string }> = [
  { symbol: 'BTCN', name: 'Bitconnard', tier: 'BLUE_CHIP', price: 42_069, emoji: '🟠', color: '#f7931a', description: "La crypto originelle. Créée par un inconnu qui a perdu son mot de passe depuis." },
  { symbol: 'ETN', name: 'Ethernul', tier: 'BLUE_CHIP', price: 2_420, emoji: '💎', color: '#8b9dff', description: 'Smart contracts, gas fees et promesses de mise à jour « le mois prochain ».' },
  { symbol: 'DCC', name: 'DogeCoinCoin', tier: 'MID_CAP', price: 0.69, emoji: '🐕', color: '#c2a633', description: "Un chien. Deux fois. Pourquoi pas." },
  { symbol: 'BAGT', name: 'Baguette Token', tier: 'MID_CAP', price: 1.2, emoji: '🥖', color: '#e0a96d', description: 'Adossé à la baguette tradition. Grève prévue tous les jeudis.' },
  { symbol: 'NFTRUC', name: 'NFTruc', tier: 'MID_CAP', price: 13.37, emoji: '🖼️', color: '#ff6ad5', description: "Un JPEG de singe qui s'ennuie, mais en token." },
  { symbol: 'STONKS', name: 'Stonks Coin', tier: 'MID_CAP', price: 4.2, emoji: '📈', color: '#22c55e', description: 'Only up. (Avertissement : pas only up.)' },
  { symbol: 'MAMIE', name: 'MamieCoin', tier: 'MID_CAP', price: 0.12, emoji: '👵', color: '#d8b4fe', description: "Mamie a tout mis dedans. Ne la décevez pas." },
  { symbol: 'TWEET', name: 'ElonsTweet', tier: 'SHITCOIN', price: 0.0042, emoji: '🐦', color: '#38bdf8', description: "Son cours dépend d'un seul homme et de son humeur à 3 h du matin." },
  { symbol: 'SAFEMM', name: 'SafeMoonMoon', tier: 'SHITCOIN', price: 0.000069, emoji: '🌙', color: '#facc15', description: 'Deux fois plus safe que SafeMoon. Donc pas du tout.' },
  { symbol: 'RUGINU', name: 'RugPull Inu', tier: 'SHITCOIN', price: 0.0001, emoji: '🧶', color: '#f97316', description: 'Le nom est un avertissement. Personne ne lit les avertissements.' },
  { symbol: 'KEBAB', name: 'KebabFi', tier: 'SHITCOIN', price: 0.33, emoji: '🥙', color: '#ef4444', description: 'DeFi salade-tomate-oignon. Rendement en sauce blanche.' },
  { symbol: 'HODL', name: 'HODL Forever', tier: 'SHITCOIN', price: 0.015, emoji: '🙌', color: '#14b8a6', description: 'Mains de diamant obligatoires. Mains de papier punies.' },
];



async function main() {
  for (const b of BANKS) {
    const data = { available: true, ...b };
    await prisma.bank.upsert({ where: { slug: b.slug }, update: data, create: data });
  }

  const season = await prisma.season.findFirst({ where: { status: 'ACTIVE' } });
  if (!season) {
    await prisma.season.create({ data: { number: 1, name: 'Saison 1 — Genesis Block', startingCash: STARTING_CASH } });
  }

  for (const c of COINS) {
    const liq = LIQUIDITY[c.tier];
    const exists = await prisma.asset.findUnique({ where: { symbol: c.symbol } });
    if (exists) continue;
    await prisma.asset.create({
      data: {
        symbol: c.symbol,
        name: c.name,
        tier: c.tier,
        description: c.description,
        emoji: c.emoji,
        color: c.color,
        params: DEFAULT_PARAMS[c.tier] as object,
        state: initialState(c.price) as object,
        quoteReserve: liq,
        baseReserve: liq / c.price,
        price: c.price,
      },
    });
  }

  // ─── Minage ───────────────────────────────────────────────────────
  for (const m of CATALOG) {
    const { slug, ...data } = m;
    await prisma.componentModel.upsert({ where: { slug }, update: data, create: { slug, ...data } });
  }
  for (const f of FACILITY_TYPES) {
    await prisma.facilityType.upsert({ where: { slug: f.slug }, update: f, create: f });
  }
  for (const n of NETWORKS) {
    const asset = await prisma.asset.findUniqueOrThrow({ where: { symbol: n.symbol } });
    const price = Number(asset.price);
    // Émission du réseau : 3 % de la réserve du pool AMM par jour
    const blockReward = (Number(asset.baseReserve) * 0.03) / 1440;
    // Hashrate PNJ calibré pour que 1 MH/s rapporte `usdPerMhDay` au départ
    const npc = (blockReward * 1440 * price) / n.usdPerMhDay;
    const data = { algo: n.algo, blockReward: blockReward.toFixed(8), npcHashrate: npc, baseNpcHashrate: npc, initialPrice: price };
    await prisma.miningNetwork.upsert({ where: { assetId: asset.id }, update: {}, create: { assetId: asset.id, ...data } });
  }
  for (const p of POOLS) {
    const asset = await prisma.asset.findUniqueOrThrow({ where: { symbol: p.symbol } });
    const { symbol, ...rest } = p;
    const data = { ...rest, assetId: asset.id, scamRisk: 'scamRisk' in p ? p.scamRisk : 0 };
    await prisma.miningPool.upsert({ where: { slug: p.slug }, update: data, create: data });
  }
  console.log(`Catalogue : ${CATALOG.length} modèles`);
  for (const e of EVENT_TYPES) {
    const data = { ...e, params: (e.params ?? {}) as object };
    await prisma.eventType.upsert({ where: { slug: e.slug }, update: {}, create: data });
  }
  console.log(`Événements : ${EVENT_TYPES.length} types`);

  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password) {
    await prisma.user.upsert({
      where: { email },
      update: { role: 'ADMIN' },
      create: {
        email,
        username: 'admin',
        role: 'ADMIN',
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        emailVerifiedAt: new Date(),
      },
    });
  }
  console.log('Seed OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
