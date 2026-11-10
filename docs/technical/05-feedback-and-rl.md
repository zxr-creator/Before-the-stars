# Information Panels, Actions, and Agentic RL Feedback

The objective is a fast, inspectable decision loop. Physical time cannot skip demographic, transport, contract, or cultural delays to provide more reward. Reduce computation and reading latency instead. Authoritative multicore Rust and TypeScript panels/CLI/MCP share one observation projection. This remains a design, with no implementation or measured performance claims.

## One dataset, two presentations

[Limited diplomacy](../design/29-diplomacy-communication-v0.8.1.md) exposes only the seat's contact list and actual mutual channels, not others' lists. Pair allowances are explicitly public scheduler metadata and may appear before distant message bodies arrive; they are not evidence of delivery, signature, or activation. Separate received claims from authenticated records; do not highlight lies using omniscient truth. Messaging, matching, signing, empty windows, and queries grant no formal reward or simulation time. Record originating-round allowance, body length, performance, and actual consequences. Model inference cost is separate, not a reward for talking.

All five windows share one round's external inference, query, and output budget; budgets do not multiply by five. If there is no channel or the player explicitly skips, adapters may submit fixed empty batches without invoking the model, preserving barriers and logs. Skipping cannot reveal others' future messages. Deliver only new arrived content; retrieve history on demand. Performance reports distinguish monthly resolution, diplomatic barriers, and model wait. More model calls are not more civilization-development time.

Every metric has `metric_ref, unit, scope_ref, period_start, period_end, observed_at, received_at, source_refs, quality, value_or_range, coverage, revision`. Quality distinguishes verified accounts, registration, sampling, participant claims, and forecasts. Missing means unknown, not zero. Stocks are point-in-time quantities; production is a period flow. Average prices specify volume and product specification. Percentages include denominators.

Humans initially see three to five important changes with drill-down. Agents receive equivalent JSON rows and paginated series. Graphics add no secrets and JSON omits no usable data. Both can export legitimately acquired history, contracts, and accounts without extra in-game viewing fees. Surveys, censuses, and experiments still consume real resources. Reading limits concern output volume rather than UI click count.

| Panel | Default view | Drill-down | Decisions |
| --- | --- | --- | --- |
| Overview | Commitments, major changes, known gaps, deadlines | Related actions/monthly events; no hidden distance to endpoint | Budgets, agendas, projects, investigation |
| Settlements and resources | Residence/employment, granaries, housing, water, mines, transport gaps | Specifications, land use, hours, stocks, flows, losses | Construction, recipes, land conversion, routes, maintenance, procurement |
| Population and education | Registered people, aggregate age structure, births/deaths/migration, supply, enrollment/completion | Coverage, recruitment/education/care hours, sampled household constraints | Schools, training, housing/care, relief, migration policy |
| Culture and religion | Population shares, observed practices, believer duties, participation, attributed explanations | Questions, sample sizes, dates, minority coverage | Organization funding, communication, channels, reform; no direct culture slider |
| Economy and treasury | Cash, custody, debt due, monthly flows, production/sales/stocks | Legally available household/organization accounts, tax base, wages, arrears | Taxes, procurement, borrowing, standing orders, public operation |
| Technology and projects | Known nodes, trials, facility/team/material gaps, accepted results | Actual consumption, stoppages, retries, source information | Research, tests, training, imports, licenses, joint research, transition |
| Military | Verified personnel, training, command, readiness, supply, missions | Equipment groups, casualty disposition, missing reports, deployment, occupation duties | Recruitment, training, composition, deployment, retreat, demobilization, academies, logistics |
| Diplomacy and contracts | Up to three peers, mutual channels, pair used/remaining allowance, current permits, proposals/performance | Arrived messages/sources, immutable terms, signing powers, payments/assets, evidence, arrival times | Probe, claim, counter, propose, sign, and exercise acceptance/dispute/exit rights |
| Endgame, after discovery | Known military-wide tests, governance services, valid windows | Verification records, remaining engineering, known expiry risks | Sustain acceptance, arrange replacements, govern, establish actual charter powers |

