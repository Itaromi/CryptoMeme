'use client';
import { useTranslations } from 'next-intl';
import { type BankView } from '@/lib/economy';
import { type Format, useFormat } from '@/lib/format';

type Tone = 'good' | 'bad' | '';
type Perk = { key: string; label: string; value: string; tone: Tone };
type BanksT = ReturnType<typeof useTranslations<'banks.perks'>>;

/** Les avantages d'une banque en une liste lisible ; « — » quand elle n'offre rien. */
function perks(b: BankView, t: BanksT, f: Format): Perk[] {
  const pct = (v: number) => f.pct(v, false);
  const out: Perk[] = [
    { key: 'tradingFee', label: t('tradingFee'), value: pct(b.tradingFeeBps / 10_000), tone: b.tradingFeeBps < 30 ? 'good' : '' },
    {
      key: 'interest',
      label: t('interest'),
      // interestMonthly est déjà en pourcentage (0,5 = 0,5 % par mois)
      value: b.interestMonthly ? t('interestValue', { value: pct(b.interestMonthly / 100) }) : '—',
      tone: b.interestMonthly ? 'good' : '',
    },
    { key: 'elecDiscount', label: t('elecDiscount'), value: b.elecDiscount ? `−${pct(b.elecDiscount)}` : '—', tone: b.elecDiscount ? 'good' : '' },
    { key: 'insurance', label: t('insurance'), value: b.insuranceRate ? pct(b.insuranceRate) : '—', tone: b.insuranceRate ? 'good' : '' },
    {
      key: 'taxShield',
      label: t('taxShield'),
      value: b.taxShield ? t('taxShieldValue', { value: pct(b.taxShield) }) : '—',
      tone: b.taxShield ? 'good' : '',
    },
    { key: 'hackShield', label: t('hackShield'), value: b.hackShield ? pct(b.hackShield) : '—', tone: b.hackShield ? 'good' : '' },
  ];
  if (b.failRiskPerDay) out.push({ key: 'failRisk', label: t('failRisk'), value: t('failRiskValue', { value: pct(b.failRiskPerDay) }), tone: 'bad' });
  if (b.depositGuarantee)
    out.push({
      key: 'depositGuarantee',
      label: t('depositGuarantee'),
      value: t('depositGuaranteeValue', { amount: f.money(b.depositGuarantee) }),
      tone: 'bad',
    });
  if (b.taxShield) out.push({ key: 'taxAudits', label: t('taxAudits'), value: t('taxAuditsValue'), tone: 'bad' });
  return out;
}

/** Fiche d'une banque. Le pied de carte (ouverture de compte) est passé en `children`. */
export function BankCard({ bank: b, current, children }: { bank: BankView; current: boolean; children?: React.ReactNode }) {
  const t = useTranslations('banks');
  const tp = useTranslations('banks.perks');
  const f = useFormat();
  const conditions = [
    Number(b.openingFee) ? t('openingFee', { fee: f.money(b.openingFee) }) : t('noOpeningFee'),
    Number(b.minNetWorth) ? t('minNetWorth', { amount: f.money(b.minNetWorth) }) : null,
    b.clients != null ? t('clients', { count: b.clients }) : null,
  ].filter(Boolean);

  return (
    <article className={`flex flex-col border-t-[6px] pt-4 ${current ? 'bg-paper-2 px-4 pb-4' : ''}`} style={{ borderColor: b.color }}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="display text-3xl font-bold">{b.name}</h2>
        {current && <span className="bg-ink px-1.5 text-xs font-bold uppercase tracking-widest text-paper">{t('yourBank')}</span>}
      </div>
      <p className="mt-1 text-ink-2">{b.description}</p>
      <p className="num mt-4 text-2xl font-semibold">{Number(b.monthlyFee) ? t('monthlyFee', { fee: f.money(b.monthlyFee) }) : t('free')}</p>
      <p className="num text-sm text-ink-2">{conditions.join(' · ')}</p>
      <dl className="num mt-4 flex-1 space-y-1.5 text-sm">
        {perks(b, tp, f).map((p) => (
          <div key={p.key} className="flex justify-between gap-4 border-b border-line pb-1">
            <dt className="text-ink-2">{p.label}</dt>
            <dd className={`text-right font-semibold ${p.tone === 'good' ? 'text-up' : p.tone === 'bad' ? 'text-down' : ''}`}>{p.value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </article>
  );
}
