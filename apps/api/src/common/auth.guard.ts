import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { type Auth, BETTER_AUTH } from '../auth/auth';
import { AuthUser, PUBLIC_KEY, ROLES_KEY } from './auth.decorators';
import { apiError } from './errors';

/** Requête HTTP après passage du guard. */
export type AuthRequest = Request & { user?: AuthUser };

/** Guard global : session Better Auth (cookie httpOnly) + vérification du ban + rôles. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(BETTER_AUTH) private readonly auth: Auth,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets);
    const req = ctx.switchToHttp().getRequest<AuthRequest>();

    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) {
      if (isPublic) return true;
      throw new UnauthorizedException(apiError('UNAUTHENTICATED', 'Non connecté'));
    }
    const user = await this.prisma.user.findUnique({
      where: { id: session.user.id },
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
