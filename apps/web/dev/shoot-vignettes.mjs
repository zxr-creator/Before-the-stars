// Dev-only: screenshot the vignette gallery. Usage: node dev/shoot-vignettes.mjs [query] [outfile]
import { chromium } from 'playwright';
const q = process.argv[2] ?? '';
const out = process.argv[3] ?? 'screenshots/dev/vignettes.png';
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const errs = [];
pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
pg.on('pageerror', (e) => errs.push(String(e)));
await pg.goto('http://127.0.0.1:5182/dev/vignettes.html' + (q ? '?' + q : ''), { waitUntil: 'networkidle' });
await pg.screenshot({ path: out, fullPage: true });
await b.close();
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('ok', out);
