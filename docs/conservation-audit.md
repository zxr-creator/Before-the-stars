# Conservation audit (ruleset 2.0, slice B)

Nothing in the rules engine enters the world from nothing. This chapter lists every
place where goods, people, qualified people, service (shaft, electric, compute) or
work come into being or disappear, what backs each one, which ledger records it and
which test covers it. It also lists the leaks the audit found and how each was closed,
and what was looked at and deliberately left as it is.

Units are those of `docs/units-and-scale.md`. File references are to
`crates/bts-engine/src`.

## 1. The ledgers and their identities

| Ledger | Where | Identity |
| --- | --- | --- |
| Goods, per civilization and round | `Civ.flows` (`state.rs`, `Flows`): `produced`, `consumed`, `lost`, `traded_in`, `traded_out` | for every good, over any interval: `stock_end - stock_start = produced - consumed - lost + traded_in - traded_out`; over the world, `sum(traded_in) = sum(traded_out)` |
| People, per civilization and round | `Civ.flows.births`, `Civ.flows.deaths` | residents of all regions plus soldiers of the world change by `births - deaths` |
| Qualified people, per civilization, cumulative from the start | `Civ.qual_flows` (`QualFlows`): `initial`, `trained`, `entered`, `returned`, `died`, `retired`, `enlisted`, `moved_in`, `moved_out`, `seconded_out`, `seconded_in`, `seconded_lost` | for every qualification, at every moment: holders in the regions the civilization controls `= initial + trained - entered + returned - died - retired - enlisted + moved_in - moved_out - seconded_out + seconded_in - seconded_lost`; over the world `sum(moved_in) = sum(moved_out)` |
| Roles, per region | `Region.quals`, `students`, `teachers`, `Program.enrolled` | `sum(quals) + students <= working-age residents`; `teachers[q] <= quals[q]`; `students = sum(enrolled)` of the programmes held there |
| Service, per region and month | `Region.last.power` (`PowerLedger`) | `shaft_used <= shaft_made - shaft_to_generators + shaft_from_motors`; `elec_from_generators <= 0.9 x shaft_to_generators`; `shaft_from_motors <= 0.9 x elec_to_motors`; `elec_used + elec_to_motors + grid_out <= elec_made + elec_from_generators + grid_in`; per civilization `sum(grid_in) <= 0.92 x sum(grid_out)` |
| Compute, per civilization and month | `Civ.compute_supply`, `Civ.compute_used` | `compute_used(month) <= compute_supply(month - 1)` |
| Work, per region and month | `Region.last.labor.projects`, `Region.last.project_work_done` | `project_work_done <= workers called up` |
| Research, per civilization and month | `Civ.research_cap`, `Civ.research_used` | `research_used[class] <= research_cap[class]`; `sum(research_cap) <= people in research posts` |
| Deposits | `DepositState.remaining`, `drawn`, `delivered` | `remaining + drawn` is constant; `delivered <= drawn`; ore booked as `produced` in a month `=` what the deposits `delivered` in it |

Stock changes only through `Civ::add` (production), `Civ::take` (use), `Civ::lose`
(spoilage, carriage loss, abandoned stores) and `World::transfer`
(`Civ::trade_out` / `Civ::trade_in`). The only other write to a stock is the starting
endowment in `worldgen.rs`. A region changes controller only through
`World::set_controller`, which carries its holders from one qualification ledger to the
other.

The qualification identity holds exactly per civilization, including under
occupation, capture, liberation, cession and elimination, because holders are
attributed to the controller of the region they live in and every change of controller
is booked as `moved_out` / `moved_in`. No region is ever left without a controller
once it has had one, and the audit asserts that nobody lives in an ungoverned region.

`ledger::violations` (`ledger.rs`) checks all of the above between two consecutive
snapshots of the referee's books. `Match::record_ledgers` makes the referee take a
snapshot after the seats' decisions of every round and at the close of every month.
These are referee-side diagnostics and are never part of a seat's observation.

## 2. Sources of goods

