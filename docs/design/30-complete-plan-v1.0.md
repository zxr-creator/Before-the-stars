# Before the Stars — complete v1.0 design plan

> **2026-11-13 design precedence:** this chapter retains historical rules where it
> describes global-integration/fleet-wide victory, mandatory manual courses, or
> native access to unrevealed victory ancestry. For the next ruleset use
> [42: playability](42-ftl-completion-and-playability.md),
> [15: FTL completion](15-victory-and-ftl.md),
> [43: agent access](43-agent-access-and-decision-packets.md), and
> [44: institutional education](44-institutional-education.md). These are design
> changes awaiting implementation, not modifications to existing saves. Other
> nonconflicting rules and the later ruleset-3 calendar remain applicable.

Status: design only. No game engine, renderer, native opponent, executable contract migration, or performance benchmark is delivered by this document. All repository documentation is maintained in English. Designer documents contain secrets and must not be mounted into a competitive seat's environment.

## 1. Product and scope

Before the Stars is a competitive civilization strategy game for humans, external agents, and built-in non-LLM opponents. It begins with primitive, nonreligious communities and ends only when one political authority can govern the inhabited world and sustain an operational FTL military system. Technology drives expansion of what is possible; resources, production, education, population, institutions, trade and other civilizations determine what is actually achievable.

The central player problem is to build a dependable civilization while making commitments to actors whose interests, capabilities and information differ. Money is useful but cannot instantly produce qualified people, trustworthy agreements, working instruments, public acceptance or functioning supply networks. Strong decisions can generate large advantages. The design must eliminate free duplication and unauthorized actions without flattening legitimate strategic success.

| Product choice | v1.0 decision |
| --- | --- |
| Mode | Competitive only; at most one winning strategic seat |
| Seats | Four total civilizations; 1–4 external human/LLM seats, with built-in AI filling vacancies |
| AI-only use | Evaluation/observation configuration under the same competitive rules |
| Built-in AI | Easy, Medium, Hard; no hidden-state access or resource bonuses |
| Platform | Browser client with Rust authority; local Mac application with the same Rust rules |
| Languages | Rust simulation and match services; TypeScript interface, tools and adapters |
| Visual direction | Original stylized 3D strategy atlas, with a fully functional flat-map rendering tier |
| Chronicle | Civilization-inspired illustrated Historic Moments timeline, with optional evidence detail |
| Strategic geography | 48 regions in the standard scenario; 24-region development fixture; 72-region stress fixture |
| Content baseline | 138 technology nodes, 64 cultural practices, 24 education courses, 34 production recipes, 10 capital modules, 6 industrial transitions |
| Advanced content | Steam, diesel, electrical, AI, cyber and biological traditions, three capability layers each; nine postindustrial application packages |
| Simulation scale | Aggregated settlements, facilities, formations, population groups and contracts; no individual life simulation |

The four-civilization limit is deliberate v1.0 scope, not an engine requirement to encode four into every data structure. Larger matches are a later version. A one-player match still has three real competitors. Four humans need no extra AI civilizations. A human and an external agent occupying one seat share its permissions and communication budget.

## 2. Rules authority and compatibility

This chapter is the current product entry point. [31](31-knowledge-and-culture-v1.0.md), [32](32-population-and-education-v1.0.md), [33](33-competition-and-native-ai-v1.0.md), and [34](34-art-interface-and-chronicle-v1.0.md) override earlier text on their respective subjects. The current catalogs retain stable content IDs. Historical reviews remain evidence of specific paper calculations, not proof of whole-game balance or the current competitive endgame.

| Subject | Detailed authority |
| --- | --- |
| Technology, culture and education content | [17](17-technology-atlas-v0.6.md), [18](18-cultural-atlas-v0.6.md), [19](19-education-and-transmission-v0.6.md), with v1.0 corrections in 31 |
| Production and transitions | [21](21-production-chains-v0.7.md), [22](22-technology-strata-v0.7.md), [25](25-ai-cyber-bio-industries-v0.8.md) |
| Population and education execution | 32, with the current [variable catalog](../technical/06-state-variable-catalog.md) and [monthly specification](../technical/07-monthly-engine-spec.md) |
| War, contracts and victory | [13](13-war-resolution.md), [14](14-contract-resolution.md), [15](15-victory-and-ftl.md), with competitive interpretation in 33 |
| Diplomacy | [29](29-diplomacy-communication-v0.8.1.md); v1.0 retains its exact limits and rights protections |
| Information, agent access and isolation | [06](06-information-and-history.md), [agent protocol](../technical/02-agent-protocol.md), [isolation](../technical/04-native-agents-and-isolation.md) |
| Art, panels and chronicle | 34 |

