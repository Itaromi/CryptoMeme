'use client';
import { useEffect, useRef, useState } from 'react';
import { useFormat } from '@/lib/format';

/** Prix qui flashe vert/rouge quand il bouge. */
export function LivePrice({ value, className = '' }: { value: string | number; className?: string }) {
  const f = useFormat();
  const prev = useRef(Number(value));
  const [flash, setFlash] = useState<'' | 'flash-up' | 'flash-down'>('');
  const [key, setKey] = useState(0);
  useEffect(() => {
    const n = Number(value);
    if (n !== prev.current) {
      setFlash(n > prev.current ? 'flash-up' : 'flash-down');
      setKey((k) => k + 1);
      prev.current = n;
    }
  }, [value]);
  return (
    <span key={key} className={`num ${flash} ${className}`}>
      {f.price(value)}
    </span>
  );
}
