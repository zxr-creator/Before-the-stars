# v0.5 — matched budget strategies and exploit review

Historical paper calculation translated for v1.0, not a running simulation or historical fit. No game code was implemented. Keep three levels separate: 120-month public-project accounts; a separate conditional endgame-clock fixture; hypotheses awaiting a complete world model. Current scope/clock and population representation follow [v1.0](../design/30-complete-plan-v1.0.md).

Budget must face actual inputs, absorption, ongoing expense and opportunity cost. Permanent departmental bias may delay complementary projects. This does not imply equal allocation always wins or that an optimal strategy has been excluded. Diagnosing, forecasting, preparing and bearing risk are the important differences within the broad family of bottleneck-adaptive policies.

## 1. Identical starting conditions and boundaries

Copy four worlds from the same industrial local checkpoint for 120 months. Public plans are submitted every twelve months; maintenance, construction, teaching and experiments occur within the year, with acceptance at its end and capability from the next year. Annual aggregation is specific to this fixture; the actual [monthly engine](../technical/07-monthly-engine-spec.md) cannot instantly finish ordinary projects annually.

This is not a primitive-to-FTL campaign. Population, agriculture, religion, slow culture, private consumption and basic services are identical and stable controls, not removed game systems. No new war, disaster, borrowing, immigration or imported technology occurs. Calendar and completed domestic audits are equally known; nobody sees future randomness.

The fiscal scope is **one adjustable public-project department, not the entire society**:

- Treasury starts at 1,000 c, with annual authorization up to 100 c and no new tax/debt. Suppliers/residents hold 9,000 c. Payments transfer money; total remains 10,000 c.
- Signed contracts provide wages, equipment, materials and services at fixed finite prices/capacities: at most 16 new qualified-team units, six industrial units, seven defense units and sixteen specified engineering-work units. Candidates, land, power and supplier hours are reserved and cannot be sold twice. Supplier production/consumption is not separately duplicated in this local account.
- Production starts with 8,000 raw-material units. Each standard product consumes one. Annual power, general labor and storage support at most 800 output, with costs included in existing service/maintenance contracts. Storage fits all residual products; no policy exhausts raw material.
- Products, inventory, qualified capacity and public cash are separate. **Output does not automatically become GDP, welfare, tax or science.** Buyers, use, prices, storage and tax-base feedback require further tests.
- 100 c is a ceiling, not compulsory expenditure. Unfilled/inapplicable allocations stay in treasury rather than disappearing or becoming another department's free progress.

## 2. Minimal state and complementary inputs

These are private fixture audit parameters, not a requirement to reveal engine equations to agents. Seats see authorized personnel statistics, known project applications, maintenance bills and performance.

| Variable | Unit/start | Meaning/bound |
| --- | --- | --- |
| H | Annual qualified-team service capacity, initially 4 | Fixed candidate population, at most 20; not people or a repeatedly spendable education score |
| C | Standard industrial line capacity, initially 2 | Land/power/labor allow at most 8; each produces 100 standard units/year |
| D | Trained, sustainably supplied defense service, initially 1 | Reserved recruits/camps support at most 8; not a battle result or territory |
| P1 | Known process validation, 0/8 work | Must finish before P2 |
| P2 | Known precision-equipment validation, 0/8 work | Requires P1 and opening-year H≥8, C≥4 |
| Cash/raw/finished | 1,000 c / 8,000 / 0 | Separate conserved accounts; money is not material, a line is not its output |

Fractions of H/C/D represent aggregated service/certified capacity, not invented half-people. Actual people, machines and formations retain unique identities. Training qualifies existing candidates rather than creating population. Retirement is outside this fixture; allocating money without eligible learners cannot increase H forever.

P1/P2 are specific already-known engineering plans, such as stable machining and a precision application. Work cannot move between them, trade as science currency or buy unrelated technology. All four policies know the same current plans/requirements. This tests complementarity in execution, not discovery of unseen directions; see the [knowledge engine](../design/16-knowledge-and-culture-engine.md).

Annual existing maintenance: `O = 2C + 2D`; project authorization balance `B = 100 - O`. Existing operation consumes `0.25(C+D)` qualified service, leaving `F = H - 0.25(C+D)`, positive in every main-case year. Cash and staffing are two accounts for the same service, not duplicate purchase.

