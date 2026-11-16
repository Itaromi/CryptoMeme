'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { BankView, countdown, useBanks } from '@/lib/economy';
import { money } from '@/lib/format';

const pct = (v: number) => `${Math.round(v * 100)} %`;

/** Les avantages d'une banque en une liste lisible ; « — » quand elle n'offre rien. */
function perks(b: BankView): Array<[string, string, 'good' | 'bad' | '']> {
  const out: Array<[string, string, 'good' | 'bad' | '']> = [
    ['Frais de trading', `${(b.tradingFeeBps / 100).toFixed(2)} %`, b.tradingFeeBps < 30 ? 'good' : ''],
    ['Intérêts sur le cash', b.interestMonthly ? `${b.interestMonthly.toLocaleString('fr-FR')} % / mois` : '—', b.interestMonthly ? 'good' : ''],
    ['Remise électricité', b.elecDiscount ? `−${pct(b.elecDiscount)}` : '—', b.elecDiscount ? 'good' : ''],
    ['Assurance matériel', b.insuranceRate ? pct(b.insuranceRate) : '—', b.insuranceRate ? 'good' : ''],
    ['Bouclier fiscal', b.taxShield ? `${pct(b.taxShield)} des taxes évitées` : '—', b.taxShield ? 'good' : ''],
    ['Protection piratage', b.hackShield ? pct(b.hackShield) : '—', b.hackShield ? 'good' : ''],
  ];
  if (b.failRiskPerDay) out.push(['Risque de faillite', `${(b.failRiskPerDay * 100).toLocaleString('fr-FR')} % / jour`, 'bad']);
  if (b.depositGuarantee) out.push(['Garantie des dépôts', `${money(b.depositGuarantee)} max`, 'bad']);
  if (b.taxShield) out.push(['Contrôles fiscaux', 'Cible prioritaire', 'bad']);
  return out;
}

export default function BanksPage() {
  const { data: me } = useMe();
  const { data } = useBanks();
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  async function join(b: BankView) {
    setMsg(null);
    try {
      await api('/banks/switch', { method: 'POST', json: { bankId: b.id } });
      setMsg({ id: b.id, ok: true, text: `Bienvenue chez ${b.name}.` });
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ['banks'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    } catch (e) {
      setMsg({ id: b.id, ok: false, text: (e as Error).message });
    }
  }

  const cooldown = data?.current && new Date(data.current.canSwitchAt).getTime() > Date.now() ? data.current.canSwitchAt : null;

  return (
    <div className="rise">
      <h1 className="display mb-2 text-6xl font-extrabold">Banques</h1>
      <p className="mb-10 max-w-2xl text-lg text-ink-2">
        Ta banque change tes frais, tes intérêts, ta facture d’électricité et ta protection contre les mauvaises surprises. Les meilleures exigent un
        patrimoine minimum, et certaines sont… risquées. Un changement par 24 h.
      </p>
      {cooldown && <p className="mb-6 text-sm text-ink-2">Prochain changement possible dans {countdown(cooldown)}.</p>}

      <div className="grid gap-x-8 gap-y-12 md:grid-cols-2 xl:grid-cols-3">
        {data?.banks.map((b) => {
          const current = data.current?.bankId === b.id;
          const tooPoor = data.netWorth != null && Number(data.netWorth) < Number(b.minNetWorth);
          return (
            <article key={b.id} className={`flex flex-col border-t-[6px] pt-4 ${current ? 'bg-paper-2 px-4 pb-4' : ''}`} style={{ borderColor: b.color }}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="display text-3xl font-bold">{b.name}</h2>
                {current && <span className="bg-ink px-1.5 text-xs font-bold uppercase tracking-widest text-paper">Ta banque</span>}
              </div>
              <p className="mt-1 text-ink-2">{b.description}</p>
              <p className="num mt-4 text-2xl font-semibold">
                {Number(b.monthlyFee) ? `${money(b.monthlyFee)} / mois` : 'Gratuite'}
              </p>
              <p className="num text-sm text-ink-2">
                {Number(b.openingFee) ? `Ouverture ${money(b.openingFee)}` : 'Sans frais d’ouverture'}
                {Number(b.minNetWorth) ? ` · patrimoine min. ${money(b.minNetWorth)}` : ''}
                {b.clients != null && ` · ${b.clients} client${b.clients > 1 ? 's' : ''}`}
              </p>
              <dl className="num mt-4 flex-1 space-y-1.5 text-sm">
                {perks(b).map(([k, v, t]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-line pb-1">
                    <dt className="text-ink-2">{k}</dt>
                    <dd className={`text-right font-semibold ${t === 'good' ? 'text-up' : t === 'bad' ? 'text-down' : ''}`}>{v}</dd>
                  </div>
                ))}
              </dl>
              {me && !current && (
                <div className="mt-4">
                  {confirm === b.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button className="btn bg-acid py-1.5 text-sm" onClick={() => join(b)}>
                        Confirmer{Number(b.openingFee) ? ` (−${money(b.openingFee)})` : ''}
                      </button>
                      <button className="text-sm underline" onClick={() => setConfirm(null)}>Annuler</button>
                    </div>
                  ) : (
                    <button className="btn bg-paper py-1.5 text-sm" disabled={!!cooldown || tooPoor} onClick={() => setConfirm(b.id)}>
                      {tooPoor ? `Patrimoine insuffisant` : 'Ouvrir un compte'}
                    </button>
                  )}
                  {msg?.id === b.id && <p className={`mt-2 text-sm font-semibold ${msg.ok ? 'text-up' : 'text-down'}`}>{msg.text}</p>}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {!me && (
        <p className="mt-10 text-lg">
          <Link href="/register" className="font-semibold underline">Crée un compte</Link> : tout le monde démarre à la Néo-Banque Gratos.
        </p>
      )}
    </div>
  );
}
