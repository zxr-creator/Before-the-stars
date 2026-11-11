# Units and scale

This chapter fixes what one unit of everything in the rules engine means and the
magnitudes that follow. It is the reference for `crates/bts-engine`; when a number in
the engine disagrees with this chapter, one of the two is a bug. All numeric values
remain provisional calibration; the *units* are not provisional.

Ruleset `bts-rules/2.0.0` is the first that follows this chapter. Saves written by
earlier rulesets counted people and posts differently and are refused on load with a
versioned error; they cannot be migrated exactly.

Ruleset `bts-rules/3.0.0` (design chapter 36) keeps every unit of this chapter and
puts the game on a historical calendar (section 11). Its population, knowledge,
productivity, goods and trade changes are recorded in the sections they touch as
they land; a 2.x save is refused with "this save was written by ruleset
bts-rules/2.x.y; this build runs bts-rules/3.0.0 and cannot load it: the calendar,
the goods and the population rules differ".

## 1. Why the scale changed

The endgame is an interstellar programme. A society that can run one independently
needs millions of industrial workers, hundreds of thousands of engineers and the
schools that replace them. The earlier model began with about 240 people per seat and
ended with tens of thousands, so a "launch complex" had thirty staff and the jump
programme asked for thirty-six engineers.

Population in this model is demographic, not a counter: births come from women of
child-bearing age nine months earlier, people age one year at a time, and nobody is
created by a building. Over the 240-year campaign (2,880 monthly steps) a well-fed
population can grow by a factor of a few hundred at most. The size of the end state is
therefore decided by the size of the start. A nation that can carry an independent
space programme (tens of millions) at the end requires peoples of a few hundred
thousand at the start. That is also a defensible reading of the opening: a region here
is state-sized, and a state-sized landscape of foragers and first cultivators holds
10^5 people, not 10^2.

The scale chosen:

- a seat starts with **236,000-248,000 people** in one home region;
- a strong late civilization holds **30-150 million** in 10-40 regions; a marginal
  one a few million;
- one **facility level** is an establishment (or a district of like establishments)
  employing **thousands** of people, the same grain as a building level in the grand
  strategy games the interface is modelled on;
- goods are counted in **kilotonnes** (bulk) or **thousand standard lots**
  (manufactures), which is the natural size of what a level makes in a month.

The campaign compresses roughly ten thousand years of technical history into 240
years of demographic time. Demographic, educational and construction rates are real
monthly rates; what is compressed is the waiting between discoveries.

## 2. The units

Integer arithmetic only. "Base unit" is what one integer step of the stored value
means; "display unit" is 1,000 base units and is what quantities are quoted in below
and what a client should normally show.

| Quantity | Base unit (integer 1) | Display unit (1,000) | Notes |
| --- | --- | --- | --- |
| Time | 1 month | - | 12 months per decision round; horizon 2,880 months |
| Population | 1 person | - | 81 annual age cells per block; `u32` per cell |
| Post / job | 1 full-time worker for the month | - | one person holds one post; students, teachers and soldiers hold none |
| Project work | 1 worker-month | 1,000 worker-months | a called-up labourer supplies 1 per month, a builder included |
| Research work | 1 researcher-month | 1,000 researcher-months | supplied only by staffed research posts |
| Food | 1 ration: one person's food for one month, 50 kg grain-equivalent | 1,000 rations = 50 t | every resident and soldier eats 1 ration a month |
| Bulk goods | 1 tonne | 1 kt | timber/stone/clay, ores, coal, crude, rare minerals, copper, structural metal, components, conductors, insulation, fuel, chemicals, substrate |
| Manufactured lots | 1 standard lot | 1,000 lots | see the lot table below |
| Shaft / electric service | 0.1 MWh delivered in the month | 100 MWh in the month (about 0.14 MW continuous) | cannot be stored; consumed where and when it is made, or shared over a grid with loss |
| Compute service | index | one standard machine-hall-month | cannot be stored; capacity installed last month serves this month |
| Ratios | basis point | - | 10,000 = 1.0 |

Standard lots and their mass equivalents (used by the mass-balance test: no recipe
may put out more mass than it takes in, extraction and food excepted):

| Good | One lot is | Mass |
| --- | --- | --- |
| Tools | a working set of hand or machine tools for one post-year | 0.25 t |
| Spare parts | a maintenance kit | 0.25 t |
| Electronic devices | a device lot | 0.05 t |
| Computing hardware | a rack | 0.5 t |
| Record media | a set of volumes, plates or media | 0.15 t |
| Instruments | an instrument set | 0.4 t |
| Medicine and bioproducts | a lot of treatment courses | 0.04 t |

Food converts at 0.05 t per ration wherever a recipe consumes it.

Mass balance (tested for every recipe): a recipe that takes goods in puts out no more
mass than it takes. A recipe may put out goods without taking any in only at works
that take their material out of the site itself - mines and wells on a deposit, timber
and quarry camps, kilns digging their clay - and those works are flagged as such.
Works that grow food carry no recipe (their yield is per cultivator on the land), and
recipes that deliver only service, research or assembly progress put out no goods.

Deposits are tonnes in the ground. Every tonne a mine or well raises is drawn from
its deposit: drained deep workings draw what they raise, shallow workings raise the
easy ore and spoil as much again (two tonnes drawn for each raised). Of what is
raised, the ore's quality `q` decides how much is delivered: `0.5 + q / 2`. A deposit
therefore never delivers more than is drawn from it. Every home region has, within
three links, at least 240 Mt of copper ore, 700 Mt of iron ore, 1,000 Mt of coal and
120 Mt of rare minerals (`worldgen.rs`). These, and all generated deposits, are twice
the figures of the first 2.0 generator, which counted only delivered ore.

Every source of goods, people, qualified people, service and work, with the ledger
that records it, is listed in `docs/conservation-audit.md`.

## 3. People

| Quantity | Value |
| --- | --- |
| Starting population per seat | 236,000-248,000, on a smooth young pyramid (no age stands out) |
| Working age | 15-64; 92% of them are available for posts, study or service |
| Food per person-month | 1 ration (50 kg grain-equivalent; 0.6 t a year) |
| Births | at most 0.030 a month per reproductive equivalent, lagged nine months; intensity `F_custom x F_food x F_crowd x F_dev` (ruleset 3.0, below) |
| Sustained growth | ruleset 2.0: 1.5-2.5% a year while land and water last; ruleset 3.0 targets about 0.06% a year before 1700, 1-2% in the industrial transition, near zero late (design chapter 36, section 3.1) |
| Natural water of a home region | at least 2.6 million residents |
| Arable land (ruleset 3.0, generator `bts-worldgen/2.0.0`) | three times generator 1.2's: plains 90-165 levels, hills 30-66, forest 36-72, rivers +18-36; a home at least 102; fields up to 250 levels |

Settlement class of a region (descriptive only; no rule keys on it):

| Class | Residents |
| --- | --- |
| Wilderness | 0 |
| Camp | under 150,000 |
| Village | 150,000 to under 1 million |
| Town | 1 to under 4 million |
| City | 4 to under 12 million |
| Metropolis | 12 to under 40 million |
| Megalopolis | 40 million or more (ruleset 3.0) |

### Ruleset 3.0: mortality, fertility, epidemics and harvests

Since ruleset 3.0 the classes are no longer only descriptive: the town-conditions
factor below weighs a region's off-land share by its class. Sums of people over
regions (a civilization, the world, `OwnCiv.population`, foreign estimates, the
referee's diagnostics) are `u64`; a region and an age cell stay `u32`.

- **Mortality** per age band and month: `base x M_tech x M_care x M_hazard x M_urban
  x M_outbreak`, with pre-modern bases 2,600 / 420 / 80 / 105 / 260 / 900 per 100,000
  (bands 0, 1-4, 5-14, 15-49, 50-64, 65+). `M_tech` multiplies, for children and
  adults, for each node understood: T032 9,700/9,850, T033 9,200/9,600, T046
  9,500/9,700, T053 6,000/8,000, T069 6,000/8,500, T070 5,000/8,000, T131
  8,000/8,500, T136 7,000/7,000, and the practice C002 9,500/10,000 (the medieval
  nodes are milder than the design's table, which would have started the
  demographic transition a thousand years early). `M_care` = 10,000 less up to
  1,000 for healers' lodges and 3,000 for hospitals (each by coverage, doubled with
  medicine in store; at most 3,500): the design's `10,000 - coverage / 2` would let a
  healers' lodge halve every death rate. Care also halves the crowding pressure as in
  ruleset 2.0. `M_hazard` = 10,000 + crowding pressure x 1.5 + nutrition debt x 40.
  `M_urban` = 10,000 + 5,000 x urban share x (1 - sanitation coverage), the urban
  share being `1 - min(1, 3.2 x food workers / residents)` weighed by class (camp 0,
  village 0.2, town 0.6, city and above 1) and sanitation coverage the residents
  sewers (3 million a level) and treatment works (12 million) serve.
- **Epidemics** (`sim::outbreaks`): a populated region breaks out with monthly
  hazard `1/2,400 x density x connectivity x protection` (density
  `clamp(crowding / 0.8, 0.5, 3)`, connectivity +0.5 within a year of an army's
  presence, trade routes joining with the market slice; protection 0.5 with T053,
  x 0.3 with T070, x (1 - care coverage / 2)). An epidemic lasts 6-24 months with
  `M_outbreak` 13,000-25,000 on every band and spreads each month to each
  neighbouring populated region with probability 30% x its protection; afterwards
  the region has a quarter of the hazard and catches no spreading epidemic for 600
  months. The region's government and the governments of its neighbours are told;
  seats observing the region see it in `RegionView.outbreak`.
- **Harvests**: one draw a year per climate zone (terrain group) and third of the map,
  triangular in [-1,800, +1,000] bp with mean -200, added to field yields; damped by
  half on irrigated land and to three tenths under fuel-burning methods.
