# 1.0: A Smaller Population Model with Meaningful Education

> **2026-11-13 design precedence:** this chapter retains historical rules where it
> describes global-integration/fleet-wide victory, mandatory manual courses, or
> native access to unrevealed victory ancestry. For the next ruleset use
> [42: playability](42-ftl-completion-and-playability.md),
> [15: FTL completion](15-victory-and-ftl.md),
> [43: agent access](43-agent-access-and-decision-packets.md), and
> [44: institutional education](44-institutional-education.md). These are design
> changes awaiting implementation, not modifications to existing saves. Other
> nonconflicting rules and the later ruleset-3 calendar remain applicable.

This document replaces the population implementation choices in [12](12-population-and-development.md), the household/job matching detail in [07](../technical/07-monthly-engine-spec.md), and continuous per-qualification readiness decay in [19](19-education-and-transmission-v0.6.md). Their resource conservation, delayed learning, unequal access, cultural diversity, and historical cautions remain valid. It is a design specification, not implemented simulation or measured performance.

The purpose of population is to constrain food, labor, learning, military organization, and social change. Version 1.0 does not simulate marriages, individual households, individual pregnancies, genealogies, or every person's employment decision. A society can grow, reach a plateau, suffer a crisis, recover, or age without a different script for each outcome.

## 1. What is retained, aggregated, or removed

| Previous detail | 1.0 decision | Consequence |
| --- | --- | --- |
| Birth year plus birth-month distribution | Keep a compact annual birth-cohort histogram; remove birth months | Childhood remains real elapsed time, with at most one year of explicitly conservative age-boundary precision |
| Household formation, marriage, parity, lifetime births, surviving children | Remove as independent simulation objects and dimensions | The model cannot explain household-specific reproductive histories; it keeps aggregate family formation and care constraints |
| Named pregnancy, recovery, and exposure locks | Replace with aggregate birth intensity and nine months of lagged conditions | No individual reproductive accounting; policy does not produce an immediate birth or worker |
| Household income and food access for every family | Pool by settlement and a small number of actual access classes | Preserve shortage among low-access residents without a household-by-household market |
| Multiple disease-specific susceptible/infected/recovered distributions | Replace with a bounded local health-pressure state and care demand | Keep exposure, crowding, care, and mortality consequences; do not claim pathogen-level epidemiology |
| Monthly choice among every individual job | Aggregate offers by real task/qualification and update a small cached sector choice set | Preserve pay, opportunity cost, recruitment, and cultural participation without a population-size matching loop |
| Continuous readiness for every person's every qualification | Use qualification lots and event-driven authorization states | An unused specialist eventually needs review; no monthly decay loop over an unlimited certificate list |
| Cultural/religious identity averaged nationally | Retain joint identity in sparse population blocks | A literate minority or a religious service restriction cannot be applied to everybody |
| Separate school, army, and civilian headcounts | Keep one population ledger with explicit assignment claims | Training, mobilization, migration, and captivity never create people |
| Individual consumption preferences and household finance portfolios | Omit in 1.0 | Material demand uses versioned group baskets, actual income/access, and institutional obligations |

The discarded details are deliberate limits, not data secretly retained under another field name. They may be added in a later research mode only if they change useful decisions enough to justify their cost.

## 2. Authoritative population blocks

Population is a sparse collection of disjoint blocks. A block represents people who share the properties needed for the current decisions; it is not a single person or a national average. Its grouping key is:

`settlement/location × cultural lineage × religion × access class × qualification bundle × legal/service status`.

Only combinations that actually exist are stored. The engine never allocates the Cartesian product of every possible culture, religion, age, occupation, course, and health condition.

| Record | Minimal authoritative content |
| --- | --- |
| PopulationBlock | Stable source lineage, grouping key, age counts, actual location, count-based obligations, rounding residues |
| AgeCounts | 81 unsigned count cells indexed by birth-year offset 0–79, plus an 80+ offset tail; no individual IDs or birth-month cells |
| AccessPool | Settlement and actual household-access class; pooled received food, housing access, income/in-kind entitlements, care supply, nutrition debt, and security history |
| QualificationBundle | Joint L/N/R foundation levels and actual language/method scope; a principal occupational family and at most two currently maintained secondary occupational families |
| QualificationArchive | Previously demonstrated task scopes and evidence; dormant history, not additional live labor capacity |
| AssignmentClaim | Source population block, real count/time, task, period, location, and exclusive or shared-time constraints |
| TrainingBatch | Actual learners and source shares, one course/task scope, accumulated effective months, instructors, equipment, and verification state |
| MovementBatch | Source counts and age/identity/qualification composition, physical route, arrival requirements, and outstanding obligations |
| LocalHealthState | Current bounded exposure pressure, care capacity, a reference to the single access-pool nutrition debt, and actual wounded/restricted groups |

