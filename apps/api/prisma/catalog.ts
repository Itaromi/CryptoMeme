/**
 * Génération déterministe du catalogue de matériel de minage (~400 modèles).
 * Les stats suivent des courbes de tier + génération, avec un peu de bruit pour que
 * certains modèles soient de bonnes affaires et d'autres des arnaques.
 */
import { createRng, type Hashrates } from '@cryptomeme/engine';

type Kind = 'CPU' | 'GPU' | 'ASIC' | 'PSU' | 'MOTHERBOARD' | 'COOLING' | 'RACK';

export interface ModelSeed {
  slug: string;
  kind: Kind;
  brand: string;
  name: string;
  tier: number;
  price: number;
  watts: number;
  hashrates: Hashrates;
  efficiency?: number;
  socket?: string;
  gpuSlots?: number;
  coolingW?: number;
  rackSlots?: number;
  airflow?: number;
  failureRate: number;
  description?: string;
}

const rng = createRng(20261116);
const jitter = (spread = 0.1) => 1 + (rng() * 2 - 1) * spread;
const round = (v: number, step = 1) => Number((Math.round(v / step) * step).toFixed(4));
const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const out: ModelSeed[] = [];
const push = (m: Omit<ModelSeed, 'slug' | 'hashrates'> & { hashrates?: Hashrates }) => {
  let slug = slugify(`${m.brand} ${m.name}`);
  while (out.some((o) => o.slug === slug)) slug += '-b';
  out.push({ ...m, hashrates: m.hashrates ?? {}, slug, price: round(m.price, 5) });
};

