// Layout for the technology and civics trees. It is computed from the disclosed
// cards and their disclosed links and from nothing else: a column is the longest
// chain of disclosed prerequisites behind a card, rows are packed without gaps,
// and no space, count or identifier refers to anything the seat has not seen.

export interface LNode {
  id: string;
  /** Disclosed prerequisites (ids). Links to cards that are not in the set are ignored. */
  links: string[];
  group: string;
  /** Stable tie-break: when the card became known, then its position in the observation. */
  key: number;
}

export interface Placed {
  id: string;
  col: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Edge {
  from: string;
  to: string;
  d: string;
  /** Columns crossed. */
  span: number;
}

export interface Plate {
  group: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TreeLayout {
  placed: Map<string, Placed>;
  /** Card ids by column, top to bottom (the frontier column, if any, is last). */
  cols: string[][];
  edges: Edge[];
  plates: Plate[];
  /** Groups in the order they first appear (earliest column, then earliest card). */
  groups: string[];
  /** Left edge of the frontier column, when there is one. */
  frontierX: number | null;
  width: number;
  height: number;
}

export interface LayoutOptions {
  cardW: number;
  cardH: number;
  gapX: number;
  gapY: number;
  /** Keep cards of one group together within a column and draw a plate behind each run. */
  groupSort: boolean;
  /** Extra items shown as a trailing column of their own (leads). */
  frontier?: { id: string; h: number }[];
  pad?: number;
}

export function layoutTree(nodes: LNode[], o: LayoutOptions): TreeLayout {
  const pad = o.pad ?? 56;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parents = new Map<string, string[]>();
  for (const n of nodes) parents.set(n.id, n.links.filter((l) => l !== n.id && byId.has(l)));

  // Column = longest path of disclosed prerequisites (a cycle, which the rules do not produce, is cut).
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let d = 0;
    for (const p of parents.get(id) ?? []) d = Math.max(d, depthOf(p) + 1);
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const n of nodes) depthOf(n.id);

  const children = new Map<string, string[]>();
  for (const n of nodes) for (const p of parents.get(n.id) ?? []) {
    const list = children.get(p);
    if (list) list.push(n.id);
    else children.set(p, [n.id]);
  }

