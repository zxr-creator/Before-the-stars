# Politics and Diplomacy

Trade, technical cooperation, commitments, alliances, and conflict between civilizations form the principal strategic arena. Domestic factions affect what a civilization can promise, how it can deliver, and how foreign gains are distributed.

[Contract states and partial failure](14-contract-resolution.md) defines the signature, obligation, and custody state machines, default deadlines, same-month priorities, and failure handling for licensing and joint research. This chapter explains diplomacy; that specification governs execution. Both remain design documents, not implemented systems. v1.0 has four total civilizations and at most one winner; alliances do not create shared victory.

## Factions

Factions consist of actual members, assets, and organizations. Primitive societies aggregate existing kin cooperation, food distribution, toolmaking, and collective action, without precreating merchants, clergy, or bureaucracy. Settlement, specialization, and religion can later produce land, production, commerce, knowledge, and belief organizations. The interface normally shows three to five major groups, not fixed faction slots. Smaller groups can remain background members; interface limits never delete people or assets.

Faction state includes income sources, controlled assets, membership, organization, political powers, demands, trust, and mobilization. Power derives from specific revenue, facilities, knowledge, people, and institutional positions. Satisfaction summarizes conditions rather than replacing their causes.

| Action | Requirements | Consequences |
| --- | --- | --- |
| Support a budget or reform | Relevant voting, administrative, or cooperation rights | Supplies real authorization and execution resources |
| Withdraw investment or migrate | Owned assets and a reachable alternative | Changes project finance, personnel, and tax base |
| Reduce cooperation or strike | Organized members, labor supply, living reserves | Affected facilities lack staff; the faction also loses income |
| Obstruct technology diffusion | Control of processes, organizations, or facilities | Restricts only channels it can actually control |
| Local noncompliance | Local revenue, governance, and organizational support | Reduces central taxation and command coverage |
| Armed uprising | Organization, supplies, weapons, opportunity | Enters an actual military process visible publicly or through reconnaissance |

Cultural difference does not automatically cause rebellion. Rights, distribution, coercion, communication, and history shape demands. Opposition can rationally protect assets; support for reform is not unconditional loyalty.

Background organizations use bounded, non-LLM policies. From their own reports, they compare continuing current behavior with a few legal alternatives using expected income, basic-needs gaps, member preferences, and performance risk, minus action and switching costs. Organization type and cultural practices configure weights and thresholds; learning uses only received outcomes. Strikes, withdrawal, and mobilization require cooldowns and costs. An LLM does not improvise whether society responds, and organizations cannot read sealed player plans.

## Reform

Reform is a timed project with economic thresholds, required powers, affected groups, fiscal cost, and adoption speed. Players can negotiate compensation, change pace or rights, or build alternative institutions.

Institutions require specified consent and execution capacity. A group's consent follows its state. Forced reform needs actual coercive capacity and a legal route, creating maintenance costs, migration, and trust effects; opposition cannot be bypassed freely.

Future compensation must bind a budget or debt. Credibility depends on verifiable security, performance history, and enforcement institutions. One payment does not purchase support for every future policy.

## Agreement types

| Agreement | Structured content and fixed rules |
| --- | --- |
| Goods trade | Product specification, quantity, destination, date, cash price or reciprocal goods, transport/acceptance duties |
| Technology license | Rights, delivery scope, acceptance milestones, staged fees, duration; training and equipment require real projects |
| Joint research | Existing project, lead, real contributions, milestone delivery, result rights; zero contribution grants no automatic entitlement |
| Access and infrastructure | Known links/facilities, parties, capacity, monthly fees, start/end months, interruption handling |
| Loan | Principal, simple interest, maturity, explicitly escrowed collateral; unsecured loans can genuinely default |
| Defense | Protector, protected party, external-attack trigger, response deadline, expiry; fulfillment requires actual action |
| Political integration | Members, retained autonomy, voting shares, amendment thresholds, administrative/budget/security/adjudication powers |
| Peace | Ceasefire parties/duration, deliverable sovereignty transfer, one-time reparations; subordination uses a charter |

Free text permits negotiation, deception, explanation, and threats. Only supported structured clauses establish executable duties. Natural language cannot become code or acquire improvised legal effects from another LLM.

