// The world view borrows the ordinary map: a spectator snapshot is reshaped
// into a complete, well-formed Observation for a seat that does not exist
// (seat -1), so MapView needs nothing but its usual props.
import type { ControllerKind, ForeignCiv, Observation, OwnCiv, SpectatorView } from '../protocol';

const CONTROLLERS: ControllerKind[] = ['human', 'external', 'native_easy', 'native_medium', 'native_hard'];

function neutralCiv(name: string): OwnCiv {
  return {
    name, adjective: name, color: '#8a7d6a', capital: -1,
    population: 0, children: 0, working_age: 0, elders: 0,
    births_last_round: 0, deaths_last_round: 0, migration_last_round: 0,
    goods: [], quals: [],
    labor: { working_age: 0, food: 0, facilities: 0, projects: 0, household: 0, students: 0, teachers: 0, soldiers: 0 },
    research: [],
    policies: { food_reserve_months: 0, labor_weights: [], mobilization_bp: 0 },
    factions: [], mobilization_cap_bp: 0, stability: 0, admin_capacity: 0, admin_load: 0,
    food_fulfillment_bp: 10000, water_fulfillment_bp: 10000, military_tier: 0, recruit_room: 0,
    overlord: null, subordinates: [],
  };
}

let cached: { sp: SpectatorView; name: string; obs: Observation } | null = null;

/** Memoized by snapshot identity, so the map rebuilds only when the world actually changed. */
export function spectatorObservation(sp: SpectatorView, observerName: string): Observation {
  if (cached && cached.sp === sp && cached.name === observerName) return cached.obs;
  const others: ForeignCiv[] = sp.civs.map((c) => ({
    seat: c.seat, name: c.name, adjective: c.adjective, color: c.color,
    controller: (CONTROLLERS as string[]).includes(c.controller) ? (c.controller as ControllerKind) : 'external',
    status: c.status, contacted: true, contact_month: 0, at_war: false, overlord: c.overlord,
    population_low: c.population, population_high: c.population, regions_known: c.regions,
    military_estimate: '', observed_tier: c.highest_tier, trust: 0, notes: [],
  }));
  const obs: Observation = {
    protocol_version: 'bts-protocol/1.0',
    match_id: sp.match_id,
    seat: -1,
    month: sp.month,
    round: sp.round,
    months_per_round: sp.months_per_round,
    horizon: sp.horizon,
    phase: sp.phase,
    window: sp.window,
    ready: true,
    status: 'active',
    outcome: sp.outcome ? { ...sp.outcome, reward: 0 } : null,
    civ: neutralCiv(observerName),
    regions: sp.regions,
    world: sp.world,
    others,
    knowledge: { techs: [], leads: [], domains: [], scientific_method: false },
    culture: { practices: [], lineages: [], religions: [], movement: null },
    catalog: { facilities: [], courses: [], unit_tiers: [] },
    projects: [],
    programs: [],
    armies: [],
    foreign_armies: sp.armies.map((a) => ({
      owner: a.owner, region: a.region, strength_low: a.soldiers, strength_high: a.soldiers,
      tier_estimate: a.tier, observed_month: sp.month,
    })),
    diplomacy: { channels: [], messages: [], offers: [], treaties: [], wars: [] },
    objectives: { agendas: [], milestones: [], victory: null },
    briefing: [],
    chronicle: [],
    receipts: [],
  };
  cached = { sp, name: observerName, obs };
  return obs;
}
