/** Mini-courbe 24 h (clôtures horaires). Couleur = sens de la variation sur la période. */
export function Spark({ data, width = 96, height = 28 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return <span className="text-xs text-ink-3">—</span>;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / span) * (height - 2) - 1}`).join(' ');
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={pts} fill="none" strokeWidth="1.5" className={up ? 'stroke-up' : 'stroke-down'} />
    </svg>
  );
}
