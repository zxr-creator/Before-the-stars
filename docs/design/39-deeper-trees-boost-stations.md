# 39. Deeper trees, path dependence, boost (运载力) and space stations (ruleset 3.0 addendum)

Status: design addendum, content plan and plan changes; no code and no `content/` file is
changed by this chapter. It extends `37-eras-space-buildings-military.md` (doc 37) and
`36-ruleset-3-history-resources-trade.md` (doc 36), which stay normative wherever this
chapter does not change them, and chapter 31's dynamic discovery model, which it keeps.
It is written against branch `ruleset3` (slices 0-4 committed; `content/pacing.json` and the
slice-3 calibration as recorded in `docs/calibration/ruleset3-slice-3-*.txt`). Cities,
migration and transport modes, including tradition-specific and hidden-technology
transport, are specified in `38-cities-migration-transport.md` (doc 38, written in
parallel); where a node below names a transport capability, its mechanics are doc 38's.
Decisions to confirm are in `39-open-questions.md`. Machine-readable drafts:
`39-draft-technologies.json` and `39-draft-practices.json` (validated: no dangling ids,
no cycles, victory-critical set unchanged).

The user asked (verbatim, translated where Chinese): make the civics tree ("习俗制度",
the practices) longer, because it is narrow and finished quickly; adjust the dynamic
technology tree, which every civilization finishes in the late game; make some choices
greatly reduce the chance of another technology, so that the AI must choose smartly; add
more hidden technology for normal development and for the punk eras ("more fun and more
challenge"); adjust research requirements so that late technology and practices are
harder; take national launch capacity, space bases and space stations from the genre
(the user named *Terra Invicta*) as a reference; and add a national resource **boost
(运载力)**, the power of a country to send things to space, made by space centres and
rockets and spent to send people and objects to space stations and bases. The
coordinator added: **victory must stay reachable in the given time with smart planning**
(an expert planner should win around AD 2050-2200), which this chapter makes a
first-class constraint (section 0.2).

Every number marked *provisional* is a calibration starting value; identities, orderings,
formulas and invariants are not provisional. Integer arithmetic only; nothing is created
from nothing; seats see only their own state and what they discovered.

---

## 0. Summary for the player

**The knowledge graph is twice as large, and you will not learn all of it.** About 300
technologies instead of 138 (157 after doc 37), with side branches in every era: coinage,
hydraulic concrete, the blast furnace, the telescope, airships, radar, antibiotics,
satellites, reactor lines, carbon nanotubes, a space elevator. Some are dead ends that
still pay where you use them: a geared astronomical calculator, cam-driven automata,
naphtha fire, pneumatic tube networks. A few are fragile: forget to practise crucible
steel or Roman-style concrete for a century without archives and you lose the know-how
and must relearn it. A strong civilization understands roughly three quarters of the
graph by AD 2300; the whole world together knows nearly all of it; nobody knows
everything.

**Choices close doors, softly.** Fifteen families of rival technologies compete: a
logographic script or an alphabet, paddy fields or crop rotation, humoral medicine or the
germ theory, woodblock or movable type, semaphore or telegraph, direct or alternating
current, airships or aircraft, analog or digital computing, expert systems or statistical
learning, four reactor lines, three rocket propellants, two roads to fusion. Once you
build on one, your people stop asking questions about the others: their evidence comes
slowly, may stall at a rumour, and costs more to investigate. Nothing is ever impossible:
contact with a people that uses the rival, a refuting discovery, or a paid *revisit
study* reopens the question at a price.

**Each punk tradition has its own hidden branch.** When you commit to Steampunk,
Dieselpunk or Electropunk at the Industrial era, or to Atompunk, Cyberpunk, Biopunk or
AI-punk at the Information era, eight technologies of that tradition become reachable
through the works only its holders build: difference engines and ironclads; diesel-
electric drives and steel rocket stages; trams, arc furnaces and maglev launch sleds;
compact reactors and pulse units; implant clinics and telepresence mining; biofoundries
and bio-ISRU on Mars; lights-out factories and synthetic scientists. Others learn them
only from you, by conquest or by expensive study.

**Institutions are a tree too, and a long one.** 174 practices instead of 64: councils of
elders or hereditary chiefs, codified law, feudal vassalage or appointed prefects, civil
examinations, universities, joint-stock companies and central banks, absolute monarchy or
parliament, toleration or a state church, conscription or a volunteer army, planning or
competition law, privacy or surveillance, a space commons or homestead claims, basic
income or a job guarantee. Seventeen groups are mutually exclusive; holding one means
repealing the other first. Late reforms take a decade or more, and every institution adds
administrative load that your offices must carry. A leading state adopts about half to
two thirds of all practices by AD 2300.

**Boost (运载力) is how you reach space.** Launch sites make it every month, from a rocket
proving ground through launch complexes and reusable spaceports to (late) skyhooks and a
space elevator; equatorial sites make 10% more. It is stored up to a cap set by your
launch sites and integration halls; at the cap, launch sites stand down and save their
fuel. You spend one boost per tonne you put into Earth orbit and three per person (two
with crew-rated capsules). Beyond Earth orbit, ships, propellant and the zone stores of
doc 37 take over. Launches can fail; crews can die.

**Stations are not bases.** A station is built in an orbit (low Earth orbit,
geostationary orbit, the Earth-Moon L1 and L5 points, Sun-Earth L2, lunar orbit, Mars
orbit, Ceres, Callisto or Titan orbit) from a core and modules: habitats, life support,
solar, reactor or fusion power, docking and depot, shipyard, fabrication, research,
observatory, refinery, defence, relay, command, a rotating ring, a solar power
satellite, a skyhook. Bases are the nineteen surface sites of doc 37, regions where
people live and are born. Stations hold crews, build ships, refuel transfers, watch the
sky and defend orbits; they can be boarded, besieged and captured. Your jump programme's
orbital station and yard are now an Earth-orbit station with a shipyard module.

**Winning is unchanged, and still reachable.** The victory-critical set (84 technologies,
35 practices, seven kinds of works) is the same as before; none of the new nodes is
required, and path dependence can delay it by at most a few years. A clever planner who
plays the critical path can win in the 22nd century.

### 0.1 What changes at a glance

| Area | Before (doc 31, 36, 37) | After (this chapter) |
| --- | --- | --- |
| Technologies | 157 (138 + 19 of doc 37) | **300**: 87 normal side, alternative, dead-end and sealed nodes; 56 tradition-branch nodes (7 × 8) |
| Practices | 67 (64 + 3 of doc 37) | **174**: 107 new (100 normal, 7 tradition institutions); 17 exclusive groups, 7 tension pairs |
| Path dependence | none (traditions lock only works) | 15 rival families with evidence and work locks, discovery caps, refutation and revisit studies; practice drags; fragile knowledge |
| Tradition knowledge | open to all (doc 37 §1.2) | each tradition owns a branch whose evidence comes from its works |
| Research cost | per tier (`pacing.json`) | per tier × per-node `work_bp`/`hint_bp`; late non-critical nodes ×1.25-1.75; investigation lines `2 + √(staff/50,000)` |
| Practice cost | by catalogue group (four sizes) | by era (nine sizes), institutional load and capacity, reform slots, repeal |
| Space access | lift: a monthly, non-storable service | **boost**: a stored national resource with a cap; failures; skyhook and elevator |
| Orbit | orbital station and yard as Earth facilities | **stations**: orbital objects with a core and up to 20 modules in ten orbits |
| Victory | G96 ∧ F24 ∧ Trials96, doc-35 checks | unchanged; check 13 reads "a station with a shipyard module"; critical set protected and measured |

### 0.2 First-class constraint: victory stays reachable with smart planning

1. **The victory-critical set is bounded and protected.** It is the minimal set of nodes
   needed for the victory conditions (G96 ∧ F24 ∧ Trials96, doc 15/36) and every doc-35/37
   base check: T167 and its prerequisites, the requirements of the launch complex, station
   core and shipyard, high-energy laboratory, testbed, jump assembly line and deployment
   node (T140, T141, T142, T144, T145, T146; C045, C056, C057, C058, C064), and C037 for
   formations. Computed with the cheapest alternative at every OR (checks in §6.6):
   **84 technologies (28% of 300) and 35 practices (20% of 174); prerequisite depth 25 for
   T167 and 12 for C064**, the same as before this chapter. The goods are those of doc 35
   check 10 (components, electronics, computing hardware, conductors, structural metal)
   plus spares, fuel and, new, about 8,000 t of boost once and 450 t a month (§4.6).
2. **Breadth never lengthens the critical path.** No new node is an AND-prerequisite of a
   critical node; relinks add OR alternatives only and only to non-critical nodes; the
   critical nodes keep their tier work and thresholds (`work_bp` = 10,000) while late
   non-critical nodes become dearer. A content test asserts the closure is unchanged.
3. **Path dependence never makes the victory path unreachable.** Two critical nodes sit in
   families (T053 in F03, T111 in F10); for them the lock is capped (evidence ≥ ×0.80, work
   ≤ ×1.10, never a discovery cap), and the product of all locks and practice drags on a
   critical node is floored at ×0.80. Every exclusive practice group leaves a route to C064
   from each side (tested). **Worst-case recovery cost: about 10 years on T053 itself (which
   has centuries of slack before T144 at median pace), about 3 years on T111, at most 5
   years on T167; one revisit study (25% of the node's work, 24 months) removes the lock.**
4. **Timing targets** (calibration, section 8.4): an expert planning policy wins in ≥ 80% of
   its matches with a median win AD 2100-2200 and its 10th percentile no earlier than AD
   2050; the Hard native AI keeps doc 36 §7's targets (a winner in 55-75% of all-AI matches,
   ≥ 70% of wins by the hard seat, median AD 2250-2310); Medium wins rarely and late
   (≤ 15% of its matches, after 2330); Easy essentially never.
5. **Verification** (section 3.5 and 8.3): an `Expert` test policy that may use the public
   design (critical set, family table) but acts only on its own observation; a
   critical-path length tool per world and seat; and a qualitative check with an LLM agent
   through the MCP `get_turn`/`submit_turn` tools.
6. **What to loosen first if the expert cannot win in time**: thresholds on the critical
   path, never breadth (section 8.5).

---

## 1. Technology graph expansion and path dependence

### 1.1 Diagnosis

Slice 3 (`ruleset3-slice-3-eval.txt`, 64 seats): the six seats that reach T167 reach it in
AD 2325 and *at the same decade understand all 138 nodes*: the graph is exhausted exactly
as the chain finishes, because (a) evidence accrues in parallel for every node whose
prerequisites are met, (b) the native AI investigates the cheapest remaining node first
(`bts-ai/src/policy.rs::research`), so the chain is done last, and (c) late work (tier 7-9:
12, 20, 30 M researcher-months in `pacing.json`) is small against a late leader's capacity.
Practices (`content.rs` work 10/36/110/260 k worker-months by catalogue group, evidence
1,200-12,000) are recognized in months and adopted in a few years: the AI reforms every
recognized practice in catalogue order (`policy.rs::culture`). Pacing is sensitive: one
tier-1 threshold change moved the scientific method by about 600 years. This chapter
therefore adds breadth and cost **outside** the critical set and leaves the critical
chain's constants to calibration.

### 1.2 Target size and shape

Era bands follow doc 37 §8.3 (T038 moves to Modern: powered flight is not Early Modern).

| Era | Existing + doc 37 | Added (normal) | Added (tradition) | Total | of which victory-critical |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0 Ancient | 16 | 5 | 0 | 21 | 13 |
| 1 Classical | 10 | 10 | 0 | 20 | 6 |
| 2 Medieval | 6 | 10 | 0 | 16 | 5 |
| 3 Early Modern | 12 | 9 | 0 | 21 | 9 |
| 4 Industrial | 25 | 10 | 6 | 41 | 18 |
| 5 Modern | 19 | 10 | 10 | 39 | 8 |
| 6 Information | 25 | 9 | 13 | 47 | 10 |
| 7 Space | 27 | 12 | 14 | 53 | 9 |
| 8 AI | 11 | 9 | 13 | 33 | 1 |
| 9 Interstellar | 6 | 3 | 0 | 9 | 5 |
| **Total** | **157** | **87** | **56** | **300** | **84** |

By field (catalogue group; M-S are the seven tradition branches):

| Group | Field | Existing + doc 37 | Added | Total |
| --- | --- | ---: | ---: | ---: |
| A | Subsistence, communities, and early craft | 16 | 8 | 24 |
| B | Specialized society, records, transport, and machinery | 19 | 16 | 35 |
| C | Measurement, experiment, and teachable science | 19 | 11 | 30 |
| D | Industrial foundations and the material conditions of scale | 12 | 7 | 19 |
| E | Steam and thermal traditions | 8 | 2 | 10 |
| F | Diesel, chemicals, and mobile industry | 8 | 6 | 14 |
| G | Electric power, electronics, and distributed control | 10 | 6 | 16 |
| H | Computing, network infrastructure, and high autonomy | 16 | 7 | 23 |
| I | Biology, ecology, and life support | 8 | 4 | 12 |
| J | Orbital and high-energy engineering | 20 | 16 | 36 |
| K | Relativity and FTL engineering | 8 | 3 | 11 |
| L | Solar System operations | 13 | 1 | 14 |
| M | Steampunk branch (Coal and Steam) | 0 | 8 | 8 |
| N | Dieselpunk branch (Oil and Engine) | 0 | 8 | 8 |
| O | Electropunk branch (Current and Wire) | 0 | 8 | 8 |
| P | Atompunk branch (Atom) | 0 | 8 | 8 |
| Q | Cyberpunk branch (Network) | 0 | 8 | 8 |
| R | Biopunk branch (Living Systems) | 0 | 8 | 8 |
| S | AI-punk branch (Synthetic Minds) | 0 | 8 | 8 |

New nodes by graph tier: tier 0: 5, tier 1: 18, tier 2: 11, tier 4: 7, tier 5: 19, tier 6: 18, tier 7: 18, tier 8: 32, tier 9: 15. After the change the tiers hold 21, 34, 23, 7, 22,
38, 33, 41, 57 and 24 nodes (tier 0-9). The late tiers carry the breadth: 155 nodes of
tier 6-9, of which 26 are critical.

**Kinds of new node** (`draft.kind`):

| Kind | Count | Meaning | Examples |
| --- | ---: | --- | --- |
| side | 53 | optional branch with a local payoff (a facility, method, unit variant, capped productivity or service) | coinage, cement, antibiotics, satellites, quantum computing |
| alt | 26 | an alternative solution to a problem another node also solves; member of a rival family (1.4) | alphabet vs logographic script, DC vs AC, four reactor lines |
| dead | 5 | a dead end: no descendants, real local payoff | geared calculators, automata, naphtha, crucible steel, analog computers |
| sealed | 3 | fictional side nodes after T162/T163/T166; absent until the objective is revealed (doc 37 §8.9) | anomaly cartography, exotic-field shielding, jump beacons |
| entry | 7 | the first node of a tradition branch, discoverable by anyone through ordinary evidence | steam hammers, cracking, electric traction, isotopes, network centres, biofoundries, autonomous logistics |
| branch | 49 | a tradition node whose evidence comes only from that tradition's works (1.5) | difference engines, maglev sleds, pulse units, memory uploads, bio-ISRU |

Every node keeps chapter 31's four separate tests (evidence path, investigation, prototype,
adoption) and its visible card states the capability actually demonstrated. Each new node
lists a real payoff so no node is dead weight; the payoffs obey doc 37 §1.3 (capped labour
or yield productivity, mass-balanced methods, capacity bought with real works, or a change
of which scarce thing is spent).

