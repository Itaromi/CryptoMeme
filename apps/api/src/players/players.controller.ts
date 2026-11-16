import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { z } from 'zod';
import { Category, CATEGORIES, PlayersService } from './players.service';
import { AuthUser, CurrentUser, Public } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from '../seasons/seasons.service';

const profileSchema = z.object({ bio: z.string().max(280).nullable() });

@Controller()
export class PlayersController {
  constructor(
    private readonly players: PlayersService,
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonsService,
  ) {}

  @Public()
  @Get('leaderboard')
  leaderboard(@Query('season') season?: string, @Query('category') category?: string) {
    const cat = (CATEGORIES as readonly string[]).includes(category ?? '') ? (category as Category) : 'general';
    return this.players.leaderboard(season ? Number(season) : undefined, cat);
  }

  @Public()
  @Get('seasons')
  seasonsList() {
    return this.prisma.season.findMany({ orderBy: { number: 'desc' }, select: { number: true, name: true, status: true, startsAt: true, endsAt: true } });
  }

  @Get('me/rank')
  async myRank(@CurrentUser() u: AuthUser) {
    const w = await this.seasons.wallet(u.id);
    return this.players.rankOf(w.id, w.seasonId, w.netWorth.toString());
  }

  @Patch('me/profile')
  async updateProfile(@CurrentUser() u: AuthUser, @Body(new ZodPipe(profileSchema)) body: { bio: string | null }) {
    await this.prisma.user.update({ where: { id: u.id }, data: { bio: body.bio } });
    return { ok: true };
  }

  @Public()
  @Get('players/:username')
  profile(@Param('username') username: string) {
    return this.players.profile(username);
  }
}
