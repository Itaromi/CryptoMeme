'use client';
import type { Look } from '@/lib/meta';
import { Glyph } from '@/lib/icons';
import { useTexts } from '@/lib/texts';

const SIZES = {
  sm: { box: 'size-8 text-base', name: 'font-semibold', title: 'text-[11px]' },
  md: { box: 'size-12 text-2xl', name: 'text-lg font-bold', title: 'text-xs' },
  lg: { box: 'size-28 text-6xl', name: '', title: 'text-sm' },
} as const;

/** Avatar dans son cadre. */
export function Avatar({ look, size = 'sm' }: { look?: Look | null; size?: keyof typeof SIZES }) {
  return (
    <span className={`frame shrink-0 ${SIZES[size].box} ${look?.frame ? `frame-${look.frame}` : ''}`} aria-hidden>
      <Glyph name={look?.avatar ?? 'Smiley'} />
    </span>
  );
}

/** Pseudo avec effet. */
export function Name({ username, look, className = '' }: { username: string; look?: Look | null; className?: string }) {
  return <span className={`${look?.nameEffect ? `name-${look.nameEffect}` : ''} ${className}`}>@{username}</span>;
}

/** Avatar + pseudo + titre + badges : la « carte de visite » d'un joueur. */
export function PlayerTag({ username, look, size = 'sm' }: { username: string; look?: Look | null; size?: 'sm' | 'md' }) {
  const s = SIZES[size];
  const texts = useTexts();
  const title = texts.lookTitle(look);
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      <Avatar look={look} size={size} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <Name username={username} look={look} className={`truncate ${s.name}`} />
          {look?.badges.map((b) => (
            <span key={b.slug} title={texts.cosmetic(b)} className="text-sm leading-none"><Glyph name={b.icon} /></span>
          ))}
        </span>
        {title && <span className={`block uppercase tracking-widest text-ink-2 ${s.title}`}>{title}</span>}
      </span>
    </span>
  );
}
