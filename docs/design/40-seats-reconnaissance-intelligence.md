# 40. Seats, reconnaissance, intelligence and raiders (ruleset 3.0 addendum)

> **2026-11-13 design precedence:** this chapter retains historical rules where it
> describes global-integration/fleet-wide victory, mandatory manual courses, or
> native access to unrevealed victory ancestry. For the next ruleset use
> [42: playability](42-ftl-completion-and-playability.md),
> [15: FTL completion](15-victory-and-ftl.md),
> [43: agent access](43-agent-access-and-decision-packets.md), and
> [44: institutional education](44-institutional-education.md). These are design
> changes awaiting implementation, not modifications to existing saves. Other
> nonconflicting rules and the later ruleset-3 calendar remain applicable.

Status: design addendum and plan changes; no code and no `content/` file is changed by
this chapter. It extends `36-ruleset-3-history-resources-trade.md` (doc 36),
`37-eras-space-buildings-military.md` (doc 37) and `38-cities-migration-transport.md`
(doc 38), which stay normative wherever this chapter does not change them, and it is
written alongside `39-deeper-trees-boost-stations.md` (doc 39, deeper trees, boost and
space stations; in draft in a parallel worktree), whose content and ID ranges it
references and does not duplicate. It is written against branch `ruleset3` as it stands
(slices 0-4 committed: calendar, population, knowledge pacing and the Earth-like world;
resources, goods and productivity in progress). Chapter 06 and technical chapter 04
remain the authority on the information boundary; this chapter adds rules inside that
boundary and never relaxes it. Decisions the user should confirm are in
`40-open-questions.md`.

The user asked (verbatim): "and for the number of civiliations, there can be more, for
larger map there can be up to 10 civilizations. the number can be set in the beginning.
and onething to adapt the civilzation settings: there should be scouts to reco the map,
and with tech development there are something like better scout, ,more trade, satellite
to get more intel. the issue of information is also a big decision point for ai. the
information of other civil shouldn't be transparent, ther should only be partial
information for other civil(unless the other civil decide to share intel) this will
greatly improve the importance of decision making."

A later request (verbatim): "please add barbarians to the unexplored places, just like
civilzation 6. so that a civil cannot only expand, it also need military to clean the
barbarians to expand. the barbarins' tech would grow so fast like civilization 6 though."

