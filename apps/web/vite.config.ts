import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

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
  plugins: [preact()],
  // the referee's worker is a module worker
  worker: { format: 'es' },
  server: {
    port: Number(process.env.BTS_DEV_PORT ?? 5173),
    proxy: { '/api': 'http://127.0.0.1:7979' },
  },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020', chunkSizeWarningLimit: 900 },
});
