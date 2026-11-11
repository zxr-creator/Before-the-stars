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
const MUTED = '#c9bfa8';

/** A closed regular polygon of `n` corners (the first at the top), rotated by `rot` radians. */
function polyPath(x: number, y: number, r: number, n: number, rot = 0, inner = 0): string {
  const pts: string[] = [];
  const m = inner ? n * 2 : n;
  for (let i = 0; i < m; i++) {
    const a = -Math.PI / 2 + rot + (i * 2 * Math.PI) / m;
    const rr = inner && i % 2 ? inner : r;
    pts.push(`${(x + rr * Math.cos(a)).toFixed(2)} ${(y + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

/**
 * Path of a civilization's marker, one of ten by seat (design chapter 40, section 2.7): disc,
 * square, diamond, triangle, inverted triangle, pentagon, hexagon, star, cross, ring.
 */
export function markPath(seat: number, x: number, y: number, r: number): string {
  switch (((seat % 10) + 10) % 10) {
    case 0: return `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    case 1: { const k = r * 0.88; return `M${x - k} ${y - k}h${2 * k}v${2 * k}h${-2 * k}Z`; }
    case 2: { const k = r * 1.2; return `M${x} ${y - k}L${x + k} ${y}L${x} ${y + k}L${x - k} ${y}Z`; }
    case 3: { const k = r * 1.2; return `M${x} ${y - k}L${x + k} ${y + k * 0.82}L${x - k} ${y + k * 0.82}Z`; }
    case 4: { const k = r * 1.2; return `M${x} ${y + k}L${x + k} ${y - k * 0.82}L${x - k} ${y - k * 0.82}Z`; }
    case 5: return polyPath(x, y, r * 1.1, 5);
    case 6: return polyPath(x, y, r * 1.05, 6, Math.PI / 6);
    case 7: return polyPath(x, y, r * 1.3, 5, 0, r * 0.55);
    case 8: { const a = r * 1.05, b = r * 0.38; return `M${x - b} ${y - a}h${2 * b}v${a - b}h${a - b}v${2 * b}h${b - a}v${a - b}h${-2 * b}v${b - a}h${b - a}v${-2 * b}h${a - b}Z`; }
    default: { const o = r * 1.05, i = r * 0.5; return `M${x - o} ${y}a${o} ${o} 0 1 0 ${2 * o} 0a${o} ${o} 0 1 0 ${-2 * o} 0ZM${x - i} ${y}a${i} ${i} 0 1 1 ${2 * i} 0a${i} ${i} 0 1 1 ${-2 * i} 0Z`; }
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
  /** Horizontal position of a sample. */
  x: (p: ChartPoint) => number;
  y: (v: number) => number;
  yMax: number;
  yTicks: number[];
  xTicks: { x: number; label: string }[];
}

/** Years worth a tick on a historical axis, coarse to fine; the first ones that fit are kept. */
const TICK_YEARS = [-5000, -4000, -3000, -2000, -1000, 1, 500, 1000, 1250, 1500, 1600, 1700, 1750, 1800, 1850, 1900, 1950, 2000, 2050, 2100, 2150, 2200, 2300, 2400, 2500];
/** Astronomical year (1 BC = 0) for interpolation across the missing year zero. */
const astro = (y: number) => (y < 0 ? y + 1 : y);

function makeScale(series: ChartSeries[], w: number, h: number, m: { l: number; r: number; t: number; b: number }, fixedMax: number | undefined, whole: boolean, yTarget: number): Scale {
  const pts = series[0]?.points ?? [];
  // A historical calendar: rounds run from fifty years down to two, so the axis is laid out by
  // round (each round the same width, as it was played) and labelled with the years.
  const byRound = pts.length > 0 && pts.every((p) => p.year != null);
  const xv = (p: ChartPoint) => (byRound ? p.round : p.x);
  let x0 = Infinity, x1 = -Infinity, top = 0;
  for (const s of series) for (const p of s.points) { x0 = Math.min(x0, xv(p)); x1 = Math.max(x1, xv(p)); top = Math.max(top, p.y); }
  if (!Number.isFinite(x0)) { x0 = 0; x1 = 12; }
  const minSpan = byRound ? 1 : 12;
  if (x1 - x0 < minSpan) x1 = x0 + minSpan;
  let step = niceStep(fixedMax ?? (top || 1), yTarget);
  if (whole) step = Math.max(1, Math.round(step));
  const yMax = fixedMax ?? Math.max(step, Math.ceil((top || 1) / step - 1e-9) * step);
  const yTicks: number[] = [];
  for (let v = 0; v <= yMax + step * 1e-6; v += step) yTicks.push(v);
  const iw = Math.max(10, w - m.l - m.r), ih = Math.max(10, h - m.t - m.b);
  const xs = (v: number) => m.l + ((v - x0) / (x1 - x0)) * iw;
  const x = (p: ChartPoint) => xs(xv(p));
  const y = (v: number) => m.t + ih - (Math.min(v, yMax) / yMax) * ih;
  const xTicks: { x: number; label: string }[] = [];
  if (byRound) {
    // years to positions by interpolating between the samples that bracket them
    const at = (year: number): number | null => {
      const a = astro(year);
      for (let i = 1; i < pts.length; i++) {
        const pa = astro(pts[i - 1].year!), pb = astro(pts[i].year!);
        if (a >= pa && a <= pb) return xs(pts[i - 1].round + (pb === pa ? 0 : ((a - pa) / (pb - pa)) * (pts[i].round - pts[i - 1].round)));
      }
      return pts.length === 1 && astro(pts[0].year!) === a ? xs(pts[0].round) : null;
    };
    const minGap = 58;
    const cand = TICK_YEARS.map((yr) => ({ yr, px: at(yr) })).filter((c): c is { yr: number; px: number } => c.px !== null);
    // the first and the last sample are always labelled; candidates fill in where they fit
    const first = { yr: pts[0].year!, px: x(pts[0]) };
    const last = { yr: pts[pts.length - 1].year!, px: x(pts[pts.length - 1]) };
    const kept = [first];
    for (const c of cand) if (c.px - kept[kept.length - 1].px >= minGap && last.px - c.px >= minGap * 0.8) kept.push(c);
    if (pts.length > 1 && last.px - kept[kept.length - 1].px >= minGap * 0.6) kept.push(last);
    for (const k of kept) xTicks.push({ x: k.px, label: histYear(k.yr) });
  } else {
    // whole campaign years, about one label per 70 px
    const y0 = yearOf(x0), y1 = yearOf(x1);
    const ystep = Math.max(1, Math.round(niceStep(Math.max(1, y1 - y0), Math.max(2, Math.floor(iw / 70)))));
    for (let yr = Math.ceil(y0 / ystep) * ystep; yr <= y1; yr += ystep) {
      const month = (yr - 1) * 12;
      if (yr >= 1 && month >= x0 - 0.5 && month <= x1 + 0.5) xTicks.push({ x: xs(month), label: String(yr) });
    }
    if (!xTicks.length) xTicks.push({ x: xs(x0), label: String(y0) });
  }
  return { x, y, yMax, yTicks, xTicks };
}

function linePath(points: ChartPoint[], sc: Scale): string {
  let d = '';
  for (let i = 0; i < points.length; i++) d += `${i ? 'L' : 'M'}${sc.x(points[i]).toFixed(1)} ${sc.y(points[i].y).toFixed(1)}`;
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
  // More than six lines: one civilization in colour (picked in the legend), the rest light
  // grey with their markers (design chapter 40, section 2.7).
  const crowd = series.length > 6;
  const [focus, setFocus] = useState<number | null>(null);
  const lit = (seat: number) => !crowd || focus === null || focus === seat;
  const colorOf = (s: ChartSeries) => (lit(s.seat) ? s.color : MUTED);
  const drawn = crowd && focus !== null ? [...series.filter((s) => s.seat !== focus), ...series.filter((s) => s.seat === focus)] : series;
  const m = { l: 46, r: 104, t: 20, b: 26 };
  const sc = useMemo(() => makeScale(series, w || 480, height, m, max, !!whole, 4), [series, w, height, max, whole]);
  const axis = fmtAxis ?? fmt;
  const xs = series[0]?.points ?? [];
  const n = xs.length;
  const idx = hover !== null && hover < n ? hover : null;
  const W = w || 480;

  // End labels: one per line, pushed apart when lines finish close together.
  // With many lines only the picked one (or else the four highest) is named at its end.
  const labelled = crowd
    ? (focus !== null ? series.filter((s) => s.seat === focus) : [...series].sort((a, b) => (b.points[b.points.length - 1]?.y ?? 0) - (a.points[a.points.length - 1]?.y ?? 0)).slice(0, 4))
    : series;
  const ends = labelled.map((s) => {
    const p = s.points[s.points.length - 1];
    return p ? { s, px: sc.x(p), py: sc.y(p.y), v: p.y, ly: sc.y(p.y) } : null;
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
      const d = Math.abs(sc.x(xs[i]) - px);
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

  const hx = idx !== null ? sc.x(xs[idx]) : 0;
  const rows = idx !== null
    ? series.map((s) => ({ s, v: s.points[idx]?.y ?? 0 })).sort((a, b) => b.v - a.v)
    : [];
  // The read-out sits on the earlier side of the crosshair when it fits: the latest years stay in view.
  const tipLeft = hx - m.l > 176;
  // A marker every so often along each line, staggered so they do not pile up.
  const every = Math.max(1, Math.ceil(n / 5));

  return (
    <div class="ch" ref={ref} data-testid={testid}>
      <ul class={'ch-legend' + (crowd ? ' is-pick' : '')} aria-label={t('Legend')}>
        {series.map((s) => (crowd
          ? <li><button type="button" class={'ch-leg-btn' + (focus === s.seat ? ' is-on' : '') + (lit(s.seat) ? '' : ' is-dim')} aria-pressed={focus === s.seat}
              title={focus === s.seat ? t('Show every civilization in colour') : t('Pick out {name}', { name: s.name })}
              onClick={() => setFocus(focus === s.seat ? null : s.seat)}><SeriesKey seat={s.seat} color={colorOf(s)} />{s.name}</button></li>
          : <li><SeriesKey seat={s.seat} color={s.color} />{s.name}</li>))}
      </ul>
      <svg class="ch-svg" width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" tabIndex={0}
        aria-label={`${label}. ${t('Left and right arrow keys read the values round by round.')}`}
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
        {drawn.map((s) => (
          <g>
            {s.points.length > 1 ? <path d={linePath(s.points, sc)} fill="none" stroke={colorOf(s)} stroke-width={lit(s.seat) ? 2 : 1.5} stroke-linejoin="round" stroke-linecap="round" /> : null}
            {s.points.map((p, i) => (i % every === (s.seat * 2 + 1) % every && i < n - 1 && n > 3
              ? <path d={markPath(s.seat, sc.x(p), sc.y(p.y), 3.4)} fill={colorOf(s)} stroke={SURFACE} stroke-width="1.5" /> : null))}
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
            {p ? <path d={markPath(s.seat, sc.x(p), sc.y(p.y), 2.4)} fill={s.color} stroke={SURFACE} stroke-width="1" /> : null}
          </g>
        );
      })}
    </svg>
  );
}

export const CHART_INK = INK;
