# 35. Scale, construction and the industrial base (ruleset 2.0) - change plan

Companion to `docs/units-and-scale.md`, which is normative for units. This chapter is
the implementation plan and the specification of the new mechanics. It is implemented
in six slices; each slice keeps `cargo test --release` green and is committed
separately. Ownership: `crates/bts-engine`, `crates/bts-protocol`, `crates/bts-ai`,
`content/`, `docs/`, and append-only additions to `apps/web/src/protocol.ts`.
`crates/bts-server` is not edited except for a compile fix strictly required by a
protocol change (report any).

Invariants that every slice must keep:

- integer-only deterministic arithmetic; `bts verify --rounds 40` passes;
- the information boundary: observations are projected per seat; nothing about other
  seats beyond what the design allows; an undiscovered technology, practice or
  facility type is never named in an error, quote, check or clause summary shown to a
  seat that has not discovered it; unknown and nonexistent references fail identically;
- existing action JSON keeps working; new protocol fields are `#[serde(default)]`;
- the properties added on the previous branch stay: shared support posts (cap 20%, no
  output bonus), `OwnRegion.construction_sites`, `ProjectView.levels`, no
  first-of-kind discount exploit;
- native opponents get no information or resource bonus.

## Slice A - scale recalibration (K = 1000)

People, posts and every person-denominated threshold are multiplied by 1,000. Stored
goods, work, research and service integers keep their magnitudes but change meaning
(see the units chapter): what used to be "milli-units" are now base units (tonnes,
rations, lots, worker-months, 0.1 MWh). Consequently every *per-person* coefficient is
divided by 1,000, computed as `people * coefficient_per_thousand / 1000` with the
division last.

Checklist (not exhaustive - grep for person counts everywhere):

- `content.rs`: `FacDef.general` and the counts in `FacDef.skilled` become `u32`
  people (old value x 1000). Capacity provided per level: water, health, teaching
  places, barracks x 1000; storage, irrigation, admin, generator and transport
  unchanged. Requirement atoms `POP>=n` and `Q:x>=n` x 1000. Descriptions that quote
  numbers are rewritten. Unit equipment and upkeep are per soldier per thousand
  (`a * soldiers / 1000`).
- `worldgen.rs`: starting population x 1000 (236,000 + 0..12,000); starting
  qualifications 14,000 lorekeepers and 8,000 artisans; `Region.water` x 1000 with the
  home guarantee 2,600,000; `wild`, arable, pasture, forest, fishery, hydro unchanged;
  starting stocks unchanged. Deposits x 2 (see slice B: shallow workings now waste
  half the ore they disturb instead of deep workings conjuring ore). Bump
  `GENERATOR_VERSION`.
- `economy.rs`: food need is 1 ration per person; food option capacity is
  `level * 10_000` cultivators (pasture 5,000, fishery 8,000), forage capacity
  `wild * 1000 / forage_yield`; yields stay "per thousand workers"; project labour is
  1 work per called-up worker; research is 1 point per staffed researcher; household
  craft 0.3 t per idle adult-month; evidence indices use `isqrt(staff * 10)` so they
  keep their old values; thresholds such as `leftover > 40`, `r.water >= 2500`,
  `rpop < 120`, `pop.saturating_sub(10)` x 1000.
- `projects.rs` / `actions.rs`: `Program.seats/enrolled/teachers` become `u32`
  (protocol `ProgramView`, `StartProgram.seats`, `ManageProgram.seats`,
  `CourseType.class_size` stays); founding cohort limit 4,000; programme seat bounds
  1..=2,000,000; course materials are per learner per thousand; settle 20,000-400,000
  people with stores `4 rations` and `50 kg tools` per settler and the sending region
  keeping 80,000; resettle keeps 50,000; recruit 1,000-5,000,000 with work
  `soldiers * 150 / 1000`; survey and religion goods unchanged.
