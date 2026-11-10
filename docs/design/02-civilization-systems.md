# Civilization Systems and Settlement Rules

Technology drives development, but real production, finance, people, and organization must support it. Seven systems interact through shared accounts and entities, rather than accumulating unrelated points.

Version 0.7 explicitly allows pivotal investment, genuine trade margins, prepared talent, and diplomatic judgment to create substantial leads. A large benefit is not itself an exploit. Violations of accounts, property, authority, timing, or reward definitions require repair; see [decision value and exploit boundaries](24-decision-value-and-exploit-boundaries-v0.7.md).

The standard start is an early community without city-states or monetary markets. [Settlements, urban–rural networks, and education](11-settlements-and-education.md) specifies cities, villages, mines, industry, and education. Cash and market rules below apply after their institutions exist; early construction uses actual goods and organized labor.

Cross-system causal tables and social responses are designer/referee material, not text to copy into human or agent knowledge packs. Players investigate through visible accounts, reports, and surveys. Units, stage access, and resource arbitration are authoritative in the [variable catalog](../technical/06-state-variable-catalog.md) and [monthly engine](../technical/07-monthly-engine-spec.md). This chapter summarizes economic meaning. Knowledge/culture updates are detailed in [16](16-knowledge-and-culture-engine.md), with the current knowledge presentation in [31](31-knowledge-and-culture-v1.0.md) and population simplification in [32](32-population-and-education-v1.0.md).

## Constraints between systems

| Source | Affected systems | Actual transmission |
| --- | --- | --- |
| Technology | Resources, economy | Recipes, substitute inputs, material quality, production and transport methods |
| Technology | Population, factions, culture | Occupational demand, income, educational returns, organizational power |
| Resources | Technology, trade | Experimental materials, energy, equipment, feasible routes |
| Economy | Technology, culture | Sustained research/education and the occupational/organizational foundations of institutions |
| Population | Economy, technology | Labor, skills, consumption, care, research talent |
| Population | Factions, culture | Occupations, property, faith, and generational experience change memberships and cultural shares |
| Factions | Economy, technology, culture | Support or resistance to budgets, investment, dissemination, reforms, and mobilization |
| Trade | Resources, economy, technology | Inputs, markets, transmitted techniques, dependence, and substitute competition |
| Culture | Population, technology, factions | Occupational esteem, knowledge transmission, cooperation scope, policy acceptance |
| Geography | All of the above | Transport, farming conditions, resource quality, correlated hazards, administrative distance |

Geography is a common constraint layer, not another civilization attribute bar. The same coal deposit or river changes value with technology, transport, and demand.

## Resources and products

Initial common categories are `food`, `biomass` including basic construction materials, `metals`, `fuels`, `chemicals`, and `precision_goods`. Currency is a settlement asset, not a material. Electricity, transport, and compute are time/place-constrained services, not infinitely stockpilable universal points.

Inventory uses `ProductSpec`. Categories summarize the UI; `material_tags`, `quality_grade`, and units determine recipe compatibility. Generic precision goods cannot substitute for optical-grade lenses. Noninterchangeable inventory cannot be merged merely because it shares a category. Expand detailed products by default only when relevant to current projects, contracts, or production plans.

| Property | Rule |
| --- | --- |
| Raw reserves | Extraction reduces recoverable reserves; surveying changes knowledge rather than creating minerals |
| Renewables | Recovery depends on land, ecology, and inputs; no unlimited free output |
| Inventory | Bound to region, owner, and specification; may spoil and consumes storage |
| Energy | Generation provides monthly service capacity and consumes actual fuel/other inputs |
| Transport | Each edge has throughput, cost, risk, and travel months; goods in transit cannot be consumed |
| Soil | Cultivation, recovery, irrigation, and hazards interact; depopulation does not instantly restore fertility |

Population, products, currency, assets, and knowledge have separate global accounts. Recipes transform materials and losses have causal events. Requiring an unchanged total number of product items would incorrectly prohibit processing between different products.

