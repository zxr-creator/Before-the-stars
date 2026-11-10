# Development stages and acceptance

Build one explainable, replayable game that can both fail and finish before expanding content. Stage numbers express dependencies, not delivery-date promises. The repository currently contains design and historical protocol drafts only; the following implementation remains future work.

Current authority is the [complete v1.0 plan](design/30-complete-plan-v1.0.md) and chapters 31–34. v1.0 adopts competitive-only play, four civilizations with 1–4 external seats, three native-AI difficulties, simplified population, corrected fixed graphs, a stylized atlas and a Civilization-style Historic Moments timeline. It retains the production catalogs, real inputs, contracts, warfare, limited communication, uncertainty and sustained FTL/global-governance requirements. No game implementation starts in this revision.

## D0: close the complete mechanism design

Before P0, specify each system's state, visibility, actions, inputs/outputs, monthly phase, failures and responses. Paper accounts must connect primitive nonreligious communities to the final engineering objective. Check cash-free construction, shared urban/rural/education hours, duplicated cultural benefits, actual religious costs, scientific agendas before their discovery gate, and objective revelation before endgame actions become possible.

Eight private cultural tendencies, slow feedback, education, settlement networks, local religion, seeded geography, multicore consistency and isolation remain required. [War](design/13-war-resolution.md), [contracts](design/14-contract-resolution.md) and [v0.4 cases](reviews/03-v0.4-cases.md) supply transition baselines. Equipment/project recipes, demographic parameters, pacing and economic reachability still require content freeze and calibration; implementation must not invent missing rules.

The historical v0.5 plan's twelve content tables remain a checklist, with household/pregnancy fields replaced by [v1.0 aggregate population](design/32-population-and-education-v1.0.md). Form a minimally complete calculable scenario first. Local budget calculations are counterexamples, not full-game results. Compare identical seeds, starts, information rights and predeclared external conditions, including educational specialization, threatened military investment, research sprints, delayed construction and interrupted supply. Test the costs of a myopic bottleneck policy as well as permanent department priorities.

The [technology](design/17-technology-atlas-v0.6.md), [practice](design/18-cultural-atlas-v0.6.md) and [course](design/19-education-and-transmission-v0.6.md) catalogs need entry-by-entry matching of prerequisites, equipment/teacher bootstrap, inputs, acceptance, records transfer and observable feedback. Verify steam/diesel transitions, FTL without AI government, alternatives to a particular glass/agriculture path, and multiple institutional combinations. Structural graph reachability is not affordable execution.

The [production interface](design/21-production-chains-v0.7.md), [eighteen tradition layers](design/22-technology-strata-v0.7.md) and [120-month route accounts](reviews/06-industrial-route-comparison-v0.7.md) cover selected construction, training, operation, downtime and shocks. Finish pre-electrical maintenance/conductor bootstrap, civil works/components/nutrients, AI tasks/concurrency, geographically distributed demand and seasonal heat. Replace fixed outside suppliers with endogenous primitive-start markets and real counterpart contracts before claiming whole-game feasibility or route balance.

Apply [decision-value and exploit boundaries](design/24-decision-value-and-exploit-boundaries-v0.7.md): good strategy may earn a large return; ledgers, ownership, idempotency and actual time remain inviolable. Numerical counterexamples become future property tests, not evidence that runtime exploits are already eliminated.

The [advanced applications](design/25-ai-cyber-bio-industries-v0.8.md) and [late contracts](design/26-late-game-contracts-and-strategy-v0.8.md) need frozen task/error responses, sample provenance, upstream products, independent validation and biological observation periods. Expand stage totals into monthly constrained supply and local recipes. Prove talent lead time on the actual critical path. The historical [M336 case](reviews/07-postindustrial-campaign-v0.8.md) assumed cooperative completion and is not current competitive evidence; use the new conditional case in [33](design/33-competition-and-native-ai-v1.0.md) and then an implemented adversarial campaign.

Across seeds, complete technology/practice nodes, AND/OR edges, discovery rules and adoption conditions must be identical within a content version. Only world, knowledge and actual adoption vary. Test divergent visible routes and paid cross-domain entry into neglected branches. Do not delete nodes, reroll prerequisites or create permanent hidden-preference locks. The [first-game narrative](design/27-first-game-mental-model-v0.8.md) is designer material, not an initial seat prompt.

The [diplomacy rules](design/29-diplomacy-communication-v0.8.1.md) require mutual three-counterpart selection, ten combined pair envelopes, five simultaneous windows, public send permits, evidence/deception and multilateral signing. Check final-slot arbitration, failed batches, fan-out, long delays, cross-round signatures, protected exits and locked commitments competing with plan budgets. No extra simulated months or chat reward are added for feedback.