- `population.rs`, `military.rs`, `culture.rs`, `knowledge.rs`, `chronicle.rs`,
  `observe.rs` (fuzz buckets for foreign estimates, texts), `state.rs` (settlement
  classes per the units chapter): every person-denominated literal x 1000; every index
  derived from a head count divides by 1000 first so cultural, religious and evidence
  dynamics keep their pace.
- `victory.rs`: leave the "36 engineers" check scaled x 1000 for now; slice E replaces it.
- `bts-ai`: thresholds and literals that are head counts x 1000; `pop * 1000` food
  arithmetic becomes `pop`; job counts read from the catalog are already people.
- Protocol: `JobSpec.count` becomes `u32`; document units on `Good`, `GoodLine`,
  `ProjectView`, `PowerView`; add `Observation.units: UnitsView` (`#[serde(default)]`)
  stating food per person-month, the display divisor, the mass of one lot per good
  and the settlement class bounds so clients need not hard-code them. Bump
  `PROTOCOL_VERSION` to `bts-protocol/1.2`, `RULESET_VERSION` to `bts-rules/2.0.0`,
  `CONTENT_VERSION` to `bts-content/2.0.0`.
- `Match::load_json` refuses a world whose recorded ruleset version differs, with an
  error naming both versions.
- Tests: adjust expectations that legitimately change. Compare all-AI results with
  the recorded baseline (populations should be about 1000x; technology counts and
  timing about the same).

## Slice B - ledgers and conservation

- `Flows` gains `lost: Vec<i64>` (`#[serde(default)]`): spoilage, carriage loss and
  freight congestion loss. `Civ::lose(g, n)` removes from stock into `lost`; carriage
  loss is recorded as `produced += gross; lost += gross - net`. Identity per good and
  civilization over any interval:
  `stock_end - stock_start = produced - consumed - lost + traded_in - traded_out`.
  `GoodLine.lost` (`#[serde(default)]`).
- Every direct write to `stock[...]` goes through `add`, `take`, `lose` or the two
  trade helpers `trade_out` / `trade_in`.
- Deep mine workings no longer deliver more than they draw: every extraction recipe
  draws from the deposit at least what it delivers. Shallow workings disturb twice
  what they deliver; drained deep workings draw what they deliver.
- `Civ.qual_flows: QualFlows` with one `Vec<i64>` per channel, indexed by
  qualification: `trained` (graduates), `entered` (holders who enrolled as entrants
  of a further course), `returned` (cancelled course), `died`, `retired`, `enlisted`
  (recruits and militia losses take their share of qualified people; qualifications
  lapse in service), `moved_in` / `moved_out` (settlement, migration, specialist
  relocation, territory changing hands), `seconded_out` / `seconded_in` /
  `seconded_lost` (slice E). Identity per qualification, per civilization and for the
  world: change in holders equals the signed sum of the channels.
- Recruitment currently removes adults without removing their qualifications; fix it.
- Belief "copy houses" yields media only from a staffed precinct and counts as
  production. Any other source found by the audit is either tied to real labour and
  inputs or removed. Starting stocks and starting qualifications are the declared
  initial endowment.
- Services: delivered shaft and electric service never exceeds supply after grid
  loss; compute used never exceeds what was installed the month before.
- Tests (`tests.rs`): a 300-month all-AI match with ledgers checked every month for
  every good and qualification; a mass-balance test over every recipe using the lot
  masses of the units chapter (extraction, food and service-only recipes excepted;
  fix any recipe that fails - polymer insulation and deep workings are known).

Implemented; the audit, the identities and the tests are in
`docs/conservation-audit.md`. Where the implementation goes beyond or differs from the
list above:

- The all-AI audit lives in `crates/bts-ai/tests/conservation.rs` (the engine cannot
  depend on the policy crate) and covers two whole campaigns as well as three
  300-month openings; the engine keeps a scripted 360-month match under the same
  monthly audit. The referee exposes its books through `Match::ledger_snapshot`,
  `Match::record_ledgers` and `ledger::violations`.
- Further ledgers: deposits (`drawn`, `delivered`), service per region
  (`PowerLedger`), compute used, and project work accepted per region.