Three access classes are sufficient for the first content pack: precarious access, regular earned/in-kind access, and asset-supported access. These are actual resource arrangements, not cultural traits or permanent castes. Movement between them needs changed income, ownership, support, or obligations. Being moved to a different statistical class does not issue food or money. The exact baskets and access transitions belong to the fixed content pack.

Age is a vector inside a block rather than another layer of household objects. Army, migration, and training records reference or transfer its existing counts. Block totals, cultural shares, religious shares, education coverage, and the three UI age summaries are derived from that one source.

## 3. Why keep annual ages internally

The UI uses children, working-age residents, and older residents. Internally, 81 integer cells are cheaper and less error-prone than household and pregnancy objects. They preserve delayed entry into the workforce and the later consequences of a birth boom. A three-bin model with a fixed monthly outflow from each bin can incorrectly allow part of a newborn cohort to become an adult soon after birth.

Age-cohort rotation occurs at the fixed annual boundary, not every simulated month. Births enter the current birth-year cohort. An index is a calendar birth-year offset, not a claim that everybody has reached that exact birthday. For example, a child born near the end of year Y moves to offset 1 at the next annual boundary but is still below age one. Eligibility is computed from the latest possible birth month of year Y and the current absolute month; it is never inferred from the offset alone. The 80+ tail is an explicitly coarse oldest cohort for age hazards and cannot supply minimum-age exceptions. Any minimum-age qualification uses the youngest possible age in that cohort, so rounding never authorizes an underage worker or recruit. This can delay eligibility by less than one year; the approximation is common to all seats and is stated in the scenario. The first content pack uses 15 as the minimum for the general adult labor pool and 18 for military recruitment; these are gameplay boundaries, not claims about every historical society. Younger residents can participate in explicitly scoped learning and household support, but cannot supply full adult jobs.

Monthly consumption and mortality can use the compact vector and cached age summaries. The annual histogram does not accelerate aging to fit a technology era. The standard scenario uses 12 simulation months per decision round and a candidate horizon of 2,880 months; the compressed technology chronology must be tested against that horizon. A 48-month course still takes 48 effective months, and new births do not solve a current labor shortage.

Annual age cells are an intentionally retained cheap detail. Five-year cells can be considered later, but only with evidence that birth waves, retirement, age qualification, and small-cohort recruitment remain correct. Replacing 81 count cells with an elaborate age-progress object per person would defeat the simplification.

## 4. Sparse identity and capability, without false averages

A block's qualification bundle is a joint record. Ten literate engineers and ninety untrained residents do not become one hundred people with ten percent engineering skill. A task may use only actual people whose demonstrated bundle satisfies it. L/N/R and occupational tags cannot be reconstructed by multiplying independent national percentages.

At most three occupational families are maintained as current active skills per bundle. This bounds ordinary matching, while preserving previous qualifications in an archive. Re-entering an archived profession uses its recorded experience and an actual review or bridging task; it does not require repeating all original education, and it does not restore authority for free. Foundation L/N/R methods are not three extra occupations. A new course must specify which professional task it develops and which existing active practice is displaced if the bundle is full.

Culture and religion remain jointly attached to real people. Culture axes are updated at the local lineage level and referenced by the blocks; they are not recomputed independently for every occupational subdivision. Religion remains absent at the start and fixed in its core definition after founding. Membership, institutions, participation, and service obligations can change. Neither identity directly multiplies national productivity, births, or combat strength.

Blocks may merge only when their current identity, access, task qualifications, legal status, and relevant transition state are equivalent. Age vectors and conserved stocks add; genuine differences must remain represented. In-progress classes and special restrictions stay as explicit claims until they end. Historical events can be archived, but archive compaction must preserve current rights, sources, and the sufficient statistics used by future rules.

The engine targets 64–128 live blocks per inhabited node in ordinary 1.0 scenarios and profiles a 256-block-per-node stress case. These are engineering workload targets, not a rule that deletes the 129th minority or denies immigration. If the target is exceeded, retain the actual distinctions, report a developer performance regression, and improve the content or aggregation. Do not silently merge incompatible people merely to meet a speed claim.

## 5. Births with bounded aggregate lag

