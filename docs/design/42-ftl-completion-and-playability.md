# 42. FTL completion and playability revision

Date: 2026-11-13. **Next-design specification, not implemented behavior.** Audited
commit: `fabe33b` on `zxr-creator/Before-the-stars/main`; game 0.4.0, rules 3.0.0,
protocol 2.6, native policy 1.7.0. This chapter, revised [victory](15-victory-and-ftl.md),
[agent access](43-agent-access-and-decision-packets.md) and [education](44-institutional-education.md)
take precedence over conflicting older design text. Existing saves keep their rules.

## 1. Decisions

- First completion of an **operational FTL engine project** wins. Global integration,
  conquest and universal sovereignty are removed from victory. Conquest alone never wins.
- Completion requires a physically built, commissioned engine and a verified loaded
  flight/recovery, with paid inputs and qualified operators. A research node or an
  announcement is insufficient. Fleet-wide deployment becomes an optional achievement,
  not a renamed prerequisite for victory; chapter 15 defines this deliberately narrower scope.
- Maintained education institutions automatically cultivate people. Building, expansion,
  persistent funding and broad focus replace repeated course orders.
- Keep dynamic discovery, local population culture, resource geography, production,
  regional construction and consequential diplomacy. Simplify duplicated gates and
  routine controls before adding more content.
- Reuse the authoritative Rust host and one decision contract across managed coding
  agents, external apps/CLIs and direct APIs. MCP is an adapter, not a user prerequisite.

## 2. Evidence: why current AI fails to finish

The committed [32-match calibration](../calibration/ruleset3-final-eval.txt) reports
zero winners on `eval-0..31`, with Hard/Medium/Medium/Easy, the standard calendar and
60 regions. It also reports a successful `riverland` performance-test run. Victory
is therefore demonstrated in a particular fixture but unreliable generally, not
proven impossible in every game.

After T167, deployment checks failed in 93% of sampled seat-decades, industrial
hardware in 86%, and launch/recovery in 71%. These are overlapping sample frequencies,
not independent probabilities or percentages of matches. The report also records
77–79% late joblessness, only 1/128 seats entering Space, and off-world populations
eventually dying out. Research completion alone does not repair these operating flows.

Two fresh unmodified CLI campaigns for this review both reached AD 2500 without a
winner. In `riverland`, Hard held all 60 regions, understood all 300 technologies and
had 103 valid governance months, but zero current FTL acceptance months. Commands,
hashes and failed checks are in [the audit record](../reviews/09-current-implementation-audit.md).
This is diagnostic evidence, not a new statistical calibration.

| Priority | Finding at audited commit | Required response |
| --- | --- | --- |
| P0 | `sim/victory.rs::step` requires G96/F24/trials, and `complete_trial` records qualifying flights only under global governance | Remove governance from terminal checks, recording, AI scheduling, rewards and explanations; deleting G96 alone is insufficient |
| P0 | FTL checks require authority at the world's three test nodes | Remove them from victory. Necessary materials must have viable acquisition/substitution routes without compulsory global ownership |
| P0 | Native `tables.rs` embeds full graph and victory ancestry; `research_score` protects even undiscovered critical rivals | Contradicts discovery-mode parity. Remove hidden ancestry from competitive discovery policies or label a separate informed reference policy |
| P1 | Trial completion checks a legacy regional orbital yard; launch/recovery checks a station shipyard | Use one operational service predicate in quotes, commissioning, flights and UI; isolate a regression before claiming this caused a specific timeout |
| P1 | `programme_levels` scales requirements with installed enabled capacity; site checks include all yards/bases | Bind acceptance to declared participating project assets so an unrelated extension cannot move the finish line |
| P1 | Education emits many course actions late in policy planning; population coexists with specialist shortages | Replace per-course orders with institutional service and an observable graduate pipeline |
| P1 | `lookahead()` sets policy thresholds; inspected code is chiefly heuristic, not demonstrated 12-round search | Describe difficulty honestly and judge it by completed campaigns |
| P1 | Brief packets lack dedicated era/market/space summaries; MCP section enum omits all three | Generate coverage from Observation; do not require huge full packets for essential systems |
| P1 | Action examples use obsolete small headcounts; schema mostly validates only action `kind` | Publish valid unit-aware examples and typed action variants |
| P2 | Index still says design-only, 138 technologies and 64 practices; code has 300/174 and a playable build | Distinguish historical plans, current implementation and next-design rules explicitly |

