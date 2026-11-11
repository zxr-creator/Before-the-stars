# 37. Eras, traditions, the Earth and the Solar System, buildings and military modernization (ruleset 3.0 addendum)

Status: design addendum and revised implementation plan; no code is changed by this
chapter. It extends `36-ruleset-3-history-resources-trade.md` (doc 36), which stays
normative wherever this chapter does not change it, and it is written against branch
`ruleset3` as it stands (slices 0-2 committed: `d4c06e2`, `2117254`, `c654c82`; slice 3,
knowledge pacing, in progress). `docs/units-and-scale.md`, `docs/conservation-audit.md`
and `35-industrial-base-plan-v1.1.md` remain normative for units, ledgers and the jump
base. Decisions the user should confirm are in `37-open-questions.md`.

The user asked for four things: (1) military units that are upgraded instead of spear
lines in the jump age; (2) eras with special features and hard decisions, including
"punk" directions (steam, diesel, cyber, bio, AI ...), and a map that is an Earth
inside the Solar System, with bases, mines, research sites and habitats on the Moon,
Mars, Jupiter's moons and beyond, where people live; (3) real space-access technology
with launch and space centres and several propulsion families, with key space sites
that matter for resources, research and culture; (4) realistic buildings that are
upgraded and do not persist unchanged for ever, cities that displace farmland, and a
building upgrade tree shown to every player, AI and agent. On the map the user decided:
an Earth-like generated world by default, an optional real Earth, and zooming between
the Earth and the Solar System.

Every number marked *provisional* is a starting value for calibration; units, identities,
orderings and formulas are not provisional. Integer arithmetic only (bp, `i128` products
through `util::muldiv`, carried remainders). Nothing is created from nothing: every new
mechanism below consumes real goods, labour, qualified people, energy and time and gets
a ledger line; economies of scale stay capped; seats see only their own state and what
they have discovered.

---

## 0. Summary for the player

**Your civilization lives through eras.** From the Ancient era of 5000 BC through the
Classical, Medieval, Early Modern, Industrial, Modern and Information eras into the
Space and AI eras. You enter an era when you have both *understood* its defining
knowledge and *built* what proves it (an iron-using town, printing presses and powder
mills, ten powered works, a running computing centre, a launch complex and a first base
beyond the Earth ...), so you decide when to cross. Each era opens new buildings, a new
generation of military equipment, new production methods and one **charter** you choose
from three (for example *Guild Charters*, *Feudal Estates* or *Monastic Learning*). Each
crossing also strains the old order: the more of your people still work in outdated
works, the more unrest. How well you manage the transition decides whether a **golden
age** or a **dark age** follows. Your people's expectations rise with every era too: a
modern population wants clothing and consumer goods that a medieval one did not.

**Twice in history you choose a direction.** On entering the Industrial era you may
commit to a **machine tradition**: *Coal and Steam*, *Oil and Engine* or *Current and
Wire*. On entering the Information era you may commit to a **frontier tradition**:
*Atom*, *Network*, *Living Systems* or *Synthetic Minds*. Each tradition has its own
works, methods, military variants, launchers or space habitats, cultural pull and
drawbacks, and grows stronger the longer you practise it. Your knowledge is never
locked (anyone can learn anything), but only your tradition's special works can be
built. Changing tradition takes a decade of reform and costs most of your mastery.
Choose by what your land holds: coal, oil, rivers and copper, uranium, quartz, fertile
land or cheap power.

**Armies are modernized, not replaced.** Every formation carries one of eight equipment
generations, from warbands to orbital-supported forces. You re-equip a formation in
place: it needs the new kit (real goods), arms-works capacity to fit it out and months of
retraining, and it fights at a blend of old and new while it converts. Old kit goes to
your reserves and militia, so a jump-age civilization's home guard carries rifles, not
spears. A modern army that runs out of fuel or electronics parks its vehicles and fights
a generation lower. Formations three generations behind are obsolete and lose heart.

**Buildings age.** Every building belongs to a line (hand mill → water mill → steam mill
→ electric mill; granary → warehouse → cold store; healers' lodge → hospital → modern
hospital). You can upgrade a works in place for about 60% of the price of a new one (it
stands idle while it is rebuilt), build new and demolish the old, keep it running (it
misses the productivity of newer technology and costs more upkeep), or, for some old
buildings, keep them as heritage that your people value. The complete building upgrade
tree is public: every player, AI and agent sees what buildings exist and what they
upgrade to, with technologies you have not discovered shown only by era and field.

**Cities take land.** Every region has a land budget shared by city, farmland, pasture,
forest, industry and wild land. Growing cities spread onto farmland; dense housing
(tenements, apartment blocks, towers, arcologies) saves land at a price; suburbs spend
it for comfort. A big city lives on food brought in through granaries, warehouses and
cold stores and on high-yield or indoor farms, not on fields inside its walls.

**The world is an Earth, and above it is the Solar System.** By default you play on a
generated Earth-like planet with continents, climates and geology; at setup you can
choose the real Earth instead. Zoom out and you see the Moon, the planets and their
moons. Nineteen **sites** (three on the Moon, three on Mars, a Venus cloud station,
Mercury's pole, near-Earth asteroids, Ceres, Vesta and Psyche, Jupiter's Callisto,
Ganymede, Europa and Io, Saturn's Titan and Enceladus, and Neptune's Triton) behave like
regions: you claim them with an outpost, build mines, ice works, power, research stations
and habitats, and people live, are born and die there. Living off the Earth is expensive:
air, water, food and power must be made or shipped, radiation and low gravity cost
health, and everything you send up needs launch capacity and propellant. Water on the
Moon and the asteroids makes everything beyond cheaper; helium-3 from the lunar maria
fuels better fusion; Psyche is a world of metal; Titan has seas of fuel. Off-world
settlers slowly become new peoples with their own customs and demands for self-rule.

**Getting there takes real technology.** Chemical rockets first, from proving grounds to
launch complexes to reusable spaceports; then electric thrusters and mass drivers,
nuclear thermal and nuclear electric tugs, fusion ships and light sails, and tradition
specials: diesel heavy boosters, steam rockets that burn ice, atomic pulse ships, grown
habitats, telepresence and self-replicating machine miners. Better propulsion makes far
sites reachable in months instead of years. Launch windows matter for chemical and
nuclear-thermal flight.

**Winning is unchanged.** One government for the whole inhabited world (now including
inhabited off-world sites), a jump service you can build, crew, supply and replace, and
two trials. If a rival falls on Earth, its colonies pass to whoever took its last region,
so the Solar System never makes the game unwinnable.

### 0.1 Era and tradition feature table

Eras (section 3). G0-G7 in the unlocks are the military equipment generations that
typically become available in the era (generations are gated by technology, not by the
era label).
Dates are calibration targets for a median all-AI seat.

| # | Era | Median entry | Entry: understood + built | Unlocks (selection) | Charters (choose one) |
| --- | --- | --- | --- | --- | --- |
| 0 | Ancient | 5000 BC | start | G0 warbands; fields, pastures, camps, granaries, healers' lodges, teaching lodges, makers' circles, sacred precincts | none |
| 1 | Classical | 1400-500 BC | T023 iron, T025 writing, T024 or T027; a Town (≥ 1 M residents) | G1 levies; town quarters, roads, aqueducts, archives, armouries, bloomeries, warehouses (with T026), the first heritage-eligible works | Citizen Levy · Road and Law · Academies |
| 2 | Medieval | AD 400-900 | T029, T030, T034 or T031; practice C013; an archive or sacred precinct operating | water and wind mills as a line, guild workshops, scriptoria, colleges, great sanctuaries | Feudal Estates · Guild Charters · Monastic Learning |
| 3 | Early Modern | 1400-1600 | T048, T037, T028; a harbour and a powder works | G2 powder and drill; print shops, powder works, market halls and warehouses, laboratories, ocean trade (doc 36 sea routes of any length) | Chartered Companies · Standing Army · Republic of Letters |
| 4 | Industrial | 1760-1850 | T060, T061, T080 or T062; 10 levels of machine shops, textile mills or steelworks | G3 rifle and rail; steam stations, coke steelworks, tenements, railways, arsenals; **machine tradition offered** | Laissez-faire Works · Factory Acts · National Railways |
| 5 | Modern | 1880-1930 | T100, T102, T091 or T101; 300 units of electricity a month | G4 mechanized; electric arc steel, cold stores, apartment blocks, suburbs, high-rise (with T067), arms plants, pumped irrigation | Mass Mobilization · Welfare State · Planned Electrification |
| 6 | Information | 1960-2010 | T106, T111, T112; a computing centre operating | G5 networked; electronics fabs, computerized administration, wind and solar farms, vertical farms, rocket proving grounds; **frontier tradition offered** | Open Networks · Surveillance State · Automation Drive |
| 7 | Space | 2030-2090 | T142, T144; a launch complex operating 12 months and an off-world outpost or orbital station | off-world sites, transfer fleets, ISRU, habitats, mission control, spaceports (T154) | Frontier Charter · Lunar Industry · Planetary Protection |
| 8 | AI | 2090-2160 | T117, T122; 1,000 units of compute a month and 20 levels of automated-stage works | G6 autonomous (from T114 & T123 & T142), G7 orbital-supported (T145 & T152 & T122); automated mines, robotic factories, autonomous governance, arcologies (T137) | Machine Stewardship · Human Primacy · Compute Commons |
| 9 | Interstellar | 2170-2240 | sealed until the seat's objective is revealed (T164 or T165; jump testbed operating) | the jump programme's works (chapter 35) | sealed |

Traditions (section 4). One per slot; knowledge is never locked, only the exclusive
works and variants. Bonuses marked "×m" scale with mastery (0-100%).

| Tradition | Slot (offered) | Favoured by | Exclusive works and methods | Military variant | Space feature | Culture and religion | Drawbacks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Coal and Steam ("steampunk") | Machine (Industrial) | coal, iron | steam hammer works (machine-shop stage, −15% general posts ×m), district steam networks (T084), high-pressure steam plant earlier (T081 instead of T086), coal-tar chemistry method | Ironclad and rail (G3-G4): coal instead of fuel; line +10% ×m, maneuver −10% | water-steam thermal tugs: propellant is raw volatiles (ice), no cryogenics | Industrial workmanship drifts up; doctrine *Sanctified Labour* doubled | coal hunger; smoke raises town mortality (+10% `M_urban` where ≥ 10 steam levels, until T085 or Factory Acts); railbound armies |
| Oil and Engine ("dieselpunk") | Machine (Industrial) | crude, gas | motor works, cracking refinery (+18% fuel within mass balance), heavy-booster yard (T178) | Heavy armour (G4-G5): fuel ×1.3; shock +10% ×m | heavy-lift boosters: cheapest lift per tonne in components and electronics | Exchange orientation; motor depots +10% gateway capacity | oil dependence; blockade exposure; fuel upkeep |
| Current and Wire ("electropunk") | Machine (Industrial) | rivers (hydro sites), copper | electrified stages one era early (electric arc steel with T101 instead of T103), trams and metros (+25% housing density ×m), launch-assist track (T156) | Electric drive (G4-G6): batteries instead of fuel; maneuver +5% ×m | electric tugs +15% exhaust velocity; mass drivers −25% electricity | Urban organization, Revisability | conductor and copper hunger (+10% conductors in electrical bills); grid faults when a region runs above 95% of its generation |
| Atom ("atompunk") | Frontier (Information) | uranium | compact reactors (fission stage, −40% bill, sited off-world), isotope works (medicine, instruments), reactor process heat for steel and chemicals | Atomic-powered (G5-G7): nuclear fuel 0.002 lots/soldier-month instead of fuel; no fuel degradation | improved nuclear thermal (+8% exhaust velocity), pulse ships at half the trust penalty, compact reactors at any site | Measure, Revisability; conflicts with *Stewardship of the Land* (−3 stability where held) | reactor incident hazard; uranium dependence |
| Network ("cyberpunk") | Frontier (Information) | quartz, rare earths | network operations centres, implant clinics (T119/T120: +10% qualified-post productivity ×m), telepresence hubs (T180) | Cyber-augmented (G5-G7): proficiency cap +1,000; +15% against Synthetic swarms | reusable launch −50% components; telepresence: off-world crews −60% | Openness; consumer goods expected +20% | correlated failure (network incident hazard); electronics and compute upkeep |
| Living Systems ("biopunk") | Frontier (Information) | arable land, fibres, chemicals | biofoundries (chemicals and fuel from food and fibres), living habitats (T179), bio-leaching mining method (+10 points ore delivery, never above what is drawn) | Augmented soldiers (G5-G7): medicine upkeep; casualties −20% ×m | grown habitats (−40% metal), 99% closed life support, radiation-tolerant crews (off-world mortality −20%), bio-ISRU on Mars and Titan | Agricultural stewardship; *Stewardship of the Land* +5% field yield more | long validation (+50% build months for bio works); +20% outbreak hazard in regions with biofoundries |
| Synthetic Minds ("AI-punk") | Frontier (Information) | compute, cheap power | lights-out factories (general posts −70% for electricity and compute), machine governance centres, seed factories (T181) | Autonomous swarms (G6-G7): two times power per soldier, equipment ×1.6, compute upkeep; −15% against Network | uncrewed outposts and mines; seed factories that build further levels from local material | Revisability; labour displacement unrest; conflicts with *Sanctified Labour* | compute and power hunger; unemployment unrest (−2 stability per 10% of posts automated away) |

---

## 1. Scope, principles and how this chapter slots into doc 36

### 1.1 What changes in doc 36

