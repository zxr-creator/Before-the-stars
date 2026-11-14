# 36. Ruleset 3.0: a historical calendar, resources, productivity and trade

> **2026-11-13 design precedence:** this chapter retains historical rules where it
> describes global-integration/fleet-wide victory, mandatory manual courses, or
> native access to unrevealed victory ancestry. For the next ruleset use
> [42: playability](42-ftl-completion-and-playability.md),
> [15: FTL completion](15-victory-and-ftl.md),
> [43: agent access](43-agent-access-and-decision-packets.md), and
> [44: institutional education](44-institutional-education.md). These are design
> changes awaiting implementation, not modifications to existing saves. Other
> nonconflicting rules and the later ruleset-3 calendar remain applicable.

Status: design and implementation plan; no code is changed by this chapter. It builds
on ruleset 2.0 as it stands on branch `worktree-agent-ae3d44154d3d3f88e` (commit
`6986601`): `docs/units-and-scale.md`, `docs/conservation-audit.md` and
`docs/design/35-industrial-base-plan-v1.1.md` remain normative wherever this chapter
does not change them. Decisions the user should confirm are listed with
recommendations in `36-open-questions.md`.

Every number marked *provisional* is a starting value for calibration with all-AI
matches; units, identities, orderings and formulas are not provisional. Integer
arithmetic only: rates in basis points (bp, 10,000 = 1.0), products through `i128`
(`util::muldiv`), remainders carried as today.

---

## 0. Summary for the player

**The game is now a history of 7,500 years.** You start in 5000 BC with a people of
about a quarter of a million in one homeland and play until one civilization unites
the world and can sustain a faster-than-light service, or until AD 2500. A
well-played strong civilization should get there around AD 2250-2330.

**Time runs fast early and slows down later.** A round is 50 years at the start, then
40, 25, 20, 10, 5, 4 and, from AD 1950, 2 years. The standard game has 525 rounds;
a won game usually ends after about 390-440 of them. The date is always shown as a
year (for example "3200 BC", "AD 1066"). Because early rounds are long, you give
standing orders ("keep five levels of fields here", "keep training scribes",
"investigate these leads in this order") that your people carry out year by year
until you next decide.

**Population follows history.** For thousands of years your people grow slowly:
hunger, disease, crowded towns without sewers and frequent epidemics keep deaths
close to births. Wells, irrigation, iron tools and new land raise the ceiling a
little at a time. Then sanitation, vaccination, fertilizer and machines cut deaths
long before families get smaller, and population explodes. Later, schooling
(especially of young adults), cities, pensions and prosperity make families smaller
and growth slows to nearly nothing. Large late civilizations hold hundreds of
millions; the world reaches about two billion.

**Productivity has many causes, and you can see each one.** How many workers a
works needs and how much a field yields depend on your people's schooling, your
culture's practices and leanings, the doctrines of their religion, the resources
and inputs at hand, your technology, how developed the region is (from camp to
megalopolis, with water, sanitation and amenities) and the buildings and methods
you chose. Every region shows a breakdown, factor by factor.

**Resources appear as you learn to recognize them.** Copper, tin, horses, salt,
timber and precious metals matter in antiquity; iron and saltpetre later; coal,
oil, gas, bauxite and uranium in the industrial and modern ages; rare earths,
lithium, cobalt and nickel, high-purity quartz and helium for computing, AI,
fusion and the jump programme. A deposit you cannot yet recognize is not on your
map. Some are rare and far away: tin, helium, lithium. About forty-seven goods in
all, each with a reason to exist.

**You can trade.** Civilizations in contact, at peace and connected by land, river
or sea form a common market. You post standing buy and sell orders; each month the
referee sets one price per good from supply and demand and settles every order at
it. Sales earn trade credit and purchases spend it; credit can also pay for
treaties. Routes have capacity and lose some cargo on the way. War, embargo and
blockade cut routes, so a civilization that depends on imports must keep reserves
or find alternatives. Nobody can sell what they do not have, and nobody can see
another civilization's orders.

**Winning is still hard but now reachable.** You must still govern the whole
inhabited world for 96 months, run a jump service for 24 months and fly two trials.
With centuries of industrial time instead of a few decades, a strong civilization
has room to unite the world by diplomacy or war before the jump programme is ready.

---

## 1. Diagnosis: what the measurements say

Measured on branch `6986601`, release build, Apple M5 Pro (single thread per match).

| Observation | Source | Consequence for 3.0 |
| --- | --- | --- |
| 0 of 8 all-AI matches (eval seeds, hard/medium/medium/easy) produce a winner; 1 of 8 under slice D (month 2,764 of 2,880) | `docs/calibration/slice-e-eval.txt`, `slice-d-eval.txt` | the horizon is reached about 20 rounds after the graph completes; no time is left for global integration |
| In riverland the two strongest seats complete the graph at month 2,880 (138 techs); tier 9 arrives at month ~2,400 | `slice-e-riverland.txt` | the jump tier arrives in the last tenth of the game |
| "No seat has completed global integration within the horizon" | branch `docs/implementation-status.md` | G96 (one authority over every inhabited region) is the binding condition, not technology |
| Seat populations end at 10-140 million; growth 1.5-2.5% a year while land lasts | units chapter §3, eval runs | no historical curve; numbers too small for a world of billions |
| Pure simulation cost (no policy decisions) 0.06 ms/month at year 20, 0.085 at year 60, 0.60 at year 120, 0.39 at year 180 (riverland) | `examples/bench` on saves from `bts run --save` (this chapter, appendix B) | a month is cheap; 90,000 months are affordable |
| Full 240-round all-AI match 4.06 s, of which policy and observation ~3.2 s (~13 ms per round for four seats) | `bts run --seed riverland` | cost per round is dominated by the policy, not by months |

Principles that do not change: conservation of goods, people, qualified people,
service, work and deposits (every new flow gets a ledger line); construction and
operation consume real materials, labour, qualified people, energy and time;
economies of scale only through shared infrastructure and specialization, capped,
never as output from nothing; the independent jump programme needs the broad base
of chapter 35 with no population threshold; small civilizations take part through
trade, secondments and joint programmes; strict per-seat information isolation; the
fixed 138-node technology graph, 64 practices and 24 courses, of which each seat sees
only what it has discovered; G96 ∧ F24 ∧ Trials96 with one winner.

---

## 2. Calendar and pacing

### 2.1 Representation of dates

- The authoritative clock stays the simulated month, `World.month: u32`, counting
  completed months since the start (0 at the start; 89,988 at the standard horizon).
- The scenario fixes `start_astro_year: i32` (standard: −4999) and the start month
  (January). Internally years use astronomical numbering (1 BC = 0, 5000 BC = −4999).
- The date of the month about to be simulated after `m` completed months is
  `astro = start_astro_year + m / 12`, month of year `m % 12 + 1`.
- On the wire and on screen a year is **historical, signed, with no year zero**:
  `year = astro` if `astro >= 1`, else `astro - 1` (so −5000 is 5000 BC, −1 is 1 BC,
  1 is AD 1). Labels: `"5000 BC"`, `"AD 1066"`; months as `"March 1066"` where useful.
- Ageing still happens on the annual boundary (`m % 12 == 0`), now 1 January.
- `util::date(m) -> (i32 historical_year, u8 month)` and `util::date_label(m)` are the
  only conversions; chronicle, briefings, receipts and treaty texts use them instead
  of "month N".

### 2.2 The round schedule (fixed by round number)

`MatchConfig.calendar: CalendarId` (`Standard`, `Quick`, `Fixture { months_per_round,
start_astro_year, rounds }`) replaces `months_per_round` and `horizon`; both become
derived values. The schedule is a content table of segments; round `r` lasts
`round_months(r)`. Segment boundaries fall on round dates; the only irregular round
is the one that starts at AD 1, which is one year shorter because there is no year
zero.

**Standard** (horizon AD 2500, 525 rounds, 89,988 months):

| Segment | Rounds | Years per round | From | To | Rounds in segment | Months |
| --- | --- | --- | --- | --- | --- | --- |
| A Neolithic and early bronze | 1-60 | 50 | 5000 BC | 2000 BC | 60 | 36,000 |
| B Bronze and iron | 61-110 | 40 | 2000 BC | AD 1 | 50 | 24,000 |
| C Classical and late antiquity | 111-150 | 25 (round 111: 24) | AD 1 | AD 1000 | 40 | 11,988 |
| D High medieval | 151-175 | 20 | 1000 | 1500 | 25 | 6,000 |
| E Early modern | 176-195 | 10 | 1500 | 1700 | 20 | 2,400 |
| F Scientific and first industrial | 196-225 | 5 | 1700 | 1850 | 30 | 1,800 |
| G Industrial | 226-250 | 4 | 1850 | 1950 | 25 | 1,200 |
| H Modern, space and jump | 251-525 | 2 | 1950 | 2500 | 275 | 6,600 |

Why 525 and not 450-500: a two-year floor across the 550 years in which the
decisive play happens costs 275 rounds; any schedule with that floor lands at
515-530 rounds (checked for several variants). A won game ends around round
390-440 (AD 2230-2330; AD 2280 is round 416), inside the requested range. The alternatives (a
2.5-year floor, or a horizon of AD 2400 at exactly 500 rounds) are in the open
questions.

**Quick** (same dates and rules, half the decisions, 230 rounds): A 100 years (30
rounds), B 80 (25), C 50 (20; the first 49), D 50 (10), E 20 (10), F 10 (15), G 10
(10), H 5 (110). Only the number of decisions changes; every rate is monthly and
identical.

**Fixture** (tests and calibration only): fixed `months_per_round` from a given start
date, for example 12-month rounds from AD 1700 on a checkpoint save. Ruleset-2.0-style
unit tests run under `Fixture { 12, −4999, 240 }`.

The observation states the calendar (`CalendarView`, section 9): segments, this
round's length and dates, the next round's length, horizon month and date.

### 2.3 Horizon and reward

Horizon `H` = 89,988 months (start of AD 2500). The reward `2 − T/H` would compress
every win to 1.0-1.1 because 5,000 of the 7,500 years are antiquity. Replace it with

    reward(winner) = 2 − (T − R) / (H − R),   R = first month of AD 1900 (82,788 standard)

clamped to [1, 2]; every other seat −1 as before. A win in AD 2280 scores 1.37, in
AD 2150 1.58. `R` is a scenario constant shown in `CalendarView`.

### 2.4 Running the monthly simulation through 50-year rounds

**Decision: keep the monthly step everywhere.** A 50-year round runs 600 monthly
steps. Measured costs (appendix B) make this affordable:

| Part of a standard match | Months | Assumed cost per month (native) | Native time |
| --- | --- | --- | --- |
| Segments A-B (small, nearly flat economies) | 60,000 | 0.07 ms | 4.2 s |
| C-D | 17,988 | 0.10 ms | 1.8 s |
| E-F | 4,200 | 0.20 ms | 0.8 s |
| G | 1,200 | 0.40 ms | 0.5 s |
| H (large economies, markets, more regions in use) | 6,600 | 0.80 ms | 5.3 s |
| New systems (market clearing, consumption, outbreaks, productivity): +30% | | | +3.8 s |
| Policy and observations, 525 rounds (≈5 ms per round early, ≈30 ms in H) | | | ≈10 s |
| **Total per match, native, single thread** | 89,988 | | **≈26 s** |
| **Total per match, wasm (≈2× native)** | | | **≈52 s** |

Per round: a 50-year round is ≈600 × 0.07 ms + policy ≈ 50 ms native, ≈100 ms
wasm; a 2-year round in AD 2200 is ≈24 × 0.8 ms + policy ≈ 50 ms native. An
8-match calibration batch runs in parallel in ≈30 s; 64 matches on 15 cores in
≈2-3 minutes.

