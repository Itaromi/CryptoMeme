'use client';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { useFormat } from '@/lib/format';
import { type FacilityType, useFacilityTypes, useFarm } from '@/lib/mining';
import { useApiMutation } from '@/lib/mutation';
import { useTexts } from '@/lib/texts';
import { queryKeys } from '@/lib/queryKeys';

/** Onglet « Locaux » de la boutique : les types de local à acheter. */
export function FacilityShop() {
  const { data: me } = useMe();
  const { data: farm } = useFarm(!!me);
  const { data } = useFacilityTypes();
  return (
    <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
      {data?.map((type) => (
        <FacilityCard
          key={type.id}
          type={type}
          canBuy={!!me}
          cash={Number(farm?.cash ?? 0)}
          owned={farm?.facilities.filter((x) => x.type.id === type.id).length ?? 0}
        />
      ))}
    </div>
  );
}

function FacilityCard({ type, canBuy, cash, owned }: { type: FacilityType; canBuy: boolean; cash: number; owned: number }) {
  const texts = useTexts();
  const errorMessage = texts.error;
  const t = useTranslations('mining.facilities');
  const f = useFormat();
  const buy = useApiMutation({
    mutationFn: () => api('/mining/facilities', { method: 'POST', json: { typeId: type.id, name: '' } }),
    invalidate: [queryKeys.mining.farm, queryKeys.portfolio, queryKeys.leaderboard.all],
  });
  const price = Number(type.price);

  return (
    <article className="border-t-2 border-ink pt-4">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="display text-3xl font-bold">{texts.catalog(`facilities.${type.slug}.name`, type.name)}</h3>
        <span className="num text-xl font-semibold">{price ? f.money(type.price) : t('free')}</span>
      </div>
      <p className="mt-1 text-ink-2">{texts.catalog(`facilities.${type.slug}.description`, type.description)}</p>
      <dl className="num mt-3 grid grid-cols-4 gap-2 text-sm">
        <Spec label={t('elec')}>{t('elecPrice', { price: f.number(type.elecPrice) })}</Spec>
        <Spec label={t('power')}>{f.number(type.maxPowerKw)} kW</Spec>
        <Spec label={t('racks')}>{type.rackSlots}</Spec>
        <Spec label={t('ambient')}>{type.ambientTemp} °C</Spec>
      </dl>
      {canBuy && price > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn bg-acid py-1.5 text-sm" disabled={buy.isPending || cash < price} onClick={() => buy.mutate()}>
            {t('buy')}
          </button>
          {owned > 0 && <span className="text-sm text-ink-2">{t('owned', { count: owned })}</span>}
          {buy.isSuccess && <span className="text-sm font-semibold">{t('bought')}</span>}
          {buy.error && <span className="text-sm font-semibold text-down">{errorMessage(buy.error)}</span>}
        </div>
      )}
    </article>
  );
}

function Spec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}
