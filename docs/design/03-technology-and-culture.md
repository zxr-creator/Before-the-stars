# Dynamic Technology and Culture Trees

Each civilization has its own known technology and cultural-practice graphs. Within one `content_version`, the complete graphs are identical in every match: nodes, AND/OR prerequisites, discovery and unlock rules, practice-adoption conditions, and scientific/FTL assumptions are fixed. The seed cannot select, remove, or rewrite them. The authoritative backend uses the complete graphs; seat observations do not include them. Resources, initial traditions, problem clues, and feasible implementations differ between worlds. The dynamic elements are the visible subgraph, development priorities, and adoption history.

Version 0.5 developed this chapter into the [knowledge and culture engine specification](16-knowledge-and-culture-engine.md), which governs generation checks, state transitions, actual task units, practice adoption, and cultural experience. This chapter retains the principles for player experience, pathways, and dependencies. Version 1.0 clarification and corrections are in [31](31-knowledge-and-culture-v1.0.md); its rules take precedence.

The complete v0.6 content is in the [technology atlas](17-technology-atlas-v0.6.md), [cultural-practice atlas](18-cultural-atlas-v0.6.md), and [education courses](19-education-and-transmission-v0.6.md). The [dynamic-development specification](20-dynamic-development-v0.6.md) further defines scientific boundaries and local discovery, implementation, and adoption. Steam and diesel are transitional industrial traditions, not propulsion principles that upgrade directly into FTL.

## Three knowledge layers

| Layer | Content | Read access |
| --- | --- | --- |
| Fixed complete content graph | All versioned capabilities, recipes, AND/OR dependencies, discovery rules, and cultural-practice conditions | Developers and public rules; never directly mounted in a seat package |
| Match implementation conditions | Geography, resource quality, facilities, personnel, initial practices, and actual adaptation; references the fixed graph rather than generating another root graph | Authoritative backend and isolated developer tools; observable portions projected through actual sources |
| Civilization knowledge graph | Discovered directions, evidence, prerequisites, and understanding | The corresponding player; legitimately shared portions may reach partners |

With public source, models may already know the fixed graph or templates. Limited information comes from unknown match conditions, adaptation, and others' actions, not rewritten graphs or hidden basic action semantics. Discovery evaluations mount only the civilization's knowledge package; full development material stays outside the seat. Isolation cannot erase prior knowledge. Formal evaluation reserves world seeds and initial states not used for tuning and records whether participants know the rules catalog.

Materials and physics are consistent within a match. The same material cannot work unconditionally for one civilization and fail unconditionally for another. Differences arise from local processes, personnel, facilities, culture, and understanding. Transferable knowledge should therefore have intelligible cross-border value.

## Graphs and unlocking

The UI presents tree-like research paths; the engine uses fixed directed graphs with AND, OR, and conditional predicates. A technology may require several domains. All alternative prerequisites remain in the version; visibility and present feasibility are separate questions. Technology dependencies must be acyclic before release. Cultural splitting, fusion, and retreat are historical transitions: they neither alter fixed practice prerequisites nor force population movement into a one-way DAG.

Technology states are `unknown -> hinted -> discovered -> investigating -> understood -> prototyped -> adopted`. States do not replace capabilities: a civilization can still understand a technology after losing its factories. `adopted` means acceptance was achieved at least once; current coverage, capacity, and usable equipment are calculated separately.

Unknown nodes reveal no ID, name, count, path length, complete prerequisites, or final tier. `hinted` exposes only observable problems, such as impurities limiting the precision of transparent materials. `discovered` introduces a referenceable node ID, known conditions, and actionable research. Results may revise estimates or expose new directions, but cannot rewrite completed facts.

## Sources of discovery

- Production experience: actual output and qualified craftspeople expose recurring defects and improvement problems.
- Experiments: teams and equipment investigate visible problems; failure can narrow the feasible range.
- Observation: surveying, astronomy, disease investigation, and similar work require suitable instruments and methods.
- Trade and migration: products, equipment imports, moving craftspeople, licenses, and public exchange provide contact.
- Social change: literacy, occupations, fiscal scale, and cooperation disputes create demand for organizational practices.

Unconditional random cards are not the main discovery mechanism. Major breakthroughs require accumulated work and capabilities. Randomness mainly affects trial error, material batches, and the timing of clues. Fixed rules evaluate actual process conditions. Repeated queries do not reroll a fact.