// ─── GPU ────────────────────────────────────────────────────────────
// gen : 0 = vieux (pas cher, énergivore) → 4 = dernier cri (cher, efficace)
const GPU_LINES: Array<{ brand: string; prefix: string; names: string[][]; vramBias: number; reliability: number }> = [
  {
    brand: 'Nvidiot',
    prefix: 'GeForce',
    vramBias: 0.9,
    reliability: 1,
    names: [
      ['GTX 1050', 'GTX 1060', 'GTX 1070', 'GTX 1080', 'GTX 1080 Ti'],
      ['RTX 2060', 'RTX 2070', 'RTX 2080', 'RTX 2080 Ti', 'Titan RTX'],
      ['RTX 3050', 'RTX 3060', 'RTX 3060 Ti', 'RTX 3070', 'RTX 3080', 'RTX 3090'],
      ['RTX 4060', 'RTX 4060 Ti', 'RTX 4070', 'RTX 4070 Ti', 'RTX 4080', 'RTX 4090'],
      ['RTX 5060', 'RTX 5070', 'RTX 5070 Ti', 'RTX 5080', 'RTX 5090', 'RTX 5090 Ti Ultra Max'],
    ],
  },
  {
    brand: 'AMDébile',
    prefix: 'Radeon',
    vramBias: 1.25,
    reliability: 1.15,
    names: [
      ['RX 470', 'RX 480', 'RX 570', 'RX 580', 'RX Vega 56'],
      ['RX 5500 XT', 'RX 5600 XT', 'RX 5700', 'RX 5700 XT'],
      ['RX 6600', 'RX 6700 XT', 'RX 6800', 'RX 6800 XT', 'RX 6900 XT'],
      ['RX 7600', 'RX 7700 XT', 'RX 7800 XT', 'RX 7900 XT', 'RX 7900 XTX'],
      ['RX 9060 XT', 'RX 9070', 'RX 9070 XT', 'RX 9090 XTX Turbo'],
    ],
  },
  {
    brand: 'Intelligent',
    prefix: 'Arc',
    vramBias: 1.1,
    reliability: 1.6,
    names: [[], [], ['A310', 'A380', 'A580', 'A750', 'A770'], ['B570', 'B580', 'B770'], ['C750', 'C970']],
  },
];
const PARTNERS = [
  { brand: 'ROG-nul', suffix: 'STRIX OC', rel: 0.8, description: 'Plus de RGB que de hashrate.' },
  { brand: 'Zotac-tac', suffix: 'AMP Extreme', rel: 1.1, description: undefined },
  { brand: 'Saphir', suffix: 'Nitro+', rel: 0.85, description: undefined },
  { brand: 'MSIrène', suffix: 'Gaming X Trio', rel: 0.9, description: undefined },
  { brand: 'Gigabête', suffix: 'Aorus Master', rel: 0.95, description: undefined },
  { brand: 'PNY-rien', suffix: 'XLR8 Blower', rel: 1.4, description: 'Turbine bruyante. Chauffe comme un grille-pain.' },
];
for (const line of GPU_LINES) {
  line.names.forEach((series, gen) => {
    series.forEach((n, i) => {
      const tier = 1 + (i / Math.max(1, series.length - 1)) * 9; // 1 → 10 dans la série
      const genEff = 0.55 + gen * 0.2; // MH/W
      const scrypt = 14 * tier ** 1.05 * (0.6 + gen * 0.22) * jitter();
      const watts = round(Math.max(60, (scrypt / genEff) * 1.7 * jitter(0.08)), 5);
      push({
        kind: 'GPU',
        brand: line.brand,
        name: `${line.prefix} ${n}`,
        tier: Math.round(tier),
        price: 80 + scrypt ** 1.18 * (3.2 + gen * 0.55) * jitter(0.15),
        watts,
        hashrates: {
          SCRYPT_LOL: round(scrypt, 0.1),
          KEKHASH: round(scrypt * 0.42 * line.vramBias * (0.8 + gen * 0.08), 0.1),
          SHA_MEME: round(scrypt * 5, 1),
          PROOF_OF_VIBE: round(scrypt * 0.04, 0.01),
        },
        failureRate: 0.0004 * line.reliability * (1.3 - gen * 0.1),
        description: gen === 0 ? 'Rescapée du minage de 2017. Sent le cramé.' : gen === 4 ? 'Coûte un rein. Le gauche.' : undefined,
      });
      // Éditions partenaires : un peu plus rapides, mieux refroidies, plus chères
      if (rng() < 0.85) {
        const partner = PARTNERS[Math.floor(rng() * PARTNERS.length)];
        const boost = 1.04 + rng() * 0.08;
        const base = out[out.length - 1];
        push({
          ...base,
          brand: partner.brand,
          name: `${base.name} ${partner.suffix}`,
          price: base.price * (boost + 0.06 + rng() * 0.1),
          watts: round(base.watts * (1 + (boost - 1) * 0.7), 5),
          hashrates: Object.fromEntries(Object.entries(base.hashrates).map(([a, h]) => [a, round((h ?? 0) * boost, 0.01)])),
          failureRate: base.failureRate * partner.rel,
          description: partner.description,
        });
      }
    });
  });
}

