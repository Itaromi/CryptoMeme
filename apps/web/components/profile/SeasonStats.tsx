'use client';
import { useTranslations } from 'next-intl';
import { tone, useFormat } from '@/lib/format';
import { Glyph } from '@/lib/icons';
import { NetWorthChart } from '@/components/NetWorthChart';
import { Stat } from '@/components/ui/Stat';
import { Exposure } from './Exposure';
import { Heatmap } from './Heatmap';
import type { SeasonStatsView } from './types';

const H2 = 'mb-4 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest';

/** Tout ce que le profil montre de la saison en cours : patrimoine, portefeuille, statistiques, flux, minage. */
export function SeasonStats({ s }: { s: SeasonStatsView }) {
  const t = useTranslations('profile');
  const f = useFormat();
  const allocTotal = s.allocation.reduce((a, b) => a + b.value, 0) || 1;
  const allocation = [...s.allocation].sort((a, b) => b.value - a.value);
  const share = (v: number) => f.number(v, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const orDash = (v: number | null, fmt: (n: number) => string) => (v == null ? '—' : fmt(v));

  return (
    <>
      <section className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest">{t('netWorth')}</h2>
            <p className="num">
              <span className="text-2xl font-bold">{f.money(s.netWorth)}</span>{' '}
              <span className={`font-semibold ${tone(s.performance)}`}>{f.pct(s.performance)}</span>
            </p>
          </div>
          <NetWorthChart data={s.history} />
        </div>
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest">{t('portfolio')}</h2>
          <ul className="space-y-2">
            {allocation.map((a) => (
              <li key={a.symbol} className="num">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold"><Glyph name={a.emoji} color={a.color} /> {a.symbol}</span>
                  <span>{share(a.value / allocTotal)}</span>
                </div>
                <div className="mt-1 h-2 bg-paper-2">
                  <div className="h-full" style={{ width: `${(a.value / allocTotal) * 100}%`, background: a.color }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h2 className={H2}>{t('advanced.title')}</h2>
        <dl className="num grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
          <Stat size="lg" label={t('advanced.realizedPnl')} className={tone(s.realizedPnl)}>{f.money(s.realizedPnl)}</Stat>
          <Stat size="lg" label={t('advanced.winRate')} hint={t('advanced.winRateHint')}>{orDash(s.winRate, (v) => f.pct(v, false))}</Stat>
          <Stat size="lg" label={t('advanced.bestTrade')} className="text-up">{orDash(s.bestTrade, f.money)}</Stat>
          <Stat size="lg" label={t('advanced.worstTrade')} className="text-down">{orDash(s.worstTrade, f.money)}</Stat>
          <Stat size="lg" label={t('advanced.trades')}>{f.number(s.trades)}</Stat>
          <Stat size="lg" label={t('advanced.volume')}>{f.money(s.volume)}</Stat>
          <Stat size="lg" label={t('advanced.fees')}>{f.money(s.fees)}</Stat>
          <Stat size="lg" label={t('advanced.peak')}>{f.money(s.peakNetWorth)}</Stat>
          <Stat size="lg" label={t('advanced.drawdown')} className={s.maxDrawdown > 0.3 ? 'text-down' : ''} hint={t('advanced.drawdownHint')}>
            {f.pct(-s.maxDrawdown)}
          </Stat>
          <Stat size="lg" label={t('advanced.sharpe')} hint={t('advanced.sharpeHint')}>
            {orDash(s.sharpe, (v) => f.number(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
          </Stat>
          <Stat size="lg" label={t('advanced.favorite')}>{s.favorite ?? '—'}</Stat>
        </dl>
      </section>

      <section className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 className={H2}>{t('exposure.title')}</h2>
          <Exposure e={s.exposure} />
          <h2 className={`mt-10 ${H2}`}>{t('flows.title')}</h2>
          <dl className="num grid grid-cols-2 gap-x-8 gap-y-5">
            <Stat size="lg" label={t('flows.taxes')} className={s.flows.taxes ? 'text-down' : ''}>{f.money(s.flows.taxes)}</Stat>
            <Stat size="lg" label={t('flows.dividends')} className={s.flows.dividends ? 'text-up' : ''}>{f.money(s.flows.dividends)}</Stat>
            <Stat size="lg" label={t('flows.bank')} className={tone(s.flows.bankNet)}>{f.money(s.flows.bankNet)}</Stat>
            <Stat size="lg" label={t('flows.events')} className={tone(s.flows.events)}>{f.money(s.flows.events)}</Stat>
            <Stat size="lg" label={t('flows.shop')}>{f.money(s.flows.shop)}</Stat>
          </dl>
        </div>
        <div>
          <h2 className={H2}>{t('heatmap.title')}</h2>
          <Heatmap grid={s.heatmap} />
        </div>
      </section>

      {s.mining.rigs > 0 && (
        <section>
          <h2 className={H2}>{t('mining.title')}</h2>
          <dl className="num grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
            <Stat size="lg" label={t('mining.rigs')}>{f.number(s.mining.rigs)}</Stat>
            <Stat size="lg" label={t('mining.minedValue')} className="text-up">{f.money(s.mining.minedValue)}</Stat>
            <Stat size="lg" label={t('mining.electricity')} className="text-down">{f.money(s.mining.electricity)}</Stat>
            <Stat size="lg" label={t('mining.hardware')}>{f.money(s.mining.hardwareValue)}</Stat>
            <Stat size="lg" label={t('mining.yield')} hint={t('mining.yieldHint')}>
              {s.mining.electricity > 0
                ? t('mining.yieldValue', { ratio: f.number(s.mining.minedValue / s.mining.electricity, { maximumFractionDigits: 2 }) })
                : '—'}
            </Stat>
          </dl>
        </section>
      )}
    </>
  );
}
