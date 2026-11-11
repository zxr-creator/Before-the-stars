// Era-band layout for the deeper trees (design chapter 39, section 7): era bands as
// columns, field lanes as rows, cards packed into each band-and-lane cell. Like the
// older layered layout it is computed from the disclosed cards and their disclosed links
// alone: only bands and lanes that hold a disclosed card exist, cells are packed without
// gaps, and the extent of the chart grows only with what the seat has seen.
import type { Edge, Placed, TreeLayout } from './layout';

export interface MNode {
  id: string;
  links: string[];
  band: number;
  lane: string;
  /** Sort key inside a cell before the stable key (keeps a group, or an exclusive pair, together). */
  sort: string;
  key: number;
}

export interface MatrixBand { band: number; x: number; w: number; count: number }
export interface MatrixLane { lane: string; y: number; h: number; count: number }
export interface MatrixCell { band: number; lane: string; x: number; y: number; w: number; h: number; ids: string[] }

export interface MatrixLayout extends TreeLayout {
  bands: MatrixBand[];
  lanes: MatrixLane[];
  cells: MatrixCell[];
  /** Height of the era header strip and width of the lane gutter, in chart pixels. */
  headH: number;
  gutterW: number;
}

export interface MatrixOptions {
  cardW: number;
  cardH: number;
  gapX: number;
  gapY: number;
  laneOrder(a: string, b: string): number;
  /** Most sub-columns a band may use. */
  maxSub?: number;
  /** Rows a band's fullest cell should aim for (more cards add sub-columns, up to maxSub). */
  rowsTarget?: number;
  /** Extra items shown as a trailing column of their own (leads). */
  frontier?: { id: string; h: number }[];
}

const HEAD_H = 64;
const GUTTER_W = 40;
const BAND_GAP = 56;
const LANE_GAP = 26;
const CELL_PAD = 14;