**Budgets (acceptance tests, section 10):** p95 per round including three native
seats ≤ 150 ms native and ≤ 400 ms wasm; a full standard all-AI match ≤ 60 s native.

**Contingency, only if a budget fails: annual stepping in long rounds.** For rounds
whose step is 20 years or more (standard rounds 1-175; quick 1-85), and only there,
the engine may resolve one year per step. The choice is a function of the round
number, so determinism holds. Everything is computed once per year with twelve
months of flow, and every flow is still booked in the same ledgers, so every
conservation identity holds per year:

| Process | Annual-step rule |
| --- | --- |
| Food, production, upkeep, service | one month computed, all flows ×12, inputs taken from year-start stock (a works short for the year runs at the share it can fill) |
| Births and deaths | annual expected counts = monthly expectation ×12 (rates are small: < 3% a month in every band); remainders carried as now; the nine-month birth lag becomes "last year's intensity" |
| Ageing | unchanged (annual) |
| Construction and courses | 12 months of work credited at once; completion month = max(start + minimum months, month the work is done), recorded exactly; graduates appear at year end |
| Treaty deliveries, market orders | 12 × the monthly quantity, cleared once at the year's price |
| Epidemics, harvests, culture, discovery | annual hazards = monthly ×12; evidence ×12 |
| Military | monthly as before; any round in which a seat is at war runs monthly |

Measured costs make this unnecessary at present; it is specified so that a wasm
regression does not force a redesign.

### 2.5 What happens to rules written in months

| Rule | 2.0 | 3.0 |
| --- | --- | --- |
| Project minimum months, work per month | real months | unchanged; when an order finishes mid-round the region's queue moves on and standing build targets (2.6) order the next level |
| Course length, class size | real months | unchanged; `start_program.repeat = true` re-enrols a new cohort when one graduates, while venue, instructors and entrants last |
| Investigation of a technology | real months | unchanged; the research agenda (2.6) starts the next item when one finishes |
| Treaty clause terms (`months`) | 6-240 | minimum `max(6, round_months)`; maximum `max(240, 3 × round_months)` (1,800 in segment A); new value `months: 0` = open-ended until either party gives notice, notice period one full round |
| Offer expiry | rounds | unchanged |
| Negotiation | five windows per round | unchanged; a 50-year round still has five windows |
| Native AI decision cadence | once per round | unchanged; within a round only standing orders act (equally available to every seat) |
| G96, F24, Trials96 (96/24/96 months, 12 apart) | months | unchanged; they fall in segment H (2-year rounds), so G96 spans 4 rounds |
| Chronicle | monthly moments | still recorded monthly; the round recap shows at most 12 moments per seat (by significance), the rest stay in the archive; each round adds one "era summary" (population change, techs, wars, founding of faiths) |
| Briefings | per round | grouped by kind with counts for long rounds ("14 new leads") |
| Ledger `last_flows` | sum over the round | still the round's sum; views also show per-month average and last 12 months, because a 50-year sum is unreadable |
| Food reserve months, stock targets, storage throttles, `use_ema` | months | unchanged |
| Practice reform, cultural drift, religious stages | months | unchanged (real time) |
| War: attack orders, capture (5 months), sovereignty (6 months) | months | unchanged; a war between seats begins only in the first month of a round (an `attack` order against a seat not at war is executed then); armies keep orders for the whole round; war policies (2.6) can accept armistice automatically |

### 2.6 Standing orders (directives)

Long rounds are unplayable without them. They are part of the protocol, available to
every seat alike, evaluated by the engine on every 1 January inside a round (and in
the first month of every round), in the seat's order, each through exactly the same
validation as the equivalent action. A directive that fails validation is skipped
that year and reports why; it never bypasses a cost.

| Directive | Effect each year |
| --- | --- |
| `build_target { region, facility, levels, priority }` | if the region has fewer levels (built + under construction) than `levels`, and its queue holds no open order for that facility, order one more level (or the shortfall up to 4) at the quoted price |
| `program repeat` (flag on a programme) | when a cohort graduates, enrol the next with the same places, if entrants and instructors exist |
| `research_agenda { techs: [...] }` | when fewer investigations run than the seat's research classes can staff, start the first discovered item of the list; `auto_research: true` falls back to the discovered lead with most evidence |
| `settle_target { from, to, people, when_crowd_bp }` | order the settlement when the sending region's crowding exceeds the threshold and the target is still unclaimed |
| `stock_policy` (existing food reserve; new consumption level, section 5.5) | as today |
| market orders (section 6) | standing until changed |
| `war_policy { seat, accept_white_peace_after_months, accept_cession_max }` | the engine signs a peace offered by that seat when the condition holds; with both sides' policies permitting, an armistice (white peace) comes into force after 36 months without a change of control |

The native AI expresses its plans for long rounds as directives (section 10, slice 1).
A human may also ask the existing steward to draft directives at a round boundary;
the steward never acts inside a round.

### 2.7 Era targets and how pace emerges

Pace is not scripted by date. The rules make discovery depend on how many people
practise a domain, how they keep and pass on knowledge, how much contact and trade
they have and what institutions they built. The constants are calibrated so that a
*median* seat (all-AI, standard calendar) lands in these windows; leaders are
earlier, laggards later, and contact pulls laggards forward.

| Milestone | Nodes | Median seat | Leader window |
| --- | --- | --- | --- |
| Storage, pottery, calendars | T007, T008, T010 | 4800-4000 BC | from 4950 BC |
| Irrigation, copper smelting | T011, T015 | 4500-3500 BC | 4700 BC |
| Writing | T025 | 3500-2500 BC | 3400 BC |
| Bronze (alloy casting) | T022 | 3300-2300 BC | 3300 BC |
| Iron | T023 | 1500-600 BC | 1700 BC |
| Classical works: masonry, roads, sailing, water mills | T024, T027-T029 | 1500 BC-AD 300 | |
| Medieval: media, glass, timekeeping, propellants | T030-T036 | AD 500-1300 | |
| Printing | T048 | 1350-1550 | 1250 |
| Scientific method (milestone: T049 + C013 + working laboratory) | | 1550-1700 | 1450-1600 |
| Steam, steel, machine tools | T080, T060, T061 | 1750-1850 | 1720 |
| Electricity | T100 | 1850-1920 | 1840 |
| Programmable computers | T111 | 1940-2000 | 1930 |
| Orbital transport | T142 | 2000-2080 | 1990 |
| Fission power (content tier 8) | T147 | 2060-2140 | |
| Repeatable spacetime anomaly | T162 | 2150-2220 | 2130 |
| Fleet-wide jump standards | T167 | 2180-2260 | 2160-2220 |
| Complete victory (hard seat, when it happens) | | 2230-2330, median ≈2280 | |

