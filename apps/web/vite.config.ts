import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import preact from '@preact/preset-vite';

// The encyclopedia passages (content/lore/*.json, keyed by content id) reach the client as
// one lazily loaded module per language, `virtual:lore/<locale>`, keyed by the card's
// English name, which is all an observation carries (cards are addressed by opaque handles).
// The main bundle holds none of the text; each language is its own chunk.
const LORE_LOCALES = ['en', 'zh-Hans', 'zh-Hant'];
function lore(): Plugin {
  const prefix = 'virtual:lore/';
  const content = (p: string) => fileURLToPath(new URL('../../content/' + p, import.meta.url));
  return {
    name: 'bts-lore',
    resolveId(id) {
      return id.startsWith(prefix) && LORE_LOCALES.includes(id.slice(prefix.length)) ? '\0' + id : null;
    },
    load(id) {
      if (!id.startsWith('\0' + prefix)) return null;
      const locale = id.slice(prefix.length + 1);
      const read = (p: string) => {
        this.addWatchFile(content(p));
        return JSON.parse(readFileSync(content(p), 'utf8'));
      };
      const pack: Record<string, Record<string, unknown>> = { tech: {}, practice: {} };
      for (const [kind, nodes, passages] of [['tech', 'technologies.json', 'lore/technologies.json'], ['practice', 'practices.json', 'lore/practices.json']]) {
        const names = new Map<string, string>(read(nodes).map((n: { id: string; name: string }) => [n.id, n.name]));
        for (const e of read(passages)) {
          const name = names.get(e.id);
          if (name && e[locale]) pack[kind][name] = e[locale];
        }
      }
      return `export default ${JSON.stringify(pack)};`;
    },
  };
}

// Public catalogue facts the trees arrange disclosed cards by (`virtual:tree-tables`), keyed
// by English name like the lore: a technology's era band (content/pacing.json `band`, else the
// engine's `tech_era` id ranges) and field letter; a rival family's kind and the names of its
// refuting technologies; a practice's exclusive group name. The client looks a card up only
// once the observation has disclosed it, so nothing here reaches the screen on its own.
function techEraOf(id: string): number {
  const n = Number(id.slice(1));
  const r = (a: number, b: number) => n >= a && n <= b;
  if (r(1, 16)) return 0;
  if (r(20, 29)) return 1;
  if (r(30, 35)) return 2;
  if (r(36, 49)) return 3;
  if ([57, 58, 86, 87, 110, 160].includes(n) || r(90, 95) || r(100, 105)) return 5;
  if (r(50, 56) || r(60, 71) || r(80, 85)) return 4;
  if ([120, 122, 125, 161, 173, 177, 180, 181].includes(n) || r(135, 137)) return 8;
  if ([96, 97, 121, 123, 124, 140, 141].includes(n) || r(106, 119) || r(130, 134)) return 6;
  if (r(142, 159) || r(170, 182)) return 7;
  if (r(162, 167)) return 9;
  return 0;
}
function treeTables(): Plugin {
  const id = 'virtual:tree-tables';
  const content = (p: string) => fileURLToPath(new URL('../../content/' + p, import.meta.url));
  return {
    name: 'bts-tree-tables',
    resolveId(x) {
      return x === id ? '\0' + id : null;
    },
    load(x) {
      if (x !== '\0' + id) return null;
      const read = (p: string) => {
        this.addWatchFile(content(p));
        return JSON.parse(readFileSync(content(p), 'utf8'));
      };
      const techs: { id: string; name: string; group: string; group_title: string; tradition?: string }[] = read('technologies.json');
      const practices: { id: string; name: string }[] = read('practices.json');
      const pacing = read('pacing.json');
      const fam = read('families.json');
      const techName = new Map(techs.map((t) => [t.id, t.name]));
      const pracName = new Map(practices.map((p) => [p.id, p.name]));
      const band: Record<string, number> = {};
      for (const t of techs) band[t.name] = pacing.nodes?.[t.id]?.band ?? techEraOf(t.id);
      const fields: Record<string, { letter: string; tradition: string | null }> = {};
      for (const t of techs) if (!fields[t.group_title]) fields[t.group_title] = { letter: t.group, tradition: t.tradition ?? null };
      const families: Record<string, { kind: string; refuted_by: string[] }> = {};
      for (const f of fam.families) families[f.name] = { kind: f.kind, refuted_by: f.refuted_by.map((r: string) => techName.get(r)).filter(Boolean) };
      const exclusive: Record<string, string> = {};
      for (const g of fam.exclusive_groups) for (const m of g.members) { const n = pracName.get(m); if (n) exclusive[n] = g.name; }
      return `export default ${JSON.stringify({ band, fields, families, exclusive })};`;
    },
  };
}

// Two ways to ship the same client:
//
//   server build (default)   served by the Rust binary from the same origin; the
//                            client calls relative /api/... URLs.
//   browser build            VITE_BTS_LOCAL=1 (scripts/build-pages.sh): the referee is
//                            the WebAssembly module in wasm/bts.wasm, run in a Web
//                            Worker; there is no server. This is the GitHub Pages site.
//
// Either way every asset, the worker and the module are addressed relative to the
// page or to the script that loads them (`base: './'`), so the build works from any
// subpath, for example https://<user>.github.io/<repository>/.
const wasm = fileURLToPath(new URL('./wasm/bts.wasm', import.meta.url));
if (process.env.VITE_BTS_LOCAL === '1' && !existsSync(wasm)) {
  throw new Error('VITE_BTS_LOCAL=1 needs apps/web/wasm/bts.wasm: run scripts/build-wasm.sh first (scripts/build-pages.sh does both).');
}

export default defineConfig({
  base: './',
  plugins: [preact(), lore(), treeTables()],
  // the referee's worker is a module worker
  worker: { format: 'es' },
  server: {
    port: Number(process.env.BTS_DEV_PORT ?? 5173),
    proxy: { '/api': 'http://127.0.0.1:7979' },
  },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020', chunkSizeWarningLimit: 900 },
});
