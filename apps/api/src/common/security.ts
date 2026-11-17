import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { NextFunction, Request, Response } from 'express';

/** IP réelle du client : CF-Connecting-IP derrière Cloudflare (si activé), sinon l'IP résolue par Express (trust proxy). */
export function clientIp(req: Request): string {
  if (process.env.TRUST_CLOUDFLARE === 'true') {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf) return cf;
  }
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/** Limitation de débit par IP réelle (et non par l'IP du proxy, sinon tout le monde partagerait le même quota). */
@Injectable()
export class RealIpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(clientIp(req as unknown as Request));
  }

  protected getRequestResponse(context: ExecutionContext) {
    const http = context.switchToHttp();
    return { req: http.getRequest<Record<string, unknown>>(), res: http.getResponse<Record<string, unknown>>() };
  }
}

/**
 * Défense CSRF en profondeur (en plus des cookies SameSite=Lax) :
 * une requête qui modifie l'état et vient d'un navigateur doit provenir de notre propre origine.
 */
export function originGuard(allowed: string) {
  const origin = new URL(allowed).origin;
  return (req: Request, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const o = req.headers.origin;
    if (o && o !== origin) {
      res.status(403).json({ statusCode: 403, message: 'Origine refusée' });
      return;
    }
    // Les mutations sont en JSON : bloque les formulaires cross-site « simples »
    const ct = req.headers['content-type'];
    if (ct && !ct.startsWith('application/json')) {
      res.status(415).json({ statusCode: 415, message: 'Content-Type application/json attendu' });
      return;
    }
    next();
  };
}
