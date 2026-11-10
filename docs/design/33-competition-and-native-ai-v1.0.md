# 1.0: Competition, One to Four Players, and Native Non-LLM AI

This chapter defines v1.0 match configuration, competitive victory, control rights, and native AI. Every official mode permits at most one winner. Trade, joint research, alliances, and federations remain available, but cooperative victory is removed. The v0.8 cooperative campaign remains historical conditional accounting, not evidence that a competitive match succeeds. This is a design specification; no game implementation, performance measurement, or tournament result is claimed.

## 1. Players and seats

The standard v1.0 world starts with four civilizations. One to four externally controlled seats can be occupied by humans or external LLM agents using the standard protocol. Native non-LLM AI fills the remaining seats. Setup displays human, external-agent, and native-AI counts separately; their sum is four.

| Configuration | Participants |
| --- | --- |
| One player | One human or external agent and three native AI opponents |
| Two players | Two external seats and two native AI opponents |
| Three players | Three external seats and one native AI opponent |
| Four players | Four external seats; no additional AI is required |
| Automated evaluation or observation | Four native AIs, or a declared mixture of native and external agents; this does not introduce shared victory |

Each native opponent receives an Easy, Medium, or Hard setting before the match. Official evaluation does not change difficulty or controller version during play. A casual human takeover continues the same seat's actual knowledge, rights, economy, history, communication counters, and governance window; such a run is marked as a nonstandard evaluation trajectory.

The first release does not expand to eight strategic civilizations. Local organizations, firms, religions, rebellion, and political restructuring remain world processes. Creating an organization does not create a fifth external strategy process, communication allowance, or scoring identity. Additional strategic civilizations require a later capacity and gameplay review.

All seats share absolute simulation months and a fixed calendar of twelve months per decision round. The candidate standard horizon is H=2,880 months, or 240 rounds. The 960-month/80-round configuration is a development fixture, not another victory mode or a directly comparable ranked result. This is compressed fictional development, not a literal reconstruction of Earth's historical calendar. Courses, population ages, cultural adjustment, transport, G96, and F24 still consume actual simulation months. Primitive-to-FTL feasibility must be demonstrated before balance approval; any horizon revision occurs in a new configuration before matches begin.

## 2. One winner and complete victory time

The highest governing system actually controlled by one original seat must satisfy `G96(t) AND F24(t) AND Trials96(t)` under [15](15-victory-and-ftl.md). Conquest does not waive FTL, and FTL does not waive global integration. Renaming, temporary demobilization, or deleting population registrations cannot reduce obligations or audit scale.

- G96 requires ninety-six continuous months of effective global governance, resident services, public finance, and common security execution.
- F24 requires twenty-four continuous months of operational military FTL capability, together with manufacturing, replacement, deployment, and other required tasks inside the applicable audit window.
- Trials96 requires two qualifying loaded round trips within the last ninety-six months, at least twelve months apart, inside the valid governance period and under qualifying component and control arrangements.
- The winner receives `2 - T/H`; every other original seat receives -1. Check full eligible victory at T≤H before horizon failure; otherwise everybody remains a nonwinner. Technology, population, and alliance counts do not produce substitute champions.

Joint projects may share outputs, but research contributions do not create joint victory. Ultimate administrative, budget, and security execution must resolve to one original seat. A committee that cannot actually execute common decisions does not constitute integration. If two claimants dispute ultimate control and neither has established it, neither qualifies; request arrival order cannot choose the winner.

A charter may preserve local autonomy, representation, remedies, and property rights. Ultimate control does not permit costless confiscation: it requires actual execution of the common tasks defined by the game. Rotating a spokesperson or upgrading an administrative model is not a transfer of ultimate control. A real transfer to another strategic seat restarts the corresponding governance count.

Diplomatic and military integration are both possible. Opponents are never scripted to help one designated player win. They may trade while retaining independent manufacturing, supply, and victory options. Sustained opposition and unresolved matches are valid outcomes.

