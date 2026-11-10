// Line charts for the observer's comparison panels, drawn as plain SVG.
// One y-axis from zero, recessive grid, 2px lines in each civilization's own
// colour. Colour is never the only cue: every civilization also has its own
// marker shape (on the line, at the line's end, in the legend and in the hover
// read-out) and is named at the end of its line.
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { histYear, yearOf } from '../format';
import { t } from '../i18n';

/** `x` is the month; `year` the historical year of that sample when the referee keeps a calendar. */
export interface ChartPoint { x: number; y: number; round: number; year?: number | null }

/** The label of a sample's date: the historical year where known, else "Year N" from the month. */
export function pointDate(p: ChartPoint): string {
  return p.year != null ? histYear(p.year) : t('Year {n}', { n: yearOf(p.x) });
}
export interface ChartSeries { seat: number; name: string; color: string; points: ChartPoint[] }

const SURFACE = '#fbf5e4';
const INK = '#2b2620';
const INK_2 = '#5a5044';
const INK_3 = '#8a7d6a';
const GRID = '#e3d8bc';

/** Path of a civilization's marker: disc, square, diamond, triangle (by seat). */
export function markPath(seat: number, x: number, y: number, r: number): string {
  switch (((seat % 4) + 4) % 4) {
    case 0: return `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    case 1: { const k = r * 0.88; return `M${x - k} ${y - k}h${2 * k}v${2 * k}h${-2 * k}Z`; }
    case 2: { const k = r * 1.2; return `M${x} ${y - k}L${x + k} ${y}L${x} ${y + k}L${x - k} ${y}Z`; }
    default: { const k = r * 1.2; return `M${x} ${y - k}L${x + k} ${y + k * 0.82}L${x - k} ${y + k * 0.82}Z`; }
  }
}

/** A short stroke of the series colour carrying its marker: the key used by legends and read-outs. */
export function SeriesKey({ seat, color, width = 26 }: { seat: number; color: string; width?: number }): JSX.Element {
  return (
    <svg class="ch-key" width={width} height="12" viewBox={`0 0 ${width} 12`} aria-hidden="true">
      <path d={`M1 6H${width - 1}`} stroke={color} stroke-width="2" stroke-linecap="round" />
      <path d={markPath(seat, width / 2, 6, 3.6)} fill={color} stroke={SURFACE} stroke-width="1.5" />
    </svg>
  );
}

function niceStep(range: number, target: number): number {
  if (!(range > 0)) return 1;
  const raw = range / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

function useWidth(): [{ current: HTMLDivElement | null }, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => setW(Math.round(el.clientWidth));
    on();
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

interface Scale {
  x: (v: number) => number;
  y: (v: number) => number;
  x0: number; x1: number; yMax: number;
  yTicks: number[];
  xTicks: { x: number; label: string }[];
}

function makeScale(series: ChartSeries[], w: number, h: number, m: { l: number; r: number; t: number; b: number }, fixedMax: number | undefined, whole: boolean, yTarget: number): Scale {
  let x0 = Infinity, x1 = -Infinity, top = 0;
  for (const s of series) for (const p of s.points) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); top = Math.max(top, p.y); }
  if (!Number.isFinite(x0)) { x0 = 0; x1 = 12; }
  if (x1 - x0 < 12) x1 = x0 + 12;
  let step = niceStep(fixedMax ?? (top || 1), yTarget);
  if (whole) step = Math.max(1, Math.round(step));
  const yMax = fixedMax ?? Math.max(step, Math.ceil((top || 1) / step - 1e-9) * step);
  const yTicks: number[] = [];
  for (let v = 0; v <= yMax + step * 1e-6; v += step) yTicks.push(v);
  const iw = Math.max(10, w - m.l - m.r), ih = Math.max(10, h - m.t - m.b);
  const x = (v: number) => m.l + ((v - x0) / (x1 - x0)) * iw;
  const y = (v: number) => m.t + ih - (Math.min(v, yMax) / yMax) * ih;
  // Whole years on the x-axis, about one label per 70 px.
  const y0 = yearOf(x0), y1 = yearOf(x1);
  const ystep = Math.max(1, Math.round(niceStep(Math.max(1, y1 - y0), Math.max(2, Math.floor(iw / 70)))));
  const xTicks: { x: number; label: string }[] = [];
  const pts = series[0]?.points ?? [];
  if (pts.length && pts.every((p) => p.year != null)) {
    // a historical calendar: years per round vary, so label the samples themselves, about one per 70 px
    const every = Math.max(1, Math.ceil(pts.length / Math.max(2, Math.floor(iw / 70))));
    for (let i = 0; i < pts.length; i += every) xTicks.push({ x: x(pts[i].x), label: histYear(pts[i].year!) });
  } else {
    for (let yr = Math.ceil(y0 / ystep) * ystep; yr <= y1; yr += ystep) {
      const month = (yr - 1) * 12;
      if (yr >= 1 && month >= x0 - 0.5 && month <= x1 + 0.5) xTicks.push({ x: x(month), label: String(yr) });
    }
    if (!xTicks.length) xTicks.push({ x: x(x0), label: String(y0) });
  }
  return { x, y, x0, x1, yMax, yTicks, xTicks };
}

function linePath(points: ChartPoint[], sc: Scale): string {
  let d = '';
  for (let i = 0; i < points.length; i++) d += `${i ? 'L' : 'M'}${sc.x(points[i].x).toFixed(1)} ${sc.y(points[i].y).toFixed(1)}`;
  return d;
}

export interface LineChartProps {
  series: ChartSeries[];
  /** Formats a value for labels, the read-out and the table. */
  fmt: (v: number) => string;
  /** Formats an axis tick (defaults to `fmt`). */
  fmtAxis?: (v: number) => string;
  /** Unit written above the y-axis, e.g. "people". */
  unit: string;
  height?: number;
  /** Fixed top of the y-axis (e.g. 100 for a 0–100 score). */
  max?: number;
  /** Values are whole numbers: no fractional ticks. */
  whole?: boolean;
  label: string;
  testid?: string;
}

/** The focus chart: axes with units, a legend, labels at the line ends, a crosshair read-out and arrow-key stepping. */
export function LineChart({ series, fmt, fmtAxis, unit, height = 212, max, whole, label, testid }: LineChartProps): JSX.Element {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const m = { l: 46, r: 104, t: 20, b: 26 };
  const sc = useMemo(() => makeScale(series, w || 480, height, m, max, !!whole, 4), [series, w, height, max, whole]);
  const axis = fmtAxis ?? fmt;
  const xs = series[0]?.points ?? [];
  const n = xs.length;
  const idx = hover !== null && hover < n ? hover : null;
  const W = w || 480;

  // End labels: one per line, pushed apart when lines finish close together.
  const ends = series.map((s) => {
    const p = s.points[s.points.length - 1];
    return p ? { s, px: sc.x(p.x), py: sc.y(p.y), v: p.y, ly: sc.y(p.y) } : null;
  }).filter((e): e is NonNullable<typeof e> => !!e).sort((a, b) => a.py - b.py);
  const GAP = 15;
  for (let i = 1; i < ends.length; i++) if (ends[i].ly - ends[i - 1].ly < GAP) ends[i].ly = ends[i - 1].ly + GAP;
  const floor = height - m.b - 4;
  if (ends.length && ends[ends.length - 1].ly > floor) {
    ends[ends.length - 1].ly = floor;
    for (let i = ends.length - 2; i >= 0; i--) if (ends[i + 1].ly - ends[i].ly < GAP) ends[i].ly = ends[i + 1].ly - GAP;
  }

  const nearest = (clientX: number, el: Element): number | null => {
    if (!n) return null;
    const b = el.getBoundingClientRect();
    const px = clientX - b.left;
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(sc.x(xs[i].x) - px);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  const onKey = (e: KeyboardEvent) => {
    if (!n) return;
    const cur = idx ?? n - 1;
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = Math.max(0, cur - 1);
    else if (e.key === 'ArrowRight') next = Math.min(n - 1, cur + 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else if (e.key === 'Escape') { setHover(null); return; }
    if (next === null) return;
    setHover(next);
    e.preventDefault();
    e.stopPropagation();
  };

  const hx = idx !== null ? sc.x(xs[idx].x) : 0;
  const rows = idx !== null
    ? series.map((s) => ({ s, v: s.points[idx]?.y ?? 0 })).sort((a, b) => b.v - a.v)
    : [];
  // The read-out sits on the earlier side of the crosshair when it fits: the latest years stay in view.
  const tipLeft = hx - m.l > 176;
  // A marker every so often along each line, staggered so they do not pile up.
  const every = Math.max(1, Math.ceil(n / 5));

  return (
    <div class="ch" ref={ref} data-testid={testid}>
      <ul class="ch-legend" aria-label={t('Legend')}>
        {series.map((s) => <li><SeriesKey seat={s.seat} color={s.color} />{s.name}</li>)}
      </ul>
      <svg class="ch-svg" width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" tabIndex={0}
        aria-label={`${label}. ${t('Left and right arrow keys read the values year by year.')}`}
        onPointerMove={(e) => setHover(nearest(e.clientX, e.currentTarget))} onPointerLeave={() => setHover(null)}
        onKeyDown={onKey} onBlur={() => setHover(null)}>
        <text class="ch-unit" x={m.l - 40} y={10}>{unit}</text>
        {sc.yTicks.map((v) => (
          <g>
            <path d={`M${m.l} ${sc.y(v).toFixed(1)}H${W - m.r}`} stroke={v === 0 ? INK_3 : GRID} stroke-width="1" />
            <text class="ch-tick" x={m.l - 6} y={sc.y(v) + 3.5} text-anchor="end">{axis(v)}</text>
          </g>
        ))}
        {sc.xTicks.map((k) => (
          <g>
            <path d={`M${k.x.toFixed(1)} ${height - m.b}v4`} stroke={INK_3} stroke-width="1" />
            <text class="ch-tick" x={k.x} y={height - m.b + 15} text-anchor="middle">{k.label}</text>
          </g>
        ))}
        <text class="ch-unit" x={W - m.r + 20} y={height - m.b + 15}>{t('year')}</text>
        {series.map((s) => (
          <g>
            {s.points.length > 1 ? <path d={linePath(s.points, sc)} fill="none" stroke={s.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" /> : null}
            {s.points.map((p, i) => (i % every === (s.seat * 2 + 1) % every && i < n - 1 && n > 3
              ? <path d={markPath(s.seat, sc.x(p.x), sc.y(p.y), 3.4)} fill={s.color} stroke={SURFACE} stroke-width="1.5" /> : null))}
          </g>
        ))}
        {ends.map((e) => (
          <g>
            {Math.abs(e.ly - e.py) > 2.5 ? <path d={`M${e.px + 6} ${e.py.toFixed(1)}L${e.px + 13} ${e.ly.toFixed(1)}`} stroke={INK_3} stroke-width="1" fill="none" /> : null}
            <path d={markPath(e.s.seat, e.px, e.py, 4.2)} fill={e.s.color} stroke={SURFACE} stroke-width="2" />
            <text class="ch-end" x={e.px + 15} y={e.ly + 4}><tspan class="ch-end-v">{fmt(e.v)}</tspan> <tspan>{e.s.name}</tspan></text>
          </g>
        ))}
        {idx !== null ? (
          <g class="ch-cross" pointer-events="none">
            <path d={`M${hx.toFixed(1)} ${m.t}V${height - m.b}`} stroke={INK_2} stroke-width="1" />
            {series.map((s) => (s.points[idx] ? <path d={markPath(s.seat, hx, sc.y(s.points[idx].y), 4.6)} fill={s.color} stroke={SURFACE} stroke-width="2" /> : null))}
          </g>
        ) : null}
      </svg>
      {idx !== null ? (
        <div class="ch-tip" role="status" style={tipLeft ? { right: Math.round(W - hx + 12) + 'px', top: '34px' } : { left: Math.round(hx + 12) + 'px', top: '34px' }}>
          <div class="ch-tip-head">{pointDate(xs[idx])} <small>{t('round {n}', { n: xs[idx].round })}</small></div>
          {rows.map((r) => (
            <div class="ch-tip-row"><SeriesKey seat={r.s.seat} color={r.s.color} width={20} /><b>{fmt(r.v)}</b><span>{r.s.name}</span></div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A small trend picture without axes, for the metric tiles. Never the only place a value can be read. */
export function Spark({ series, max, width = 132, height = 34 }: { series: ChartSeries[]; max?: number; width?: number; height?: number }): JSX.Element {
  const m = { l: 2, r: 5, t: 4, b: 3 };
  const sc = makeScale(series, width, height, m, max, false, 2);
  return (
    <svg class="ch-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={`M${m.l} ${height - m.b + 0.5}H${width - m.r}`} stroke={GRID} stroke-width="1" />
      {series.map((s) => {
        const p = s.points[s.points.length - 1];
        return (
          <g>
            {s.points.length > 1 ? <path d={linePath(s.points, sc)} fill="none" stroke={s.color} stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" /> : null}
            {p ? <path d={markPath(s.seat, sc.x(p.x), sc.y(p.y), 2.4)} fill={s.color} stroke={SURFACE} stroke-width="1" /> : null}
          </g>
        );
      })}
    </svg>
  );
}

export const CHART_INK = INK;
