'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { useFormat } from '@/lib/format';
import { ALGO_LABEL, isKind, type Kind, KINDS, type Model, useFarm, useMiningFormat } from '@/lib/mining';
import { queryKeys } from '@/lib/queryKeys';
import { CatalogRow } from '@/components/mining/CatalogRow';
import { FacilityShop } from '@/components/mining/FacilityShop';
import { MiningNav } from '@/components/mining/MiningNav';

/** Tris proposés par l'API (`id`) et leur clé de libellé. */
const SORTS = [
  { id: 'price', label: 'priceAsc' },
  { id: '-price', label: 'priceDesc' },
  { id: 'perDollar', label: 'perDollar' },
  { id: 'perWatt', label: 'perWatt' },
] as const;
type SortId = (typeof SORTS)[number]['id'];

/** Modèles par page côté API */
const PAGE_SIZE = 40;

export default function ShopPage() {
  return (
    <Suspense>
      <Shop />
    </Suspense>
  );
}

function Shop() {
  const t = useTranslations('mining.shop');
  const f = useFormat();
  const m = useMiningFormat();
  const params = useSearchParams();
  const kindParam = params.get('kind');
  const [tab, setTab] = useState<Kind | 'FACILITIES'>(params.get('tab') === 'facilities' ? 'FACILITIES' : isKind(kindParam) ? kindParam : 'GPU');
  const [sort, setSort] = useState<SortId>('price');
  const [algo, setAlgo] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data: me } = useMe();
  const { data: farm } = useFarm(!!me);
  const mines = tab === 'GPU' || tab === 'CPU' || tab === 'ASIC';

  const { data } = useQuery({
    queryKey: queryKeys.mining.catalog({ kind: tab, sort, algo, q, page }),
    queryFn: () => api<{ total: number; items: Model[] }>(`/mining/catalog?kind=${tab}&sort=${sort}&algo=${algo}&q=${encodeURIComponent(q)}&page=${page}`),
    enabled: tab !== 'FACILITIES',
    placeholderData: (prev) => prev,
  });
  const hasMore = !!data && data.total > page * PAGE_SIZE;

  return (
    <div className="rise">
      <h1 className="display mb-6 text-6xl font-extrabold">{t('title')}</h1>
      <MiningNav />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1 text-sm font-semibold" role="tablist">
          {[...KINDS, 'FACILITIES' as const].map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => {
                setTab(k);
                setPage(1);
              }}
              className={`px-3 py-1.5 ${tab === k ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}
            >
              {k === 'FACILITIES' ? t('facilitiesTab') : m.kind(k)}
            </button>
          ))}
        </div>
        {farm && <p className="num text-sm">{t.rich('cash', { cash: f.money(farm.cash), b: (c) => <strong>{c}</strong> })}</p>}
      </div>

      {tab === 'FACILITIES' ? (
        <FacilityShop />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <input
              className="field max-w-xs py-1.5"
              placeholder={t('search')}
              aria-label={t('search')}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            {mines && (
              <select className="field w-auto py-1.5" value={algo} onChange={(e) => setAlgo(e.target.value)} aria-label={t('allAlgos')}>
                <option value="">{t('allAlgos')}</option>
                {Object.entries(ALGO_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-1 text-sm">
              {SORTS.filter((s) => mines || s.id.includes('price')).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSort(s.id)}
                  className={`px-3 py-2 sm:py-1.5 ${sort === s.id ? 'bg-ink text-paper' : 'border border-line hover:bg-paper-2'}`}
                >
                  {t(`sort.${s.label}`)}
                </button>
              ))}
            </div>
          </div>
          <p className="mb-2 text-sm text-ink-2">{t('count', { count: data?.total ?? 0 })}</p>
          {/* Mobile et tablette : chaque modèle est une fiche empilée ; tableau à partir de lg */}
          <div className="lg:overflow-x-auto">
            <table className="num block w-full text-left text-sm lg:table">
              <thead className="hidden lg:table-header-group">
                <tr className="border-y-2 border-ink text-xs uppercase tracking-wider text-ink-2">
                  <th className="py-2 pr-4">{t('cols.model')}</th>
                  <th className="py-2 pr-4">{mines ? t('cols.hashrate') : t('cols.specs')}</th>
                  <th className="py-2 pr-4 text-right">{t('cols.power')}</th>
                  <th className="py-2 pr-4 text-right">{t('cols.price')}</th>
                  <th className="py-2 text-right" />
                </tr>
              </thead>
              <tbody className="block border-t-2 border-ink lg:table-row-group lg:border-t-0">
                {data?.items.map((model) => (
                  <CatalogRow key={model.id} m={model} algo={algo} cash={Number(farm?.cash ?? 0)} canBuy={!!me} />
                ))}
              </tbody>
            </table>
          </div>
          {(page > 1 || hasMore) && (
            <div className="mt-4 flex gap-4">
              {page > 1 && (
                <button className="py-2 font-semibold underline" onClick={() => setPage(page - 1)}>
                  {t('prev')}
                </button>
              )}
              {hasMore && (
                <button className="py-2 font-semibold underline" onClick={() => setPage(page + 1)}>
                  {t('next')}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
