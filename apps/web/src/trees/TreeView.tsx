// The pannable, zoomable chart both trees are drawn on: group plates, links and
// the cards handed in as children. Pan, zoom and hover highlighting are applied
// straight to the DOM so that moving the chart never re-renders the cards.
import { Component } from 'preact';
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { Icon } from '../icons';
import { cx } from '../ui';
import { t, tc } from '../i18n';
import { Vignette } from '../art/vignette';
import { neighbour } from './layout';
import type { TreeLayout } from './layout';

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
  layout: TreeLayout;
  /** The view (pan and zoom) is kept while this stays the same. */
  viewKey: string;
  /** Card to centre on when the chart first opens. */
  target: string | null;
  selected: string | null;
  /** A search is narrowing the cards: links recede. */
  quiet: boolean;
  label: string;
  groupColor(group: string): string;
  frontierLabel?: string;
  frontierHint?: string;
  api: { current: ChartApi | null };
  children: ComponentChildren;
}

const Z_MIN = 0.2;
const Z_MAX = 1.5;

export function TreeChart({ layout, viewKey, target, selected, quiet, label, groupColor, frontierLabel, frontierHint, api, children }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const hotStyle = useRef<HTMLStyleElement>(null);
  const zoomLabel = useRef<HTMLSpanElement>(null);
  const view = useRef({ x: 0, y: 0, z: 1 });
  const live = useRef({ layout, selected });
  live.current = { layout, selected };
  const hover = useRef<string | null>(null);
  const openedKey = useRef('');

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
    v.x = w <= vw ? (vw - w) / 2 : Math.max(vw - w - slack, Math.min(slack, v.x));
    v.y = h <= vh ? (vh - h) / 2 : Math.max(vh - h - slack, Math.min(slack, v.y));
    cv.classList.toggle('is-gliding', glide);
    cv.style.transform = `translate(${v.x.toFixed(1)}px, ${v.y.toFixed(1)}px) scale(${v.z.toFixed(4)})`;
    if (zoomLabel.current) zoomLabel.current.textContent = Math.round(v.z * 100) + '%';
  };

  const zoomAt = (factor: number, cx0?: number, cy0?: number, glide = false) => {
    const vp = viewport.current;
    if (!vp) return;
    const v = view.current;
    const px = cx0 ?? vp.clientWidth / 2;
    const py = cy0 ?? vp.clientHeight / 2;
    const z = Math.max(Z_MIN, Math.min(Z_MAX, v.z * factor));
    v.x = px - ((px - v.x) * z) / v.z;
    v.y = py - ((py - v.y) * z) / v.z;
    v.z = z;
    apply(glide);
  };

  const chart: ChartApi = {
    centerOn(id, glide = true) {
      const vp = viewport.current;
      const p = live.current.layout.placed.get(id);
      if (!vp || !p) return;
      const v = view.current;
      v.x = vp.clientWidth / 2 - (p.x + p.w / 2) * v.z;
      v.y = vp.clientHeight / 2 - (p.y + p.h / 2) * v.z;
      apply(glide);
    },
    ensureVisible(id) {
      const vp = viewport.current;
      const p = live.current.layout.placed.get(id);
      if (!vp || !p) return;
      const v = view.current;
      const m = 28;
      const left = p.x * v.z + v.x;
      const top = p.y * v.z + v.y;
      const right = left + p.w * v.z;
      const bottom = top + p.h * v.z;
      if (left < m) v.x += m - left;
      else if (right > vp.clientWidth - m) v.x -= right - (vp.clientWidth - m);
      if (top < m) v.y += m - top;
      else if (bottom > vp.clientHeight - m) v.y -= bottom - (vp.clientHeight - m);
      apply(true);
    },
    fit() {
      const vp = viewport.current;
      if (!vp) return;
      const L = live.current.layout;
      const v = view.current;
      v.z = Math.max(Z_MIN, Math.min(1, vp.clientWidth / L.width, vp.clientHeight / L.height));
      v.x = (vp.clientWidth - L.width * v.z) / 2;
      v.y = (vp.clientHeight - L.height * v.z) / 2;
      apply(true);
    },
    focusCard(id) {
      const el = canvas.current?.querySelector<HTMLElement>(`[data-handle="${id}"]`);
      el?.focus({ preventScroll: true });
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
      `.tree-canvas .tree-edge{opacity:.16}` +
      `.tree-canvas .tree-edge[data-a="${id}"],.tree-canvas .tree-edge[data-b="${id}"]{opacity:1;stroke:#fff3c9;stroke-width:2.4;stroke-dasharray:none;filter:drop-shadow(0 0 3px rgba(241,218,152,.9))}` +
      (linked.size ? [...linked].filter((h) => /^[\w-]+$/.test(h)).map(sel).join(',') + `{box-shadow:0 0 0 2px #f1da98,0 0 16px rgba(241,218,152,.55),0 6px 16px rgba(0,0,0,.5)}` : '');
  };

  // First open (and whenever the match, seat or tree changes): a readable zoom, centred on the target.
  useLayoutEffect(() => {
    const vp = viewport.current;
    if (!vp || openedKey.current === viewKey) { apply(); return; }
    openedKey.current = viewKey;
    const v = view.current;
    // Show whole columns when a modest zoom-out is enough; otherwise stay readable and pan.
    const whole = vp.clientHeight / layout.height;
    v.z = whole >= 1 ? 1 : whole >= 0.74 ? whole : vp.clientWidth < 1100 || vp.clientHeight < 600 ? 0.86 : 1;
    if (target && layout.placed.has(target)) chart.centerOn(target, false);
    else { v.x = 0; v.y = (vp.clientHeight - layout.height * v.z) / 2; apply(); }
    if (target) chart.focusCard(target);
    else vp.focus({ preventScroll: true });
  }, [viewKey, layout]);

  useEffect(() => {
    paintHot();
    if (selected) requestAnimationFrame(() => chart.ensureVisible(selected));
  }, [selected, layout]);

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
      if ((e.target as HTMLElement).closest('button, input, a, .tree-tools')) return;
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
      chart.focusCard(next);
      chart.ensureVisible(next);
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

  return (
    <div class="tree-viewport" ref={viewport} tabIndex={0} role="group" aria-label={label} data-testid="tree-viewport">
      <style ref={hotStyle} />
      <div class={cx('tree-canvas', quiet && 'is-quiet')} ref={canvas} style={{ width: layout.width + 'px', height: layout.height + 'px' }}>
        {layout.plates.map((p) => (
          <div class="tree-plate" style={{ left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px', '--g': groupColor(p.group) } as JSX.CSSProperties}>
            <span class="tree-plate-label">{tc(p.group)}</span>
          </div>
        ))}
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
        {layout.frontierX !== null && frontierLabel ? (
          <div class="tree-frontier-head" style={{ left: layout.frontierX + 'px', top: Math.max(8, (layout.placed.get(layout.cols[layout.cols.length - 1][0])?.y ?? 60) - 52) + 'px' }}>
            <b><Icon name="spark" size={13} /> {frontierLabel}</b>
            {frontierHint ? <span>{frontierHint}</span> : null}
          </div>
        ) : null}
        {children}
      </div>
      <div class="tree-tools" role="group" aria-label={t('Zoom')}>
        <button type="button" class="tree-tool" title={t('Zoom in (+)')} aria-label={t('Zoom in (+)')} data-testid="tree-zoom-in" onClick={() => zoomAt(1.2, undefined, undefined, true)}><Icon name="plus" size={14} /></button>
        <span class="tree-zoom" ref={zoomLabel} aria-hidden="true">100%</span>
        <button type="button" class="tree-tool" title={t('Zoom out (−)')} aria-label={t('Zoom out (−)')} data-testid="tree-zoom-out" onClick={() => zoomAt(1 / 1.2, undefined, undefined, true)}><Icon name="minus" size={14} /></button>
        <button type="button" class="tree-tool" title={t('Fit everything (F)')} aria-label={t('Fit everything (F)')} data-testid="tree-fit" onClick={() => chart.fit()}><Icon name="zoomfit" size={14} /></button>
      </div>
      <p class="tree-hint" aria-hidden="true">{t('Drag to pan · wheel to zoom · arrow keys move between cards · Enter opens a card')}</p>
    </div>
  );
}
