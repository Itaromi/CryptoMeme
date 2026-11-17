/** En-tête de colonne triable (tri décroissant uniquement). */
export function SortTh<K extends string>({ label, k, sort, setSort, className = '' }: { label: string; k: K; sort: K; setSort: (k: K) => void; className?: string }) {
  return (
    <th className={`py-2 pr-4 text-right font-semibold ${className}`} aria-sort={sort === k ? 'descending' : 'none'}>
      <button onClick={() => setSort(k)} className={`py-1 uppercase ${sort === k ? 'text-ink underline decoration-2' : 'hover:text-ink'}`}>
        {label}
        {sort === k && ' ↓'}
      </button>
    </th>
  );
}

/** Choix du tri tant que des colonnes triables sont masquées (jusqu'à xl). */
export function SortSelect<K extends string>({ label, options, sort, setSort }: { label: string; options: ReadonlyArray<{ k: K; label: string }>; sort: K; setSort: (k: K) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold xl:hidden">
      <span className="text-ink-2">{label}</span>
      <select value={sort} onChange={(e) => setSort(e.target.value as K)} className="field w-auto py-2">
        {options.map((o) => (
          <option key={o.k} value={o.k}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
