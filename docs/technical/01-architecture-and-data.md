# Architecture and Core Data

Rust implements authoritative rules; TypeScript provides the interface and integration layer. Every platform shares one ruleset, content version, and protocol. Clients must not implement alternative economic or combat settlement.

The [state-variable catalog](06-state-variable-catalog.md) defines detailed field semantics and the [monthly engine](07-monthly-engine-spec.md) defines phase reads and writes, subject to v1.0 population and competition overrides. The type examples below preserve early architectural intent, not a complete current domain model. For example, `age_band` cannot replace the population model's aggregate age distribution, and a short `Army` declaration cannot replace training, supply, command, and casualty accounting. v1.0 removes unnecessary demographic cross-products rather than simulating individual people.

## Module boundaries

The following is a planned directory structure; implementations have not been created:

```text
crates/
  bts-core/          Time, IDs, ledgers, random streams, events, world state
  bts-content/       Fixed complete graphs, discovery rules, validation, versions
  bts-worldgen/      Private seed, geography, hydrology, initial state, manifest
  bts-compute/       CPU task pools, stable merges, optional acceleration
  bts-sim/           Economy, population, knowledge, politics, diplomacy, warfare
  bts-observation/   Permissions, knowledge projection, reports, history queries
  bts-protocol/      DTOs, validation, protocol version, generated types
  bts-server/        Authoritative rooms, phases, authentication, idempotency
  bts-gateway/       Seat-isolated gateway and knowledge-package projection
  bts-runner/        Headless matches, native AI, replay, evaluation
  bts-wasm/          Offline sandbox and non-secret client computation
apps/
  web/              TypeScript map, panels, history, human controls
  desktop/          Mac shell and local referee process
packages/
  agent-sdk/        TypeScript protocol client and budgeting tools
  protocol-types/   TypeScript types generated from protocol contracts
  agent-cli/        Command line for native external-agent operation
  agent-mcp/        MCP tools over the same protocol
content/
  templates/       Technology, culture, recipes, projects, military roles
  scenarios/       Map scale, calendar, victory conditions, initial state
  balance/         Versioned parameters and experiment configurations
```

The Rust core is independent of browsers, networks, and model providers. The TypeScript SDK submits the same legal actions available to humans. Model adapters run in separate processes and connect through the protocol; they do not mount referee saves, private seeds, or debug ports. Native non-LLM AI likewise receives only its filtered observation and standard commands, never direct `WorldState` access. Difficulty changes bounded planning, not resources or permissions.

Multicore CPU execution is a core acceptance requirement: stage snapshots, parallel intent calculation, conflict-component arbitration, and stable commit are specified in [the parallel engine](03-mechanism-engine.md). Harbor is a replaceable isolation and evaluation wrapper. [Agent integration](04-native-agents-and-isolation.md) defines native CLI sessions and multiplayer scheduling; these do not enter Rust economic rules.

Browser-local sandboxes may run WASM simulation. Official multiplayer and model evaluations keep secrets exclusively in the server-side Rust referee. Mac reuses the web interface; select the desktop shell during that stage, initially evaluating Tauri. Packaging choices must not change core formats.

## Time, numbers, and randomness

- `SimMonth` and `RoundIndex` are nonnegative integers within JavaScript's safe integer range. The candidate v1.0 standard is 12 months per round and `H = 2880` months/240 rounds for all seats. A 960-month/80-round setup is a development fixture. No era-adaptive or per-seat calendar is permitted.
- Rust stores money, inventory, people, and cumulative work as fixed-point integers. Configuration defines the smallest unit of each quantity; intermediate multiplication uses sufficient width and checked overflow.
- Every quantity outside JSON's safe integer range travels as a decimal string. TypeScript uses `bigint` or an explicit fixed-point library, never conversion to `number` before arithmetic.
- Ratios use basis points `0..10000`. Ledger rounding, proportional-allocation remainders, and monetary precision have one canonical rule.
- Random outcomes derive from the private seed, subsystem, canonical real process, simulation month, event kind, and occurrence index. Renaming or splitting a research program, population flow, or battlefield cannot obtain a new draw. Identical inputs replay identically.
- Parallel work computes independent proposals; stable entity ordering governs merge and commit. Thread scheduling and network arrival cannot affect results.
- Authoritative world generation uses a canonical CPU path and fixed geometric predicates. Quantizing floating-point output alone cannot ensure identical topology. Save and verify the complete generated world. Cross-architecture regeneration must pass golden fixtures; otherwise that platform loads the saved world. Floating-point display layouts do not affect rules.

Developer rule packages contain templates and algorithms. Official seats receive only their current knowledge projection, while known action semantics remain public. Within a content version, the complete technology graph, culture graph, discovery conditions, and endgame templates are identical every match. Seeds do not rewire dependencies or randomly remove branches. The referee loads the fixed catalog; saves retain its version/hash, local adaptation, civilization knowledge, and victory contract. Public SDKs do not export the complete catalog. Visible IDs are opaque handles that reveal no template name, tier, or seed.

## Historical Rust domain sketch