// ─── CPU ────────────────────────────────────────────────────────────
const INTEL_SOCKET = (g: number) => (g <= 11 ? 'LGA1200' : g <= 14 ? 'LGA1700' : 'LGA1851');
for (let g = 10; g <= 15; g++) {
  for (const [k, model] of [['3', 'i3'], ['5', 'i5'], ['7', 'i7'], ['9', 'i9']] as const) {
    for (const suffix of ['', 'K']) {
      const tier = Number(k) + (suffix ? 1 : 0);
      const gen = g - 10;
      const vibe = 1.6 * tier ** 1.25 * (0.75 + gen * 0.1) * jitter();
      push({
        kind: 'CPU',
        brand: 'Intel Corps',
        name: `Core ${model}-${g}${k}00${suffix}`,
        tier,
        price: 60 + vibe ** 1.25 * 9 * jitter(0.12),
        watts: round((65 + tier * 14 + (suffix ? 35 : 0)) * (1.15 - gen * 0.04), 5),
        socket: INTEL_SOCKET(g),
        hashrates: { PROOF_OF_VIBE: round(vibe, 0.1), SHA_MEME: round(vibe * 4, 1), SCRYPT_LOL: round(vibe * 0.3, 0.1) },
        failureRate: 0.00015,
        description: suffix && g === 13 ? 'Dégradation incluse sans supplément.' : undefined,
      });
    }
  }
}
for (let s = 1; s <= 9; s++) {
  if (s === 6 || s === 8 || s === 4) continue;
  for (const [k, tierBase] of [['3', 3], ['5', 5], ['7', 7], ['9', 9]] as const) {
    for (const suffix of ['', 'X', ...(s >= 5 && k !== '3' ? ['X3D'] : [])]) {
      const tier = tierBase + (suffix ? 1 : 0);
      const gen = (s - 1) / 2;
      const vibe = 1.75 * tier ** 1.25 * (0.75 + gen * 0.1) * (suffix === 'X3D' ? 1.25 : 1) * jitter();
      push({
        kind: 'CPU',
        brand: 'AMDébile',
        name: `Rizzen ${k} ${s}${k === '3' ? '3' : k}00${suffix}`,
        tier,
        price: 50 + vibe ** 1.25 * 8.5 * jitter(0.12),
        watts: round((65 + tier * 11 + (suffix === 'X' ? 30 : 0)) * (1.1 - gen * 0.03), 5),
        socket: s >= 7 ? 'AM5' : 'AM4',
        hashrates: { PROOF_OF_VIBE: round(vibe, 0.1), SHA_MEME: round(vibe * 4, 1), SCRYPT_LOL: round(vibe * 0.3, 0.1) },
        failureRate: 0.00018,
      });
    }
  }
}

// ─── ASIC ───────────────────────────────────────────────────────────
const ASIC_LINES: Array<{ brand: string; prefix: string; algo: 'SHA_MEME' | 'SCRYPT_LOL' | 'KEKHASH'; models: string[]; base: number; reliability: number }> = [
  { brand: 'Bitmeme', prefix: 'Antminer S', algo: 'SHA_MEME', models: ['1', '3', '5', '7', '9', '11', '15', '17', '19', '19 Pro', '19 XP', '21', '21 Hydro'], base: 9000, reliability: 1 },
  { brand: 'MicroBT-ise', prefix: 'Whatsminer M', algo: 'SHA_MEME', models: ['20', '25', '30', '30S++', '50', '56', '60', '66S'], base: 9500, reliability: 1.3 },
  { brand: 'Bitmeme', prefix: 'Antminer L', algo: 'SCRYPT_LOL', models: ['3', '3+', '7', '7 Turbo', '9'], base: 380, reliability: 1 },
  { brand: 'Goldshell-fish', prefix: 'Mini-DOGE', algo: 'SCRYPT_LOL', models: [' I', ' II', ' Pro', ' Ultra'], base: 300, reliability: 1.6 },
  { brand: 'Kekmaster', prefix: 'K', algo: 'KEKHASH', models: ['1', '2', '3', '5', '7', '9 Lol Edition'], base: 120, reliability: 1.4 },
];
for (const line of ASIC_LINES) {
  line.models.forEach((m, i) => {
    const gen = i / Math.max(1, line.models.length - 1); // 0 → 1
    const hash = line.base * (1 + gen * 9) * jitter(0.12);
    const watts = round((1100 + gen * 2400) * jitter(0.1), 10);
    push({
      kind: 'ASIC',
      brand: line.brand,
      name: `${line.prefix}${m}`,
      tier: 1 + Math.round(gen * 9),
      price: 600 + hash * (line.algo === 'SHA_MEME' ? 0.11 : line.algo === 'SCRYPT_LOL' ? 2.7 : 7) * (0.8 + gen * 0.5) * jitter(0.15),
      watts,
      coolingW: round(watts * (1.08 + rng() * 0.15), 10),
      hashrates: { [line.algo]: round(hash, 1) },
      failureRate: 0.0006 * line.reliability,
      description: 'Fait le bruit d’un avion au décollage. Ne fait qu’une seule chose, mais la fait bien.',
    });
  });
}