## Production and markets

A facility has an owner, location, recipe, equipment level, staffing needs, maintenance condition, and capacity. Private organizations procure locally using observed prices, fulfillment experience, and their own risk preferences, without omniscient optimization. Players directly control public facilities and influence others through taxes, procurement, subsidies, law, and contracts.

Monthly facility output is limited by its scarcest input:

`output = min(equipment capacity under current process, each available material / unit material input, qualified hours / unit hours, energy / unit energy, permitted emissions or treatment capacity)`.

Process improvements alter capacity, unit inputs, or losses. Multiplying an extra efficiency factor after the minimum would illegally overconsume materials. Commit output and all actual inputs together; retain unused inputs. For equipment capacity 20, material stock 12, and 2 material units per item, output is at most 6, not 12 because another equipment-efficiency factor is two.

Only arrived, quality-cleared, otherwise unreserved goods qualify. New goods produced this month enter pending inventory and become available for input, sale, or consumption next month. Opening inventory may change ownership and be consumed this month, but the same unit cannot be sold and used twice. Arrivals requiring acceptance remain quarantined and cannot be used or resold merely because they arrived; month-end acceptance releases them no earlier than next month. Every start needs food/maintenance reserves spanning its shortest production and transport cycles. An initialization timing gap must not masquerade as natural famine.

Electricity, cooling, networks, and compute are current-month services allocated in dependency order in stage 3. They are neither delayed like all new goods nor stored as next month's service. A service cycle needs a composite facility with net inputs/outputs or actual stored energy to start; it cannot amplify free power within one month. The monthly engine specifies ordering and release after failures.

Regional markets match orders and contracts. Prices use one accounting unit; multiple trade currencies, exchange rates, and multibank credit are extensions. The initial market uses ordered bids/asks and a uniform clearing price. Marginal equal-price orders receive proportional allocations; residual units follow a seed-derived order independent of submission order. Price matching without transport does not guarantee delivery: guaranteed-shipping trades require reserved transport capacity.

For one region/specification, sort bids descending and asks ascending, then find the maximum quantity with bid at least ask. The uniform price is the floored integer midpoint of the final matched marginal bid and ask. No match means no transaction. At each side's marginal price, allocate proportionally with flooring, then distribute remainders. Destination spot orders use only local inventory that actually arrived and was released in stage 1. Future arrivals are transport/`goods_delivery` obligations with delivery months; they do not enter current spot volume, price, or consumption. Government and private orders obey identical rules.

Spot markets use public posted orders only. Cross-region procurement separates payment/escrow, transport, arrival, and settlement. Parties actually ship goods or pay; there is no external infinite supplier. Every market change requires arbitrage and resource/currency conservation checks.

Distinguish one-shot orders from standing operating policies. A standing policy specifies known product, region, side, monthly quantity, limit price, target inventory, money or saleable-inventory ceiling, and end month. It generates orders from the owner's already acquired information each month. Filled, expired, and unfilled quantities remain traceable; long turns cannot secretly use omniscient prices. Government and private organizations share generation/reservation rules; public facilities may also configure standing sales. Policy changes affect future orders, not completed trades. The unimplemented field additions are in the [0.5 interface addendum](../contracts/v0.5-design-addendum.md).

Orders from one actual controller in one market aggregate before allocation. Marginal shares allocate by controller, then by order. Self-trades create neither output value, demand signals, nor reward. Opposite orders of one controller net before marginal pricing. Related-entity splitting does not change total budget, collateral, tax, or identity records. Manipulative quotations, physical hoarding, and secret collusion may still help an opponent, but require actual money, storage, and risk. Uniform clearing is not claimed to be strategy-proof or immune to collusion.

## Finance and budgets

Households/population access pools, organizations, and government separately hold money and assets. Fiscal revenue comes from actual collection, sales, agreements, and approved financing after collection costs and lawful local retention. Social wealth is not automatically central treasury cash.

