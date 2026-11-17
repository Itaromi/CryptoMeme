'use client';
import { useNow, useTranslations } from 'next-intl';
import { useFormat } from '@/lib/format';
import type { GameText } from '@cryptomeme/shared';
import { useTexts } from '@/lib/texts';

const EVENT_TYPES = ['RUG_PULL', 'JUMP', 'EVENT', 'EARNINGS', 'NEWS', 'DIVIDEND', 'OPEN', 'TAKEOVER', 'BANKRUPTCY', 'SPLIT', 'IPO'] as const;
type EventType = (typeof EVENT_TYPES)[number];
const isEventType = (v: string): v is EventType => (EVENT_TYPES as readonly string[]).includes(v);

/** Historique des événements d'un actif (détail traduit depuis la clé de l'API, sinon le texte stocké). */
export function AssetEvents({ events }: { events: Array<{ type: string; detail: string; text: GameText | null; at: string }> }) {
  const t = useTranslations('market.asset.history');
  const f = useFormat();
  const texts = useTexts();
  const now = useNow({ updateInterval: 30_000 });
  return (
    <section>
      <h2 className="mb-3 border-b-2 border-ink pb-1 text-sm font-bold uppercase tracking-widest">{t('title')}</h2>
      {events.length === 0 ? (
        <p className="text-sm text-ink-2">{t('empty')}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {events.map((e, i) => (
            <li key={i} className={e.type === 'RUG_PULL' ? 'font-bold text-down' : ''}>
              {t('line', { label: isEventType(e.type) ? t(`type.${e.type}`) : t('typeFallback'), detail: texts.text(e.text, e.detail) })}
              <span className="ml-2 text-xs font-normal text-ink-3">{f.ago(e.at, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
