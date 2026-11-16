import { AssetTier } from '@prisma/client';

export interface CompanySeed {
  symbol: string;
  name: string;
  sector: string;
  ceo: string;
  tier: AssetTier;
  price: number;
  emoji: string;
  color: string;
  description: string;
  /** PER du secteur */
  pe: number;
  /** Part du bénéfice versée en dividende */
  payout: number;
  /** Croissance attendue du BPA par trimestre (log) */
  growth: number;
  /** Dispersion des résultats */
  epsVol: number;
  /** Multiplicateur de volatilité quotidienne du titre */
  volMul: number;
}

export const COMPANIES: CompanySeed[] = [
  { symbol: 'POMME', name: 'Pomme Inc.', sector: 'Tech', ceo: 'Tim Cuisse', tier: 'BLUE_CHIP', price: 189, emoji: '🍎', color: '#9ca3af', description: "Vend le même téléphone chaque année, un peu plus cher. Les fans font la queue quand même.", pe: 28, payout: 0.15, growth: 0.02, epsVol: 0.05, volMul: 1 },
  { symbol: 'MSFTE', name: 'Microsoftée', sector: 'Tech', ceo: 'Satya Nadelle', tier: 'BLUE_CHIP', price: 412, emoji: '🪟', color: '#38bdf8', description: "Votre ordinateur va redémarrer pour installer des mises à jour. Ne l'éteignez pas.", pe: 32, payout: 0.25, growth: 0.025, epsVol: 0.04, volMul: 0.9 },
  { symbol: 'TMPT', name: 'Tesla Mais Pas Trop', sector: 'Automobile', ceo: 'Elon Muskadet', tier: 'MID_CAP', price: 242, emoji: '🚗', color: '#ef4444', description: "Voitures autonomes livrées « l'an prochain » depuis 2016. Le PDG tweete à 3 h du matin.", pe: 60, payout: 0, growth: 0.03, epsVol: 0.22, volMul: 2.6 },
  { symbol: 'MCDB', name: 'McDouble Holdings', sector: 'Restauration', ceo: 'Ronald Mac', tier: 'BLUE_CHIP', price: 268, emoji: '🍔', color: '#facc15', description: "La machine à glaces est en panne. Elle l'a toujours été. Elle le sera toujours.", pe: 24, payout: 0.6, growth: 0.01, epsVol: 0.03, volMul: 0.7 },
  { symbol: 'LRMD', name: 'Leroy Merdelin', sector: 'Distribution', ceo: 'Jean-Bricole Leroy', tier: 'MID_CAP', price: 54, emoji: '🔨', color: '#22c55e', description: "Tout pour la maison, sauf un vendeur disponible au rayon visserie.", pe: 16, payout: 0.45, growth: 0.008, epsVol: 0.07, volMul: 1 },
  { symbol: 'AMZNT', name: "Amazon't", sector: 'E-commerce', ceo: 'Jeff Bezoss', tier: 'BLUE_CHIP', price: 178, emoji: '📦', color: '#f59e0b', description: "Livré demain. Le colis, pas forcément ce que vous avez commandé.", pe: 45, payout: 0, growth: 0.03, epsVol: 0.08, volMul: 1.2 },
  { symbol: 'NFLQ', name: 'Netflaque', sector: 'Médias', ceo: 'Reed Hastingue', tier: 'MID_CAP', price: 615, emoji: '🎬', color: '#dc2626', description: "Annule votre série préférée après une saison, puis augmente l'abonnement.", pe: 38, payout: 0, growth: 0.025, epsVol: 0.12, volMul: 1.6 },
  { symbol: 'NVDO', name: 'Nvidiot', sector: 'Semi-conducteurs', ceo: 'Jensen Blouson', tier: 'BLUE_CHIP', price: 128, emoji: '🟩', color: '#84cc16', description: "Vend des pelles pendant la ruée vers l'IA. Les pelles coûtent 40 000 $.", pe: 55, payout: 0.02, growth: 0.06, epsVol: 0.14, volMul: 1.8 },
  { symbol: 'LVMHEIN', name: 'LVMHein ?', sector: 'Luxe', ceo: 'Bernard Arnaque', tier: 'BLUE_CHIP', price: 702, emoji: '👜', color: '#a16207', description: "Un sac en toile à 3 000 €. La toile est d'excellente qualité.", pe: 26, payout: 0.4, growth: 0.012, epsVol: 0.06, volMul: 1 },
  { symbol: 'AFRAN', name: 'Air Franchement', sector: 'Transport', ceo: 'Benjamin Smithe', tier: 'MID_CAP', price: 11.4, emoji: '✈️', color: '#1d4ed8', description: "Votre vol est retardé pour cause de grève, de météo, ou parce que c'est mardi.", pe: 9, payout: 0.1, growth: 0, epsVol: 0.18, volMul: 1.9 },
  { symbol: 'TOTFOS', name: 'Total Fossiles', sector: 'Énergie', ceo: 'Patrick Pompé', tier: 'BLUE_CHIP', price: 61, emoji: '🛢️', color: '#f97316', description: "Investit massivement dans le vert. La couleur du logo, surtout.", pe: 8, payout: 0.55, growth: 0.005, epsVol: 0.1, volMul: 1.1 },
  { symbol: 'BOULG', name: 'Boulangerie Générale', sector: 'Agroalimentaire', ceo: 'Germaine Croûton', tier: 'MID_CAP', price: 23, emoji: '🥐', color: '#d97706', description: "Croissants industriels « faits maison ». Dividende aussi régulier que la fournée de 6 h.", pe: 14, payout: 0.7, growth: 0.006, epsVol: 0.04, volMul: 0.6 },
];

