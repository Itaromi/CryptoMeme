/** Valeur chiffrée avec son libellé, à placer dans une liste `<dl>`. */
export function Stat({
  label,
  children,
  size = 'md',
  className = '',
  hint,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
  className?: string;
  hint?: string;
}) {
  const sizes = { md: 'text-lg', lg: 'text-xl', xl: 'display text-3xl' };
  return (
    <div title={hint}>
      <dt className="text-xs uppercase tracking-wider text-ink-2">{label}</dt>
      <dd className={`font-semibold ${sizes[size]} ${className}`}>{children}</dd>
    </div>
  );
}