// ─── Alimentations ──────────────────────────────────────────────────
const RATINGS = [
  { label: '80+ Bronze', eff: 0.85, mul: 1 },
  { label: '80+ Gold', eff: 0.9, mul: 1.25 },
  { label: '80+ Platinum', eff: 0.92, mul: 1.5 },
  { label: '80+ Titanium', eff: 0.94, mul: 1.9 },
];
const PSU_BRANDS = [
  { brand: 'Corsaire', name: 'RMx', ratings: [1, 2], rel: 1 },
  { brand: 'Seasonique', name: 'Prime', ratings: [2, 3], rel: 0.8 },
  { brand: 'BeQuiet Pas', name: 'Dark Power', ratings: [1, 2, 3], rel: 0.9 },
  { brand: 'EVGAffe', name: 'SuperNOVA', ratings: [0, 1], rel: 1.2 },
  { brand: 'NoName Shenzhen', name: 'Ultra Power MAX', ratings: [0], rel: 4 },
];
for (const b of PSU_BRANDS) {
  for (const w of [550, 750, 1000, 1300, 1600, 2000, 2400, 3600, 5000]) {
    for (const ri of b.ratings) {
      if (rng() < 0.35) continue;
      const r = RATINGS[ri];
      push({
        kind: 'PSU',
        brand: b.brand,
        name: `${b.name} ${w}W ${r.label}`,
        tier: Math.min(10, Math.round(w / 500)),
        price: (40 + w * 0.13) * r.mul * (b.rel > 3 ? 0.45 : 1) * jitter(0.08),
        watts: w,
        efficiency: b.rel > 3 ? 0.78 : r.eff,
        failureRate: 0.0001 * b.rel,
        description: b.rel > 3 ? 'Certifiée « ça devrait aller ». Extincteur non fourni.' : undefined,
      });
    }
  }
}

// ─── Cartes mères ───────────────────────────────────────────────────
const SOCKETS = ['LGA1200', 'LGA1700', 'LGA1851', 'AM4', 'AM5'];
const MOBO_BRANDS = ['MSIrène', 'Asus Rock', 'Gigabête', 'BioStarr'];
for (const socket of SOCKETS) {
  for (const brand of MOBO_BRANDS) {
    for (const slots of [1, 2, 4, 6, 8, 12]) {
      if (rng() < 0.55 && slots !== 1) continue;
      const mining = slots >= 6;
      push({
        kind: 'MOTHERBOARD',
        brand,
        name: `${mining ? 'BTC Edition' : slots === 1 ? 'Gaming' : 'Pro'} ${socket}-${slots}X`,
        tier: Math.min(10, slots),
        price: 70 + slots * 32 * jitter(0.15) + (socket === 'AM5' || socket === 'LGA1851' ? 60 : 0),
        watts: 30 + slots * 4,
        socket,
        gpuSlots: slots,
        hashrates: {},
        failureRate: 0.00012,
        description: mining ? 'Plein de slots PCIe x1, zéro RGB. Une vraie carte de mineur.' : undefined,
      });
    }
  }
}