/** Repreneurs possibles lors d'une OPA. */
export const ACQUIRERS = [
  'le fonds Vautour Capital',
  'un émir très enthousiaste',
  'BlackRoche',
  'Warren Buffaitte',
  'un cousin de Bernard Arnaque',
  'le fonds souverain de Groland',
  'Softbank Pas Soft',
];

/** Brèves d'entreprise. {name} = société, {ceo} = PDG. Le signe donne le sens de la réaction. */
export const NEWS: Array<{ sign: 1 | -1; text: string }> = [
  { sign: 1, text: '{name} signe un contrat géant avec un client « très connu mais confidentiel ».' },
  { sign: 1, text: '{ceo} annonce un plan de rachat d’actions. Les actionnaires applaudissent.' },
  { sign: 1, text: 'Un analyste star relève sa cible sur {name} : « strong buy, voire très strong ».' },
  { sign: 1, text: '{name} dévoile un nouveau produit. Personne ne sait à quoi il sert, mais il y a de l’IA dedans.' },
  { sign: 1, text: '{name} intègre un indice prestigieux. Les fonds indiciels achètent sans réfléchir.' },
  { sign: 1, text: 'Rumeur : {name} serait courtisée par un géant du secteur.' },
  { sign: 1, text: '{ceo} promet « la meilleure année de notre histoire » sur un plateau télé.' },
  { sign: -1, text: '{name} rappelle 2 millions de produits pour « un léger risque d’explosion ».' },
  { sign: -1, text: 'Enquête de l’autorité de la concurrence sur {name}.' },
  { sign: -1, text: '{ceo} vend discrètement une grosse partie de ses actions. Hasard, sûrement.' },
  { sign: -1, text: 'Un analyste dégrade {name} : « on ne comprend plus leur stratégie ».' },
  { sign: -1, text: 'Grève générale chez {name}. La machine à café serait en cause.' },
  { sign: -1, text: '{name} victime d’une cyberattaque : le mot de passe était « admin1234 ».' },
  { sign: -1, text: '{ceo} tweete quelque chose de regrettable. Le service com’ démissionne.' },
];
