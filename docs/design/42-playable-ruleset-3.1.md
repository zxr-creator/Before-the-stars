# 42. Ruleset 3.1: a playable game

Decided with the user on 2026-11-16. Ruleset 3.0 was complete on paper and unfinished at
the table: no all-AI match of its 32-seed release set had a winner, one seat in 128 ever
entered the Space era, the quick calendar left every native seat at sixty technologies in
AD 2500, and about four fifths of working-age people had no post because the works could
not find qualified staff. Ruleset 3.1 keeps the world, the economy and the long view, and
changes whatever stood between a seat and the end of a match. It takes precedence over
chapters 15, 19, 32 (section 8), 35, 37 (section 4) and 39 where they differ.

The principle behind every change: **nothing a seat has earned can be taken back by a
shortage, and nothing a seat needs rests on a single thing it may never have.** Streaks
became steps, hard gates became slower rates, and sole sources got a second method.

Versions: `bts-rules/3.1.0`, `bts-content/3.1.0`, `bts-worldgen/2.2.0`,
`bts-protocol/2.7` (additions only), `bts-native/1.8.0`. Saves of ruleset 3.0 are refused
by name.

## 1. Victory: the standard contract

A match is won in one of three ways, and always by exactly one seat while a sovereign seat
remains (`MatchConfig.victory = standard`, the default; `sim::victory`).

1. **The jump programme.** Six steps in order. A step once reached is permanent.

   | # | Step | Reached when |
   | --- | --- | --- |
   | 1 | Reach orbit | a proving ground, launch complex or rocket works makes its first boost |
   | 2 | A space station in low Earth orbit | a station core is placed there |
   | 3 | An orbital shipyard | that station carries a shipyard module |
   | 4 | A jump assembly | a jump assembly line completes its first assembly |
   | 5 | First loaded jump round trip | a jump trial (`start_project` / `ftl_trial`) is flown |
   | 6 | Second jump round trip | another is flown at least twelve months after the first |

   The first sovereign seat to reach step 6 wins. A trial needs an operational assembly and
   the seat's own shipyard in low Earth orbit; it no longer needs world governance.
2. **Supremacy.** A seat left as the only sovereign (every other seat eliminated, forfeited
   or its subordinate) wins at once.
3. **Standing.** At the horizon the sovereign seat with the highest standing wins: 1,000
   points for each programme step, one for each thousandth of the world's people under its
   authority, one for each technology understood. Standings are public among seats that
   have met.

The contract is public from the first round (`objectives.victory`, with `steps`,
`next_step`, `standing`, `standings`, `trial_ready`). Sealed knowledge and the three test
nodes stay hidden until discovered. Every step a seat reaches is announced to the seats it
has met.

The **classic contract** of chapter 15 (96 continuous months of world governance, 24 of
fleet-wide jump capability, two trials flown during it) remains as
`MatchConfig.victory = classic` (`bts run --victory classic`, the setup screen). It may
end without a winner, as before.

Why: under the classic contract the hard seat of the baseline match governed the whole
world for more than 4,000 consecutive months, built 26 assemblies, flew dozens of trials
and still did not win, because fourteen economic checks never all held in the same 24
months.

## 2. One kind of space station

Ruleset 3.0 had two: ground works called "orbital station" and "orbital yard" (chapter 35)
and the station in orbit with a core and modules (chapter 39), each gating the other.
Now the station in orbit is the station.

- Wherever a rule asks for the ground station or yard (requirements, investigation
  installations, the Space era's proof) a station in orbit, or one with a shipyard module,
  serves (`World::station_stands_in`). The ground works remain buildable and optional.
- The shipyard module needs only its technology (T145), weighs 3,000 t and has its own
  crew; the K2 core needs no ground works. One solar array (300 units) powers a first
  station: core, shipyard, berth and life support.
- The Space era is proved by a station in orbit.
- Lattice works stand in any region (one each), not only at the three test nodes.
- The programme's works draw far less electricity (laboratory 400 units, testbed 2,000,
  assembly line 1,000, lattice works 500): a seat without uranium could not power them at
  all.
