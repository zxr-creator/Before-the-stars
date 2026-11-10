# Protocol contracts: written specifications and historical machine drafts

**The current rules design is v1.0; machine contracts have not been migrated.** Read the [v1.0 addendum](v1.0-design-addendum.md), [v0.4 migration](v0.4-changes.md), [v0.5 engine addendum](v0.5-design-addendum.md), [v0.8.1 diplomacy addendum](v0.8.1-diplomacy-addendum.md) and [agent protocol](../technical/02-agent-protocol.md). Knowledge, practices, courses and recipes are projected as known content and task qualifications. Complete graphs, cultural tendencies and private learning state stay isolated.

Material/energy/compute/transition records from v0.7, task validation/data provenance/observation periods/license details from v0.8, communication limits from v0.8.1 and v1.0 competition/population/native-AI requirements still need machine-field migration. Complete graphs are fixed within a content version; observations expose only actually known local subgraphs. Existing JSON files remain historical artifacts. Their human-readable strings have been translated into English without changing IDs, numeric values or protocol semantics. They must not be distributed as current seat contracts, especially their old cultural attributes and license payment fields. No schema or game implementation was added in this revision.

The remainder describes historical v0.2 format and validation, not compliance with current cultural secrecy, standing procurement, primitive starts or contracts.

[agent-v0.2.schema.json](agent-v0.2.schema.json) uses JSON Schema Draft 2020-12. Its root accepts observations, command batches, queries/responses, submission receipts or execution results. Endpoints must select the correct `$defs`; satisfying the root union does not authorize input at any endpoint. The `.invalid` domain in `$id` is a stable identifier, not a service address.

[agent-v0.schema.json](agent-v0.schema.json) preserves v0.1 and [agent-v0.2.schema.json](agent-v0.2.schema.json) preserves v0.2. All examples are v0.2, including historical culture attributes, religious population, objectives and project options. They are not valid current observations.

| Example | Type | Purpose |
| --- | --- | --- |
| [observation](observation.example.json) | Observation | Planning snapshot, partially known technologies/practices, registered population and reports |
| [command](command.example.json) | CommandBatch | Department budgets, prototype, paid investigation and known agenda |
| [negotiation](negotiation.example.json) | CommandBatch | A technology-license offer under a separate negotiation observation |
| [query](query.example.json) | QueryRequest | A known project-template query |
| [receipt](receipt.example.json) | Receipt | Sealing confirmation, not project success |

These are manually constructed protocol fixtures, not game outputs. Command references use the observation example; negotiation belongs to another phase whose foreign civilization must be visible in that phase's own observation. No example includes a private seed, complete graph or hidden parameter.

The all-zero `world_commitment` is a placeholder and proves no sealed world. Actual commitments come from a salted private referee manifest. The example remains nonreligious at month 96, demonstrating that religion does not automatically appear on a fixed turn; everyone must also begin without religion.

## Field conventions

- Quantities and amounts are nonnegative decimal integer strings to avoid JavaScript precision loss. The minimum currency unit is `milli_credit`. Engine types and rules impose additional bounds; syntax does not authorize arbitrary account values.
- Months, rounds and version counters are safe integers; ratios use integer basis points. `Estimate.range` includes its endpoints and requires lower ≤ upper.
- `*_ref` and entity IDs are opaque handles. Action IDs are unique within a batch; idempotency keys are unique within seat and match scope. A string alone proves no permission.
- If present, `Report.confidence_bp` is supplied by the reporter or calibrated from the seat's evidence, not a referee-provided probability based on secret truth.
- `EntityView` property keys come from a versioned public whitelist. They cannot carry private objects, executable scripts or undeclared fields.
- Historical schemas have no arbitrary extension fields. New fields require protocol revision and matching generated types. Display names and narrative strings are content, not enums or identity checks.
- Historical v0.2 exposed six cultural estimates that did not need to sum to 10000. That design was withdrawn in v0.3; do not extend it to eight public axes. Mutually exclusive cultural shares, religious shares and agenda shares still normalize within their own denominators. No formal religion is `religion_ref: null`; local belief participation is separate.
- Objectives use a generic currently known view, without ultimate-goal placeholders, hidden stage counts or future type enums. Project `choices` select legal slots/options from known templates and cannot specify arbitrary effects.

## Schema versus semantic validation

Schemas constrain fields, types, ranges, phase-legal actions, treaty types and receipt shape. The referee additionally checks reference permissions, unique action IDs, duplicate array entities, chronology, intervals, population shares, charter shares, signatures, custody, budgets, capacity, project states and other rules.

Do not replace visible submission checks with full-world legality checks. Hidden conditions produce feedback only through actual execution outcomes; see [information rules](../design/06-information-and-history.md) and [protocol semantics](../technical/02-agent-protocol.md).

Passing a historical schema proves format compatibility only. Standard validator integration, current Rust/TypeScript type generation, endpoints and cross-language consistency remain P0 work. New acceptance cases include cultural-axis leakage, rolling budgets, in-kind obligations, partial acceptance, diplomacy limits and current competitive authority.