The first version has no commercial-bank credit creation. Government/organization loans may specify principal, maturity month, and interest; lending immediately reduces the lender's available cash. Automatic collateral enforcement against nonescrowed assets is unsupported. Initial currency injection and later issuance require ledger events, with the known issuance institution disclosed before adoption. Primitive starts do not assume everyone already uses a universal currency.

Budgets distinguish recurring monthly ceilings from one-time investment. Permission to spend is neither expenditure nor research progress. Planning validates/reserves immediately effective commitments, explicit escrow, and the next simulation month's discretionary spending, rather than freezing 12 months or decades of budgets at once. Departmental ceilings alone do not debit cash for unstarted projects.

Each subsequent month reserves only received revenue, processes effective payment obligations first, then distributes optional spending according to the player's declared department/project priorities. Existing maintenance, relief, and defense require funding and receive no free automatic floor. Optional underfunded projects queue or stop by explicit rules; they do not borrow from nowhere. Unfunded legal obligations become arrears with consequences. Unused monthly reservations release at month-end, separately from contract escrow. Two projects cannot spend the same money or treat future tax receipts as present cash.

Long-term contracts schedule future liabilities without inventing future funds. Feasibility distinguishes present capacity from projected revenue; inadequate forecasts produce risk warnings without revealing foreign plans. Incurred obligations survive government replacement and follow contract default rules.

Wages settle in stage 6 while households buy food in stage 4, so monetized initial states require actual food or cash working reserves. Explicit wage advances may execute at month-start: protect already-effective certain payables first, then use received employer funds in lawful order. New optional advances cannot spend old-debt funds first. Advances count toward actual departmental spending; month-end pays only the balance. Unperformed labor creates contractual repayment/arrears. Advances are not default consumer credit, and unpaid wages are not spendable household cash. Month-end income supports new orders starting next month.

## Capacity to absorb investment and its economic cost

Persistent concentration of actual resources in one department while neglecting its productive and organizational base should weaken its future capacity through economic feedback. This applies to education, research, defense, industry, cities, and welfare without a universal penalty for spending above a budget percentage.

Separate budget permission, actual procurement, and effective services. A high ceiling without executable demand does not automatically spend cash. Actual spending requires people, equipment, materials, or fulfilled services. Unused money cannot disappear merely to make “maximum spending” fail. Policy matters through changed real allocation.

Every department faces four constraints: executable known techniques/organization; qualified staff, space, and equipment; sustaining materials, energy, and logistics; and complementary capacity to apply results in production/services. Expanding one cannot replace the others. Using idle capacity can yield high short-term returns; continued unilateral expansion eventually encounters complementary bottlenecks.

| Sustained unilateral expansion | Direct claims | Long-run feedback |
| --- | --- | --- |
| Education | Teacher/student time, materials, space, care, finance | Withdrawal from current production; missing practice equipment/jobs limits application while schools still need maintenance |
| Research | Experts, instruments, samples, energy, compute | Missing manufacture/verification blocks deployment; displaced maintenance may damage research capacity itself |
| Armament | Recruits, equipment, instructors, transport, subsistence | Pressure on tax base and civilian supply; logistics shortages weaken expanded forces |
| Industry/extraction | Land, water, equipment, labor, transport | Upstream shortages, inventory buildup, environmental damage, maintenance; no real buyer means no sales income |
| Cities/public services | Land, building materials, skills, continuing service staff | Facilities beyond supply/fiscal support stop operating; building counts do not replace delivered services |

Scarce shared inputs first create queues, wage/procurement-price changes, reassignment, and opportunity costs elsewhere. Lost production, deferred maintenance, household supply, and tax-base changes then affect future investment. Money paid to teachers or soldiers remains in social accounts. Loss arises from resource use and future capacity, not from declaring all public expenditure a net social loss.

Balanced development means addressing current bottlenecks, sustaining necessities, and preparing subsequent capacity, not equal allocations to every department. A high government education share may coexist with private production, local finance, and trade supplying other complements. Specialization, imports, and temporary concentrated programs are valid when they pay real prices, maintain delivery, and manage dependence. The mechanism counters permanent expansion that ignores complements; it does not guarantee every high-share policy fails in every scenario.

