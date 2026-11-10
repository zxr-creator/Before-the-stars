// Generates real observations for the 3D map dev harness by letting a steward play
// seat 0 on a private referee, and saves them to apps/web/dev/obs/*.json.
//
//   .toolchain/bts-ui-snapshot serve --port 7981 --web apps/web/dist --saves .toolchain/map-saves --fresh
//   node apps/web/scripts/map3d-worlds.mjs [port]
//
// Read by dev/map-dev.tsx with ?src=file&file=<name>.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2] ?? 7981);
const base = `http://127.0.0.1:${port}`;
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../dev/obs');
mkdirSync(out, { recursive: true });

async function post(path, body) {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}
async function get(path) {
  const r = await fetch(base + path);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

/** Keep what the map reads; drop the long text feeds so the fixtures stay small. */
function slim(o) {
  return {
    ...o,
    knowledge: { techs: [], leads: [], domains: [], scientific_method: o.knowledge?.scientific_method ?? false },
    culture: { practices: [], lineages: [], religions: [], movement: null },
    catalog: {
      facilities: o.catalog.facilities.map((f) => ({ ...f, description: '', recipes: [], requirements: [], jobs: [], cost: [], upkeep: [] })),
      courses: [], unit_tiers: [],
    },
    projects: [], programs: [], briefing: [], chronicle: [], receipts: [],
    diplomacy: { ...o.diplomacy, messages: [], offers: [], treaties: [] },
    regions: o.regions.map((r) => (r.own ? { ...r, own: { ...r.own, facilities: r.own.facilities.map((f) => ({ ...f, runs: [] })) } } : r)),
  };
}

async function world(seed, regions, checkpoints) {
  await post('/api/match', { seed, regions, controllers: ['human', 'hard', 'medium', 'medium'] });
  await post('/api/delegate', { seat: 0, domains: ['economy', 'research', 'education', 'culture', 'expansion', 'military'] });
  let round = 1;
  for (const target of checkpoints) {
    let guard = 0;
    while (round < target && guard++ < target * 12) {
      const m = await post('/api/ready', { seat: 0, through_round: true });
      round = m.round ?? round;
      if (m.finished) break;
    }
    const o = await get('/api/observation?seat=0');
    const name = `w${regions}-r${String(target).padStart(3, '0')}`;
    writeFileSync(resolve(out, name + '.json'), JSON.stringify(slim(o)));
    const own = o.regions.filter((r) => r.owner === o.seat);
    const kinds = new Set(own.flatMap((r) => (r.own?.facilities ?? []).map((f) => f.kind)));
    console.log(
      name, `round ${o.round}`, `${o.regions.length} known`, `${own.length} own`,
      `armies ${o.armies.length}/${o.foreign_armies.length}`, `wars ${o.diplomacy.wars.length}`,
      `occupied ${o.regions.filter((r) => r.controller != null && r.controller !== r.owner).length}`,
      `remembered ${o.regions.filter((r) => r.visibility === 'remembered').length}`,
      `settlements ${[...new Set(o.regions.map((r) => r.settlement))].join(',')}`,
      `facilities ${kinds.size}`,
    );
    if (o.outcome) { console.log('  finished:', o.outcome.reason); break; }
  }
}

await world('map48', 48, [1, 40, 100, 160, 200, 235]);
await world('map72', 72, [60, 140, 220]);
await world('map24', 24, [30, 120, 200]);
console.log('saved to', out);
