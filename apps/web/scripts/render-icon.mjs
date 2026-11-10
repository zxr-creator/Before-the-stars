// Render an SVG to a 1024×1024 PNG with the headless browser from the toolchain.
//   node scripts/render-icon.mjs <in.svg> <out.png>
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('usage: node scripts/render-icon.mjs <in.svg> <out.png>');
  process.exit(2);
}
const svg = readFileSync(input, 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="1024" height="1024" ')}</body></html>`);
await page.screenshot({ path: output, omitBackground: true });
await browser.close();
