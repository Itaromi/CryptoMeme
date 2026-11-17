import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, PUBLIC_KEY, ROLES_KEY } from './auth.decorators';
import { apiError } from './errors';

export const ACCESS_COOKIE = 'cm_at';
export const REFRESH_COOKIE = 'cm_rt';

/** Requête HTTP après passage du guard. */
export type AuthRequest = Request & { user?: AuthUser };

/** Valeur d'un cookie (cookie-parser), uniquement si c'est une chaîne. */
export function readCookie(req: Request, name: string): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const v = cookies?.[name];
  return typeof v === 'string' ? v : undefined;
}

/** Guard global : JWT en cookie httpOnly + vérification du ban + rôles. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets);
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const token = readCookie(req, ACCESS_COOKIE);

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException(apiError('UNAUTHENTICATED', 'Non connecté'));
    }
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string }>(token);
    } catch {
      if (isPublic) return true;
      throw new UnauthorizedException(apiError('SESSION_EXPIRED', 'Session expirée'));
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, role: true, bannedAt: true },
    });
    if (!user) throw new UnauthorizedException(apiError('UNAUTHENTICATED', 'Non connecté'));
    if (user.bannedAt) throw new ForbiddenException(apiError('ACCOUNT_SUSPENDED', 'Compte suspendu', { reason: 'none' }));
    req.user = { id: user.id, username: user.username, role: user.role };

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(user.role)) throw new ForbiddenException(apiError('FORBIDDEN', 'Accès refusé'));
    return true;
  }
}
