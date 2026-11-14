# Before the Stars: Game Framework

> **2026-11-13 design precedence:** this chapter retains historical rules where it
> describes global-integration/fleet-wide victory, mandatory manual courses, or
> native access to unrevealed victory ancestry. For the next ruleset use
> [42: playability](42-ftl-completion-and-playability.md),
> [15: FTL completion](15-victory-and-ftl.md),
> [43: agent access](43-agent-access-and-decision-packets.md), and
> [44: institutional education](44-institutional-education.md). These are design
> changes awaiting implementation, not modifications to existing saves. Other
> nonconflicting rules and the later ruleset-3 calendar remain applicable.

The player leads a political community across generations, influencing society through government, organizations, and contracts. Technology creates possibilities; the economy and population provide the means to realize them; factions and culture shape cooperation; other civilizations change benefits and risks. The central decisions are which bottleneck to address next, whether to build internally or cooperate, and how much dependency and political cost to accept.

## Scope and scale

The world is an original pre-interstellar planet. A standard game begins with a hunting and gathering community possessing simple tools, basic reserves, and rudimentary cooperation. Agriculture, settlement, cities, and state institutions develop during play. The endpoint requires sustained global political integration, verified military-wide FTL capability, and qualified trials. Galactic warfare and a central black hole belong to a possible sequel. Cities become the main centers of government, supported by rural settlements, extraction, industry, and transport; see [settlements and education](11-settlements-and-education.md).

This is a designer-facing specification. In exploration configurations, initial player information contains population, economy, territory, and known-resource agendas. An abstract technology-development objective is unavailable before scientific method. Evidence and capabilities reveal the ultimate mission; see [objectives and discovery](09-objectives-and-discovery.md). Initial populations have no religion; local beliefs emerge during play.

| Item | Vertical prototype | Complete v1.0 target |
| --- | --- | --- |
| Civilizations | 4 | 4 total; 1–4 human or external-agent seats, native AI fills the rest |
| Strategically meaningful regions | 24 | 48–72 |
| Major factions per civilization | 3 | 3–5 |
| Common material categories | 6 | 6, with critical materials distinguished when needed |
| Technology capability groups in the default interface | 24–30 | 40–60, excluding purely narrative entries |
| Cultural practice groups in the default interface | 12–18 | 20–30 |
| Concurrent major projects per civilization | Usually 2 | Limited by organization, personnel, and facilities |
| Decision rounds, excluding negotiation subwindows | Approximately 80 in development fixtures | Candidate standard: 240 |

Visual map pixels are not economic simulation units. Rendering may show abundant terrain detail while settlement operates on a limited number of regions and edges. Population is aggregated; separate character records exist only where they affect decisions. The v1.0 population specification governs aggregation, replacing unnecessary combinations of demographic attributes.

Capability-group counts are readability targets, not deletion limits for latent knowledge. The 138 technologies, 64 practices, and later process variants introduced in v0.6 can be instantiated and grouped as needed. Grouping must preserve scientific prerequisites, real inputs, and qualifications. Undiscovered content is not displayed as empty locked slots. [The v0.8 first-game walkthrough](27-first-game-mental-model-v0.8.md) remains a historical explanation of development and accounting; its cooperative outcome is not a current victory mode.

## Player authority

Players may invest in public facilities, set taxation and public procurement, direct education, fund research, propose institutional reform, sign agreements, wage war, and organize forces. Private and local organizations hold their own assets and interests; a command cannot confiscate all resources without cost.

Changes of government do not automatically change player identity. An annexed state that loses effective governing authority loses the corresponding strategic commands. A subordinate member can act only within rights it actually retains. Eliminated seats cannot command an invisible parallel state or issue unlimited vetoes; local populations, factions, resistance, and obligations remain simulated. Disconnection does not donate sovereignty or assets to another player. Observers and map editors use separate permissions outside official matches. See [competition and native AI](33-competition-and-native-ai-v1.0.md).

## Core loop

1. Examine current reports, project progress, faction demands, and known external changes.
2. Select investigations and update beliefs about resources, processes, and other civilizations.
3. Exchange offers and messages, negotiate, and sign exact agreement versions.
4. Submit budgets, construction, research, reform, production, and military plans.
5. Resolve production, transport, population, politics, research, and warfare together, generating the next observation.

