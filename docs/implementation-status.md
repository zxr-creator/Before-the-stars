# Implementation status against the v1.0 design

The design documents in this directory remain the specification. This file records how
the playable implementation in `crates/` and `apps/web/` relates to them. "Abstracted"
means the mechanism exists in a simpler form with the same strategic feedback;
"not built" means it is absent.

| Design area | Status | Notes |
| --- | --- | --- |
| Clock and rounds (30 §3, 36 §2) | Implemented | One simulation month. Since ruleset 3.0 a historical calendar: the standard game runs 525 rounds from 5000 BC to AD 2500 (rounds of 50 years down to 2), the quick game 230 rounds on the same dates, and fixture clocks serve tests (`docs/units-and-scale.md` section 11). Contact → five negotiation windows → plan → resolve; standing orders act inside long rounds |
| World generation (08, 37 §5) | Implemented, simplified | Since ruleset 3.0 slice 4 a generated Earth-like planet by default (wrapped 2,000 x 1,000 map, plates, climate bands and rain shadows, terrain and climate zones, geology tags for deposits; `docs/units-and-scale.md` section 13); the flat classic map remains for fixtures. Seeded Voronoi regions (24/48/72), downhill rivers, coasts and sea links, correlated deposits, viable starts with guaranteed reachable copper, iron, coal and rare minerals, three fixed test nodes. The real Earth (slice 16) is not built; the client draws a region that crosses the date line only once, clipped at the map edge. Derivation uses a keyed integer hash rather than HMAC-SHA256; `public_seed: false` mixes in server entropy |
| Economy and production (02, 21) | Abstracted | About sixty facility types carry the 34 recipes and 10 capital modules with inputs, shaft/electric/compute services, upkeep, condition and storage throttles. Goods are pooled per civilization with a per-region carriage efficiency set by transport grade and distance, not per-shipment logistics. No prices, money or private balance sheets: the limit on what a government can direct is the callable-labour share raised by institutions |
| Industrial traditions (22) | Implemented as content | Water/wind, steam, diesel and electric power are separate facilities with real fuel and site limits; generators, grids and motors bridge them; fission, fusion and orbital power follow. No route skips electricity, electronics, computing or orbit |
| Eras and traditions (37 §3-4) | Implemented, adapted | Ten eras entered by decision once knowledge and a built proof stand, crossings scored into golden, steady or dark ages, 24 charters, two tradition slots with exclusive works, unit variants, branch evidence and seeded drawbacks (ruleset 3.0 slices 10 and 13; adaptations listed below). The client does not yet show or set them |
| Population (32) | Implemented, simplified | Sparse blocks keyed by region × lineage × religion with 81 annual age cells, nine-month lagged birth intensity, one combined mortality calculation, annual ageing, migration that moves real counts. One access class per region; qualifications are counted per region rather than per block |
| Education (19, 32 §8) | Implemented | All 24 courses with entrants, teachers, class sizes, venues, materials and months. Students and teachers leave the labour pool; graduates are usable next month; founding cohorts teach themselves slowly. Authorization states (review due, dormant) are not modelled |
| Knowledge (31) | Implemented | Fixed 300-node graph (atlas, doc 37, doc 39) with rival families, locks, revisit studies, fragile know-how and investigation lines; states hinted → discovered → investigating → understood → prototyped → adopted; evidence from actual sector activity, contact and paid exploratory studies; research classes need qualified staff and facilities; licences shorten work but never create operators. T048/T117/T121 corrections applied |
| Culture (07, 18, 31 §6) | Implemented, simplified | Fixed 174-practice graph with exclusive groups, repeal, tensions, era costs, institutional load and reform slots; recognition by people living with the prerequisites, reform with real requirements, gradual adoption shaped by eight private tendencies with 150/500 basis-point yearly drift limits; observed traits need sustained behaviour. Adoption is tracked per civilization, not per local lineage. C045/C047 corrections applied |
| Religion (10) | Implemented, light | No religion at start; movement → tradition → precinct → recognized founder → founding with four fixed beliefs; three founding slots per world; fictional names; spread by local and neighbouring contact |
| Politics (04) | Abstracted | Stability, administrative load and capacity, unrest and callable labour carry faction effects. Factions are reported with weights, support and demands but do not hold separate assets or veto powers |
| Diplomacy (29) | Implemented | Three counterparts, mutual channels, five simultaneous windows, ten envelopes per pair, protected withdraw/decline/break, structured treaties with performance records and trust. Since ruleset 2.0 slice E treaties can second experts (real people who move and come home) and share a launch complex, orbital yard or high-energy laboratory under a joint programme (`docs/units-and-scale.md` section 8). Evidence attachments and multilateral treaties are not built |
| Contracts (14) | Abstracted | Goods deliveries with shortfall records, knowledge, practice and map transfers, pacts, subordination, cession, secondment of experts and joint programmes (with their own performance records: people sent, owed, returned and kept behind; months served and shortfalls). Custody, collateral and staged acceptance are not built |
| Warfare (05, 13) | Implemented, simplified | Six tiers × three roles with the published counter matrix, 2.5^tier, proficiency, supply and morale; simultaneous losses, retreat, five-month capture, six-month sovereignty transfer, militia, elimination. Fronts, frontage and prisoners are not modelled |
| Victory (15, 33) | Implemented | G96 ∧ F24 ∧ Trials96 checked monthly; subordination counts only while real; a broken window restarts; reward 2 − T/H or −1; horizon and all-ineligible endings. Since ruleset 2.0 slice E fleet-wide jump capability also needs separate educational, scientific, industrial and logistical bases measured against the installed works, none of them a population threshold; contracted imports, seconded experts and a partner's launch, orbital-yard or laboratory service can stand in for parts of them while their treaties last (`docs/units-and-scale.md` section 8) |
| Information boundary (06, 02) | Implemented | Observations are projected per seat before serialization; unknown nodes do not appear; opaque per-seat handles; uniform errors for unknown and nonexistent references; foreign estimates are coarse and stable within a year |
| Native AI (33) | Implemented | Deterministic, non-LLM, protocol-only crate. Difficulty changes candidate actions per round (12/24/48), preparation horizon and offer margins; no resource or information bonus. It is a bounded rule-and-scoring policy, not the forward-search planner sketched in the design |
| Agent access (technical/02, 04) | Partly | HTTP API and CLI with seat tokens. MCP adapter, generated SDKs, idempotency keys and isolated runner images are not built |
| Language-model seats | Built, unverified against real models | A seat can be driven by Claude over the Messages API, the local `claude` or `codex` command, or an OpenAI-compatible endpoint. Each consult sends that seat's own observation as a briefing and applies the returned actions; the built-in steward covers what the model leaves out. Three consecutive failures stop the seat. Only a scripted stand-in provider has been run end to end |
| Observer mode | Implemented | A match with no human seat exposes a referee-wide spectator view, a scoreboard, world events, playback control (step, play, run ten), each seat's own view read-only and each model's notes. Refused when a human seat exists or seat tokens are required |
| Interface and chronicle (34) | Mostly | 3D diorama map with four lenses and a flat atlas fallback; technology and civics trees limited to discovered nodes; economy ledger (market, production, chains, workforce, balance sheet); title screen, setup, tutorial (24 steps) and almanac (21 topics); Historic Moments timeline with Markdown/JSON export. Post-match world timeline and counterfactual replay are not built. Seasonal map grading and further lenses are not built |
| Languages | Implemented | English, Simplified Chinese, Traditional Chinese (derived from Simplified with a regional phrase table and overrides). Server-generated text is translated in the client by template; an automated harvest of several full matches found no untranslated string, but 41 rare event templates were never seen in context and no native-speaking reviewer has read it. Generated region names stay in Latin script |
| Desktop application | Built; Windows unverified | `bts` opens the game in a native window (system WebView) with the referee in-process, full screen, per-user saves and a title screen. `scripts/package.sh` produces a universal macOS disk image and a Windows x64 zip; a GitHub workflow builds both natively plus a Windows installer. The macOS app has been launched here; the Windows executable and the workflow have never been run. Nothing is code-signed |
| Multicore (technical/03) | Partly | Independent matches run in parallel across cores; a single match is fast enough to settle a full 240-round game in about two seconds single-threaded, so in-match staged parallelism is not implemented |
| Persistence | Implemented | Full checkpoint saves including controller memory; state hashes; `bts verify` checks repeatability and checkpoint recovery |
| Conservation (`docs/conservation-audit.md`) | Implemented | Goods, people, qualified people, service, work and deposits each have a ledger and an identity; every source is listed with what backs it. The referee can record its books every month (`Match::record_ledgers`), and scripted and all-AI matches are audited month by month over whole campaigns. Capacities (water, care, storage, venue places, transport grade, generator and grid capacity) still depend on works existing rather than on their staffing |

