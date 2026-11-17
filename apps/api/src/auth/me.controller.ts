import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser } from '../common/auth.decorators';

/** Profil du joueur connecté. L'inscription, la connexion et les e-mails passent par Better Auth (/api/auth/*). */
@Controller('me')
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  me(@CurrentUser() u: AuthUser) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      select: { id: true, email: true, username: true, role: true, emailVerified: true, bio: true, createdAt: true },
    });
  }
}