Version 1.0 computes a cohort birth flow, not individual fertility choices. For each relevant local identity/access pool, derive reproductive-age equivalents from the live age distribution and a versioned age-weight table. The weights include the content pack's aggregate reproductive share; there is no sex-by-marriage-by-parity cross-product. This deliberately does not model sex-selective loss, infertility, or individual pregnancy outcomes.

The pool maintains a bounded family-formation intensity from four sources:

1. household and cultural expectations about forming and supporting a family;
2. housing, real disposable/in-kind support, and economic security;
3. actual care supply and the labor time needed for dependents;
4. knowledge and access to family-planning services, where that content is known and supplied.

These are private response functions, not public sliders. Store the resulting intensity for the last nine months. A simplified monthly live-birth flow is:

`births = reproductive_age_equivalents_now × versioned_base_rate × intensity_from_nine_months_ago × current_live_birth_health_factor`.

All factors are bounded and have explicit fixed-point units. The base-rate ceiling is fixed in the content pack; it is not inferred from a civilization name. The current health factor represents aggregate failure to reach a live birth and is never added to the deaths of already-living residents. Newborns enter the population ledger once, with real food and care demand. Ordinary mortality starts on the following month; the birth event already includes its own live-birth outcome.

The nine-value history is a delayed aggregate condition record, not a list of pregnancies or nine new stores of population. No pregnancy/recovery locks, parity states, or individual exposure objects are maintained. Migration carries the relevant source history with its actual population shares; a move, split, or renamed pool cannot initialize a new favorable history. Histories with different lagged intensities remain separate referenced history lots until their nine-month difference expires, preserving the associated age composition. Merging is allowed only when future birth calculations remain equivalent; averaging all residents across young/high-intensity and old/low-intensity pools is not equivalent. History lots are shared aggregate records, never individual pregnancies, and are garbage-collected after their last relevant lag expires. At world initialization, history is explicitly supplied by the scenario's prehistory rather than invented through nine free months of growth.

Birth counts use one source-based fixed-point remainder. Splitting a pool cannot round the same expected birth upward repeatedly. Changing current care policy can affect future birth intensity and current health, but cannot instantly create children, and no policy awards population points. Coarser fertility is a conscious approximation: it preserves age structure, economic constraints, social lag, and care costs while giving up household-level reproductive narratives.

## 6. Food, health, crises, and low fertility

There is no national fixed carrying-capacity number or permanent population growth percentage. Land, water, equipment, inputs, transport, and labor determine food supply. Real entitlements, received wages/in-kind support, market access, and relief determine which access pools receive it. A wealthy city's average surplus cannot erase hunger in a low-access pool.

Keep one nutrition-debt stock per materially distinct access/health pool. The existing equation still applies: add unmet current nutrition, then subtract only actual excess intake within physiological/care recovery capacity. Food is consumed once. Debt is a health burden, not tradable material or stored life points.

Direct war deaths are committed first. Remaining residents receive one combined mortality calculation from age, nutrition debt, bounded local health pressure, and environmental conditions. Cause labels partition the resulting deaths; they are not separately applied deaths. Wounded personnel and medically restricted groups remain explicit because recovery, captivity, and mobilization depend on them. There is no automatic extra percentage of national war deaths.

Local health pressure changes through actual population contacts, crowding, water/sanitation, care, and versioned bounded shocks. Version 1.0 stores no per-pathogen S/I/R vectors. It therefore represents outbreaks and health-system stress, not specific infectious-disease dynamics. A model must not infer pathogen-level conclusions from its output. No-contact regions do not receive a hidden cultural contagion multiplier.

The same limited mechanisms can produce a crisis feedback: poor deliveries reduce health and available work; lost work and revenue reduce maintenance and care; those failures worsen deliveries. Reserves, access to imports, lower extraction, repairs, local delegation, and peace may interrupt the cycle. Population loss does not automatically rebuild irrigation, restore skills, or erase debt.

Low fertility can occur without hunger or war. Better survival can coexist with smaller reproductive cohorts, delayed family formation, expensive housing, long education, demanding care standards, or preferences formed through experience. Care and housing policies can improve actual feasibility, but do not guarantee an immediate preference change or enough births to offset aging. Automation, skill improvement, and trade can raise capacity while population is flat. Immigration moves real people and skills from elsewhere; it is not global population creation.

## 7. Labor allocation at the scale of tasks

The engine does not ask each household to rank every job every month. It aggregates funded offers into local task/qualification groups and caches a small set of known alternatives per population block. Useful broad sectors are food, extraction, manufacturing, transport, public/care services, education/research, and military service; actual jobs retain their required skill, employer rights, pay, location, and equipment.