Scoring eligibility is explicit: `scoring_status` is active, forfeited, or eliminated; `EligibleWinner` means active, while actual world control is checked separately at victory. Withdrawal cannot be reversed by a caretaker completing the final month. Such completion is diagnostic and does not end other active seats' match. If no original seat remains active, terminate with no winner and −1 for all; a caretaker never creates a new scoring identity.

## 3. Separate strategic identity from world authority

A losing competitor may try to prevent the leader from winning. That is a legitimate competitive incentive. The exploit to prevent is a defeated player using an old token to veto or destroy assets it no longer controls. Commands follow actual authority, not the continued existence of a chat identity.

| Actual seat status | Allowed activity | Unavailable authority |
| --- | --- | --- |
| Effective independent sovereignty | Control authorized public assets, diplomacy, military, and institutions; pursue its own victory | Dispose of private, allied, or enemy assets without rights |
| Federal or subordinate local government with real retained powers | Plan, propose, vote, and deliver local services within the charter; seek lawful changes of power | Automatically veto every national budget or command the common military |
| Contested occupation | Use organizations and assets still actually controlled and executable; contest control at real cost | Command captured facilities merely because the old state name survives |
| Annexed and deprived of effective governance | The strategic seat is eliminated; its history and permitted observation remain | Submit government strategy, mint a new communication identity, or trigger a free global rebellion |
| Disconnected or withdrawn | Continue under the predeclared takeover procedure | Automatically donate sovereignty, assets, or historical G96 to a chosen opponent |

Elimination follows the war and political rules, not the loss of any single battle. An empty exile vessel without residents, income, or governing organization cannot indefinitely block completion. Local resistance, unemployment, cultural exclusion, religious institutions, and factional grievances continue as world processes. Eliminating a player does not erase these states, debts, or private ownership, and does not create instantly loyal workers.

If a ruler cannot execute common commands, uphold retained rights, or handle actual resistance, G96 can fail. A local proposal alone does not interrupt it; real control transfer, service failure, or collapse of enforceable authority does. Conversely, a member retaining independent sovereignty sufficient to block every common task has not been integrated merely because it is called federal.

In formal evaluation, withdrawal or permanent disconnection records -1 for the original participant. A predeclared maintenance controller takes over surviving world powers; other participants cannot select its policy. It prioritizes existing obligations, supply, and defense and may retain independent sovereignty. It does not automatically surrender, donate all assets, or create a new scoring identity. Takeover changes opponent behavior and must be recorded as a fault/withdrawal category rather than presented as an uninterrupted paired evaluation.

## 4. Native AI and its information boundary

Native AI is an ordinary competitor implemented as a deterministic program, preferably Rust, with no LLM calls. It receives the same seat-specific observations, legal queries, and receipts as a human or external agent and submits the same actions. It receives no `WorldState` pointer, complete hidden tree, unrevealed objective, foreign ledger, private cultural axis, future random event, or true opponent intention.

A proposed `bts-native-ai` module depends only on public protocol types and its own policy data. It runs in a separate process or an equivalent enforced message boundary. Sharing Rust with the referee does not authorize direct calls to a privileged forecasting function. Generic policy tables may be shared; seat histories, caches, and random state are isolated.

The complete technology and cultural graphs remain fixed by content version. The AI plans over its known subgraph. It may know generic building, investigation, budgeting, training, and negotiation actions, but it does not preload future node IDs or the shortest FTL dependency chain. Before scientific method, it uses revealed subsistence, population, economic, territorial, and resource agendas. Scientific research and terminal engineering enter its goals only after the corresponding actual revelations.

Hiding the graph is not a claim that opponents lack common sense. Public heuristics such as training specialists early or avoiding fragile supply dependence are permissible. They operate on observed conditions, without precise prerequisites or costs for currently unknown technology.

## 5. A lightweight non-LLM decision loop

The controller follows this sequence each round. During negotiation it revises only plans affected by newly delivered information; five windows do not grant five unlimited planning budgets.

