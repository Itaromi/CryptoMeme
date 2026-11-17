'use client';
import { useNow, useTranslations } from 'next-intl';
import { useFormat } from '@/lib/format';
import { type Farm } from '@/lib/mining';

/** Mise en avant des lignes du journal selon leur gravité */
const LOG_STYLE: Record<string, string> = {
  FIRE: 'font-bold text-down',
  BREAK: 'text-down',
  SCAM: 'font-bold text-down',
  POWER: 'font-semibold text-down',
  BLOCK: 'font-bold text-up',
  PAYOUT: 'text-up',
};

const heading = 'mb-2 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest';

/** Colonne de la ferme : paiements en attente, fédérations et journal (messages du journal renvoyés par l'API). */
export function FarmSidebar({ farm }: { farm: Farm }) {
  const t = useTranslations('mining.sidebar');
  const f = useFormat();
  const now = useNow({ updateInterval: 30_000 });
  const federations = Object.entries(farm.summary.federations);

  return (
    <aside className="space-y-8">
      {farm.pending.length > 0 && (
        <section>
          <h2 className={heading}>{t('pendingTitle')}</h2>
          <ul className="num space-y-1 text-sm">
            {farm.pending.map((p) => (
              <li key={p.pool} className="flex justify-between">
                <span>{p.pool}</span>
                <span className="font-semibold">
                  {f.qty(p.amount)} {p.symbol}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-ink-3">{t('pendingNote')}</p>
        </section>
      )}
      {federations.length > 0 && (
        <section>
          <h2 className={heading}>{t('federationsTitle')}</h2>
          <ul className="space-y-1 text-sm">
            {federations.map(([fed, n]) => (
              <li key={fed} className="flex justify-between">
                <span>{fed}</span>
                <span className={n >= 3 ? 'font-semibold text-up' : 'text-ink-2'}>
                  {t('federationCount', { count: n })} {n >= 3 && t('federationDiscount')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h2 className={heading}>{t('logTitle')}</h2>
        <ul className="divide-y divide-line">
          {farm.logs.map((l, i) => (
            <li key={i} className="py-2 text-sm leading-snug">
              <span className={LOG_STYLE[l.type] ?? ''}>{l.message}</span>
              <span className="block text-xs text-ink-3">{f.ago(l.at, now)}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