- Service is rationed in proportion to what each works asked for, and a region's
  motors draw before its surplus is offered to the grid; the earlier rule let works
  draw more than existed.
- Builders supply one worker-month each (slice C removes the rule altogether by
  reserving crews).
- Field methods and motor-boat fishing are used only when a full month of their
  chemicals and fuel is in store, and the draw is taken first.
- Copy houses also take materials (a tonne for every three lots), so they pass the
  mass balance.
- Learners die and are enlisted in proportion and drop out; when people move,
  learners and instructors stay with their courses. (Letting learners leave with every
  internal migration was tried: over 128 all-AI matches the share of seats completing
  the graph fell from 85% to 58% and eliminations doubled. Staying costs nothing in
  conservation.)
- A polity that ceases to govern: soldiers become residents, courses are released,
  stores are booked as lost.
- Precision instruments take 0.5 kt of materials in addition (they failed the mass
  balance); no lot mass changed.

## Slice C - construction that consumes real things, regional queues

Content: `FacDef` gains `crew: Vec<(Vec<Qual>, u32)>` (per level under
construction), `build_power: i64` (service per level-month), `build_months: u16`.
Guideline by class:

| Class | Site crew per level | Site power per level-month | Minimum months |
| --- | --- | --- | --- |
| Subsistence and simple (fields, pasture, fishery, camp, granary, lodge, makers' circle, workshop, kiln, clinic, holy site) | none | 0 | 2-3 |
| Civil works and early industry (irrigation, roads, harbour, waterworks, sewers, mines, furnaces, mills, school, archive, admin, barracks, press, instrument makers) | builders (artisans accepted) 500-1,000 | 0 | 3-6 |
| Industrial (steelworks, machine shops, chemical works, refinery, steam, rail, hospitals, institutes ...) | builders 1,000-2,000 and mechanics 500-1,000 | 5-20 | 6-12 |
| Electrical and computing (generators, hydro, grid, fabs, purifier, computing centre, advanced labs) | builders, mechanics, electricians (technicians) | 10-40 | 9-18 |
| Nuclear, orbital and jump works | builders 2,000-6,000, technicians, electricians, scientists; orbital crews for orbital works; jump engineers for jump works | 60-400 | 24-48 |

No facility may need for its construction a qualification whose course cannot be
opened before that facility exists (check each chain; founding cohorts count).

Engine:

- `Project` gains `crew`, `crew_on_site`, `power_need`, `power_bp`, `min_months`,
  `order_key` (all `#[serde(default)]`). In `economy::step`, before facility
  staffing, each region reserves crews for its active (unpaused) orders in queue
  order from qualified residents not teaching; reserved people hold no other post,
  count under `labor.projects` and each supplies one worker-month. The old "builders
  count double" rule is removed. Site power is added to the region's shaft demand;
  the uncovered part is made up by site engines burning coal (5 units per kt) or fuel
  (10 units per kt) from stock; what remains uncovered scales `power_bp`.
- `projects::step`: monthly progress = min(accepted work, labour, `crew share`,
  `power share`, goods share). Blockers are named: goods ("Waiting for ..."), crew
  ("Site crew short: N of M ..."), power ("Site power short"), labour.
- Jump trials, the deployment exercise and replacement reserve jump engineers and
  orbital crews and draw power in the same way.
- Quote: `BuildSiteView` gains `cost_per_level`, `crew_per_level`,
  `site_power_per_level`, `first_of_kind`; `work_per_level` and `min_months` already
  exist. All are linear in the number of levels, and the order charged equals the
  quote (tested). `FacilityType` gains `build_crew`, `build_power`, `build_months`.
- Queue: `OwnRegion.construction_queue: Vec<QueueEntry>` in service order with
  project id, position, kind, title, levels, priority, paused, progress, crew on
  site, power share, `waiting_for` (the blockers) and an ETA range. Service order is
  `(priority, order_key, id)`. A seat reorders with `manage_project` priority or
  with the new `position` (0-based index within the project's region); moving a
  project permutes the `(priority, order_key)` pairs of that region's projects so
  the order relative to other regions is unchanged.
- Tests: an order stalls without each of materials, labour, crew, power, and
  completes no sooner than its minimum months; quote equals charge; reordering
  changes who is served first; the crew returns to posts on completion and
  cancellation.

Implemented; the rule as the engine applies it, with the table of terms by class, is
section 6 of `docs/units-and-scale.md`, and the tests are in
`crates/bts-engine/src/tests/construction.rs`. Where the implementation goes beyond
or differs from the list above:

- The terms of every facility are one table, `content.rs` `build_terms`. Within the
  guideline: hospitals, colleges, laboratories, insulation works and the technical
  institute are civil works (builders only, no site power), because they can be built
  before any engine exists and the institute is where mechanics come from; site power
  starts at 5 units for the first industrial works; electrical works run 9-15 months.
- Substitutes that keep every chain open: artisans for builders below the nuclear
  class; smiths and artisans for mechanics at works that can precede the technical
  institute; technicians for electricians below the nuclear class (and mechanics at
  generator halls and hydroelectric works); technicians for orbital crews at the first
  station only. The launch complex needs no orbital crews and the jump testbed no jump
  engineers. The walk that proves it (`no_site_crew_needs_people_who_cannot_exist_yet`)
  also follows goods: the technical institute needs components, so machine shops must
  be buildable without mechanics.
- Crew share is the least over the groups of a crew (a missing group stops the site),
  applied to the month's full share of the work, so the last worker-month of an order
  is never rounded away.
- Other project labour is called up after the qualified posts of the region's works
  are filled and before their general posts, and may be qualified people whom no
  qualified post took (builders first). Under slice B only builders and unqualified
  people could be called up, which left a fully schooled region unable to build.
- Site power is drawn when the work is done, not when the order is open: the region
  sets the sites' share of its shaft work aside (`RegionMonth.site_power_free`) and
  each order draws for the work it actually does, so an order that waits for goods
  burns no coal. `PowerLedger` gains `site_from_supply`, `site_from_engines`,
  `site_coal`, `site_fuel`; the audit checks `shaft_used + site_from_supply` against
  supply and the engines against the coal and fuel burned. Site engines need no
  technology, and never burn into the month of fuel that mechanized fields and motor
  boats must find in store (otherwise a large order could switch the fields back to
  hand work and starve the seat). Sites are not fed from the grid: a region uses its
  own shaft work and, through motors, its own spare electricity.
- A crew that is short because the region's call-up is used up also reports "Little
  labour can be called up" (`Project.crew_capped`). Crew vacancies attract qualified
  people without a post from the seat's other regions, as vacant posts do.
- The minimum months scale with the scenario's pace, like the work.
- `manage_project` gained `position` (no new action variant; the server needed no
  edit). `ProjectView` also states `goods_bp`, `min_months` and `queue_position`.
- The estimate of months left uses last month's pace, never faster than the minimum
  months allow; an order not yet served is estimated at its minimum months, and one
  that stood still has no estimate.
- The audit also checks that site crews are among the workers called up and that the
  month's labour gives nobody two roles; the all-AI audit covers a third campaign, in
  which a war moves borders.
- Native policy (the full pass is slice F): it orders only what the region's
  qualified residents, call-up and power (or coal and fuel in store) can serve, prefers
  regions that can crew a site, trains the people its orders are short of and builds
  their venue first, pauses an order that holds part of a crew while another part is
  missing and resumes it when the region can crew it. It does not yet move people to
  a thinly peopled test node whose call-up cannot hold a deployment node's crew.

## Slice D - production methods and economies of scale

Methods:

- `Facility.method: Option<String>` (`#[serde(default)]`): the recipe key the seat
  chose, or none for automatic (the current behaviour: first known recipe whose
  inputs are in stock). `PolicySetting::Method { region, facility, method }` sets or
  clears it; an unknown or not-yet-known method fails with the uniform unknown error.
  A chosen method runs even when its inputs are short (and reports the shortage).
- `Recipe` gains `general_bp` (share of the facility's general posts the method
  needs) and `extra_skilled`. `RecipeView` gains `general_posts`, `skilled_posts`
  (true posts per level for that method). `FacilityView` gains `method` (chosen) and
  `active_method`.
- Fields get explicit methods (hand, animal traction, manufactured inputs,
  mechanized, restorative mechanized) selectable per region through the same policy,
  shown in the catalog with their true yield per level and their chemical and fuel
  draw; automatic picks the best whose inputs are in stock, as before.
- Add at least these alternatives with real trade-offs (all pass the mass balance):
  electric steelmaking (electricity for coal, fewer general posts), numerically
  controlled machining (electricity and compute for hands; needs programmers),
  mechanized deep mining (fuel or electricity for hands).

Economies of scale (see the table in the units chapter; implement exactly those):

- regional freight capacity by transport grade: 10 / 24 / 60 / 120 facility levels
  (grades 0-3); load = enabled industry, extraction and power levels;
  `infra_bp = min(10000, capacity * 10000 / load)`;
- shared support posts scale with `infra_bp`;
- maintenance pooling: `min(1500, 1500 * shop_levels * 12 / load) * infra_bp / 10000`
  off the spares and tools upkeep of co-located industry, extraction and power works;
- integrated chains: per region and good, output up to the quantity the region's own
  recipes consumed that month is exempt from carriage loss;
- congestion: extra carriage loss `(10000 - infra_bp) * 2000 / 10000` bp on exported
  output, capital included.
- `OwnRegion.infrastructure: InfraView` reports capacity, load, `infra_bp`, each
  saving and the congestion loss.
- Tests: each saving is capped; output of a facility never exceeds `recipe x level`;
  goods delivered never exceed goods made; method choice changes real inputs,
  outputs, posts and services.

## Slice E - the space and jump base; cooperation

Facility recalibration (crew in people per level; inputs per level-month in display
units; all `max 1` except where noted). These are deliberately larger relative to
the rest of the economy than a x1000 scaling of the old values:

| Facility | Qualified crew | General | Operating inputs per month | Electric |
| --- | --- | --- | --- | --- |
| High-energy laboratory | 40,000 scientists, 12,000 technicians, 8,000 electricians | - | upkeep | 3,000 |
| Launch complex | 16,000 technicians, 6,000 scientists, 16,000 mechanics | 22,000 | fuel 30, components 6, electronics 3 | 400 |
| Orbital station | 16,000 orbital crew, 6,000 scientists | - | fuel 12, food 20, medicine 1 | 200 |
| Orbital construction yard | 30,000 orbital crew, 16,000 mechanics, 16,000 technicians | 10,000 | fuel 30, components 10, electronics 4 | 600 |
| Jump testbed | 30,000 scientists, 12,000 jump engineers or technicians, 10,000 orbital crew | - | upkeep | 8,000 |
| Jump assembly line | 16,000 jump engineers, 16,000 technicians, 16,000 mechanics, 8,000 electricians | 20,000 | components 60, electronics 45, hardware 3, conductors 18, insulation 9, metal 45, substrate 3 | 4,000 |
| Jump deployment node | 6,000 jump engineers, 8,000 orbital crew, 8,000 technicians | 10,000 | fuel 12, electronics 3 | 1,000 |

Fission and fusion output and the fuel, spares and material bills of trials are
raised in proportion so that the programme's electric demand (two lines, three
nodes, testbed: about 20,000 units, 2.8 GW continuous) needs a real generating
base. Construction bills and crews follow slice C's last row.

`ftl_checks` (each independent; each detail string states the measured value and the
need; none names anything the seat has not discovered):

1. Fleet-wide jump engineering standards understood (existing).
2. Two operational assemblies from two independent lines (existing).
3. Both assembly lines staffed (existing).
4. Three deployment nodes operating (existing).
5. Three-node deployment exercise completed (existing).
6. Assembly replacement and crew relief verified (existing).
7. Educational base, headcount: jump engineers and orbital crews resident in own
   regions (seconded experts included) are at least 1.5 x the jump-engineer and
   orbital posts of the seat's own jump and orbital works.
8. Educational base, replacement: for each of the two qualifications, either
   programmes with a venue and an enrolled cohort (or graduates in the last 60
   months) whose places are at least 5% of the posts, or an active secondment treaty
   for that qualification.
9. Scientific base: frontier research capacity of at least 30,000 researcher-months
   a month, and a high-energy laboratory operating (own, or a partner's under an
   active joint programme).
10. Industrial base: for each of components, electronics, computing hardware,
    conductors and structural metal, last round's own output plus contracted imports
    covers 1.2 x a year of what the seat's jump lines, nodes, launch complex and
    orbital yard consume at full rate.
11. Logistical base, stores: spares and fuel on hand cover twelve months of the
    programme's upkeep and operating use (derived from the installed works).
12. Logistical base, links and power: every region holding a jump line or node has
    transport grade 2 or better and received at least 90% of its electric demand.
13. Launch and recovery: a launch complex operating and an orbital yard supporting
    the fleet (own, or a partner's under an active joint programme).
14. Common mission charter established (existing).

Cooperation (new treaty clauses; payment is by ordinary goods clauses in the same
treaty; existing treaty limits apply):

- `Clause::Secondment { from, qual, count, months }`. Validated on the proposer's own
  facts (a lender must hold that many free holders); re-checked at signing. On
  activation `count` holders leave the lender's regions (real adults relocate to the
  borrower's capital with their qualification; ledger `seconded_out` / `seconded_in`)
  and work, teach and eat there. On expiry, or when the lender ends the treaty, the
  survivors (never more than still exist) go home. When the borrower repudiates the
  treaty or the parties go to war, a quarter of them stay behind as ordinary
  residents without their qualification (`seconded_lost`) and the rest go home. The
  breach is recorded in the treaty's performance and in trust, as for any treaty.
  A lender may second at most half of its free holders of a qualification.
- `Clause::JointProgramme { host, service, months }` with
  `ProgrammeService::{Launch, OrbitalYard, HighEnergy, Undisclosed}`. While the
  treaty is active and the host's facility ran at half rate or better last month,
  the other party counts as having access to that service for: investigations that
  need the installation; the `F:` requirement of works that need it to exist; checks
  9 and 13; trial support. Access never lets the client build or own the partner's
  facility, and never counts toward checks 2-6 (the service must be the winner's
  own). Each client served raises the host facility's operating inputs and electric
  draw by half; a facility serves at most two clients. A month in which the host
  facility ran below half rate is a recorded shortfall. When the treaty lapses or is
  broken, access stops that month.
  A clause is shown to a seat that has not discovered the facility type as
  `Undisclosed` with a generic summary, and such a seat cannot sign it.
- Goods clauses already scale (amounts are `i64`); verify the AI's price arithmetic
  and the 240-month limit under the new magnitudes.
- Victory rules are unchanged: one winner, its own jump service, governance.

Tests: each of checks 7-13 fails alone when its base is removed from a fixture that
otherwise passes; seconded experts leave the lender, staff the borrower's posts,
return on expiry, and a quarter are lost on the borrower's breach; a joint
programme's access stops when the treaty is broken and the host pays the extra
inputs; clauses are hidden from seats that have not discovered the facility.

## Slice F - native AI, compatibility, documentation

- `bts-ai`: train builders and the crews new works need; choose methods only when
  the default is starved; build transport when a region reports congestion; keep the
  endgame sequence affordable; offer and accept secondments and joint programmes at
  a price (weaker seats ask; stronger seats lend what they can spare).
- Compare with the baseline recorded before any change
  (`bts run --seed eval --matches 8 --rounds 240`, `--seed riverland`): the stronger
  opponents still reach the scientific method, industrialize and typically complete
  most of the graph; no systematic starvation.
- Mirror every new protocol field in `apps/web/src/protocol.ts` (additions only).
- Update `docs/implementation-status.md`, `docs/units-and-scale.md` tables and the
  calibration gaps.