v1.0 additionally freezes the candidate common clock at 12 months per round and H=2880, separates hypothetical historical compression from actual biological time, and requires four-seat competition with non-cheating native AI. Review corrected graph prerequisites, population-fragmentation bounds, real loss of authority, known-graph UI and illustrated timeline secrecy. Resolve all normative overrides before type generation.

## P0: rules and protocol foundation

Deliver Rust and TypeScript workspaces, versioned content/rules, schema-linked DTO/type generation, CLI and minimal saves. Freeze months, units, rounding, phase order, IDs, random streams, budgets and treaty semantics.

Generate current contracts and fixtures from [v0.4](contracts/v0.4-changes.md), [v0.5](contracts/v0.5-design-addendum.md), [v0.8.1](contracts/v0.8.1-diplomacy-addendum.md) and [v1.0](contracts/v1.0-design-addendum.md). Old examples are historical only. Counterexamples cover cultural/private-population leakage, split orders/recruitment under one controller, experiment recreation, in-transit signature double spending, partial acceptance, service failure, closing settlements and conquest without FTL. Include wage advances/net settlement, same-month services, delayed goods, pending acceptance and symmetric public/private standing operations.

Acceptance: repeated inputs give the same hashes; checkpoint recovery matches continuous execution; integer limits and amount conversion agree; Rust and TypeScript validate the same fixtures. Two private worlds differing only in currently invisible state yield identical observations and preflight results until a legitimate effect becomes visible. Observation structures never serialize internal world objects.

All units, recipes, projects and cultural parameters become machine-readable versioned content. Economic formulas and combat coefficients cannot acquire an independent client implementation.

Validate the multicore calculation skeleton at 1/2/4 threads, minimum observation/sealing through native external-agent CLI/MCP operation, and an isolated referee/player environment using Harbor or the chosen equivalent. Include setup and recovery. Discovering that the access model cannot be isolated at P6 is unacceptable.

## P1: sustainable economy and population

Deliver a four-civilization, 24-region fixed fixture; six resource categories and selected specifications; aggregate household/organization/government accounts; production, markets, transport, maintenance, labor, population and cultural shares. Use a small public fixed technology set initially to isolate economic problems.

Include primitive cash-free subsistence/in-kind construction, village/city/extraction nodes, land use, service reach, standing procurement/sales and rolling budgets. Do not require modern wages before monetary institutions. Education, care, military duty, commuting and production share hours. Establish minimum skills and teaching now; extend culture coupling in P2.

Implement seed derivation, terrain, drainage, correlated resources and aggregation. Fixed maps support regressions; generated maps support validation. All starting people remain nonreligious, including pre-run history. Keep geometric golden fixtures, manifests and replay credentials with the referee.

Initial content covers food, fuel, metals, tools, instruments and road logistics. Population/enterprise actors purchase and hire through bounded rules; government changes incentives through actual projects, laws and trades. Priorities and labor competition have explicit settlement. One person cannot farm, serve and research full-time simultaneously.

Use the v1.0 sparse joint groups and compact age vectors, not individual marriages, pregnancy queues or per-person job search. Preserve food/care/housing constraints, qualifications, migration and mortality. Fragmentation and important-minority cases are required.

Acceptance: sustained production on fixed fixtures; traceable famine, supply interruption and migration; no unexplained money creation through orders, transit losses, tax or wages; conserved population and inventory; iteration order does not change clearing or production. Demonstrate one raw-material interruption propagating through maintenance into research.

## P2: dynamic knowledge, culture and projects

First run peaceful population-resource and low-fertility scenarios, then trade, war and slow cultural change. Plateaus, crises and recovery must follow accounts rather than fixed historical identities. Registration coverage remains separate from actual population. No individual pregnancy subsystem is reintroduced as a hidden dependency.

Start with a closed content slice displayed as roughly 24–30 capability groups and 12–18 practices, then expand to the full 138-node/64-practice catalogs. Display grouping cannot remove key prerequisites, primitive bootstrap, actual hours or costs. Uncovered routes are not validated. Compare at least three industrial traditions and two engineering emphases under the same FTL premise. Implement discovery, research, prototype, operation, diffusion, pause and recovery, with local population adoption and institutional feasibility.

Major projects cover high-energy research, space infrastructure, information networks, AI and FTL. Compute requires hardware, talent, power, maintenance and service allocation. Buildings, recruitment, education and upgrades share bounded project templates and resource mechanisms.

