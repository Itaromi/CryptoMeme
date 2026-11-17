'use client';
import { useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';
import { AreaSeries, ColorType, createChart, type UTCTimestamp } from 'lightweight-charts';

export function NetWorthChart({ data }: { data: Array<{ t: number; v: number }> }) {
  const el = useRef<HTMLDivElement>(null);
  const locale = useLocale();
  useEffect(() => {
    if (!el.current) return;
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#2a2820', fontFamily: 'inherit', attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(42,40,32,0.06)' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderColor: '#2a2820', timeVisible: true },
      handleScroll: false,
      handleScale: false,
      localization: { locale },
    });
    const s = chart.addSeries(AreaSeries, {
      lineColor: '#2a2820',
      lineWidth: 2,
      topColor: 'rgba(214,230,60,0.55)',
      bottomColor: 'rgba(214,230,60,0.02)',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });
    // Dédoublonne par seconde (lightweight-charts exige des temps strictement croissants)
    const seen = new Map<number, number>();
    for (const p of data) seen.set(Math.floor(p.t / 1000), p.v);
    s.setData([...seen.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time: time as UTCTimestamp, value })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [data, locale]);
  return <div ref={el} className="h-64 w-full" />;
}