1. Update its own memory: inventories, cash, commitments, courses, visible processes, report uncertainty, counterpart performance, and forecasting errors. Unknowns remain unknown or interval estimates.
2. Protect existing obligations: signed commitments, food and water, maintenance, ongoing missions, and effective rights constrain new spending.
3. Generate bounded candidates from known bottlenecks: construction, training, investigation, trade, substitutes, military planning, and institutions. Without a visible research direction, propose a concrete observation or experiment rather than a future node ID.
4. Combine complementary investments: a factory needs power, operators, maintenance, and demand. Competing projects share the same cash, labor, equipment, and diplomatic channels.
5. Compare plans using its own approximate model: forecast known cash and capacity dates; represent uncertain supplies, counterpart choices, and process adaptation with a limited scenario set and explicit assumptions.
6. Negotiate and revise within three counterpart channels and ten envelopes per pair. Read exact terms, counteroffer or decline, and preserve assets already reserved by signatures.
7. Seal the best fully assessed legal plan. When the work budget is exhausted, use completed evaluations; otherwise retain an existing plan or choose a clearly defined conservative adjustment.

Evaluation uses public task accounts and observable economic losses, never a privileged shortest path to FTL. Early proxies can include supply reliability, useful output, learning opportunities, and independence. After revelation, compare estimated complete engineering/governance time and failure risk. These internal proxies do not alter formal reward and are not guaranteed to predict victory perfectly.

Forward search maintains a reduced forecast state containing relevant known capacity, demand, qualifications, commitments, transport, and political assumptions. It does not clone the entire authoritative world for each node or ask the referee for secret counterfactuals. Opponent models use observed behavior, not exact future strategy.

## 6. Difficulty settings

Difficulty changes planning breadth, horizon, and risk treatment. Starting resources, physics, communication limits, research requirements, and observation permissions remain identical. These are candidate logical work budgets, not measured millisecond performance.

| Setting | Easy | Medium | Hard |
| --- | --- | --- | --- |
| Candidate limit per round | 12 | 24 | 48 |
| Approximate lookahead | 2 decision rounds | 6 decision rounds | 12 decision rounds |
| Total simplified search nodes | 64 | 512 | 4,096 |
| Uncertainty scenarios retained | One baseline, preserving explicit unknowns | Up to three | Up to six |
| Education and engineering | Address visible role/equipment shortages; limited preparation | Align training, equipment, and deliveries | Compare critical paths, scheduling slack, and alternatives |
| Finance and supply | Maintain essentials; avoid visible insolvency | Reserves, concentration risk, staged investment | Combined disruption, license expiry, war burden, and opportunity cost |
| Diplomacy | Structured offers, basic counters, performance checks | Compare quotations, staged guarantees, limited probing | Estimate interests, bounded bluffing, commitments, alliances, substitutes |
| Memory use | Current state and recent material events | Continuing performance, failures, and price summaries | More detailed calibration over the same legitimately observed facts |

The node cap includes all candidates, scenarios, and negotiation revisions. It is not 4,096 nodes per scenario. Hard gets no extra birth resources, science multiplier, free money, or private channel. Easy does not deliberately destroy supplies, ignore obligations, or randomly self-destruct. A simple policy may perform well in a favorable situation; Hard is not guaranteed to win every match.

All settings receive the same permitted data and protocol limits. Easy may use less of it; Hard may analyze it more thoroughly, but does not receive more accurate surveys. Paired evaluation must establish the value of extra planning. If wider search repeats a bad model, improve the model or candidate set instead of secretly compensating with resources.

## 7. Negotiation without an LLM

Native AI prioritizes the same structured contracts, offers, dates, permissions, evidence, and finite diplomatic intents available to every participant. The optional `intent` enum is `inquiry / quotation / counteroffer / claim / need / warning / alliance_proposal`, at most one per counted envelope. Optional `claims` contains at most four bounded speaker statements under the shared field contract in the [agent protocol](../technical/02-agent-protocol.md). All statement text shares the envelope's 2,000-scalar allowance and 16 KiB total; evidence references share its eight-reference ceiling. Tags organize communication; they add no truth certification or legal effect. Humans can select them through the interface, and external agents can use the same fields.

Optional structured statements about strength, stock, price, forecasts, or intention remain speaker claims. The referee validates format, known references, and permitted ranges, not private truth. Native AI estimates credibility from sources, prior evidence, performance, and consistency. It never reads a hidden falsehood flag.

