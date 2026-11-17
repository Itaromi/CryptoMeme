'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Lightning } from '@phosphor-icons/react';
import { useMe } from '@/lib/hooks';
import { useFormat } from '@/lib/format';
import { useFarm, usePools } from '@/lib/mining';
import { Stat } from '@/components/ui/Stat';
import { FacilitySection } from '@/components/mining/FacilitySection';
import { FarmInventory } from '@/components/mining/FarmInventory';
import { FarmSidebar } from '@/components/mining/FarmSidebar';
import { MiningNav } from '@/components/mining/MiningNav';

export default function MiningPage() {
  const t = useTranslations('mining');
  const f = useFormat();
  const { data: me, isLoading } = useMe();
  const { data: farm } = useFarm(!!me);
  const { data: pools } = usePools();
  const [building, setBuilding] = useState<string | null>(null);

  if (isLoading) return null;
  if (!me)
    return (
      <p className="display text-4xl">
        {t.rich('farm.loginPrompt', {
          link: (c) => (
            <Link href="/login" className="underline">
              {c}
            </Link>
          ),
        })}
      </p>
    );
  if (!farm) return <div className="h-96 animate-pulse bg-paper-2" />;

  const s = farm.summary;
  const net = s.usdPerDay - s.elecPerDay;

  return (
    <div className="rise">
      <h1 className="display mb-2 text-6xl font-extrabold">{t('farm.title')}</h1>
      <p className="mb-6 max-w-2xl text-lg text-ink-2">{t('farm.intro')}</p>
      <MiningNav />

      {farm.powerCut && (
        <p className="mb-6 border-2 border-down bg-down-bg p-4 font-semibold">
          <Lightning weight="fill" className="mr-1 inline align-[-0.15em]" />
          {t('farm.powerCut')}
        </p>
      )}

      <dl className="num mb-12 grid grid-cols-2 gap-x-10 gap-y-5 border-b-2 border-ink pb-8 md:grid-cols-5">
        <Stat label={t('farm.stats.running')} size="lg">
          {s.running} / {s.rigs}
        </Stat>
        <Stat label={t('farm.stats.revenue')} size="lg">
          {t('perDay', { value: f.money(s.usdPerDay) })}
        </Stat>
        <Stat label={t('farm.stats.elec')} size="lg">
          −{t('perDay', { value: f.money(s.elecPerDay) })}
        </Stat>
        <Stat label={t('farm.stats.net')} size="xl" className={net >= 0 ? 'text-up' : 'text-down'}>
          {t('perDay', { value: f.money(net) })}
        </Stat>
        <Stat label={t('farm.stats.hardware')} size="lg">
          {f.money(farm.hardwareValue)}
        </Stat>
      </dl>

      <div className="grid gap-12 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-12">
          {farm.facilities.map((fac) => (
            <FacilitySection key={fac.id} facility={fac} inventory={farm.inventory} pools={pools} building={building} onBuild={setBuilding} />
          ))}
          <Link href="/mining/shop?tab=facilities" className="btn bg-paper">
            {t('farm.buyFacility')}
          </Link>

          <FarmInventory farm={farm} />
        </div>

        <FarmSidebar farm={farm} />
      </div>
    </div>
  );
}
