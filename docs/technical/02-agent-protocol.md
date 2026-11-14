# Agent Protocol

> **Next-design override (2026-11-13):** use
> [FTL-only completion](../design/15-victory-and-ftl.md),
> [one agent decision contract](../design/43-agent-access-and-decision-packets.md),
> and [automatic institutional education](../design/44-institutional-education.md)
> where this historical specification differs. The current ruleset-3 calendar is
> described in chapter 42; old 240-round figures are historical fixtures. These
> changes require implementation and versioned migration.

The written protocol uses v0.4 as its baseline with v0.5, v0.8.1, and v1.0 additions; it is not implemented. Humans, scripts, native non-LLM AI, and external models use the same observations and actions. Model names do not affect world rules. v0.1/v0.2 schemas and JSON examples are frozen historical drafts; the v0.3 migration is also incomplete. This revision changes no implementation or machine contract. See [v0.4 changes](../contracts/v0.4-changes.md) and [v0.8.1 diplomacy](../contracts/v0.8.1-diplomacy-addendum.md). Current phases/actions are incompatible with old schemas. P0 must freeze a new protocol version; old schemas cannot authenticate current seats or support claims of a working SDK.

v0.5 adds projections for monthly operation, standing sales, wage advances, and concrete work units; see [the interface addendum](../contracts/v0.5-design-addendum.md). It retains these actions, but fields await machine contracts. Rule and protocol versions are frozen separately.

The complete technology, culture, and education catalogs remain referee-only. Every match under one content version loads identical complete graphs, prerequisites, and discovery rules. Seeds do not delete or rewire them. Observations project actual local knowledge and implementation conditions. Known nodes, courses, task qualifications, study/practice, and performance follow existing permissions. Do not expose candidate IDs/counts, learning-direction vectors, true readiness, future courses, or hidden adoption conditions. Prototype research, courses, retraining, and institutional trials use existing project/policy actions, never direct knowledge or culture setters; see [dynamic development](../design/20-dynamic-development-v0.6.md).

Production/transition feedback distinguishes known recipe versions/specifications, available/pending/in-transit stocks, energy-service grades, personnel qualifications/hours, construction stages, maintenance, and received cash. Known mechanical conditions and real quotes can be explicit. Preflight cannot enumerate unknown adaptations or future variants. AI compute service includes task specifications, hardware compatibility, and device-hours, not a universal intelligence score. Six technology families summarize known capabilities only; see [industrial development](../design/23-industrial-development-v0.7.md).

Late-game observations add known use scope, human baselines/actual rework, model versions/disclosed evidence, license layers, observation periods, and isolated batches. Investigators use only information they acquired; independence checks cannot query hidden model provenance. Original scoring seats are fixed. In-game AI copies create no new player sessions or RL trajectories. [The historical walkthrough](../design/27-first-game-mental-model-v0.8.md) contains endpoint knowledge and must not become an exploration opening prompt.

v1.0 standard matches have four total civilizations, one to four externally controlled human/LLM seats, and native Easy/Medium/Hard AI filling the rest. Every official configuration is single-winner competition. All use 12 simulation months per decision round and the candidate horizon `H = 2880` months/240 rounds. A 960-month/80-round setup is a development fixture. Actual loss of sovereignty removes corresponding command permissions; disconnecting does not transfer sovereignty. [Chapter 33](../design/33-competition-and-native-ai-v1.0.md) governs controller and authority transitions.

## Endpoints

[Diplomatic communication](../design/29-diplomacy-communication-v0.8.1.md) defines counting, mutual selection, windows, exemptions, and multiparticipant signatures. Each pair shares ten envelopes per round; each seat selects at most three peers. All interfaces, models, and subprocesses share the original seat's ledger. In a four-civilization world, three peers includes all opponents.