| Source | Where | What backs it | Ledger | Tests |
| --- | --- | --- | --- | --- |
| Starting stores: 900,000 rations, 90 kt materials, 45,000 tool lots per seat | `worldgen.rs` | the declared initial endowment | opening stock | `starting_stocks_and_qualifications_are_the_declared_endowment` |
| Food: forage, fields, pasture, fishing | `sim/economy.rs` section 1 and 3 | workers actually assigned x yield; workers bounded by what grows wild and by levels of fields, pasture and fishing grounds, which the site bounds; a method that needs chemicals or fuel is used only when a full month's draw is in store, and the draw is taken first | `produced[Food]`; chemicals and fuel `consumed` | `a_level_employs_thousands_and_yields_per_thousand_workers`, `field_methods_are_used_only_when_their_inputs_are_delivered`, monthly audits |
| Recipes of works | `sim/economy.rs` section 4 | filled posts, inputs taken from month-start stock, service actually available, condition; outputs never exceed `recipe x level`; mass out <= mass in | `produced` gross; inputs and upkeep `consumed`; carriage `lost` | `no_recipe_puts_out_more_mass_than_it_takes_in`, `carriage_loss_and_spoilage_are_booked_as_lost`, `industrial_scale_reduces_general_posts_but_does_not_multiply_goods`, monthly audits |
| Ore, coal, crude, rare minerals | same; recipes with `depletes` | the deposit: every tonne raised is drawn from it, shallow workings draw two | `produced[ore]` = deposit `delivered` <= `drawn` | `extraction_draws_from_the_deposit_at_least_what_it_delivers`, monthly audits |
| Timber, stone, clay (camps); fired brick (kilns) | same; works flagged `extractive` | labour on the site: forest levels bound camps; kilns dig their clay where they stand | `produced[Materials]` | `no_recipe_puts_out_more_mass_than_it_takes_in` (the list of extractive works is asserted) |
| Household craft: 0.3 t of materials per idle adult-month | `sim/economy.rs` | adults of working age with no post that month; stops when stores are at twice their target | `produced[Materials]` | `household_craft_is_bounded_by_idle_adults` |
| Copy houses (belief): up to 2,000 media lots a month | `sim/culture.rs` | the filled posts of the precinct, in proportion, and a tonne of materials taken from stock for every three lots | `produced[Media]`, `consumed[Materials]` | `copy_houses_make_media_only_from_a_staffed_precinct_and_real_material` |
| Treaty deliveries | `sim/diplomacy.rs` | the sender's stock; what is not there is not delivered and is recorded as a shortfall | `traded_out` / `traded_in` | `a_signed_treaty_delivers_goods_once_and_knowledge_is_not_unlearned`, `treaty_goods_and_tribute_leave_one_stock_and_enter_another` |
| Tribute of a subordinate | `sim/diplomacy.rs` | the subordinate's stock, at most a quarter of it a month | `traded_out` / `traded_in` | same |

Goods leave through: eating (`consumed`, one ration per resident and soldier);
spoilage (`lost`); recipe inputs, upkeep of works and formations, field chemicals and
fuel, fuel of power stations, course materials, and the bills of projects -
construction, surveys, settlers' stores, equipment of recruits, reforms, foundings,
jump trials - (`consumed`, never refunded); carriage from outlying regions (`lost`);
deliveries and tribute (`traded_out`); and the stores of a polity that ceases to
govern (`lost`).

## 3. Sources of people

| Source | Where | What backs it | Ledger | Tests |
| --- | --- | --- | --- | --- |
| Starting people: 236,000-248,000 per seat on a smooth pyramid | `worldgen.rs`, `start_pyramid` | the declared initial endowment | opening population | `the_starting_pyramid_is_smooth`, `a_seat_starts_with_real_people_in_real_units` |
| Births | `sim/population.rs` | adults of 16-40 in the region nine months earlier | `flows.births` | `population_changes_only_through_recorded_flows`, monthly audits |
| Deaths of residents | `sim/population.rs` | mortality by age band, hunger and crowding | `flows.deaths` | same |
| Battle losses of formations | `sim/military.rs`, `apply_losses` | soldiers removed from formations | `flows.deaths` | scripted match, all-AI campaigns |
| Militia losses | `sim/military.rs` | working adults removed from the region; exactly as many deaths recorded as people removed | `flows.deaths`; their qualifications `enlisted` | scripted match |
| Formations destroyed with nowhere to withdraw | `sim/military.rs` | soldiers removed | `flows.deaths` | scripted match |