These are historical semantic sketches, not complete field contracts or directly compilable modules. Indexing, ownership containers, and serialization derive in P0. Internal structures must never serialize directly to players. Implementation must follow the current state catalog, population, warfare, contracts, victory, and v1.0 overrides rather than copying a sketch and silently omitting state.

```rust
struct WorldState {
    versions: VersionSet,
    month: SimMonth,
    round: RoundIndex,
    calendar: Calendar,
    civilizations: EntityStore<Civilization>,
    regions: EntityStore<Region>,
    connections: EntityStore<Connection>,
    cohorts: EntityStore<PopulationCohort>,
    culture_versions: EntityStore<CultureProfileVersion>,
    religious_movements: EntityStore<ReligiousMovement>,
    religions: EntityStore<ReligionDefinition>, // Empty initially; core fixed at founding.
    organizations: EntityStore<Organization>,
    facilities: EntityStore<Facility>,
    inventories: InventoryLedger,
    money: MoneyLedger,
    potential_knowledge: PrivateKnowledgeGraph,
    potential_culture: PrivateCultureGraph,
    knowledge: PerCivilization<KnowledgeState>,
    objective_knowledge: PerCivilization<ObjectiveKnowledge>,
    private_objectives: PrivateObjectiveGraph,
    victory_contract: PrivateVictoryContract,
    genesis: PrivateWorldGenesis,
    projects: EntityStore<Project>,
    treaties: EntityStore<Treaty>,
    armies: EntityStore<Army>,
    event_log: EventStore,
    private_rng: RandomStreams,
}

struct PopulationCohort {
    id: CohortId,
    location: PopulationLocation, // Region or transit.
    people: People,
    age_band: AgeBand, // Historical shorthand; current aggregate model takes precedence.
    skill_profile: SkillProfileId,
    economic_role: EconomicRoleId,
    culture_profile: CultureProfileId,
    religion: Option<ReligionId>, // Initially None; propagation governs conversion.
    legal_status: LegalStatusId,
    household_assets: AssetAccountId,
    organization_memberships: Vec<OrganizationId>,
}

struct TechnologyNode {
    id: PrivateNodeId,
    prerequisites: RequirementExpr,
    discovery_rules: Vec<DiscoveryRule>,
    stages: Vec<ResearchStage>,
    effects: Vec<CapabilityOrRecipeEffect>,
    adaptation: PrivateAdaptationParameters,
}

struct KnowledgeState {
    visible_handles: HandleMap,
    leads: Vec<Lead>,
    learned_nodes: Map<PrivateNodeId, Mastery>,
    evidence: Vec<EvidenceId>,
    licenses: Vec<TreatyId>,
}

struct CulturalPractice {
    id: PrivatePracticeId,
    intellectual_prerequisites: RequirementExpr,
    adoption_requirements: RequirementExpr,
    adopters: CohortSelector,
    diffusion_channels: Vec<Channel>,
    behavior_effects: Vec<BehaviorEffect>,
    transition_limits: AdoptionRates,
}

struct Project {
    id: ProjectId,
    sponsor: OrganizationId,
    site: RegionId,
    template: ProjectTemplateId,
    milestone: u32,
    work_done: WorkUnits,
    commitments: Vec<ResourceCommitment>,
    monthly_budget: Money,
    staffing: Vec<StaffAllocation>,
    compute_allocation: Option<ComputeAllocation>,
    evidence: Vec<EvidenceId>,
    status: ProjectStatus,
}
```

## Entities and required semantics

