// Draw-time check of both map tiers on large Earth-like views: pans across the date line
// with the arrow keys and reports the renderer's own per-frame draw time.
//
//   BTS_DEV_PORT=5391 node scripts/map-perf-r3.mjs [file[:spec]] ...     (from apps/web, Vite running)
//
// Defaults to the late 200-region seat view and its spectator view (dev/obs). The 3D tier
// runs in software here, so its numbers are CPU-bound upper bounds, not GPU frame times.
import { chromium } from 'playwright';

const port = process.env.BTS_DEV_PORT ?? '5387';
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['e200-late', 'local-e200-late-spec:spec'];
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
for (const f of files) {
  const [file, spec] = f.split(':');
  for (const tier of ['flat', '3d']) {
    for (const mode of ['political', 'terrain', 'resources']) {
      if (tier === '3d' && mode !== 'political') continue;
      if (tier === 'flat' && process.env.ONLY_3D) continue;
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${port}/dev/map.html?tier=${tier}&src=file&file=${file}${spec ? '&spec=1' : ''}&mode=${mode}&bare=1&lang=en`);
      await page.waitForFunction((t) => window.__atlas && (t === 'flat' ? window.__atlas.tier() === 'flat' : (window.__map3d && window.__map3d.frames > 0)), tier, { timeout: 180000 });
      await page.waitForTimeout(tier === '3d' ? 2500 : 600);
      await page.focus('[data-testid="map-canvas"]');
      const build = tier === '3d' ? await page.evaluate(() => window.__map3d.buildMs) : 0;
      const res = {};
      for (const zoom of ['far', 'mid']) {
        if (zoom === 'mid') for (let i = 0; i < 3; i++) await page.keyboard.press('+');
        await page.waitForTimeout(tier === '3d' ? 1500 : 300);
        const ms = [];
        for (let i = 0; i < (tier === '3d' ? 8 : 24); i++) {
          await page.keyboard.press(i % 12 < 6 ? 'Shift+ArrowLeft' : 'Shift+ArrowRight');
          await page.waitForTimeout(tier === '3d' ? 400 : 60);
          ms.push(await page.evaluate(() => window.__atlas.lastDrawMs()));
        }
        ms.sort((a, b) => a - b);
        res[zoom] = { median: +ms[ms.length >> 1].toFixed(1), max: +ms[ms.length - 1].toFixed(1) };
      }
      if (tier === '3d') {
        // CPU submit time hides the (software) GPU: time a frame that is read back, at a view
        // away from the date line (one pass) and on it (the copies drawn as well).
        res.sync = await page.evaluate(async () => {
          const m = window.__map3d;
          const out = {};
          for (const [name, x] of [['inland', 1000], ['dateline', 2]]) {
            m.lookAt(x, 450, 900, 0);
            m.drawNow(); m.probe();
            const t = [];
            for (let i = 0; i < 4; i++) { const t0 = performance.now(); m.probe(); t.push(performance.now() - t0); }
            t.sort((a, b) => a - b);
            const st = m.stats;
            out[name] = { ms: +t[1].toFixed(0), passes: m.passes, calls: st.calls, ktris: +(st.triangles / 1000).toFixed(0) };
          }
          return out;
        });
      }
      console.log(file, tier, mode, JSON.stringify(res), tier === '3d' ? `build ${build.toFixed(0)} ms` : '');
      await ctx.close();
    }
  }
}
await browser.close();
