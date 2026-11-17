'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { ago, money, price } from '@/lib/format';
import { AdminMining } from '@/components/mining/AdminMining';
import { AdminStocks } from '@/components/AdminStocks';
import { AdminCreations } from '@/components/AdminCreations';
import { AdminEconomy } from '@/components/AdminEconomy';
import { Glyph } from '@/lib/icons';

const TABS = ['Économie', 'Joueurs', 'Créations', 'Actifs', 'Bourse', 'Minage', 'Événements & banques', 'Saisons', 'Audit'] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const { data: me, isLoading } = useMe();
  const [tab, setTab] = useState<Tab>('Économie');
  if (isLoading) return null;
  if (!me || (me.role !== 'ADMIN' && me.role !== 'MODERATOR')) return <p className="display text-4xl">Zone réservée.</p>;
  const isAdmin = me.role === 'ADMIN';
  return (
    <div className="rise">
      <h1 className="display mb-6 text-6xl font-extrabold">Salle de contrôle</h1>
      <div className="mb-8 flex flex-wrap gap-1 border-b-2 border-ink text-sm font-semibold" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-4 py-2 ${tab === t ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Économie' && <Overview />}
      {tab === 'Joueurs' && <Users isAdmin={isAdmin} />}
      {tab === 'Actifs' && <Assets isAdmin={isAdmin} />}
      {tab === 'Créations' && <AdminCreations />}
      {tab === 'Bourse' && <AdminStocks isAdmin={isAdmin} />}
      {tab === 'Minage' && <AdminMining isAdmin={isAdmin} />}
      {tab === 'Événements & banques' && <AdminEconomy isAdmin={isAdmin} />}
      {tab === 'Saisons' && <Seasons isAdmin={isAdmin} />}
      {tab === 'Audit' && <Audit />}
    </div>
  );
}

