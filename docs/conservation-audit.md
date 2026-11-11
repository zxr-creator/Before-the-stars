# Conservation audit (ruleset 2.0, slices B to E)

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
| Qualified people, per civilization, cumulative from the start | `Civ.qual_flows` (`QualFlows`): `initial`, `trained`, `entered`, `returned`, `died`, `retired`, `enlisted`, `moved_in`, `moved_out`, `seconded_out`, `seconded_home`, `seconded_lost`, `seconded_in`, `seconded_back` | for every qualification, at every moment: holders in the regions the civilization controls `= initial + trained - entered + returned - died - retired - enlisted + moved_in - moved_out - seconded_out + seconded_home - seconded_lost + seconded_in - seconded_back`; over the world `sum(moved_in) = sum(moved_out)`, `sum(seconded_in) = sum(seconded_out)`, `sum(seconded_home) = sum(seconded_back) <= sum(seconded_in)`, and for every civilization `seconded_lost <= seconded_home` |
| Roles, per region | `Region.quals`, `students`, `teachers`, `Program.enrolled`; `Region.last.labor`; `Project.crew_on_site` | `sum(quals) + students <= working-age residents`; `teachers[q] <= quals[q]`; `students = sum(enrolled)` of the programmes held there; when the month's labour is given out, `food + facilities + projects + household + students + teachers <= working-age residents` (one person, one role); the site crews of the orders sited in the region `<=` the workers called up for projects there |
| Service, per region and month | `Region.last.power` (`PowerLedger`) | `shaft_used + site_from_supply <= shaft_made - shaft_to_generators + shaft_from_motors`; `site_from_engines <= 5 x site_coal + 10 x site_fuel`; `elec_from_generators <= 0.9 x shaft_to_generators`; `shaft_from_motors <= 0.9 x elec_to_motors`; `elec_used + elec_to_motors + grid_out <= elec_made + elec_from_generators + grid_in`; per civilization `sum(grid_in) <= 0.92 x sum(grid_out)` |
| Compute, per civilization and month | `Civ.compute_supply`, `Civ.compute_used` | `compute_used(month) <= compute_supply(month - 1)` |
| Work, per region and month | `Region.last.labor.projects`, `Region.last.project_work_done` | `project_work_done <= workers called up` |
| Research, per civilization and month | `Civ.research_cap`, `Civ.research_used` | `research_used[class] <= research_cap[class]`; `sum(research_cap) <= people in research posts` |
| Deposits | `DepositState.remaining`, `drawn`, `delivered` | `remaining + drawn` is constant; `delivered <= drawn`; ore booked as `produced` in a month `=` what the deposits `delivered` in it |
| Regional output and carriage, per region and month | `Region.last.infra` (`InfraMonth`): `made`, `delivered`, `used`, `exempt`, `chain_saved` by good; `capacity`, `load`, `infra_bp`, `maint_bp`, `congestion_bp` | for every good: `made <= sum over the region's works of (output of the method run x levels x rate)`; `exempt <= used`; `exempt <= delivered <= made`; `maint_bp <= 1,500`; `congestion_bp = (10,000 - infra_bp) x 2,000 / 10,000 <= 2,000`; `infra_bp = 10,000` exactly when `load <= capacity`; over the regions of one civilization `sum(made) <= produced` and `sum(made - delivered) <= lost` |

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
| Recipes of works | `sim/economy.rs` section 4 | filled posts, inputs taken from month-start stock, service actually available, condition; the method each works runs is fixed once a month, so its posts, service and goods belong to one recipe; outputs never exceed `recipe x level x rate`; mass out <= mass in for every method | `produced` gross; inputs and upkeep `consumed`; carriage and congestion `lost`; `InfraMonth.made` per region | `no_recipe_puts_out_more_mass_than_it_takes_in`, `the_new_methods_trade_one_real_thing_for_another`, `choosing_a_method_changes_the_inputs_outputs_service_and_posts_of_a_works`, `carriage_loss_and_spoilage_are_booked_as_lost`, `industrial_scale_reduces_general_posts_but_does_not_multiply_goods`, `shared_support_saves_posts_only_and_shrinks_when_freight_is_congested`, monthly audits |
| Ore, coal, crude, gas and the other deposits of ruleset 3.0 | same; recipes with `depletes` | the deposit: every tonne raised is drawn from it, shallow workings draw two | `produced[g]` = deposits' `delivered` <= `drawn` (salt: at least what the salt deposits delivered, coastal pans make the rest) | `extraction_draws_from_the_deposit_at_least_what_it_delivers`, monthly audits |
| Helium (ruleset 3.0) | gas wells with separation | the gas raised that month times the field's `helium_bp`, never above the recipe | `produced[Helium]` | `bronze_tools_need_tin_and_helium_comes_only_from_rich_gas` |
| Timber (forestry camps), stone and clay (quarries), fired brick (kilns), salt from pans, fibres, spices, horses (ruleset 3.0) | same; works flagged `extractive` (land works also `land`) | labour on the site: forest, arable, pasture and spice land bound the levels (fields and fibre plantations share arable land, pastures and horse breeding share pasture); a land works' output follows its site bonus, at most twice its recipe, and the audit's ceiling includes that factor | `produced[g]` | `no_recipe_puts_out_more_mass_than_it_takes_in` (the list of extractive works is asserted), monthly audits |
| Fertilizer by ammonia synthesis, food synthesis (declared atmospheric recipes) | same | nitrogen or carbon of the air: output mass at most three times the mass taken from stock | `produced`, inputs `consumed` | `no_recipe_puts_out_more_mass_than_it_takes_in` |
| Household craft: 0.3 t of materials per idle adult-month | `sim/economy.rs` | adults of working age with no post that month; stops when stores are at twice their target | `produced[Materials]` | `household_craft_is_bounded_by_idle_adults` |
| Copy houses (belief): up to 2,000 media lots a month | `sim/culture.rs` | the filled posts of the precinct, in proportion, and a tonne of materials taken from stock for every three lots | `produced[Media]`, `consumed[Materials]` | `copy_houses_make_media_only_from_a_staffed_precinct_and_real_material` |
| Treaty deliveries | `sim/diplomacy.rs` | the sender's stock; what is not there is not delivered and is recorded as a shortfall | `traded_out` / `traded_in` | `a_signed_treaty_delivers_goods_once_and_knowledge_is_not_unlearned`, `treaty_goods_and_tribute_leave_one_stock_and_enter_another` |
| Tribute of a subordinate | `sim/diplomacy.rs` | the subordinate's stock, at most a quarter of it a month | `traded_out` / `traded_in` | same |