| Addition | Cash | Qualified service | Annual limit | Effect next year |
| --- | --- | --- | --- | --- |
| Education e | 10e | 0.25e, teaching/practice supervision | e≤2; H+e≤20 | Add e qualified capacity |
| Industry i | 20i | 0.25i, installation/testing | i≤2; C+i≤8 | Add i line capacity |
| Military m | 20m | 0.25m, training/organization | m≤2; D+m≤8 | Add m defense service and maintenance |
| Engineering r | 10r | r, experiments/metrology/review | r≤4 and remaining current work | Accepted work for this plan only |

Cash prices include corresponding materials and contracted pay. Money without materials, candidates, instructors or services cannot deliver. C/D maintenance and H competition connect education, defense, research and industry. Culture/religion/education conditions are identical controls, not replaceable by total population; see [war rules](../design/13-war-resolution.md).

Each policy proposes `e*, i*, m*, r*`. Apply one common proportional service rationing if needed:

`L = 0.25(e*+i*+m*) + r*`; `lambda = min(1, F/L)`, or 1 when L=0.

Multiply all proposed quantities by lambda, pay only actual accepted work, and do not reallocate released cash within that year. This is an explicit fixture rule, **not a universal rule that every real market rations nationally in proportion**. Wage bids, priorities or contractual preemption need a separate matched comparison.

At year end: `cash -= O + 10e + 20i + 20m + 10r`; `H += e`; `C += i`; `D += m`. Current output uses opening C: `Y=100C`; raw stock decreases and finished stock increases by Y. P2 starts no earlier than the year after P1 completes. Unaccepted graduates/lines cannot satisfy its opening requirement. Excess work is neither charged nor carried across plans.

## 3. Policies fixed before calculation

The main interpretation of “always maximum” fully funds the favored department's currently available requests while retaining other projects. Section 6 tests literal all-in allocations. Do not starve one policy intentionally while allowing another flexibility and then call that evidence of good mechanics.

| Policy | Post-maintenance annual project ceilings |
| --- | --- |
| E: education priority | 70% education; 10% each engineering, industry and military |
| R: research priority | 70% engineering; 10% each education, industry and military |
| M: military priority | 70% military; 10% each education, engineering and industry |

Here 70% covers every available favored request, subject to actual capacity. It is not an engine-imposed maximum. Other requests stay within their shares/annual limits; unused allocations do not transfer departments and cash may be retained.

A uses this **predeclared heuristic**, not answers supplied after each year:

1. Raise D toward 2, at most two annually and within cash.
2. Raise H toward the known engineering need of 8, at most two.
3. Raise C toward the known requirement of 4, at most two.
4. Request up to four available P1/P2 work units.
5. Spend remaining budget on C up to 8, then H up to 12, respecting total annual limits already used.

Cash first forms proposed requests; common service rationing follows. A can therefore suffer crowding, poor forecasts and idle capital. H12/C8/D2 are this policy's preferences, not world rules or a prescription for every seed.

## 4. Reproducible results

Calculate without intermediate rounding; display three decimals. No random draws. Cumulative production is stock, not fiscal receipts.

First year: E requests `(e,r,i,m)=(2,0.94,0.47,0.47)`, uses 1.675≤3.25 service, spends `6+20+9.4+9.4+9.4=54.2`, retains 945.8. R requests `(0.94,4,0.47,0.47)`, needs 4.47, scales by `3.25/4.47`, performs 2.908 engineering and spends 55.586. A requests `(2,1.4,2,1)`, uses 2.65 and spends 100. New lines produce nothing that first year.