| Method and path | Purpose | Permission/phase |
| --- | --- | --- |
| GET `/v1/matches/{match}/observation` | Current immutable observation | Bound seat only |
| POST `/v1/matches/{match}/query` | Visible entities, reports, history, knowledge, own budget | No time advance or free exploration |
| POST `/v1/matches/{match}/commands` | Contact, negotiation, or plan batch | Current phase and sealing rules below |
| GET `/v1/matches/{match}/receipts/{key}` | Submitted batch status | Original submitting seat only |
| GET `/v1/matches/{match}/events?cursor=...` | Newly learned events | Seat-filtered pagination |
| POST `/v1/matches/{match}/forecasts` | Seal event-probability forecasts | Optional evaluation; no game reward change |

Authentication uses local-process or server seat tokens. Body `seat_id` must match the token. Omniscient administrator tools live behind a separate boundary, never `debug=true`.

## Observation

An observation contains versions, match/seat IDs, simulation month, round, phase, negotiation window, knowledge version, public-rule summary references, and permitted treasury, inventory, cultural-population reports, faction summaries, visible projects, known nodes, leads, and reports.

Diplomacy adds own `selected_counterparts`, mutually selected `active_channels`, `pair_used / pair_remaining`, current `send_permits`, own sent/in-transit/received messages, known proposals, and registry facts. Other peers' lists, unarrived bodies, and unarrived proposal/signature states remain private. Pair channels/allowances are permitted scheduler metadata, not world delivery. Claims, relays, attachment provenance, and authenticated facts remain distinct. No internal `is_lie` flag is exposed.

Fields include `cultural_profiles`, `known_religions`, `religion_population_reports`, `known_objectives`, and `active_objective_refs`. Cultural profiles contain names, population coverage, observed practices, and sourced descriptions/surveys, not the internal eight-dimensional values—even labeled estimates. `religion_ref = null` means no formal religious affiliation; local belief participation is separate. Initially religions are empty and everyone is unaffiliated. Culture and religion are separate distributions, not additive populations.

`known_objectives` contains only revealed generic views, without complete objective enums, hidden stages, or empty endpoint slots. `public_rules_ref` links to the seat's permitted summary, never this repository's README or omniscient manual. Concrete craft improvements may appear before scientific method; abstract technology-development agendas may not.

`known_technologies` and `known_cultural_practices` include discovered nodes only. Unknown directions appear as `leads`, never latent node IDs. `known_requirements` is a readable list of acquired conditions, not the true complete prerequisite graph. `available_actions` lists generic actions legal in the phase, not invisible targets.

Known requirements may include materials, facilities, legal authority, and signatures, but not hidden cultural acceptance thresholds or their `satisfied` truth. `known_effects` covers known physical outputs, capabilities, and committed rights. Social explanations are sourced reports with scope, not rule guarantees. Geography, resources, technology, education, economy, warfare, and religion's causal effects on culture remain private.

Cash means current usable public treasury, excluding others' assets and forecast future income. Inventories include only verifiable holdings. Population reports include coverage and dates; incomplete registration is not nationwide true population.

`visible_entities` summarizes known regions, facilities, and project templates; queries retrieve detail. Public rule packages declare allowed `EntityView.attributes` keys, units, and meanings by entity type. Never insert internal objects or unfiltered arbitrary JSON. Project templates specify fixed scale, department, inputs, outputs, and suitable sites. Different scales use another known template or repetition, not prose interpretation. Construction, education, recruitment, and equipment upgrades consume actual labor and materials.

Inventory `available` excludes `reserved`; together they equal the entry total. Transit is separate. Cultural shares sum only within the report's covered population. For nonzero denominators, largest-remainder allocation sums to 10000 basis points. Zero population returns an empty profile list. Reports with different coverage cannot be directly added. Survey values remain estimates.

Amounts use decimal strings in minimum units; ratios use basis points. [The old observation example](../contracts/observation.example.json) shows historical v0.2 structure only; its culture attributes are no longer permitted. Settlement, rural, mining, facility, and education views reuse allowlisted entities/reports rather than exposing private distributions. v1.0 population aggregation supersedes mandatory exhaustive demographic cross-products without removing real qualification accounting.

## Queries