Goods leave through: eating (`consumed`, one ration per resident and soldier);
spoilage (`lost`); recipe inputs, upkeep of works and formations, field horses,
fertilizer, chemicals and fuel, salt that slows spoilage, fuel of power stations, coal and fuel burned by the engines of construction
sites, course materials, and the bills of projects -
construction, surveys, settlers' stores, equipment of recruits, reforms, foundings,
jump trials - (`consumed`, never refunded); carriage from outlying regions (`lost`);
deliveries and tribute (`traded_out`); and the stores of a polity that ceases to
govern (`lost`).

Labour productivity (ruleset 3.0 slice 6, units chapter section 15) is not a source
of anything either: it changes how many posts a works needs (the audit checks every
works' posts against the formula with the month's stored factors, and the factors'
bounds) and how many worker-months a called-up worker supplies (project work is at
most the called-up workers times the month's construction factor, at most 1.5). The
recipe's ceiling `recipe x level x rate` is unchanged (`productivity_frees_people_and_never_makes_goods`);
a field level yields at most twice its method's base
(`field_yield_per_level_is_capped_at_twice_the_method`). Fields with partial inputs
reserve every level's month of inputs from month-start stock before the food plan,
and draw only what the cultivators at work need.

Economies of scale (units chapter, section 7) are not a source of anything, and the
audit holds them to that. Shared support posts change how many general posts a works
needs and nothing else. Maintenance pooling makes the works take less upkeep out of
stock (`consumed` falls; nothing is produced). Integrated chains and congestion only
decide how much of what a region made is booked as `lost` on its way to the common
stock: the exempt quantity is bounded by what the region's own recipes took that
month and by what it made, and what is delivered never exceeds what was made. The
choice of a production method changes which recipe runs; every recipe passes the
mass balance, and none of the methods added with slice D yields more per unit of
material than the method it replaces.

### 2.1 Ruleset 3.0 job 3: raiders, refits and the market

- **Raider arms** (`raider_arms`) are a declared environment source like the initial
  endowment: camp warriors fight with them, and they never enter any seat's stock.
  Defeated raiders leave no kit.
- **Camp stores** are outside every seat's books. Raids and tribute take goods out of a
  seat's stock as `lost`; a seat that breaks a camp books its plunder store as
  `produced` ("recovered plunder"). `World.wild` keeps the cumulative ledger, and the
  audit checks, for every good: `held in camps = plundered + tribute - eaten -
  recovered - abandoned`.
- **Refits and kit**: a refit commits its whole equipment bill as a project's inputs
  (`consumed`, never refunded). Kit sets in `Civ.kit` are a count of soldier sets, not
  a good: they are filled by completed refits and disbanding and emptied by recruits
  from the store; militia use them without consuming them.
- **The market** moves goods only with `trade_out` / `trade_in`, and books what the
  route loses as the buyer's `lost`; the world-wide traded-in total still equals the
  traded-out total. **Trade credit** (thousandths of a credit) is never created: the
  audit checks that the world holds none in total, that no seat holds a negative
  balance, and that each balance is what it earned less what it spent. With no credit
  at the start, a seat pays for what it buys with what it sells the same month.

### 2.2 Ruleset 3.0 job 4a: boost, zone stores, shipments, sites and stations

- **Boost** (design chapter 39, 4.7) is not a good: `Civ.space` keeps the stock and the
  cumulative tonnes made and spent, and the audit checks `stock = made - spent`, that the
  stock is never negative and that neither total runs backwards. Launch stages make boost
  only from inputs drawn for it (`sim/economy.rs`), and at the cap they stand down: they
  draw nothing and make nothing (posts stay filled).
- **Zone stores and shipments**: a seat's holdings are its national stores, its zone
  stores (`Civ.space.stores`) and the goods of its shipments (`World.space.transits`);
  the audit's stock is their sum, so moving goods between them is no flow. Propellant and
  transfer hardware are `consumed` when a shipment is ordered; site works, life support and
  station refineries book `produced` / `consumed` against the zone store; a station part's
  bill is `consumed` from the national stores. Colonies passing to another seat move their
  zone stores and shipments as `traded_out` / `traded_in`.
- **Site deposits** are in the deposit ledger (region ids from 60,000): ice works, mining
  stations and helium-3 extractors deliver exactly what they draw. Volatiles also come
  from water and air plants on the Earth (renewable, like salt pans), so for volatiles the
  audit checks only that the deposits delivered no more than was made.
- **Station crews** are people in posts filled from qualified residents no works employs;
  a tenth of them count as aboard (they stay residents of their regions). The audit
  checks that no station reports more aboard than a tenth of its filled posts. Station and
  site research capacity is bounded by the people in their research posts.

## 3. Sources of people

| Source | Where | What backs it | Ledger | Tests |
| --- | --- | --- | --- | --- |
| Starting people: 236,000-248,000 per seat on a smooth pyramid | `worldgen.rs`, `start_pyramid` | the declared initial endowment | opening population | `the_starting_pyramid_is_smooth`, `a_seat_starts_with_real_people_in_real_units` |
| Births | `sim/population.rs` | adults of 16-40 in the region nine months earlier | `flows.births` | `population_changes_only_through_recorded_flows`, monthly audits |
| Deaths of residents | `sim/population.rs` | mortality by age band, hunger and crowding | `flows.deaths` | same |
| Battle losses of formations | `sim/military.rs`, `apply_losses` | soldiers removed from formations | `flows.deaths` | scripted match, all-AI campaigns |
| Militia losses | `sim/military.rs` | working adults removed from the region; exactly as many deaths recorded as people removed | `flows.deaths`; their qualifications `enlisted` | scripted match |
| Formations destroyed with nowhere to withdraw | `sim/military.rs` | soldiers removed | `flows.deaths` | scripted match |

| Raider camps: initial free peoples, births and deaths | `sim/raiders.rs` | camp blocks of the camp's lineage in an unclaimed region; war deaths in raids and battles | `World.wild.births` / `deaths` (the audit adds them to the seats' births and deaths) | `raids_take_capped_goods_kill_and_damage_and_the_books_balance`, all-AI campaigns |
| Scouts lost on reconnaissance | `sim/projects.rs` | adults of the supplying region | `flows.deaths` (war) | `a_scout_party_charts_a_region_and_its_neighbours` |
| Off-world settlers and founding parties | `sim/space.rs` | adults 20-45 of the seat's most populous region; their qualifications lapse (`enlisted`); in a shipment, then residents of a site (or home again when the site was claimed first) | none: the audit's world people counts site residents and people in shipments | `the_first_outpost_to_arrive_claims_the_site_and_its_people_live_and_die_there` |
| Births and deaths at sites | `sim/space.rs` | the site's block; environment multipliers; unserved residents die at up to three times the rate | `flows.births` / `deaths` of the site's owner | same, `people_off_the_earth_die_faster_where_they_are_not_served` |

