'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { type CreationInput, creationSchema } from '@cryptomeme/shared';
import { api } from '@/lib/api';
import { usePortfolio } from '@/lib/hooks';
import { useFormat } from '@/lib/format';
import { Glyph } from '@/lib/icons';
import { useApiMutation } from '@/lib/mutation';
import { useTexts } from '@/lib/texts';
import { queryKeys } from '@/lib/queryKeys';
import { IconPicker } from '@/components/IconPicker';
import { LabeledField } from '@/components/ui/LabeledField';
import type { CreationConfig, Kind, PoolType } from './types';

export const POOL_TYPES: readonly PoolType[] = ['PPS', 'PPLNS', 'SOLO'];
/** Plafond du dividende d'une entreprise, en %, tiré du schéma partagé (0,8 → 80 %). */
export const PAYOUT_MAX_PCT = Math.round((creationSchema.options[1].shape.payout.maxValue ?? 0) * 100);

/** Formulaire de demande de création, validé avec le schéma partagé avant envoi. */
export function CreateForm({ kind, cfg }: { kind: Kind; cfg: CreationConfig }) {
  const texts = useTexts();
  const errorMessage = texts.error;
  const t = useTranslations('create.form');
  const f = useFormat();
  const { data: pf } = usePortfolio(true);
  const [v, setV] = useState({
    name: '',
    symbol: '',
    emoji: kind === 'POOL' ? 'Shovel' : kind === 'COMPANY' ? 'Buildings' : 'Coin',
    color: '#a3e635',
    description: '',
    price: kind === 'COMPANY' ? '50' : '0.01',
    deposit: String(cfg.costs[kind].minDeposit),
    sector: 'Tech',
    payout: '30',
    network: cfg.networks[0]?.symbol ?? '',
    feeBps: '150',
  });
  const [poolType, setPoolType] = useState<PoolType>('PPS');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });

  // Frais et dépôt sont débités (séquestrés) tout de suite
  const create = useApiMutation({
    mutationFn: (input: CreationInput) => api('/creations', { method: 'POST', json: input }),
    invalidate: [queryKeys.creations.mine, queryKeys.portfolio],
  });

  const fee = cfg.costs[kind].fee;
  const deposit = kind === 'POOL' ? 0 : Number(v.deposit) || 0;
  const total = fee + deposit;
  const cash = Number(pf?.cash ?? 0);
  const price = Number(v.price) || 0;
  const supply = kind !== 'POOL' && price > 0 ? deposit / price : 0;
  const share = (r: number) => f.number(r, { style: 'percent', maximumFractionDigits: 0 });
  const units = (n: number) => t('summary.units', { amount: f.number(n, { maximumFractionDigits: 0 }) });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const common = { kind, name: v.name, emoji: v.emoji, color: v.color, description: v.description };
    const parsed = creationSchema.safeParse(
      kind === 'POOL'
        ? { ...common, network: v.network, poolType, feeBps: Number(v.feeBps) }
        : kind === 'CRYPTO'
          ? { ...common, symbol: v.symbol, price, deposit }
          : { ...common, symbol: v.symbol, price, deposit, sector: v.sector, payout: Number(v.payout) / 100 },
    );
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), texts.issue(i)])));
      return;
    }
    setErrors({});
    create.mutate(parsed.data);
  }

  const err = (k: string) => errors[k] && <span className="mt-1 block text-xs font-semibold text-down">{errors[k]}</span>;

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {/* Aperçu de la fiche */}
      <div className="flex items-center gap-4 border-2 border-ink p-4">
        <span className="grid size-16 place-items-center text-4xl" style={{ background: `color-mix(in oklch, ${v.color} 35%, transparent)` }}>
          <Glyph name={v.emoji} color={v.color} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-2">
            {kind === 'POOL'
              ? t('preview.pool', { type: poolType, network: v.network })
              : t('preview.asset', { symbol: v.symbol || t('preview.symbol'), kind: kind === 'COMPANY' ? texts.sector(v.sector) : t('preview.crypto') })}
          </p>
          <p className="display truncate text-3xl font-bold">{v.name || t('preview.name')}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <LabeledField label={t('name')}>
          <input className="field" value={v.name} onChange={set('name')} />
          {err('name')}
        </LabeledField>
        {kind !== 'POOL' && (
          <LabeledField label={t('symbol')}>
            <input className="field uppercase" value={v.symbol} onChange={set('symbol')} />
            {err('symbol')}
          </LabeledField>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_100px]">
        <LabeledField label={t('logo')}>
          <IconPicker value={v.emoji} color={v.color} onChange={(emoji) => setV({ ...v, emoji })} />
          {err('emoji')}
        </LabeledField>
        <LabeledField label={t('color')}>
          <input type="color" className="field h-[46px] p-1" value={v.color} onChange={set('color')} />
          {err('color')}
        </LabeledField>
      </div>
      <LabeledField label={t('description')}>
        <textarea className="field min-h-20" value={v.description} onChange={set('description')} placeholder={t('descriptionPlaceholder')} />
        {err('description')}
      </LabeledField>

      {kind !== 'POOL' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledField label={kind === 'COMPANY' ? t('ipoPrice') : t('startPrice')}>
            <input className="field num" type="number" step="any" value={v.price} onChange={set('price')} />
            {err('price')}
          </LabeledField>
          <LabeledField label={t('deposit', { min: f.money(cfg.costs[kind].minDeposit), max: f.money(cfg.costs[kind].maxDeposit) })}>
            <input className="field num" type="number" step="any" value={v.deposit} onChange={set('deposit')} />
            {err('deposit')}
          </LabeledField>
        </div>
      )}
      {kind === 'COMPANY' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledField label={t('sector')}>
            <select className="field" value={v.sector} onChange={set('sector')}>
              {Object.entries(cfg.sectors).map(([s, pe]) => (
                <option key={s} value={s}>{t('sectorOption', { sector: texts.sector(s), pe })}</option>
              ))}
            </select>
            {err('sector')}
          </LabeledField>
          <LabeledField label={t('payout', { pct: share(Number(v.payout) / 100) })}>
            <input type="range" min={0} max={PAYOUT_MAX_PCT} step={5} value={v.payout} onChange={set('payout')} className="mt-3 w-full accent-[var(--color-ink)]" />
            <span className="text-xs text-ink-2">{t('payoutHint')}</span>
            {err('payout')}
          </LabeledField>
        </div>
      )}
      {kind === 'POOL' && (
        <div className="grid gap-4 sm:grid-cols-3">
          <LabeledField label={t('network')}>
            <select className="field" value={v.network} onChange={set('network')}>
              {cfg.networks.map((n) => (
                <option key={n.symbol} value={n.symbol}>{n.symbol} · {n.name}</option>
              ))}
            </select>
            {err('network')}
          </LabeledField>
          <LabeledField label={t('poolType')}>
            <select className="field" value={poolType} onChange={(e) => setPoolType(POOL_TYPES.find((p) => p === e.target.value) ?? 'PPS')}>
              {POOL_TYPES.map((p) => (
                <option key={p} value={p}>{t(`poolTypes.${p}`)}</option>
              ))}
            </select>
            {err('poolType')}
          </LabeledField>
          <LabeledField label={t('commission', { pct: f.pct(Number(v.feeBps) / 10_000, false) })}>
            <input type="range" min={0} max={cfg.costs.poolMaxFeeBps} step={25} value={v.feeBps} onChange={set('feeBps')} className="mt-3 w-full accent-[var(--color-ink)]" />
            {err('feeBps')}
          </LabeledField>
        </div>
      )}

      <div className="num border-t-2 border-ink pt-4 text-sm">
        <div className="flex justify-between"><span className="text-ink-2">{t('summary.fee')}</span><span>{f.money(fee)}</span></div>
        {kind !== 'POOL' && (
          <>
            <div className="flex justify-between"><span className="text-ink-2">{t('summary.liquidity')}</span><span>{f.money(deposit)}</span></div>
            <div className="flex justify-between"><span className="text-ink-2">{t('summary.supply')}</span><span>{units(supply)}</span></div>
            <div className="flex justify-between">
              <span className="text-ink-2">{t('summary.myShare', { share: share(cfg.costs.creatorShare), days: cfg.costs.vestDays })}</span>
              <span>{units(supply * cfg.costs.creatorShare)}</span>
            </div>
          </>
        )}
        <div className="mt-2 flex justify-between text-lg font-bold"><span>{t('summary.total')}</span><span>{f.money(total)}</span></div>
        <p className={`text-right text-xs ${cash < total ? 'font-semibold text-down' : 'text-ink-2'}`}>{t('summary.cash', { cash: f.money(cash) })}</p>
      </div>

      <button className="btn bg-acid" disabled={create.isPending || cash < total}>{t('submit')}</button>
      {create.isSuccess && <p className="font-semibold text-up">{t('sent')}</p>}
      {create.isError && <p className="font-semibold text-down">{errorMessage(create.error)}</p>}
    </form>
  );
}
