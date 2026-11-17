/** Libellé de formulaire au-dessus de son champ. */
export function LabeledField({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-2">{label}</span>
      {children}
    </label>
  );
}
