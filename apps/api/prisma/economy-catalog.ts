/** Banques et types d'événements (seed). Tout est ensuite réglable en admin. */

export const BANKS = [
  {
    slug: 'neo-gratos',
    name: 'Néo-Banque Gratos',
    description: 'Gratuite. Comme le café de la machine : on ne pose pas de questions.',
    color: '#94a3b8',
    monthlyFee: 0,
    openingFee: 0,
    minNetWorth: 0,
    tradingFeeBps: 30,
    isDefault: true,
  },
  {
    slug: 'credit-mutuel-agricole-bancaire',
    name: 'Crédit Mutuel Agricole Bancaire',
    description: 'Intérêts sur le cash et électricité moins chère. Un conseiller qui ne répond jamais.',
    color: '#16a34a',
    monthlyFee: 60,
    openingFee: 50,
    minNetWorth: 0,
    tradingFeeBps: 20,
    interestMonthly: 1.5,
    elecDiscount: 0.1,
  },
  {
    slug: 'bnp-parodibas',
    name: 'BNP Parodibas',
    description: 'Assurance matériel et protection anti-piratage. Le choix raisonnable. Trop raisonnable.',
    color: '#0f766e',
    monthlyFee: 200,
    openingFee: 250,
    minNetWorth: 20000,
    tradingFeeBps: 25,
    interestMonthly: 0.5,
    insuranceRate: 0.6,
    hackShield: 0.5,
  },
  {
    slug: 'banque-suisse-discrete',
    name: 'Banque Suisse Discrète',
    description: 'Optimisation fiscale et coffre-fort numérique. Nous ne savons pas qui vous êtes. Le fisc, si.',
    color: '#dc2626',
    monthlyFee: 600,
    openingFee: 1500,
    minNetWorth: 75000,
    tradingFeeBps: 15,
    interestMonthly: 0.3,
    taxShield: 0.6,
    hackShield: 0.8,
  },
  {
    slug: 'cryptobank-caimans',
    name: 'CryptoBank des Îles Caïmans',
    description: '0 frais de trading, 6 % par mois, électricité bradée. Garantie des dépôts : « on verra ».',
    color: '#0ea5e9',
    monthlyFee: 400,
    openingFee: 500,
    minNetWorth: 30000,
    tradingFeeBps: 0,
    interestMonthly: 6,
    elecDiscount: 0.25,
    failRiskPerDay: 0.015,
    depositGuarantee: 10000,
  },
];

