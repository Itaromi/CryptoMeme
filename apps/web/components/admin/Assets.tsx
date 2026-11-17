'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { AssetTier } from '@cryptomeme/shared';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { Glyph } from '@/lib/icons';
import { useApiMutation } from '@/lib/mutation';
import { queryKeys } from '@/lib/queryKeys';
import { Feedback } from './Feedback';

const PARAM_FIELDS = ['volatility', 'meanReversion', 'jumpIntensity', 'rugRisk', 'npcActivity', 'herding'] as const;
type ParamField = (typeof PARAM_FIELDS)[number];

interface AdminAsset {
  symbol: string;
  name: string;
  tier: AssetTier;
  emoji: string;
  price: string;
  liquidity: string;
  params: Partial<Record<ParamField, number>>;
  state: { regime: 'CALM' | 'NORMAL' | 'HYPE' | 'PANIC' };
  frozen: boolean;
}

/** Paramètres de simulation de chaque actif, et gel du marché. */
export function Assets({ isAdmin }: { isAdmin: boolean }) {
  const { data } = useQuery({ queryKey: queryKeys.admin.assets, queryFn: () => api<AdminAsset[]>('/admin/assets'), refetchInterval: 10_000 });
  return <div className="space-y-4">{data?.map((a) => <AssetLine key={a.symbol} a={a} isAdmin={isAdmin} />)}</div>;
}

function AssetLine({ a, isAdmin }: { a: AdminAsset; isAdmin: boolean }) {
  const t = useTranslations('admin.assets');
  const tc = useTranslations('common');
  const f = useFormat();
  const [edit, setEdit] = useState<Partial<Record<ParamField, string>>>({});
  const [reason, setReason] = useState('');
  const save = useApiMutation<{ frozen?: boolean }>({
    mutationFn: (extra) => {
      const params = Object.fromEntries(
        Object.entries(edit)
          .filter(([, v]) => v !== '')
          .map(([k, v]) => [k, Number(v)]),
      );
      return api(`/admin/assets/${a.symbol}`, { method: 'PATCH', json: { ...params, ...extra, reason } });
    },
    // le gel et les paramètres se voient aussi côté marché
    invalidate: [queryKeys.admin.assets, queryKeys.admin.audit, queryKeys.assets, queryKeys.asset(a.symbol)],
    onSuccess: () => setEdit({}),
  });
  return (
    <div className="border-2 border-ink p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg font-bold">
          <Glyph name={a.emoji} /> {a.name}{' '}
          <span className="text-sm font-normal text-ink-2">
            {a.symbol} · {tc(`tier.${a.tier}`)} · {tc(`regime.${a.state.regime}`)}
          </span>
          {a.frozen && <span className="ml-2 bg-down px-1.5 text-sm text-paper">{t('frozen')}</span>}
        </p>
        <p className="num text-sm">
          {f.price(a.price)} · {t('liquidity', { amount: f.money(a.liquidity) })}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {PARAM_FIELDS.map((k) => (
          <label key={k} className="text-xs">
            <span className="text-ink-2">{t(`params.${k}`)}</span>
            <input
              className="field num py-1 text-sm"
              placeholder={a.params[k] != null ? f.number(a.params[k], { maximumFractionDigits: 6 }) : ''}
              value={edit[k] ?? ''}
              disabled={!isAdmin}
              onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
      {isAdmin && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input className="field max-w-sm py-1.5 text-sm" placeholder={t('reason')} aria-label={t('reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn bg-acid py-1.5 text-sm" disabled={save.isPending || reason.length < 3 || !Object.values(edit).some(Boolean)} onClick={() => save.mutate({})}>
            {tc('actions.save')}
          </button>
          <button className="btn bg-paper py-1.5 text-sm" disabled={save.isPending || reason.length < 3} onClick={() => save.mutate({ frozen: !a.frozen })}>
            {a.frozen ? t('unfreeze') : t('freeze')}
          </button>
          <Feedback m={save} saved className="self-center text-sm font-semibold" />
        </div>
      )}
    </div>
  );
}