Military organization does not add RTS micromanagement: reuse recruitment/training projects and `military_order` templates. Education, housing, and family support use projects, budgets, and policies. Players cannot order births or instantly make a group believe propaganda. Chronicles use illustrated Civilization-style historic moments with evidence drill-down, without separate era-score rewards.

## Complete action feedback

The lifecycle is draft → visible-condition check → seal → queue/reserve → actual investment → process outcome → acceptance/termination. Feedback includes `action_ref, commitment_ref, status, measured_inputs, measured_outputs, unmet_observed_inputs, next_due_month, evidence_refs`, restricted to what the seat can verify.

For example, a program intends to train 100 people, 80 arrive, instructors can train 50, and equipment supports 60. A report can precisely show 50 receiving training and actual resource use. The other 20 people cannot be automatically explained as refusing because of a hidden belief. Surveys can report stated reasons with nonresponse and sampling bias. Clear feedback distinguishes facts, estimates, and attribution; it does not disclose all true causes for free.

Known mechanical constraints support inspectable local budget/recipe calculators. Social forecasts use only own history and declared estimation models, with assumptions, error, and scope. Unknown graphs are not completed automatically, and no “best action” button queries the referee's future. Rank bottlenecks by observed loss and deadlines, not private FTL paths.

## Data without leakage

Each observation gives bounded summaries and increments. Retrieve monthly series, regional comparisons, and known participants' contract accounts on demand. Downloadable seat logs retain detail; annual default charts state coverage and cannot hide famine months through aggregation. Corrections are new versioned records, preserving what the agent actually saw earlier.

Public identities support checks: closing inventory = opening + actual arrivals − inputs − consumption − losses; registered population change = reported births − reported deaths + reported migration + registry revisions. The referee separately checks true population; registration and truth must not be conflated. Casualties, ransom, return to service, and migration trace to distinct records so prisoners are not counted as deaths.

Protect derivatives, rankings, errors, cache tags, page counts, acceptance feedback, training information, tooltips, and summaries. Private social changes without visible consequences must not alter outputs. Processing displays task status, not hidden entity counts. Panels expose report age and uncertainty, never private “true probabilities.”

Scoring state is separate from government control: only original seats with `scoring_status=active` are eligible to win. Forfeiture permanently records −1; caretaker achievements are diagnostic. At T=H check full eligible victory before timeout. With no active original seats, close without a winner. See [15](../design/15-victory-and-ftl.md) for the exact conjunction and termination order.

## Three feedback channels

1. **Environmental facts:** visible process/outcome feedback at each decision boundary; the default dense feedback.
2. **Formal reward:** complete victory time only, as specified in [victory](../design/15-victory-and-ftl.md). Queries, kills, renaming, claimed breakthroughs, and unaccepted deliveries earn no points.
3. **Optional training assistance:** supervised budget, future observable event, or contract-performance prediction, or constrained shaping. Record separately; never silently change primary evaluation.

Optional shaping is `r' = r + Φ(h_next) - Φ(h)` with `γ = 1` and `Φ = 0` at every true terminal state. History `h` contains only the actor's acquired information. Whole-match shaping sums to `-Φ(h_start)`, the same for strategies with the same initial observation. Do not change metrics each round, use hidden technology counts as potential, or clear potential at a dataset truncation as if terminal. These break cancellation or leak information. The source is [Ng, Harada, and Russell on reward transformations](https://people.eecs.berkeley.edu/~pabbeel/cs287-fa09/readings/NgHaradaRussell-shaping-ICML1999.pdf). Only the directly checkable finite-trajectory cancellation is adopted; arbitrary multi-agent convergence is not claimed.

