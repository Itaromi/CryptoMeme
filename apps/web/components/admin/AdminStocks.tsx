'use client';
import { useState } from 'react';
import { useNow, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { Glyph } from '@/lib/icons';
import { useApiMutation } from '@/lib/mutation';
import { queryKeys } from '@/lib/queryKeys';
import { healthLevel, type StockRow, useStocks } from '@/lib/stocks';
import { Feedback } from './Feedback';

/** Actions possibles sur une société : identifiant envoyé à l'API et clé de libellé. */
const ACTIONS = [
  { id: 'earnings', key: 'earnings' },
  { id: 'news-good', key: 'newsGood' },
  { id: 'news-bad', key: 'newsBad' },
  { id: 'takeover', key: 'takeover' },
  { id: 'takeover-success', key: 'takeoverSuccess' },
  { id: 'takeover-fail', key: 'takeoverFail' },
  { id: 'split', key: 'split' },
  { id: 'bankrupt', key: 'bankrupt' },
  { id: 'relist', key: 'relist' },
] as const;
type ActionId = (typeof ACTIONS)[number]['id'];
const isActionId = (v: string): v is ActionId => ACTIONS.some((a) => a.id === v);

/** Actions irréversibles : un second clic est demandé. */
const DANGEROUS = new Set<ActionId>(['bankrupt', 'takeover-success']);

/** Résultat renvoyé par POST /admin/stocks/:symbol (texte produit par l'API) */
interface StockActionResult {
  detail?: string;
  headline?: string;
  text?: string;
}

/** Pilotage des sociétés cotées : résultats, nouvelles, OPA, split, faillite. */
export function AdminStocks({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('admin.stocks');
  const { data } = useStocks();
  const now = useNow({ updateInterval: 1_000 });
  const [reason, setReason] = useState('');
  return (
    <div className="space-y-6">
      {isAdmin ? (
        <input className="field max-w-md" placeholder={t('reason')} aria-label={t('reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
      ) : (
        <p className="text-sm text-ink-2">{t('readOnly')}</p>
      )}
      <table className="num w-full text-left text-sm">
        <thead>
          <tr className="border-y-2 border-ink text-xs uppercase text-ink-2">
            <th className="py-2">{t('columns.company')}</th>
            <th>{t('columns.status')}</th>
            <th>{t('columns.price')}</th>
            <th>{t('columns.eps')}</th>
            <th>{t('columns.health')}</th>
            <th>{t('columns.earnings')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.stocks.map((s) => (
            <Row key={s.symbol} s={s} disabled={!isAdmin || reason.length < 3} reason={reason} now={now} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ s, disabled, reason, now }: { s: StockRow; disabled: boolean; reason: string; now: Date }) {
  const t = useTranslations('admin.stocks');
  const f = useFormat();
  const [action, setAction] = useState<ActionId>('earnings');
  const [ratio, setRatio] = useState('2');
  const [armed, setArmed] = useState(false);
  const run = useApiMutation<void, StockActionResult>({
    mutationFn: () =>
      api<StockActionResult>(`/admin/stocks/${s.symbol}`, {
        method: 'POST',
        json: { action, ...(action === 'split' ? { ratio: Number(ratio) } : {}), reason },
      }),
    // cours, fiche, portefeuilles (split, faillite, OPA), brèves et audit
    invalidate: [queryKeys.stocks, queryKeys.stock(s.symbol), queryKeys.asset(s.symbol), queryKeys.assets, queryKeys.portfolio, queryKeys.marketEvents, queryKeys.admin.audit],
  });
  const c = s.company;
  const decimals = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  const go = () => {
    if (DANGEROUS.has(action) && !armed) return setArmed(true);
    setArmed(false);
    run.mutate();
  };
  return (
    <tr className="border-b border-line align-top">
      <td className="py-2 font-semibold">
        <Glyph name={s.emoji} color={s.color} /> {s.name} <span className="text-xs text-ink-2">{s.symbol}</span>
      </td>
      <td className="py-2">{t(`status.${c.status}`)}</td>
      <td className="py-2">{f.money(s.price)}</td>
      <td className="py-2">
        {f.number(c.eps, decimals)} / {f.number(c.consensus, decimals)}
      </td>
      <td className={`py-2 ${healthLevel(c.health).cls}`}>{f.number(c.health, { style: 'percent', maximumFractionDigits: 0 })}</td>
      <td className="py-2">
        {f.countdown(c.nextEarningsAt, now)}
      </td>
      <td className="space-x-2 py-2 text-right whitespace-nowrap">
        <select
          className="field inline-block w-auto py-0.5 text-xs"
          value={action}
          aria-label={t('actionLabel')}
          onChange={(e) => {
            if (isActionId(e.target.value)) setAction(e.target.value);
            setArmed(false);
          }}
          disabled={disabled}
        >
          {ACTIONS.map((a) => (
            <option key={a.id} value={a.id}>
              {t(`actions.${a.key}`)}
            </option>
          ))}
        </select>
        {action === 'split' && (
          <input className="field inline-block w-14 py-0.5 text-xs" value={ratio} onChange={(e) => setRatio(e.target.value)} disabled={disabled} aria-label={t('splitRatio')} />
        )}
        <button className={`font-semibold underline disabled:opacity-40 ${armed ? 'text-down' : ''}`} disabled={disabled || run.isPending} onClick={go}>
          {armed ? t('confirm') : t('execute')}
        </button>
        <div className="mt-1 max-w-xs text-right whitespace-normal">
          <Feedback m={run} success={run.data?.detail ?? run.data?.headline ?? run.data?.text} className="text-xs font-semibold" />
        </div>
      </td>
    </tr>
  );
}