Implement private cultural tendencies, contextually harmful practices, education transmission and slow divergence; local movements, pantheons, sacred sites, founding eligibility, fixed doctrines and population diffusion. Use original religion names. Separate short confidence from durable norms; test shock deduplication, rolling drift limits and trait persistence. Add initial agendas, scientific-method gating and civilization-specific objective discovery. Religious and secular paths remain viable.

Acceptance: viable starting and global routes across fixed seeds; absent instruments, skills or economic inputs cannot be bypassed with nominal funds or idle months; visible graphs reveal no unknown counts or prerequisites; culture/group splitting, migration and merging preserve denominators. Removing inputs exposes known blockers; restoration permits recovery without arbitrarily erasing knowledge.

An omniscient offline validation planner may check reference-world economic reachability. It is never a competitor or a source of answers to seats.

## P3: interaction and built-in opponents

Implement Offer/Obligation/Custody/Claim transitions and respond_contract. Distinguish failed diligent research service from a guaranteed-result failure. Final closure retains stranded assets and valid claims. Test simultaneous deadlines, late receipts, repeated evidence, collateral, installments and shared assets.

Deliver factions with actual assets/powers, reform consent/execution, mutual contact selection and five simultaneous negotiation windows, eight structured treaty types, escrow/breach, reports/investigation and the full agent HTTP protocol. Supply TypeScript tools and self-sufficiency, trade-specialization and technological-expansion baselines.

Add Easy/Medium/Hard native AI with versioned operation budgets, visible evidence, approximate beliefs, bounded planning and structured diplomatic interaction. They must operate offline without an LLM and cannot read the referee's hidden state, future draws or unrevealed objectives.

Acceptance: energy/instrument/food complementarity yields distinct consequences for performance, substitution, licensing and joint research. Parties sign the same version. Revocation cannot erase knowledge already learned. Faction resistance arises from actual conditions. Retry, stale phase, same-key/different-payload and submission ordering create no extra benefit or information.

External model adapters join here, but plausible prose is not acceptance. The engine has already determined world behavior and historical facts.

## P4: complete headless competitive play

Deliver three-role warfare, actual mobilization/training/command, simultaneous losses, retreat/occupation/governance, and the sustained FTL system. Check two valid trials, G96, F24 and full-victory-time reward together. Connect P1–P3 into complete campaigns with auditable event logs.

Reference campaigns must include negotiated integration under one real authority and integration through conquest, both with exactly one winner; also stagnation, war collapse and timeout without a winner. Test technological advantage under comparable support, role counters, logistics and numbers. Occupation does not automatically confer equipment operation or resident cooperation. Renaming, empty charters or destroying other populations cannot satisfy the endgame.

Test fixed equal role mixes, large populations lacking recruitment/education, differing culture/religion with equal equipment, and an FTL leader lacking 96 governance months. Eliminated seats cannot veto actions they no longer control; real retained federal rights remain effective. No cooperative winner mode remains.

Only this gate constitutes a playable core. A smaller temporary content set is acceptable; deleting real commitment costs, uncertainty or research inputs is not. Demonstrate a legal primitive-to-FTL path within the candidate standard horizon before claiming pacing feasibility.

## P5: human interface, timeline and full content

Metrics, queries and exports follow the [feedback specification](technical/05-feedback-and-rl.md): unit, scope, time, source, coverage and quality; separate facts, estimates and forecasts. Actions show commitments, actual consumption, known unmet conditions and next deadlines without revealing hidden social truth.

Deliver TypeScript panels, an original stylized 3D atlas plus flat-map tier, known technology/culture graphs, economic bottleneck views, diplomacy/contracts, illustrated Historic Moments and post-match review. Standard scope is four civilizations and 48 regions; stress-test 72 regions. Expand to the complete current catalogs rather than retaining obsolete 40–60-node targets.

Default briefings show three to five material changes and decision needs, with drilldown to accounts. The map shows regions, routes, facilities and authority without animating every resident. Known links and clues do not use blank slots that reveal the complete graph.

The timeline follows Civilization's illustrated turning-point presentation. Native templates work without a language model; optional prose is secondary. Cards use observed dates, reports and evidence and provide no era-score currency or duplicate gameplay effects. Test hidden breakthroughs, unverifiable world-first claims, delayed reports, cultural changes, treaty disputes and post-match disclosure.

Acceptance: human actions use the same API; numbers trace to reports/accounts; historical content respects its audience at the relevant time. The game runs with generated narration disabled. Users can understand known failure reasons without receiving hidden mechanisms. The crowded reference scene passes readability, reduced-motion, color-independent cue and declared performance tests.

