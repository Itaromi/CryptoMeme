'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

const LINKS = [
  { href: '/mining', key: 'farm' },
  { href: '/mining/shop', key: 'shop' },
  { href: '/mining/pools', key: 'pools' },
] as const;

export function MiningNav() {
  const t = useTranslations('mining.nav');
  const path = usePathname();
  return (
    <nav aria-label={t('label')} className="mb-8 flex flex-wrap gap-1 border-b-2 border-ink text-sm font-semibold">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={`px-4 py-2 ${path === l.href ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}>
          {t(l.key)}
        </Link>
      ))}
    </nav>
  );
}
