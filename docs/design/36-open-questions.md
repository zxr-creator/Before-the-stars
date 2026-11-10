# 36. Ruleset 3.0: decisions to confirm

Companion to `36-ruleset-3-history-resources-trade.md`. Each item states the
decision taken in the design, the alternatives and a recommendation. Nothing here
blocks slice 0 (tooling); items 1-3 should be settled before slice 1, items 4-7
before slice 4, items 8-10 before slice 7.

1. **Horizon and round count.** Designed: AD 2500, 525 rounds (two-year rounds from
   1950). A won game ends around round 390-440. Alternatives: AD 2400 at exactly 500
   rounds (less slack after the expected AD 2280 win, which was the original
   complaint); AD 2500 with 2.5-year (30-month) late rounds, 470 rounds (dates fall
   on January and July). **Recommendation: AD 2500, 525 rounds.** The slack matters
   more than the round count, and the horizon is rarely reached in a won game.

2. **Late round length.** Designed: two-year rounds from 1950 to the end. A one-year
   floor would cost about 550 rounds for 1950-2500 alone. **Recommendation: keep two
   years**, with standing orders and monthly victory checks; G96 still spans four
   rounds.

3. **Reward formula.** Designed: `2 − (T − R)/(H − R)` with R = AD 1900, because
   `2 − T/H` compresses every win into 1.0-1.1. This changes how agent evaluations
   score wins. **Recommendation: adopt it**, and record R in the match.

4. **Starting population.** Designed: unchanged at about 240,000 per seat (keeps every
   crew and facility scale of ruleset 2.0). Alternative: 100,000-150,000 for a more
   literal neolithic start, which would require rescaling early facility crews.
   **Recommendation: keep 240,000.**

5. **World population scale.** Designed: about two billion at the peak (four seats,
   48 regions), large independent civilizations 200-900 million, the world winner
   1.5-2.5 billion. An Earth-like 8 billion would need about four times the land and
   food capacity per region and makes every late number larger without changing
   decisions. **Recommendation: two billion.**

6. **Culture and religion acting on productivity and fertility.** Designed: yes, through
   named practices and doctrines only, bounded and shown in the breakdown. This
   reverses the earlier "never multiplies" rule (chapters 30 and 32) as the user
   asked. **Recommendation: confirm**, including the four new doctrines (Sanctified
   Labour, Stewardship of the Land, Day of Rest, Fruitful Households) and the trade
   doctrine Merchant's Covenant.

7. **The one fictional material (interface lattice).** Designed: conditioned only at
   the three test nodes; used by jump assemblies and nodes; no substitute. It makes
   the test nodes strategic and gives small civilizations something to sell. It is
   also the first thing to cut if the native AI cannot handle it. **Recommendation:
   include it, behind the cut line.**

8. **Settlement medium.** Designed: a conserved trade credit (no endowment, no
   overdraft, same-month netting), earned by sales, spent on purchases, usable in
   treaty clauses; the domestic economy stays directed. Alternative: barter valued at
   market prices with a carried balance (equivalent in effect, but the referee
   invents the numeraire implicitly and treaties cannot pay in it).
   **Recommendation: trade credit.**

9. **Tariffs.** Designed: none, because in a directed economy the state is the only
   importer; embargoes, export bans, transit rights and blockades give the
   strategic levers. Alternative: tariffs collected from partners' sales into your
   market (a toll on the seller), which adds a lever but also an extra pricing
   layer. **Recommendation: no tariffs in 3.0**; revisit with transit tolls if play
   shows a need.

10. **Market visibility.** Designed: members of a market see price, volume and total
    supply and demand orders, never anyone's identity, orders, stocks or balance. In a
    two-seat market the aggregate equals the other seat's order. **Recommendation:
    accept** as public market data.

11. **Household energy.** Designed: not modelled (as in ruleset 2.0); the population
    consumes food, textiles, consumer goods and luxuries. Modelling firewood, coal and
    then electricity for households would add realistic demand and deforestation
    pressure but another basket line for every era. **Recommendation: leave out of
    3.0.**

12. **Independent peoples.** Designed: no non-player polities; unclaimed regions are
    empty until settled, and trade is only between seats. City-states would deepen
    markets but need their own economy and AI. **Recommendation: leave out of 3.0.**

13. **Stewards inside long rounds.** Designed: nobody acts inside a round except through
    standing orders available to every seat; a human may ask the steward to draft
    standing orders at a round boundary. Letting the steward act yearly for a human
    would be convenient but gives an advantage the native seats would then also need.
    **Recommendation: keep acting only at round boundaries.**

14. **Quick mode.** Designed: same dates and rules, half the rounds (230), longer steps.
    Alternative: a shorter calendar (for example starting in 3000 BC) with the same
    steps. **Recommendation: half the rounds**, so all rates and calibration are
    shared.
