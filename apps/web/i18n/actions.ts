'use server';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, isLocale } from './config';

/** Mémorise la langue choisie (un an). Action serveur publique : l'entrée est validée. */
export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
}
