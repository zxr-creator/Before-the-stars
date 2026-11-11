# 38. Cities, migration and transport networks (ruleset 3.0 addendum)

Status: design addendum and plan changes; no code is changed by this chapter. It extends
`36-ruleset-3-history-resources-trade.md` (doc 36) and
`37-eras-space-buildings-military.md` (doc 37), which stay normative wherever this
chapter does not change them. It is written against branch `ruleset3` as it stands
(slices 0-3 committed; slices 4-6, the Earth-like generator, resources and goods, and
productivity, in progress). `docs/units-and-scale.md` and `docs/conservation-audit.md`
remain normative for units and ledgers. Decisions the user should confirm are in
`38-open-questions.md`.

The user asked for: city development that follows geography (cities by the sea, on
rivers or near resources grow better), a few real metropolises, people who move to
cities with work, a better landscape and a better standard of living, large cities
that are naturally harder to take, and roads, railways, high-speed rail, airports,
ports and space centres that are built and that drive economic and city development.
A later request added transport that belongs to the "punk" traditions of doc 37 and
transport that only late or hidden technology opens. Victoria 3 is a genre reference
only; nothing below copies its systems (there are no pops with wages, no private
investment and no market inside a country: the domestic economy stays directed, as
doc 36 §6.1 decided).

Every number marked *provisional* is a starting value for calibration; units,
identities, orderings and formulas are not provisional. Integer arithmetic only (bp,
`i128` products through `util::muldiv`, carried remainders). Nothing is created from
nothing: every network level is built from goods, labour, qualified crews, site power
and months and costs upkeep; every migrant is a resident who leaves one region and
arrives in another; economies of scale stay capped and meet bottlenecks; seats see
only their own state and what they observe or have discovered.

---

## 0. Summary for the player

**Every region has one city.** Its size comes from the region's people: the more of
them work away from the land, and the better your transport and housing, the more of
them live in towns, and the largest share of the townspeople lives in the region's
principal city. A city on a natural harbour at a river mouth, on flat temperate land,
at a crossroads of routes, with worked mines nearby and your capital in it, draws the
biggest share. In antiquity even a great capital holds a hundred or a few hundred
thousand people. Industry and railways make cities of millions; by the 2100s a large
civilization has a few **metropolises** of 5-20 million, and the luckiest site in the
world may hold a **megalopolis** of 20-30 million.

**Cities grow by drawing people.** Cities were for most of history places where more
people died than were born; they grew because people came. Your people move between
your regions toward work (vacant posts), a better standard of living (food, health
care, sanitation, schooling, goods), a kinder climate and coast, safety and their own
kin, and away from hunger, war, epidemics, joblessness and crowding. How far and how
fast they move depends on your roads, ships, railways and airports. Young adults move
most; their children come with them; they bring their skills, their language and
their faith. Across borders people move only where both governments allow it (closed,
selective or open borders, or a free-movement treaty), except refugees, who flee war
and famine whatever the rules say. You can encourage settlement of a region with land
grants (paid in goods) or restrict movement out of one (at a price in stability).

**Great cities are fortresses in themselves.** Fighting through streets favours the
defender: a city of millions multiplies its defenders' strength, walls and bastions
add more until cannon and then rifled artillery make them obsolete, and a large city
takes longer to subdue. But a city that is cut off from its hinterland and from the
sea runs out of food and falls. The bonus is capped so that conquest stays possible.

**You build the networks.** Roads and waystations, engineered roads, motor highways;
canals; harbours, steamship ports and container ports; railways, electric railways,
high-speed rail, maglev; airfields and international airports; pipelines; tramways and
metros inside cities; walls and fortresses; and, at the end of history, vacuum
trains, suborbital express and orbital tethers. Each is a building line with upgrade
stages in the public building tree. Each stage carries more freight and more people,
loses less on the way, moves armies faster, widens your markets, feeds bigger cities,
lets people move and commute, and raises productivity. Each costs real goods, crews,
months and upkeep that rises with use, and a network is only as good as its narrowest
link.

**Your tradition changes how you move.** Coal and Steam flies hydrogen packet airships
a century before airfields and threads its cities with pneumatic tubes; Oil and Engine
runs road trains on trunk highways and ground-effect craft over the sea; Current and
Wire puts trucks under overhead wires; Atom sails nuclear freighters through polar ice;
Network replaces commuting with remote work and smart traffic; Living Systems grows
self-healing roads and living waterways; Synthetic Minds hands freight to autonomous
swarms. Knowledge is never locked; only these works are your tradition's own.

---

## 1. Scope and what changes in docs 36 and 37

### 1.1 Changes

| Where | Change |
| --- | --- |
| Doc 36 §3.2 urban share | replaced by the urban model of §2.2 (off-land work × concentration by transport and housing); `M_urban` keys on the principal city's class |
| Doc 36 §3.2 "Internal migration as today. Emigration between civilizations is not modelled" | replaced by §3 (attractiveness, voluntary and distress migration, international migration under border policies) |
| Doc 36 §3.5 / units §3 settlement classes | the class belongs to the **principal city**, not the region, with new bounds (§2.1); rules that keyed on the region class re-key onto the city class |
| Doc 36 §4.2 `F_city` | class term from the city; plus a capped **access** bonus and a capped **congestion** penalty (§2.5); range unchanged (8,000-12,500) |
| Doc 36 §6.2 routes, gateway capacity and loss | per-link capacity and loss by mode and stage (§5.4); a route's capacity is its narrowest link; the gateway table is retired |
| Units §7 freight (transport grade 0-3, capacities 10/24/60/150) | regional freight capacity is the sum of the region's network stages and levels (§5.3); `Cap::Transport` and `transport_level` are retired |
| `sim/economy.rs::link_efficiencies` (breadth-first distance from the capital, loss by the region's own grade) | least-loss path from the capital over own links with the loss of each link's best mode (§5.5) |
| Doc 37 §3.2 Classical built proof "a region with at least 1,000,000 residents (Town class)" | "a city of at least 50,000 residents (Town class)" |
| Doc 37 §8.4 lines Roads, Harbour, Railway, Motor transport, Urban transit | replaced by the lines of §5.2 (motor depot retired into motor highways; maglev becomes the fourth rail stage after high-speed rail; new Canal, Air, Pipeline and Fortification lines) |
| Doc 37 §8.8 provisioning: `× (10,000 + 2,500 × transport grade)` | `× access_bp` from water and land networks (§2.4) |
| Doc 37 §7.1 technologies | one node added, T183 (§6.3); 157 → 158 |
| Doc 37 §8.9 public tree | adds the `listed` flag (§6.4): a few deep works are absent from the static tree until discovered |
| `sim/military.rs` movement and battle | network movement, airlift, supply reach (§5.7); urban defence, fortifications, siege, capture months (§4) |

### 1.2 Design rules for this chapter

1. **Derived, not stored.** A city is a view of a region's residents (city + towns +
   countryside = residents), recomputed from the region's state; it holds no people of
   its own. Site quality is derived from geography and from what stands in the region.
   A link's capacity and loss are derived from what stands at its two ends. Only
   facilities, people and policies are state.
2. **Every benefit is one of the doc 36 §4.1 channels** (labour per unit, land yield,
   deposit yield, research and construction effectiveness), a capacity bought with
   real works, a lower loss in carriage, or a movement of real people. No network
   raises a recipe's output per input.
3. **Every concentration meets a bottleneck**: water, sanitation, provisioning, land
   and housing (doc 37 §8.6-8.8), urban mobility (congestion), link capacity, urban
   mortality.
4. **Simple defaults**: the engine plans nothing for the player, but directives
   (`connect`, `build_target`, `upgrade_target`) and the native AI's planner carry the
   load in long rounds; each mechanism has a cut line (§8.7).

---

## 2. Cities and sites

### 2.1 One principal city per region

**Decision: each region has exactly one named urban centre, its principal city, plus
an unnamed remainder of lesser towns.** A region is country-sized (48 regions for the
whole world), so a real region would contain many cities; modelling them separately
would multiply state, interface and calibration for little decision value. One city
per region keeps the map readable (one city marker per region, as players expect),
lets a few regions grow metropolises, and fits the region-level population model built
in slice 2 without touching the age blocks.

    residents = city + towns + countryside            (people, every month)
    urban     = residents × urban_share / 10,000      (§2.2)
    city      = urban × primacy / 10,000              (§2.3)
    towns     = urban − city
    countryside = residents − urban

The city has a name (generated with the region in worldgen, stored as
`Region.city_name`; a seat may rename its own cities), a size and a class. Its people
are the region's people: same age blocks, lineages, religions and qualifications.

**City classes** (the settlement class moves from the region to the city; `SettlementKind`
keeps its seven variants):