Requests contain `protocol_version, match_id, seat_id, observation_id, query_kind, target_ref?, cursor?, limit?`. `query_kind` is `entity | history | knowledge | reports | budget | objectives | cultures | religions | metrics | series | diplomacy`. Series additionally specify period and scope. `limit` is 1–100, default 20. Results use the requested knowledge snapshot, never subsequently acquired facts. `diplomacy` reads own lists, pair scheduling allowances, and received records; it sends nothing and performs no investigation or verification.

Responses contain `observation_id, items, next_cursor`, using existing public entity/report/event DTOs. `budget` reports own committed/available amounts, not enemy plans. Unknown and unauthorized targets fail uniformly. Match-wide query/output budgets are public and cannot reset by changing targets.

Read-only queries never repeat experiments. Investigation requires `investigate` and produces reports no earlier than a later observation.

## Command batches

Required envelope fields: `protocol_version, match_id, seat_id, observation_id, round, phase, negotiation_window, idempotency_key, actions`. The initial action cap is 32. An empty array maintains standing policies and submits the phase. This prevents interface flooding, not replaces physical constraints.

Contact permits at most one `select_contacts` with three distinct known strategic seats; an empty batch selects nobody. A negotiation batch allows eight actions, but counted envelopes are limited to one per direction/window and three mutually selected peers. Other actions must be legitimate bounded rights-protection operations. Plan allows 32 actions, including at most one new signature per pair with remaining permits. Every action has a batch-unique `action_id`; targets use supplied handles only.

`phase` is `contact | negotiate | plan`. Negotiation windows are 0–4. Contact/plan use `negotiation_window = null`, not zero. Each seat seals one batch per phase window. Contact choices cannot change after mutual selection. Plan allowance uses internal scheduling ordinal 5 without becoming a sixth free-chat window. Local editing is allowed before seal; a successful batch is immutable. Later legal offer withdrawal does not delete sent messages/counts.

At each window start, the referee assigns one-use permits from known pair remainder. At least two remaining grants one per side; one remaining alternates by public setup seat order and round/window parity. Unused permits cost nothing, cannot transfer, and are reallocated next window. Hidden intent, arrival order, and machine speed do not affect assignment. Permits and budgets validate atomically across affected peers. Replaying a successful submission does not charge again. Count only when successfully sealed and first queued immutably; later loss, withdrawal, or expiry gives no refund.

Idempotency scope is match plus seat. The same key and canonical payload returns the same receipt. The same key with different payload returns `IDEMPOTENCY_CONFLICT`. Repeated requests after the phase can still recover the original receipt. Stale observation/round returns `STALE_OBSERVATION` without revealing opponents' new state.

Syntax, visible permissions, and currently verifiable budgets validate atomically: any failure seals nothing, executes nothing, and consumes no game resources. After successful sealing, actions can have different outcomes because of actual world conditions. These cannot roll back completed transport, trade, or combat.

## Action set

