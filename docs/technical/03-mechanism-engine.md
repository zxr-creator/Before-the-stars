# A mechanism-first deterministic parallel engine

Complete mechanism specifications before implementation. Depth comes from shared constraints, delays, feedback and interactions among actors. Numbers express units, rates, capacities and costs; mechanism-first does not mean parameter-free. Do not force a desired story with isolated bonuses or targeted penalties.

This chapter defines parallelism and determinism. The [monthly engine specification](07-monthly-engine-spec.md) defines subphases, actors, arbitration and cross-system timing; the [variable catalog](06-state-variable-catalog.md) defines ownership. [Population v1.0](../design/32-population-and-education-v1.0.md) replaces the earlier household, pregnancy and individual-readiness workload.

## Minimal mechanisms

| Primitive | Inputs and outputs | Required property |
| --- | --- | --- |
| Transformation | Labor, materials and energy become products, capabilities or information | Inputs are actually consumed; the scarcest requirement bounds output |
| Movement | People, goods, knowledge or reports move along connections | Time, capacity and rights are required; source and destination cannot both own the same asset |
| Commitment | Signatures, budgets, custody and permissions create obligations | No double spending; text alone cannot create authority |
| Allocation | Competing claims on labor, funds, facilities and transport | Simultaneous settlement with reproducible conflict rules |
| Learning | Contact, experiments and observations update knowledge and culture | Evidence has provenance; unknown information cannot enter cognition directly |
| Maintenance | Facilities, organizations and networks sustain services | Lost inputs reduce capability without instantly erasing knowledge |

Overextension should arise from longer transport, maintenance, local collection and insufficient cooperation, not a territory-rank penalty. Research-oriented culture should act through enrollment, experiments and transmission, not a second final research multiplier.

## Every mechanism needs a contract

State its reads, who knows what, who may act, inputs and outputs, delays, conflicting resources, failure feedback, conservation, feasible responses, and which strategy changes if the mechanism is disabled.

Tune in this order: causal structure; resource and authority constraints; information and timing; then rates and costs. Large coefficient changes cannot hide a missing response. Check conclusions across parameter ranges; a mechanism that works only at one precise combination is not stable.

Do not build the full game before D0. Paper accounts, transition examples and protocol fixtures must close food/population, culture/occupation, knowledge/equipment, trade/substitution, conquest/governance and objective revelation. A closed design still requires prototype attempts to falsify its emergent claims.

## CPU multicore is foundational