Renaming budget lines, registering schools as research factories, outsourcing training, or splitting organizations preserves actual resources and obligations. Shared facilities may save genuinely duplicated investment, but one service timeslot cannot count as two outputs.

## Research and large-project inputs

Research executes tasks with actual units:

`executable tasks this month = min(team hours / hours per task, instrument slots / slots per task, each material stock / material per task, tasks supported separately by energy and compute, monthly project absorption capacity)`.

Executed tasks consume inputs and record measurements/effective evidence. Instrument quality and unknown compatibility affect whether results satisfy acceptance; they do not multiply extra trials or materials after the minimum. Missing mandatory safety conditions or key facilities gives zero executable tasks. Task units are not interchangeable across projects; see [knowledge execution](16-knowledge-and-culture-engine.md). Money represents activity only after paying for people, equipment, materials, experiments, or services. Unused funds remain unspent.

Projects contain milestones specifying costs, inputs, facilities, organization, verification, and time. Failed experiments can leave data and partial process experience; random failure cannot erase all accumulated deterministic work. Suspension preserves acquired knowledge, although neglected equipment deteriorates and teams disperse.

| Project archetype | Required real inputs | Capability obtained |
| --- | --- | --- |
| High-energy/nuclear program | Material purification, energy, experimental facilities, experts, confidential organization | High-energy experiments and civilian/military applications |
| Space program | Propulsion, materials, tracking/control, manufacturing quality, sustained launches/logistics | Orbital access and construction |
| Global information network | Communication nodes, electricity, equipment, standards, operation, user access | Cross-region data exchange and compute services |
| AI program | Computing hardware, training compute, data quality, researchers, validation | Specific research, design, or production assistance |
| FTL engineering | Theory, materials, energy, control, orbital industry, system tests | Repeatedly verifiable faster-than-light travel |

These are templates, not requirements to reproduce real history or real technical parameters.

Experiments require actual trials, minimum sample inputs, and instrument occupancy. Repetitions of one question reconcile under the same research plan and normalized experimental conditions. Cancellation, recreation, renaming, and many zero-cost projects cannot obtain fresh independent draws. Parallel repetitions can add evidence only by consuming additional equipment, staff, and samples; correlated trials cannot masquerade as independent verification.

## AI and compute

Computing equipment is a manufactured, maintained, depreciating asset. Available monthly compute is its rated service capacity constrained by power, cooling, maintenance, networks, and qualified staff. Hardware capital is not infinitely consumable compute points.

Training consumes project compute and produces a purpose-specific model asset. Running it continually consumes inference compute, electricity, and maintenance. Research assistance, industrial scheduling, and military analysis have separate scopes and validation. An “AI level” cannot raise every output without limit.

Compute may be traded subject to bandwidth, latency, data rights, and interruption risk. Sensitive projects may require local execution. Steam/diesel traditions may develop electrical equipment, import compute, or use different computing implementations. Punk aesthetics do not prohibit cross-technology integration.

In-game compute is separate from external API resources used by player models such as GPT or Claude. Purchasing game compute does not grant model tokens. External tool budgets are fixed independently.

## Population and cultural composition

Version 1.0 uses sparse, disjoint population blocks jointly preserving location, cultural lineage, religion, actual access class, qualification bundle, and legal/service status, with a compact annual age-count vector. [32](32-population-and-education-v1.0.md) supersedes the fine family stages, reproductive exposure, and pregnancy objects retained historically in [12](12-population-and-development.md). Children, working-age adults, and older people are UI summaries, not the sole internal age state. Care, learning, employment, and military service share actual human time.

`monthly population change = births - deaths + immigration - emigration`. Migration subtracts from origin, preserves people in transit, and adds them on arrival; nobody simultaneously counts in both places. Birth lag, courses, and age progression follow simulation months and versioned parameters, not fixed population increments per decision turn.