1. Protect existing real obligations and count-based assignments first: service, care, schooling, contracts, and transit. They all draw from the same time budget.
2. For uncommitted labor, use only locally known opportunities. Recompute participation/sector preferences at the fixed quarterly boundary or once when a material observed change makes the cache dirty. A repeated announcement or renamed offer does not create a new preference update.
3. Keep at most three distinct alternatives for each matching block in that update. This is a bounded behavior approximation for residents, not a limit on the player comparing policies or on the world's full job catalog.
4. Match actual qualified supply to funded demand through a deterministic bounded allocation pass. Equivalent offers share capacity and rounding; no per-person proposal loop and no repeated within-month global optimization.
5. Allocate accepted group time to real employers and facilities, then apply the existing shared material/equipment/service constraints. Unused time from a failed downstream job does not become an extra person or trigger infinite rematching.

Different cultural experiences, religious obligations, livelihoods, and known treatment can change participation and preferred jobs. They do so at the group decision step. Skill then controls which actual tasks are possible, and supply controls which tasks run. Do not multiply those outcomes again by a cultural productivity factor.

Military recruitment uses the same available people and a cached participation choice between continuing work, combat service, support service, and permitted exit. The existing minimum training, equipment, command, and supply requirements remain. A general adult population count is never combat power. Repeated recruiting projects cannot multiply the willing pool, and the current monthly war purpose or pay report cannot read hidden enemy strength.

## 8. Education remains a real investment

The [24 course templates](19-education-and-transmission-v0.6.md) remain the content vocabulary. Their actual knowledge, teacher, student-time, equipment, material, and minimum effective-month requirements are preserved. Courses operate on real training batches rather than individual student objects. Only active classes and assignments are evaluated monthly.

| Authorization state | Meaning | Transition |
| --- | --- | --- |
| Current | The task qualification has valid supporting evidence and required recent practice/review | May perform the specified work within real time and equipment capacity |
| Review due | The content-defined inactivity or safety-review deadline has passed | Requires a relevant check; the historic qualification remains known |
| Supervised | A known subset of work can be done under actual qualified supervision | Supervisors and learners both consume their own available hours |
| Restoring | A defined review/bridge course is in progress | Completion and required independent task results restore the specific scope next month |
| Dormant | An archived professional family is not currently maintained | Can be reactivated through its actual evidence and missing-task review, never by a label change |

This replaces per-person continuous readiness values and monthly decay arithmetic. Normal L/N literacy history does not evaporate during a routine closure. Occupational inactivity and safety review use scheduled deadlines; current practice records can renew only the specific tasks actually performed. New content may require more frequent review for a dangerous task, but not a universal annual exam for all citizens.

The course throughput still takes the minimum supported by instructors, learner time, rooms, real practice, and materials. A cohort does not graduate merely because it paid tuition. Full-time study removes the corresponding labor time; part-time study uses only its assigned hours. New qualifications become usable next month. A source lot cannot supply a full-time army and a full-time engineering class at once.

Original research still creates first teachers through verified work and independent replication. The first prototype does not require graduates of a course that can only exist after that prototype. Teachers may continue research, but their hours are shared. Training software and AI can improve a specific validated teaching task only with actual hardware, inference, supervision, and practice; they do not bypass unknown content or create universal expertise.

Culture and religion affect access to education, participation, occupational prestige, and institutional permission. Economy supplies teachers, books/devices, food, and time away from work. Consequently an early society can sustain excellent craft specialists while lacking mass literacy or modern scientific training. The fixed full graph remains unchanged; each civilization's actual institutions determine what it can currently teach and adopt.

## 9. Update schedule and cost model

| Frequency | Work |
| --- | --- |
| Every simulation month | Actual food and care, single-source labor/time reservations, active courses, health and mortality, birth flow, actual migration, military losses, contract and population conservation |
| Quarterly or a bounded material-change event | Cached local labor participation/options and population planning summaries |
| Fixed annual boundary | Age histogram rotation, slow structural reports, consolidation of equivalent inactive blocks |
| On actual event/deadline | Graduation, professional review, reactivation, culture/practice membership changes, religion membership, legal-status transfer, birth-history migration |
| Archive/query only | Old certificates, closed classes, historical household-free narratives, inactive event details; not monthly live simulation |

