# Units and scale

This chapter fixes what one unit of everything in the rules engine means and the
magnitudes that follow. It is the reference for `crates/bts-engine`; when a number in
the engine disagrees with this chapter, one of the two is a bug. All numeric values
remain provisional calibration; the *units* are not provisional.

Ruleset `bts-rules/2.0.0` is the first that follows this chapter. Saves written by
earlier rulesets counted people and posts differently and are refused on load with a
versioned error; they cannot be migrated exactly.

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
| Births | at most 0.030 a month per reproductive equivalent, lagged nine months, cut by thin stores, crowding and schooling |
| Sustained growth actually seen in all-AI matches | 1.5-2.5% a year while land and water last |
| Natural water of a home region | at least 2.6 million residents |

Settlement class of a region (descriptive only; no rule keys on it):

| Class | Residents |
| --- | --- |
| Wilderness | 0 |
| Camp | under 150,000 |
| Village | 150,000 to under 1 million |
| Town | 1 to under 4 million |
| City | 4 to under 12 million |
| Metropolis | 12 million or more |

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
discovered is named "a programme installation". The old head-count check (36,000 of
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