| Doc 36 | Change |
| --- | --- |
| §1 principles | unchanged; "the fixed 138-node technology graph" becomes 157 nodes (19 added, §7.1); 64 practices become 67 (three off-world practices, §6.7) |
| §2 calendar, §2.6 directives | unchanged; new directives (`Modernize`, `UpgradeTarget`, `Supply`) follow the same validation rule; the chronicle's per-round "era summary" is renamed "round summary" in display text (no rule change) to free the word "era" |
| §3 population | unchanged rules; off-world sites add an environment factor to mortality and fertility (§6.4); urban land use limits fields (§8.6) |
| §4 productivity | `F_tech` applies to a works only for technologies of its own era or the next (§8.3); otherwise unchanged |
| §5 goods | 47 → 50 goods (`volatiles`, `propellant`, `helium3`); 15 → 17 deposits (`Volatiles`, `Helium3`); the new facilities are authored as stages of building lines (§8.4); powder mill and arsenal become stages of the arms-works line; unit equipment is written per generation (§2.1) |
| §5.5 consumption | the expected basket is keyed to the era (§3.5) instead of individual technologies |
| §6 trade | unchanged; off-world zones are not market members (they trade through their seat's shipments) |
| §7 victory | unchanged conditions; inhabited off-world sites count as inhabited regions; colonies follow the metropole (§6.9) |
| §9 protocol | additions in §10 below; still `bts-protocol/2.0`, `bts-rules/3.0.0`, `bts-content/3.0.0`, `bts-worldgen/2.0.0` because ruleset 3 is unreleased |
| §10 plan | merged and re-ordered in §11; slices 0-3 unchanged |

### 1.2 The tension with chapter 31 §5, resolved

Chapter 31 §5 says the "punk" patterns "are not exclusive research classes or permanent
era gates". This chapter keeps the first half and revises the second at the user's
request:

- **Knowledge stays non-exclusive.** Every seat can discover and understand every node;
  traditions never hide, lock or slow a technology, and the dynamic discovery rules are
  untouched.
- **Traditions are commitments over what you build.** Each tradition owns a few
  exclusive works, stages, methods and unit variants, buildable only while committed.
  The rest of the economy, including every generic successor stage, is open to all.
- Every route still crosses electricity, electronics, computing and orbit; no tradition
  operates a steam-powered jump drive (chapter 15).

### 1.3 Design rules for this chapter

1. Every new benefit is either a capped labour or yield productivity (doc 36 §4.1
   channels), a mass-balanced method, a capacity bought with real works, or a change in
   which scarce thing is spent. None raises a recipe's output per input.
2. Every new decision has an opportunity cost visible before it is taken: refit vs
   recruit, upgrade vs build-and-demolish vs keep vs heritage, sprawl vs density, commit
   now vs wait, Moon water vs Earth launch.
3. Information isolation: eras and traditions are coarse public facts among seats in
   contact (they show in architecture and armies); everything else is private. The
   building tree is static content, identical for every seat, and names no undiscovered
   technology (§8.9).
4. Simple first: each mechanism has a default the engine applies when the player says
   nothing (automatic upgrades through directives, automatic supply plans, automatic
   method choice), and a cut line (§11.6).

---

## 2. Military modernization

Today (`sim/military.rs`, `content.rs::unit_tiers`) a formation has a fixed `tier` set
at recruitment, six tiers × three roles, power `2.5^tier`, and no way to change its
equipment; militia fight at tier ≤ 1. That is why a jump-age civilization can still
field spear lines. This section replaces tiers with **equipment generations** that a
formation can change in place.

### 2.1 Generations

Per soldier (doc 36 units: t = tonne, lots as in doc 36 §5.2). Roles are always
`[shock, maneuver, line]`; the counter matrix keeps its meaning.

| Gen | Name (shock / maneuver / line) | Era | Requires | Equipment per soldier | Upkeep per soldier-month (besides 1 ration) | Critical goods | Train months | Fit-out points | Power (‰) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G0 | Warbands (melee bands / light hunters / spear lines) | Ancient | - | tools 0.3 lots | - | - | 2 | 0 | 1,000 |
| G1 | Bronze and iron levies (heavy infantry / cavalry / pike formations) | Classical-Medieval | (T022 \| T023) & C016 | metal 0.4 t, or copper 0.35 + tin 0.05; tools 0.3 lots; maneuver +0.3 horses | tools 0.01 | - | 4 | 1 | 2,500 |
| G2 | Powder and drill (assault infantry / rapid columns / field artillery) | Early Modern | T037 & C016 | metal 0.8, materials 0.5, tools 0.3, munitions 1 lot; maneuver +0.3 horses | tools 0.02, materials 0.02, munitions 0.02 (×5 in combat months) | munitions | 6 | 2 | 6,250 |
| G3 (new) | Rifle and rail (rifle battalions / mounted rifles / quick-firing batteries) | Industrial | T060 & T066 & C037 | metal 1.0, components 0.2, tools 0.2, munitions 2; maneuver +0.2 horses | munitions 0.04 (×5), spares 0.005, coal 0.01 | munitions | 8 | 4 | 15,625 |
| G4 (old tier 3) | Mechanized formations (armoured assault groups / motorized raiders / anti-armour positions) | Modern | (T094 \| T068) & T066 & C037 | components 0.8, metal 1.0, fuel 0.3, munitions 2 | fuel 0.05, spares 0.02, munitions 0.04 | fuel, munitions | 9 | 8 | 39,063 |
| G5 (old tier 4) | Networked forces (combined-arms forces / mobile strike groups / air-defence networks) | Information | T112 & T107 & T038 & C037 | electronics 2, components 1.5, fuel 0.5, aluminium 0.1, munitions 2 | fuel 0.1, spares 0.05, electronics 0.02, munitions 0.04 | fuel, electronics | 12 | 16 | 97,656 |
| G6 (old tier 5) | Autonomous systems (unmanned breakthrough groups / distributed swarms / area-denial systems) | AI | T114 & T123 & T142 & C037 | hardware 0.2, electronics 4, components 2, batteries 2, munitions 2 | fuel 0.1, spares 0.08, electronics 0.05, batteries 0.05, munitions 0.04 | electronics, batteries | 12 | 32 | 244,141 |
| G7 (new) | Orbital-supported forces (orbital assault groups / sub-orbital rapid forces / orbital defence lattices) | Space | T145 & T152 & T122 & C037, and an orbital station operating (own or under a joint programme) | hardware 0.5, electronics 6, components 3, batteries 3, aluminium 0.2, magnets 0.05, munitions 2 | spares 0.1, electronics 0.08, batteries 0.05, propellant 0.02, munitions 0.04 | electronics, hardware | 15 | 64 | 610,352 |

There is no interstellar generation: the jump service is a programme (chapter 35), not
an army. Doc 36's changes to unit equipment (copper and tin, horses, munitions,
aluminium, batteries) are carried into this table.

### 2.2 Power and counters (explicit revision)

- Power per soldier stays `2.5^gen` in thousandths, now over eight generations
  (`TIER_POWER` → `GEN_POWER: [i64; 8]`, values in the table). Inserting G3 means that a
  powder army now meets mechanized formations at 6.25:1 instead of 2.5:1 per soldier.
  This is deliberate: rifled arms, machine guns and quick-firing artillery separated the
  musket age from the motor age, and the 3.0 calendar gives that step 100 years of
  play. Same-generation matchups are unchanged.
- The counter matrix `COUNTER` is unchanged and applies when the two sides' mean
  generations (power-weighted, thousandths) differ by less than 2. When the gap is 2 or
  more, the older side's counter factor is a flat 8,000 and the newer side's 10,000:
  cavalry does not outflank machine guns, whatever the mix.
- A formation's effective generation is `gen − degradation` (§2.5); a formation in
  refit fights at the blend of §2.3.
- Everything else in battle resolution (proficiency, supply, morale, terrain, the
  three-to-one rule, five-month capture) is unchanged.

### 2.3 Refit in place

Action `refit { army, to_gen }` (also reachable from `manage_army`):

- **Valid** when the formation is the seat's own, not in initial training, stands in a
  region the seat both owns and controls and is not contested this month; `to_gen` is
  above its generation and at most the best generation whose requirement the seat
  meets. Skipping generations is allowed.
- **Bill**: `equipment(to_gen) × soldiers`, committed from stock as it becomes available
  and never refunded (as construction goods are). Nothing of the old kit is credited
  against it; the old kit goes to the kit store (§2.4).
- **Fit-out**: `fit(to_gen) × soldiers` points from the nation's arms-works capacity
  (§2.3.1), shared each month among refits and recruitments in queue order.
- **Barracks places**: soldiers in refit occupy barracks places (`Cap::Barracks`, 200,000
  per level) in that region; without places the refit waits.
- **Retraining**: `ceil(train_months(to_gen) / 2)` months, or the full training months
  when skipping a generation; only months without battle count.
- **Progress** each month: share `s = min(goods committed share, fit-out share,
  retraining share)`; the formation has `s × soldiers` at the new generation, and its
  power per soldier is `P(old) × (1 − s) + P(new) × s`. Proficiency is capped at
  `6,000 + 3,000 × s` during the refit (retraining dip). Upkeep is the old generation's
  for `1 − s` and the new one's for `s`. A battle month pauses progress.
- **Completion**: `gen = to_gen`, the cap lifts, and soldier sets of the old generation
  equal to the soldiers go to the kit store.
- **Why it is cheaper than new**: no new people leave the workforce, training is half,
  the formation keeps its experience above the dip, and the old kit is not wasted. It
  still costs the whole new equipment bill, the arms-works capacity and months.

Directive `modernize { armies: all | [ids], to: best | gen, priority }` (doc 36 §2.6
rules): each 1 January it starts refits for listed formations at least one generation
behind the target when arms-works capacity has room and the stock covers at least a
quarter of the bill.

#### 2.3.1 Arms works (fit-out capacity)

A new building line (§8.4) whose levels give **fit-out points** per month (provisional).
Doc 36's powder mill and arsenal become its second and third stages and keep their
munitions recipes.

| Stage | Requires | Fit-out points per level-month | Crew per level | Service | Munitions recipe |
| --- | --- | --- | --- | --- | --- |
| Armoury | T023 & C016 | 20,000 | 1,000 smiths or artisans + 2,000 general | - | - |
| Powder works and armoury | T036 | 40,000 | as doc 36 powder mill + 1,000 artisans | - | doc 36 powder mill |
| Arsenal | T064 | 50,000 | 1,000 mechanics + 1,000 technicians + 2,000 general | 10 shaft | doc 36 arsenal |
| Arms plant | T094 & T066 | 200,000 | 2,000 mechanics + 1,000 technicians + 4,000 general | 40 electric | arsenal recipe |
| Defence systems plant | T106 & T114 | 600,000 | 2,000 technicians + 1,000 programmers + 1,000 electricians + 2,000 general | 80 electric | arsenal recipe |
| Autonomous systems plant | T122 & T114 | 1,500,000 | 2,000 AI engineers or programmers + 2,000 technicians + 500 general | 150 electric, 50 compute | - |

Example: refitting 200,000 soldiers from G4 to G5 takes 3.2 million points (two levels
of defence systems plants for under three months), 400,000 lots of electronics (twenty
level-months of integrated electronics cells) and six months of retraining. Equipment
and retraining, not the plant, usually set the pace. Recruitment of G1 or later now
also takes fit-out points (it already takes the equipment goods).

### 2.4 Kit store, reserves and militia

- **Kit store** `Civ.kit: [u32; 8]`, soldier sets by generation. In: sets released by
  completed refits, disbanded formations, sets completed by a cancelled refit
  (`floor(committed share × soldiers)`). Out: recruitment at that generation (sets
  replace the equipment bill and the fit-out points), arming militia (sets are used, not
  consumed), scrapping. `scrap_kit { gen, sets }` returns as metal at most 20% of the
  mass of metal, components and aluminium in the sets' bill, booked as `salvaged`.
  Stored sets of G3 or later cost 0.002 lots of spares per set-month. Ledger identity:
  sets in = sets out + scrapped + change in store.
- **Reserves**: `set_reserve { army, on }` in a governed region. On: the soldiers return
  to the region as working adults (`return_adults`), the formation keeps
  `enrolled = soldiers`, its role shares, its kit and its generation; proficiency falls
  50 bp a month to a floor of 4,000; `enrolled` falls 2% a year (age); upkeep is 10% of
  the generation's. Off (mobilization): three months, after which up to `enrolled`
  adults aged 18-49 are drawn from the region (`draw_adults`); fewer if fewer are there.
  People are never in two places: reservists are residents until drawn.
- **Militia**: home defence keeps one working adult in forty, at most 500,000, at 40% of
  power, but its generation becomes `max(0, best − 2)`, raised to the best generation
  of which the kit store holds enough sets (never above `best`). A G7 civilization's
  militia fights with G5 kit; a powder-age one with G1 pikes. This replaces
  `military_tier(w, ctrl).min(1)`.

### 2.5 What an army fights with when supplies fail

Each formation's month of upkeep reports a **critical-goods share** `c` = the least share
received of its generation's critical goods (table 2.1; variants in §2.6 substitute).

