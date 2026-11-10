// Plain-language findings for the balance sheet, ranked by severity. Every one
// is computed from the same ledger the other tabs show; none is a forecast.
import type { Observation } from '../protocol';
import { GOOD_SHORT, QUAL_LABEL, RESEARCH_LABEL, int, lc, pct } from '../format';
import { t, tc } from '../i18n';
import { B_QUALIFIED, B_WORKERS, type Ledger } from './model';
import { coverText, milli } from './parts';
import type { Nav } from './Ledger';

export type Severity = 'bad' | 'warn' | 'info' | 'ok';
export interface Finding { sev: Severity; text: string; label?: string; go?: () => void }

const RANK: Record<Severity, number> = { bad: 0, warn: 1, info: 2, ok: 3 };

export function buildFindings(obs: Observation, ledger: Ledger, nav: Nav): Finding[] {
  const out: Finding[] = [];
  const civ = obs.civ;
  const food = ledger.byGood.get('food');
  const target = civ.policies.food_reserve_months;

  if (food) {
    const cover = ledger.foodCover;
    const full = food.line.capacity !== null && food.line.stock >= food.line.capacity * 0.97;
    if (civ.food_fulfillment_bp < 10000) {
      out.push({ sev: 'bad', text: t('People received only {pct} of the food they needed last month.', { pct: pct(civ.food_fulfillment_bp) }), label: t('See food'), go: () => nav.toGood('food') });
    }
    if (cover !== null && full && cover < target) {
      out.push({ sev: cover < 2 ? 'warn' : 'info', text: t('Granaries are full at {n} months of food; the {target}-month reserve cannot be reached without more storage.', { n: coverText(cover), target }), label: t('Build storage'), go: () => nav.build() });
    } else if (cover !== null && cover < 2) {
      out.push({ sev: 'bad', text: t('Food in store covers only {n} months.', { n: coverText(cover) }), label: t('See food'), go: () => nav.toGood('food') });
    } else if (cover !== null && cover < target) {
      out.push({ sev: 'warn', text: t('Food covers {n} months; the reserve target is {target}.', { n: coverText(cover), target }), label: t('See food'), go: () => nav.toGood('food') });
    }
  }

  for (const r of ledger.rows) {
    const name = t(GOOD_SHORT[r.good]);
    if (r.starved.length) {
      out.push({
        sev: 'bad',
        text: r.cover !== null
          ? t('{good} covers {n} months and {k} works ran short of it.', { good: name, n: coverText(r.cover), k: r.starved.length })
          : t('{k} works ran short of {good}; none is in store.', { good: lc(GOOD_SHORT[r.good]), k: r.starved.length }),
        label: t('See who makes it'), go: () => nav.toGood(r.good),
      });
    } else if (r.why === 'owed') {
      out.push({ sev: 'bad', text: t('Open projects need {need} {good}; only {have} is in store.', { need: milli(r.owed), good: lc(GOOD_SHORT[r.good]), have: milli(r.line.stock) }), label: t('See the good'), go: () => nav.toGood(r.good) });
    } else if (r.good !== 'food' && r.why === 'cover2') {
      out.push({ sev: 'bad', text: t('{good} in store covers only {n} months of use.', { good: name, n: coverText(r.cover) }), label: t('See the good'), go: () => nav.toGood(r.good) });
    } else if (r.why === 'runway') {
      out.push({ sev: 'warn', text: t('{good} is used faster than it is made: about {n} months left at last round’s pace.', { good: name, n: coverText(r.runway) }), label: t('See the good'), go: () => nav.toGood(r.good) });
    }
  }

  for (const r of ledger.regions) {
    const p = r.own.power;
    if (p.shaft_demand > p.shaft_supply) out.push({ sev: 'warn', text: t('{region} is short of shaft power: {d} called for, {s} delivered.', { region: tc(r.region.name), d: milli(p.shaft_demand), s: milli(p.shaft_supply) }), label: t('See the region'), go: () => nav.toRegion(r.region.id) });
    if (p.elec_demand > p.elec_supply) out.push({ sev: 'warn', text: t('{region} is short of electricity: {d} called for, {s} delivered.', { region: tc(r.region.name), d: milli(p.elec_demand), s: milli(p.elec_supply) }), label: t('See the region'), go: () => nav.toRegion(r.region.id) });
  }
  if (ledger.compute.demand > ledger.compute.supply) {
    out.push({ sev: 'warn', text: t('Computing is short across the realm: {d} called for, {s} delivered.', { d: milli(ledger.compute.demand), s: milli(ledger.compute.supply) }), label: t('See works'), go: () => nav.toTab('production') });
  }

  const on = ledger.cards.filter((c) => c.f.enabled);
  const understaffed = on.filter((c) => c.blockers.includes(B_WORKERS));
  if (understaffed.length) {
    out.push({
      sev: 'warn',
      text: civ.labor.household > 0
        ? t('Workers are short at {k} works while {n} people have no post: they live in other regions.', { k: understaffed.length, n: int(civ.labor.household) })
        : t('Workers are short at {k} works and no one is without a post.', { k: understaffed.length }),
      label: t('See workforce'), go: () => nav.toTab('workforce'),
    });
  }
  const unqualified = on.filter((c) => c.blockers.includes(B_QUALIFIED));
  if (unqualified.length) {
    const worst = [...ledger.quals].sort((a, b) => b.vacancies - a.vacancies)[0];
    out.push({
      sev: 'warn',
      text: worst && worst.vacancies > 0
        ? t('Qualified staff are missing at {k} works; the widest gap is about {n} {qual}.', { k: unqualified.length, n: int(worst.vacancies), qual: lc(QUAL_LABEL[worst.qual]) })
        : t('Qualified staff are missing at {k} works.', { k: unqualified.length }),
      label: t('See workforce'), go: () => nav.toTab('workforce'),
    });
  }
  const worn = on.filter((c) => c.f.condition_bp < 8000);
  if (worn.length) out.push({ sev: 'warn', text: t('Worn below 80% condition for want of upkeep: {k} works.', { k: worn.length }), label: t('See works'), go: () => nav.toCard(worn[0].key) });

  for (const l of civ.research) {
    if (l.capacity > 0 && l.used === 0) {
      out.push({ sev: 'info', text: t('{cls}: {n} work a month went unused.', { cls: t(RESEARCH_LABEL[l.class]), n: milli(l.capacity) }), label: t('Open knowledge'), go: () => nav.open('knowledge', { kind: 'knowledge-view', view: 'frontier' }) });
    }
  }
  const off = ledger.cards.filter((c) => !c.f.enabled);
  if (off.length) out.push({ sev: 'info', text: t('Switched off: {k} works.', { k: off.length }), label: t('See works'), go: () => nav.toCard(off[0].key) });
  const throttled = on.filter((c) => c.throttled);
  if (throttled.length) out.push({ sev: 'info', text: t('Output is held back at {k} works because stores are above target. That is by design.', { k: throttled.length }) });
  if (civ.labor.working_age > 0 && civ.labor.household * 10 >= civ.labor.working_age * 3) {
    out.push({ sev: 'info', text: t('{n} of {total} working-age people have no post.', { n: int(civ.labor.household), total: int(civ.labor.working_age) }), label: t('See workforce'), go: () => nav.toTab('workforce') });
  }
  if (!out.some((f) => f.sev === 'bad' || f.sev === 'warn')) {
    out.push({ sev: 'ok', text: t('No shortage, and no works held back for want of staff, inputs or power.') });
  }
  return out.sort((a, b) => RANK[a.sev] - RANK[b.sev]);
}
