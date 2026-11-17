'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNow, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useNotifications } from '@/lib/economy';
import { tone, useFormat } from '@/lib/format';
import { useApiMutation } from '@/lib/mutation';
import { queryKeys } from '@/lib/queryKeys';
import { useTexts } from '@/lib/texts';

/** Délai avant de rafraîchir la liste après lecture : les nouvelles restent surlignées le temps d'y jeter un œil. */
const UNREAD_HIGHLIGHT_MS = 4000;

export function NotificationBell() {
  const t = useTranslations('notifications');
  const f = useFormat();
  const texts = useTexts();
  const now = useNow({ updateInterval: 30_000 });
  const { data } = useNotifications(true);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const markRead = useApiMutation({
    mutationFn: () => api('/notifications/read', { method: 'POST', json: {} }),
    onSuccess: () => {
      setTimeout(() => void qc.invalidateQueries({ queryKey: queryKeys.notifications }), UNREAD_HIGHLIGHT_MS);
    },
  });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (e.target instanceof Node && !ref.current?.contains(e.target)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && data?.unread) markRead.mutate();
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={toggle} aria-expanded={open} aria-label={t('label', { unread: data?.unread ?? 0 })} className="relative px-1.5 py-1 hover:bg-paper-2">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {!!data?.unread && (
          <span className="num absolute -top-1 -right-1 min-w-5 bg-down px-1 text-center text-xs font-bold text-paper">{data.unread > 9 ? '9+' : data.unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,380px)] border-2 border-ink bg-paper shadow-[4px_4px_0_var(--color-ink)]">
          <p className="border-b-2 border-ink px-4 py-2 text-xs font-bold uppercase tracking-widest">{t('title')}</p>
          {!data?.items.length ? (
            <p className="p-4 text-sm text-ink-2">{t('empty')}</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {data.items.map((n) => {
                // titre et texte traduits depuis la clé de l'API (repli : textes français stockés)
                const body = (
                  <>
                    <span className="flex justify-between gap-3">
                      <strong className="text-sm">{texts.text(n.text, n.title, 'title')}</strong>
                      {n.amount && (
                        <span className={`num text-sm font-semibold ${tone(Number(n.amount))}`}>
                          {Number(n.amount) > 0 ? '+' : ''}
                          {f.money(n.amount)}
                        </span>
                      )}
                    </span>
                    <span className="block text-sm text-ink-2">{texts.text(n.text, n.body, 'body')}</span>
                    <span className="text-xs text-ink-3">{f.ago(n.createdAt, now)}</span>
                  </>
                );
                return (
                  <li key={n.id} className={n.readAt ? '' : 'bg-paper-2'}>
                    {n.link ? (
                      <Link href={n.link} onClick={() => setOpen(false)} className="block px-4 py-2.5 hover:bg-paper-3">{body}</Link>
                    ) : (
                      <div className="px-4 py-2.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