| Class | City residents | Map | `F_city` class term (Industry, Services, Knowledge) | Urban mortality weight |
| --- | --- | --- | --- | --- |
| Wilderness | region uninhabited | - | - | - |
| Camp | under 10,000 | hamlet dot | 9,500 | 0 |
| Village | 10,000 to under 50,000 | small dot | 10,000 | 3,000 |
| Town | 50,000 to under 250,000 | town marker | 10,400 | 6,000 |
| City | 250,000 to under 5 million | city marker, size by population | 10,800 | 10,000 |
| Metropolis | 5 million to under 20 million | skyline marker | 11,200 | 12,000 |
| Megalopolis | 20 million or more | skyline marker with halo | 11,400 | 13,000 |

The `F_city` class terms are doc 36's; only their key changes. A region of 2 million
residents in antiquity had region class Town (10,400) and now has a principal city of
about 50,000-120,000, also Town (10,400); a modern region of 60 million had class
Megalopolis (11,400) and now usually has a Metropolis (11,200). The change of key
therefore moves productivity little at both ends and is re-checked in slice 9a.

### 2.2 Urban share

The share of a region's residents who live in towns or its city:

    N  = (workers in posts outside Food and Extraction + jobless adults / 2) / active adults
    c  = concentration (bp, 3,000-7,500, below)
    urban_share = min(9,500, N × c / 10,000)

N is the off-land share of work (industry, services, knowledge, construction,
administration, transport crews; half of the jobless, who historically crowded into
towns). The concentration `c` is the share of off-land people who live in towns rather
than in villages, and it rises with what lets people live densely and still reach
their work and food:

| Term | Concentration (bp) |
| --- | --- |
| Base (crafts and services spread through the villages) | 3,000 |
| A harbour of any stage, or a navigable river (market towns at the water) | +500 |
| A railway of any stage | +1,000 |
| Motor highways or later | +500 |
| Urban transit: +500 per tramway or metro level | at most +1,000 |
| Dense housing: 1,500 × share of urban residents housed in apartment blocks, high-rise towers or arcologies (doc 37 §8.7) | at most +1,500 |
| Cap | 7,500 |

Check against the targets (median seat): antiquity N ≈ 18% × c 3,000-3,500 ≈ 5-6%;
1700 N ≈ 33% × 3,500 ≈ 11%; 1850 N ≈ 45% × 3,500-4,500 ≈ 16-20%; 1900 N ≈ 55% ×
4,500 ≈ 25%; 2000 N ≈ 90% × 5,500-6,000 ≈ 50-54%; late N ≈ 97% × 7,200-7,500 ≈ 70-73%.
Doc 36's food-sector shares (75%, 60%, 35%, 5%, ≤ 3%) give these N.

Urban share keeps every use it has in ruleset 3.0: `M_urban` (doc 36 §3.2, now
`M_urban = 10,000 + 5,000 × urban_share × (10,000 − sanitation coverage) × weight(city
class) / 10,000³`, weight from table 2.1), `F_dev` (unchanged formula) and doc 37's
urban land. It replaces slice 2's proxy (`1 − min(1, 3.2 × food workers / residents)`
weighted by region class), which is recalibrated in slice 9a.

### 2.3 Site quality and primacy

**Site score** (points, derived; typical 2,000-6,000) is what makes one region's city
larger than another's with the same urban population, and what makes people want to
live there (§3.3). Static terms come from geography and are public facts of a region
the seat has seen; dynamic terms come from what stands and happens there.

| Term | Points | Source |
| --- | --- | --- |
| Sea coast | +800 | `coastal` |
| Natural harbour (sheltered bay, estuary, fjord) | +700 | new worldgen attribute `natural_harbour` (about 35% of coastal regions; 60% of river mouths) |
| Navigable river | +800 | `river` |
| River mouth (river and coast) | +600 | derived |
| Confluence (three or more river links) | +400 | derived |
| Flat land | plains +600, steppe +300, forest +200, hills 0, marsh −200 (0 with T063), desert −400, mountains −600, tundra −800 | terrain |
| Climate | temperate +600, continental +200, tropical 0 (−400 before T053), arid −200 (+200 with climate control: T101 & T052), polar −1,000 | `climate` (doc 37 §5.1) |
| Fresh water | +300 when natural water supports ≥ 4 M | `water` |
| Crossroads | +150 per land, river or pass link above three, at most +600 | links |
| Worked resources | +100 per 5 levels of extraction works in the region (half for adjacent own regions), at most +500 | facilities (deposits count only when worked: no hidden deposit leaks) |
| Trade crossroads | +100 per trade route that crosses or ends in the region, at most +500 | doc 36 routes (slice 12) |
| Transport hub | +300 per mode at a modern stage beyond the first (electric railway or later, container port, motor highways or later, international airport, spaceport), at most +900 | network (§5) |

