'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMe, usePortfolio } from '@/lib/hooks';
import { countdown } from '@/lib/economy';
import { money } from '@/lib/format';

type Kind = 'CRYPTO' | 'COMPANY' | 'POOL';

interface Config {
  costs: {
    CRYPTO: { fee: number; minDeposit: number; maxDeposit: number };
    COMPANY: { fee: number; minDeposit: number; maxDeposit: number };
    POOL: { fee: number };
    creatorShare: number;
    vestDays: number;
    royaltyShare: number;
    maxPerKind: number;
    poolMaxFeeBps: number;
  };
  sectors: Record<string, number>;
  networks: Array<{ symbol: string; name: string; emoji: string; algo: string }>;
}

interface Mine {
  id: string;
  kind: Kind;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  name: string;
  symbol: string | null;
  emoji: string;
  color: string;
  fee: string;
  deposit: string;
  reviewNote: string | null;
  createdAt: string;
  asset: null | {
    symbol: string;
    price: string;
    liquidity: string;
    holders: number;
    vestTotal: string;
    vestDone: string;
    vestEnd: string | null;
    royaltiesPaid: string;
    royaltyAccrued: string;
    payout: number | null;
    status: string | null;
  };
  pool: null | { symbol: string; type: string; feeBps: number; rigs: number; earned: string; earnedValue: number };
}

const TABS: Array<{ id: Kind; label: string; pitch: string }> = [
  { id: 'CRYPTO', label: 'Une crypto', pitch: 'Ton propre mème, coté face aux autres. Si ça prend, ta part prend de la valeur et tu touches des royalties sur chaque trade.' },
  { id: 'COMPANY', label: 'Une entreprise', pitch: 'Introduis ta boîte en Bourse : résultats trimestriels, dividendes que tu fixes, OPA… et faillite si ça tourne mal.' },
  { id: 'POOL', label: 'Un pool de minage', pitch: 'Les mineurs te rejoignent, tu prélèves ta commission sur chaque récompense. Trop gourmand, et ils vont ailleurs.' },
];

const STATUS: Record<Mine['status'], { label: string; cls: string }> = {
  PENDING: { label: 'En modération', cls: 'bg-acid text-ink' },
  APPROVED: { label: 'En ligne', cls: 'bg-up text-paper' },
  REJECTED: { label: 'Refusée', cls: 'bg-down text-paper' },
};