**Interpretation of the second request.** Independent hostile peoples (in the game:
**raiders**, living in **raider camps**; the plain label "barbarians" is used in the
almanac and the glossary) occupy unexplored, unclaimed regions. They block settlement,
raid neighbouring regions (taking goods, killing people, damaging works) and must be
cleared, bought off or absorbed before the land can be settled. Their equipment keeps
pace with the world (it follows the median civilization's military generation), so they
remain a real threat in every era, but it is capped one generation below the leader so
they never out-tech the leaders. Camp people are real people of the world's population
model. **This reverses doc 36 open question 12** ("no non-player polities; unclaimed
regions are empty until settled"): raiders are non-player peoples. They are not polities:
they have no economy beyond foraging and plunder, no diplomacy channel, no research, no
seat, no score and no victory. Chapter 30's deferred-scope item "more than four strategic
seats" and the four-seat limits of chapters 30 §1 and 33 §1 are also lifted (section 2).

Every number marked *provisional* is a starting value for calibration; units,
identities, orderings, formulas and invariants are not provisional. Integer arithmetic
only (bp, `i128` products through `util::muldiv`, keyed draws from the world secret).
Nothing is created from nothing: scouts, agents, raiders and aircrew are people from the
population ledger; every intelligence capability costs goods, qualified people, works and
time; and seats see only their own state, what they observe and what others choose to
share.

---

## 0. Summary for the player

**Two to ten civilizations.** At setup you choose the map size and how many
civilizations share it: two on a small world, four on the standard one, up to ten on a
huge Earth-like planet of 160 regions. Every seat can be a person, a built-in AI or an
LLM agent. Starts are checked for fairness: comparable land, water and resources
nearby, similar room to expand and similar raider pressure.

**You do not know what you have not seen.** The map starts dark beyond your home and its
neighbours. Land you have explored stays on your map (coasts, terrain, rivers and,
once surveyed, resources), but armies, raider camps, building sites and the size of
foreign towns are only as current as your last look: your map shows "seen in 1712" next
to them. What you see now comes from your own regions, your armies, your scouts and
later your watchtowers, radar, aircraft and satellites.

**Send scouts.** A scout party is a few hundred real people with food and tools who walk,
ride or sail into the unknown. They find good land, rivals and raider camps, and some
never come back. Later eras bring riders, ships of exploration, motor patrols, aerial
photography and finally reconnaissance satellites that photograph a few regions each
month from orbit.

**Rivals are reports, not numbers.** You never see another civilization's exact
population, army, stocks or research. You see estimates with a range, an age and a
source ("2.1-3.0 million, merchants' reports, 1650"). Trade, embassies, spies, radio
intercepts, cyber intrusion and satellites make the range narrower and the report
fresher, but every source has its own blind spots, so asking the same question again
never sharpens the answer: only a better or different source does. Rivals can guard
their secrets (at a cost to their own trade and learning), hide armies under camouflage
and even feed you false impressions for a while. A technology you have never discovered
yourself appears in a rival's file only as "a technology of the Modern era in
electricity".

**Spies are people.** An intelligence bureau trains agents from your scribes, scholars
or programmers. They live abroad, report on a rival's armies, economy, treaties or
research, can carry home evidence that speeds your own research, and can be caught, which
costs you trust and possibly a treaty.

**Sharing is a choice.** A treaty can share your maps, your current sightings, your
estimates of third parties or, for arms control, certified figures about yourself.
Allies who share see more; but what you share can leak, and a partner who knows your
army can use it against you.

**Raiders hold the wild lands.** Unclaimed regions hide raider camps. They raid your
borderlands for food and tools, kill people and damage works. You cannot settle a region
a camp holds: clear it with an army (and decide whether its people scatter or become your
subjects), pay it tribute, hire its warriors as mercenaries or, with patience, bring it
into your civilization peacefully. Raiders arm themselves with whatever the world around
them uses, so they never stay spearmen, but they are always a step behind the strongest.
As the world fills up, camps vanish.

### 0.1 At a glance

**Seat counts and map presets** (section 2.2; region counts are land regions of the
Earth-like world; numbers of camps provisional):

| Preset | Regions | Seats allowed | Recommended | Regions per seat (recommended) | Start spacing | Initial raider camps | Camp cap | Religion founding slots (recommended) | World population peak (target) | Real-Earth option |
| --- | ---: | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- |
| Small | 24 | 2-3 | 2 | 12 | ≥ 4 links | 2 | 4 | 2 | ~1.0 B | - |
| Standard | 48 | 2-5 | 4 | 12 | ≥ 4 links | 5 | 8 | 3 | ~2 B (doc 36) | `earth48`, 2-5 seats |
| Large | 96 | 4-8 | 7 | 13.7 | ≥ 4 links (3 if needed) | 10 | 16 | 6 | ~4 B | `earth96`, 4-10 seats (behind the cut line) |
| Huge | 160 | 6-10 | 10 | 16 | ≥ 3 links | 16 | 26 | 8 | ~6.7 B | - |
| (fixture) 72 | 72 | 3-6 | - | - | ≥ 4 links | 7 | 12 | 3-5 | ~3 B | - |

**Intelligence means by era** (section 4; requirements are technologies `Txxx`,
practices `Cxxx`, works or other docs' content):

| Era | Means | Requires | What it gives | Cost and risk |
| --- | --- | --- | --- | --- |
| Ancient | Border watch | own regions | sight of every neighbouring region | free |
| Ancient | Foot scouts | start | sight along a route; first contact; camp sightings; field surveys | 200-1,000 people, food and tools; lost to raiders, hostile armies, deserts and mountains |
| Ancient | Contact and trade rumour | first contact | era, traditions, a few names; nothing reliable on numbers | none |
| Classical | Mounted scouts | horses (doc 36) and T020 | twice the speed in open country | horses |
| Classical | Watchtowers | T024 | better sight of neighbours, early raid warning | a works line |
| Classical | Envoys and the `Embassy` clause | C084 (doc 39) or C024 | steady reports on population, stability, treaties | a few scribes abroad |
| Medieval | Merchant intelligence | doc 36 trade routes; C093 (doc 39) ×1.5 | economy, population and technology counts, in proportion to trade volume | none beyond trading |
| Medieval-Early Modern | Ship explorers | T013 (coastal), T028 (ocean); a harbour | sight along sea links; coasts charted | navigators and crew; storms |
| Early Modern | Cartography | **T330** | cheaper surveys; maps clause carries surveys; sightings remembered longer | a map office |
| Early Modern | Resident embassies | **C180** | embassies report more | - |
| Early Modern | Secret service and agents | **T331** and **C181**; intelligence bureau | agent cells: any dossier field, close sight of a region, evidence toward technologies | qualified people, upkeep; capture means a diplomatic incident |
| Industrial | Semaphore and telegraph | T218 or T219 (doc 39) | signal stations; faster collation of reports | works |
| Industrial | General staff intelligence | **C182** | better army estimates; scouts attached to formations | - |
| Industrial | Observation balloons | T216 (doc 39) | sight radius +1 around battles and sieges | - |
| Modern | Signals intelligence | **T333**; cipher bureau | intercepts from every rival that uses radio | countered by the rival's ciphers |
| Modern | Aerial reconnaissance | T038 and **T332**; an airfield (doc 38) | photographic sorties up to 3 links (5 with T281) | fuel, spares, aircrew; interception |
| Modern | Radar | T232 (doc 39; T104 fallback) | detection 2 links out | works |
| Modern | Concealment doctrine | **C183** | camouflage and deception (counter-intelligence) | movement and money |
| Information | Cyber intrusion | T123, or the Network tradition's centre (T302, doc 39) | economy, stocks, research of networked rivals | attribution incidents |
| Information | Signature reduction | **T335** | own forces harder to photograph | equipment |
| Space | Reconnaissance satellites | T247 (doc 39) and boost; a ground station | each images 6 regions a month at high quality | 5 t of boost, 60-month life |
| Space | Signals satellites | T246 (doc 39) and T333 | planet-wide intercept coverage | 8 t of boost to GEO |
| AI | Intelligence fusion | **T334** | narrower floors on every estimate; deception detected | compute |
| AI | Autonomous drones | T318 (doc 39) | scouting without people | electronics, batteries |

---

## 1. Scope and what changes in earlier chapters

### 1.1 Changes

| Where | Change |
| --- | --- |
| Ch. 30 §1 "Four total civilizations"; §12 deferred "more than four strategic seats" | 2-10 seats chosen at setup (§2); the deferred item is in scope |
| Ch. 33 §1 table "their sum is four"; §7 "with four starting civilizations the three-counterpart limit can cover every opponent"; §10 "12,288 node evaluations per round" | sum is the chosen seat count; the three-counterpart limit is kept and now forces a choice above four seats (§2.4); the node budget is per seat and the total scales with seats (§2.6) |
| Technical 04 "One to four external seats are supported" | one to ten external seats; native AI fills the rest |
| Doc 36 open question 12 "no non-player polities" | **reversed**: raider camps (§5); still no non-player polity, market member or seat |
| Doc 36 §7 calibration set `hard,medium,medium,easy` | the Standard preset keeps it; targets per preset (§2.5) |
| Doc 36 §6 trade | routes do not cross a raider camp's region (§5.5); trade volume feeds intelligence (§4.3) |
| Doc 37 §5 region counts 24/48/72 | presets 24/48/96/160 plus the 72 fixture (§2.2); real Earth `earth48` for 2-5 seats, `earth96` for 4-10 (cut line) |
| Doc 37 §5.2 "four-cradle sets" | seat-count-sized cradle sets (§2.3) |
| Doc 37 §3.6 "era and traditions of every met seat are public" | unchanged (they remain public among met seats) |
| Doc 37 §6.1 survey missions to bodies | unchanged; off-world sites follow §3 once a body is surveyed |
| Doc 38 §7 "foreign cities show class only where observed" | refined into the knowledge levels of §3 |
| Doc 38 §3.5 distress migration | dispersed raiders and refugees may join or leave camps (§5.3) |
| Doc 39 §4 boost; §5 stations | satellites are boost payloads (§4.9); a station's relay module tracks foreign satellites |
| `Clause::Maps` | revised: carries remembered snapshots with their age and surveys; never the sharer's current sight (§8) |
| `observe.rs::fuzz` foreign estimates | replaced by the estimate model of §6 (the present function has two leaks, §6.4) |
| `World::authority` overlord chain capped at 4 hops | capped at the seat count (§2.7) |

### 1.2 Design rules for this chapter

1. **Information is a resource.** Every improvement in what a seat knows is bought with
   people, goods, works, treaty terms or time, and every source has a floor of
   uncertainty it cannot get below. There is no free omniscience, including for the
   native AI.
2. **Estimates are reproducible and do not converge by repetition.** Reports are pure
   functions of the world secret, the observer, the subject, the field and a fixed
   reporting epoch; querying never changes them, and sampling them over time cannot
   average away a source's systematic error (§6.2).
3. **The hidden graph rule holds everywhere**: a technology or practice is named in a
   foreign file only if the observer has discovered it; sealed jump content stays sealed.
4. **Raiders are a bounded world process**, like epidemics: seeded, deterministic,
   conserving people and goods, cheap to simulate, never a seat.
5. **Simple first**: defaults for everything (automatic scouting directive, automatic
   satellite tasking, default secrecy posture, default "disperse" when clearing a camp),
   each mechanism with a cut line (§13.6).

---

## 2. Seat count and map sizes

### 2.1 Setup

- `MatchConfig.controllers.len()` is the seat count, `2..=10`. `MatchConfig.map:
  MapPreset { Small, Standard, Large, Huge, Fixture72 }` sets `regions` (24/48/96/160/72);
  `regions` alone stays accepted for fixtures and old requests. The host refuses a seat
  count outside the preset's allowed range with a named error ("Large maps take 4 to 8
  civilizations") instead of today's "exactly four seats are required".
- Any mix of controllers: human, native Easy/Medium/Hard, external agent (HTTP/MCP/CLI)
  or LLM worker seat. Setup shows counts of each; their sum is the seat count.
- Observer mode is unchanged: offered only when no seat is human or external.
- The seat count is public match metadata (every seat is told how many civilizations
  exist, as today it knows there are four); which seats it has met, and their names, are
  learned by contact.

### 2.2 Presets

Table 0.1 holds the presets. Design notes:

- **Regions per seat stay near 12-16**, the ratio that doc 36's expansion targets were
  calibrated on (48 regions for four seats), so per-seat population, region and economy
  targets are unchanged and the world total scales with regions. The world population
  target is doc 36's two billion × regions/48.
- **Generation.** `bts-worldgen/2.0.0` keeps cells per region as today, so cell count
  scales with regions; the 2,000 × 1,000 frame is unchanged, so regions are smaller on
  Huge maps, as on a finer political map of the same planet. Land stays 28-32% of cells.
  Generation time is linear in cells (measured in slice 4b; target ≤ 300 ms native for
  Huge).
- **Test nodes** stay three per world (chapter 15's deployment trials do not scale with
  seats).
- **Religion founding slots** scale: `max(2, (3 × seats + 3) / 4)` (2→2, 4→3, 6→5, 8→6,
  10→8), so founding a faith stays contested but possible.
- **The Solar System** is unchanged (nineteen sites, doc 37); with ten seats more sites
  are contested, which doc 37's interdiction, siege and metropole rules already handle.
- **Real Earth.** `earth48` (doc 37 §5.2) serves 2-5 seats from its six to eight cradles.
  `earth96` (new, authored the same way from the same public-domain sources) serves 4-10
  seats with twelve cradles (Nile, Mesopotamia, Indus, Ganges, Yellow River, Yangtze,
  Mekong, Aegean-Danube, Niger, Ethiopian Highlands, Mesoamerica, Andes). It is behind
  the cut line (§13.6).

### 2.3 Fair starts

Starting positions are chosen as today (best-scoring candidates spread apart, seat order
rotated by a keyed draw) and then **accepted only if all of the following hold**
(provisional thresholds):

1. Pairwise distance ≥ the preset's start spacing in links (table 0.1).
2. Start score (doc 36 arable, water and deposits within three links) of every seat
   within ±10% of the seats' mean.
3. **Room**: unclaimed land regions within three links that are nearer to this start
   than to any other within ±1 region (or ±15%, whichever is larger) of the mean.
4. **Raider pressure**: initial camps within three links differ by at most one between
   seats; no camp within two links of any start.
5. **Coast**: either every start is coastal or the non-coastal ones have a coastal region
   within two links.
6. Doc 36's viability guarantees within three links of every start.

On failure the generator redraws starts with the keyed counter `("starts", attempt)`; after
64 failed attempts it relaxes spacing by one link and retries; slice 4b's acceptance test
requires ≥ 99% of 1,000 worlds per preset and seat count to pass without relaxation. The
real-Earth maps carry precomputed cradle sets for each seat count, each scored within 10%.

### 2.4 Contact and negotiation limits

- **Kept: three counterparts per round, five negotiation windows, ten envelopes per pair
  per round.** With four seats the three-counterpart cap covered every rival (chapter 33
  §7 conceded it created no scarce choice); with six to ten seats it becomes the real
  partner choice chapter 33 wanted. Channels still need mutual selection.
- Meetings follow contact as today (a seat meets another when it observes one of its
  regions or receives a map that shows it); the planetary-perspective milestone still
  meets every surviving seat. A seat may learn **of** a seat it has not met (from a
  partner's shared estimates, §8); such a seat appears in its list as "known of" without a
  channel until met.
- The briefing and round recap stay bounded: per-seat foreign entries are at most nine,
  each a fixed-size dossier summary (§6).
- Native AI counterpart choice (when more rivals than slots): ongoing negotiations and
  expiring treaties first, then wars and threats (by estimated power within reach), then
  trade partners by volume, then the rival with the highest information value (§9.2).

Whether to raise the cap to four on the largest maps is open question 4.

### 2.5 Victory with more rivals

The victory condition is unchanged: one authority over every inhabited region (G96),
the jump service (F24) and two trials, with inhabited off-world sites and raider-held
regions counting as inhabited (§5.9). With ten seats a winner must subordinate or
conquer nine rivals. Why that remains winnable:

- Subordination is transitive: a subordinate's own subordinates count for the overlord
  (already true in `World::authority`; its four-hop cap is lifted, §2.7), so absorbing
  one regional hegemon brings its clients.
- Doc 36 §7 gives the industrial and modern eras about 220 rounds; a Hard seat that
  subordinates or conquers one rival every 25-40 years from 1700 has absorbed nine by
  about 2000-2060, leaving the jump programme's window (doc 39's expert target AD
  2050-2200, doc 36's median AD 2250-2310).
- Colonies follow the metropole (doc 37 §6.6); eliminated seats' raider-free regions
  pass by capture as today; raider camps are gone from most worlds by 1900 (§5.9).
- More seats also means more coalitions against a leader. That is a legitimate
  competitive outcome; calibration measures it rather than suppressing it.

**Calibration targets per preset** (all-AI, standard calendar; the AI mix is fixed per
preset; 64 seeds unless stated; provisional):

| Preset (seats) | AI mix | Matches with a winner | Wins by Hard seats | Median win year | Late wins | All-Hard set |
| --- | --- | --- | --- | --- | --- | --- |
| Small (2) | hard, medium | 70-90% | ≥ 75% | 2200-2280 | < 5% after 2450 | 2 hard: winner ≥ 60% (32 seeds) |
| Standard (4) | hard, medium, medium, easy | 55-75% (doc 36) | ≥ 70% | 2250-2310 | < 5% after 2450 | 4 hard: ≥ 40% |
| Large (7) | 2 hard, 3 medium, 2 easy | 45-70% | ≥ 65% | 2260-2340 | < 5% after 2450 | 7 hard: ≥ 30% (16 seeds) |
| Huge (10) | 2 hard, 5 medium, 3 easy | 40-65% | ≥ 60% | 2270-2360 | < 7% after 2450 | 10 hard: ≥ 25% (16 seeds) |

Further targets: eliminations before 1900 ≤ 0.4 × seats per match on average; regions per
seat per doc 36 table with the preset's ratio; doc 39's expert reachability check repeated
on Huge (the expert wins before AD 2300 in ≥ 50% of seeds). If Huge misses its winner
band, the levers in order are: the native AI's bandwagoning rule (a seat whose estimated
power is below one third of a neighbouring hegemon's accepts subordination offers at a
20% lower threshold, extending doc 37 §3.6's era rule); then federal accession (a
subordinate may bring a neighbour it has subordinated within the same treaty); never a
longer horizon or a change to G96.

### 2.6 Performance with ten seats

**Measured baseline** (ruleset 3 slice 3, `docs/implementation-status.md` on `ruleset3`):
four seats on 48 regions, full standard all-AI match about 23 s native, p95 per round
about 100 ms native and 200 ms in WebAssembly (Node).

**Cost model.** Per round: settlement ∝ regions (population blocks, works, links), native
policy ∝ seats × (known regions + candidates), observation ∝ seats × known regions,
intelligence tick ∝ seats² × fields (yearly), raiders ∝ camps. Splitting today's late
100 ms as roughly 45 settlement + 40 policy + 15 observation (to be measured by the bench
example with a split timer in slice 4b), Huge (10 seats, 160 regions) single-threaded is
about 45×3.3 + 40×2.5×2 + 15×2.5×3.3 ≈ 470 ms. The intelligence tick (90 pairs × about 12
fields) and raiders (≤ 26 camps) add well under 1 ms.

**Measures** (all deterministic; thread count never changes results):

1. **Per-seat parallel policy** on native builds: each native seat plans on its own
   observation in a worker; sealed batches merge in seat order (chapter 33 §10 already
   allows this). Logical work budgets per seat are unchanged (Hard 4,096 nodes); the total
   scales with seats.
2. **Parallel observation projection** per seat (read-only world).
3. **Region-staged settlement** in parallel for independent region phases (technical
   chapter 03's staging), native only.
4. **Lazy and cached views**: the static parts of a region view (polygon, terrain,
   links) are serialized once per process; observations carry `known_regions_hash` and
   MCP/HTTP clients may request deltas.
5. **Browser AI workers** (optional): in the web build, native AI seats run in Web
   Workers, each with its own wasm instance, receiving only their seat's serialized
   observation (which also strengthens the isolation boundary).

**Budgets** (replacing the single figure for presets above Standard):

| Preset | Native p95 per round | WebAssembly p95 per round | Full all-AI standard match, native |
| --- | --- | --- | --- |
| Small, Standard, fixture 72 | ≤ 150 ms, one thread (unchanged) | ≤ 400 ms (unchanged) | ≤ 60 s |
| Large (≤ 8 seats) | ≤ 150 ms with 4 threads; ≤ 300 ms on one | ≤ 800 ms (≤ 400 ms with AI workers) | ≤ 120 s with 4 threads |
| Huge (≤ 10 seats) | ≤ 150 ms with 4 threads; ≤ 500 ms on one | ≤ 1,200 ms (≤ 600 ms with AI workers) | ≤ 180 s with 4 threads |

Justification: a human spends minutes per round, so a one-second resolution in the
browser on the largest world is acceptable; throughput-critical evaluation runs native
with threads. `perf_round_budget` gains a Huge checkpoint at AD 1700 (raiders still
present, many contacts) and at AD 2150 (satellites, agents, sharing clauses live).
Observation size: a late Huge observation is estimated at about 3× a Standard one
(about 350 KB); MCP `get_turn` keeps under 256 KB by sending region deltas after the first
packet of a match.

### 2.7 Protocol and client impacts

- **Colours and emblems.** Ten seat colours, the existing four first: `#c1503a`,
  `#2f73a0`, `#5c8a36`, `#8a59a8`, then ochre `#c8861f`, teal `#23978c`, rose `#b5487f`,
  umber `#74552f`, indigo `#3f4fa0`, olive `#8c9a1e` (provisional; checked for contrast on
  parchment and in both themes). Colour is never the only cue: each seat also has one of
  ten emblem shields and one of ten chart markers (disc, square, diamond, triangle,
  inverted triangle, pentagon, hexagon, star, cross, ring).
- **Names.** `CIV_ROOTS` grows from 8 to at least 12 fictional roots (for example
  Ashvale, Coldbrook, Redcliff, Duskmoor) so names do not repeat with ten seats.
- **Scoreboard and perspectives** (observer): rows compact to one line each above six
  seats, sortable by any column; "view as" keys 1-9 and 0 for the tenth seat.
- **Comparison charts** (observer): with more than six series the default is
  highlight-one (the selected seat in colour, others light grey with markers), with a
  legend that toggles series; small multiples for population and regions.
- **Setup**: a seat list with add and remove (2-10), the preset picker showing the allowed
  seat range, colour and emblem previews.
- **Player views**: the diplomacy list and dossiers scroll; the contact selector shows
  "3 of 9" and sorts rivals by the AI-style priority of §2.4 as a suggestion.
- **MCP and HTTP**: no schema assumes four seats; `MatchSummary.seats` carries the count;
  tool descriptions say "the other civilizations" rather than "the three others".

**Four-seat assumptions found in the code** (main at `ecd304b`; ruleset3 line numbers
where different):

| File and line | Assumption | Change |
| --- | --- | --- |
| `crates/bts-engine/src/worldgen.rs:494` (ruleset3 `:832`, `:884`) | `cfg.controllers.len().clamp(2, 4)` | clamp to `2..=10` and to the preset's range |
| `worldgen.rs:139`, `:678` (ruleset3 `:160`, `:1033`) | `CIV_COLORS: [&str; 4]`, `CIV_COLORS[s % 4]` | ten colours (above) |
| `worldgen.rs:135` | `CIV_ROOTS` has 8 names | at least 12 |
| `worldgen.rs:584-587` | three test nodes | unchanged (deliberate) |
| `crates/bts-engine/src/state.rs:1105-1118` | `authority()` stops after 4 overlord hops (`guard > 4`) | stop after `civs.len()` hops |
| `state.rs:37` | default `MatchConfig` has four controllers | unchanged default (Standard) |
| `crates/bts-engine/src/content.rs` `RELIGION_SLOTS` (3) | sized for four seats | scaled by seat count (§2.2) |
| `crates/bts-protocol/src/lib.rs:1565-1567` | `MAX_CONTACTS = 3`, `NEGOTIATION_WINDOWS = 5`, `PAIR_ENVELOPES = 10` | unchanged (deliberate, §2.4) |
| `crates/bts-engine/src/tests.rs:65-75, 345-421, 952, 1842` | `0..4`, `[0u32; 4]` seat loops | iterate `civs.len()` |
| `crates/bts-host/src/referee.rs:219-221` | `vec![None; 4]`, `.take(4)` for agent seats | size by controllers |
| `referee.rs:246` | regions must be 24, 48 or 72 | presets 24/48/96/160 and 72 |
| `referee.rs:261-262` | "exactly four seats are required" | preset range check |
| `crates/bts-host/src/turn.rs:156`, `tests.rs:52, 65, 127, 177, 188`, `portable.rs:500, 552` | four-seat test fixtures | parameterize; add a ten-seat fixture |
| `crates/bts-server/src/main.rs:332` | `if kinds.len() == 4 { kinds } else { vec![NativeMedium; 4] }` | accept 2-10 |
| `crates/bts-wasm/src/lib.rs:209, 232, 247, 289, 322` | four-controller requests in tests | add 2- and 10-seat cases |
| `crates/bts-ai/src/policy.rs` | no seat-count constant found (`picks.len() == 4` at `:1269` is the four religious belief slots) | per-seat cost only (§2.6) |
| `apps/web/src/setup.tsx:16, 87-90, 272` | `SEAT_COLORS` (4), four default seats, `regions: 24 \| 48 \| 72`, "four civilizations" text | seat list 2-10, presets |
| `apps/web/src/tutorial/almanac.tsx:21-22` | `SEAT_COLORS`, `SEAT_NAMES` (4) | ten |
| `apps/web/src/theme/emblem.tsx:87` | `SHIELDS[seat % 4]` | ten shields |
| `apps/web/src/observer/chart.tsx:28` | `markPath` four shapes by `seat % 4` | ten markers |
| `apps/web/src/observer/controls.tsx:87, 114, 153, 171` | view keys `1-4` | `1-9`, `0` |
| `apps/web/src/observer/compare.tsx:1, 278`, `observer/index.tsx:2, 448, 549` | "All four over time", "All four seats are built-in AI" | count-neutral text |
| `apps/web/src/tutorial/topics.ts:70, 411`, `tutorial/steps.ts:64` | "four civilizations" | count-neutral text |
| `apps/web/src/i18n/zh-Hans/content-server.json:253`, `ui-shell.json:164, 558, 577`, `ui-tutorial.json:11, 262, 332` (and zh-Hant) | translated four-seat strings | retranslate |
| Docs 30 §1, 33 §1, §7, §10, technical 04, doc 36 §7, doc 37 §5.2 | four-seat text | superseded by this chapter (§1.1) |

---

## 3. Map knowledge

### 3.1 Knowledge levels

Each seat's knowledge of each region has a persistent part and a current part.

| Level | How reached | What is known | Persists? |
| --- | --- | --- | --- |
| **Unknown** | - | nothing; absent from the observation | - |
| **Charted** | seen once at presence quality; a map received; the planetary perspective; cartography of a neighbour's shared maps | outline, terrain, climate, coast, rivers, links to other charted regions, name | yes |
| **Surveyed** | a survey project or scout field survey; own region | doc 36 attributes (arable, pasture, forest, water, hydro, fishery) and deposits the seat can recognize | yes (deposit remaining amounts are estimates for foreign regions, as today) |
| **Remembered** | was observed, not observed now | last-seen snapshot with its month: owner and controller, city name and class, network lines (doc 38), notable works, population estimate, armies and camps sighted | snapshot persists; decaying parts age (below) |
| **Observed now** | sight quality ≥ presence this month (§3.2) | current values at the quality of the best source | while observed |

**What decays and what persists** in a remembered snapshot:

| Item | Rule |
| --- | --- |
| Terrain, coast, rivers, links, climate, deposits found | persist |
| Owner, controller, city name and class, network lines | kept as of last seen, labelled with the year |
| Population estimate | kept with its band; the band widens by 500 bp of the estimate a year since last seen, up to the field's maximum width (§6) |
| Notable works and construction sites | kept until re-observed; labelled with age |
| Army sightings | drawn as current for the month seen; as "last seen" ghosts for 36 months (72 with a map office, §4.5); then dropped |
| Raider camp sightings | as army sightings, but kept until the region is re-observed (camps rarely move) |

### 3.2 Sight

Every month each seat has a **sight quality** `q` (0-10,000 bp) for each region, the
maximum over its sources (provisional values):

| Source | In its region | Radius and quality beyond | Notes |
| --- | --- | --- | --- |
| Own controlled region | 10,000 (own) | neighbours 5,000 | border watch |
| Watchtower / signal station / radar station / early-warning network (watch line, §4.2) | - | neighbours +1,500 / +2,000 / radius 2 at 5,000 / radius 3 at 5,000 | radar: armies and aircraft at presence beyond its region |
| Fortification line (doc 38) | - | neighbours +1,000 | |
| Formation (army) | 8,000 | neighbours 5,000 | |
| Scout party | 7,000 | neighbours 4,000 (sea links for ship explorers) | |
| Agent cell | 9,000 for close details | - | only the region it is in |
| Aerial sortie | 7,000 | the target and its neighbours that month | §4.8 |
| Satellite pass | 8,000 | the imaged region that month | §4.9 |
| Subordinate or overlord | as the partner's own sight | - | existing rule ("subordinates and overlords share what they see") |
| `Sightings` clause | partner's `q` − 1,000 | - | second-hand (§8) |

Terrain modifies sight **into neighbours** (not within a region): mountains and forest
−1,000; plains, steppe and desert +500. Camouflage and signature reduction lower the
quality at which the concealing seat's formations are seen (§7.3), never the region's.

**Thresholds** decide what is shown:

| Quality | Name | Shown |
| --- | --- | --- |
| ≥ 3,000 | presence | owner and controller, city class, formations and camps present (count band ±50%), construction under way (yes/no) |
| ≥ 6,000 | detail | formation generation range ±1, strength band ±25%, notable works by name, city size band, network lines, camp size band ±25% |
| ≥ 8,500 | close | roles of formations, generation exact, strength ±10%, works with levels, population band ±10% |

Bands at these levels use the estimate model of §6 (same keys, field "sighting"), not
truth-centred fixed percentages.

### 3.3 Charting and cartography

- The planetary-perspective milestone (T047 & T104 & T100, existing) charts every region
  and records owners as of that month as "reported", without population or armies.
- Cartography (**T330**) and the map office: surveys cost −10% per office level (up to
  three levels), and maps received under a `Maps` clause bring the sharer's surveys too.
- A first contact made by a scout or a sighting charts the region where the contact
  happened.

### 3.4 State

`RegionMemory` gains `charted: bool`, `sight_q: u16` (this month), `sightings:
SmallVec<[Sighting; 2]>`; `Civ.sightings_overflow` caps the total at 256 sightings per
seat (oldest dropped first). `Sighting { kind: Formation | Camp | Scout | Works | Station |
Satellite, region, owner: Option<SeatId>, size_band, gen_range, month, quality }`. All
values stored are the reported (noisy) values, never truth.

---

## 4. Reconnaissance and intelligence means

### 4.1 Overview

Every means falls into one of five **source classes**, which matter for counter-
intelligence and for the estimate model's independent biases (§6.2):

| Class | Means | Countered by |
| --- | --- | --- |
| Open | contact rumour, trade, border watch | the target's secrecy posture only |
| Human | scouts, envoys and embassies, agents | counter-intelligence capacity |
| Imagery | sight from regions, armies, towers, aircraft, satellites | camouflage and signature reduction |
| Technical | signals intelligence, cyber intrusion, signals satellites | ciphers and cybersecurity |
| Shared | intelligence received from partners | (the sharer's sources) |

### 4.2 Scouts and watch posts

**Scout parties** are a new entity: `Scout { id, owner, kind, region, people, quals,
order, path, months_out, food }`. People leave the population blocks of their home region
(working-age adults) and return when the party comes home; deaths are booked in the
population ledger ("lost on reconnaissance").

| Kind | Requires | People | Equipment and supplies | Speed (links per month) | Notes |
| --- | --- | --- | --- | --- | --- |
| Foot scouts | start | 200-1,000 | tools 2 lots, food for 12 months carried | plains, steppe, desert 1; hills, forest, marsh 0.67; mountains, tundra 0.5 | may carry out a field survey (2 months in a region; as a survey project) |
| Mounted scouts | horses (doc 36), T020 | 200-1,000 | +1 horse per scout | ×2 on plains and steppe, ×1.5 elsewhere | |
| Ship explorers | T013 (two sea links from a coast), T028 (any sea link); a harbour | 100-500 incl. 20 navigators | timber 1 kt per party | 2 sea links | charts every coast it passes |
| Motor patrols | T094 | 200-1,000 | fuel 0.02 lots per person-month | ×3 on roads and plains | |
| Autonomous drones | T318 (doc 39; Synthetic Minds ×2 count) | none | electronics 2, batteries 2 lots per drone group | 3 | no people at risk; quality 6,000 |

Doc 38's networks raise land speed inside the scouting seat's own and allied regions as
for armies. **Orders**: `Explore` (default: the engine picks the adjacent unknown or
oldest-remembered region by a fixed rule, ties by region id), `Path { regions }`,
`Patrol { regions }`, `Shadow { formation }` (follows a foreign formation it has sighted),
`Hold`, `Return`. **Cap**: 2 parties plus 1 per 4 regions held, at most 12 per seat.

**Risks** per month, one addressed draw `("scout", seat, id, month)`: in a region with a
raider camp 1,500 bp of being lost (halved for drones: they are destroyed, not killed); with
a formation of a seat at war with the owner 2,500 bp; desert, tundra or mountains without
food reserve 300 bp. A party entering a region of a seat at peace whose border policy is
Closed (doc 38) is turned back to its last region and the owner is told ("Clearbay scouts
were escorted out of Highmere"). There is no capture of scouts by seats at peace.

**Watch line** (doc 37 building line; provisional bills):

| Stage | Requires | Crew | Effect |
| --- | --- | --- | --- |
| Watchtower | T024 | 200 | neighbours +1,500; raid warning (militia called a month earlier, raid losses −25%) |
| Signal station | T218 or T219 | 300 + 50 literate | neighbours +2,000; reports from this region collated at once (+10% to the seat's fusion, §6.2) |
| Radar station | T232 (T104 if doc 39's T232 is cut) | 500 + 200 technicians + 50 electricians | formations, aircraft and ships at presence up to 2 links; sortie interception (§4.8) |
| Early-warning network | T232 & T112 & T107 | 800 technicians and programmers | radius 3; foreign satellites in Earth orbit tracked |

### 4.3 Merchants and trade contacts

A seat with a doc 36 trade route to another receives, every January, an **open-class**
coverage contribution on that partner's economy, population, technology count and stocks
of traded goods: `c_trade = min(3,000, 500 × log2(1 + traded kt per month over the last
year))` (integer log table), ×1.5 with Merchant Leagues (C093, doc 39), ×1.25 under the
Chartered Companies charter (doc 37). Regions on the route path are charted and get one
presence-quality look a year ("caravan reports"). Selling a good tells you nothing more
than doc 36 §6.8's public market aggregates.

### 4.4 Envoys and embassies

`Clause::Embassy { months }` (mutual; requires both parties to know C084 Courier and relay
services (doc 39) or C024 Translation and interregional archives): each side posts 20
scribes (literate before writing) in the other's capital; they live there and come home
when the clause ends or war starts. Each side gets a human-class contribution of 2,500 on
the other's population, stability, treaties and era, and 1,500 on economy; Resident
Embassies (**C180**) add 1,000 to each. An embassy is not a channel and does not bypass
the contact limits. At war embassies close (staff come home if a route exists, otherwise
they are held as agents are, §4.6).

### 4.5 Cartography, printing and archives

- **Map office** (T330; one per seat, 1-3 levels; crew 100 literate + 20 scholars per
  level): survey cost −10% per level; sighting ghosts kept 72 months instead of 36; the
  `Maps` clause carries surveys.
- T048 printing and C024 archives raise the seat's **fusion** (the share of collected
  reports actually used) by 1,000 each (§6.2).

### 4.6 Agents

**Intelligence line**: intelligence bureau (T331 & C181) → cipher bureau (T333) →
signals intelligence centre (T333 & T112) → intelligence fusion centre (T334). Up to five
levels a seat, any governed region (provisional bills; crews of scribes, then scholars,
then programmers and model engineers). Each level gives **intelligence capacity** `IC`
+1,000, **counter-intelligence** `CI` +1,000 and trains up to 100 agents a year.

**Agents** are qualified people (scribes or literate adults before T331; scholars from
the cipher bureau; programmers for cyber cells), drawn from the region ledger into an
`AgentCell { target: SeatId, region, focus, people, qual, since }` like a formation. They
live in the target's region (ledger "abroad"), eat one ration a month from their own seat's
pool (cover funds) plus media 0.01 lots (electronics 0.01 for cyber cells).

- **Placing** a cell needs a route to the target's region (land path through regions the
  seat may enter, or a sea path) and takes 6 months.
- **Focus** (one per cell): a dossier field (§6.1: armies, economy, technology,
  treaties, stability, objective) or `Region` (close sight in its region).
- **Collection**: human-class coverage on the focus field `5,000 × a / (a + 200)` where `a`
  is the cell's people (provisional), summed over cells by the combination rule of §6.2.
- **Technology evidence**: a cell with focus technology in a region where the target
  operates research or works counts as a contact channel for doc 36's evidence (nodes the
  target understands), at the weight of a trade route of 50 kt a month. It never names a
  node. A seat may order `Research focus { handle }` for a node it has **discovered** but
  not understood: if the target understands it, the cell yields a work discount of 1,000
  bp per year up to 3,000 bp (a `Knowledge` clause still gives more); if not, the report
  says "no evidence that they have mastered <name>", which is legitimate intelligence.
- **Capture**: each January per cell, one addressed draw: capture if below `p = 600 ×
  CI_target / (CI_target + IC_seat + 2,000)` bp (provisional). Half the cell (rounded up)
  is captured. The target is told "agents of <seat> captured in <region>" (attribution
  certain), its native AI's trust in the spying seat falls by 10, a `NoEspionage` clause
  between them is breached, and for 24 months the target gains a human-class coverage of
  2,000 on the spying seat (interrogation). Captured agents are **held** (population
  ledger "held abroad"): released by `Clause::ReleaseAgents`, by a peace treaty, or after
  120 months; deaths in custody follow ordinary mortality.

### 4.7 Telegraph, radio and signals intelligence

- Signal stations (T218 or T219) speed collation: +10% fusion per station region, at most
  +20%.
- **Signals intelligence** (T333, a cipher bureau or later): technical-class coverage on
  every met seat that understands T104 (radio) of up to `3,000 × crypt_ratio` on armies,
  treaties and economy, where `crypt_ratio = IC_tech_seat / (IC_tech_seat +
  CI_tech_target)`; `CI_tech` rises with the target's T331 (+1,000), T240 public-key
  cryptography (doc 39, +3,000), T123 (+2,000) and the Current and Wire tradition (+1,000
  ×m for the owner's own intercepts, §4.12).

### 4.8 Aerial reconnaissance

- **Balloons** (T216, doc 39): a formation in battle or besieging sees radius +1 at
  detail.
- **Sorties** (T038 & T332 and an airfield stage of doc 38's Air line): `Action::Recon
  { airfield_region, target_region }`, up to 2 sorties per airfield level a month; range 3
  links (5 with T281 long-range heavy aircraft, doc 39); the target region and its
  neighbours get quality 7,000 that month. Each sortie costs fuel 2 lots, spares 0.2 lots.
  Interception: one draw per sortie, `p = 1,500 × radar levels within two links of the
  target / (1 + radar levels)` capped at 5,000 bp, ×1.5 if the target seat has G5 or later
  denial formations in the target region; a loss destroys components 2 lots and kills 20
  technicians (aircrew), and the target sees "a reconnaissance aircraft of <seat> was shot
  down" (an incident, trust −3).

### 4.9 Satellites

- **Reconnaissance satellite** (T247 Earth-observation and navigation satellites, doc 39):
  a boost payload of 5 t to LEO (doc 39 §4.3), bill electronics 3, components 1, instruments
  0.5 lots; life 60 months; needs a **ground station** (T246 or T247; one level controls six
  satellites). Each satellite images **6 regions a month** at quality 8,000 (works,
  construction, formations, camps; population only at presence). Tasking:
  `PolicySetting::SatelliteTasking { priorities: Vec<RegionId | SeatId> }`; untasked
  capacity rotates over foreign regions in a fixed order (oldest image first, ties by id).
  Revisit time ≈ regions to cover ÷ (6 × satellites): twelve satellites image every
  foreign region of a Standard world monthly; a Huge world needs about 25.
- **Signals satellite** (T246 & T333): 8 t placed in GEO (doc 39 factor 1.6); +2,000
  technical-class coverage on all met seats (still scaled by `crypt_ratio`).
- Counters: camouflage and signature reduction (§7.3) lower imaging quality against
  formations; a seat with an early-warning network or a station relay module (doc 39)
  sees foreign satellites in Earth orbit (count and owner). There is no anti-satellite
  weapon in this chapter (doc 39's debris and defence modules are unchanged).

### 4.10 Cyber intrusion

T123 critical-infrastructure cybersecurity (generic) or the Network tradition's network
operations centre (T302, doc 39): cyber cells (programmers, §4.6) give technical-class
coverage on economy, stocks and technology of targets that understand T112, without
physical presence in a region (placing needs no route; capture becomes **attribution**
with the same draw and incident). Network holders double cyber collection ×m and halve
their attribution risk.

### 4.11 Intelligence fusion and analytics

- Every seat has a **fusion** value (0-10,000): 5,000 base, +1,000 each for T048, C024,
  C182; +10% per signal-station region up to +20%; the intelligence fusion centre (T334)
  sets it to 10,000. Fusion scales all non-open contributions (§6.2).
- **T334** halves the minimum widths `w_min` of every field and enables deception
  detection (§7.4). Synthetic Minds holders get both ×m with T122 instead of T334.

### 4.12 Tradition advantages (doc 37 traditions; ×m = scales with mastery)

| Tradition | Intelligence advantage | Drawback or counter |
| --- | --- | --- |
| Coal and Steam (Steampunk) | observation airships: balloon sight radius +2 and sorties with packet airships (doc 38) before T332, range 2, quality 6,000 | slow; airships shot down at double rate by radar |
| Oil and Engine (Dieselpunk) | long-range sorties (range +2) ×m; snorkel submarines (T283, doc 39) place agent cells by sea without a route | fuel |
| Current and Wire (Electropunk) | signals intelligence +25% ×m; signal stations at half bill | intercepts only radio users |
| Atom (Atompunk) | detects every foreign fission works, pulse ship and nuclear test on the planet (presence) | reactor incidents are visible to all who detect |
| Network (Cyberpunk) | cyber collection ×2 ×m, attribution −50%, `CI_tech` +2,000 ×m | network incidents (doc 37) blind its own technical sources for 6 months |
| Living Systems (Biopunk) | biosurveillance: population and outbreak estimates of every met seat get +2,000 open-class coverage | - |
| Synthetic Minds (AI-punk) | fusion and `w_min` halving with T122 (§4.11); drone scouts ×2 count | compute upkeep |

Era charters (doc 37 §3.4) and practices that touch intelligence: *Surveillance State*
CI +3,000 and cyber collection +25%; *Open Networks* own secrecy posture cannot be Closed,
trade intelligence on others ×1.25; *Republic of Letters* contact evidence +25% both ways
and technology-field CI −1,000; *Chartered Companies* trade intelligence ×1.25; *Standing
Army* army-field IC +1,000. Doc 39 practices: C135 Political police CI +2,000; C140 Mass
surveillance CI +4,000 (and doc 39's evidence effects); C148 Arms-control verification
enables the `Inspection` clause (§8).

---

## 5. Raiders

### 5.1 What raiders are

A **raider camp** is a group of real people living in an unclaimed land region, with a
war band, a plunder store and a name ("the Karvan", "the Hollow Moor band", generated from
syllables; never a real people). Camps belong to no seat. Each camp is a
`Camp { id, region, lineage, warriors_share_bp, plunder: Vec<(Good, i64)>, since,
last_raid, tribute: Vec<(SeatId, Month /* until */)>, hired: Vec<HireView> }`; its people
are ordinary population blocks of the region with a camp lineage (`Lineage.camp:
Option<CampId>`), so births, deaths, ageing and epidemics run through the existing
pipeline. The region keeps `owner = None`.

### 5.2 Warriors and equipment

- **Warriors** = `warriors_share_bp` (provisional 3,000) of the camp's people aged 15-44;
  they fight as a formation of the three roles in equal shares.
- **Generation follows the world.** Every January `World.raider_gen` is recomputed: the
  median of active seats' best fielded generation, floored at the lowest seat's best and
  capped at the leader's best minus one; a change takes effect after it has held for 10
  years (no flicker). Before any seat reaches G1 it is G0. With doc 37's generations
  absent (before slice 8) the same rule applies to today's tiers.
- **Irregulars**: camp warriors fight at 80% of their generation's power, with no supply
  depth (they do not degrade, doc 37 §2.5) and a home terrain factor ×1.25 in hills,
  mountains, forest and marsh when defending their camp region.
- **Kit source.** Raider equipment is a declared ledger source (`raider_arms`, listed in
  `docs/conservation-audit.md` as an environment source like the initial endowment). It
  never enters any seat's stock: loot from a camp is only its plunder store, and defeated
  raiders leave no kit. This keeps every seat-side ledger conserved and denies "kit
  farming".

### 5.3 Where camps appear and how they grow

- **Initial camps** (worldgen, keyed draws): table 0.1 counts, in unclaimed land regions
  ≥ 2 links from every start and ≥ 3 links from each other, preferring hills, forest,
  marsh, steppe and mountain edges; 6,000-15,000 people each, a young pyramid, recorded in
  the genesis ledger as "initial free peoples". This adds about 3-6% to the starting world
  population.
- **Growth**: births and deaths as any block; carrying capacity of a camp is its region's
  wild food and pasture by doc 36's forager rule plus its plunder food; a camp above
  40,000 people or above its capacity **buds**: 40% of its people (all ages, proportional)
  found a new camp in an adjacent unclaimed region that no seat observes this month
  (sight `q` < 3,000 for every seat) and that is ≥ 2 links from every seat-controlled
  region; if none qualifies, it does not bud and growth stalls at capacity. Total camps
  never exceed the preset's cap.
- **Joining**: distress migrants (doc 38 §3.5) whose only destinations are unclaimed
  regions join an adjacent camp; survivors of a formation destroyed in a region next to a
  camp with no retreat path join it (at most 10% of them). People are always moved,
  never created.

### 5.4 Raids

Each month, for each camp with at least 1,000 warriors, one addressed draw
`("raid", camp, month)`:

- **Target**: among adjacent regions (land, river and pass links; sea links only once
  `raider_gen` ≥ G2, "sea raiders") controlled by a seat, the one with the highest
  `plunder_value / defence`, where plunder value is the region's share of its seat's
  national stocks (by population share, capped at 25%) of food, tools, metal, munitions
  and luxuries, and defence is the power of formations and militia in the region times
  doc 38's urban and fortification factors. Ties by region id. Regions of seats paying
  this camp tribute are excluded.
- **Chance**: base 800 bp a month (provisional), ×2 when the camp's food is below six
  months, ×0.5 when the target's defence exceeds the warriors' power, 0 when it exceeds
  twice their power (deterrence).
- **Resolution**: a one-month battle under the existing combat model (raiders attack;
  defenders are formations in the region plus militia; watchtower warning applies). If
  the raiders are repelled, nothing is taken. If they prevail:
  - **plunder** taken from the seat's national pool: up to the region's share above, at
    most 2% of the seat's stock of each good and 50 kt in all per raid, moved into the
    camp's plunder store (ledger "plundered");
  - **people killed**: 2 per 1,000 of the region's residents, at most 2,000 (war deaths);
  - **damage**: one facility level in the region loses 3,000 bp condition (never
    destroyed);
  - **unrest**: stability −1 in the region for 12 months.
- Raiders **never capture a region, never besiege a city and cannot eliminate a seat**.
  They withdraw to their camp after every raid.

### 5.5 Blocking expansion

- `Settle` into a camp's region is refused ("the Karvan hold this land"); `Survey` there
  is allowed (the party risks loss as scouts do).
- Settling into a region adjacent to a camp is allowed; the new settlement is a natural
  raid target, so the settlers need an escort or a garrison.
- Trade routes (doc 36) and transport paths (doc 38) do not pass through a camp region;
  formations crossing one fight the camp.

### 5.6 Clearing a camp

A formation that enters a camp's region fights it (existing battle resolution; defender
factors of §5.2). The camp **breaks** when its warriors fall below 20% of their number at
the start of the battle or their morale breaks. The attacking seat's standing
`PolicySetting::CampPolicy { mode }` (or an army's `on_clear` override) decides what
happens to the surviving people:

- **Disperse** (default): they leave as refugees (doc 38 distress migration) to adjacent
  unclaimed regions or camps first, otherwise to adjacent seat regions; the plunder store
  goes to the attacker's pool ("recovered plunder"); the region is free to settle.
- **Subjugate**: the attacker's formation holds the region; after doc 13's five months of
  control it becomes the attacker's (owner and controller), with the camp's people as a
  new lineage of that seat, stability −5 in the region for 10 years and unrest from the
  conquered lineage; the plunder store is recovered. This is how land comes with people.

There is no massacre option; deaths come only from battle.

### 5.7 Alternatives to war

- **Tribute**: `PolicySetting::Tribute { camp, goods: Vec<(Good, i64)>, years }`. The
  engine shows the camp's expected yearly plunder from the seat (from its own estimate of
  the camp, §5.10); tribute at least that large stops raids on the payer for the paid
  years. The goods go to the camp's plunder store, so tribute feeds and grows the camp:
  peace now, a larger problem later.
- **Mercenaries**: `Action::HireRaiders { camp, warriors, months, pay_per_month }` (needs
  two years of tribute to that camp or a sighting at detail and a route): up to half the
  warriors leave the camp and serve as a formation of the hiring seat at `raider_gen` ×
  80% power for 6-60 months, eating from the hirer's pool; if pay misses two months, they
  return to the camp; survivors return when the term ends. They count as soldiers of the
  hirer for upkeep, not for recruitment caps.
- **Integration**: project `Integrate { camp }` (needs an adjacent governed region, ten
  years of tribute to or trade-free peace with that camp with no raid on the seat, and C077
  Tribute and client rulers (doc 39) or C024): 60 months, gifts of goods (food, tools,
  luxuries; the project bill, provisional 50 kt by value) and 200 administrators (scribes)
  posted at the camp. On completion the region becomes the seat's with the camp people as a
  lineage, stability −2 there for 5 years, and the lineage's tendencies (seeded at
  generation: high mobility and martial honour) join the seat's cultural mix; if the
  seat holds C097 Warrior codes of honour (doc 39), recognition is immediate. Another seat
  clearing or integrating the camp first cancels the project (bill already spent stays
  spent).

### 5.8 Disappearance

- No budding into any region a seat observes or controls; after the median active seat
  reaches the planetary perspective, or AD 1700, whichever is earlier, no budding at all.
- A camp whose region has only seat-controlled land neighbours and that has not raided
  successfully for 20 years **declines**: 5% of its people a year migrate as voluntary
  migrants to the most attractive neighbouring region (doc 38 attractiveness), joining
  that seat's population; below 1,000 people the camp ends and its plunder is left as
  "abandoned stores" collected by the next seat to control the region.
- Targets (§13.4): by 1800 at most 10% of initial camps remain in the median match; by 1900
  none in ≥ 80% of matches.

### 5.9 Governance victory

**Decision: a raider-held region is inhabited and must be governed.** This is already the
behaviour of the code (`victory.rs` counts every region with residents, and a camp region
has `owner = None`, so its authority is nobody). A world government must govern its whole
world; camps are gone from most worlds long before the jump programme, and any survivor
is small, one generation behind the leader and fighting at 80%, so clearing it is a
formality for a would-be winner. The alternative (camp regions exempt) is open question 9.

### 5.10 What seats see of raiders

- Camps appear only as **sightings** (§3): presence shows a camp exists; detail shows its
  size band and generation range; close shows warriors and roles. Remembered camps keep
  their last-seen band and age.
- A raid on a seat's region tells it where the raiders came from ("raiders came from
  Duskhollow"), adding a presence sighting of that camp.
- No observation contains a camp count, a camp the seat has not sighted, `raider_gen`
  itself, or another seat's tribute or hiring (a seat sees hired raiders as an ordinary
  foreign formation with a "mercenaries" tag at detail quality).
- The referee spectator view (observer mode only) shows every camp.

### 5.11 Native AI and raiders

- **Scouting** first finds camps within three links (they enter the VOI ranking of §9.2 as
  threats to planned settlements).
- **Settling** only into camp-free regions; into a region adjacent to a sighted camp only
  with an escort or garrison whose power exceeds 1.5× the camp's estimated upper bound.
- **Clearing** a camp adjacent to its regions or its next settlement target when its
  available power exceeds 2× the camp's upper bound (Easy 3×); mode Subjugate when the camp
  is large and its own administrative capacity has room, else Disperse.
- **Defending**: garrison a raided region until its defence exceeds the camp's estimated
  power.
- **Tribute** when the camp's upper bound exceeds 1.5× its available power and the camp
  blocks nothing it plans this decade; **mercenaries** (Medium and Hard) during a war with a
  surplus of goods; **integration** (Hard) when it cannot clear the camp and has the
  practices.

### 5.12 Cost

At most 26 camps; per month O(camps × neighbours) for raid choice; battles through the
existing resolver; budding and generation yearly. Expected cost below 0.5 ms a month on
Huge.

### 5.13 Ledgers

People: camp blocks are region blocks (existing ledgers); warriors are people; raid and
battle deaths are war deaths; dispersal and joining are migration; hired raiders are
people abroad. Goods: `Σ plundered + Σ tribute = Σ held in camps + Σ eaten by camps + Σ
recovered + Σ abandoned-collected`. Arms: `raider_arms` source, never in any seat stock.

---

## 6. What can be known about another civilization

### 6.1 The dossier

For each met (or known-of) seat B, seat A's observation carries a **dossier**: one report
per field. Each report is `{ value or band, as_of: Month, sources: Vec<SourceClass>,
confidence: rough | fair | good | precise, conflicting: bool }` or "no reliable reports".

| Field | Contents | `w_max` (bp of value) | `w_min` | Mainly improved by | Notes |
| --- | --- | ---: | ---: | --- | --- |
| Population | total residents | 5,000 | 300 | border sight, trade, embassy, agents, biosurveillance | regions A observes now feed this directly |
| Regions | known regions (map) and estimated total | 5,000 | 0 | charting, sight, satellites | the list is map knowledge; the total is an estimate until every region is charted |
| Armies | total soldiers; generation range; share by role | 8,000 | 1,000 | sight, agents, SIGINT, satellites, general staff | locations only as sightings (§3) |
| Best generation | range `[g−k, g+k]` | k = 2 below coverage 3,000, 1 below 7,000, else 0 | - | sight at detail, battle | exact once seen in battle (as today) |
| Economy | output index (sum of base value of production a year) | 6,000 | 800 | trade, embassy, agents, cyber | |
| Stocks | per good A knows, up to 8 goods A tracks | 8,000 | 1,500 | agents, cyber | goods A does not know are absent (doc 36 §6.8 rule) |
| Technology | era (public); understood nodes per era (count band); named nodes | 5,000 | 500 | trade, agents, cyber | a node is named only if A has discovered it **and** A saw works requiring it, an agent or cyber cell confirmed it, or a clause transferred it; otherwise "a technology of the <era> era in <field>" |
| Practices | adopted practices | - | - | embassy, agents | named only if A has recognized the practice |
| Treaties | B's treaties with third parties: parties and clause kinds (amounts only at close quality from agents) | - | - | embassy, agents, SIGINT, shared | treaties with A, wars and subordination are public as today |
| Stability | 0-100 | 3,000 (points ×100) | 500 | embassy, agents | |
| Objective | large works of unknown purpose (count and size band) | 6,000 | 1,000 | satellites, agents | jump works named only for an observer whose own objective is revealed (sealed content rule, doc 37 §3.6) |

Era and traditions remain public among met seats (doc 37); trust and notes are A's own
records as today.

### 6.2 The estimate model

All integer, computed at the **yearly intelligence tick** (1 January, after the month's
observation phase; also after a "truth event", §6.3), never at query time.

1. **Contributions.** Each source `s` gives coverage `c_s` (0-10,000 bp) for field `f` of
   seat B as specified in §4 (border sight: `4,000 × share of B's known regions A observed
   at presence or better during the year`; satellites: `4,000 × share of B's regions imaged
   in the last 12 months`; and so on). Open contributions are used as computed; others are
   multiplied by A's fusion / 10,000.
2. **Counter-intelligence.** Each contribution is reduced by B's defence against its class:
   `c'_s = c_s × (10,000 − d) / 10,000` with `d = min(6,000, 10,000 × D_B / (D_B + IC_A +
   1,000))`, where `D_B` is B's counter-intelligence for human sources, cipher and cyber
   defence for technical sources, camouflage and signature reduction for imagery (armies
   field only), and zero for open sources except that a Closed posture halves open
   contributions. Field sensitivity scales `d`: armies and technology ×1.0, economy, stocks
   and treaties ×0.8, stability ×0.6, population ×0.5, regions ×0.2.
3. **Combination.** Independent sources combine as `cov = 10,000 − Π(10,000 − c'_s) /
   10,000^(n−1)`, capped at 9,500. A field with `cov` < 1,500 from non-open sources is
   reported as "no reliable reports" (open sources alone never estimate armies, economy,
   stocks, technology counts or objective).
4. **Width.** `w = w_min + (w_max − w_min) × (10,000 − cov) / 10,000` (bp of the value).
5. **Noise with a systematic part.** `ε = w × (β / 2 + η_t) / 10,000`, where
   - `β` ∈ [−10,000, 10,000] is a **systematic bias** drawn once per (A, B, field, dominant
     source class) from the keyed stream `("intel-bias", A, B, f, class)`; it changes only
     when the dominant class (largest `c'_s`) changes and has held for five years;
   - `η_t` is an AR(1) term per (A, B, f): `η_t = (7,500 × η_{t−1} + 6,614 × u_t) /
     10,000`, with `u_t` triangular in [−10,000, 10,000] from `("intel", A, B, f, year)`,
     clamped to ±10,000; `η` is stored per pair and field (referee-private state, 2 bytes).
6. **Report.** Point `m = truth × (10,000 + ε) / 10,000`; band `[truth × (10,000 + ε − w) /
   10,000, truth × (10,000 + ε + w) / 10,000]`, rounded to the existing display steps
   (5,000 below 100,000 people, 500,000 above ten million, and so on). The band contains
   the true value only when `|ε| ≤ w`, about 85-90% of the time by construction; the
   public help says so ("about nine in ten such ranges contain the true figure").
7. **Zero values.** When the truth is zero the band is `[0, floor_f × w / 10,000]` with a
   field floor (armies 5,000 soldiers; stocks 1 kt), so "none" is never stated exactly
   from an estimate. Only sightings can say "no formations observed" about regions
   actually observed.
8. **Age.** A report not refreshed this year (its field fell below the reporting threshold)
   keeps `m` and `as_of`, and its band widens around `m` by 500 bp a year since `as_of`, up
   to `w_max`.
9. **Fusion of classes.** The report uses the combined coverage for `w`, and its `β` is the
   dominant class's; a seat with an intelligence fusion centre uses the mean of the two
   strongest classes' `β` (halving the systematic error when two independent classes are
   strong). This is the designed reward for diversifying sources.
10. **Categorical fields** (best generation, stability) use the same `ε` on an index scale
    and round to whole steps.

The confidence label is from `w`: rough > 4,000; fair 1,500-4,000; good 500-1,500; precise
< 500.

### 6.3 Truth events

Some events give certified facts and reset part of a report: a battle reveals the
opposing formations' generation and strength at the end of the month (existing rule); a
`Transparency` or `Inspection` clause (§8) gives exact values; a captured agent cell's
interrogation (§4.6) adds coverage. After a truth event that contradicts an active
deception (§7.4) the deceived seat's report is flagged "earlier reports were misleading".

### 6.4 Why repeated queries leak nothing (and what is wrong today)

`observe.rs::fuzz` today (a) centres a band of ±25% on a point within ±25% of the truth,
so the band **always** contains the true value, which chapter 06 forbids ("not hidden
truth used to manufacture an always-correct range"); and (b) draws a fresh independent
shift every year, so intersecting a few years' bands of a slowly changing population
converges on the truth. The model above fixes both: bands are not guaranteed, and the
systematic `β` survives any amount of averaging over time, while `η` is autocorrelated so
averaging even the random part gains slowly. Within an epoch every query returns the same
bytes; no query advances time, rerolls a draw or refreshes a report. A seat can obtain a new
`β` only by building a different dominant source class and keeping it five years, which is
the legitimate value of an independent source. The interim fix (persistent per-pair bias
and not-always-containing bands in `fuzz`) can land with slice 4b (§13.1).

### 6.5 Worked example

Riverland (A) watches Clearbay (B), population 3,200,000. A trades 40 kt a month with B
(`c_trade` = 500 × log2(41) ≈ 2,670), observes 4 of B's 10 known regions at presence
(`c_border` = 1,600), has an embassy (2,500 × fusion 6,000 / 10,000 = 1,500), and B's
counter-intelligence is low (`d` = 1,000 × 0.5 for population = 500 on the embassy only).
Combined: 10,000 − (7,330 × 8,400 × 8,575)/10⁸ ≈ 4,720. Width: 300 + 4,700 × 5,280 /
10,000 ≈ 2,780 (±27.8%). With `β` = +4,000 and `η` = −2,000 this year, `ε` = 2,780 × 0 =
0: the report reads "2.3-4.1 million, fair, trade and embassy, 1650". Next year `η` drifts
to +1,000: `ε` = 2,780 × 3,000 / 10,000 ≈ +830 bp, "2.6-4.4 million". Ten years of such
reports average to about 3,200,000 × (1 + 2,780 × 2,000 / 10⁸) ≈ 3,380,000, not to the
truth, because `β` does not average away; an agent network or satellites, a different
class, is what corrects it.

---

## 7. Counter-intelligence and deception

### 7.1 Secrecy posture

`PolicySetting::Secrecy { posture: Open | Guarded | Closed }` (default Guarded):

| Posture | Effect on others' intelligence | Cost to the seat |
| --- | --- | --- |
| Open | open contributions on this seat ×1.5; CI −2,000 | none; trade capacity +5% (doc 36 gateways) |
| Guarded | as computed | none |
| Closed | open contributions halved; CI +3,000 | doc 36 contact evidence received −25% (you learn less from others too), trade capacity −10%, stability −1 under Open Networks or Republic of Letters |

### 7.2 Counter-intelligence capacity

`CI` (human class) = 1,000 per intelligence-line level + C181 1,000 + C135 2,000 + C140
4,000 + Surveillance State 3,000 + posture (Closed +3,000, Open −2,000), floored at 0.
`CI_tech` = T331 1,000, T123 2,000, T240 (doc 39) 3,000, Network 2,000 ×m, cipher bureau
and later stages 1,000 per level. Imagery defence is §7.3. Every term is a real
investment or a practice with doc 39's costs and tensions.

### 7.3 Camouflage and signature reduction

- With C183 (or C182 and T332), a formation may be ordered `Conceal`: foreign sight of it
  is reduced by 2,000 (presence still shows "movement" but not size), its movement is 25%
  slower and its supply upkeep +10%.
- Signature reduction (T335) lowers imaging of the seat's G5+ formations by a further
  2,000 for an equipment surcharge (electronics +0.2 per soldier).
- Neither hides a region's owner, city or works, and neither affects battles.

### 7.4 Deception operations

`Action::Deceive { target: SeatId, field: Armies | Economy | Technology | Objective,
direction: Inflate | Deflate, magnitude_bp }` (requires C183 and an intelligence bureau;
one active operation per target and field):

- It shifts the target's report `m` by `δ = min(magnitude, 5,000, w_target)` bp in the
  chosen direction for 24 months.
- It applies only while the target lacks two independent non-open classes each with
  `c'` ≥ 3,000 for that field, or the target's fusion with T334 is below the deceiver's
  deception capacity (`IC` + 1,000 per C183 level). Otherwise the target's report is
  flagged **conflicting** and its band widened to cover both `m` and `m ± δ`, revealing
  neither which is true nor that a deception is under way.
- Cost: media 50 lots and 200 agent-years a year (dummy formations, planted reports);
  Armies inflation also needs 10% of the claimed soldiers' kit in sham equipment (spent).
- A truth event (§6.3) ends the operation's effect and flags the earlier reports.
- **Bounds**: deception never alters battles, contracts, the target's own records,
  referee-certified clauses, sightings at close quality, or anything the deceiver
  publishes in diplomacy (claims stay uncertified speaker statements, chapter 33 §7).

---

## 8. Intelligence sharing

All clauses sit inside treaties (they consume no extra envelopes) and are validated like
other clauses; data shared is the sharer's **records** (with their noise, ages and
sources), carried by the referee, never fresher or truer than the sharer's own.

| Clause | Terms | What the recipient learns | Notes |
| --- | --- | --- | --- |
| `Maps { from }` (revised) | once | charted outlines and remembered snapshots (owner, city, works, population estimate) with their original `as_of`; surveys if the sharer has a map office or T330 | never the sharer's current sight; a later remembered snapshot replaces an earlier one only if newer |
| `Sightings { from, months }` | monthly while active | the sharer's sightings this month at quality −1,000 (formations, camps, works, satellites) | the recipient learns which regions the sharer can see, and so its sight network |
| `Estimates { from, about: Option<SeatId>, months }` | yearly | the sharer's dossier reports on third seats (all, or one); as a shared-class source with coverage 50% of the sharer's and the sharer's `β` | the recipient may learn of seats it has not met ("known of") |
| `Transparency { from, fields, months }` | yearly | referee-certified exact values of the sharer's own chosen fields (population, armies by generation, stocks of named goods the recipient knows, technologies by name that the recipient has discovered) | the only exact path to foreign numbers; arms control |
| `Inspection { months }` | mutual, yearly | as Transparency on armies and objective works, both ways, plus a close-quality look at three regions each side names | needs C148 (doc 39) on both sides |
| `Embassy { months }` | mutual | §4.4 | |
| `IntelligenceAlliance { months }` | mutual | Sightings and Estimates both ways, and `NoEspionage` | a bundle for convenience |
| `NoEspionage { months }` | mutual | - | a captured cell, a shot-down sortie or an attributed intrusion breaches it |
| `ReleaseAgents { from }` | once | held agents return home | |

**Leaks and betrayal.**

- Each January, each shared item set (a `Sightings` or `Estimates` flow) leaks to the
  seat it concerns with probability 500 bp (×2 if the recipient's CI is lower than the
  concerned seat's IC), draw `("leak", sharer, recipient, about, year)`: the concerned seat
  learns "<sharer> shares intelligence about us with <recipient>"; its native AI's trust
  in the sharer falls by 5.
- Shared data can be passed on: a recipient may include received estimates in its own
  `Estimates` clauses; they keep their original source tag, so a chain of retellings never
  becomes independent evidence (chapter 33 §7's rule) and never adds coverage twice.
- Ending a clause, or using a partner's sightings to attack the partner's ally, is
  legal; the performance record notes the end, and trust follows existing rules.
- Free-text and `claims` about strength remain uncertified (chapter 33).

---

## 9. AI decision-making with uncertainty

### 9.1 Belief state

The native AI keeps its own memory of reports and sightings (part of `own_memory`,
chapter 33 §10). Threats use the **upper** bound of a band (aged as §6.2), opportunities the
**lower** bound, each scaled by a difficulty risk parameter (Easy uses the point estimate
only; Medium bounds; Hard bounds plus a surprise reserve, §9.5). It never reads `β`, `η`,
deception state or camp truth.

### 9.2 Value of information

Hard and Medium rank **information candidates** each round by a simple value-of-
information test over decisions the AI is about to take (war or peace with a seat,
defence of a border, a settlement, a large trade or treaty):

1. Evaluate the decision at the low and the high end of each relevant band.
2. If the decision is the same at both ends, the information is worth nothing now.
3. If it flips, its value is `|payoff(decision at low) − payoff(decision at high)|` in the
   AI's own scoring units, times the share of the band on the minority side.
4. For each valuable field, the cheapest available action that would raise its coverage
   (scout, sortie, satellite tasking, agent cell, embassy, trade, a sharing clause) is a
   candidate with its cost; candidates enter the ordinary candidate list and compete for
   the same work budget (chapter 33's node caps include them).

Easy uses fixed rules only (one scout until neighbours are found; tasking by default).

### 9.3 Exploration and exploitation

- Scouts: Easy 1, Medium 2, Hard 2-3 parties until every region within four links of its
  regions is charted and every camp within three links is sighted; then one party
  re-scouting remembered regions older than 10 years adjacent to its border, Hard also the
  likely invasion routes from its two most threatening rivals.
- Ship explorers after T028 while uncharted coasts remain within reach.
- Stop when the VOI of the remaining unknown regions falls below the cost of a party.

### 9.4 When to spend on agents, aircraft and satellites

- Intelligence spending caps: Easy 1%, Medium 2%, Hard 4% of the seat's yearly goods
  value; Hard may exceed for two years before a planned war.
- Agents (Medium, Hard): one cell per rival within reach with focus armies; Hard adds
  technology focus on its most advanced met rival and treaties focus on the leader.
- Satellites (Medium, Hard): enough to image every bordering rival region yearly; Hard
  monthly for rivals at war or estimated stronger.
- Embassies with every met seat where the counterpart agrees; Transparency only within an
  alliance or arms-control deal; Hard uses Inspection to verify a disarmament promise.

### 9.5 Acting on stale data and the risk of surprise

- A stale army sighting is spread as threat mass over its region and neighbours (one
  link per year of age) rather than dropped.
- Hard keeps a **surprise reserve** on borders with any rival whose army band is wide
  (`w` > 3,000): defence sized to the upper bound times 1.2 within reach.
- Before declaring war Hard requires `cov` ≥ 4,000 on the target's armies or a recent
  detail sighting of the front; Medium requires 2,500.
- Hard may run a bounded deception (inflate armies) when it is weaker than a neighbour
  that has wide bands on it; never more than one at a time.

### 9.6 Tests that show better-informed play wins more

All on rotated seeds and seats, Standard and Huge presets, results recorded in
`docs/calibration`:

| Test | Setup | Required result |
| --- | --- | --- |
| Blind vs sighted | two Hard seats identical except one has intelligence actions disabled (passive open sources remain) | the sighted seat finishes above the blind one in ≥ 60% of paired matches; wins ≥ 15 points more of the wars it starts; suffers ≥ 30% fewer surprise defeats (attacker's actual force above the defender's upper bound by > 50%) |
| VOI vs fixed | Hard with VOI ranking vs Hard spending the same budget by a fixed rotation | VOI reaches equal or better outcomes at ≤ 70% of the intelligence spend |
| Value ceiling | a test-only oracle controller (reads true foreign values through a referee test hook compiled only under `cfg(test)`, never in a release build or seat package) vs Hard | the oracle wins ≥ 10 points more; if the gap is under 3 points the intelligence system is decorative and `w_max`/surprise costs are recalibrated |
| Deception bounded | Hard with and without deception | effect positive but ≤ 10 points |
| Raiders | Hard with camp handling vs Hard ignoring camps | regions held at AD 1 ≥ 20% higher with handling |

---

## 10. Information boundary invariants

These hold for humans, the native AI and LLM/MCP agents alike (one projection, chapter 06):

1. Every foreign quantity is an estimate with source classes, `as_of` and a band, except
   own state, public facts (met seats' names, era, traditions; wars, subordination and
   treaties with the viewer; the seat count) and referee-certified clauses.
2. Reports are pure functions of the world secret, observer, subject, field, epoch and the
   observer's evidence; never of query count, request timing or other seats' requests.
   Queries never advance time, reroll or refresh.
3. Bands are not guaranteed to contain the truth; widths come from coverage, a public
   model; no response encodes truth beyond the report.
4. No sequence of reports from one source class converges on the truth (systematic bias).
5. No technology or practice is named unless the viewer discovered or recognized it;
   sealed content stays sealed; masked items use doc 37's "era in field" text.
6. Seat A's observation is byte-identical whatever B's private state, for every field
   where A has no reporting source; changes reach A only at the yearly tick or through a
   sighting or truth event.
7. `β`, `η`, coverage numbers of other seats, deception state, counter-intelligence
   values, camp truth and `raider_gen` never appear in any seat's observation, tool
   description, error or log. A seat sees its own coverage and what would improve it.
8. Unknown, unsighted or nonexistent armies, camps, scouts, cells, satellites or seats
   give the uniform `NOT_VISIBLE_OR_UNKNOWN`.
9. Shared data is the sharer's records with original ages and sources; never fresher or
   more accurate than the sharer's.
10. The intelligence tick runs on its fixed schedule regardless of which observations were
    requested (no timing channel).
11. Observer mode is unchanged: a referee-wide view exists only in a match with no human
    or external seat; elimination grants no omniscience; spectator storage never feeds a
    competitor.
12. MCP descriptions and help name generic actions (scout, place cell, task satellite)
    with their public semantics and costs; they never list world counts, camp locations or
    undiscovered content.

---

## 11. Interface implications (views and data, not mock-ups)

1. **Fog on both map tiers** (flat atlas and 3D globe): unknown as blank parchment (flat)
   or cloud (globe); charted as desaturated terrain; surveyed adds resource icons;
   observed now in full colour with live units; remembered sepia with an age badge ("seen
   1712") on cities, works and ghosts. The same rule in the Solar System view (doc 37
   sites).
2. **Sightings layer**: current formations and camps solid; ghosts with age; a quality
   ring (presence, detail, close); hover shows the band and source.
3. **Sight lens**: sight quality per region this month with its sources (towers, radar
   ranges, scouts, sorties, satellite passes); next satellite revisit per region.
4. **Intel panel per foreign civilization** (dossier): each field with point, band bar,
   confidence, `as_of`, source icons, a sparkline of the viewer's own past reports,
   "conflicting reports" and "earlier reports were misleading" flags; known treaties;
   technologies named or masked; "what would improve this" (for example "an embassy:
   about +25% coverage").
5. **Reconnaissance orders**: scout panel (create, kind, path, patrol, shadow, return,
   survey); sortie planner with range circles; agent cells (target, region, focus, own
   risk estimate, held agents); satellite tasking list; secrecy posture; concealment
   toggles on formations; deception (when available) with cost and duration.
6. **Satellites view**: in the Earth-orbit zoom, own satellites with footprints, life left
   and ground-station capacity; foreign satellites only when tracked.
7. **Diplomacy**: intelligence clauses in the treaty editor with a preview of exactly what
   the partner would receive ("your sightings in 7 regions, monthly, for 10 years");
   embassy status; `NoEspionage`; incidents list; "known of" seats.
8. **Raiders**: camp markers (sighted only) with size band, generation range and last
   raid; raid alerts with source camp; actions clear, tribute (with the expected-plunder
   figure), hire, integrate; camp policy setting.
9. **Setup and observer**: seat list 2-10, preset picker, colour and emblem preview;
   compact scoreboard; highlight-one comparison charts; view keys 1-9, 0.
10. All new strings in English, Simplified and Traditional Chinese ("raiders" 掠袭者,
    plain label "barbarians" 蛮族 in the almanac; translators to confirm).

---

## 12. Protocol, content and save changes

All within ruleset 3.0's version bump (`bts-protocol/2.0`, `bts-rules/3.0.0`,
`bts-content/3.0.0`, `bts-worldgen/2.0.0`; the branch's interim `-sN` suffixes as it does
today); new fields `#[serde(default)]`.

### 12.1 Content IDs (coordinated with docs 37-39)

Doc 37 uses T154-T159 and T170-T182; doc 38 adds T183 (orbital tether); doc 39's draft
uses **T183-T325** and practices **C068-C174**. **Clash: doc 39's T183 (Fermentation and
brewing) collides with doc 38's T183 (orbital tether)**; one of them must be renumbered
(suggest moving the tether to T326, after doc 39's range). This chapter takes **T330-T335**
and **C180-C183** to leave room.

| ID | Name | Era | Tier | Prerequisites | Tags | Use |
| --- | --- | --- | --- | --- | --- | --- |
| T330 | Cartographic triangulation and printed atlases | Early Modern | 2 | T047 & T040 & T048 | measure, record | map office; maps carry surveys |
| T331 | Ciphers and cryptanalysis | Early Modern | 2 | T026 & T030 & T045 | record, measure | intelligence bureau; `CI_tech` +1,000 |
| T332 | Aerial photography and photogrammetry | Modern | 6 | T038 & T041 & T064 | measure, war | sorties; concealment with C182 |
| T333 | Signals intelligence and traffic analysis | Modern | 6 | T104 & T055 & T331 | electric, record | cipher bureau, SIGINT, signals satellites |
| T334 | Intelligence fusion and predictive analytics | AI | 8 | T116 & T117 & T333 | compute | fusion centre; `w_min` halved; deception detection |
| T335 | Signature reduction and stealth | Information | 7 | T093 & T107 & (T232 \| T104) | war, electric | imaging −2,000 against own G5+ formations |

None is on the victory-critical set; each has a generic use; all hidden until discovered
like every node; each needs an encyclopedia passage (doc 39 §6 rule). If doc 39's T232,
T216, T218/T219, T246/T247, T281, T283, T302 or T318 are cut, the fallbacks are T104 (radar,
signals), none (balloons), T054 (signal stations), T142 & T104 / T142 & T141 (satellites),
T038 (long range off), none (submarine insertion), T123 (cyber) and T114 (drones).

| ID | Practice | Era | Prerequisites | Material preconditions | Effect |
| --- | --- | --- | --- | --- | --- |
| C180 | Resident embassies | Early Modern | C024 & C084 (doc 39; C013 fallback) | two met seats | embassy coverage +1,000 |
| C181 | Secret service | Early Modern | C013 & C016 | T331 | intelligence bureau; CI +1,000 |
| C182 | General staff intelligence | Industrial | C037 & C013 | T055 & F:barracks | army-field IC +1,000; fusion +1,000; scouts attached to formations |
| C183 | Concealment and deception doctrine | Modern | C182 | T332 \| T064 | `Conceal` orders; deception operations |

**Facility kinds** (doc 37 lines and stages): watch line `watchtower`, `signal_station`,
`radar_station`, `early_warning_network`; intelligence line `intelligence_bureau`,
`cipher_bureau`, `sigint_centre`, `fusion_centre`; `map_office`; `ground_station`.
**Payloads** (doc 39 boost uses): `recon_satellite`, `sigint_satellite`. **Scout kinds**:
foot, mounted, ship, motor, drone.

### 12.2 State

`MatchConfig.map`; `World.camps`, `World.raider_gen`, `raider_gen_since`;
`Lineage.camp`; `World.scouts`, `World.agent_cells`, `World.satellites`; `Civ.intel:
Vec<IntelPair { target, fields: [IntelField; NF] }>` with `IntelField { eta: i16,
beta_class: u8, beta_since: Month, last_report: Report }` (referee-private except
`last_report`, which is the seat's own record); `Civ.secrecy`, `Civ.camp_policy`,
`Civ.tribute`, `Civ.held_agents`, `Civ.deceptions`, `Civ.tasking`; `RegionMemory.charted`,
`sight_q`, `sightings`; `Army.conceal`, `Army.on_clear`, `Army.hired_from: Option<CampId>`.

### 12.3 Observation

| Field | Content |
| --- | --- |
| `RegionView.knowledge` | `Charted \| Surveyed` plus `visibility` (`Own \| Visible \| Remembered`, existing) and `sight_q_band` (presence / detail / close) |
| `RegionView.sightings` | `Vec<SightingView { kind, owner, size_low, size_high, gen_low, gen_high, month, quality }>` |
| `RegionView.camp` | `Option<CampView { name, size_low, size_high, gen_low, gen_high, last_seen, last_raid_on_us, tribute_until }>` (sighted only) |
| `ForeignCiv.dossier` | `Vec<ReportView { field, point, low, high, as_of, sources, confidence, conflicting, misleading_before, named: Vec<String> }>`; `known_of: bool` |
| `ForeignCiv` (removed) | `population_low/high`, `military_estimate`, `observed_tier` move into the dossier (kept one release as derived aliases) |
| `IntelView` | own `IC`, `CI`, `CI_tech`, fusion, secrecy posture, coverage per (seat, field) **of the viewer's own sources**, cells, held agents (own and others' held by us), satellites, tasking, scouts, incidents |
| `MilitaryView` | concealment, hired raiders |
| `UnitsView` | scout kinds, payload masses |

### 12.4 Actions, settings, clauses

`ProjectSpec::Scout { from, kind, people }`, `Action::ScoutOrder { scout, order }`,
`Action::PlaceCell { target, region, focus, people }`, `Action::CellOrder { cell, focus |
recall }`, `Action::Recon { airfield, target }`, `Action::Deceive { .. }`,
`Action::HireRaiders { .. }`, `Action::ArmyConceal { army, on }`, `ProjectSpec::Integrate {
camp }`, `ProjectSpec::Payload { kind, orbit }` (doc 39 boost); settings `Secrecy`,
`SatelliteTasking`, `Tribute`, `CampPolicy`; directive `Explore { parties }` (keeps N scout
parties exploring). Clauses of §8: `Maps` (revised semantics), `Sightings`, `Estimates`,
`Transparency`, `Inspection`, `Embassy`, `IntelligenceAlliance`, `NoEspionage`,
`ReleaseAgents`.

### 12.5 Endpoints and MCP

`/api/turn` gains the dossier and sightings in the existing packet; `known_regions_hash`
and region deltas (§2.6); `GET /api/history/reports?seat=&field=` returns the viewer's own
past reports (immutable). MCP `get_turn` and `submit_turn` carry the same fields; no new
tool is needed (a `get_dossier` convenience may return the same report objects). Setup
accepts 2-10 controllers and `map`.

### 12.6 Saves and ledgers

Still `bts-save/2`; earlier ruleset-3 dev saves refused by ruleset string. Saves grow by
camps, scouts, cells, satellites and intel state (about 2 KB per seat pair: under 200 KB on
Huge). Ledgers (`docs/conservation-audit.md`): scouts and agents abroad, lost on
reconnaissance, held abroad (people); plunder and tribute identity (§5.13); `raider_arms`
declared source; recon sortie losses; satellite payloads (boost used, doc 39); deception
sham kit (spent).

---

## 13. Plan changes

### 13.1 Where the work goes

Doc 37 §11.1 numbering with doc 38's inserts (7b, 9a, 9b) and doc 39's (6b, 6c) is kept;
this chapter inserts 4b, 7c, 8b and 12b.

| # | Slice | Change from this chapter |
| --- | --- | --- |
| **4b** | **Seats and maps** (new, right after 4 because it touches `bts-worldgen/2.0.0`) | 2-10 seats; presets 24/48/96/160 and the 72 fixture; cells per region; fair-start acceptance; inert `camp_sites` placement for 8b; 12 civilization roots, 10 colours; authority-chain fix; religion slots by seat count; host and server validation; ten-seat fixtures in engine, host, wasm and portable tests; interim `fuzz` fix (§6.4); client setup list, emblems, chart markers, observer keys and count-neutral strings; bench split timer; Huge performance checkpoint |
| 6b | Deeper technology graph (doc 39) | T330-T335 join doc 39's merge as knowledge only (works come in 7c and 12b) |
| 6c | Deeper practice graph (doc 39) | C180-C183 join the merge |
| **7c** | **Sight and scouts** (new, after 7b so scouts use network speeds) | knowledge levels, sight quality and thresholds, sightings and ghosts, scouts (foot, mounted, ship, motor), watch line, map office, revised `Maps`, `Sightings` clause, `Explore` directive, fog views in the protocol; native AI scouting rules (§9.3) |
| **8b** | **Raiders** (new, after 8 so camps use generations; may be pulled before 7 with tiers, open question 10) | camps, budding, joining, generation rule, raids, blocking, clearing and policies, tribute, mercenaries, integration, decline, G96 counting, sightings, native AI (§5.11); re-run slice 2-3 checkpoints for early expansion |
| **12b** | **Intelligence** (new, after 12 because trade feeds intelligence, and after 10 for era gating) | dossier and estimate model replacing `fuzz`, yearly tick, embassies, agents and the intelligence line, telegraph and SIGINT, aerial sorties and radar, counter-intelligence, secrecy, concealment, deception, remaining sharing clauses, truth events, native AI VOI and spending (§9) |
| 13 | Traditions | §4.12 advantages; cyber intrusion; charters' intelligence effects |
| 14 | Space access | recon and signals satellites as boost payloads, ground stations, tasking, satellite tracking |
| 16 | Real Earth | `earth48` cradle sets per seat count; `earth96` if kept |
| 17 | Victory and the native AI | calibration per preset (§2.5); tests of §9.6 |
| 18 | Client | §11 views, built after 4b, 7c, 8b and 12b |

### 13.2 Acceptance tests (beyond docs 36-39's common tests)

- **Seats and maps**: for every preset and every allowed seat count, 1,000 worlds pass
  fair-start acceptance (≥ 99% without relaxation); identical world hash native and wasm;
  a ten-seat all-AI match runs to the horizon with ledgers balanced; `authority()` resolves
  a nine-deep subordination chain; setup refuses counts outside the preset with the named
  error.
- **Isolation**: seat A's observation is byte-identical when B changes armies, stocks,
  research, secrecy, deception or cells in any field where A has no source; A's reports
  change only at the yearly tick or by sighting or truth event; camps not sighted are
  absent; `β`, `η`, `raider_gen`, CI and deception never appear in serialized
  observations, help, errors or logs (automated scan of every DTO and string table).
- **No leakage via repeated queries**: 1,000 identical `get_turn` and history requests
  return identical bytes and leave the state hash unchanged; in a fixture where B's
  population is held constant for 40 years, the mean of A's 40 yearly points has error ≥
  0.2 × w for at least half of 64 seeds (no convergence from one source class); the
  fraction of bands containing the truth is 80-92% over 64 seeds (not 100%).
- **Determinism**: same seed and controllers → same state hash with checkpoint reload, for
  4 and 10 seats; intelligence tick, raids and budding independent of seat processing
  order and thread count (swap two seats in a fixture → mirrored reports).
- **Hidden graph**: every named technology or practice in every dossier is discovered or
  recognized by the viewer (scan); masked texts contain no node id or name.
- **Raiders**: people identity with camps (born, died, budded, joined, dispersed,
  integrated); plunder identity; no raider captures a region or eliminates a seat;
  `raider_gen` ≤ leader − 1 always and ≥ the laggard's best; settle into a camp region
  refused; camp regions block G96 until cleared.
- **Sharing**: shared reports keep their original `as_of` and sources; a retold estimate
  adds no coverage; Transparency values equal the sharer's own exact view.
- **Performance**: `perf_round_budget` checkpoints for Huge at AD 1700 and 2150 within the
  budgets of §2.6, native single-thread and 4 threads, and wasm.

### 13.3 Calibration targets (added)

| Metric | Target |
| --- | --- |
| Seat and victory | the per-preset table of §2.5 |
| Exploration | median seat by AD 1: ≥ 60% of land regions within four links of its capital charted; by 1500: ≥ 50% of the world's land regions charted |
| Estimate quality | median width of population reports on met neighbours ≤ 40% before AD 1, ≤ 20% by 1800 and ≤ 10% by 2000 for seats that invest; non-investing seats stay ≥ 25% |
| Spending | intelligence ≤ 3% of goods value for the median seat; ≤ 5% for Hard |
| Agents | capture incidents 0.5-3 per seat per century after 1800 |
| Surprise | 15-35% of wars after 1500 start with the attacker's force above the defender's upper bound (surprise exists but is not the norm) |
| Deception | ≤ 10% of reports under an active deception at any time |
| Satellites | seats with reconnaissance satellites image ≥ 80% of foreign regions a year |
| Raiders, pacing | regions held per seat at AD 1 within −15% of a no-raider baseline; each seat clears or absorbs ≥ 1 camp before AD 1 in ≥ 70% of matches; 2-8 raids per seat per century between 3000 BC and AD 1000; no seat loses > 10% of its population to raids in any century in ≥ 90% of seat-centuries |
| Raiders, end | ≤ 10% of initial camps remain at 1800 (median match); none at 1900 in ≥ 80% |
| Information matters | the §9.6 tests pass |

### 13.4 Risks

- **Scope.** Four slices; each stands alone (seats and maps without intelligence; sight
  without dossiers; raiders without intelligence). The cut list is explicit.
- **Native AI load.** Ten seats multiply AI cost; per-seat parallel policy and fixed node
  budgets bound it. The VOI layer is small (candidates in the existing list). Where the AI
  cannot use a mechanism, cut it, never give the AI information.
- **Calibration coupling.** Raiders slow early expansion and touch slice 2-3 calibrations;
  more seats lower the winner rate. Era checkpoints keep iterations short; levers are
  listed (§2.5, raid chance, camp counts).
- **Leaks.** The estimate model must be implemented exactly (keys, epochs, zero handling);
  the automated scans and the convergence test guard it.
- **Player overload.** Defaults: `Explore` directive, automatic satellite tasking, Guarded
  posture, Disperse; the dossier shows one line per field with detail on demand.
- **Observation size** on Huge: deltas and caching (§2.6).

### 13.5 Interaction with other cut lists

Docs 37, 38 and 39 keep their own lists for their systems; this chapter's list follows
doc 39's and precedes doc 36's.

### 13.6 What to cut first (in order)

1. Deception operations (concealment stays).
2. Technology evidence and research focus of agent cells (collection stays).
3. Signals satellites (reconnaissance satellites stay).
4. Cyber intrusion as its own source (folded into SIGINT).
5. The `earth96` real-Earth map (`earth48` stays, 2-5 seats).
6. Raider mercenaries.
7. Raider integration (tribute, dispersal and subjugation stay).
8. Aerial sorties (radar and satellites stay).
9. `IntelligenceAlliance`, `Inspection` and leaks (Maps, Sightings, Estimates,
   Transparency, Embassy and NoEspionage stay).
10. Scout kinds beyond foot and ship (one land kind with terrain speeds).

Never cut: 2-10 seats and the presets, fair starts, the estimate model with systematic
bias, knowledge levels and sight, scouts, embassies, agent collection, reconnaissance
satellites, the core sharing clauses, raider camps with raids, clearing and tribute, and
the invariants of §10.
