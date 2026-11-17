import { AchievementTier, CosmeticKind, Rarity } from '@prisma/client';

/** Avatars gratuits proposés à tous. */
export const AVATARS = ['Smiley', 'SmileyWink', 'SmileySticker', 'SmileyXEyes', 'SmileyMelting', 'SmileyNervous', 'SmileyAngry', 'Sunglasses', 'MaskHappy', 'Detective', 'Alien', 'Robot', 'Ghost', 'Skull', 'Dog', 'Cat', 'Bird', 'Butterfly', 'Horse', 'Rabbit'];

export interface CosmeticSeed {
  slug: string;
  kind: CosmeticKind;
  name: string;
  description: string;
  rarity: Rarity;
  /** null = récompense de succès uniquement */
  price: number | null;
  /** FRAME / BANNER / NAME_EFFECT : { style } (classe CSS côté web) · TITLE : { text } · BADGE : { icon } */
  data: { style?: string; text?: string; icon?: string };
}

const P: Record<Rarity, number> = { COMMON: 1_500, RARE: 6_000, EPIC: 25_000, LEGENDARY: 150_000 };

export const COSMETICS: CosmeticSeed[] = [
  // ── Cadres d'avatar
  { slug: 'frame-ink', kind: 'FRAME', name: 'Cadre encre', description: 'Sobre, efficace, comme un relevé bancaire.', rarity: 'COMMON', price: P.COMMON, data: { style: 'ink' } },
  { slug: 'frame-dotted', kind: 'FRAME', name: 'Pointillés', description: 'À découper le long des pointillés.', rarity: 'COMMON', price: P.COMMON, data: { style: 'dotted' } },
  { slug: 'frame-acid', kind: 'FRAME', name: 'Surligneur', description: 'Le jaune fluo des notes importantes.', rarity: 'RARE', price: P.RARE, data: { style: 'acid' } },
  { slug: 'frame-tape', kind: 'FRAME', name: 'Ruban de chantier', description: 'Zone de travaux : portefeuille en reconstruction.', rarity: 'RARE', price: P.RARE, data: { style: 'tape' } },
  { slug: 'frame-ticker', kind: 'FRAME', name: 'Bandeau boursier', description: 'Un cadre qui défile comme les cours.', rarity: 'EPIC', price: P.EPIC, data: { style: 'ticker' } },
  { slug: 'frame-gold', kind: 'FRAME', name: 'Lingot', description: 'Réservé aux millionnaires (vraiment).', rarity: 'LEGENDARY', price: null, data: { style: 'gold' } },
  { slug: 'frame-flames', kind: 'FRAME', name: 'Flammes', description: 'Souvenir de ta première rig carbonisée.', rarity: 'EPIC', price: null, data: { style: 'flames' } },
  { slug: 'frame-holo', kind: 'FRAME', name: 'Hologramme', description: 'Le cadre des baleines. Change de couleur avec la lumière.', rarity: 'LEGENDARY', price: P.LEGENDARY, data: { style: 'holo' } },

  // ── Bannières de profil
  { slug: 'banner-grid', kind: 'BANNER', name: 'Papier millimétré', description: 'Pour tracer ses courbes à la main.', rarity: 'COMMON', price: P.COMMON, data: { style: 'grid' } },
  { slug: 'banner-stripes', kind: 'BANNER', name: 'Rayures', description: 'Comme un costume de trader.', rarity: 'COMMON', price: P.COMMON, data: { style: 'stripes' } },
  { slug: 'banner-candles', kind: 'BANNER', name: 'Bougies vertes', description: 'Que du vert. Que du bonheur.', rarity: 'RARE', price: P.RARE, data: { style: 'candles' } },
  { slug: 'banner-red', kind: 'BANNER', name: 'Lundi noir', description: 'Pour ceux qui aiment souffrir.', rarity: 'RARE', price: P.RARE, data: { style: 'red' } },
  { slug: 'banner-tabloid', kind: 'BANNER', name: 'Une du journal', description: 'Ton nom en première page.', rarity: 'EPIC', price: P.EPIC, data: { style: 'tabloid' } },
  { slug: 'banner-podium', kind: 'BANNER', name: 'Podium', description: 'Offerte aux trois premiers du classement.', rarity: 'LEGENDARY', price: null, data: { style: 'podium' } },

  // ── Titres
  { slug: 'title-retail', kind: 'TITLE', name: 'Petit porteur', description: 'Le titre honnête.', rarity: 'COMMON', price: P.COMMON, data: { text: 'Petit porteur' } },
  { slug: 'title-hodler', kind: 'TITLE', name: 'HODLer', description: 'Ne vend jamais. Jamais.', rarity: 'COMMON', price: P.COMMON, data: { text: 'HODLer' } },
  { slug: 'title-exit', kind: 'TITLE', name: 'Exit liquidity', description: 'Quelqu’un doit bien acheter au sommet.', rarity: 'RARE', price: P.RARE, data: { text: 'Exit liquidity' } },
  { slug: 'title-influencer', kind: 'TITLE', name: 'Influenceur crypto', description: 'Code promo dans la bio.', rarity: 'RARE', price: P.RARE, data: { text: 'Influenceur crypto' } },
  { slug: 'title-wolf', kind: 'TITLE', name: 'Loup de Wall Street', description: 'Ou du moins de la rue d’à côté.', rarity: 'EPIC', price: P.EPIC, data: { text: 'Loup de Wall Street' } },
  { slug: 'title-whale', kind: 'TITLE', name: 'Baleine', description: 'Quand tu achètes, le marché tremble.', rarity: 'LEGENDARY', price: P.LEGENDARY, data: { text: 'Baleine' } },
  { slug: 'title-pyro', kind: 'TITLE', name: 'Pyromane', description: 'A mis le feu à sa propre ferme.', rarity: 'EPIC', price: null, data: { text: 'Pyromane' } },
  { slug: 'title-survivor', kind: 'TITLE', name: 'Survivant du rug', description: 'Était là. A tout vu. A tout perdu.', rarity: 'EPIC', price: null, data: { text: 'Survivant du rug' } },
  { slug: 'title-millionaire', kind: 'TITLE', name: 'Millionnaire', description: 'Un million de dollars imaginaires.', rarity: 'LEGENDARY', price: null, data: { text: 'Millionnaire' } },
  { slug: 'title-diamond', kind: 'TITLE', name: 'Mains de diamant', description: '−90 % et toujours là.', rarity: 'EPIC', price: null, data: { text: 'Mains de diamant' } },

  // ── Badges
  { slug: 'badge-rocket', kind: 'BADGE', name: 'Fusée', description: 'To the moon.', rarity: 'COMMON', price: P.COMMON, data: { icon: 'Rocket' } },
  { slug: 'badge-ape', kind: 'BADGE', name: 'Singe', description: 'Ape together strong.', rarity: 'COMMON', price: P.COMMON, data: { icon: 'HandFist' } },
  { slug: 'badge-bull', kind: 'BADGE', name: 'Taureau', description: 'Ça monte.', rarity: 'COMMON', price: P.COMMON, data: { icon: 'Cow' } },
  { slug: 'badge-bear', kind: 'BADGE', name: 'Ours', description: 'Ça descend.', rarity: 'COMMON', price: P.COMMON, data: { icon: 'TrendDown' } },
  { slug: 'badge-paper', kind: 'BADGE', name: 'Mains de papier', description: 'Assume.', rarity: 'RARE', price: P.RARE, data: { icon: 'ToiletPaper' } },
  { slug: 'badge-casino', kind: 'BADGE', name: 'Machine à sous', description: 'Ce n’est pas du trading, c’est du loisir.', rarity: 'RARE', price: P.RARE, data: { icon: 'DiceFive' } },
  { slug: 'badge-whale', kind: 'BADGE', name: 'Baleine', description: 'Gros portefeuille, gros ego.', rarity: 'EPIC', price: P.EPIC, data: { icon: 'Waves' } },
  { slug: 'badge-crown', kind: 'BADGE', name: 'Couronne', description: 'Le badge le plus cher du jeu. C’est tout.', rarity: 'LEGENDARY', price: P.LEGENDARY, data: { icon: 'Crown' } },
  { slug: 'badge-diamond', kind: 'BADGE', name: 'Diamant', description: 'Mains de diamant certifiées.', rarity: 'EPIC', price: null, data: { icon: 'Diamond' } },
  { slug: 'badge-fire', kind: 'BADGE', name: 'Feu', description: 'Ta rig a brûlé. Tu as gardé ce badge.', rarity: 'RARE', price: null, data: { icon: 'Fire' } },
  { slug: 'badge-pick', kind: 'BADGE', name: 'Pioche', description: 'Mineur confirmé.', rarity: 'RARE', price: null, data: { icon: 'Shovel' } },

  // ── Effets de pseudo
  { slug: 'name-underline', kind: 'NAME_EFFECT', name: 'Surligné', description: 'Ton pseudo au fluo.', rarity: 'COMMON', price: P.COMMON, data: { style: 'highlight' } },
  { slug: 'name-strike', kind: 'NAME_EFFECT', name: 'Raturé', description: 'Comme une ligne de crédit refusée.', rarity: 'RARE', price: P.RARE, data: { style: 'strike' } },
  { slug: 'name-glitch', kind: 'NAME_EFFECT', name: 'Glitch', description: 'Le serveur a planté pendant ton trade.', rarity: 'EPIC', price: P.EPIC, data: { style: 'glitch' } },
  { slug: 'name-wave', kind: 'NAME_EFFECT', name: 'Volatilité', description: 'Les lettres montent et descendent.', rarity: 'EPIC', price: P.EPIC, data: { style: 'wave' } },
  { slug: 'name-gold', kind: 'NAME_EFFECT', name: 'Plaqué or', description: 'Reflet doré de millionnaire.', rarity: 'LEGENDARY', price: null, data: { style: 'gold' } },
];

