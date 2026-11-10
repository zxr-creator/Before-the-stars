# 1.0 Monthly Engine, Actors, and Closed Ledgers

This specification defines one world month for implementation and mechanism review, not an omniscient seat manual. It retains the [economy's](../design/02-civilization-systems.md) eight stages and closes their dependencies, without real-time interruption windows or simulation code. Entities/units are in the [state catalog](06-state-variable-catalog.md), knowledge/culture in the [knowledge specification](../design/16-knowledge-and-culture-engine.md). [32](../design/32-population-and-education-v1.0.md) replaces fine population, household, disease, and qualification processing; this document incorporates those changes.

## Time, snapshots, and effectiveness

`SimMonth` is the only authoritative game clock. Age, aggregate birth lag, contract deadlines, training, transport, cultural memory, and victory windows use absolute months. UI eras/rounds cannot replace them. Initialization seals the decision calendar: the standard 1.0 candidate advances 12 months per round, with H=2880/240 rounds. A 960-month/80-round short fixture is for development, not an equivalent ranked match. Technology chronology is explicitly compressed fiction; ages and training do not accelerate to fit eras. Feasibility of primitive-to-FTL within H requires testing. Playback speed, paused UI, and model thinking time change no simulated duration.

Within rounds, sealed policies execute monthly. Organizations use only signed authority and locally received information. Reports/checkpoints may be generated at month-end, but hidden crises cannot wake selected seats early. Formal decisions follow [communication rules](../design/29-diplomacy-communication-v0.8.1.md): simultaneous mutual contact selection, five simultaneous negotiation windows, and planning. Ten combined messages per pair and three counterparts per seat do not reset between windows. Humans, LLM agents, and native AI use the same legal windows/actions. Future emergency responses must be preconfigurable bounded policies, not hidden-information rescue scripts.

Each stage reads its committed opening snapshot, generates intents, arbitrates shared resources, commits changes, then advances. Explicit substage barriers appear below. Unspecified same-stage feedback does not exist. Other worker threads cannot read temporary results early.

| Change | Earliest effect |
| --- | --- |
| Surviving goods produced last month | Current stage 1 inventory release |
| Current new goods, completed construction/repair capacity | Next stage 1; contracts cannot use them early |
| Current power, communications, cooling, compute services | Legal downstream current stage 3; unused services expire |
| Local old inventory purchased in stage 4 | Current stage 6 consumption; never backward into stage 3 production |
| Newly dispatched cargo | Next stage 1 at earliest; longer actual routes take longer |
| Actual stage-1 wage advance | Current purchasing; offset against stage-6 wages |
| Stage-6 wages/taxes or stage-8 acceptance payments | Held after receipt; new production/spot purchases no earlier than next month |
| Stage-6 new skills or stage-7 knowledge/culture/organizational qualification | Next month; no retroactive benefit to completed trials/battles |
| Stage-5 newly occupied operating/requisition authority | Next month; current casualties/damage enter stage 6 |

Ownership may transfer immediately, but owned, arrived, inspected, and usable are separate conditions. Cross-region promises are not local spot goods. Inspection-required arrivals enter custody/quarantine; stage-8 qualification releases them no earlier than next month. Standard spot goods with valid quality credentials and no required reinspection may leave transport custody in stage 1.

## Shared resource and authority ledgers

| Category | Units/accounting | Distinction to preserve |
| --- | --- | --- |
| Goods | Minimum integer `ProductSpec` units; quality, batch, location, property separate | Different purity/precision cannot merge under one resource name; transit, quarantine, pending output have unique locations |
| Cash | Minimum integer currency; available, monthly-reserved, escrow, liabilities separate | Spending is transfer, not automatic social loss; future revenue is not current cash |
| Population | Actual people, annual age-count vectors, joint identity/skills/access/legal status; fractional flow residues separate | Death, capture, migration, conversion cannot each deduct the same people |
| Work/learning | Person-hours/month; qualifications, location, commuting, care, study, service compete | Both teachers and learners consume time; no full-time work plus full-time training |
| Equipment/space | Available machine-hours, bed-months, qualified seat-months, or explicit capacity | Existence does not imply staff, maintenance, or energy |
| Energy/compute | Energy and specified-quality compute service units/month | Installed power is not generated energy; nominal chips are not delivered compute |
| Transport/communication | Edge/timeslot payload, transport work, arrival month | Cargo mass, distance, and capacity are distinct; one route cannot be fully sold twice |
| Rights/evidence | Grantor, object, scope, duration, source | Rights do not create physical capacity; evidence is not repeatedly spendable research currency |

Every resource has location, disposing authority, usable time, specification, and version. Reservations reference actual records or executable current-month service commitments, not merely a sufficient research budget. Players control public assets and institutionally authorized instructions. Private, local, joint-project, and custodial assets do not share one account because they share a map color.

Goods satisfy `closing = opening + lawful current releases/inflows - consumption - outflows - actual losses`, with current production separately pending. Cash transfers sum to zero; issuance requires a separate authorized rule, never negative inventory standing for credit. Population independently reconciles births, direct deaths, other deaths, arrivals, departures, and capture. Services record current commitments, delivery, and expiry without accumulating into universal stock.

Soil, deposits, pollution, and water have physical source/sink accounts. A cash subsidy cannot directly restore them. Extracted quantity, renewable flow, and technological recoverability differ. Recipes declare byproducts/waste destinations. Omitting a physical detail may be an explicit model boundary; providing a costless erasure of modeled pollution is not.

## How actors form monthly intents

Government is not the only operator. The initial model uses population access groups, production organizations, public institutions, religious/other associations, and joint projects with accounts. It does not simulate each person's psychology or individual household optimization. Each actor runs versioned bounded rules using received reports, known quotations, performance history, actual assets, and lawful instructions.

### Production organizations and expected prices

Each month, organizations choose among known lawful continuation, reduced output, stoppage, known recipe changes, maintenance, and approved expansion. Without research authority they do not discover technology automatically; without lawful finance expected profit cannot create cash. Government can instruct public institutions directly. Private choices follow contracts, taxes, demand, and their operating rules.

Expected prices are bounded moving averages of that organization's latest observed actual transactions: old expectation plus a fixed fraction of observed deviation. No transaction creates no sample. Without history, use observed valid quotations and content-defined local initial valuations. Smoothing is sealed content. Demand targets derive from signed orders, observed sales, and bounded inventory targets. Expected arrivals inform plans, not usable input stock.

Expected cash surplus subtracts wages, known material/service prices, transport, taxes, maintenance, and obligations. Risk buffers and fixed changeover costs prevent costless monthly switching on quote noise. Compare a bounded known option set, not referee-global state or future random streams. If no profitable option exists, reduce output, use reserves, seek known markets, or stop; no automatic government bailout.

Standing purchase and sale policies both state known product, location, monthly quantity ceiling, price boundary, reserve stock, cash/transport limit, and expiry. Public/private organizations share generation rules. Seats configure public operating policies through visible templates; private firms cannot receive automatic monthly selling while agents receive only one-shot orders. The [design addendum](../contracts/v0.5-design-addendum.md) specifies sales reserves, standing operation, and machine-contract migration. These are required semantics, not claims of an implemented API.

### Aggregate population time and task allocation

The 1.0 replacement for fine monthly household/job matching follows [32](../design/32-population-and-education-v1.0.md):

1. Determine available time from actual annual age counts, health restrictions, aggregate care obligations, transit, and joint task qualifications. Protect lawful continuing employment/service commitments. Obligations cannot create hours, and coercion records displaced uses.
2. Organizations publish funded task, training, and course demand with qualification, location, compensation, duration, and exit terms. Aggregate identical jobs by real task/employer/terms. Population blocks consider only reachable known options, based on received income/supply, commuting, skill fit, obligations, and practices—not future wages or hidden foreign welfare.
3. Retain a cache of at most three real alternatives per block. Refresh on the scheduled quarterly boundary or once for a material observed change such as closure, displacement, changed wages, or loss of required access. Repeated announcements and renamed offers do not force new random draws or repeated whole-economy choice scans. Current obligations remain checked monthly. Military willingness produces actual available applicants through the same population/time supply, not a second labor pool.
4. Allocate aggregate qualified task groups in a bounded pass over cached alternatives. Each alternative is considered at most once per refresh/allocation cycle. Equal qualification/priority uses proportional people/hours with persistent residues, not thread order or player-created IDs. Joint qualifications remain attached to real people: ten engineers and ninety untrained people never become one hundred fractional engineers.
5. Lock labor, equipment, cash, materials, and services together. Reduce work to recipe-supported minimum batches if another input is short. Released idle hours do not trigger repeated optimization of the entire economy this month. Existing guaranteed wages may remain payable; piece rates, fixed pay, and advance offsets follow actual contracts.

Canonical deduplication uses actual control, facility/task, qualification, location, and identical contractual terms. Splitting one job into many offers or renaming a recipe increases neither exposure, choice weight, capacity, nor residues. Real differences in location, pay, or schedule may remain separate while sharing people/assets. Referee deduplication does not disclose hidden control relationships to groups or seats.

Early nonmonetary communities use known kinship obligations, common food, in-kind exchange, and public-work templates, still consuming time and transferring food. Unformed institutions cannot silently supply wage employment, anonymous credit, or equity distribution. Later institutional changes alter permitted organization, not food/labor/material constraints.

These rules provide a reviewable bounded private-behavior baseline, not perfect long-run household calculation. Preference/expectation errors are fixed content, not rewritten to obstruct leaders. More sophisticated private agents require a shared rules-version change. The old exhaustive monthly ranked-application loop and household stage state are superseded, not additionally executed alongside this mechanism.

## Eight stages and read/write dependencies

| Stage/substage | Main reads | Writes and constraints |
| --- | --- | --- |
| **1a Environment, arrivals, effectiveness** | Prior environmental changes/repair, sealed weather process, pending output, completed goods/people/messages, arrived credentials | Update environmental/resource baseline; release inventory or quarantine; update rights. Apply registry priority including withdrawal; sent is not arrived |
| **1b Due payments and advances** | Cash after 1a, effective certain payables, signed wage advances | Protect payables, then closed-batch transfers in lawful priority; record performance/arrears. Receipts cannot be serially paid again inside 1b, but may fund stage 2 |
| **2a Operating proposals** | Post-stage-1 assets, locally known facts, sealed policies, continuing contracts, bounded choice caches | Produce operation, demand, sales, jobs, service intents without reading opponents' undisclosed plans |
| **2b Reservation and allocation** | Intents, obligation class, department/project limits, conflict graph | Existing obligations before optional spending; common hours/multi-input matching; capped operations, orders, service reservations |
| **3a Service network** | Reserved inputs, opening valid equipment, service DAG | Deliver power, cooling, communications, compute in dependency order; upstream shortage propagates downstream only |
| **3b Production and public work** | Allocated goods/labor and delivered stage-3a services | Consume only actual work inputs; goods pending; maintenance, courses, trials, public services create separate execution/evidence records |
| **4a Spot clearing** | Generated orders, still-disposable local opening stock, reserved cash | Uniform-price cash/property transfer; purchased goods only serve later lawful uses |
| **4b Delivery/new departure** | Matched opening stock, contracts, real paths/capacity | Local delivery or unique transit record; future arrival does not increase destination spot supply |
| **5 Military movement/combat** | Opening valid formations, actual supply, allocated transport/orders | Simultaneous battle/interception; unique pending casualties/damage and next month control; completed production remains |
| **6a Personnel/asset losses** | Stage 5 credentials and other direct losses | Commit direct deaths, capture, damage first; pending output can be destroyed at its actual site, without rededucting consumed inputs |
| **6b Consumption/demography/learning** | Survivors, access-pool stocks, actual3 services, wage advances, 4 deliveries | Allocate actual consumption; combined mortality, delayed aggregate births, care, migration, learning; annual age rotation only at scheduled boundary |
| **6c Wages and taxes** | Actual work, advance receipts, tax templates, reserved funds | Pay net wages, collect actual taxes, record arrears; no duplicate advance payment/tax |
| **7 Organizations, culture, verification** | Completed behavior, actually known evidence, participants, surviving population | Update support, spread, practices, knowledge/project qualifications; schedule effects next month; preserve history/duties; scheduled credential reviews and local-lineage culture update once |
| **8a Acceptance/contracts** | Arrived evidence, stage 7 verification, clauses, absolute deadlines | Batch acceptance, payment, dispute/cure, deadlines; transfer only executable authorized custody |
| **8b Close, audit, projection** | Closed ledgers and actual current-month capability records | Release ordinary unused reservations, retain escrow/debt; check conservation, windows, terminal state; append events, hashes, reports |

New stage-7 qualifications cannot retroactively authorize work performed without them. This month's graduate cannot satisfy this month's researcher requirement. A stage-3 trial performed by an already-qualified team may produce evidence verified in 7 and accepted in 8. FTL/governance windows use capability actually valid and operating this month, not a newly unlocked month-end capability counted as a whole month's service.

At P8b, score only original seats whose `scoring_status` is active (`EligibleWinner`); separately require actual highest control and every victory window. Voluntary forfeiture permanently fixes that seat at −1; a caretaker may continue its society but cannot later win for it. Such achievements are diagnostics only. At an inclusive month T≤H, check eligible complete victory before horizon failure. If no original seat remains active, terminate without a winner instead of allowing a caretaker to finish a scored victory. Model/controller replacement that does not surrender the original seat is not itself forfeiture.

Stage 1a first commits prior environmental additions/losses/damage/completed restoration, then generates current weather, water, and hazard baselines from sealed geography/random processes. Stages2–3 use these capacities. Record extraction, emissions, and environmental losses once. Cross-region/watershed spillovers enter next month's baseline, without current-month recursive propagation. Explicit instantaneous hazards deduct at their designated stage, not again in next month's environment update. Actual weather is not broadcast omnisciently; observation/reports still travel.

Concurrent transactions arbitrate through real rights/resource conflicts. Canonical ordering cannot reveal uncommitted outcomes early. Due contracts do not automatically seize every private subsistence resource. Executable collateral, labor duties, debt, and taxes obey existing institutional templates; without one, the engine cannot improvise who deserves priority.

Stage 2 uses a conservative finite multi-input process. First reserve each entity's cash/owned goods by authority and priority; then match aggregate job capacity and existing external service/equipment commitments; finally reduce each operation to the minimum batch count supported by all allocated inputs. Service reservations are ceilings, with delivery verified in 3. Released inputs do not restart demand growth across all actors. Unused cash remains reserved until8; idle hours/machine slots do not trigger another hiring round. Unconsumed goods retain ownership and may serve later stages only under already-authorized sales/consumption rules.

The baseline allows one month of coordination-induced idleness instead of solving a circular global optimum. Next month, organizations adjust from actual gaps/reports. Future bounded reallocation must specify pass count, read/write boundaries, and equivalent replay as a rules-version change. Machine speed or remaining wall time cannot determine extra coordination passes.

## Energy, compute, and industrial cycles

Next-month inventory timing applies to goods, while power, communications, cooling, and compute are current services. Delaying every service would store electricity without storage, stockpile compute, or prevent industry from starting. Stage 3 therefore consumes current delivered upstream services through a sealed dependency graph, without arbitrary production/sale loops.

Every service recipe declares startup goods, sustaining inputs, upstream services, internal consumption, maximum delivery, and minimum divisible batch. Execute nodes topologically and independent nodes in parallel. Delivered quantity is the minimum jointly supported by materials, equipment, people, and delivered upstream services. Within declared priorities, downstream reservations receive proportional allocation. Missing service reduces actual work and is reported as undelivered.

When a power plant needs pumps/cooling that themselves need power, content must specify one valid startup structure:

- Actual opening batteries, stored water, or mechanical startup equipment break a cycle. Deduct stored energy first; expected current generation cannot retroactively fund startup.
- A verified composite physical facility includes pumps, cooling, and parasitic loads internally and outputs net service. Only content-defined physical structures qualify; players cannot rename arbitrary loops into composites to erase costs.

A cycle without startup cannot iteratively converge into free capacity. Invalid topology is a content-validation error; missing runtime startup goods is ordinary shutdown. Actual storage, line capacity, and disconnected grid islands matter; power in one place does not supply another's data center automatically.

Upstream shortage propagates once down the graph, never backward into already-executed nodes. Consume variable materials only for operating batches. Already-generated unused power, guaranteed staff time, and signed minimum purchases still incur costs. Unused timeslots expire without becoming research points. Current repairs consume inputs; routine maintenance improvement/depreciation affects next month. Opening faults and explicit current damage settle separately; repair cannot repeatedly generate extra current machine-hours.

Long industrial cycles connect across inventory months: ore → next-month smelting → next-month tools → later mining improvement. Markets cannot pass one iron unit through three factories for three manufacturing steps in one month. Initial food/maintenance reserves must bridge minimum production/transport cycles, and every legal service chain needs a declared startup path. These are viable initial conditions, not free continuing support.

## Budgets, wage advances, and payment priorities

Budgets authorize spending. Maximum research/education/defense settings do not mean funds were spent. Stage 2 reserves actual executable monthly demand within limits. Empty allocations without teachers, equipment, or lawful activity debit nothing. Department ceilings contain project sublimits; adding them does not expand treasury cash.

First isolate explicitly secured assets under existing rights. Remaining cash serves effective due obligations before optional spending by declared department/project priority. Equal-priority due debt follows maturity order, proportional claim amounts at equal dates, and persistent residues. Legal precedence changes this only under an actually existing, knowable institution. A player's equal-priority own projects use declared batch order; interparty competition follows markets, not request-arrival-based national priority.

Failed wage, maintenance, or purchasing reservations do not borrow automatically from opponents, private entities, escrow, or future taxes. Divisible projects shrink; indivisible minimum batches queue. Old debts remain separate, without negative-cash purchasing. Ordinary unused reservations release in 8; pending-signature/escrow assets release through [contract rules](../design/14-contract-resolution.md), not automatic month-end refunds.

Before 1b transfers, arbitrate protected amounts for effective certain current payables; stage 2 inherits this. Optional advances, including newly introduced or accelerated wages, cannot bypass existing claims. Mandatory prior advances follow actual institutional ranking. Signing checks budget authority; actual payment counts as departmental expense, not another month-end debit or renewed same-sized allowance. Lowering a budget does not erase old obligations.

Food purchasing in 4 precedes wages in 6, creating initial liquidity constraints that cannot be solved by moving wages backward into a finished market:

1. Initial access pools/common granaries hold food or spendable money spanning the actual payment cycle. National food sufficiency alone is insufficient without residents' rights to obtain it.
2. Lawful wage templates may prespecify stage 1 advances. Employers must actually hold and transfer cash/rations. The advance is part of current compensation, not invented credit; public/private employers use the same template.
3. Stage 6 calculates earned totals from actual work/contracts, offsets advances, and pays only balances. Unearned amounts after absence, departure, or death become contractual claims or employer losses, never both recipient income and a duplicate employer refund.
4. Without an advance, shortages may be met by actual relief, granary release, available savings, or separately authorized finance. Unestablished banking cannot silently grant unlimited household working credit.

Stage 1b uses opening cash in one simultaneous transfer batch. Its receipts may fund stage 2, but cannot circulate indefinitely within 1b. Received wage advances can fund stage 4. Stage 6/8 income cannot rewrite stage 2's allocation; next month recalculates real balances. Payment cycles become a visible planning problem rather than a hidden fatal initialization trap.

## Consistency of trade, transport, and war

Spot markets clear arrived disposable local inventory only. Future delivery uses dated, routed, custodial, inspectable `goods_delivery` obligations and does not share current spot pricing. Generated standing orders reserve actual stock/cash. Self-trading nets by actual controller and creates no false volume, tax base, or demand. Order-splitting residues aggregate by actual control lineage.

Routes consume actual edge capacity monthly. Civilian freight, migration, military movement, and supplies cannot each use the whole route. Existing carrier duties and emergency requisition produce institutionally defined costs, defaults, or delays—not free universal military precedence. Rerouting changes only untraveled segments; return journeys take real time.

Stage 1 arrivals completed prior travel and its risks. After consumption, they cannot retrospectively be stolen by a claimed prior ambush. Stage 4 departures may meet stage 5 interceptors with actual current route contact; stage 6 uniquely commits loss, capture, and surviving transit. Intact completed travel arrives no earlier than next month. Local stage 5 war may damage remaining inventory/pending output, but cannot reverse stage 3 inputs already consumed.

Occupation separately handles private property, local knowledge, and people. Winning a capital battle does not grant all current production income. Nextmonth's operations depend on actual control, law, takeover, and organization. Shared frontline supplies, one contact battle/person/month, and casualty/capture rules follow the war specification.

## Knowledge, culture, population, and political interfaces

The complete technology/culture graphs, dependencies, and discovery entries are fixed per content version. Generation binds environment and checks routes/startup; the engine does not alter difficulty to target leaders. Stage 3 trials generate sourced samples/measurements; stage 7 uses the [knowledge state machine](../design/16-knowledge-and-culture-engine.md); stage 8 may settle payment, while new recipes/qualifications start next month. Dissemination requires actual documents, teaching, language, communication, and rights. A license signature is not adoption.

The culture graph contains practices that can be encountered/tried. Population cultural profiles represent actual behavior and slow learning; they are not one national culture-XP bar. Stage 7 reads only events, interpretations, and participation actually encountered by that group. Rolling drift, generational transmission, and sustained-adoption rules update the local lineage, which is referenced by its skill/access blocks rather than recalculated per block. Effects begin next month. Geography, technology, religion, and war act through contacts, income, obligations, safety, and practice, without another synonymous global multiplier.

There is no religion initially. Movements, pantheons, sites/founder training, and formal founding require actual organizational work. Doctrine freezes after founding; members, wealth, and participation keep changing. Newborns, migrants, prisoners, converts, and practice adopters all share one population ledger. State registration and actual participation are different counts.

Stage 6 follows [32](../design/32-population-and-education-v1.0.md): uniquely subtract direct battle deaths, combine other hazards on survivors, resolve delayed aggregate births and actual care, then population flows and learning. Annual age vectors rotate only at their scheduled boundary, with conservative eligibility preventing early adulthood. The nine-month birth-intensity history is neither an individual pregnancy queue nor a stock of extra people. Local bounded health pressure replaces multiple disease compartments. Only active classes consume allocated teacher/student hours; new learning cannot add the same full-time learner back into current labor. Scheduled qualification events replace monthly decay on every old certificate. Migrants cannot produce at origin and destination while traveling. Culture cannot instantly create health, skills, or reproductive capacity.

Faction assets, memberships, performance, and population access changes update support/executable organizational capacity in 7. Opinion/fear may move quickly while durable norms move slowly. Political orders require actual lawful/coercive execution. A month-end new law cannot retroactively cancel already-collected taxes or performed contracts under old law.

Existing-charter institutional motions use bounded `set_policy` templates. Launching a known motion specifies its authorized template and allowed option within already delegated jurisdiction; voting references a known `proposal_ref` with support/oppose/abstain. Record `charter_ref`, `proposal_ref`, `template_ref`, `allowed_option_ref`, `electorate_snapshot_ref`, `threshold_rule_ref`, `voting_deadline_month`, `activation_notice_month`, `vote_revision_rule`, and `delivered_vote_records`. Only votes actually received by the authorized institutional registry by the deadline count. Apply the old charter's threshold and the motion's frozen electorate; later membership changes cannot rewrite that vote. Publish actual arrival/effect notices, with no arbitrary free text. New sovereign obligations or changes outside existing delegated authority still require formal proposal/signature procedures. Protected institutional voting is not an extra diplomatic chat channel.

## Intent, StateDelta, and deterministic multicore execution

Every intent specifies logical stage/substage, actual actor/control lineage, its knowledge version, authority, read versions, resource keys and ceilings, permitted scaling, expected outputs, failure-feedback category, and stable logical key. Unknown facts cannot enter behavioral intent. The referee still checks actual feasibility; feedback reveals only authorized evidence.

Conflict edges connect shared cash, goods batches, population time, equipment slots, service nodes, and transport edges. Independent components run in parallel; connected ones use explicit allocation rules. `StateDelta` carries precondition version, consumption/transfer/creation details, effective month, and unique commit identity. Version mismatch is an engine error or normatively recomputed conflict, not something to ignore for speed.

Each stage executes freeze inputs → parallel intents → shared-resource arbitration → ledger validation → batch commit → stable event merge. One large grid or treasury may connect regions; multicore partitioning cannot copy its account for independent spending. Independent intrastage calculations parallelize; months cannot cross causal dependencies in parallel.

All authoritative quantities use bounded integer/fixed-point arithmetic with explicit floor, largest-remainder, and overflow rules. Residues belong to actual processes and migrate with population/asset lineages. Splitting armies, orders, or population blocks cannot collect residues repeatedly. Random addresses bind real process, absolute month, and paid actual trial; command/thread/new-project IDs provide no fresh lottery.

Replay keys include rule/content versions, generation commitments, sealed commands, persistent state, and random secrets. Public replay includes only authorized seat projections, not generator secrets. Private stage hashes diagnose referee state; public observations have separate hashes/revisions. Hidden changes cannot leak through public version numbers, diff lengths, or errors.

Runs with 1,2,4, and maximum available threads must produce identical stage hashes, allocations, and outcomes. GPU/NPU do not alter authoritative1.0 settlement. Rendering, nonauthoritative analysis, and optional model inference cannot write inventory, culture, or victory state. CPU speedups/month throughput require prototype measurement; no achieved performance is claimed. Population cost tracks live sparse blocks, 81 compact age counts, active classes, task groups, and actual events rather than individual headcount; [32](../design/32-population-and-education-v1.0.md) defines the measurement plan and soft object budgets.

## Panels, event differences, and fast feedback

Every actual process produces an internal audit event and permission-filtered report candidates. Reports carry occurrence/receipt month, source, scope, unit, and uncertainty. Logging cannot disclose hidden knowledge. Chronicles summarize events without creating facts. Sort internal events by stable logical keys; diff pagination binds one observation snapshot.

Panels distinguish assets/reservations, flows/stocks, delivered/expected arrivals, budget permission/actual spending, nominal/available/used capacity, measurement/survey, and currently valid/month-end newly earned qualification. Shortage/failure reports list observable demand, delivery, waiting, and actual loss. “Planned 100 learners; teachers support 60; 60 enrolled; 40 waiting” may be exact. “Hidden religious threshold short by 0.03” is forbidden.

Cache monthly accounts and generate economy, population, military, research projections from the same committed state. Opening different panels cannot run different simulations. Round-end agents/humans share summaries, changes, and queryable detail with identical permissions. Monthly standing-policy records locate when work stopped, money was reserved, or transport failed, without waiting for terminal feedback.

RL may record monthly progress/cost, while online actors receive no extra feedback from omniscient private metrics, hidden goals, or unarrived intelligence. Formal reward follows [complete victory time](../design/15-victory-and-ftl.md); dense training diagnostics are separate. Faster wall-clock rollout comes from parallelism, shared snapshots, and bulk reads, not reducing education, culture, governance, or industrial time to one action.

## Paper acceptance cases and remaining content freeze

These are normative accounting counterexamples, not complete match experiments:

| Case | Required outcome/exploit closed |
| --- | --- |
| Recipient starts without cash; employer has 10c, agrees a 4c advance, and owes 10c for actual work | Stage 1transfers4; 4 may spend received cash; 6 pays only 6 more. No social money creation. If employer held only 4, remaining6 is arrears, not a loan against future sales |
| Opening10 ore, smelting consumes10 to produce5 metal | Metal remains pending; another factory cannot consume it this month. Tools may be manufactured next month, without same-month circular output |
| Power supplies100 net service; cooling/communications need20, compute50, others50 | Total demand120; declared priority allocation never delivers more than100. Compute follows actually assigned and executed services |
| Ship departs this month toward demand and is intercepted en route | Destination's current supply stays unchanged; deduct transit loss once, without both destination consumption and a fictional full-cash replacement |
| Teachers qualify 10 technicians this month while a new factory plans to use them now | Factory uses opening-qualified people only; graduates may apply next month. Learning/work cannot each consume full hours |
| Joint trial completes independently acceptable work while another experiment fails | Stage 7 creates separate evidence, 8 accepts/pays by clause; learning persists; failure is neither automatic default nor free retry |
| Current battle captures capital and final new FTL qualification completes | Actual casualties settle now; operating rights/new qualification begin next month. Missing sustained global governance/military acceptance prevents early victory |

Time, authority, accounts, and allocation semantics are fixed here. Content still must freeze actual goods/service recipes and units, initial inventories/payment cycles, bounded aggregate choice/birth-response parameters, lawful work/wage/debt templates, transport/inspection, complete fixed graphs and local discovery/adoption, age/health tables, and acceptance thresholds. Missing tables do not permit claims of a computable complete match or arbitrary zero/full-pass defaults.

Content validation rejects service cycles without startup, initial supplies unable to bridge production cycles, mandatory knowledge without any viable qualified-teacher/instrument origin, infinite value loops, duplicate people, unauthorized automatic taxation, unarrived spot trades, and primitive subsistence requiring an undeveloped later institution. A viable world does not guarantee every strategy succeeds; bad choices may still cause actual famine, stagnation, or defeat.