- **Fertility**: intensity `F_custom x F_food x F_crowd x F_dev x F_land`.
  `F_custom` 3,850 (+230 with C002, -150 with C039, +600 for followers of Fruitful
  Households, +230 for Day of Rest; the design's 5,500 assumed lower survival to
  childbearing than these bands give, since with annual ageing a newborn spends on
  average half a year in the infant band). `F_crowd` as in ruleset 2.0. `F_food`
  (slice 6r) is the households' own food security, never the government's reserve
  policy: when everyone ate this month, `access x (0.7 + 0.3 x max(S, Y))`, with access
  the region's mean food fulfilment over the last twelve months, `S` the months of food
  left in store over a household buffer of two months (at most nine tenths of what the
  stores can hold, at least a tenth of a month) and `Y` full when this month's fields and
  works raised 105% of what everyone eats (zero at 95%); hunger lowers it as in ruleset
  2.0. `F_dev = clamp(10,000 - 1,500 x literate share - 600 x urban share - 600 x
  child survival gain - 600 x prosperity, 6,800, 10,000)`, +500 with C046; prosperity
  enters with the consumption slice. `F_land` (a calibration addition, not in the
  design) = `clamp(10,000 + 1,500 x (0.48 - P/K) / 0.48, 6,000, 10,500)` (0.465 in
  slice 6r, 0.48 since 6c) where `K` is
  what the region's land can feed with what the government knows (wild food at a
  third, fields at every level the land and practices allow by the best known
  method, pastures and fishing grounds at half), at most its water capacity: the
  Malthusian brake that keeps a pre-modern people near half its land's capacity, so
  that long-run growth follows new land and new methods instead of drifting to an
  explosion or to extinction. It fades as children survive: its departure from 10,000
  is scaled by `1 - clamp(2 x (child survival gain - 2,500), 0, 10,000) / 10,000`, so
  the medieval remedies keep it and germ theory with clean water ends it. Until soil science (T056) fields are held to 20 levels
  (the best of the land; after C007 and C017 as before).
- **Deaths by cause** partition all deaths: age and illness (base, technology,
  care), hunger and crowding (`M_hazard`), town conditions (`M_urban`), epidemic
  (`M_outbreak`) and war; `OwnCiv.deaths_by_cause` reports them for the last round.
- **Field methods v3** (rations and general posts per level-month; since slice 5 the
  real horses and fertilizer, and since slice 6 as many levels at a method as the
  stores supply, section 15): hand 30,000 / 10,000; animal traction 46,000 / 8,000 with
  30 horses; rotation and manuring (T020, T011, C017) 60,000 / 8,000 with 30 horses;
  fertilized 120,000 / 6,000 with 150 t of fertilizer; mechanized 110,000 / 3,000 with
  100 t of fuel; intensive 250,000 / 2,000 with 300 t of fertilizer and 150 t of fuel;
  restorative 380,000 / 1,500 with 200 t of fertilizer, 50 t of chemicals and 150 t of
  fuel. General posts are divided by the food sector's productivity. A level never yields more than twice its
  method's base. **Food synthesis works** (T132 and T135): 4 kt of chemicals and
  400 units of electricity make 200,000 rations a level-month, a declared
  atmospheric-input recipe (output mass at most three times the input taken from
  stock).
- **Deposits** of generator 2.0: copper 300-1,200 Mt, iron 2,000-8,000 Mt, coal
  3,000-12,000 Mt per deposit, and at least 1,200 Mt of copper ore, 7,000 Mt of iron
  ore and 10,000 Mt of coal within three links of every home.

Other person-scaled constants: a settling party is 20,000-400,000 people; a formation
is 1,000-5,000,000 soldiers; home-defence militia is one working adult in forty, at
most 500,000; a barracks level trains 200,000 at once; a region counts as urban for
cultural drift at 2 million residents; a founding cohort without an instructor is at
most 4,000 learners.

## 4. Posts and facility levels

A level's crew is stated in people. General posts can be filled by anyone; qualified
posts only by holders of the listed qualifications (in order of preference).
Reference magnitudes by era (the full table is printed by
`cargo test -p bts-engine --release print_unit_tables -- --ignored --nocapture`):

| Era | Example level | Crew (general + qualified) | Output per level-month | Per worker-month |
| --- | --- | --- | --- | --- |
| Subsistence | Fields, hand cultivation | 10,000 | 30,000 rations | 3.0 rations (150 kg) |
| Subsistence | Timber and quarry camps | 8,000 | 16 kt materials | 2.0 t |
| Craft | Workshops, stone tools | 4,000 + 2,000 | 5,000 tool lots | 0.8 lots (0.2 t) |
| Craft | Shallow mines | 12,000 | 18 kt ore | 1.5 t |
| Classical | Bloomery | 4,000 + 2,000 | 4 kt iron | 0.67 t |
| Industrial | Steelworks | 12,000 + 4,000 | 30 kt steel | 1.9 t (22 t a year) |
| Industrial | Machine shops | 6,000 + 4,000 | 10 kt components | 1.0 t |
| Industrial | Mechanized fields | 10,000 | 140,000-200,000 rations | 14-20 rations (0.7-1.0 t) |
| Electrical | Electronics cells, integrated | 4,000 + 4,000 | 20,000 device lots | 2.5 lots |
| Space | Launch complex | see section 8 | services | - |

Per-worker output in the early and industrial eras is at or below the historical
record for the corresponding technique (a nineteenth-century steelworker made 50-100 t
a year; here 22 t). That is deliberate: a level's crew includes its carters,
storemen and clerks, and the campaign's population is small for its technology.

### Production methods

A facility that has more than one recipe has that many production methods, and the
seat chooses one per region and facility: `set_policy` with
`{"kind": "method", "region": r, "facility": "steelworks", "method": "electric"}`;
`"method": null` returns the choice to the works. The catalog lists, for every
facility type, the methods the seat has at least discovered (`FacilityType.recipes`),
each with its true inputs, outputs and services per level-month, its general posts
and its qualified posts per level (`general_posts`, `skilled_posts`), and whether its
requirement is met (`available`). `FacilityType.jobs` remains the crew of the base
method. A region's `FacilityView` states the method chosen (`method`) and the one
that ran last month (`active_method`).

- **Automatic** (no choice made; the default, and what every works does until the
  seat says otherwise): the first method in the facility's list whose requirement the
  seat meets and whose inputs are in store (a twentieth of one level-month of each),
  and failing that the first it meets the requirement of, so that the shortage is
  reported. Methods that trade one scarce thing for another are listed last, so the
  works never switch to them of their own accord unless the plain method has nothing
  to work with.
- **Chosen**: the method runs whether or not its inputs are in store, and a works
  that is short stands still and names what it is short of; it does not switch.
- The method of every works is fixed once a month, from the stock the month opens
  with, before anything is taken: its posts (general posts x the method's share,
  the facility's qualified posts plus the method's own), the service it asks for and
  the goods it takes and makes all belong to that one method.
- A method that does not exist, one the seat has not discovered, one whose
  requirement it does not meet, and a facility the region does not have are all
  refused with the same error as a facility that does not exist
  (`NOT_VISIBLE_OR_UNKNOWN`, "unknown facility or method"). A region that changes
  hands forgets the choices of its old government.

Facilities with a choice of method: workshops (stone, copper, iron tools), copper,
iron, coal and rare-mineral mines (shallow, drained deep, mechanized), steelworks
(coke, electric), machine shops (precision, numerically controlled), wire works,
chemical works, insulation works, electronics cells, computing centres, the press,
instrument makers, pharmaceutical works, steam and diesel stations, the advanced
research centre, and fields.

The methods added with ruleset 2.0 slice D, per level-month (display units), beside
the method they are an alternative to:

| Works | Method (key), requires | Goods in | Goods out | Service | General posts | Qualified posts |
| --- | --- | --- | --- | --- | --- | --- |
| Steelworks | Coke steel (`steel`) | 40 iron ore, 20 coal | 30 metal | 10 shaft | 12,000 | 4,000 smiths (mechanics) |
| Steelworks | Electric steelmaking (`electric`), electrochemistry | 40 iron ore, 4 coal | 30 metal | 150 electric | 8,400 | 4,000 smiths (mechanics), 1,000 electricians (technicians) |
| Machine shops | Precision machining (`components`) | 12.5 metal, 1 tools | 10 components | 30 shaft | 6,000 | 4,000 mechanics (artisans, smiths) |
| Machine shops | Numerically controlled machining (`nc`), numerical control and robots | 12.5 metal, 0.8 tools | 10 components | 40 electric, 20 compute | 3,600 | 4,000 mechanics, 500 programmers (technicians), 500 technicians (electricians) |
| Copper, iron, coal mines | Drained deep workings (`deep`) | - | 36 ore raised, 36 drawn | 10 shaft | 12,000 | - |
| Copper, iron, coal mines | Mechanized workings (`mechanized`), deep extraction and mechanized work | - | 36 ore raised, 36 drawn | 40 shaft | 6,000 | 1,000 mechanics (technicians) |
| Rare-mineral workings | Mechanized workings (`mechanized`) | - | 12 raised, 12 drawn | 30 shaft (deep: 8) | 5,000 (deep: 10,000) | 1,000 mechanics (technicians) |

None of them makes more from the same material: the steel per tonne of ore, the
components per tonne of metal and the ore per tonne drawn from the deposit are those
of the plain method (tested). What they change is which scarce thing is spent.
Electric steel saves 16 kt of coal a level-month for 150 units of electricity, which
turbines and generator halls make from 16.7 kt of coal: it frees coal only where the
electricity comes from water or a reactor. Mechanized workings and programmed
machining exchange hands for shaft work, electricity, compute and people who must be
trained.

Fields have no recipe; their methods are the ways of working the land, and the
catalog shows them in the same form (`fields`, six entries, yield as outputs,
chemicals and fuel as inputs):

