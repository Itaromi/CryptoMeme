import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Effets globaux des événements en cours (canicule, crise énergétique, pénurie…). */
export interface Modifiers {
  ambientDelta: number;
  elecMultiplier: number;
  hardwareMultiplier: number;
  failureMultiplier: number;
}

export const NEUTRAL: Modifiers = { ambientDelta: 0, elecMultiplier: 1, hardwareMultiplier: 1, failureMultiplier: 1 };

@Injectable()
export class ModifiersService {
  private cache: { value: Modifiers; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  invalidate() {
    this.cache = null;
  }

  async current(): Promise<Modifiers> {
    if (this.cache && Date.now() - this.cache.at < 20_000) return this.cache.value;
    const active = await this.prisma.gameEvent.findMany({ where: { status: 'ACTIVE' }, select: { params: true } });
    const m = { ...NEUTRAL };
    for (const e of active) {
      const p = e.params as Partial<Modifiers & { elecMultiplier: number; hardwareMultiplier: number }>;
      if (p.ambientDelta) m.ambientDelta += p.ambientDelta;
      if (p.elecMultiplier) m.elecMultiplier *= p.elecMultiplier;
      if (p.hardwareMultiplier) m.hardwareMultiplier *= p.hardwareMultiplier;
      if (p.failureMultiplier) m.failureMultiplier *= p.failureMultiplier;
    }
    this.cache = { value: m, at: Date.now() };
    return m;
  }
}

@Global()
@Module({ providers: [ModifiersService], exports: [ModifiersService] })
export class ModifiersModule {}