- An investigation that needs an installation needs it to stand and be switched on, not to
  have run at a quarter rate that month.

Native seats of every difficulty now run the programme (only the hard seat did), place a
K1 core, add the shipyard second, and keep the station supplied.

## 3. Public schooling

A seat no longer runs twenty-four courses region by region (`sim::schooling`, policy
`schooling`, on by default; `MatchConfig.schooling`).

- Once a year the referee opens that year's cohorts itself: for every qualification, the
  holders employed, the qualified posts left vacant, the posts of works under construction
  and the crews of stations, with a tenth to spare; real posts first, then a small standing
  share of the working people (a tenth literate; three in a thousand of each other
  qualification the seat can teach).
- It fills the free places of the venues the seat has built, where the vacancies are, then
  where the people are. **Building venues is the seat's one lever**; a qualification short
  for want of places is reported in the briefing.
- The courses are the ordinary programmes of `sim::projects`, marked `auto`. A seat may
  still open programmes of its own, or turn schooling off and run everything.

Three rules of the courses themselves changed, for every programme:

- People without a qualification enrol first, whatever the course (half as long again
  where the course used to ask for an earlier qualification). The ladder of courses
  drained its lower rungs: a seat of 300 million had no artisans left.
- Instructors set the pace of a cohort, not its size: with too few, classes are larger and
  the course takes longer, at most twice as long. A founding cohort is at most 20,000.
- Short of materials a class goes on at half speed; only a closed venue stops it.

## 4. Resources

Twelve minor goods are retired (`content::RETIRED_GOODS`): spices, fine wares, precious
metals, tin, saltpetre, salt, lithium, cobalt and nickel, helium, natural gas, quartz and
batteries, with their eight deposits and thirteen works. Each fed one recipe or none.
They are stripped from every bill, recipe, upkeep, course and kit at load; no view names
them. Thirty-six goods remain on the home world, two more off it.

No good a seat must have rests on one deposit kind: magnet works have a second method
(ferrite and wound coils from metal and copper, at half the yield); substrate, aluminium
and fuel already had theirs. Rare earths, bauxite and uranium are advantages, not gates.

Food: every field method that rests on a technology yields a sixth to a third more;
irrigation waters eight levels of fields a level and raises their yield by two fifths; a
food synthesis level makes 600 thousand rations.

## 5. Knowledge

- The graph is 225 technologies (was 300). Seventy-five trivial modern and future nodes
  were merged away (`scripts/merge_late_tech.py`): late side, alternative, dead-end and
  sealed nodes that no works, method, course, practice or order asked for, Solar-System
  filler, and three or four of the eight nodes of each tradition branch, folded into a
  neighbour whose name and capability now cover both. Nine late rival families went with
  their alternatives. No victory-critical node was touched.
- Research of a lower class can stand in for a higher one at half the worth for every
  class of difference: a seat with investigators of the wrong kind is slowed, never
  stopped.
- Pacing (`content/pacing.json`): with the works of every seat staffed, evidence and
  research run faster; the pacing eras from medieval to the scientific method take 1.25
  times the evidence, tiers 4-6 1.6 times the evidence and 1.5 times the work, tiers 7-9
  1.3 times the evidence.

## 6. Traditions: ten punk ages

A tradition is no longer a footnote of a few percent. Each path names the seat's age, has
a look of its own on the map, works only it can build, and effects that scale with its
**strength**: a quarter for holding it, three eighths from mastery, three eighths from its
branch technologies understood (`sim::eras::strength`).