## 3. Comparison with Civilization VI

The useful lesson is readable choices. The publisher's [base-game manual](https://downloads.2kgames.com/civilization/vi/manuals/eu/CIV_VI_25TH_ONLINE_MANUAL_ENG.pdf)
describes separate science victory, technology/civic progression and geographically
placed districts. [Gathering Storm's manual](https://cdn.2kgames.com/manuals/civilization-vi/gathering_storm/2KGMKT_CIV6_Gathering_Storm_PC_Online_Manual_V7_US.pdf)
extends the science endgame through further staged space projects. Do not mix their
exact victory steps; the structural comparison below is our design judgment.

| Question | Useful lesson | Before the Stars |
| --- | --- | --- |
| What finishes the game? | Identifiable science milestones | Revealed theory → engineering → construction/commissioning → flight/recovery, with the next concrete blocker |
| Why build here? | District location makes specialization legible | Victoria-style large regions connecting mines, towns, universities, power and transport; no additional hex micromanagement |
| What should I research? | Visible dependencies and unlocks | Discovered prerequisite edges, observed benefits and evidence opportunities; unknown nodes remain unknown |
| What does culture do? | Recognizable institutional choices | Separate enacted institutions, capacity and opposition from slowly changing population culture |
| Why am I stuck? | Inspectable project production | Actual flow, reserved inputs, unmet demand and completion range, rather than fourteen equally weighted red checks |
| What needs repeated attention? | Buildings deliver continuing benefits | Schools train, factories operate and plans continue; intervene when aims or bottlenecks change |
| Why negotiate? | Trade and rivals shape development | Licenses, specialists and service contracts accelerate FTL without sovereignty transfer; supply denial remains consequential |

Do not import instantaneous cultural replacement, knowledge of the hidden graph or
abstract science points as a substitute for industrial capacity. More nodes do not
automatically mean more strategic depth.

## 4. Technology, culture and recovery routes

Keep the fixed complete 300-technology/174-practice graph within a content version;
exposure, implementation and adoption remain dynamic. This revision adds no nodes.
Recompute the prerequisite closure of the **new** engine project. Every mandatory
node must supply a named physical or organizational capability. World-government
practices, fleet doctrine and every frontier tradition must not remain mandatory
through an indirect AND edge.

Use OR gates for scientifically coherent substitutes. Steam specialization transitions
into electrical/material/scientific capabilities; steam does not power FTL. AI, cyber
and bio investments have different cost, throughput and resilience benefits; none is
a compulsory ideology. FTL remains an explicit fictional physics premise.

Path dependence should mainly come from capital, trained people, productive experience
and conversion costs. Evidence suppression must not permanently trap a viable start.
An observed failure, foreign contact or paid investigation offers recovery; no guaranteed
foreign cooperation is assumed. Every validated start has at least one reachable route
to required capabilities, though opponents can contest resources and services.

Institutions are not population personalities. A university law can improve access;
it cannot instantly make everyone scientifically minded. Population culture changes
slowly through work, education, religion, war and exchange. Show measured participation,
adoption, protests and migration; keep latent weights and exact cultural causality
private. Avoid universal rankings of cultures, religions or educational attainment.

## 5. Economy and population

Keep goods, production methods, local power, transport and operating costs. A funded
construction quote should show staffing, the institutional pipeline and alternatives
such as secondment, without requiring manually scheduled courses for every job.

Project reservations claim real stock and capacity exclusively. Priorities apply to
fuel, electricity, staff and transport as well as money. Show the consequences of
diverting farm fuel or household power. Neither project priority nor iteration order
may silently consume every input forever. Group related shortages into observable
bottleneck chains; distinguish storage, production, distribution and qualification limits.

Population is not interchangeable specialist labor. Preserve aging, births/deaths,
food/water limits, migration and slow education composition. Do not force a historical
population curve with calendar bonuses. Calibrate stagnation, industrial expansion
and modern low fertility as consequences of productive/social conditions.

A small civilization can buy genuine industrial services from a larger network. A
few million residents must not independently conjure a complete advanced supply chain,
but a single population threshold is also not a credible space-programme requirement.

## 6. Rhythm, feedback and strategy

Initially keep the current shared standard calendar: 525 rounds from 5000 BC to AD
2500 with shorter late rounds, not the obsolete 240-round design fixture. Monthly
settlement and learning continue inside rounds. Standing plans contain limits and
stop conditions; they cannot discover unseen handles or sign new treaties silently.

Automatically pass empty windows only under declared communication policies. Quiet
rounds should not require seven model consultations. Live negotiation retains five
causal windows, at most three contacts, and at most ten combined envelopes per pair
per round. Queries, format repair and network retries do not consume diplomatic
allowances or advance time. Wall-clock response speed does not buy extra decisions.

Every briefing answers what changed, what is blocked, what can be done, what is already
running and when consequences are expected. Clear feedback supplies observable facts,
not an omniscient best plan or farmable resource rewards.

| Strategy | Legitimate advantage | Constraints or exploit boundary |
| --- | --- | --- |
| Peaceful concentrated FTL | Avoid occupation costs | Domestic limits, dependencies, vulnerable project sites; no artificial anti-peace penalty |
| Conquest | Resources and capacity | War losses, reconstruction, administration and time; no territory reward |
| Maximum education | More useful capacity where demanded | Diminishing returns, teacher/student time and displaced economic investment |
| Stockpile then pause industry | Prepare a mission | Reserves cannot substitute for an engine and operating support; sensible shutdown is allowed |
| Buy specialized services | Saves capital and time | Actual delivery, expiry and exclusive reservation; no double-selling of a service slot |
| Remove obsolete factories | Releases people and upkeep | No excess salvage or retrospective completion credit |
| Follow the victory path | Focus after discovery | No hidden ancestry oracle; legitimately good planning should pay off |

No paper analysis proves absence of a dominant strategy. Compare matched starts and
rotated seats under different resources and opponents. Do not make sensible local
choices opaque merely to manufacture uncertainty.

## 7. Implementation order and evidence gates

1. Implement chapter 15 consistently: victory, trial recording, AI, prerequisites,
   panels, rewards and versioned saves. Prove a nonconquering independent FTL win.
2. Implement chapter 44: automatic institutional education and real graduate pipelines.
3. Implement chapter 43 on the existing host; correct packet omissions and schemas.
4. Update native policy: observed bottlenecks, persistent institutions, mission input
   allocation and useful imports; no compulsory integration or hidden ancestry.
5. Run complete primitive-start campaigns, not only fully researched late fixtures.

Provisional release gates: the independent FTL fixture passes; each supported start
configuration has a feasible route; at least 24/32 standard mixed-difficulty calibration
matches and then at least 24/32 frozen held-out matches yield a valid winner. These are
targets, not results. Report confidence intervals and every failure. Rotate Hard's seat,
include all-Hard matches, and measure a difficulty gradient rather than favoring seat 0.

Compare fixed high education/research/military, equal allocations, bottleneck adaptation,
steam/diesel/early electric transitions, self-sufficiency/trade and cyber/bio/AI choices.
Report wins/draws/timeouts, FTL time, bottlenecks, graduate utilization, trade dependency,
war burden, tokens/tool calls and assistance. Old statistics do not validate new rules.