Camp people who leave for a seat's region (decline, refugees of a broken camp,
subjects with the land) are that seat's immigrants and `World.wild.migrated_out`;
the audit counts them with the seats' emigrants.

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
| Secondment of experts under a treaty | `sim/diplomacy.rs` (`activate`, `end_cooperation`), `sim/population.rs` (`second_out`, `second_home`) | free holders (not teaching) of the lender, at most half of them, move with real adults of 20-55 to the borrower's capital and keep their qualification; at the end the survivors (never more than the borrower's free holders, nor more than are still owed) go home with real adults, except on the borrower's breach or war, when a quarter stay as ordinary residents and lose the qualification; experts who die, retire or are enlisted abroad leave through the borrower's ordinary channels and reduce what is owed | lender `seconded_out`, then `seconded_home` (all released) and `seconded_lost` (those kept behind); borrower `seconded_in`, then `seconded_back` | `seconded_experts_leave_the_lender_work_abroad_and_come_home_at_term`, `a_quarter_of_the_experts_stay_behind_when_the_borrower_repudiates_or_war_comes`, `the_audit_notices_experts_who_were_never_sent`, all-AI campaigns |

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
| Site engines | `sim/projects.rs`, `draw_site_power` | coal (5 units a tonne) and then refined fuel (10 units a tonne) taken from stock in whole tonnes (never the month of fuel the fields and motor boats must find in store), for the site power an order's work of the month needs beyond what the region set aside for its sites; all of it is used on the site | `site_from_engines`, `site_coal`, `site_fuel`; coal and fuel `consumed` | `site_engines_burn_real_coal_then_fuel_and_local_power_is_used_first`, monthly audits |
| Compute | recipes of computing centres | filled posts and electricity; what is made this month serves next month | `compute_supply`, `compute_used` | `compute_used_never_exceeds_what_was_installed_the_month_before` |