### 1.3 Completion targets: nobody finishes the graph

| Metric (64 all-AI seeds, standard calendar) | Target |
| --- | --- |
| Leading seat, technologies understood at AD 2300 | 70-85% of 300 (210-255) |
| Median seat with land at AD 2300 | 45-65% |
| World union (understood by at least one seat) at AD 2300 | ≥ 90% |
| Seats understanding all 300 at any time before AD 2500 | 0 in 64 matches |
| Tradition branch nodes understood by seats that never held the tradition | ≤ 20% of all branch-node understandings |
| Seats understanding nodes of more than three tradition branches | ≤ 5% |
| Late (tier 8-9) non-critical nodes understood by the leader at 2300 | 35-65% |
| Leader's T167 date, Hard smart AI against slice-6 baseline | earlier or within +10 years |

Why these hold structurally: the full graph's tier 6-9 work is about 3,950 M
researcher-months under `pacing.json` tier work and the multipliers of section 1.6, against 414 M
for the critical set's 26 late nodes and 1,136 M for today's 157-node graph: **9.5 times
the critical late work instead of 2.7 times.** A leader that spends 60-70% of its late
capacity on the critical set finishes it, and the rest buys roughly half of the remaining
late work by 2300. Tradition branches (56 nodes) are reachable in bulk only by their
holders, and one seat holds at most two traditions at a time. Absolute work is calibrated
to the completion targets, not the other way round: when the population slices raise late
research capacity two- to five-fold (slice 3 records the late world at 0.4 billion against
doc 36's 2 billion), the late multipliers rise with it so that the breadth ratio and the
targets hold.

### 1.4 Path dependence: rival families

A **family** (`draft.family`; table in 6.3) is a set of technologies that solve the same
problem in incompatible ways. Three kinds: *standard* (incompatible infrastructure: DC vs
AC, reactor lines, rocket propellants), *approach* (two solutions to one problem: paddy vs
rotation, converter vs open-hearth, magnetic vs inertial fusion) and *doctrine* (a belief
that resists contrary evidence: humoral medicine vs microorganisms).

**Incumbent share.** For each seat and family, `installed(m)` is the number of operating
facility levels and methods whose requirement contains member `m` (adopted, chapter 31
§4); members understood but not adopted count 1 each. The incumbent is the member with the
largest `installed`; its share `s = installed(inc) × 10,000 / Σ installed` (bp; 0 when the
seat has none). An understood-only incumbent caps `s` at 5,000.

**Locks on every other member `r`** (applied monthly in `knowledge::step`):

    evidence gain(r) × lock_e / 10,000     lock_e = 10,000 − 6,000 × s / 10,000      (≥ 4,000)
    work(r)          × lock_w / 10,000     lock_w = 10,000 + 5,000 × s / 10,000      (≤ 15,000)
    discovery cap: while s ≥ 7,500 and no peaceful contact has prototyped r, the
    evidence of r cannot exceed 2.5 × H[r] − 1: r stays a lead ("nobody here is asking
    that question")

**Critical members** (T053, T111): `lock_e ≥ 8,000`, `lock_w ≤ 11,000`, no discovery
cap. **Refutation**: a family may list refuting nodes (F03: T045, microscopic
observation, variolation; F10: T110); each understood refuting node halves the remaining
lock (`lock_e += (10,000 − lock_e) / 2`, likewise for work), so evidence beats doctrine.
**Contact** evidence (doc 36 `X`) is never locked and lifts the discovery cap.
**Revisit study** (`start_project { kind: revisit { card } }`, naming a discovered member
by its handle): research work 25% of `r`'s tier work, minimum 24 months; on completion the
seat ignores `lock_e` and the discovery cap for that family for 240 months (`lock_w`, the
retooling cost, stays). A dark age halves the study. **Switching standard**: upgrading
works from one member's stage to another's uses doc 37's upgrade edge at 80% of the new
bill instead of 60% (incompatible infrastructure). **Joint programmes and standards
bodies**: the practice *International standards bodies* halves locks for families whose
incumbent a met seat shares; doc 37's "compatible standards" rule extends to families.

Interactions: F01 → F04 (a logographic incumbent gives woodblock printing +20% evidence; an
alphabet gives movable type +20%); F13 (rocket propellant) sets the fuel input of launch
stages (§4.2) and whether Mars or Titan ISRU can refuel the seat's ships (methane); F12
sets reactor fuel (enrichment for light water, none for heavy water, reprocessing for
breeders, thorium for molten salt); F07 decides where nitrogen comes from (imports, gas,
electricity or engineered crops).

### 1.5 Path dependence beyond families

1. **Tradition evidence.** A `branch` node's practice evidence `P` (doc 36 §2.7) counts only
   the activity of its tradition's signature and exclusive works (doc 37 §4.1) and the
   seat's research trickle `T` does not apply; contact evidence `X` from a peaceful holder
   that prototyped the node applies normally; a seat that captures a region with operating
   exclusive works receives that region's activity as evidence for 120 months; a paid
   exploratory study (`Study`) in the node's domain can hint it. So branch knowledge is
   **effectively held by holders, never locked**. This revises doc 37 §1.2 ("traditions
   never hide a technology") at the user's request; doc 37's rule that knowledge is never
   *locked* stands. A seat that switches tradition keeps what it understood; its old
   branch's evidence stops. Exclusive works whose requirement moves to branch nodes are
   listed in the draft (`exclusive_requirement_changes_doc37`): steam hammer works need
   T270, the cracking refinery T278, trams and metros T286, the compact reactor T295, the
   implant clinic T303, the biofoundry T310, the lights-out method T319, and so on.
2. **Practice drags (sunk institutions).** While established: craft guilds (C018) without
   industrial employment (C033) → T066 evidence ×0.85; a state church (C104) → Science-tag
   evidence ×0.90 unless toleration was held in the last 100 years; mercantilism (C107) →
   contact evidence ×0.80; political police (C135) → Science-tag evidence ×0.95; mass
   surveillance (C140) → evidence of public-key cryptography, fibre optics and open-source
   computing ×0.80. The product of all locks and drags on a critical node is floored at
   ×0.80.
3. **Fragile knowledge.** Nodes flagged `fragile` (crucible steel, hydraulic concrete,
   geared calculators, naphtha incendiaries) fall back from understood to discovered when
   no works have used them for 1,200 months and the seat holds no archive practice (C013)
   or monastic orders (C088). The evidence is kept; re-investigation costs 50% of the work.
   This is the "lost knowledge" of chapter 31 §4 made concrete; it never touches a
   critical node.
4. **Opportunity cost.** Investigation lines (1.6) and late work force a choice of what to
   learn; the AI must spend on the critical set first (section 3).

No node is permanently impossible: every lock has a floor, every cap a contact or study
exit, every branch node a contact, capture or study route, every fragile node its evidence.

### 1.6 Research requirements

**Per-node multipliers** (`draft.work_bp`, `draft.hint_bp`, read by `content.rs` as
`work = tier work × work_bp / 10,000`, `hint = H[tier or pacing era] × hint_bp / 10,000`):

| Nodes | `work_bp` | `hint_bp` | Minimum months |
| --- | ---: | ---: | --- |
| Victory-critical (84) | 10,000 | 10,000 | tier value (unchanged) |
| Existing non-critical, tier 0-5 | 10,000 | 10,000 | tier value |
| Existing non-critical, tier 6-7 | 12,500 | 11,500 | tier value |
| Existing non-critical, tier 8-9 | 15,000 | 12,500 | 48 |
| New side/alt/dead, by era 0-9 | 10,000; 10,000; 11,000; 12,000; 12,500; 12,500; 13,000; 15,000; 17,500; 15,000 | 10,000-20,000 rising by era | tier value; 48 for tier 8-9 |
| Tradition entry | era value × 1.10 | era value | tier value |
| Tradition branch | era value × 1.25 | era value × 1.25 | tier value; 48 for tier 8-9 |

Antiquity nodes (eras 1-3) carry a `pacing_era` (doc 36 pacing classes `classical`,
`medieval`, `high_medieval`, `renaissance`, `early_modern`) so their leads come in
historical windows, as slice 3 does for T023-T049.

**Investigation lines** (new, replacing the AI's hard-coded slot count): a seat may run at
most `lines = 2 + isqrt(research staff / 50,000)` investigations at once, at most 24
(research staff = staffed research posts, doc 36). Four times the researchers give twice
the lines; a large educated civilization researches more in parallel, but not everything
at once. Work done per investigation per month stays bounded by `work / min_months`.

**Interaction with population and education** (unchanged mechanisms, restated because
they set the pace): evidence grows with `isqrt(10 × practitioners)` per tag and the channel
factor (writing, archives, printing, the scientific method, research commons, networks;
times literacy); research capacity is staffed posts × research effectiveness. Bigger and
better-educated seats are faster, with square-root returns on evidence and line count and
linear returns on work, which the late multipliers absorb.

### 1.7 The jump chain stays reachable

T160-T167 and their prerequisites are unchanged; their tier work and thresholds are
unchanged by this chapter (calibration may lower them, section 8.5). The leader's T167
window of doc 36 §7 (by 2260 in ≥ 75% of matches) is a slice-6b acceptance target with the
smart AI (section 3); the critical-path tool (3.5) reports the slack.

---

## 2. Practices ("习俗制度") expansion

### 2.1 Size and shape

| Era | Existing (incl. C065-C067) | Added | Total | of which victory-critical |
| --- | ---: | ---: | ---: | ---: |
| 0 Ancient | 15 | 6 | 21 | 13 |
| 1 Classical | 8 | 12 | 20 | 5 |
| 2 Medieval | 5 | 13 | 18 | 2 |
| 3 Early Modern | 4 | 13 | 17 | 2 |
| 4 Industrial | 6 | 14 | 20 | 3 |
| 5 Modern | 8 | 14 | 22 | 3 |
| 6 Information | 8 | 14 | 22 | 2 |
| 7 Space | 6 | 11 | 17 | 3 |
| 8 AI | 7 | 10 | 17 | 2 |
| **Total** | **67** | **107** | **174** | **35** |

New practices by category: economy 15, governance 11, law 9, science 8, welfare 8,
tradition 7, military 6, labour 6, environment 5, diplomacy 4, administration 4,
religion-adjacent secular institutions 4, off-world 4, family 3, education 3, safety 3,
revenue 2, media 2, security 2, culture 1. Prerequisites are real institutions (a central
bank needs joint-stock companies and specialized administration; civil examinations need
prefectures; a launch range needs a space agency and hazardous-engineering review), and
material preconditions (`draft.hard`, the `practice_hard` grammar: technologies,
facilities, `POP>=`, `Q:qualification>=`, `REG>=`, `CONTACT`, `REL`, new `TRAD:<path>`)
keep them tied to what exists. The full list is in 6.4.

### 2.2 Exclusive groups and tensions

A seat holds at most one member of an exclusive group as established or in reform.
Reforming a member while another is held first runs a **repeal** of the held one
(`repeal { practice }`: 24 months, stability −2 while it runs, adoption falls to 0 at the
end; the practice returns to recognized). The engine refuses a reform that would hold two.

| Group | Members (hold one at a time) |
| --- | --- |
| X01 Early authority | C068 Councils of elders; C069 Hereditary chieftaincy |
| X02 Classical polity | C075 Citizen assemblies; C076 Divine kingship and temple economy |
| X03 Revenue collection | C078 Tax farming; C079 Salaried revenue officials |
| X04 Land and service | C086 Feudal vassalage; C087 Prefectures and appointed magistrates |
| X05 Sovereignty | C101 Absolute monarchy and court bureaucracy; C102 Parliamentary sovereignty |
| X06 Faith and state | C103 Edicts of toleration; C104 State church and confessional unity |
| X07 Trade doctrine | C107 Mercantilist trade policy; C112 Free-trade doctrine |
| X08 Army recruitment | C114 Mass conscription; C115 Volunteer professional army |
| X09 Economic coordination | C127 Central planning commissions; C128 Market regulation and competition law |
| X10 Broadcast media | C131 Public broadcasting charter; C132 Commercial broadcasting |
| X11 Data and the state | C139 Data privacy rights; C140 Mass surveillance programmes |
| X12 Off-world claims | C149 Space commons treaty; C150 Off-world homestead claims |
| X13 Settler recruitment | C156 Indentured passage; C157 Subsidized free passage |
| X14 Automation dividend | C160 Universal basic income; C161 Public job guarantee |
| X15 Central authority | C041 Hierarchical appointment and inspection; C042 Multilevel autonomy and federal contracts |
| X16 Highest administration | C051 Reserved human powers and technical restraint; C053 AI-led highest administration |
| X17 World order | C061 Constitutional global community; C062 Negotiated standing global institutions; C063 Globally unified command governance |

Each side of every group leaves a route to C064 (tested in the generator): choosing
federal contracts (C042) closes unified command (C063) but leaves the constitutional (C061)
and negotiated (C062) world orders; choosing AI-led administration (C053) closes reserved
human powers (C051) and the AI-age practices that need it.

**Tension pairs** (both may be held; while both are established: stability −2 and both
adopt at half speed): feudal vassalage and civil examinations; manorial tenancy and
abolition of servile labour; a written constitution and political police; universal
suffrage and corporate citizenship; tripartite bargaining and competition law; and the
existing cancellation of craft guilds by industrial employment.

### 2.3 Costs rise late

Practices are costed by **era** (`draft.era`; the existing 67 get eras in the draft's
`era_of_existing`) instead of catalogue group:

| Era | Evidence to recognize | Reform work (k worker-months) | Media (k lots) | Minimum months | Institutional load |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0 Ancient | 1,200 | 10 | 0 | 24 | 0 |
| 1 Classical | 4,000 | 40 | 3 | 60 | 0 |
| 2 Medieval | 10,000 | 90 | 8 | 60 | 0 |
| 3 Early Modern | 24,000 | 160 | 15 | 72 | 1 |
| 4 Industrial | 50,000 | 300 | 30 | 84 | 1 |
| 5 Modern | 100,000 | 550 | 55 | 96 | 2 |
| 6 Information | 180,000 | 900 | 90 | 108 | 2 |
| 7 Space | 300,000 | 1,400 | 140 | 120 | 3 |
| 8 AI | 450,000 | 2,000 | 200 | 120 | 3 |

(provisional) Recognition gain is unchanged (`isqrt(pop/1000) × 7 + record/3 + 40`, plus
contact): a 100-million state recognizes an AI-era practice about 11 years after its
prerequisites, an Information-era one in about 5. Adoption speed after the reform falls
with era: `rate × 10,000 / (10,000 + 1,500 × era)`. **The 35 victory-critical practices keep
their present costs** (capped at the old group-3 values: 12,000 evidence, 260 k work), so
institutions are never the long pole of the critical path.

**Institutional load and capacity.** Each established practice adds its era's load.
Capacity = `20 + 3 × levels of administrative offices (at most 30 levels counted) + 10 for
each of C026, C036, C041 or C042, C050 and the statistical bureaus (C119)`. Load above
capacity: stability −1 per 4 points over and reform work ×1.5. Load and capacity appear as
a meter in the practice view. **Reform slots**: at most `1 + [C026] + [C036] + [C050]`
reforms at once (1-4).

**Tradition institutions** (C168-C174) are recognizable only while the seat holds the
tradition or held it within the last 100 years, and lapse to recognized 100 years after the
tradition is dropped.

### 2.4 Targets

| Metric | Target |
| --- | --- |
| Leading seat, practices established at AD 2300 | 50-65% of 174 (87-113) |
| Median seat | 35-50% |
| Any seat ever above 75% | never in 64 matches (exclusives cap the attainable share near 86%) |
| Every exclusive group: each side chosen by ≥ 15% of the seats that hold either | yes |
| AI-era practices: median seat adopts its first after AD 2150 | yes |

---

## 3. The native AI chooses smartly

### 3.1 What it may use

Only its own observation (discovered cards, its works, goods, people, met seats' public
era and traditions, its own families' shares shown on cards) and **static public content
compiled into the AI at build time**: a per-node table of victory-critical membership,
depth to T167 and to each base-check requirement, family membership and refuting nodes,
tradition branch membership, and the building tree (already public, doc 37 §8.9). The
static content is the same for every match and every seat and is published in this
repository (chapter 31 §8: runtime isolation protects match state, not the published
design); the AI scores only nodes **present in its observation**, so it never learns of an
undiscovered node or another seat's state. The sealed nodes and the objective remain
unseen until `victory_revealed` (the AI's critical weights for T162-T167 apply only once
those cards are discovered, which is when the objective is revealed for it).

### 3.2 Research choice: expected value per unit of research

For each investigable card `n`:

    score(n) = ( V_goal + V_econ + V_unlock + V_trad + V_def − L_lock ) × P_ok / C(n)

- `V_goal = w_goal × crit(n) × (1 + lag)`: `crit` is 1 for critical nodes (and 0.5 for nodes
  that are OR-alternatives inside the critical closure), `lag` is how far the seat's era
  progress trails doc 37 table 0.1's window (0 on time, up to 1 when a full window late).
  `w_goal`: Hard 6, Medium 3, Easy 1.
- `V_econ`: from the public building tree, the value of the stages and methods the node
  unlocks in the seat's own regions: 20-year labour and input savings over the 60% upgrade
  bill (doc 37 slice-7 rule), or the shortfall it relieves (goods the seat is short of for 12
  months), in credit.
- `V_unlock`: known requirements waiting on the node (today's `needed` set), ×3 as now.
- `V_trad`: branch and entry nodes of the held tradition ×2; family members matching the
  seat's incumbent ×1.5; members matching a met trading partner's incumbent +0.25.
- `V_def`: military generation nodes when a met rival's best generation exceeds the seat's.
- `L_lock`: the expected loss of adopting a family member: for each rival member `r` the
  seat values, `value(r) × (1 − lock_e(r after)) × P(r wanted within 100 years)`. A member
  whose rival is critical is never adopted before the rival is understood
  (**self-block rule**).
- `P_ok`: 1 unless the investigation needs a facility the seat lacks (then the probability
  the facility is built within 120 months by its own build queue).
- `C(n)`: remaining work × `lock_w` / research capacity of the node's class, plus the
  minimum months as a floor.

**Budget split by difficulty** (share of research capacity; the remainder is free):
Hard: critical ≥ 60% whenever a critical card is investigable, economy 25%, breadth 15%;
Medium: 40/40/20; Easy: today's cheapest-first rule (naive baseline). The long-round
`ResearchAgenda` directive is ordered by score instead of remaining work. Lead studies and
exploratory studies target domains of critical leads first. Revisit studies are started
when a locked rival's `V_goal + V_econ` exceeds twice the study cost.

### 3.3 Practice choice

    score(p) = ( effect value + route value − tension cost ) / ( work + 400 × load(p) )

`route value` is high for practices on the seat's chosen route to C064: by build 1900 the
AI picks one world order from its situation (C063 if it governs ≥ 60% of regions it has
met or wages wars of conquest, C061 if it holds C042 and ≥ 6 regions with stability ≥ 60,
else C062) and never reforms a member of an exclusive group that closes that route. Load
is kept ≤ capacity − 4; a practice whose effect value is below its load cost is repealed
when load exceeds capacity. Exclusive choices follow endowment and strategy weights
(conscription for a seat whose power ratio to a met rival is below 1.5, central planning
for a seat with a planning charter, privacy for Open Networks, and so on).

### 3.4 Tradition and family fit

Tradition choice stays doc 37 §4.3; the family choices it implies are made deliberately:
Dieselpunk holders prefer kerosene engines and open-hearth steel, Electropunk holders AC
and electric-arc nitrogen, Atompunk holders the heavy-water line when uranium is scarce or
the breeder when it is plentiful, Biopunk holders nitrogen-fixing cereals, Network holders
statistical learning over expert systems.

### 3.5 Tests that show it beats naive choice

| Test | Pass condition |
| --- | --- |
| `ai_paired_choice` (32 paired seeds; seat 0 Hard smart vs Hard naive, same opponents and draws) | smart T167 earlier by ≥ 20 years at the median; win rate +10 points or more; understood share at 2300 not lower |
| `ai_no_self_block` (64 seeds) | < 5% of AI seats adopt a family member that later delays a critical node by more than 10 years |
| `ai_route_kept` (64 seeds) | no AI seat closes its last route to C064 |
| Fixture `family_choice` (scripted observation: T116 visible and planned, expert systems cheaper) | Hard does not adopt expert systems before T116 |
| Fixture `exclusive_route` (AI on the C061 route) | never reforms C041 |
| Fixture `branch_priority` (Steampunk holder with coal) | starts the steam-hammer branch before generic tier-5 side nodes of equal cost |
| Fixture `critical_first` | with a critical card investigable and capacity for one line, Hard starts the critical card |
| Determinism | identical actions from identical observations; no hash-ordered iteration |

---

## 4. Boost (运载力)

### 4.1 What it is

**Boost** is a national stock: tonnes that the seat's launch system can put into low
Earth orbit, already paid for in vehicles, propellant and pad time. `Civ.boost: i64`
(tonnes), `Civ.boost_cap: i64`. It replaces doc 37's *lift* service (a monthly,
non-storable flow) everywhere: `lift_orders` become `launch_orders`, the `Lift` setting
becomes `Launch`, and the ledger line "lift used ≤ made" becomes the boost identity of
4.7. Everything beyond Earth orbit (zone stores, transfers, propulsion families, ratios,
windows, propellant, depots, mass drivers) is doc 37 §6.5 and §7 unchanged. Boost covers
only the climb from the Earth's surface; off-world ascent is in doc 37's ratio tables and
mass drivers.

**Decision: boost does not decay.** The cap bounds hoarding and makes a big push a
planning problem; at the cap, launch facilities **stand down**: they make no boost and draw
no inputs (posts stay filled). This conserves goods and needs no waste ledger.

### 4.2 Making boost

The launch chain of doc 37 §7.2 makes boost instead of lift (provisional figures; at most
4 launch levels per region; +10% within 15° of the equator):

| Stage | Requires | Boost per level-month | Cap per level | Inputs per level-month | Electric | Failure rate (per 1,000 t spent) | Vehicle unit |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: |
| Rocket proving ground | T140 | 50 t | 150 t | fuel 2, components 0.5, electronics 0.1 | 40 | 10% | 5 t |
| Launch complex | T140 & T141 & C045 | 800 t | 2,400 t | doc 37 (fuel 30, components 6, electronics 3, aluminium 2, superalloy 0.3, batteries 5 lots) | 400 | 2.0% | 60 t |
| Spaceport (reusable) | T154 | 1,200 t | 4,800 t | doc 37 (fuel 36, components 1.2, electronics 0.5, aluminium 0.4, spares 1) | 400 | 1.0% | 100 t |
| Heavy-booster yard (Dieselpunk) | T178 | 1,600 t | 6,400 t (+25% with T284) | fuel 50, metal 2, components 1.5 (−20% with T284), electronics 0.2 | 300 | 1.5% | 150 t |
| Launch-assist track (Electropunk) | T156 | 1,200 t (+30% with T292) | 4,800 t | fuel 24, components 1.2, electronics 0.5 | 700 | 0.8% | 60 t |
| Skyhook (station module, LEO) | T257 | +25% of up to 4 launch levels | +1,000 t | spares 0.3 | 100 (station) | - | - |
| Space elevator (one per seat, ≤ 3 levels, region within 10° of the equator) | T259 | 8,000 t | 16,000 t | spares 1, electricity below | 4,000 | 0.05% | 20 t |
| Vehicle integration halls (≤ 4 levels per seat) | T142 | - | +3,000 t | spares 0.05 | 20 | - | - |

Rocket propellant family (F13) sets the fuel line of the chemical stages: kerosene engines
as listed; hydrogen engines replace fuel by propellant ×0.85 (propellant plants on the
Earth: doc 37); methane engines take fuel ×0.90 and spaceport spares −30%. Network holders'
spaceports use half the components (doc 37). Crewed launches need T144 understood and a
launch complex or later. Electric figures are units of 100 MWh (the elevator's 4,000 units
a level-month covers 8 kt of climber lift at about 17 MWh a tonne with losses).

**Reliability learning**: a stage's failure rate × `max(5,000, 10,000 − 40 × months the seat
has operated that stage) / 10,000` (halves after about ten years); the civil space agency
(C144) −20%, the launch range authority (C151) −25%, debris (4.5) adds.

### 4.3 Spending boost

| Use | Boost |
| --- | --- |
| Goods to the Earth-orbit store | 1 per tonne (lots by the units table; food 0.05 t a ration) |
| People to orbit (crews, settlers, soldiers as passengers) | 3 t per person; 2 t with crew-rated capsules (T252); settlers −0.5 t under subsidized free passage (C157) |
| A station module or core placed in low Earth orbit, built from Earth goods | its mass (5.3) |
| Higher Earth orbits (GEO, Earth-Moon L5, Sun-Earth L2) | the mass in boost, plus propellant from the Earth-orbit store: ×(factor − 1) with chemical stages (GEO 1.6, L5 1.5, SEL2 1.4) or electric tugs (×0.3) |
| Off-world sites and other orbits | doc 37 transfers from the Earth-orbit store (propellant and berths); boost only for what is lifted from the Earth |

Standing orders (doc 37 `Supply`, `Export`, settlers) draw boost automatically, cheapest
route first; a shortfall is reported by reason ("Boost short: 1.2 of 3.4 kt; launch sites
at cap in 4 months").

### 4.4 Failures and accidents

Each month in which a seat spent boost, one addressed draw `("launch", seat, month)` in
[0, 10,000): failure if below `p = min(5,000, rate × spent / 1,000)`, with `rate` the
failure rate of the stage that made most of the seat's boost in the last 12 months. On a
failure: payload lost = min(spent that month, the stage's vehicle unit), taken from
passengers in proportion to their share of the month's payload (people die: population
ledger "died in launch"); the stage makes no boost the next month (two for a spaceport or
elevator); a crewed loss costs stability −1 (−2 above 100 deaths) and a chronicle moment.
Expected loss is small (a 3,200 t month from launch complexes: 6% chance of losing 60 t);
the drama is in the rare event.

### 4.5 Debris

Each orbit holds a debris index (0-10,000). A launch failure adds 100 in low Earth orbit;
a destroyed module adds 500 in its orbit; a scuttled station 2,000. Natural decay 2% a
month in low Earth orbit, 0.2% elsewhere. Every 1,000 points add 50 bp to the launch
failure rate of every seat (LEO) and a 1% monthly chance per station of losing a module
(any orbit). Orbital traffic management (C153) halves what the seat's own events add.
Debris is the third item on the cut list.

### 4.6 Costs to the victory programme

Doc 35 check 13 becomes: *a launch-chain stage at the launch-complex stage or later that
made boost in each of the last 12 months or stood down at its cap, and a station in Earth
orbit with a shipyard module operating* (own, or a partner's under a joint programme). The
doc-35 orbital station becomes a frame core (K2) and the orbital construction yard a
shipyard module (section 5); their doc-35 posts and operating inputs stay as they are and
are drawn from the national pool through the station's ground segment (the launch region).
Only the aboard crew's consumables travel by boost. One-time boost: K2 core 2,000 t +
habitat and life support 500 t + shipyard 6,000 t ≈ 8,500 t (about 11 months of one launch
complex level, or 3 months of four); running boost about 150 t a month for the core's
aboard crew and 300 t for the yard's. This adds at most about one year to the critical path
of a seat that builds its launch complex late, and nothing to one that builds on time.

### 4.7 Ledger, protocol and interface

Ledger: `boost made = boost spent + Δ stock`, per seat and month; `spent = launched to the
Earth-orbit store + placed as modules + lost in failures`; standing down creates and
destroys nothing; goods drawn only for boost made (`conservation-audit.md` addition).
Observation: `CivView.boost { stock, cap, made_last, spent_last, by_stage: Vec<(stage,
levels, made, standing_down)>, failure_rate_bp, launches: Vec<LaunchView> }`. Actions and
settings: `Launch { good | people, per_month, to: EarthOrbit | Station(id) }` (replacing
`Lift`), `start_project { kind: launch { manifest, month } }` for a one-off campaign.
Interface: section 7.

---

## 5. Space stations vs surface bases

### 5.1 The difference

| | Station | Surface base (doc 37 site) |
| --- | --- | --- |
| What it is | an orbital object owned by a seat: a core with module slots, in one of ten orbits | a region (`RegionKind::Offworld`) with land, deposits and population blocks |
| People | crews only: posts filled from the national qualified population, of whom 10% are aboard and need life support; no births; crews rotate (aboard people count in the seat's population ledger as "aboard stations") | residents who are born, age and die there; daughter cultures; autonomy |
| Built from | modules launched with boost, transferred, or fabricated in orbit from zone-store materials | works whose bills come from the zone store |
| Gives | shipyards, depots and refuelling, research and observation, power beaming, defence and interdiction, boost (skyhook), staging for the outer system | mining, volatiles and propellant, habitat and food, research stations, culture, mass drivers |
| Contest | boarding, interdiction siege, destruction (debris) | doc 37 occupation, interdiction and siege |
| Counts for G96 | no (no inhabited region) unless a habitat ring attaches it to a site | yes when inhabited |

### 5.2 Orbits

| Orbit | Zone (doc 37 store) | Placement from LEO | Speciality |
| --- | --- | --- | --- |
| Low Earth orbit (LEO) | Earth orbit | - | cheapest; shipyard and assembly; skyhook; debris |
| Geostationary orbit (GEO) | Earth orbit | factor 1.6 | solar power satellites; relays |
| Earth-Moon L1 | Moon | Moon transfer without the landing leg | the cislunar gateway: a depot here refuels every Moon and outer-system transfer |
| Earth-Moon L5 | Earth orbit | factor 1.5 | rotating rings (attach to the seat's Moon site) |
| Sun-Earth L2 | Earth orbit | factor 1.4 | observatory evidence ×3 (like Daedalus) |
| Low lunar orbit | Moon | Moon transfer without the landing leg | staging for lunar sites |
| Mars orbit (with Phobos) | Mars | Mars transfer, aerocapture | Martian gateway and depot |
| Ceres orbit | Main Belt | Ceres transfer without landing | Belt depot and yard |
| Callisto orbit | Jupiter | Callisto transfer without landing | Jovian staging outside the radiation belts |
| Titan orbit | Saturn | Titan transfer without landing | fuel depot of the outer system |

A seat may hold one station per orbit (it grows by modules). Placement to non-LEO orbits
uses doc 37's ratio tables with the landing leg removed, precomputed offline by
`tools/space/ratios.py`.

### 5.3 Cores and modules

Core line (upgrade in place like a doc 37 building line, 60% of the next core's mass and
bill; the station keeps working except the converting slot):

| Core | Requires | Mass | Module slots | Posts (aboard 10%) | Power | Aboard capacity |
| --- | --- | ---: | ---: | --- | ---: | ---: |
| K1 Truss core | T142 & T144 | 400 t | 4 | 4,000 (orbital crew 2,000, technicians 2,000) | −20 | 400 |
| K2 Frame core (the doc-35 orbital station) | T142 & T144 & T145 | 2,000 t | 8 | doc 35: 16,000 orbital crew, 6,000 scientists | −200 | 2,200 |
| K3 Orbital complex | T153 | 8,000 t | 14 | 40,000 | −400 | 4,000 |
| K4 Orbital city spine | T177 | 30,000 t (fabricated in orbit) | 20 | 60,000 | −800 | 6,000 + ring residents |

Modules (provisional; mass is boost when launched from the Earth; "bill" from the
national pool for launched modules or the zone store for fabricated ones, sized as doc 37
appendix B equivalents):

| Module | Requires | Mass | Posts | Power | Upkeep (zone store, per month) | Gives |
| --- | --- | ---: | --- | ---: | --- | --- |
| Habitat | T144 | 300 t | 500 | −10 | - | +1,000 aboard capacity |
| Life support | T144 (T135, T179 better) | 200 t | 200 technicians | −30 | spares 1 lot | 90% recovery (98%, 99%) for 20,000 aboard: consumables 0.065 t per aboard person-month at 90% |
| Solar array | T106 & T143 | 150 t | 50 | +100 × solar factor | spares 0.2 lots | power |
| Reactor | T147 (T295: −40% mass) | 600 t | 1,000 | +400 | nuclear fuel 0.6 lots | power anywhere |
| Fusion plant | T149 | 1,500 t | 2,000 | +2,000 | helium-3 9 lots or nuclear fuel 5 lots | power for yards and bays |
| Docking and depot | T142 (T176) | 500 t | 1,500 | −20 | - | a transfer berth (doc 37 methods) and 5 kt propellant storage (50 kt with T176); transfers may **refuel here**: a route through the station counts as a departure from its zone (doc 37: −3.0 km/s on the next leg) |
| Shipyard (the doc-35 orbital yard) | T145 & C058 | 6,000 t | doc 35 yard | −600 | doc-35 yard inputs from the national pool | orbital construction; check 13; builds modules, transfer berths and pulse ships from zone-store or delivered goods |
| Fabrication | T145 & T172 | 2,000 t | 3,000 | −300 | - | turns zone-store metal, materials and components into module bills without boost (mass-balanced) |
| Research laboratory | T143 | 300 t | 1,000 scientists + 500 technicians | −40 | instruments 0.02 lots | Frontier research (posts × RE); evidence ×1.5 for T131-T137, T143, T171, T262, T263 |
| Observatory | T151 | 400 t | 500 scientists | −20 | - | evidence ×2 for T151, T160, T161 (×3 at Sun-Earth L2); outer bodies visible without T041 delay |
| Propellant refinery | T159 | 400 t | 300 | −100 | 1.2 volatiles → 1 propellant | propellant in the zone |
| Defence | T145 & T114 | 800 t | 1,000 | −50 | spares 0.2 lots | interdiction 10% (≤ 50% per zone, doc 37); defence 10,000 G6-equivalent |
| Relay and tracking | T175 or T246 | 100 t | 100 | −10 | - | sites in the zone −1 administrative load; foreign stations in the zone visible |
| Command | T152 | 200 t | 500 | −20 | - | required for more than 8 modules; station autonomy and stability |
| Microgravity works | T143 & T106 | 400 t | 500 | −80 | - | substrate and medicine methods at −15% inputs per output (mass-balanced) |
| Broadcast cupola | T246 | 100 t | 100 | −5 | - | stability +1 nationally (once per seat) |
| Skyhook | T257, LEO only | 3,000 t | 500 | −100 | spares 0.3 | boost (4.2) |
| Solar power satellite | T150, GEO only | 5,000 t | 500 | +5,000 at the receiver | spares 0.5 | 3,000 units a month delivered to one Earth region with a receiver |
| Rotating habitat ring | T177 | fabricated in orbit (doc 37 bill) | 3,000 | residents' | spares 1 | houses 200,000 at full gravity; attaches the station to the seat's site in the zone (Earth-Moon L5 to its Moon site) |
| Orbital assembly bay | T166 & C056 & a shipyard module, LEO only | 10,000 t | doc 35 jump assembly line | −4,000 | doc-35 line inputs from the national pool | counts as one of the two jump assembly lines (checks 2-3); assemblies made in orbit shorten replacement and relief by 25%; needs fusion power |

Aboard consumables for every station come from its zone store (food 0.05 t a ration,
volatiles per doc 37 §6.4 at the life-support recovery rate, spares); in Earth orbit the
store is filled by boost, elsewhere by transfers or local refineries. A station without
enough power runs its modules at the power share (doc 36 strict rationing); without enough
consumables its aboard crew is unserved (mortality ×3, doc 37) and the station's modules
run at half rate.

### 5.4 Surface bases

Bases keep doc 37 §6 and appendix B unchanged (outpost, habitats, life support, habitat
farm, ice works, propellant plant, regolith works, hydrocarbon works, mining station, solar
furnace smelter, helium-3 extractor, solar array field, off-world fission plant, landing pad
and depot, mass driver, research station, transfer berth, mission control, beam station,
seed factory, orbital defence platform). Three are added: **archive vault** (T113 & T144;
materials 2, electronics 0.1; while operating, fragile knowledge is never lost and C060's
records survive the loss of every home region), **garrison dome** (T170; houses 10,000
soldiers at the site with their life support), **surface telescope** (T151; at Daedalus it
replaces the research station's observatory function and adds evidence ×2 for T267 once
revealed). Station modules and base works never share a list: a site's works are regional
facilities, a station's modules are station slots.

### 5.5 Contest and capture

- **Visibility**: stations in Earth orbit are visible to every met seat that understands
  T141; elsewhere after a survey of that body or with a relay module in the zone. Module
  lists are visible to seats with a station, defence or relay module in the same zone.
- **Attack**: a seat at war with the owner attacks with defence modules in the same zone,
  G7 formations (doc 37 §2.1) or boarding parties (G5+ soldiers delivered to the zone as
  passengers). Monthly battle under the ordinary rules with defence = Σ defence modules ×
  10,000 G6-equivalent (×1.5 under the space guard, C158) + aboard militia; terrain factor
  20,000 for boarding (defenders favoured).
- **Damage**: each battle month destroys one module of the losing side in that zone
  (addressed draw), adding debris.
- **Capture**: boarders who hold a station with no defending strength for 3 months (6 under
  the space commons treaty, C149) take it with its modules; aboard crew become the captor's
  population (nobody vanishes).
- **Siege**: interdiction that keeps a station's life-support access below 50% for 3
  months makes it surrender.
- **Scuttle**: the owner may deorbit a station in one month (its mass is lost, debris
  +2,000; aboard crew are evacuated if a docking module and boost or transfer capacity
  allow, otherwise they die).
- Colonies follow the metropole (doc 37 §6.6): stations do too.

### 5.6 How stations feed the jump programme

The Earth-orbit station with a K2 core and a shipyard is check 13; observatories speed
T151, T160 and T161 (critical) by evidence; research laboratories count toward check 9's
frontier research; fusion modules and helium-3 depots lower the power and fuel burden; an
orbital assembly bay can stand in for one Earth assembly line. None of these is required
beyond check 13: the jump works, test nodes and lattice stay on the Earth (doc 37 §7.5).

---

## 6. Content plan

All new technologies and practices are hidden until discovered or recognized like every
node. **Every new node needs an encyclopedia passage** (`content/lore/*.json`, English 60-120
words and Simplified Chinese 100-260 Han characters, a quotation with source, in the style
of the existing passages); `draft.lore = "needed"` marks them (143 technologies, 107
practices). The drafts also carry `name_zh` for the i18n data files.

### 6.1 Renames and relinks

| Change | Detail |
| --- | --- |
| Rename T048 | "Scaled printing and inexpensive records" → "Movable type and scaled printing" (family F04; prerequisites unchanged) |
| Era fix T038 | Early Modern → Modern (doc 37 §8.3 assigned it by id range) |
| Relink T063 | `T042 & T061 & T050` → `T042 & (T061 \| T213) & T050`: atmospheric engines drain deep workings (OR only; T063 is not critical) |
| Doc 37 renames | T140 and T142 as doc 37 §7.1 |
| Exclusive works (doc 37 §4.1) | requirements move to branch nodes: 16 entries in the draft (`exclusive_requirement_changes_doc37`) |
| Lore re-check | passages that mention concepts of new non-ancestor nodes must be checked by `lore-check.mjs` once the new nodes' telltale words are added: T016 and T054 (compass), T041, T141, T151 (telescope), T048 (movable type), T053 (microscope), T070 (variolation), T080 (an atmospheric engine's inventor), T148 (tokamak). Choose the new nodes' telltales so these stay legal, or revise the passages |

### 6.2 New technologies (normal development)

| ID | Name | 中文 | Era | Tier | Prerequisites | Tags | Kind | Family | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T183 | Fermentation and brewing | 发酵与酿造 | Ancient | 0 | T007 & T008 | farm, craft | side |  | work ×1.00 |
| T184 | Herbal pharmacopoeia | 草药方剂 | Ancient | 0 | T003 & T007 | health, forage | side |  | work ×1.00 |
| T185 | Lime burning and plaster | 烧石灰与灰泥 | Ancient | 0 | T002 & T014 | build, craft | side |  | work ×1.00 |
| T186 | Salt making | 制盐 | Ancient | 0 | T007 & T002 | craft, trade | side |  | work ×1.00 |
| T187 | Long-distance exchange and tokens | 远程交换与信物 | Ancient | 0 | T009 & T001 | trade | side |  | work ×1.00 |
| T188 | Logographic script and scribal canon | 表意文字与书吏经典 | Classical | 1 | T025 | record, teach | alt | F01 | work ×1.00 |
| T189 | Phonetic alphabet | 表音字母 | Classical | 1 | T025 & T187 | record, trade | alt | F01 | work ×1.00 |
| T190 | Coinage and assay | 铸币与验成色 | Classical | 1 | T022 & T026 | trade, metal | side |  | work ×1.00 |
| T191 | Crucible steel and pattern welding | 坩埚钢与花纹焊 | Classical | 1 | T023 & T031 | metal, war | dead |  | fragile; work ×1.00 |
| T192 | Hydraulic concrete | 水硬性混凝土 | Classical | 1 | T024 & T185 | build, water | side |  | fragile; work ×1.00 |
| T193 | Geared astronomical calculators | 齿轮天文计算器 | Classical | 1 | T022 & T010 & T026 | measure, science | dead |  | fragile; work ×1.00 |
| T194 | Siege engineering and fortification | 攻城与筑城工程 | Classical | 1 | T024 & T035 | war, build | side |  | work ×1.00 |
| T195 | Terraced and paddy cultivation | 梯田与水田 | Classical | 1 | T011 & T005 | farm, water | alt | F02 | work ×1.00 |
| T196 | Crop rotation and manuring | 轮作与施肥 | Classical | 1 | T020 & T006 | farm | alt | F02 | work ×1.00 |
| T197 | Humoral medicine and medical schools | 体液医学与医学院 | Classical | 1 | T032 & T025 | health, teach | alt | F03 | work ×1.00 |
| T198 | Positional numerals and algorism | 位值记数与算法术 | Medieval | 2 | T026 & T025 | record, measure | side |  | work ×1.10 |
| T199 | Heavy plough and horse collar | 重犁与挽具 | Medieval | 1 | T020 & T023 | farm | side |  | work ×1.10 |
| T200 | Woodblock printing | 雕版印刷 | Medieval | 1 | T030 & T012 | record, craft | alt | F04 | work ×1.10 |
| T201 | Paper money and bills of exchange | 纸币与汇票 | Medieval | 1 | T030 & T190 | trade, record | side |  | work ×1.10 |
| T202 | Magnetic needle navigation | 磁针导航 | Medieval | 1 | T014 & T028 | sea, measure | side |  | work ×1.10 |
| T203 | Blast furnace and cast iron | 高炉与铸铁 | Medieval | 1 | T023 & T029 | metal | side |  | work ×1.10 |
| T204 | Distillation | 蒸馏 | Medieval | 1 | T031 & T183 | chem, craft | side |  | work ×1.10 |
| T205 | Cam-driven automata | 凸轮自动机 | Medieval | 1 | T034 & T035 | machine, craft | dead |  | work ×1.10 |
| T206 | Naphtha incendiaries | 石油火攻剂 | Medieval | 1 | T014 & T013 & T204 | war, chem | dead |  | fragile; work ×1.10 |
| T207 | Black-powder rockets | 火药火箭 | Medieval | 2 | T036 & T035 | war, chem | side |  | work ×1.10 |
| T208 | Double-entry bookkeeping | 复式记账 | Early Modern | 2 | T026 & T198 | record, trade | side |  | work ×1.20 |
| T209 | Bastion fortification | 棱堡筑城 | Early Modern | 2 | T037 & T024 | war, build | side |  | work ×1.20 |
| T210 | Telescopic astronomy | 望远镜天文学 | Early Modern | 2 | T041 & T047 | science, measure | side |  | work ×1.20 |
| T211 | Pendulum clocks and marine chronometers | 摆钟与航海天文钟 | Early Modern | 2 | T034 & T044 | measure, sea | side |  | work ×1.20 |
| T212 | Microscopic observation | 显微观察 | Early Modern | 2 | T041 & T046 | science, health | side |  | work ×1.20 |
| T213 | Atmospheric pumping engines | 大气压抽水机 | Early Modern | 2 | T042 & T023 | steam, mine | alt |  | work ×1.20 |
| T214 | Variolation | 人痘接种 | Early Modern | 2 | T046 & T032 | health | side |  | work ×1.20 |
| T215 | Electrostatic machines and charge storage | 静电机与储电瓶 | Early Modern | 2 | T031 & T040 | electric, science | side |  | work ×1.20 |
| T216 | Lighter-than-air balloons | 热气球与氢气球 | Early Modern | 2 | T042 & T004 & T043 | science, craft | side |  | work ×1.20 |
| T217 | Coal gas and gas lighting | 煤气与煤气照明 | Industrial | 4 | T064 & T052 | chem, steam | side |  | work ×1.25 |
| T218 | Optical semaphore networks | 光学信号塔网络 | Industrial | 4 | T041 & T027 & T016 | record, measure | alt | F05 | work ×1.25 |
| T219 | Electric telegraphy | 有线电报 | Industrial | 4 | T054 & T048 | electric, record | alt | F05 | work ×1.25 |
| T220 | Iron-hulled steamships | 铁壳蒸汽船 | Industrial | 5 | T080 & T060 & T028 | sea, steam | side |  | work ×1.25 |
| T221 | Anaesthesia and antisepsis | 麻醉与消毒 | Industrial | 4 | T053 & T043 | health, chem | side |  | work ×1.25 |
| T222 | Pneumatic converter steel | 转炉炼钢 | Industrial | 5 | T060 & T042 | metal | alt | F06 | work ×1.25 |
| T223 | Regenerative open-hearth steel | 平炉炼钢 | Industrial | 5 | T060 & T085 | metal, steam | alt | F06 | work ×1.25 |
| T224 | Portland cement and reinforced concrete | 波特兰水泥与钢筋混凝土 | Industrial | 4 | T064 & T050 & T024 | build, chem | side |  | work ×1.25 |
| T225 | Vapour-compression refrigeration | 蒸气压缩制冷 | Industrial | 5 | T052 & T067 | machine, steam | side |  | work ×1.25 |
| T226 | Mined nitrates and guano | 矿物硝石与鸟粪 | Industrial | 4 | T056 & T064 & T028 | farm, chem, mine | alt | F07 | work ×1.25 |
| T227 | Direct-current local networks | 直流区域电网 | Modern | 5 | T100 & T103 | electric | alt | F08 | work ×1.25 |
| T228 | Polyphase alternating-current transmission | 多相交流输电 | Modern | 5 | T100 & T055 | electric | alt | F08 | work ×1.25 |
| T229 | Radio broadcasting | 无线电广播 | Modern | 6 | T104 & T048 | electric, record | side |  | work ×1.25 |
| T230 | Rigid airships | 硬式飞艇 | Modern | 5 | T216 & T091 & T050 | fuel, build | alt | F09 | work ×1.25 |
| T231 | Antibiotics | 抗生素 | Modern | 6 | T070 & T053 | health, bio | side |  | work ×1.25 |
| T232 | Radar and radio location | 雷达与无线电定位 | Modern | 6 | T104 & T055 | electric, war | side |  | work ×1.25 |
| T233 | Jet propulsion | 喷气推进 | Modern | 6 | T038 & T083 | fuel, machine | side |  | work ×1.25 |
| T234 | Analog computers and fire control | 模拟计算机与火控 | Modern | 5 | T044 & T104 & T051 | compute, war | dead | F10 | work ×1.25 |
| T235 | Large hydroelectric dams | 大型水电站 | Modern | 5 | T100 & T024 & T050 | electric, water, build | side |  | work ×1.25 |
| T236 | Liquid-fuel rocket experiments | 液体火箭试验 | Modern | 6 | T090 & T042 & T052 | space, fuel | side |  | work ×1.25 |
| T237 | Containerized shipping | 集装箱航运 | Information | 6 | T094 & T071 | trade, sea | side |  | work ×1.30 |
| T238 | High-yield crop varieties | 高产作物品种 | Information | 6 | T095 & T056 & T055 | farm, bio | side |  | work ×1.30 |
| T239 | Cellular mobile networks | 蜂窝移动通信 | Information | 7 | T112 & T104 & T106 | compute, electric | side |  | work ×1.30 |
| T240 | Public-key cryptography | 公钥密码 | Information | 7 | T110 & T055 & T112 | compute | side |  | work ×1.30 |
| T241 | Genome sequencing | 基因组测序 | Information | 7 | T131 & T113 | bio, compute | side |  | work ×1.30 |
| T242 | Carbon-fibre composites | 碳纤维复合材料 | Information | 6 | T093 & T050 & T060 | machine, chem | side |  | work ×1.30 |
| T243 | Symbolic expert systems | 符号专家系统 | Information | 7 | T110 & T113 | compute, record | alt | F11 | work ×1.30 |
| T244 | Hydraulic fracturing | 水力压裂 | Information | 6 | T090 & T063 & T050 | fuel, mine | side |  | work ×1.30 |
| T245 | Fibre-optic communication | 光纤通信 | Information | 7 | T109 & T112 | electric, compute | side |  | work ×1.30 |
| T246 | Communications satellites | 通信卫星 | Space | 7 | T142 & T104 | space, electric | side |  | work ×1.50 |
| T247 | Earth-observation and navigation satellites | 对地观测与导航卫星 | Space | 8 | T142 & T141 & T109 | space, measure | side |  | work ×1.50 |
| T248 | Pressurized light-water reactor fleets | 压水堆机组 | Space | 8 | T147 & T067 & T071 | highenergy, machine | alt | F12 | work ×1.50 |
| T249 | Heavy-water natural-uranium reactors | 重水天然铀堆 | Space | 8 | T147 & T043 | highenergy, chem | alt | F12 | work ×1.50 |
| T250 | Fast breeder reactors and reprocessing | 快中子增殖堆与后处理 | Space | 8 | T147 & T064 & T108 | highenergy, chem | alt | F12 | work ×1.50 |
| T251 | Thorium molten-salt reactors | 钍基熔盐堆 | Space | 8 | T147 & T064 & T050 | highenergy, chem | alt | F12 | extrapolated; work ×1.50 |
| T252 | Crew-rated capsules and launch escape | 载人飞船与逃逸系统 | Space | 8 | T142 & T144 & T115 | space, health | side |  | needs launch_complex; work ×1.50 |
| T253 | In-orbit servicing and refuelling | 在轨服务与加注 | Space | 8 | T142 & T114 & T152 | space, machine | side |  | work ×1.50 |
| T254 | Kerosene-oxygen launch engines | 煤油液氧发动机 | Space | 7 | T140 & T090 | space, fuel | alt | F13 | work ×1.50 |
| T255 | Hydrogen-oxygen launch engines | 氢氧发动机 | Space | 7 | T140 & T108 | space, chem | alt | F13 | work ×1.50 |
| T256 | Methane-oxygen launch engines | 甲烷液氧发动机 | Space | 7 | T140 & T096 | space, fuel | alt | F13 | work ×1.50 |
| T257 | Rotating orbital tethers | 旋转轨道系绳 | Space | 8 | T145 & T107 & T242 | space, machine | side |  | needs orbital_station; extrapolated; work ×1.50 |
| T258 | Carbon-nanotube and graphene materials | 碳纳米管与石墨烯材料 | AI | 8 | T058 & T093 & T242 | machine, chem | side |  | extrapolated; work ×1.75 |
| T259 | Space elevator | 太空电梯 | AI | 9 | T258 & T145 & T153 | space, build | side |  | needs orbital_station; extrapolated; work ×1.75 |
| T260 | Fault-tolerant quantum computing | 容错量子计算 | AI | 8 | T057 & T108 & T115 | compute, science | side |  | extrapolated; work ×1.75 |
| T261 | Neuromorphic processors | 类脑处理器 | AI | 8 | T106 & T116 | compute | alt | F14 | extrapolated; work ×1.75 |
| T262 | Molecular nanofabrication | 分子纳米制造 | AI | 9 | T106 & T131 & T109 | machine, bio | side |  | extrapolated; work ×1.75 |
| T263 | Synthetic biology | 合成生物学 | AI | 8 | T134 & T132 | bio | side |  | work ×1.75 |
| T264 | Magnetic-confinement fusion engineering | 磁约束聚变工程 | AI | 8 | T148 & T108 | highenergy | alt | F15 | needs high_energy; extrapolated; work ×1.75 |
| T265 | Laser inertial-confinement fusion | 激光惯性约束聚变 | AI | 8 | T148 & T109 | highenergy | alt | F15 | needs high_energy; extrapolated; work ×1.75 |
| T266 | Asteroid capture and redirection | 小行星捕获与变轨 | AI | 9 | T172 & T145 & T155 | space, mine | side |  | extrapolated; work ×1.75 |
| T267 | Anomaly cartography | 异常空间测绘 | Interstellar | 9 | T162 & T151 | highenergy, space | sealed |  | fictional; work ×1.50 |
| T268 | Exotic-field shielding | 奇异场屏蔽 | Interstellar | 9 | T163 & T108 | highenergy | sealed |  | fictional; work ×1.50 |
| T269 | Jump navigation beacons | 跃迁导航信标 | Interstellar | 9 | T166 & T175 | space, compute | sealed |  | fictional; work ×1.50 |

### 6.3 Rival families

| Family | Members | Kind | Refuted by (halves the lock) |
| --- | --- | --- | --- |
| F01 Script | T188 Logographic script and scribal canon; T189 Phonetic alphabet | approach | - |
| F02 Field system | T195 Terraced and paddy cultivation; T196 Crop rotation and manuring | approach | - |
| F03 Theory of disease | T197 Humoral medicine and medical schools; T053 Microorganisms and infection mechanisms (critical) | doctrine | T045 Controlled comparisons and repeated trials, T212 Microscopic observation, T214 Variolation |
| F04 Printing | T200 Woodblock printing; T048 Scaled printing and inexpensive records | standard | - |
| F05 Signalling | T218 Optical semaphore networks; T219 Electric telegraphy | standard | - |
| F06 Bulk steel | T222 Pneumatic converter steel; T223 Regenerative open-hearth steel | approach | - |
| F07 Nitrogen source | T226 Mined nitrates and guano; T095 Manufactured agricultural inputs; T288 Electric-arc nitrogen fixation; T312 Nitrogen-fixing cereals | approach | - |
| F08 Electric distribution | T227 Direct-current local networks; T228 Polyphase alternating-current transmission | standard | - |
| F09 Aviation | T230 Rigid airships; T038 Aerodynamics and powered flight | approach | - |
| F10 Computing substrate | T234 Analog computers and fire control; T111 Programmable computers (critical) | standard | T110 Formal algorithms and executable procedures |
| F11 Machine intelligence | T243 Symbolic expert systems; T116 Statistical learning and application models | approach | - |
| F12 Reactor line | T248 Pressurized light-water reactor fleets; T249 Heavy-water natural-uranium reactors; T250 Fast breeder reactors and reprocessing; T251 Thorium molten-salt reactors | standard | - |
| F13 Launch propellant | T254 Kerosene-oxygen launch engines; T255 Hydrogen-oxygen launch engines; T256 Methane-oxygen launch engines | standard | - |
| F14 AI hardware | T261 Neuromorphic processors; T117 Accelerators and compute clusters | standard | - |
| F15 Fusion confinement | T264 Magnetic-confinement fusion engineering; T265 Laser inertial-confinement fusion | approach | - |

### 6.4 Tradition branches

Entry nodes take ordinary evidence; branch nodes take tradition evidence (1.5). Each node's
card states a generic use and the holder's use (`capability` in the draft).

**Steampunk — Coal and Steam (M)**

| ID | Name | 中文 | Era | Tier | Prerequisites | Tags | Kind | Family | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T270 | Steam hammers and heavy forging | 蒸汽锤与重型锻造 | Industrial | 4 | T080 & T061 | steam, metal, machine | entry |  | work ×1.38 |
| T271 | Difference engines and calculating bureaux | 差分机与计算局 | Industrial | 5 | T270 & T044 & T082 & T066 | compute, machine | branch |  | tradition evidence; work ×1.56 |
| T272 | Road locomotives and steam carriages | 公路机车与蒸汽汽车 | Industrial | 5 | T270 & T081 & T027 | steam, machine | branch |  | tradition evidence; work ×1.56 |
| T273 | Ironclads and armoured trains | 铁甲舰与装甲列车 | Industrial | 5 | T270 & T081 & T060 & T068 | war, steam | branch |  | tradition evidence; work ×1.56 |
| T274 | Coal-tar chemistry and synthetic dyes | 煤焦油化学与合成染料 | Industrial | 5 | T270 & T064 & T060 & T217 | chem, steam | branch |  | tradition evidence; work ×1.56 |
| T275 | Pneumatic tube networks | 气动管道网络 | Industrial | 5 | T270 & T042 & T082 & T068 | steam, build | branch |  | tradition evidence; work ×1.56 |
| T276 | Supercritical steam cycles | 超临界蒸汽循环 | Information | 6 | T270 & T086 | steam | branch |  | tradition evidence; work ×1.62 |
| T277 | Steam-thermal ice rockets | 冰蒸汽热火箭 | Space | 8 | T276 & (T157 \| T159) | space, steam | branch |  | extrapolated; tradition evidence; work ×1.88 |

**Dieselpunk — Oil and Engine (N)**

| ID | Name | 中文 | Era | Tier | Prerequisites | Tags | Kind | Family | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T278 | Cracking and high-octane refining | 裂化与高辛烷值炼制 | Modern | 5 | T090 & T092 | fuel, chem | entry |  | work ×1.38 |
| T279 | Diesel-electric transmission | 柴油电力传动 | Modern | 5 | T278 & T092 & T101 | fuel, electric | branch |  | tradition evidence; work ×1.56 |
| T280 | Tank and armoured-vehicle engineering | 坦克与装甲车辆工程 | Modern | 6 | T278 & T094 & T060 | war, fuel, machine | branch |  | tradition evidence; work ×1.56 |
| T281 | Long-range heavy aircraft | 远程重型飞机 | Modern | 6 | T278 & T038 | fuel, war | branch |  | tradition evidence; work ×1.56 |
| T282 | Petrochemical complexes | 石化联合体 | Information | 6 | T278 & T093 | chem, fuel | branch |  | tradition evidence; work ×1.62 |
| T283 | Snorkel submarines | 通气管潜艇 | Modern | 6 | T279 & T067 | sea, war | branch |  | tradition evidence; work ×1.56 |
| T284 | Mass-produced steel rocket stages | 量产钢制火箭级 | Space | 8 | T282 & T178 | space, fuel, machine | branch |  | tradition evidence; work ×1.88 |
| T285 | Fischer-Tropsch fuel synthesis | 费托合成燃料 | Information | 6 | T278 & T096 | fuel, chem | branch |  | tradition evidence; work ×1.62 |

**Electropunk — Current and Wire (O)**

| ID | Name | 中文 | Era | Tier | Prerequisites | Tags | Kind | Family | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T286 | Electric traction: trams and metros | 电力牵引：有轨电车与地铁 | Modern | 5 | T101 & T068 | electric, build | entry |  | work ×1.38 |
| T287 | Early electric-arc furnaces | 早期电弧炉 | Modern | 5 | T286 & T060 | electric, metal | branch |  | tradition evidence; work ×1.56 |
| T288 | Electric-arc nitrogen fixation | 电弧固氮 | Modern | 5 | T286 & T100 & T064 | electric, chem, farm | branch | F07 | tradition evidence; work ×1.56 |
| T289 | Wireless power transmission experiments | 无线输电试验 | Modern | 6 | T286 & T104 & T102 | electric | branch |  | tradition evidence; work ×1.56 |
| T290 | Battery-electric vehicles | 蓄电池电动车辆 | Information | 6 | T286 & T105 | electric, machine | branch |  | tradition evidence; work ×1.62 |
| T291 | Superconducting power grids | 超导电网 | Information | 7 | T286 & T108 & T102 | electric | branch |  | tradition evidence; work ×1.62 |
| T292 | Maglev launch sleds | 磁悬浮发射滑车 | Space | 8 | T291 & T156 | space, electric | branch |  | extrapolated; tradition evidence; work ×1.88 |
| T293 | Electrochemical light metals | 电化学轻金属冶炼 | Modern | 6 | T287 & T103 | electric, chem, metal | branch |  | tradition evidence; work ×1.56 |

**Atompunk — Atom (P)**

| ID | Name | 中文 | Era | Tier | Prerequisites | Tags | Kind | Family | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T294 | Radioisotope power and medicine | 放射性同位素电源与医学 | Information | 7 | T146 & T070 | highenergy, health | entry |  | work ×1.43 |
| T295 | Compact modular reactors | 紧凑型模块化反应堆 | Space | 8 | T294 & T147 & T067 | highenergy, machine | branch |  | tradition evidence; work ×1.88 |
| T296 | Nuclear process heat | 核工艺热 | Space | 8 | T295 & T064 & T085 | highenergy, chem | branch |  | tradition evidence; work ×1.88 |
| T297 | Atomic-powered ships and land trains | 核动力舰船与陆地列车 | Space | 8 | T295 & T092 | highenergy, war | branch |  | tradition evidence; work ×1.88 |
| T298 | Irradiation and mutation breeding | 辐照保鲜与诱变育种 | Information | 7 | T294 & T095 | highenergy, farm | branch |  | tradition evidence; work ×1.62 |
| T299 | Nuclear excavation | 核爆工程 | Space | 8 | T294 & T147 & T063 | highenergy, mine | branch |  | tradition evidence; work ×1.88 |
| T300 | Pulse-unit mass production | 脉冲单元批量生产 | AI | 9 | T299 & T182 | highenergy, space | branch |  | extrapolated; tradition evidence; work ×2.19 |
| T301 | Fusion-fission hybrid reactors | 聚变裂变混合堆 | AI | 9 | T295 & T148 | highenergy | branch |  | needs high_energy; extrapolated; tradition evidence; work ×2.19 |

**Cyberpunk — Network (Q)**

| ID | Name | 中文 | Era | Tier | Prerequisites | Tags | Kind | Family | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T302 | Network operations and security centres | 网络运营与安全中心 | Information | 7 | T112 & T123 | compute | entry |  | work ×1.43 |
| T303 | Implant clinics and cybernetic prosthetics | 植入诊所与赛博义体 | Space | 8 | T302 & T119 | health, compute | branch |  | tradition evidence; work ×1.88 |
| T304 | Augmented-reality workplaces | 增强现实工作场所 | Information | 7 | T302 & T116 & T109 | compute, teach | branch |  | tradition evidence; work ×1.62 |
| T305 | Corporate data havens | 企业数据避风港 | Information | 7 | T302 & T113 | compute, trade | branch |  | tradition evidence; work ×1.62 |
| T306 | Cyber-augmented soldiers | 赛博增强士兵 | Space | 8 | T303 & T114 | war, compute | branch |  | tradition evidence; work ×1.88 |
| T307 | Ubiquitous sensing and smart cities | 泛在感知与智慧城市 | Space | 8 | T302 & T121 & T239 | compute, build | branch |  | tradition evidence; work ×1.88 |
| T308 | Telepresence mining crews | 遥在采矿作业组 | AI | 8 | T307 & T180 | compute, mine, space | branch |  | extrapolated; tradition evidence; work ×2.19 |
| T309 | Memory and skill uploads | 记忆与技能上载 | AI | 9 | T303 & T120 | compute, health, teach | branch |  | extrapolated; tradition evidence; work ×2.19 |

**Biopunk — Living Systems (R)**

| ID | Name | 中文 | Era | Tier | Prerequisites | Tags | Kind | Family | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T310 | Biofoundries | 生物铸造厂 | Information | 7 | T132 & T095 | bio, chem | entry |  | work ×1.43 |
| T311 | Bio-leaching and biomining | 生物浸矿 | Information | 7 | T310 & T131 & T063 | bio, mine | branch |  | tradition evidence; work ×1.62 |
| T312 | Nitrogen-fixing cereals | 固氮谷物 | Space | 8 | T310 & T131 & T095 | bio, farm | branch | F07 | tradition evidence; work ×1.88 |
| T313 | Living architecture | 活体建筑 | Space | 8 | T310 & T050 | bio, build | branch |  | extrapolated; tradition evidence; work ×1.88 |
| T314 | Metabolic enhancement | 代谢增强 | Space | 8 | T310 & T134 & T070 | bio, health, war | branch |  | extrapolated; tradition evidence; work ×1.88 |
| T315 | Radiation-tolerance therapies | 抗辐射疗法 | Space | 8 | T314 & T144 | bio, health, space | branch |  | extrapolated; tradition evidence; work ×1.88 |
| T316 | Bio-ISRU for Mars and Titan | 火星与土卫六生物原位利用 | AI | 9 | T311 & T179 | bio, space | branch |  | needs offworld_station; extrapolated; tradition evidence; work ×2.19 |
| T317 | Engineered ecosystems for planetary shaping | 地化改造工程生态系统 | AI | 9 | T316 & T137 | bio, space | branch |  | needs offworld_station; extrapolated; tradition evidence; work ×2.19 |

**AI-punk — Synthetic Minds (S)**

| ID | Name | 中文 | Era | Tier | Prerequisites | Tags | Kind | Family | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T318 | Autonomous logistics fleets | 自主物流车队 | Information | 7 | T114 & T116 | compute, machine | entry |  | work ×1.43 |
| T319 | Lights-out factories | 无人工厂 | AI | 8 | T318 & T122 | compute, machine | branch |  | extrapolated; tradition evidence; work ×2.19 |
| T320 | Machine governance centres | 机器治理中心 | AI | 9 | T319 & T125 | compute, record | branch |  | extrapolated; tradition evidence; work ×2.19 |
| T321 | Autonomous swarms | 自主集群 | AI | 8 | T318 & T122 & T123 | compute, war | branch |  | extrapolated; tradition evidence; work ×2.19 |
| T322 | Self-improving design systems | 自我改进的设计系统 | AI | 9 | T319 & T121 | compute, machine | branch |  | extrapolated; tradition evidence; work ×2.19 |
| T323 | Von Neumann probe prototypes | 冯·诺依曼探测器原型 | AI | 9 | T322 & T181 | compute, space | branch |  | needs offworld_station; extrapolated; tradition evidence; work ×2.19 |
| T324 | Synthetic scientists | 合成科学家 | AI | 8 | T318 & T118 & T122 | compute, science | branch |  | extrapolated; tradition evidence; work ×2.19 |
| T325 | Verified value-alignment protocols | 可验证价值对齐协议 | AI | 9 | T324 & T115 | compute | branch |  | extrapolated; tradition evidence; work ×2.19 |

### 6.5 New practices

Group titles for navigation: "Classical polity, law and revenue", "Medieval estates, faith
and learning", "Early modern state, money and toleration", "Industrial society and the
nation", "Mass politics, welfare and planning", "Information-age institutions",
"Space-age institutions", "AI-age institutions", "Tradition institutions" (era-0 additions
join "Community, land, and early organization"). Behaviour texts and effects are in the
draft; effects follow doc 36 §4's channels and are shown as named breakdown lines.

| ID | Name | 中文 | Era | Prerequisites | Material preconditions | Category | Exclusive / tension |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C068 | Councils of elders | 长老议事会 | Ancient | C003 & C011 | POP>=200000 | governance | X01 |
| C069 | Hereditary chieftaincy | 世袭酋长制 | Ancient | C003 & C009 | POP>=200000 | governance | X01 |
| C070 | Marriage alliances and bride-wealth | 联姻与聘礼 | Ancient | C002 & C009 | - | family |  |
| C071 | Feasting and gift obligations | 宴享与馈赠义务 | Ancient | C004 & C011 | T007 | economy |  |
| C072 | Rites of passage and age sets | 成年礼与年龄组 | Ancient | C001 & C016 | - | family |  |
| C073 | Sacred groves and seasonal taboos | 圣林与季节禁忌 | Ancient | C007 & C001 | - | environment |  |
| C074 | Codified law on public tablets | 成文法与公示法典 | Classical | C020 & C013 | T025 | law |  |
| C075 | Citizen assemblies | 公民大会 | Classical | C019 & C011 | POP>=1000000 | governance | X02 |
| C076 | Divine kingship and temple economy | 神圣王权与神庙经济 | Classical | C014 & (C069 \| C013) | REL \| F:holy_site | governance | X02 |
| C077 | Tribute and client rulers | 朝贡与附庸 | Classical | C016 & C012 | CONTACT | diplomacy |  |
| C078 | Tax farming | 包税制 | Classical | C022 & C013 | T026 | revenue | X03 |
| C079 | Salaried revenue officials | 领薪税吏 | Classical | C026 | Q:scribe>=10000 | revenue | X03 |
| C080 | Debt limits and jubilee remission | 债务限制与免债年 | Classical | C011 & C017 | - | law |  |
| C081 | Schools of philosophy | 哲学学派 | Classical | C023 & C024 | T025 | science |  |
| C082 | Public games and festivals | 公共竞技与节庆 | Classical | C019 & C071 | POP>=1000000 | culture |  |
| C083 | Military colonies and veteran grants | 军屯与老兵授田 | Classical | C016 & C017 | F:barracks | military |  |
| C084 | Courier and relay services | 驿传制度 | Classical | C026 & C012 | T027 | administration |  |
| C085 | Market inspectors and standard measures | 市吏与度量监察 | Classical | C021 & C019 | T016 | economy |  |
| C086 | Feudal vassalage | 封建封臣制 | Medieval | C083 & C009 | REG>=3 | governance | X04; tension C090 |
| C087 | Prefectures and appointed magistrates | 郡县与流官 | Medieval | C026 & C025 | REG>=3 & Q:scribe>=20000 | governance | X04 |
| C088 | Monastic orders and scriptoria | 修道团体与缮写室 | Medieval | C014 & C023 | REL & F:archive | religion-adjacent |  |
| C089 | Chartered towns and communes | 特许城镇与自治公社 | Medieval | C019 & C018 | POP>=2000000 | governance |  |
| C090 | Civil examinations | 科举考试 | Medieval | C025 & C087 | F:school | education | tension C086 |
| C091 | Universities and degrees | 大学与学位 | Medieval | C027 & C081 | F:school & Q:scholar>=10000 | education |  |
| C092 | Religious and customary courts | 宗教法与习惯法法庭 | Medieval | C020 & C014 | REL | law |  |
| C093 | Merchant leagues | 商人同盟 | Medieval | C018 & C021 | CONTACT & T028 | economy |  |
| C094 | Pilgrimage routes and hospices | 朝圣路线与济院 | Medieval | C012 & C014 | REL & F:holy_site | religion-adjacent |  |
| C095 | Manorial tenancy and labour dues | 庄园租佃与劳役 | Medieval | C017 & C086 | - | labour | tension C123 |
| C096 | Hospitals and almshouses | 医院与济贫院 | Medieval | C015 & C014 | F:clinic \| F:holy_site | welfare |  |
| C097 | Warrior codes of honour | 武士荣誉法则 | Medieval | C016 & C086 | - | military |  |
| C098 | Cadastral surveys and land registers | 地籍清丈与田册 | Medieval | C017 & C026 | T016 & T026 | administration |  |
| C099 | Joint-stock companies | 股份公司 | Early Modern | C022 & C021 & C031 | T208 | economy |  |
| C100 | Central banking and public debt | 中央银行与公债 | Early Modern | C026 & C099 | T208 | economy |  |
| C101 | Absolute monarchy and court bureaucracy | 君主专制与宫廷官僚 | Early Modern | (C087 \| C086) & C026 | REG>=6 | governance | X05 |
| C102 | Parliamentary sovereignty | 议会主权 | Early Modern | (C075 \| C089) & C020 | REG>=3 | governance | X05 |
| C103 | Edicts of toleration | 宗教宽容敕令 | Early Modern | C092 & C024 | REL | religion-adjacent | X06 |
| C104 | State church and confessional unity | 国教与信仰统一 | Early Modern | C092 & C014 | REL | religion-adjacent | X06 |
| C105 | Learned societies and academies | 学会与科学院 | Early Modern | C091 & C028 | T210 \| T045 | science |  |
| C106 | Patents and inventors' privileges | 专利与发明特权 | Early Modern | C031 & C020 | - | economy |  |
| C107 | Mercantilist trade policy | 重商主义贸易政策 | Early Modern | C093 & C026 | CONTACT | economy | X07 |
| C108 | Public postal service | 公共邮政 | Early Modern | C084 & C026 | T198 \| T048 | administration |  |
| C109 | Maritime law and marine insurance | 海商法与海上保险 | Early Modern | C021 & C099 | T028 | law |  |
| C110 | Poor laws and workhouses | 济贫法与习艺所 | Early Modern | C096 & C026 | F:admin | welfare |  |
| C111 | Settler companies and colonial charters | 殖民特许与移民公司 | Early Modern | C099 & C083 | T028 & CONTACT | economy |  |
| C112 | Free-trade doctrine | 自由贸易主张 | Industrial | C099 & C031 | CONTACT | economy | X07 |
| C113 | Written constitution and bill of rights | 成文宪法与权利法案 | Industrial | (C102 \| C040) & C020 | F:admin | law | tension C135 |
| C114 | Mass conscription | 普遍征兵制 | Industrial | C037 & C016 | F:barracks | military | X08 |
| C115 | Volunteer professional army | 志愿职业军队 | Industrial | C037 & C033 | F:barracks | military | X08 |
| C116 | Factory inspection and child-labour limits | 工厂监察与童工限制 | Industrial | C033 & C026 | T061 \| T062 | labour |  |
| C117 | Friendly societies and mutual insurance | 互助会与互助保险 | Industrial | C015 & C033 | - | welfare |  |
| C118 | Boards of public health | 公共卫生委员会 | Industrial | C019 & C026 | T069 \| T053 | welfare |  |
| C119 | Statistical bureaus and census | 统计局与人口普查 | Industrial | C026 & C098 | T055 | administration |  |
| C120 | Chartered engineering institutions | 特许工程师学会 | Industrial | C025 & C030 | T061 | science |  |
| C121 | Stock exchanges | 证券交易所 | Industrial | C099 & C100 | T219 \| T048 | economy |  |
| C122 | National language schooling | 国语教育与民族认同 | Industrial | C032 & (C101 \| C102) | F:school | education |  |
| C123 | Abolition of servile labour | 废除奴役劳动 | Industrial | C033 & C080 | - | labour | tension C095 |
| C124 | Research universities | 研究型大学 | Industrial | C091 & C029 | F:laboratory | science |  |
| C125 | Universal suffrage | 普选权 | Modern | C113 & C032 | T048 | governance | tension C172 |
| C126 | Social insurance and pensions | 社会保险与养老金 | Modern | C039 & C117 | F:admin | welfare |  |
| C127 | Central planning commissions | 中央计划委员会 | Modern | C036 & C041 & C119 | T055 | economy | X09 |
| C128 | Market regulation and competition law | 市场监管与竞争法 | Modern | C035 & C040 | - | economy | X09; tension C129 |
| C129 | Tripartite wage bargaining | 劳资政三方协商 | Modern | C034 & C035 | - | labour | tension C128 |
| C130 | Industrial research laboratories | 企业研究实验室 | Modern | C035 & C124 | F:laboratory | science |  |
| C131 | Public broadcasting charter | 公共广播宪章 | Modern | C028 & C036 | T229 | media | X10 |
| C132 | Commercial broadcasting | 商业广播 | Modern | C028 & C035 | T229 | media | X10 |
| C133 | Family planning services | 计划生育服务 | Modern | C039 & C118 | T070 | family |  |
| C134 | National parks and conservation | 国家公园与自然保护 | Modern | C007 & C036 | - | environment |  |
| C135 | Political police | 政治警察 | Modern | C041 & C037 | F:barracks | security | tension C113 |
| C136 | National science councils | 国家科学委员会 | Modern | C036 & C124 | F:institute | science |  |
| C137 | Environmental impact assessment | 环境影响评价 | Information | C134 & C045 | T130 | environment |  |
| C138 | Freedom of information | 信息公开法 | Information | C040 & C047 | T113 | law |  |
| C139 | Data privacy rights | 数据隐私权 | Information | C047 & C113 | T113 | law | X11 |
| C140 | Mass surveillance programmes | 大规模监控计划 | Information | C047 & C135 | T112 & T116 | security | X11 |
| C141 | International standards bodies | 国际标准组织 | Information | C043 & C120 | CONTACT | diplomacy |  |
| C142 | Venture capital and start-up finance | 风险投资与创业金融 | Information | C121 & C031 | T111 | economy |  |
| C143 | Open-source commons | 开源公共品 | Information | C044 & C047 | T112 | science |  |
| C144 | Civil space agency | 民用航天局 | Information | C136 & C045 | T140 | science |  |
| C145 | Nuclear safety regulation | 核安全监管 | Information | C045 & C136 | T146 | safety |  |
| C146 | Universal health coverage | 全民医疗保障 | Information | C126 & C118 | F:hospital | welfare |  |
| C147 | Climate treaties and carbon accounting | 气候条约与碳核算 | Information | C055 & C043 | T130 & CONTACT | environment |  |
| C148 | Arms-control verification | 军控核查机制 | Information | C043 & C045 | T146 & CONTACT | diplomacy |  |
| C149 | Space commons treaty | 太空公域条约 | Space | C144 & C043 | T142 & CONTACT | off-world | X12 |
| C150 | Off-world homestead claims | 地外宅地权 | Space | C144 & C038 | T142 | off-world | X12 |
| C151 | Launch range and safety authority | 发射靶场与安全管理局 | Space | C144 & C045 | T142 & F:launch_complex | safety |  |
| C152 | Station crew articles | 空间站乘员公约 | Space | C058 & C151 | T144 | labour |  |
| C153 | Orbital traffic management | 轨道交通管理 | Space | C151 & C141 | T141 | safety |  |
| C154 | Planetary protection protocols | 行星保护规程 | Space | C137 & C144 | T143 | environment |  |
| C155 | Asteroid mining charters | 小行星采矿特许 | Space | C142 & C038 | T159 | economy |  |
| C156 | Indentured passage | 契约移民 | Space | C111 & C033 | T144 | off-world | X13 |
| C157 | Subsidized free passage | 资助自由移民 | Space | C126 & C151 | T144 | off-world | X13 |
| C158 | Space guard and orbital militia | 太空警备队 | Space | C037 & C151 | T145 | military |  |
| C159 | Algorithmic audit courts | 算法审计法庭 | AI | C051 & C138 | T115 | law |  |
| C160 | Universal basic income | 全民基本收入 | AI | C126 & C046 | T122 | welfare | X14 |
| C161 | Public job guarantee | 公共就业保障 | AI | C036 & C046 | T122 | labour | X14 |
| C162 | Compute allocation boards | 算力分配委员会 | AI | C052 & (C127 \| C128) | T117 | economy |  |
| C163 | Registry of synthetic persons | 合成人登记制度 | AI | C059 & C159 | T122 | law |  |
| C164 | Human-in-the-loop command law | 人在回路指挥法 | AI | C051 & C037 | T114 | military |  |
| C165 | Generational equity compact | 代际公平契约 | AI | C056 & C146 | T136 \| T134 | welfare |  |
| C166 | Global compute treaty | 全球算力条约 | AI | C148 & C162 | T122 & CONTACT | diplomacy |  |
| C167 | Machine trusteeship of commons | 机器托管公共品 | AI | C053 & C143 | T125 | governance |  |
| C168 | Engine-house brotherhoods | 机房兄弟会 | Industrial | C018 & C033 | TRAD:steam | tradition |  |
| C169 | Oil concession diplomacy | 石油租让外交 | Modern | C099 & C043 | TRAD:engine & CONTACT | tradition |  |
| C170 | Public power cooperatives | 公共电力合作社 | Modern | C036 & C015 | TRAD:wire | tradition |  |
| C171 | Atomic stewardship orders | 原子守护会 | Space | C056 & C145 | TRAD:atom | tradition |  |
| C172 | Corporate citizenship | 企业公民权 | Information | C048 & C142 | TRAD:network | tradition | tension C125 |
| C173 | Bioethics tribunals | 生物伦理法庭 | Information | C045 & C137 | TRAD:living | tradition |  |
| C174 | Machine-labour dividends | 机器劳动红利 | AI | C050 & (C160 \| C161) | TRAD:synthetic | tradition |  |

### 6.6 Merge procedure and checks

1. Merge doc 37 §7.1 (19 nodes, two renames) and C065-C067 first.
2. Append `add` entries; move `draft.tier`, `draft.tags`, `draft.pacing_era` into
   `content/pacing.json` `nodes` (the loader already reads tier and tags for nodes the code
   does not know); add the new per-node fields (`era`, `kind`, `evidence`, `family`,
   `work_bp`, `hint_bp`, `fragile`, `needs_facility` with the new `offworld_station` kind)
   to `content.rs`; add `families` and `exclusive_groups` to a new `content/families.json`.
3. Apply renames and relinks; set `era` for all practices from `era_of_existing`.
4. Tests (content): exactly 300 technologies and 174 practices; no dangling references, no
   cycles, no cross-graph prerequisites; **the victory-critical closure equals the
   committed list** (84 + 35, below); no new id inside it; every exclusive group leaves a
   route to C064 and T167; every family has ≥ 2 members and every critical member is capped;
   sealed nodes depend on a fictional node; every new node has lore in both languages;
   `name_zh` present.
5. These checks (closure with the cheapest alternative at every OR, cycles, cross-graph
   references, exclusive-route reachability) were run on the drafts while writing this
   chapter; an engineer ports them to `bts verify` and the content tests.

Victory-critical technologies (84): T001 T002 T003 T004 T005 T007 T008 T009 T010 T011 T012 T014 T016 T021 T023 T024 T025 T026 T029 T030 T031 T032 T033 T034 T040 T041 T042 T043 T044 T045 T046 T047 T049 T050 T051 T052 T053 T054 T055 T057 T058 T060 T061 T064 T065 T066 T067 T069 T070 T071 T080 T081 T083 T100 T102 T103 T104 T106 T107 T109 T110 T111 T112 T114 T115 T123 T140 T141 T142 T143 T144 T145 T146 T147 T151 T152 T153 T160 T161 T162 T163 T164 T166 T167.

Victory-critical practices (35): C001 C002 C003 C004 C005 C006 C007 C009 C010 C011 C012 C013 C015 C016 C019 C020 C023 C024 C025 C026 C028 C029 C036 C037 C038 C039 C041 C045 C055 C056 C057 C058 C060 C063 C064.

---

## 7. Interface implications (views and data, not mock-ups)

1. **Technology map at 300 nodes**: era bands as columns (ten, Interstellar sealed), field
   lanes as rows (twelve generic lanes plus one lane for the held traditions); three zoom
   levels: era overview (counts of *discovered* nodes per band and lane only), band view
   (cards), card. Layout is computed from discovered nodes only (chapter 31 §8): no empty
   slots, no counts of undiscovered nodes, no scroll extent that leaks size. Search covers
   discovered cards. Filters: state, field, era, tradition, "rival standard", "fragile".
2. **Path-dependence indicators**: on a family member's card, only when at least two
   members are discovered: "Competing standard: <name> (yours, 62% of installed base).
   Evidence here ×0.63, investigation ×1.31. Revisit study: 2.1 M researcher-months, 24
   months." A lone discovered member shows nothing about rivals. Refuting discoveries show
   as "Contrary evidence weakens <doctrine>". Fragile cards show "Not practised for 84
   years; at risk without archives".
3. **Objective markers** ("needed for the objective") appear only after `victory_revealed`
   and only on discovered cards, so the map never discloses the sealed objective.
4. **Tradition lane**: the held traditions' discovered branch nodes; other traditions'
   nodes appear only when discovered (contact, capture, study) with their source.
5. **Practice map**: era bands × category lanes; exclusive groups as linked cards with an
   "exclusive" marker between recognized members; repeal action; tensions marked; the
   **institutional load meter** ("Institutions 84 / 120") and reform slots in the header.
6. **Boost counter** in the top bar next to the other national yields: "运载力 / Boost 4.8 kt
   ▲1.6 kt/mo (cap 7.2 kt)"; amber when within one month of the cap ("Launch sites will
   stand down"), grey when standing down; tooltip by stage with levels, output, inputs and
   failure risk.
7. **Launch planner**: a month-by-month queue of launches (manifest, destination: the
   Earth-orbit store or a station; crewed flag; boost; risk), the boost forecast against
   the cap, doc 37 windows for the onward transfer, shortfall reasons; standing orders
   editor.
8. **Station view**: orbit, core stage and upgrade, module slot grid (build, upgrade,
   scrap), power balance, aboard crew and life support, store, defence and interdiction,
   debris index, docking and transfers, ground segment region; **station list** across
   orbits. **Base view**: doc 37 site card plus the three new works.
9. **Solar System view** (doc 37 §9.6): orbits as rings around bodies with own and visible
   foreign stations.
10. All new strings in English, Simplified and Traditional Chinese; the boost resource is
    named "运载力" (zh-Hans) and "運載力" (zh-Hant).

Protocol additions (within doc 36's version bump; `#[serde(default)]`): `TechCard.kind`,
`TechCard.family_view: Option<FamilyView { rivals_discovered, incumbent, share_bp,
lock_e_bp, lock_w_bp, revisit_cost }>`, `TechCard.fragile_risk`, `PracticeCard.exclusive_with`
(recognized handles only), `CultureView.load { used, capacity }`, `reform_slots`;
`CivView.boost`; `SolarView.stations`, `StationView`, `ForeignStationView`; actions
`Repeal { practice }`, project kinds `Revisit { card }`, `FoundStation { orbit }`,
`Module { station, module, op }`, `Launch`, `Scuttle { station }`; setting `Launch`
replaces `Lift`.

---

## 8. Plan changes

### 8.1 Where this goes in doc 37's slice plan

| # | Slice | Change |
| --- | --- | --- |
| 0-6 | as doc 37 | unchanged (slices 0-4 done on `ruleset3`) |
| **6b** | **Deeper technology graph** (new, after 6) | merge doc 37's 19 nodes here instead of slice 14 (they are knowledge only; their works stay in 14) and the 143 new nodes; renames, relinks; per-node `work_bp`/`hint_bp`; families, locks, refutation, revisit studies, fragile knowledge; tradition evidence source (inert until 13: branch nodes have only the study route before traditions exist); investigation lines; the native AI's research scoring (3.2); `bts critical-path`; `Expert` policy skeleton. Calibration: re-run slice 3's milestone table; leader T167 window; completion targets 1.3 measured at 2300 |
| **6c** | **Deeper practice graph** (new) | 107 practices; era costs; exclusive groups, repeal, tensions; institutional load and capacity; reform slots; practice drags; AI practice scoring (3.3). Calibration: 2.4 |
| 7-12 | as doc 37 | slice 10 (eras) checks that era entries still fall in table 0.1 with the larger graph |
| 13 | Traditions | adds branch evidence, tradition institutions C168-C174, exclusive works on branch nodes |
| 14 | Space access | **boost replaces lift** (stock, cap, stand-down, stages incl. integration halls, failures, F13 inputs); stations: K1-K2 cores, habitat, life support, solar, reactor, docking and depot, shipyard (doc-35 conversion, check 13), research, observatory, refinery, relay, command; orbits LEO, GEO, Earth-Moon L1, low lunar orbit, Mars orbit |
| 15 | Off-world settlement and contest | stations: K3-K4, defence, capture, siege, scuttle, debris, fabrication, microgravity works, rings, assembly bay, solar power satellite, skyhook, elevator, the remaining orbits; three new base works |
| 17 | Victory and the native AI | final AI pass; `Expert` policy complete; LLM qualitative check |
| 18 | Client | section 7 views |

### 8.2 Acceptance tests (beyond doc 37 §11.2)

- **Isolation, hidden nodes**: two worlds that differ only in seat B's hidden branch, family
  shares or undiscovered nodes give seat A byte-identical observations; a family view
  appears only with two discovered members and never names an undiscovered one; requests
  naming an undiscovered card, family or practice get the uniform unknown error; sealed
  nodes absent before reveal; objective markers absent before reveal.
- **Isolation, tradition branches**: a non-holder's observation contains a branch node only
  after it is discovered; contact reports name the source only then.
- **Isolation, space**: boost stock and launch manifests are private; foreign stations
  appear only under 5.5's visibility rules.
- **Determinism**: lock arithmetic integer; launch and module-loss draws addressed by
  (seat, month) or (station, month); checkpoint reload mid-revisit, mid-repeal and
  mid-station build.
- **Conservation**: boost identity; station modules' bills; aboard people in the population
  ledger (launched = aboard + returned + died); captured stations' crews.
- **Content**: 6.6 step 4.
- **Victory reachability**: `critical_path_bounded` (the expert's critical-path length on
  every eval seed ≤ its pre-6b value + 5 years); `expert_wins` (8.4).
- **Performance with a twice larger graph**: knowledge step iterates a per-seat frontier
  list (nodes with prerequisites met and state ≤ hinted, maintained on understanding events)
  instead of all 300 nodes each month; families and installed counts updated on facility
  changes, not recomputed; practice load summed on change. Budget: p95 per round still ≤ 150
  ms native and ≤ 400 ms wasm with three native seats; full all-AI standard match ≤ 60 s
  native; knowledge step ≤ 10% of a late month (measured by the slice-0 checkpoints); late
  observation ≤ +40 KB.

### 8.3 Verification of reachability

1. **`Expert` test policy** (`bts-ai`, difficulty `Expert`, not offered in the setup by
   default): the same entry point and `Observation` type as the native AI (enforced by the
   type: it receives nothing else), plus the public compiled tables of 3.1. It plays the
   critical path: research ≥ 75% on investigable critical cards; education targets for
   scientists, orbital crews and jump engineers 30 years ahead of checks 7-8; launch
   complex, station and yard as soon as their requirements are discovered; a C064 route
   chosen by 1900; integration by subordination and conquest from about 1950 (doc 36 §7
   integration paths). A CI test runs it only on observations (no `World` access).
2. **`bts critical-path --seed S --seat K [--curve run.csv]`** (referee-side measurement
   tool, never available to seats): from a recorded or simulated trajectory of population,
   qualified people, research capacity by class and tag activity, it computes for every
   critical node the earliest lead month (evidence to 2.5 × H at the trajectory's gain, with
   and without contact), the earliest understanding month (max of minimum months and work at
   full class capacity), and the longest path to T167 plus the base build chain (testbed,
   lines, nodes, exercise) and the victory clocks (G96 ∧ F24 ∧ Trials96). It reports the
   lower bound, the path, per-node slack and the binding tags; calibration tracks it per
   seed.
3. **LLM agent check** (qualitative, slice 17): four quick-mode matches with an LLM agent
   in one seat through the MCP `get_turn`/`submit_turn` tools against Hard, Medium and Easy
   natives; recorded: whether it noticed and used rival families, revisit studies,
   exclusive practices, boost planning and stations; its era dates and outcome; any
   interface confusion. No numeric target; findings feed the interface and the AI.

### 8.4 Calibration targets

| Metric | Target |
| --- | --- |
| Doc 36 §7 and doc 37 §11.4 | all still hold (Hard native: a winner in 55-75%, ≥ 70% by the hard seat, median 2250-2310, IQR ≤ 120 years) |
| Expert policy (32 seeds against Hard, Medium, Medium) | wins ≥ 80%; median win AD 2100-2200; 10th percentile ≥ AD 2050 |
| Medium and Easy | Medium ≤ 15% of its matches, after 2330; Easy ~0 |
| Critical-path lower bound (best seed) | T167 not before AD 1990 |
| Technology completion | table 1.3 |
| Practice adoption | table 2.4 |
| Families | every family's members each held as incumbent by ≥ 10% of the seats that hold any member; median revisit studies per leader ≤ 2 |
| Boost | first launch complex median 2030-2080; leader's boost made at 2150 ≥ 5 kt a month; boost at cap ≤ 30% of seat-months (planning matters but the cap is not idle) |
| Launch failures | crewed losses in 10-40% of matches; never more than 2% of all boost spent |
| Stations | an Earth-orbit station with a shipyard by the leader in ≥ 90% of matches by 2200; a station captured or destroyed in 10-30% of matches |

### 8.5 What to loosen first if the expert cannot win in time

1. Hint thresholds of critical tier 8-9 nodes (pacing classes for T160-T167 and their
   tier-8 prerequisites), −10% per step.
2. Work of critical tier 7-9 nodes, −10% per step.
3. Minimum months of the serial jump nodes T162-T167 (36 → 30 → 24).
4. Critical practices' recognition evidence (already protected).
5. Doc-35 base build months, never the victory clocks.

Never first: breadth costs, family locks, exclusive groups or tradition evidence; they do
not touch the critical path beyond the bounds of 0.2. If the expert wins too early (10th
percentile before 2050), raise items 1-2 in the same steps.

### 8.6 Cut order (this chapter; then doc 37 §11.6)

1. The three sealed Interstellar side nodes.
2. Space elevator and skyhook.
3. Debris.
4. Orbits beyond LEO, Earth-Moon L1, low lunar orbit and Mars orbit.
5. Launch failures (replaced by a deterministic 1% loss of spent boost).
6. Practice drags on technology.
7. Institutional load (era costs, exclusives and reform slots stay).
8. Tradition institutions C168-C174.
9. Fragile knowledge.
10. Station capture (stations can only be destroyed).

Never cut: the victory-critical protection, the boost stock and cap, station cores and the
shipyard module, families with their recovery routes, exclusive groups, tradition evidence.

### 8.7 Risks

- **Pacing sensitivity**: the larger graph changes nothing on the critical chain by
  construction, but more nodes compete for the AI's lines; the smart AI and the
  critical-path tool are the countermeasures, and slice 6b re-runs slice 3's table.
- **Population recalibration** may multiply late research capacity; late multipliers are
  keyed to completion targets (1.3), not fixed.
- **Leaks through family views**: shown only between discovered members; tested.
- **Scope**: 143 technologies and 107 practices need lore passages in two languages before
  merge; the content can be merged in tranches by era (antiquity first) without changing
  any rule.
- **AI quality**: if the AI cannot use a mechanism (families, exclusives, stations), cut
  the mechanism; never give the AI information or bonuses (doc 37 §11.5).
