'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { type BankView, MOOD_STYLE } from '@/lib/economy';
import { useFormat } from '@/lib/format';

export interface EventTypeRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  mood: 'POSITIVE' | 'NEGATIVE' | 'MARKET';
  ratePerDay: number;
  cooldownHours: number;
  noticeMinutes: number;
  durationMinutes: number;
  params: Record<string, unknown>;
  enabled: boolean;
  fired: number;
}

export type AdminBank = BankView & { available: boolean };

/** Action sur l'économie ; le motif est ajouté au corps. */
export interface EconomyAction {
  path: string;
  method: 'POST' | 'PATCH';
  json: object;
}
export type Run = (action: EconomyAction) => void;

/** Type d'événement : fréquences modifiables, activation et déclenchement manuel. */
export function TypeRow({ type, disabled, run, banks }: { type: EventTypeRow; disabled: boolean; run: Run; banks: BankView[] }) {
  const t = useTranslations('admin.economy.types');
  const tc = useTranslations('common.actions');
  const f = useFormat();
  const [rate, setRate] = useState('');
  const [cool, setCool] = useState('');
  const [notice, setNotice] = useState('');
  const [bankId, setBankId] = useState('');
  const changed = rate || cool || notice;
  const needsBank = type.slug === 'bank-run' || type.slug === 'bank-hack';
  const trigger = (immediate: boolean) =>
    run({ path: '/admin/economy/trigger', method: 'POST', json: { typeId: type.id, immediate, params: bankId ? { bankId } : {} } });
  return (
    <tr className={`border-b border-line ${type.enabled ? '' : 'text-ink-3'}`}>
      <td className="py-2 pr-2">
        <span className={`mr-2 inline-block size-2.5 border border-ink ${MOOD_STYLE[type.mood].bg}`} aria-hidden />
        <strong>{type.name}</strong>
        {type.durationMinutes > 0 && (
          <span className="ml-1 text-xs text-ink-2">{t('duration', { hours: f.number(type.durationMinutes / 60, { maximumFractionDigits: 1 }) })}</span>
        )}
      </td>
      <td>
        <input className="field w-20 py-1 text-xs" placeholder={String(type.ratePerDay)} aria-label={t('columns.rate')} value={rate} onChange={(e) => setRate(e.target.value)} disabled={disabled} />
      </td>
      <td>
        <input className="field w-16 py-1 text-xs" placeholder={String(type.cooldownHours)} aria-label={t('columns.cooldown')} value={cool} onChange={(e) => setCool(e.target.value)} disabled={disabled} />
      </td>
      <td>
        <input className="field w-16 py-1 text-xs" placeholder={String(type.noticeMinutes)} aria-label={t('columns.notice')} value={notice} onChange={(e) => setNotice(e.target.value)} disabled={disabled} />
      </td>
      <td>{type.fired}</td>
      <td className="space-x-3 text-right whitespace-nowrap">
        {changed && (
          <button
            className="font-semibold underline disabled:opacity-40"
            disabled={disabled}
            onClick={() =>
              run({
                path: `/admin/economy/event-types/${type.id}`,
                method: 'PATCH',
                json: {
                  ...(rate ? { ratePerDay: Number(rate) } : {}),
                  ...(cool ? { cooldownHours: Number(cool) } : {}),
                  ...(notice ? { noticeMinutes: Number(notice) } : {}),
                },
              })
            }
          >
            {tc('save')}
          </button>
        )}
        <button
          className="underline disabled:opacity-40"
          disabled={disabled}
          onClick={() => run({ path: `/admin/economy/event-types/${type.id}`, method: 'PATCH', json: { enabled: !type.enabled } })}
        >
          {type.enabled ? t('disable') : t('enable')}
        </button>
        {needsBank && (
          <select className="field inline-block w-auto py-0.5 text-xs" value={bankId} onChange={(e) => setBankId(e.target.value)} disabled={disabled} aria-label={t('pickBank')}>
            <option value="">{type.slug === 'bank-hack' ? t('randomBank') : t('pickBank')}</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <button className="font-semibold underline disabled:opacity-40" disabled={disabled || (type.slug === 'bank-run' && !bankId)} onClick={() => trigger(false)}>
          {t('trigger')}
        </button>
        <button
          className="font-semibold text-down underline disabled:opacity-40"
          disabled={disabled || (type.slug === 'bank-run' && !bankId)}
          onClick={() => trigger(true)}
          title={t('nowHint')}
        >
          {t('now')}
        </button>
      </td>
    </tr>
  );
}

/** Banque : tarifs, risque de faillite, ouverture aux nouveaux clients. */
export function BankRow({ b, disabled, run }: { b: AdminBank; disabled: boolean; run: Run }) {
  const t = useTranslations('admin.economy.banks');
  const tc = useTranslations('common.actions');
  const f = useFormat();
  const [fee, setFee] = useState('');
  const [bps, setBps] = useState('');
  const [interest, setInterest] = useState('');
  const [fail, setFail] = useState('');
  const changed = fee || bps || interest || fail;
  return (
    <tr className="border-b border-line">
      <td className="py-2 font-semibold">
        <span className="mr-2 inline-block size-2.5" style={{ background: b.color }} aria-hidden />
        {b.name}
      </td>
      <td>
        <input className="field w-24 py-1 text-xs" placeholder={f.money(b.monthlyFee)} aria-label={t('columns.fee')} value={fee} onChange={(e) => setFee(e.target.value)} disabled={disabled} />
      </td>
      <td>
        <input className="field w-16 py-1 text-xs" placeholder={t('bps', { bps: b.tradingFeeBps })} aria-label={t('columns.trading')} value={bps} onChange={(e) => setBps(e.target.value)} disabled={disabled} />
      </td>
      <td>
        <input
          className="field w-16 py-1 text-xs"
          placeholder={f.number(b.interestMonthly / 100, { style: 'percent', maximumFractionDigits: 2 })}
          aria-label={t('columns.interest')}
          value={interest}
          onChange={(e) => setInterest(e.target.value)}
          disabled={disabled}
        />
      </td>
      <td>
        <input className="field w-20 py-1 text-xs" placeholder={String(b.failRiskPerDay)} aria-label={t('columns.failRisk')} value={fail} onChange={(e) => setFail(e.target.value)} disabled={disabled} />
      </td>
      <td className="space-x-3 text-right">
        {changed && (
          <button
            className="font-semibold underline disabled:opacity-40"
            disabled={disabled}
            onClick={() =>
              run({
                path: `/admin/economy/banks/${b.id}`,
                method: 'PATCH',
                json: {
                  ...(fee ? { monthlyFee: fee } : {}),
                  ...(bps ? { tradingFeeBps: Number(bps) } : {}),
                  ...(interest ? { interestMonthly: Number(interest) } : {}),
                  ...(fail ? { failRiskPerDay: Number(fail) } : {}),
                },
              })
            }
          >
            {tc('save')}
          </button>
        )}
        {!b.isDefault && (
          <button className="underline disabled:opacity-40" disabled={disabled} onClick={() => run({ path: `/admin/economy/banks/${b.id}`, method: 'PATCH', json: { available: !b.available } })}>
            {b.available ? t('close') : t('reopen')}
          </button>
        )}
      </td>
    </tr>
  );
}
