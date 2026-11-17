'use client';
import Link from 'next/link';
import { money, price } from '@/lib/format';
import { ALGO_LABEL, hash, POOL_TYPE, usePools } from '@/lib/mining';
import { MiningNav } from '@/components/mining/MiningNav';
import { Glyph } from '@/lib/icons';

export default function PoolsPage() {
  const { data } = usePools();
  return (
    <div className="rise">
      <h1 className="display mb-6 text-6xl font-extrabold">Pools & réseaux</h1>
      <MiningNav />

      <section className="mb-14">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-widest">Réseaux minables</h2>
        <p className="mb-4 max-w-3xl text-ink-2">
          Chaque coin a un algorithme et une émission fixe par minute, partagée entre tous les mineurs (joueurs et PNJ). Plus il y a de hashrate sur un
          réseau, moins chacun gagne : cherche le réseau sous-miné. Les PNJ arrivent quand le prix monte et partent quand il baisse.
        </p>
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-y-2 border-ink text-xs uppercase tracking-wider text-ink-2">
                <th className="py-2 pr-4">Coin</th>
                <th className="py-2 pr-4">Algo</th>
                <th className="py-2 pr-4 text-right">Prix</th>
                <th className="py-2 pr-4 text-right">Hashrate réseau</th>
                <th className="py-2 pr-4 text-right">dont joueurs</th>
                <th className="py-2 pr-4 text-right" title="Revenu brut pour 1 MH/s pendant 24 h, avant frais de pool">Rentabilité</th>
                <th className="py-2 text-right">Prochain halving</th>
              </tr>
            </thead>
            <tbody>
              {data?.networks.map((n) => (
                <tr key={n.symbol} className="border-b border-line">
                  <td className="py-3 pr-4">
                    <Link href={`/market/${n.symbol}`} className="font-semibold hover:underline"><Glyph name={n.emoji} /> {n.name}</Link>
                  </td>
                  <td className="py-3 pr-4">{ALGO_LABEL[n.algo]}</td>
                  <td className="py-3 pr-4 text-right">{price(n.price)}</td>
                  <td className="py-3 pr-4 text-right">{hash(n.networkHashrate)}</td>
                  <td className="py-3 pr-4 text-right text-ink-2">{((n.playerHashrate / (n.networkHashrate || 1)) * 100).toFixed(2)} %</td>
                  <td className="py-3 pr-4 text-right font-semibold">{money(n.usdPerMhDay)} <span className="text-xs font-normal text-ink-2">/ MH/s / j</span></td>
                  <td className="py-3 text-right text-sm">{new Date(n.nextHalving).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-12 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-widest">Pools</h2>
          <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
            {data?.pools.map((p) => (
              <article key={p.id} className={`border-t-2 pt-3 ${p.type === 'SHADY' ? 'border-down' : 'border-ink'}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-xl font-bold">{p.name}</h3>
                  <span className="text-sm"><Glyph name={p.emoji} /> {p.symbol}</span>
                </div>
                <p className="mt-1 text-sm text-ink-2">{p.description}</p>
                <dl className="num mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <div><dt className="inline text-ink-2">Type </dt><dd className="inline font-semibold">{POOL_TYPE[p.type].label}</dd></div>
                  <div>
                    <dt className="inline text-ink-2">Frais </dt>
                    <dd className={`inline font-semibold ${p.feeBps < 0 ? 'text-up' : ''}`}>{p.feeBps < 0 ? `+${(-p.feeBps / 100).toFixed(1)} % bonus` : `${(p.feeBps / 100).toFixed(1)} %`}</dd>
                  </div>
                  {p.federation && <div><dt className="inline text-ink-2">Fédération </dt><dd className="inline font-semibold">{p.federation}</dd></div>}
                  {p.owner && <div><dt className="inline text-ink-2">Créé par </dt><dd className="inline font-semibold"><a href={`/u/${p.owner}`} className="underline">@{p.owner}</a></dd></div>}
                  <div><dt className="inline text-ink-2">Rigs </dt><dd className="inline font-semibold">{p.miners}</dd></div>
                  {p.scamRisk > 0 && <div className="text-down"><dt className="inline">Risque de fuite </dt><dd className="inline font-semibold">{(p.scamRisk * 100).toFixed(0)} %/j</dd></div>}
                </dl>
              </article>
            ))}
          </div>
        </div>
        <aside className="space-y-6 text-sm">
          <h2 className="border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Comment choisir</h2>
          {Object.entries(POOL_TYPE).map(([k, v]) => (
            <p key={k}><strong>{v.label}</strong> : {v.help}</p>
          ))}
          <p>
            <strong>Fédérations</strong> : branche des rigs sur 3 pools différents d’une même fédération et tous ses pools te prennent 1 % de frais en
            moins. Diversifier rapporte.
          </p>
        </aside>
      </section>
    </div>
  );
}
