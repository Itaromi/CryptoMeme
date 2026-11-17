'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { useErrorMessage } from '@/lib/texts';
import { queryKeys } from '@/lib/queryKeys';

/** Bio du joueur, modifiable sur son propre profil. */
export function Bio({ bio, editable, username }: { bio: string | null; editable: boolean; username: string }) {
  const errorMessage = useErrorMessage();
  const t = useTranslations('profile.bio');
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(bio ?? '');
  const save = useApiMutation({
    mutationFn: (value: string | null) => api('/me/profile', { method: 'PATCH', json: { bio: value } }),
    invalidate: [queryKeys.profile.one(username), queryKeys.me],
    onSuccess: () => setEditing(false),
  });

  if (editing)
    return (
      <form
        className="mt-3 max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(text.trim() || null);
        }}
      >
        <div className="flex gap-2">
          <input className="field" maxLength={280} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('label')} autoFocus />
          <button className="btn bg-acid" disabled={save.isPending}>{t('ok')}</button>
        </div>
        {save.isError && <p className="mt-1 text-sm text-down">{errorMessage(save.error)}</p>}
      </form>
    );
  return (
    <p className="mt-3 max-w-xl text-lg text-ink-2">
      {bio || (editable ? t('empty') : '')}
      {editable && (
        <button className="ml-2 text-sm font-semibold text-ink underline" onClick={() => setEditing(true)}>
          {t('edit')}
        </button>
      )}
    </p>
  );
}
