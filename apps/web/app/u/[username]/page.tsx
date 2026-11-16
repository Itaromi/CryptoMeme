'use client';
import { use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { money, pct, tone } from '@/lib/format';
import { NetWorthChart } from '@/components/NetWorthChart';

interface Profile {
  username: string;
  bio: string | null;
  joinedAt: string;
  role: string;
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
      <header className="grid gap-6 border-b-2 border-ink pb-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-ink-2">
            Joueur depuis le {new Date(data.joinedAt).toLocaleDateString('fr-FR')}
            {data.role !== 'PLAYER' && <span className="ml-2 bg-ink px-1.5 text-paper">{data.role === 'ADMIN' ? 'Admin' : 'Modo'}</span>}
          </p>
          <h1 className="display text-[clamp(3rem,9vw,7.5rem)] font-extrabold">@{data.username}</h1>
          <Bio bio={data.bio} editable={isMe} username={data.username} />
        </div>
        {s && (
          <div className="text-right">
            <p className="display text-8xl font-extrabold">#{s.rank}</p>
            <p className="text-ink-2">sur {s.players} joueurs · saison {data.season}</p>
          </div>
        )}
      </header>

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

          {s.mining.rigs > 0 && (
            <section>
              <h2 className="mb-4 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Minage</h2>
              <dl className="num grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
                <Stat label="Rigs" value={String(s.mining.rigs)} />
                <Stat label="Valeur minée (prix actuel)" value={money(s.mining.minedValue)} cls="text-up" />
                <Stat label="Facture d’électricité" value={money(s.mining.electricity)} cls="text-down" />
                <Stat label="Valeur du matériel" value={money(s.mining.hardwareValue)} />
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