Initially use no shaping and test whether good factual feedback and training tasks suffice. Food recovery and project progress are information, not repeatable payouts; regressions must also be recorded. An omniscient critic, if used, runs in a separate training process. Its state and gradient-related auxiliary inputs never enter actor context, tools, memory, or public logs. Report this separately from observation-only training. Hidden exploration objectives must not return to actors through visible reward decomposition.

## Fast execution and decision rhythm

The candidate standard v1.0 calendar is fixed at 12 simulation months per decision round, `H = 2880` months/240 rounds for every seat. A 960-month/80-round setup is a development fixture, not another victory mode or a directly comparable ranked result. Local training fixtures may vary their scope under explicitly separate configurations. No private war, discovery, or civilization tier changes the standard observation clock. Standing, player-authorized bounded policies address inventory, shutdowns, attacks, and deadlines; no omniscient automatic planner runs between decisions.

During resolution, read-only subscriptions may deliver monthly accounts as normal communication makes them visible, but cannot accept additional actions. Formal model comparisons enforce equal output and external reasoning budgets and may batch delivery at the boundary. Training can record monthly transitions, but only decision boundaries have new actions. Sustaining an order is not multiple independent policy samples. Record `elapsed_months` and handle semi-Markov duration correctly.

Use headless Rust batches. LLMs do not decide rules, arbitrate contracts, or generate mandatory feedback. Narrative is asynchronous and optional. Parallelize independent regional tasks and independent matches; adaptive scheduling cannot change logical order. Cache immutable knowledge projections and update affected accounts incrementally. Months remain sequential. Skip inactive intervals only after proving equivalence with monthly reference execution; the first release does not depend on this optimization.

Performance targets, not current results: on a reference Mac with model, RAM, threads, and scenario recorded, four civilizations/24 regions without models should reach monthly p95 ≤ 50 ms and 12-month-round p95 ≤ 750 ms; cached summaries p95 ≤ 100 ms; default uncompressed observation ≤ 64 KiB and detail page ≤ 256 KiB. Establish a separate 72-region baseline. Do not meet targets by silently dropping population or contract rules. Time model inference, network, rules CPU, projection, and I/O separately; report whole-match duration, memory, and batch throughput. Native AI's bounded planning is measured separately from world resolution.

## Training records and evaluation

Each record includes rule/content/generator/protocol versions, observation digest and authorized original, actions, receipts, elapsed time, visible feedback, reward channel, `terminated`, `truncated`, termination reason, policy/opponent versions, and external token/tool budgets. Distinguish victory, elimination, horizon-unresolved, and infrastructure failure. Dataset interruption is `truncated`; it must not inject failure reward or erase unsettled duties.

Curriculum progresses from local inventory/education through technology transfer/disruption, mobilization/limited war, long-term culture/population, and complete global victory. Local tasks have explicit separate objectives and cannot be reported as full-game win rates. Retain primitive-start training and held-out full games. Vary opponent policies, starting seats, resources, and physical routes to prevent exploitation of one fixed script. Save self-play opponent versions; trajectories do not all come from one stationary environment.

Compare primary reward with and without auxiliary prediction and shaping. Report speed, success, failure tails, unresolved rate, governance services, shutdowns, cultural delay, and adaptation to unfamiliar layouts. More feedback does not guarantee better long-range planning; measure whether legitimate information improves predictions and prevents avoidable long-term errors.

All v1.0 formal matches remain single-winner competition, with four total original seats and one to four external human/LLM controllers, native AI filling the remainder. All-AI benchmarks use those same seats and rules. Easy/Medium/Hard receive identical physical resources and knowledge permissions; planning budgets and policy versions are reported. A defeated seat losing actual authority cannot continue issuing sovereign commands. Infrastructure withdrawal never transfers free assets or rights; adjudication and continuing-world behavior follow [chapter 33](../design/33-competition-and-native-ai-v1.0.md).
