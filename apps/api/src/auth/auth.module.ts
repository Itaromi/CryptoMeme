import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { validateEnv } from '../common/env';
import { BETTER_AUTH, createAuth } from './auth';
import { MailService } from './mail.service';
import { MeController } from './me.controller';

@Module({
  controllers: [MeController],
  providers: [
    MailService,
    {
      provide: BETTER_AUTH,
      inject: [PrismaService, MailService],
      useFactory: (prisma: PrismaService, mail: MailService) => createAuth(prisma, mail, validateEnv(process.env)),
    },
  ],
  exports: [BETTER_AUTH],
})
export class AuthModule {}
