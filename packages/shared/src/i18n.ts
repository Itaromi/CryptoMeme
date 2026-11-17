// ─── Textes traduisibles ────────────────────────────────────────────
// L'API ne fabrique plus de phrases : elle renvoie (ou stocke) une clé et des paramètres, et le site les traduit
// dans la langue du joueur. Les clés sont des chemins absolus des messages du site (« game.notif.dividend »,
// « catalog.facilities.garage.name »…). Le texte français reste fourni à côté, en repli.

/**
 * Valeur d'un paramètre : brute (texte, nombre utilisable dans un `plural`), ou à mettre en forme selon la langue
 * du joueur (montant, prix, quantité, pourcentage), ou sous-texte à traduire (`t`, avec repli si la clé est inconnue).
 */
export type TextParam =
  | string
  | number
  | { money: number }
  | { price: number }
  | { qty: number }
  | { pct: number }
  | TextRef;
export type TextParams = Record<string, TextParam>;

/** Sous-texte à traduire (clé absolue des messages du site), avec son repli français. */
// (alias de type plutôt qu'interface : sérialisable tel quel dans une colonne JSON Prisma)
export type TextRef = {
  t: string;
  fallback: string;
  params?: Record<string, string | number>;
};

/** Texte à traduire côté site. */
export type GameText = {
  key: string;
  params?: TextParams;
};

/** Constructeurs de paramètres mis en forme. */
export const param = {
  /** Montant en dollars fictifs */
  money: (v: number | string | { toString(): string }): TextParam => ({ money: Number(v.toString()) }),
  /** Prix d'un actif (précision adaptée aux tout petits prix) */
  price: (v: number | string | { toString(): string }): TextParam => ({ price: Number(v.toString()) }),
  /** Quantité d'un actif */
  qty: (v: number | string | { toString(): string }): TextParam => ({ qty: Number(v.toString()) }),
  /** Ratio affiché en pourcentage signé (0,05 → +5,00 %) */
  pct: (v: number): TextParam => ({ pct: v }),
  /** Sous-texte traduit (paramètres bruts uniquement), avec son texte français de repli */
  t: (key: string, fallback: string, params?: Record<string, string | number>): TextRef => (params ? { t: key, fallback, params } : { t: key, fallback }),
};

// ─── Erreurs ────────────────────────────────────────────────────────
/**
 * Codes d'erreur stables renvoyés par l'API (`{ code, message, params }`). Le site les traduit dans l'espace
 * de noms `errors` (une traduction manquante fait échouer le typecheck du site) ; `message` est le repli français.
 */