Everything else moves people without changing their number: annual ageing;
settlement, resettlement, migration and drift to work (`move_people`); relocation of
specialists (`relocate_adults`); conversion between religions (`convert`);
recruitment (`draw_adults`: residents become soldiers one for one); disbanding and the
end of a polity (`return_adults`: soldiers become residents one for one); merging of
formations.

## 4. Sources of qualified people

| Source or sink | Where | What backs it | Channel | Tests |
| --- | --- | --- | --- | --- |
| Starting 14,000 lorekeepers and 8,000 artisans per seat | `worldgen.rs` | the declared initial endowment | `initial` | `starting_stocks_and_qualifications_are_the_declared_endowment` |
| Graduation | `sim/projects.rs`, `step_programs` | learners enrolled for the whole course: adults within the working population who held no post, or holders who gave up their post to study; a venue place, course materials each month, and instructors (or, for a founding cohort of at most 4,000, twice the time) | `trained` | `a_founding_cohort_is_at_most_four_thousand...`, monthly audits |
| A holder enrols in a further course | same | leaves the holders while studying | `entered` | scripted match |
| A course is cancelled or lost with its region or its polity | `release_program` | learners who had been holders hold their qualification again | `returned`, in the ledger of whoever controls the region | `an_eliminated_polity_loses_its_stores_and_nobody_vanishes`, scripted match |
| Death | `sim/population.rs` | holders die in the proportion of working-age deaths | `died` | monthly audits |
| Ageing | `sim/population.rs` | holders retire in the proportion of people passing sixty-four | `retired` | monthly audits |
| Recruitment and militia losses | `draw_adults` | the recruits' share of the region's free holders; a qualification lapses in service and is not restored on discharge | `enlisted` | `recruits_and_fallen_militia_take_their_qualifications_with_them` |
| Settlement, resettlement, migration, drift, relocation of specialists | `move_people`, `relocate_adults` | free holders move in the proportion of the working-age people who move, and keep their qualification | none between a civilization's own regions; `moved_out` / `moved_in` across civilizations | `learners_and_instructors_never_outnumber_the_people_who_exist` |
| A region changes controller: capture, liberation, cession, settlement of new land | `World::set_controller` | the residents stay; their qualifications change ledger | `moved_out` / `moved_in` | scripted match, all-AI campaigns |
| Secondment of experts | slice E | - | `seconded_out`, `seconded_in`, `seconded_lost` (zero until then) | - |

Learners and instructors are people. Learners die and are enlisted in proportion and
drop out of their cohorts; when people move, learners and instructors stay with their
courses, and only when the region can no longer back the roles left in it do more of
them leave (free holders first, then learners, then instructors). An instructor who
dies or retires is replaced from the free holders of the qualification, so the number
teaching falls only when no free holder is left. `reconcile_roles` enforces the role
identities after every such change.

## 5. Sources of service

| Source | Where | What backs it | Ledger | Tests |
| --- | --- | --- | --- | --- |
| Mills, hydroelectric works | power sources in `sim/economy.rs` | the site (levels bounded by the fall of water), filled posts, condition | `shaft_made`, `elec_made` | `shaft_service_delivered_never_exceeds_supply`, `electricity_is_conserved_through_generators_motors_and_the_grid` |
| Steam and diesel stations, fission and fusion plants | same | coal, fuel, rare minerals or chemicals taken from stock at the rate actually run | `shaft_made`, `elec_made`; fuel `consumed` | monthly audits |
| Orbital power receiver | same | an orbital construction yard, filled posts, upkeep; no fuel | `elec_made` | monthly audits |
| Generator halls | same | spare shaft work of the region, at nine tenths | `shaft_to_generators`, `elec_from_generators` | `electricity_is_conserved...` |
| Motors | same | spare electricity of the region, at nine tenths | `elec_to_motors`, `shaft_from_motors` | monthly audits |
| Grid | same | the surplus that linked regions offer after their own users, at 92% | `grid_out`, `grid_in` | `electricity_is_conserved...` |
| Compute | recipes of computing centres | filled posts and electricity; what is made this month serves next month | `compute_supply`, `compute_used` | `compute_used_never_exceeds_what_was_installed_the_month_before` |