Selling technology does not erase the seller's knowledge. Revoking permission does not make a buyer forget learned knowledge; it can end future maintenance, upgrades, or parts supply, or trigger sanctions. Capturing a product, acquiring plans, mastering a process, and sustaining mass production are distinct capabilities.

## Negotiation and activation

The [round communication protocol](29-diplomacy-communication-v0.8.1.md) first seals up to three chosen partners simultaneously; mutual selection opens channels. Five simultaneous windows allow at most one envelope per direction per window. A pair shares ten envelopes for the entire round, including messages, proposals, counters, alliance invitations, and new signatures; plan-phase signatures share the remainder. A final-slot permit is allocated before the window, not won by request arrival. Each envelope permits 2000 Unicode scalars, eight structured clauses, eight existing attachment references, and at most 16 KiB canonical encoding. Charge the first successful send's round. Withdrawal, retry, renaming, and delayed receipt do not refund or reset allowances. No communication path means no instantaneous conversation; official matches prohibit external private channels. With four civilizations, three peers covers every opponent and does not itself force partner selection.

Players may deceive, probe, conceal, threaten, bargain, and ally. The engine authenticates senders and actual registry records, not the truth of prose. Victims discover deception through investigation, samples, performance, or corroboration. There is no omniscient lie warning or automatic honesty multiplier. Only legal structured clauses become binding.

Withdrawing unactivated offers, exercising signed-contract acceptance/dispute/exit rights, and actual breach do not require a mutually opened chat. These operations allow only state-specific fixed transitions and necessary evidence, never free messages, new prices, or new terms. Ordinary trade and automatic performance are not limited to three trading partners; the restriction concerns new active diplomacy. Broadcasts count for each recipient. Alliances have no free universal chat. Each leg of a genuine intermediary's relay uses its own channel.

Proposals are immutable versions. Editing creates a new version without inherited signatures. After knowing the exact version, a party can sign in a later negotiation window or plan phase and reserve its own commitments. Signatures consume remaining communication allowance; unknown future versions cannot be presigned. Signing reserves only the signer's agreed initial commitments; proposals cannot freeze recipients' assets. Future duties enter liability schedules. One version creates one contract instance; duplicate signatures or clause references cannot duplicate payment or rights.

When all required signatures arrive, all parties reference the same version, and conditions hold, activation occurs in the next resolve treaty stage. Invalid signatures, withdrawal, or asset conflicts prevent agreement. Prior-window signature reservations and existing duties are protected first. New commitments in the current batch compete only for remaining funds according to explicit local priority. Plan commands cannot reallocate locked assets, and network arrival does not determine claims.

Negotiation windows do not advance simulation months. Existing paths determine delay: zero-month messages become visible in the next negotiation window; nonzero messages and signatures enter transit and appear in the next available observation after actual arrival. Submonthly communication is quantized to zero months. Recipients cannot sign proposals before learning them. Early long-distance diplomacy may span rounds, so expiry must allow round-trip transit. Withdrawal also travels; activation uses arrivals and effective withdrawal times, never retroactive cancellation of an active treaty.

Every proposal specifies a known registry location/institution and absolute expiry month. All signatures and withdrawals travel there. Legal effect begins at registry arrival, not when the server first sees submission. Same-month withdrawal precedes a newly arriving final signature; treaties active in prior months remain active. At expiry or rejection, the registry issues reservation-release evidence. Remote parties cannot unlock funds merely because their local clock passed the deadline: activation may already have occurred while the receipt is still traveling. Actual control also requires communications, return transport, or custody rights. Expired prerequisite deadlines and service periods cannot be backdated. Receipts use real paths; private APIs reveal no opponent's in-transit signature.

A `sign_treaty` creates two routed records: a counted envelope to the actual negotiating peer, and a text-free signature copy to the version's fixed registry. Each bears real path, cost, and delay. Both reference one asset reservation; money is not locked twice. The registry copy opens no extra chat partner and carries no other transaction. Peer receipt does not prove registration. Registry arrival activates under the existing rules; receipts also travel physically.

Breach never deletes history. Custody protects only assets actually held. Courts, sanctions, and military guarantees work only where their institutions can execute them. A contract cannot automatically control foreign behavior beyond actual authority.

## Custody, delivery, and partial failure