// ─── Refroidissement ────────────────────────────────────────────────
const COOLING: Array<[string, string, number, number, number]> = [
  ['Ventilo de bureau', 'Tornado 3000', 350, 15, 25],
  ['Noctuïte', 'NH-U12S', 600, 6, 70],
  ['Noctuïte', 'NH-D15', 900, 8, 110],
  ['BeQuiet Pas', 'Dark Rock Pro 5', 950, 8, 105],
  ['Coolermaster-chef', 'Hyper 212', 550, 5, 40],
  ['Corsaire', 'H100i AIO', 1300, 18, 160],
  ['Corsaire', 'H150i Elite AIO', 1700, 22, 210],
  ['Arctique', 'Liquid Freezer III 420', 2000, 24, 190],
  ['NZXT-asy', 'Kraken Z73', 1600, 20, 250],
  ['EKWB-ouf', 'Custom Loop Quantum', 2800, 35, 520],
  ['EKWB-ouf', 'Custom Loop Quantum XXL', 4200, 55, 850],
  ['Huile de friture', "Bain d'immersion 200 L", 6500, 120, 1400],
  ['Huile de friture', "Bain d'immersion 1000 L", 14000, 300, 3900],
  ['Clim Carrefour', 'Mobile 9000 BTU', 3200, 900, 330],
  ['Clim pro', 'Split industriel 5 kW', 9000, 1800, 2100],
  ['Fenêtre ouverte', 'En plein hiver', 1100, 0, 0],
];
for (const [brand, name, cap, watts, price] of COOLING) {
  push({
    kind: 'COOLING',
    brand,
    name,
    tier: Math.min(10, Math.max(1, Math.round(cap / 1400))),
    price,
    watts,
    coolingW: cap,
    hashrates: {},
    failureRate: brand === 'Huile de friture' ? 0.0003 : 0.0001,
    description:
      brand === 'Fenêtre ouverte' ? 'Gratuit. Ta mère n’est pas d’accord.' : brand === 'Huile de friture' ? 'Odeur de frites garantie dans tout le quartier.' : undefined,
  });
}

// ─── Racks ──────────────────────────────────────────────────────────
const RACKS: Array<[string, string, number, number, number, string?]> = [
  ['Récup', 'Caisse en bois', 1, 0.8, 20, 'Trouvée derrière un supermarché.'],
  ['IKEA-ish', 'Étagère Kallax', 2, 0.9, 60, 'Montage : 3 h et une dispute.'],
  ['Rackmount', 'Open Frame 4 rigs', 4, 1.05, 180],
  ['Rackmount', 'Rack 12U ventilé', 6, 1.15, 450],
  ['Rackmount', 'Rack 24U pro', 10, 1.2, 1100],
  ['DataCentre & Fils', 'Baie 42U', 18, 1.25, 2600],
  ['DataCentre & Fils', 'Cage à air pulsé', 12, 1.4, 3200, 'Allée chaude / allée froide. Très sérieux.'],
  ['Tesla Mais Pas Trop', 'Container 40 pieds', 40, 1.2, 9000, 'Un conteneur maritime bourré de rigs. Classique.'],
];
for (const [brand, name, slots, airflow, price, description] of RACKS) {
  push({ kind: 'RACK', brand, name, tier: Math.min(10, slots), price, watts: 0, rackSlots: slots, airflow, hashrates: {}, failureRate: 0, description });
}

export const CATALOG = out;

export const FACILITY_TYPES = [
  { slug: 'chambre-ado', name: "Chambre d'ado", description: 'Gratuite. Électricité payée par tes parents… qui te refacturent cher.', price: 0, elecPrice: 2.4, maxPowerKw: 2, rackSlots: 1, ambientTemp: 24 },
  { slug: 'garage', name: 'Garage', description: 'Entre la tondeuse et le vélo jamais utilisé.', price: 2500, elecPrice: 1.8, maxPowerKw: 7, rackSlots: 3, ambientTemp: 28 },
  { slug: 'cave', name: 'Cave humide', description: 'Fraîche, mais un peu humide. Les composants n’adorent pas.', price: 6000, elecPrice: 1.8, maxPowerKw: 9, rackSlots: 4, ambientTemp: 14 },
  { slug: 'entrepot', name: 'Entrepôt', description: 'Zone industrielle, tarif pro.', price: 18000, elecPrice: 1.1, maxPowerKw: 35, rackSlots: 10, ambientTemp: 22 },
  { slug: 'centrale-charbon', name: 'Centrale à charbon désaffectée', description: "Électricité bradée. Il fait 38 °C à l'intérieur.", price: 70000, elecPrice: 0.45, maxPowerKw: 250, rackSlots: 40, ambientTemp: 38 },
  { slug: 'datacenter', name: 'Data-center Tier III', description: 'Redondance, sécurité, badge d’accès. Le luxe.', price: 120000, elecPrice: 0.7, maxPowerKw: 200, rackSlots: 40, ambientTemp: 18 },
  { slug: 'bunker-islandais', name: 'Bunker islandais', description: 'Géothermie gratuite et 4 °C dehors. Le graal.', price: 450000, elecPrice: 0.18, maxPowerKw: 800, rackSlots: 120, ambientTemp: 4 },
];

