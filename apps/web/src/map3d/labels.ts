// HTML overlay labels projected from the 3D scene. Text stays crisp at any device
// pixel ratio because it is laid out by the browser; the engine only moves it.
export interface LabelSpec {
  key: string;
  x: number;
  y: number;
  z: number;
  html: string;
  cls: string;
  priority: number;
  /** Shown once the camera zoom reaches this value (see Map3D.zoom). */
  minZoom: number;
  anchor: 'above' | 'below' | 'center';
  /** Always shown and never displaced (selected / hovered). */
  force?: boolean;
  /** Does not take part in collision avoidance. */
  free?: boolean;
}

interface Item { spec: LabelSpec; el: HTMLDivElement; w: number; h: number; shown: boolean }

export class LabelLayer {
  private items = new Map<string, Item>();
  private order: Item[] = [];

  constructor(private root: HTMLElement) {}

  set(specs: LabelSpec[]): void {
    const seen = new Set<string>();
    for (const s of specs) {
      seen.add(s.key);
      let it = this.items.get(s.key);
      if (!it) {
        const el = document.createElement('div');
        el.style.display = 'none';
        this.root.appendChild(el);
        it = { spec: s, el, w: 0, h: 0, shown: false };
        this.items.set(s.key, it);
        el.className = 'm3-label ' + s.cls;
        el.innerHTML = s.html;
        it.w = -1;
      } else {
        if (it.spec.html !== s.html) { it.el.innerHTML = s.html; it.w = -1; }
        if (it.spec.cls !== s.cls) { it.el.className = 'm3-label ' + s.cls; it.w = -1; }
        it.spec = s;
      }
    }
    for (const [k, it] of this.items) {
      if (!seen.has(k)) { it.el.remove(); this.items.delete(k); }
    }
    this.order = [...this.items.values()].sort((a, b) => (b.spec.force ? 1e6 : 0) + b.spec.priority - ((a.spec.force ? 1e6 : 0) + a.spec.priority));
  }

  layout(project: (x: number, y: number, z: number) => [number, number, boolean], zoom: number, w: number, h: number): void {
    // Measure anything new in one pass (forces a single layout).
    const fresh = this.order.filter((it) => it.w < 0);
    if (fresh.length) {
      for (const it of fresh) { it.el.style.display = ''; it.el.style.visibility = 'hidden'; it.el.style.transform = 'translate(-999px,-999px)'; }
      for (const it of fresh) { it.w = it.el.offsetWidth; it.h = it.el.offsetHeight; }
      for (const it of fresh) { it.el.style.visibility = ''; it.shown = true; }
    }
    const placed: number[] = [];
    for (const it of this.order) {
      const s = it.spec;
      let show = s.force || zoom >= s.minZoom;
      let x0 = 0, y0 = 0;
      if (show) {
        const [sx, sy, ok] = project(s.x, s.y, s.z);
        x0 = Math.round(sx - it.w / 2);
        y0 = Math.round(s.anchor === 'above' ? sy - it.h : s.anchor === 'below' ? sy : sy - it.h / 2);
        if (!ok || x0 > w || y0 > h || x0 + it.w < 0 || y0 + it.h < 0) show = false;
      }
      if (show && !s.free) {
        if (!s.force) {
          for (let i = 0; i < placed.length; i += 4) {
            if (x0 < placed[i + 2] && x0 + it.w > placed[i] && y0 < placed[i + 3] && y0 + it.h > placed[i + 1]) { show = false; break; }
          }
        }
        if (show) placed.push(x0 - 3, y0 - 2, x0 + it.w + 3, y0 + it.h + 2);
      }
      if (show) {
        it.el.style.transform = `translate(${x0}px,${y0}px)`;
        if (!it.shown) { it.el.style.display = ''; it.shown = true; }
      } else if (it.shown) {
        it.el.style.display = 'none';
        it.shown = false;
      }
    }
  }

  dispose(): void {
    for (const it of this.items.values()) it.el.remove();
    this.items.clear();
    this.order = [];
  }
}

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}