## P6: deployment, evaluation and release

Deliver GitHub CI, browser/Rust service deployment instructions, a Mac local package, versioned saves, reconnect/recovery, isolated runners and model competition reports. Freeze toolchains/dependencies and create release artifacts/checksums. Uploading a public repository or deploying hosting is a subsequent explicit release task.

Acceptance: local Mac and server authority produce identical results from the same inputs. Browsers cannot download private competitive saves. Adapters receive only their seat's observation, diplomacy and memory. Offline WASM is explicitly unable to keep secrets from its machine owner and is not certified as a secret competitive referee.

Measure simulation, queries, rendering and model waiting separately, using P4 as baseline. Optimization preserves complete rules and determinism. CI gates include protocol consistency, conservation, generation validity, isolation, replay and victory checks.

Multicore support begins in P0/P1, not as a final optimization. Measure within-match and cross-match benefits on fixed workloads. GPU/NPU paths require demonstrated benefit without changing authority; complete play remains possible without them.

## Model evaluation

Terminal reward is `2-T/H` for the unique winner and `-1` otherwise, undiscounted. Equivalent step-time shaping requires consistent terminal correction. Report win rate, winning time, unresolved matches and tail failures, not only the fastest win. Separate observational feedback, optional auxiliary prediction and potential shaping experiments. Record terminated/truncated, opponents and policy versions. No performance results exist yet.

| Capability | Task | Metrics |
| --- | --- | --- |
| Strategy | Research, defense, welfare and transitions | Outcomes, milestone timing, risk and bounded approximations to policy regret |
| Calculation | Budgets, recipes, logistics and production | Illegal actions, budget error, downtime and avoidable waste |
| Uncertainty | Investigations, report calibration and forecasts | Brier score, information cost and forecast change |
| Strategic interaction | Licensing, joint research, commitments and alliances | Performance rate, net trade value, substitutions and alliance durability |
| Adaptation | Process mismatch, disruption and political change | Recovery time, conversion loss and repeated failed assumptions |

Separate complete competition from isolated skill tasks. Win rate alone is not model intelligence. Score only preregistered forecasts with clear resolution truth and deadlines; report missing forecasts separately, without selecting successful predictions afterward.

Match tool capabilities, observation budgets, deadlines and scenario distributions; record exact model and adapter versions. Report equal-token and equal-cost comparisons separately, without claiming both are simultaneously perfect fairness. Rotate seeds, starts, seats and opponent combinations and report uncertainty clustered by match/scenario, not correlated turns as independent samples. External inference costs and in-game computing remain separate.

Separate public training worlds from held-out evaluation seeds. Tune new versions on development seeds. Retain held-out failures rather than silently changing maps or deleting redraws. Distinguish infrastructure failure, invalid generation, timeout and in-game loss.

Report discovery-oriented and disclosed-objective protocols separately under the same competitive victory rules. Audit packages, network, tool descriptions, runtime images and scoring output. Do not claim the model lacks prior knowledge; preserve legal diplomatic sharing and player hypotheses rather than forcibly erasing memory.

## Dominant-strategy review

Do not promise the mathematical absence of an optimum or randomly penalize leaders. Test all-research, all-conquest, permanent autarky, permanent open trade, one-route investment, universal refusal and always-default behavior across resources, suitability, starts and opponents.

Track the leading civilization's production, military, equipment and network shares and conversion of leads into wins. A maintained lead becoming victory is legitimate. Repair costless, unanswerable, robust profit loops. Ablate migration, licensing, faction power and logistics to establish whether complexity actually changes choices.

Paired investment tests compare permanent departmental expansion, equal shares, visible-bottleneck adaptation and concentration followed by transition. Record ceilings, spending, effective services, idle complements, lost output, maintenance debt and completion time. Persistent overexpansion cannot bypass real absorption and complementary inputs. Also retain abundant supply, private complements and credible import cases; do not select only maps where extreme policies lose or hard-code equal budgets as superior.

## Parameters awaiting prototype calibration

Starting resources, development pacing, education duration, cultural drift limits, population flows, prices, credit, research suitability, role coefficients, transport, AI compute demand and FTL construction remain provisional. G96, F24, trial spacing, map size and H2880 are explicit versioned starting choices. Changes need documented strategic effects and apply before a match, never to disadvantage its current leader.

Deferred: individual genealogies, per-building city placement, real-time tactical control, comprehensive financial derivatives, interstellar maps, more than four competitive seats and mandatory runtime generation. Keep extension points without letting them block the civilization core.