export const ERROR_CODES = [
  // Génériques
  'BAD_REQUEST',
  'NOT_FOUND',
  'FORBIDDEN',
  'TOO_MANY_REQUESTS',
  'SERVER_ERROR',
  'UNAVAILABLE',
  'ORIGIN_REFUSED',
  'JSON_REQUIRED',
  // Validation (schémas Zod)
  'VALIDATION_TOO_SMALL',
  'VALIDATION_TOO_BIG',
  'VALIDATION_INVALID',
  'ICON_UNKNOWN',
  'SYMBOL_FORMAT',
  'SECTOR_UNKNOWN',
  'USERNAME_MIN',
  'USERNAME_MAX',
  'USERNAME_CHARS',
  'EMAIL_INVALID',
  'PASSWORD_MIN',
  'PASSWORD_LETTER',
  'PASSWORD_DIGIT',
  'PASSWORD_REQUIRED',
  'AMOUNT_INVALID',
  'AMOUNT_POSITIVE',
  // Compte et session
  'UNAUTHENTICATED',
  'SESSION_EXPIRED',
  'SESSION_INVALID',
  'ACCOUNT_SUSPENDED',
  'EMAIL_TAKEN',
  'USERNAME_TAKEN',
  'BAD_CREDENTIALS',
  'INVALID_LINK',
  // Administration
  'CANNOT_BAN_SELF',
  'RATIO_REQUIRED',
  'BANK_REQUIRED',
  'BANK_UNKNOWN',
  'NO_EVENT_TARGET',
  'EVENT_ALREADY_OVER',
  'NEGATIVE_BALANCE',
  // Saisons et joueurs
  'NO_ACTIVE_SEASON',
  'SEASON_UNKNOWN',
  'PLAYER_NOT_FOUND',
  // Boutique et profil
  'ITEM_NOT_FOUND',
  'ITEM_NOT_FOR_SALE',
  'ITEM_ALREADY_OWNED',
  'AVATAR_UNKNOWN',
  'ITEM_NOT_OWNED',
  'BADGE_NOT_OWNED',
  'ACHIEVEMENT_LOCKED',
  // Banques
  'BANK_UNAVAILABLE',
  'BANK_ALREADY_CLIENT',
  'BANK_SWITCH_COOLDOWN',
  'BANK_MIN_NET_WORTH',
  'BANK_OPENING_FEE',
  // Marché et ordres
  'ASSET_UNKNOWN',
  'INTERVAL_INVALID',
  'ORDER_TOO_FAST',
  'ASSET_DELISTED',
  'MARKET_CLOSED',
  'ASSET_FROZEN',
  'MIN_ORDER',
  'INSUFFICIENT_CASH',
  'INSUFFICIENT_QTY',
  'SLIPPAGE_TOO_HIGH',
  'AMOUNT_ZERO',
  'AMOUNT_TOO_SMALL',
  'QTY_ZERO',
  // Bourse
  'STOCK_UNKNOWN',
  'NOT_A_STOCK',
  'TAKEOVER_NOT_ALLOWED',
  'NO_TAKEOVER',
  'ALREADY_DELISTED',
  'HOLDERS_LEFT',
  'ALREADY_LISTED',
  // Créations
  'CREATION_LIMIT',
  'NETWORK_UNKNOWN',
  'POOL_NAME_TAKEN',
  'SYMBOL_TAKEN',
  'CREATION_FUNDS',
  'REQUEST_NOT_FOUND',
  'CREATION_NOT_FOUND',
  'CREATION_NOT_YOURS',
  'CREATION_NOT_LIVE',
  'DIVIDEND_COMPANY_ONLY',
  'NOT_A_POOL',
  // Minage
  'PART_NOT_FOUND',
  'QTY_RANGE',
  'MODEL_UNAVAILABLE',
  'PART_IN_RIG',
  'RACK_NOT_EMPTY',
  'PART_DESTROYED',
  'PART_NOT_BROKEN',
  'FACILITY_UNKNOWN',
  'ONE_BEDROOM_ONLY',
  'FACILITY_HAS_RACKS',
  'FACILITY_NOT_FOUND',
  'FACILITY_FULL',
  'NOT_A_RACK',
  'RACK_BROKEN',
  'RACK_HAS_RIGS',
  'RACK_NOT_FOUND',
  'RACK_NOT_INSTALLED',
  'RACK_FULL',
  'PART_ALREADY_MOUNTED',
  'PART_OUT_OF_ORDER',
  'RACK_IN_RIG',
  'RIG_NOT_FOUND',
  'POOL_UNAVAILABLE',
  'RIG_RACK_NOT_INSTALLED',
  'RIG_PART_BROKEN',
  'POOL_REQUIRED',
  'NO_CASH_FOR_POWER',
  'POWER_OVERLOAD',
  // Montage d'une rig (moteur)
  'RIG_ONE_ASIC',
  'RIG_ASIC_ALONE',
  'RIG_ONE_MOBO',
  'RIG_ONE_CPU',
  'RIG_ONE_COOLING',
  'RIG_SOCKET',
  'RIG_TOO_MANY_GPUS',
  'RIG_ONE_PSU',
  'RIG_MAX_ONE_COOLING',
  'RIG_PSU_TOO_WEAK',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
export const isErrorCode = (v: unknown): v is ErrorCode => typeof v === 'string' && (ERROR_CODES as readonly string[]).includes(v);

/** Corps d'une erreur de l'API. */
export interface ApiErrorBody {
  code: ErrorCode;
  /** Texte français de repli (pour un client qui ne connaîtrait pas le code) */
  message: string;
  params?: TextParams;
}

/** Problème de validation tel que le décrit Zod (sous-ensemble utile, indépendant de la version). */
interface IssueLike {
  code: string;
  message: string;
  path: readonly PropertyKey[];
  minimum?: number | bigint;
  maximum?: number | bigint;
  origin?: string;
}

/**
 * Traduit un problème Zod en code d'erreur. Les schémas partagés donnent un code d'erreur comme message
 * (`.min(3, 'USERNAME_MIN')`) ; sinon le code découle du type de problème (trop court, trop grand, invalide).
 * Utilisé par l'API (réponse 400) et par le site (validation des formulaires avant envoi).
 */
export function issueError(issue: IssueLike): Omit<ApiErrorBody, 'message'> {
  const field = issue.path.map(String).join('.');
  if (isErrorCode(issue.message)) return { code: issue.message, params: { field } };
  const origin = issue.origin === 'string' || issue.origin === 'number' || issue.origin === 'array' ? issue.origin : 'other';
  if (issue.code === 'too_small' && issue.minimum !== undefined) return { code: 'VALIDATION_TOO_SMALL', params: { field, origin, min: Number(issue.minimum) } };
  if (issue.code === 'too_big' && issue.maximum !== undefined) return { code: 'VALIDATION_TOO_BIG', params: { field, origin, max: Number(issue.maximum) } };
  return { code: 'VALIDATION_INVALID', params: { field } };
}
