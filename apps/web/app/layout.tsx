import type { Metadata } from 'next';
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google';
import { Providers } from './providers';
import { Masthead } from '@/components/Masthead';
import { EventBanner } from '@/components/EventBanner';
import './globals.css';

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', display: 'swap' });
const instrument = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument', display: 'swap' });

export const metadata: Metadata = {
  title: 'CryptoMeme — la bourse des mèmes',
  description: 'Trade des cryptos parfaitement fictives et finis #1 du classement.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${bricolage.variable} ${instrument.variable}`}>
      <body>
        <Providers>
          <Masthead />
          <EventBanner />
          <main className="w-full px-4 pb-24 sm:px-8 2xl:px-12">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