Version 0.4 distinguishes insufficient evidence, missing complementary engineering inputs, and blocked adoption. Each requires different investment and negotiation. Population and GDP do not automatically produce research points. Science, education, energy, markets, and knowledge exchange create delayed feedback through actual inputs, checking, and adoption. Productivity can sustain development without population growth. See [population and development](12-population-and-development.md).

## Match generation

1. Load the fixed content version and complete graphs; verify their hashes. Scientific/FTL assumptions and all engineering paths are versioned.
2. Generate geography, deposits, quality, and connection costs. These affect costs and startup conditions, not nodes, edges, or OR options.
3. Apply fixed physical and adaptation rules to resource quality, environments, and equipment. Do not sample region-specific scientific laws. Players receive only information supported by known materials and experiments; cultural response relationships remain private.
4. Generate initial cultural profiles, organizations, knowledge, and real contact channels. Practice prerequisites and discovery rules remain unchanged. Check economic reachability under these conditions.
5. Check that each start has at least one feasible FTL path independent of a particular opponent's voluntary transfer, and that the world supports at least two paths with different cost structures.
6. Reject initial deadlocks such as inaccessible indispensable resources. Regenerate world conditions only. Cyclic prerequisites or inherently deadlocked discovery rules are content defects requiring a new content version, not seed-specific graph edits.
7. Create random handles unrelated to template names, initialize civilization knowledge graphs, and record the version and private seed.

Step 5 checks structural reachability, not guaranteed victory after war, bad investment, or disaster. Independent development can be much slower and more expensive; cooperation can improve efficiency. The check must include discovery and construction conditions, not merely graph connectivity.

The complete graph remains unchanged between and within matches of a version. Lazy instantiation caches fixed node templates, specific experiments, or local observations; it does not create nodes, prerequisites, discovery rules, or scientific assumptions. Outcomes follow world state, fixed rules, and the trial's random stream. A model taking the lead cannot make a previously valid route disappear.

## Development traditions and transitions

Punk traditions are accumulated equipment, skills, and organizations. Mixing and conversion are allowed. Established principles, unverified engineering extrapolations, and the final FTL fiction are labeled separately. A visual style does not justify physically unsupported infinite upgrades. Traditions confer no ancestry or civilization-name bonus.

| Tradition | Early/middle foundations | Capabilities that can deepen | Costs | Bridge to later systems |
| --- | --- | --- | --- | --- |
| Steam and pressure | Boilers, mechanical control, forming, centralized power | Pressure safety, turbines, heat recovery, precision machining | Water, thermal management, maintenance, large infrastructure | Qualified prime movers support generation, distribution, instruments, and retraining; then advanced materials and spaceflight |
| Diesel and combustion | Liquid fuels, engines, chemistry, mobile industry | Refining, chemical materials, generators, mobile repair | Fuel, emissions, catalysts, complex machinery | Electric control, precision manufacture, advanced materials, and orbital engineering; old engines retain suitable uses |
| Electricity and fields | Grids, motors, electrochemistry, electronic instruments | Reliable distribution, storage, semiconductors, precision control | Connectivity, conductors, storage, reliable supply | Computing, high energy, and spaceflight; electromagnetism itself does not provide FTL |
| Computing and intelligence | Digital computing, networks, automation, AI research | Validated design assistance, industrial control, automated experiments | Hardware, compute, data, power, validation | Supports real engineering and control; cannot reason free materials or unlimited efficiency into existence |

There is no recipe that burns coal directly into FTL. Steam and diesel traditions must acquire electrical, material, computational-control, and orbital capabilities. Their inherited assets retain value in a combined industrial system but cannot replace essential new capabilities. Every endpoint still depends on the explicit FTL fiction; the design does not claim a presently feasible real-world engine.

The provisional FTL implementations emphasize high energy throughput or precision control. They are different input arrangements under one fictional assumption, not two scientifically established FTL principles. Both require theory, materials, controls, energy, orbital manufacture, and trials. Neither requires an irreplaceable civilization-specific qualification.

## Example critical chain

`High-temperature furnaces and suitable feedstock -> transparent-material quality -> grinding and precision measurement -> optical instruments -> new observations -> new theory and industrial capability`.

Alternatives include importing optical glass, processing crystals, or developing reflective devices, each with its own process requirements. Widespread inexpensive ceramics may change the market and industrial scale for glassware. The engine must not encode the claim that China had no glass, or that a culture inherently cannot develop science.

