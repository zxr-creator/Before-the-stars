# Population, Stagnation, and Sustained Development: Shared Mechanisms

This is the preserved 0.4 design/referee specification, translated into English. **For 1.0, [32](32-population-and-education-v1.0.md) supersedes the fine demographic implementation below:** birth-month subdivisions, household formation/parity, individual reproductive exposure locks, pregnancy/recovery queues, multiple disease compartments, and repeated fine occupation matching are archival alternatives, not current requirements. Its broader development hypotheses, conservation rules, evidence limits, and strategic tradeoffs remain relevant. Historical formulas and examples remain here for traceability, not as competing active specifications.

Causal functions are private designer/referee material and must not become verbatim human/agent prompts. Players receive population, production, school, household survey, trade, and historical reports and investigate from evidence. Initial parameters have not been calibrated in simulation and are not a real demographic forecasting model.

## Target phenomena and factual boundaries

Population neither grows forever at a fixed percentage nor has a civilization-name-specific maximum. Fertility, mortality, age structure, food access, education, care, land, and organization share accounts. Plateaus, temporary growth, crisis decline, and modern low fertility should emerge as combinations of these processes rather than separate scripted stories.

Modern low fertility is not solely cultural. Housing burdens, work/care coordination, family formation, and uncertainty are researched factors, with no single explanation fitting every region. The game treats them as testable mechanisms, not a guarantee that one policy restores births. [OECD 2024 fertility chapter](https://www.oecd.org/en/publications/society-at-a-glance-2024_918d8db3-en/full-report/fertility-trends-across-the-oecd-underlying-drivers-and-the-role-for-policy_770679b8.html), [economic review of fertility](https://www.nber.org/papers/w29948).

Historical Chinese population research must distinguish people from record quality. War and regime change affect both survival and registration. Research explicitly limits the reliability of long-run population records; differences between two registers cannot all be counted as deaths, nor can unified dynasties be programmed to halve their population periodically. [Historical epidemics and population research](https://www.cambridge.org/core/journals/epidemiology-and-infection/article/epidemic-and-population-patterns-in-the-chinese-empire-243-bce-to-1911-ce-quantitative-analysis-of-a-unique-but-neglected-epidemic-catalogue/0625FFA65353AA61935822AD538F6450).

European industrialization and technological expansion inspire combinations of energy, markets, knowledge exchange, and investment returns, not a Europe-exclusive event. Research models link trade and innovation direction, but the game's specific functions remain hypotheses. [Trade, knowledge, and industrialization model](https://www.nber.org/papers/w13057). Do not classify Africa, the Americas, or any population collectively as permanently culturally stagnant. Maya research demonstrates complex cities/infrastructure; differences require specific periods, regions, and capabilities. [Maya cities and infrastructure](https://experts.nau.edu/en/publications/ancient-lowland-maya-complexity-as-revealed-by-airborne-laser-sca/).

## Archived 0.4 state: population is more than one integer

Settlement groups preserve culture, religion, skills, economic identity, and legal status. Version 0.4 expanded three age summaries into detailed age and household-stage accounts. The UI could still show children/working-age/older people; newborns could not immediately work. The following fine fields are superseded by 1.0's smaller representation.

| Private state | Historical minimum representation and purpose |
| --- | --- |
| Age stock | Aggregate by birth year with within-year birth-month distribution; age only at the actual boundary, without individual objects |
| Household-stage distribution | Care arrangements absent/present; children being raised compressed as 0/1/2/3+; cumulative births and surviving-child summaries |
| Reproductive exposure | Potentially reproductive adults, ages, and pregnancy/recovery counts, rather than national population times one birth rate |
| Pregnancy queue | Expected delivery month, source group, health, committed care; no double pregnancy registration |
| Skills and health | Existing qualifications, training, injury/illness, nutrition deficits, recovery; determines available hours |
| Household budget and time | Actual food, housing, cash/in-kind income, care needs, employment, and education time |
| Expectations and norms | Income-security expectations, childrearing standards, family preferences, and care-sharing practices based on group history and slow culture rules |
| Registration coverage | Recorded people, sources, underreporting, and lost-contact range; changes observation/enforcement, not actual headcount |

Birth-month distributions, pregnancy queues, and age flows were independent of player-editable group IDs. Merges preserved weighted distributions; splits carried real population shares and rounding residues. Pregnancy, children, teachers/students, and wounded people could not duplicate. Equivalent conditions could be compressed while retaining actual age, fertility, and skill consequences. Version 1.0 preserves these conservation aims without retaining every fine state.

## Archived monthly demographic transitions

Following the [monthly sequence](02-civilization-systems.md), war first generates pending casualties; consumption precedes health, pregnancy, births, and movement; cultural experience follows. Fertility decisions use current known income, care, risk, and past experience, never future harvests or opponents' sealed plans.

1. At opening, establish age, transit, injury, education, care, and service commitments. Adulthood is not training.
2. After labor allocation/production, distribute food/services through actual ownership, wages, markets, and relief. National surplus does not substitute for local access.
3. Deduct war deaths uniquely from source groups; wounded people remain alive, and capture changes location/control without becoming death.
4. Resolve combined age, nutrition, and disease risks on survivors; one person cannot die separately from multiple hazards. Update pregnancy queues for caregiver death, loss, migration, and health.
5. Due pregnancies produce births and immediate care obligations. Newborns enter ordinary age-hazard settlement no earlier than next month. Record delivery risk separately to avoid double counting.
6. Current conditions generate new pregnancy queues. Migration requires reachable routes, costs, and expected reception; subtract at origin, preserve in transit, add on arrival.
7. Settle registration/skills and record experiences. New norms, institutions, and skills affect production/fertility no earlier than next month.

The conservation identity is `P(t+1) = P(t) + births - deaths + external arrivals - external departures`. Internal-world migration sums to zero. Prisoners, refugees, and unregistered people remain world population. Leaving one administrative region cannot reduce global resident-governance responsibilities.

## Archived birth mechanism: preferences, feasibility, and delay

The 0.4 model distinguished desired childrearing, attempts, and actual births. Preferences developed through transmission, religious obligations, observed child survival, and occupational life. People could want more children without feasible conditions or choose fewer despite comfort. Government could alter services, budgets, and institutions, not command a specific number of births.

A bounded expression avoided optimizing every household:

`planning intensity A = D × F × S × C × E`, each factor in `0..1`.

- `D`: share wanting another child, from desired family size, existing children, and household stage, not national population targets.
- `F`: opportunity to form a household and stable residence, from housing, movement, contact, and organization.
- `S`: expected income/security using known history; one subsidy cannot erase years of unpaid wages or war.
- `C`: capacity to sustain care, considering all caregivers, relatives, and actual services without assigning all unpaid care permanently to one sex.
- `E`: ability to meet current childrearing standards, including subsistence, education, and time. Higher standards may increase costs, while effective schools/public care reduce burdens.

`new pregnancies = exposed population × age base rate × [A + (1−A) × U × (1−Q)]`, bounded by health and unique eligible exposure.

`U` is baseline unplanned-pregnancy opportunity; `Q` is actually known and continuously accessible family-planning knowledge/services. Neither is an arbitrary government slider or directly determined by religion names. This term preserved unrealized plans, unplanned births, and births under poverty; inadequate housing was not an absolute birth permit. Once pregnancy began, future willingness was not repeatedly applied, preventing a late price increase from magically cancelling a delivery. Actual health risks settled separately.

Monthly flows used fixed-point carried remainders rather than individual random draws. Local disease/disaster could create bounded correlated shocks, without rerolls from reopening panels. The initial pregnancy lag was 9 months and postpartum recovery at least 12 months. This was an aggregate livelihood baseline, not comprehensive reproductive medicine. Age rates, recovery, and survival curves came from one content version, not different country/culture-label tables.

Entry at M delivered no earlier than M+9; recovery could not end before 12 months after that delivery. Migration carried the expected month; deaths/health losses reduced both queues and exposure locks. Residues could not exceed real eligible capacity or duplicate through group copying. Care during pregnancy/recovery consumed actual time, without permanently excluding these people from every job. Health and care allocation determined remaining capacity. **Version 1.0 removes these explicit queues and locks, retaining a bounded age-based birth intensity and nine-month condition-history lag instead; it does not retain the 12-month individual recovery state.**

Family standards followed long-term cultural drift limits. Housing, jobs, and war could quickly affect feasibility while preferences changed slowly. Low fertility was not a cultural-corruption score, and reduced living standards were not mandatory to increase population.

## Mortality, resource constraints, and crises

There is no fixed national `carrying_capacity`. Land, water, soil, tools, inputs, and labor determine food production; trade/storage determine availability across place/time; property, income, and relief determine access. Water, sanitation, housing, pollution, and public care determine health exposure. Ecological foundations may slowly deteriorate/recover but do not refresh when residents die.

Nutrition deficit accumulates monthly. First calculate `new deficit = max(0, current need - actual intake)`, then `recovery = min(existing deficit, current care/physiological recovery capacity, intake above current basic need that is usable for recovery)`, and finally `deficit(t+1) = max(0, deficit(t) + new deficit - recovery)`. All terms use group nutritional-need equivalents with content-defined conversions. The same surplus cannot offset current need and then be deducted again from old deficit. Food is consumed once; recovery is not newly produced inventory.

Recovery cannot become unlimited stored health and still needs time, rest, and services. Weakness first reduces work and increases care, with continuing shortage raising mortality. Nutrition debt is a physiological burden, not a spendable resource. With old deficit 20, monthly need 10, intake 14, and recovery capacity 3, new deficit is 0, recovery 3, and closing deficit 17. Deducting the excess 4 again to reach 13 is invalid.

For each surviving group, a shared table provides age hazard `h_age`, accumulated nutrition hazard `h_food`, disease/health hazard `h_disease`, and pollution/environment hazard `h_env`. Combine before calculating one death probability: `p = 1 - exp[-(h_age + h_food + h_disease + h_env)]`, implemented deterministically through a normative fixed-point lookup. Attribute causes proportionally to hazard contributions rather than counting one death as both famine and epidemic.

The archived 0.4 disease proposal maintained a few susceptible/infected/recovered-or-protected categories with contact and care capacity. Contacts came from settlements, migration, armies, and trade. Shared national culture without contact could not infect a region, and trade did not guarantee catastrophe. Restrictions also cost commerce, movement, and services. **Version 1.0 replaces multiple compartmental diseases with bounded local health pressure and actual care demand; it retains contact, crowding, supply, and service consequences without claiming an epidemiological simulator.**

Indirect war losses arise through interrupted transport, missed cultivation, damaged facilities, crowded displacement, and withdrawn care. These create real deficits before demographic hazards; do not additionally remove a national percentage for war. Crisis can reinforce itself through `food shortage → less labor/revenue → interrupted maintenance → lower transport/supply → worse food shortage`. Reserves, imports, lower extraction, repair, local authority, and peace may interrupt it.

A smaller population may have more land per person without automatic recovery: soil, housing, skills, trust, and irrigation may remain damaged. Long growth followed by decline and long stability are both possible. Every match need not have a dynastic cycle.

## Modern low fertility, age structure, and adaptation

Medicine/sanitation may reduce deaths before increasing births. Longer education, housing/career thresholds, care opportunity cost, family expectations, and effective family planning can jointly lower or delay births. A smaller reproductive-age population may keep total births low even if families desire more children. Age structure produces this effect; an extra negative-population debuff is unnecessary.

Care services, housing, stable work hours, risk sharing, and family support change feasibility at costs in land, teachers, finance, and labor. They do not guarantee immediate preference changes or sufficient births from one subsidy. Forced educational withdrawal or manufactured poverty may harm health, skills, and future supply simultaneously. Population growth has no universal reward.

Population stagnation need not mean civilizational stagnation. Skills, repair, automation, energy efficiency, trade, and organization may increase capability without more people. Equipment, compute, maintenance, research, and supplier dependence still cost resources; an automation level cannot bypass every occupation. Migration can improve one place's age/skill structure while removing real people/capabilities from another. Global migration is not birth.

## Technological stagnation and breakthroughs cross real bottlenecks

Population/GDP do not automatically generate research points. Useful research needs questions, materials/instruments, qualified teams, reproducible records, sustained funding, and adoption opportunities. Distinguish insufficient new evidence, evidence without engineering complements, and usable techniques lacking willing/authorized adopters. Each requires a different response.

| Feedback loop | Conditions causing stagnation | Possible intervention | New costs and risks |
| --- | --- | --- | --- |
| Land–population–surplus | Falling marginal land returns squeeze learning/maintenance | Irrigation, crop/recipe trials, tools, storage, trade, migration | Materials, ecology, transport, property conflict |
| Skills–education–equipment | Instrument building requires skills, while training new techniques needs instruments | Basic apprenticeship, imported equipment, visiting teachers, staged verification | Withdrawal of teachers/students, license/migration dependence |
| Energy–market–investment | Theoretically superior equipment lacks scale, supplies, or demand | Joint purchasing, larger reachable markets, standard interfaces, staged investment | Coordination, finance, lock-in, substitution risk |
| Knowledge–exchange–verification | Exclusive information or incompatible records prevent correction of repeated failures | Shared experiments, open standards, parallel review, limited licensing | Cost, leakage, rivals catching up |
| Organization–rents–adoption | Incumbent asset owners obstruct viable techniques that harm their interests | Compensation, authorized reform, alternative organizations, negotiated revenue sharing | Finance, trust, transition supply losses |
| Population–care–innovation | Older-population care absorbs teams/finance while young skills replenish slowly | Care facilities, adult retraining, automation, migration, cooperation | No instant creation of young people; external dependence persists |

Research advances by task work and acceptance records. Paid trials are not necessarily independent useful evidence. Repeated failures with one material defect remain correlated samples; renaming or many tiny projects cannot manufacture breakthrough chances. Project compatibility does not change because a player leads. Generated opportunities may differ, but completed experimental outcomes cannot be retrospectively replaced.

Acceleration comes from sequentially removing complements: surplus supports training, training improves instruments, instruments enable useful experiments, usable results expand markets, and returns fund the next cycle. Every link has material flows, delays, and adoption costs. Commit no earlier than the next month; one month cannot multiply unlimited knowledge. Scientific method, education, and openness are not universal free buttons; problems and construction order still require judgment.

## Shared cross-system inputs

| System | Quantities actually read | Hidden causes/parameters |
| --- | --- | --- |
| Geography/resources | Land, water, soil, distance, transport, material quality | Undiscovered resources and complete long-run responses |
| Economy/trade | Actual group receipts, stored/in-transit food, paid services, jobs, delivered goods | Opponent costs, future plans, omniscient best substitutes |
| Education/technology | Teacher/student hours, qualifications, equipment, trials, application coverage | Complete potential graph, experiment compatibility, social-response weights |
| Culture | Contacts, family/occupational norms, cooperation, transmission | Eight true axes, slow-response functions, family-decision coefficients |
| Religion | Actual obligations, care/teaching organizations, participation, public claims | No nonexistent universal fixed fertility/research multiplier tied to a religion |
| Politics/war | Collection, services, recruitment, damage, compensation, experienced trust | Opponent intentions and internal acceptance thresholds unknown to government |

A religion's mutual aid can add real care; specific obligations can constrain particular jobs/actions. Both require actual participating people and organizations. One culture may face different family feasibility across urban/rural settings, assets, and histories. Do not multiply all births by national average culture and then again by a religious fertility bonus.

## Paper calculations and exploit checks

These are local assumed states, not historical fits or complete simulations. Their monthly/annual totals assume demographic processing has already occurred; aggregate rates do not replace internal state. Fine pregnancy arithmetic is preserved only as an archived 0.4 example.

**1. Agricultural plateau and an interruptible crisis.** Starting population 10,000 with annual births 300, deaths 280, and zero net migration ends at 10,020. If farming improvements first reduce deaths to 220 while births/other conditions temporarily remain unchanged, the result is 10,080, not authorization to keep that growth rate forever. Subsequent supply/care changes alter exposure/hazards. In a separate crisis year, 10,000 + 180 births - 100 direct war deaths - 500 other deaths - 700 departures + 20 arrivals = 8,900. Actual deaths are 600, not the net decline of 1,100. At 75% registration, reports may show about 6,675; missing registration is not additional death.

**2. Low fertility without famine.** A city with 100,000 people, 700 annual births, 900 deaths, and net immigration 50 ends at 99,850. War/famine are unnecessary. In the archived monthly model, 2,000 eligible exposed people, age rate 0.01, planning intensity 0.2, `U=0.05`, and `Q=0.9` produce `2000×0.01×[0.2+0.8×0.05×0.1]=4.08` new pregnancies: settle 4 and carry 0.08. If later evidenced care/housing improvements raise intensity to 0.3, the same inputs yield 6.07. Births occur no earlier than nine months later, never as two extra current workers. Annual births of 700 include other groups and preexisting queues and cannot be extrapolated from this single sample. Current 1.0 aggregate arithmetic is in [32](32-population-and-education-v1.0.md).

**3. More people cannot replace instruments.** Both countries have 100 research candidates. A has 20 qualified team-hour units and 10 instrument units; B has 40 team units and 5 instrument units. Each task needs one of each and materials are sufficient. A executes at most 10 tasks, B 5. Additional births cannot remove B's present bottleneck. It may buy instruments, cooperate, or train instrument makers at actual cost. More research jobs in A also draw skills from teaching, manufacturing, and maintenance.

**4. No farming births, cultural change, or crisis rewards.** Splitting a group a thousand ways still preserves the source's 4.08 aggregate residue rather than rounding each upward. Withdrawing a subsidy immediately does not erase known broken trust. Destroying food and then delivering relief creates no generic reward. Immigration subtracts people elsewhere. Growth, merging, conversion, and military reorganization do not reset actual age, nutrition debt, governance responsibility, or—in the archived version—birth intervals. In 1.0, delayed birth-condition history and source rounding remain preserved instead.

## Feedback, learnability, and acceptance

Default views show available population-flow decomposition, age structure, recorded births/deaths/migration, food access, jobs, care, and education coverage, each with date, scope, source, and precision. Household surveys may show samples of childrearing preferences, concerns, and work sharing, but not private `A`, `D`, or true functions. Unknown death causes remain under investigation rather than fabricated exact natural/war classifications.

Diagnostics must support action. Verified food inventory, transport gaps, missing school seats, and vacancies can be specific; “culture causes low fertility” is only a sourced interpretation. Players may compare regions, stage investments, survey, and review without a free omniscient counterfactual oracle. Training evaluation may ablate mechanisms in isolated offline runs without returning results to the current actor.

The archived first parameter package required age hazards, pregnancy base rates/health risk, care needs, nutrition hazards/recovery, disease contact, migration, and household expectation updates. Shared content applies across regions through actual conditions, with units, bounds, and ordering fixed before implementation. Beyond nine-month pregnancy, at least twelve-month recovery, and existing cultural speeds, 0.4 did not invent calibrated historical tables. **The current package instead follows [32](32-population-and-education-v1.0.md): annual age weights/hazards, bounded delayed birth intensity, care/access, nutrition, local health pressure, migration, and scheduled qualification review. Do not implement archived fine fields merely to satisfy this historical list.**

Acceptance scenarios include stable long-run agriculture, rising land/distribution pressure, successful/failed trade supply, wartime disorder/recovery, low-death low-birth states, age-structure delays, productivity gains without population growth, and identical states with cultural identities exchanged. Record crisis frequency, size, recovery duration, and skill loss, not just similar total-population curves. Removing food distribution, educational delays, care, or knowledge exchange should measurably change relevant outcomes; otherwise those variables are decorative.

An 80-year compressed match tests gameplay and bookkeeping, not millennia of demographic history. Historical validation requires sufficiently long simulation spans, explicit initial states, and independent calibration sets. Longer decision windows still settle monthly and execute standing policies. Cross-scenario comparisons use the same simulation-time unit; fewer decision steps cannot earn reward for skipping historical time. The 1.0 candidate H=2880/240-year campaign is also explicitly compressed fictional technological chronology.
