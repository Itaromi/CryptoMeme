// Messages par espace de noms : un fichier JSON par partie du site et par langue.

import frCommon from './fr/common.json';
import frAuth from './fr/auth.json';
import frHome from './fr/home.json';
import frMarket from './fr/market.json';
import frStocks from './fr/stocks.json';
import frPortfolio from './fr/portfolio.json';
import frMining from './fr/mining.json';
import frBanks from './fr/banks.json';
import frEvents from './fr/events.json';
import frShop from './fr/shop.json';
import frAchievements from './fr/achievements.json';
import frLeaderboard from './fr/leaderboard.json';
import frProfile from './fr/profile.json';
import frCreate from './fr/create.json';
import frAdmin from './fr/admin.json';
import frNotifications from './fr/notifications.json';
import frErrors from './fr/errors.json';
import frGame from './fr/game.json';
import frCatalog from './fr/catalog.json';
import enCommon from './en/common.json';
import enAuth from './en/auth.json';
import enHome from './en/home.json';
import enMarket from './en/market.json';
import enStocks from './en/stocks.json';
import enPortfolio from './en/portfolio.json';
import enMining from './en/mining.json';
import enBanks from './en/banks.json';
import enEvents from './en/events.json';
import enShop from './en/shop.json';
import enAchievements from './en/achievements.json';
import enLeaderboard from './en/leaderboard.json';
import enProfile from './en/profile.json';
import enCreate from './en/create.json';
import enAdmin from './en/admin.json';
import enNotifications from './en/notifications.json';
import enErrors from './en/errors.json';
import enGame from './en/game.json';
import enCatalog from './en/catalog.json';
import type { ErrorCode } from '@cryptomeme/shared';
import type { Locale } from '@/i18n/config';

const fr = {
  common: frCommon,
  auth: frAuth,
  home: frHome,
  market: frMarket,
  stocks: frStocks,
  portfolio: frPortfolio,
  mining: frMining,
  banks: frBanks,
  events: frEvents,
  shop: frShop,
  achievements: frAchievements,
  leaderboard: frLeaderboard,
  profile: frProfile,
  create: frCreate,
  admin: frAdmin,
  notifications: frNotifications,
  // Textes venus de l'API (voir lib/texts.ts) : codes d'erreur, textes générés par le jeu, contenus du catalogue.
  // Chaque code d'erreur de l'API doit avoir sa traduction (sinon le typecheck échoue).
  errors: frErrors satisfies Record<ErrorCode, string>,
  game: frGame,
  catalog: frCatalog,
};

export type Messages = typeof fr;

// Typé par le français : une clé manquante en anglais fait échouer le typecheck.
const en: Messages = {
  common: enCommon,
  auth: enAuth,
  home: enHome,
  market: enMarket,
  stocks: enStocks,
  portfolio: enPortfolio,
  mining: enMining,
  banks: enBanks,
  events: enEvents,
  shop: enShop,
  achievements: enAchievements,
  leaderboard: enLeaderboard,
  profile: enProfile,
  create: enCreate,
  admin: enAdmin,
  notifications: enNotifications,
  errors: enErrors,
  game: enGame,
  catalog: enCatalog,
};

export const messages: Record<Locale, Messages> = { fr, en };