**Primacy** (share of the region's urban residents who live in its principal city):

    primacy = clamp(3,000 + site × 3 / 10 + 1,000 if the region holds the capital, 3,000, 5,000)

A capital on a good site reaches the cap; an ordinary inland region holds 35-40% of
its townspeople in its city. Primacy and site score are recomputed every 1 January
(site's static part once at load).

### 2.4 How site quality raises growth

Site quality never adds people. It works through four channels that already exist or
that this chapter defines, each with its own bottleneck:

1. **Food reach (provisioning).** Doc 37 §8.8 lets a region feed from the national pool
   only `local food + provisioning capacity`. The transport factor in that formula
   becomes the region's **access**:

       access_bp = 10,000 + best water term + best land term          (≤ 22,000)
       water: navigable river 2,500; harbour 2,500, steamship port 4,000, container port 6,000;
              canal +1,500, ship canal +3,000 (on top of the river)
       land:  roads 1,000, engineered roads 1,500, motor highways 3,000;
              railway 3,000, electric 4,000, high-speed or later 4,000 (freight unchanged), vactrain 5,000

   Before railways, only regions on the water can bring in grain in bulk: Rome and
   Constantinople lived on ships. That is the main reason port and river cities grow
   larger in the game too.
2. **Concentration** (§2.2): harbours, rivers, railways and transit raise the urban
   share.
3. **Attraction** (§3.3): climate, coast, services, jobs and the city's productivity
   draw migrants; a high site score raises the amenity term.
4. **Productivity and jobs** (§2.5): agglomeration raises output per worker in the
   city's sectors, lower carriage loss makes works there pay (the native AI sites works
   by delivered output, §5.9), and the posts they open draw migrants.

### 2.5 Agglomeration and congestion in `F_city`

    F_city(k) = (class term(city) + access bonus − congestion) × (10,000 + 600 × prosperity) / 10,000
                − 1,000 × (1 − water coverage) − health pressure / 4             (doc 36, range 8,000-12,500)

for k ∈ {Industry, Services, Knowledge} (Food, Extraction, Construction keep 10,000 as
their class term).

**Access bonus** (market reach, commuting and the exchange of ideas between nearby
cities, at most +600):

    reach = Σ over the region's links to regions at peace with it of city(j) × w(best mode on the link) / 10,000
          + Σ over its three largest air or suborbital partners of city(j) × w(air) / 10,000
    access bonus = min(600, 600 × reach / max(city, 1,000,000))

with the reach weights `w` of table 5.2 (track 500 ... high-speed rail 6,000, vactrain
9,000; international air 1,500). A well-connected metropolis among others gets the full
600; an isolated one gets little however large it is.

**Congestion** (urban mobility, at most −1,500):

    mobility = 500,000 (walking city) + Σ roads levels × 250,000 (motor highways 1,000,000)
             + Σ rail levels × 500,000 (commuter service) + urban transit capacity (§5.2)
    congestion = 1,500 × max(0, city − mobility) / city

A city of 300,000 needs nothing; a city of 3 million needs roads, a railway and a tram
system; one of 15 million needs highways, commuter rail and several metro levels.
Congestion also lowers attraction (§3.3). This is the capped economy of scale with a
bottleneck that doc 36 §4.4 allows: agglomeration and access give at most +2,500 bp
over a camp (11,400 + 600 − 9,500), and only while mobility, water and health keep up.

### 2.6 How metropolises emerge

Nothing scripts a metropolis. The loop is: a high site score gives a large primacy and
good access to food by water; the capital and a transport hub add to both; the city's
productivity draws works and their posts; vacant posts and services draw migrants
from the whole civilization (§3); the region grows, its urban share rises with railways,
transit and dense housing, and its city with it. The brakes are water and sanitation
(doc 36), provisioning, land and housing (doc 37), congestion and urban mortality
(here), and the attraction of rival cities. Typical result (targets in §8.4):

| Date | Largest city in the world | Largest city of a median seat |
| --- | --- | --- |
| AD 1 | 100,000-400,000 | 50,000-150,000 |
| 1500 | 150,000-500,000 | 80,000-250,000 |
| 1700 | 200,000-1 M | 100,000-400,000 |
| 1900 | 2-6 M | 1-3 M |
| 2000 | 8-20 M | 4-10 M |
| 2100 | 15-35 M | 6-15 M; a large civilization (≥ 300 M) has 2-6 metropolises, one or two of 10-30 M |

**Worked example** (provisional figures). *Lower Sarth*: river mouth with a natural
harbour, plains, temperate, the capital; static site 4,400 (coast 800, harbour 700,
river 800, mouth 600, plains 600, temperate 600, water 300; crossroads 0 with three
links). AD 1: 3 M residents, N 18%, c 3,500 → urban 6.3% = 189,000;
primacy 5,000 (cap) → a Town of 94,000. 1700: 6 M, N 33% → urban 11.5% → a City of
345,000. 1900: 25 M after a century of inflows, N 60%, c 4,500 (rail) → 27% → 6.75 M
urban → a City of 3.4 M. 2000: 60 M, N 92%, c 6,750 (rail, highways, two metro levels,
half in apartment blocks) → 62% → 37 M urban → a Metropolis of 18.6 M. 2100: 80 M,
70% → a Megalopolis of 28 M, if its water, sanitation, food reach, housing land and
mobility have kept up; otherwise congestion and mortality stop it earlier and the
migrants go to the next-best city.

---

## 3. Migration

### 3.1 What replaces what

Today (`sim/population.rs` "migration within the polity", `sim/economy.rs` "people
without posts drift toward regions that are hiring") two rules move people: a crowded
region sends 1.2% a month to its least crowded own neighbour, and 4% a month of the
jobless drift to regions with vacant posts. Both are replaced by one rule with a
voluntary part (§3.2-3.4) and a distress part (§3.5). The targeted relocation of
qualified holders to vacant qualified posts and to construction crews (economy step 2)
stays: it is a government posting, not migration.

### 3.2 Who moves

Movers are drawn from the age cells of the sending region's blocks with **migration
weights** per age (per 1,000; children follow their parents):

| Age | 0-14 | 15-19 | 20-34 | 35-49 | 50-64 | 65+ |
| --- | --- | --- | --- | --- | --- | --- |
| Weight | 600 | 1,000 | 2,500 | 1,200 | 400 | 150 |

`move_people` gains a profile argument (`Uniform` for resettlement and conquest, as
today; `Migrants`; `Settlers` = today's `adults_bias`). Lineage and religion stay with
each mover's block (the block is keyed by lineage and religion, so immigrants arrive
as their own block). Free holders of each qualification move in proportion to the
working-age movers (as today); under selective immigration (§3.6) only working-age
holders of a qualification and their children move. Learners and instructors stay with
their courses (as today).

### 3.3 Why: attractiveness

Each region `r` has an **attractiveness** `A_r` (bp, may be negative), recomputed every
1 January from last year's averages, with the distress flags (war, famine, outbreak)
updated monthly:

| Term | Formula (provisional) | Range |
| --- | --- | --- |
| Work | `6,000 × vacant posts / active adults − 6,000 × jobless / active adults` | ±3,000 |
| City | `2 × (F_city(Services) − 10,000)` (the urban opportunity premium; directed economy, so productivity stands in for wages) | −1,000 to +5,000 |
| Food | `food access − 10,000` (last 12 months) | ≤ 0 |
| Services | `1,000 × (health coverage + sanitation coverage + school places per child) / 3` | 0 to +1,000 |
| Standard of living | `(prosperity − 5,000) / 2` (doc 36 §5.5; per civilization, so it matters only across borders) | ±2,500 |
| Landscape and amenity | `site static amenity` = coast, harbour, climate and fresh-water terms of §2.3 + heritage amenity (doc 37 §8.3) | −1,200 to +3,000 |
| Crowding | `− crowd pressure / 2 − congestion` (§2.5) | ≤ 0 |
| Safety | battle in the region this month −3,000; enemy formation adjacent −1,000; outbreak −2,000; occupied −1,500 | ≤ 0 |
| Affinity | `+1,000 × share of the mover's lineage in the region + 500 if the same majority faith` (computed for the sending region's majority lineage and faith) | 0 to +1,500 |
| Policy | land grants +1,500 (§3.7) | |

### 3.4 Voluntary migration

Each month, for each region `i` the seat controls with at least 120,000 residents, the
engine considers destinations `j` within reach: own controlled regions, and foreign
regions where border policy allows (§3.6), whose path cost (below) is at most 6.

    gain_ij  = A_j − A_i − threshold         (threshold 1,000 inside a civilization;
                                              2,500 + culture distance / 4 across borders)
    friction = 1 + (Σ loss of the best mode on each link of the least-loss path) / 1,000
               (air: 1 + 30 / 1,000 between airports; capped at 6 = out of reach)
    rate_i   = min(mobility cap, Σ over the three best j of gain_ij / friction_ij / 10)   bp a year
    movers_i = residents_i × rate_i / 10,000 / 12   (remainder carried per region)

Movers are split among the three best destinations in proportion to
`gain_ij / friction_ij`. Culture distance is the mean absolute difference of the two
majority lineages' axes (doc 31), 0-10,000.

**Mobility cap** (bp of residents a year, the best mode on the region's links; a
region's voluntary out-migration never exceeds 300 bp a year):

| Best mode at the region | none (tracks) | roads | harbour or navigable river | railway | motor highways | high-speed rail or international airport |
| --- | --- | --- | --- | --- | --- | --- |
| Mobility cap | 30 | 60 | 80 | 150 | 200 | 250 |

**Intake cap**: a destination takes at most 5% of its own residents a year in voluntary
migrants (excess is refused in region-id order and carried as nothing: those people
stay). **Passenger cap**: the monthly movers between `i` and `j` are at most 30% of the
passenger capacity of the narrowest link on the path (table 5.2); the rest of the
capacity is everyday travel.

Order and determinism: all flows of a month are computed from the month-start state of
every region of every seat, then applied in (sending region id, destination id) order.
A seat's flows never depend on the order in which seats are processed.

### 3.5 Distress migration (refugees)

A region in distress sends people regardless of the threshold:

| Distress | Trigger | Extra outflow |
| --- | --- | --- |
| Famine | food access below 7,000 bp for three months | 50 bp a month |
| War | battle in the region this month, or occupation in its first 12 months | 100 bp a month |
| Epidemic | outbreak with severity ≥ 18,000 | 30 bp a month |

Refugees go to adjacent regions (land, river, pass or sea links) whose `A` is higher,
own or foreign; across a closed border at half the rate (borders leak), never into a
region where the same distress holds. Refugees are booked separately (they are counted
in migration and in the `refugees` lines). There is no intake cap for refugees, but
they count against the destination's provisioning like anyone else, so a flood of
refugees into a poorly supplied region spreads the hunger.

### 3.6 Across borders

`PolicySetting::Borders { immigration: Closed | Selective | Open, emigration: Free | Restricted }`,
per seat; default `Selective` and `Free`.

- **Closed**: no voluntary immigrants; refugees at half rate (above).
- **Selective**: only working-age holders of a qualification, with their children; at
  most 0.1% of the seat's population a year in all.
- **Open**: anyone.
- **Restricted emigration**: voluntary emigration needs twice the gain threshold;
  stability −1 in every region while it holds (the people resent the wall).
- Treaty clause `Clause::FreeMovement { months }`: the parties treat each other as
  Open, whatever their general policy.
- A route for migrants exists when both seats have met, are at peace, neither embargoes
  the other, and there is a land, river or pass link between their regions, a sea link
  between harbours, or an air link between airports.
- Voluntary international migration is capped at 50 bp a year of the sending region.

**Effects.** Immigrants keep their lineage and faith; existing cultural drift and
religious spread assimilate them over generations. Qualifications move with the people
(brain drain and brain gain, booked in `qual_flows.emigrated` and `immigrated`). A
region whose arrivals of foreign lineages in the last ten years exceed 5% of its
residents has stability −1 per 5% (at most −4) while its culture's Openness is below
5,000 (halved with the translation practice C024). Immigrants count for the
destination at once (residents are residents), including in G96.

### 3.7 Internal movement policies

`PolicySetting::MovementControl { region, mode: Free | Restrict | Encourage }`:

- **Restrict** (internal passports): voluntary out-migration from the region ×0.25;
  stability −2 there.
- **Encourage** (land grants and settler aid): attractiveness +1,500; every arriving
  migrant aged 15 or over costs 0.02 t of materials and 0.01 lots of tools (house and
  tools), taken from stock; without the goods the bonus lapses that month.

### 3.8 Urbanization and rural depopulation

Both emerge. Within a region, the move from village to town is not migration: it is the
urban share rising as farm work falls and concentration rises (§2.2). Between regions,
mechanized farming (doc 36: 10,000 → 1,500 posts per field level) leaves rural
regions with jobless adults (work term negative), poor services and low city premium;
their people leave for regions with posts. A region never falls below what its posts
need, because the work term turns positive as people leave. Calibration (§8.4) checks
that mostly agrarian regions lose population share after 1900 without emptying.

### 3.9 Conservation

People: every mover is taken from age cells in one region and added to the same cells
in another in the same month. Identities: per seat `Σ internal out = Σ internal in`;
per pair of seats `emigrated(A → B) = immigrated(B ← A)`; world `Σ emigrated =
Σ immigrated`; qualified holders likewise per qualification; refugees ⊂ migrants. Goods:
land-grant goods are booked `used`.

---

## 4. Natural defence of large cities

### 4.1 Urban terrain

In a battle in region `r` (`sim/military.rs`), the defender's terrain factor becomes

    defence_bp = min(20,000, terrain_bp × (10,000 + urban_bp + fort_bp) / 10,000)

| City class | Town | City | Metropolis | Megalopolis |
| --- | --- | --- | --- | --- |
| `urban_bp` | +500 | +1,500 | +2,500 | +3,500 |

`terrain_bp` stays 11,500 for hills, mountains, forest and marsh and 10,500 otherwise.
The urban bonus applies to every defender (formations and militia) of the region's
controller and friends; it does not apply to the attacker even when the attacker
already holds part of the region (the battle is for the city). It is independent of
equipment generation: street fighting has favoured defenders from Syracuse to
Stalingrad.

### 4.2 Fortifications (a new building line)

| Stage | Era | Requires | Bill | Work (k wm) | Months | Upkeep per month | `fort_bp` against attackers' mean generation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Palisade and earthworks | 0 | T012 | timber 10, materials 10 | 40 | 3 | timber 0.1 | +1,000 vs G0-G1; 0 later |
| City walls | 1 | T024 | materials 80, tools 3 | 300 | 12 | materials 0.3 | +3,000 vs G0-G1; +1,500 vs G2; 0 vs G3+ |
| Bastion fortress | 3 | T037 & T040 | materials 200, metal 5, tools 5 | 800 | 24 | materials 0.5, munitions 0.05 | +3,000 vs G0-G2; +1,000 vs G3; 0 vs G4+ |
| Fortified zone | 5 | T064 & T050 | materials 400, metal 40, components 5 | 1,000 | 18 | materials 1, spares 0.2 | +1,500 vs G0-G5; +500 vs G6+ |

One level per region; it needs a city of Village class or larger. Walls and the bastion
fortress are heritage-eligible (doc 37 §8.3: "old town walls"). The obsolescence of the
first three stages follows the attacker's generation, so a powder-age civilization's
old walls still help against warbands but not against rifles: the decision is whether
to keep paying their upkeep.

### 4.3 Militia, siege and capture

- **Militia** (doc 37 §2.4: one working adult in forty, at most 500,000, at 40% power)
  is unchanged; it fights with `defence_bp`.
- **Siege.** A region is besieged in a month when an enemy formation stands in it, no
  land, river or pass link leads to an uncontested region of the defender's side, and
  either it is not coastal or no own harbour region lies within one sea link. A
  besieged region's provisioning capacity is 0 (doc 37 §8.8): it eats only its local
  food. After three months of food access below 7,000 bp, its defenders' supply is
  capped at 5,000 and `urban_bp` and `fort_bp` are halved ("the city starves"). Famine
  deaths are ordinary nutrition-debt deaths; distress migration (§3.5) continues to any
  open neighbour (there is none while besieged, so people stay).
- **Capture months**: control passes after holding the region uncontested or
  overwhelmed for 5 months (as today), 6 for a City, 7 for a Metropolis, 8 for a
  Megalopolis. Sovereignty after six more months, as today.
- **Cost of urban battle**: each battle month in a region with a City or larger damages
  its facilities' condition by 5% more than today and kills 0.1% of the region's
  residents (civilian deaths, booked as war deaths). Occupation of a Metropolis or
  Megalopolis starts unrest at 7,000 instead of 6,000.

### 4.4 Bounds and interaction with doc 37

- The defender multiplier never exceeds 2× (20,000), so the three-to-one rule (applied
  to effective power) needs at most six times the defenders' raw power. A generation
  gap of two already gives 6.25:1 per soldier (doc 37 §2.2): a modern army takes an
  old city; peers fight for months and pay for it.
- Encirclement is the cheap way in: take the neighbours, cut the sea, wait. A city with
  a harbour and its own sea neighbour cannot be starved without taking that region.
- Off-world sites keep doc 37 §6.6's terrain factor 15,000 and siege rule; urban
  classes do not apply to them.
- Calibration (§8.4): capturing a region with a Metropolis costs the attacker 1.5-3×
  the losses of a comparable region without a city; at least one Metropolis changes
  hands in ≥ 30% of matches with wars after 1900.

---

## 5. Transport networks

### 5.1 Model

**Decision: networks are built per region; links inherit them.** Each transport line
is a building line of doc 37 §8.2 (a facility kind per stage) with **levels**: the
stage sets speed and loss (technology), the levels set capacity (how much network the
region has). A link between two regions carries a mode at the lower stage and the lower
level count of its two ends (a railway exists between them when both have one: lines
meet at the border). Links across borders need both seats at peace, no embargo and
transit where a third seat is crossed (doc 36 §6.2). Pass links carry land modes at
half capacity and 1.5× loss; river links carry natural navigation without building;
sea links need harbours at both ends. Air links join any two regions with airports
within range, with no adjacency. Building on links (a railway from A to B) would be
more literal but needs a new kind of state and a link-level queue; per-region lines
reuse facilities, queues, quotes, upgrades and the public tree as they are.

### 5.2 Modes and stages

Per level, display units (kt; thousand lots; work in thousand worker-months), all
provisional. "Freight" in the region is facility levels of industry, extraction and
power its network serves (units §7's unit, so the congestion rules keep working).
"Link freight" is kt a month over one link; "passengers" thousand people a month over
one link; loss in bp per link crossed; reach weight `w` for the access bonus (§2.5);
upkeep is per level-month at full use (§5.6). Crews follow units §6 classes (civil
works for roads, canals, harbours, fortifications; industrial for railways, steamship
and container ports, highways, pipelines; electrical and computing for electric and
later railways, metros, international airports).

| Line | Stage (era) | Requires | Bill per level | Work | Months | Posts per level | Upkeep per level-month | Region freight | Link freight | Passengers | Loss | `w` | Armies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| - | Tracks (no building) | - | - | - | - | - | - | 10 (base, once) | 2 | 2 | 1,200 | 500 | 1 link a month (pass, sea 2) |
| Roads (max 4) | Roads and waystations (1) | T027 | materials 60, tools 5 | 300 | 6 | 2,000 | tools 0.5; horses 20 until T094 | 6 | 10 | 10 | 500 | 1,000 | - |
| | Engineered roads (4) | T050 & T027 | materials 150, metal 2, tools 8 | 600 | 9 | 2,000 | tools 0.8, materials 0.5; horses 20 until T094 | 10 | 30 | 20 | 350 | 1,500 | - |
| | Motor highways (5) | T094 & T064 | materials 400, chemicals 20, metal 20, components 10 | 1,500 | 18 | 4,000 + 1,000 mechanics | fuel 3, spares 1, materials 1 | 20 | 300 | 200 | 100 | 3,500 | G4+ 2 links a month in friendly land |
| | Automated highways (8) | T122 & T114 | electronics 2,000 lots, hardware 20 lots, components 20 | 600 | 12 | 1,000 + 300 programmers | electric 40, compute 10, fuel 2, spares 0.8 | 30 | 450 | 300 | 60 | 4,000 | as highways |
| Canals (max 2; river region, or plains next to a river region) | Canals and locks (2) | T021 & T024 & T012 | materials 200, timber 20, tools 10 | 1,000 | 24 | 2,000 | tools 0.5, materials 0.3 | 10 | 60 | 10 | 250 | 1,500 | - |
| | Ship canal (4) | T080 & T050 & T063 | materials 600, metal 20, coal 20 | 2,500 | 36 | 2,000 + 500 mechanics | coal 1, materials 1 | 20 | 200 | 20 | 150 | 1,500 | - |
| - | Natural river navigation | river link; T013 | - | - | - | - | - | 6 (river region) | 20 | 10 | 400 (300 with T028) | 1,500 | 1 link a month |
| Harbour (max 3; 4 with a natural harbour) | Harbour (1) | T013, coast | materials 40, timber 20, tools 3 | 200 | 6 | 4,000 | tools 0.4, timber 0.5 | 6 | 20 (60 with T028) | 10 | sea 600 (300 with T028) | 1,000 | sea link 2 months |
| | Steamship port (4) | T080 | materials 200, metal 30, components 5, coal 10 | 800 | 12 | 4,000 + 500 mechanics | coal 2, tools 0.5 | 15 | 300 | 50 | 120 | 2,000 | sea link 1 month |
| | Container port (5) | T092 & T094 | materials 400, metal 60, components 20 | 1,500 | 18 | 2,000 + 1,000 mechanics | fuel 2, spares 1, electric 20 | 30 | 1,500 | 50 | 50 | 2,500 | sea link 1 month |
| Railway (max 4) | Railway (4) | T068 | metal 150, materials 800, timber 60, components 10 | 1,500 | 24 | 4,000 + 2,000 mechanics | coal 3, tools 1, spares 0.3 | 20 | 200 | 50 | 150 | 2,500 | any gen 3 links a month on rail in friendly land |
| | Electric railway (5) | T101 & T102 (Current and Wire: T101) | metal 60, conductors 30, components 15, materials 200 | 900 | 18 | 3,000 + 1,000 electricians | electric 40, spares 0.5 | 25 | 300 | 100 | 120 | 3,000 | as railway |
| | High-speed railway (6) | T107 & T102 & T050 | metal 150, materials 1,500, conductors 40, components 20, electronics 500 lots | 2,500 | 36 | 3,000 + 1,000 electricians + 500 technicians | electric 80, spares 1, electronics 20 lots | 25 | 300 | 400 | 120 | 6,000 | 4 links a month |
| | Maglev (6) | T108 & T107 | metal 200, magnets 15, conductors 60, materials 1,000, electronics 1,000 lots | 3,000 | 36 | as high-speed + 500 technicians | electric 150, spares 1 | 30 | 400 | 800 | 80 | 7,000 | 4 links a month |
| | Vactrain (7) | T156 & T108 & T042 & T121 | metal 600, magnets 30, conductors 80, materials 3,000, components 60, electronics 2,000 lots | 6,000 | 48 | as maglev + 1,000 technicians | electric 400, spares 3 | 35 | 600 | 2,000 | 50 | 9,000 | 6 links a month; pass links at full capacity and loss |
| Air (max 2) | Airfield (5) | T038 & T091 | materials 150, metal 10, fuel 5 | 400 | 9 | 2,000 + 500 mechanics | fuel 3, spares 0.5 | 1 | 2 (light goods) to airports ≤ 4 links away | 20 | 30 | 1,000 to partners | G5+ airlift 20,000 soldiers a month |
| | International airport (6) | T083 & T038 & T107 | materials 600, metal 40, components 20, electronics 300 lots | 1,500 | 24 | 6,000 + 1,000 technicians + 500 mechanics | fuel 10, spares 1, electric 40 | 2 | 20 (light goods), any distance | 200 | 20 | 1,500 to the 3 largest partners | G5+ airlift 50,000 soldiers a month |
| Pipeline (max 2) | Oil and gas pipelines (5) | T090 & T067 | metal 80, components 5 | 500 | 12 | 500 + 200 technicians | electric 10, spares 0.3 | 15 (wells, refineries and chemical works only) | 500 (crude, gas, fuel only) | - | 20 | - | - |
| Urban transit (max 4; needs a Town) | Tramways (4) | T068 & T080 (electric method with T101) | metal 20, materials 40 | 200 | 9 | 2,000 | horses 30, or coal 1, or electric 20 | - | - | - | - | - | urban mobility +1 M |
| | Metro (5) | T101 & T068 & T050 | metal 60, materials 400, conductors 20, components 10 | 2,000 | 36 | 3,000 + 500 electricians | electric 60, spares 0.5 | - | - | - | - | - | urban mobility +3 M; housing density +10% (doc 37) |
| | Automated transit (8) | T122 & T114 | electronics 1,000 lots, hardware 10 lots, components 20 | 600 | 12 | 500 + 200 programmers | electric 80, compute 10 | - | - | - | - | - | urban mobility +5 M |
| Launch (doc 37 §7.2) | + suborbital express (method of the spaceport, 7) | T154 & T152 | - | - | - | +500 orbital crew | fuel 20, spares 0.5 at full use | - | 1 (light goods) to any spaceport | 5 | 30 | 1,000 to partner spaceport cities | G7 rapid deployment 20,000 soldiers a month to any region |

Notes:

- **Light goods** (air and suborbital freight): electronics, medicine, precious metals,
  instruments, helium-3, and people. Everything else goes by land or sea.
- **Natural harbour**: bill −25%, link freight +25%, one more level allowed.
- The **motor depot** (`depot`, 2.0) is retired: its vehicles and repair crews are part
  of the motor highway stage (hence the fuel and spares upkeep). Existing `rail`,
  `roads` and `port` keys stay as the first stages of their lines.
- Era and technology gates follow doc 37 §8.3's technology eras, so the stages fall in
  their historical order: roads in the Classical era, canals in the Medieval, ocean
  harbours early modern (sea routes of any length with T028, doc 36), steamship ports,
  railways, engineered roads and ship canals in the Industrial, electric railways,
  highways, container ports, airfields, pipelines and metros in the Modern, high-speed
  rail, maglev and international airports in the Information era, vactrains and
  suborbital express in the Space era, automated stages in the AI era.
- Doc 37's automation retrofit template does not apply to transport lines; their
  automated stages are named above.

### 5.3 Regional freight capacity and congestion

    freight capacity(r) = 10 + Σ over the region's network lines of levels × region freight(stage)

replaces `FREIGHT_CAPACITY[transport grade]`. Load, `infra_bp`, shared support, pooled
maintenance and the congestion loss (units §7) are unchanged. Check: a region of 1850
with two levels of roads, a harbour and a railway serves 10 + 12 + 6 + 20 = 48 levels
(grade 2 served 60); a capital of 2000 with three levels of highways, two of electric
railway and two of container port serves 10 + 60 + 50 + 60 = 180 (grade 3 served
150). Pipelines count only toward the load of wells, refineries and chemical works.

### 5.4 Links: capacity, loss and routes

For a link `(a, b, kind)`:

- **modes on the link**: each land mode at `min(stage_a, stage_b)` with
  `min(levels_a, levels_b)`; the natural river mode on river links; sea modes on sea
  links when both ends have harbours; air between airport regions within range (any
  region pair, airfield range four links of graph distance, international unlimited).
- **link freight capacity** = Σ over its modes of levels × link freight(stage) (pass ×½);
  **passenger capacity** likewise; **loss** = the least loss among the modes that can
  carry the good (pass ×1.5).
- **Routes** (doc 36 §6.2) are least-loss paths over links (Dijkstra over regions, ties
  by region id), as now, but the loss of a link is that of its best mode, and a route's
  **capacity is that of its narrowest link** (bottleneck), shared by every route
  through it in proportion to their orders (largest remainder). The gateway table of
  doc 36 §6.2 is retired; a seat's traded mass is bounded by its routes' capacities.
- **Ice lanes**: sea links that worldgen marks `ice` (both ends polar or subpolar, about
  5-10% of sea links on the Earth-like world) carry a third of their capacity (open four
  months a year) except for the Atom nuclear fleet (§6.1).

### 5.5 Carriage inside a civilization

`link_efficiencies` becomes the least-loss path from the capital over links through
regions the seat controls, using each link's best mode for general goods:

    efficiency(r) = max(4,000, 10,000 − Σ loss along the path)       (capital: 10,000)

so a region three track links from the capital delivers 64% of what it sends, three
road links 85%, three railway links 95.5%, three high-speed links (freight as electric
railway) 96.4%. A region with no path (cut off) delivers 4,000 (smuggled, scattered
carriage) instead of today's 5,500. Integrated chains and congestion (units §7) apply
on top, unchanged. Food is not carried (doc 36); provisioning governs it (§2.4).

### 5.6 Costs, upkeep and use

- **Build**: ordinary construction orders and upgrades (doc 37 §8.3: upgrade in place
  for 60% of the next stage's bill and work, the converting levels idle). A converting
  railway level carries nothing while it is rebuilt.
- **Upkeep scales with use**: each line's upkeep is
  `full × (3,000 + 7,000 × min(10,000, use_bp) / 10,000) / 10,000`, where `use_bp` is the
  region's freight load over its freight capacity (for freight lines), its passengers
  over capacity (air, urban transit), or the carried tonnage over capacity (pipelines).
  An idle network still costs 30%.
- **Labour**: transport posts are Services posts (doc 36 `LP` applies); an
  understaffed or unsupplied line runs at its rate, and its capacity and stage count at
  that rate (a railway without coal falls back to the next mode on the link).
- **Damage**: each battle month in a region lowers its network lines' condition by 10%;
  a captured network serves its new controller after capture at its condition.

### 5.7 Military movement and supply

- **Movement** (`next_step`): a formation may cross several links in one month when
  every link on the way is in friendly control and carries the mode: railway any
  generation 3 links (high-speed, maglev 4; vactrain 6); motor highways for G4 and
  later 2 links. Sea links take 1 month instead of 2 when both ends have a steamship
  port or later. Moving into a hostile region always ends the month's movement there.
- **Airlift** (`Action::Airlift { army, to }`): a G5 or later formation in a region with
  an airport moves to a friendly region with an airport within range, up to the
  airlift capacity of the smaller airport this month (formations larger than it take
  several months). **Suborbital deployment** (G7, spaceport with the suborbital method)
  reaches any region, hostile included (landing on the objective), up to 20,000
  soldiers a month per level.
- **Supply reach**: a formation's supply target becomes
  `min(goods share, 5,000 + reach / 2)`, where `reach = efficiency of the nearest
  friendly-controlled region on its path − 1,200 per link into non-friendly land`
  (floor 0). Interior lines matter: deep invasions without captured networks starve
  slowly; defenders at home are supplied by their own railways. The effect is halved
  (5,000 floor) so that it shapes rather than decides wars.

### 5.8 How it plugs in

- **Doc 37 building lines**: every stage above is a `FacDef` with `line`, `stage`, `era`
  and upgrade edges (Upgrade along each line; Variant for tradition stages, §6.1;
  Alternative for pneumatic networks, which do not convert into metros). They appear in
  the public building tree with masked requirements (doc 37 §8.9), except the unlisted
  and sealed works of §6.3-6.4.
- **Doc 36 routes**: modes, loss and capacity per link replace the gateway and loss
  tables; markets (connected components) are unchanged.
- **Doc 37 provisioning**: `access_bp` (§2.4).
- **Doc 37 land**: each network level takes land (roads 0.05 lu, railway 0.05, highway
  0.1, airfield 0.2, international airport 0.5, container port 0.2, canal 0.1), counted
  as industrial land.
- **Doc 37 eras**: the Industrial era's built proof could count railways; it does not
  change (ten levels of machine shops, textile mills or steelworks).

### 5.9 The native AI's network planning

Once a year (written as directives in long rounds), in order:

1. **Relieve bottlenecks**: any region whose freight load is above 85% of capacity, or
   whose congestion loss is positive, orders one more level of its cheapest available
   line per freight added, or upgrades its oldest stage when a successor is buildable
   (doc 37 upgrade rule).
2. **Backbone**: keep a spanning tree of the seat's regions rooted at the capital
   (breadth-first, ties by region id) served by the best land mode the seat can build;
   build missing pieces on the tree from the capital outward, weighted by each region's
   output sent to the stock.
3. **Water**: a harbour in every coastal region with a city of Town class or larger, a
   natural harbour, or a used sea route; upgrade the busiest harbour first; canals in
   river regions whose carriage loss to the capital exceeds 1,500 bp.
4. **Cities**: urban transit when congestion is above 300 bp; an airfield at a city of
   1 M, an international airport at 3 M; high-speed rail between adjacent cities both
   of 3 M or more; fortifications (before G3) in the capital and frontier regions with
   a Town or larger when a met seat's trust is below 40.
5. **Military**: rail to every region bordering a seat with trust below 40.
6. **Budget**: transport takes at most 15% (antiquity) to 25% (industrial and later) of
   the year's construction goods by base value; candidates are ranked by
   `(Δ carriage loss × output sent + Δ congestion relief + Δ provisioning shortfall
   covered + Δ access bonus × urban posts + military weight) / (quote at base prices +
   20 years of upkeep)`.
7. **Siting works**: when the AI chooses where to build a works, it ranks regions by
   delivered output (efficiency × (10,000 − congestion)) and spare freight, so works
   gather in well-connected regions, which is how its cities grow.

Migration and defence: the AI sets `Selective` borders by default, `Open` when vacant
posts exceed 5% of active adults and stability is 50 or more, `Closed` when joblessness
exceeds 8% or toward a seat it is at war with; it encourages settlement in regions with
idle land and vacancies, and restricts movement only on Hard when a region loses more
than 2% of its qualified people a year. When attacking, it values targets by
`value / defence_bp` and takes a besieged city's neighbours before assaulting a
Metropolis. Difficulty changes the breadth of these rules, never the information used.

---

## 6. Tradition transport and hidden transport

### 6.1 Tradition transport modes

Knowledge is never locked (doc 37 §1.2): every seat can understand the technologies
below. Only these stages and methods are the tradition's exclusive works, buildable
while the tradition is held; bonuses marked ×m scale with mastery. Each set is one or
two works, each meant to change a decision.

| Tradition | Work (line, edge) | Requires | Bill per level | Upkeep per level-month | What it does | Drawback | The decision it creates |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Coal and Steam ("steampunk") | **Aerial packet line** (Air, Variant; upgrades to airfield) | T080 & T042 & T064 | metal 10, materials 30, chemicals 5, insulation 2 | coal 2, chemicals 1 (hydrogen), spares 0.3 | hydrogen airships with steam engines: air links up to 6 links away from the Industrial era, 100 years before airfields: passengers 20 k, light goods 2 kt per level-month, loss 100, `w` 1,500 (+20% ×m) | fire: per level-year 1 in 100 a disaster (the level is lost, stability −2 in the region, chronicle moment) | connect mountain, island and landlocked regions for migration, access and light trade now, or wait for rail; competes for coal |
| | **Pneumatic city network** (Urban transit, Alternative) | T042 & T080 & a Town | metal 15, materials 30 | coal 1 | urban mobility +1.5 M per level; Services general posts in the region −5% ×m (parcel and message tubes) | does not convert into a metro (demolish and rebuild) | decongest a steam city a generation early, at the price of stranded plant later |
| Oil and Engine ("dieselpunk") | **Trunk highway with road trains** (Roads, Variant of motor highways) | T091 & T092 | as motor highways | fuel 4.5, spares 1.2, materials 1 | the motor highway stage one technology earlier; region freight 30 and link freight 450 per level (+10% ×m) | without fuel the stage falls back to engineered roads; blockade exposure | skip the railway and build roads for less metal, or keep rail as an oil-proof backbone |
| | **Ground-effect sea line** (Harbour, Variant at steamship port or later) | T038 & T092 | as the port stage + components 10 | the port's + fuel 3 | ekranoplans: sea loss −40% for light and lot goods; passengers 100 k per level; formations cross a sea link in 1 month and attack directly from the sea | fuel hunger; craft lost in storms (1% of sea capacity a year rebuilt as spares 2) | fast reach across seas and island wars at a fuel cost |
| Current and Wire ("electropunk") | **Electric highway** (Roads, Variant of motor highways) | T101 & T102 | as motor highways + conductors 20 | electric 60, spares 1, materials 1 (no fuel) | overhead-wire trucks: motor highway capacity, speed and military movement without fuel (+10% link freight ×m) | needs the region on a grid; grid faults (doc 37 §4.2) idle it for the month | motor logistics without oil, tied to electricity |
| | Trams and metros (doc 37 variant, unchanged) | T101 & T068 | - | - | urban mobility of a metro a stage early; housing density +25% ×m | - | (doc 37) |
| Atom ("atompunk") | **Nuclear merchant fleet** (Harbour, Variant of container port) | T147 & T092 | as container port + nuclear fuel 20 lots, metal 20 | nuclear fuel 0.5 lots, spares 1 (no fuel) | sea loss −50%, link freight ×1.5 (+10% ×m); icebreakers open **ice lanes** year-round for the seat's routes (§5.4) | reactor incident: per level-year 1 in 1,000 (1% of the region resettled to neighbours, the level idle 24 months); uranium dependence | polar shortcuts and oil independence at sea, against risk and uranium |
| Network ("cyberpunk") | **Remote-work network** (new kind, one per region) | T112 & T123 | electronics 500 lots, hardware 5 lots, conductors 10 | compute 5, electric 20, electronics 10 lots | up to 10% ×m of the Services and Knowledge qualified posts of an own region may be filled by holders living in another own region with the network; urban mobility demand −20% ×m in the region | network incidents (doc 37) stop it for 6 months | decentralize (small regions keep their skilled people, metros less needed) or agglomerate (full access bonus in one city) |
| | **Adaptive traffic control** (method on motor highways and later rail stages) | T112 & T116 | - | compute 10 per level | the region's congestion loss halved; link freight +20% ×m | network incidents: −30% capacity for 6 months | trade compute for concrete |
| Living Systems ("biopunk") | **Self-healing biocrete** (method on roads, canal and railway stages) | T132 & T130 | bill materials −50%, + chemicals 10, fibres 5 per level | upkeep materials and tools −60% | grown binders repair cracks and slopes | build months +50% (doc 37 drawback) | a cheap-to-keep dense network for large regions, slow to build in war |
| | **Living waterway** (Canals, Variant) | T133 & T130 | materials 100, chemicals 10, fibres 10 | chemicals 0.2 | canal capacity −30%, but amenity +300 for attraction, fishery +10%, irrigation +1 field level watered | lower capacity | a river that draws people versus a ship canal that draws freight |
| Synthetic Minds ("AI-punk") | **Autonomous logistics hub** (new kind, max 2 per region) | T122 & T114 | hardware 20 lots, electronics 1,000 lots, components 20, batteries 500 lots | compute 20, electric 100, batteries 20 lots, spares 1 | in its region and own regions within 2 links: transport posts −80%; link loss −30%; drones carry light goods 10 kt a month per level to any own region within 4 links without airports; mountains, desert and tundra regions count as engineered roads for freight | unemployment unrest (doc 37 rule); while at war with a Network seat, hub capacity −30% (cyber interdiction) | replace roads in hard terrain and transport labour, against compute, power and unrest |

In the public tree (doc 37 §8.9) these works appear as Variant or Alternative nodes with
`tradition: Some(key)` and masked technology leaves; the tradition key is public, as
traditions are among met seats.

### 6.2 Generic late transport

Vactrains, suborbital express and the automated stages are listed in the public tree
like any other work, with masked requirements (table 5.2): their existence is public;
which technology opens them is not.

### 6.3 Orbital tether (unlisted)

A new technology **T183 "Momentum-exchange tethers and orbital elevators"** (group L;
prerequisites T145 & T108 & T152 & T050; tier 9; extrapolated; tags Space, Build,
Electric; investigation needs an orbital station; era Space). It opens a launch-chain
stage **orbital tether** (doc 37 §7.2): a rotating skyhook in low orbit catches
suborbital vehicles. Per level-month: 3,000 t of lift for fuel 10 and electricity 2,000
(electrodynamic reboost), spares 2; bill metal 300, magnets 40, conductors 100,
components 50, hardware 2 lots, built at an orbital station; max 1 level per seat; the
spaceport hub term counts it. Its region's city gains +300 site points (world port).

### 6.4 Listing rule for deep works

Doc 37 §8.9 makes the whole tree public with masked requirements, and seals jump
content. At the user's request ("transport that comes from late or hidden technology,
revealed only to seats that discovered them"), the content gains `listed: bool`
(default true). A kind with `listed: false` is absent from the static tree and from
every overlay until the seat has discovered every technology in its requirement; then
it appears in that seat's overlay only. Only the orbital tether is unlisted. The
isolation scan of doc 37 §11.2 extends to unlisted kinds.

### 6.5 Interface relay (sealed)

**Interface relay** (requires T165 and an operating lattice works anywhere under the
seat; sealed like all jump content: absent until `victory_revealed`): a pair of relay
stations in two own regions moves up to 50 kt a month of goods between them with no
loss and no link, for lattice 1 lot, helium 0.02 t and 2,000 electricity per station
level-month. It gives the lattice a late civil use and lets a seat bridge a blockade
between two of its own regions. Not a victory condition, never a population mover.
First on the cut list.

---

## 7. Interface implications (views and data, not mock-ups)

1. **City overlay** (default on the political map): one marker per inhabited region at
   its city position, sized by class; Metropolis with a skyline glyph, Megalopolis
   with a halo; capital star; city name label (by zoom). Foreign cities show class
   only where observed.
2. **Transport overlay**: lines by mode (roads brown, solid by stage; canals and
   navigable rivers blue; sea lanes dotted with stage weight, ice lanes white; rails
   black with ties, high-speed red, maglev and vactrain violet; air arcs between
   airports; pipelines grey); width by levels; links coloured by use (green below 70%,
   amber, red above 90%); bottleneck markers.
3. **Flow overlay**: net migrants per link (arrows, width by log of people, refugees in
   red), trade routes (doc 36), toggles per kind; time window round or last 12 months.
4. **Region and city card**: city name, residents, class, rank in the civilization,
   growth over 10 years; residents split city / towns / countryside; urban share with
   concentration breakdown; site score with every factor; primacy; access bonus with
   partners; mobility, congestion and the transit that would relieve it; provisioning
   need and access; attraction with factors; arrivals and departures by origin; defence
   (urban, fortification against each generation, capture months, siege state).
5. **Transport planning view**: network map with mode filter; per region the lines
   (stage, levels, condition, use, upkeep this month); per link the modes, capacity,
   use and loss; a bottleneck list; a path planner "connect A to B by <line> at <stage>"
   showing the quotes of the missing pieces, months, upkeep and the change in loss,
   reach and freight; upgrade and build orders; `connect` directives.
6. **Migration view**: flows by region pair and by foreign seat (table and Sankey);
   age and qualification profile of arrivals and departures; attraction ranking of own
   regions with factors; border policy, free-movement treaties, movement controls and
   land grants with their cost; refugee alerts.
7. **Military**: movement range by mode on the map; airlift capacities; supply reach on
   the army card; defence of the target region in the attack preview.
8. **Building tree**: the new lines; tradition variants marked; unlisted works appear
   in the seat's overlay only when discovered.
9. All new strings in English, Simplified and Traditional Chinese.

---

## 8. Protocol, content, save changes and plan

### 8.1 Protocol, content and saves

All within doc 36's version bump (`bts-protocol/2.0`, `bts-rules/3.0.0`,
`bts-content/3.0.0`, `bts-worldgen/2.0.0`); new fields `#[serde(default)]`.

**Worldgen** (`bts-worldgen/2.0.0`): `Region.natural_harbour: bool`, `Region.city_name:
String`, `World.ice_links: Vec<(RegionId, RegionId)>` (sorted pairs), city position in
the region polygon (`Region.city_at: [i32; 2]`, on the coast or river where there is
one). Site terms are derived at load.

**Content**: about 30 new facility kinds (the stages of §5.2, fortifications, tradition
works of §6.1, remote-work network, logistics hub, orbital tether, interface relay) with
`line`, `stage`, `era`, `listed`, `land_milli` and per-stage network data (region
freight, link freight, passengers, loss, `w`, army movement, airlift); `depot` retired;
technology T183; light-goods flag on goods.

**State**: `Region.city_name` (renamable), `Region.migr_rem: Vec<(RegionId, i64)>`
(replaces the scalar); `Civ.borders`, `Civ.movement_controls: Vec<(RegionId, Mode)>`,
`Civ.migration` (round sums by region pair and by seat). Nothing else: city, site,
links and capacities are derived each month (site's static part and links cached per
round and on change).

**Observation**:

| Field | Content |
| --- | --- |
| `RegionView.city` | `Option<CityView { name, class, capital: bool, at: [i32; 2] }>` (foreign: where observed) |
| `RegionView.network` | `Vec<(line, stage)>` (foreign: where observed; levels hidden) |
| `OwnRegion.city` | `OwnCityView { residents, towns, countryside, urban_share_bp, concentration: Vec<FactorView>, primacy_bp, site: Vec<FactorView>, site_score, access_bonus_bp, access_partners, mobility, congestion_bp, defence: DefenceView { urban_bp, fort_bp, fort_vs_gen: [i32; 8], capture_months, besieged } }` |
| `OwnRegion.network` | `NetworkView { lines: Vec<NetLineView { line, kind, stage, levels, condition_bp, use_bp, upkeep }>, freight_capacity, freight_load, infra_bp, maintenance_saving_bp, congestion_loss_bp, chain_exempt, chain_loss_saved, access_bp }` (replaces `InfraView`) |
| `links` | `Vec<LinkView { a, b, kind, ice, modes: Vec<LinkModeView { mode, stage, freight, passengers, loss_bp }>, used }>` for own regions and their neighbours; `air_links` own only |
| `migration` | `MigrationView { borders, controls, internal: Vec<FlowView { from, to, people, refugees }>, international: Vec<SeatFlowView { seat, immigrants, emigrants, refugees_in, refugees_out, quals_in: [u32; NQ], quals_out }>, attraction: Vec<AttractionView { region, total_bp, factors }> }` |
| `CivView` | `urban_share_bp`, `largest_city` |
| `ArmyView` | `move_modes`, `supply_reach_bp`; `MilitaryView.airlift` |

**Actions and settings**: construction and upgrades of the new kinds (existing
actions); `Action::Airlift { army, to }`; `Action::RenameCity { region, name }`;
`PolicySetting::Borders { immigration, emigration }`, `PolicySetting::MovementControl
{ region, mode }`; `Clause::FreeMovement { months }`; directive `Connect { from, to,
line, stage, priority }` (each 1 January orders the next missing or lower-stage piece
on the least-cost path, through the same validation as the order).

**Saves**: `bts-save/2`; dev saves of earlier ruleset-3 slices are refused by the
ruleset string (doc 36).

**Ledgers** (`docs/conservation-audit.md`): migration (internal out = in per seat;
emigrated = immigrated per seat pair; refugees ⊂ migrants; per qualification
likewise); city partition (city + towns + countryside = residents); transport upkeep
(booked used); carriage (made = delivered + lost, with link losses); link use ≤
capacity per link and month (trade and migrants); airlift ≤ capacity; land-grant
goods; civilian deaths in urban battle (war deaths).

### 8.2 Where the work goes in doc 37's merged plan

Doc 37 §11.1 numbering is kept; two slices are inserted as 7b and 9a and one as 9b,
so that the engineer's work on slices 4-6 stays valid.

| # | Slice | Change from this chapter |
| --- | --- | --- |
| 4 | Earth-like world (in progress) | **add** `natural_harbour`, `city_name`, `city_at`, `ice_links` (cheap now, and they belong to the one `bts-worldgen/2.0.0`); tests: natural harbours 30-40% of coastal regions, ice links only between polar or subpolar regions, determinism native and wasm |
| 5 | Resources and goods (in progress) | none (light-goods flag on `Good` can ride along) |
| 6 | Productivity (in progress) | **hook only**: `F_city` takes its class from `city_class(w, ri)`, which returns the region class until slice 9a (no behaviour change) |
| 7 | Building lifecycle and public tree | transport, canal, air, pipeline, urban transit and fortification kinds authored as lines and stages; until 7b each stage maps to the legacy transport grade (roads and harbours 1, railway 2, highway 3) so behaviour is unchanged; `listed` flag in the tree builder and its isolation scan |
| **7b** | **Transport network** (new) | §5.1-5.6, 5.9 (and the movement part of 5.7 if slice 8 is done first, otherwise in 8): network per region, regional freight sum, links with modes, capacity, passengers and loss, ice lanes, air links, least-loss carriage, upkeep by use, `depot` retired, `NetworkView`, `LinkView`, `Connect` directive, AI planner |
| 8 | Military modernization | **adds** network movement, airlift, supply reach, network damage in battle |
| **9a** | **Cities and sites** (new) | §2 and §4: urban share model, principal city, site score, primacy, city classes re-keyed (`F_city`, `M_urban`, Classical proof), access bonus and congestion, fortifications, urban defence, siege, capture months, `CityView`, rename; slice 2 checkpoints re-run and `M_urban` recalibrated |
| 9 | Land use, housing, provisioning | `access_bp` instead of transport grade; housing term of concentration; network land |
| **9b** | **Migration** (new) | §3: attractiveness, voluntary and distress migration, age profile, borders, free movement, movement controls, land grants, stability effect, ledgers, `MigrationView`, AI policies; replaces crowd push and jobless drift |
| 12 | Trade and market | routes over link modes: path loss, bottleneck capacity shared by routes; gateway table retired; trade crossroads site term |
| 13 | Traditions | §6.1 tradition transport works |
| 14 | Space access | vactrain, suborbital express, airlift and G7 deployment by suborbital, T183 and the orbital tether, `listed: false` |
| 17 | Victory and the native AI | final pass over network planning, migration policy and sieges; interface relay if kept |
| 18 | Client | §7 views, built after 7b, 9a and 9b |

### 8.3 Acceptance tests (beyond doc 36's common tests)

- **People**: every month, internal out = in per seat; emigrated = immigrated per seat
  pair and in the world, per qualification too; no negative age cell; refugees ⊂
  migrants; city + towns + countryside = residents; movers' age distribution follows
  the weights within rounding over a 10-year fixture.
- **Goods**: carriage identity with link losses; route traffic ≤ narrowest link; link use
  ≤ capacity; upkeep = formula with use; land grants booked; a network that is not
  supplied falls back to the next mode.
- **Determinism**: same seed and controllers → same state hash, with checkpoint
  reload; migration flows independent of seat processing order (two seats swapped in a
  fixture give mirrored flows); Dijkstra ties by region id.
- **Isolation**: seat A's observation unchanged when seat B changes its network,
  borders or movement controls in regions A does not observe; B's attractiveness never
  appears in A's view; A sees B only through its own arrivals and departures; the static
  tree contains no unlisted kind; an unlisted kind appears in A's overlay only after A
  discovers its requirement; foreign network levels hidden.
- **Bounds**: `F_city` within 8,000-12,500; access ≤ 600, congestion ≤ 1,500; defender
  multiplier ≤ 20,000; capture ≤ 8 months; primacy within 3,000-5,000; urban share ≤
  9,500; voluntary outflow ≤ 300 bp a year per region, international ≤ 50.
- **Fixtures**: a coastal river-mouth capital outgrows an inland capital of the same
  residents; a besieged landlocked city falls faster than a coastal one; a G5 army
  moves three links a month by rail in its own land and one in enemy land; airlift
  bounded by the smaller airport.
- **Performance**: doc 36 budgets (p95 per round ≤ 150 ms native, ≤ 400 ms wasm; full
  standard match ≤ 60 s native). Expected cost: links and paths cached per round and on
  change (≤ 72 regions, ≤ 450 links: microseconds per Dijkstra); migration O(regions ×
  3 destinations) a month on yearly attractiveness; air links O(airports²) per round;
  city and urban share a few multiplications per region-month. Estimate +5% per month,
  +2 ms and +40 KB per late observation. `perf_round_budget` checkpoint at AD 2150 with
  a dense network and open borders.

### 8.4 Calibration targets

| Metric | Target (median seat unless stated) |
| --- | --- |
| Urban share | ≤ 1700: 5-10%; 1850: 12-20%; 1900: 20-30%; 2000: 45-55%; 2100: 60-70%; late: 65-75% |
| Largest city in the world | AD 1: 0.1-0.4 M; 1500: 0.15-0.5 M; 1700: 0.2-1 M; 1900: 2-6 M; 2000: 8-20 M; 2100: 15-35 M |
| Metropolises | none before 1850; a seat of ≥ 300 M in 2100 has 2-6 cities ≥ 5 M, one or two of 10-30 M; at most two megalopolises (≥ 20 M) in the world by 2100 |
| Rank and size | within a seat of ≥ 200 M, largest city ÷ second city 1.3-3 |
| Where they are | ≥ 70% of metropolises in 2100 on a coast or a navigable river |
| Internal migration (gross interregional moves a year, share of residents) | before 1500: 0.05-0.3%; 1500-1850: 0.2-0.6%; 1850-1950: 0.5-1.5%; after 1950: 1.0-2.5% |
| International migration | world cross-seat voluntary migrants ≤ 0.3% of the world a year in peaceful decades after 1900; an Open seat's foreign-lineage share 5-15% after 50 years |
| Rural regions | regions with no city above Town lose population share after 1900 but none falls below 30% of its 1900 residents by 2100 except under famine or war |
| Refugees | a captured populous region sends out 2-10% of its people in the year of capture |
| City defence | capturing a region with a Metropolis costs 1.5-3× the attacker losses of a comparable region without a city; a Metropolis changes hands in ≥ 30% of matches with wars after 1900 |
| Transport | carriage loss of regions to their capital, median: ≤ 25% before 1700, ≤ 10% in 1900, ≤ 5% in 2000; ≤ 25% of capitals congested at 2100 (units §7 survey re-run); transport ≤ 25% of construction goods by base value |
| Population and victory | doc 36 §7 and doc 37 §11.4 targets still met |

### 8.5 Risks

- **Calibration coupling.** The urban share, `M_urban` and `F_city` re-key touch slice 2
  and slice 6 calibrations; the era checkpoints make it minutes per era. Migration can
  amplify a leading region; congestion, water and provisioning are the brakes, and the
  rank-size target watches it.
- **Migration oscillation.** Flows that respond to attractiveness that responds to
  flows can oscillate; yearly attractiveness, thresholds, caps and intake caps damp it.
  Monitor with the curve tool.
- **Information leaks.** Migrant flows between seats reveal coarse facts (B is less
  attractive than A); accepted as public at the border, as trade aggregates are. No view
  shows another seat's attractiveness or network levels.
- **Native AI load.** Network planning is the largest new AI pass. If the AI cannot use a
  mode, cut the mode (§8.7), never give the AI information or bonuses.
- **Defence balance.** A 2× defender factor plus militia could stall wars between peers;
  calibrated by the city-defence targets, with the capture months and the cap as levers.

### 8.6 Interaction with the cut lists

Doc 37 §11.6's cut list stays first in force for its own systems; this chapter's list
follows it and precedes doc 36 §10's.

### 8.7 What to cut first (in order)

1. The interface relay.
2. The orbital tether, T183 and the `listed` flag.
3. Pipelines.
4. Second tradition works (keep packet airships, road trains, electric highways, the
   nuclear fleet, remote work, biocrete and logistics hubs).
5. Ice lanes.
6. Passenger capacities (migration limited by mobility caps only).
7. Canals (natural river navigation stays).
8. Voluntary international migration (refugees and free-movement treaties stay).
9. Per-link bottlenecks for routes (route capacity = the smaller end region's capacity).
10. The siege starvation rule (urban and fortification bonuses stay).