For `B` live population blocks, `A=81` age cells, `K` active classes, `J` funded task groups, and `E` local/movement edges, the intended demographic workload is approximately `O(A×B + K + J + E)` per month with at most three cached labor alternatives per block. It does not scale with the number of individual residents or enumerate every pair of residents and jobs. Dependent stages remain ordered; independent settlement work uses the mandatory CPU task pool.

At 48 inhabited nodes and 64–128 blocks per node, age counts occupy 248,832–497,664 integer cells, approximately 1.9–3.8 MiB at eight bytes per cell before other records. The 256-block stress case uses 995,328 cells, approximately 7.6 MiB. These are representation calculations, not execution benchmarks. The previous formulation additionally coupled birth months, family stages, parity, pregnancy/recovery, disease distributions, and monthly job choices; the actual reduction must be measured against a faithful baseline rather than claimed from those dimensions' theoretical product.

Benchmark population-only and full-month workloads separately at 24/48 nodes, mixed cultures and religions, active wars, mass migration, and all education paths. Report block counts, active classes, events, allocation passes, memory, and p50/p95 wall time on the supported Mac and server CPU. Scale total population by 10 and 100 while retaining the same represented composition: runtime should mostly follow blocks/tasks, not headcount. Increasing real diversity is a separate workload and must not be hidden by a population-scaling headline. No GPU or NPU is required for these bookkeeping rules.

## 10. Small reproducible design cases

**Agrarian plateau.** A population of 10,000 with 300 births, 280 deaths, and zero net migration ends a year at 10,020. If improved supply and care reduce deaths to 220 for the same interval, it ends at 10,080. Neither case licenses a permanent fixed growth rate; subsequent actual food, age structure, and conditions determine later flows.

**Crisis versus missing records.** Begin with 10,000; record 180 births, 100 direct war deaths, 500 other deaths, 700 departures, and 20 arrivals. End population is 8,900. Actual deaths are 600, while the local decline is 1,100. A registry covering 75% may report 6,675. The missing registry count is not another 2,225 deaths. Departed people remain at their route or destination, and displaced-person obligations remain attached to the actual history.

**Low births without scarcity.** Begin with 100,000; 700 live births, 900 deaths, and net immigration of 50 give 99,850. As a separate monthly birth-flow illustration, 2,000 reproductive equivalents, base rate 0.01, lagged intensity 0.25, and current live-birth health factor 0.98 produce 4.9 expected live births. The source remainder determines the integer result. Improving intensity to 0.35 changes the corresponding later flow to 6.86 only after its nine-month lag; it creates no immediate worker. These are illustrative content values, not a population forecast or a human fertility fit.

**Education and work share people.** A block has 100 available adults at a 160-hour monthly task ceiling. Twenty full-time students use 3,200 hours; care uses 1,600; existing service uses 800. At most 10,400 hours remain before health and other actual constraints. Assigning those 20 students to another full-time job does not produce a second 3,200 hours. Graduating ten engineers changes the actual qualification composition next month, not all 100 adults' average qualification.

**Preserve important correlation.** A town contains 40 trained engineers in one cultural/religious group and 160 residents without that profession. A policy that excludes the first group from a certain institution can remove those 40 engineers from its candidate pool; it cannot instead reduce everybody's engineering skill by 20%. A recruitment campaign or incoming license must address the actual affected people and their legal/organizational conditions.

## 11. Observation and acceptance requirements

Players and native AI receive the same dated, sourced population flow, age summaries, food/access reports, actual job vacancies, course seats, verified qualifications, and migration information. Estimated registration is labeled as such. Detailed private fertility responses, cultural axes, hidden participation weights, and the complete knowledge graph remain unavailable.

Default panels emphasize five questions: are people surviving and obtaining essentials; what limits available work; which skills are scarce; which groups cannot access opportunities; and how will the known age structure and commitments change future capacity? A compact education panel shows current qualified supply, active learners, earliest conditional completion, teacher/equipment bottlenecks, and due reviews. It does not expose a universal education score or all future courses.

Acceptance checks include world population conservation, source-preserving migration, no premature adulthood, no qualification averaging, no duplicated teacher/student/military time, split/merge-invariant rounding, exclusion effects on the actual group, and stable population feedback under equivalent aggregation. The two numerical crisis/low-birth cases above are bookkeeping examples. A complete engine must still demonstrate that the phenomena arise endogenously from resources, institutions, age structure, and decisions.

This model deliberately retains uneven access, dependency, skill formation, slow cultural evolution, and competing claims on real people. It removes detail whose cost currently exceeds its strategic value. The resulting performance and historical behavior remain matters for measured validation, not promises made by the document.