The Rust authority must have real parallel paths within a match and across matches. A single-thread reference supports correctness and constrained platforms but cannot be the only implementation. Rust Rayon is the initial task-pool candidate; see its [official documentation](https://docs.rs/rayon/latest/rayon/). Race freedom alone does not guarantee numerical determinism.

Assigning one thread per system is insufficient: production, trade and research share inputs, making submission order matter. Each month crosses fixed phase barriers, with this protocol inside a phase:

```text
read-only phase snapshot
  -> parallel region/facility/group intent and demand calculation
  -> construct conflict components from shared resources
  -> arbitrate independent components in parallel, using fixed rules within each
  -> validate ledgers and commit nonoverlapping StateDelta records
  -> merge events by stable keys and create the next snapshot
```

An `Intent` contains phase, actor, requested resource keys, proposed changes, visible evidence sources and stable ordering keys; it holds no writable global object. A `StateDelta` carries a prerequisite version and conservation checks. Event IDs derive from stable logical keys rather than thread completion order.

Labor pools, one treasury, cross-region contracts and grid capacity connect regions. Administrative partitioning cannot let each partition independently debit a shared account. Large conflict components still use stable batch allocation rather than arrival races. Global ordering provides reproducibility; public market/budget rules determine economic priority, so small IDs do not always win.

In-kind construction, wages, monthly procurement, education, recruitment, mine commuting, joint research and custody all enter the same demand graph. A project and its contributor cannot simultaneously retain transferred funds. Teachers, students and soldiers cannot each consume the same person's full working time in different systems. Monthly budgets reserve on a rolling basis; an annual ceiling is not cash. Treaty expiry, cultural drift and governance duration use absolute simulation months.

## Parallel work and synchronization

| Work | Parallel unit | Synchronization requirement |
| --- | --- | --- |
| Terrain, climate candidates and validation | Logical blocks or candidate worlds | Drainage, boundaries, connectivity and final acceptance |
| Facility demand and capacity | Facility batches | Labor, inventories and service competition |
| Regional markets | Independent clearing markets | Multiple orders on one account and cross-region reservations |
| Population and culture | Group change proposals and local lineages | Arriving migrants, population conversion and service capacity |
| Research and experiments | Projects | Instruments, talent and compute allocation |
| War | Theaters without shared formations or supplies | Inter-theater movement and shared logistics |
| Observation and history | Seats and committed snapshots | Permission filtering, stable ordering and snapshot pagination |
| Evaluation | Complete matches | Within-match barriers and external model budgets |

Future months depend on earlier months and cannot be computed concurrently as if independent. Merge small jobs into fixed logical chunks to reduce overhead; chunk identity does not depend on thread count. Respect available cores and resource quotas, leaving capacity for UI, services and model processes. Busy-waiting is not useful parallelism.

## Randomness and device equivalence

Address random draws by entity/event counters, never a shared sequential RNG. See Salmon et al.'s [Random123 paper](https://www.thesalmons.org/john/random123/papers/random123sc11.pdf). Statistical quality and cryptographic unpredictability differ. Secret world draws use the specified HMAC derivation; Philox's parallel suitability does not establish secret-key protection.

Authoritative reductions use integers/fixed point, explicit overflow behavior and stable remainder allocation. Floating-point atomic accumulation cannot determine prices, cultural thresholds or battle outcomes. Iterative solvers have fixed maximum steps, canonical tolerance and deterministic fallback; wall-clock time cannot select the last completed solution.

Random addresses represent real processes: experiments bind to the research question and paid trial; population flows bind to source and accumulated remainder; battles bind to their theater and actual formations. User-chosen action IDs, repeated proposals, split orders, split armies, renamed cultures and cancellation/rebuilding do not create extra draws. Trace control relationships for merged actors without exposing secret attribution to a player. Referee deduplication and player intelligence are distinct.

## GPU and NPU roles

| Device | Preferred work | Not a first-release responsibility |
| --- | --- | --- |
| CPU multicore | Rules, ledgers, graph operations, branches and batch matches | None |
| GPU | Rendering, heatmaps, batch numerical experiments and nonauthoritative previews; later evaluate exactly reproducible fixed-point kernels | Unverified general floating-point results deciding victory or inventory |
| NPU/Neural Engine | Optional supported local inference, text styling or analysis assistance | Arbitrary Rust execution, general economic settlement or mandatory identical NPU hardware |

Metal supports compute kernels, and Core ML can select allowed computing devices; neither is a universal acceleration switch. See [Metal calculations](https://developer.apple.com/documentation/metal/performing-calculations-on-a-gpu) and [Core ML performance analysis](https://developer.apple.com/documentation/coreml/analyzing-a-core-ml-model-s-performance-in-xcode). Freeze backends and dependency versions only after implementation measurements.

The first authoritative result always follows the CPU specification. GPU proposals need complete equivalence and determinism checks; merely proving a candidate feasible does not prove it did not omit a better candidate. Without equivalent validation, use GPU results only for display or offline analysis. NPU prose cannot write culture, objectives or historical truth. Disabling optional devices changes speed or presentation, not rules or hidden knowledge.

Competitive web matches run on the multicore Rust server. Offline WASM can detect worker support and fall back to one thread; local Mac authority uses multicore Rust. External agent computation budgets and in-game compute services remain separately accounted.

## Correctness and performance gates

The conflict graph includes trainees, military service, command/frontage capacity, simultaneous losses, contract milestones, held assets, population services and terminal windows. v1.0 aggregates fertility and health instead of maintaining per-person pregnancy/recovery objects. Apply direct battle deaths first, then combine other hazards over survivors; systems cannot independently kill the same person. An asset has one spendable location in the new state. Fixed numerical tables prevent platform floating-point differences from selecting population or behavior branches.

Observation size, settlement latency and throughput targets are in [feedback and RL](05-feedback-and-rl.md). They remain unmeasured targets. Do not accelerate by shortening culture/education time or skipping systems whose panels are closed. Preserve causal month order and determinism.

Replay identical scenarios with 1, 2, 4 and the available maximum threads. Phase hashes and terminal outcomes must match. Different scheduling and task delays cannot alter results. Test shared inventory, interregional migration, formations moving between theaters and projects competing for skilled workers, not just independent facilities.

Report single-match and batch throughput, CPU time, wall time, peak memory and phase shares. Use profiling to establish actual concurrent calculation and show benefit on a predefined meaningful workload. Do not promise linear speedup for a small 72-region game or inflate entity counts to manufacture a benchmark. Include transfer and scheduling overhead for GPU/NPU paths; leave them disabled if they provide no benefit.