Service is rationed. Each works asks for the service of the posts it has filled, and
receives the same share of what it asked for as every other works in the region
(compute: in the nation). The rate of a works is then bounded once more by what is
left in the account, so the sum drawn can never exceed what exists, to the unit.

## 6. Sources of work

| Source | Where | What backs it | Ledger | Tests |
| --- | --- | --- | --- | --- |
| Project work | `sim/economy.rs` (call-up), `sim/projects.rs` (acceptance) | one worker-month for each worker called up in the project's region that month; the call-up is bounded by the mobilization the practices allow; unrest reduces it | `labor.projects`, `project_work_done` | `project_work_comes_only_from_called_up_workers_and_research_only_from_staffed_posts`, monthly audits |
| Research work | `sim/economy.rs` | one researcher-month for each person in a research post, reduced by condition, missing service or inputs, and unrest | `research_cap`, `research_used` | same, `compute_used_never_exceeds...` |

A government that controls no region has no labour, no researchers and no service.

## 7. Leaks found, and how each was closed

| # | Leak | Fix |
| --- | --- | --- |
| 1 | Drained deep workings delivered up to 36 kt a level while drawing 18 kt from the deposit: ore from nothing. | Every extraction recipe draws at least what it raises (`Recipe.disturb_bp >= 10,000`). Deep workings draw what they raise; shallow workings raise the easy ore and spoil as much again. Deposits are twice as large so their lifetimes are unchanged. `DepositState` records `drawn` and `delivered`. |
| 2 | Carriage loss was applied before production was booked, so the ledger never showed it. | `produced` is gross; `lost` records the difference. |
| 3 | Spoiled food was booked as consumed. | Spoilage is `lost`. |
| 4 | Treaty deliveries and tribute wrote stocks directly. | `World::transfer` moves exactly what leaves one stock into the other. |
| 5 | Copy houses added 2,000 media lots a month for holding a belief. | Media is made by the precinct's filled posts, in proportion, out of materials taken from stock. |
| 6 | A works limited both by staffing and by power ran at the lesser of the two ratios; because power demand already counted only the filled posts, the works of a region could together draw more shaft or electric service than existed. | Rationing in proportion to what each works asked for, and an exact bound by what is left in the region's account. |
| 7 | A region with spare electricity both offered it to the grid and used it for its own motors. | Motors draw first; only what is still spare is offered to the grid. |
| 8 | Research works asked for service by their staffing rate but ran at their qualified-staff rate. | Demand uses the rate the works runs at. |
| 9 | Compute had the same lesser-of-two-ratios fault as power. | Same rationing, against the compute installed the month before. |
| 10 | A research post nobody held could still supply researcher-months through a rounding fallback; a government that had lost control of all its regions kept the research capacity and compute of its last month and went on researching. | No fallback: capacity is the people in the posts. A government that runs no region has its capacity cleared. |
| 11 | Builders called up for projects supplied two worker-months each. | One worker-month each, like anyone else. |
| 12 | A project without a region would have advanced without labour (no such project kind exists). | Such a project makes no progress. |
| 13 | Fields used the yield of manufactured inputs or of mechanized farming when any chemicals or fuel at all were in stock, and took only what happened to be left; harbour fishing used motor-boat yields without burning fuel. | A method is used only when a full month's draw for every field and motor boat is in store; the draw is taken before any other user; motor boats burn fuel at the field rate. |
| 14 | Recruits and fallen militia left the region without their share of its qualified people, so a region could come to hold more qualified people than working-age residents. | `draw_adults` removes the proportional share of free holders (`enlisted`) and of learners. |
| 15 | Militia deaths were recorded at the number asked for, not the number of adults actually removed. | The recorded deaths are the people removed. |
| 16 | A formation that broke with no friendly region to withdraw to was deleted without its soldiers being recorded as dead. | They are recorded as deaths. |
| 17 | When a polity ceased to govern, its soldiers were deleted, its courses were dropped without releasing their learners and instructors (who stayed counted in the regions for ever), and its stock stayed on a dead ledger. | Soldiers become residents where they stand (in the old capital if they stand on ungoverned land); courses are released; stores are booked as `lost`. |
| 18 | Learners and instructors were exempt from death and departure: a region could count more learners than people. | Proportional attrition and `reconcile_roles` (section 4). |
| 19 | The starting pyramid put the remainder of its division, about three founders in twenty, at age twenty. | Plain proportional allocation with a carried remainder. |
| 20 | Polymer insulation put out 10 kt from 8 kt of chemicals; precision instruments put out 2.0 kt from 1.75 kt of metal and tools. | Polymer insulation also takes 3 kt of materials (filler); precision instruments also take 0.5 kt of materials (glass and fittings). No lot mass changed. |
| 21 | A deposit could never reach zero: the last tonnes were approached but not taken. | The last of a deposit comes out whole. |

