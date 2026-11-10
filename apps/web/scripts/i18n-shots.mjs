// Screenshots of every panel and the inspector in Simplified and Traditional Chinese, on an
// early and a late-game state, for reviewing overflow, truncation and leftover English.
//
//   source scripts/env.sh
//   (cd apps/web && node scripts/i18n-build-client.mjs)
//   .toolchain/bts-ui-snapshot serve --port 7983 --web .toolchain/i18n-dist --saves .toolchain/i18n-saves --fresh &
//   (cd apps/web && node scripts/i18n-shots.mjs)
//
// Uses the saves "i18n-early" (round 4) and "i18n-late" (round 200) left by i18n-coverage.mjs,
// or plays a delegated match to create them. Output: screenshots/i18n/<locale>/<state>-NN-<stop>.png
// Environment: BTS_URL, I18N_LOCALES (default "zh-Hans,zh-Hant"; add "en" to compare),
// I18N_STATES (default "early,late"), I18N_SIZE (default 1440x900).
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { WEB, get, openClient, play, post, walk } from './i18n-lib.mjs';

const LOCALES = (process.env.I18N_LOCALES ?? 'zh-Hans,zh-Hant').split(',');
const STATES = (process.env.I18N_STATES ?? 'early,late').split(',');
const [W, H] = (process.env.I18N_SIZE ?? '1440x900').split('x').map(Number);
const OUT = join(WEB, 'screenshots', 'i18n');
const log = (...a) => console.log('[i18n-shots]', ...a);

const have = ((await get('/api/saves')).data?.saves ?? []);
let lateSaved = false;
if (STATES.some((s) => !have.includes(`i18n-${s}`))) {
  log('creating saves i18n-early and i18n-late by playing a delegated match…');
  await play({
    seed: 'i18n-amber', rounds: 200, harvest: null, invalid: false,
    onRound: async (round) => { if (round === 4) await post('/api/save', { name: 'i18n-early' }); },
    onNegotiate: async (round, obs) => {
      if (!lateSaved && round >= 188 && (obs.diplomacy.channels.some((ch) => ch.open) || round >= 200)) lateSaved = (await post('/api/save', { name: 'i18n-late' })).ok;
    },
  });
}

const browser = await chromium.launch();
let count = 0;
const problems = [];
for (const locale of LOCALES) {
  const dir = join(OUT, locale);
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (f.endsWith('.png')) rmSync(join(dir, f));
  for (const state of STATES) {
    const loaded = await post('/api/load', { name: `i18n-${state}` });
    if (!loaded.ok) { problems.push(`${state}: save could not be loaded`); continue; }
    const obs = (await get('/api/observation?seat=0')).data;
    const { page, errors } = await openClient(browser, { locale, width: W, height: H });
    let n = 0;
    const shot = async (name) => {
      n += 1; count += 1;
      await page.waitForTimeout(120);
      await page.screenshot({ path: join(dir, `${state}-${String(n).padStart(2, '0')}-${name}.png`) });
    };
    await shot('main');
    const skipped = await walk(page, obs, shot);
    for (const s of skipped) if (!(state === 'early' && /diplomacy-(counterpart|composer)|inspector-(own|foreign)/.test(s))) problems.push(`${locale} ${state}: ${s}`);
    for (const e of errors) problems.push(`${locale} ${state}: page error ${e}`);
    await page.close();
    log(`${locale} ${state}: round ${obs.round}, ${n} screenshots`);
  }
}
await browser.close();
log(`${count} screenshots in ${OUT}/<locale>/`);
if (problems.length) { console.error('[i18n-shots] problems:\n  ' + problems.join('\n  ')); process.exit(1); }
