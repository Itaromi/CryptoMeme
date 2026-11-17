'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { type Farm, type PoolsInfo, useMiningFormat } from '@/lib/mining';
import { errorMessage, useApiMutation } from '@/lib/mutation';
import { queryKeys } from '@/lib/queryKeys';
import { RigBuilder } from './RigBuilder';
import { RigRow } from './RigRow';

type Facility = Farm['facilities'][number];

/** Un local de la ferme : sa jauge de puissance, ses racks et les rigs montées dedans. */
export function FacilitySection({
  facility,
  inventory,
  pools,
  building,
  onBuild,
}: {
  facility: Facility;
  inventory: Farm['inventory'];
  pools?: PoolsInfo;
  /** Rack dont le formulaire de montage est ouvert */
  building: string | null;
  onBuild: (rackId: string | null) => void;
}) {
  const t = useTranslations('mining.facility');
  const f = useFormat();
  const { type } = facility;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-2">
        <div>
          <h2 className="display text-3xl font-bold">{facility.name}</h2>
          <p className="text-sm text-ink-2">
            {t('info', {
              type: type.name,
              elecPrice: f.number(type.elecPrice),
              temp: type.ambientTemp,
              racks: facility.racks.length,
              slots: type.rackSlots,
            })}
          </p>
        </div>
        <PowerBar used={facility.powerUsed} max={type.maxPowerKw * 1000} />
      </div>
      {facility.racks.length === 0 && (
        <p className="py-4 text-ink-2">
          {t.rich('noRack', {
            link: (c) => (
              <Link href="/mining/shop?kind=RACK" className="font-semibold text-ink underline">
                {c}
              </Link>
            ),
          })}
        </p>
      )}
      {facility.racks.map((rack) => {
        const free = (rack.model.rackSlots ?? 1) - rack.rigs.length;
        return (
          <div key={rack.id} className="mb-6">
            <div className="flex items-center justify-between py-2 text-sm">
              <span className="font-semibold uppercase tracking-wider">
                {rack.model.brand} {rack.model.name}{' '}
                <span className="font-normal normal-case tracking-normal text-ink-2">
                  · {t('rackInfo', { rigs: rack.rigs.length, slots: rack.model.rackSlots ?? 0, airflow: f.number(rack.model.airflow ?? 0) })}
                </span>
              </span>
              {rack.rigs.length === 0 && <UninstallRack id={rack.id} />}
            </div>
            {rack.rigs.map((r) => (
              <RigRow key={r.id} rig={r} pools={pools} />
            ))}
            {free > 0 &&
              (building === rack.id ? (
                <div className="mt-3">
                  <RigBuilder rackId={rack.id} inventory={inventory} onDone={() => onBuild(null)} />
                </div>
              ) : (
                <button
                  className="mt-2 w-full border-2 border-dashed border-ink-3 py-3 text-sm font-semibold text-ink-2 hover:border-ink hover:text-ink"
                  onClick={() => onBuild(rack.id)}
                >
                  {t('buildRig', { free })}
                </button>
              ))}
          </div>
        );
      })}
    </section>
  );

}

/** Jauge de puissance consommée par rapport au maximum du local. */
function PowerBar({ used, max }: { used: number; max: number }) {
  const t = useTranslations('mining.facility');
  const m = useMiningFormat();
  const r = max ? used / max : 0;
  return (
    <div className="num w-56 text-xs">
      <div className="flex justify-between">
        <span className="text-ink-2">{t('power')}</span>
        <span className={r > 0.9 ? 'font-semibold text-down' : ''}>
          {m.watts(used)} / {m.watts(max)}
        </span>
      </div>
      <div className="mt-1 h-2 bg-paper-2">
        <div className={`h-full ${r > 0.9 ? 'bg-down' : 'bg-ink'}`} style={{ width: `${Math.min(100, r * 100)}%` }} />
      </div>
    </div>
  );
}

function UninstallRack({ id }: { id: string }) {
  const t = useTranslations('mining.facility');
  const uninstall = useApiMutation({
    mutationFn: () => api(`/mining/items/${id}/install`, { method: 'POST', json: { facilityId: null } }),
    invalidate: [queryKeys.mining.farm],
  });
  return (
    <span className="text-right">
      <button className="text-xs text-ink-2 underline hover:text-ink" disabled={uninstall.isPending} onClick={() => uninstall.mutate()}>
        {t('uninstallRack')}
      </button>
      {uninstall.error && <span className="block text-xs text-down">{errorMessage(uninstall.error)}</span>}
    </span>
  );
}