Free text remains visible and recorded. A finite parser may recognize common expressions, but the controller does not claim to understand arbitrary metaphors or long arguments. When interpretation is unreliable it spends a counted message asking for price, deadline, deliverables, or verifiable terms. Unfamiliar prose cannot become automatic consent or an executable instruction. The human interface always permits creation of the same formal clauses.

Replies use parameterized text and actual policy state, without a language model. Hard may conceal a reservation price, make a limited unverified claim about intention, or use a real alternative as leverage. It cannot forge referee signatures, physical stock, court records, or independent experiments. Repeated retellings of one source do not become independent evidence.

With four starting civilizations, the three-counterpart limit can cover every opponent. It therefore constrains negotiation depth, mutual participation, and payload rather than necessarily forcing a scarce partner choice. Refusing mutual selection can preserve information but sacrifices new agreements that round. Evaluation must not claim that this cap alone creates strong selection pressure in a four-state world.

## 8. Why cooperation still matters inside competition

A may sell nonexclusive knowledge to B and use the payment to secure energy. B shortens research; both improve relative to C and D. The decision depends on price, scope, B's visible progress, A's alternative investments, and future risk. Neither permanent secrecy nor unrestricted licensing is universally superior by definition.

Temporary defensive coalitions can prevent early control of a strategic region and dissolve when interests change. Joint research can share expensive experimentation, but output rights, verification, and later manufacturing remain explicit. A shared project does not create a shared victory subject. Excessive secrecy can sustain a bottleneck; excessive dependence can create coercive leverage.

Because all nonwinners receive -1, the reward cannot mathematically guarantee that a losing player never retaliates, favors a winner, or abandons future chances. Native AI may use declared tie preferences among approximately equal winning prospects: preserve future independence, meet affordable existing obligations, and avoid futile losses. These are not extra formal points. Humans and external agents may behave differently. Real authority, costs, and exploit checks constrain abuse; an omniscient rule must not force permanent cooperation.

## 9. A conditional four-civilization competitive endgame

This is a new competitive review case, not a relabeling of the v0.8 cooperative M336 result. M0 is an industrial checkpoint near planetary engineering with the endpoint already revealed. Teams, inputs, and battle records still need a complete scenario definition. The case checks logical compatibility, not a simulated war or macroeconomy.

| Period | Interaction and conflict | Conditions that must actually hold |
| --- | --- | --- |
| M1-24 | Riverland A buys a limited control-process license from Clearbay B; B funds its own materials and energy program. Greenreach C and Farcape D retain independent options. | B has a real competitive use for the revenue. No sovereignty or shared victory is sold. |
| M25-48 | D raises quotations for new transport; A honors existing obligations while constructing an alternative. B seeks a supply coalition with C to constrain A. | Old deliveries cannot be canceled retroactively; substitutes consume actual resources and alliances use counted signatures. |
| M49-72 | Others observe A's engineering lead and refuse to transfer independent budgets or forces. Some trade continues. | Research cooperation does not produce global integration; A still needs an actual control strategy. |
| M73-120 | In this selected success branch, A pays for war and political takeover, then restores local services. | Battle, supply, occupation, and population records must support the result. A failed branch can bankrupt A or let B lead. |
| From M121 | Common finance, security, and local services first qualify, starting G96. Former seats without effective authority cannot command captured assets. | Local rights and real resistance remain; eliminating a seat does not erase reconstruction or displacement duties. |
| M170-193 and M182-205 | Two independently operable lines produce standard components C1 and C2 using actual rights, equipment, and qualified work. | Each takes 24 manufacturing months. Completion is M193/M205 and availability the following month. |
| M193-216 | Existing qualified P0 and mission organizations sustain F24, with real trials, deployment, replacement, and relief crews. | The starting window has actual capacity; future C2 cannot fill an earlier shortfall. |

In this branch, P0 has passed task replication and first-teacher validation by M24. E024 runs for 48 effective months in M25-72; graduates become usable in M73 and continue training and operational practice. War and reconstruction still require maintenance of the prototype and teams; an old certificate is not proof of current capability.

