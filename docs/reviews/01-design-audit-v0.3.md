# Global design audit: v0.2 → v0.3

Historical review dated 2026-11-08. [v0.4](03-v0.4-cases.md) later supplied core war/contract transitions and stronger FTL acceptance. [v1.0](../design/30-complete-plan-v1.0.md) supersedes cooperative winners, scope, population detail and presentation. Unclosed items below describe the v0.3 stage.

The review covered gameplay, architecture, protocol, generation, isolation, roadmap and machine drafts. It used documents and paper scenarios, without writing or running the game. A “repair” means specified rules, not measured adversarial validation.

## Findings

The main problem was incomplete settlement and authority boundaries, not insufficient content. Existing rules did not establish the absence of obvious strategies: symmetric unit roles have a directly calculable equilibrium; a cooperative mode allowing universal alliance is not equivalent to competition; permanent population expansion, research priority and early religion still need prototype tests.

Prioritize free returns, repeated resource use, information leaks and unreachable completion. Costly, observable and counterable deception, breach, monopoly and refusal remain strategic behavior rather than prohibited exploits.

## Problems and design repairs

| ID/severity | Problem/exploit | v0.3 repair | Check |
| --- | --- | --- | --- |
| A01 Blocking | Minimum input followed by an efficiency multiplier can exceed material limits | Methods change unit inputs/capacity before taking the minimum; debit together | Raw material 12/input 2 example |
| A02 High | Reserving an entire long window's budget forces excessive cash hoarding | Reserve next month on a rolling basis; future receipts are not cash; distinguish pause/breach | Monthly cash example with 600 |
| A03 High | Player orders last one month but private actors act throughout a 12-month round | One-time orders and standing procurement share budget/information rules | Standing food procurement |
| A04 Blocking | Confused availability of production, trade, consumption and transit duplicates goods or starves starts | New goods next month; existing local stock can transfer/consume; cross-region delay ≥1 month; opening reserves | Economy and generation |
| A05 High | Split orders collect remainders; related accounts farm turnover, support and price signals | Net/allocate by actual control; measure net output and resident supply; real manipulation risk remains | Economy and agendas |
| A06 High | Agriculture/population dominate because industry and urban services lack burdens | Separate real agricultural, industrial and urban capacity, maintenance and opportunity costs | Economy and culture |
| A07 Blocking | Attributes, known_effects, causal history and Boolean conditions reveal culture model | Eight internal tendencies private; expose population, conduct, provenance and testable inference | Information and protocol |
| A08 High | Universal safe custody/refunds bypass early institutional capacity | Actual organization, route, fees and enforcement; failure/partial delivery states | Diplomacy |
| A09 High | Rights grant triggers full payment for unusable rights or an unowned process | Separate rights, records, training, engineering and staged acceptance; check disposal authority | License example 180 |
| A10 High | Tiny first research contribution buys every future result; remote compute is invented | Deliver new stages under explicit contribution conditions; bind compute to facility/service/network | Compute example |
| A11 High | Renaming/new entities erase debt; principal/interest/project income duplicate | Unique money/debt ledgers; inherited responsibilities; enforce only actual held collateral | Diplomacy and engine |
| A12 High | Signature/withdrawal/expiry use inconsistent places and times | Fixed registry, absolute months, arrival and same-month rules; bounded pending reservations | Slow-communication example |
| A13 High | Rebuilt experiments, split groups/armies or IDs generate new draws, minimum gains or attacks | Canonical real plans, flows, theaters and responsibility lineages; preserve remainders | Economy, culture, war |
| A14 High | A symmetric counter matrix is presented as inherently complex choice | Acknowledge equal-share blind baseline; add mission, preparation, transport and supply context | Warfare |
| A15 Blocking | Victory requires a charter needing two signatures, making total conquest unwinnable | A sole actual government can satisfy governance without eliminated-seat signatures | Framework |
| A16 High | Shared-future and sole-winner incentives are conflated; losers assumed to cooperate | Separate evaluation and allow refusal/unresolved games; v1.0 later removes shared winners | Framework and endgame |
| A17 High | Round-based acceptance shrinks with calendar; population deletion/splitting shrinks obligations | Absolute months and persistent resident/disorder/resettlement responsibility | R80 unresolved case |
| A18 Medium | Switch to an easy agenda just before old work completes; farm donation counts | No retrospective credit from new commitments; actual benefit/responsibility; duties persist | Agendas and culture |
| A19 High | One civilization monopolizes founders by splitting movements; religion monopolizes services | One founding eligibility per civilization; no duplicate training credit; secular services viable | Religion |
| A20 Medium | Floating geography rounded at the end contradicts cross-platform determinism | Canonical generation, explicit predicates, saved golden worlds; no unverified seed-equivalence claim | Architecture/generation |
| A21 High | v0.2 schemas expose culture/effects and omit standing/milestone fields | Freeze historical drafts; written migration required before current seat use | Contract directory |
| A22 Blocking | Primitive starts require modern wages, tax and money to build anything | Real reserves, reciprocity and labor organization first; later cities/treasuries/money | R1–R8 |
| A23 High | Regional totals provide free shared services/instant commute; students/soldiers still fully produce | Settlement/hinterland nodes, land, local reach and one hours ledger | 1000-hour example |
| A24 High | Undefined slow culture can be accelerated by repeated events/rebuilding; harmful traits become permanent ethnic labels | Three timescales, rolling limits, evidence duration and shock deduplication; local reformable practices | Culture and war cases |
| A25 High | Population/average education directly multiply military power; culture effects duplicate | Verify actual recruitment/training, then equipment/readiness/supply; no universal cultural multiplier | Personnel snapshot |