| `kind` | Phase | Main fields | Meaning |
| --- | --- | --- | --- |
| `select_contacts` | contact | Up to three known peers | Simultaneous private selection; mutual channels; no text |
| `message` | negotiate | Recipient, text, optional evidence/intent/claims | Counted envelope; probing/deception/explanation; no direct duty |
| `propose_treaty` | negotiate | Recipient, registry, expiry, structured clauses, optional text | Counted immutable version; editing creates a version; not signed automatically |
| `withdraw_offer` | negotiate / plan | Offer ID/version | Protected fixed operation; no chat charge, text, or changed terms |
| `sign_treaty` | negotiate / plan | Exact known version, custody cap, optional text | Counted signature to actual anchor/confirmation peer; reserves own commitments |
| `break_treaty` | plan | Treaty/clause | Actual breach under existing terms |
| `respond_contract` | plan | Contract, obligation, operation, evidence, actual resources | Acceptance, cure, dispute, notice; constrained by state/authority |
| `set_budget` | plan | Department, monthly cap, priority | Standing spending ceiling, not progress purchase |
| `start_project` | plan | Known template, region, monthly cap, priority | Starts known project with facility/authority validation |
| `set_agenda` | plan | Known objectives and shares | Government priorities, not funding or completion |
| `manage_project` | plan | Project, pause/resume/cancel, monthly cap, priority | Adjusts project; consumed inputs are not refunded |
| `investigate` | plan | Lead, method, region, spending cap | Experiment, exploration, or audit |
| `set_production` | plan | Facility, known recipe, target utilization | Operates authorized production |
| `set_policy` | plan | Known policy/option, including bounded charter motion/vote templates | Acts within existing institutional authority; never arbitrary charter text |
| `propose_reform` | plan | Known practice, scope, monthly cap | Institutional project requiring consent/execution |
| `market_order` | plan | Product, region, side, once/standing, quantity/price/budget, expiry | Local order or standing procurement; remote delivery needs treaty/transport |
| `manage_market_order` | plan | Standing policy, modify/cancel, new terms | Changes future generated orders, not settled deliveries |
| `allocate_compute` | plan | Compute facility, consumer, monthly compute | Allocates real services, creates no hardware |
| `military_order` | plan | Army, task, target, supply, retreat threshold, optional route/source | Campaign-level order |

Duplicate overriding commands for the same facility/policy in one batch are invalid; submit one final choice. Lower priority numbers reserve first. Equal priorities follow batch order, affecting only own allocation, never cross-player competition.

`set_agenda.allocations` uses unique known active objectives totaling 10000, with one agenda replacement per batch. Optional `start_project.choices` lists unique `slot_ref, option_ref` pairs belonging to the known template. Templates specify mandatory slots and conditions for beliefs, original names, founder roles, and similar choices. Private nodes, scripts, and undeclared parameters are invalid. Primitive templates may cost zero cash but require real goods, labor, and authority. There are 19 action kinds; military organization reuses projects and orders.

Each directed `message`, `propose_treaty`, or `sign_treaty` is one envelope; attached prose adds no second count. Each envelope carries at most one formal operation. Multicast expands by real recipient with pairwise validation/counting; ten proposals cannot fit one envelope. Protected `withdraw_offer`, `break_treaty`, and `respond_contract` allow only fixed changes/evidence required by actual state. Free explanations or new terms are rejected with direction to use a counted envelope. Names, shared files, report titles, and alliance notices cannot become arbitrary free diplomatic channels.

Religion projects reserve actual mobilization and qualified personnel as well as goods/cash through known templates. Shortfalls follow the same visible preflight and hidden execution rules. Founding slots compete at final resolution, not through early query or submission.

Pause/cancel requires `monthly_cash_cap = 0`. Resume revalidates known budgets. Pause preserves results; maintenance/contracts resolve independently. Cancellation releases only unspent, unencumbered reservations and retains history. New project IDs return in resolution results and become usable in later phases.

A one-time order applies in the first clearing month after plan. Standing procurement generates monthly orders from known stock, targets, quantity/price/cash caps until cancellation/expiry. Unfilled quantities do not accumulate indefinitely. Prices refer to minimum units and one specification; only available inventory can be sold, with no naked short sales. Cash orders are unavailable before monetary markets; use known barter/organizational exchange.

Department `set_budget` is a parent ceiling; project/action caps are subceilings, not additional cash. Rule packages bind every action to a department. Deposits, immediate purchases, and loans are separate commitments. Total project reservations cannot exceed department limits or available treasury.

Successful negotiation signatures persist across windows. Plan allocates only the unreserved balance. Lowering budgets or reordering actions cannot release locked assets. Registry copies reference one reservation without double charging. Unlocking requires legal withdrawal/settlement and executable evidence, not an unanswered message.

Preflight reserves immediate commitments, custody, and actual next-month plans, not every monthly ceiling for the whole round. Later months allocate from received funds. Future tax is not current cash. Long-term liabilities and forecasts remain separate. Mandatory unpaid obligations become arrears; optional projects pause by priority. Validate all resources, including double assignment of students, teachers, soldiers, and miners, not cash alone.

