'use client';
import { useTranslations } from 'next-intl';

/** Jours de la semaine, du lundi au dimanche (ordre des lignes renvoyées par l'API). */
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Ordres par jour et par heure (heure de Paris). */
export function Heatmap({ grid }: { grid: number[][] }) {
  const t = useTranslations('profile.heatmap');
  const max = Math.max(1, ...grid.flat());
  const total = grid.flat().reduce((a, b) => a + b, 0);
  if (!total) return <p className="text-sm text-ink-2">{t('empty')}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="num border-separate border-spacing-[2px] text-[10px]" aria-label={t('label')}>
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="w-4 font-normal text-ink-3">{h % 3 === 0 ? h : ''}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, d) => {
            const day = t(`days.${DAYS[d] ?? 'mon'}`);
            return (
              <tr key={d}>
                <th className="pr-1 text-left font-semibold text-ink-2">{day}</th>
                {row.map((n, h) => (
                  <td
                    key={h}
                    title={t('cell', { day, hour: h, count: n })}
                    className="size-4"
                    style={{ background: n ? `color-mix(in oklch, var(--color-ink) ${15 + (n / max) * 85}%, var(--color-paper))` : 'var(--color-paper-2)' }}
                  />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
