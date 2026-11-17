'use client';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/lib/format';
import type { Exposition } from './types';

const EXPO = [
  { key: 'crypto', color: 'var(--color-acid)' },
  { key: 'stocks', color: 'var(--color-up)' },
  { key: 'mining', color: 'var(--color-ink-2)' },
  { key: 'cash', color: 'var(--color-paper-3)' },
] as const satisfies ReadonlyArray<{ key: keyof Exposition; color: string }>;

/** Répartition du patrimoine par grande famille d'actifs. */
export function Exposure({ e }: { e: Exposition }) {
  const t = useTranslations('profile.exposure');
  const f = useFormat();
  const total = EXPO.reduce((a, x) => a + e[x.key], 0) || 1;
  return (
    <div>
      <div className="flex h-6 border-2 border-ink">
        {EXPO.map((x) => (e[x.key] > 0 ? <div key={x.key} style={{ width: `${(e[x.key] / total) * 100}%`, background: x.color }} title={t(x.key)} /> : null))}
      </div>
      <ul className="num mt-3 grid grid-cols-2 gap-1 text-sm">
        {EXPO.map((x) => (
          <li key={x.key} className="flex items-center gap-2">
            <span className="inline-block size-3 border border-ink" style={{ background: x.color }} aria-hidden />
            <span className="text-ink-2">{t(x.key)}</span>
            <span className="ml-auto font-semibold">{f.number(e[x.key] / total, { style: 'percent', maximumFractionDigits: 0 })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
