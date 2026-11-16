'use client';
import { countdown } from '@/lib/economy';
import { money } from '@/lib/format';
import { healthLabel, pctFr, StockDetail, useMarketClock, VERDICT } from '@/lib/stocks';

const num = (n: number, d = 2) => n.toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d });

/** Fondamentaux, résultats et dividendes d'une action. */
export function CompanyPanel({ c }: { c: StockDetail }) {
  const { now } = useMarketClock();
  const h = healthLabel(c.health);
  const listed = c.status === 'LISTED' || c.status === 'TAKEOVER';

  return (
    <div className="space-y-10">
      {c.offer && c.status === 'TAKEOVER' && (
        <div className="border-2 border-ink bg-acid p-5">
          <p className="text-xs font-bold uppercase tracking-widest">OPA en cours · verdict dans {countdown(c.offer.endsAt, now)}</p>
          <p className="display mt-1 text-3xl font-bold">
            {c.offer.by} offre {money(c.offer.price)} par action
          </p>
          <p className="mt-1">Si l'offre passe, chaque action détenue est rachetée à ce prix et le titre quitte la cote. Si elle échoue, le cours retombe.</p>
        </div>
      )}
      {!listed && (
        <div className="border-2 border-ink bg-ink p-5 text-paper">
          <p className="display text-3xl font-bold">{c.status === 'BANKRUPT' ? 'Faillite. Rideau.' : 'Rachetée, retirée de la cote.'}</p>
          <p className="mt-1 text-paper/80">La société reviendra en bourse environ 24 h après, avec un nouveau prix d'introduction.</p>
        </div>
      )}

      <section>
        <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Fondamentaux</h2>
        <dl className="num grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-4">
          <Item label="Secteur">{c.sector}</Item>
          <Item label="PDG">{c.ceo}</Item>
          <Item label="BPA trimestriel">{num(c.eps)} $</Item>
          <Item label="PER actuel" hint={`Normal pour le secteur : ${num(c.fairPe, 0)}`}>{c.pe ? num(c.pe, 1) : '—'}</Item>
          <Item label="Valeur fondamentale" hint="BPA annualisé × PER du secteur">{money(c.fundamental)}</Item>
          <Item label="Rendement du dividende">{c.dividendYield ? `${num(c.dividendYield * 100, 1)} % / an` : '—'}</Item>
          <Item label="Croissance attendue">{pctFr(Math.exp(c.growth) - 1)} / trim.</Item>
          <Item label="Santé financière"><span className={h.cls}>{h.label}</span></Item>
        </dl>
      </section>

      {listed && (
        <section className="flex flex-wrap items-end justify-between gap-4 border-2 border-ink p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-ink-2">Prochains résultats (T{c.quarter + 1})</p>
            <p className="display text-4xl font-bold">dans {countdown(c.nextEarningsAt, now)}</p>
          </div>
          <div className="num text-right">
            <p className="text-xs uppercase tracking-wider text-ink-2">BPA attendu par les analystes</p>
            <p className="text-2xl font-semibold">{num(c.consensus)} $</p>
          </div>
          <p className="w-full text-sm text-ink-2">
            Au-dessus du consensus, le cours grimpe ; en dessous, il plonge. Une publication hors séance se joue à l'ouverture (gap).
          </p>
        </section>
      )}

      <div className="grid gap-10 md:grid-cols-2">
        <section>
          <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Résultats trimestriels</h2>
          {!c.reports.length ? (
            <p className="text-sm text-ink-2">Pas encore de publication cette saison.</p>
          ) : (
            <table className="num w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-ink-2">
                  <th className="py-1 font-semibold">Trim.</th>
                  <th className="py-1 text-right font-semibold">Attendu</th>
                  <th className="py-1 text-right font-semibold">Publié</th>
                  <th className="py-1 text-right font-semibold">Verdict</th>
                  <th className="py-1 text-right font-semibold">Cours</th>
                </tr>
              </thead>
              <tbody>
                {c.reports.map((r) => (
                  <tr key={r.quarter} className="border-t border-line">
                    <td className="py-1.5">T{r.quarter}</td>
                    <td className="py-1.5 text-right text-ink-2">{num(r.consensus)} $</td>
                    <td className="py-1.5 text-right font-semibold">{num(r.actual)} $</td>
                    <td className="py-1.5 text-right"><span className={`px-1 font-semibold ${VERDICT[r.verdict].cls}`}>{VERDICT[r.verdict].label}</span></td>
                    <td className={`py-1.5 text-right font-semibold ${r.reaction >= 0 ? 'text-up' : 'text-down'}`}>{pctFr(r.reaction)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section>
          <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Dividendes</h2>
          {!c.dividends.length ? (
            <p className="text-sm text-ink-2">{c.payout ? 'Aucun dividende versé pour l’instant.' : 'Cette société ne verse pas de dividende : elle « réinvestit ».'}</p>
          ) : (
            <ul className="num space-y-1.5 text-sm">
              {c.dividends.map((d, i) => (
                <li key={i} className="flex justify-between gap-4 border-b border-line pb-1">
                  <span className="font-semibold">{num(Number(d.perShare), 4)} $ / action</span>
                  <span className="text-ink-2">
                    {d.paidAt ? `versé · ${d.holders} actionnaire${d.holders > 1 ? 's' : ''}` : `détachement dans ${countdown(d.recordAt, now)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-3">Le dividende est versé à ceux qui détiennent l'action au moment du détachement ; le cours baisse alors du même montant.</p>
        </section>
      </div>
    </div>
  );
}

function Item({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div title={hint}>
      <dt className="text-xs uppercase tracking-wider text-ink-2">{label}</dt>
      <dd className="text-lg font-semibold">{children}</dd>
    </div>
  );
}