The v0.1/v0.2 JSON schemas and examples remain explicitly historical, translated for readability. They are not a v1.0 executable API. A future implementation must migrate the written contract and generate matching SDKs before admitting formal competitors. Preserve rules, content, generator, protocol and policy versions in every match.

## 3. Time and the round loop

The authoritative unit is one simulation month. A standard decision round advances 12 months for everyone. The initial standard horizon is 2,880 months, or 240 rounds. An 80-round/960-month campaign is a development fixture, not a different cooperative mode or a directly comparable ranked benchmark. A match never changes speed because one civilization reaches a new era.

This is a compressed fictional development history. It does not label 240 simulated years as a literal reconstruction of thousands of Earth years. Course durations, aging, maintenance, transport, cultural persistence and victory windows use the same actual simulation clock. Do not accelerate births or instantly graduate students to make a historical-looking date fit. Primitive-to-FTL feasibility within the candidate horizon is an implementation acceptance gate; this design does not claim it has already been demonstrated.

Each round: receive an authorized observation and receipts; choose diplomatic counterparts simultaneously; conduct five simultaneous negotiation windows; seal plans; settle twelve monthly steps; issue updated observations and a short timeline recap. Planning and queries do not advance time. Existing standing orders and valid commitments continue according to their rules; not opening a panel cannot suspend a subsystem.

Within each month use the ordered resource, movement, production, service, population, conflict, institutional and observation subphases in the monthly specification. Shared resources are reserved once and reconciled before commitment. Decisions cannot consume outputs that become available only in a later phase. Age histograms rotate on fixed annual boundaries. Local cultural lineages update on their specified event or scheduled cadence, retaining monthly and rolling twelve-month drift limits; querying them never accelerates either process.

## 4. The world and the economy

Generate a seeded, causally connected geography: terrain and basins; water and climate; correlated geology; soils; transport corridors; viable initial settlements. A secret referee root preserves uncertainty in competitive matches, while versioned generation and saved genesis data support replay. Decoration cannot affect resource draws or experiments. Every accepted start needs food, water, development space and a costly but viable autonomous survival route.

Cities are organizational centers supplied by rural food production, extraction sites, workshops, industry and transport. Rural settlements remain strategically meaningful. Land, water, labor, equipment, energy, skilled services and transport capacities are limited. A map cell is not a resident, and a decorative building is not a separate facility.

Production uses explicit recipes and quality requirements. Inputs are consumed once; output is bounded by the scarcest required service. Capital construction, operating inputs, repairs, replacement and decommissioning have separate accounts. Energy grades, material quality and location matter. A payment cannot substitute for a missing machine, route, teacher or operating right.

Government controls its real assets, procurement, taxes, infrastructure, public projects and legal powers. Private actors operate using bounded decision rules and their own balance sheets. The state does not freely allocate every worker or seize every private inventory. Before monetary institutions, projects use real goods and labor obligations; no modern treasury is invented at the primitive start.

Markets reconcile actual orders, cash or permitted credit, custody and transport. Domestic and foreign trade share the same physical constraints. Licenses, qualified services, data access, instrument calibration and joint research create strategic interdependence beyond raw commodities. A useful specialization can yield a large surplus; the recipient may learn to substitute, diversify or acquire the supplier. There is no automatic tax on whoever leads.

## 5. Fixed complete graphs, dynamic development

The full technology and cultural-practice graphs are identical in every match using the same content version. Seeds do not remove nodes, randomize scientific dependencies or choose a different final tree. Dynamic experience arises from what each civilization has observed, investigated, demonstrated, can afford to operate and has actually adopted.

