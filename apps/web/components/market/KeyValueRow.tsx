/** Ligne « libellé … valeur » alignée, à placer dans une liste `<dl>`. */
export function KeyValueRow({ label, children, className = '' }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-2">{label}</dt>
      <dd className={`text-right font-semibold ${className}`}>{children}</dd>
    </div>
  );
}
