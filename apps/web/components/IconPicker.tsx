'use client';
import { useState } from 'react';
import { ICON_GROUPS, type IconName } from '@cryptomeme/shared';
import { Glyph } from '@/lib/icons';

/** Choix d'une icône dans la bibliothèque du jeu (par catégorie). */
export function IconPicker({ value, onChange, color }: { value: string; onChange: (v: IconName) => void; color: string }) {
  const groups = Object.keys(ICON_GROUPS) as Array<keyof typeof ICON_GROUPS>;
  const [group, setGroup] = useState<keyof typeof ICON_GROUPS>(groups.find((g) => (ICON_GROUPS[g] as readonly string[]).includes(value)) ?? 'Finance');
  return (
    <div className="border-2 border-ink">
      <div className="flex flex-wrap gap-1 border-b-2 border-ink p-1 text-xs font-semibold" role="tablist">
        {groups.map((g) => (
          <button key={g} type="button" role="tab" aria-selected={group === g} onClick={() => setGroup(g)} className={`px-2 py-1 ${group === g ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}>
            {g}
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
