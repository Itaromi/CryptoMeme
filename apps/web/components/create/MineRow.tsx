'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { Glyph } from '@/lib/icons';
import { errorMessage, useApiMutation } from '@/lib/mutation';
import { queryKeys } from '@/lib/queryKeys';
import { Stat } from '@/components/ui/Stat';
import { PAYOUT_MAX_PCT } from './CreateForm';
import type { CreationConfig, CreationStatus, MyCreation } from './types';

const STATUS_CLS: Record<CreationStatus, string> = {
  PENDING: 'bg-acid text-ink',
  APPROVED: 'bg-up text-paper',
  REJECTED: 'bg-down text-paper',
};

/** Une de mes créations : statut, chiffres clés et réglage (dividende ou commission). */
export function MineRow({ c, cfg }: { c: MyCreation; cfg?: CreationConfig }) {
  const t = useTranslations('create.mine');
  const tc = useTranslations('common.actions');
  const f = useFormat();
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  const [val, setVal] = useState<string>(c.asset?.payout != null ? String(Math.round(c.asset.payout * 100)) : c.pool ? String(c.pool.feeBps) : '');
  const save = useApiMutation({
    mutationFn: (value: number) =>
      c.kind === 'COMPANY'
        ? api(`/creations/${c.id}/payout`, { method: 'PATCH', json: { payout: value / 100 } })
        : api(`/creations/${c.id}/pool-fee`, { method: 'PATCH', json: { feeBps: value } }),
    // le dividende s'affiche aussi sur la fiche de l'entreprise
    invalidate: [queryKeys.creations.mine, queryKeys.stocks],
  });
  const a = c.asset;
  const vest = a && Number(a.vestTotal) > 0 ? Number(a.vestDone) / Number(a.vestTotal) : 0;

  return (
    <li className="border-b border-line pb-5">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-3">
          <span className="grid size-10 place-items-center text-2xl" style={{ background: `color-mix(in oklch, ${c.color} 35%, transparent)` }}>
            <Glyph name={c.emoji} color={c.color} />
          </span>
          <span>
            {a ? <Link href={`/market/${a.symbol}`} className="font-bold hover:underline">{c.name}</Link> : <strong>{c.name}</strong>}
            <span className="block text-xs text-ink-2">
              {c.symbol ?? (c.pool ? t('pool', { type: c.pool.type, symbol: c.pool.symbol }) : t('poolShort'))}
            </span>
          </span>
        </p>
        <span className={`px-1.5 text-xs font-bold uppercase tracking-wider ${STATUS_CLS[c.status]}`}>{t(`status.${c.status}`)}</span>
      </div>
      {c.status === 'REJECTED' && <p className="mt-2 text-sm text-ink-2">{t('rejected', { reason: c.reviewNote ?? '' })}</p>}
      {c.status === 'PENDING' && <p className="mt-2 text-sm text-ink-2">{t('escrow', { amount: f.money(Number(c.fee) + Number(c.deposit)) })}</p>}
      {a && (
        <dl className="num mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Stat label={t('price')}>{f.price(a.price)}</Stat>
          <Stat label={t('holders')}>{f.number(a.holders)}</Stat>
          <Stat label={t('royalties')}>{f.money(Number(a.royaltiesPaid) + Number(a.royaltyAccrued))}</Stat>
          <Stat label={t('vested')}>
            {f.number(vest, { style: 'percent', maximumFractionDigits: 0 })}
            {vest < 1 && a.vestEnd && (
              <span className="block text-xs font-normal text-ink-2">{t('vestEnd', { when: format.relativeTime(new Date(a.vestEnd), now) })}</span>
            )}
          </Stat>
        </dl>
      )}
      {c.pool && (
        <dl className="num mt-3 grid grid-cols-3 gap-x-6 text-sm">
          <Stat label={t('rigs')}>{f.number(c.pool.rigs)}</Stat>
          <Stat label={t('earned')}>{f.number(c.pool.earned, { maximumFractionDigits: 4 })} {c.pool.symbol}</Stat>
          <Stat label={t('earnedValue')}>{f.money(c.pool.earnedValue)}</Stat>
        </dl>
      )}
      {c.status === 'APPROVED' && (c.kind === 'COMPANY' || c.kind === 'POOL') && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            {c.kind === 'COMPANY'
              ? t('payout', { pct: f.number(Number(val) / 100, { style: 'percent', maximumFractionDigits: 0 }) })
              : t('commission', { pct: f.pct(Number(val) / 10_000, false) })}
            <input
              type="range"
              min={0}
              max={c.kind === 'COMPANY' ? PAYOUT_MAX_PCT : (cfg?.costs.poolMaxFeeBps ?? 500)}
              step={c.kind === 'COMPANY' ? 5 : 25}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              className="accent-[var(--color-ink)]"
            />
          </label>
          <button className="font-semibold underline" disabled={save.isPending} onClick={() => save.mutate(Number(val))}>
            {tc('save')}
          </button>
          {save.isSuccess && <span className="text-ink-2">{t('saved')}</span>}
          {save.isError && <span className="text-down">{errorMessage(save.error)}</span>}
        </div>
      )}
    </li>
  );
}