Node parameters include evidence requirements, equipment, minimum material quality, research teams, monthly spending ceilings, milestones, application recipes, and potential social consequences. Social effects arise from changes to occupations and assets; there is no direct “steam culture dissatisfaction +10” effect.

## Culture graphs and population

Population carries culture. Each population group belongs to one composite cultural profile, which may contain several practices, such as language traditions, teaching methods, occupational prestige, and cooperation obligations. Civilization shares count the population in each profile. Shared practices can have separate overlapping coverage statistics, but those cannot be added to mutually exclusive profile shares.

`Profile share = actual population of that profile / actual civilization population`. The engine uses counts; display uses basis points and largest-remainder rounding so profile shares sum to 10000. Practice shares may overlap.

With a zero denominator, return an empty group list and show no population. Never divide by zero or retain obsolete shares. External reports must identify their registered or surveyed denominator rather than presenting omniscient counts.

The practice graph describes social methods that can be discovered, tried, and adopted. Knowing one does not make everyone accept it. Education, migration, occupational change, organization, inheritance, and lived outcomes drive adoption. Cultural change transfers actual people between relevant groups; a click cannot replace the whole country's culture.

Every practice specifies:

- Economic and organizational feasibility.
- Relevant populations and organizations, with reasons for support or opposition.
- Transmission channels, continuing inputs, and conversion-rate limits.
- Specific affected behavior rather than universal cultural bonuses.
- Persistence and retreat under suppression, interrupted resources, or institutional failure.

The eight internal tendencies and evolution rules are in [dynamic cultures](07-dynamic-cultures.md). Development includes agriculture, industry, and urban services. Full latent values and cross-system causal relationships are not projected to players. Religion is stored separately: there are no initial religions; movements, pantheons, and religions arise in some locations during play. Founding doctrine then remains fixed while adherent shares change. Religious mobilization records commitments from actual participation, not points exchangeable for arbitrary resources. See [religious origins](10-religion.md).

## Economic foundations and institutional adoption

Ideas may appear early; operating institutions need executable conditions. Early settlements cannot spend culture points to activate industrial capitalism, national welfare, or algorithmic administration.

| Institutional practice | Initial operational requirements | Declining implementation capacity |
| --- | --- | --- |
| Guild apprenticeships | Specialist craftspeople, stable surplus, training organization, product demand | Intake and training shrink; existing skills persist |
| Public basic education | Sustainable finance, teachers, schools, affordable withdrawal from family labor | Coverage falls; literate adults do not instantly forget |
| Capitalist production organization | Sufficient commodity exchange, accumulable productive capital, wage employment at scale, contracting and accounting | Firms close and financing/employment contract; a country label cannot preserve output |
| Industrial labor representation | Concentrated wage employment, organization channels, actual political or negotiating authority | Represented coverage falls; identity and organization may persist |
| Open research networks | Communication, research organizations, publishable results, and staff support | Exchange weakens; published knowledge may survive elsewhere |
| Algorithm-assisted administration | Administrative data, computing facilities, validators, continuing inference budget, explicit authority | Missing services revert to available human arrangements; errors remain attributable |

These are game-operational definitions, not claims of a unique historical classification. Adoption separates hard execution conditions from softer effectiveness conditions. Content configuration discloses only known thresholds. Failure reduces coverage and services instead of instantly returning society to a primitive state.

Referee feasibility does not mean the government knows all conditions. Discovered hardware and legal requirements can support planning; latent acceptance and transmission thresholds cannot become a public unlock checklist. Ideas can arise and fail through observable processes. Preflight validation must not answer private cultural thresholds.

Culture changes technology demand, talent flows, transmission, and adoption. Technology changes income, occupations, education, and cooperation, which subsequently change culture. Feedback has delays; same-month mutual bonuses cannot loop indefinitely.

## Generation and balance acceptance

- Check private-graph leakage through observations, errors, logs, client bundles, exported saves, and queries.
- No route may require a specific civilization name, permanent trait, or unique unrecoverable character.
- Experiments must produce decision-relevant evidence, not cosmetic versions of one path.
- Every tradition should have feasible strengths across several resource arrangements and weaknesses addressable through different investments.
- Evaluate independent development, imported knowledge, and mixed conversion baselines. Measure success and cost rather than forcing identical outcomes.
