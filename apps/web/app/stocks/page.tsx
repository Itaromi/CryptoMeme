'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAssets } from '@/lib/hooks';
import { tone, useFormat } from '@/lib/format';
import { healthLevel, useMarketClock, useStocks, VERDICT_CLS } from '@/lib/stocks';
import { LivePrice } from '@/components/LivePrice';
import { Spark } from '@/components/Spark';
import { SortSelect, SortTh } from '@/components/market/SortTh';
import { Glyph } from '@/lib/icons';
import { useTexts } from '@/lib/texts';

type SortKey = 'change24h' | 'marketCap' | 'yield' | 'earnings';

export default function StocksPage() {
  const t = useTranslations('stocks');
  const f = useFormat();
  const texts = useTexts();
  const { data, isLoading } = useStocks();
  const { data: live } = useAssets();
  const clock = useMarketClock();
  const [sort, setSort] = useState<SortKey>('marketCap');

  const rows = useMemo(() => {
    const merged = (data?.stocks ?? []).map((s) => {
      const l = live?.find((a) => a.symbol === s.symbol);
      return l ? { ...s, price: l.price, change24h: l.change24h } : s;
    });
    const key = (s: (typeof merged)[number]) =>
      sort === 'yield' ? s.company.dividendYield : sort === 'earnings' ? -new Date(s.company.nextEarningsAt).getTime() : s[sort];
    return merged.sort((a, b) => key(b) - key(a));
  }, [data, live, sort]);

  const calendar = useMemo(
    () =>
      (data?.stocks ?? [])
        .filter((s) => s.company.status === 'LISTED' || s.company.status === 'TAKEOVER')
        .sort((a, b) => new Date(a.company.nextEarningsAt).getTime() - new Date(b.company.nextEarningsAt).getTime())
        .slice(0, 6),
    [data],
  );

  const oneDecimal = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
  const time = f.countdown(new Date(clock.nextChangeAt), clock.now);

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_320px]">
      <div className="rise min-w-0">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="display text-5xl font-extrabold sm:text-6xl">{t('page.title')}</h1>
            <p className="mt-2 max-w-xl text-ink-2">{t('page.intro')}</p>
          </div>
          <div className={`border-2 border-ink px-4 py-3 ${clock.open ? 'bg-acid' : 'bg-paper-2'}`} aria-live="polite">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
              <span className={`inline-block size-2.5 rounded-full ${clock.open ? 'animate-pulse bg-up' : 'bg-ink-3'}`} aria-hidden />
              {clock.open ? t('page.sessionOpen') : t('page.sessionClosed')}
            </p>
            <p className="num mt-1 text-2xl font-bold">{clock.open ? t('page.closesIn', { time }) : t('page.opensIn', { time })}</p>
            <p className="text-xs text-ink-2">{t('page.hours')}</p>
          </div>
        </div>

        <div className="mb-4">
          <SortSelect
            label={t('page.sortLabel')}
            sort={sort}
            setSort={setSort}
            options={[
              { k: 'marketCap', label: t('page.columns.marketCap') },
              { k: 'change24h', label: t('page.columns.change24h') },
              { k: 'yield', label: t('page.columns.yield') },
              { k: 'earnings', label: t('page.columns.earnings') },
            ]}
          />
        </div>

        {/* Mobile : société et cours (variation sous le cours) ; les autres colonnes apparaissent avec la place */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-y-2 border-ink text-xs uppercase tracking-wider text-ink-2">
                <th className="py-2 pr-4 font-semibold">{t('page.columns.company')}</th>
                <th className="py-2 text-right font-semibold sm:pr-4">{t('page.columns.price')}</th>
                <SortTh label={t('page.columns.change24h')} k="change24h" sort={sort} setSort={setSort} className="hidden sm:table-cell" />
                <th className="hidden py-2 pr-4 font-semibold 2xl:table-cell">{t('page.columns.trend')}</th>
                <SortTh label={t('page.columns.marketCap')} k="marketCap" sort={sort} setSort={setSort} className="hidden md:table-cell" />
                <th className="hidden py-2 pr-4 text-right font-semibold xl:table-cell">{t('page.columns.pe')}</th>
                <SortTh label={t('page.columns.yield')} k="yield" sort={sort} setSort={setSort} className="hidden xl:table-cell" />
                <th className="hidden py-2 pr-4 font-semibold md:table-cell">{t('page.columns.health')}</th>
                <SortTh label={t('page.columns.earnings')} k="earnings" sort={sort} setSort={setSort} className="hidden md:table-cell" />
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-line">
                    <td colSpan={9} className="py-4">
                      <div className="h-5 w-2/3 animate-pulse bg-paper-2" />
                    </td>
                  </tr>
                ))}
              {rows.map((s) => {
                const c = s.company;
                const off = c.status === 'ACQUIRED' || c.status === 'BANKRUPT';
                const h = healthLevel(c.health);
                return (
                  <tr key={s.symbol} className={`group border-b border-line hover:bg-paper-2 ${off ? 'text-ink-3' : ''}`}>
                    <td className="py-3 pr-2 sm:pr-4">
                      <Link href={`/market/${s.symbol}`} className="flex items-center gap-2 sm:gap-3">
                        <span className="hidden size-9 shrink-0 min-[360px]:grid place-items-center text-xl" style={{ background: `color-mix(in oklch, ${s.color} 30%, transparent)` }}>
                          <Glyph name={s.emoji} color={s.color} />
                        </span>
                        <span>
                          <span className="block font-semibold group-hover:underline">{s.name}</span>
                          <span className="text-xs text-ink-2">
                            {s.symbol} · {texts.sector(c.sector)}
                            {c.status !== 'LISTED' && (
                              <span className={`ml-1 px-1 font-bold ${c.status === 'TAKEOVER' ? 'bg-acid text-ink' : 'bg-ink text-paper'}`}>{t(`status.${c.status}`)}</span>
                            )}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="py-3 text-right font-semibold whitespace-nowrap sm:pr-4">
                      {off ? '—' : <LivePrice value={s.price} className="px-1" />}
                      {!off && <span className={`num block text-sm sm:hidden ${tone(s.change24h)}`}>{f.pct(s.change24h)}</span>}
                    </td>
                    <td className={`num hidden whitespace-nowrap py-3 pr-4 text-right font-semibold sm:table-cell ${off ? '' : tone(s.change24h)}`}>{off ? '—' : f.pct(s.change24h)}</td>
                    <td className="hidden py-3 pr-4 2xl:table-cell">{!off && <Spark data={s.spark} />}</td>
                    <td className="num hidden py-3 pr-4 text-right md:table-cell">{off ? '—' : f.compactMoney(s.marketCap)}</td>
                    <td className="num hidden py-3 pr-4 text-right xl:table-cell">{c.pe && !off ? f.number(c.pe, oneDecimal) : '—'}</td>
                    <td className="num hidden py-3 pr-4 text-right xl:table-cell">{off || !c.dividendYield ? '—' : f.number(c.dividendYield, { style: 'percent', ...oneDecimal })}</td>
                    <td className={`hidden py-3 pr-4 text-sm md:table-cell ${off ? '' : h.cls}`}>{off ? t(`status.${c.status}`) : t(`health.${h.level}`)}</td>
                    <td className="num hidden py-3 text-right text-sm md:table-cell">
                      {off ? (
                        <span className="text-xs">{t('page.relistSoon')}</span>
                      ) : (
                        <>
                          {t('page.earningsIn', { time: f.countdown(c.nextEarningsAt, clock.now) })}
                          <span className="block text-xs text-ink-2">{t('page.expectedEps', { eps: f.money(c.consensus) })}</span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="rise space-y-10 [animation-delay:120ms]">
        <section>
          <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">{t('page.calendar')}</h2>
          <ol className="space-y-2">
            {calendar.map((s) => (
              <li key={s.symbol} className="flex items-baseline justify-between gap-3">
                <Link href={`/market/${s.symbol}`} className="font-semibold hover:underline">
                  <Glyph name={s.emoji} color={s.color} /> {s.name}
                </Link>
                <span className="num whitespace-nowrap text-sm text-ink-2">{f.countdown(s.company.nextEarningsAt, clock.now)}</span>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">{t('page.recent')}</h2>
          {!data?.recentReports.length ? (
            <p className="text-sm text-ink-2">{t('page.recentEmpty')}</p>
          ) : (
            <ul className="space-y-4">
              {data.recentReports.map((r, i) => (
                <li key={i}>
                  <p className="flex items-baseline justify-between gap-2">
                    <Link href={`/market/${r.symbol}`} className="font-semibold hover:underline">
                      <Glyph name={r.emoji} /> {r.name}
                    </Link>
                    <span className={`num px-1 text-sm font-bold ${VERDICT_CLS[r.verdict]}`} title={t(`verdict.${r.verdict}`)}>
                      {f.pct(r.reaction)}
                    </span>
                  </p>
                  <p className="text-sm text-ink-2">{texts.headline(r)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