| Month | Policy | H | C | D | Cumulative product | Treasury | Engineering |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| M12 | E | 6.000 | 2.470 | 1.470 | 200.000 | 945.800 | P1 0.940/8 |
| M12 | R | 4.683 | 2.342 | 1.342 | 200.000 | 944.414 | P1 2.908/8 |
| M12 | M | 4.940 | 2.470 | 3.000 | 200.000 | 925.800 | P1 0.940/8 |
| M12 | A | 6.000 | 4.000 | 2.000 | 200.000 | 900.000 | P1 1.400/8 |
| M36 | E | 10.000 | 3.382 | 2.382 | 740.060 | 833.478 | P1 2.764/8 |
| M36 | R | 6.375 | 3.188 | 2.188 | 707.391 | 826.452 | P1 complete; P2 complements missing |
| M36 | M | 6.672 | 3.336 | 7.000 | 738.530 | 767.061 | P1 2.672/8 |
| M36 | A | 9.507 | 7.299 | 2.000 | 1,129.897 | 706.351 | P1 complete; P2 possible next year |
| M60 | E | 14.000 | 4.258 | 3.258 | 1,460.694 | 716.101 | P1 4.516/8 |
| M60 | R | 8.142 | 4.071 | 3.071 | 1,389.524 | 750.152 | P2 prerequisites just complete; no work yet |
| M60 | M | 8.231 | 4.115 | 8.000 | 1,445.423 | 656.164 | P1 4.231/8 |
| M60 | A | 12.000 | 8.000 | 2.000 | 2,659.794 | 548.804 | P2 complete |
| M120 | E | 20.000 | 6.299 | 5.299 | 4,006.055 | 447.806 | P1 complete; P2 not begun |
| M120 | R | 12.260 | 6.130 | 5.130 | 3,845.173 | 458.394 | P2 completed M84 |
| M120 | M | 11.944 | 5.972 | 8.000 | 3,878.228 | 416.105 | P1 7.944/8 |
| M120 | A | 12.000 | 8.000 | 2.000 | 6,659.794 | 448.804 | P2 completed M60 |

Remaining raw stock: E 3,993.945; R 4,154.827; M 4,121.772; A 1,340.206. A uses more raw material, so cannot also claim the most unspent resources. Government spending is 552.194/541.606/583.895/551.196 c respectively; supplier/resident balances rise equally. Unused budget was not treated as a penalty.

- **E has the most qualified service.** Education helps initially, but unused skills, missing higher courses and material shortages cannot substitute for one another. E's final production still slightly exceeds R/M; education is not worst on every measure.
- **R shows strong early progress but waits M37–60 for complements.** Cash and knowledge remain; time and parallel preparation are lost. R/A both finish P1 at M36, but A prepares the people/equipment for P2 sooner.
- **M has the most deployable defense.** The peaceful main case grants no conquest return, while people/maintenance remain committed. Threats could change its value.
- **A finishes both projects first and has the most capacity, but not every best metric.** It has fewer skills than E, defense than M and cash than R, and more unsold stock. Weak demand, threats or a high-education opportunity could make its sequence wrong.

The fixture demonstrates complementary-input mismatch, **not a unique optimum or inevitable long-run defeat for high education**. H/C caps reflect this checkpoint's courses, candidates, land and energy, not permanent civilization ceilings independent of new knowledge/investment.

### Real demand and realized returns

A separate matched sensitivity adds the same actual buyer: up to 300 units each year's first month at 0.1 c/unit. Unfilled orders expire rather than accumulating guaranteed future demand. Only previously stored products can sell. No initial product means no first-year sale; second year sells 200 each, later years at most 300 from opening stock.

Government owns these lines/products, so sales enter its treasury. The buyer pays from existing 9,000 c private cash and receives goods into inventory/use accounts. No money or product disappears. Annual authorization and policies stay unchanged, so production paths stay unchanged. In particular A does not become demand-responsive after seeing the answer.

| Policy | Units sold by M120 | Revenue c | Government unsold units | Treasury c |
| --- | ---: | ---: | ---: | ---: |
| E | 2,540.060 | 254.006 | 1,465.995 | 701.812 |
| R | 2,507.391 | 250.739 | 1,337.782 | 709.133 |
| M | 2,538.530 | 253.853 | 1,339.698 | 669.958 |
| A | 2,600.000 | 260.000 | 4,059.794 | 708.804 |

Most of A's output lead is unrealized. R retains 0.329 c more than A, insufficient to declare an overall economic ranking. Last-year output misses the purchase window, a truncation effect. Fixed demand/prices/raw/storage remain local assumptions; complete play needs endogenous orders, jobs, investment, maintenance and prices. The repair is better demand/inventory feedback, not a penalty designed to make one budget style win.