| Method (key) | Requires | Rations per level-month | Chemicals | Fuel |
| --- | --- | --- | --- | --- |
| Hand cultivation (`hand`) | - | 30,000 (33,000 with seasonal calendars; a tenth more with soil science) | - | - |
| Animal traction (`traction`) | animal traction; herds somewhere under the seat | 46,000 (50,600 with soil science) | - | - |
| Manufactured inputs (`inputs`) | manufactured agricultural inputs | 72,000 | 0.1 kt | - |
| Mechanized farming (`mechanized`) | mechanized work | 90,000 | - | 0.1 kt |
| Mechanized farming with manufactured inputs (`intensive`) | both | 140,000 | 0.1 kt | 0.1 kt |
| Restorative mechanized farming (`restorative`) | both, and restoration and agricultural cycles | 200,000 | 0.1 kt | 0.1 kt |

Yields are before irrigation (a quarter more), husbandry, tools, condition and unrest.
Left alone, a region's fields are worked by the best method the seat knows whose
month of inputs is in store, as before. A choice is a ceiling: the fields are worked
by the best method that is not above the chosen one, draws nothing the chosen one
does not draw, and has its inputs in store - so fields held at animal traction burn
no fuel and spread no chemicals, and fields held at `mechanized` fall back to animals
when fuel is short, not to chemicals. The all-or-nothing rule (conservation audit,
section 2) is unchanged, but counts only the fields that may draw the input:
chemicals are used when the store holds a month for every field not held below them,
and likewise fuel (with the motor boats). When the land is worked below the best
method the seat allows because an input is short, the fields report it ("Short of
refined fuel"). Pasture and fishing keep their single line of improvement with
knowledge; they have no methods to choose.

Education: class sizes are people per instructor and did not change. A venue level
offers thousands of places (lodge 16,000; school 40,000; college 30,000; technical
institute 32,000), so one level of lodges at class size 8 occupies 2,000 instructors.

Research: one staffed research post supplies one researcher-month. Technology work
ranges from 18,000 researcher-months (first crafts) to 3.4 million (jump
engineering), before the scenario pace multiplier.

## 5. Energy

One display unit of shaft or electric service is 100 MWh delivered within the month.

| Source (one level) | Fuel per month | Service per month | Implied conversion |
| --- | --- | --- | --- |
| Water or wind mills | - | 20 (2 GWh) | site-limited |
| Steam engines | 12 kt coal | 60 (6 GWh) | about 6% of the coal's heat |
| Compound engines | 10 kt coal | 70 | about 9% |
| Steam turbines | 8 kt coal | 80 | about 12% |
| Diesel | 6 kt fuel | 60-90 | 9-13% |
| Hydroelectric works | - | 90 electric | site-limited |
| Fission plant | 1 kt rare minerals (ore) | see content | - |
| Fusion plant | 1 kt chemicals (fuel feedstock) | see content | - |

Generator halls convert shaft work to electricity at nine tenths; a grid shares
surplus between linked regions at 92%; motors return electricity to shafts at nine
tenths. Only industrial, research and programme use is modelled; household
consumption is not, so national totals are far below a modern economy's.

Service is rationed, never overdrawn. A works asks for the service of the posts it
has filled; when a region (for compute, the nation) has less than its works ask for,
each receives the same share of what it asked, so a works that is half crewed and
half supplied runs at a quarter. A region's own motors draw on its spare electricity
before the rest is offered to the grid. Compute made in one month serves the next.

Construction of industrial-era works draws site power in the same unit: shaft work,
asked of the region alongside its works and rationed with them. What the region
cannot give is made by site engines out of the common stock, burning coal first
(5 units per kt, the conversion of the first steam engines) and then refined fuel
(10 units per kt), in whole tonnes. They never burn into the month of fuel that
mechanized fields and motor boats must find in store: a site stands still before it
takes the harvest's fuel. Site engines need no works and no crew of their own; they
are what an industrial-era site brings with it (section 6).

## 6. Construction

Every region the seat governs quotes, for every facility the seat knows of, the true
price of one more level (`OwnRegion.construction_sites`). An order of `n` levels is
charged exactly `n` times the quote, and the test
`the_order_charged_is_the_quote_times_the_levels` holds the engine to it:

- **goods**: `n x` the level's bill, committed from stock as it becomes available and
  never refunded;
- **work**: `n x` the level's work in worker-months, half as much again for the first
  installation of its kind anywhere under the seat (it is also the prototype);
- **a qualified site crew** of `n x` the level's crew. A crew is one or more groups;
  each group is a head count and the qualifications accepted for it, in order of
  preference (builders, or artisans doing a builder's work);
- **site power** of `n x` the level's draw in a month of full work;
- **time**: the level's minimum months, half as long again (rounded up) for the first
  of its kind, and the same for any `n` (the levels are built side by side). The order
  accepts `ceil(work / months)` worker-months a month and no more, so with everything
  at hand it takes exactly its minimum months. The scenario's pace multiplier scales
  the minimum months with the work.

How each is supplied, every month:

- **Crews** are reserved first, region by region and order by order in the region's
  queue, from qualified residents who are not teaching. An order holds its crew for as
  long as it is open and not paused, whether or not its goods have arrived: that is the
  cost of leaving an order open. A person on a crew holds no other post that month
  (the works of the region are staffed from who is left), is one of the workers called
  up for projects, counts against the mobilization the practices allow, and supplies
  one worker-month to that order and no other. The crew goes back to its posts when
  the order completes, is paused, is cancelled or loses its site. Qualified people
  without any post elsewhere move toward a site that is short of them, a quarter of
  the shortfall a month, while the region's call-up has room for them.
- **Other labour** is called up after the qualified posts of the region's works are
  filled and before their general posts: people without a qualification first, then
  qualified people whom no qualified post took (builders before the others), within
  what is left of the call-up. It is shared by the region's orders in queue order.
- **Site power** is asked for by every open order that has crew on site and goods to
  work with, in proportion to its crew, as part of the region's shaft demand. The
  sites' share is set aside from the region's shaft work (under a shortage they are
  rationed exactly like the works); a site then draws what the work it actually does
  that month needs, first from that share and then from site engines burning coal
  and then fuel (section 5). An order that stands still burns nothing.

Progress of an order in a month, with `full = ceil(work / months)`:

    accepted  = min(work left, full)
    by goods  = work x (least share committed of any good) - work done
    by crew   = full x (least share present of any group of the crew)
    by labour = crew on site + the region's other called-up workers still free
    before power = min(accepted, by goods, by crew, by labour)
    progress  = before power x (site power delivered / site power asked)

where the site power asked is `draw x before power / full`. The crew share is the
least over the groups, so a group that is missing altogether stops the site. An order
is complete only when its work is done and every good is fully committed. Whatever
held it back is named: "Waiting for <good>", "Site crew short: 1,000 of 2,000
builders" (one line for each group that is short, naming the qualification asked for
first), "Site power short: 50% delivered", "Little labour can be called up in
<region>" (also when it is the call-up, not the people, that a crew is short of).

Construction terms by class, per level, at standard pace (the full list is printed by
`print_unit_tables`, section 4):

| Class | Site crew | Site power a month | Minimum months |
| --- | --- | --- | --- |
| Subsistence and simple: fields, pastures, fishing grounds, granaries, camps, workshops, kilns, healers' lodges, teaching lodges, makers' circles, sacred precincts | none | 0 | 2 (precinct 3) |
| Civil works and early industry: irrigation, mines, furnaces, mills, press, instrument makers, insulation works, roads, harbour, waterworks, sewers, hospital, offices, barracks, school, college, technical institute, archive, laboratory | 500-1,000 builders (artisans accepted) | 0 | 3-6 |
| Industrial: oil wells, machine shops, parts works, wire works, steelworks, chemical works, steam and diesel stations, water treatment, research institute, railway (millwrights: mechanics, or smiths or artisans); pharmaceutical works, refinery, motor depot (mechanics or technicians) | 1,000-2,000 builders (artisans accepted) and 500-1,000 millwrights | 5-20 | 6-12 |
| Electrical and computing: generator hall, grid, hydroelectric works, computing centre, computer works, synthetic fuel, high-purity materials, electronics cells, advanced research centre, automated experiment hall | 1,000-3,000 builders (artisans accepted); 500-1,000 mechanics or technicians (millwrights at hydroelectric works, none at generator halls and the grid); 500-2,000 electricians (technicians accepted; mechanics too at generator halls and hydroelectric works) | 10-30 | 9-15 |
| Nuclear, orbital and jump: high-energy laboratory, fission, fusion, launch complex, orbital station, orbital yard, orbital power receiver, interferometer, jump testbed, jump assembly line, jump deployment node | 2,000-8,000 builders, 2,000-6,000 technicians, 2,000-6,000 electricians (not at the interferometer), 1,000-4,000 scientists (high-energy laboratory, fission, fusion, launch complex, station, interferometer, testbed), 3,000-6,000 mechanics (launch complex, orbital yard, assembly line); 2,000-8,000 orbital crews at the orbital works, the testbed and the nodes; 2,000-4,000 jump engineers at the assembly line and the nodes (since slice E the launch complex, orbital yard, testbed, lines and nodes have the larger crews, site power and bills of the works they build: section 8) | 100-400 | 24-48 |

No crew needs people who cannot exist yet (tested for every facility by walking the
content's own requirements with that facility withheld): artisans stand in for
builders below the last class; smiths and artisans stand in for mechanics at every
works that can precede the technical institute, and the institute itself needs only
builders; the launch complex needs no orbital crews, because their course follows from
what is investigated there, and the first station accepts technicians in their place;
the jump testbed needs no jump engineers, for the same reason.

The preparations of the jump programme are orders of the same kind, sited where the
programme's people are (section 8): since slice E a loaded round trip holds 8,000 jump
engineers and 8,000 orbital crews and draws 3,000 units a month for six months; the
deployment exercise 12,000 of each and 2,000 units for six months; a replacement
4,000 of each and 1,000 units for three months. Surveys, settlement, resettlement, recruitment, reforms and the stages of a
movement need labour and goods as before, and no crew.

Queues are per region. `OwnRegion.construction_queue` lists every project sited in
the region in the order in which crews, labour and site power are given out: by
priority (0 first), then by place in the queue, which is the order in which the
orders were given until the seat moves one. `manage_project` with `position` moves
an order to that 0-based place among its region's orders; the region's orders then
take over, in their new order, the priorities and places they held between them, so
nothing changes for the orders of other regions. Each entry states the crew needed
and on site, the share of site power delivered, the share of goods committed, what
the order is waiting for and an estimate of the months left at last month's pace.

## 7. Economies of scale

Every saving below is a reduction of overhead or loss. None raises the goods a recipe
puts out per unit of input or per level; a level's recipe output is a hard ceiling.
All of it is per region and per month, in integers (`sim/economy.rs`).

| Effect | Saving | Cap | Limited by | Downside of concentration |
| --- | --- | --- | --- | --- |
| Shared support posts | general posts of an industrial or extractive facility fall 2% per level beyond the first | 20% of general posts | condition at least 75%; regional freight capacity | idle when freight is congested |
| Maintenance pooling | spares and tools upkeep of co-located works | 15% of that upkeep | repair-works levels (one serves twelve facility levels) and their own running; freight capacity | the shop needs its own qualified crew and inputs |
| Integrated chains | output used as input by works in the same region pays no carriage loss | the carriage loss itself | the quantity actually used locally that month | a single region carries the whole chain |
| Power grid | surplus electricity shared between linked regions | 92% delivered | grid links; generating surplus | - |
| Freight congestion (penalty) | when industrial load exceeds the region's freight capacity the savings above shrink in proportion and up to 20% more of exported output is lost | - | transport grade (track, roads, depot, harbour) | - |

Concentration also carries the risks the rules already had: one region's loss or
occupation takes the whole chain, and its supply line can be cut.

**Freight.** A region's transport grade (0-3: the sum of its roads 1, harbour 1,
railway 2 and motor depot 3, at most 3) gives it a freight capacity in facility
levels:

| Transport grade | 0 | 1 | 2 | 3 |
| --- | --- | --- | --- | --- |
| Freight capacity (levels) | 10 | 24 | 60 | 150 |

Its load is the sum of the levels of its enabled works whose labour category is
industry or extraction, or that are power sources (generator halls and the grid
included). Fields, pastures, fishing grounds, granaries, irrigation, civic works,
teaching venues, research works and the transport works themselves do not load
freight. The share served is

    infra_bp = 10,000                      while load <= capacity
             = capacity x 10,000 / load    beyond it

**Shared support posts.** A works of industry or extraction with general posts and a
recipe, enabled and in condition of at least 75%, needs
`min(2,000, 200 x (levels - 1)) x infra_bp / 10,000` basis points fewer general posts
(rounded up to whole posts, after the method's own share of them). Qualified posts,
inputs, services and output are untouched: the same works with and without the
saving take and make exactly the same goods (tested).

**Maintenance pooling.** A region with enabled levels of parts and repair works saves
the other works that load its freight

    maint_bp = min(1,500, 1,500 x shop levels x 12 / load)
               x infra_bp / 10,000 x (the shop's rate last month) / 10,000

of their upkeep in spares and tools: each such upkeep line is
`ceil(amount x levels x (10,000 - maint_bp) / 10,000)`, so never less than 85% of the
full amount, and less is taken from stock - nothing is made. Upkeep in other goods
(coal, fuel, electronics, hardware, media ...) and the upkeep of works that do not
load freight (roads, hospitals, schools) is not pooled. A shop that was not staffed,
supplied or powered last month pools nothing this month; an idled shop pools nothing.

**Integrated chains.** For each region and each good, the output of the region's
recipes this month up to the quantity of that good which the region's own recipes
(power stations included) took as inputs this month is exempt from carriage loss: it
never left. Only the remainder pays. Inputs are taken from the stock the month opens
with and output reaches the stock at the month's close, so the exemption is counted
on what the works actually took, not on what they asked for. It cannot exceed the
carriage loss itself, and it changes nothing in what is made.

**Congestion.** When load exceeds capacity, the output a region sends to the common
stock (all that is not exempt; food is not carried in this model and pays nothing)
loses a further

    congestion_bp = (10,000 - infra_bp) x 2,000 / 10,000      (at most 2,000)

on top of the region's link loss, the capital included (which otherwise pays no
carriage). What reaches the stock of a good from a region is

    delivered = exempt + (made - exempt) x max(0, link_bp - congestion_bp) / 10,000

and `made - delivered` is booked as lost (`Flows.lost`), like carriage loss.

**Hard ceiling.** A works makes `recipe output x levels x rate` of each good and no
more (for a mine, less by the ore's quality); nothing above adds to it. The engine
bounds each works' output by that figure explicitly, and the conservation audit
re-derives it every month from the method each works ran, its levels and its rate
(`ledger::violations`: output made in a region `<=` the ceiling of its works,
delivered `<=` made, exempt `<=` used locally and `<=` made, each saving within its
cap, and the regions' output and carriage loss within what the civilization booked as
produced and lost).

**What the seat sees.** `OwnRegion.infrastructure` (`InfraView`): `freight_capacity`,
`freight_load`, `infra_bp`, `support_saving_cap_bp` (2,000 scaled by `infra_bp`),
`maintenance_saving_bp`, `congestion_loss_bp` - all as they apply in the coming month
with the works as they stand - and `chain_exempt` and `chain_loss_saved`, last
month's quantities by good. `FacilityView.scale_saving_bp` is the support saving of
that works as it applies in the coming month.

**Calibration.** The capacities were set against all-native campaigns
(`cargo test -p bts-ai --release --test freight_survey -- --ignored --nocapture`;
eight worlds, thirty-two seats). Without any limit a capital carries a median of 9
levels at year 60 (largest 14), 45 at year 120 (81), 111 at year 180 (164) and 125 at
year 240 (largest tenth 168 and above, largest 237); over all regions with any load
the median is 3, 5, 8 and 10 at those dates, three quarters carry no more than 9, 12,
20 and 23. The first three grades are as planned. The
top grade was planned at 120 and is 150: with 120, nineteen capitals of twenty-nine
stood above the top capacity at year 240 with nothing more to build (median loss
2.5%, largest 10.4%); with 150 the usual late capital is served (median load 118),
no region is over capacity at years 60 and 120, three capitals are at year 180, and
at year 240 eight capitals of twenty-eight are above the top grade (by 2 to 84
levels, losing 0.3% to 7.2% of what they send). Until then each grade is outgrown in turn and
the next one relieves it: the native policy orders the next transport work for any
region, its capital included, whose load is within two levels of capacity.

## 8. The space and jump base

The principle: an independent programme needs, each separately checked and each
consuming real things,

- industrial: the capital works themselves and a year's flight hardware delivered by
  own output or contracted imports;
- scientific: frontier research capacity and the understood prerequisites;
- educational: jump engineers and orbital crews for every post with reliefs, and
  pipelines that replace them;
- logistical: freight links, fuel and spares for a year, electric supply at every
  site, launch and recovery sites.

There is no population threshold anywhere in these checks, explicit or hidden: no
check reads a head count of residents, and the tests change the population a
hundredfold without changing a check. A small civilization can substitute contracted
imports for output, seconded experts for graduates and a partner's launch,
orbital-yard or laboratory service for its own, each for payment and each ending
when the treaty does. The jump works themselves (assembly lines, deployment nodes,
the exercise, the replacement) must be the seat's own.

**The installations** (`content.rs`; people per level, goods in display units per
level-month, electricity in units of 100 MWh a month):

| Installation | Qualified crew | General | Operating inputs | Upkeep | Electric |
| --- | --- | --- | --- | --- | --- |
| High-energy laboratory | 40,000 scientists, 12,000 technicians, 8,000 electricians | - | - | instruments 6, electronics 4, spares 4 | 1,000 |
| Launch complex | 16,000 technicians, 6,000 scientists, 16,000 mechanics | 22,000 | fuel 30, components 6, electronics 3 | spares 3 | 400 |
| Orbital station | 16,000 orbital crew, 6,000 scientists | - | fuel 12, food 20, medicine 1 | spares 3, electronics 1.5 | 200 |
| Orbital construction yard | 30,000 orbital crew, 16,000 mechanics, 16,000 technicians | 10,000 | fuel 30, components 10, electronics 4 | spares 8, electronics 4 | 600 |
| Jump testbed | 30,000 scientists, 12,000 jump engineers or technicians, 10,000 orbital crew | - | - | spares 6, electronics 5, instruments 3 | 8,000 |
| Jump assembly line | 16,000 jump engineers, 16,000 technicians, 16,000 mechanics, 8,000 electricians | 20,000 | components 60, electronics 45, hardware 3, conductors 18, insulation 9, metal 45, substrate 3 | spares 8 | 4,000 |
| Jump deployment node | 6,000 jump engineers, 8,000 orbital crew, 8,000 technicians | 10,000 | fuel 12, electronics 3 | spares 4 | 1,000 |
| Fission plant (a station of several units) | 2,000 scientists, 6,000 technicians, 4,000 electricians | 4,000 | rare minerals 3 | spares 4, electronics 0.6 | gives 2,000 |
| Fusion plant | 6,000 scientists, 10,000 technicians, 6,000 electricians | 4,000 | chemicals 2 | spares 10, electronics 2 | gives 6,000 |
| Orbital power receiver | 4,000 electricians, 4,000 orbital crew | - | - | spares 5, electronics 2 | gives 3,000 |

The whole programme (two lines, three nodes, the testbed, the laboratory, launch
complex, station and yard) draws about 21,200 units, 2.9 GW continuous: eleven
fission levels, four of fusion or seven receivers, each with its own fuel, upkeep and
crew. The high-energy laboratory draws 1,000 units, not the 3,000 of the design
table, because the first one must run before fission is understood (see the slice E
notes of the design chapter). Construction crews and bills of these works are the
last rows of section 6. A loaded round trip (`projects::ftl_bill`) takes 600,000
worker-months of preparation over at least six months, 8,000 jump engineers and
8,000 orbital crew held for it, 3,000 units of site power a month, and 400 kt of fuel, 100,000
spare-part lots, 50,000 device lots and 30 kt of components; the deployment exercise
and the replacement are charged in the same way. A preparation is sited where the
programme's people are (the governed region with an assembly line, or for the exercise
a line or node, holding the most jump engineers and orbital crew).

**The checks** (`sim/victory.rs`, `ftl_checks`; each check carries a `category`). The
programme's needs are derived from the installations the seat has, and never from
fewer than an independent programme needs: two assembly lines and three deployment
nodes, and a launch complex, an orbital station with its yard and a high-energy
laboratory unless a partner serves the seat with that installation under a joint
programme (`programme_levels`). An installation that serves partners counts with the
half again of its inputs and upkeep that each partner adds.

| # | Category | Check | Passes when |
| --- | --- | --- | --- |
| 1 | scientific | Fleet-wide jump engineering standards understood | as before |
| 2 | industrial | Two operational assemblies from two independent lines | as before |
| 3 | industrial | Both assembly lines staffed | as before |
| 4 | logistical | Three deployment nodes operating | as before |
| 5 | service | Three-node deployment exercise completed | as before |
| 6 | service | Assembly replacement and crew relief verified | as before |
| 7 | educational | Qualified crews for every post, with reliefs | jump engineers and orbital crew resident in the seat's regions (seconded experts included) are each at least 3/2 of the posts that call for that qualification alone in the programme's installations (at the minimum configuration: 50,000 and 70,000 posts, so 75,000 and 105,000 people) |
| 8 | educational | Training that replaces the crews | for each of the two: places in courses giving it, held in a governed region with a venue and with a cohort enrolled (or one graduated in the last 60 months), at least 1/20 of its posts; or an active secondment lending the seat that qualification |
| 9 | scientific | Frontier research capacity | at least 30,000 researcher-months a month of frontier research from staffed posts, and a high-energy laboratory running at half rate or better (own, or a partner's under a joint programme) |
| 10 | industrial | A year of flight hardware from own output or contracts | for each of components, electronics, computing hardware, conductors and structural metal, last round's own output (with what the works stood ready to make but held back because the stores were full, `GoodLine.withheld`) plus deliveries contracted to the seat for the coming twelve months is at least 6/5 of a year of what its lines, nodes, launch complex and yard take at full rate, inputs and upkeep |
| 11 | logistical | A year of fuel and spares in store | fuel and spares in store cover twelve months of the inputs and upkeep of all programme installations |
| 12 | logistical | Freight links and electric supply at every programme site | every governed region holding an assembly line or a node has transport grade 2 or better and last month received at least 90% of its electric demand; fails when there is no such region |
| 13 | logistical | Launch and recovery services operating | a launch complex and an orbital yard each running at half rate or better, own or a partner's under a joint programme |
| 14 | service | Common mission charter across sites established | as before |

The details state the measured value and the need. An installation the seat has not
discovered is named "programme installation". The old head-count check (36,000 of
each crew) and the fixed store check (240 kt spares, 200 kt fuel) are gone. A jump
trial is supported by the seat's own orbital yard or a partner's under a joint
programme.

**Cooperation** (`sim/diplomacy.rs`). Two treaty clauses; payment is by ordinary goods
clauses of the same treaty, and the treaty limits (eight clauses, 240 months of
deliveries, recurring deliveries only with escrow) apply.

- `secondment { from, qual, count, months }`: 500-200,000 people for 6-240 months. The
  proposer can lend at most half of its holders of that qualification who are not
  teaching (counted over all its secondment clauses in the treaty); a lender named by
  the other side is counted again at signing. On signature the experts leave the
  lender's regions with real adults of 20-55 (from the regions with most free holders)
  for the borrower's capital, where they live, eat, hold posts and can teach. Each
  month the number owed home falls in the proportion of the borrower's holders of that
  qualification who died, retired or were enlisted; the dead are not returned. At the
  end of the term, or when the lender ends the treaty, the survivors (never more than
  the borrower's free holders) go home with their qualification to the lender's
  region that gave the most of them. When the borrower repudiates the treaty or the
  parties go to war, a quarter of them stay behind as ordinary residents without the
  qualification. Ledger channels are those of the conservation audit, section 4.
- `joint_programme { host, service, months }` with `service` one of `launch`,
  `orbital_yard`, `high_energy`: 12-240 months. The host's installation (the one at
  its capital, else in its lowest-numbered region) serves the other party while the
  treaty is active and the installation ran at half rate or better the month before;
  a month below that is a recorded shortfall and serves nobody. Access counts for the
  investigations that need the installation (a partner's yard also stands for its
  station), for the `F:` requirements of works that need it to exist (never for a
  works that must stand in the same region), for checks 9 and 13, and for trial
  support; never for checks 2-6. Each partner served adds half of the installation's
  operating inputs, upkeep and electric draw to what the host's works take; an
  installation serves at most two partners. Access stops at once when the treaty is
  broken, by repudiation or war, and the lapse is recorded in its performance.
  `undisclosed` is what a seat that has not discovered the installation is shown; it
  is never valid, and such a seat can neither propose nor sign the clause.

## 9. Overflow and precision

- Age cells are `u32`: a single region would need more than four billion people of
  one age to overflow.
- Stocks and flows are `i64` base units. The largest stock seen in all-AI matches is
  of order 10^10; products with basis points use `i128` (`util::muldiv`, `ratio_bp`).
- Per-person coefficients are stored per thousand people and divided last, so a
  coefficient such as 3.3 rations per cultivator is exact.
- Births, deaths and migration carry their remainders, so splitting a population
  never rounds the same expectation twice.

## 10. Known gaps in calibration

Listed in `docs/implementation-status.md` under "Known calibration gaps".

## 11. Time: the historical calendar (ruleset 3.0)

The authoritative clock is still the simulated month, `World.month`, counting
completed months since the start. A **calendar** (`MatchConfig.calendar`,
`bts_engine::calendar`) fixes the start year and the length of every decision round
by round number:

| Calendar | Rounds | Start | Horizon | Round lengths |
| --- | --- | --- | --- | --- |
| Standard | 525 | 1 January 5000 BC | 1 January AD 2500, month 89,988 | 50 years (rounds 1-60), 40 (61-110), 25 (111-150; round 111 is 24), 20 (151-175), 10 (176-195), 5 (196-225), 4 (226-250), 2 (251-525) |
| Quick | 230 | the same | the same | 100, 80, 50 (the first 49), 50, 20, 10, 10, 5 years on the same segment dates |
| Fixture | as given | as given | `rounds x months_per_round` | fixed; tests and calibration only (`MatchConfig::fixture_calendar(rounds)` is twelve-month rounds from 5000 BC, the ruleset 2.0 clock) |

- **Dates.** Inside the engine years are astronomical (1 BC = 0, 5000 BC = -4999). The
  month about to be simulated after `m` completed months is in astronomical year
  `start + m / 12`, month `m % 12 + 1`. On the wire and on screen a year is
  historical, signed, with no year zero: `-5000` is 5000 BC, `1` is AD 1
  (`util::date`, `util::year_label`, `util::date_label`). The round that starts on
  1 January AD 1 is one year shorter than its segment's rounds because the year zero
  does not exist. Ageing stays on 1 January.
- **Every rate is monthly**, so a round of 600 months is 600 monthly steps; the
  standard and quick calendars differ only in how often seats decide.
- **Horizon and reward.** The match ends without a winner at the horizon. The unique
  winner at month `T` scores `2 - (T - R)/(H - R)`, clamped to [1, 2], with `R` the
  first month of AD 1900 (82,788): a win in AD 2280 scores 1.37. Under a fixture `R`
  is 0, which is the ruleset 2.0 reward `2 - T/H`.
- **Round totals.** `GoodLine` totals and the `*_last_round` counts cover the last
  resolved round, however long; `CalendarView.last_round_months` states its length.
  The referee's own uses of round totals (tribute, the industrial-base check of the
  jump programme) are scaled to a month or a year by that length.
- **Standing orders** (design section 2.6, `Action::Directive`) are evaluated on
  1 January of every year and in the first month of every round, in the seat's
  order, each through exactly the validation and price of the action it stands for:
  build targets (at most four levels an evaluation), a research agenda (discovered
  methods are investigated, leads followed up), automatic research, a reform agenda
  (an addition to the design's list: practices gate early works, and without it
  culture would advance only once per fifty-year round) and settlement targets.
  Courses already enrol a new cohort whenever one graduates, so the design's
  `repeat` flag is the standing behaviour of every programme.
- **Treaty terms** run at least `max(6, round months)` and at most
  `max(240, 3 x round months)` (or the clause's own longer maximum); pacts and
  recurring deliveries may be open-ended (`months: 0`) until a party gives notice,
  which ends them at the close of the next round. A war between seats begins only
  in the first month of a round. Standing war policies make an armistice once both
  sides accept it and no region has changed hands between them for the longer of
  their terms and 36 months.
- **Unchanged in months:** project minimum months and work, course lengths, the
  minimum months of investigations, offer expiry in rounds, the five negotiation
  windows of every round, the G96/F24/Trials96 windows, practice reform and
  drift, capture and sovereignty.

## 12. Knowledge pacing (ruleset 3.0)

Design chapter 36, section 2.7, as implemented in `sim::knowledge` and
`content/pacing.json` (read at load; no technology id is paced in code, and a node
added to `content/technologies.json` later takes its tier from the table or one
above its deepest prerequisite, and its tags from the table or "materials and
handwork").

- **Evidence** per month for every node whose prerequisites are met and that is
  unknown or a lead: `P x C / 10,000 + T + X`. `P` = the mean activity of the node's
  tags over two (as ruleset 2.0). `C`, the channel factor: oral 6,000; writing (T025)
  10,000; archives (C013) 13,000; printing (T048) 16,000; the scientific method
  22,000; a research commons (C044) 26,000; digital networks (T112) 30,000; times
  (1 + half the literate share of working age) and times the open and questioning
  habits of the people (tendencies O and R, at most a tenth either way); the Sky
  Terraces add a tenth in measurement. `T` = `isqrt(10 x research staff) / 5`. `X` =
  for every peaceful contact that has prototyped the node, `max(P, 100) x C / 10,000 x
  (5,000 + 2,500 with customs C012 + 2,500 with translation C024) / 10,000`; the
  volume of trade joins this factor with the market slice. C030 still adds a
  quarter.
- **Thresholds**: a lead at `H`, discovered at `2.5 H` (or by a lead study), scaled
  by `pace_bp`. By tier: 1.0 M, 4.0 M, 6.0 M, then 0.8, 0.9, 0.96, 1.0, 0.9, 1.1,
  1.1 M (tiers 3-9 at a fifth of the design's, because practitioner activity in these
  economies is several times smaller than the design assumed; tiers 4-6 raised in slice
  6r). Nodes the graph's tiers place far earlier or later than their history take their
  pacing era's `H` instead: bronze age (writing, alloy casting; slice 6r) 1.6 M;
  classical (iron, roads, sailing, water mills, hygiene, mechanical projection) 14 M;
  late antiquity (recording media) 24 M; medieval (glass, mechanical timekeeping)
  15.4 M; high medieval (propellants, optics, measurement, controlled trials,
  astronomical models) 11.5 M; renaissance (printing) 16 M; early modern (guns,
  precision transmission, anatomy, vacuum, chemical analysis) 8 M; the scientific
  method node (T049) 6 M.
- **Exploratory studies** add five units of evidence per researcher-month of the
  study to each of the (at most two) cheapest eligible nodes of the domain, instead
  of making them leads outright: they narrow a domain down, they do not skip an era.
- **Research effectiveness**: a staffed research post supplies `RE` researcher-months
  a month: oral 0.20, writing 0.35, archives 0.50, printing 0.65, the scientific
  method 0.85, a research commons 0.95, digital networks 1.0 (`research used <=
  posts x RE`, audited monthly).
- **Work and minimum months** by tier (thousands of researcher-months; months): 50
  and 120, 300 and 180, 1,000 and 120, 2,000 and 60, then 2,000, 4,000, 6,000,
  12,000, 20,000 and 30,000 with 36, 30, 30, 30, 36 and 36 months (tiers 4-9 at a
  tenth to a fifth of the design's, which assumed research capacity the native seats
  do not yet build).

## 13. The home world: generator 2.0 (ruleset 3.0)

Design chapter 37, section 5.1, as implemented in `worldgen.rs` (shared steps) and
`worldgen/earthlike.rs` (the map source). `MatchConfig.world` (`WorldKind`) chooses the
map source: `earth_like` (default) or `classic` (the flat 1,600 x 1,000 map of ruleset
2.0, kept for fixtures; `bts run --world classic`, `"world": "classic"` in a new-match
request). A map source returns a `Geo` (regions with geography and links, geology tags,
moisture, ocean adjacency); rivers, passes, sea links, connectivity, site data,
deposits, starts, guarantees, test nodes and civilizations are shared, so the real
Earth (slice 16) only adds a map source.

- **Map.** 2,000 x 1,000 units, equirectangular, wrapping east-west
  (`WorldFrame.wrap_x`); latitude 90 - y x 0.18 degrees. Cells on a staggered jittered
  grid, `regions x 10 / 3` of them (land is about 30% of cells; one land cell is one
  region); cells above 72 degrees are polar ice. Polygons are stored contiguous around
  their centre (the centre's x in [0, 2,000)), so a region at the date line has
  vertices past an edge; movement and carriage use links only.
- **Plates.** 7-9 seeds; 3 continental (35-40%); each cell joins the nearest seed
  (cosine-weighted, warped by noise). Elevation: continental crust 0.60, oceanic 0.18,
  convergent boundaries raise continents (mountain belts) and island arcs and sink the
  oceanic side of a subduction zone, divergent ones lower; fractal noise; high
  latitudes lowered. Land = the highest non-polar cells.
- **Climate.** Temperature `-18 + 46 cos(lat) - 10 x height` (integer cosine table);
  moisture by latitude band (wet equator, dry subtropics, wet westerlies, dry poles),
  reduced by 13% per land link from the sea (to at least 45%), by 45% in the rain
  shadow of mountains (east of ranges at 35-62 degrees, west of ranges below 30), plus
  noise. Height is the rank of relief among the world's land, so mountain and hill
  shares match the classic map. Terrain from a Whittaker-style table onto the eight
  terrains; `Region.climate` (`Tropical, Arid, Temperate, Continental, Polar`) drives
  the shared harvest draws (one per climate zone and ninth of the map per year).
- **Land attributes** by terrain are the classic generator's (`terrain_attrs`); over
  1,000 worlds the arable, pasture, forest and water means are within 5% of the classic
  map (`docs/calibration/ruleset3-slice-4-eval.txt`), which keeps slice 2's population
  calibration valid.
- **Starts.** Temperate or tropical, not mountains, desert or tundra, scored by land
  and room, as many links apart as the world allows (four wanted, three at least in
  nine worlds of ten), each with room to grow over land (`regions / 12` regions nearer
  to it than to any other start within three land links). A world whose starts fail
  is drawn again from the next address of the secret, at most twelve times. A start
  the river courses missed gets a short river to its lowest land neighbour.
- **Site data** (`Region.site`, plain world data for later rules on cities, harbours
  and migration; no rule of slices 4-6 reads it): coast edges, natural harbour
  quality, navigable river, river mouth, confluence, flat-land share, climate amenity,
  and mineral wealth within one link.
- **City and harbour data** (design chapter 38, section 8.1; recorded now, used by the
  cities slice): `Region.natural_harbour` (about a third of coasts, three in five river
  mouths), `Region.city_name` and `Region.city_at` (the principal city, seaward of the
  centre on a coast), `World.ice_links` (sea links between regions beyond 52 degrees,
  seasonal, or beyond 62 or both polar, for most of the year).
- **Seats and size.** Starts are placed for two to ten seats (the room a start needs
  scales with the seat count) and worlds of up to about 160 regions generate in well
  under a second.
- **Determinism.** Only +, -, x, /, floor, sqrt and comparisons on `f64` and keyed
  integer hashes (`worldgen_uses_no_transcendental_functions` scans the source); noise
  on the wrapped map repeats every 2,000 units.

## 14. Resources and goods (ruleset 3.0)

Design chapter 36, section 5, as changed by chapter 37, section 1.1; `content.rs`,
`worldgen.rs::place_deposits`, `sim::economy`.

**Goods** (50; base unit, mass): food (ration, 50 kg); horses (head, 500 kg); tools and
spares (lot, 250 kg); electronics, munitions and batteries (lot, 50 kg); hardware (lot,
500 kg); media (lot, 150 kg); instruments (lot, 400 kg); medicine (lot, 40 kg); consumer
goods (lot, 100 kg); textiles, fine wares and interface lattice (lot, 10 kg); precious
metals, nuclear fuel and helium-3 (lot, 1 kg); everything else a tonne: building
materials (relabelled; timber split off), copper, tin, iron and copper ore, coal,
crude, natural gas, salt, saltpetre, bauxite, uranium ore, rare-earth ore, lithium,
cobalt and nickel, high-purity quartz, helium, timber, fibres, spices, iron and steel,
copper, aluminium, components, conductors, insulation, fuel, chemicals, fertilizer,
magnets, semiconductor materials, volatiles, propellant. Rare minerals are retired
(uranium ore, rare earths, quartz, lithium and cobalt-nickel replace them). Volatiles,
propellant and helium-3 are in the catalog for the space slice and are not made yet.
Grown goods (food, fibres, horses, spices, timber) come from extractive land works and
are outside the mass balance like food; the declared atmospheric recipes (ammonia,
food synthesis) put out at most three times the mass they take.

**A seat's ledger lists a good** once it holds or has moved some, or a facility,
method, field method, formation or course within its knowledge names it, or it
recognizes a deposit of it in a surveyed region (`observe::known_goods`).

**Deposits** (17; `Deposit`; per 48 regions, size per deposit, placement bias):

| Deposit | Regions | Size | Geology and climate | Revealed by |
| --- | --- | --- | --- | --- |
| Copper ore | 16-20 | 300-1,200 Mt | orogenic belts, hills, mountains | T014 |
| Tin | 5-7 (at least 5) | 10-40 Mt | belts in rough land (granite) | T014 |
| Iron ore | 20-24 | 2,000-8,000 Mt | shields, belts, plains | T023 |
| Coal | 18-22 | 3,000-12,000 Mt | wet lowland basins | T014 |
| Saltpetre | 6-9 | 20-80 Mt | deserts, arid lands, hills | T036 |
| Salt | 18-22 | 500-5,000 Mt | arid lands, coastal basins (and pans on every coast) | from the start |
| Precious metals | 8-12 | 2,000-10,000 t | belts in rough land | from the start |
| Crude oil | 8-12 | 1,000-6,000 Mt | sedimentary basins in deserts, steppes, marshes, tundra | T064 or T090 |
| Natural gas | 8-12 (beside crude) | 1,000-5,000 Mt; helium 0-150 per 10,000 t, 50-150 in 2-4 fields | as crude | T090 (helium content T108) |
| Bauxite | 4-6 (at least 4) | 500-3,000 Mt | tropical plains and hills | T103 |
| Uranium ore | 4-6 (at least 3) | 5-30 Mt | shields, deserts, mountains | T146 |
| Rare-earth ore | 3-5 (at least 3) | 20-100 Mt | shields, mountains, deserts | T043 or T103 |
| Lithium brine | 3-4 (at least 3) | 5-30 Mt | arid basins and rifts | T105 |
| Cobalt and nickel | 4-6 (at least 3) | 20-150 Mt | mountains, belts, tundra | T060 |
| High-purity quartz | 5-8 (at least 3) | 50-300 Mt | rough land | T103 |
| Volatiles, helium-3 | off the Earth only (space slice) | | | not yet |

For each kind the regions whose geology calls for it most (with noise) receive one; a
rare kind is placed so that no start's three-link neighbourhood holds more than half of
its regions where the world allows (95% of rare kinds over 1,000 worlds; a three-link
neighbourhood is 20 of 48 regions at the median). Within three links of every home: at
least 1,200 Mt of copper ore, 7,000 Mt of iron ore, 10,000 Mt of coal, and salt (a
deposit or a coast for pans); every home has a floodplain. **Site bonuses** (at most two):
fertile floodplain (river lowland, +2,500 field yield), fish banks (+5,000 fishing),
wild herds (+5,000 horse breeding; seen with T006), old-growth forest (+5,000 timber),
rich pasture (+3,000 pasture food). **Spice land**: 6-20 levels on tropical plains,
forest, marsh and hills.

**New facilities** (per level-month): forestry camps (12 t timber, 8,000 posts; the
old timber-and-quarry camp), quarries and clay pits (16 t materials, 8,000), salt works
on a deposit (8 t, 6,000) and coastal pans (0.5 t, 1,000), fibre plantations (2 t
fibres, 8,000, share arable land with fields), spice plantations (0.5 t), horse
breeding (300 horses, 5,000, shares pasture), mines of tin, precious metals, bauxite,
uranium, rare earths, cobalt-nickel and quartz (shallow, deep and mechanized workings
as the copper mine), nitre works (2 t saltpetre), lithium brine works (0.5 t), gas wells
(30 t gas; with separation, T108, the field's helium share of the gas raised), weaving
workshops and textile mills (1.1 t fibres to 100 lots of textiles; synthetic method
1.2 t chemicals), powder works (0.6 t saltpetre and 0.2 t timber to 15 lots of
munitions), arsenal (0.5 t chemicals and 0.3 t metal to 15 lots), nitrate fertilizer
works (6 t saltpetre to 5 t), ammonia synthesis (5 t gas to 12 t, or 10 t coal to 12 t,
atmospheric; ten times the design table's per-level output, see the slice 5
calibration), aluminium smelter (4 t bauxite and 0.4 t chemicals to 1 t, 150 electric),
magnet works (3 t rare earths, 1 t metal, 0.5 t chemicals to 1 t magnets), battery works
(lithium cells, or sodium cells from salt at half the output), nuclear fuel plant
(4 t uranium ore to 40,000 lots; fusion fuel from lithium), consumer goods works, fine-wares
workshops, and the lattice conditioning works (one per test node; the only input with
no substitute). The full table is printed by `print_unit_tables`.

**Changed users**: copper and iron smelting and tool handles burn timber; bronze tools
(1.4 t copper, 0.2 t tin, 2 t timber to 9,000 lots) before copper tools (6,000); fields
draw horses (traction and rotation, 30 a level-month) and fertilizer (fertilized 150 t,
intensive 300 t, restorative 200 t with 50 t chemicals) instead of the stand-ins; roads
use 20 horses a level-month until motor vehicles (porters stand in without loss of
condition); stored food spoils three tenths slower while 0.2 t of salt per million
rations is at hand; harbours take timber; fission burns 3,000 lots of nuclear fuel;
fusion 5,000 lots and 0.05 t helium; the high-energy laboratory, testbed, assembly line,
deployment node and lattice works take operating helium (each with a nitrogen-cooled
method without helium and more electricity); the launch complex takes aluminium,
cobalt-nickel and batteries (or steel vehicles and more fuel); the orbital yard aluminium
(or steel); assembly lines lattice and magnets; integrated electronics a trace of
precious metals; semiconductor materials come from quartz (or twice-refined metallurgical
silicon); the industrial base of the jump programme counts magnets and lattice.

**Formations** carry an equipment generation (G0, G1, G2, G4, G5, G6): bronze levies may
be issued copper and tin when iron is short; maneuver formations of G1-G2 need 0.3
horses per soldier; G2 and later take munitions (one lot per soldier, 0.02-0.04 a month,
five times as much in a month of battle); G5 aluminium, G6 batteries.

**Building lines** (`FacDef.line`, `stage`, `era`; `content().upgrades`): metadata for
the building lifecycle of slice 7, and the era that gates productivity technologies.

## 15. Labour productivity (ruleset 3.0)

Design chapter 36, section 4, as changed by chapter 37, section 8.3; `sim::productivity`.

For region `r` and sector `k` (food, extraction, industry, services, knowledge,
construction; a works' sector follows its labour category, food works are food):

```text
LP(r, k) = clamp(F_edu x F_cul x F_rel x F_tech x F_city x F_health, 5,000, 40,000)

- `F_edu = 10,000 + 3,000 x literate share + 2,000 x qualified share` (working age; the
  qualified are holders of any qualification but literacy and lore).
- `F_cul = clamp(10,000 + (tendency - 5,000) / 5 + practice bonuses, 8,500, 13,000)`, the
  tendency of the region's majority lineage that drives the sector (agricultural
  stewardship for food; industrial workmanship for industry and extraction; urban
  organization for services and construction; revisability for knowledge) and the
  established practices of the design's table (C018 craft guilds until C033).
- `F_rel = clamp(10,000 + doctrines, 9,000, 11,500)` of the region's majority faith:
  Shared Labour Days +500 construction; Sanctified Labour (new follower practice) +500
  industry and extraction; Stewardship of the Land (new founding obligation) +500 food
  and +5% field yield; Day of Rest -300 everywhere.
- `F_tech = 10,000 + ` the productivity technologies of the sector (the design's
  table), counting for a works only those of an era at most one above the works' era
  (its building stage's era, or the era of the method it runs when later: fields
  worked by machine are modern farming).
- `F_city` (`city_factor`, a function of its inputs): the class term of the region's
  principal city (`city_class`: the settlement class until the cities slice) for
  industry, services and knowledge (camp 9,500 ... megalopolis 11,400), times
  `1 + 0.06 x prosperity` (prosperity 0 until the consumption slice), less
  `1,000 x (1 - water coverage)` and a quarter of the health pressure; 8,000-12,500.
- `F_health = 10,000 - (10,000 - food access) / 2 - health pressure / 4`, 6,000-10,000.
- `F_auto` (qualified posts, never research posts): T114 +1,000 industry, T116 +1,000
  services and knowledge, T122 +2,500 everywhere; 10,000-15,000.

**Channels.** A works needs `ceil(general x method share x (1 - shared support) x
10,000 / LP)` general posts and `ceil(qualified / F_auto)` qualified posts; what a level
makes is unchanged (the hard ceiling `recipe x level x rate`). A field level needs
`10,000 / LP(food)` of its method's cultivators and yields the same rations, times the
land factor (floodplain, irrigation, the harvest, agricultural habits, the stewardship
doctrine), at most twice the method. Pasture and fishing need fewer hands for the same
food. The construction factor `min(LP(construction), 15,000)` is the worker-months a
called-up worker supplies. Evidence of discovery and the town share of a region are
reckoned on the work done (posts at a productivity of one), so productivity frees
people without slowing discovery or turning farmers into townspeople by bookkeeping.

**Fields with partial inputs** (ruleset 3.0 slice 6): a region's fields are worked at
the best method on as many levels as the stores supply with a full month of that
method's horses, fertilizer, chemicals and fuel (motor boats are fuelled first), and the
rest at the best method the remaining stores cover; every level's inputs are reserved
before the plan and drawn after it. (Before, a method was used only when a month for
every field of the civilization was in store, which held whole late nations at hand
cultivation for want of the last kilotonne of fertilizer.)

**Visibility.** `OwnRegion.productivity` (one `ProductivityView` per sector: total,
factors named by source and detail, posts saved last month) and per works
`FacilityView.posts_base`, `posts_after_scale`, `posts_after_productivity`,
`productivity_bp`, `yield_per_level`, `yield_factors`. Only technologies the seat
understands and practices it established are named.

**Audit.** Every works' posts equal the formula with the month's factors (stored on
the facility: `lp_bp`, `lpq_bp`, `staff_level`, `staff_saving_bp`), its factors are in
bounds, and project work is at most the called-up workers times the month's
construction factor (`ledger::violations`).

**Map size.** Knowledge pacing scales with the region count (`content/pacing.json`,
`map_scale`): evidence thresholds by `1 + evidence_bp x (regions - 48) / 48` and
research and reform work by `1 + work_bp x (regions - 48) / 48`. Calibrated on the
60-region Standard map (now the default; presets 30, 60, 90, 120, 200): the larger
generated world develops more slowly than the 48-region one (seats are farther apart),
so the evidence factor is 0.95 there (`evidence_bp` -2,000) and work is unscaled.

## 16. The deeper technology and practice graphs (ruleset 3.0, slices 6b and 6c)

Design chapter 39, sections 1-3, as implemented in `sim::knowledge`, `sim::culture` and
`content/{technologies,practices,pacing,families}.json`.

- **Sizes**: 300 technologies (138 of the atlas, 19 of doc 37, 143 of doc 39) and 174
  practices (64, 3 of doc 37, 107 of doc 39). The victory-critical sets stay at 84 and 35
  (`content/families.json`; `scripts/critical_set.py --check`).
- **Per-node costs**: `work = tier work x work_bp / 10,000`, `H = H[tier or pacing era] x
  hint_bp / 10,000`, minimum months at least the tier's (48 for new tier 8-9 nodes).
  Critical nodes keep 10,000/10,000. Existing non-critical nodes of tiers 6-7 carry
  `work_bp` 11,250 and `hint_bp` 11,500, tiers 8-9 12,500 and 12,500; doc 39's new nodes
  carry half of the draft's surcharge above 10,000 (calibrated, slice 6c).
- **Families** (15): installed base = operating levels of works and methods (and
  formations, per thousand soldiers) whose requirement names the member; an understood
  member without works counts one. Incumbent share `s` in basis points (at most 5,000 for
  an understood-only incumbent). On every other member: evidence `x (10,000 - 6,000 s)`,
  investigation work `x (10,000 + 5,000 s)`, and at `s >= 7,500` its evidence held below
  discovery (2.5 H) unless a peaceful contact has prototyped it. Each understood refuting
  node halves what is left of both locks and removes the cap. Critical members: evidence at
  least 8,000, work at most 11,000, no cap. A revisit study costs 25% of the node's work
  (at least 24 months) and lifts the evidence lock and cap for 240 months.
- **Practice drags**: craft guilds without industrial employment, interchangeable parts
  x0.85; a state church, Science-tag evidence x0.90 (the toleration-history exemption is
  not built); political police x0.95 on Science; mercantilism, contact evidence x0.80;
  mass surveillance, public-key cryptography and fibre optics x0.80. Locks and drags
  together never take a critical node below x0.80.
- **Fragile know-how**: four nodes; understood but unused by any operating works for
  1,200 months without established archives (C013) or monastic orders (C088), it falls
  back to discovered with its evidence kept and half the work to relearn.
- **Investigation lines**: `4 + isqrt(research staff / 5,000)`, at most 24, research staff
  being research capacity over research effectiveness (posts). Standing orders: a
  research agenda starts its items at priority 4, automatic research at priority 6 and
  never into the last two lines, so what a seat orders gets research capacity first.
- **Practice costs by era** (0-8): evidence 1,200 / 4,000 / 10,000 / 24,000 / 75,000 /
  200,000 / 360,000 / 600,000 / 900,000; reform work 10 / 40 / 90 / 160 / 450 / 1,100 /
  1,800 / 2,800 / 4,000 thousand worker-months (eras 4-8 at 1.5-2x the design's,
  calibrated in slice 6c); media 0 / 3 / 8 / 15 / 30 / 55 / 90 / 140 / 200
  thousand lots; minimum months 24 / 60 / 60 / 72 / 84 / 96 / 108 / 120 / 120; load 0 / 0 /
  0 / 1 / 1 / 2 / 2 / 3 / 3. Critical practices keep the catalogue-group costs of ruleset
  2.0 (at most 12,000 evidence and 260 k worker-months, three months). Adoption after a
  reform `x 10,000 / (10,000 + 1,500 x era)`.
- **Institutions**: capacity `20 + 2 x admin office levels (at most 30) + 10` for each of
  C026, C036, C041 or C042, C050, C119 (the design's 3 per level, calibrated); load above
  capacity: stability -1 per 4 points and reform work x1.5. Reform slots `1 + C026 + C036 +
  C050`. A repeal runs at least 24 months (a quarter of the reform's work) with stability
  -2 while it runs; the practice returns to recognized with adoption 0. Tension pairs
  both established: stability -2 each and both adopt at half speed. Tradition
  institutions (C168-C174) are recognizable only while their tradition is held, or
  within a century of switching away from it (slice 13).

## 17. Eras and traditions (ruleset 3.0, slices 10 and 13)

`sim::eras`; design chapter 37, sections 3 and 4. All figures are integers; months
are real months of the calendar.

- **Era state** per civilization (`Civ.era`): era 0-9, month entered, the crossing under
  way, the age, the charters held (indices into the 24 charters), eras entered with their
  outcome and score, the launch complex's consecutive months at half rate, the two
  tradition slots with mastery 0-10,000 bp, the last switch per slot, the paths switched
  away from, and the hazard state (network incident end, reactor incidents, grid strain).
- **Entry** (`Action::EnterEra`): the next era only, when its knowledge is understood
  (practice C013 established for the Medieval era), its built proof stands and no crossing
  is under way. Proofs: a region of at least 750,000 residents; an archive or sacred
  precinct operating; a harbour or roads in three regions, and powder works or an arsenal
  operating; 10 levels of machine shops, textile mills and steelworks operating; 300 units
  (300,000 base units, 30 GWh) of electricity made in the region-months of the last month;
  a computing centre operating; a launch complex at half rate or better in each of the
  last 12 months and an orbital station operating; 1,000 units of compute (1,000,000 base
  units) and 20 levels of AI-era works operating; a jump testbed operating (Interstellar,
  only once the objective is revealed). Operating: enabled and run at half rate, or
  staffed to half or better.
- **Crossing**: 600 / 600 / 360 / 240 / 180 / 120 / 120 / 120 / 120 months for eras 1-9.
  Stability target `-(2 + 10 x obsolete share)`, the obsolete share being filled posts in
  works whose era (line stage, or method if later; fields by their method) is two or more
  behind the new era over all filled posts (farm posts counted from the Modern era on).
  Score: food access 25 points at 9,900 bp, 0 at 9,000; stability 25 at 90, 0 at 65;
  modern share (posts in works of era `e - 1` or later, Classical works for the Classical
  era) 25 at 6,000 bp, 0 at 2,000; integrity 25 less 10 per event (a governed region lost
  to another seat, a repudiated treaty, epidemic and famine deaths above 2% of the people
  within twelve months), linear between. 85 or more: golden age of `2 T_e` months; under
  50: dark age of `T_e` months.
- **Ages**: golden: stability +5, channel factor x1.10, construction productivity +1,000
  bp, a second charter. Dark: stability -5, research capacity x0.90, practice reforms and
  tradition reforms at half work and half minimum months, charter changes free, recruit
  room x1.10.
- **Charters**: one of three per era (two in a golden age); a change within the era costs
  stability -3 for 60 months and locks for 240 months (free in a dark age); all lapse on
  entering the next era. Effects and costs in `sim::eras::CHARTERS`; the factors are basis
  points on existing quantities (productivity culture factor +-300 to +-1,000, channel
  factor x0.95 to x1.10, contact evidence x1.10 to x1.25, research capacity x1.10 to x1.25
  and Academies' 500 researcher-months, recruit room x1.25 / x1.50, militia x1.5,
  mobilization cap x0.90, admin capacity +1 per office level or x1.5, build work x0.70 to
  x1.15, upkeep x0.70 to x1.50, town mortality x1.05, customary fertility x0.98,
  development factor +300 bp, automation ceiling 12,500 or 16,000, compute x0.90). The
  Welfare State draws 2 base units of medicine and 1 of media per thousand residents a
  month.
- **Expected basket** (slice 11 hook, not consumed): textiles 150 / 150 / 150 / 250 /
  400 / 1,000 / 1,000 / 1,000 base units (lots x 1/1,000) and consumer goods 0 / 0 / 0 /
  0 / 200 / 1,000 / 2,500 / 3,000 per thousand residents a month for eras 0-7 (8-9 as 7).
- **Traditions**: machine slot from the Industrial era, frontier from the Information era.
  From unaligned a path is held at once; a switch is a project of 2,000,000 worker-months
  (scaled by pace) and 500,000 base units of media over at least 120 months at the
  capital, stability -5 while it runs, ending with a quarter of the mastery; a further
  switch in the slot waits 600 months. Mastery +200 bp a year (+300 when a tendency the
  path pulls is above 6,000) while its signature and exclusive works hold at least 500 bp
  of the filled industry posts in works of the slot's era or later; otherwise -100 bp.
  Held paths shift the targets of their tendencies by +1,000 bp (within the yearly drift
  limits). Seats that share a path gain one trust point a decade (to 90), and a joint
  programme client sharing a path with its host costs it 3,333 bp of the installation's
  inputs instead of 5,000.
- **Tradition works** (buildable only while the path is held; base units per level-month):
  steam hammer works (12,500 t metal, 800 lots tools, 1,500 t coal -> 10,000 t components,
  shaft 40,000; 6,000 general posts less up to 15% by mastery); coke steel with tar recovery
  (40,000 t ore, 22,000 t coal -> 30,000 t metal, 3,000 t chemicals); cracking (20,000 t
  crude -> 13,000 t fuel, 5,000 t chemicals); motor works (10,000 t metal, 600 t fuel,
  400 lots tools -> 8,000 t components); trams and metros (30 units electricity; city
  factor +500 bp by mastery for industry, services, knowledge); early electric-arc
  furnaces (the electric steelmaking method under T287); compact reactor (600 lots nuclear
  fuel -> 400 units electricity; 0.6 of a fission plant's bill per unit); isotope works (50
  lots nuclear fuel, 500 t chemicals, 500 t metal -> 6,000 lots medicine, 1,000 lots
  instruments); network operations centre (computing x(1 + 0.05 m), incidents halved);
  implant clinic (automation +1,000 bp by mastery in its region); biofoundry (40,000
  rations and 2,000 t fibres -> 3,500 t chemicals, or 60,000 rations -> 2,500 t fuel);
  lights-out machining and assembly (general posts 1,800 / 3,000 bp, +60 electricity and
  +40 compute); machine governance centre (admin +6 regions a level). Every recipe takes in
  at least the mass it puts out.
- **Unit variants** (formations raised while the path is held, per thousand soldiers):
  Ironclad and rail (G4) fuel -> coal x2; line +10% and maneuver -10%. Heavy armour (G4-G5)
  fuel x1.3; shock +10% by mastery. Electric drive (G4-G6) fuel -> batteries (half the
  equipment's fuel, 50 a month); maneuver +5% by mastery. Atomic-powered (G5-G6) fuel ->
  2 lots nuclear fuel a month. Cyber-augmented (G5-G6) electronics upkeep x1.5,
  proficiency ceiling +1,000. Augmented soldiers (G5-G6) +20 lots medicine a month, losses
  -20% by mastery. Autonomous swarms (G6) equipment x1.6, 1,000 base units of compute a
  month, power x2 (not under Human Primacy).
- **Drawbacks**: coal smoke `M_urban x1.10` in regions with 10 steam station levels
  (until T085 or the Factory Acts); oil dependence stability -3 (-6 at war) while fuel in
  store is below two months of use; conductors x1.10 in the bills of generator halls,
  grids, hydroelectric works and tramways, and grid faults (a region drawing over 95% of
  its electricity three months running: its electric works' rate x0.90 the next month);
  reactor incidents (500 ppm a reactor level a year, secret stream `reactor-incident`: 2%
  of the region resettled to a governed neighbour, stability -10 weighed by the region's
  share of the people, at least -2, for 60 months) and stability -3 against a Stewardship
  majority; network incidents (25,000 ppm a year while compute exceeds 500 units, x2 under
  Open Networks, halved by an operations centre; stream `network-incident`; compute and
  electronics x0.70 for six months); biofoundry contamination (epidemic hazard x1.20 in its
  region) and biological works' minimum months x1.5; labour displacement stability -2 per
  tenth of general posts saved by productivity (-1 under the Automation Drive).