Standing policies and contracts execute automatically. A round normally asks the player to address three to five important changes. There is no universal action-point resource: money, materials, personnel, organization, and time impose the limits.

## Time and phases

The authoritative time unit is the simulation month, `SimMonth`. The candidate v1.0 standard uses exactly 12 simulation months per decision round and a common horizon of `H = 2880` months, or 240 rounds. Every civilization uses this same clock. There is no adaptive calendar by era, private event, or individual civilization's technological level. This is compressed fictional development, not a literal reconstruction of Earth history over 240 years.

A 960-month, 80-round configuration is a development fixture only. Its results are not directly comparable to standard competitive results. Courses, demographic transitions, culture, maintenance, and victory windows retain their specified durations in actual simulation months. The prototype must demonstrate feasible primitive-to-FTL development before the standard horizon receives balance approval. Any horizon revision must be versioned before a match, never made during play. Standing production, budgets, and relief plans execute monthly within each round. See the [engine plan](00-v0.5-engine-plan.md) and [monthly engine](../technical/07-monthly-engine-spec.md), subject to this v1.0 clock override.

Round phases are `observe -> contact -> negotiate[0..4] -> plan -> resolve`. Seats simultaneously seal up to three communication partners. Mutual selection opens the round's channels, followed by five simultaneous negotiation windows. Each pair shares a maximum of ten directed diplomatic envelopes per round, including proposals, counteroffers, and new signatures. Plan-phase signatures consume the remaining allowance. Limits do not reset by contract, interface, model copy, or window. Existing contract performance and narrowly defined rights-protection operations continue despite exhausted chat allowances. With four civilizations, three peers are all possible opponents: this cap is not itself a forced choice between partners. See [communication protocol](29-diplomacy-communication-v0.8.1.md). Official matches accept no new commands during resolution.

Civilizations develop independently. No global era gate unlocks technology for everyone, and another state's advance grants neither research progress nor extra time.

## Development tiers

| Tier | Main capabilities | Main bottlenecks |
| --- | --- | --- |
| 0: Subsistence and agricultural settlement | Gathering, hunting, tools, and storage develop into farming and settlement | Food risk, labor, land, and local cooperation |
| 1: Urban crafts | Writing, specialized crafts, regional trade | Transport, knowledge transmission, taxation, and raw materials |
| 2: Powered machinery | High-temperature processes, instruments, power, machine manufacture | Energy cost, skilled labor, and conversion investment |
| 3: Industrial networks | Standardization, chemicals, large-scale energy, communications | Complementary industries, finance, labor, and infrastructure |
| 4: Information and intelligence | Electronic computing, digital networks, AI | Hardware, compute, electricity, data quality, and technical personnel |
| 5: Planetary engineering | Orbital industry, high-energy experiments, advanced materials | Global supply, engineering coordination, and experimental reliability |
| 6: Interstellar threshold | Complete FTL systems and repeated trials | Sustained integration of multiple capabilities |

Tiers classify content and military capabilities; they do not grant uniform national modifiers. A country may have tier-4 computing alongside tier-2 agricultural organization. Importing advanced equipment does not create domestic manufacturing competence at the same tier.

## Victory

A single political authority must satisfy **military-wide FTL acceptance AND effective global integration**. Total conquest does not replace FTL. One engine or two prototype flights are insufficient: manufacture, training, command, deployment, maintenance, and replacement must function as a real system, maintaining mission capability for 24 consecutive months and completing fixed-scale standard tasks. [Victory and FTL](15-victory-and-ftl.md) defines the authoritative tests and reward.

Global governance must persist for 96 simulation months. At least two successful trials must occur within the applicable governance window, separated by at least 12 months. Governance, military capability, and trials are checked together at each month end. A failed condition resets only the continuity it invalidates; acquired knowledge remains. Decision-round boundaries do not shorten these requirements.