Available work subtracts care, illness, education, service, and other actual claims. Skills require teachers, inputs, and time; a policy cannot instantly turn everyone into researchers. Food access depends on income, property, relief, and transport. Sufficient national food does not guarantee each group is fed.

Cultural shares sum actual population blocks. Registration is an observation and cannot replace real population for births/deaths. There is no fixed national growth rate. Aggregate births depend on age, family preferences, constraints, and delayed response; mortality reads actual supply, health, age, and crises. Modern low birth rates can occur without famine or war. Direct battle deaths, indirect nutrition/health losses, migration, and missing registration settle separately rather than through a population-halving event. [32](32-population-and-education-v1.0.md) supplies the current loop and examples.

## Agricultural, industrial, and urban capacity

Agriculture depends on usable land, soil, water, and labor. Industry needs facilities, skills, energy, transport, repair, and waste treatment. Cities supply housing, drinking water, sanitation, commuting, and organizational services. A city does not print output value; it sustains concentrated people and specialization. Schools, hospitals, and workshops are not bonus buildings detached from residents' living conditions.

A few service capacities represent these constraints; there is no household plumbing simulation. Population may exceed capacity, causing explicit crowding, commuting time, health pressure, and stoppages rather than a hard ban on growth. Migration responds to known wages, housing, supplies, and moving costs. Open borders without jobs/housing do not attract unlimited skilled migrants.

Capacity losses attach to affected groups. Factory waste, energy facilities, and competing water use may affect nearby farming and homes. Construction needs land rights, materials, and maintenance; there is no universal city-level output multiplier. Population growth, industrial concentration, and regional dispersion therefore have concrete costs and counterstrategies.

## Authoritative monthly settlement sequence

This eight-stage summary defers detailed read/write boundaries and current-month service dependencies to the [monthly engine](../technical/07-monthly-engine-spec.md).

1. Commit prior environmental changes and current weather/resource baselines. Release prior pending output, effective treaties/institutions, and arriving shipments. Protect effective payables before due transfers and genuinely reserved wage advances. Inspection goods remain quarantined; do not declare default before inspection deadlines.
2. Roll monthly reservations for obligations, optional spending, inventories, and service capacities using received cash and declared priorities. Labor, equipment, and transport cannot be reserved twice.
3. Use opening goods and allocated time. Resolve current energy/other services in dependency order, then production, maintenance, research, education, and public services. New goods wait until next month.
4. Match one-shot orders and standing policies together. Only opening, unused inventory can deliver. Local ownership may transfer immediately; new cross-region shipping takes at least one month. Current production remains pending.
5. Resolve military movement, battles, and losses to still-traveling shipments. Newly captured facilities change requisition/operation authority next month. Stage-1 arrivals completed travel earlier and cannot be retrospectively intercepted; stage-4 departures have not yet been consumed at destination.
6. Settle consumption, net wages, taxes, births, deaths, migration, and skills. Do not repay wage advances twice. Annual age rotation occurs only at its scheduled calendar boundary under [32](32-population-and-education-v1.0.md).
7. Update faction assets/support, cultural propagation, project verification, and institutional effectiveness. Policy changes become executable no earlier than next month.
8. Complete month-due acceptance, payables, arrears, and unused-reservation release; append events and validate state. Month-end income cannot flow backward into finished production. At round end, generate the next observation.

Current war casualties and damage must enter stage-6 population/asset accounts. Stage-3 output already produced remains, while future capacity suffers. Each change has one settlement entry point, preventing double deductions.

## Key invariants

- Duplicate reservations cannot make available inventory or cash negative; arrears are separate liabilities.
- Migration, cultural conversion, and faction changes cannot create/delete people.
- Equipment, research facilities, and economic institutions that do not exist produce no corresponding service or benefit.
- Production, research, military capability, and governance read actual capability, not civilization names, flags, or claimed eras.
- Hazards may be regionally correlated, but effects propagate through damaged inputs and behavior, never a direct random population-halving instruction.