Service is rationed. Each works asks for the service of the posts it has filled, and
receives the same share of what it asked for as every other works in the region
(compute: in the nation). The rate of a works is then bounded once more by what is
left in the account, so the sum drawn can never exceed what exists, to the unit.
Construction sites ask for shaft work with the works and are rationed with them; their
share is set aside before any works draws, and a site draws from it only for the work
it does (`site_from_supply`). What a site does not draw is used by nobody.

## 6. Sources of work

| Source | Where | What backs it | Ledger | Tests |
| --- | --- | --- | --- | --- |
| Project work | `sim/economy.rs` (call-up), `sim/projects.rs` (acceptance) | one worker-month for each worker called up in the project's region that month, the members of site crews included (each works only on the order that holds them); the call-up, crews first, is bounded by the mobilization the practices allow; unrest reduces it | `labor.projects`, `project_work_done`, `Project.crew_on_site` | `project_work_comes_only_from_called_up_workers_and_research_only_from_staffed_posts`, `a_site_crew_holds_no_other_post_and_returns_when_the_order_ends`, monthly audits |
| Research work | `sim/economy.rs` | one researcher-month for each person in a research post, reduced by condition, missing service or inputs, and unrest | `research_cap`, `research_used` | same, `compute_used_never_exceeds...` |

