'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/mining', label: 'Ma ferme' },
  { href: '/mining/shop', label: 'Boutique matos' },
  { href: '/mining/pools', label: 'Pools & réseaux' },
];

export function MiningNav() {
  const path = usePathname();
  return (
    <nav className="mb-8 flex flex-wrap gap-1 border-b-2 border-ink text-sm font-semibold">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={`px-4 py-2 ${path === l.href ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