Separate knowledge, an engineering method, a functioning facility, and diffusion. Imported equipment can provide a service without transferring the ability to manufacture it. A published theory can be known without sufficient instruments to reproduce it. Losing a factory removes production capacity, not every surviving record and trained person.

Discovery uses relevant observations, practical problems, contact, replication and deliberate exploration. Existing strengths bias cost and attention; they do not permanently prohibit another branch. Every accepted world must retain a paid route to obtaining new evidence outside its current specialization. Repeating an already-paid observation cannot create unlimited discovery rolls.

Steam and diesel are industrial traditions, not magical alternatives to electromagnetism or computation. They can build useful surplus and capital before transitioning through electrical systems, precision materials, electronics and space engineering. Early electrification can be excellent where supply and skills support it; it can also create underused assets. AI, cyber and biological applications are task-specific packages with energy, hardware, talent, data, validation and maintenance costs. AI governance is an institutional arrangement subject to capability and legitimacy constraints, not an unavoidable final government.

Known science, speculative engineering extrapolation and the explicit FTL premise are labeled separately in designer content. FTL is not claimed to follow from established propulsion science. The late game offers different supply and organizational routes to shared capability tests, not mutually exclusive fantasy physics.

## 6. Culture, religion, institutions and education

Culture belongs to population groups and local histories. The hidden attributes summarized in 31 influence participation, trust, transmission, occupation and institutional behavior through actual choices. They are not a final national multiplier on research, money or combat. A culture can value agriculture, industry, cities, trade, exploration or learning differently, and different groups within a polity can move in different directions.

Experience accumulates slowly. Geography changes opportunities; production changes livelihoods and influence; education changes access to methods; religion and war shape obligations and interpretations. Short-lived confidence changes faster than durable norms. A severe shock can create a reform opportunity, but repeated provocations cannot reroll culture or instantly reverse a whole population. The full causal equations, axes and thresholds remain private.

Cultural practices have material and organizational prerequisites. Knowing an institutional idea is not the same as being able to sustain it. Population adoption is gradual and local; legal reform, institutional capacity, consent and actual conduct can diverge. There is no universally superior cultural identity or predetermined historical ranking of real peoples.

No religion exists at the beginning. Local movements, ritual gathering, a founding process and real organization can establish fictional religions using a Civilization-inspired founding sequence. Founding doctrines become fixed; institutions, followers, resources, political relationships and interpretations can change. A secular route remains viable. Religion names never directly multiply fertility or military strength.

Education supplies actual reading, numerical, reasoning and professional capabilities. Twenty-four courses require learners with prerequisites, teachers, facilities, materials and time. An ancient society cannot buy universal advanced education before the supporting knowledge and surplus exist. Raising a budget ceiling does not produce extra teachers or absorb idle graduates. Temporary concentration can be rational; permanent expansion beyond complementary capacity has real opportunity costs.

## 7. Population: preserve the feedback, remove the life simulator

Use sparse, joint population blocks with compact annual age vectors and maintained qualifications, as specified in 32. Preserve correlations that matter for mobilization and employment: location, culture, religion, access, status and skills. Do not independently sample each marginal share and accidentally invent a population of highly trained, willing recruits that does not exist.

Remove household marriage and parity states, individual pregnancy/recovery queues, multiple disease-specific SIR models, monthly individual occupation searches and continuously recomputed personal skill scores. Classes, recruitment, migration and casualties allocate people from the same source ledger. Important minorities are retained explicitly; performance limits cannot silently assimilate them.

Births, deaths, migration and aging remain separate conserved flows. Growth is constrained by food, water, health, housing, time and support. Development can lower mortality while high child-rearing costs, delayed formation of families and norms reduce births. This can produce stagnation and aging without famine. Food pressure, war, dislocation and service collapse can produce crisis losses. Registration coverage is distinct from actual population: a falling census is not automatically mass death.

These mechanisms generate hypotheses about historical patterns, not scripts that force a real civilization to stagnate or dominate. Large populations create potential and obligations; only trained, equipped, supplied and organized people become useful military capacity.

## 8. Politics, war and diplomacy

Factions own assets, command organizations, claim rights and make commitments. Their resistance is expressed through unavailable cooperation, legal powers, labor, investment and enforcement, not an unexplained universal penalty. Negotiation, compensation, reform, enforcement and alternative suppliers are real responses.

