// The pannable, zoomable chart both trees are drawn on: era bands and field lanes, links,
// and the cards. Pan, zoom and hover highlighting are applied straight to the DOM so that
// moving the chart never re-renders the cards; only crossing into a new tile of the chart
// (or between the overview and the cards) re-renders, and then only the cards near the
// viewport exist in the DOM, so a 300-card tree pans as smoothly as a 30-card one.
import { Component } from 'preact';
import type { ComponentChildren, JSX, VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../icons';
import { cx } from '../ui';
import { t, tc } from '../i18n';
import { Vignette } from '../art/vignette';
import { neighbour } from './layout';
import type { TreeLayout } from './layout';
import type { MatrixCell, MatrixLayout } from './matrix';

/** Card illustration; a vignette is a large drawing, so it is rendered once per art key. */
export class Art extends Component<{ art: string }> {
  shouldComponentUpdate(next: { art: string }) {
    return next.art !== this.props.art;
  }
  render() {
    return <Vignette art={this.props.art} />;
  }
}

export interface ChartApi {
  centerOn(id: string, glide?: boolean): void;
  ensureVisible(id: string): void;
  fit(): void;
  focusCard(id: string): void;
}

interface Props {
  layout: TreeLayout | MatrixLayout;
  /** The view (pan and zoom) is kept while this stays the same. */
  viewKey: string;
  /** Card to centre on when the chart first opens. */
  target: string | null;
  selected: string | null;
  /** A search or filter is narrowing the cards: links recede. */
  quiet: boolean;
  label: string;
  groupColor(group: string): string;
  frontierLabel?: string;
  frontierHint?: string;
  api: { current: ChartApi | null };
  /** Draws one card (or lead) at its placed position. */
  renderCard(id: string): VNode | null;
  /** Era band and lane titles for the sticky headers (matrix layouts). */
  bandLabel?(band: number): string;
  laneLabel?(lane: string): string;
  laneColor?(lane: string): string;
  /** Overview of one band-and-lane cell, shown when zoomed far out. */
  cellSummary?(cell: MatrixCell): ComponentChildren;
  /** Colour of a card on the mini-map; null leaves it out (filtered away). */
  minimapColor?(id: string): string | null;
  /** Extra decorations drawn under the cards (exclusive and tension markers). */
  underlay?: ComponentChildren;
}

const Z_MIN = 0.05;
const Z_MAX = 1.5;
/** Below this zoom the chart shows band-and-lane overviews instead of cards. */
const FAR_Z = 0.3;
const TILE = 900;
/** Width of the lane title column in the overview, in screen pixels. */
const FAR_GUTTER = 168;
const MM_W = 196;
const MM_H = 120;

const isMatrix = (L: TreeLayout | MatrixLayout): L is MatrixLayout => 'bands' in L;

export function TreeChart(props: Props) {
  const { layout, viewKey, target, selected, quiet, label, groupColor, frontierLabel, frontierHint, api, renderCard } = props;
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const hotStyle = useRef<HTMLStyleElement>(null);
  const zoomLabel = useRef<HTMLSpanElement>(null);
  const bandStrip = useRef<HTMLDivElement>(null);
  const laneStrip = useRef<HTMLDivElement>(null);
  const mmCanvas = useRef<HTMLCanvasElement>(null);
  const mmView = useRef<HTMLDivElement>(null);
  const view = useRef({ x: 0, y: 0, z: 1 });
  const live = useRef({ layout, selected });
  live.current = { layout, selected };
  const hover = useRef<string | null>(null);
  const openedKey = useRef('');
  const forced = useRef<string | null>(null);
  const [vis, setVis] = useState({ key: '', far: false, near: true, x0: 0, y0: 0, x1: 0, y1: 0 });
  const visRef = useRef(vis);
  visRef.current = vis;
  const pending = useRef(0);
  const matrix = isMatrix(layout) ? layout : null;
  const cellSummary = props.cellSummary;

  /** Which tiles of the chart are near the viewport; re-render only when that changes. */
  const syncVisible = () => {
    const vp = viewport.current;
    if (!vp) return;
    const v = view.current;
    const far = !!matrix && v.z < FAR_Z;
    const x0 = Math.floor(-v.x / v.z / TILE) - 1;
    const y0 = Math.floor(-v.y / v.z / TILE) - 1;
    const x1 = Math.floor((vp.clientWidth - v.x) / v.z / TILE) + 1;
    const y1 = Math.floor((vp.clientHeight - v.y) / v.z / TILE) + 1;
    const near = v.z >= 0.6;
    const key = far ? 'far' : `${x0},${y0},${x1},${y1},${near ? 'c' : 'b'}`;
    if (key === visRef.current.key) return;
    if (pending.current) cancelAnimationFrame(pending.current);
    pending.current = requestAnimationFrame(() => {
      pending.current = 0;
      setVis({ key, far, near, x0: x0 * TILE, y0: y0 * TILE, x1: (x1 + 1) * TILE, y1: (y1 + 1) * TILE });
    });
  };

  const apply = (glide = false) => {
    const vp = viewport.current;
    const cv = canvas.current;
    if (!vp || !cv) return;
    const v = view.current;
    const L = live.current.layout;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const w = L.width * v.z;
    const h = L.height * v.z;
    const slack = 90;
    // In the overview the lane titles widen into a readable column on the left.
    const padL = isMatrix(L) && v.z < FAR_Z ? FAR_GUTTER : 0;
    v.x = w <= vw - padL ? padL + (vw - padL - w) / 2 : Math.max(vw - w - slack, Math.min(slack + padL, v.x));
    v.y = h <= vh ? (vh - h) / 2 : Math.max(vh - h - slack, Math.min(slack, v.y));
    cv.classList.toggle('is-gliding', glide);
    cv.style.transform = `translate(${v.x.toFixed(1)}px, ${v.y.toFixed(1)}px) scale(${v.z.toFixed(4)})`;
    cv.style.setProperty('--iz', (1 / v.z).toFixed(3));
    vp.classList.toggle('is-far', isMatrix(L) && v.z < FAR_Z);
    if (zoomLabel.current) zoomLabel.current.textContent = Math.round(v.z * 100) + '%';
    if (isMatrix(L)) {
      bandStrip.current?.querySelectorAll<HTMLElement>('[data-band]').forEach((el) => {
        const b = L.bands.find((x) => String(x.band) === el.dataset.band);
        if (!b) return;
        el.style.transform = `translateX(${(b.x * v.z + v.x).toFixed(1)}px)`;
        el.style.width = (b.w * v.z).toFixed(1) + 'px';
      });
      laneStrip.current?.querySelectorAll<HTMLElement>('[data-lane]').forEach((el) => {
        const l = L.lanes.find((x) => x.lane === el.dataset.lane);
        if (!l) return;
        el.style.transform = `translateY(${(l.y * v.z + v.y).toFixed(1)}px)`;
        el.style.height = (l.h * v.z).toFixed(1) + 'px';
      });
    }
    const mv = mmView.current;
    if (mv) {
      const s = Math.min(MM_W / L.width, MM_H / L.height);
      mv.style.left = (-v.x / v.z * s).toFixed(1) + 'px';
      mv.style.top = (-v.y / v.z * s).toFixed(1) + 'px';
      mv.style.width = (vw / v.z * s).toFixed(1) + 'px';
      mv.style.height = (vh / v.z * s).toFixed(1) + 'px';
    }
    syncVisible();
  };

  const zoomTo = (z0: number, cx0?: number, cy0?: number, glide = false) => {
    const vp = viewport.current;
    if (!vp) return;
    const v = view.current;
    const px = cx0 ?? vp.clientWidth / 2;
    const py = cy0 ?? vp.clientHeight / 2;
    const z = Math.max(Z_MIN, Math.min(Z_MAX, z0));
    v.x = px - ((px - v.x) * z) / v.z;
    v.y = py - ((py - v.y) * z) / v.z;
    v.z = z;
    apply(glide);
  };
  const zoomAt = (factor: number, cx0?: number, cy0?: number, glide = false) => zoomTo(view.current.z * factor, cx0, cy0, glide);

  const centerAt = (x: number, y: number, glide: boolean) => {
    const vp = viewport.current;
    if (!vp) return;
    const v = view.current;
    v.x = vp.clientWidth / 2 - x * v.z;
    v.y = vp.clientHeight / 2 - y * v.z;
    apply(glide);
  };

  const chart: ChartApi = {
    centerOn(id, glide = true) {
      const p = live.current.layout.placed.get(id);
      if (!p) return;
      if (view.current.z < FAR_Z && isMatrix(live.current.layout)) view.current.z = 0.8;
      centerAt(p.x + p.w / 2, p.y + p.h / 2, glide);
    },
    ensureVisible(id) {
      const vp = viewport.current;
      const p = live.current.layout.placed.get(id);
      if (!vp || !p) return;
      const v = view.current;
      if (v.z < FAR_Z && isMatrix(live.current.layout)) { chart.centerOn(id); return; }
      const m = 28;
      const left = p.x * v.z + v.x;
      const top = p.y * v.z + v.y;
      const right = left + p.w * v.z;
      const bottom = top + p.h * v.z;
      if (left < m + 34) v.x += m + 34 - left;
      else if (right > vp.clientWidth - m) v.x -= right - (vp.clientWidth - m);
      if (top < m + 30) v.y += m + 30 - top;
      else if (bottom > vp.clientHeight - m) v.y -= bottom - (vp.clientHeight - m);
      apply(true);
    },
    fit() {
      const vp = viewport.current;
      if (!vp) return;
      const L = live.current.layout;
      const v = view.current;
      const padL = isMatrix(L) ? FAR_GUTTER : 0;
      v.z = Math.max(Z_MIN, Math.min(1, (vp.clientWidth - padL) / L.width, vp.clientHeight / L.height));
      if (isMatrix(L)) v.z = Math.min(v.z, FAR_Z - 0.01);
      v.x = padL + (vp.clientWidth - padL - L.width * v.z) / 2;
      v.y = (vp.clientHeight - L.height * v.z) / 2;
      apply(true);
    },
    focusCard(id) {
      const find = () => canvas.current?.querySelector<HTMLElement>(`[data-handle="${id}"]`);
      const el = find();
      if (el) { el.focus({ preventScroll: true }); return; }
      // Off-screen cards are not in the DOM: render it, then focus it.
      forced.current = id;
      setVis((s) => ({ ...s, key: s.key + '+' }));
      requestAnimationFrame(() => requestAnimationFrame(() => find()?.focus({ preventScroll: true })));
    },
  };
  api.current = chart;

  /** Light the links of one card (and the cards at their other ends) without re-rendering. */
  const paintHot = () => {
    const el = hotStyle.current;
    if (!el) return;
    const id = hover.current ?? live.current.selected;
    if (!id || !/^[\w-]+$/.test(id)) { el.textContent = ''; return; }
    const linked = new Set<string>();
    for (const e of live.current.layout.edges) {
      if (e.from === id) linked.add(e.to);
      else if (e.to === id) linked.add(e.from);
    }
    const sel = (h: string) => `.tree-canvas [data-handle="${h}"]`;
    el.textContent =
      `.tree-canvas .tree-edge{opacity:.12}` +
      `.tree-canvas .tree-edge[data-a="${id}"],.tree-canvas .tree-edge[data-b="${id}"]{opacity:1;stroke:#fff3c9;stroke-width:2.4;stroke-dasharray:none;filter:drop-shadow(0 0 3px rgba(241,218,152,.9))}` +
      (linked.size ? [...linked].filter((h) => /^[\w-]+$/.test(h)).map(sel).join(',') + `{box-shadow:0 0 0 2px #f1da98,0 0 16px rgba(241,218,152,.55),0 6px 16px rgba(0,0,0,.5)}` : '');
  };

  // First open (and whenever the match, seat or tree changes): a readable zoom, centred on the target.
  useLayoutEffect(() => {
    const vp = viewport.current;
    if (!vp || openedKey.current === viewKey) { apply(); return; }
    openedKey.current = viewKey;
    const v = view.current;
    if (matrix) {
      v.z = vp.clientWidth < 1100 || vp.clientHeight < 600 ? 0.7 : 0.82;
    } else {
      // Show whole columns when a modest zoom-out is enough; otherwise stay readable and pan.
      const whole = vp.clientHeight / layout.height;
      v.z = whole >= 1 ? 1 : whole >= 0.74 ? whole : vp.clientWidth < 1100 || vp.clientHeight < 600 ? 0.86 : 1;
    }
    if (target && layout.placed.has(target)) chart.centerOn(target, false);
    else { v.x = 0; v.y = (vp.clientHeight - layout.height * v.z) / 2; apply(); }
    if (target) chart.focusCard(target);
    else vp.focus({ preventScroll: true });
  }, [viewKey, layout]);

  useEffect(() => {
    paintHot();
    if (selected) requestAnimationFrame(() => chart.ensureVisible(selected));
  }, [selected, layout]);

  // The mini-map: one dot per placed card, redrawn when the layout or colours change.
  const mmSig = props.minimapColor ? [...layout.placed.keys()].map((id) => props.minimapColor!(id) ?? '-').join('') : '';
  useEffect(() => {
    const c = mmCanvas.current;
    if (!c || !props.minimapColor) return;
    const s = Math.min(MM_W / layout.width, MM_H / layout.height);
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.ceil(layout.width * s * dpr);
    c.height = Math.ceil(layout.height * s * dpr);
    c.style.width = Math.ceil(layout.width * s) + 'px';
    c.style.height = Math.ceil(layout.height * s) + 'px';
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    if (matrix) {
      g.fillStyle = 'rgba(160, 180, 230, 0.10)';
      for (const b of matrix.bands) g.fillRect(b.x * s, 0, b.w * s, layout.height * s);
    }
    for (const p of layout.placed.values()) {
      const col = props.minimapColor(p.id);
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(p.x * s, p.y * s, Math.max(1.5, p.w * s), Math.max(1.5, p.h * s));
    }
    apply();
  }, [layout, mmSig]);

  useEffect(() => {
    const vp = viewport.current;
    if (!vp) return;
    const ro = new ResizeObserver(() => apply());
    ro.observe(vp);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const b = vp.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 32 : 1;
      if (e.shiftKey || (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY))) {
        view.current.x -= (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit;
        apply();
      } else {
        zoomAt(Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX - b.left, e.clientY - b.top);
      }
    };
    vp.addEventListener('wheel', onWheel, { passive: false });

    let down: { id: number; x: number; y: number; vx: number; vy: number } | null = null;
    let dragged = false;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button, input, select, a, .tree-tools, .tree-minimap')) return;
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: view.current.x, vy: view.current.y };
      dragged = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (!dragged && Math.hypot(dx, dy) < 5) return;
      if (!dragged) {
        dragged = true;
        vp.classList.add('is-dragging');
        try { vp.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      }
      view.current.x = down.vx + dx;
      view.current.y = down.vy + dy;
      apply();
    };
    const onUp = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return;
      down = null;
      vp.classList.remove('is-dragging');
      if (dragged) setTimeout(() => { dragged = false; }, 0);
    };
    // A drag that ends over a card must not open it.
    const onClickCapture = (e: MouseEvent) => {
      if (dragged) { e.stopPropagation(); e.preventDefault(); }
    };
    vp.addEventListener('pointerdown', onDown);
    vp.addEventListener('pointermove', onMove);
    vp.addEventListener('pointerup', onUp);
    vp.addEventListener('pointercancel', onUp);
    vp.addEventListener('click', onClickCapture, true);

    const onOver = (e: MouseEvent) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset.handle ?? null;
      if (id !== hover.current) { hover.current = id; paintHot(); }
    };
    const onLeave = () => { if (hover.current) { hover.current = null; paintHot(); } };
    vp.addEventListener('mouseover', onOver);
    vp.addEventListener('mouseleave', onLeave);

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') { zoomAt(1.2, undefined, undefined, true); e.preventDefault(); return; }
      if (e.key === '-' || e.key === '_') { zoomAt(1 / 1.2, undefined, undefined, true); e.preventDefault(); return; }
      if (e.key === 'f' || e.key === 'F') { chart.fit(); e.preventDefault(); return; }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const L = live.current.layout;
      const cur = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-handle]')?.dataset.handle ?? null;
      const from = cur && L.placed.has(cur) ? cur : null;
      const next = from ? neighbour(L, from, e.key) : live.current.selected && L.placed.has(live.current.selected) ? live.current.selected : L.cols.find((c) => c.length)?.[0] ?? null;
      e.preventDefault();
      if (!next) return;
      chart.ensureVisible(next);
      chart.focusCard(next);
    };
    vp.addEventListener('keydown', onKey);
    const onFocusIn = (e: FocusEvent) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset.handle ?? null;
      if (id && !vp.matches(':hover')) { hover.current = id; paintHot(); }
    };
    vp.addEventListener('focusin', onFocusIn);
    const onFocusOut = () => {
      if (hover.current && !vp.matches(':hover')) { hover.current = null; paintHot(); }
    };
    vp.addEventListener('focusout', onFocusOut);

    return () => {
      ro.disconnect();
      if (pending.current) cancelAnimationFrame(pending.current);
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('pointerdown', onDown);
      vp.removeEventListener('pointermove', onMove);
      vp.removeEventListener('pointerup', onUp);
      vp.removeEventListener('pointercancel', onUp);
      vp.removeEventListener('click', onClickCapture, true);
      vp.removeEventListener('mouseover', onOver);
      vp.removeEventListener('mouseleave', onLeave);
      vp.removeEventListener('keydown', onKey);
      vp.removeEventListener('focusin', onFocusIn);
      vp.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  // Mini-map navigation: press or drag to centre the chart there.
  const mmNav = (e: PointerEvent) => {
    const c = mmCanvas.current;
    if (!c) return;
    const b = c.getBoundingClientRect();
    const L = live.current.layout;
    const s = Math.min(MM_W / L.width, MM_H / L.height);
    centerAt((e.clientX - b.left) / s, (e.clientY - b.top) / s, e.type === 'pointerdown');
  };

  // Cards in the tiles near the viewport (all of them before the first measurement), plus
  // the selected card and one being focused by the keyboard.
  const ready = vis.key !== '';
  const ids: string[] = [];
  if (!vis.far) {
    for (const p of layout.placed.values()) {
      if (!ready || (p.x < vis.x1 && p.x + p.w > vis.x0 && p.y < vis.y1 && p.y + p.h > vis.y0) || p.id === selected || p.id === forced.current) ids.push(p.id);
    }
  }

  return (
    <div class={cx('tree-viewport', matrix && 'is-matrix')} ref={viewport} tabIndex={0} role="group" aria-label={label} data-testid="tree-viewport" data-cards={layout.placed.size}>
      <style ref={hotStyle} />
      <div class={cx('tree-canvas', quiet && 'is-quiet')} ref={canvas} style={{ width: layout.width + 'px', height: layout.height + 'px' }}>
        {matrix ? matrix.bands.map((b, i) => (
          <div class={cx('tree-band', i % 2 === 1 && 'is-alt')} style={{ left: b.x - 22 + 'px', width: b.w + 44 + 'px', top: '0px', height: layout.height + 'px' }} />
        )) : null}
        {matrix ? matrix.lanes.map((l) => (
          <div class="tree-lane" style={{ top: l.y - 13 + 'px', height: l.h + 26 + 'px', '--g': props.laneColor?.(l.lane) ?? 'var(--brass)' } as JSX.CSSProperties} />
        )) : null}
        {layout.plates.map((p) => (
          <div class="tree-plate" style={{ left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px', '--g': groupColor(p.group) } as JSX.CSSProperties}>
            <span class="tree-plate-label">{tc(p.group)}</span>
          </div>
        ))}
        {matrix && vis.far && cellSummary ? matrix.cells.map((c) => (
          // pressing a cell zooms into its cards
          <div class="tree-cellsum" style={{ left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px', '--g': props.laneColor?.(c.lane) ?? 'var(--brass)' } as JSX.CSSProperties} data-testid="tree-cell"
            onClick={() => { view.current.z = 0.8; centerAt(c.x + c.w / 2, c.y + Math.min(c.h, 600) / 2, true); }}>
            {cellSummary(c)}
          </div>
        )) : null}
        <svg class="tree-edges" width={layout.width} height={layout.height} aria-hidden="true">
          <defs>
            <marker id="tree-arrow" viewBox="0 0 8 8" refX="6.500" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M1 1 7 4 1 7" fill="none" stroke="#d9b765" stroke-width="1.400" stroke-linecap="round" stroke-linejoin="round" />
            </marker>
          </defs>
          {layout.edges.map((e) => (
            <path d={e.d} class={cx('tree-edge', e.span > 1 && 'is-long')} data-a={e.from} data-b={e.to} marker-end="url(#tree-arrow)" />
          ))}
        </svg>
        {props.underlay}
        {layout.frontierX !== null && frontierLabel ? (
          <div class="tree-frontier-head" style={{ left: layout.frontierX + 'px', top: Math.max(8, (layout.placed.get(layout.cols[layout.cols.length - 1][0])?.y ?? 60) - 52) + 'px' }}>
            <b><Icon name="spark" size={13} /> {frontierLabel}</b>
            {frontierHint ? <span>{frontierHint}</span> : null}
          </div>
        ) : null}
        {ids.map((id) => renderCard(id))}
      </div>
      {matrix ? (
        <>
          <div class="tree-bandstrip" ref={bandStrip} aria-hidden="true">
            {matrix.bands.map((b) => (
              <div class="tree-bandhead" data-band={b.band}><b>{props.bandLabel ? props.bandLabel(b.band) : String(b.band)}</b><small>{b.count}</small></div>
            ))}
          </div>
          <div class="tree-lanestrip" ref={laneStrip} aria-hidden="true">
            {matrix.lanes.map((l) => (
              <div class="tree-lanehead" data-lane={l.lane} style={{ '--g': props.laneColor?.(l.lane) ?? 'var(--brass)' } as JSX.CSSProperties}><span>{props.laneLabel ? props.laneLabel(l.lane) : l.lane}</span></div>
            ))}
          </div>
        </>
      ) : null}
      <div class="tree-tools" role="group" aria-label={t('Zoom')}>
        <button type="button" class="tree-tool" title={t('Zoom in (+)')} aria-label={t('Zoom in (+)')} data-testid="tree-zoom-in" onClick={() => zoomAt(1.2, undefined, undefined, true)}><Icon name="plus" size={14} /></button>
        <span class="tree-zoom" ref={zoomLabel} aria-hidden="true">100%</span>
        <button type="button" class="tree-tool" title={t('Zoom out (−)')} aria-label={t('Zoom out (−)')} data-testid="tree-zoom-out" onClick={() => zoomAt(1 / 1.2, undefined, undefined, true)}><Icon name="minus" size={14} /></button>
        <button type="button" class="tree-tool" title={t('Fit everything (F)')} aria-label={t('Fit everything (F)')} data-testid="tree-fit" onClick={() => chart.fit()}><Icon name="zoomfit" size={14} /></button>
        {matrix ? (
          <span class="tree-levels" role="group" aria-label={t('Zoom level')}>
            <button type="button" class={cx('tree-level', vis.far && 'is-on')} data-testid="tree-level-overview" title={t('Era overview: how many cards each era and field holds')} onClick={() => chart.fit()}>{t('Overview')}</button>
            <button type="button" class={cx('tree-level', !vis.far && !vis.near && 'is-on')} data-testid="tree-level-band" title={t('Band view: the cards of a few eras at once')} onClick={() => zoomTo(0.45, undefined, undefined, true)}>{t('Bands')}</button>
            <button type="button" class={cx('tree-level', !vis.far && vis.near && 'is-on')} data-testid="tree-level-cards" title={t('Card view: readable cards')} onClick={() => zoomTo(0.9, undefined, undefined, true)}>{t('Cards')}</button>
          </span>
        ) : null}
      </div>
      {props.minimapColor ? (
        <div class="tree-minimap" data-testid="tree-minimap" title={t('Mini-map: press or drag to move the view')}
          onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); mmNav(e); }}
          onPointerMove={(e) => { if (e.buttons & 1) mmNav(e); }}>
          <canvas ref={mmCanvas} />
          <div class="tree-minimap-view" ref={mmView} />
        </div>
      ) : null}
      <p class="tree-hint" aria-hidden="true">{t('Drag to pan · wheel to zoom · arrow keys move between cards · Enter opens a card')}</p>
    </div>
  );
}