// ─── Économie ───────────────────────────────────────────────────────
function Overview() {
  const { data } = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api<Record<string, any>>('/admin/overview'), refetchInterval: 15_000 });
  if (!data) return null;
  const items: [string, string][] = [
    ['Comptes', String(data.users)],
    ['Joueurs actifs (saison)', String(data.players)],
    ['Cash total', money(data.totalCash)],
    ['Patrimoine total', money(data.totalNetWorth)],
    ['Création nette de valeur', money(data.netCreation)],
    ['Ordres 24 h', String(data.trades24h)],
    ['Volume 24 h', money(data.volume24h)],
    ['Frais 24 h (puits)', money(data.fees24h)],
    ['Événements marché 24 h', String(data.events24h)],
  ];
  return (
    <div>
      <p className="mb-6 text-ink-2">
        {data.season.name} · démarrée {ago(data.season.startsAt)}. La « création nette » compare le patrimoine total au capital distribué :
        très positive = les joueurs vident les pools, très négative = le marché est trop punitif.
      </p>
      <dl className="num grid gap-x-10 gap-y-6 sm:grid-cols-3">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs uppercase tracking-wider text-ink-2">{k}</dt>
            <dd className="text-2xl font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ─── Joueurs ────────────────────────────────────────────────────────
interface UserRow {
  id: string;
  email: string;
  username: string;
  role: string;
  bannedAt: string | null;
  banReason: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  cash: string | null;
  netWorth: string | null;
}

function Users({ isAdmin }: { isAdmin: boolean }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ['admin', 'users', q],
    queryFn: () => api<{ total: number; items: UserRow[] }>(`/admin/users?q=${encodeURIComponent(q)}`),
  });
  return (
    <div>
      <input className="field mb-4 max-w-md" placeholder="Rechercher email ou pseudo…" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="mb-2 text-sm text-ink-2">{data?.total ?? 0} comptes</p>
      <table className="num w-full text-left text-sm">
        <thead>
          <tr className="border-y-2 border-ink text-xs uppercase tracking-wider text-ink-2">
            <th className="py-2">Joueur</th>
            <th className="py-2">Email</th>
            <th className="py-2">Rôle</th>
            <th className="py-2 text-right">Patrimoine</th>
            <th className="py-2 text-right">Dernière connexion</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.items.map((u) => (
            <UserLine key={u.id} u={u} open={open === u.id} toggle={() => setOpen(open === u.id ? null : u.id)} isAdmin={isAdmin} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserLine({ u, open, toggle, isAdmin }: { u: UserRow; open: boolean; toggle: () => void; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ['admin', 'user', u.id],
    queryFn: () => api<{ ledger: Array<{ id: string; kind: string; assetId: string | null; delta: string; balanceAfter: string; memo: string | null; createdAt: string }>; sessions: Array<{ ip: string | null; userAgent: string | null; createdAt: string }> }>(`/admin/users/${u.id}`),
    enabled: open,
  });
  const act = async (path: string, body: object) => {
    setMsg(null);
    try {
      await api(`/admin/users/${u.id}/${path}`, { method: 'POST', json: body });
      setMsg('Fait.');
      setAmount('');
      qc.invalidateQueries({ queryKey: ['admin'] });
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <>
      <tr className={`border-b border-line ${u.bannedAt ? 'text-ink-3 line-through' : ''}`}>
        <td className="py-2 font-semibold">@{u.username}</td>
        <td className="py-2">
          {u.email} {!u.emailVerifiedAt && <span className="text-xs text-ink-3">(non vérifié)</span>}
        </td>
        <td className="py-2">{u.role}</td>
        <td className="py-2 text-right">{u.netWorth ? money(u.netWorth) : '—'}</td>
        <td className="py-2 text-right text-ink-2">{u.lastLoginAt ? ago(u.lastLoginAt) : '—'}</td>
        <td className="py-2 text-right">
          <button className="font-semibold underline" onClick={toggle}>{open ? 'Fermer' : 'Gérer'}</button>
        </td>
      </tr>
      {open && (
        <tr className="border-b-2 border-ink bg-paper-2">
          <td colSpan={6} className="p-4">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <input className="field" placeholder="Motif (obligatoire, tracé dans l'audit)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  {u.bannedAt ? (
                    <button className="btn bg-paper py-1.5 text-sm" disabled={reason.length < 3} onClick={() => act('unban', { reason })}>Débannir</button>
                  ) : (
                    <button className="btn bg-down py-1.5 text-sm text-paper" disabled={reason.length < 3} onClick={() => act('ban', { reason })}>Bannir</button>
                  )}
                </div>
                {u.bannedAt && <p className="text-sm text-down">Banni : {u.banReason}</p>}
                {isAdmin && (
                  <div className="flex gap-2">
                    <input className="field num" placeholder="Ajustement cash (ex. -500 ou 1000)" value={amount} onChange={(e) => setAmount(e.target.value)} />
                    <button className="btn bg-acid py-1.5 text-sm" disabled={reason.length < 5 || !/^-?\d+(\.\d{1,2})?$/.test(amount)} onClick={() => act('cash', { amount, reason })}>
                      Appliquer
                    </button>
                  </div>
                )}
                {msg && <p className="text-sm font-semibold">{msg}</p>}
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-widest">Sessions récentes</p>
                  <ul className="text-xs text-ink-2">
                    {detail.data?.sessions.slice(0, 6).map((s, i) => (
                      <li key={i}>{ago(s.createdAt)} · {s.ip} · {s.userAgent?.slice(0, 60)}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-widest">Grand livre (100 dernières écritures)</p>
                <div className="max-h-72 overflow-y-auto">
                  <table className="num w-full text-xs">
                    <tbody>
                      {detail.data?.ledger.map((l) => (
                        <tr key={l.id} className="border-b border-line">
                          <td className="py-1 text-ink-2">{ago(l.createdAt)}</td>
                          <td className="py-1">{l.kind}{l.assetId ? ' (actif)' : ''}</td>
                          <td className={`py-1 text-right ${Number(l.delta) >= 0 ? 'text-up' : 'text-down'}`}>{Number(l.delta).toLocaleString('fr-FR', { maximumFractionDigits: 8 })}</td>
                          <td className="py-1 text-right">{Number(l.balanceAfter).toLocaleString('fr-FR', { maximumFractionDigits: 8 })}</td>
                          <td className="py-1 pl-2 text-ink-2">{l.memo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Actifs ─────────────────────────────────────────────────────────
interface AdminAsset {
  symbol: string;
  name: string;
  tier: string;
  emoji: string;
  price: string;
  liquidity: string;
  params: Record<string, number>;
  state: { regime: string };
  frozen: boolean;
}

const PARAM_FIELDS: Array<[string, string]> = [
  ['volatility', 'Volatilité / jour'],
  ['meanReversion', 'Retour à la moyenne'],
  ['jumpIntensity', 'Sauts / jour'],
  ['rugRisk', 'Risque de rug / jour'],
  ['npcActivity', 'Activité PNJ'],
  ['herding', 'Effet troupeau'],
];

function Assets({ isAdmin }: { isAdmin: boolean }) {
  const { data } = useQuery({ queryKey: ['admin', 'assets'], queryFn: () => api<AdminAsset[]>('/admin/assets'), refetchInterval: 10_000 });
  return (
    <div className="space-y-4">
      {data?.map((a) => <AssetLine key={a.symbol} a={a} isAdmin={isAdmin} />)}
    </div>
  );
}

function AssetLine({ a, isAdmin }: { a: AdminAsset; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (extra: object = {}) => {
    const params = Object.fromEntries(Object.entries(edit).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
    try {
      await api(`/admin/assets/${a.symbol}`, { method: 'PATCH', json: { ...params, ...extra, reason } });
      setEdit({});
      setMsg('Enregistré.');
      qc.invalidateQueries({ queryKey: ['admin', 'assets'] });
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <div className="border-2 border-ink p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg font-bold">
          <Glyph name={a.emoji} /> {a.name} <span className="text-sm font-normal text-ink-2">{a.symbol} · {a.tier} · {a.state.regime}</span>
          {a.frozen && <span className="ml-2 bg-down px-1.5 text-sm text-paper">gelé</span>}
        </p>
        <p className="num text-sm">
          {price(a.price)} · liquidité {money(a.liquidity)}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {PARAM_FIELDS.map(([k, label]) => (
          <label key={k} className="text-xs">
            <span className="text-ink-2">{label}</span>
            <input
              className="field num py-1 text-sm"
              placeholder={String(a.params[k])}
              value={edit[k] ?? ''}
              disabled={!isAdmin}
              onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
      {isAdmin && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input className="field max-w-sm py-1.5 text-sm" placeholder="Motif" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn bg-acid py-1.5 text-sm" disabled={reason.length < 3 || !Object.values(edit).some(Boolean)} onClick={() => save()}>
            Enregistrer
          </button>
          <button className="btn bg-paper py-1.5 text-sm" disabled={reason.length < 3} onClick={() => save({ frozen: !a.frozen })}>
            {a.frozen ? 'Dégeler' : 'Geler le marché'}
          </button>
          {msg && <span className="self-center text-sm font-semibold">{msg}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Saisons ────────────────────────────────────────────────────────
function Seasons({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['seasons'], queryFn: () => api<Array<{ number: number; name: string; status: string; startsAt: string; endsAt: string | null }>>('/seasons') });
  const [name, setName] = useState('');
  const [cash, setCash] = useState('10000');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const active = data?.find((s) => s.status === 'ACTIVE');
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <ul className="divide-y divide-line">
        {data?.map((s) => (
          <li key={s.number} className="py-2">
            <span className="font-semibold">{s.name}</span>{' '}
            <span className="text-sm text-ink-2">
              {s.status === 'ACTIVE' ? 'en cours' : `terminée le ${new Date(s.endsAt!).toLocaleDateString('fr-FR')}`}
            </span>
          </li>
        ))}
      </ul>
      {isAdmin && active && (
        <div className="space-y-3 border-2 border-down p-5">
          <p className="font-bold">Clôturer « {active.name} » et lancer la suivante</p>
          <p className="text-sm text-ink-2">
            Le classement est figé et archivé. Chaque joueur repart avec le nouveau capital. Les marchés continuent. Irréversible.
          </p>
          <input className="field" placeholder="Nom de la nouvelle saison" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="field num" placeholder="Capital de départ" value={cash} onChange={(e) => setCash(e.target.value)} />
          <input className="field" placeholder="Motif" value={reason} onChange={(e) => setReason(e.target.value)} />
          <input className="field" placeholder={`Tape « ${active.number} » pour confirmer`} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <button
            className="btn bg-down text-paper"
            disabled={name.length < 3 || reason.length < 3 || confirm !== String(active.number)}
            onClick={async () => {
              try {
                await api('/admin/seasons/rollover', { method: 'POST', json: { name, startingCash: cash, reason } });
                setMsg('Nouvelle saison lancée.');
                qc.invalidateQueries();
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}
          >
            Lancer la nouvelle saison
          </button>
          {msg && <p className="text-sm font-semibold">{msg}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Audit ──────────────────────────────────────────────────────────
function Audit() {
  const { data } = useQuery({
    queryKey: ['admin', 'audit'],
    queryFn: () => api<Array<{ id: string; action: string; targetType: string; targetId: string; reason: string | null; payload: unknown; createdAt: string; actor: { username: string } }>>('/admin/audit'),
  });
  if (!data?.length) return <p className="text-ink-2">Aucune action admin pour l'instant.</p>;
  return (
    <table className="w-full text-left text-sm">
      <tbody>
        {data.map((a) => (
          <tr key={a.id} className="border-b border-line align-top">
            <td className="py-2 pr-4 text-ink-2">{ago(a.createdAt)}</td>
            <td className="py-2 pr-4 font-semibold">@{a.actor.username}</td>
            <td className="py-2 pr-4">{a.action}</td>
            <td className="py-2 pr-4 text-ink-2">{a.targetType} {a.targetId.slice(0, 10)}</td>
            <td className="py-2 pr-4">{a.reason}</td>
            <td className="num py-2 text-xs text-ink-3">{a.payload ? JSON.stringify(a.payload) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
