import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { z } from 'zod';
import { CATEGORIES, PlayersService } from './players.service';
import { AuthUser, CurrentUser, Public } from '../common/auth.decorators';
import { optionalParam, ZodPipe } from '../common/zod.pipe';
import { SeasonsService } from '../seasons/seasons.service';

const profileSchema = z.object({ bio: z.string().max(280).nullable() });
const leaderboardQuery = z.object({
  season: optionalParam(z.coerce.number().int().min(1)),
  category: optionalParam(z.enum(CATEGORIES)).transform((c) => c ?? 'general'),
});

@Controller()
export class PlayersController {
  constructor(
    private readonly players: PlayersService,
    private readonly seasons: SeasonsService,
  ) {}

  @Public()
  @Get('leaderboard')
  leaderboard(@Query(new ZodPipe(leaderboardQuery)) q: z.infer<typeof leaderboardQuery>) {
    return this.players.leaderboard(q.season, q.category);
  }

  @Public()
  @Get('seasons')
  seasonsList() {
    return this.seasons.list();
  }

  @Get('me/rank')
  myRank(@CurrentUser() u: AuthUser) {
    return this.players.myRank(u.id);
  }

  @Patch('me/profile')
  updateProfile(@CurrentUser() u: AuthUser, @Body(new ZodPipe(profileSchema)) body: z.infer<typeof profileSchema>) {
    return this.players.updateBio(u.id, body.bio);
  }

  @Public()
  @Get('players/:username')
  profile(@Param('username') username: string) {
    return this.players.profile(username);
  }
}
