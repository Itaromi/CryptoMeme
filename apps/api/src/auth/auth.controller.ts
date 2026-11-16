import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { LoginInput, RegisterInput, loginSchema, registerSchema } from '@cryptomeme/shared';
import { AuthService, REFRESH_TTL_MS } from './auth.service';
import { ZodPipe } from '../common/zod.pipe';
import { AuthUser, CurrentUser, Public } from '../common/auth.decorators';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../common/auth.guard';
import { PrismaService } from '../prisma/prisma.service';

const tokenSchema = z.object({ token: z.string().min(10) });
const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({ token: z.string().min(10), password: registerSchema.shape.password });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private meta(req: Request) {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  private setCookies(res: Response, s: { accessToken: string; refreshToken: string; accessTtlMs: number }) {
    const secure = this.config.get('NODE_ENV') === 'production';
    res.cookie(ACCESS_COOKIE, s.accessToken, { httpOnly: true, sameSite: 'lax', secure, maxAge: s.accessTtlMs, path: '/' });
    res.cookie(REFRESH_COOKIE, s.refreshToken, { httpOnly: true, sameSite: 'lax', secure, maxAge: REFRESH_TTL_MS, path: '/api/auth' });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body(new ZodPipe(registerSchema)) body: RegisterInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.setCookies(res, await this.auth.register(body, this.meta(req)));
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(@Body(new ZodPipe(loginSchema)) body: LoginInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.setCookies(res, await this.auth.login(body, this.meta(req)));
    return { ok: true };
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.setCookies(res, await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], this.meta(req)));
    return { ok: true };
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return { ok: true };
  }

  @Get('me')
  async me(@CurrentUser() u: AuthUser) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      select: { id: true, email: true, username: true, role: true, emailVerifiedAt: true, bio: true, createdAt: true },
    });
  }

  @Public()
  @HttpCode(200)
  @Post('verify-email')
  async verify(@Body(new ZodPipe(tokenSchema)) body: { token: string }) {
    await this.auth.verifyEmail(body.token);
    return { ok: true };
  }

  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @HttpCode(200)
  @Post('resend-verification')
  async resend(@CurrentUser() u: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!user.emailVerifiedAt) await this.auth.sendVerification(user.id, user.email);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @HttpCode(200)
  @Post('forgot-password')
  async forgot(@Body(new ZodPipe(forgotSchema)) body: { email: string }) {
    await this.auth.forgotPassword(body.email);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @HttpCode(200)
  @Post('reset-password')
  async reset(@Body(new ZodPipe(resetSchema)) body: { token: string; password: string }) {
    await this.auth.resetPassword(body.token, body.password);
    return { ok: true };
  }
}