- `c < 5,000` for three consecutive months: **degraded one generation** ("vehicles
  parked, fighting dismounted": a G5 army without fuel fights as G4).
- `c < 2,000` for three consecutive months: degraded two generations.
- One month at `c ≥ 8,000` restores it. `supply_bp` keeps acting on quality as today.
- Without oil a civilization can still field G3 (coal), the Coal and Steam variant of G4
  (coal-fired armoured trains), or the Current and Wire variant (batteries); without
  aluminium it cannot recruit or refit to G5 (the bill is not met) but existing G5
  formations fight on while their upkeep lasts; without electronics G5-G7 degrade.

### 2.6 Tradition variants

Variants are automatic for formations recruited or refitted while the tradition is held
and stay until the next refit. Swaps apply fully; bonuses scale with mastery.

| Tradition | Variant | Gens | Swap | Bonus |
| --- | --- | --- | --- | --- |
| Coal and Steam | Ironclad and rail | G3-G4 | fuel → coal ×2 (t) | line +10%; maneuver −10% |
| Oil and Engine | Heavy armour | G4-G5 | fuel ×1.3 | shock +10% |
| Current and Wire | Electric drive | G4-G6 | fuel → batteries 0.05 lots | maneuver +5% |
| Atom | Atomic-powered | G5-G7 | fuel → nuclear fuel 0.002 lots | immune to fuel degradation |
| Network | Cyber-augmented | G5-G7 | electronics upkeep ×1.5 | proficiency cap +1,000; +15% power against Autonomous swarms |
| Living Systems | Augmented soldiers | G5-G7 | + medicine 0.02 lots | own losses −20% |
| Synthetic Minds | Autonomous swarms | G6-G7 | equipment ×1.6; + 1 unit of compute per 1,000 soldier-months | power per soldier ×2; −15% against Cyber-augmented |

### 2.7 Obsolescence and recruitment

- A formation is **obsolete** when `gen ≤ best − 3`: morale capped at 6,000, upkeep
  +50% (spares and tools for patterns no longer made), flagged in the view.
- **Recruiting** below `best − 1` is refused unless the seat cannot currently fit out
  `best − 1`: stock below a quarter of that bill or no arms-works capacity this month.
  The receipt says why ("cannot fit out generation 5: short of electronics"). Recruiting
  from the kit store is allowed at `best − 2` or better. So a jump-age civilization
  fields spearmen only if it truly has nothing else.

### 2.8 Native AI

- Each round, for each formation, value of a refit = `(P(target) − P(gen)) × soldiers`
  per unit of the refit's bill valued at market or base prices. Target = best
  generation whose bill the seat can cover within 24 months.
- Always refit formations `≥ 2` behind; refit `1` behind when at war, when a met seat's
  estimated mean generation is ahead, or when the round's spare equipment goods allow.
  Frontier formations first (regions bordering a seat with trust below 40).
- Keep a reserve of formations at `best − 1` (10-25% of soldiers by difficulty) instead of
  disbanding; scrap kit only of generations below militia level.
- Build arms works so that one year of capacity covers a refit of half the army.
- Never recruit below `best − 1` while the bill can be met; disband obsolete formations
  whose refit cannot be paid within 36 months.
- Writes `modernize` directives in long rounds. Difficulty changes breadth (Easy refits
  only formations two behind, in peace), never information.

### 2.9 Ledgers and tests

- Equipment, fit-out points (`used ≤ capacity`), kit sets (identity above), salvaged
  metal (`≤ 20%` of the scrapped mass), reservists (residents; army counts only
  serving soldiers), people drawn on mobilization `≤ enrolled`.
- Tests: refit power blend; a refit cannot exceed its bill or capacity; an army without
  fuel degrades after three months and recovers; militia generation follows kit; no
  recruitment of G0 by a seat that can fit out G5; save/load mid-refit; determinism.

---

## 3. Eras

### 3.1 Options considered

| Option | Why not, or why |
| --- | --- |
| Eras by date ("1500 is the Early Modern era for everyone") | contradicts emergent pacing (doc 36 §2.7); no decision |
| Eras by technology count or tier | invisible and gameable by researching cheap nodes; ignores what is built |
| Eras as a research node | the graph is hidden and fixed; an era node would leak structure |
| Eras as a mix of the "punk" flavours (steampunk era, cyberpunk era) | conflates *when* with *which way*; locks a civilization into one look |
| **Chosen: a ladder of ten eras reached by understood knowledge plus a built proof, with traditions as a separate axis (section 4)** | readable, emergent, gives the player control over the moment of crossing, and creates a preparation decision |

### 3.2 The ladder

`Civ.era: u8` (0-9) and `Civ.era_since: Month`. Checked every 1 January and in the
first month of a round. An era is entered when *every* condition of its row holds
(understood technologies; established practice; the built proof running in the seat's
governed regions at half rate or better). Eras never regress: losing the proof later
has no era effect (the dark-age rule punishes collapse instead). Eras can be skipped
only one at a time per check (a seat that conquers a modern region still climbs one era
a year).

The entry conditions and target windows are in table 0.1. The built proofs, exactly:

| Era | Built proof (all in governed regions) |
| --- | --- |
| Classical | a region with at least 1,000,000 residents (Town class) |
| Medieval | an archive and house of study, or a sacred precinct, operating |
| Early Modern | a harbour, and an armoury line works at stage 2 or later (powder works) operating |
| Industrial | at least 10 levels in total of machine shops, textile mills and steelworks, operating |
| Modern | electricity made in the last month of at least 300 units (30 GWh) |
| Information | a computing centre operating |
| Space | a launch-chain works at the launch-complex stage or later that ran at half rate or better in each of the last 12 months, and an off-world outpost or an orbital station |
| AI | compute made in the last month of at least 1,000 units, and at least 20 levels of works at an AI-era stage |
| Interstellar | a jump testbed operating (sealed, see 3.6) |

Calibration windows (median seat, all-AI, standard calendar): table 0.1; leaders up to
one era ahead of the median after AD 1; no seat more than two eras ahead of the median
before 1900.

### 3.3 Transitions, golden ages and dark ages

**Transition period** after entering era `e`, in real months `T_e`: Classical 600,
Medieval 600, Early Modern 360, Industrial 240, Modern 180, Information 120, Space 120,
AI 120, Interstellar 120.

**Strain** during the transition: stability `−(2 + 6 × obsolete share)` points in every
governed region, where obsolete share = filled posts in works two or more eras behind
`e` ÷ all filled posts. A faction line "The old order resists" names the share and the
works. The decision this creates: cross early (new features sooner, more strain) or
modernize first (the built proof is in your hands, so you choose when to cross).

**Transition score** at the end of `T_e` (0-100, four parts of 25):

| Part | 25 points | 0 points |
| --- | --- | --- |
| Food | average food access ≥ 9,500 bp | ≤ 8,000 bp (linear between) |
| Order | average stability ≥ 60 | ≤ 35 |
| Modernization | ≥ 60% of filled posts in works of era `e` or `e − 1` at the end | ≤ 20% |
| Integrity | none of: a governed region lost to another seat, an epidemic or famine killing > 2% of the people, a repudiated treaty | −10 per event, floor 0 |

| Score | Age | Duration | Effects |
| --- | --- | --- | --- |
| ≥ 75 | **Golden age** | `2 × T_e` | stability +5; discovery channel `C` ×1.10; construction productivity +1,000 bp (within doc 36's 15,000 cap); a second charter of this era may be held at the same time |
| 40-74 | Steady | - | none |
| < 40 | **Dark age** | `T_e` | stability −5; research capacity −10%; but practice reforms and tradition switches cost half and take half the time, and recruit room +10% (crisis opens doors) |

Ages are chronicle moments ("A golden age of the Industrial era begins"). Ancient has no
transition. The score parts and their sources are shown during the transition.

### 3.4 Era charters

One charter per era (two in a golden age), chosen from three by `choose_charter
{ charter }` once the era is entered; the previous era's charter lapses at the next era.
Changing within the era: stability −3 for 60 months and 240 months before the next
change (free in a dark age). Effects are bounded and each has a cost (provisional):

| Era | Charter | Effect | Cost |
| --- | --- | --- | --- |
| Classical | Citizen Levy | recruit room +25%; G1 training −1 month | stability −2 in years of peace |
| Classical | Road and Law | administrative capacity +1 region per office level; roads −30% work | media upkeep of offices ×1.5 |
| Classical | Academies | Scholarly research +15%; discovery channel +5% | 500 scholars a year withheld from posts as teachers of the academies |
| Medieval | Feudal Estates | militia ×1.5; unrest −1,000 bp in occupied regions held 10 years | callable labour −10% |
| Medieval | Guild Charters | `F_cul` Industry +500; artisan and smith training +20% places | construction productivity −500 (guild rules) |
| Medieval | Monastic Learning | archives and precincts +25% research; media upkeep −30% | `F_custom` −200 (celibate orders) |
| Early Modern | Chartered Companies | sea gateway capacity +50%; sea route loss −20% | stability −2 (company abuses) |
| Early Modern | Standing Army | G2-G3 proficiency cap +1,000 | army upkeep +10% |
| Early Modern | Republic of Letters | discovery channel +10%; contact evidence (doc 36 `X`) +25% | foreign seats' contact evidence from you +25% too |
| Industrial | Laissez-faire Works | Industry `LP` +500 | stability −2; `M_urban` +5% |
| Industrial | Factory Acts | stability +3; `F_health` +300 | Industry `LP` −300 |
| Industrial | National Railways | railway −30% work and bill; gateway capacity +25% | rail upkeep +25% coal |
| Modern | Mass Mobilization | recruit room +50%; fit-out points +20% | consumption level forced ≤ 9,000 |
| Modern | Welfare State | stability +4; `F_dev` +300 (smaller families slow less) | basket expected +15% |
| Modern | Planned Electrification | generator halls, grid and hydro −30% work | Services `LP` −300 |
| Information | Open Networks | discovery +10%; contact evidence +25% | network incident hazard ×2 |
| Information | Surveillance State | stability +5; occupied unrest −1,500 bp | discovery −5%; Openness drifts down |
| Information | Automation Drive | `F_auto` cap +1,000 | unemployment unrest −1 stability per 10% of posts automated |
| Space | Frontier Charter | off-world autonomy pressure −50%; settler volunteers +50% | site exports capped at 75% |
| Space | Lunar Industry | off-world construction work −25% | Planetary-protection evidence 0 (no life search) |
| Space | Planetary Protection | off-world research +25%; life-search time −50% | off-world mining output −25% |
| AI | Machine Stewardship | administrative capacity +50% | stability −3 where *Human Primacy*-type doctrines are held (*Sanctified Labour*, *Day of Rest*) |
| AI | Human Primacy | stability +5 | `F_auto` capped at 12,500; no Autonomous swarms |
| AI | Compute Commons | compute may be supplied by treaty clause (`Clause::Compute`); Advanced and Frontier research +10% | 10% of compute made is withheld for the commons |

### 3.5 Rising expectations

Doc 36 §5.5's expected basket is keyed to the era instead of individual technologies
(per 1,000 residents per month; luxuries unchanged):

| Era | Textiles (lots) | Consumer goods (lots) |
| --- | --- | --- |
| Ancient-Medieval | 0.15 | - |
| Early Modern | 0.25 | - |
| Industrial | 0.4 | 0.2 |
| Modern | 1.0 | 1.0 |
| Information | 1.0 | 2.5 |
| Space, AI, Interstellar | 1.0 | 3.0 |

Entering an era raises what the people expect; prosperity (doc 36) falls if supply does
not follow. This makes "rushing" an era costly for a civilization without consumer
industry and is the main reason a golden age needs preparation.

### 3.6 Visibility

- Own: `EraView` (era, since, transition with strain and the score so far, age and its
  end, charter and options, next era with its conditions: understood technologies named
  if discovered, otherwise "an undiscovered technology of the <era> era in <domain>").
- Others: the era and the traditions of every met seat are public (`ForeignCiv.era`,
  `ForeignCiv.traditions`), because they show in its works, armies and goods.
- The static era table is part of the public building tree (§8.9) with masked
  requirements. Era 9 (Interstellar) is absent from the static table and from the
  views of a seat whose objective is not revealed (`victory_revealed`), so the ladder
  does not disclose the final objective.
- Diplomacy: a seat two or more eras ahead of a met neighbour lowers the native AI's
  acceptance threshold for subordination offers from it by 20% and gives the laggard
  +25% contact evidence (diffusion from the leader); a laggard native AI raises its
  threat estimate of the leader by the power ratio of their best generations.

---

## 4. Traditions (paths)

### 4.1 Slots, commitment, mastery and switching

- Two slots: **machine** (offered from entering the Industrial era) and **frontier**
  (offered from entering the Information era). A seat may leave a slot **Unaligned**
  for ever (no exclusives, no drawbacks).
- `choose_tradition { slot, path }`. From Unaligned it takes effect at once.
- **Mastery** (0-10,000 bp) starts at 0, grows 200 bp a year while the tradition's
  *signature works* (table below) hold at least 5% of the seat's filled industry and
  power posts, otherwise falls 100 bp a year. Bonuses marked ×m scale linearly with it;
  swaps and the right to build exclusives do not. Full mastery takes 50 years.
- **Switching** to another path in the same slot starts a *tradition reform*: work
  2,000,000 worker-months, 500 lots of media, at least 120 months, stability −5 while it
  runs. On completion the new path is held with mastery = old mastery / 4. Exclusive
  works of the old path keep running at their base figures (no bonuses), count as
  obsolete for upkeep, and cannot be built or upgraded except into generic stages. A
  further switch in that slot is refused for 600 months. A dark age halves the work and
  the months.
- Combining: only one path per slot is ever held; the two slots combine freely
  (Oil and Engine + Network is the classic megacorporate future; Coal and Steam +
  Living Systems an odd but legal one).

| Tradition | Signature works (mastery) | Exclusive works, stages and methods (requirements) |
| --- | --- | --- |
| Coal and Steam | steam stations, coke steelworks, railways | Steam hammer works (machine-shop stage, T080 & T061); district steam network (T084: steam stations deliver +10% of their shaft as heat that replaces 10% of the coal of chemical works and housing in the region); high-pressure steam plant from T081; coal-tar chemicals method (chemical works: 6 coal + 2 materials → 7 chemicals, mass-balanced); water-steam thermal tug (T157 or T159) |
| Oil and Engine | refineries, diesel stations, motor depots | Motor works (T091 & T066: vehicles as components for depots, farms and the army; −20% fuel in mechanized fields); cracking refinery (refinery stage, T092: 20 crude → 13 fuel + 5 chemicals); heavy-booster yard (spaceport variant, T178) |
| Current and Wire | generator halls, hydroelectric works, grid | electric arc steelworks and electrified railway one technology earlier (T101 instead of T103 or T102); trams and metros (T101 & T068: +25% housing density in the region ×m); launch-assist track (spaceport variant, T156) |
| Atom | fission plants | compact reactor (fission stage, T147: −40% bill, 400 units a level, may be built at off-world sites); isotope works (T146: instruments and medicine from nuclear fuel, small); reactor process-heat method for steelworks and chemical works (electricity replaces coal at the fission plant's rate); pulse ship (transfer-fleet method, T182) |
| Network | computing centres, electronics cells | network operations centre (T112 & T123: national compute +5% ×m, network incidents −50%); implant clinic (T119: +10% `LPq` ×m in its region); telepresence hub (T180) |
| Living Systems | biofoundries, pharmaceutical and biological works, restorative fields | biofoundry (T132: chemicals from food and fibres, 10 food + 2 fibres → 8 chemicals; biofuel method 12 food → 6 fuel); living habitat (off-world, T179); bio-leaching method at mines (T131) |
| Synthetic Minds | computing centres, works at AI-era stages | lights-out factory method at robotic factories (T122: general posts −70%, +60 electric and +40 compute per level); machine governance centre (T125: administrative capacity +6 regions per level); seed factory (off-world, T181) |

### 4.2 Interactions

- **Resources.** The favoured resources in table 0.1 are what the exclusives consume;
  a coal-poor seat can still hold Coal and Steam and buy coal (doc 36 market), but its
  mastery grows only while its signature works run. The native AI chooses by endowment
  (4.3).
- **Culture.** Each tradition pulls one or two cultural tendencies by +50 bp a year
  while held (within chapter 31's 150 bp yearly drift limit). A held tradition whose
  pulled tendency is already above 6,000 grows mastery 50% faster.
- **Religion.** Doctrine interactions in table 0.1 act through `F_rel` and stability in
  regions where the faith is the majority, as named breakdown lines.
- **Diplomacy.** Tradition is public among met seats. A joint programme (chapter 35)
  between seats holding the same path in either slot costs the served partner one third
  instead of one half of the installation's inputs, upkeep and electricity ("compatible
  standards"). The native AI's trust drifts +1 a decade (at most +10) toward seats sharing
  a path. Building a pulse ship costs −10 trust with every met seat once (Atom: −5).
- **Hazards** (secret streams, deterministic, reported to the owner and to seats that
  observe the region): reactor incident (Atom; per fission level per year 1 in 2,000:
  2% of the region's people resettled to neighbours, stability −10 there for 60 months);
  network incident (Network, Open Networks; per year 1 in 40 when national compute >
  500: compute and electronics output −30% for 6 months); biofoundry contamination
  (outbreak hazard +20%, already in table 0.1); grid fault (Current and Wire; a region
  whose electric demand exceeded 95% of its supply for three months loses 10% of its
  electric works' rate for the next month).

### 4.3 Native AI

- Machine slot, chosen 20-60 years after the offer (Hard waits until it has surveyed its
  deposits): Coal and Steam if known coal within three links ≥ 2 × known crude; Oil and
  Engine if crude ≥ coal / 2 and it holds or can import crude; Current and Wire if it
  governs ≥ 3 hydro sites and copper; else Unaligned.
- Frontier slot: Atom if uranium within reach and no *Stewardship* doctrine; Living
  Systems if arable per resident is in the top half of met seats or metals are scarce;
  Network if quartz and rare earths are within reach; Synthetic Minds if labour is the
  binding constraint (vacant posts > 10%) and electricity is in surplus.
- Switches only in a dark age or when the favoured resource has been cut off for 20
  years. Charters: scored against its strategy weights (expansion, research, trade,
  war) with the costs in 3.4.

---

## 5. The map: an Earth-like home world, or the real Earth

`MatchConfig.world: WorldKind { EarthLike (default), RealEarth, Classic }`. `Classic` is
today's flat generator, kept only for unit-test fixtures. Region counts stay 24/48/72
for `EarthLike` (48 standard); `RealEarth` has 48 regions. Doc 36's settlement scale,
arable ranges (×3), deposits, guarantees and population targets apply to both.

### 5.1 The generated Earth-like world (default)

Geometry: an equirectangular map of 2,000 × 1,000 integer units whose x axis **wraps**
(the date line is not an edge). Region polygons may cross the seam; they are stored with
x in [0, 2,000) and the client draws a copy across it. Movement, carriage, routes and
battles use links only, so the wrap changes adjacency and drawing, nothing else. Polar
caps above 72° latitude are drawn as ice, not regions.

Generation (`bts-worldgen/2.0.0`, the same version doc 36 slice 4 needs, keyed integer
hashes as today, floats only in the existing deterministic IEEE operations):

1. **Plates.** 7-9 plate seeds on the sphere (latitude/longitude from the seed); each
   cell joins the nearest seed with noise; 35-40% of plates are continental.
2. **Elevation.** Continental plates high, oceanic low; convergent boundaries between a
   continental plate and another plate raise mountain belts; divergent ones lower rifts;
   fractal noise on top. Land = the highest cells, with land cells ≈ 30% of all cells
   and `cfg.regions` land regions (cells per region as today).
3. **Climate.** Temperature from latitude (cosine) minus a lapse rate with height.
   Moisture by latitude band (wet equatorial belt within 10°, dry subtropics at
   15-35°, wet westerlies at 40-60°, dry poles), reduced with links from the coast
   (continentality) and behind mountains in the prevailing wind (east of ranges at 35-60°,
   west of ranges below 30°).
4. **Terrain.** A Whittaker-style table maps (temperature, moisture, height) onto the
   existing eight terrains; a new region attribute `climate: ClimateZone { Tropical,
   Arid, Temperate, Continental, Polar }` drives doc 36's shared harvest draws and the
   map's colours (no new `Terrain` variants).
5. **Rivers** downhill as today; floodplains on large rivers (doc 36 bonus).
6. **Geology-correlated resources** (doc 36 table 5.3 sizes and counts, placement
   biased by geology): copper and tin along convergent belts (porphyry and granite),
   iron on old continental shields and belts, coal in temperate and tropical lowland
   basins of continental interiors, crude and gas in sedimentary basins (deserts,
   steppes, marshes, tundra, coastal shelves), bauxite on warm wet plains and hills,
   lithium in arid basins next to mountains, uranium and rare earths on shields and in
   mountains, saltpetre in deserts. Doc 36's guarantees are enforced afterwards exactly
   as specified there.
7. **Starts** on temperate or subtropical river regions with a floodplain, at least four
   links apart, passing the viability checks.

Calibration constraint: the mean and spread of arable, pasture, forest and water per
region must stay within ±10% of the doc-36 generator over 1,000 worlds, so that slice 2's
population calibration remains valid.

### 5.2 The real Earth (optional at setup)

- **48 regions on real geography**, authored once: seed points chosen by hand on real
  physiography (for example Nile Valley, Mesopotamia, Indus, Ganges Plain, Yellow River
  Plain, Yangtze Basin, Danube Basin, Mesoamerica, Andes, Niger Basin, Congo Basin,
  Great Plains, Amazon, Siberian Plain, Australian Interior), cells assigned on land,
  borders smoothed. Names are geographic; no polities, no historical scripting.
- **Attributes** per region (terrain, climate, arable, pasture, forest, fishery, water,
  hydro sites, coast, rivers) derived from elevation and land cover and rescaled to doc 36
  ranges, so that a real region is as productive in game units as a generated one of the
  same kind.
- **Deposits on real geology**: each kind placed in the regions holding major real
  deposits (copper in the Andes, tin in South-East Asia and Cornwall-Bohemia, coal in the
  Appalachians, Ruhr, Shanxi and Bengal, crude in the Gulf and Arabia, and so on),
  sized by doc 36's size bands. Where real geology fails a doc 36 guarantee within three
  links of a start, the nearest real deposit of that kind is enlarged to meet it ("game
  scaling", listed in the data file).
- **Balanced starts**: six to eight cradle regions; a precomputed list of four-cradle sets
  that pass the viability checks, are at least four links apart and score within 10% of
  each other on arable, water and deposits within three links. The seed picks the set
  and the seat order.
- **Storage**: `content/earth/earth48.json` (polygons simplified to about 80 vertices,
  integer map coordinates, attributes, deposits, links; about 100 KB), embedded with
  `include_str!` and hashed into the content version; a client relief raster
  `apps/web/public/earth/relief-2048x1024.webp` (about 400 KB). Both are produced offline
  by `tools/earth/` from downloaded sources that are not committed.
- **Licensing: public-domain sources only.** Natural Earth (coastlines, land, lakes,
  rivers; public domain), NOAA ETOPO 2022 relief (U.S. government work, public domain),
  NASA MODIS MCD12C1 land cover (NASA data, no use restrictions), USGS Mineral Resources
  Data System and USGS world petroleum and coal assessments (U.S. government works,
  public domain). Datasets under CC BY or CC BY-SA (for example the common Köppen
  climate grids or WorldClim) are not used; climate is derived from relief, latitude and
  land cover. `content/earth/SOURCES.md` records dataset, version, URL, checksum and
  licence statement for each.

### 5.3 Zoom

One continuous zoom in both map modes: region detail → continent → whole globe (3D: a
sphere textured from the region map; flat: the full wrapped atlas) → Earth and Moon →
inner system → outer system. The Solar System is drawn as a schematic orrery with real
orbital periods and logarithmic distances; bodies sit at their computed phase for the
current month (section 6.1).

---

## 6. The Solar System

### 6.1 Bodies, zones and what each seat knows

Bodies are public astronomy, with fixed content: name, mean orbital radius (milli-AU),
period (months), radius, surface gravity (bp of Earth's), solar factor (sunlight relative
to Earth orbit, bp, `10,000 / r²`), and phase at the start month. The phase in a month is
`(phase0 + month × 360,000 / period) mod 360,000` (millidegrees, integer), used for
drawing and windows. The Sun, Moon, Mercury, Venus, Mars, Jupiter and Saturn are in every
seat's view from the start (naked-eye objects); Jupiter's moons, Titan, the asteroids,
Uranus, Neptune and Triton appear after the seat understands T041 (precision optics).
Site resources are hidden until the seat flies a **survey mission** (project: T142 &
T143, 50 t delivered to the body, 5 lots of instruments and 20 lots of electronics),
which reveals every site of that body to that seat.

Logistics zones (each holds a per-seat store, section 6.5): **Earth** (the existing
national pool), **Earth orbit**, **Moon**, **near-Earth asteroids**, **Mars**, **Venus**,
**Mercury**, **Main Belt**, **Jupiter**, **Saturn**, **Neptune**. Sites in one zone share
its store (surface and local transport are inside the zone).

### 6.2 The nineteen sites

Each site is a region (`RegionKind::Offworld { body, zone }`, ids after the home-world
regions, no land links). Habitat capacity is the most residents its terrain allows
(habitat levels × housing per level, section 6.4). Deposits use doc 36 kinds plus
`Volatiles` (water and other ices, t) and `Helium3` (kg lots). Sizes provisional.

| # | Site | Zone | Gravity | Env. mortality (bp) | Deposits | Habitat cap | Solar | Speciality |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Shackleton Rim (lunar south pole) | Moon | 0.17 | 10,800 | volatiles 300 Mt | 1.0 M | 12,000 (ridge light) | the ice and propellant hub of cislunar space; mass-driver site |
| 2 | Mare Imbrium | Moon | 0.17 | 10,800 | helium-3 50 t, iron ore 2,000 Mt (ilmenite, quality 6,000), rare earths 50 Mt (KREEP) | 0.5 M | 10,000 | helium-3 for fusion; mass driver |
| 3 | Daedalus (lunar far side) | Moon | 0.17 | 10,800 | - | 0.1 M | 10,000 | radio-quiet observatory: evidence ×2 for T151, T160, T161 |
| 4 | Amor cluster (near-Earth asteroids) | NEA | ~0 | 11,000 | iron ore 500 Mt (native metal, quality 9,500), cobalt-nickel 50 Mt, precious 0.05 Mt, volatiles 100 Mt | 0.05 M | 10,000 | the cheapest metal and water off the Earth |
| 5 | Arcadia Planitia | Mars | 0.38 | 10,500 | volatiles 2,000 Mt | 5 M | 4,300 | the main colony site |
| 6 | Valles Marineris | Mars | 0.38 | 10,500 | iron ore 3,000 Mt, salt 500 Mt (sulfates and chlorides) | 1.5 M | 4,300 | Martian industry |
| 7 | Jezero Delta | Mars | 0.38 | 10,500 | volatiles 200 Mt | 0.5 M | 4,300 | astrobiology station (life search, 6.8) |
| 8 | Aphrodite cloud station | Venus | 0.90 | 10,300 | atmosphere: chemicals (extractive, unlimited at 2 kt per level-month) | 0.5 M | 19,000 | floating habitats near one gravity (births at the full rate); almost no export (deep well) |
| 9 | Prokofiev (Mercury north pole) | Mercury | 0.38 | 11,500 | volatiles 50 Mt, iron ore 2,000 Mt | 0.25 M | 66,000 | power and the beam station for light sails |
| 10 | Ceres | Belt | 0.03 | 11,000 | volatiles 5,000 Mt, saltpetre-equivalent ammonia salts 200 Mt | 2 M | 1,300 | hub of the Belt; nitrogen for fertilizer |
| 11 | Vesta | Belt | 0.03 | 11,000 | iron ore 3,000 Mt | 0.5 M | 1,300 | |
| 12 | Psyche | Belt | 0.01 | 11,000 | iron ore 20,000 Mt (native metal, quality 9,800), cobalt-nickel 500 Mt, precious 1 Mt | 0.1 M | 1,000 | a world of metal: platinum-group metals and superalloy inputs |
| 13 | Callisto (Valhalla) | Jupiter | 0.13 | 10,800 | volatiles 10,000 Mt | 1.5 M | 370 | outside the radiation belts; Jovian staging base |
| 14 | Ganymede | Jupiter | 0.15 | 11,500 | volatiles 10,000 Mt | 2 M | 370 | the largest moon, partly shielded by its own field |
| 15 | Europa | Jupiter | 0.13 | 14,000 (13,000 under ice) | volatiles | 0.25 M | 370 | the ocean: astrobiology (life search) |
| 16 | Io | Jupiter | 0.18 | uninhabitable | chemicals (sulfur, extractive) | 0 | 370 | plasma-torus science (evidence ×2 for T148); only uncrewed works (Synthetic Minds or telepresence) |
| 17 | Titan (Kraken Mare) | Saturn | 0.14 | 10,300 | crude-equivalent hydrocarbons 50,000 Mt, volatiles | 4 M | 110 | thick nitrogen air (no pressure suits, cheap entry); a world of fuel |
| 18 | Enceladus | Saturn | 0.01 | 11,000 | volatiles | 0.1 M | 110 | plumes: astrobiology (life search) |
| 19 | Triton | Neptune | 0.08 | 11,000 | volatiles | 0.25 M | 11 | the frontier: evidence ×2 for T161 |

Off-world total habitat capacity is about 20 million: in a strong late game a few
million people live off the Earth (≤ 2% of the world), enough to matter for research,
culture and goods without changing doc 36's population targets.

### 6.3 Sites as regions: what is the same and what differs

The same: population blocks with 81 age cells, births and deaths, qualifications,
schooling, facilities and their crews, construction queues and quotes, control and
ownership, occupation and capture, unrest, culture drift, the region's chronicle.
Different:

- no land or sea links; people and goods move only by shipments (6.5); no migration to
  or from the Earth except shipped settlers and returning crews;
- no fields, pastures, forests, fisheries, wild food, natural water or outbreak spread;
  food, water and air come from habitat works, life support and shipments;
- the site's works take inputs from and deliver outputs to its **zone store**, not the
  national pool;
- off-world construction: work ×1.5 and minimum months ×1.25 (×1.0 with T170), crews
  must be resident at the site;
- administration: a site counts as two regions of administrative load (three beyond
  Mars); works beyond Mars run at half rate unless the seat operates a mission control
  and deep-space network (T175, one per seat, on the Earth);
- Earth civic works (school, clinic or hospital, administrative offices, barracks) may be
  built at inhabited sites on the same terms, their bills delivered like any other.

### 6.4 Environment: living, being born and dying off the Earth

Per 1,000 residents per month (provisional):

| Need | Amount | Notes |
| --- | --- | --- |
| Food | 1,000 rations | from habitat farms or closed ecological systems at the site, or shipped (50 t, which the transfer ratio multiplies) |
| Water and air (volatiles) | 130 t open loop; 13 t with physico-chemical life support (T144, 90% recovery); 2.6 t with closed ecological systems (T135, 98%); 1.3 t in living habitats (Living Systems, 99%) | made by ice works or shipped |
| Electricity | 40 units (5.5 kW a person); ×1.2 on Mars (dust); ×1.5 in the Jupiter, Saturn and Neptune zones (heating) | solar arrays scale with the site's solar factor; beyond the Belt only reactors and fusion work |
| Habitat upkeep | spares 0.5 lots, electronics 0.05 lots | at the habitat works |

Residents beyond the housing or life-support capacity are **unserved**: their mortality is
×3 and the site fails "food, water and order" for G96. There is no evacuation except by
shipment.

**Mortality**: doc 36's `rate[b]` × `M_env` (table 6.2) for every band at a site;
`M_env` falls by 20% of its excess over 10,000 with shielded habitats (T170), with
low-gravity medicine (T171) and in Living Systems seats (each, multiplied).
**Fertility**: `F_env` multiplies birth intensity: gravity below 0.2 g 6,000; 0.2-0.5 g
8,000; 0.5 g or more, or rotating habitats, 10,000; T171 adds 1,500 (cap 10,000).
Births before T171 are possible but low; children born off-world are ordinary residents.

**Habitat line** (housing per level; full stats in appendix B): pressurized outpost
(T144, 2,000, the founding module, at most one per site) → shielded habitat (T170,
25,000) → settlement dome or under-ice city (T170 & T137, 100,000) → rotating habitat
ring (T177, 200,000 at full gravity, built in orbit of the site's body and counted as
part of the site); living habitat (Living Systems, T179, 50,000, 99% closed) is an
alternative to the shielded habitat.

### 6.5 Logistics: lift, zone stores, transfers and windows

- **Lift** is a new national service (unit: tonnes delivered to Earth orbit per month;
  made and used in the same month; cannot be stored), produced by the launch chain
  (7.2). Lift orders move goods from the Earth pool to the **Earth-orbit store**.
- **Transfers** move goods and people from one zone store to another. A transfer of
  payload `m` tonnes from zone A to zone B by propulsion P needs, in A's store in the
  departure month: the payload, propellant `m × (ratio(A, B, P) − 1 − d_P)` and the
  hardware of the transfer berths' method; and berth capacity of method P in zone A.
  It arrives at the start of month `departure + months(A, B, P)`. Goods and people in
  flight are held in `Civ.transit` with their arrival month (ledger: `in_transit`).
- **Ratios** (`ratio_bp`) and **months** are content tables precomputed offline from the
  rocket equation (appendix A) and stored as integers; the engine never evaluates an
  exponential. Departures from an off-world zone use the same tables with the transfer
  Δv reduced by 3.0 km/s (no climb out of Earth orbit); a mass driver removes the ascent
  from an airless body; ISRU landing pads (7.2) cut the landing leg.
- **Windows**: impulsive propulsion (chemical, water-steam, nuclear thermal) departs only
  while `(month + offset_zone) mod synodic_zone < window_zone`; low-thrust (electric,
  nuclear electric, light sail) while it is below half the synodic period; pulse and
  fusion ships at any time. Moon departures are always open.

| Zone | Synodic period (months) | Window (months) | Offset (content constant) |
| --- | --- | --- | --- |
| Moon | - | always | - |
| Near-Earth asteroids | 12 | 2 | 3 |
| Venus | 19 | 2 | 7 |
| Mercury | 4 | 1 | 1 |
| Mars | 26 | 2 | 11 |
| Main Belt | 16 | 3 | 5 |
| Jupiter | 13 | 2 | 9 |
| Saturn | 12 | 2 | 4 |
| Neptune | 12 | 2 | 8 |

- **Standing orders** keep it simple: `PolicySetting::Supply { to_zone, good, per_month,
  propulsion: Option<P> }` makes the engine lift from the Earth pool and transfer along
  the cheapest available route each month (cheapest in lift and propellant, ties by
  months); `PolicySetting::Export { from_zone, good, per_month, propulsion }` the
  reverse; `start_project { kind: settlers { from_region, to_site, people, propulsion } }`
  moves adults 20-45 (3 t each, transits ≤ 36 months, ≤ 120 with T137, in-flight
  mortality 1.5× the adult base). Shortfalls are reported by reason ("Window to Mars
  opens in 9 months", "Lift short: 0.6 of 1.2 kt", "No propellant at Shackleton Rim").
- **Earth-region space works** (launch chain, orbital station and yard, transfer berths,
  depots) keep drawing their inputs and hardware from the national pool as today; only
  cargo, propellant and passengers leaving Earth orbit pass through the Earth-orbit store.
- **Earth-orbit storage**: propellant may stay in the Earth-orbit store beyond the month
  only up to 2 kt plus 50 kt per level of orbital propellant depots (T176); the excess
  boils off (booked lost). Other goods keep.
- **Why the Moon matters**: lunar volatiles turned into propellant and launched by mass
  driver reach the Earth-orbit store for a fraction of the lift they would take from the
  Earth; every transfer beyond Earth orbit is then paid in Moon propellant instead of
  Earth lift. The water-steam tug of Coal and Steam burns raw volatiles directly.

### 6.6 Claims, governance, occupation and blockade

- **Claim**: the first seat to complete a pressurized outpost at an unclaimed site
  controls and owns it (project `found_outpost { site }`: the outpost bill and 1,000
  people of orbital crew, technicians or scientists delivered to the site). A site
  controlled by another seat cannot be claimed. Uncrewed outposts (Synthetic Minds, or
  telepresence with T180) need no residents but hold no population.
- **Cession** of sites by treaty works as for regions (existing clause).
- **Occupation**: formations of G5 or later may be shipped to a zone as passengers
  (3 t per soldier plus their equipment mass) once the seat understands T144. On a site
  they fight under the ordinary battle rules with the terrain factor 15,000 (pressure
  domes favour defenders) and site militia; G5-G6 fight at 70% power off the Earth, G7
  at full power. Capture after five months and sovereignty after six as on the Earth.
- **Interdiction**: an orbital defence platform (T145 & T114) in a zone stops 10% per
  level (at most 50%) of an enemy's arriving cargo and soldiers there (booked as lost)
  and defends the seat's sites in the zone like 10,000 G6 militia per level.
- **Siege**: a site whose controller is at war with a seat that has a formation or a
  platform in the zone, and whose food or life-support access stays below 50% for six
  months, passes to that seat (the residents surrender; nobody vanishes).
- **Colonies follow the metropole**: when a seat governs no home-world region, its
  off-world sites pass to the seat that took its last home-world region (or, if none,
  to the seat governing most of its former regions). A seat is eliminated only when it
  governs nothing anywhere; the rule above makes that immediate.

### 6.7 Off-world cultures and autonomy

- **New peoples.** When at least half of a site's residents were born off-world and the
  site has been inhabited for 30 years, a daughter lineage forms from the majority
  lineage (axes copied with a seeded drift of up to ±600 bp; a generated name such as
  "Arcadians" or "Valhallans" from the site name), and births at the site join it.
  Daughter lineages drift as any lineage does and can carry movements and faiths.
- **Three off-world practices** (recognizable only where off-world people live;
  C065-C067): *Closed-loop Thrift* (life-support volatiles −15% at the seat's sites),
  *Low-gravity Crafts* (off-world construction productivity +1,000 bp), *Frontier
  Assemblies* (site stability +5, administrative load of sites −1, autonomy pressure
  +20%).
- **Autonomy pressure** `A` (0-10,000) per inhabited site, monthly:
  `ΔA = k_zone × (2 + 8 × daughter share) × (1 + shortfall share) − relief`, with
  `k_zone` Moon and NEA 1, Mars, Venus and Mercury 2, Belt 3, Jupiter 4, Saturn 5,
  Neptune 6; relief 3 under home rule, 2 under the Frontier Charter, 1 per 10 points of
  site stability above 60.
- At 5,000 the site demands **home rule**: if granted (`set_policy autonomy { site,
  grant: true }`), exports from the site are capped at half its output, the seat cannot
  choose methods or recruit there, site stability +10. At 9,000 it demands **dominion**:
  if granted, exports only under a standing 25% compact and no formations may be
  stationed there except in defence; pressure stops. A refused demand raises unrest by
  3,000 bp and the site's works run at 70% (strikes) until granted or until pressure falls
  below the threshold. There is no secession: a dominion remains under the seat's
  authority and counts for it in G96, as a subordinate does.

### 6.8 Research and discovery off the Earth

- A research station's posts give Frontier research (posts × RE, doc 36 §2.7) and add
  site evidence for the nodes the site lists (table 6.2) at twice the station's activity.
- Investigation of T171 needs an inhabited off-world site and of T172, T179 and T181 an
  operating off-world research station (as `needs_facility`).
- **Life search**: at match start one secret draw `("life", 0)` decides where simple
  extraterrestrial life exists: Europa 45%, Enceladus 30%, Jezero 15%, nowhere 10%. A
  seat that staffs a research station at that site for 120 months (60 under Planetary
  Protection) makes the discovery: a chronicle moment, evidence of 2.5 × `H[t]` for
  every hinted node among T131, T134, T135, T137 and T179, Openness +300 bp in its
  culture, and in regions whose faith holds a founding obligation, a one-time stability
  change of ±3 by doctrine. Met seats receive it as a report (rumour) at once and as
  evidence only through contact. A null result after 120 months is also reported.

### 6.9 Victory and winnability

- G96 counts every **inhabited** region; inhabited off-world sites are regions and count.
  An uncrewed outpost or a depopulated site does not.
- Off-world sites can never become independent polities (no secession, 6.7), colonies
  follow the metropole (6.6), and subordinates' sites count for the overlord as their
  regions already do. So a world winner must still subordinate or conquer every rival on
  the Earth and then holds their colonies; off-world sites add work only when a rival
  survives somewhere.
- The off-world sites also feed the jump base (chapter 35) without becoming required:
  helium-3 fusion lowers the power cost of the programme, Psyche's platinum-group metals
  and cobalt-nickel and the Moon's rare earths relieve bottleneck inputs of check 10,
  and research stations count toward check 9's frontier research. The jump works, the
  test nodes and the lattice stay on the Earth.

---

## 7. Space access technology

### 7.1 Technology graph changes (`content/technologies.json`)

No node is removed, no prerequisite of T160-T167 or of their prerequisites changes, and
the jump chain stays reachable without any off-world site. All new nodes are hidden
until discovered like every node. 19 nodes are added (138 → 157); two are renamed.

**Renamed** (prerequisites unchanged): T140 "Controlled rocket propulsion" → "Chemical
rocket propulsion"; T142 "Repeatable orbital transport" → "Repeatable orbital transport
and launch centres".

**Added to group J** (IDs in the existing gap):

| ID | Name | Prerequisites | Tier | Label | Tags | Investigation needs |
| --- | --- | --- | --- | --- | --- | --- |
| T154 | Reusable launch and recovery | T142 & T114 & T152 | 7 | established | Space, Machine | launch complex |
| T155 | Electric propulsion: ion and Hall thrusters | T143 & T107 & T103 | 7 | established | Space, Electric | - |
| T156 | Electromagnetic launch and mass drivers | T101 & T107 & T108 | 7 | extrapolated | Electric, Space | - |
| T157 | Nuclear thermal propulsion | T147 & T140 & T067 | 8 | established | Space, HighEnergy | high-energy laboratory |
| T158 | Nuclear electric propulsion | T147 & T155 | 8 | extrapolated | Space, HighEnergy, Electric | high-energy laboratory |
| T159 | In-situ resource utilisation | T143 & T064 & T042 | 7 | established | Space, Chem, Mine | - |

**New group L, "Solar System operations"** (T170-T182):

| ID | Name | Prerequisites | Tier | Label | Tags | Investigation needs | Flavour |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T170 | Shielded off-world habitats | T144 & T143 & T050 | 8 | extrapolated | Space, Build | launch complex | |
| T171 | Low-gravity medicine and off-world births | T144 & T046 & T134 | 8 | extrapolated | Health, Space | an inhabited off-world site | |
| T172 | Off-world mining and processing | T159 & T063 & T114 | 8 | extrapolated | Mine, Space, Machine | off-world research station | |
| T173 | Fusion propulsion | T149 & T158 | 9 | extrapolated | HighEnergy, Space | high-energy laboratory | radiant |
| T174 | Beamed-energy propulsion and light sails | T109 & T150 | 8 | extrapolated | Electric, Space | orbital station | radiant |
| T175 | Deep-space communication and autonomy | T112 & T152 & T116 | 7 | established | Compute, Space | - | |
| T176 | Cryogenic propellant depots | T108 & T145 & T159 | 8 | extrapolated | Space, Chem | orbital station | |
| T177 | Rotating habitats and orbital settlements | T145 & T137 & T170 | 9 | extrapolated | Space, Build, Bio | orbital station | |
| T178 | Heavy-lift booster mass production | T142 & T092 & T071 | 7 | established | Fuel, Space, Machine | launch complex | diesel |
| T179 | Grown habitats and biological ISRU | T132 & T135 & T159 | 8 | extrapolated | Bio, Space | off-world research station | bio |
| T180 | Neural telepresence and remote operation | T120 & T175 | 8 | extrapolated | Compute, Health | - | cyber |
| T181 | Self-replicating seed factories | T122 & T172 & T114 | 9 | extrapolated | Compute, Machine, Space | off-world research station | AI |
| T182 | Nuclear pulse propulsion | T147 & T067 & T145 | 8 | extrapolated | HighEnergy, Space | high-energy laboratory | atomic |

Every "flavoured" node has a **generic use for every seat** and a stronger exclusive use
for its tradition, so no node is dead for anyone: T178 heavy boosters (generic spaceport
method; Oil and Engine heavy-booster yard), T179 bio-regenerative life support (generic
closed-ecology stage −20% electricity; Living Systems living habitats and bio-ISRU), T180
telepresence (generic: off-world crews −30%; Network: −60% and remote mining from the
Earth), T181 autonomous mining rigs (generic: off-world mine crews −50%; Synthetic Minds:
seed factories), T182 pulse ships (generic with the full trust penalty; Atom: half),
T156 mass drivers (generic on airless bodies; Current and Wire launch-assist track on the
Earth), T157 nuclear thermal (generic; Coal and Steam water-steam tug, Atom +8% exhaust
velocity).

Engine content changes: `tech_tier` gains `154..=156 | 159 | 175 | 178 => 7`, `157 | 158 |
170..=172 | 174 | 176 | 179 | 180 | 182 => 8`, `173 | 177 | 181 => 9`; tags as listed;
`tech_needs_facility` gains the listed entries (a new `"offworld_station"` and
`"offworld_inhabited"` requirement kind); the graph hash changes. Nodes per tier become
7: 23, 8: 25, 9: 9; doc 36's per-tier thresholds and work are per node and need no
change, but the tier 7-9 milestone dates are re-checked in slice 14 (the native AI must
not divert research from the jump chain to optional space nodes, section 11.4).

### 7.2 Space centres: the launch chain

A building line (section 8.4) whose levels make **lift**; a region may hold up to 4
levels (cadence); regions within 15° of the equator get +10% lift.

| Stage | Requires | Lift per level-month | Inputs per level-month | Crew | Electric | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Rocket proving ground | T140 | 50 t | fuel 2, components 0.5, electronics 0.1 | 2,000 technicians + 1,000 mechanics + 1,000 scientists | 40 | counts as Space activity for evidence; prerequisite stage of the launch complex |
| Launch complex (existing) | T140 & T141 & C045 (as now) | 800 t | fuel 30, components 6, electronics 3, aluminium 2, superalloy-grade metal 0.3, batteries 5 lots (doc 36) | as now | 400 | expendable vehicles |
| Spaceport | T154 | 1,200 t | fuel 36, components 1.2, electronics 0.5, aluminium 0.4, spares 1 | as launch complex | 400 | reusable vehicles; method "expendable heavy boosters" with T178: fuel 50, metal 2, components 2.5, electronics 0.4 → 1,400 t |
| Heavy-booster yard (Oil and Engine) | T178 | 1,600 t | fuel 50, metal 2, components 1.5, electronics 0.2 | as launch complex | 300 | mass-produced steel boosters |
| Launch-assist track (Current and Wire) | T156 | 1,200 t | fuel 24, components 1.2, electronics 0.5 | as launch complex + 1,000 electricians | 700 | electromagnetic first stage |

Network seats' spaceports use half the components. Other space works: orbital station,
orbital yard, interferometer (existing); **transfer berth** (T142, at a region with an
orbital station or at an off-world landing pad; methods = propulsion families, 7.3);
**orbital propellant depot** (T176); **mission control and deep-space network** (T175; one
per seat; needed beyond Mars); **landing pad and depot** (T159 & T142; off-world; lets
landers refuel locally); **mass driver** (T156; airless bodies; up to 2 kt a level-month to
orbit for 600 units of electricity per kt, no propellant); **beam station** (T174; at
Prokofiev or as an orbital power receiver stage; powers light sails). Stats in appendix B.

### 7.3 Propulsion families

Transfer berths carry the methods. "d" is the hardware mass per tonne of payload included
in the ratio (appendix A). Payload is tonnes departing per berth level-month.

| Family (method) | Requires | Exhaust velocity | d | Payload per berth level | Hardware per level-month | Passengers | Windows | Strength | Drawback |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chemical stages | T142 | 4.4 km/s | 0.03 | 2,000 t | components 0.4, electronics 20 lots | yes | impulsive | available first; fast to the Moon | heavy propellant; the outer system is out of reach |
| Water-steam thermal (Coal and Steam) | T157 or T159, tradition | 4.9 km/s | 0.15 | 2,000 t | components 0.2 | yes | impulsive | propellant is raw volatiles (refuel at any ice site); no cryogenics or electrolysis | no better than chemical in mass |
| Nuclear thermal | T157 | 8.8 km/s (Atom 9.5) | 0.20 | 3,000 t | components 0.2, nuclear fuel 0.01 lots | yes | impulsive | the Belt and Jupiter's moons; Mars in 5 months | reactors; uranium; hydrogen propellant |
| Electric (ion and Hall) | T155 | 30 km/s (Current and Wire 35) | 0.35 | 4,000 t | electronics 50 lots, spares 0.1 | no | half the cycle | the lowest mass ratio inside the Belt | slow; needs sunlight: not beyond the Belt |
| Nuclear electric | T158 | 50 km/s | 0.60 | 5,000 t | spares 0.15, nuclear fuel 0.02 lots | no (yes with T137) | half the cycle | outer-system cargo | slow; reactors |
| Nuclear pulse | T182 | 30 km/s, high thrust | 1.20 | 20,000 t | components 1, nuclear fuel 2 lots per kt departing | yes | none | huge, fast, any time | trust penalty with every met seat (Atom: half); built in orbit only |
| Fusion ship | T173 | 300 km/s | 0.80 | 10,000 t | spares 0.3, helium-3 3 lots or nuclear fuel 6 lots | yes | none | the whole system in months | the last propulsion; helium-3 or lithium-derived fuel |
| Light sail (cargo) | T174 and a beam station | - | 0.30 | 5,000 t | 5,000 units of electricity at the beam station per kt departing | no | none | no propellant | Jupiter and beyond only; energy-hungry |

Transfer ratio (tonnes needed in the departure store per tonne delivered) and months,
Earth orbit to each site (appendix A; "-" = not offered: ratio above 12, no sunlight, or
no crew route). With an ISRU landing pad at the destination, landing-leg sites (Moon,
Mercury, Jupiter moons, Triton) are cheaper (appendix A).

| Site | Chemical | Water-steam | Nuclear thermal | Electric | Nuclear electric | Pulse | Fusion | Months (chem / NTR / electric / NEP / pulse / fusion) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Moon (any) | 4.2 | 4.0 | 2.9 | 2.4 | 2.7 | 3.7 | 2.8 | 1 / 1 / 3 / 2 / 1 / 1 |
| Near-Earth asteroids | 3.0 | 2.8 | 1.9 | 1.5 | 1.7 | 2.4 | 1.8 | 6 / 4 / 8 / 6 / 3 / 1 |
| Mars (any) | 3.0 | 2.8 | 1.9 | 1.5 | 1.7 | 2.4 | 1.8 | 8 / 5 / 11 / 8 / 3 / 1 |
| Venus clouds | 2.7 | 2.5 | 1.8 | 1.5 | 1.7 | 2.4 | 1.8 | 5 / 3 / 7 / 5 / 2 / 1 |
| Mercury | - | - | 9.6 | 4.1 | 4.1 | 6.0 | 4.0 | - / 4 / 10 / 8 / 3 / 2 |
| Ceres | 9.7 | 8.0 | 3.6 | 2.0 | 2.1 | 3.0 | 2.1 | 15 / 10 / 16 / 12 / 6 / 2 |
| Vesta | - | 9.8 | 4.1 | 2.1 | 2.1 | 3.0 | 2.1 | - / 10 / 16 / 12 / 6 / 2 |
| Psyche | - | 10.1 | 4.0 | 1.9 | 2.0 | 2.9 | 2.0 | - / 11 / 17 / 13 / 6 / 2 |
| Callisto | - | - | 5.8 | - | 3.0 | 4.2 | 3.0 | - / 24 / - / 24 / 12 / 4 |
| Ganymede | - | - | 6.6 | - | 3.1 | 4.5 | 3.1 | - / 24 / - / 24 / 12 / 4 |
| Europa | - | - | 6.9 | - | 2.9 | 4.1 | 2.8 | - / 24 / - / 24 / 12 / 4 |
| Io (uncrewed only) | - | - | 8.1 | - | 3.1 | 4.5 | 3.0 | - / 24 / - / 24 / 12 / 4 |
| Titan | 7.4 | 6.3 | 3.1 | - | 2.0 | 2.8 | 2.0 | 73 / 48 / - / 40 / 20 / 6 |
| Enceladus | - | - | 4.5 | - | 2.1 | 3.0 | 2.0 | - / 48 / - / 40 / 20 / 6 |
| Triton | - | - | 5.7 | - | 2.8 | 4.0 | 2.8 | - / 150 / - / 96 / 48 / 12 |

(Light sails: Jupiter 12, Saturn 18, Neptune 36 months, ratio 1.3, cargo only.) Chemical
to Titan is offered for cargo only (73 months exceeds the crew limit).

### 7.4 What becomes reachable, and when

| Stage of access | Typical (median seat) | Reachable |
| --- | --- | --- |
| Chemical, expendable (T142) | 2030-2080 | Moon, near-Earth asteroids, Mars, Venus clouds; Ceres and Titan cargo at great cost |
| Reusable and heavy lift (T154, T178), ISRU and depots (T159, T176), electric tugs (T155) | 2060-2120 | the inner system cheaply; Moon propellant lowers every ratio's cost; Belt cargo |
| Nuclear thermal and electric (T157, T158) | 2080-2150 | the Belt with crews, Jupiter's moons, Mercury, Enceladus; Titan in 4 years |
| Pulse (T182), light sails (T174) | 2100-2170 | heavy fast cargo; outer-system cargo by beam |
| Fusion (T173) | 2160-2230 | everything in months, Triton included |

### 7.5 How it ends in the jump programme

The jump programme (chapter 35) is still the only route to victory and still built on the
Earth: launch complex, orbital station and yard, high-energy laboratory, testbed, lines and
nodes at the three test nodes. Space access feeds it: launch-chain stages are what check 13
counts as launch service (any stage at half rate or better), helium-3 fusion (method of
the fusion plant: 9 lots of helium-3 per level-month instead of 5 lots of nuclear fuel,
spares upkeep −50%) powers it, off-world metals and rare earths relieve its bottleneck
goods, and off-world research stations add frontier research. Fusion propulsion is the
last propulsion before the jump and is not a prerequisite of it.

---

## 8. Buildings: lifecycle, land use and the public upgrade tree

### 8.1 Audit of the current facility list

Measured on `content.rs` (69 facility types) and doc 36 slice 4 (about 17 more):

| Finding | Examples | Consequence |
| --- | --- | --- |
| Nothing is ever superseded: a level, once built, runs for ever with the same crew and output | healers' lodge, teaching lodge, granary, makers' circle, craft workshop, water mills from 1000 BC still running in AD 2300 | the user's complaint: ancient buildings forever |
| Plant changes are modelled as free method switches | mines switch from shallow to drained deep to mechanized workings; steelworks from coke to electric arc; press from hand copying to printing; steam stations from engines to turbines; electronics from vacuum tubes to integrated circuits, all without rebuilding | modernization costs nothing but inputs |
| Fields are bounded only by arable land, never by the city on it | a 60-million region keeps all its farmland | the user's complaint: big cities full of farmland |
| Capacity of transport and harbours rises by technology alone (doc 36 harbour 20 → 60 → 300 → 1,500 kt) | harbour | no investment behind the gain |
| No housing; urban mortality depends only on sanitation | - | density is free, so is sprawl |
| Upgrading the research chain (makers' circle → archive → laboratory → institute) means building new and leaving the old | research | stranded old research posts |

### 8.2 Lines and stages

- Every facility type gets `line: &str`, `stage: u8` and `era: u8` in `FacDef`, and the
  content gets `upgrades: Vec<UpgradeEdge { from, to, kind }>` with kinds **Upgrade**
  (successor), **Retrofit** (the generic automation stage below), **Variant** (a
  tradition's exclusive version of a stage) and **Alternative** (a sibling built new, not
  converted, e.g. synthetic fuel plant beside refinery; drawn dashed).
- Stages are separate facility kinds (the engine's per-kind code is unchanged); two
  stages of a line may stand in one region during a conversion.
- **A method is an operating choice on the same plant; a stage is a different plant.**
  Methods stay where the works can switch with the same equipment (tool materials,
  chemical feedstocks, field practices, steel with or without alloying, research with or
  without computers). The methods that are really different plant become stages (8.5).
- **Automation retrofit** template: every industry or extraction line without a named
  AI-era stage has a generic stage "Automated <works>" (T114 & T122): same recipes,
  general posts −60%, qualified posts −30%, +40 electric and +20 compute per level.
- Mines and wells are generated from one template per deposit kind (shallow workings
  → drained deep mine → mechanized mine → automated mine), so the tree shows one line
  "Mines (any deposit)" with four stages.

### 8.3 Upgrade, demolish, keep, heritage

- **Upgrade in place**: `upgrade { region, from, to, levels }` (a construction project,
  kind `Upgrade`, in the region's queue). Valid when the edge exists, the seat meets
  `to`'s requirement and site, and the region has that many levels of `from` not already
  converting. Bill and work: 60% of `to`'s per level (rounded up); crew, site power and
  minimum months: `to`'s in full (prototype rule of units §6 applies). The converting
  levels stop work when the order opens (`Facility.converting`); on completion they leave
  `from` and join `to`. Cancelling returns them to service; committed goods are not
  refunded.
- **Build new and demolish**: full price, no downtime. `demolish { region, facility,
  levels }` takes one month and 10% of the build work; it returns 25% of each of the
  materials, metal and components in the levels' bill (`salvaged`, never more than the
  bill) and frees land.
- **Keep**: the works keep running at their own figures, but (a) a productivity
  technology (doc 36 `F_tech`) counts for a works only if the technology's era is at
  most the works' era + 1, and (b) a works two or more eras behind the seat's era whose
  line has a successor the seat can build is **obsolete**: upkeep ×1.25, counted in the
  era transition strain (3.3), flagged in views. A line without a successor (a sacred
  precinct) never becomes obsolete.
- **Heritage**: works of a heritage-eligible kind (sacred precinct and great sanctuary,
  archive, scriptorium and copy house, water and wind mills, aqueduct, town quarters,
  college) at least 200 years old (`Facility.since`) and two eras behind may be
  designated (`designate_heritage { region, facility }`): they keep their non-economic
  function (worship, housing) and lose production, research, storage and water
  capacity; they cost 500 custodians and 0.5 kt of materials a level-month; each gives
  amenity +300 bp (heritage total at most +1,500, inside doc 36's 6,000 amenity cap),
  stability +1 in its region and +10% spread for practices established there.
  Designation is lifted only after 120 months.
- Every technology gets a content field `era` (by ID: T001-T016 Ancient; T020-T029
  Classical; T030-T035 Medieval; T036-T049 Early Modern; T050-T056, T060-T071, T080-T085
  Industrial; T057, T058, T086, T087, T090-T095, T100-T105, T110, T160 Modern; T096, T097,
  T106-T109, T111-T119, T121, T123, T124, T130-T134, T140, T141 Information; T142-T159, T170-T172,
  T174-T176, T178, T179, T182 Space; T120, T122, T125, T135-T137, T161, T173, T177, T180,
  T181 AI; T162-T167 Interstellar). It drives obsolescence and the requirement masks of
  8.9.

### 8.4 Line catalogue

Existing kinds in `code`, doc 36 kinds marked (36), new kinds marked (new). Era in
brackets. Bills, crews and recipes of new stages follow their class in units §6 and the
stage they replace, with the differences listed.

| Line | Stages (era) | Differences that matter |
| --- | --- | --- |
| Fields | `fields` (0); methods hand → traction → rotation → fertilized → mechanized → intensive → restorative (doc 36) | land-limited (8.6); methods stay methods |
| Pastures | `pasture` (0) | unchanged |
| Fishing | `fishery` (0) → fishing fleet (new, 4: T080 \| T092) → aquaculture (new, 6: T130 & T132) | fleet: posts −40%; aquaculture: no fishery cap, 30,000 rations per level from 0.2 kt fertilizer and 40 electric |
| Urban food | market gardens (new, 1: T011 & T021) → greenhouses (new, 5: T093 & T056) → vertical farms (new, 6: T107 & T121 & T056) → food synthesis works (36, 8) | 15,000 / 50,000 / 80,000 rations per level on 0.2 / 0.2 / 0.02 land units; greenhouses burn 0.5 kt coal or gas; vertical farms 250 electric, 0.05 kt fertilizer |
| Storage and provisioning | `granary` (0) → warehouse and market hall (new, 3: T026 & T027) → cold store (new, 5: T101 & T052) → logistics hub (new, 8: T122 & T114) | storage 2.5 / 6 / 15 / 30 M rations; provisioning 0.3 / 1.2 / 5 / 20 M residents (8.8); cold store spoilage ×0.3, 20 electric |
| Irrigation | `irrigation` (0, river) → pumped irrigation (new, 4: T080 \| T091 \| T101) → precision irrigation (new, 6: T121 & T107) | waters 5 / 8 / 12 field levels; pumped needs no river, 10 shaft |
| Forestry | forestry camp (36) → sawmill and logging (new, 4: T029 \| T080) → mechanized forestry (new, 5: T094) | general posts −50% / −75%; 10 shaft; 0.3 kt fuel |
| Building materials | quarry and clay pit (36); `kiln` (0) → brickworks (new, 4: T080) → cement works (36, 4) → precast plant (new, 6: T121 & T094) | brickworks 30 materials, 2 coal; precast 90 materials, 6 coal, 40 electric |
| Mines (any deposit) | shallow workings (0-1) → drained deep mine (4: T063) → mechanized mine (5: T094 & T063) → automated mine (8: T114 & T122) | today's methods become stages; automated: general posts −80%, +60 electric, +20 compute |
| Wells (crude, gas) | wells (36/5) → mechanized wells (5: T094) → automated wells (8) | posts −40% / −80% |
| Toolmaking | `workshop` (0; stone, copper, iron methods) → guild workshops (new, 2: C018) → tool factory (new, 4: T061) → automated tool plant (8) | posts −20% / −50% (10 shaft) |
| Textiles | weaving workshop (36, 0) → textile mill (36, 4) → synthetic fibre mill (36 method → stage, 5: T093) → automated (8) | |
| Copper | `copper_smelter` (0) → reverberatory smelter (new, 4: T060) → electrolytic refinery (new, 5: T103) | 8 ore + 2 coal → 4 copper, posts −40%; 8 ore + 0.5 chemicals → 4 copper, 40 electric |
| Iron and steel | `bloomery` (1) → `steelworks` coke (4) → electric arc steelworks (new from method, 5: T103; Current and Wire: T101) → automated steel mill (8) | alloy steel stays a method of the steelworks stages |
| Machine shops | `machine_shop` (4) → NC machining centre (new from method `nc`, 6: T114) → robotic factory (new, 8: T122); variant steam hammer works (Coal and Steam) | lights-out method at the robotic factory (Synthetic Minds) |
| Parts | `parts_works` (4) → predictive maintenance centre (new, 6: T116 & T121) | posts −40%, 10 compute |
| Wire | `wire_works` drawn (4) → electrolytic wire works (new from method, 5: T103) | |
| Chemicals | `chem_plant` (4) → petrochemical complex (new, 5: T090 & T093) → precision chemistry plant (new, 6: T121 & T107); variant biofoundry (Living Systems); coal-tar method (Coal and Steam) | petrochemical: 10 crude → 9 chemicals |
| Insulation | `insulation_works` ceramic (2) → polymer works (new from method, 5: T093) | |
| Fuel | `refinery` (5) → modern refinery (new, 6: T121); variant cracking refinery (Oil and Engine); alternative `synfuel` (6) | modern: posts −40% |
| Fertilizer | nitrate works (36, 5) → ammonia synthesis (36 method → stage, 5) | |
| Arms works | armoury (new, 1) → powder works and armoury (36 powder mill, 3) → arsenal (36, 4) → arms plant (new, 5) → defence systems plant (new, 6) → autonomous systems plant (new, 8) | fit-out points (2.3.1) |
| Electrical goods | aluminium smelter, magnet works, battery works, fuel plant (36) | automation retrofit |
| Electronics | vacuum-tube works (new from `fab` method, 5: T104) → `fab` integrated (6: T106) → advanced fab (new, 6: T109 & T117) | advanced: posts −40%, +20 electric |
| Computing | `computer_works` (6); `datacenter` mainframe hall (6) → compute cluster (new from method, 6: T117) → compute campus (new, 8: T122) | 100 / 300 / 1,000 compute per level for 30 / 60 / 150 electric |
| Records | scriptorium (`press` writing, 1) → copy house (2: T030) → print shop (3: T048) → publishing network (new, 6: T112) | publishing: same media per material as print, posts −60%, 30 electric, 5 compute |
| Instruments | `instrument_shop` (2; methods) → metrology laboratory (new, 6: T109) | posts −40% |
| Medicine | `pharma` (5) → biological works (new from method, 6: T132); variant isotope works (Atom) | |
| Consumer goods, fine wares | consumer goods works (36, 4) → appliance works (36 method → stage, 5: T101); fine-wares workshop (36) | |
| Mills and hydro | `waterwheel` (2, hydro site) → `hydro` (5) | mills upgrade on their site into hydroelectric works |
| Steam power | `steam` engine house (4) → compound engine station (new from method, 4: T081) → turbine station (new from method, 5: T083) → high-parameter plant (new, 6: T086; Coal and Steam from T081) | 12 / 10 / 8 / 6 kt coal per 60 / 70 / 80 / 80 shaft |
| Diesel power | `diesel` (5) → heavy diesel station (new from method, 5: T092) → gas turbine plant (new, 6: T107) | gas turbine: 4 kt gas → 90 shaft |
| Conversion and grid | `generator` (5); `grid` (5) → smart grid (new, 6: T107 & T123) | grid sharing 92% → 96% |
| Wind and solar | wind and solar farm (new, 6: T106 & T107) | 40 electric per level, 0.2 land units, spares 0.1, 200 technicians |
| Nuclear and beyond | `fission` (7) → advanced reactor (new, 7: T121); variant compact reactor (Atom); `fusion` (8; helium-3 method); `orbital_power` (7) | advanced: nuclear fuel −30% |
| Roads | `roads` (1) → highways (new, 5: T094 & T064) | doc 36 route loss per region 500 → 250 bp |
| Harbour | `port` (1; 20 kt, 60 with T028) → steamship port (new, 4: T080; 300 kt) → container port (new, 5: T092 & T094; 1,500 kt) | doc 36's technology steps become stages |
| Railway | `rail` (4) → electric railway (new, 5: T101 & T102; Current and Wire: T101) → maglev (new, 6: T108) | electric: no coal upkeep, 30 electric; maglev: route loss 150 → 80, gateway 200 → 400 kt |
| Motor transport | `depot` (5) | unchanged |
| Urban transit | metro (new, 6: T107 & T068); variant trams and metros (Current and Wire, 5: T101 & T068) | housing density +10% (+25% for the variant) |
| Water | `waterworks` wells (1) → aqueduct (new, 1: T024 & T021) → pumped waterworks (new, 4: T080); desalination plant (new, 6: T103 & T121, coast) | 1.2 / 2 / 4 M residents; desalination 4 M for 80 electric |
| Sanitation | `sewers` (2) → `water_treatment` (4) → water recycling (new, 6: T121 & T130) | 3 / 12 / 30 M residents |
| Health | `clinic` healers' lodge (0) → `hospital` (3) → modern hospital (new, 5: T070 & T101) → regenerative medical centre (new, 8: T136) | 0.8 / 4 / 8 / 12 M residents |
| Administration | `admin` offices (1) → ministries and census bureau (new, 3: T048 & T026) → computerized administration (new, 6: T124) → autonomous governance centre (new, 8: T125); variant machine governance centre (Synthetic Minds) | 3 / 4 / 6 / 8 regions per level |
| Military | `barracks` (1) → military academy (new, 4: C037 & T065) → training complex (new, 6: T121) | academy proficiency cap +500; complex training months −25% |
| Religion | `holy_site` (0) → great sanctuary (new, 2: T024) | Sacred +1; heritage-eligible |
| Housing | town quarters (new, 1) → tenements (new, 4) → apartment blocks (new, 5) → high-rise towers (new, 5); suburbs (new, 5, branch from apartment blocks); arcology (new, 8) | 8.7 |
| Education | `lodge` (0) → `school` (1) → comprehensive school (new, 5: T065 & T048); `college` (2) → university (new, 3: T049 & C027); `tech_institute` (4) → polytechnic (new, 6: T106 & T121) | 16k / 40k / 60k; 30k / 40k; 32k / 40k places per level |
| Research | `makers_circle` (0) → `archive` (1) → `laboratory` (3) → `institute` (4) → `advanced_lab` (5) → `auto_lab` (8); `high_energy` (7) | an upgrade converts the research class of the posts |
| Launch | rocket proving ground (new) → `launch_complex` → spaceport (new); variants heavy-booster yard, launch-assist track | 7.2 |
| Orbital | `orbital_station` → `orbital_yard`; `interferometer`; transfer berth, orbital propellant depot, mission control, beam station (new) | 7.2, appendix B |
| Off-world | habitats, life support, habitat farm, ice works, propellant plant, regolith works, hydrocarbon works, mining station, solar furnace, helium-3 extractor, solar arrays, off-world reactor, landing pad, mass driver, research station, orbital defence platform (new) | appendix B |
| Jump (sealed) | `jump_testbed`, `jump_yard`, `jump_base`, lattice works (36) | absent from the static tree (8.9) |

In all: about 160 kinds (mines and wells from templates) in about 50 lines.

### 8.5 Methods that become stages

| Facility (2.0 methods) | Becomes | Reason |
| --- | --- | --- |
| Mines: shallow / drained deep / mechanized | stages 1 / 2 / 3 | pumps, shafts and machinery are new plant |
| Steelworks: coke / electric | coke steelworks → electric arc steelworks | a blast furnace is not an arc furnace |
| Electronics cells: vacuum / integrated | vacuum-tube works → electronics cells | a different factory |
| Press: writing / copying / print | scriptorium → copy house → print shop | presses are plant |
| Steam station: engine / compound / turbine | three stages | different machines |
| Diesel station: engine / heavy | two stages | |
| Computing centre: mainframes / clusters | two stages | |
| Machine shops: components / nc | two stages | |
| Pharmaceutical works: pharma / bio | two stages | |
| Wire works: drawn / electrolytic; insulation: ceramic / polymer | two stages each | |

Stages keep their earlier methods where the plant can still run them (a drained deep mine
can still work shallow). Ruleset 2.0 slice D's method tests carry over to each stage.

### 8.6 Land use

- `Region.land: u16`, the region's land in **land units** (lu; one lu is the land of one
  field level), generated as arable + pasture + forest + rough, with rough land by terrain
  (provisional, scaled like arable): plains 20-40, forest 20-40, marsh 30-60, hills
  40-80, steppe 60-120, tundra 100-200, mountains 120-200, desert 150-300.
- Uses, recomputed every 1 January and when a build completes:
  - **urban** = Σ housing levels × land per level + informal residents / 400,000
    (residents not housed in housing levels; doc 36's urban share decides who is urban);
  - **industrial** = 0.05 lu per level of works of the industry or power category and of
    non-mine extraction, plus the land of farms in 8.4 that state it;
  - **farmland** = field levels; **pasture** = pasture levels; **forest** = forest
    levels in use by forestry; **wild** = the rest.
- Urban and industrial land is taken from arable land in proportion arable ÷ (arable +
  rough) and from rough land otherwise: cities spread over the flat land around them,
  which is mostly farmland.
- **Encroachment**: when field levels exceed the arable land left, up to five field
  levels a year are demolished (salvage as 8.3) and reported ("Farmland lost to the city:
  3 levels at <region>").
- **Green belt**: `set_policy green_belt { region, on }` refuses housing and works that
  would take more arable land; urban residents beyond what housing and rough land can
  hold count as crowded (they add to doc 36's crowding pressure as an equal share of
  water shortage would).
- Doc 36's carrying capacity (§3.3) is unchanged in its formulas; what changes is that
  dense regions keep less farmland and must be fed from elsewhere (8.8) or from urban
  food works (8.4).

### 8.7 Housing

Housing is optional: residents without it live at the informal density (400,000 per lu)
under doc 36's urban mortality. Housing saves land, changes health and prosperity, and
costs goods and upkeep. Per level, provisional (construction in the civil-works class):

| Stage | Requires | Houses | Land (lu) | Density per lu | Bill | Upkeep per level-month | Effect for its residents |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Town quarters | T024 | 150,000 | 0.15 | 1.0 M | materials 8, tools 1 | materials 0.05 | heritage-eligible ("old town") |
| Tenements | T061 & T024 | 400,000 | 0.20 | 2.0 M | materials 15, metal 0.5 | materials 0.1 | `M_urban` +10% unless sewers serve them |
| Apartment blocks | T066 & T069 | 400,000 | 0.25 | 1.6 M | materials 30, metal 3, components 0.5 | materials 0.2, spares 0.02 | prosperity +2 points |
| Suburbs | T094 | 200,000 | 0.60 | 0.33 M | materials 20, metal 2 | fuel 0.5, materials 0.1 | prosperity +5 points; amenity +200 per 10% of residents housed so |
| High-rise towers | T101 & T067 & T050 | 1,000,000 | 0.25 | 4 M | materials 60, metal 15, components 3 | 20 electric, spares 0.2 | needs water treatment coverage |
| Arcology | T137 & T121 | 3,000,000 | 0.30 | 10 M | materials 150, metal 40, components 20, electronics 5,000 lots | 100 electric, spares 1 | grows 20% of its residents' food (local food); prosperity +5 points |

Upgrades follow the line (town quarters → tenements → apartment blocks → high-rise →
arcology; suburbs branch from apartment blocks); residents of converting levels live
informally until it completes. Example: a plains region of 60 M residents in 2200 with
90% urban needs 135 lu informally (all its farmland), 34 lu in apartment blocks, 14 lu in
towers or 5 lu in arcologies.

### 8.8 Provisioning: how cities eat

- **Local food** of a region = rations made last month by its fields, pastures, fishing,
  urban food works, food synthesis and arcologies.
- **Provisioning capacity** = (100,000 + Σ storage-line levels × their provisioning) ×
  (10,000 + 2,500 × transport grade) / 10,000.
- Residents fed from the national pool are at most local food + provisioning capacity;
  the rest count as short of food in doc 36's food accounting for that region (nutrition
  debt) even when the pool holds food. Food remains carried without loss (doc 36), so
  this is a capacity, not a loss.
- Pre-modern effect: a capital of 3 M with 1 M fed locally needs about five granary levels
  with roads and a harbour. Late effect: a 60 M region fed mostly from outside needs two
  logistics hubs or seven cold stores at transport grade 3.

### 8.9 The public building tree, and what it does not reveal

**Decision: the tree is public static content; technology and practice requirements are
shown by era and field only, never by name, unless the viewing seat has discovered them.**

Why not show technology names: the tree references most of the graph's nodes. Naming them
would publish the hidden graph (names, alternatives, and through the building lines its
order), which chapter 31 §8 forbids ("silhouettes of all future nodes, full prerequisite
counts") and which would end the discovery game for agents that read the tree. Masking
keeps the user's intent (everyone sees what buildings exist, what they do and how they
upgrade) and the core design (seats see only what they discovered). Goods are named: the
`Good` enum is public protocol schema (doc 36 §6.8), and the tree is the same for every
seat, so naming an input reveals nothing about any match; doc 36's rule that unknown goods
are absent continues to apply to market lines, treaty clauses and everything that
involves other seats' behaviour.

**Sealed content**: kinds whose requirement contains a fictional node (T162-T167) or the
lattice, and era 9, are absent from the static tree, so it does not disclose the final
objective. They appear in a seat's overlay once its objective is revealed
(`victory_revealed`).

**Protocol** (`bts-protocol`):

```
BuildingTree {
  content_version: String, hash: u64,
  eras: Vec<EraDef { era, name, entry: ReqExpr, built_proof: String, charters: Vec<CharterDef> }>,
  traditions: Vec<TraditionDef { key, slot, name, exclusives: Vec<String>, variant: String }>,
  lines: Vec<LineDef { key, name, category }>,
  nodes: Vec<BuildingNode {
    key, name, category, line, stage, era, tradition: Option<String>,
    site: String, offworld: bool, desc,
    cost: Vec<GoodQty>, work, build_months, crew: Vec<CrewSpec>,
    general_posts, skilled_posts: Vec<JobSpec>,
    methods: Vec<MethodSummary { key, name, inputs, outputs, services, requires: ReqExpr }>,
    upkeep: Vec<GoodQty>, provides: Vec<CapView>, land_lu_milli, houses,
    max_level, heritage_eligible, requires: ReqExpr }>,
  edges: Vec<UpgradeEdge { from, to, kind: Upgrade | Retrofit | Variant | Alternative,
                           cost_bp /* 6000 */, work_bp /* 6000 */ }>,
}
ReqExpr = All(Vec<ReqExpr>) | Any(Vec<ReqExpr>)
        | Tech { era: u8, domain: Tag }        // masked: no id, no name
        | Practice { era: u8, domain: Tag }
        | Facility { key } | Tradition { key } | Era { era }
        | Site { kind } | Deposit { kind } | Religion
```

Each masked leaf is one technology or practice; leaves carry no identifier, so masks cannot
be matched across buildings. The tree is built once at content load, serialized once, and
hashed (FNV over the JSON); about 160 nodes, roughly 80-100 KB of JSON.

**Delivery**:

- `GET /api/building-tree` (no token: public, seat-independent, identical for every match
  of the same content version; `ETag` = hash).
- `/api/turn` packet: `building_tree_hash` always; `building_tree` in full on the first
  packet of a cursor generation and whenever the request's `known_tree_hash` differs;
  MCP tool `get_building_tree`.
- Observation: `building_tree_hash`, and a per-seat **overlay** `buildings:
  Vec<BuildingStatus { key, requires: Vec<KnownRequirement> /* names only for discovered
  nodes */, status: Unavailable | Buildable | Built { levels } | Obsolete, upgrades_here:
  Vec<RegionId> }>`, listing only kinds with at least one discovered requirement or present
  in the seat's regions. Upgrade quotes appear in `OwnRegion.construction_sites` with
  `upgrade_from`.
- The native AI reads the same tree from content; the static tree is the same object.

---

## 9. Interface implications (views and data, not mock-ups)

1. **Era banner** in the top bar: era name and since, transition progress with strain and
   the score parts, golden or dark age with its end date; click opens the era screen.
2. **Era screen**: the ladder (public eras, own position, next era's conditions with
   masked requirements and the built proof), charter choice (three cards with effects and
   costs), history of transitions and ages.
3. **Tradition screen**: the two slots, options with favoured resources (marked where the
   seat holds them), exclusives, variants, drawbacks, mastery bar; switch confirmation
   showing the reform's cost and months. Met seats' traditions in the diplomacy view.
4. **Military**: generation per formation (badge), refit queue (progress by goods,
   fit-out and retraining; ETA), arms-works capacity and use, kit store by generation,
   reserves (enrolled, mobilization time), degradation warnings, obsolete flags,
   `modernize` directive editor.
5. **Earth view**: wrapped flat atlas and 3D globe; climate lens; real-Earth option on the
   setup screen with its data credits (Natural Earth, NOAA, NASA, USGS).
6. **Solar System view** (flat orrery and 3D): bodies at their phase, zones, sites (own,
   foreign as seen, unclaimed, unsurveyed), routes the seat can fly with ratio, months and
   next window, shipments in flight, lift capacity and use.
7. **Site card**: residents, born off-world share, daughter culture, habitat and life-
   support capacity and use (food, volatiles, electricity), mortality and fertility
   factors, deposits, works, research and evidence, zone store, autonomy pressure and
   demands, defences.
8. **Supply plan**: standing supply and export orders per zone; reasons for shortfalls.
9. **Building upgrade tree**: lines as rows, stages left to right by era, edges by kind,
   tradition variants marked; filters (category, era, tradition, buildable); per node card
   with costs, posts, methods, outputs and masked requirements (named where discovered);
   own works overlaid (built, obsolete, upgrade available); "upgrade here" action.
10. **Region land-use view**: land budget bar (urban, farmland used and idle, pasture,
    forest, industrial, wild), housing by stage with density, provisioning capacity and
    need, encroachment history, green-belt toggle.
11. **Construction**: upgrade and demolish orders in the queue; heritage designation;
    obsolete works list per region.
12. All new strings in English, Simplified and Traditional Chinese.

---

## 10. Protocol, content and save changes

All within doc 36's version bump (`bts-protocol/2.0`, `bts-rules/3.0.0`,
`bts-content/3.0.0`, `bts-worldgen/2.0.0`); new fields `#[serde(default)]`.

**Content** (`content.rs`, `content/technologies.json`, `content/practices.json`,
`content/earth/`): 19 technologies and two renames (7.1), technology `era` field (8.3),
three practices C065-C067, eight unit generations with variants, about 90 new facility
kinds with `line`, `stage`, `era`, `heritage_eligible`, `land_milli`, `houses`, upgrade
edges and the automation template, era table with charters, tradition table, solar bodies,
sites, zones, ratio and months tables, windows, three goods (`volatiles` t, `propellant` t,
`helium3` lot of 1 kg) and two deposits (`Volatiles`, `Helium3`), real-Earth data file.

**State**: `Civ.era`, `era_since`, `transition`, `age { kind, until }`, `charters`,
`traditions [Option<Path>; 2]`, `mastery [u16; 2]`, `reform`, `kit [u32; 8]`,
`zone_stores`, `transit`, `lift_orders`, `supply_orders`; `Army.gen` (was `tier`; serde
alias), `refit { to, committed, done_bp, months }`, `reserve { enrolled }`,
`degrade`, `short_months`, `variant`; `Region.kind` (`Home` | `Offworld { body, zone }`),
`land`, `climate`, `green_belt`, `autonomy`, `born_offworld`; `Facility.converting`,
`since`, `heritage`; `World.life_site` (secret), planetary phase epoch (content).

**Observation additions**: `era: EraView`, `traditions: TraditionView`,
`ForeignCiv.era`, `ForeignCiv.traditions`; `UnitsView` generations; `ArmyView.gen`,
`refit`, `reserve`, `degraded`, `obsolete`, `variant`; `MilitaryView.fit_out { capacity,
used }`, `kit`; `RegionView.kind`, `climate`; `OwnRegion.land: LandUseView`,
`housing`, `provisioning`; `solar: SolarView { bodies, sites, zones, routes, windows,
shipments, lift, stores }`; `SiteView` (as `RegionView` plus environment, life support,
autonomy, daughter culture); `building_tree_hash`, `buildings` overlay.

**Actions and settings**: `Refit { army, to_gen }`, `SetReserve { army, on }`,
`ScrapKit { gen, sets }`, `ChooseCharter { charter }`, `ChooseTradition { slot, path }`,
project kinds `Upgrade { from, to, levels }`, `FoundOutpost { site }`, `Settlers
{ from_region, to_site, people, propulsion }`, `SurveyBody { body }`; `Demolish { region,
facility, levels }`, `DesignateHeritage { region, facility }`; settings `GreenBelt
{ region, on }`, `Autonomy { site, grant }`, `Lift { good, per_month }`, `Supply { to_zone,
good, per_month, propulsion }`, `Export { from_zone, good, per_month, propulsion }`;
directives `Modernize { armies, to, priority }`, `UpgradeTarget { region, line, stage,
priority }`; clause `Compute { from, per_month, months }` (Compute Commons).

**Endpoints**: `GET /api/building-tree`; `/api/turn` fields `building_tree_hash`,
`building_tree`, query `known_tree_hash`; MCP `get_building_tree`.

**Saves**: still `bts-save/2`; dev saves of earlier ruleset-3 slices are refused by the
ruleset string as doc 36 specifies. The chronicle cap (2,000 per seat) is unchanged; site
regions add about 19 regions of state (empty until settled).

**Ledgers** (`docs/conservation-audit.md` additions): kit sets, salvaged goods (≤ bill),
fit-out points, lift (used ≤ made), zone stores and transit (`Σ departed = Σ arrived +
Σ in transit + Σ interdicted`, per good and for people), propellant boil-off, settlers
(people out of a region = people in transit + arrived + died in flight), off-world births
and deaths in the existing population ledgers, land units (`urban + industrial + farmland
+ pasture + forest + wild = land`).

---

## 11. Revised implementation plan (doc 36 §10 merged)

Rules of doc 36 §10 hold for every slice: `cargo test --release` green, `bts verify`
passing, one commit per slice, `docs/calibration/r3-slice-N-{eval,riverland}.txt`
recorded, `docs/units-and-scale.md`, `docs/conservation-audit.md` and
`docs/implementation-status.md` updated, the native AI's pass for the slice's mechanism
included, and the common tests (whole-campaign ledger audit, determinism with checkpoint
reload, information isolation, performance budget).

### 11.1 Slices

Slices 0-3 are unchanged, so the work in progress on `ruleset3` stays valid. Slice 4 (the
Earth-like generator) touches only world generation and can be done in parallel with
slice 3 by a second engineer.

| # | Slice | Source | Change to doc 36 | Content | Acceptance tests (beyond the common ones) | Calibration after the slice |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Tooling and baseline | 36-0 | done (`d4c06e2`) | - | - | - |
| 1 | Calendar and standing orders | 36-1 | done (`2117254`); display rename "era summary" → "round summary" moves to slice 10 | - | - | - |
| 2 | Population | 36-2 | done (`c654c82`); unchanged | - | - | - |
| 3 | Knowledge pacing | 36-3 | in progress; unchanged | - | - | tier 7-9 dates re-checked in slice 14 |
| 4 | Earth-like world | 37 §5.1 | new, before 36-4 (one `bts-worldgen/2.0.0`) | `WorldKind`, wrapped map, plates, climate, `ClimateZone`, geology bias hooks, starts; `Classic` kept for fixtures | over 1,000 worlds: adjacency symmetric across the seam; land 28-32% of cells; terrain shares in bands; arable, pasture, forest and water means within ±10% of the doc-36 generator; viable starts; identical world hash native and wasm; no transcendental functions in worldgen | slice 2 checkpoints on Earth-like worlds: population medians within ×1.5 of doc 36 table 3.1 |
| 5 | Resources and goods | 36-4 | changed: facilities carry `line`, `stage`, `era` (inert until 7); powder mill and arsenal authored as arms-works stages; +3 goods and +2 deposits (unused until 14); unit equipment written as rows G0-G2 and G4-G6 of table 2.1 | doc 36 slice 4 | doc 36 + metadata valid (edge endpoints exist; era non-decreasing along each line) | doc 36 |
| 6 | Productivity | 36-5 | changed: `F_tech` gated by the works' era; technology `era` field | doc 36 slice 5 + gating | doc 36 + a works of era e receives no `F_tech` from technologies of era > e + 1 | doc 36 (output per worker by era) |
| 7 | Building lifecycle and public tree | 37 §8.1-8.5, 8.9 | new | methods → stages, new stages (non-housing, non-space), upgrade, demolish, obsolescence, heritage, automation template, `BuildingTree`, endpoint, overlay, turn packet, `UpgradeTarget` directive, native AI upgrade rule (upgrade an obsolete works, or when the successor's labour and input savings over 20 years exceed the 60% bill) | upgrade charged = 60% quote × levels; converting levels make nothing; salvage ≤ 25% of bill; static tree byte-identical across seats and matches; tree contains no technology or practice id or name and no sealed kind (scan against content); overlay names only discovered nodes; unknown kind errors uniform; slice-D method tests pass per stage | obsolete share of posts < 30% at 1900 for AI seats; doc 36 output-per-worker targets still met |
| 8 | Military modernization | 37 §2 | new | generations G0-G7, `GEN_POWER`, gap rule, refit, arms-works fit-out, kit store, reserves, militia, degradation, obsolescence, recruitment rule, `modernize` directive, AI | refit power blend; refit bounded by bill and capacity; kit identity; reservists conserved; degradation after 3 months and recovery after 1; no G0 recruitment by a seat able to fit out G5; save and reload mid-refit | soldiers ≥ 2 generations behind the seat's best < 10% after 1900; same-generation war outcomes (length, losses) within ±15% of slice 7 |
| 9 | Land use, housing, provisioning | 37 §8.6-8.8 | new | land budget (worldgen field), urban and industrial land, encroachment, green belt, housing line, urban food line, storage provisioning | land identity every month; encroachment ≤ 5 levels a year; fed-from-pool ≤ local + capacity; green belt refuses arable-consuming orders | regions ≥ 20 M: farmland ≤ 40% of arable by 2100; doc 36 food target still met |
| 10 | Eras | 37 §3 | new | ladder, built proofs, transitions, strain, ages, charters, era-keyed basket hook, `EraView`, foreign era, static era table, round-summary rename | entry exactly when conditions hold; never regresses; score parts reproducible; era 9 invisible before reveal; charter change costs | median entry dates within table 0.1; golden ages 20-35% and dark ages 10-25% of transitions |
| 11 | Consumption and luxuries | 36-6 | changed: basket keyed to era (§3.5) | doc 36 slice 6 | doc 36 | doc 36 |
| 12 | Trade and market | 36-7 | unchanged (off-world zones are not members) | doc 36 slice 7 | doc 36 | doc 36 |
| 13 | Traditions | 37 §4 | new | slots, mastery, reform, terrestrial exclusives, unit variants, hazards, diplomacy effects, AI choice | exclusives buildable only while held; reform cost and cooldown; mastery bounded; hazards from secret streams independent of seat order; every exclusive recipe mass-balanced | each tradition held by ≥ 10% of seats over 64 seeds; no tradition's holders take > 40% of wins |
| 14 | Space access and the Solar System | 37 §6.1-6.3, 6.5, §7 | new | 19 technologies, launch chain, lift, zones and stores, transfer berths and propulsion, ratio and months tables, windows, sites as (empty) regions, surveys, outposts, Earth-orbit store, depots, mass drivers, supply and export orders, tradition space features | transit identity per good and for people; tables equal the committed generator output; window function; lift used ≤ made; no floating point in the space modules; sites hidden before survey and bodies before T041 | first outpost median 2040-2100; doc 36 tier 7-9 windows still met; leader T167 by 2260 in ≥ 75% |
| 15 | Off-world settlement and contest | 37 §6.4, 6.6-6.9 | new | habitats, life support, farms, ice and propellant works, mining, helium-3, research stations, life search, `M_env` and `F_env`, daughter lineages, C065-C067, autonomy, off-world combat, interdiction, siege, metropole rule, G96 counting | population ledger with transit and in-flight deaths; unserved residents rule; metropole and siege transfers; G96 counts inhabited sites only; no secession path exists | winner's off-world population 2-20 M by 2250; a contested site in ≥ 30% of matches; winner rate still 55-75% |
| 16 | Real Earth | 37 §5.2 | new | `tools/earth/`, `earth48.json`, relief raster, start sets, `SOURCES.md` | data hash stable; doc 36 guarantees for every start set; `SOURCES.md` lists only public-domain datasets | 64 seeds on the real Earth: winner rate within 10 points of generated worlds |
| 17 | Victory and the native AI | 36-8 | changed: final pass covers eras, traditions, refits, upgrades, land and space | doc 36 slice 8 | doc 36 + scripted fixture: a colony passes to the conqueror of its metropole and the conqueror then wins | 11.4 on 64 + 32 seeds |
| 18 | Client | 36-9 | changed: also 37 §9; built incrementally after each engine slice (protocol first, views after) | doc 36 §8 and 37 §9 views | e2e: refit a formation; upgrade a works from the tree; zoom from a region to Saturn; supply the Moon; choose a charter and a tradition | a whole quick-mode game by hand |

### 11.2 Information isolation tests added

- The static building tree and the static era table are byte-identical for every seat and
  every match of a content version, and contain no technology or practice id or name, no
  sealed kind and no era 9 (automated scan against the content).
- A seat's overlay, `EraView` and `TraditionView` name only nodes the seat has discovered;
  requests naming an undiscovered kind, charter or tradition feature get the uniform
  unknown error.
- Seat A's observation is unchanged when only seat B's refits, upgrades, land policy,
  shipments or zone stores change; it changes with B's era or traditions only if A has met
  B; sites controlled by B appear to A only after A's survey of that body.

### 11.3 Performance

Budgets unchanged: p95 per round with three native seats ≤ 150 ms native and ≤ 400 ms
wasm; a full standard all-AI match ≤ 60 s native. Expected added cost: eras and land use
are yearly and linear in regions or technologies; refits and degradation are linear in
formations; unsettled sites are skipped by an `active` flag, settled sites run the
ordinary region pipeline (+19 regions at most, typically 4-10 in segment H); transfers are
at most 50 standing orders per seat; the building tree is serialized once per process,
the overlay is about 160 entries per observation. Estimate: +15% per late month, +3 ms
per observation, +60 KB per late observation. `perf_round_budget` gains an AD 2250
checkpoint with at least six settled sites and live transfers.

### 11.4 Calibration targets

Doc 36 §7 targets all still hold (winner in 55-75% of all-AI matches; ≥ 70% of wins by
the hard seat; median win AD 2250-2310; IQR ≤ 120 years; four hard seats ≥ 40%;
population, technology, food, eliminations, regions and trade targets). Added:

| Metric | Target |
| --- | --- |
| Era entry, median seat | within the windows of table 0.1; leader at most one era ahead of the median after AD 1 |
| Ages | golden 20-35%, dark 10-25% of transitions |
| Military | after 1900, < 10% of soldiers two or more generations behind their seat's best; no G0-G1 formations after 1800 except militia |
| Buildings | obsolete share of filled posts < 30% for AI seats at 1900 and 2100 |
| Land | regions ≥ 20 M residents keep ≤ 40% of their arable land as fields by 2100 |
| Traditions | every tradition held by ≥ 10% of seats; no tradition's holders take > 40% of wins |
| Space | first outpost median 2040-2100; the winner's off-world population 2-20 M by 2250; a contested site in ≥ 30% of matches; helium-3 used in ≥ 30% of matches |
| Research diversion | the leader's T167 date moves by less than 10 years against slice 13 when slice 14 adds the optional space nodes |

### 11.5 Risks

- **Scope.** This addendum roughly doubles ruleset 3.0's content. Slices are ordered so
  that each is playable and valuable on its own, and the cut list (11.6) is explicit.
- **The native AI** must play eras, traditions, refits, upgrades, land and space. Each
  slice carries its AI pass; where the AI cannot use a mechanism, cut the mechanism, never
  give the AI information or bonuses.
- **Calibration coupling.** Era-gated `F_tech`, obsolescence and land limits lower
  productivity and farmland; optional space nodes compete for research. The era
  checkpoints (slice 0) let each slice calibrate its era in minutes.
- **Leaks through the public tree.** Masked leaves without identifiers, sealed content,
  and the automated scan in 11.2.
- **Determinism of the new generator.** Trigonometry is not bit-identical across
  platforms; worldgen uses only basic IEEE operations as today, an integer cosine table
  for latitude and wrapped equirectangular distances; space ratios are precomputed
  integers.
- **Real-Earth data.** Licensing (public domain only, recorded), balance of four starts,
  and preparation effort; it is fourth on the cut list.
- **Player overload.** Defaults everywhere (directives, automatic supply plans, automatic
  methods, tree filters); antiquity gains only charters, a few stages and housing.
- **Performance** with settled sites in two-year rounds: measured by the new checkpoint;
  sites only exist in segment H, so long rounds are unaffected.

### 11.6 What to cut first (in order)

1. Io, Enceladus and Triton sites, and light sails (16 sites remain).
2. Nuclear pulse ships.
3. Off-world autonomy demands (daughter cultures stay as names and drift).
4. The real Earth map (the generated Earth-like world stays).
5. Heritage designation.
6. Era charters (the ladder, transitions and ages stay).
7. Reserves (refit and the kit store stay).
8. The frontier tradition slot (the machine slot stays).
9. Zone stores (one off-world store per seat, with lift and propellant still charged per
   transfer).
10. Housing beyond tenements, apartment blocks and high-rise towers.

Then doc 36 §10's cut list continues.

---

## Appendix A. Transfer ratios

For each site and propulsion, with exhaust velocity `v_e`, hardware fraction `d`, tank
fraction `s = 0.10`:

    T = 1 + (exp(Δv_transfer / v_e) − 1) × (1 + s) + d
    L = 1 + (exp(Δv_landing / 4.4) − 1) × (1 + s) + 0.05     (1.10 with an ISRU landing pad;
                                                               1 where entry is aerodynamic)
    ratio = L × T     (offered when ≤ 12)

The propellant drawn from the departure store per tonne delivered is `ratio − 1 − d`; the
hardware is the berth method's goods. Δv from low Earth orbit (km/s, transfer + landing):
Moon 4.0 + 1.7; near-Earth asteroids 4.5 + 0; Mars 4.5 (with aerocapture and entry) + 0;
Venus clouds 4.0 + 0; Mercury 12.0 + 3.1; Ceres 9.0 + 0.4; Vesta 10.0 + 0.4; Psyche 10.5 +
0.1; Callisto 10.2 + 1.8; Ganymede 11.0 + 2.0; Europa 12.4 + 1.5; Io 13.2 + 1.8; Titan 8.0
(aerocapture) + 0.2; Enceladus 11.3 + 0.2; Triton 10.7 + 1.5. Departures from an off-world
zone subtract 3.0 km/s from the transfer; a mass driver removes the ascent from an airless
body.

Months: Hohmann transfer time for impulsive propulsion (Moon 1, near-Earth asteroids 6,
Venus 5, Mars 8, Mercury 4, Belt 15, Jupiter 32, Saturn 73, Neptune 367); nuclear thermal
uses faster, costlier trajectories already included in its Δv margin (about two thirds of
Hohmann inside Jupiter); electric about 1.3 × Hohmann inside the Belt; nuclear electric
1.0 × inside Jupiter, about 0.55 × beyond; pulse and fusion as in table 7.3.

`tools/space/ratios.py` evaluates these formulas offline and writes integer `ratio_bp` and
months into the content; a test compares the content with the committed output. The engine
never evaluates an exponential. Worked example: Mars by chemical stages, `T = 1 +
(e^(4.5/4.4) − 1) × 1.10 + 0.03 = 2.96`, `L = 1`, ratio 3.0: three tonnes in Earth orbit,
of which 1.93 t propellant, for every tonne landed on Mars.

## Appendix B. Space and off-world works (per level; display units: kt, thousand lots)

Construction class: nuclear, orbital and jump (units §6), with off-world work ×1.5 and
months ×1.25 (×1.0 with T170).

| Works | Requires | Where | Bill | Posts | Per level-month | Electric | Provides |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pressurized outpost | T144 | any site, one | metal 0.3, components 0.1, insulation 0.05, electronics 0.01 | 300 technicians or orbital crew | spares 0.05 | 20 + residents' | houses 2,000; life support for 2,000 at 90% |
| Shielded habitat | T170 | inhabitable sites | materials 20, metal 2, components 0.5, insulation 0.3, electronics 0.05 | 500 | spares 0.1 | residents' | houses 25,000; radiation part of `M_env` −20% |
| Settlement dome or under-ice city | T170 & T137 | inhabitable sites | materials 80, metal 8, components 2, insulation 1, electronics 0.2 (+ magnets 0.1 in the Jupiter zone) | 2,000 | spares 0.4 | residents' | houses 100,000 |
| Rotating habitat ring | T177 | in orbit of a body with an own site | metal 120, materials 200, components 10, insulation 5, electronics 1 | 3,000 | spares 1 | residents' | houses 200,000 at full gravity |
| Living habitat (Living Systems) | T179 | inhabitable sites | materials 10, food 2, chemicals 1, metal 0.5 | 1,000 | food 0.2 (growth) | residents' ×0.8 | houses 50,000; life support 99% |
| Life support (physico-chemical) | T144 | any | metal 0.5, components 0.3, electronics 0.05 | 200 technicians | - | 30 | 20,000 residents at 90% recovery |
| Closed ecological system | T135 | any | materials 5, metal 1, components 0.5, chemicals 0.5 | 400 | - | 60 (48 with T179) | 50,000 residents at 98%; grows 30% of their food |
| Habitat farm | T135, or T093 & T144 | any | materials 3, metal 0.5, insulation 0.3, conductors 0.2 | 500 | volatiles 0.05, chemicals 0.01 → 25,000 rations | 150 | - |
| Ice works | T159 | volatiles deposit | metal 1, components 0.5 | 300 + 100 technicians | → 2 volatiles (extractive) | 50 | - |
| Propellant plant | T159 | any; also on the Earth | metal 1, components 0.5, conductors 0.2 | 200 + 100 technicians | 1.2 volatiles (Earth: 1.2 fuel) → 1 propellant | 100 (Earth: 60) | - |
| Regolith works | T159 | any solid surface | metal 0.5, components 0.3 | 200 | → 4 materials (extractive) | 30 | - |
| Hydrocarbon works | T159 | Titan | metal 2, components 1 | 300 | → 3 fuel + 1 chemicals, 4.2 drawn (extractive) | 20 | - |
| Mining station | T172 | iron ore, cobalt-nickel, precious, rare-earth deposits | metal 2, components 1, electronics 0.05 | 400 + 200 technicians (−50% with T181, −30% or −60% with T180) | → 4 ore, or 0.4 cobalt-nickel, or 0.004 precious, or 0.3 rare earths | 100 | - |
| Solar furnace smelter | T172 | any | metal 1, components 0.5 | 300 + 100 | 8 iron ore → 5 metal (native metal ore, quality ≥ 9,000; others as a bloomery's ratio) | 80 (half inside 2 AU) | - |
| Helium-3 extractor | T172 & T149 | Mare Imbrium | metal 6, components 3, electronics 0.2 | 1,000 + 500 technicians | → 20 lots helium-3 + 1 volatiles (extractive) | 3,000 | - |
| Solar array field | T106 & T143 | any | conductors 0.5, substrate 0.2, metal 0.5, electronics 0.1 | 50 technicians | spares 0.05 | gives 100 × solar factor / 10,000 | - |
| Off-world fission plant | T147 | any | metal 16, components 8, electronics 4, conductors 4, insulation 2 (Atom compact reactor −40%) | 200 scientists + 600 technicians + 400 electricians | nuclear fuel 0.6 lots | gives 400 | - |
| Landing pad and depot | T159 & T142 | any site, one | materials 4, metal 1, components 0.5 | 300 | - | 10 | ISRU landing (factor 1.10); berth site |
| Mass driver | T156 | Moon, Mercury, asteroids, Callisto, Ganymede | metal 20, magnets 2, conductors 5, components 4 | 500 technicians + 300 electricians | - | 600 per kt launched | up to 2 kt a month to orbit without propellant |
| Research station | T143 | any, up to 4 | metal 1, components 0.5, instruments 0.5, electronics 0.1 | 1,000 scientists + 500 technicians | instruments 0.02 | 40 | Frontier research; site evidence |
| Transfer berth | T142 | Earth region with an orbital station, or a site with a landing pad | metal 4, components 2, electronics 0.2 | 1,000 orbital crew + 500 technicians | method goods (7.3) | 20 | departing payload (7.3) |
| Orbital propellant depot | T176 | Earth region with an orbital station | metal 4, components 2, insulation 1, magnets 0.1 | 300 orbital crew | spares 0.05 | 20 | keeps 50 kt of propellant in Earth orbit |
| Mission control and deep-space network | T175 | Earth, one per seat | components 4, electronics 2, hardware 0.2, instruments 1 | 2,000 technicians + 500 programmers | spares 0.1 | 60, compute 20 | full-rate works beyond Mars |
| Beam station | T174 | Prokofiev, or an orbital power receiver stage | metal 20, conductors 10, electronics 4, instruments 2 | 1,000 technicians + 500 electricians | spares 0.3 | 5,000 per kt sailed | powers light sails |
| Seed factory (Synthetic Minds) | T181 | any site | metal 4, components 2, electronics 0.5, hardware 0.1 | none at the site (100 AI engineers on the Earth) | - | 200, compute 20 | every 12 months builds one level of ice works, regolith works, mining station or solar array at its site, taking that level's bill from the zone store (only electronics and hardware may have come from elsewhere) without crew or residents; one level per seed-factory level |
| Orbital defence platform | T145 & T114 | in orbit of a body with an own site | metal 6, components 4, electronics 1, hardware 0.05 | 500 orbital crew + 500 technicians | spares 0.2, electronics 0.02 | 50 | interdiction 10% (≤ 50% per zone); defence as 10,000 G6 militia |