export default function CreatePage() {
  const { data: me } = useMe();
  const { data: cfg } = useQuery({ queryKey: ['creations', 'config'], queryFn: () => api<Config>('/creations/config') });
  const { data: mine } = useQuery({ queryKey: ['creations', 'mine'], queryFn: () => api<Mine[]>('/creations/mine'), enabled: !!me, refetchInterval: 30_000 });
  const [kind, setKind] = useState<Kind>('CRYPTO');

  return (
    <div className="rise">
      <h1 className="display text-[clamp(3rem,8vw,6.5rem)] font-extrabold">Crée ton empire</h1>
      <p className="mt-2 max-w-3xl text-lg text-ink-2">
        Lance ta crypto, introduis ton entreprise en Bourse ou monte ton pool de minage. Ça coûte cher, un modérateur valide le nom, et les
        règles empêchent de se servir dans la caisse :
      </p>
      {cfg && (
        <ul className="mt-4 grid max-w-4xl gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <li><strong>Liquidité verrouillée à vie</strong> dans le pool : pas de rug pull possible par le créateur.</li>
          <li><strong>Ta part : {cfg.costs.creatorShare * 100} %</strong> de l’offre, versée petit à petit sur {cfg.costs.vestDays} jours.</li>
          <li><strong>Royalties : {Math.round(cfg.costs.royaltyShare * 100)} % des frais</strong> payés par les autres joueurs qui tradent ton actif.</li>
          <li><strong>Refus = remboursement</strong> intégral des frais et du dépôt. {cfg.costs.maxPerKind} créations max par type.</li>
        </ul>
      )}

      <div className="mt-10 grid gap-12 lg:grid-cols-[1.2fr_1fr]">
        <section>
          <div className="mb-6 flex flex-wrap gap-1 text-sm font-semibold" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={kind === t.id} onClick={() => setKind(t.id)} className={`px-3 py-1.5 ${kind === t.id ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <p className="mb-6 max-w-xl text-ink-2">{TABS.find((t) => t.id === kind)?.pitch}</p>
          {cfg && (me ? <CreateForm key={kind} kind={kind} cfg={cfg} /> : <p><Link href="/login" className="font-semibold underline">Connecte-toi</Link> pour créer.</p>)}
        </section>

        <section>
          <h2 className="mb-4 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Mes créations</h2>
          {!mine?.length ? (
            <p className="text-ink-2">Rien pour l’instant. Les plus grands empires ont commencé par un mème.</p>
          ) : (
            <ul className="space-y-6">
              {mine.map((c) => <MineRow key={c.id} c={c} cfg={cfg} />)}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function CreateForm({ kind, cfg }: { kind: Kind; cfg: Config }) {
  const qc = useQueryClient();
  const { data: pf } = usePortfolio(true);
  const [f, setF] = useState({
    name: '',
    symbol: '',
    emoji: kind === 'POOL' ? '⛏️' : kind === 'COMPANY' ? '🏢' : '🐸',
    color: '#a3e635',
    description: '',
    price: kind === 'COMPANY' ? '50' : '0.01',
    deposit: String(kind === 'POOL' ? 0 : cfg.costs[kind].minDeposit),
    sector: 'Tech',
    payout: '30',
    network: cfg.networks[0]?.symbol ?? '',
    poolType: 'PPS',
    feeBps: '150',
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const fee = cfg.costs[kind].fee;
  const deposit = kind === 'POOL' ? 0 : Number(f.deposit) || 0;
  const total = fee + deposit;
  const cash = Number(pf?.cash ?? 0);
  const price = Number(f.price) || 0;
  const supply = kind !== 'POOL' && price > 0 ? deposit / price : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const common = { kind, name: f.name, emoji: f.emoji, color: f.color, description: f.description };
    const body =
      kind === 'POOL'
        ? { ...common, network: f.network, poolType: f.poolType, feeBps: Number(f.feeBps) }
        : kind === 'CRYPTO'
          ? { ...common, symbol: f.symbol, price, deposit }
          : { ...common, symbol: f.symbol, price, deposit, sector: f.sector, payout: Number(f.payout) / 100 };
    try {
      await api('/creations', { method: 'POST', json: body });
      setMsg({ ok: true, text: 'Demande envoyée ! Un modérateur va vérifier le nom. Frais et dépôt sont séquestrés en attendant.' });
      qc.invalidateQueries({ queryKey: ['creations', 'mine'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Aperçu de la fiche */}
      <div className="flex items-center gap-4 border-2 border-ink p-4">
        <span className="grid size-16 place-items-center text-4xl" style={{ background: `color-mix(in oklch, ${f.color} 35%, transparent)` }}>{f.emoji || '?'}</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-2">
            {kind === 'POOL' ? `Pool ${f.poolType} · ${f.network}` : `${f.symbol || 'SYMB'} · ${kind === 'COMPANY' ? f.sector : 'Crypto'}`}
          </p>
          <p className="display truncate text-3xl font-bold">{f.name || 'Ton nom ici'}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <Field label="Nom"><input className="field" required minLength={3} maxLength={40} value={f.name} onChange={set('name')} /></Field>
        {kind !== 'POOL' && (
          <Field label="Symbole"><input className="field uppercase" required pattern="[A-Za-z0-9]{2,8}" maxLength={8} value={f.symbol} onChange={set('symbol')} /></Field>
        )}
      </div>
      <div className="grid grid-cols-[100px_100px_1fr] gap-4">
        <Field label="Emoji"><input className="field text-center text-xl" required maxLength={8} value={f.emoji} onChange={set('emoji')} /></Field>
        <Field label="Couleur"><input type="color" className="field h-[46px] p-1" value={f.color} onChange={set('color')} /></Field>
      </div>
      <Field label="Description">
        <textarea className="field min-h-20" required minLength={10} maxLength={280} value={f.description} onChange={set('description')} placeholder="Le pitch. Fais rêver (ou rire) les investisseurs." />
      </Field>

      {kind !== 'POOL' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={kind === 'COMPANY' ? 'Prix d’introduction ($)' : 'Prix de départ ($)'}>
            <input className="field num" type="number" step="any" min={kind === 'COMPANY' ? 1 : 0.000001} max={1000} required value={f.price} onChange={set('price')} />
          </Field>
          <Field label={`Liquidité déposée ($, ${money(cfg.costs[kind].minDeposit)} – ${money(cfg.costs[kind].maxDeposit)})`}>
            <input className="field num" type="number" min={cfg.costs[kind].minDeposit} max={cfg.costs[kind].maxDeposit} required value={f.deposit} onChange={set('deposit')} />
          </Field>
        </div>
      )}
      {kind === 'COMPANY' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Secteur">
            <select className="field" value={f.sector} onChange={set('sector')}>
              {Object.entries(cfg.sectors).map(([s, pe]) => <option key={s} value={s}>{s} (PER {pe})</option>)}
            </select>
          </Field>
          <Field label={`Dividende : ${f.payout} % du bénéfice`}>
            <input type="range" min={0} max={80} step={5} value={f.payout} onChange={set('payout')} className="mt-3 w-full accent-[var(--color-ink)]" />
            <span className="text-xs text-ink-2">Plus tu distribues, moins tu réinvestis : croissance attendue plus faible.</span>
          </Field>
        </div>
      )}
      {kind === 'POOL' && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Réseau">
            <select className="field" value={f.network} onChange={set('network')}>
              {cfg.networks.map((n) => <option key={n.symbol} value={n.symbol}>{n.emoji} {n.symbol}</option>)}
            </select>
          </Field>
          <Field label="Type">
            <select className="field" value={f.poolType} onChange={set('poolType')}>
              <option value="PPS">PPS (revenu stable)</option>
              <option value="PPLNS">PPLNS (selon la chance)</option>
              <option value="SOLO">Solo (tout ou rien)</option>
            </select>
          </Field>
          <Field label={`Commission : ${(Number(f.feeBps) / 100).toFixed(2)} %`}>
            <input type="range" min={0} max={cfg.costs.poolMaxFeeBps} step={25} value={f.feeBps} onChange={set('feeBps')} className="mt-3 w-full accent-[var(--color-ink)]" />
          </Field>
        </div>
      )}

      <div className="num border-t-2 border-ink pt-4 text-sm">
        <div className="flex justify-between"><span className="text-ink-2">Frais de création (perdus)</span><span>{money(fee)}</span></div>
        {kind !== 'POOL' && (
          <>
            <div className="flex justify-between"><span className="text-ink-2">Liquidité (verrouillée dans le pool)</span><span>{money(deposit)}</span></div>
            <div className="flex justify-between"><span className="text-ink-2">Offre en circulation</span><span>{supply.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} unités</span></div>
            <div className="flex justify-between"><span className="text-ink-2">Ta part ({cfg.costs.creatorShare * 100} %, sur {cfg.costs.vestDays} j)</span><span>{(supply * cfg.costs.creatorShare).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} unités</span></div>
          </>
        )}
        <div className="mt-2 flex justify-between text-lg font-bold"><span>Total débité</span><span>{money(total)}</span></div>
        <p className={`text-right text-xs ${cash < total ? 'font-semibold text-down' : 'text-ink-2'}`}>Cash disponible : {money(cash)}</p>
      </div>

      <button className="btn bg-acid" disabled={busy || cash < total}>Envoyer en modération</button>
      {msg && <p className={`font-semibold ${msg.ok ? 'text-up' : 'text-down'}`}>{msg.text}</p>}
    </form>
  );
}

function MineRow({ c, cfg }: { c: Mine; cfg?: Config }) {
  const qc = useQueryClient();
  const [val, setVal] = useState<string>(c.asset?.payout != null ? String(Math.round(c.asset.payout * 100)) : c.pool ? String(c.pool.feeBps) : '');
  const [saved, setSaved] = useState<string | null>(null);
  const a = c.asset;
  const vest = a && Number(a.vestTotal) > 0 ? Number(a.vestDone) / Number(a.vestTotal) : 0;

  async function save() {
    setSaved(null);
    try {
      if (c.kind === 'COMPANY') await api(`/creations/${c.id}/payout`, { method: 'PATCH', json: { payout: Number(val) / 100 } });
      else await api(`/creations/${c.id}/pool-fee`, { method: 'PATCH', json: { feeBps: Number(val) } });
      setSaved('Enregistré.');
      qc.invalidateQueries({ queryKey: ['creations', 'mine'] });
    } catch (e) {
      setSaved((e as Error).message);
    }
  }

  return (
    <li className="border-b border-line pb-5">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-3">
          <span className="grid size-10 place-items-center text-2xl" style={{ background: `color-mix(in oklch, ${c.color} 35%, transparent)` }}>{c.emoji}</span>
          <span>
            {a ? <Link href={`/market/${a.symbol}`} className="font-bold hover:underline">{c.name}</Link> : <strong>{c.name}</strong>}
            <span className="block text-xs text-ink-2">{c.symbol ?? (c.pool ? `Pool ${c.pool.type} · ${c.pool.symbol}` : 'Pool')}</span>
          </span>
        </p>
        <span className={`px-1.5 text-xs font-bold uppercase tracking-wider ${STATUS[c.status].cls}`}>{STATUS[c.status].label}</span>
      </div>
      {c.status === 'REJECTED' && <p className="mt-2 text-sm text-ink-2">Motif : {c.reviewNote}. Remboursé.</p>}
      {c.status === 'PENDING' && <p className="mt-2 text-sm text-ink-2">{money(Number(c.fee) + Number(c.deposit))} séquestrés en attendant la décision.</p>}
      {a && (
        <dl className="num mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Item label="Cours">{money(a.price)}</Item>
          <Item label="Détenteurs">{a.holders}</Item>
          <Item label="Royalties">{money(Number(a.royaltiesPaid) + Number(a.royaltyAccrued))}</Item>
          <Item label="Ta part versée">
            {Math.round(vest * 100)} %{vest < 1 && a.vestEnd && <span className="block text-xs font-normal text-ink-2">fin dans {countdown(a.vestEnd)}</span>}
          </Item>
        </dl>
      )}
      {c.pool && (
        <dl className="num mt-3 grid grid-cols-3 gap-x-6 text-sm">
          <Item label="Rigs connectées">{c.pool.rigs}</Item>
          <Item label="Commission touchée">{Number(c.pool.earned).toLocaleString('fr-FR', { maximumFractionDigits: 4 })} {c.pool.symbol}</Item>
          <Item label="Valeur">{money(c.pool.earnedValue)}</Item>
        </dl>
      )}
      {c.status === 'APPROVED' && (c.kind === 'COMPANY' || c.kind === 'POOL') && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            {c.kind === 'COMPANY' ? `Dividende : ${val} %` : `Commission : ${(Number(val) / 100).toFixed(2)} %`}
            <input
              type="range"
              min={0}
              max={c.kind === 'COMPANY' ? 80 : (cfg?.costs.poolMaxFeeBps ?? 500)}
              step={c.kind === 'COMPANY' ? 5 : 25}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              className="accent-[var(--color-ink)]"
            />
          </label>
          <button className="font-semibold underline" onClick={save}>Enregistrer</button>
          {saved && <span className="text-ink-2">{saved}</span>}
        </div>
      )}
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-2">{label}</span>
      {children}
    </label>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink-2">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}