Each military technological layer has three mutually countering roles. Technology changes equipment and supported capability; effective strength also requires trained specialties, command, supply, transport, morale expressed through behavior, and a feasible mission. Superior technology has a genuine advantage under comparable support. Population size alone is not combat power. Recruitment, training, deployment, simultaneous losses, retreat, occupation and government restoration are separate transitions.

Culture, religion and education affect willingness, legitimate obligations, task cooperation, training completion and qualified command. Do not apply the same effect again as a national combat multiplier. Conquest does not instantly grant working factories, skilled operators or public compliance. It also does not leave a genuinely eliminated player with an unlimited veto over the winner's lawful actions.

Diplomacy retains at most three selected counterparts per seat per round and at most ten envelopes total in both directions for each pair. Mutual selection opens a channel; five simultaneous windows prevent real-time click races. With four civilizations, three counterparts can include every opponent, so the partner cap does not create a scarce choice by itself; the ten-envelope limit, timing, information and commitment costs still matter.

Deception, probing, bargaining and temporary alliances are permitted. Authenticated authorship does not certify truth. Structured signatures create enforceable commitments only when all delivery, authority and reservation conditions hold. New proposals and signatures count; existing narrow rights such as valid withdrawal, breach notice or contract response remain executable without free-form messages. Multilateral treaties do not create an unlimited group-chat bypass.

Technical licenses distinguish knowledge already transferred, continued access, manufacturing rights, support, exclusivity, derivative rights and data. Partial performance settles by milestone and actual custody. Honest research failure is different from failing to contribute or falsifying a promised result. Spent resources do not reappear, learned knowledge is not erased, and delayed delivery does not become immediate because a registry exists.

## 9. Competitive completion and reward

Cooperation can create mutual economic benefits, but there are no team or shared winners. A treaty title cannot satisfy global integration. The winning seat must hold the actual, enforceable world authority described in 15 and 33, including real responsibilities to inhabited places. A federal arrangement counts only if it establishes this authority; equal independent allies remain competitors.

All conquest paths still require FTL. All FTL paths still require global integration. The standing acceptance is **G96 AND F24 AND Trials96**: 96 continuous valid governance months; 24 continuous months of the required FTL military system; and two valid loaded round trips separated by at least 12 months within the applicable rolling 96-month window. Independent manufacture, multiple deployment nodes, replacement capability, trained substitute personnel and funded future support prevent prototype or tiny-army shortcuts.

For the unique winner at month T with T ≤ H, reward is `2 - T/H`; every nonwinner, elimination, forfeiture or completed horizon without victory receives `-1`. Only an active, eligible strategic seat may win; caretaker completion after forfeiture is diagnostic. At month H, check eligible full victory before declaring a timeout. If no eligible seats remain, end without a winner. Use undiscounted return. Partial milestones, money, population, culture, diplomacy and timeline cards are diagnostics, not alternate rewards. Legitimate rapid construction can win; discarding inhabitants, obligations or capability requirements cannot.

Quitting does not transfer sovereignty. Reconnection and fixed caretaker policies preserve state; formal benchmark withdrawal is recorded as failure. Elimination does not provide live omniscient observation. The new conditional competitive case in 33 is distinct from the historical cooperative M336 paper case.

## 10. Built-in opponents and agent-native operation

Built-in AI uses the same visible observations and legal actions as a human or LLM seat. It maintains a bounded belief state, generates candidate plans, estimates opportunity costs and risk with an approximate model, and revises after receipts. Easy, Medium and Hard differ in candidate breadth, planning horizon, contingency handling and deterministic computational work budgets. They do not receive extra supplies, secret technologies, true intentions or future random draws.

Built-in AI is complete without a network connection or language model. Structured diplomatic intents, offers, evidence and contract terms support interaction with both humans and LLMs. Free text is allowed, but a native opponent must not pretend to understand arbitrary prose as a binding agreement. Public intent tags are claims and may be deceptive; they are not a referee truth service.