### Optional structured diplomatic language

Native AI, humans and external agents use the same optional fields inside a counted `message`, `propose_treaty` or `sign_treaty` envelope. `intent` is at most one of `inquiry / quotation / counteroffer / claim / need / warning / alliance_proposal`. `claims` has at most four records, each containing a known `subject_ref`, `claim_kind` (`supply / capability / price / intention / forecast`), optional `metric_ref`, an optional bounded decimal value/range with its known unit, optional statement text, and existing evidence references. A forecast may include a declared future month; it does not obtain a forecast from the referee.

All free text across the body and claims shares the 2,000 Unicode-scalar ceiling. All envelope bytes share 16 KiB; all referenced evidence/attachments share the eight-reference ceiling; treaty clauses still have their separate maximum of eight. The envelope still contains at most one formal operation. Numeric bounds are public representation bounds, not the speaker's true inventory or capability. No new hidden metric, future technology enum or private reference is introduced by a claim.

The referee checks only syntax, reference visibility, permissions and payload limits, not truth. False supply/capability/intention claims are legal speech and do not create goods, qualifications or rights. Binding terms still require actual formal clauses/signatures. Native AI can reason over these claims, request clarification through counted replies, or ignore unsupported prose. Protected rights messages cannot attach these optional fields. No adapter may invent extra claim channels or treat a tag as authentication of its content.

### Existing-charter motions and votes

Use the existing plan action `set_policy` with known bounded templates `charter_motion` and `charter_vote`; these are options, not additional action kinds. A motion specifies `charter_ref, template_ref, allowed_option_ref` within already delegated jurisdiction. Its registry creates an immutable `proposal_ref`, electorate snapshot, old-charter threshold, deadline and activation-notice month. Members vote with `charter_ref, proposal_ref, choice`, where choice is only `support / oppose / abstain`. The default is one irrevocable ballot per seat per motion; a charter may explicitly allow replacement until the deadline, retaining all revisions and counting only the last valid delivered ballot. Renaming, splitting delegates or retries cannot multiply voting weight.

Only actually delivered ballots count. Institutional notices and ballots use real paths, costs, administrative capacity and the old charter's notice periods. Abstention or silence has the threshold effect specified in that charter; refusing a chat channel cannot invent unanimity. Membership or threshold changes cannot alter the electorate or rule for the motion passing that change. Store `charter_ref, proposal_ref, template_ref, allowed_option_ref, electorate_snapshot_ref, threshold_rule_ref, voting_deadline_month, activation_notice_month, vote_revision_rule, delivered_vote_records`.

These fixed exercises of existing rights need no mutual chat selection but cannot carry free text, custom titles, new prices, arbitrary evidence, new asset promises or undelegated powers. A seat may have one live motion per charter/template/scope; the registry enforces the charter's actual agenda capacity. Additional explanation uses counted diplomacy. A new charter, sovereign transfer, new obligation outside delegated jurisdiction, or removal of a specially protected right requires the appropriate formal treaty and necessary consent, under the ordinary ten-envelope/three-counterpart rules. Existing institutional procedure cannot launder new external contracts or give an eliminated ruler powers it no longer holds.

## Treaty clauses

The eight types remain `goods_delivery, technology_license, joint_research, access, loan, defense, charter, peace`. [Contract resolution](../design/14-contract-resolution.md) governs states, deadlines, acceptance, and failure. Schemas await generation.

