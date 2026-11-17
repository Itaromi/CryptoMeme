import { type ErrorCode, isErrorCode, type TextParams } from '@cryptomeme/shared';

/**
 * Erreur d'un appel à l'API. `code` (stable) est traduit par le site (messages `errors`, voir `useErrorMessage`) ;
 * `message` est le texte français renvoyé par l'API, affiché en repli.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: ErrorCode | null = null,
    public params: TextParams = {},
  ) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

/** Appel API same-origin (proxy Next). Rafraîchit la session une fois sur 401. */
export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...rest,
    headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401 && retry && !path.startsWith('/auth/refresh') && !path.startsWith('/auth/login')) {
    if (await refresh()) return api<T>(path, init, false);
  }
  if (!res.ok) throw await apiError(res);
  return res.json() as Promise<T>;
}

/** Codes de repli quand l'API ne donne pas de code (erreurs du framework, du proxy…). */
const STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'TOO_MANY_REQUESTS',
  500: 'SERVER_ERROR',
  502: 'UNAVAILABLE',
  503: 'UNAVAILABLE',
  504: 'UNAVAILABLE',
};

/** Erreur d'une réponse de l'API : `{ code, message, params }`, `message` texte ou liste (NestJS), sinon le code HTTP. */
async function apiError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const raw: unknown = Array.isArray(o.message) ? (o.message as unknown[])[0] : o.message;
  const message = typeof raw === 'string' ? raw : `HTTP ${res.status}`;
  const code = isErrorCode(o.code) ? o.code : (STATUS_CODES[res.status] ?? null);
  const params = o.params && typeof o.params === 'object' ? (o.params as TextParams) : {};
  return new ApiError(res.status, message, code, params);
}