| Entity | Required fields and meaning |
| --- | --- |
| Civilization | Original seat, controller, current government, institutions, sovereignty qualification, treasury, knowledge references |
| Region | Geography, deposits, ecology, facilities, population references, legal sovereignty, military control |
| Connection | Endpoints, transport/communication months, capacity, access rights, maintenance, risk |
| Organization | Type, accounts, assets, members, action permissions, objectives, behavior parameters |
| Faction | Organizational coalition, actual power sources, demands, known support, trust, mobilization |
| Facility | Owner, operator, region, recipe, equipment, capacity, maintenance, staffing requirements |
| ProductSpec | Category, material tags, quality, smallest unit, shelf life, transport properties |
| InventoryEntry | Product, location or transit, owner, quantity, reservation, associated contract |
| CultureProfileVersion | Private version/lineage, eight tendencies, practices, experience summary; population shares aggregate from population records; never serialize hidden attributes or causes |
| CulturalMemory | Short reactions, long norms, shock clusters, rolling drift allowance, transmission sources aggregated by actual experience; split/merge does not reset them |
| SettlementNode / LandUseAccount | Settlement and hinterland group, residents, services, local access; land rights, use, conversion, ecological obligations |
| EducationProgram / SkillDistribution | Teachers, students, qualification, hours, premises, materials; real skills/training records without double-counting people |
| StandingMarketPolicy | Actual controlling authority, known products/locations, monthly quantity/price or inventory targets, budget, expiry, generated orders |
| AcceptanceMilestone | Agreed deliverable, verifiable test, conditions, deadline, payment, dispute status |
| Custody / Pledge | Real custodian, location, uniquely reserved assets, fees, duration, committed enforcement rights |
| ResearchProgram / ControlLineage | Actual research question/trials; organizational control and liability lineage preventing redraws or debt evasion through new IDs |
| GovernanceObligation | Governance duties for residents, disorder, displacement, and regions; closure requires actual resettlement/service evidence |
| Aggregate population and access | PopulationBlock with 81 annual age cells, AccessPool, nine-month birth-intensity history, LocalHealthState and actual assignments under v1.0; no individual household, fertility-exposure or pregnancy/recovery objects |
| HealthBurden | Nutrition, disease, care; combined mortality deducted once, with prisoners and wounded remaining in population accounts |
| TrainingCohort / CommandNetwork / Battle | Unique personnel, qualifications, command capacity, fronts/output, casualty attribution |
| ContractObligation / Custody / Claim | Obligations, actual custody assets, delivery/settlement, outstanding claims; closure never deletes debt |
| FtlCapabilityAudit | Standard tasks, actual military-wide capacity, manufacture/replacement, 24-month record, trial evidence; private until revealed |
| MetricView / TrainingTransition | Seat metrics with source/time/coverage; training reward and critic state isolated separately |
| ReligiousMovement | Origin, organization, participants, pantheon, mobilization reserves, founder training |
| ReligionDefinition | Founding event, original name, origin, core beliefs; fixed after founding |
| ObjectiveKnowledge | Known objectives, evidence, current agenda; no undiscovered node IDs |
| PrivateVictoryContract | Complete end conditions fixed at setup, salt/commitment, per-seat reveal records; one winner only |
| Report | Content, source, observation month, receipt month, estimate kind, known reliability, evidence references |
| Treaty | Immutable clause versions, participants, signatures, custody, liabilities, activation/breach events |
| Army | Owner, location, role counts, actual equipment tier, supply, readiness, orders |
| Event | Kind, month, entities, state delta, input source, decision references, visibility |
| Observation | Observation ID, seat, round, knowledge version, filtered reports/visible objects |
| NativeControllerState | Difficulty/version, separate policy seed, legal memory, work budget, commitments; no referee secrets |

`RequirementExpr` is referee-internal. Even a visible node exposes only discovered conditions, never its full expression tree.

A population group may belong to multiple organizations, but counts once in economic and cultural denominators. Overlapping members cannot supply duplicate labor or votes. Voting follows the institution's explicit eligibility registry.

## TypeScript transport principles

```typescript
type Amount = string; // Nonnegative decimal integer; field/ProductSpec declares unit.
type EntityRef = string; // Opaque, seat-projected handle.
type BasisPoints = number; // Integer 0..10000.

type Estimate =
  | { kind: "exact"; value: Amount; unit: string }
  | { kind: "range"; lower: Amount; upper: Amount; unit: string }
  | { kind: "unknown"; unit: string };

// Agent protocol and contracts/v0.4-changes.md define semantics; schemas await migration.
// WorldState, private graphs, and random seeds are never public SDK export types.
```

Rust DTOs, JSON Schema, and TypeScript types must be generated from one definition or automatically cross-checked. The v0.1/v0.2 schemas and fixtures are frozen historical drafts and cannot be supplied to current official seats. P0 migrates the written contract and selects generation tools; it does not prematurely pin third-party versions.

## Persistence and history

Authoritative saves contain versions, initial content, private seed, complete checkpoints, committed commands, and events. Each checkpoint has a stable state hash; events retain before/after verification evidence. Restoring replay does not rerun model calls, charge them again, or redraw committed random events.

Player exports include only their legal records and observations. Ordinary save APIs never download authoritative saves. Postgame declassification requires separate administrator permissions. Cached historical summaries key by seat, knowledge version, and query range; secret results cannot be reused across seats.

The human chronicle follows a Civilization-style illustrated historic-moment timeline with evidence drill-down. Its summaries derive from authorized events and add no era-score or chronicle-farming reward. civ-atlas may inform map generation, not the chronicle's presentation direction.

## Deployment and execution

GitHub holds source, content, design, checks, and releases. The static web client can be hosted independently; online matches require a separate Rust authoritative service. Mac can start a local referee process and web shell. Formal evaluation still isolates model files from referee files.

Start with versioned local files and event logs; add a database only when scale demands it. Start networking with single-room HTTP and phase polling. Push updates are an interaction optimization, not different phase semantics. Model credentials belong in the runner or server configuration, never embedded in the web client.

The standard match contains four civilizations and one to four externally controlled seats. Native Easy/Medium/Hard AI fills remaining seats through the same gateway. An all-AI evaluation is a controller configuration, not a cooperative or zero-player victory mode. The sole winner must meet actual global control and military-wide FTL acceptance.

## Automated acceptance properties

Determinism, nonnegative inventory, no budget reuse, population/culture conservation, world-generation reachability, secret isolation, exact-version treaty signatures, disconnect recovery, and replay identity are release gates. Benchmark the real prototype before selecting execution budgets; do not hide performance problems by dropping essential rules. Native AI planning budgets must remain deterministic and bounded independently of render quality or external-model latency.
