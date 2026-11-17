'use client';
import { useTranslations } from 'next-intl';
import { errorMessage } from '@/lib/mutation';

/** Retour d'une action du back-office : l'erreur renvoyée par l'API, sinon le message de réussite. */
export function Feedback({
  m,
  success,
  saved = false,
  className = 'text-sm font-semibold',
}: {
  m: { isError: boolean; isSuccess: boolean; error: Error | null };
  /** Message affiché après réussite (« Fait. » par défaut) */
  success?: React.ReactNode;
  /** « Enregistré. » au lieu de « Fait. » */
  saved?: boolean;
  className?: string;
}) {
  const t = useTranslations('admin.feedback');
  if (m.isError) return <span className={`${className} text-down`}>{errorMessage(m.error)}</span>;
  if (m.isSuccess) return <span className={className}>{success ?? t(saved ? 'saved' : 'done')}</span>;
  return null;
}