  // Groups in order of first appearance.
  const groupFirst = new Map<string, [number, number]>();
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0;
    const cur = groupFirst.get(n.group);
    if (!cur || d < cur[0] || (d === cur[0] && n.key < cur[1])) groupFirst.set(n.group, [d, n.key]);
  }
  const groups = [...groupFirst.entries()].sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1]).map((e) => e[0]);
  const gi = new Map(groups.map((g, i) => [g, i]));
  const groupIdx = (id: string) => (o.groupSort ? gi.get(byId.get(id)!.group) ?? 0 : 0);

  const colCount = nodes.length ? Math.max(...nodes.map((n) => depth.get(n.id) ?? 0)) + 1 : 0;
  const cols: string[][] = Array.from({ length: colCount }, () => []);
  for (const n of [...nodes].sort((a, b) => a.key - b.key)) cols[depth.get(n.id) ?? 0].push(n.id);

  // Order rows to shorten links: a few barycentre sweeps, ties broken by the stable key.
  const pos = new Map<string, number>();
  const setPos = (c: number) => cols[c].forEach((id, i) => pos.set(id, i - (cols[c].length - 1) / 2));
  const keyOf = (id: string) => byId.get(id)!.key;
  const mean = (ids: string[], fallback: number) => (ids.length ? ids.reduce((a, x) => a + (pos.get(x) ?? 0), 0) / ids.length : fallback);
  for (let c = 0; c < colCount; c++) {
    cols[c].sort((a, b) => groupIdx(a) - groupIdx(b) || keyOf(a) - keyOf(b));
    setPos(c);
  }
  const sweep = (c: number, rel: Map<string, string[]>) => {
    const bary = new Map(cols[c].map((id) => [id, mean(rel.get(id) ?? [], pos.get(id) ?? 0)]));
    cols[c].sort((a, b) => groupIdx(a) - groupIdx(b) || bary.get(a)! - bary.get(b)! || keyOf(a) - keyOf(b));
    setPos(c);
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let c = 1; c < colCount; c++) sweep(c, parents);
    for (let c = colCount - 2; c >= 0; c--) sweep(c, children);
  }
  for (let c = 1; c < colCount; c++) sweep(c, parents);

  // Coordinates: each column is packed and centred on the tallest one.
  const runGap = o.groupSort ? 30 : 0;
  const colHeights = cols.map((ids) => {
    let h = 0;
    ids.forEach((id, i) => {
      if (i) h += o.gapY + (o.groupSort && byId.get(id)!.group !== byId.get(ids[i - 1])!.group ? runGap : 0);
      h += o.cardH;
    });
    return h;
  });
  const frontier = o.frontier ?? [];
  const frontierH = frontier.reduce((a, f, i) => a + f.h + (i ? o.gapY : 0), 0);
  const top = pad + (o.groupSort ? 22 : 0) + (frontier.length ? 12 : 0);
  const innerH = Math.max(0, ...colHeights, frontierH);
  const placed = new Map<string, Placed>();
  const plates: Plate[] = [];
  cols.forEach((ids, c) => {
    const x = pad + c * (o.cardW + o.gapX);
    let y = top + (innerH - colHeights[c]) / 2;
    let run: Plate | null = null;
    ids.forEach((id, i) => {
      const g = byId.get(id)!.group;
      if (i) y += o.gapY + (o.groupSort && g !== byId.get(ids[i - 1])!.group ? runGap : 0);
      placed.set(id, { id, col: c, row: i, x, y, w: o.cardW, h: o.cardH });
      if (o.groupSort) {
        if (run && run.group === g) run.h = y + o.cardH + 9 - run.y;
        else {
          run = { group: g, x: x - 9, y: y - 24, w: o.cardW + 18, h: o.cardH + 33 };
          plates.push(run);
        }
      }
      y += o.cardH;
    });
  });

  let width = pad * 2 + Math.max(0, colCount * (o.cardW + o.gapX) - o.gapX);
  let frontierX: number | null = null;
  const outCols = cols.map((c) => [...c]);
  if (frontier.length) {
    frontierX = colCount ? pad + colCount * (o.cardW + o.gapX) + 26 : pad;
    let y = top + (innerH - frontierH) / 2;
    const ids: string[] = [];
    frontier.forEach((f, i) => {
      if (i) y += o.gapY;
      placed.set(f.id, { id: f.id, col: colCount, row: i, x: frontierX!, y, w: o.cardW, h: f.h });
      ids.push(f.id);
      y += f.h;
    });
    outCols.push(ids);
    width = frontierX + o.cardW + pad;
  }
  const height = top + innerH + pad;

  // Links: from the right edge of the prerequisite to the left edge of the card, with the
  // ports spread so several links into one card do not pile onto one point.
  const edges: Edge[] = [];
  const inPort = new Map<string, number>();
  const outPort = new Map<string, number>();
  const spread = (n: number, i: number) => (n <= 1 ? 0 : (i - (n - 1) / 2) * Math.min(13, (o.cardH - 44) / (n - 1)));
  for (const n of nodes) {
    const ps = [...(parents.get(n.id) ?? [])].sort((a, b) => placed.get(a)!.y - placed.get(b)!.y);
    ps.forEach((p, i) => inPort.set(p + '>' + n.id, spread(ps.length, i)));
    const cs = [...(children.get(n.id) ?? [])].sort((a, b) => placed.get(a)!.y - placed.get(b)!.y);
    cs.forEach((c, i) => outPort.set(n.id + '>' + c, spread(cs.length, i)));
  }
  for (const n of nodes) {
    const b = placed.get(n.id)!;
    for (const p of parents.get(n.id) ?? []) {
      const a = placed.get(p)!;
      const k = p + '>' + n.id;
      const fx = a.x + a.w;
      const fy = a.y + a.h / 2 + (outPort.get(k) ?? 0);
      const tx = b.x - 5;
      const ty = b.y + b.h / 2 + (inPort.get(k) ?? 0);
      const dx = Math.max(26, (tx - fx) * 0.5);
      edges.push({ from: p, to: n.id, span: b.col - a.col, d: `M${r(fx)} ${r(fy)}C${r(fx + dx)} ${r(fy)} ${r(tx - dx)} ${r(ty)} ${r(tx)} ${r(ty)}` });
    }
  }
  return { placed, cols: outCols, edges, plates, groups, frontierX, width, height };
}

function r(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

/** The card a key press moves to from `id`, or null at the edge of the layout. */
export function neighbour(layout: TreeLayout, id: string, key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'): string | null {
  const p = layout.placed.get(id);
  if (!p) return null;
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const col = layout.cols[p.col] ?? [];
    return col[p.row + (key === 'ArrowUp' ? -1 : 1)] ?? null;
  }
  const step = key === 'ArrowLeft' ? -1 : 1;
  for (let c = p.col + step; c >= 0 && c < layout.cols.length; c += step) {
    const col = layout.cols[c];
    if (!col.length) continue;
    let best = col[0];
    let bestD = Infinity;
    for (const other of col) {
      const q = layout.placed.get(other)!;
      const d = Math.abs(q.y + q.h / 2 - (p.y + p.h / 2));
      if (d < bestD) { bestD = d; best = other; }
    }
    return best;
  }
  return null;
}