The user confirmed scoring by complete victory time. For the fixed horizon `H` and first complete victory time `T`, the winner receives `2 − T/H`. Every other original seat, including eliminated seats and unresolved games, receives `-1`. Pure FTL time is recorded separately and does not replace the objective. Kills, population, GDP, and research-node counts earn no additional formal reward. Step rewards, early exit, and feedback isolation are defined in [RL specifications](../technical/05-feedback-and-rl.md).

Global integration brings all surviving sovereign polities and affected actual residents under one ultimate dispute-resolution and external-security system. Never-inhabited territory without governing facilities need not be individually occupied. A sovereign polity requires actual residents, governing organizations, revenue, and independent diplomatic authority. An escape ship or shell company cannot postpone the ending forever. Nor may a player erase governance duties by emptying a region: people displaced, deprived of services, or left in disorder by war create continuing obligations tied to their communities and origin regions. Actual resettlement, governance, or reconstruction closes these obligations; migration, subdivision, or registry edits do not.

Every official v1.0 game is competitive and has at most one winner. The winning original seat must continuously exercise ultimate administrative proposals, budget execution, and common security command, supported by an effective charter or the actual records of a sole government. Names, rotating titles, research contributions, secret transfers, and last-round renaming do not establish control. A real transfer of ultimate authority restarts the relevant governance continuity for the new holder. Other players can contest authority through charter procedures, negotiation, or war.

There are two legitimate integration paths. A federation can transfer actual powers under an effective charter. After complete conquest, a sole government may instead meet the same obligations without signatures from eliminated seats. Conquest must first establish durable control, services, and political execution; an annexation announcement cannot qualify immediately. Both paths face the same monthly audits of administration, common budgets, security orders, and resident services.

Alliances and joint projects can be profitable without producing shared victory. Competitors need not sign permanent transfers that guarantee their defeat. They may trade, form temporary coalitions, alter votes, or obstruct a rival's victory. Unresolved games are legitimate; the design cannot assume rational rivals eventually consent. Equally, a conquered seat without actual powers cannot retain an unlimited off-world veto. [The competition chapter](33-competition-and-native-ai-v1.0.md) defines these authority transitions.

A verified surviving polity can prevent an unintegrated rival from winning. Only registered and actually governed polities count. Creating shell subdivisions does not reset verification; a real revolt that defeats governance can. Checks use actual authority and resident services, not a one-time self-reported population or nominal charter.

Current action rules, including sovereignty qualification, are public. Final verification windows and service thresholds are fixed in a committed private match manifest and fully disclosed to a seat when it discovers the objective. Revealed-objective configurations provide them from the start; exploration configurations do not. Both are competitive. No player can change victory rules during a match. At the horizon, failure to qualify yields an unresolved result with development and survival diagnostics, not an improvised score champion.

Original scoring seats, controller types, difficulty, and the ruleset are sealed at setup. Actual alliances, representation, and local rights may change through real agreements and institutions. Companies, model copies, and local subdivisions create no extra winning seats, diplomacy allowances, or RL trajectories. Native Easy, Medium, and Hard AI have identical resources, observations, and legal commands; differences concern bounded planning and decision quality, not hidden information. Historical cooperative examples remain archived analyses, never an available v1.0 victory mode.

## Playability boundaries

The rules need not make every choice equally good. Scientific verification, maintenance, and reliable accounting may offer broad benefits while still requiring money and time. Depth arises from differences between feasible strategies under different circumstances.

There are no production penalties based on leaderboard position, compulsory collapses based on dynasty age, or secret resources for trailing civilizations. Powerful states can win, but must pay actual coordination, maintenance, occupation, and dependency costs.

Every new variable must change available actions, outcomes, risk assessment, or explainable feedback. Detail without a demonstrated role is deferred.

Scoring eligibility is separate from political power: only an original seat with active scoring status may win. Forfeited/eliminated seats remain at −1; caretaker achievements are diagnostic. At T=H, check eligible complete victory before timeout. If no active original seats remain, terminate without a winner. Existing-charter motions and ballots use bounded set_policy templates under the old charter, with real delivery and no free-form diplomatic bypass; see [politics](04-politics-and-diplomacy.md) and [protocol](../technical/02-agent-protocol.md).
