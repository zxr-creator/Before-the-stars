// Earth-like (ruleset 3.0) fixtures for the map dev harness, slimmed from saved
// referee views to what the map reads.
//
//   node scripts/map-fixtures-r3.mjs <dir with obs*.json / spec*.json>     (from apps/web)
//
// Writes dev/obs/e*.json (small, meant to be kept) and dev/obs/local-*.json (large views
// for performance checks; ignored by git). Spectator views stay spectator views: the
// harness reshapes them with ?spec=1 exactly as the observer console does.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(process.argv[2] ?? resolve(root, '../../.scratch'));
const out = resolve(root, 'dev/obs');

function slimRegion(r) {
  if (!r.own) return r;
  return {
    ...r,
    own: {
      ...r.own,
      facilities: (r.own.facilities ?? []).map((f) => ({ ...f, runs: [] })),
      construction_sites: (r.own.construction_sites ?? []).filter((c) => c.queued_levels > 0).map((c) => ({ ...c, cost_per_level: [], crew_per_level: [] })),
    },
  };
}

function slimObs(o) {
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
    regions: o.regions.map(slimRegion),
  };
}

function slimSpec(s) {
  return { ...s, events: [], regions: s.regions.map(slimRegion) };
}

const jobs = [
  // name, source file, kind
  ['e60-early', 'obs200.json', 'obs'],
  ['e60-early-spec', 'spec200.json', 'spec'],
  ['e200-early-spec', 'spec_t10.json', 'spec'],
  ['e120-outbreak-spec', 'spec_outbreak_3.json', 'spec'],
  ['e120-outbreak-obs', 'obs_outbreak_3.json', 'obs'],
  ['e200-late', 'obs_huge_late.json', 'obs'],
  ['local-e200-late-spec', 'spec_huge_late.json', 'spec'],
];
for (const [name, file, kind] of jobs) {
  const p = resolve(src, file);
  if (!existsSync(p)) { console.log('skip', name, '(no', file + ')'); continue; }
  const v = JSON.parse(readFileSync(p, 'utf8'));
  const slim = kind === 'spec' ? slimSpec(v) : slimObs(v);
  const text = JSON.stringify(slim);
  writeFileSync(resolve(out, name + '.json'), text);
  console.log(name, (text.length / 1024).toFixed(0) + ' KiB', `${v.regions.length} regions`, v.date?.label ?? v.month, kind);
}
