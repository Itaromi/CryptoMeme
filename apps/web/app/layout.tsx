import type { Metadata } from 'next';
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { Providers } from './providers';
import { Masthead } from '@/components/Masthead';
import { EventBanner } from '@/components/EventBanner';
import './globals.css';

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', display: 'swap' });
const instrument = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common.meta');
  return { title: t('title'), description: t('description') };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${bricolage.variable} ${instrument.variable}`}>
      <body>
        <NextIntlClientProvider>
          <Providers>
            <Masthead />
            <EventBanner />
            <main className="w-full px-4 pb-24 sm:px-8 2xl:px-12">{children}</main>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