## 5. Full-victory timing cannot be inferred from industrial output

The industrial fixture omits world diplomacy, FTL materials and complete routes. Report P2 completion and censored M120 status, not invented primitive-to-FTL dates or claims that E/M can never win.

A **separate conditional acceptance-clock fixture** tests [victory logic](../design/15-victory-and-ftl.md). It does not grant FTL to the industrial accounts. All four begin at an identical late state with the objective known; P1/P2 stand for equal-work terminal process tasks with the same complements. Other technology, control and independent resource arrangements are assumed complete:

- Real global integration and each inhabited node's services qualify continuously from M1.
- After process completion at tau, separately reserved manufacturing, deployment, training and logistics can fund a 36-month tail. They cannot be moved into the main project or conjured from generic industrial goods.
- The first twelve months build initial trial equipment, deployment and training with actual inputs. Months 13–36 sustain full military FTL. Loaded trials at tau+13 and tau+25 are twelve months apart. Three-node deployment occurs tau+13 through tau+18. Initial trial equipment and subsequently manufactured components have separate records; the first trial cannot borrow an unbuilt replacement.
- Independent manufacturing units complete components at tau+18 and tau+24. Replacement/alternate crew occurs at tau+24 using an already available component, not the one completed that same month. At tau+36, another twelve months' maintenance is stocked or validly contracted. Military/civilian resources are not duplicated.

These are **declared feasibility assumptions**, not verified FTL recipes or economic results. They test logical conjunction and rolling windows, not forecasts derived from generic output.

| Policy | Assumed terminal-process tau | Continuous FTL window | Trials | Conditional first full completion |
| --- | --- | --- | --- | --- |
| A | M60 | M73–96 | M73/M85 | M96: G96, F24, Trials96 |
| R | M84 | M97–120 | M97/M109 | M120: same conjunction |
| E | P2 missing at M120 | None scheduled | Incomplete | No completion by M120; later date uncalculated |
| M | P1/P2 missing at M120 | None scheduled | Incomplete | No completion by M120; later date uncalculated |

With a separately fixed fixture horizon H=120, conditional returns are A=1.2, R=1.0, E/M=−1. These are not model win rates or the standard campaign reward report. Later governance delays completion while F24 must continue and expired trials may need repeating; taking the maximum date of old certificates is insufficient. A research lead need not translate into an equal victory-time lead.

## 6. Counterexamples without granting A victory by definition

### 6.1 Literal all-in spending

After maintenance, request only education, research or military additions, using the same capacity rules for 120 months.

| Policy | M120 | Treasury | Interpretation |
| --- | --- | ---: | --- |
| All education | H20, C2, D1; P1 not started | 780 c | After candidates run out, cash remains; no infinite schooling gain |
| All research | H4, C2, D1; P1 M36, P2 lacks complements | 860 c | Unstartable research is not a cash furnace |
| All military | H4, C2, D8; P1 not started | 692 c | Forces keep maintenance duties; no automatic world resources/FTL |

All produce 200/year, or 2,000 total. Missing complements directly prevents completion. Such extreme comparisons do not establish the absence of strong policies in a complex real match, so this is not the primary test.

### 6.2 A common unexpected threat gives military value

Add a defense task first reported M25 requiring already qualified D≥4. Immediate money/renaming cannot satisfy it. At M24, M has D5; E1.931; R1.732; A2. Only M meets that capacity condition. This does not imply automatic victory; roles, technology, supplies and command still matter.

A cannot know the M25 task in M1 if others do not. Earlier observable warning must be identical in source/error for all, with scouting and preparation costs compared. Fast engineering in peace is not a complete war-risk assessment.

### 6.3 Low initial education

Set initial H=1 for all, with everything else unchanged. Existing operation uses 0.75, leaving 0.25 project service. E/R/M/A add **0.299/0.053/0.131/0.189** qualified capacity in year one. E exceeds A on this short-term bottleneck because A divides scarce instructors/engineers across defense, industry and experiments.

This does not prove E ultimately wins. Distinguish teachers, foundational literacy, practice posts and research qualifications, with training delays. High initial H can instead make further enrollment low-value.

### 6.4 Prepared research can rationally concentrate