Custody is a service by a real organization with storage and accounting capacity, known, reachable, and accepted by both parties, with capacity, fees, and operating costs. Early societies can use a custodian at a shared delivery site, not a magical global risk-free bank. Without one, use direct delivery, advance payment, or unsecured commitments with explicit risk. The referee prevents duplicate assets but does not guarantee a custodian against interruption, occupation, or incapacity.

Each holding references unique assets and obligations; it cannot be pledged, sold, or requisitioned twice. Cash releases against verified stages; goods are accepted by specification, quantity, place, and deadline. Distinguish not shipped, in transit, partly qualified, buyer rejection, and custody interruption. Deadline failure does not delete goods; failed deliveries still in transit retain ownership and return duties.

An indivisible delivery defaults to payment after full acceptance. Partial delivery requires an advance minimum-lot and proportional-price agreement, not favorable reinterpretation afterward. Refunds release only unpaid custody balances and depend on executable custody. Transport, experiments, and maintenance already consumed are not refunded. Related treaties are not arbitrary rollback transactions.

Obligations have delivery, acceptance, one cure, and final closure deadlines. Partial disputes freeze only the relevant amount. Diligent research failure, nondelivery, buyer nonpayment, and custody interruption have distinct states. Closure preserves outstanding claims, in-transit goods, and learned knowledge. Fixed default handling is in the contract specification; an LLM cannot invent compensation.

Early barter binds two goods-delivery clauses with explicit specifications and quantities, without hidden universal market prices. Under custody, both sufficient qualified lots must reach the same agreed place before simultaneous title transfer. Otherwise they wait or release returnable holdings according to prior terms. Batch barter defines matched quantities per batch. Direct first delivery retains nonpayment risk and does not gain nonexistent cross-location atomic exchange.

## Technology transfer and joint research

Distinguish legal permission alone, information delivery, training, and engineering transfer completing defined verification. Parties may buy rights only, but rights do not equal production competence. Payments follow explicitly agreed rights, document verification, tests, or training milestones; activation does not silently make the whole fee due.

Acceptance references mutually known tests, input conditions, tolerances, and deadlines. Buyers cannot destroy a test bench to refuse payment forever, nor sellers substitute irrelevant demonstrations. Verifiable evidence and designated institutions determine obstruction responsibility. Insufficient evidence creates a dispute, not free disclosure of hidden truth by an omniscient referee. Where arbitration cannot execute, credit risk remains.

Governments can transfer only information and organizational rights they control or are authorized to use. National knowledge does not give the treasury free ownership of a private guild's skills. Products, stolen documents, and legitimate information can create learning opportunities, but tacit skills, equipment adaptation, and trials still cost resources. A narrative message cannot change `understood` directly to `adopted`.

Joint-research milestone rights follow voluntarily signed contributions and delivery terms. By default, new nonpublic results go only to parties meeting that milestone's contribution conditions. Missing payment starts a bounded cure period and pauses unearned delivery; curing restores original terms. Completed rights, shared property, and actual learning remain. Public knowledge may spread. Researchers physically present in open laboratories can learn; software permissions cannot force amnesia. Explicit gifts are allowed, but a tiny contribution does not implicitly grant all result rights.

Compute contributions bind real facilities, months, service reservations, and network conditions, not a contract integer alone. Research funding enters one project account and cannot simultaneously count as the lead's freely spendable treasury income.

Contributions are staged. A missing contribution reduces or pauses work by default; other participants' funds are not silently used to cover it. Diligent unsuccessful services consume real resources, failure data is delivered as agreed, and unused money returns according to contribution records. Fabricated hours or diversion are separate evidence-based breaches. Exit respects presigned notice and current-stage duties; cancellation cannot erase debt.

## Credit, charters, and political commitments

Loans transfer existing principal. Interest is future payable debt, not newly created cash at issuance. Only explicitly held cash or goods serve as executable collateral, and recovery cannot exceed collateral. Other claims depend on real courts, future trade, or political action. Renaming, subsidiaries, government replacement, and rewritten contracts do not erase liabilities. Reputation spreads only to parties legitimately learning performance records, not through a global omniscient blacklist.

Founding a charter requires all necessary signatures. Thereafter, ordinary policy follows its proposal, voting, and activation procedures rather than repeated unanimity. Removing protected autonomy or transferring nondelegable rights still requires the appropriate authorization. Authority changes have traceable records; power cannot be borrowed for one settlement to claim victory and returned immediately. There is no shared-win compensation. A real ultimate-control transfer restarts applicable governance continuity; local autonomy is not an unlimited veto outside retained rights.