- Goods specify quality, quantity, place, deadline, and acceptance. Full delivery is default; minimum batches and proportional settlement can be explicit. Payment can be cash or linked reciprocal goods. Prose does not imply unlimited supply or free guarantees.
- Licenses reference known knowledge and rights the seller can transfer. `rights` explicitly lists use, manufacture, modification, and sublicensing. Payments follow rights, information, training, and mutually verifiable engineering milestones. Rights-only limitations must be explicit. Maintenance requires real projects.
- Joint research specifies an existing project, monthly contributions, actual facilities/compute, contribution thresholds, and corresponding result delivery. One payment does not grant all future results; explicit gifts are valid. Breach does not erase learned knowledge.
- Access specifies facilities, parties, dates, capacity, and monthly fees. Commitments cannot exceed allocable capacity. Guarantees require real organization/transport.
- Loans specify principal, maturity, simple interest, and optional held collateral. No implied compounding, unlimited credit, or seizure of unpledged assets.
- Defense creates performance duties, not teleportation. Failure records breach.
- Charters specify members, real governing powers, voting shares, amendment thresholds, and administrative/budget/security/adjudication holders. Founding requires necessary signatures. Amendments reference the original charter and valid voting/authority; ordinary majorities cannot remove specially protected rights. Shares total 10000. A sole conquering government is audited independently without a fabricated one-member federation. There is only one possible winning original seat.
- Peace specifies ceasefire parties/expiry, sovereignty transfers, and one-time reparations. Transfer requires legal authority and deliverable control; third-party-occupied territory cannot be sold as controllable. Reparations reserve at signature and transfer on activation. Sovereignty does not instantly change private ownership, culture, or process mastery. Common governing powers use a charter.

Seats may have different handles for the same knowledge. On proposal creation, the engine reprojects terms for recipients and supplies stable `offer_ref` and `revision`. Signatures bind the stored version, not reconstructed client prose. A previously unknown technology may acquire a name, rights scope, and seller claims through the proposal, without granting actual processes or undisclosed prerequisites. Normal events/versioning record knowledge, and sender-private handles cannot become probing interfaces.

A new treaty includes every necessary party assuming duties, disposing assets, or receiving governing powers. Signatures follow current authorization. A proposal neither signs nor locks unsigned parties' assets. Later charter governance follows agreed procedures. One version produces one instance; duplicate rights/signatures do not duplicate money/capacity. Delivery deadlines must follow activation with real transport/acceptance time. Cash and goods obligations have separate accounts.

Every multiparty version fixes a real participant `anchor_seat` and another `anchor_confirmation_peer`. Other participants send counted signatures to the anchor. The anchor sends its own counted signature to the fixed confirmation peer. Neutral registries are not extra free chat peers. Distribution/signing may span rounds; required signatures travel to registration. Parties already knowing the version receive only fixed registration facts. Representatives cannot fabricate others' consent. Changing clauses or anchor structure creates a new version; see chapter 29.

A signature also creates a necessary copy to the fixed registry, containing only version, authentication, and unique reservation reference. The peer envelope and registry copy each consume actual paths, costs, and time. The fixed copy does not consume another chat count. Activation needs actual registry arrival; one route's receipt cannot predict arrival on the other. Copies share process identity, so retries neither reserve nor register again.

Signatures/withdrawals follow [communication delays](../design/04-politics-and-diplomacy.md). Arrival after expiry is invalid. Same-month withdrawal precedes new activation. Activation occurs no earlier than the treaty stage where registration conditions hold, never retroactively. Receipts describe known local sending/registration, not unreceived distant facts.

Local expiry does not automatically release pending reservations; activation may already have happened while its receipt travels. Unlocking requires executable registrar/custodian evidence. Communication failures follow final disposition, not imaginary refunds. `respond_contract` supports only `accept_delivery, submit_evidence, dispute, cure, terminate_notice, authorize_release`. New terms require another version.

`escrow_cash_cap` limits current cash custody. Goods custody separately identifies authorized reachable assets. Custody requires a real institution, place, fees, and capacity. Without it, agreements use explicit advance/batch risk, not automatic guarantees. Stage advances freeze as agreed; future recurring contributions are liabilities. Project accounts cannot also be contributors' available balances. Payments release on verifiable milestones, not all at license activation by default.

Failure releases only surviving, unpaid, executable holdings. Consumed materials, training, knowledge, and freight do not roll back. Custody failure, partial delivery, and disputes retain separate states. The referee does not certify secret processes for free. Deliberate buyer obstruction cannot justify unconditional nonpayment, but liability still requires agreed evidence/enforcement. Arbitrary prose penalties are outside v1.0; later breach does not automatically reverse paid cash.