Set H12/C6/D2, P1 unstarted. Available qualified service is ten and post-maintenance cash 84. R/A each perform four engineering units; E/M each 0.84. No arbitrary research-overheating penalty is justified when complementary capacity is ready.

### 6.5 Adaptive policy can overbuild

A's second year requests four research units but completes 3.711 because construction/teaching compete. Delaying nonessential expansion could help; future demand and project chains determine whether that trade is worthwhile. The label “adaptive” grants no exemption from scrutiny.

A produces about 6,660 units without main-case buyers. If only 2,000 are useful, expansion may reduce cash/material/labor flexibility. Holding cash, shrinking capacity, maintenance and foreign purchases must remain valid alternatives to endless growth.

## 7. Engine rules supported by the review

| Problem | Decision | Visible feedback |
| --- | --- | --- |
| Maximum budget becomes maximum output | Separate authorization, reservation, contract, payment, delivery and effective capability; retain unused cash | Execution rate, pending spending, constrained inputs and waits |
| Repeated courses/teachers used everywhere | Bind actual learners, qualified hours, boundaries and practice; no duplicate teachers/engineers | Enrollment, graduation, transfers, vacancies and completion distribution |
| Education automatically equals productivity | Match actual specialty, job, equipment and work; idle skill remains capability, not output | Mismatch, vacant roles and verified services |
| Research cash skips industrialization | Explicit material, instrument, staffing, building and validation dependencies | Known missing parts, failures, queues and forecasts |
| Military adds forces without maintenance/labor | Preserve identity/responsibility; training and service use real people/supply | Deployable/training/understaffed forces and displaced civilian work |
| Equal shares/A thresholds become official answers | Specify physics/contracts/information, leave allocation to players; saving and specialization legal | Feasibility/assumptions, no hidden optimal-action label |
| Subjective overinvestment penalty | Consequences arise from wages, shortages, maintenance, opportunity cost and missing jobs | Actual delivery/cost changes, no arbitrary overheating score |
| Stock automatically improves economy/reward | Separate product, sale, use, tax and welfare | Inventory age, sales, prices, delivery, coverage and cash flow |
| Technology lead directly predicts victory | Track processes, military FTL, governance and current trial windows separately | Revealed evidence/gaps only; no early objective leakage |

Material constraints on institutions are feasibility/performance rules, not moral judgment of a budget preference. Slow culture/religion affect participation, occupations, trust, mobilization and execution through the same input chains, not cost-free research multipliers. See [culture](../design/07-dynamic-cultures.md), [education](../design/11-settlements-and-education.md) and [population](../design/12-population-and-development.md).

## 8. Complete benchmark requirements

Freeze recipes, prices, labor, flows and project hours before implementation; this fixture is not finished balance. Add:

1. Teacher/instrument shortages, imported materials, weak demand, border threats and fiscal scarcity, with equal events/observations within each comparison.
2. Both fixed external trajectories and opponents who negotiate, sanction, ally and learn. Allocation against a script is not diplomacy.
3. Equal-share, maximum-industry, licensing/self-research, reserves, staged specialization and random feasible baselines; do not choose only easy opponents for adaptation.
4. Delayed own statistics and sourced foreign estimates. Include stale and wrong diagnosis, without oracle coefficients/future nodes.
5. Same primitive checkpoint and frozen horizon: win rate, completion-time distribution, resident services, debt, FTL and governance failures. Report censored outcomes, not invented future dates.
6. Course duration, materials, equipment life, warnings and trade sensitivity with held-out worlds. If one ratio always wins, inspect missing complementarity/substitution/demand/risk before penalizing leaders.

Fast feedback means clear receipts and short-cycle events, not removing strategic education/building/governance time. Actors see known failure, forecasts and uncertainty; referees audit conservation, shared resources and hidden causal chains. Keep those audiences separate.

## 9. Historical validation scope

The original release independently recalculated 80 main-table numbers and sixteen demand-table numbers under the stated proposal, rationing, maintenance and activation rules, within three-decimal display rounding. It also checked P1/P2 dates, literal all-in, low-teacher examples and the conditional 24/96-month windows/trial spacing. These were document arithmetic checks, not an engine, market, model competition, performance benchmark or complete balance acceptance.
