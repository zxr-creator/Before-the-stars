# Hash seeds and world generation

Create original, replayable worlds with geographical causality and without requiring perfect symmetry. Generate resource and transport constraints before social starting states. The complete technology/culture graphs, dependencies, alternatives and discovery rules are identical in every match of the same content version. Seeds change the world, society and actual-event random streams, not the complete graphs. Terrain, naming, fictional religion and development history provide unfamiliarity; established physics does not change with the seed. Only the explicitly labeled, versioned FTL premise is fictional; variants and transitions follow [dynamic development](20-dynamic-development-v0.6.md).

## Algorithm choices

| Approach | Strength | Limitation | Project decision |
| --- | --- | --- | --- |
| Multiscale noise and terrain templates | Fast; controllable continents and archipelagos | Alone cannot guarantee drainage or resource correlations | Large-scale elevation foundation |
| Sample points, Delaunay/Voronoi graphs and basins | Natural adjacency, rivers, transport and regional aggregation | Depressions, degenerate geometry and boundaries need treatment | Logical geography and watershed foundation |
| Full tectonics, erosion and long climate simulation | More geological detail | Many parameters and high cost without assured strategic value | Simplified structural belts and rainfall constraints in v1.0 |

Multilayer noise can produce elevation and ecology; see the author's [Red Blob tutorial](https://www.redblobgames.com/maps/terrain-from-noise/). Geography should serve play rather than pretend to simulate the entire Earth; see [Mapgen2's tradeoffs](https://www.redblobgames.com/maps/mapgen2/). [Azgaar Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator) and [civ-atlas](https://github.com/guaner-334/civ-atlas) are research references for layered maps and separating data from rendering, not runtime dependencies. The chronicle reference is Civilization, as specified in [34](34-art-interface-and-chronicle-v1.0.md).

## A seed is not a secrecy mechanism

Publishing a seed that reconstructs the world lets players rebuild resources, hidden quality and initial knowledge externally. The complete graphs depend on content version, not seed secrecy. Objectives and discovery rules do not switch to randomly different graphs. Hashing is not encryption, and a hashed short password remains enumerable. Competitive matches use a high-entropy root held by the referee; public development/practice fixtures may disclose replay seeds.

Conceptual specification:

```text
seed_input = normalized UTF-8 label and explicit scenario parameters
root_key = HMAC-SHA256(server_entropy_256, canonical(seed_input, versions))
layer_key = HMAC-SHA256(root_key, canonical("bts-layer", layer_name))
draw = HMAC-SHA256(layer_key, canonical(entity_id, month, event_kind, draw_index))
```

`canonical` is a versioned, length- and type-delimited encoding, not string concatenation. Freeze normalization, integer byte order and rejection-sampling rules. Save the root, input and versions together. The same label with different server entropy is not the same replay world. Complete replay credentials include the entropy or equivalent root and are withheld from seats before the match.

Derive separate streams for terrain, geology, climate, religious-emergence opportunities, initial population/culture, actual experimental errors, names and decoration. Complete knowledge/practice graphs and terminal dependencies use no draw stream; discovery and acceptance read real evidence through fixed rules. Adding a decorative tree must not change research results. A public decorative seed comes from an independent source and contains no unknown geography. Visible handles do not encode secret node names or order.

At opening, publish a salted commitment to the private manifest covering the world root, terminal conditions, generator and rules versions. Authorized post-match auditors receive the manifest and salt to verify that the referee did not change the world or objective. A commitment establishes consistency, not fairness or absence of side channels.

## Generation pipeline

1. **Logical base map:** a finite planetary map with east–west periodicity and separate polar handling. Stratified jitter or blue-noise samples build geometry without extreme density variation. Integer coordinates and stable tie-breaking resolve duplicate points and degenerate triangles.
2. **Land, sea and elevation:** templates constrain continents, straits and inland seas; multiscale noise adds local variation. Mountains follow simplified structural belts. No per-pixel geological-age simulation is required.
3. **Climate:** latitude, altitude, ocean distance and simplified prevailing winds determine temperature and rainfall, including rain shadows. Iteration counts are fixed, never determined by machine runtime.
4. **Drainage:** identify genuine closed basins; use priority-flood overflow paths for other depressions, then calculate flow direction and accumulation. Preserve lakes. Rivers reach the sea or plausible inland endpoints, without meaningless noise-driven loops.
5. **Resources and agriculture:** soil and water create agricultural opportunities; geological belts create correlated minerals, quality and extraction difficulty. Do not uniformly scatter each resource independently or give one starting point every future critical material.
6. **Strategic regions:** aggregate watersheds, corridors, ranges and production areas. v1.0 uses 48 standard regions, 24 in development and 72 in stress fixtures. Rivers, ports, passes and straits create connections with cost and capacity. Fine visual detail does not add routine simulation entities.
7. **Settlements and starting state:** select food, water and development space. Establish gathering/hunting camps, precursors to villages and actual contact networks, not prebuilt cities, industry or modern treasuries. Briefly pre-run subsistence and reserves using ordinary rules without advancing later institutions. Own background records can be observed. Population, tools, food and maintenance stores must cover output-availability and minimum transport delays so phase order cannot create an inevitably fatal start.
8. **Culture and opportunities for religion:** livelihoods, contacts and work experience generate cultural starting profiles. Everyone initially has no religion. Generate future doctrine candidates, fictional naming grammar and ritual-gathering opportunities, but no existing religion, followers or pantheon. Opening pre-runs cannot cross this boundary.
9. **Knowledge and agendas:** load the same complete technology/practice graphs, alternatives and endgame template. Bind actual geography and starting state to their conditions, then check discovery and economic reachability. Initial observations contain only known directions and current agendas. If infeasible, modify or regenerate the world state; do not delete prerequisites or substitute an easier graph.
10. **Acceptance and sealing:** check drainage, survival food, connectivity, critical alternatives, knowledge-discovery chains and regional scope. Failures regenerate with a derived `attempt_index` and recorded reason. A maximum attempt count turns exhaustion into a generation failure, not an infinite wait or winner selection.

The hydrology reference is Barnes et al.'s [Priority-Flood paper](https://arxiv.org/abs/1511.04463). Distinguish overflow treatment from real closed basins before implementation; not every lake should be filled into dry terrain.

## Fairness, determinism and data

Fair starts require survival, multiple actions and at least one autonomous development route, not identical resources. Rotate seeds, seats and opponents to reduce map bias. Never redraw a lagging player's resources during a match.

A graph path proves only structural reachability, not affordable inputs, teachers, logistics or maintenance. Offline checks must start from real inventories and cover subsistence, rural surplus, city supply and at least one long-term capability route. Unconditional partner cooperation cannot be a survival prerequisite. An autonomous route may be slower and more expensive and need not make every final project cheap to complete alone. Observations with no religion, cash or cities must match the true start.

Authoritative branch conditions and data use fixed precision. Floating-point differences before final rounding may change topology, so rounding at the end is insufficient proof of cross-platform determinism. The first authority uses a canonical CPU generator and geometric predicates; saves include complete `WorldGenesis` and its hash. Cross-architecture regeneration must pass golden fixtures. Unsupported platforms load generated saves rather than claiming seed-level equivalence.

`WorldGenesis` contains geometry, elevation/drainage/geology, regional aggregation, doctrine-candidate grammar, nonreligious initial population/culture, complete-graph version references and checksums, private cognition and objective manifest, versions, attempt count and validation. Later founding events create actual religion definitions. `PublicWorldView` contains only known regions and learned attributes and never directly serializes genesis. Across seeds, canonical complete-graph digests must match; world state and visible subgraphs may differ. Lazy loading delays reading fixed content; it does not randomly choose content.

Routine global calculation occurs at the coarse regional/settlement level. Fine geometry is used for generation, occasional environment updates and rendering. Generation, independent candidate validation and batch matches use the CPU pool described in the [mechanism engine](../technical/03-mechanism-engine.md).
