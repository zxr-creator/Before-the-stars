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
  plugins: [preact(), lore()],
  // the referee's worker is a module worker
  worker: { format: 'es' },
  server: {
    port: Number(process.env.BTS_DEV_PORT ?? 5173),
    proxy: { '/api': 'http://127.0.0.1:7979' },
  },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020', chunkSizeWarningLimit: 900 },
});