| Path (key) | Slot | Age | Unique works | At full strength |
| --- | --- | --- | --- | --- |
| Steampunk, Coal and Steam (`steam`) | machine | Age of Steam | steam hammer works | industry +30%, construction +15%, rail freight +25%, industrial research +10% |
| Dieselpunk, Oil and Engine (`engine`) | machine | Diesel Age | motor works | extraction +25%, construction +15%, works built a fifth sooner, recruit room +25% |
| Electropunk, Current and Wire (`wire`) | machine | Electric Age | trams and metros | services +25%, knowledge works +10%, industrial research +15% |
| Clockpunk, Gear and Spring (`gear`, new) | machine | Clockwork Age | automaton works | scholarly and industrial research +25%, upkeep -25%, knowledge works +15%, industry +10%; construction work +10% |
| Atompunk, Atom (`atom`) | frontier | Atomic Age | compact reactor, isotope works | advanced and frontier research +20%, boost +25% |
| Cyberpunk, Network (`network`) | frontier | Neon Age | operations centre, implant clinic | compute +25%, advanced research +20%, services +20%, administration +30%; stability -2 |
| Biopunk, Living Systems (`living`) | frontier | Age of Living Machines | biofoundry | food +25%, health +4 |
| AI-punk, Synthetic Minds (`synthetic`) | frontier | Age of Synthetic Minds | machine governance, lights-out methods | industry +20%, automation ceiling +20%, advanced and frontier research +15% |
| Solarpunk, Sun and Commons (`sun`, new) | frontier | Solar Age | sun gardens | stability +6, health +3, food +15%, upkeep -20%; extraction -15%, recruit room -20% |
| Rocketpunk, Rocket and Orbit (`rocket`, new) | frontier | Rocket Age | rocket works | boost +50%, launch and orbital works -30% work, frontier research +15%; services -10% |

The earlier drawbacks (coal smoke, oil dependence, grid faults, reactor incidents, network
incidents, contamination, labour displacement) stand. The client draws towns and works of
a seat in its path's style (ten styles on both maps) and titles its age accordingly.

## 7. Households and prices

Two pieces of the Victoria-style economy that chapter 36 had left as hooks:

- **Standard of living.** From the Early Modern era households take the era's basket
  (textiles and consumer goods per thousand residents) from the common stock every month.
  The share supplied, averaged over a year, is the seat's standard of living: up to +3
  stability and better-working towns when it is full, down to -3 when it is empty. Nothing
  waits for it and nothing stops; textiles and consumer goods finally have a use.
- **Home prices.** Every good carries last round's home price as a share of its base
  price: `1 + 0.75 x (D - S) / min(D, S)`, bounded to 0.25-1.75, where supply is what was
  made and bought and demand is what was used, sold and asked for and not there. It is a
  signal (`GoodLine.price_bp`, with `short`), not a payment: buildings, production methods,
  staffing and the common stock work as before. Trade between seats keeps its own market.

What is still not Victoria-like: there is no money at home, no wages, taxes or budget,
and no private investment pool; works are staffed by priority, not by profit.

## 8. Calendars and the built-in opponents

- The quick game is 280 rounds: a shorter antiquity, the standard game's rounds from AD
  1000 to 1950, five-year rounds after. Inside any quick round longer than the standard
  game's round at that date, the built-in opponents and stewards plan again at the
  standard cadence (`Match::try_advance_with`); seats played from outside keep their
  standing orders.
- The native policy no longer treats a public objective as a call to total war, counts
  lower research classes at their discount, orders more in a large realm (a tenth more for
  every region beyond ten, up to three times), builds household-goods works, and chooses
  among ten paths.

## 9. For agents

- Every brief packet carries `priorities`: what matters most now, most important first,
  each with why and an example order (food, the next programme step, an era to enter, a
  tradition to choose, idle research, scarce goods by home price, places to teach in, the
  household basket, order).
- `submit_turn` takes `delegate`: domains the built-in steward runs from then on, so an
  agent can decide only what it cares about.
- The briefing states how to win, the six steps with the next one marked, and the
  standings.

See [the agent API](../agent-api.md).

## 10. Calibration

`docs/calibration/ruleset3.1-eval.txt` holds the release batches. Under ruleset 3.0 the
same seeds gave no winner in 32 matches.