## 8. Looked at and left as it is

- Capacities - natural water and waterworks, care, storage (including the 400 kt a
  region stores without a granary), venue places, transport grade, generator and grid
  capacity - depend on the works existing, being enabled and maintained, not on their
  staffing. They are not goods, people, service or work.
- The other belief effects are capacities of the same kind: 16,000 teaching places
  (Teaching Order), care for 800,000 residents (Menders' Order) and 800 kt of food
  storage (Grain Oath) need an enabled precinct but do not scale with its staffing.
- Orbital power needs no fuel; kilns and camps need no fuel. Their backing is the site.
- Pasture and fishing yields improve with knowledge alone; only field methods and
  motor boats draw inputs.
- A founding cohort (at most 4,000 learners) qualifies without an instructor in twice
  the time. The learners are real residents.
- Teaching by treaty lowers the work an investigation needs (by 40-75%); it credits no
  research work. A first-of-kind installation needs half as much work again. An
  exploratory study yields leads, not work.
- Settlers' stores, survey provisions and recruits' equipment are consumed when the
  project is provisioned; they do not reappear at the destination.
- Demolition and cancelled projects recover nothing.
- A captured region keeps its people; its works lose three tenths of their condition.
- A movement's participants and devotion are indices, not people moved.
- `use_ema` (smoothed monthly use, which sets stock targets) reads `consumed`. Food
  spoilage no longer counts as use, which changes nothing: no recipe makes food, so the
  food target is never consulted, and food production is planned from the reserve
  policy. For every other good `consumed` is what it was.
- The native policy reads the ledger line of its own observation. It now adds `lost`
  to food use (spoiled food has to be replaced) and takes `lost` off the production of
  other goods (the ledger states output where it is made), so its judgments are what
  they were.

## 9. Tests

Engine (`crates/bts-engine/src/tests.rs`), scripted, no policy:

- `a_scripted_match_balances_every_month_for_thirty_years`: 360 months with courses,
  recruitment, settlement, resettlement, a war with militia losses, a captured region,
  a destroyed formation, a treaty with deliveries and tribute, a cession and an
  elimination; `ledger::violations` after the decisions of every round and at the
  close of every month; asserts that every channel of both ledgers moved.
- One test per source or leak, named in the tables above.
- `the_audit_notices_goods_people_and_qualifications_from_nothing`: cooks the books
  in fifteen ways and requires the audit to name each.
- `ledger_fields_default_when_a_save_does_not_have_them`.

All-AI (`crates/bts-ai/tests/conservation.rs`; the engine cannot depend on the
policy crate):

- `all_ai_matches_balance_every_month_for_three_hundred_months`: three worlds, 300
  months each.
- `all_ai_campaigns_balance_every_month_through_war_settlement_and_recruitment`: two
  whole campaigns of 2,880 months, which between them include settlement, recruitment,
  war, regions changing hands, an elimination, trade, mining, a shared grid and
  compute.

Granularity in all of them: every month, plus one check per round for what the seats'
decisions themselves changed.
