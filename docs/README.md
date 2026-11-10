# Before the Stars — documentation index

The current design version is **v1.0**. This is an English-language, design-only repository. It contains designer knowledge, hidden mechanisms and eventual objectives; it is not a competitive player or agent handbook. Existing JSON schemas are historical drafts, not the current API.

## Start here

1. [Complete v1.0 plan](design/30-complete-plan-v1.0.md): product, scope, time, interconnected systems, victory and development gates.
2. [Knowledge and culture](design/31-knowledge-and-culture-v1.0.md): a fixed complete graph, dynamic discovery and implementation, prerequisite corrections, culture and education.
3. [Population and education](design/32-population-and-education-v1.0.md): the simplified computational representation, conserved flows and preserved strategic feedback.
4. [Competition and native AI](design/33-competition-and-native-ai-v1.0.md): four civilizations, 1–4 external seats, three built-in difficulties, a unique winner and a competitive paper case.
5. [Art, interface and chronicle](design/34-art-interface-and-chronicle-v1.0.md): stylized atlas, known-graph interface, shared information panels and Civilization-inspired Historic Moments.
6. [System audit](reviews/08-v1.0-system-audit.md), [release notes](releases/v1.0-review-package.md), and [development roadmap](development-roadmap.md).

## Core rules

| Document | Subject |
| --- | --- |
| [01 Game framework](design/01-game-framework.md) | Control, actions, clock and competitive completion |
| [02 Civilization systems](design/02-civilization-systems.md) | Resources, economy, production, population and research accounts |
| [03 Technology and culture](design/03-technology-and-culture.md) | Fixed complete graphs and dynamic known content |
| [04 Politics and diplomacy](design/04-politics-and-diplomacy.md) | Faction powers, commitments and strategic interaction |
| [05 Warfare](design/05-warfare.md) | Technology, three roles and military constraints |
| [06 Information and history](design/06-information-and-history.md) | Evidence, uncertainty, projection, records and memory |
| [07 Dynamic cultures](design/07-dynamic-cultures.md) | Eight private tendencies, slow change and local divergence |
| [08 World generation](design/08-world-generation.md) | Seeded geography, resources, replay and secret genesis |
| [09 Objectives and discovery](design/09-objectives-and-discovery.md) | Initial agendas, scientific method and gradual revelation |
| [10 Religion](design/10-religion.md) | No religion at start; local founding, fictional names and fixed doctrines |
| [11 Settlements and education](design/11-settlements-and-education.md) | Cities, villages, extraction, industry and education networks |
| [12 Population and development](design/12-population-and-development.md) | Population constraints, crises, low fertility and bottlenecks |
| [13 War resolution](design/13-war-resolution.md) | Recruitment, training, command, simultaneous losses and occupation |
| [14 Contract resolution](design/14-contract-resolution.md) | Partial delivery, research failure, breach, custody and settlement |
| [15 Victory and FTL](design/15-victory-and-ftl.md) | Global authority, sustained military capability and terminal reward |
| [16 Knowledge and culture engine](design/16-knowledge-and-culture-engine.md) | State transitions, evidence, adoption, experience and slow transmission |
| [29 Diplomacy communication](design/29-diplomacy-communication-v0.8.1.md) | Three counterparts, ten pair envelopes, five windows and protected rights |

## Content catalogs and development routes

| Document | Subject |
| --- | --- |
| [17 Technology atlas](design/17-technology-atlas-v0.6.md) | 138 nodes; known science, extrapolation and explicit FTL premise |
| [18 Cultural atlas](design/18-cultural-atlas-v0.6.md) | 64 practices; economic prerequisites, rights and population adoption |
| [19 Education and transmission](design/19-education-and-transmission-v0.6.md) | 24 courses, teaching capacity, founding teachers and actual qualifications |
| [20 Dynamic development](design/20-dynamic-development-v0.6.md) | Fixed graph, local discovery, transitions and historical feedback |
| [21 Production chains](design/21-production-chains-v0.7.md) | Quality, energy, capital, operation, maintenance and training |
| [22 Technology strata](design/22-technology-strata-v0.7.md) | Six traditions with three interoperable capability layers each |
| [23 Industrial development](design/23-industrial-development-v0.7.md) | Industrial decisions, scientific corrections and interfaces |
| [24 Decision value and exploits](design/24-decision-value-and-exploit-boundaries-v0.7.md) | Large legitimate gains versus ledger, authority and timing exploits |
| [25 AI, cyber and bio industries](design/25-ai-cyber-bio-industries-v0.8.md) | Nine applications; talent, energy, samples, validation and rework |
| [26 Late contracts and strategy](design/26-late-game-contracts-and-strategy-v0.8.md) | Seven rights layers, partial failure, knowledge sharing and incentives |
| [27 First-game mental model](design/27-first-game-mental-model-v0.8.md) | Primitive start, observations, decisions and discovering the endgame |
| [28 Postindustrial plan](design/28-postindustrial-plan-v0.8.md) | The historical v0.8 integration baseline, subject to v1.0 overrides |

