# Information, uncertainty and history

Uncertainty comes from unknown world conditions, limited observation, interested parties' reports, social responses and other players' plans. Action syntax, property rules, financial commitments and verifiable delivery standards are public. Internal response functions, including cultural mechanisms, are not. Players investigate these relationships; hidden models are not permission for arbitrary adjudication. The v1.0 visual chronicle is the Civilization-inspired [Historic Moments timeline](34-art-interface-and-chronicle-v1.0.md), governed by these information rules.

## Information categories

| Category | Examples | Presentation |
| --- | --- | --- |
| Verifiable facts | Central cash, escrowed goods, completed own experiments | Exact value and verification time |
| Incomplete observations | Distant population, mineral quality, enemy capacity | Source, time, range or explicit absence |
| Interested reports | Local grain stores, merchants' supply promises | Reported value, author and historical reliability record |
| Endogenous unknowns | Local costs of a new process, suitability of research | Uncertainty that paid experiments may reduce |
| Opponent choices | Reservation price, future deployment, secret projects | Signals, commitments and inference; no omniscient probability |
| External shocks | Weather, equipment failure, disease spread | Bounded random processes, potentially regionally correlated |

Do not add uniform random noise to every panel. Intervals must come from the seat's evidence and public models, not hidden truth used to manufacture an always-correct range. Record researchers', players' and reporters' confidence separately; none automatically constitutes an objective probability.

## Visibility

Every player output passes through `ObservationProjector`: API, map, tooltip, history, export, error and SDK. Unknown, unauthorized and nonexistent IDs all return `NOT_VISIBLE_OR_UNKNOWN`, without revealing node tier or name.

The complete latent technology and cultural graphs, other civilizations' private state, seeds, random streams and future events never enter competitive clients or agent directories. An offline browser sandbox may hold a complete world, but cannot serve as a trusted secret referee against the owner of that machine.

Discovery-oriented evaluations also isolate unrevealed objectives, future-content documentation, designer manuals and the scorer. Tool descriptions, SDK help and runtime images are part of the audit. Current legal actions retain public settlement semantics. A model may already know the eventual objective from training or experience; acceptance tests prevent unauthorized reading and verify actual revelation, rather than claiming to erase prior knowledge. See [objectives](09-objectives-and-discovery.md) and [isolation](../technical/04-native-agents-and-isolation.md).

## Cultural and cross-system causal isolation

| May be supplied | Must not be supplied directly |
| --- | --- |
| Survey-covered cultural shares, occupations, migration and facility accounts | Eight internal cultural values, evolution equations, thresholds and weights |
| An organization's stated demands, recorded participation and historical changes | The true causal graph connecting culture to technology, resources, geography, religion and war |
| Public charters, actual adherent commitments, visible project costs and legal powers | Hidden statements such as a doctrine adding a precise amount to industrial preference |
| Attributed explanations, survey inferences, evidence and uncertainty | Guaranteed explanations or success probabilities calculated from referee secrets |

This boundary applies to human panels, agents, MCP descriptions, `known_effects`, `known_requirements`, EntityView properties, errors and chronicles. Hiding one graph screen is insufficient. Known legal and material conditions may be shown; undiscovered social acceptance conditions cannot leak through `satisfied: true/false`. An investigation produces actual samples and reviewable inferences, not a truth table.

A report may say that more surveyed households accepted workshop jobs after new housing opened. The engine cannot state that water provision raised a hidden urban preference by 700 basis points and triggered an industrial culture. Players may hypothesize such a relationship; the system cannot skip their inquiry by supplying the answer.

Private causal input references and before/after state hashes remain private. Player events use separate visible handles and filtered evidence references; `evidence_refs` or `input_events` cannot recursively expose hidden conditions. An unobserved cultural revision must not change public revision numbers, page counts or summary lengths to signal a secret.

Syntax and budget errors concerning verifiable own state may be detailed. Submission checks visible legality only. A hidden condition that fails during execution produces the observed outcome and a conditional-execution failure, not a preflight oracle.

Diplomatic free text is opponent-provided game data. Adapters label sender and provenance, never treat it as system instructions, and do not let it change tool permissions, budgets or rules. Prompt-injection resistance can be evaluated separately from world-state authorization.

## Three historical records

1. Fact events: changes actually committed by the engine, supporting replay and audit.
2. Observation records: what a seat learned, when, and from whom; potentially incomplete or false.
3. Chronicles: readable aggregation that distinguishes facts, reports and conjectures.

Facts are append-only. Corrections and renaming create records rather than overwriting past reports or names. Entities retain stable IDs; views may show historical and current names. Replay branches carry their own `branch_id` and parent checkpoint and cannot silently become the official history.

## Fact-event structure

Required fields include `event_id`, simulation month, rules version, entity references, event type, direct state changes, input-event references, visibility rules and relevant decision IDs. Optional fields include project milestones, quantity breakdowns, name snapshots and process IDs.

An event relationship records conditions or inputs used during settlement; it does not prove that one policy uniquely caused a historical result. Counterfactual explanation requires isolated replay and comparison of possible outcomes. An LLM must not invent causation from temporal sequence.

## Moments and processes

| Category | Examples |
| --- | --- |
| Technology | First discovery, verified process, large-scale adoption, transition, FTL trial |
| Economy | Trade-route formation, prolonged disruption, industrial relocation, debt default |
| Population | Major migration, disaster deaths, broad education, changing skills |
| Culture | Practice emergence, cultural divergence, religious organization, persistent share changes |
| Politics | Reform, faction coalition, regime change, independence, federal charter |
| Diplomacy and war | Treaty, breach, blockade, major battle, occupation and integration |

Select significant moments by relative impact, persistence, novelty and chosen subjects while retaining raw facts. Aggregate slow processes across intervals, such as a twenty-year transition from food self-sufficiency to import dependence. Later significance can be added as an annotation; it cannot rewrite settlement. In v1.0, these become illustrated timeline cards with optional supporting detail. Their creation grants no currency, progress or score.

## Collective memory

Memory belongs to population groups and organizations and preserves event references, attributed interpretation, intensity and reach. War, relief, breach and migration can change trust and acceptance. Later performance, generational replacement, education and migration alter that influence.

Structured rules compute memory effects. Literary text generated by an LLM never directly changes trust or cultural shares. A government may fund education or commemoration but cannot erase engine truth; controlling public narratives and controlling facts are distinct permissions.

## Queries and evaluation

Players query authorized history by region, organization, project and time. Results are paginated, source-linked and cursor-bound; fixed-rule summaries are available. Queries neither advance time nor reroll randomness. Actual exploration, audit and experiments are paid game actions.

Full-world disclosure is possible after a match with authorization. Live omniscient spectators use separate sessions and storage and cannot feed information back to competitors. Elimination alone does not grant omniscience. Evaluation records observation references, commands, external tool budgets and outcomes. Forecasts are submitted and sealed before their events occur.

Generation failures, defective content templates and cheating leaks are environment defects, not strategic wins or losses attributable to a model.
