import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_KEY, ROLES_KEY } from './auth.decorators';

export const ACCESS_COOKIE = 'cm_at';
export const REFRESH_COOKIE = 'cm_rt';

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
    const req = ctx.switchToHttp().getRequest();
    const token: string | undefined = req.cookies?.[ACCESS_COOKIE];

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Non connecté');
    }
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      if (isPublic) return true;
      throw new UnauthorizedException('Session expirée');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, role: true, bannedAt: true },
    });
    if (!user) throw new UnauthorizedException();
    if (user.bannedAt) throw new ForbiddenException('Compte suspendu');
    req.user = { id: user.id, username: user.username, role: user.role };

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(user.role)) throw new ForbiddenException('Accès refusé');
    return true;
  }
}
