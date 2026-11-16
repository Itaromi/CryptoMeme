'use client';
import { use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { money, pct, tone } from '@/lib/format';
import { NetWorthChart } from '@/components/NetWorthChart';
import { Avatar, Name } from '@/components/PlayerTag';
import { Look, PublicAchievement, TIER, useAchievements } from '@/lib/meta';
import Link from 'next/link';

interface Profile {
  username: string;
  bio: string | null;
  joinedAt: string;
  role: string;
  look: Look;
  achievements: { count: number; total: number; featured: PublicAchievement[]; recent: PublicAchievement[] };
  season: number;
  stats: null | {
    rank: number;
    players: number;
    netWorth: string;
    peakNetWorth: string;
    performance: number;
    trades: number;
    volume: number;
    fees: number;
    realizedPnl: number;
    winRate: number | null;
    bestTrade: number | null;
    worstTrade: number | null;
    favorite: string | null;
    maxDrawdown: number;
    sharpe: number | null;
    allocation: Array<{ symbol: string; emoji: string; color: string; value: number }>;
    mining: { rigs: number; minedValue: number; electricity: number; hardwareValue: number };
    history: Array<{ t: number; v: number }>;
    flows: { taxes: number; dividends: number; bankNet: number; events: number; shop: number };
    exposure: { crypto: number; stocks: number; mining: number; cash: number };
    heatmap: number[][];
  };
}

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { data, error } = useQuery({ queryKey: ['profile', username], queryFn: () => api<Profile>(`/players/${username}`) });
  const { data: me } = useMe();

  if (error) return <p className="display text-4xl">Ce joueur n'existe pas.</p>;
  if (!data) return <div className="h-96 animate-pulse bg-paper-2" />;
  const s = data.stats;
  const isMe = me?.username === data.username;
  const allocTotal = s?.allocation.reduce((a, b) => a + b.value, 0) || 1;

  return (
    <div className="rise space-y-12">
      <header className="border-2 border-ink">
        <div className={`banner h-36 border-b-2 border-ink sm:h-48 ${data.look.banner ? `banner-${data.look.banner}` : ''}`} />
        <div className="grid gap-6 px-5 pb-6 sm:px-8 md:grid-cols-[1fr_auto] md:items-end">
          <div className="-mt-16 min-w-0">
            <Avatar look={data.look} size="lg" />
            <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-ink-2">
              {data.look.title && <span className="mr-2 bg-ink px-1.5 text-paper">{data.look.title}</span>}
              Joueur depuis le {new Date(data.joinedAt).toLocaleDateString('fr-FR')}
              {data.role !== 'PLAYER' && <span className="ml-2 bg-ink px-1.5 text-paper">{data.role === 'ADMIN' ? 'Admin' : 'Modo'}</span>}
            </p>
            <h1 className="display break-words text-[clamp(2.75rem,8vw,6.5rem)] font-extrabold">
              <Name username={data.username} look={data.look} />
              {data.look.badges.map((b) => (
                <span key={b.name} title={b.name} className="ml-3 align-middle text-[0.5em]">{b.icon}</span>
              ))}
            </h1>
            <Bio bio={data.bio} editable={isMe} username={data.username} />
            {isMe && <Link href="/shop" className="mt-2 inline-block text-sm font-semibold underline">Personnaliser mon profil →</Link>}
          </div>
          {s && (
            <div className="text-right">
              <p className="display text-8xl font-extrabold">#{s.rank}</p>
              <p className="text-ink-2">sur {s.players} joueurs · saison {data.season}</p>
            </div>
          )}
        </div>
      </header>

      <Showcase data={data} isMe={isMe} />

      {!s ? (
        <p className="text-xl">Pas encore entré sur le marché cette saison.</p>
      ) : (
        <>
          <section className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-bold uppercase tracking-widest">Patrimoine</h2>
                <p className="num">
                  <span className="text-2xl font-bold">{money(s.netWorth)}</span>{' '}
                  <span className={`font-semibold ${tone(s.performance)}`}>{pct(s.performance)}</span>
                </p>
              </div>
              <NetWorthChart data={s.history} />
            </div>
            <div>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-widest">Portefeuille</h2>
              <ul className="space-y-2">
                {s.allocation
                  .sort((a, b) => b.value - a.value)
                  .map((a) => (
                    <li key={a.symbol} className="num">
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold">{a.emoji} {a.symbol}</span>
                        <span>{((a.value / allocTotal) * 100).toFixed(1)} %</span>
                      </div>
                      <div className="mt-1 h-2 bg-paper-2">
                        <div className="h-full" style={{ width: `${(a.value / allocTotal) * 100}%`, background: a.color }} />
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          </section>

          <section>
            <h2 className="mb-4 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Statistiques avancées</h2>
            <dl className="num grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="PnL réalisé" value={money(s.realizedPnl)} cls={tone(s.realizedPnl)} />
              <Stat label="Taux de réussite" value={s.winRate == null ? '—' : pct(s.winRate, false)} hint="Ventes clôturées en gain" />
              <Stat label="Meilleur trade" value={s.bestTrade == null ? '—' : money(s.bestTrade)} cls="text-up" />
              <Stat label="Pire trade" value={s.worstTrade == null ? '—' : money(s.worstTrade)} cls="text-down" />
              <Stat label="Ordres passés" value={String(s.trades)} />
              <Stat label="Volume échangé" value={money(s.volume)} />
              <Stat label="Frais payés" value={money(s.fees)} />
              <Stat label="Record de patrimoine" value={money(s.peakNetWorth)} />
              <Stat label="Drawdown max" value={pct(-s.maxDrawdown)} cls={s.maxDrawdown > 0.3 ? 'text-down' : ''} hint="Pire chute depuis un sommet" />
              <Stat label="Ratio de Sharpe" value={s.sharpe == null ? '—' : s.sharpe.toFixed(2)} hint="Rendement / risque, annualisé" />
              <Stat label="Crypto préférée" value={s.favorite ?? '—'} />
            </dl>
          </section>

          <section className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <h2 className="mb-4 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Exposition</h2>
              <Exposure e={s.exposure} />
              <h2 className="mt-10 mb-4 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Flux de la saison</h2>
              <dl className="num grid grid-cols-2 gap-x-8 gap-y-5">
                <Stat label="Taxes payées" value={money(s.flows.taxes)} cls={s.flows.taxes ? 'text-down' : ''} />
                <Stat label="Dividendes reçus" value={money(s.flows.dividends)} cls={s.flows.dividends ? 'text-up' : ''} />
                <Stat label="Banque (intérêts − frais)" value={money(s.flows.bankNet)} cls={tone(s.flows.bankNet)} />
                <Stat label="Événements & assurance" value={money(s.flows.events)} cls={tone(s.flows.events)} />
                <Stat label="Dépensé en boutique" value={money(s.flows.shop)} />
              </dl>
            </div>
            <div>
              <h2 className="mb-4 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Quand trade-t-il ?</h2>
              <Heatmap grid={s.heatmap} />
            </div>
          </section>

          {s.mining.rigs > 0 && (
            <section>
              <h2 className="mb-4 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Minage</h2>
              <dl className="num grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
                <Stat label="Rigs" value={String(s.mining.rigs)} />
                <Stat label="Valeur minée (prix actuel)" value={money(s.mining.minedValue)} cls="text-up" />
                <Stat label="Facture d’électricité" value={money(s.mining.electricity)} cls="text-down" />
                <Stat label="Valeur du matériel" value={money(s.mining.hardwareValue)} />
                <Stat
                  label="Rendement de l’électricité"
                  value={s.mining.electricity > 0 ? `${(s.mining.minedValue / s.mining.electricity).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} $ / $` : '—'}
                  hint="Valeur minée pour 1 $ d’électricité"
                />
              </dl>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, cls = '', hint }: { label: string; value: string; cls?: string; hint?: string }) {
  return (
    <div title={hint}>
      <dt className="text-xs uppercase tracking-wider text-ink-2">{label}</dt>
      <dd className={`text-xl font-semibold ${cls}`}>{value}</dd>
    </div>
  );
}

function Bio({ bio, editable, username }: { bio: string | null; editable: boolean; username: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(bio ?? '');
  const qc = useQueryClient();
  if (editing)
    return (
      <form
        className="mt-3 flex max-w-xl gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          await api('/me/profile', { method: 'PATCH', json: { bio: text.trim() || null } });
          qc.invalidateQueries({ queryKey: ['profile', username] });
          setEditing(false);
        }}
      >
        <input className="field" maxLength={280} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        <button className="btn bg-acid">OK</button>
      </form>
    );
  return (
    <p className="mt-3 max-w-xl text-lg text-ink-2">
      {bio || (editable ? 'Aucune bio. Raconte ta légende.' : '')}
      {editable && (
        <button className="ml-2 text-sm font-semibold text-ink underline" onClick={() => setEditing(true)}>
          Modifier
        </button>
      )}
    </p>
  );
}

const EXPO = [
  { key: 'crypto', label: 'Cryptos', color: 'var(--color-acid)' },
  { key: 'stocks', label: 'Actions', color: 'var(--color-up)' },
  { key: 'mining', label: 'Matériel', color: 'var(--color-ink-2)' },
  { key: 'cash', label: 'Cash', color: 'var(--color-paper-3)' },
] as const;

function Exposure({ e }: { e: Record<(typeof EXPO)[number]['key'], number> }) {
  const total = EXPO.reduce((a, x) => a + e[x.key], 0) || 1;
  return (
    <div>
      <div className="flex h-6 border-2 border-ink">
        {EXPO.map((x) => (e[x.key] > 0 ? <div key={x.key} style={{ width: `${(e[x.key] / total) * 100}%`, background: x.color }} title={x.label} /> : null))}
      </div>
      <ul className="num mt-3 grid grid-cols-2 gap-1 text-sm">
        {EXPO.map((x) => (
          <li key={x.key} className="flex items-center gap-2">
            <span className="inline-block size-3 border border-ink" style={{ background: x.color }} aria-hidden />
            <span className="text-ink-2">{x.label}</span>
            <span className="ml-auto font-semibold">{((e[x.key] / total) * 100).toFixed(0)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Ordres par jour et par heure (heure de Paris). */
function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  const total = grid.flat().reduce((a, b) => a + b, 0);
  if (!total) return <p className="text-sm text-ink-2">Aucun ordre pour l’instant.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="num border-separate border-spacing-[2px] text-[10px]" aria-label="Ordres par jour et par heure">
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="w-4 font-normal text-ink-3">{h % 3 === 0 ? h : ''}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, d) => (
            <tr key={d}>
              <th className="pr-1 text-left font-semibold text-ink-2">{DAYS[d]}</th>
              {row.map((n, h) => (
                <td
                  key={h}
                  title={`${DAYS[d]} ${h} h : ${n} ordre${n > 1 ? 's' : ''}`}
                  className="size-4"
                  style={{ background: n ? `color-mix(in oklch, var(--color-ink) ${15 + (n / max) * 85}%, var(--color-paper))` : 'var(--color-paper-2)' }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Vitrine de succès (le joueur choisit jusqu’à 4 succès à afficher). */
function Showcase({ data, isMe }: { data: Profile; isMe: boolean }) {
  const [editing, setEditing] = useState(false);
  const { data: all } = useAchievements();
  const qc = useQueryClient();
  const a = data.achievements;
  const unlocked = all?.items.filter((i) => i.unlockedAt) ?? [];
  const [pick, setPick] = useState<string[]>([]);

  async function save() {
    await api('/me/look', { method: 'PATCH', json: { showcase: pick } });
    qc.invalidateQueries({ queryKey: ['profile', data.username] });
    setEditing(false);
  }

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between border-b-2 border-ink pb-1">
        <h2 className="text-sm font-bold uppercase tracking-widest">
          Vitrine · {a.count}/{a.total} succès
        </h2>
        {isMe && !editing && unlocked.length > 0 && (
          <button className="text-sm font-semibold underline" onClick={() => { setPick(a.featured.map((f) => f.slug)); setEditing(true); }}>
            Choisir
          </button>
        )}
      </div>
      {editing ? (
        <div>
          <p className="mb-3 text-sm text-ink-2">Jusqu’à 4 succès ({pick.length}/4).</p>
          <div className="flex flex-wrap gap-2">
            {unlocked.map((u) => {
              const on = pick.includes(u.slug);
              return (
                <button
                  key={u.slug}
                  aria-pressed={on}
                  onClick={() => setPick(on ? pick.filter((x) => x !== u.slug) : [...pick, u.slug].slice(-4))}
                  className={`border-2 border-ink px-2 py-1 text-sm ${on ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}
                >
                  {u.icon} {u.name}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex gap-3">
            <button className="btn bg-acid py-1.5 text-sm" onClick={save}>Enregistrer</button>
            <button className="text-sm underline" onClick={() => setEditing(false)}>Annuler</button>
          </div>
        </div>
      ) : !a.featured.length ? (
        <p className="text-ink-2">{isMe ? 'Aucun succès pour l’instant. ' : 'Aucun succès pour l’instant.'}{isMe && <Link href="/achievements" className="font-semibold text-ink underline">Voir la liste</Link>}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {a.featured.map((f) => (
            <li key={f.slug} className={`border-2 border-ink p-4 ${TIER[f.tier].cls}`}>
              <span className="text-4xl" aria-hidden>{f.icon}</span>
              <p className="mt-2 font-bold">{f.name}</p>
              <p className="text-sm opacity-80">{f.description}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
