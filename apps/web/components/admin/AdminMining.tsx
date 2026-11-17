'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { ALGO_LABEL, hash } from '@/lib/mining';
import { useApiMutation } from '@/lib/mutation';
import { queryKeys } from '@/lib/queryKeys';
import { Stat } from '@/components/ui/Stat';
import { Feedback } from './Feedback';

type PoolType = 'PPS' | 'PPLNS' | 'SOLO' | 'SHADY';

interface Network {
  symbol: string;
  algo: string;
  price: string;
  blockReward: string;
  npcHashrate: number;
  baseNpcHashrate: number;
  playerHashrate: number;
  halvingEveryDays: number;
  lastHalvingAt: string;
  totalMined: string;
}

/** Réponse de GET /admin/mining */
interface MiningOverview {
  networks: Network[];
  pools: Array<{ id: string; name: string; symbol: string; type: PoolType; feeBps: number; scamRisk: number; active: boolean; rigs: number }>;
  rigs: number;
  running: number;
  items: Partial<Record<'OK' | 'BROKEN' | 'DESTROYED', number>>;
  incidents24h: Record<string, number>;
}

/** Modification d'un réseau ou d'un pool (PATCH /admin/mining/<path>) ; le motif est ajouté au corps. */
interface MiningPatch {
  path: string;
  json: object;
}
type Save = (patch: MiningPatch) => void;

/** Réseaux de minage (récompense, difficulté PNJ, halving) et pools. */
export function AdminMining({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('admin.mining');
  const f = useFormat();
  const { data } = useQuery({ queryKey: queryKeys.admin.mining, queryFn: () => api<MiningOverview>('/admin/mining'), refetchInterval: 15_000 });
  const [reason, setReason] = useState('');
  const patch = useApiMutation<MiningPatch>({
    mutationFn: ({ path, json }) => api(`/admin/mining/${path}`, { method: 'PATCH', json: { ...json, reason } }),
    // vue admin et audit ; les joueurs voient réseaux et pools dans le minage
    invalidate: [queryKeys.admin.mining, queryKeys.admin.audit, queryKeys.mining.all],
  });
  if (!data) return null;
  const disabled = !isAdmin || reason.length < 3 || patch.isPending;
  const save: Save = (p) => patch.mutate(p);
  const incidents = Object.entries(data.incidents24h)
    .map(([k, v]) => `${k} ${f.number(v)}`)
    .join(' · ');
  return (
    <div className="space-y-10">
      <dl className="num grid gap-6 sm:grid-cols-4">
        <Stat label={t('stats.rigs')} size="lg">
          {f.number(data.running)} / {f.number(data.rigs)}
        </Stat>
        <Stat label={t('stats.components')}>
          {t('stats.componentsValue', { ok: data.items.OK ?? 0, broken: data.items.BROKEN ?? 0, destroyed: data.items.DESTROYED ?? 0 })}
        </Stat>
        <div className="sm:col-span-2">
          <Stat label={t('stats.incidents')}>
            {incidents || '—'}
          </Stat>
        </div>
      </dl>

      {isAdmin && <input className="field max-w-md" placeholder={t('reason')} aria-label={t('reason')} value={reason} onChange={(e) => setReason(e.target.value)} />}
      <p>
        <Feedback m={patch} saved />
      </p>

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest">{t('networks.title')}</h3>
        <div className="overflow-x-auto">
          <table className="num w-full text-left text-sm">
            <thead>
              <tr className="border-y-2 border-ink text-xs uppercase text-ink-2">
                <th className="py-2">{t('networks.columns.coin')}</th>
                <th>{t('networks.columns.price')}</th>
                <th>{t('networks.columns.reward')}</th>
                <th>{t('networks.columns.npc')}</th>
                <th>{t('networks.columns.players')}</th>
                <th>{t('networks.columns.halving')}</th>
                <th>{t('networks.columns.mined')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.networks.map((n) => (
                <NetworkRow key={n.symbol} n={n} disabled={disabled} save={save} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest">{t('pools.title')}</h3>
        <div className="overflow-x-auto">
          <table className="num w-full text-left text-sm">
            <tbody>
              {data.pools.map((p) => (
                <tr key={p.id} className="border-b border-line">
                  <td className="py-2 font-semibold">{p.name}</td>
                  <td>
                    {p.symbol} · {t(`pools.type.${p.type}`)}
                  </td>
                  <td>{t('pools.fee', { fee: f.number(p.feeBps / 10_000, { style: 'percent', maximumFractionDigits: 1 }) })}</td>
                  <td>{p.scamRisk ? t('pools.scamRisk', { risk: f.number(p.scamRisk, { style: 'percent', maximumFractionDigits: 0 }) }) : ''}</td>
                  <td>{t('pools.rigs', { count: p.rigs })}</td>
                  <td className="text-right">
                    <button className="py-1 font-semibold underline disabled:opacity-40" disabled={disabled} onClick={() => save({ path: `pools/${p.id}`, json: { active: !p.active } })}>
                      {p.active ? t('pools.disable') : t('pools.enable')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function NetworkRow({ n, disabled, save }: { n: Network; disabled: boolean; save: Save }) {
  const t = useTranslations('admin.mining.networks');
  const f = useFormat();
  const [reward, setReward] = useState('');
  const [npc, setNpc] = useState('');
  const [halving, setHalving] = useState('');
  const changed = reward || npc || halving;
  return (
    <tr className="border-b border-line">
      <td className="py-2 font-semibold">
        {n.symbol} <span className="text-xs font-normal text-ink-2">{ALGO_LABEL[n.algo] ?? n.algo}</span>
      </td>
      <td>{f.price(n.price)}</td>
      <td>
        <input
          className="field w-28 py-1 text-xs"
          placeholder={Number(n.blockReward).toPrecision(4)}
          aria-label={t('columns.reward')}
          value={reward}
          onChange={(e) => setReward(e.target.value)}
          disabled={disabled}
        />
      </td>
      <td>
        <input
          className="field w-28 py-1 text-xs"
          placeholder={n.baseNpcHashrate.toPrecision(4)}
          aria-label={t('columns.npc')}
          value={npc}
          onChange={(e) => setNpc(e.target.value)}
          disabled={disabled}
        />
        <span className="text-xs text-ink-2">{t('current', { hashrate: hash(n.npcHashrate, f) })}</span>
      </td>
      <td>{hash(n.playerHashrate, f)}</td>
      <td>
        <input
          className="field w-16 py-1 text-xs"
          placeholder={String(n.halvingEveryDays)}
          aria-label={t('columns.halving')}
          value={halving}
          onChange={(e) => setHalving(e.target.value)}
          disabled={disabled}
        />
      </td>
      <td>{f.number(n.totalMined, { maximumFractionDigits: 2 })}</td>
      <td>
        <button
          className="py-1 font-semibold underline disabled:opacity-40"
          disabled={disabled || !changed}
          onClick={() =>
            save({
              path: `networks/${n.symbol}`,
              json: {
                ...(reward ? { blockReward: reward } : {}),
                ...(npc ? { baseNpcHashrate: Number(npc) } : {}),
                ...(halving ? { halvingEveryDays: Number(halving) } : {}),
              },
            })
          }
        >
          {t('apply')}
        </button>
      </td>
    </tr>
  );
}