/** coin → algo, valeur de départ du $/MH/jour */
export const NETWORKS = [
  { symbol: 'BTCN', algo: 'SHA_MEME', usdPerMhDay: 0.012 },
  { symbol: 'DCC', algo: 'SCRYPT_LOL', usdPerMhDay: 0.9 },
  { symbol: 'MAMIE', algo: 'KEKHASH', usdPerMhDay: 2.2 },
  { symbol: 'KEBAB', algo: 'PROOF_OF_VIBE', usdPerMhDay: 3 },
];

export const POOLS = [
  { slug: 'bitmeme-pool', name: 'BitMeme Pool', symbol: 'BTCN', type: 'PPS', feeBps: 400, federation: 'Fédération Galactique', description: 'Le plus gros pool BTCN. Paiement fixe, frais salés.' },
  { slug: 'galactic-pplns', name: 'Galactic PPLNS', symbol: 'BTCN', type: 'PPLNS', feeBps: 200, federation: 'Fédération Galactique', description: 'Paiement à la chance du pool. Moins de frais.' },
  { slug: 'sololoto', name: 'SoloLoto', symbol: 'BTCN', type: 'SOLO', feeBps: 0, federation: null, description: 'Tu mines seul. Tu trouves un bloc, tu touches tout. Ou rien. Probablement rien.' },
  { slug: 'dogepool', name: 'DogePool', symbol: 'DCC', type: 'PPLNS', feeBps: 150, federation: 'Fédération Galactique', description: 'Wow. Such pool. Much hash.' },
  { slug: 'coincoin-pps', name: 'CoinCoin PPS', symbol: 'DCC', type: 'PPS', feeBps: 350, federation: 'Basse-cour', description: 'Stable comme un canard sur une mare.' },
  { slug: 'nid-douillet', name: 'Nid Douillet Finance', symbol: 'DCC', type: 'SHADY', feeBps: -300, federation: null, scamRisk: 0.03, description: '0 % de frais ET 3 % de bonus. Paiement toutes les 6 h. Que pourrait-il arriver ?' },
  { slug: 'mamie-pool', name: 'Mamie Pool', symbol: 'MAMIE', type: 'PPLNS', feeBps: 100, federation: 'Basse-cour', description: 'Comme mamie : lente mais fiable. Elle tricote tes parts.' },
  { slug: 'tricot-solo', name: 'Tricot Solo', symbol: 'MAMIE', type: 'SOLO', feeBps: 0, federation: null, description: 'Tout seul avec ses aiguilles.' },
  { slug: 'kebabminers', name: 'KebabMiners', symbol: 'KEBAB', type: 'PPS', feeBps: 300, federation: 'Basse-cour', description: 'Salade, tomate, oignon, hashrate.' },
  { slug: 'sauce-blanche', name: 'Pool Sauce Blanche', symbol: 'KEBAB', type: 'SHADY', feeBps: -500, federation: null, scamRisk: 0.05, description: '5 % de bonus. Le patron est « injoignable » depuis mardi.' },
] as const;

/** Fédérations : utiliser ≥ 3 pools d'une même fédération réduit leurs frais. */
export const FEDERATION_MIN_POOLS = 3;
export const FEDERATION_DISCOUNT_BPS = 100;
