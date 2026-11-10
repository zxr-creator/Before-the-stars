import { chromium } from 'playwright';
const [,, url, out, w = '1440', h = '900', ...acts] = process.argv;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await p.goto(url); await p.waitForTimeout(1200);
let n = 0;
for (const a of acts) {
  const [kind, ...rest] = a.split('=');
  const arg = rest.join('=');
  try {
    if (kind === 'click') await p.click(arg, { timeout: 4000 });
    else if (kind === 'hover') await p.hover(arg, { timeout: 4000 });
    else if (kind === 'key') await p.keyboard.press(arg);
    else if (kind === 'wait') await p.waitForTimeout(+arg);
    else if (kind === 'eval') console.log('EVAL', JSON.stringify(await p.evaluate(arg)));
    else if (kind === 'shot') { await p.waitForTimeout(350); await p.screenshot({ path: out.replace('.png', `-${arg}.png`) }); }
  } catch (e) { console.log('ACT FAIL', a, e.message.split('\n')[0]); }
}
await p.waitForTimeout(300);
await p.screenshot({ path: out });
await b.close();