Codex, Claude Code and other external agents operate through versioned HTTP/MCP/CLI interfaces using their own scoped observation, memory and command receipts. They do not need mouse control. Tool descriptions, error messages, documentation, saved files, assets and chronicle export share the information boundary. The entire designer graph is absent from competitive seat packages. A locally owned offline world cannot provide the same secrecy against its machine owner as a remote trusted referee.

Before scientific method, agendas concern survival, growth, territory, resources and practical improvement. Abstract scientific and eventual FTL objectives appear only through the specified discovery process. No system can guarantee that a previously trained model has forgotten the game; isolation prevents unauthorized access and measures actual discovery, not magical removal of prior knowledge.

## 11. Feedback, presentation and performance

Players receive compact round changes and can drill into full authorized accounts. Costs, reservations, work completed, observed blockers, deliveries, deadlines and forecast assumptions are explicit. Estimates remain distinguishable from verified facts. Feedback is fast because settlement and queries are efficient, not because training time or obligations disappear.

The visual map shows the growing relationship between cities and their hinterlands. The known technology/culture graphs show discovered possibilities and real implementation. The Civilization-style chronicle shows illustrated accomplishments and reversals, with evidence available one level deeper. It never grants bonus resources or leaks a rival's hidden breakthrough through a global-first badge.

Rust uses staged, deterministic multicore calculation within matches and parallel execution across matches. Shared resources are arbitrated once using stable logical keys. Counter-based secret draws, fixed-point authoritative arithmetic and deterministic reduction prevent thread order from changing outcomes. The baseline remains CPU-verifiable. GPU rendering and optional nonauthoritative analysis can accelerate presentation; NPU-based optional writing does not determine world truth.

Native AI search runs outside the authority's hidden state. Headless evaluation omits graphics and prose while preserving all rules. Performance targets in 32–34 and the feedback specification must be measured on declared hardware, including worst-case faction, contract and population fragmentation. There are no measured performance claims in this release.

## 12. Development gates and what remains to be proved

| Gate | Deliverable and acceptance |
| --- | --- |
| D0: content and contract freeze | Resolve cross-file rules, graph edges, units, resource conservation, information boundaries and population simplification; label every open parameter |
| P0: authoritative foundation | Versioned state/commands, double-entry custody, idempotency, stable randomness, replay, permissions and multicore equivalence |
| P1: survival and development | Primitive economy, villages/cities/extraction, population blocks, real education and maintenance; viable starts without free inputs |
| P2: dynamic knowledge and institutions | Fixed complete graphs, active discovery, engineering transitions, local culture, religion founding and delayed goal revelation |
| P3: strategic interaction | Contracts, licenses, joint research, limited diplomacy, factions, three native-AI difficulties and scoped external agents |
| P4: full competitive campaign | War, real global control, full FTL acceptance, terminal scoring, stagnation and failure; primitive-to-FTL completion under declared conditions |
| P5: visual and narrative product | Reference scene, human panels, graph interface, illustrated timeline, accessibility, exports and information-leak review |
| P6: deployment and evaluation | Mac/web packaging, reproducible releases, recovery, held-out competition, throughput and isolation reports |

The [development roadmap](../development-roadmap.md) retains detailed gates. No implementation starts in this revision. The review package is a complete design baseline, not a claim that emergent balance is solved.

Required strategy comparisons include permanent education/research/military priority; fixed equal shares; observed-bottleneck adaptation; early concentration followed by transition; steam/diesel/early electrical routes; self-sufficiency versus specialization; license versus own development; cooperation versus denial; and AI/cyber/bio combinations. Evaluate identical starts with matched opponents and documented changes, across resource distributions and shocks. Do not select only scenarios that make a preferred policy win.

Keep large returns from correct judgments: an early instrument license, a timely training cohort, a credible temporary alliance, a reserve supply route or a well-chosen conversion can avoid years of delay. Repair a strategy when it obtains resources, knowledge, authority, random trials or rewards without paying the defined costs. Do not repair it merely because it beats the designer's expected plan.

Deferred scope: more than four strategic seats; interstellar-map play; individual dynasties and family trees; per-building city placement; real-time tactical battles; full financial derivatives; runtime generated 3D worlds; and mandatory generative narration. These extensions must not delay the core competitive civilization loop.
