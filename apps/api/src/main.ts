import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { type Auth, BETTER_AUTH } from './auth/auth';
import { validateEnv } from './common/env';
import { originGuard } from './common/security';

async function bootstrap() {
  // Refuse de démarrer avec une configuration dangereuse (secrets faibles en prod, etc.)
  const env = validateEnv(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: env.NODE_ENV === 'production' ? ['log', 'warn', 'error'] : undefined,
  });
  // Derrière Caddy (+ tunnel Cloudflare) : nombre de proxys de confiance pour req.ip
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(
    helmet({
      // L'API ne sert que du JSON : politique stricte
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(originGuard(env.WEB_URL));
  // Better Auth (inscription, connexion, e-mails) : monté avant le parseur JSON, qui consommerait le corps
  app.getHttpAdapter().getInstance().all('/api/auth/{*any}', toNodeHandler(app.get<Auth>(BETTER_AUTH)));
  app.useBodyParser('json', { limit: '64kb' });
  app.enableCors({ origin: new URL(env.WEB_URL).origin, credentials: true });
  app.enableShutdownHooks();
  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`API CryptoMeme sur le port ${env.PORT} (${env.NODE_ENV})`);
}
bootstrap().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