**Discovery (leads).** For each technology whose prerequisites are met and that is
unknown or hinted, evidence grows every month by

    gain = P × C / 10,000 + T + X
    P = (Σ over the node's tags of activity(tag)) / n_tags / 2          (as today)
    activity(tag) = isqrt(10 × people working in that tag)              (as today)
    C = channel factor (bp): oral 6,000; writing understood (T025) 10,000;
        archives (C013) 13,000; printing (T048) 16,000; scientific method milestone
        22,000; research commons (C044) 26,000; digital networks (T112) 30,000;
        then × (10,000 + literate share of working age / 2) / 10,000,
        then × the culture factor for discovery (Openness and Revisability, ±10%)
        and religious doctrines (for example the Sky Terraces, +10% in Measure)
    T = isqrt(10 × research staff) / 5                                  (as today)
    X = Σ over peaceful contacts that have prototyped the node of
        P × C / 10,000 × (5,000 + trade factor) / 10,000
        trade factor = min(10,000, 10,000 × credit value traded with that partner
                       in the last 12 months / (12 × 1,000 cr)), plus 2,500 each
                       for customs (C012) and translation (C024)

so a seat in active trade with a more advanced neighbour gathers evidence up to
twice as fast: diffusion along trade routes is how laggards catch up.

Thresholds (hint at `H[t]`, discovery at 2.5 × `H[t]`), scaled by `pace_bp`,
provisional, derived from target lead times × the gain a median seat has in that era
(appendix A.3):

| Tier | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Nodes | 16 | 16 | 12 | 7 | 15 | 19 | 15 | 17 | 15 | 6 |
| `H[t]` (2.0: 900 × (t+1)) | 1.0 M | 4.0 M | 6.0 M | 4.0 M | 3.0 M | 3.2 M | 4.0 M | 4.5 M | 5.5 M | 5.5 M |
| Target lead time after prerequisites (median) | 300 y | 400 y | 200 y | 40 y | 25 y | 15 y | 10 y | 8 y | 8 y | 6 y |

Paid exploratory studies (`Study`) keep their rule (a hint for at most two nodes),
so a seat can always buy its way out of a stalled domain.

**Investigation (understanding).** Research capacity becomes

    research_cap[class] = staffed research posts × RE / 10,000          (≤ posts)
    RE (research effectiveness, bp): oral 2,000; writing 3,500; archives (C013)
        5,000; printing 6,500; scientific method milestone 8,500; research
        commons (C044) 9,500; digital networks (T112) 10,000

so a researcher-month is still at most one person in a research post (the research
ledger identity is unchanged). Work and minimum months per tier, provisional:

| Tier | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Work, researcher-months (2.0 in brackets, thousands) | 50 k (18) | 300 k (50) | 1 M (120) | 2 M (230) | 5 M (400) | 20 M (620) | 60 M (950) | 120 M (1,450) | 200 M (2,200) | 300 M (3,400) |
| Minimum months (2.0) | 120 (4) | 180 (6) | 120 (9) | 60 (12) | 36 (15) | 30 (18) | 30 (20) | 30 (24) | 36 (30) | 36 (36) |

Derivation: work ≈ 36 × the median seat's monthly research capacity in the tier's
era (10 years at 30% of capacity): ≈1.5 k, 9 k, 30 k, 60 k, 150 k, 600 k, 2 M, 4 M,
7 M and 9 M researcher-months a month respectively, from the population targets of
section 3 and research posts of 0.3% (1700) rising to 2% (2200) of the population.
In antiquity the minimum months and the leads set the pace; from the scientific
method on, research capacity does. The six serial jump nodes at ≈3 years each put
T167 about 18 years after T162.

---

## 3. Population

### 3.1 Targets

Four seats, 48 regions (unchanged world size). "Median seat" excludes conquered
seats; "largest" includes conquest.

| Date | Median seat | Largest seat | World | Long-run growth |
| --- | --- | --- | --- | --- |
| 5000 BC | 0.24 M | 0.25 M | 0.97 M | |
| 3000 BC | 0.8 M | 1.5 M | 3 M | |
| 1000 BC | 2.5 M | 5 M | 10 M | ≈0.06%/yr |
| AD 1 | 5 M | 8 M | 20 M | |
| AD 1000 | 8 M | 14 M | 32 M | |
| 1500 | 11 M | 20 M | 45 M | ≈0.06%/yr |
| 1700 | 15 M | 25 M | 60 M | |
| 1800 | 20 M | 35 M | 85 M | 0.35%/yr |
| 1900 | 60 M | 110 M | 250 M | 1.1%/yr |
| 1950 | 110 M | 200 M | 450 M | 1.2%/yr |
| 2000 | 230 M | 400 M | 1.0 B | 1.6%/yr |
| 2100 | 400 M | 800 M | 1.7 B | 0.5%/yr |
| 2200 | 480 M | winner of G96: 1.8-2.2 B | 2.0 B | 0.15%/yr |
| 2300 | flat or slightly falling | | 2.0 B | ≈0 |

Tolerance for calibration: each median within a factor of 1.5 of the target; world
peak 1.5-3 billion; no seat-decade with average growth above 3%/yr; pre-1700
growth averaged over any 500 years between 0.02% and 0.15%/yr.

### 3.2 Mechanisms

All in the existing structure (`sim/population.rs`): one combined mortality per age
band, births from reproductive equivalents with the nine-month intensity lag. What
changes are the base rates and the factors.

**Mortality.** Monthly deaths per 100,000 in band `b`:

    rate[b] = base[b] × M_tech[b] × M_care × M_hazard × M_urban × M_outbreak     (each bp)

| Band | 0 | 1-4 | 5-14 | 15-49 | 50-64 | 65+ |
| --- | --- | --- | --- | --- | --- | --- |
| `base` 2.0 | 900 | 180 | 50 | 55 | 160 | 620 |
| `base` 3.0 (pre-modern, provisional) | 2,600 | 420 | 80 | 105 | 260 | 900 |

That is about 27% infant mortality a year and a life expectancy at birth of 25-28.

`M_tech` (multiplied for every technology understood; child = bands 0-14, adult = the
rest; replaces the 2.0 list):

| Node | Child | Adult |
| --- | --- | --- |
| T032 medicinal observation and trauma care | 9,300 | 9,600 |
| T033 drinking water and settlement hygiene | 7,500 | 9,000 |
| T046 anatomy, physiology, clinical records | 9,000 | 9,400 |
| T053 microorganisms and infection | 6,000 | 8,000 |
| T069 urban water treatment and sanitation | 6,000 | 8,500 |
| T070 vaccination and pharmaceutical manufacture | 5,000 | 8,000 |
| T131 molecular analysis and bioengineering | 8,000 | 8,500 |
| T136 regenerative and augmented medicine | 7,000 | 7,000 |
| C002 kin mutual aid (practice) | 9,500 | 10,000 |

Product with everything: child ≈ 0.04, adult ≈ 0.23; modern infant mortality ≈ 0.8%
a year.

`M_care = 10,000 − coverage / 2` where coverage = health capacity (×2 with medicine
in store) over residents, as today; `M_hazard = 10,000 + crowding pressure × 1.5 +
nutrition debt × 40` (as today); `M_urban = 10,000 + 5,000 × urban share × (10,000 −
sanitation coverage) / 10,000²`, where urban share = `1 − min(1, 3.2 × food-sector
workers / residents)` and sanitation coverage = residents served by sewers and
treatment works / residents. Before sewers a town of mostly non-farmers is a
population sink, as historical cities were.

**Epidemics** (new, per region, from the secret stream `("outbreak", region,
month)`): monthly hazard

    h = 1 / 2,400 × density × connectivity × protection
    density = clamp(crowd_bp / 8,000, 0.5, 3)
    connectivity = 1 + 0.25 × active trade routes through the region + 0.5 if a foreign or
                   own army moved through it this year
    protection = 0.5 with T053, × 0.3 with T070, × (1 − coverage / 2)

An outbreak lasts 6-24 months with `M_outbreak` 13,000-25,000 on every band (kills
3-15% of the region), spreads each month with probability 30% to each neighbouring
region and (from slice 7) to each trade partner's gateway region, and leaves the region at a quarter
of the hazard for the next 600 months. Outbreaks are reported to the region's
controller ("Outbreak in <region>") and seen by neighbours who observe the region.
They are the main reason the pre-modern curve is flat with dents rather than smooth,
and the price of connectivity before germ theory.

**Harvests** (new): each region draws once a year from `("harvest", climate zone,
year)` a yield factor in [−1,800, +1,000] bp (triangular, mean −200), shared by
neighbouring regions of the same climate zone (terrain group); damped ×0.5 by
irrigation and ×0.3 by mechanized methods. Lean years drain granaries and trigger
famine where reserves are thin.

**Fertility.** Monthly births per block as today,

    births = equivalents × 30 / 1,000 × lagged_intensity / 10,000 × health_factor / 10,000

with `intensity = F_custom × F_food × F_crowd × F_dev` (each bp, clamped 400-10,000):

| Factor | Rule (provisional) |
| --- | --- |
| `F_custom` customary fertility (marriage age, nursing, spacing) | 5,500 base; ±1,000 by doctrine and practice: Fruitful Households doctrine +800, celibate orders (doctrine, future) −300, C002 +300, C039 basic provision −500 |
| `F_food` | as today (quadratic in reserve security; drops with hunger) |
| `F_crowd` | as today |
| `F_dev` | `clamp(10,000 − 3,500 × lit − 1,500 × urban − 1,500 × child survival gain − 1,000 × prosperity, 3,600, 10,000) + 500 with C046 lifelong training and transition support`; lit = literate-or-higher share of ages 15-49 (schooling of young adults, the best proxy for women's schooling in a model without sex), child survival gain = `1 − child M_tech`, prosperity from section 5.5 |

Check at the extremes: pre-modern intensity ≈0.55 gives a net reproduction rate of
≈1.15 (≈+0.5%/yr) with full food and no crowding; crowding, urban mortality,
outbreaks and lean years bring the long-run average to ≈0.05-0.1%/yr. In the
industrial transition mortality falls first (sanitation, T053, T069, T070) while
`F_dev` follows schooling with a lag of a generation: growth 1-2%/yr. Modern
`F_dev` at its floor gives a total fertility near 1.8: slow decline unless
prosperity, practices or doctrines push it up.

**Famine, war, migration.** Famine is the existing nutrition debt; war deaths as
today. Internal migration as today. Emigration between civilizations is not
modelled (a later extension); conquest, cession and secondments move people as
today.

### 3.3 Carrying capacity

Land, water and sanitation set the ceilings; technology raises them.

- **Arable land ×3**: worldgen arable ranges are tripled (plains 90-165 levels,
  hills 30-66, forest 36-72 ...; homes at least 102). A field level keeps its
  meaning (the plots of 10,000 hand cultivators). The 2.0 counts understated a
  country-sized region's cropland; with modern yields they would cap the world near
  0.3 billion.
- **Field methods v3** (per level-month, before irrigation +25%, floodplain bonus +25%,
  harvest factor, agricultural culture ±5%):

| Method | Requires | Rations | General posts | Inputs |
| --- | --- | --- | --- | --- |
| Hand cultivation | - | 30,000 | 10,000 | - |
| Animal traction | T020, horses in store | 46,000 | 8,000 | 30 horses (draught replacement) |
| Rotation and manuring (new) | T020 & T011 & C017 | 60,000 | 8,000 | 30 horses |
| Fertilized fields | T095 | 120,000 | 6,000 | 0.15 kt fertilizer |
| Mechanized farming | T094 | 110,000 | 3,000 | 0.10 kt fuel |
| Intensive (mechanized + fertilizer) | T094 & T095 | 250,000 | 2,000 | 0.30 kt fertilizer, 0.15 kt fuel |
| Restorative | + T133 | 380,000 | 1,500 | 0.20 kt fertilizer, 0.15 kt fuel, 0.05 kt chemicals |

- **Food synthesis works** (new facility, T132 & T135): food from electricity,
  chemicals and atmospheric carbon (a declared atmospheric-input recipe, section 5.4):
  per level-month 4 kt chemicals + 400 electric → 200,000 rations (10 kt); 4,000 posts
  (2,000 technicians). It is not limited by land, only by energy and inputs; it lets
  dense late regions pass the field ceiling.
- **Water and sanitation**: natural water unchanged (homes ≥ 2.6 million; others
  0.6-4 million); wells 1.2 M, sewers 3 M, treatment 12 M per level as now.
  Sanitation coverage (sewers and treatment) now also drives `M_urban`.
- Result: pre-modern regions saturate at 1-3 million (water, health, urban
  mortality); by 2200 well-developed plains carry 60-120 million and the world about
  two billion.

### 3.4 Age cells and integer widths

- 81 annual cells per block, `u32`; a single-age cohort of a 150-million region is
  ≈3 million, far below 4.29 billion. No change.
- `Region::population()` stays `u32` (≤ 4.29 billion per region). Every sum over
  regions (civilization, world, diagnostics, `OwnCiv.population`,
  `SeatDiagnostics.population`, `ForeignCiv` estimates) becomes `u64`; protocol
  population fields widen to `u64`.
- Every product of a head count with two bp factors goes through `i128` (`muldiv`);
  an overflow audit (`grep` for `as i64 *` on head counts) is part of slice 2.

### 3.5 Reconciliation with ruleset 2.0

The start is unchanged: **236,000-248,000 people per seat** in one home region, on
the same smooth pyramid, with the same stores and qualifications. Ruleset 2.0 chose
that size because 240 years of demographic time could only multiply a population a
few hundred times; 7,500 years remove that constraint but the start is still a
sensible size for a homeland of first cultivators, and keeping it keeps every crew
and facility scale of 2.0. What changes:

| 2.0 value | 3.0 value |
| --- | --- |
| Strong late civilization 30-150 M in 10-40 regions | 200-900 M independent; a world winner 1.5-2.5 B |
| Sustained growth 1.5-2.5%/yr while land and water last | ≈0.06%/yr pre-1700 (frontier bursts ≤ 0.5%), 1-2% industrial, ≤ 0.5% modern, ≈0 late |
| Mortality bands 900/180/50/55/160/620 | 2,600/420/80/105/260/900 and the new `M_tech` table |
| Fertility intensity `food × crowd × (10,000 − 0.7 × edu)` | `F_custom × F_food × F_crowd × F_dev` |
| Arable ranges | ×3 |
| Field methods (6) | 7 methods with labour per level falling to 1,500 and yields to 380,000 |
| Settlement classes: Camp, Village, Town, City, Metropolis ≥ 12 M | adds **Megalopolis ≥ 40 M** (Metropolis 12-40 M) |
| Deposits within three links of home: 240 Mt copper, 700 Mt iron, 1,000 Mt coal, 120 Mt rare minerals | 1,200 Mt copper, 7,000 Mt iron, 10,000 Mt coal (300 years of industrial demand at the new scale); rare minerals retired (section 5) |
| Research work and thresholds | section 2.7 |
| `pop_peak`, diagnostics, population fields `u32` | `u64` |

---

## 4. Productivity

### 4.1 Channels

Productivity acts through four channels only, each of which leaves the conservation
identities untouched:

1. **Labour per unit**: the general posts (and, through automation only, qualified
   posts) a works needs per level. Output per level stays the recipe's hard ceiling
   (units chapter §7); higher productivity frees people for more levels, schooling,
   research, construction and the army. This is output per worker.
2. **Yield per land**: rations, fibres, horses, timber and spices per level of a
   land-based works (fields, pasture, plantations, forestry, fishing). Grown goods are
   not mass-balanced (as food today), but each yield is capped at twice its method's
   base.
3. **Yield per deposit**: delivered per tonne drawn, `0.5 + q/2` as today, plus
   method choice.
4. **Research and construction effectiveness**: researcher-months per research post
   (`RE ≤ 1`, section 2.7) and worker-months of project work per called-up worker
   (construction factor below, ≤ 1.5, which raises how fast the bill is worked, never
   lowers the bill of goods).

Recipe ratios (goods out per goods in) never change with productivity; only methods,
which are tech-gated recipes that pass the mass balance, change them.

### 4.2 The factors

For region `r` and sector `k` ∈ {Food, Extraction, Industry, Services, Knowledge,
Construction}:

    LP(r,k) = clamp(F_edu × F_cul × F_rel × F_tech × F_city × F_health, 5,000, 40,000)   (bp products)
    general posts per level = ceil(method general posts × (10,000 − support saving) / 10,000 × 10,000 / LP)
    qualified posts per level = ceil(q × 10,000 / LPq),  LPq = clamp(F_auto, 10,000, 15,000)

| Factor | Formula (provisional) | Range |
| --- | --- | --- |
| `F_edu` education | `10,000 + 3,000 × lit + 2,000 × skilled share`; lit = literate-or-higher share of working age in the region; skilled share = holders of any vocational or higher qualification (artisan, smith, builder, mechanic, technician, electrician, programmer, scientist ...) over working age | 10,000-15,000 |
| `F_cul` culture | `10,000 + (tendency_k − 5,000) / 5 + Σ practice bonuses for k`; tendency_k: Agricultural stewardship → Food; Industrial workmanship → Industry, Extraction; Urban organization → Services, Construction; Revisability → Knowledge. Practice bonuses (established practices): C005 +300 Industry; C006 +300 Food; C007 +200 Food; C017 +400 Food; C018 +500 Industry (cancelled by C033); C022 +300 Industry; C025 +300 Services/Knowledge; C026 +500 Services; C030 +400 Industry; C033 +800 Industry; C034 −200 Industry (and +stability); C035 +500 Industry; C036 +500 Services; C041 +300 Services; C046 +300 all; C049 +500 Services; C050 +800 Services | 8,500-13,000 |
| `F_rel` religion | doctrines of the religion held by the region's majority (secular: 10,000): existing *Shared Labour Days* +500 Construction; new *Sanctified Labour* (follower practice) +500 Industry and Extraction; new *Stewardship of the Land* (founding obligation) +500 Food and +5% field yield; new *Day of Rest* (follower practice) −300 all, +5 stability, +300 `F_custom` | 9,000-11,500 |
| `F_tech` technology | `10,000 + Σ` the productivity techs of sector k (table below) | 10,000-20,000 |
| `F_auto` automation (qualified posts) | T114 +1,000 Industry; T116 +1,000 Services/Knowledge; T122 +2,500 all | 10,000-15,000 |
| `F_city` city development | settlement class for Industry, Services, Knowledge: Camp 9,500, Village 10,000, Town 10,400, City 10,800, Metropolis 11,200, Megalopolis 11,400 (Food, Extraction, Construction 10,000); then `× (10,000 + 600 × prosperity)`; then `− 1,000 × (1 − water coverage)` and `− health pressure / 4` | 8,000-12,500 |
| `F_health` | `10,000 − (10,000 − food access) / 2 − health pressure / 4` | 6,000-10,000 |

Stability keeps acting separately as the unrest factor on the works' rate (as today).

This supersedes the rule of chapters 30 §6 and 32 §4 that culture and religion never
multiply productivity or births, at the user's request, while keeping its intent: no
effect comes from the *name* of a people or faith. Every effect comes from a practice
the civilization established or a doctrine its faith adopted, each with its own costs
and prerequisites, each bounded (culture ±15-30%, religion −10% to +15%), and each
shown by name in the breakdown.

Productivity technologies (`F_tech`, bp added while understood):

| Sector | Nodes |
| --- | --- |
| Food | T010 +300, T056 +500, T082 +300, T121 +500 |
| Extraction | T012 +300, T036 +600 (blasting), T050 +400, T063 +500, T094 +800, T121 +500 |
| Industry | T016 +300, T044 +500, T062 +600, T066 +800, T071 +600, T082 +400, T101 +800, T107 +500, T113 +300, T116 +600, T122 +1,000 |
| Services | T009 +300, T026 +400, T048 +500, T113 +800, T124 +1,000, T122 +1,000 |
| Knowledge | T048 +500, T113 +500, T116 +800 |
| Construction | T024 +500, T050 +800, T067 +300, T094 +1,500, T121 +800 |

The construction factor is `LP(r, Construction)` capped at 15,000: a called-up
worker supplies `LP / 10,000` worker-months of project work (2.0: exactly 1). The
project work ledger becomes `project_work_done ≤ Σ called-up workers × LP / 10,000`.

**Land yield factor** for land-based works: `Y = method yield × (10,000 + 2,500 ×
irrigated share + site bonus) / 10,000 × harvest factor × (10,000 + (Agricultural
stewardship − 5,000) / 10) / 10,000 × doctrine`, capped at 2 × method yield.

**Buildings** enter through the method (base posts and yields), condition (rate),
shared support posts (≤ 20% of general posts, unchanged) and settlement class. Levels
remain the capacity.

Calibration targets for output per worker (food, per worker-month in rations, the
whole food sector): 5000 BC ≈3; AD 1 ≈4; 1700 ≈6; 1900 ≈20; 2000 ≈120; 2200 ≈250.
Share of the working population in food: 75% (antiquity), 60% (1700), 35% (1900),
5% (2000), ≤ 3% (2200).

### 4.3 Visibility

Every governed region shows `productivity: Vec<ProductivityView>`, one per sector:
the total in bp, every factor with its value, its source ("Literate share 42%",
"Practice: Craft guilds", "Doctrine: Sanctified Labour", "City: 6.2 M residents",
"Technology: Interchangeable parts") and the posts it saved last month. Every
`FacilityView` shows base posts per level, after shared support, after productivity,
and for land works the yield per level with its factors. The catalog shows, for
each discovered productivity technology, its sector and value. Factors from
undiscovered nodes and practices are never named; they are absent.

### 4.4 Why none of this creates goods

- Labour per unit changes who is employed, not what a level makes; the hard ceiling
  `recipe × level × rate` stays enforced and audited.
- Land yields are grown goods with an explicit cap per method.
- Deposits never deliver more than is drawn.
- Research and construction effectiveness change the conversion of people into
  work, both bounded (≤ 1 and ≤ 1.5) and booked in existing ledgers.
- The city factor is a capped agglomeration effect (≤ +14%) on labour only, offset by
  water and health penalties; it is the "specialization and shared infrastructure"
  economy of scale the earlier requirement allows.
- The audit (`ledger::violations`) gains: posts per works = the formula with the
  month's factors; project work ≤ called-up × LP; field yield ≤ 2 × method base ×
  levels × rate.

---

## 5. Resources and goods

### 5.1 Classes

- **Strategic**: decide which works, units and programmes you can run at all
  (copper, tin, horses, iron, saltpetre, coal, oil, gas, bauxite, uranium, rare
  earths, lithium, cobalt and nickel, quartz, helium).
- **Bonus**: everywhere in some measure; site bonuses raise yields (stone and clay,
  timber, fertile floodplains, fish banks, wild herds, salt).
- **Luxury and amenity**: raise prosperity with diminishing returns per kind
  (spices and stimulants, precious metals, fine wares; consumer goods in the
  industrial age).

On the map a resource is a **deposit** (finite tonnes in the ground), a **living
site** (renewable: arable, pasture, forest, fishery, spice land) or a **site bonus**
(a region attribute modifying a yield).

### 5.2 Catalog: 47 goods

Units: t = tonne (display kt); ration; lot (display 1,000 lots) with the mass given;
head (horses). "K" = kept from 2.0, "R" = kept and relabelled, "S" = split from a 2.0
good, "N" = new. Era = when it first matters.

| # | Good (key) | | Unit (lot mass) | Era | Made from / where | Main uses | Decision it creates |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Food (`food`) | K | ration (50 kg) | all | fields, pasture, fishing, food synthesis | eating, medicine, orbital stores | land and labour for food vs everything else |
| 2 | Fibres (`fibres`) | N | t | ancient | plantations (cotton, flax), wool herds | textiles, fine wares | cropland for cloth vs food; a classic trade good |
| 3 | Horses (`horses`) | N | head (0.5 t, grown) | ancient-1900 | horse breeding on pasture | traction, cavalry, carts, roads | pasture for herds vs meat; mounted armies |
| 4 | Timber (`timber`) | S | t | all | forestry camps (bounded by forest) | charcoal for furnaces, ships, harbours, construction | deforestation, then coal |
| 5 | Building materials (`materials`) | R | t | all | quarries and clay pits, kilns, cement works | construction, houses | (bonus; everywhere) |
| 6 | Salt (`salt`) | N | t | ancient | salt works on deposits or coastal pans | food preservation (spoilage), chemicals | salt roads; later chlor-alkali feedstock |
| 7 | Spices and stimulants (`spices`) | N | t | ancient | plantations on spice land (warm, wet) | luxury amenity | long-distance luxury trade |
| 8 | Precious metals (`precious`) | N | lot (1 kg) | ancient | precious-metal mines | luxury amenity, fine wares, electronics contacts | luxury and an industrial trace input |
| 9 | Copper ore (`copper_ore`) | K | t | ancient | copper mines | copper | |
| 10 | Tin (`tin`) | N | t (concentrate) | bronze | tin mines (rare deposits) | bronze tools and arms, solder | the first strategic trade dependency |
| 11 | Iron ore (`iron_ore`) | K | t | iron | iron mines | iron and steel | |
| 12 | Coal (`coal`) | K | t | industrial | coal pits | steel, steam, power, chemicals | |
| 13 | Saltpetre (`saltpetre`) | N | t | gunpowder | nitre works on deposits | munitions, early fertilizer | guns vs harvests |
| 14 | Crude oil (`crude`) | K | t | modern | oil wells | fuel, plastics, chemicals | |
| 15 | Natural gas (`gas`) | N | t (oil-equivalent) | modern | gas wells (helium by-product) | power, fertilizer (ammonia), chemicals | power vs food |
| 16 | Bauxite (`bauxite`) | N | t | electrical | bauxite mines | aluminium | |
| 17 | Uranium ore (`uranium_ore`) | S | t | nuclear | uranium mines | nuclear fuel | |
| 18 | Rare-earth ore (`rare_earths`) | S | t | electrical | rare-earth workings | magnets, lasers | concentrated supply |
| 19 | Lithium (`lithium`) | N | t (carbonate eq.) | modern | brine works in arid basins | batteries, fusion fuel | rare, arid regions |
| 20 | Cobalt and nickel (`cobalt_nickel`) | N | t | modern | cobalt-nickel mines | superalloys (engines), batteries | |
| 21 | Quartz (`quartz`) | N | t | electronics | high-purity quartz quarries | semiconductor materials, optics | |
| 22 | Helium (`helium`) | N | t | cryogenic | separation at helium-rich gas wells | superconducting systems: accelerators, fusion, jump | the scarcest late input |
| 23 | Copper (`copper`) | K | t | ancient | copper furnaces | bronze, conductors, instruments | |
| 24 | Iron and steel (`metal`) | R | t | iron | bloomeries, steelworks | almost everything | |
| 25 | Aluminium (`aluminium`) | N | t | electrical | aluminium smelters (≈15 MWh/t) | aircraft, launch, orbital works, lines | electricity-hungry |
| 26 | Mechanical components (`components`) | K | t | industrial | machine shops | machinery | |
| 27 | Conductors (`conductors`) | K | t | electrical | wire works | electrical works | |
| 28 | Rubber, plastics and insulation (`insulation`) | R | t | industrial | insulation and plastics works | electrical, consumer goods | |
| 29 | Refined fuel (`fuel`) | K | t | modern | refineries, synfuel | transport, diesel, launch | |
| 30 | Chemicals (`chemicals`) | K | t | industrial | chemical works | many | |
| 31 | Fertilizer (`fertilizer`) | N | t | industrial | fertilizer works (nitrate, ammonia) | fields | the food explosion |
| 32 | Munitions (`munitions`) | N | lot (50 kg) | gunpowder | powder mills, arsenals | armies from tier 2 (equipment, war consumption) | war's material cost; arms trade |
| 33 | Semiconductor materials (`substrate`) | R | t | electronics | high-purity materials works | electronics, lattice | |
| 34 | Magnets and superconductors (`magnets`) | N | t | electrical | magnet works | generators, motors, fusion, accelerators, jump | rare-earth chain |
| 35 | Batteries (`batteries`) | N | lot (50 kg) | modern | battery works | storage, electric transport, autonomous forces, orbital | lithium chain |
| 36 | Nuclear fuel (`nuclear_fuel`) | N | lot (1 kg) | nuclear | fuel plants (enrichment; fusion fuel from lithium) | fission, fusion | |
| 37 | Textiles (`textiles`) | N | lot (10 kg) | ancient | weaving, textile mills | consumption basket | first industry (T062) |
| 38 | Tools (`tools`) | K | lot (0.25 t) | all | workshops | upkeep, fields, construction | |
| 39 | Spare parts (`spares`) | K | lot (0.25 t) | industrial | parts works | upkeep | |
| 40 | Electronic devices (`electronics`) | K | lot (0.05 t) | electronics | electronics cells | hardware, units, programme | |
| 41 | Computing hardware (`hardware`) | K | lot (0.5 t) | computing | computer works | computing centres (AI compute) | |
| 42 | Record media (`media`) | K | lot (0.15 t) | writing | scriptoria, presses | schools, archives, administration | |
| 43 | Instruments (`instruments`) | K | lot (0.4 t) | measurement | instrument makers | laboratories, construction | |
| 44 | Medicine (`medicine`) | K | lot (0.04 t) | modern | pharmaceutical works | health | |
| 45 | Consumer goods (`consumer_goods`) | N | lot (0.1 t) | industrial | consumer goods works | consumption basket, amenity | butter vs guns |
| 46 | Fine wares (`fine_wares`) | N | lot (10 kg) | ancient | fine-wares workshops | luxury amenity | luxury craft for export |
| 47 | Interface lattice (`lattice`) | N | lot (10 kg) | jump | lattice conditioning works at a test node | jump assemblies and node operations | the one declared fictional material; makes test nodes strategic |

Retired: **Rare minerals** (`minerals`), split into uranium ore, rare-earth ore,
quartz, lithium and cobalt-nickel. **Materials** splits into timber and building
materials (the `materials` key stays for building materials).

The interface lattice uses the atlas's "minimal fictional boundary" ("under material
and spacetime conditions fixed by the content version"): conditioning high-purity
crystal in the anomaly's field is possible only at the three fixed test nodes. No
fictional raw resource exists.

### 5.3 Resources on the map

**Deposit kinds** (protocol `Deposit`, 15): copper ore, tin, iron ore, coal,
saltpetre, salt, precious metals, crude, natural gas (with `helium_bp` 0-150: share
of helium recoverable per tonne of gas), bauxite, uranium ore, rare-earth ore,
lithium, cobalt-nickel, quartz.

**Living sites** (region attributes, existing or new): arable, pasture, forest,
fishery (existing), `spice_land` (new; levels, warm and wet terrain).

**Site bonuses** (new region attributes, bp, at most two per region): fertile
floodplain (river regions; +2,500 field yield), fish banks (+5,000 fishing),
wild herds (+5,000 horse breeding; revealed by T006), old-growth forest (+5,000
timber within the forest cap), rich pasture (+3,000 wool fibres).

**Revelation by knowledge.** A seat sees a deposit or bonus in a region it has seen
or surveyed only when it understands the revealing node; before that the region's
`resources` list omits it, and the facility that would work it is not in the
catalog. The good itself is listed for the seat only once it knows a source or a
use (section 6.8).

| Revealed from the start | T014 | T023 | T036 | T064 | T090 | T060 | T103 | T105 | T146 | T108 | T162 milestone |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| salt, precious metals, arable, pasture, forest, fishery, spice land, floodplain, fish banks, old-growth forest, rich pasture | copper ore, tin, coal | iron ore | saltpetre | crude | natural gas | cobalt-nickel | bauxite, quartz, rare-earth ore (T043 also reveals rare earths) | lithium | uranium ore | helium content of known gas fields | lattice conditioning sites (the test nodes, as today) |

**Placement** (worldgen, `GENERATOR_VERSION` bts-worldgen/2.0.0), correlated with
terrain as today, amounts in Mt, provisional:

| Deposit | Regions with a deposit (of 48) | Terrain preference | Size per deposit |
| --- | --- | --- | --- |
| Copper ore | ≈18 | hills, mountains | 300-1,200 |
| Tin | 5-7, never more than one within two links of two different homes | hills, mountains (granite) | 10-40 |
| Iron ore | ≈22 | hills, mountains, plains | 2,000-8,000 |
| Coal | ≈20 | plains, hills, forest | 3,000-12,000 |
| Saltpetre | 6-9 | desert, steppe, caves in hills | 20-80 |
| Salt | ≈20 deposits + every coastal region has salt pans (renewable, 0.5 kt/level-month) | desert, steppe, coast | 500-5,000 |
| Precious metals | 8-12 | mountains, hills | 0.002-0.01 (2,000-10,000 t) |
| Crude | 8-12 | desert, steppe, marsh, tundra | 1,000-6,000 |
| Natural gas | 8-12 (often with crude); helium-rich (`helium_bp` ≥ 50) in 2-4 | as crude | 1,000-5,000 |
| Bauxite | 4-6 | warm plains, hills | 500-3,000 |
| Uranium ore | 4-6 | mountains, desert | 5-30 |
| Rare-earth ore | 3-5 | mountains, desert | 20-100 |
| Lithium | 3-4 | desert, steppe (arid basins) | 5-30 |
| Cobalt-nickel | 4-6 | mountains, tundra | 20-150 |
| Quartz | 5-8 | mountains, hills | 50-300 |

**Guarantees** (viability; each start must have a costly but autonomous survival
route, not a guaranteed victory): within three links of every home at least 1,200 Mt
copper ore, 7,000 Mt iron ore, 10,000 Mt coal, salt (deposit or pans) and forest; in
the world at least 5 tin, 2 helium-rich gas, 3 lithium, 3 rare-earth, 3 uranium, 3
quartz, 3 cobalt-nickel and 4 bauxite regions, of which no single seat's home
neighbourhood (three links) holds more than half of any. Every late strategic input
except the lattice has a costlier substitute method (5.6), so no seat is locked out
by geography; trade or conquest is cheaper than substitution.

**Depletion and renewal.** Deposits are finite (drawn tonnes as today; shallow
workings spoil as much again). Coastal salt pans, fields, pasture, plantations,
fishing and forestry are renewable within their site caps; forestry beyond the forest
cap is not allowed (as camps today). Horse herds are a good produced by breeding,
not a stock in the land.

### 5.4 Production chains

Per level-month, display units; posts are general + qualified; all recipes pass the
mass balance except grown goods (food, fibres, horses, spices, timber), extraction,
and the two declared **atmospheric-input** recipes (ammonia fertilizer and food
synthesis take nitrogen or carbon from the air; their declared ceiling is output mass
≤ 3 × input mass, tested). New facilities (≈17) reuse existing builders: mines are
`mine_*` with the shallow / deep / mechanized methods of 2.0.

| Chain | Facility and method (requires) | In | Out | Posts | Service |
| --- | --- | --- | --- | --- | --- |
| Timber | forestry camp (-) | - | 12 timber | 8,000 | - |
| Building materials | quarry and clay pit (-) | - | 16 materials | 8,000 | - |
| | kiln (T008) | - | 15 materials (clay dug on site) | 5,000 + 1,000 | - |
| | cement works (T064) | 4 coal | 60 materials (limestone dug on site) | 4,000 + 1,000 | 10 shaft |
| Salt | salt works on a deposit (T007) / coastal pans | - | 8 salt / 0.5 salt | 6,000 / 1,000 | - |
| Fibres | plantation, fibre crops (T004 & T005) on arable | - | 2 fibres | 8,000 | - |
| | pasture, wool herds (T006) | - | 0.6 fibres + 8,000 rations | 5,000 | - |
| Horses | pasture, horse breeding (T006, horses revealed) | - | 300 horses + 6,000 rations | 5,000 | - |
| Spices | plantation, spice crops (T005) on spice land | - | 0.5 spices | 8,000 | - |
| Textiles | weaving workshop, hand looms (T004) | 1.1 fibres | 100 textiles | 6,000 + 1,000 artisans | - |
| | textile mill (T062) | 1.1 fibres | 100 textiles | 1,200 + 500 mechanics | 20 shaft |
| | textile mill, synthetic fibre (T093) | 1.2 chemicals | 100 textiles | 1,000 + 500 technicians | 30 electric |
| Bronze | workshop, bronze tools (T022) | 1.4 copper, 0.2 tin, 2 timber | 9 tools | as 2.0 | - |
| | (2.0 copper tools stay: 1.5 copper, 2 timber → 6 tools) | | | | |
| Smelting | copper furnace (T015) | 8 copper ore, 4 timber | 4 copper | as 2.0 | - |
| | bloomery (T023) | 8 iron ore, 6 timber | 4 metal | as 2.0 | - |
| | steelworks, alloy steel (T060 & cobalt-nickel revealed) | 40 iron ore, 20 coal, 0.6 cobalt-nickel | 30 metal | as coke steel | 10 shaft (counts as "superalloy grade" for launch and jump inputs) |
| Saltpetre | nitre works on a deposit (T036) | - | 2 saltpetre | 6,000 | - |
| Munitions | powder mill (T036) | 0.6 saltpetre, 0.2 timber | 15 munitions | 3,000 + 1,000 artisans | - |
| | arsenal (T064) | 0.5 chemicals, 0.3 metal | 15 munitions | 2,000 + 1,000 technicians | 10 shaft |
| Fertilizer | fertilizer works, nitrate (T095) | 1.2 saltpetre | 1 fertilizer | 2,000 + 500 | 5 shaft |
| | ammonia synthesis (T095 & T064; atmospheric) | 0.5 gas | 1.2 fertilizer | 1,000 + 500 technicians | 40 electric |
| Gas and helium | gas well (T090) on a gas field | - | 30 gas; + `helium_bp` × 30 / 10,000 helium with the separation method (T108) | 4,000 + 1,000 | 6 shaft (+20 electric for separation) |
| Aluminium | aluminium smelter (T103) | 4 bauxite, 0.4 chemicals | 1 aluminium | 1,500 + 500 electricians | 150 electric |
| Magnets | magnet works (T103 & rare earths revealed) | 3 rare earths, 1 metal, 0.5 chemicals | 1 magnets | 1,500 + 1,000 technicians | 40 electric |
| | superconducting coils (T108) | 1 magnets, 0.2 copper | 1 magnets (superconducting grade) + operating helium 0.02 per level-month wherever installed | | 20 electric |
| Batteries | battery works (T105) | 0.1 lithium, 0.1 cobalt-nickel, 0.2 metal, 0.1 chemicals | 10 batteries | 2,000 + 1,000 technicians | 20 electric |
| Nuclear fuel | fuel plant, enrichment (T147) | 4 uranium ore, 0.5 chemicals | 40 nuclear fuel (lots of 1 kg) | 2,000 + 1,500 scientists/technicians | 300 electric |
| | fuel plant, fusion fuel (T149) | 0.3 lithium | 100 nuclear fuel | 1,000 + 1,000 | 200 electric |
| Semiconductor materials | high-purity materials works (T103) | 4 quartz, 1 chemicals | 2 substrate | as 2.0 | 30 electric |
| Electronics | electronics cells, integrated (T106) | 0.4 substrate, 0.6 conductors, 0.5 chemicals, 0.005 precious metals | 20 electronics | as 2.0 | 40 electric |
| AI compute | computer works → computing centre (as 2.0) | electronics → hardware | compute service | as 2.0 | as 2.0 |
| Consumer goods | consumer goods works (T062 for the craft method; T101 for appliances) | 0.6 metal, 0.3 insulation, 0.2 textiles (+0.02 electronics, appliances) | 8 consumer goods (7 craft; 0.8 kt out of 0.9 kt in) | 4,000 + 1,000 | 20 shaft or 30 electric |
| Fine wares | fine-wares workshop (T008 or T031) | 0.02 precious metals, 0.1 fibres, 0.3 materials | 20 fine wares | 3,000 + 1,500 artisans | - |
| Food synthesis | food synthesis works (T132 & T135; atmospheric) | 4 chemicals | 200,000 rations (10 kt) | 2,000 + 2,000 technicians | 400 electric |
| Lattice | lattice conditioning works (T164 or T165; site: test node; max 1 per node) | 0.5 substrate, 0.5 magnets (superconducting), 0.05 helium | 20 lattice | 4,000 + 6,000 scientists/jump engineers | 2,000 electric |

Changed users of goods (inputs per level-month or per unit):

| User | 2.0 | 3.0 |
| --- | --- | --- |
| Fields, traction methods | herds somewhere | 30 horses per level-month |
| Field input methods | chemicals | fertilizer (table 3.3) |
| Granaries | spoilage 1.5% a month with T007 | ×0.7 spoilage while salt ≥ 0.2 kt per million rations stored is in stock (salt consumed) |
| Roads | tools | tools + 20 horses per level-month (until T094) |
| Units, tier 1 | metal 0.4, tools 0.3 per soldier | metal 0.4 *or* copper 0.35 + tin 0.05; maneuver role +0.3 horses per soldier (tiers 1-2) |
| Units, tier 2 | metal, materials, tools | + munitions 1 lot per soldier; upkeep + munitions 0.02 per soldier-month, ×5 in combat months |
| Units, tiers 3-5 | as 2.0 | + munitions as tier 2; tier 4 + aluminium 0.1 t per soldier; tier 5 + batteries 2 lots |
| Generator hall, hydro, grid | components, conductors | + permanent-magnet method (T101): 0.1 magnets per level, generation +10% (fewer losses) |
| Fission | 3 kt rare minerals | 3 nuclear fuel lots (3 kg ≈ a month of a few reactors at game scale) |
| Fusion | 2 kt chemicals | 5 nuclear fuel lots, + operating helium 0.05, construction + 20 magnets |
| High-energy laboratory | as 2.0 | + construction 20 magnets; operating helium 0.05 |
| Launch complex | fuel, components, electronics | + 2 aluminium, 0.3 superalloy-grade metal (from alloy steel), batteries 5 |
| Orbital yard | as 2.0 | + 3 aluminium |
| Jump testbed | as 2.0 | + operating helium 0.2, construction + 40 magnets |
| Jump assembly line | components 60, electronics 45, hardware 3, conductors 18, insulation 9, metal 45, substrate 3 | + lattice 30, magnets 6, helium 0.1 per level-month |
| Jump node | fuel 12, electronics 3 | + lattice 2, helium 0.05 |
| Victory check 10 (industrial base) | components, electronics, hardware, conductors, metal | + magnets, lattice |
| Electronics cells, integrated | substrate, conductors, chemicals | + 0.005 precious metals (gold bonding) |

### 5.5 Consumption, living standards and luxuries

The population now consumes more than food. Each month, after food, residents draw
from the national stock up to their basket (per 1,000 residents per month,
provisional):

| Item | Expected from | Basket |
| --- | --- | --- |
| Textiles | start | 0.15 lots; 0.4 with T062; 1.0 with T093 |
| Consumer goods | T062 | 0.2 lots; 1.0 with T101; 2.5 with T106 |
| Luxuries (each kind: spices, precious metals, fine wares) | when the kind is known | 0.05 t spices; 0.002 lots (2 g) precious metals; 0.3 lots fine wares |

`PolicySetting::Consumption { level_bp }` (5,000-15,000; default 10,000) scales the
basket drawn: austerity frees goods for investment and war at a cost in prosperity.

**Prosperity** (bp, 0-10,000) = 60% × textiles supplied/expected + 40% × consumer
goods supplied/expected (where expected), each capped at 1. **Amenity** = Σ over
luxury kinds of `2,000 × isqrt(r) / 100`, where `r` = supplied/basket in bp capped at
10,000 (so a kind fully supplied gives 2,000 and half supplied 1,400), capped at
6,000 in all: diminishing returns per kind, and two kinds at half beat one in full.

Effects: stability `+ (prosperity − 5,000) / 1,000 + amenity / 1,500` (−5 to +9);
`F_city` × (10,000 + 600 × prosperity / 10,000); `F_dev` − 1,000 × prosperity;
internal migration favours regions with higher prosperity. Prosperity and amenity are
per civilization (one access class, as today) and shown with their basket.

### 5.6 Mapping onto existing structures

- `Good` (protocol) gains 26 variants and loses `Minerals`; `Materials` keeps its key
  with the label "Building materials". `Deposit` gains 10 variants and loses
  `Minerals`. `good_mass_kg` and `good_unit` cover the new lots (table 5.2); horses
  and grown goods are excluded from the mass balance like food.
- `FacDef`, `Recipe`, methods, build terms: unchanged structures; the new
  facilities are rows in `content.rs` with `build_terms` entries (civil works class for
  workshops, mills and salt works; industrial class for smelters, magnet, battery and
  fuel plants; nuclear class for the fuel plant; the lattice works in the jump class).
- Substitute methods that keep geography from locking a seat out: bronze → copper
  tools (fewer tools); horses → hand fields, porters (road capacity −50%); saltpetre →
  ammonia (later); helium → high-temperature superconductors with liquid-nitrogen
  cooling (method of the coil works: +100% electricity, +50% rare earths, no helium);
  quartz → metallurgical silicon refined twice (high-purity works method: 8 building
  materials + 3 chemicals + 90 electric for the same output); lithium → sodium cells
  (battery method: 0.3 salt instead of lithium, half the output); cobalt-nickel →
  plain steel (alloy steel's uses accept it at +50% quantity); uranium → fusion or
  orbital power; rare earths → induction machines (generator method without
  magnets, no gain). Only the lattice has no substitute.
- `DepositState` gains `helium_bp`; `Region` gains `spice_land`, `bonuses: [(Bonus,
  u16); 2]`, `outbreak: Option<Outbreak>`.

---

## 6. Trade and market

### 6.1 The settlement medium: trade credit

**Decision: a common trade credit (unit "cr"), earned by selling to the market and
spent buying from it.** The domestic economy stays directed: no internal prices,
wages or private balance sheets; goods remain pooled per civilization with carriage
loss. Credit exists only at the border.

Why credit rather than barter at market prices:

1. With three or four seats, trade is multilateral (A sells copper to B, B grain to C,
   C tin to A). Barter would need either a double coincidence of wants or the referee
   silently inventing a numeraire; credit is that numeraire, stated openly.
2. Treaties need a means of payment (secondments, joint programmes, tribute,
   reparations, loans of goods). Credit clauses are simpler and safer than bundles of
   goods.
3. Conservation is a single identity: the sum of all balances is constant (zero at the
   start; credit is only ever transferred). There is no mint, no interest, no
   overdraft.
4. Same-month netting (6.4) lets balanced traders trade without holding credit, so no
   starting endowment is needed and money supply never limits trade volume.

### 6.2 Who can trade with whom

A **route** between two seats exists when they have met, are not at war, neither
embargoes the other, and there is a physical path:

- **land**: a chain of land, river or pass links through regions controlled by the
  two seats or by third seats that allow transit (default: allowed unless that seat
  embargoes either side or is at war with either);
- **sea**: both ends have a region with a harbour, linked by sea links: coastal
  navigation (T013) allows paths of up to two sea links, sailing and navigational
  positioning (T028) any length; steam (T080) and diesel (T092) only lower the loss.

The **path** is the cheapest in loss (Dijkstra over regions, ties by region id),
recomputed in the first month of each round and whenever control of a region or a
war or embargo changes. A **market** is a connected component of the route graph; it
is transitive, so each seat belongs to exactly one market (possibly alone).

**Capacity.** Each seat has a gateway capacity in kilotonnes of cargo a month (lots
and rations by mass, horses at 0.5 t), the sum over its regions on any of its routes
(provisional):

| Gateway in a region | Capacity (kt/month) | Requires |
| --- | --- | --- |
| Land border, no roads | 2 | a land link to the partner's or a transit region |
| Roads and waystations | 10 | |
| Railway | 200 | |
| Motor depot | 300 | |
| Harbour | 20 (60 with T028, 300 with T080, 1,500 with T092 & T094) | coastal |

A seat's traded mass (bought + sold) in a month is at most its gateway capacity,
and on a route at most the smaller of the two ends' capacity on that route's gateways.
Tendency Exchange orientation adds ±10% to capacity; the new doctrine *Merchant's
Covenant* (propagation) cuts route loss by 10%.

**Loss.** Cargo loses, per region crossed, 1,200 bp (no roads), 500 (roads), 150
(railway), 100 (motor depot), and per sea link 600 (coastal), 300 (T028), 120
(T080), 50 (T092): the best technology both ends understand, summed along the path,
capped at 5,000 bp. Losses are booked (`World.transit_lost`), never refunded.

### 6.3 Orders

`PolicySetting::MarketOrder { good, side: buy | sell, per_month, limit_price,
keep_stock }` sets the seat's standing order for one good and side (zero
`per_month` cancels):

- `per_month` (base units) is the most to trade each month;
- `limit_price` (cr per display unit; optional): a buy is not filled above it, a sale
  not below it;
- `keep_stock` (optional): a sale never takes stock below this; a buy stops once
  stock reaches it.

A seat may not hold both a buy and a sell order for the same good. A sale is capped
by month-start stock minus `keep_stock` and minus what the seat's own works and
upkeep need this month (the food a month of eating needs, inputs reserved by the
month's method choice). Orders for goods the seat does not know are refused with the
uniform unknown error.

### 6.4 Clearing (each month, deterministic, integer)

Market clearing becomes step 1b of `step_month`, after treaty deliveries and before
production. Goods bought arrive the same month (usable by that month's production);
goods sold leave month-start stock. For each market `M` (in order of its lowest seat
id) and each good `g` (in `Good` order):

1. **Orders.** Sales `s_i` and buys `b_j` after the caps of 6.3. Let `S = Σ s`,
   `B = Σ b`.
2. **Price.** Reference `p0` = last month's price in `M` (the base price when none).
   `p = p0 × (10,000 + 5,000 × (B − S) / max(1, B + S)) / 10,000`, then limited to
   `p0 ± 15%` and to `[0.2, 5] × base price`.
3. **Limits.** Drop buys with `limit < p` and sales with `limit > p`; recompute
   `S`, `B`, `p`; repeat at most four times (the last price stands).
4. **Volume.** `V = min(S, B)`. If `B > S` every sale fills and buys fill pro rata
   `b_j × S / B`; otherwise the reverse. Integer shares by largest remainder, ties to
   the lower seat id.
5. **Shipments.** Each seller's fill is split over the buyers pro rata (largest
   remainder), giving `q_ij`; buyer `j` receives `q_ij × (10,000 − loss_ij) /
   10,000` (rounded down, the rest booked to `transit_lost`).
6. **Credit.** Buyer `j` owes `ceil(fill_j × p / 1,000)`; the total owed `T` is paid
   out to sellers pro rata to their fills by largest remainder, so receipts sum to
   exactly `T`. (A buyer pays for what was shipped, including what is lost on the
   way: the loss is the buyer's carriage risk.)

After all goods of all markets are computed tentatively, **solvency** is enforced:
for each seat, `balance + Σ receipts − Σ payments` must be ≥ 0. If a seat would go
negative, scale all of its buys down by the same ratio (by value, largest remainder)
until it is not, and recompute steps 4-6 for the goods affected; repeat at most three
times; in a final pass a still-insolvent seat's buys are cut to what its balance
alone pays. Quantities only fall, so the procedure terminates. Then goods and credit
move: sellers `traded_out`, buyers `traded_in`, `transit_lost` per good, credit
`earned` / `spent`.

The last price is stored per market and good; a good with no orders keeps its price
and drifts 2% a month toward the base price. A seat that leaves a market (war,
embargo) takes no price history with it; a new market formed by a merger starts from
the volume-weighted mean of its parts' prices.

**Base prices** are content constants computed at load: `base(g)` = the posts per unit
at the good's first (reference) method, in worker-months, plus the base value of its
inputs per unit, rounded to two significant figures; one credit is roughly one
standard worker-month. For grown and extracted goods the posts per unit of the
reference extraction method; for the lattice the cost at its only method. Examples
(cr per display unit, provisional output of that rule): food 330 per 1,000 rations,
timber 670/kt, copper 2,300/kt, tin 4,000/kt, metal 2,900/kt, coal 670/kt,
components 5,800/kt, electronics 600/1,000 lots, helium 60,000/kt, lattice
600,000/1,000 lots.

### 6.5 Credit ledger and treaties

- `Civ.credit: i64` (never negative), `Civ.credit_flows { earned, spent,
  transfers_in, transfers_out }`; identity: Σ balances over the world = 0 + 0 (no
  endowment) at all times; per seat `balance_end − balance_start = earned − spent +
  transfers_in − transfers_out`.
- New clause `Clause::Credit { from, per_month, months }`: monthly transfer, settled in
  step 1 with goods deliveries; a shortfall is a recorded shortfall as for goods.
  Payment for secondments and joint programmes can now be credit.
- New clause `Clause::Transit { from, months }`: `from` lets the other party's routes
  cross its territory even when `from` embargoes third seats (a corridor deal).
- Goods clauses stay: direct deliveries outside the market, at the treaty's terms,
  with no route loss beyond the existing carriage rules; they still count as
  "contracted imports" in victory check 10. Market purchases do not count (they are
  not contracted).

### 6.6 Embargo, export bans, transit, war and blockade

- `PolicySetting::Embargo { seat, on }`: no route between the two seats; transit for
  that seat's routes through own territory denied.
- `PolicySetting::ExportBan { good, on }`: the seat's sale orders for that good are
  void (strategic denial).
- No tariffs: in a directed economy the state is both importer and exporter, so a
  tariff on its own imports would be a transfer to itself. (Open question.)
- War: no route between belligerents; each belligerent denies transit to the other.
- Blockade: a region contested or occupied by an enemy army contributes no gateway
  capacity to its owner; a sea route whose path passes through a harbour region
  controlled by a seat at war with either end is cut.
- Market changes take effect in the month after the policy or the war begins.

### 6.7 Dependency

Imports can stop in a month (war, embargo, blockade, a partner's export ban, a
third party closing transit). Countermeasures are real: reserves (`keep_stock`,
stock targets), alternative partners, substitute methods (5.6), domestic deposits,
conquest. The briefing warns when an imported good has fewer than 12 months of use in
store and its only route crosses a seat whose trust is low.

### 6.8 Information boundary

A seat sees, for its own market only and only for goods it knows (it knows a source
or a use: a discovered facility, recipe, method, deposit or unit tier that names the
good, or it holds or has received some):

- members of the market (public), price, last month's change, volume cleared, total
  of sale and of buy orders (aggregate, anonymous), and its own orders and fills;
- its own routes: partner, kind, path length, capacity used and loss.

It never sees another seat's orders, balance, fills, stocks or routes, nor prices in
a market it is not in, nor any line for a good it does not know (a good unknown to the
viewer that another member sells is simply absent). Errors for unknown goods are
identical to errors for nonexistent goods. A good's name in a treaty clause shown to a
seat that does not know it is replaced by "goods of an unknown kind", and such a seat
cannot sign it (as for undisclosed programme services today). The `Good` enum itself
is public protocol schema, as it is today.

### 6.9 Native AI

- Sell: surplus above 1.5 × stock target, limit ≥ 0.8 × base (Easy: sells surplus
  without a limit).
- Buy: shortfall below the stock target for goods its works or programme need,
  limit ≤ 2 × base (Hard: up to 3 × base for bottleneck inputs of the jump programme,
  and compares the price with its own cost of producing the good).
- Never sells strategic goods its next three years of plans need; never trades with a
  seat it plans to attack; embargoes a seat it is at war with.
- Keeps 12 months of imported strategic inputs in store once a route has been cut in
  the last 20 years.
- Hard: opens a deposit or substitute method when a good's price stays above 1.5 ×
  base for 24 months; proposes credit-for-secondment treaties.
- Difficulty changes the breadth of these rules, never the information used.

### 6.10 Anti-exploit rules

- One price per good per market per month for every buyer and seller; no seat both
  buys and sells a good; every route loses cargo: round trips always lose.
- A seat belongs to one market (transitive components), so there is no arbitrage
  between markets by a seat in both.
- Sales come out of month-start stock; nobody sells what it does not have, and a
  good bought this month cannot be sold this month.
- Credit is never created: no overdraft, interest or endowment; balances never
  negative; transfers only by clearing and by signed clauses.
- Prices move at most ±15% a month and stay within [0.2, 5] × base, so a thin market
  cannot be spiked by a small order.
- Treaty goods and credit clauses are validated against the sender's facts at
  proposal and signing, as today.
- Tests (section 10): a closed loop of trades between seats leaves every good total
  lower and credit totals unchanged; random order sequences never violate the
  identities.

---

## 7. Victory reachability and calibration targets

**Why the hard AI does not win under 2.0.** The jump tier arrives in the last 10-20%
of the game and G96 needs one authority over every inhabited region; in eight eval
matches no seat completed integration. **What changes:**

1. **Time.** T167 targeted at 2180-2260 against a horizon of AD 2500: 240+ years of
   slack instead of ~20 rounds; the industrial and modern era (1850-2250) is 400
   years and ≈220 rounds long, enough for a dominant seat to subordinate or conquer
   its neighbours before the programme is ready.
2. **Integration paths for the native AI** (slice 8): Hard seeks subordination by
   treaty when its power ratio over a neighbour is ≥ 3:1 (offers credit and
   protection, demands tribute), wages war with stated war aims and accepts
   armistice by policy, integrates subordinates (they count as its authority, as
   today), and keeps 96 months of peace, food and water once the last rival submits.
3. **Long-round planning** through directives, so nothing stalls inside 50-year rounds.
4. **Supply security** through markets and reserves for the late inputs.

G96 ∧ F24 ∧ Trials96 and every base check of chapter 35 stay as they are (check 10
gains magnets and lattice).

**Targets for the all-AI calibration set** (standard calendar, `--ai
hard,medium,medium,easy`, 64 seeds `eval-0..63`):

| Metric | Target |
| --- | --- |
| Matches with a winner | 55-75% |
| Of those, won by the hard seat | ≥ 70% |
| Median win year | AD 2250-2310 |
| Spread | interquartile range ≤ 120 years; < 10% of wins before 2150; < 5% after 2450 |
| Four hard seats (`hard,hard,hard,hard`, 32 seeds) | a winner in ≥ 40% |
| Population | medians of table 3.1 within ×1.5 |
| Technology | median-seat milestone dates of table 2.7 within the windows; leader T167 by 2260 in ≥ 75% of matches |
| Food | after 1800, ≥ 95% food access in ≥ 90% of seat-months |
| Eliminations before 1900 | ≤ 1.5 seats per match on average |
| Regions held | per seat median: 2-3 at 3000 BC, 6-9 at AD 1, 10-12 at 1700 (world fully claimed by 1500-1700) |
| Trade | from 1500 on, ≥ 75% of seat-pairs in contact and at peace trade some good in a given decade; tin, helium and lithium traded in ≥ 50% of matches |
| Conservation and determinism | zero ledger violations over 8 audited whole campaigns; `bts verify` passes |

---

## 8. Interface implications (views and data, not mockups)

1. **Date everywhere**: top bar with the year, the round's span ("This round: 1650
   to 1655, 5 years"), years left to the horizon, the next round's length; the
   timeline and chronicle by date.
2. **Calendar panel**: the schedule table with the current segment highlighted.
3. **Standing orders panel**: list, order and edit directives; per directive what it
   did last year and why it was skipped.
4. **Map resource lens**: revealed deposits (kind, estimated size band, quality) and
   site bonuses per region; icons by class (strategic, bonus, luxury); helium content
   on gas fields; test nodes as lattice sites.
5. **Region panel**: resources, settlement class, water and sanitation coverage,
   outbreak state, productivity breakdown per sector with factor sources, field
   yield breakdown.
6. **Facility panel**: method, base posts → after shared support → after
   productivity; inputs and outputs per level; what blocks it.
7. **Goods ledger**: 47 goods grouped by class, with stock, made, used, lost, bought,
   sold per month (average over the round and last 12 months), months of supply.
8. **Market screen**: per good price (and history), base price, change, volume, total
   supply and demand orders, own orders and fills; credit balance and flows; order
   editor with limit and keep-stock.
9. **Trade routes**: map overlay of own routes (kind, capacity used, loss); embargoes,
   export bans, transit grants; warnings for routes through low-trust seats.
10. **Population screen**: curve over time, births, deaths and causes, age pyramid,
    fertility factors, urban share, prosperity and amenity with the basket.
11. **Building and unit costs**: every quote lists goods (including horses, tin,
    munitions, magnets, lattice), crews, site power and months; unit tiers show
    equipment and upkeep.
12. **Treaty editor**: credit and transit clauses; goods unknown to the viewer shown
    as "goods of an unknown kind".
13. **Observer mode**: world population curve and world market prices (referee view
    only when no human seat).
14. Localization: all new strings in English, Simplified and Traditional Chinese.

---

## 9. Protocol and save changes

Versions: `PROTOCOL_VERSION` → `bts-protocol/2.0` (breaking: `Good` and `Deposit`
variants change, population fields widen, `months_per_round` varies);
`RULESET_VERSION` → `bts-rules/3.0.0`; `CONTENT_VERSION` → `bts-content/3.0.0`;
`GENERATOR_VERSION` → `bts-worldgen/2.0.0`.

**Observation additions** (all `#[serde(default)]` where an older client could read
them):

| Field | Type |
| --- | --- |
| `date` | `DateView { year: i32 /* historical, no zero */, month: u8, label: String }` |
| `calendar` | `CalendarView { id, start: DateView, horizon: DateView, horizon_month, reward_reference: DateView, round_months, round_start: DateView, round_end: DateView, next_round_months, segments: Vec<CalendarSegment { first_round, last_round, years_per_round, from, to }> }` |
| `months_per_round` | kept; equals `calendar.round_months` |
| `directives` | `Vec<DirectiveView { id, directive: Directive, last_result: String }>` |
| `market` | `MarketView { members: Vec<SeatId>, credit: i64, credit_flows, lines: Vec<MarketLine { good, price, base_price, change_bp, volume, supply, demand, own_order: Option<OrderView>, own_filled }>, routes: Vec<RouteView { partner, kind, regions, capacity, used, loss_bp }>, gateway_capacity, gateway_used, embargoes, export_bans, transit_grants }` |
| `civ.living` | `LivingView { basket: Vec<BasketLine { good, expected, supplied }>, prosperity_bp, amenity_bp, consumption_bp }` |
| `civ.population`, foreign estimates | `u64` |
| `RegionView.resources` | `Vec<ResourceView { kind: ResourceKind, class, size_band, quality_bp, helium_bp }>` (revealed only) |
| `RegionView.outbreak` | `Option<OutbreakView { since: Month, severity_band: u8 }>` |
| `OwnRegion.productivity` | `Vec<ProductivityView { sector, total_bp, factors: Vec<FactorView { source, bp, detail }>, posts_saved }>` |
| `FacilityView` | `posts_base`, `posts_after_scale`, `posts_after_productivity`, `yield_per_level`, `yield_factors` |
| `GoodLine` | `bought`, `sold`, `transit_lost` (own share), `per_month_avg`, `last12` |
| `UnitsView` | new goods' units and masses; `credit_unit: "cr"` |
| `SeatDiagnostics` (referee) | population `u64`, credit, traded value |

**Actions and settings** (no new top-level action except `Directive`, keeping
`apps/web` and `bts-server` changes small):

- `PolicySetting::MarketOrder { good, side, per_month, limit_price: Option<i64>, keep_stock: Option<i64> }`
- `PolicySetting::Embargo { seat, on }`, `ExportBan { good, on }`
- `PolicySetting::Consumption { level_bp }`
- `PolicySetting::WarPolicy { seat, accept_white_peace_after_months: Option<u16>, accept_cession_max: u8 }`
- `Action::Directive { op: add | remove | move, id: Option<u32>, directive: Option<Directive> }` with
  `Directive::{ BuildTarget { region, facility, levels, priority }, ResearchAgenda { techs }, AutoResearch { on }, SettleTarget { from, to, people, when_crowd_bp } }`
- `StartProgram { .., repeat: bool }` and `ManageProgram { .., repeat: Option<bool> }` (serde default false)
- `Clause::Credit { from, per_month, months }`, `Clause::Transit { from, months }`; clause `months: 0` = open-ended with one round's notice; term limits per 2.5

**Saves.** `Match::load_json` already refuses another ruleset by name before parsing.
A 2.x save gets: "this save was written by ruleset bts-rules/2.x.y; this build runs
bts-rules/3.0.0 and cannot load it: the calendar, the goods and the population rules
differ". Saves grow with history (chronicle over 525 rounds): the chronicle archive
keeps at most 2,000 entries per seat (oldest era summaries kept, minor moments
dropped first). `bts-save` envelope format number → `bts-save/2`.

---

## 10. Implementation plan

Each slice keeps `cargo test --release` green, keeps `bts verify` passing, is
committed separately, records `docs/calibration/r3-slice-N-{eval,riverland}.txt`
and updates `docs/units-and-scale.md`, `docs/conservation-audit.md` and
`docs/implementation-status.md`. Ownership: engine, protocol, AI, content, docs and
append-only `apps/web/src/protocol.ts`; client views in slice 9.

Common acceptance tests for every slice: the monthly ledger audit of whole all-AI
campaigns (existing `crates/bts-ai/tests/conservation.rs`, extended with each new
ledger), determinism (same seed and controllers → same state hash, with checkpoint
reload), information isolation (observation of seat A unchanged when only seat B's
private state or orders change, except public market aggregates of a shared market),
and the performance budget test (`perf_round_budget`, ignored by default: a 50-year
round from a 1000 BC checkpoint and a 2-year round from an AD 2150 checkpoint, both
with three native seats; native p95 ≤ 150 ms; full standard match ≤ 60 s; the wasm
figure measured with the web build's node harness and recorded).

**Calibration tooling (slice 0).** Before any rule change: `bts run` prints dates; a
`--curve` option writes per-seat population, regions, techs by tier, research
capacity and trade per decade as CSV; `examples/bench` measures per-month cost from a
save; **era checkpoints** (all-AI saves at 1000 BC, AD 1000, 1700, 1900 and 2100
from the eval seeds) let each slice calibrate its era in seconds instead of whole
campaigns.

| Slice | Content | Acceptance tests (beyond the common ones) | Calibration after the slice |
| --- | --- | --- | --- |
| **0 Tooling and baseline** | `--curve`, bench example, checkpoint saves, baseline under 2.0 rules | none new | record 2.0 curves on eval 0-63 |
| **1 Calendar and standing orders** | `CalendarId`, schedule tables, `round_months(r)`, `util::date`, BC/AD labels, horizon and reward, treaty term limits, open-ended clauses, round recap caps, era summaries, directives and `repeat`, war policy; native AI writes directives in long rounds; ruleset 3.0.0 version strings and save refusal | schedule sums (525 rounds, 89,988 months; quick 230); date conversions around 1 BC/AD 1 and in round 111; a directive behaves exactly like its action (same quote, same refusal); a stalled directive reports; per-round budget for a 600-month round; save of 2.x refused with the message | full standard campaign with 2.0 economics: expect techs far too early; record where the graph completes |
| **2 Population** | mortality and fertility tables, `M_urban`, sanitation coverage, outbreaks, harvests, arable ×3, field methods v3, food synthesis, u64 totals, settlement classes, deposits ×5-10 | outbreak and harvest draws reproducible and independent of seat order; deaths by cause partition total deaths; no `u32` overflow with a 4-billion world fixture; age cells conserve | population medians at the checkpoints against table 3.1 (×1.5) |
| **3 Knowledge pacing** | channel factor, contact and trade weighting (trade factor stubbed until slice 7: contact only), thresholds, research effectiveness, tier work and minimum months | research used ≤ posts × RE; a seat with writing and archives gathers evidence faster than one without, all else equal; contact with a prototyping seat raises evidence | milestone dates of table 2.7 for the median seat; iterate `H[t]`, `W[t]` |
| **4 Resources and goods** | `Good` (47), `Deposit` (15), lot masses, worldgen placement, guarantees, bonuses, revelation, ≈17 new facilities, recipes and methods, changed users (5.4), substitutes, unit equipment, check 10 | mass balance for every recipe (atmospheric ceiling ≤ 3); every deposit draw ≥ delivery; a deposit not revealed is absent from observation and its facility from the catalog; no crew or input needs something that cannot exist yet (extend the 2.0 walk to goods); guarantees hold on 1,000 generated worlds | goods flows by era; AI builds the new chains (bronze by 2500 BC, saltpetre and munitions by 1600, helium by 2100) |
| **5 Productivity** | LP factors, land yields, construction factor, RE wiring, breakdown views | posts equal the formula; output per level unchanged by any factor (property test); project work ≤ called-up × LP; field yield ≤ 2 × base; breakdown sums to the total | food-sector share and output per worker by era (4.2) |
| **6 Consumption and luxuries** | basket, consumption policy, prosperity, amenity, effects on stability, `F_city`, `F_dev`, migration | consumption booked as consumed; prosperity bounded; amenity diminishing per kind (two kinds at half > one kind at full) | stability and fertility by era; consumer-goods industry share |
| **7 Trade and market** | routes, capacity, loss, markets, orders, clearing, solvency, credit ledger, credit and transit clauses, embargo, export bans, blockade, information boundary, native AI market use; the trade factor of slice 3 | goods identity with transit loss (`Σ traded_out = Σ traded_in + Σ transit_lost`); `Σ credit = 0`; no negative balance; fills ≤ orders; sales ≤ month-start stock − reserves; one price per good per market; closed-loop trade loses goods and conserves credit; fuzzed order sequences never break an identity; seat A's observation unchanged by seat B's orders in another market; unknown goods absent; clearing independent of the order in which seats submitted | trade volumes, price ranges, share of seat-pairs trading, dependency events |
| **8 Victory and the native AI** | subordination and war aims, armistice, reserves of imported inputs, endgame with markets and secondments, Hard's price awareness; final constants | scripted fixture: a seat that subordinates the others and completes the programme wins; check 10 counts contracted lattice | the targets of section 7 on 64 + 32 seeds; iterate |
| **9 Client** | views of section 8, protocol mirror, translations | e2e: play 5 rounds in each segment; market order round trip; directive edit | manual play of a whole game in quick mode |

**Risks.**

- *Emergent pacing over 7,500 years is slow to calibrate.* Era checkpoints and the
  `--curve` CSVs keep iterations to minutes; calibrate each era from its checkpoint,
  then confirm with whole campaigns.
- *The native AI is the largest piece of work* (directives, new chains, markets,
  integration). Slices 1, 4, 7 and 8 each carry their own policy pass; if the AI
  cannot manage a mechanism, cut the mechanism (list below) rather than give the AI
  information or bonuses.
- *Information leaks through markets* (aggregates in a two-seat market reveal the
  other side's order): accepted as public market data; prices and volumes only, never
  identities, stocks or balances.
- *Thin markets oscillate*: the ±15% step limit and limit orders damp it; monitor
  price autocorrelation in calibration.
- *Performance in wasm*: the annual-step contingency (2.4) is specified.
- *Integer overflow* with billions of people and large stocks: `u64` sums, `i128`
  products, a 4-billion fixture.
- *Save size* over 525 rounds: chronicle cap, round flows not retained beyond the last
  round.
- *Player overload* from 47 goods: grouping by class, automatic methods and orders by
  default, and "only what you know" visibility keep early screens short (about 12
  goods before AD 1).

**What to cut first if it proves too complex** (in order):

1. Interface lattice (jump assemblies use magnets and substrate instead; test nodes
   lose their economic role).
2. Batteries and cobalt-nickel (fold lithium into electronics and fusion fuel;
   superalloy grade from plain steel).
3. Fine wares (merge into consumer goods; luxuries become spices and precious
   metals).
4. Transit rights and blockade detail (routes only between seats with a direct land
   border or two harbours).
5. Epidemic spread between regions (keep local outbreaks).
6. Harvest variance.
7. Limit prices (orders become quantity-only at the clearing price).
8. Munitions (fold into metal and chemicals).
9. The consumption basket's dependence on technology (fixed baskets by segment).
10. Food synthesis works (raise restorative yields instead).

---

## Appendix A. Derivations

### A.1 Round counts

Two-year rounds from 1950 to 2500 are 275 rounds. Variants checked: floor from 1850
(545 total), floor from 2000 with 3-year rounds 1900-2000 (≈523), antiquity at 50
years throughout to AD 1 (515). The standard schedule (525) keeps 20-year or shorter
rounds from AD 1000 and 5-year or shorter from 1700, when the scientific and
industrial transitions happen.

### A.2 Pre-modern growth

Survival to 16 at the 3.0 base rates ≈ 0.73 × 0.815 × 0.908 ≈ 0.54; adult survival to
the mean age of childbearing ≈ 0.86; total fertility at intensity 1 ≈ 9. Net
reproduction ≈ 9 × I × 0.5 × 0.54 × 0.86 ≈ 2.09 I. With `F_custom` 0.55 and full
food, I ≈ 0.55 → NRR ≈ 1.15 → ≈ +0.5%/yr over a 28-year generation; zero growth at
I ≈ 0.48. Crowding (`F_crowd`, `M_hazard`), urban mortality, outbreaks (≈ one per
region per 200 years killing 3-15%) and lean years bring the long-run mean to the
0.05-0.1%/yr of the targets.

### A.3 Evidence thresholds

Typical monthly gain of a median seat in each tier's era, from `isqrt(10 ×
practitioners) / 2 × C`: tier 0 (≈100 k practitioners, oral) ≈ 300; tier 1 (≈0.5 M,
early writing) ≈ 900; tier 2 (≈2 M, archives) ≈ 2,900; tier 3 (≈5 M, scientific
method) ≈ 7,800; tier 4 ≈ 9,800; tier 5 ≈ 18,000; tier 6 ≈ 37,000; tier 7 ≈ 47,000;
tier 8 ≈ 58,000; tier 9 (small high-energy and space tags) ≈ 10,000-60,000. Times the
target lead times (2.7) gives `H[t]` ≈ 1.1, 4.3, 7.0, 3.7, 2.9, 3.2, 4.4, 4.5, 5.6 M,
rounded in the table.

### A.4 Carrying capacity check

48 regions, average arable after ×3 ≈ 40 levels in use by 2200; restorative 380,000 ×
1.25 irrigation ≈ 475,000 rations per level → ≈ 0.9 billion from fields; pasture and
fishing ≈ +15%; food synthesis in dense regions supplies the rest of a ≈2-billion
world (≈ 2,500 levels, ≈ 1 TWh a month of electricity in all: a real energy burden
that ties population to the late power base).

## Appendix B. Measurement log

Release build of branch `6986601` in a scratch copy, Apple M5 Pro.

- `bts run --seed riverland --rounds R`: 0.28 s (60 rounds), 1.07 s (120), 2.30 s
  (180), 4.06 s (240; finished, no winner).
- `examples/bench` (load a save written by `bts run --save`, then resolve 10 rounds
  with no seat actions): from month 240, 0.062 ms/month; 720, 0.085; 1,440, 0.602;
  2,160, 0.386.
- Policy and observation cost ≈ 4.06 s − ≈ 0.9 s of months ≈ 3.2 s over 240 rounds ≈
  13 ms per round for four native seats.
