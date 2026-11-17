'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ICON_GROUPS, type IconName } from '@cryptomeme/shared';
import { Glyph } from '@/lib/icons';

type Group = keyof typeof ICON_GROUPS;

/** Clé de message de chaque catégorie d'icônes (les clés de ICON_GROUPS sont des libellés français). */
const GROUP_KEY = {
  Finance: 'finance',
  Mèmes: 'memes',
  Animaux: 'animals',
  Bouffe: 'food',
  Industrie: 'industry',
  Têtes: 'faces',
} as const satisfies Record<Group, string>;
const GROUPS = Object.keys(GROUP_KEY).filter((g): g is Group => g in ICON_GROUPS);

/** Choix d'une icône dans la bibliothèque du jeu (par catégorie). */
export function IconPicker({ value, onChange, color }: { value: string; onChange: (v: IconName) => void; color: string }) {
  const t = useTranslations('create.iconGroups');
  const [group, setGroup] = useState<Group>(GROUPS.find((g) => (ICON_GROUPS[g] as readonly string[]).includes(value)) ?? 'Finance');
  return (
    <div className="border-2 border-ink">
      <div className="flex flex-wrap gap-1 border-b-2 border-ink p-1 text-xs font-semibold" role="tablist">
        {GROUPS.map((g) => (
          <button key={g} type="button" role="tab" aria-selected={group === g} onClick={() => setGroup(g)} className={`px-2 py-1 ${group === g ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}>
            {t(GROUP_KEY[g])}
          </button>
        ))}
      </div>
      <div className="grid max-h-44 grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1 overflow-y-auto p-2">
        {ICON_GROUPS[group].map((n) => (
          <button
            key={n}
            type="button"
            title={n}
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            className={`grid aspect-square place-items-center text-2xl ${value === n ? 'outline-2 outline-ink' : 'hover:bg-paper-2'}`}
            style={value === n ? { background: `color-mix(in oklch, ${color} 35%, transparent)` } : undefined}
          >
            <Glyph name={n} />
          </button>
        ))}
      </div>
    </div>
  );
}
