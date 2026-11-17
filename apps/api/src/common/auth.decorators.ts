import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
}

/** Joueur connecté (posé sur la requête par AuthGuard ; absent sur une route publique sans session). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;
});

export const PUBLIC_KEY = 'isPublic';
/** Route accessible sans être connecté. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