## Engine and interfaces

- [Architecture and data](technical/01-architecture-and-data.md): Rust authority, TypeScript views, state ownership and deployment.
- [Agent protocol](technical/02-agent-protocol.md): scoped observations, queries, nineteen action types, sealing and receipts.
- [Mechanism engine](technical/03-mechanism-engine.md): shared constraints, deterministic multicore execution and optional acceleration.
- [Native agents and isolation](technical/04-native-agents-and-isolation.md): external agent operation, referee separation and staged objectives.
- [Feedback and RL](technical/05-feedback-and-rl.md): equivalent data, diagnostics, terminal scoring and measured performance requirements.
- [State variable catalog](technical/06-state-variable-catalog.md): authoritative, derived and observed variables; units and owners.
- [Monthly engine specification](technical/07-monthly-engine-spec.md): phase order, actual operations, shared resources and settlement.
- [Contract index](contracts/README.md): historical machine schemas and pending written migrations, including [v1.0](contracts/v1.0-design-addendum.md).

## Reviews and historical plans

- [v0.3 audit](reviews/01-design-audit-v0.3.md): contradictions, exploit risks and candidate dominant strategies.
- [Early campaign walkthrough](reviews/02-campaign-walkthrough.md): conditional development, war and industrialization examples.
- [v0.4 cases](reviews/03-v0.4-cases.md): war, contracts, population and victory transitions.
- [Historical evidence and limits](reviews/04-historical-evidence-v0.4.md): hypotheses, population registration, low fertility and regional differences.
- [Budget strategy comparison](reviews/05-budget-strategy-comparison.md): education, research, military and bottleneck adaptation.
- [Industrial route comparison](reviews/06-industrial-route-comparison-v0.7.md): matched 120-month steam/diesel/electrical fixtures.
- [Postindustrial campaign](reviews/07-postindustrial-campaign-v0.8.md): the explicitly historical cooperative M336 paper case; not current competitive proof.
- [v0.4 plan](design/00-v0.4-plan.md) and [v0.5 engine plan](design/00-v0.5-engine-plan.md): translated historical planning baselines.
- Release records: [v0.7](releases/v0.7-review-package.md), [v0.8](releases/v0.8-review-package.md), [v0.8.1](releases/v0.8.1-review-package.md), [v1.0](releases/v1.0-review-package.md).
- [References and design boundaries](references.md): primary research, inspirations and what the sources do not establish.

## Authority and retained requirements

Chapters 30–34 take precedence for v1.0 scope, graph corrections, population simplification, competition, native AI, art and timeline. Recipes and industrial strata remain in 21–22 and advanced applications in 25. Current monthly timing and variable ownership live in technical/07 and technical/06. Warfare, contracts and sustained victory use 13–15; communication uses 29. Earlier documents that describe cooperative winners, a 4–8-seat product target, all-pixel rendering, per-household population or changing complete graphs are historical where explicitly marked and do not override v1.0.

The design preserves primitive development, no initial religion, real educational and industrial investment, local cultural population shares, technological military advantage, comparable same-tier roles, consequential diplomacy, uncertain information, real governance after conquest and FTL on every winning path. Original art and a readable interface do not alter the common information boundary.

The current content baseline is 138 technologies, 64 practices, 24 courses, 34 recipes, 10 capital modules, six transitions, eighteen tradition layers and nine advanced application packages. Counts do not establish balance. The same content version has the same complete graphs in every match; only world conditions, evidence, visible graphs, implementation and adoption differ.

Freeze `ruleset_version`, `content_version`, `generator_version`, `protocol_version` and policy versions before a match. No live update may change victory, timing, secrets or economics. All machine-contract migration, SDK generation, engine development, client development, model adaptation and release deployment remain future work.