export function layoutMatrix(nodes: MNode[], o: MatrixOptions): MatrixLayout {
  const maxSub = o.maxSub ?? 4;
  const rowsTarget = o.rowsTarget ?? 3;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parents = new Map<string, string[]>();
  for (const n of nodes) parents.set(n.id, n.links.filter((l) => l !== n.id && byId.has(l)));

  // Depth inside a band: the longest chain of disclosed prerequisites in the same band.
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const n = byId.get(id)!;
    let d = 0;
    for (const p of parents.get(id) ?? []) if (byId.get(p)!.band === n.band) d = Math.max(d, depthOf(p) + 1);
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const n of nodes) depthOf(n.id);

  const bandIds = [...new Set(nodes.map((n) => n.band))].sort((a, b) => a - b);
  const laneIds = [...new Set(nodes.map((n) => n.lane))].sort(o.laneOrder);
  const cellOf = new Map<string, MNode[]>();
  const ck = (b: number, l: string) => b + '|' + l;
  for (const n of nodes) {
    const k = ck(n.band, n.lane);
    const list = cellOf.get(k);
    if (list) list.push(n);
    else cellOf.set(k, [n]);
  }

  // Sub-columns per band, from its fullest cell; rows per cell fill column by column so a
  // prerequisite in the same cell always sits above or to the left of what builds on it.
  const sub = new Map<number, number>();
  for (const b of bandIds) {
    let most = 1;
    for (const l of laneIds) most = Math.max(most, cellOf.get(ck(b, l))?.length ?? 0);
    sub.set(b, Math.max(1, Math.min(maxSub, Math.ceil(most / rowsTarget))));
  }
  const rowsOf = (b: number, l: string) => {
    const n = cellOf.get(ck(b, l))?.length ?? 0;
    return n ? Math.ceil(n / sub.get(b)!) : 0;
  };
  const laneRows = new Map(laneIds.map((l) => [l, Math.max(1, ...bandIds.map((b) => rowsOf(b, l)))]));

  const bands: MatrixBand[] = [];
  let x = GUTTER_W + 16;
  for (const b of bandIds) {
    const s = sub.get(b)!;
    const w = CELL_PAD * 2 + s * o.cardW + (s - 1) * o.gapX;
    bands.push({ band: b, x, w, count: nodes.filter((n) => n.band === b).length });
    x += w + BAND_GAP;
  }
  const lanes: MatrixLane[] = [];
  let y = HEAD_H + 12;
  for (const l of laneIds) {
    const r = laneRows.get(l)!;
    const h = CELL_PAD * 2 + 16 + r * o.cardH + (r - 1) * o.gapY;
    lanes.push({ lane: l, y, h, count: nodes.filter((n) => n.lane === l).length });
    y += h + LANE_GAP;
  }

  const placed = new Map<string, Placed>();
  const cells: MatrixCell[] = [];
  const cols: string[][] = [];
  bands.forEach((B, bi) => {
    const s = sub.get(B.band)!;
    const colIds: string[][] = Array.from({ length: s }, () => []);
    for (const L of lanes) {
      const list = cellOf.get(ck(B.band, L.lane));
      if (!list?.length) continue;
      list.sort((a, b) => depth.get(a.id)! - depth.get(b.id)! || a.sort.localeCompare(b.sort) || a.key - b.key);
      const rows = Math.ceil(list.length / s);
      list.forEach((n, i) => {
        const c = Math.floor(i / rows);
        const r = i % rows;
        const px = B.x + CELL_PAD + c * (o.cardW + o.gapX);
        const py = L.y + CELL_PAD + 16 + r * (o.cardH + o.gapY);
        placed.set(n.id, { id: n.id, col: 0, row: 0, x: px, y: py, w: o.cardW, h: o.cardH });
        colIds[c].push(n.id);
      });
      cells.push({ band: B.band, lane: L.lane, x: B.x, y: L.y, w: B.w, h: L.h, ids: list.map((n) => n.id) });
    }
    for (const ids of colIds) {
      ids.sort((a, b) => placed.get(a)!.y - placed.get(b)!.y);
      const c = cols.length;
      ids.forEach((id, r) => { const p = placed.get(id)!; p.col = c; p.row = r; });
      cols.push(ids);
    }
    void bi;
  });

  let width = x - BAND_GAP + 40;
  let frontierX: number | null = null;
  const frontier = o.frontier ?? [];
  if (frontier.length) {
    frontierX = x + 10;
    let fy = HEAD_H + 12 + 40;
    const ids: string[] = [];
    frontier.forEach((f, i) => {
      if (i) fy += o.gapY;
      placed.set(f.id, { id: f.id, col: cols.length, row: i, x: frontierX!, y: fy, w: o.cardW, h: f.h });
      ids.push(f.id);
      fy += f.h;
    });
    cols.push(ids);
    width = frontierX + o.cardW + 48;
    y = Math.max(y, fy + 40);
  }
  const height = y + 30;

  // Links: right edge to left edge between columns; a short drop inside one column.
  const edges: Edge[] = [];
  for (const n of nodes) {
    const b = placed.get(n.id)!;
    for (const p of parents.get(n.id) ?? []) {
      const a = placed.get(p)!;
      const span = Math.abs(byId.get(p)!.band - n.band) + (byId.get(p)!.lane === n.lane ? 0 : 1);
      if (Math.abs(a.x - b.x) < 1) {
        const fx = a.x + a.w - 18;
        const fy = a.y + a.h;
        const tx = b.x + b.w - 18;
        const ty = b.y - 4;
        const bulge = Math.min(60, Math.abs(ty - fy) * 0.4 + 18);
        edges.push({ from: p, to: n.id, span, d: `M${r(fx)} ${r(fy)}C${r(fx + bulge)} ${r(fy + bulge)} ${r(tx + bulge)} ${r(ty - bulge)} ${r(tx)} ${r(ty)}` });
        continue;
      }
      const forward = b.x > a.x;
      const fx = forward ? a.x + a.w : a.x;
      const fy = a.y + a.h / 2;
      const tx = forward ? b.x - 5 : b.x + b.w + 5;
      const ty = b.y + b.h / 2;
      const dx = Math.max(30, Math.abs(tx - fx) * 0.45) * (forward ? 1 : -1);
      edges.push({ from: p, to: n.id, span, d: `M${r(fx)} ${r(fy)}C${r(fx + dx)} ${r(fy)} ${r(tx - dx)} ${r(ty)} ${r(tx)} ${r(ty)}` });
    }
  }
  return { placed, cols, edges, plates: [], groups: [], frontierX, width, height, bands, lanes, cells, headH: HEAD_H, gutterW: GUTTER_W };
}

function r(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

/** Ids of placed items whose box meets the rectangle (chart pixels). */
export function inRect(L: TreeLayout, x0: number, y0: number, x1: number, y1: number): string[] {
  const out: string[] = [];
  for (const p of L.placed.values()) if (p.x < x1 && p.x + p.w > x0 && p.y < y1 && p.y + p.h > y0) out.push(p.id);
  return out;
}