Peace activation cancels conflicting standing attack orders. Signing explicit peace and simultaneously ordering an immediate attack on that party is a visible local command conflict. A later attack may breach, with real political and contractual consequences; an old order cannot excuse responsibility as accidental.

### Existing-charter motions and votes

Use the existing plan action `set_policy` with known bounded templates `charter_motion` and `charter_vote`; these are options, not additional action kinds. A motion specifies `charter_ref, template_ref, allowed_option_ref` within already delegated jurisdiction. Its registry creates an immutable `proposal_ref`, electorate snapshot, old-charter threshold, deadline and activation-notice month. Members vote with `charter_ref, proposal_ref, choice`, where choice is only `support / oppose / abstain`. The default is one irrevocable ballot per seat per motion; a charter may explicitly allow replacement until the deadline, retaining all revisions and counting only the last valid delivered ballot. Renaming, splitting delegates or retries cannot multiply voting weight.

Only actually delivered ballots count. Institutional notices and ballots use real paths, costs, administrative capacity and the old charter's notice periods. Abstention or silence has the threshold effect specified in that charter; refusing a chat channel cannot invent unanimity. Membership or threshold changes cannot alter the electorate or rule for the motion passing that change. Store `charter_ref, proposal_ref, template_ref, allowed_option_ref, electorate_snapshot_ref, threshold_rule_ref, voting_deadline_month, activation_notice_month, vote_revision_rule, delivered_vote_records`.

These fixed exercises of existing rights need no mutual chat selection but cannot carry free text, custom titles, new prices, arbitrary evidence, new asset promises or undelegated powers. A seat may have one live motion per charter/template/scope; the registry enforces the charter's actual agenda capacity. Additional explanation uses counted diplomacy. A new charter, sovereign transfer, new obligation outside delegated jurisdiction, or removal of a specially protected right requires the appropriate formal treaty and necessary consent, under the ordinary ten-envelope/three-counterpart rules. Existing institutional procedure cannot launder new external contracts or give an eliminated ruler powers it no longer holds.

## Information asymmetry

Parties can differ in knowledge of deposits, production cost, research results, domestic support, and plans. Investigations, trial deliveries, staged deadlines, and custody trade cost for better judgment. v1.0 neither invents extra guarantees from prose nor automatically disposes of unpledged assets.

Quotes and deliveries provide signals; investment in alternative production can create a costly credible threat. Secret agreements appear only to participants and parties acquiring intelligence through play. The engine never marks an opponent as lying.

## Mechanisms constraining cheap permanent monopoly

| Mechanism | Natural constraint on leaders | Available response |
| --- | --- | --- |
| Complementary skills and facilities | Expansion requires training, equipment, maintenance | Recruit, co-invest, or expand more slowly |
| Administrative and transport distance | Distant taxation and mobilization cost more | Roads, local delegation, federations |
| Diffusion and substitution | Monopoly profits attract research and migration | Reasonable licensing, innovation, cooperation |
| Specialization dependency | Strong industries may rely on few suppliers | Reserves, alternate routes, reciprocal investment |
| Domestic distribution | Growth strengthens new interest groups | Representation, compensation, institutional adaptation |
| War and occupation | Facilities do not automatically bring cooperation | Limited aims, reconstruction, political integration |
| External balancing | Others can coordinate purchasing, research, defense | Bargain, share benefits, build credible institutions |

Anti-leader coalitions are not automatic. Players or rule-governed organizations must negotiate, pay, and perform. Dominance remains possible; the goal is continuing maintenance costs and identifiable response windows.

World generation must not permanently make one civilization the sole supplier of every essential chain. Scale economies may exist alongside congestion, training delays, and institutional execution costs. Size is not a free multiplier for all gains.

## Prototype strategic interaction

A has energy, B precision processes, C food and transport. A wants powered machinery; B offers training for long-term energy discounts. A can accept, buy instruments only, research internally, or co-invest with C. Every option changes dependency, domestic income, and B's monopoly rents.

Acceptance requires actual responses: B's price increases should stimulate alternatives; A's weak credibility should change contract form; C should be able to intermediate or compete. If all three choose the same policy regardless of conditions, revise mechanisms or incentives before adding narrative events.
