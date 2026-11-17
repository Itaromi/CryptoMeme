'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { type Farm, useMiningFormat } from '@/lib/mining';
import { useApiMutation } from '@/lib/mutation';
import { useTexts } from '@/lib/texts';
import { queryKeys } from '@/lib/queryKeys';

/** Pièces en stock : installer un rack, réparer, revendre ou jeter. */
export function FarmInventory({ farm }: { farm: Farm }) {
  const texts = useTexts();
  const errorMessage = texts.error;
  const t = useTranslations('mining');
  const f = useFormat();
  const m = useMiningFormat();
  // Réparer ou revendre fait bouger le cash : portefeuille et classement suivent.
  const act = useApiMutation<{ path: string; json?: object }>({
    mutationFn: ({ path, json }) => api(path, { method: 'POST', json }),
    invalidate: [queryKeys.mining.farm, queryKeys.portfolio, queryKeys.leaderboard.all],
  });

  return (
    <section>
      <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">
        {t('inventory.title', { count: farm.inventory.length })}
      </h2>
      {act.error && <p className="mb-2 text-sm text-down">{errorMessage(act.error)}</p>}
      {farm.inventory.length === 0 ? (
        <p className="text-ink-2">
          {t.rich('inventory.empty', {
            link: (c) => (
              <Link href="/mining/shop" className="font-semibold text-ink underline">
                {c}
              </Link>
            ),
          })}
        </p>
      ) : (
        <table className="num w-full text-left text-sm">
          <tbody>
            {farm.inventory.map((i) => (
              <tr key={i.id} className="border-b border-line">
                <td className="w-20 py-2 text-xs text-ink-2">{m.kindShort(i.model.kind)}</td>
                <td className="py-2">
                  <span className={`font-semibold ${i.status !== 'OK' ? 'text-down' : ''}`}>
                    {i.model.brand} {i.model.name}
                  </span>
                  {i.status !== 'OK' && <span className="ml-2 text-xs font-semibold text-down">{t(`item.${i.status}`)}</span>}
                  <span className="block text-xs text-ink-2">
                    {m.modelSpecs(i.model)} · {t('item.wear', { value: m.pct(i.wear) })}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <span className="flex flex-wrap justify-end gap-3">
                    {i.model.kind === 'RACK' && i.status === 'OK' && (
                      <select
                        className="field w-auto py-1 text-xs"
                        value=""
                        disabled={act.isPending}
                        onChange={(e) => e.target.value && act.mutate({ path: `/mining/items/${i.id}/install`, json: { facilityId: e.target.value } })}
                      >
                        <option value="">{t('inventory.installIn')}</option>
                        {farm.facilities.map((fac) => (
                          <option key={fac.id} value={fac.id}>
                            {texts.facility(fac)}
                          </option>
                        ))}
                      </select>
                    )}
                    {i.status === 'BROKEN' && (
                      <button className="font-semibold underline" disabled={act.isPending} onClick={() => act.mutate({ path: `/mining/items/${i.id}/repair` })}>
                        {t('item.repair', { cost: f.money(i.repairCost) })}
                      </button>
                    )}
                    <button
                      className="text-ink-2 underline hover:text-ink"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ path: `/mining/items/${i.id}/sell` })}
                    >
                      {i.status === 'DESTROYED' ? t('inventory.discard') : t('inventory.resell', { price: f.money(i.resale) })}
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
