'use client';
import { useTranslations } from 'next-intl';
import { tone, useFormat } from '@/lib/format';
import type { Portfolio } from '@/lib/hooks';
import { type StockDetail, useMarketClock } from '@/lib/stocks';
import { OrderForm } from '@/components/OrderForm';
import { KeyValueRow } from './KeyValueRow';

type Position = Portfolio['positions'][number];

/**
 * Colonne d'achat/vente d'une fiche d'actif : formulaire d'ordre, ou la raison pour laquelle on ne peut pas trader,
 * puis la position du joueur.
 */
export function TradePanel({
  symbol,
  name,
  frozen,
  isStock,
  company,
  position,
}: {
  symbol: string;
  name: string;
  frozen: boolean;
  isStock: boolean;
  company?: StockDetail;
  position?: Position;
}) {
  const t = useTranslations('market.asset');
  const f = useFormat();
  const clock = useMarketClock();
  const delisted = company && company.status !== 'LISTED' && company.status !== 'TAKEOVER';

  return (
    <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
      {delisted ? (
        <p className="border-2 border-ink p-5 font-semibold">{t('delisted', { name })}</p>
      ) : frozen ? (
        <p className="border-2 border-down p-5 font-semibold text-down">{t('suspended', { name })}</p>
      ) : isStock && !clock.open ? (
        <div className="border-2 border-ink bg-paper-2 p-5">
          <p className="text-xs font-bold uppercase tracking-widest">{t('sessionClosed.label')}</p>
          <p className="display mt-1 text-3xl font-bold">{t('sessionClosed.opensIn', { time: f.countdown(new Date(clock.nextChangeAt), clock.now) })}</p>
          <p className="mt-2 text-sm text-ink-2">{t('sessionClosed.hours')}</p>
        </div>
      ) : (
        <OrderForm symbol={symbol} name={name} />
      )}
      {position && <PositionCard position={position} />}
    </aside>
  );
}

function PositionCard({ position }: { position: Position }) {
  const t = useTranslations('market.asset.position');
  const f = useFormat();
  return (
    <div className="num border-2 border-ink bg-paper-2 p-5 text-sm">
      <p className="mb-3 font-bold uppercase tracking-widest">{t('title')}</p>
      <dl className="space-y-1.5">
        <KeyValueRow label={t('quantity')}>{f.qty(position.quantity)}</KeyValueRow>
        <KeyValueRow label={t('avgCost')}>{f.price(position.avgCost)}</KeyValueRow>
        <KeyValueRow label={t('liquidationValue')}>{f.money(position.liquidationValue)}</KeyValueRow>
        <KeyValueRow label={t('unrealizedPnl')} className={tone(Number(position.unrealizedPnl))}>
          {f.money(position.unrealizedPnl)}
        </KeyValueRow>
      </dl>
    </div>
  );
}