## Ruleset 3.0 (design chapter 36) progress

Branch `ruleset3`. Slices are recorded here as they land; calibration outputs are in
`docs/calibration/ruleset3-slice-*.txt`.

- **Slice 0, tooling (done).** `bts run --curve FILE.csv` writes one row per seat at
  the start of every decade (population, regions, technologies understood by tier,
  research capacity and use, traded tonnes, births and deaths over the decade, food,
  soldiers, and the era milestones of design table 2.7) from a referee-side recorder
  (`bts_engine::curve`, never saved, never served to a seat); `--matches M` runs
  matches on a worker pool (`--threads`, `--first`) into one CSV. `--checkpoints DIR
  --at m1,m2,...` saves the match at the first round boundary at or after each month.
  `cargo run --release -p bts-host --example bench -- SAVE [--rounds N] [--policy]`
  measures p50/p95 per round and the mean per month from a save.
  `scripts/curve_summary.py` summarizes a curve (population by date, regions, era
  milestones, growth checks). The ruleset 2.0 baseline is
  `docs/calibration/ruleset3-slice-0-baseline.txt`.
- **Slice 1, calendar and standing orders (done).** `bts_engine::calendar` (standard
  525 rounds, quick 230, fixtures), signed historical years with no year zero,
  `date`/`calendar` on `Observation`, `SpectatorView` and the host's `MatchSummary`
  (and the portable save header), the reward counted from AD 1900, standing orders
  (`Action::Directive`: build targets, research agenda, automatic research, reform
  agenda, settlement targets), treaty terms scaled to the round with open-ended
  clauses and notice, war only in a round's first month, war policies and armistice,
  round recap flags and one era summary per round in the chronicle (at most 2,000
  entries per seat), briefings counted by kind, dates instead of month numbers in
  every engine text, ruleset `bts-rules/3.0.0` with the named refusal of 2.x saves.
  The native AI writes standing orders in rounds longer than a year, reads round
  totals per year, keeps clause terms within the round's bounds and may place up to
  four times its candidate actions in long rounds. `bts run --calendar quick`,
  `--checkpoints DIR` (era saves at 1000 BC, AD 1000, 1700, 1900, 2100 by default)
  and `examples/decide` (one seat's plan and the referee's answers). Calibration:
  `docs/calibration/ruleset3-slice-1-*.txt`.
