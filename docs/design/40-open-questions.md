# 40. Seats, reconnaissance, intelligence and raiders: decisions to confirm

Companion to `40-seats-reconnaissance-intelligence.md`. Only real choices are listed, each
with the design's decision, the alternative and a recommendation. Items 1-4 should be
settled before slice 4b (seats and maps); items 9-12 before slice 8b (raiders); items 5-8
before slice 12b (intelligence); items 13-14 before doc 39's graph merge (slice 6b).

1. **Seat range and map presets.** Designed: 2-10 seats set at the start; presets Small 24
   regions (2-3 seats), Standard 48 (2-5), Large 96 (4-8), Huge 160 (6-10), keeping about
   12-16 regions per seat so doc 36's per-seat calibration carries over; 72 regions kept as
   a fixture. Alternatives: let any seat count play on any map (simpler setup, but a
   ten-seat Standard map gives under five regions each and a two-seat Huge map is mostly
   empty); or four presets of 24/48/72/120 (Huge then holds ten seats at 12 each, a more
   crowded world). **Recommendation: as designed.**

2. **Winner rate on large maps.** Designed: accept a lower all-AI winner rate as seats grow
   (Huge 40-65% against Standard's 55-75%), because more rivals form more coalitions;
   levers if Huge misses (bandwagoning subordination, federal accession) but never a longer
   horizon or a weaker G96. Alternative: hold every preset to 55-75% by stronger levers
   (for example a subordinate automatically bringing all its clients, or a longer horizon on
   Huge). **Recommendation: as designed**; a ten-way contest that sometimes ends without a
   winner is a legitimate outcome.

3. **Performance budget above Standard.** Designed: ≤ 150 ms p95 per round native with four
   worker threads on Large and Huge (≤ 300 / 500 ms single-threaded); WebAssembly ≤ 800 /
   1,200 ms (half with browser AI workers); Small and Standard unchanged. Alternative: keep
   150 ms native single-threaded and 400 ms wasm for every preset (would force cutting AI
   breadth or region detail on Huge). **Recommendation: as designed**; a human spends
   minutes on a round, and evaluation runs native with threads.

4. **Diplomatic counterparts with many seats.** Designed: keep three counterparts per round,
   five windows and ten envelopes per pair at every seat count; with six to ten seats the
   cap becomes a real partner choice (chapter 33 wanted that). Alternative: four
   counterparts on maps with eight or more seats (fewer rounds with no channel, at the cost
   of more negotiation work and a looser choice). **Recommendation: keep three**; revisit
   only if calibration shows many seat-rounds with no channel at all (target: under 30% on
   Huge).

5. **How foreign estimates behave.** Designed: every report carries a band that contains the
   truth only about nine times in ten, and a systematic bias per source class that does not
   average away over the years, so only a better or different source improves knowledge;
   reports refresh yearly; zero values never appear as an exact "none". Alternative: a
   simpler truth-centred band whose width depends on coverage (always contains the truth,
   easier to read, but violates chapter 06 and lets repeated yearly reports converge on the
   true value). **Recommendation: as designed**, and land the interim fix to today's
   estimate function with slice 4b.

6. **Scope of espionage.** Designed: agents are real qualified people who collect reports,
   give close sight of a region and carry research evidence (a capped discount on a
   technology the spying seat has already discovered); capture is a diplomatic incident and
   agents are held, not executed; there is no sabotage. Alternatives: add sabotage
   (destroying works, stealing stocks), or drop research evidence (spies only report).
   **Recommendation: as designed**; sabotage adds a destructive loop the AI and the
   conservation audit would both need to police, for little decision value beyond war.

7. **Deception operations.** Designed: bounded deception (shift a rival's report by at most
   its own band width and 50%, for 24 months, only while the rival lacks two strong
   independent sources; flagged as "conflicting" otherwise; exposed by any truth event; real
   costs). Alternative: concealment only (camouflage, secrecy), no false reports.
   **Recommendation: include, first on the cut list**; it is what makes diversifying sources
   worth paying for.

8. **Exact figures by treaty.** Designed: a `Transparency` clause (and mutual `Inspection`
   with the arms-control practice) gives referee-certified exact figures of the fields the
   sharer chooses; it is the only exact path to foreign numbers. Alternative: shared figures
   are the sharer's own claims, uncertified like diplomatic statements (no exact path at
   all). **Recommendation: as designed**; arms control and alliances need a verifiable
   option, and it is always the sharer's choice.

9. **Do raider camps count for world governance?** Designed: yes; a camp region is
   inhabited and must be governed (cleared, subjugated or integrated) before G96 can run.
   This is already what the victory code does (it counts every region with residents).
   Camps are gone from most worlds by 1900, and a survivor is one generation behind the
   leader and fights at 80%. Alternative: exempt camp regions from G96 (no late clean-up
   needed, but a world government could leave a hostile band inside its world).
   **Recommendation: count them.**

10. **When raiders arrive in the build order.** Designed: slice 8b, after military
    modernization, so camps use equipment generations from the start. Alternative: pull
    raiders forward before slice 7 using today's six tiers (the early-game pacing they
    change would be calibrated sooner; switching to generations later is a small change).
    **Recommendation: pull them forward** if early-expansion calibration (regions held per
    seat at 3000 BC and AD 1) is still being tuned; otherwise keep 8b.

11. **How fast raiders' arms advance.** Designed: their generation follows the median
    civilization's best fielded generation (with a ten-year lag), floored at the laggard's
    and capped one below the leader's, and they fight at 80% of it; their kit is a declared
    environment source that never reaches any seat. Alternatives: follow the leader minus
    one (harsher on laggards, closer to Civilization VI's pace in a runaway game), or follow
    the laggard (gentler, raiders become a nuisance only). **Recommendation: as designed**:
    "keeps pace with the world but cannot out-tech the leaders", as asked.

12. **Ways to deal with raiders, and their name.** Designed: clear by force (disperse the
    survivors, or subjugate them as your subjects), pay tribute (which feeds the camp),
    hire warriors as mercenaries, or integrate a camp peacefully over five years; in-game
    name "raiders" with "barbarians" as the plain label in the almanac. Alternatives: force
    only (simplest, closest to Civilization VI), or a neutral name such as "free peoples".
    **Recommendation: as designed**; mercenaries and integration are on the cut list if the
    native AI cannot use them well.

13. **A second real-Earth map.** Designed: `earth48` keeps serving 2-5 seats; a new
    `earth96` with twelve cradles serves 4-10 seats, built the same way from public-domain
    data, behind the cut line. Alternative: the real Earth only up to five seats; larger
    games use the generated planet. **Recommendation: build `earth96` only after the
    generated Huge preset is calibrated.**

14. **Technology ID clash between docs 38 and 39.** Doc 38 assigned T183 to the orbital
    tether; doc 39's draft assigns T183 to Fermentation and brewing and uses T183-T325. This
    chapter takes T330-T335 and C180-C183. Alternatives: renumber the tether (one node,
    referenced in doc 38 only), or shift doc 39's whole range by one. **Recommendation:
    renumber the tether to T326** before the slice 6b merge.