Blocking means core rules/fairness would fail; High changes major strategy or produces systematic advantage; Medium concerns boundaries/calibration. All repairs require implementation verification. This is not a completed runtime vulnerability report.

## Candidate dominant strategies

| Candidate | What can be concluded | Remaining condition/counterexample |
| --- | --- | --- |
| Permanent equal thirds | Explicit conservative equilibrium with symmetric cost and blind contact battle | Missions, transfer deadlines, corridors and maintenance must make composition matter |
| Research then a generation of weapons | Comparable readiness should give technological advantage | Engineering, training, production and logistics must prevent free compounding |
| Maximum population | Strong with low congestion and ample supply; no artificial penalty required | Housing, services, education and resource congestion need observable marginal costs |
| Permanent openness/trust | Contact can have long-run value; openness is not unconditional credit | Institutions, absorption, enforcement and dependence, not abstract openness penalties |
| Autarky | Rational with high disruption risk | If autonomy is as cheap as trade, trade loses purpose; compare layouts and recovery |
| Always specialize/outsource | Rational with complementarity and credible supply | Stock, reserves, prices and blockade can make redundancy valuable |
| Always default on unsecured loans | May be rational in endgame/conflict | No responsibility reset; real collateral/refusal, not omniscient reputation punishment |
| Always contribute minimally to joint research | Old rules enabled near-free riding | Explicit voluntary contribution conditions; real public-knowledge spillovers remain legal |
| Rush religion | Scarce founding positions genuinely create early competition | Religious spending competes with farming/cities/industry; secular basic capabilities remain reachable |
| Universal early alliance | Expected under historical shared-future incentives | Not evidence of zero-sum diplomacy; current competition needs real control conflicts |
| Stall/refuse integration | Can be preferable to helping a rival win | Permit unresolved horizon; no forced loser-signature script |
| Farm easiest short-term agenda | Must not yield generic reward or reset duties | No repeated ownership of one outcome or free trust from switching |

Accurate accounting, maintenance and avoiding waste may remain broadly good principles. The concern is a complete costless action sequence that requires no judgment about context or opponents, not every sound habit.

## Concrete scenario coverage

The [four-civilization walkthrough](02-campaign-walkthrough.md) used four civilizations, 24 regions and 80 annual decisions in a compressed content fixture. It tracked surplus, religion, city/process divergence, licensing, disruption, limited war, AI, FTL and integration. Only selected accounts were arithmetically checked; intermediate dates and political reactions were explicit scenario assumptions, not simulated outputs.

Counterexamples show that efficiency cannot double absent material, future tax is not cash, short/long blockades change investment comparisons, supply failure can negate a technological advantage, and two FTL trials can still leave governance incomplete. They do not prove no dominant policy or replace a closed economy and stable long-term population test.

## Unclosed items at the historical stage

1. Complete recipes, skill development, population flows, institutions and research times were unfinished; an 80-year fixture made no historical-speed claim.
2. Casualties, capture, preparation, occupation and mission capacity needed a complete calculable table rather than a single effective-strength formula.
3. Custody failure, collateral loss, distant enforcement and disputes needed bounded state transitions, without expanding into a complete legal simulator.
4. Structural map reachability did not prove affordable supplies, startup stocks or alternatives.
5. Hidden culture needed learnable evidence without revealing its truth table. Controlled comparisons should measure whether paid investigation changes predictions/actions.
6. Documents could not prove multicore speed, cross-device determinism or isolation; these remained implementation gates.
7. Current machine schemas and fields had not been generated; historical examples could not be presented as executable new contracts.

The original review completed broad inspection and paper accounts but did not start P0. Later documents close some transitions and retain parameter/prototype gates explicitly.

## Original validation scope

The v0.3 review checked local links, code fences and trailing whitespace in 23 Markdown documents, 25 audit IDs, and selected cash, hours, food deficits, energy comparisons, population shares and governance-month arithmetic. It did not run a game, historical simulation, competitive balance, multicore benchmark or isolation test. Old JSON format checks did not certify the newer protocol. These are historical reported checks, distinct from v1.0 release validation.
