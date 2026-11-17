'use client';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/lib/format';
import { healthLevel, type StockDetail, useMarketClock, VERDICT_CLS } from '@/lib/stocks';
import { Stat } from '@/components/ui/Stat';
import { useTexts } from '@/lib/texts';

/** Fondamentaux, résultats et dividendes d'une action. */
export function CompanyPanel({ c }: { c: StockDetail }) {
  const t = useTranslations('stocks.company');
  const ts = useTranslations('stocks');
  const f = useFormat();
  const texts = useTexts();
  const { now } = useMarketClock();
  const h = healthLevel(c.health);
  const listed = c.status === 'LISTED' || c.status === 'TAKEOVER';
  const oneDecimal = { minimumFractionDigits: 1, maximumFractionDigits: 1 };

  return (
    <div className="space-y-10">
      {c.offer && c.status === 'TAKEOVER' && (
        <div className="border-2 border-ink bg-acid p-5">
          <p className="text-xs font-bold uppercase tracking-widest">{t('takeover.label', { time: f.countdown(c.offer.endsAt, now) })}</p>
          <p className="display mt-1 text-3xl font-bold">{t('takeover.offer', { buyer: texts.param(c.offer.byText), price: f.money(c.offer.price) })}</p>
          <p className="mt-1">{t('takeover.explain')}</p>
        </div>
      )}
      {!listed && (
        <div className="border-2 border-ink bg-ink p-5 text-paper">
          <p className="display text-3xl font-bold">{c.status === 'BANKRUPT' ? t('bankrupt') : t('acquired')}</p>
          <p className="mt-1 text-paper/80">{t('relist')}</p>
        </div>
      )}

      <section>
        <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">{t('fundamentals.title')}</h2>
        <dl className="num grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-4">
          <Stat label={t('fundamentals.sector')}>{texts.sector(c.sector)}</Stat>
          <Stat label={t('fundamentals.ceo')}>{c.ceo}</Stat>
          <Stat label={t('fundamentals.eps')}>{f.money(c.eps)}</Stat>
          <Stat label={t('fundamentals.pe')} hint={t('fundamentals.peHint', { fairPe: f.number(c.fairPe, { maximumFractionDigits: 0 }) })}>
            {c.pe ? f.number(c.pe, oneDecimal) : '—'}
          </Stat>
          <Stat label={t('fundamentals.fundamental')} hint={t('fundamentals.fundamentalHint')}>
            {f.money(c.fundamental)}
          </Stat>
          <Stat label={t('fundamentals.dividendYield')}>
            {c.dividendYield ? t('fundamentals.yieldValue', { value: f.number(c.dividendYield, { style: 'percent', ...oneDecimal }) }) : '—'}
          </Stat>
          <Stat label={t('fundamentals.growth')}>{t('fundamentals.growthValue', { value: f.pct(Math.exp(c.growth) - 1) })}</Stat>
          <Stat label={t('fundamentals.health')}>
            <span className={h.cls}>{ts(`health.${h.level}`)}</span>
          </Stat>
        </dl>
      </section>

      {listed && (
        <section className="flex flex-wrap items-end justify-between gap-4 border-2 border-ink p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-ink-2">{t('next.label', { quarter: c.quarter + 1 })}</p>
            <p className="display text-4xl font-bold">{t('next.in', { time: f.countdown(c.nextEarningsAt, now) })}</p>
          </div>
          <div className="num text-right">
            <p className="text-xs uppercase tracking-wider text-ink-2">{t('next.consensus')}</p>
            <p className="text-2xl font-semibold">{f.money(c.consensus)}</p>
          </div>
          <p className="w-full text-sm text-ink-2">{t('next.explain')}</p>
        </section>
      )}

      <div className="grid gap-10 md:grid-cols-2">
        <section>
          <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">{t('reports.title')}</h2>
          {!c.reports.length ? (
            <p className="text-sm text-ink-2">{t('reports.empty')}</p>
          ) : (
            <table className="num w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-ink-2">
                  <th className="py-1 font-semibold">{t('reports.quarter')}</th>
                  <th className="py-1 text-right font-semibold">{t('reports.expected')}</th>
                  <th className="py-1 text-right font-semibold">{t('reports.actual')}</th>
                  <th className="py-1 text-right font-semibold">{t('reports.verdict')}</th>
                  <th className="py-1 text-right font-semibold">{t('reports.price')}</th>
                </tr>
              </thead>
              <tbody>
                {c.reports.map((r) => (
                  <tr key={r.quarter} className="border-t border-line">
                    <td className="py-1.5">{t('reports.quarterLabel', { quarter: r.quarter })}</td>
                    <td className="py-1.5 text-right text-ink-2">{f.money(r.consensus)}</td>
                    <td className="py-1.5 text-right font-semibold">{f.money(r.actual)}</td>
                    <td className="py-1.5 text-right">
                      <span className={`px-1 font-semibold ${VERDICT_CLS[r.verdict]}`}>{ts(`verdict.${r.verdict}`)}</span>
                    </td>
                    <td className={`py-1.5 text-right font-semibold ${r.reaction >= 0 ? 'text-up' : 'text-down'}`}>{f.pct(r.reaction)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section>
          <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">{t('dividends.title')}</h2>
          {!c.dividends.length ? (
            <p className="text-sm text-ink-2">{c.payout ? t('dividends.none') : t('dividends.noPayout')}</p>
          ) : (
            <ul className="num space-y-1.5 text-sm">
              {c.dividends.map((d, i) => (
                <li key={i} className="flex justify-between gap-4 border-b border-line pb-1">
                  <span className="font-semibold">{t('dividends.perShare', { amount: f.price(d.perShare) })}</span>
                  <span className="text-ink-2">
                    {d.paidAt ? t('dividends.paid', { holders: d.holders }) : t('dividends.recordIn', { time: f.countdown(d.recordAt, now) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-3">{t('dividends.explain')}</p>
        </section>
      </div>
    </div>
  );
}