The conditional audit dates are:

- G96: M121-216, 96 months.
- F24: M193-216, 24 months; both new components finish inside the window.
- Different components complete loaded round trips in M193 (P0) and M205 (C1), twelve months apart and inside valid governance. C1 is available from M194.
- Three-node tasks occur within M194-199. C2 is available from M206; replacement and relief-crew validation occur in M207, followed by continued operation.
- At M216, valid rights, all active responsibilities, per-node services, and a funded following twelve-month support plan must still hold.
- For this isolated development fixture with H=360, A receives `2-216/360=1.40` and the other original seats receive -1. It is not the standard H=2,880 campaign or a measured difficulty result.

If balancing succeeds, war destroys instructors or lines, or services fail after takeover, M121 cannot start G96 and M216 is invalid. If B retains real independent sovereignty, its statement that it will cooperate cannot satisfy integration. Losing one imported service requires repricing and replanning, not automatic permanent loss of an FTL branch.

The case shows why a single winner requires actual political outcomes and why early mutual benefit does not imply eventual shared victory. It does not prove war is always optimal or A must win. Peaceful concentration of authority remains possible when supported by real rights and contemporary incentives, rather than default friendliness.

## 10. Determinism, multicore execution, and work budgets

Native-AI effort is bounded by candidate/node evaluations rather than whichever branch finishes before a wall-clock cutoff. Candidates use stable ordering; independent evaluations may run in parallel and merge deterministically. Thread count, network arrival, and hardware speed do not alter the chosen policy. Any exploration random stream has a separate sealed policy seed, never the world's private random key.

A one-player match with three Hard opponents allows at most 12,288 simplified node evaluations per round, including negotiation revisions. It is not multiplied by five windows. Nodes operate on relevant known aggregates and projects instead of copying every historical event and population group. State size, computation cost, and elapsed time must be measured in P0/P1; no unsupported latency promise is made.

World settlement and AI planning have separate performance accounts. CPU multicore can evaluate different seats and independent candidates, without sharing private memories. GPU/NPU hardware is not required. Rendering, chronicle prose, and external-LLM waiting do not enter the native policy's logical work budget.

Persist `controller_kind, difficulty, policy_version, policy_seed, observation_version, own_memory, evaluated_node_count, pending_commitments, selected_contacts, sealed_action_refs`. Recovery continues the same policy and committed facts, without rerolling plans or resending signatures. Identical observation history, policy version, and policy seed should yield identical sealed actions.

## 11. Required counterexamples and evaluation

| Check | Required result |
| --- | --- |
| Single-player setup | Three actual competitors, not an uncontested construction sandbox |
| Easy and Hard at the same start | Identical resources, physics, observations, contracts, and message limits; differences trace to policy work |
| Unknown future technology | No future-ID project or referee shortest-path query; investigation addresses a known problem |
| False statement | Native AI may suspect, ask, or be deceived, without a truth oracle |
| Arbitrary prose | Explicit limited understanding or requests for structured terms; no tool execution or automatic consent |
| Refused sovereignty transfer | Joint research follows existing terms; global integration still fails |
| Eliminated seat replays commands | Unauthorized action rejected; residents, factions, property, and debts remain |
| Autonomous local member | Acts only within retained rights; no invented national veto or free rebellion |
| Withdrawal/disconnection | Original participant cannot win; fixed takeover does not donate the world to a chosen opponent |
| New company or helper AI | No new seat, diplomatic allowance, search budget, or RL identity |
| Simultaneous control claims | Ambiguous actual authority prevents victory; arrival order does not select a winner |
| Difficulty comparison | Rotate worlds, seats, and opponents; report win rate, completion time, unresolved games, and failure tails |

Record survival and maintenance failures, effective education and idle projects, candidate coverage and prediction errors, net licensing gains, occupation burdens, complete victory, and political deadlock. Exploration and revealed-objective configurations may differ in information, but both remain competitive with at most one winner. Cooperative victory must not be restored to conceal difficulties in achieving a competitive endgame.
