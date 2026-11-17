'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useLocale, useTranslations } from 'next-intl';
import type { Candle } from '@cryptomeme/shared';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

const INTERVALS = [
  { id: '1m', ms: 60_000 },
  { id: '5m', ms: 300_000 },
  { id: '1h', ms: 3_600_000 },
  { id: '1d', ms: 86_400_000 },
] as const;

// lightweight-charts dessine sur canvas : couleurs en hex
const UP = '#2f8f57';
const DOWN = '#c8393a';
const INK = '#2a2820';

export function PriceChart({ symbol, livePrice }: { symbol: string; livePrice?: string }) {
  const t = useTranslations('market.chart');
  const locale = useLocale();
  const [interval, setInterval] = useState<(typeof INTERVALS)[number]>(INTERVALS[0]);
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volume = useRef<ISeriesApi<'Histogram'> | null>(null);
  const last = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null);

  const { data } = useQuery({
    queryKey: queryKeys.candles(symbol, interval.id),
    queryFn: () => api<Candle[]>(`/market/assets/${symbol}/candles?interval=${interval.id}&limit=400`),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: INK, fontFamily: 'inherit', attributionLogo: false },
      grid: { vertLines: { color: 'rgba(42,40,32,0.06)' }, horzLines: { color: 'rgba(42,40,32,0.06)' } },
      rightPriceScale: { borderColor: INK },
      timeScale: { borderColor: INK, timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: INK, labelBackgroundColor: INK }, horzLine: { color: INK, labelBackgroundColor: INK } },
    });
    candles.current = c.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceFormat: { type: 'price', precision: 8, minMove: 0.00000001 },
    });
    volume.current = c.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, color: 'rgba(42,40,32,0.18)' });
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chart.current = c;
    return () => c.remove();
  }, []);

  // Dates et nombres des axes dans la langue du site
  useEffect(() => {
    chart.current?.applyOptions({ localization: { locale } });
  }, [locale]);

  useEffect(() => {
    if (!data || !candles.current || !volume.current) return;
    const p = data.at(-1)?.c ?? 1;
    const precision = p >= 100 ? 2 : p >= 1 ? 4 : Math.min(10, 2 - Math.floor(Math.log10(p)) + 2);
    candles.current.applyOptions({ priceFormat: { type: 'price', precision, minMove: 1 / 10 ** precision } });
    const rows = data.map((d) => ({ time: (d.t / 1000) as UTCTimestamp, open: d.o, high: d.h, low: d.l, close: d.c }));
    candles.current.setData(rows);
    volume.current.setData(data.map((d) => ({ time: (d.t / 1000) as UTCTimestamp, value: d.v, color: d.c >= d.o ? 'rgba(47,143,87,0.3)' : 'rgba(200,57,58,0.3)' })));
    last.current = rows.at(-1) ?? null;
    chart.current?.timeScale().scrollToRealTime();
  }, [data]);

  // Met à jour la bougie courante avec le prix live
  useEffect(() => {
    if (!livePrice || !candles.current) return;
    const p = Number(livePrice);
    const bucket = Math.floor(Date.now() / interval.ms) * (interval.ms / 1000);
    const l = last.current;
    const next =
      l && l.time === bucket
        ? { ...l, high: Math.max(l.high, p), low: Math.min(l.low, p), close: p }
        : { time: bucket, open: l?.close ?? p, high: p, low: p, close: p };
    if (l && next.time < l.time) return;
    candles.current.update({ ...next, time: next.time as UTCTimestamp });
    last.current = next;
  }, [livePrice, interval.ms]);

  return (
    <div>
      <div className="mb-2 flex gap-1 text-xs font-semibold" role="group" aria-label={t('intervalsLabel')}>
        {INTERVALS.map((i) => (
          <button
            key={i.id}
            aria-pressed={interval.id === i.id}
            onClick={() => setInterval(i)}
            className={`px-3 py-2 sm:px-2.5 sm:py-1 ${interval.id === i.id ? 'bg-ink text-paper' : 'hover:bg-paper-2'}`}
          >
            {t(`intervals.${i.id}`)}
          </button>
        ))}
      </div>
      <div ref={el} className="h-[420px] w-full" />
    </div>
  );
}
