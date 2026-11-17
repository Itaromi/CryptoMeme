export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
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
  if (!res.ok) throw new ApiError(res.status, await errorText(res));
  return res.json() as Promise<T>;
}

/** Message d'erreur renvoyé par l'API (NestJS : `message` texte ou liste), sinon le code HTTP. */
async function errorText(res: Response): Promise<string> {
  const fallback = `HTTP ${res.status}`;
  const body: unknown = await res.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('message' in body)) return fallback;
  const { message } = body;
  if (Array.isArray(message)) return typeof message[0] === 'string' ? message[0] : fallback;
  return typeof message === 'string' ? message : fallback;
}
