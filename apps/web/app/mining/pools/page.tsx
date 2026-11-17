'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/lib/format';
import { ALGO_LABEL, POOL_TYPES, useMiningFormat, usePools } from '@/lib/mining';
import { MiningNav } from '@/components/mining/MiningNav';
import { Glyph } from '@/lib/icons';

export default function PoolsPage() {
  const t = useTranslations('mining');
  const f = useFormat();
  const m = useMiningFormat();
  const { data } = usePools();
  return (
    <div className="rise">
      <h1 className="display mb-6 text-6xl font-extrabold">{t('pools.title')}</h1>
      <MiningNav />

      <section className="mb-14">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-widest">{t('pools.networksTitle')}</h2>
        <p className="mb-4 max-w-3xl text-ink-2">{t('pools.networksIntro')}</p>
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-y-2 border-ink text-xs uppercase tracking-wider text-ink-2">
                <th className="py-2 pr-4">{t('pools.cols.coin')}</th>
                <th className="py-2 pr-4">{t('pools.cols.algo')}</th>
                <th className="py-2 pr-4 text-right">{t('pools.cols.price')}</th>
                <th className="py-2 pr-4 text-right">{t('pools.cols.networkHashrate')}</th>
                <th className="py-2 pr-4 text-right">{t('pools.cols.players')}</th>
                <th className="py-2 pr-4 text-right" title={t('pools.cols.profitabilityHint')}>
                  {t('pools.cols.profitability')}
                </th>
                <th className="py-2 text-right">{t('pools.cols.nextHalving')}</th>
              </tr>
            </thead>
            <tbody>
              {data?.networks.map((n) => (
                <tr key={n.symbol} className="border-b border-line">
                  <td className="py-3 pr-4">
                    <Link href={`/market/${n.symbol}`} className="font-semibold hover:underline">
                      <Glyph name={n.emoji} /> {n.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">{ALGO_LABEL[n.algo] ?? n.algo}</td>
                  <td className="py-3 pr-4 text-right">{f.price(n.price)}</td>
                  <td className="py-3 pr-4 text-right">{m.hash(n.networkHashrate)}</td>
                  <td className="py-3 pr-4 text-right text-ink-2">{f.pct(n.playerHashrate / (n.networkHashrate || 1), false)}</td>
                  <td className="py-3 pr-4 text-right font-semibold">
                    {f.money(n.usdPerMhDay)} <span className="text-xs font-normal text-ink-2">{t('pools.perMhDay')}</span>
                  </td>
                  <td className="py-3 text-right text-sm">{f.date(n.nextHalving, { day: 'numeric', month: 'short' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-12 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-widest">{t('pools.poolsTitle')}</h2>
          <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
            {data?.pools.map((p) => (
              <article key={p.id} className={`border-t-2 pt-3 ${p.type === 'SHADY' ? 'border-down' : 'border-ink'}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-xl font-bold">{p.name}</h3>
                  <span className="text-sm">
                    <Glyph name={p.emoji} /> {p.symbol}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-2">{p.description}</p>
                <dl className="num mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <Fact label={t('pools.type')}>{m.poolType(p.type)}</Fact>
                  <Fact label={t('pools.fee')} className={p.feeBps < 0 ? 'text-up' : ''}>
                    {p.feeBps < 0 ? t('pools.feeBonus', { value: m.pct(-p.feeBps / 10_000, 1) }) : m.pct(p.feeBps / 10_000, 1)}
                  </Fact>
                  {p.federation && <Fact label={t('pools.federation')}>{p.federation}</Fact>}
                  {p.owner && (
                    <Fact label={t('pools.createdBy')}>
                      <Link href={`/u/${p.owner}`} className="underline">
                        @{p.owner}
                      </Link>
                    </Fact>
                  )}
                  <Fact label={t('pools.rigs')}>{p.miners}</Fact>
                  {p.scamRisk > 0 && (
                    <Fact label={t('pools.scamRisk')} className="text-down" labelClassName="text-down">
                      {t('perDay', { value: m.pct(p.scamRisk) })}
                    </Fact>
                  )}
                </dl>
              </article>
            ))}
          </div>
        </div>
        <aside className="space-y-6 text-sm">
          <h2 className="border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">{t('pools.howTitle')}</h2>
          {POOL_TYPES.map((k) => (
            <p key={k}>{t.rich('pools.howItem', { label: m.poolType(k), help: m.poolTypeHelp(k), b: (c) => <strong>{c}</strong> })}</p>
          ))}
          <p>{t.rich('pools.howFederations', { b: (c) => <strong>{c}</strong> })}</p>
        </aside>
      </section>
    </div>
  );
}

/** Caractéristique d'un pool sur une ligne : « Frais 1,5 % ». */
function Fact({ label, className = '', labelClassName = 'text-ink-2', children }: { label: string; className?: string; labelClassName?: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className={`inline ${labelClassName}`}>{label} </dt>
      <dd className={`inline font-semibold ${className}`}>{children}</dd>
    </div>
  );
}
