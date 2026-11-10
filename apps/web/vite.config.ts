import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// The production build is served by the Rust binary from the same origin, so
// assets use relative paths and the client always calls relative /api/... URLs.
export default defineConfig({
  base: './',
  plugins: [preact()],
  server: {
    port: Number(process.env.BTS_DEV_PORT ?? 5173),
    proxy: { '/api': 'http://127.0.0.1:7979' },
  },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020', chunkSizeWarningLimit: 900 },
});