type Mood = 'POSITIVE' | 'NEGATIVE' | 'MARKET';
export const EVENT_TYPES: Array<{
  slug: string;
  name: string;
  description: string;
  mood: Mood;
  ratePerDay: number;
  cooldownHours: number;
  noticeMinutes?: number;
  durationMinutes?: number;
  params?: Record<string, unknown>;
}> = [
  // ─── Fiscalité ────────────────────────────────────────────────────
  { slug: 'flat-tax', name: 'Flat tax', mood: 'NEGATIVE', ratePerDay: 0.35, cooldownHours: 48, noticeMinutes: 120,
    description: "L'État prélève {rate} % des plus-values réalisées ces dernières 24 h. Vendre avant ou après ? À toi de voir.",
    params: { rate: 30, windowHours: 24 } },
  { slug: 'wealth-tax', name: 'Impôt sur les riches', mood: 'NEGATIVE', ratePerDay: 0.25, cooldownHours: 72, noticeMinutes: 360,
    description: 'Taxe progressive sur le patrimoine : 2 % au-delà de 50 k$, 5 % au-delà de 200 k$, 10 % au-delà de 1 M$. Payée en cash.',
    params: { brackets: [[50000, 0.02], [200000, 0.05], [1000000, 0.1]] } },
  { slug: 'tax-audit', name: 'Contrôle fiscal', mood: 'NEGATIVE', ratePerDay: 0.2, cooldownHours: 48,
    description: "Le fisc s'intéresse aux clients des banques « discrètes ». Un sur deux écope d'une amende de {rate} % de son cash.",
    params: { rate: 10, chance: 0.5 } },
  { slug: 'tax-refund', name: "Remboursement d'impôts", mood: 'POSITIVE', ratePerDay: 0.15, cooldownHours: 72,
    description: "Erreur de calcul à Bercy : {rate} % des taxes payées cette semaine sont remboursées.",
    params: { rate: 20, windowDays: 7 } },

  // ─── Banques & piratage ───────────────────────────────────────────
  { slug: 'bank-hack', name: 'Piratage bancaire', mood: 'NEGATIVE', ratePerDay: 0.2, cooldownHours: 48,
    description: '{bank} s\'est fait pirater. Ses clients perdent entre {min} et {max} % de leur cash (moins la protection de la banque).',
    params: { min: 5, max: 15 } },
  { slug: 'wallet-hack', name: 'Vol de wallet', mood: 'NEGATIVE', ratePerDay: 0.5, cooldownHours: 12,
    description: 'Un hacker vide {rate} % d\'une crypto chez {count} joueur(s) au hasard. Fallait pas cliquer sur ce lien.',
    params: { rate: 25, count: 2 } },
  { slug: 'bank-run', name: 'Faillite bancaire', mood: 'NEGATIVE', ratePerDay: 0, cooldownHours: 24,
    description: '{bank} fait faillite. Les dépôts au-delà de la garantie perdent {rate} %. Les clients sont transférés à la banque gratuite.',
    params: { rate: 60 } },

  // ─── Cadeaux ──────────────────────────────────────────────────────
  { slug: 'airdrop', name: 'Airdrop surprise', mood: 'POSITIVE', ratePerDay: 0.4, cooldownHours: 24,
    description: 'Distribution gratuite de {symbol} : environ {usd} $ pour chaque joueur actif.',
    params: { usd: 150 } },
  { slug: 'inheritance', name: "Héritage d'un oncle d'Amérique", mood: 'POSITIVE', ratePerDay: 0.5, cooldownHours: 12,
    description: '{count} joueur(s) au hasard héritent de {min} à {max} $. Condoléances et félicitations.',
    params: { count: 2, min: 1000, max: 5000 } },
  { slug: 'exceptional-dividend', name: 'Dividende exceptionnel', mood: 'POSITIVE', ratePerDay: 0.3, cooldownHours: 24,
    description: 'Les détenteurs de {symbol} reçoivent {rate} % de la valeur de leur position en cash.',
    params: { rate: 3 } },

  // ─── Marché ───────────────────────────────────────────────────────
  { slug: 'bull-run', name: 'Bull run', mood: 'MARKET', ratePerDay: 0.15, cooldownHours: 72, noticeMinutes: 15,
    description: 'Euphorie générale : tout le marché passe en mode hype (+{pct} % de valeur juste).',
    params: { pct: 15 } },
  { slug: 'crash', name: 'Krach', mood: 'MARKET', ratePerDay: 0.12, cooldownHours: 72, noticeMinutes: 15,
    description: 'Panique sur les marchés : tout chute (−{pct} % de valeur juste).',
    params: { pct: 20 } },
  { slug: 'elon-tweet', name: 'Elon a tweeté', mood: 'MARKET', ratePerDay: 0.6, cooldownHours: 8,
    description: 'Un tweet à 3 h du matin fait bondir {symbol} de {pct} %.',
    params: { pct: 60, tiers: ['SHITCOIN', 'MID_CAP'] } },
  { slug: 'rug-pull', name: 'Rug pull organisé', mood: 'MARKET', ratePerDay: 0.2, cooldownHours: 48,
    description: 'Les devs de {symbol} sont partis avec la caisse. −{pct} %.',
    params: { pct: 85, tiers: ['SHITCOIN'] } },

  // ─── Minage ───────────────────────────────────────────────────────
  { slug: 'heat-wave', name: 'Canicule', mood: 'NEGATIVE', ratePerDay: 0.2, cooldownHours: 72, noticeMinutes: 60, durationMinutes: 720,
    description: '+{ambient} °C dans tous les locaux pendant 12 h. Les rigs mal refroidies vont souffrir.',
    params: { ambientDelta: 12 } },
  { slug: 'energy-crisis', name: 'Crise énergétique', mood: 'NEGATIVE', ratePerDay: 0.15, cooldownHours: 96, noticeMinutes: 60, durationMinutes: 1440,
    description: "L'électricité coûte {mult}× plus cher pendant 24 h.",
    params: { elecMultiplier: 2 } },
  { slug: 'gpu-shortage', name: 'Pénurie de GPU', mood: 'MARKET', ratePerDay: 0.15, cooldownHours: 96, durationMinutes: 1440,
    description: 'Le matériel coûte {mult}× plus cher (achat et revente) pendant 24 h. Bonne nouvelle pour ceux qui en ont déjà.',
    params: { hardwareMultiplier: 1.5 } },
  { slug: 'green-subsidy', name: 'Subvention minage vert', mood: 'POSITIVE', ratePerDay: 0.2, cooldownHours: 72, durationMinutes: 720,
    description: "L'électricité est à moitié prix pendant 12 h. Allumez tout !",
    params: { elecMultiplier: 0.5 } },
  { slug: 'solar-storm', name: 'Tempête solaire', mood: 'NEGATIVE', ratePerDay: 0.1, cooldownHours: 96, noticeMinutes: 30, durationMinutes: 240,
    description: 'Les composants tombent {mult}× plus souvent en panne pendant 4 h.',
    params: { failureMultiplier: 4 } },
];
