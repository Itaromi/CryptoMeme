'use client';
import Link from 'next/link';
import { useMe } from '@/lib/hooks';
import { TIER, useAchievements } from '@/lib/meta';
import { Glyph } from '@/lib/icons';

export default function AchievementsPage() {
  const { data } = useAchievements();
  const { data: me } = useMe();
  const got = data?.items.filter((i) => i.unlockedAt).length ?? 0;

  return (
    <div className="rise">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6 border-b-2 border-ink pb-6">
        <div>
          <h1 className="display text-6xl font-extrabold">Succès</h1>
          <p className="mt-2 max-w-xl text-ink-2">
            Certains se débloquent en gagnant, d’autres en perdant de façon spectaculaire. Les meilleurs offrent un cosmétique introuvable en
            boutique. Ils restent acquis d’une saison à l’autre.
          </p>
        </div>
        {me && data && (
          <p className="num text-right">
            <span className="display block text-7xl font-extrabold">{got}<span className="text-ink-3">/{data.items.length}</span></span>
            <span className="text-ink-2">débloqués</span>
          </p>
        )}
      </div>

      <ul className="grid gap-x-10 gap-y-2 md:grid-cols-2">
        {data?.items.map((a) => {
          const done = !!a.unlockedAt;
          return (
            <li key={a.slug} className={`flex items-start gap-4 border-b border-line py-4 ${done ? '' : 'text-ink-2'}`}>
              <span className={`grid size-14 shrink-0 place-items-center border-2 text-3xl ${done ? `border-ink ${TIER[a.tier].cls}` : 'border-dashed border-ink-3 opacity-60'}`} aria-hidden>
                <Glyph name={a.icon} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <strong className={`text-lg ${done ? 'text-ink' : ''}`}>{a.name}</strong>
                  <span className="text-xs font-semibold uppercase tracking-wider">{TIER[a.tier].label}</span>
                </p>
                <p className="text-sm">{a.description}</p>
                <p className="mt-1 text-xs text-ink-3">
                  {done ? `Débloqué le ${new Date(a.unlockedAt!).toLocaleDateString('fr-FR')}` : 'Pas encore'}
                  {' · '}
                  {a.rarity ? `${(a.rarity * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % des joueurs` : 'Personne pour l’instant'}
                  {a.rewardSlug && (
                    <>
                      {' · '}
                      <Link href="/shop" className="font-semibold text-ink underline">récompense en boutique</Link>
                    </>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {!me && (
        <p className="mt-8"><Link href="/register" className="font-semibold underline">Crée un compte</Link> pour commencer ta collection.</p>
      )}
    </div>
  );
}