Peace reparations also count toward `escrow_cash_cap`. Peace clauses cannot smuggle arbitrary future fines into automatic enforcement.

## Receipts and results

Submission receipts contain `idempotency_key, status, accepted_action_ids, errors, receipt_id`, with `sealed | rejected`. Retry returns the original. Sealing proves neither treaty activation nor research success.

Resolution results contain `action_id, status, event_refs, report_refs, public_reason`, with `applied | pending | failed_condition | interrupted`. Failure explanations include only knowable facts. Unknown causes return unconfirmed conditions or observed obstacles, not the private prerequisite graph.

Initial errors are `INVALID_SCHEMA, STALE_OBSERVATION, WRONG_PHASE, ALREADY_SEALED, IDEMPOTENCY_CONFLICT, NOT_VISIBLE_OR_UNKNOWN, INSUFFICIENT_VISIBLE_BUDGET, CONFLICTING_ACTIONS, RATE_LIMITED, UNAUTHORIZED`. Hidden deposits, forces, and treaties cannot generate distinctive preflight errors.

Diplomacy adds `CONTACT_LIMIT, CHANNEL_NOT_OPEN, PAIR_LIMIT, SEND_PERMIT_REQUIRED, MESSAGE_TOO_LARGE, FORMAL_PAYLOAD_REQUIRED`, based only on known scheduler facts. `CHANNEL_NOT_OPEN` does not reveal whom the opponent selected. Unclear authority uses the uniform unknown/unauthorized response. Exhausted allowance sends nothing, reserves no new signature funds, and cannot be bypassed with protected contract actions.

Only an original seat with active scoring status can win. Forfeited/eliminated status cannot be reversed through command retries, controller changes or renamed entities. A maintenance controller uses surviving permissions without a new scoring identity; its completion is diagnostic. At H, victory checks precede timeout; no active original seats ends the match without a winner.

## Disconnection and timeout

Each phase has a public wall-clock deadline. Timeout submits an empty batch and retains standing policies/contracts. Repeated timeout does not invoke an omniscient script. Predetermined suspension or technical forfeiture is recorded separately from in-world defeat. Official withdrawal follows the fixed maintenance-controller policy in chapter 33, preserving world assets/authority without granting new planning resources or donating sovereignty. Casual controller replacement is explicitly marked nonstandard for formal comparison.

External runners track tokens, tool calls, wall time, and cost. Rotate starting seats across models with equal rules/scenario distributions. Adapters retain only their own memory. Diplomatic/historical prose never changes system authority.

## Minimum operational loop

`observe -> query own history/known bottlenecks -> seal up to three contacts -> read mutual channels -> process negotiate windows 0–4 -> obtain plan observation/remaining signature permits -> submit plan -> await resolve -> observe again`.

Empty windows still submit empty batches. Legitimate arrivals may update knowledge and observation IDs, but message arrival does not certify truth.

Historical v0.2 examples include [negotiation](../contracts/negotiation.example.json), [query](../contracts/query.example.json), and [receipt](../contracts/receipt.example.json), not current tutorials. After migration, schemas validate fields/unions. The referee still validates references, amount relationships, shares, participants, dates, conditions, and information permissions.

Paginated events reuse `QueryResponse`, `EventView`, and cursor semantics. Optional forecasts lack a complete contract. Before formal scoring, version event definitions, deadlines, and truth fields; until then they cannot be used as official scores.

MCP/CLI map directly to these endpoints. [Native integration](04-native-agents-and-isolation.md) defines tokens/isolation. Tool help/examples must not inject undiscovered endpoints into actor context. [Feedback and RL](05-feedback-and-rl.md) defines units, dates, sources, and coverage for demographic, military, and contract metrics. Reward/private training state is outside ordinary observations. Metrics/series use the same snapshot permissions and provide no free counterfactual execution of hidden worlds.
