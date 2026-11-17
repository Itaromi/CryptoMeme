import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { messages } from '@/messages';
import { LOCALE_COOKIE, TIME_ZONE, resolveLocale } from './config';

export default getRequestConfig(async () => {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value, (await headers()).get('accept-language'));
  return { locale, messages: messages[locale], timeZone: TIME_ZONE };
});