- **Slice 2, population (done; calibrated together with slice 3).** Ruleset
  3.0 mortality bands and technology factors, care, crowding, town conditions with
  sanitation coverage, epidemics (`sim::outbreaks`, addressed draws per region and
  month, spread to neighbours, immunity), harvest variance, `F_custom x F_food x
  F_crowd x F_dev` fertility with the Fruitful Households and Day of Rest doctrines,
  deaths by cause, arable land x3 and fields to 250 levels, field methods v3, food
  synthesis works, deposits x5-10 with the larger guarantees, the Megalopolis class,
  `u64` population sums (`docs/units-and-scale.md` section 3). Population depends on
  when the medical and agricultural nodes arrive, so its constants are calibrated
  after slice 3 sets the knowledge pace; `docs/calibration/ruleset3-slice-2-eval.txt`
  records the state with ruleset 2.0 knowledge pacing.
- **Slice 3, knowledge pacing (done).** Channel factor, research effectiveness, tier
  thresholds, work and minimum months and pacing eras read from
  `content/pacing.json`; contact evidence (the trade factor is a stub until the market
  slice: only customs and translation raise it); exploratory studies add evidence
  rather than leads. Population and knowledge were calibrated together (a land factor
  of fertility, the storage-capped reserve, field caps before soil science, the town
  weight by class); the results against the design's targets are in
  `docs/calibration/ruleset3-slice-3-*.txt`. Knowledge milestones of the median seat
  fall in or near the design's windows from iron to fission; population medians are
  within the tolerance from AD 1 to 1500 and in 1900, too high in the third and second
  millennia BC and around 1700-1800, and two to five times too low after 1950 (the
  world peaks near 0.4-0.5 billion against the design's 2 billion): the late scale
  depends on the productivity, goods and AI slices. Native: a full standard all-AI
  match about 23 s, p95 per round about 100 ms; WebAssembly (Node): about 43 s,
  p95 about 200 ms; the annual-step contingency was not needed.

- **Slice 4, the Earth-like world (done).** `WorldKind`, `worldgen::earthlike`, the
  shared `Geo` pipeline, `Region.climate` and `Region.site`, harvest draws by climate
  zone, `bts run --world`, ruleset `bts-rules/3.0.0-s4` and generator
  `bts-worldgen/2.0.0-s4` (earlier ruleset-3 saves are refused by name), protocol
  `bts-protocol/1.4` (`WorldFrame.wrap_x`, `WorldFrame.kind`, `RegionView.climate`).
  Calibration: `docs/calibration/ruleset3-slice-4-eval.txt`.

- **Slice 5, resources and goods (done).** Fifty goods and seventeen deposits
  (`docs/units-and-scale.md` section 14): timber split from building materials, rare
  minerals retired, deposits placed by geology and climate with the design's
  guarantees, revelation by knowledge (unrecognized deposits, their works and their
  goods are absent from a seat's views), site bonuses and spice land, about thirty new
  facility kinds (mines from one template, salt, fibres, spices, horses, textiles,
  munitions, fertilizer, gas and helium, aluminium, magnets, batteries, nuclear fuel,
  consumer goods, fine wares, the lattice works), real fertilizer and horses in the
  fields, a substitute method for every late input except the lattice, unit equipment
  per generation, building-line metadata and technology eras. The generator also records
  the city and harbour data of design chapter 38 and places starts for two to ten seats.
  Ruleset `bts-rules/3.0.0-s5`, content `bts-content/3.0.0-s5`, generator
  `bts-worldgen/2.0.0-s5`, protocol `bts-protocol/2.0` (breaking: the `Good` and
  `Deposit` enums). The native AI builds the new chains through its existing
  wanted-goods rules (it values deposits by their goods, wants timber once it burns
  some, holds back the household-goods and luxury works until consumption exists).
  Not built: the consumption basket (slice 11: textiles, consumer goods, spices, fine
  wares and precious metals are made but not consumed), wool from pasture, the alloy
  steel method (cobalt-nickel is taken directly by its users), superconducting coils as
  a separate grade, the permanent-magnet method of generator halls (hydro works have
  it), road capacity loss without horses (porters stand in at no loss). Calibration:
  `docs/calibration/ruleset3-slice-5-eval.txt`.

- **Slice 6, productivity (done).** The eight factors as bounded multipliers
  (`sim::productivity`; `docs/units-and-scale.md` section 15): education, culture
  (tendencies and established practices), religion (doctrines of the majority faith,
  with the new Sanctified Labour and Stewardship of the Land), resources and land
  (deposit quality and site bonuses on yields), technology (gated by the works' era),
  city (`city_class`, a function of its inputs for the cities slice), health, and
  buildings and methods (base posts, shared support), applied to general posts,
  qualified posts (automation), field and land yields (capped at twice the method)
  and construction work (at most 1.5 worker-months a worker); never to what a level
  makes. A breakdown per region and sector and per works in the observation; the
  posts formula and the construction bound in the monthly audit. Fields now work as
  many levels at the best method as the stores supply and the rest lower, instead of
  all or nothing. Evidence and the town share count work at a productivity of one.
  The Standard map is now 60 regions (presets 30, 60, 90, 120, 200; the referee still
  accepts 24, 48 and 72), with map-size scaling of knowledge pacing in
  `content/pacing.json`. Ruleset `bts-rules/3.0.0-s6`, content `bts-content/3.0.0-s6`.
  Prosperity in `F_city` and `F_dev` is still 0 (consumption slice). Calibration and the
  remaining late-population gap: `docs/calibration/ruleset3-slice-6-eval.txt`.

- **Slice 6r, calibration repair (done).** Fertility's food factor is the households'
  own food security (the past year's access, a two-month household buffer at most what
  the stores hold, or a twentieth of surplus production), not the government's reserve
  policy; the land factor's Malthusian ceiling sits at 46.5% of carrying capacity and
  fades as children survive; the development factor's floor is 6,800. The native AI sizes
  its supply orders to the gap between standing demand (fields at the best method,
  works, upkeep) and supply, up to 12 levels an order with standing targets, plans the
  fields' inputs before they run short and sizes granaries to its reserve. A
  `bronze_age` pacing era brings writing and bronze into their windows, with the later
  eras re-tuned in `content/pacing.json`. Ruleset `bts-rules/3.0.0-s6r`, content
  `bts-content/3.0.0-s6r`, protocol `bts-protocol/2.1` (additions only, listed under
  slice 6b). Calibration tooling: `scripts/calib_report.py` (population with spreads,
  era windows, completion shares, fertility diagnostics; 32-seed batches) and four new
  curve columns (`established`, `fert_food_bp`, `fert_intensity_bp`, `cap_ratio_bp`,
  `land_bp`). On 32 seeds the median seat is within ±35% of design table 3.1 from
  1000 BC to 1900 and every era milestone from storage to programmable computers is in
  or within a century of its window; 3000 BC is about 1.9x and 2000-2200 0.3-0.5x the
  target: `docs/calibration/ruleset3-slice-6r-eval.txt`.

- **Slice 6b, the deeper technology graph (done).** `content/technologies.json` holds 300
  nodes: doc 37's 19 (T154-T159, T170-T182, with requirement and capability text written
  for the merge; T140 and T142 renamed) and doc 39's 143 (T183-T325; T048 renamed, T063
  relinked to `T042 & (T061 | T213) & T050`); new groups L-S. Per-node tier, tags, era
  band, pacing era, `work_bp`, `hint_bp`, minimum months and investigation installation
  live in `content/pacing.json` (existing non-critical nodes of tiers 6-7 and 8-9 at
  12,500/11,500 and 15,000/12,500 bp); kind, family, fragile and tradition evidence on the
  node. `content/families.json`: the 15 rival families and the committed victory-critical
  sets (84 technologies, 35 practices), which `scripts/critical_set.py --check` recomputes
  (first-listed alternative at a technology OR, the smallest closure over practice ORs)
  and a content test checks for closure. Mechanisms (`sim::knowledge`): installed base
  per family member, incumbent share, evidence lock `10,000 - 6,000 s`, work lock
  `10,000 + 5,000 s` on investigation, discovery cap at `s >= 7,500` without a peaceful
  prototyping contact, critical members bounded at 8,000/11,000 with no cap, refutation
  halving the lock, revisit studies (`start_project { kind: revisit { card } }`, 25% of
  the node's work, at least 24 months, lifting the evidence lock and cap for 240 months);
  fragile know-how (lost after 1,200 months unused without C013 or C088, relearned at
  half the work); investigation lines `4 + isqrt(research staff / 5,000)` (at most 24, as calibrated in slice 6c;
  the design's `2 + isqrt(staff / 50,000)` stalled printing seven centuries with the
  research staff these seats build); tradition branch nodes take no practice evidence
  until slice 13 (contact and studies only); sealed nodes absent until the objective is
  revealed; off-world investigation installations stand in as the Earth-orbit station
  until slice 15. Information boundary: family views only between discovered members,
  revisit of an unknown card gets the uniform unknown error (tests). The native AI
  scores research by expected value per unit of research (critical weight by difficulty,
  known requirements, family fit, the self-block rule against locking a critical, channel
  or waited-for rival, read from the public tables in `bts_ai::tables`), with lines split
  critical/economy/breadth 60/25/15 (Hard), 75/15/10 (Expert), 40/40/20 (Medium) and
  cheapest-first for Easy; revisit studies for a locked rival it needs. The `Expert`
  test policy (`ControllerKind::NativeExpert`, `--ai expert,...`; not in the setup) is
  this policy with the larger critical share and goal weight (a skeleton: education,
  base building and integration are still the Hard policy's). `bts critical-path --seed
  S --seat K` runs a match with node timings and prints the binding path to T167, each
  critical node's ready/lead/discovered/understood dates, lead waits, investigation time,
  slack, and a lower bound with minimum investigations. Node payoffs (the facilities and
  methods doc 39 lists for the new nodes) are not built: the new nodes are knowledge
  only. Ruleset `bts-rules/3.0.0-s6b`. Calibration: `docs/calibration/ruleset3-slice-6b-eval.txt`.

- **Slice 6c, the deeper practice graph (done).** `content/practices.json` holds 174
  practices (doc 37's C065-C067, whose off-world condition stands in as `T170` until
  slice 15, and doc 39's 107), each with an era, category and material preconditions
  (`hard`, with the new `TRAD:<path>` atom, never true before slice 13); 17 exclusive
  groups in `content/families.json` and 5 tension pairs. Costs by era (evidence, reform
  work, media, minimum months, institutional load; critical practices keep their
  ruleset-2.0 costs), adoption slowing with era, institutional load against capacity
  (`20 + 2 x admin office levels + 10` for each of C026, C036, C041/C042, C050, C119;
  stability -1 per 4 points over, reform work x1.5), reform slots `1 + C026 + C036 +
  C050`, exclusive groups refused until a repeal (`Action::Repeal`, 24 months, stability
  -2 while it runs), tensions (stability -2, half-speed adoption), tradition institutions
  held until slice 13, practice drags on evidence (guilds, state church, political police,
  mercantilism, surveillance; never below x0.80 with the locks on a critical node). The
  native AI scores reforms by `(effect + route - tension) / (work + 400 x load)`, picks a
  world order by 1900 (unified command, constitutional or negotiated, from its situation)
  and never reforms the member of an exclusive group that would close it, leans by seat
  on the other groups (conscription for a seat weaker than a met rival), keeps its load
  within capacity less four and repeals the least valuable practice when over.
  Standing research orders no longer starve what a seat chose: agenda items start at
  priority 4, automatic research at 6 and never into the last two investigation lines
  (in 50-year rounds automatic research had filled the lines with cheap side nodes and
  left critical investigations centuries without capacity). The land factor's neutral
  point is 48% of capacity. Calibration: `docs/calibration/ruleset3-slice-6c-eval.txt`.

- **Slices 10 and 13, eras and traditions (done, moved ahead of slices 7-9 at the user's
  request).** `sim::eras` (design chapter 37, sections 3-4; numbers in
  `docs/units-and-scale.md` section 17). Ten eras from Ancient to AI (Interstellar sealed
  until the objective is revealed), each entered by `Action::EnterEra` once its knowledge
  is understood and its built proof stands; crossings of 600 down to 120 months strain
  stability by the share of posts in works two or more eras behind; a score of food,
  order, modernization and integrity ends each crossing in a golden age, a steady time or
  a dark age with the design's effects; 24 charters (`Action::ChooseCharter`, one per era,
  two in a golden age) acting through productivity, stability, research, recruitment,
  militia, mobilization, administration, construction, upkeep, mortality, fertility,
  automation and compute; the expected basket by era as the hook of slice 11. Two
  tradition slots (`Action::ChooseTradition`; machine from the Industrial era, frontier
  from the Information era) shown as Steampunk, Dieselpunk, Electropunk, Atompunk,
  Cyberpunk, Biopunk and AI-punk with the sober names beneath; mastery from signature
  works; nine exclusive works and five exclusive methods (`content.rs`, buildable only
  under `TRAD:<path>`, every recipe mass-balanced); seven unit variants fixed at
  recruitment (`Army.variant`); branch-node evidence from the held tradition's works only
  (doc 39 section 1.5; contact and studies as before, capture not built); tradition
  institutions C168-C174 recognizable under their path; switching by a ten-year reform
  project with a 600-month cooldown; public era and traditions among met seats; trust
  drift and the joint-programme discount for shared paths; the drawbacks as seeded,
  bounded hazards (coal smoke, oil dependence, grid faults and conductor hunger, reactor
  incidents, network incidents, biofoundry contamination and long validation, labour
  displacement). Adaptations to the content that exists, each named in the code: the
  Classical proof is a region of 750,000 (the 60-region map spreads people thinner than
  doc 37's table assumed); the Early Modern harbour may be roads in three regions for a
  seat without a coast; operating means half rate or half staffed; the Space proof's
  off-world outpost is the orbital station; the AI proof counts computing centres on
  accelerator clusters as AI-era works until slice 7's automated stages; the signature
  share is taken among works of the slot's era; space charters act on the existing space
  works until slice 15; the Welfare State and Mass Mobilization carry stand-in costs until
  slice 11's basket; Compute Commons has no treaty clause; variant interactions between
  swarms and cyber-augmented forces and fuel degradation wait for slice 8. The native AI
  enters an era when its expected crossing score reaches its aim (Hard 85, Medium 70,
  Easy at once) or its patience runs out, never into a likely dark age in a long round,
  builds the next proof once the knowledge is in, scores charters by its situation,
  commits each slot 20-60 years after it opens by its endowment against Standard-map
  norms and its signature posts, builds its path's works, raises tradition branch
  nodes in research, and switches only in a dark age. Ruleset `bts-rules/3.0.0-s10`,
  content `bts-content/3.0.0-s10`, protocol `bts-protocol/2.2` (additions only), policy
  `bts-native/1.3.0`. Calibration: `docs/calibration/ruleset3-slice-10-eval.txt`.

## Known calibration gaps

- All numeric parameters are first-pass values tuned only through all-AI matches.
- Late-game supply chains (fuel, spares, compute) are fragile for the native opponents.
- In all-AI matches the leader conquers or subordinates rivals after the objective is
  revealed, but no seat has completed global integration within the horizon.
- The client was verified by automated runs; religion founding, battles and the
  jump programme screens were built from the protocol types and have not been exercised
  by hand.
- The 3D map has only been rendered with software WebGL in automated runs. Its frame
  rate on real hardware, and on integrated graphics in particular, is unmeasured.
- The client does not yet show `GoodLine.lost` (spoilage and carriage loss), and its
  ledger still treats `produced` as what reached the stock; since ruleset 2.0 slice B
  `produced` is gross output where it is made. The facility descriptions and recipe
  notes that explain deep and shallow workings are new English strings without
  translations.
- Service rationing is strict since slice B: an understaffed, underpowered works runs
  at the product of the two shares, not the lesser. All-AI matches end with about the
  same technology and a few percent fewer people than before (`docs/calibration/`).
- Construction since ruleset 2.0 slice C needs a qualified site crew, site power and
  a minimum duration besides goods and work (`docs/units-and-scale.md` section 6), and
  each region has an ordered construction queue. The client does not yet show the
  quote's crew, site power and minimum months, the queue or the `position` of
  `manage_project`; the new blockers ("Site crew short: ...", "Site power short: ...")
  and receipts are English strings without translations. Sites are not fed from the
  grid, and the native opponents do not move people to a thinly peopled test node
  whose call-up cannot hold a deployment node's crew. In all-AI matches the last
  technologies arrive some twenty rounds later than under slice B, because the
  installations their investigation needs take three to five years each to build
  (`docs/calibration/`).
- Production methods can be chosen by region since ruleset 2.0 slice D (`set_policy`
  / `method`), fields included, and works that stand together share support posts,
  repair works and carriage within the region's freight capacity
  (`docs/units-and-scale.md` sections 4 and 7). The client does not yet show or set
  a method, nor show `OwnRegion.infrastructure` (freight load and capacity, the
  savings, congestion loss); the fields' catalog entry now carries recipe views,
  which the client's production screens were not written for. The new method names,
  the field-method notes and the receipt reason "unknown facility or method" are
  English strings without translations. The native opponents do not yet move works
  out of a region congested at the top transport grade; in all-AI matches about a
  quarter of capitals end above it, losing up to 7% of what they send
  (`docs/calibration/`).
- The space and jump base since ruleset 2.0 slice E (`docs/units-and-scale.md`
  section 8, design chapter 35): the jump checks carry a `category`, treaties carry
  `secondments` and `programmes` views, goods lines carry `withheld`, and two clause
  kinds (`secondment`, `joint_programme`) exist. The client mirrors them in
  `apps/web/src/protocol.ts` (the clauses as a separate `CooperationClause` type, so
  that the diplomacy panel's exhaustive tables still compile) but shows none of them
  and cannot propose the new clauses; the new check labels and details, clause
  summaries, treaty performance lines, briefings and chronicle entries are English
  strings without translations. The high-energy laboratory draws 1,000 units of
  electricity instead of the design table's 3,000 (the first one must run before
  fission is understood). No native seat completes the victory contract under the new
  base in the eval set; the commonest failures are the jump works themselves and the
  year of flight hardware. In the riverland world the easy seat, which has no copper,
  ends at 89 technologies instead of 121 (`docs/calibration/slice-e-*.txt`).
- The economy ledger's own estimates (marked as such in the interface) agreed with the
  referee's totals to within about 25% in 41 of 57 comparisons; the rest diverge more.