export interface AchievementSeed {
  slug: string;
  name: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  hidden?: boolean;
  rewardSlug?: string;
}

export const ACHIEVEMENTS: AchievementSeed[] = [
  // Trading
  { slug: 'first-trade', name: 'Premier ordre', description: 'Passer son premier ordre.', icon: 'CursorClick', tier: 'BRONZE' },
  { slug: 'hyperactive', name: 'Hyperactif', description: 'Passer 100 ordres dans une saison.', icon: 'Lightning', tier: 'SILVER' },
  { slug: 'big-volume', name: 'Gros bras', description: 'Atteindre 1 000 000 $ de volume échangé dans une saison.', icon: 'Barbell', tier: 'GOLD' },
  { slug: 'profit-10k', name: 'Ça paye', description: 'Encaisser 10 000 $ de plus-values dans une saison.', icon: 'Money', tier: 'SILVER' },
  { slug: 'big-win', name: 'Coup de maître', description: 'Gagner 5 000 $ sur une seule vente.', icon: 'Target', tier: 'GOLD' },
  { slug: 'big-loss', name: 'Aïe', description: 'Perdre 5 000 $ sur une seule vente.', icon: 'Skull', tier: 'BRONZE', hidden: true },
  { slug: 'diamond-hands', name: 'Mains de diamant', description: 'Garder une position à −90 % sans vendre.', icon: 'Diamond', tier: 'GOLD', rewardSlug: 'badge-diamond' },
  { slug: 'diamond-hands-title', name: 'Diamant pur', description: 'Garder une position à −95 % de plus de 1 000 $ de coût.', icon: 'Sparkle', tier: 'LEGENDARY', hidden: true, rewardSlug: 'title-diamond' },
  { slug: 'rug-survivor', name: 'Survivant du rug', description: 'Détenir une coin au moment de son rug pull.', icon: 'Parachute', tier: 'SILVER', rewardSlug: 'title-survivor' },
  // Patrimoine & classement
  { slug: 'first-100k', name: 'Six chiffres', description: 'Atteindre 100 000 $ de patrimoine.', icon: 'ChartLineUp', tier: 'SILVER' },
  { slug: 'first-million', name: 'Premier million', description: 'Atteindre 1 000 000 $ de patrimoine.', icon: 'Bank', tier: 'LEGENDARY', rewardSlug: 'title-millionaire' },
  { slug: 'millionaire-title', name: 'Double million', description: 'Atteindre 2 000 000 $ de patrimoine.', icon: 'Crown', tier: 'LEGENDARY', hidden: true, rewardSlug: 'name-gold' },
  { slug: 'gold-frame', name: 'Coffre-fort', description: 'Atteindre 5 000 000 $ de patrimoine.', icon: 'Vault', tier: 'LEGENDARY', hidden: true, rewardSlug: 'frame-gold' },
  { slug: 'podium', name: 'Podium', description: 'Être dans le top 3 du classement (10 joueurs minimum).', icon: 'Trophy', tier: 'GOLD', rewardSlug: 'banner-podium' },
  { slug: 'broke', name: 'Fauché', description: 'Tomber sous 100 $ de patrimoine.', icon: 'BatteryWarning', tier: 'BRONZE', hidden: true },
  // Minage
  { slug: 'first-rig', name: 'Mineur du dimanche', description: 'Monter sa première rig.', icon: 'Wrench', tier: 'BRONZE' },
  { slug: 'industrial', name: 'Ferme industrielle', description: 'Posséder 10 rigs en même temps.', icon: 'Factory', tier: 'GOLD', rewardSlug: 'badge-pick' },
  { slug: 'pyromane', name: 'Pyromane', description: 'Laisser une rig prendre feu.', icon: 'Fire', tier: 'SILVER', hidden: true, rewardSlug: 'title-pyro' },
  { slug: 'pyro-badge', name: 'Pompier volontaire', description: 'Survivre à 3 incendies dans une saison.', icon: 'FireExtinguisher', tier: 'GOLD', hidden: true, rewardSlug: 'badge-fire' },
  { slug: 'arsonist', name: 'Incendiaire en série', description: 'Cinq incendies dans une saison. Les assureurs ont ta photo.', icon: 'Bomb', tier: 'LEGENDARY', hidden: true, rewardSlug: 'frame-flames' },
  { slug: 'miner-10k', name: 'Ça creuse', description: 'Miner pour 10 000 $ de cryptos dans une saison.', icon: 'Shovel', tier: 'SILVER' },
  // Bourse
  { slug: 'shareholder', name: 'Actionnaire', description: 'Détenir une action.', icon: 'Scroll', tier: 'BRONZE' },
  { slug: 'rentier', name: 'Rentier', description: 'Toucher 500 $ de dividendes dans une saison.', icon: 'Couch', tier: 'SILVER' },
  { slug: 'takeover', name: 'Vendu au plus offrant', description: 'Être racheté lors d’une OPA.', icon: 'Handshake', tier: 'SILVER' },
  { slug: 'bankrupt', name: 'Ruiné par procuration', description: 'Détenir une action qui fait faillite.', icon: 'ChartLineDown', tier: 'BRONZE', hidden: true },
  // Banques & fiscalité
  { slug: 'premium', name: 'Compte premium', description: 'Ouvrir un compte dans une banque payante.', icon: 'CreditCard', tier: 'BRONZE' },
  { slug: 'offshore', name: 'Évadé fiscal', description: 'Ouvrir un compte à la Banque Suisse Discrète.', icon: 'Mountains', tier: 'GOLD' },
  { slug: 'taxpayer', name: 'Contribuable modèle', description: 'Payer 1 000 $ de taxes dans une saison.', icon: 'Receipt', tier: 'SILVER' },
  // Boutique
  { slug: 'fashion', name: 'Fashion victim', description: 'Posséder 5 cosmétiques.', icon: 'Tote', tier: 'SILVER' },
];
