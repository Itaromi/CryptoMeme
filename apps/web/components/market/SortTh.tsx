/** En-tête de colonne triable (tri décroissant uniquement). */
export function SortTh<K extends string>({ label, k, sort, setSort }: { label: string; k: K; sort: K; setSort: (k: K) => void }) {
  return (
    <th className="py-2 pr-4 text-right font-semibold" aria-sort={sort === k ? 'descending' : 'none'}>
      <button onClick={() => setSort(k)} className={`uppercase ${sort === k ? 'text-ink underline decoration-2' : 'hover:text-ink'}`}>
        {label}
        {sort === k && ' ↓'}
      </button>
    </th>
  );
}
