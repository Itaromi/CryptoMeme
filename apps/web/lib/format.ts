const usd = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });

export const money = (v: number | string) => usd.format(Number(v));
export const compactMoney = (v: number | string) => `${compact.format(Number(v))} $`;

/** Prix d'actif : précision adaptée (les shitcoins valent 0,000069 $). */
export function price(v: number | string) {
  const n = Number(v);
  if (n === 0) return '0 $';
  const digits = n >= 1000 ? 2 : n >= 1 ? 4 : Math.min(10, 2 - Math.floor(Math.log10(n)) + 2);
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: Math.min(digits, 2), maximumFractionDigits: digits })} $`;
}

export const qty = (v: number | string) =>
  Number(v).toLocaleString('fr-FR', { maximumFractionDigits: Number(v) >= 100 ? 2 : 6 });

export const pct = (v: number | null | undefined, signed = true) =>
  v == null || !Number.isFinite(v)
    ? '—'
    : `${signed && v > 0 ? '+' : ''}${(v * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} %`;

export const tone = (v: number) => (v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-ink-2');

export const ago = (d: string | number | Date) => {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `il y a ${Math.max(s, 0)} s`;
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return new Date(d).toLocaleDateString('fr-FR');
};

export const REGIME_LABEL: Record<string, string> = {
  CALM: 'Calme plat',
  NORMAL: 'Normal',
  HYPE: 'Hype',
  PANIC: 'Panique',
};

export const TIER_LABEL: Record<string, string> = {
  BLUE_CHIP: 'Blue chip',
  MID_CAP: 'Mid cap',
  SHITCOIN: 'Shitcoin',
};
