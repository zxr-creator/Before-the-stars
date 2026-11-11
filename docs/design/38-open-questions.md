# 38. Cities, migration and transport: decisions to confirm

Companion to `38-cities-migration-transport.md`. Only real choices are listed, each with
the design's decision, the alternative and a recommendation. Items 1 and 11 should be
settled while slice 4 (Earth-like world) is still open; items 2-4 and 12 before slice
7b; items 5-8 before slices 9a and 9b; items 9-10 before slice 14.

1. **One city per region, or several.** Designed: each region has one named principal
   city plus an unnamed remainder of lesser towns; the city is derived from the
   region's residents (city + towns + countryside = residents), so it holds no separate
   population. Alternative: two or three named cities per region with their own shares
   (more realistic for country-sized regions, but more state, map clutter and
   calibration, and no new decision). **Recommendation: one city per region.**

2. **The settlement class moves from the region to the city.** Designed: Camp, Village,
   Town, City, Metropolis and Megalopolis describe the principal city (bounds 10 k /
   50 k / 250 k / 5 M / 20 M); `F_city`, urban mortality and the Classical era's built
   proof ("a Town of 50,000") key on it; slice 2's urban-share proxy is replaced and
   recalibrated in slice 9a. Alternative: keep the region class for the existing rules
   and give cities a separate ladder of names (no recalibration, but two "Metropolis"
   meanings on screen). **Recommendation: move it to the city.**

3. **Networks built per region or per link.** Designed: each transport line is built in
   a region with stages and levels; a link carries the lower stage and levels of its two
   ends. Alternative: build a railway or road on a specific link (more literal routes,
   but new link-level state, queues and quotes, and harder AI planning).
   **Recommendation: per region.**

4. **Transport costs.** Designed: realistic bills that are 4-10 times today's (a
   railway level: 150 kt of metal, 800 kt of materials, 60 kt of timber, 24 months),
   upkeep that rises with use (30% fixed), capacity by levels. Alternative: keep
   today's cheap bills and use only stages. Higher bills make networks a real
   investment decision, at the price of recalibrating construction budgets.
   **Recommendation: realistic bills, provisional, tuned so transport takes at most
   about a quarter of construction goods.**

5. **Metropolis targets and thresholds.** Designed: Metropolis 5-20 M, Megalopolis
   ≥ 20 M; by 2100 a civilization of 300 M or more has 2-6 metropolises, one or two of
   10-30 M, at most two megalopolises in the world; no city above a few hundred
   thousand before AD 1500 and none above 1 M before 1700. Alternative: Metropolis from
   10 M (fewer, grander markers). **Recommendation: as designed.**

6. **Default border policy and refugees.** Designed: borders are Selective by default
   (only qualified working-age people and their children, at most 0.1% of the
   population a year); Open and Closed are choices; free-movement treaties override;
   refugees from war, famine and epidemics cross even closed borders at half the rate.
   Alternatives: Open by default before the Modern era (porous historical borders), or
   closed borders that stop refugees entirely. **Recommendation: as designed.**

7. **Internal movement controls.** Designed: per region, Restrict (internal passports:
   outflow ×0.25, stability −2) or Encourage (land grants: attraction +1,500, paid in
   materials and tools per arrival). Alternative: no internal controls (migration is
   only a consequence of your other choices). **Recommendation: include; both have a
   real cost.**

8. **Strength of city defence.** Designed: urban bonus +5% to +35% by city class,
   fortifications +10% to +30% against older generations, total defender factor capped
   at 2×, capture after 5-8 months by city class, and starvation halving the bonuses in
   a sieged city. Alternative: a smaller cap (1.5×) and no extra capture months, if
   wars between peers stall in calibration. **Recommendation: as designed, with the cap
   and the capture months as the calibration levers.**

9. **Hidden transport visibility.** Designed: tradition works and late works
   (vactrain, suborbital express, automated stages) are listed in the public tree with
   masked requirements (doc 37 rule); only the orbital tether (new tier-9 node T183) is
   unlisted until the seat discovers its requirement; the interface relay is sealed
   with the jump content. Alternative: keep every work listed (no exception to the
   public tree) or unlist all late works. **Recommendation: as designed**; the one
   exception answers the request for transport "revealed only to seats that discovered
   it" without hiding the ordinary tree.

10. **Interface relay.** Designed: a sealed jump-tier freight link between two own
    regions, paid in lattice, helium and electricity; first on the cut list.
    Alternative: leave the jump technologies without any transport use.
    **Recommendation: include only if slice 17 has room; otherwise cut.**

11. **Ice lanes and natural harbours in worldgen.** Designed: `natural_harbour` (about
    35% of coastal regions) and `ice` sea links (polar and subpolar) are generated in
    slice 4 now, because both belong to the single `bts-worldgen/2.0.0` and cost little.
    Alternative: add them later with another generator version. **Recommendation: add in
    slice 4.**

12. **Supply reach for armies.** Designed: a formation's supply target falls with
    distance from friendly-controlled networks (1,200 bp per link into enemy land, the
    effect halved, floor 50%), so deep invasions need captured railways. Alternative:
    supply from the national stock regardless of distance (today). **Recommendation:
    adopt it**; it makes railways and sieges matter in war.

13. **Pipelines.** Designed: an Oil and gas pipeline line (crude, gas and fuel only,
    low loss, large capacity), third on the cut list. Alternative: no pipelines (fuel
    goes by rail and sea). **Recommendation: include, behind the cut line.**

14. **Retire the motor depot.** Designed: the 2.0 `depot` is folded into the motor
    highway stage (its fuel and spares become the highway's upkeep).
    **Recommendation: retire it.**