A government that controls no region has no labour, no researchers and no service.

A site crew is not a source of anything: it is people holding a role. Its members are
qualified residents who are not teaching; while reserved they are in no post of the
region's works (the works are staffed from who is left), they are counted under
`labor.projects` and `qual_employed`, and the order's time, goods, work and power are
all still needed. Minimum durations and first-of-kind surcharges only ever slow an
order; nothing is credited for them.

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
  in nineteen ways and requires the audit to name each.
- `tests/construction.rs` (slice C): every month of every construction test is
  audited; the scripted match above also builds works with site crews, on the
  regions' own shaft work and on site engines.
- `ledger_fields_default_when_a_save_does_not_have_them`.
- `tests/methods.rs` (slice D): every month of every method and scale test is
  audited. `the_audit_notices_savings_that_make_or_deliver_more_than_the_works_did`
  cooks a region's account in seven ways (more made than the works' methods, levels
  and rates allow; more delivered than made; more exempt than used on the spot; a
  saving or a congestion loss beyond its cap; regional output or carriage loss
  beyond what the civilization booked) and requires the audit to name each.
  `maintenance_pooling_cuts_upkeep_by_at_most_fifteen_percent_and_only_while_the_shop_runs`,
  `output_used_in_the_same_region_pays_no_carriage_and_nothing_else_is_spared` and
  `a_congested_region_loses_more_in_carriage_until_transport_is_added` state each
  rule to the unit.
- `tests/cooperation.rs` (slice E): every month of the secondment tests is audited,
  and the books are checked across the signing, the repudiation by either party and
  the declaration of war that settle a secondment. `the_audit_notices_experts_who_were_never_sent`
  books experts received that nobody sent and requires the audit to name it.

All-AI (`crates/bts-ai/tests/conservation.rs`; the engine cannot depend on the
policy crate):

- `all_ai_matches_balance_every_month_for_three_hundred_months`: three worlds, 300
  months each.
- `all_ai_campaigns_balance_every_month_through_war_settlement_and_recruitment`: four
  whole campaigns of 2,880 months (one may end some months early, won), which between them include settlement, recruitment,
  war, regions changing hands, an elimination, trade, mining, a shared grid, compute,
  site crews, site power from the regions' shaft work and from site engines, and
  (since slice E) experts lent under secondment treaties: native seats seconded
  30,000-75,000 experts in three of the four campaigns, and in two of them experts
  were released from service abroad (19,000 and 72,000), under the monthly audit; the
  test requires that some were lent and some released.
  Every campaign is also required to have had pooled maintenance and output exempt
  from carriage under the audit (5,600-7,800 pooled region-months in each), and the
  three between them congested freight (137, 4 and 2,095 region-months: seats that
  build their transport in time hardly see it).

Granularity in all of them: every month, plus one check per round for what the seats'
decisions themselves changed.
