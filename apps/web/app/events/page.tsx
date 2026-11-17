'use client';
import { useNow, useTranslations } from 'next-intl';
import { type GameEventView, MOOD_STYLE, useEvents } from '@/lib/economy';
import { useFormat } from '@/lib/format';
import { useTexts } from '@/lib/texts';

/** Titres et descriptions des événements : traduits depuis la clé de l'API (repli : textes stockés). */
export default function EventsPage() {
  const t = useTranslations('events.page');
  const f = useFormat();
  const texts = useTexts();
  const { data } = useEvents();
  const now = useNow({ updateInterval: 1000 });
  const live = [...(data?.upcoming ?? []), ...(data?.active ?? [])];

  return (
    <div className="rise">
      <h1 className="display mb-2 text-6xl font-extrabold">{t('title')}</h1>
      <p className="mb-10 max-w-2xl text-lg text-ink-2">{t('intro')}</p>

      <section className="mb-14">
        <h2 className="mb-4 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">{t('liveTitle')}</h2>
        {!live.length ? (
          <p className="text-lg text-ink-2">{t('empty')}</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {live.map((e) => (
              <article key={e.id} className={`border-2 border-ink p-5 ${MOOD_STYLE[e.mood].bg}`}>
                <p className="text-xs font-bold uppercase tracking-widest">
                  {e.status === 'SCHEDULED'
                    ? t('strikesIn', { time: f.countdown(e.startsAt, now) })
                    : e.endsAt
                      ? t('remaining', { time: f.countdown(e.endsAt, now) })
                      : t('ongoing')}
                </p>
                <h3 className="display mt-2 text-4xl font-bold">{texts.text(e.text, e.title, 'title')}</h3>
                <p className="mt-2 text-lg">{texts.text(e.text, e.description, 'description')}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">{t('historyTitle')}</h2>
        <ul className="divide-y divide-line">
          {data?.recent.map((e) => <HistoryItem key={e.id} e={e} />)}
        </ul>
        {data && !data.recent.length && <p className="text-ink-2">{t('historyEmpty')}</p>}
      </section>
    </div>
  );
}

function HistoryItem({ e }: { e: GameEventView }) {
  const t = useTranslations('events');
  const f = useFormat();
  const texts = useTexts();
  const now = useNow({ updateInterval: 30_000 });
  const r = e.result;
  return (
    <li className="grid gap-x-6 gap-y-1 py-3 md:grid-cols-[160px_1fr_auto]">
      <span className="text-sm text-ink-2">{f.ago(e.startsAt, now)}</span>
      <span>
        <span role="img" aria-label={t(`mood.${e.mood}`)} title={t(`mood.${e.mood}`)} className={`mr-2 inline-block size-2.5 ${MOOD_STYLE[e.mood].bg} border border-ink`} />
        <strong className={e.status === 'CANCELLED' ? 'line-through' : ''}>{texts.text(e.text, e.title, 'title')}</strong>
        {e.byAdmin && <span className="ml-2 text-xs text-ink-3">{t('page.byAdmin')}</span>}
        <span className="block text-sm text-ink-2">{texts.text(e.text, e.description, 'description')}</span>
      </span>
      <span className="num text-right text-sm">
        {e.status === 'CANCELLED' ? (
          t('page.cancelled')
        ) : r ? (
          <>
            {t('page.affected', { count: r.affected })}
            {!!r.total && <span className={`block font-semibold ${r.total > 0 ? 'text-up' : 'text-down'}`}>{r.total > 0 ? '+' : ''}{f.money(r.total)}</span>}
            {r.detail && <span className="block text-xs text-ink-2">{texts.text(r.detailText, r.detail)}</span>}
          </>
        ) : null}
      </span>
    </li>
  );
}
