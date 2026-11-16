'use client';
import { useEffect, useState } from 'react';
import { countdown, GameEventView, MOOD_STYLE, useEvents } from '@/lib/economy';
import { ago, money } from '@/lib/format';

export default function EventsPage() {
  const { data } = useEvents();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const live = [...(data?.upcoming ?? []), ...(data?.active ?? [])];

  return (
    <div className="rise">
      <h1 className="display mb-2 text-6xl font-extrabold">L’actu</h1>
      <p className="mb-10 max-w-2xl text-lg text-ink-2">
        Taxes, piratages, héritages, krachs, canicules… Certains événements sont annoncés à l’avance : c’est le moment de vendre, d’acheter ou de
        couper tes rigs.
      </p>

      <section className="mb-14">
        <h2 className="mb-4 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">À venir et en cours</h2>
        {!live.length ? (
          <p className="text-lg text-ink-2">Rien à l’horizon. Profite, ça ne durera pas.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {live.map((e) => (
              <article key={e.id} className={`border-2 border-ink p-5 ${MOOD_STYLE[e.mood].bg}`}>
                <p className="text-xs font-bold uppercase tracking-widest">
                  {e.status === 'SCHEDULED' ? `Frappe dans ${countdown(e.startsAt, now)}` : `Encore ${countdown(e.endsAt!, now)}`}
                </p>
                <h3 className="display mt-2 text-4xl font-bold">{e.title}</h3>
                <p className="mt-2 text-lg">{e.description}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">Historique</h2>
        <ul className="divide-y divide-line">
          {data?.recent.map((e) => <HistoryItem key={e.id} e={e} />)}
        </ul>
        {data && !data.recent.length && <p className="text-ink-2">Aucun événement pour l’instant.</p>}
      </section>
    </div>
  );
}

function HistoryItem({ e }: { e: GameEventView }) {
  const r = e.result;
  return (
    <li className="grid gap-x-6 gap-y-1 py-3 md:grid-cols-[160px_1fr_auto]">
      <span className="text-sm text-ink-2">{ago(e.startsAt)}</span>
      <span>
        <span className={`mr-2 inline-block size-2.5 ${MOOD_STYLE[e.mood].bg} border border-ink`} aria-hidden />
        <strong className={e.status === 'CANCELLED' ? 'line-through' : ''}>{e.title}</strong>
        {e.byAdmin && <span className="ml-2 text-xs text-ink-3">(déclenché par l’admin)</span>}
        <span className="block text-sm text-ink-2">{e.description}</span>
      </span>
      <span className="num text-right text-sm">
        {e.status === 'CANCELLED' ? 'Annulé' : r ? (
          <>
            {r.affected} joueur{r.affected > 1 ? 's' : ''} touché{r.affected > 1 ? 's' : ''}
            {!!r.total && <span className={`block font-semibold ${r.total > 0 ? 'text-up' : 'text-down'}`}>{r.total > 0 ? '+' : ''}{money(r.total)}</span>}
            {r.detail && <span className="block text-xs text-ink-2">{r.detail}</span>}
          </>
        ) : null}
      </span>
    </li>
  );
}
