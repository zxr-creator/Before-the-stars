# Contract Performance, Acceptance, and Partial Failure

This design specification completes [politics and diplomacy](04-politics-and-diplomacy.md). No execution code or match testing exists yet. Deadlines below are versioned initial defaults, not real legal conclusions. Necessary participants can inspect contract syntax, signed obligations, charges, evidence requirements, and disposal order. The referee does not reveal otherwise unknown techniques, culture, or third-party secrets.

[26: Advanced licensing and strategy review](26-late-game-contracts-and-strategy-v0.8.md) applies this state machine to AI, cybernetic/biological information, models, data, and administrative permissions. Nonexclusive knowledge may legitimately benefit multiple parties. Hardware, compute, mentor timeslots, and exclusive rights cannot be disposed of twice.

## 1. Three connected state machines

A contract needs more than valid/defaulted states. Separately preserve:

1. **Proposal and authority:** who signed which version, when the registry received it, and who may dispose of each asset.
2. **Obligations and results:** separate states for every delivery, research contribution, and acceptance milestone.
3. **Custody and execution:** asset location/custodian, valid release credentials, and remaining executability.

Overall `active / impaired / settling / closed` status aggregates obligations rather than rewriting all children. Paid milestones, due debts, shipments, and learned knowledge survive closure. A technically failed experiment may involve no default; a productive research contract may still default through nonpayment.

Each obligation stores `obligation_id`, actual responsible entity, beneficiary, input/deliverable, predecessors, due month, acceptance template, independently acceptable batches, payment, cure deadline, final-close month, evidence sources, custody references, and settled quantity. Dependencies must be acyclic. Early barter uses a dedicated paired-exchange group rather than circular ordinary obligations. Renaming, splitting, and duplicate signatures create no new settlement entitlement.

## 2. Dates, messages, and signatures

[Diplomatic communication rules](29-diplomacy-communication-v0.8.1.md) govern new proposals, counteroffers, signatures, and voluntary explanations. Five negotiation windows plus plan-stage signatures share a combined bilateral limit of 10 messages, and each seat has at most 3 channels per round. A signature may be sent in negotiation/planning after receipt of the exact version, with real local budget reservation. Closing chat does not activate it early. The proposer must explicitly sign too; a proposal is not a signature.

Valid withdrawal, acceptance, dispute, termination, default, and release operations do not require the other side to accept a conversation that round and do not consume chat quota. They permit only this document's fixed operations and necessary asset/evidence references, without free explanation, new prices, extra terms, or arbitrary payloads. Repetition without state change is idempotent: no new notification or deadline extension. New negotiation still needs a channel; fulfillment cannot become a fourth conversation. One immutable multiparty version can circulate and collect signatures across rounds, without limiting eventual alliance size. Communication/counting follows 29; actual authority/arrival follows this chapter.

All dates are absolute `SimMonth`, inclusive of the due month. Formal terms show both delivery deadline and report-arrival-at-registry deadline; evidence still traveling is not timely submission. Drafting fills visible concrete months from these defaults:

| Parameter | Initial default and limits |
| --- | --- |
| Inspection | 3 months after goods/information actually reach the designated inspection site; complex pilot templates may explicitly require longer |
| Cure | 6 months after the registry records nonconformance/nonpayment; once only, without resets from repeated reports |
| Dispute evidence | 6 months from formal registry opening |
| Ruling | 3 months after evidence closes |
| Final close | Written per stage to cover delivery, inspection, cure, dispute, and known communication delay; no unlimited automatic extension |
| Termination notice | 3 months from registry receipt; committed obligations continue, uncommitted next stages do not start automatically |

Default final close is `delivery deadline D + inspection duration P + 15 + 2L`, where 15 is cure 6 + evidence 6 + ruling 3, and L is the longest known one-way participant-to-registry/inspection communication time at signing. Parties may choose a longer finite date. Later procedural deadlines are capped at final close. War-lengthened communications do not automatically amend signed dates. Messages arriving after closure may update history and existing claims, but cannot reopen the same active fulfillment process. Amending recovery rights or restarting services needs explicit new authority.

Long communications require longer disclosed deadlines before signing, otherwise participants bear response-delay risk. Plans may preselect bounded local responses such as accepting qualified goods, requesting cure after failure, or submitting agreed evidence. Routine performance cannot wait for an annual manual decision. These procedures read only locally received information, without omniscient monthly replanning.

| Proposal state | Event/condition | Next state and assets |
| --- | --- | --- |
| `draft` | Send proposal message | `in_transit`; no recipient assets frozen |
| `in_transit` | Designated registry receives a valid version | `registered`; reject unknown parties or unauthorized dispositions without undoing actual shipments |
| `registered` | Valid signature and commitment credential arrive | `awaiting_signatures`; record the signer's existing unique reservation without debiting/locking again |
| `registered / awaiting_signatures` | All required signatures, escrow, or explicit unsecured terms arrive before deadline | `activated`; create one contract and its obligations, without retroactive effect |
| `registered / awaiting_signatures` | Valid withdrawal arrives, or deadline month ends without activation conditions | `withdrawn / expired`; issue release instruction without creating spendable remote cash |
| Any unactivated state | Withdrawal and final signature register in the same month | Withdrawal wins; that version cannot activate |
| `activated` | Later withdrawal, duplicate signature, or old-version message | No reversal; duplicates are idempotent, voluntary exit uses termination |

The registry cannot move unilaterally after signing. Amendments create a new version requiring affected parties' consent. Existing terms continue until an amendment explicitly replaces **future** obligations. It cannot alter paid facts, relabel vested rights unpaid, or authorize itself under its new approval threshold. Unchanged security remains bound to its original responsibility.

**Remote reservation:** a payer's local belief that an offer expired does not prove the registry failed to activate earlier. Once a signature is sent, local time alone cannot release its reservation. The registry alone determines activation/expiry. Spendable funds require an actually received valid release credential; goods additionally need return transport or executable custody control. Lost contact creates real illiquidity. The UI shows pending assets and final-disposal terms without hiding risk or revealing registry state that has not returned.

## 3. Monthly event priority

Integrate into the existing eight-stage month, without a separate instant contract clock:

1. At opening, register arrived messages, previous output, and shipments. Respect already-established activation before processing same-month withdrawals, signatures, and expiry of still-unactivated offers. Effective peace/authority changes precede production and military action.
2. Reserve contributions, transport, inspection, and custody maintenance according to existing obligations and local budget priorities. New contracts cannot consume assets already reserved by older obligations. Interparty transfers actually occur.
3. Production, training, research, transport, and inspection run through common stages and create verifiable evidence. Contracts themselves manufacture no service.
4. At month-end, register evidence actually received by this month and settle qualified independent batches first; then resolve due payments, cure, termination, and disputes. Qualified evidence received in the final due month can settle without first declaring and reversing default.
5. Process final-close deadlines last, converting nonexecutable remaining rights into explicit claims. Shipped/unreturned assets remain traveling or stranded. Month-end payment cannot fund already-finished current research retroactively.

Disputes freeze only disputed money/goods. Undisputed qualified portions still pay. Unrelated clauses do not automatically cross-default. Missing necessary inputs may pause dependent stages without cancelling independent completed milestones.

## 4. Delivery, acceptance, and default transitions

| Obligation state | Verifiable trigger | Next state and required action |
| --- | --- | --- |
| `scheduled` | Start month, predecessors met, actual inputs arranged | `performing`; consume actual inputs, not every future budget at once |
| `scheduled / performing` | Necessary input shortage or interrupted predecessor | `blocked`; preserve incurred costs and deadlines unless an existing extension clause applies |
| `blocked` | Inputs/predecessors restored before original deadline, authority still valid | Return to `performing`; complete remaining work without recharging accepted portions |
| `performing` | Specified deliverable dispatched | `in_transit`; goods/people leave origin and cannot also exist at destination |
| `performing / in_transit` | Actual arrival at inspection site with receipt evidence | `inspection`; start fixed period and record received quantity/quality |
| `inspection` | Predefined independent batch passes and authorized inspector certifies it | Qualified quantity `accepted`; remainder stays in inspection or enters `cure`, without resetting the whole contract |
| `accepted` | Agreed money, goods, and execution authority actually available | `settled`; unique credential releases corresponding assets/rights once |
| `accepted` | Consideration unpaid/undelivered when due | `payment_due`, then `cure` after deadline; learned knowledge is not recoverable |
| Unsettled | Late delivery, failed inspection, refused promised service, or nonpayment | `cure`; record deficit/deadline and stop dependent future optional services |
| `cure` | Qualified correction/payment arrives before cure deadline | Appropriate `inspection / accepted / settled`; actual stoppage/cost history persists |
| `cure` | Evidence establishes default, or cure deadline remains unmet | `defaulted`; apply finite disposal rules, not arbitrary fines |
| Unsettled | Valid specific objection to evidence or responsibility | Disputed portion `disputed`; one dispute instance, no extension by repetition |
| `disputed` | Authorized institution rules in time from evidence available to it | `accepted / cure / defaulted`; enforce only assets within its authority |
| `disputed` | No arbitrator, no ruling, or final close reached | `unresolved`; apply signed risk-allocation defaults without claiming responsibility was established |
| All terminal or final close | Payments, refunds, stranded assets, and claims individually recorded | `closed`; retain unpaid claims and material ownership, never delete accounts |

Receipt is not acceptance. Tests use agreed measurement templates, instruments, tolerances, input conditions, and witnesses. Directly verifiable ledger facts may be certified; unknown process compatibility or unobserved sabotage cannot be certified for free by an omniscient referee. Institutions use their observations and may be genuinely deceived. Deterministic execution differs from institutional knowledge of truth.

Services need no shipment state. Actual teaching, equipment operation, escort, or research records move `performing` directly to `inspection`, then `accepted → settled`. Performed service does not imply successful research. Rights delivery uses an actual effective registration credential, not a fake material batch bypassing authority.

Acceptance is not an arbitrary buyer reject button. An agreed testing service may independently run on actual samples; qualified proof triggers payment. Buyer-only acceptance without an independent witness exposes the seller to delay risk, which it may address through staging, prepayment, or declining trade. Do not hide that risk.

## 5. Custody and final disposal

Asset custody follows `reserved_local → deposited → released / return_pending / impaired → recovered / lost / receivable`. Local reservation is not receipt by a distant custodian. Where deposit is required, actual `deposited` state is necessary for activation or the relevant stage.

| Situation | Default asset treatment |
| --- | --- |
| Qualified independent batch | Release fixed unit/batch consideration and accumulate settled quantity without repayment |
| Proven seller nondelivery/nonconformance after failed cure | Return remaining buyer escrow for the unqualified portion and execute deposited performance security; no unsecured magical compensation |
| Proven buyer nonpayment/inspection obstruction | Pay accepted amounts; do not fake success for untestable work; execute separately agreed inspection/reservation fees and bounded security |
| Diligent research with buyer-held technical risk | Pay verified actual services and deliver failure data; return unused budget without promising success |
| Seller-guaranteed engineering result fails | Do not pay that success milestone; return unused escrow while retaining accepted information/training stages |
| Unattributable termination/dispute timeout | Pay accepted portions; return unaccepted consideration to contributors and untransferred goods to owners; refund unused research funds by contributions |
| Failed custodian, destroyed assets, or third-party control | Dispose only of extant executable assets; remainder becomes stranded property/claims, not newly minted refunds |

Batch quantities must be predefined. An indivisible process package cannot receive arbitrary percentage-complete payment. Independent deliverables require genuinely useful milestones. Remainders accumulate within the obligation and settle as cumulative entitlement minus paid amount; splitting into a thousand batches cannot earn a thousand minimum payments.

Cash services do not create insurance. Only a separately funded organization that accepted the risk may compensate, with guarantees included in its locked assets. Loan maturity, peace compensation, and access fees use `payment_due → cure → defaulted`. Loans recover only against agreed security, not automatically against unpledged land or techniques. Defense clauses verify promised response behavior, not victory; battlefield defeat alone is not alliance default.

At final close: `initial escrow + subsequent deposits = payments + actual returns + extant stranded assets + confirmed destruction/actual custody costs`. A pure claim is not a cash asset; one loss cannot count both as a refund and spendable security. Restored service executes the original unique release credential, without paying again. Replayed messages cannot repost completed transfers.

### Other clause triggers and termination boundaries

| Clause | Triggered/due obligation | Facts preserved after failure/termination |
| --- | --- | --- |
| Loan | Effective after actual principal delivery; maturity pays principal plus original simple interest, with no interest on undelivered principal | Failed cure executes existing security and reduces claim; unpaid remainder persists without invented compound/default interest |
| Access | Deliver reserved monthly capacity/authority; fees follow delivered service. Unused but genuinely reserved capacity may earn a presigned reservation fee | Provider's loss of control cannot fake access; suspended future permission does not erase earned fees; transit goods retain original transport responsibilities |
| Defense | Response clock begins when the obligated organization receives the specified credible report; terms state deployment, arrival, escort, or supplies and latest arrival | Inability to respond may default; actual deployment followed by defeat does not automatically default. A unilateral attack claim is not omniscient certification; deception must travel and be accepted |
| Peace | Stop hostile orders when effective, transfer verified compensation, transfer sovereignty only through real authority/delivered control | Later default does not instantly reverse transferred money, people, or property; renewed hostility follows warfare rules |
| Charter | Initial registration requires all necessary authority; later budgets/rights use the old charter's process; reserved rights require corresponding consent to remove | One fiscal default does not dissolve the whole federation. Exit, restored sovereignty, or revoked powers follow signed procedures and executable capacity, not instant global flag changes |

Cash security releases only up to unpaid amounts, returning the remainder to its contributor. Goods security must predefine specification, settlement unit value V, and maximum disposable quantity. Default disposal is `min(actual executable security quantity, floor(unpaid amount / V))`. Reduce the claim by `quantity × V`; retain sub-unit residual debt and return excess goods. Do not create change in cash. Whole-item settlement of indivisible goods needs separately agreed terms. The referee cannot invent a global true collateral price or preserve the entire claim after transferring all collateral.

## 6. Technology licenses: knowledge, rights, and production differ

Optional stages include use rights, documentation, mentor hours, installation, trial production under known conditions, and stable production verification. Each declares **delivery guarantee**, **actual service**, or **result guarantee**, with independent charges/acceptance. Advertising does not change the category.

- Use rights follow signed scope/duration. Violations create executable liability without deleting knowledge from minds.
- Documentation delivery certifies agreed version, completeness, and testable content, not compatibility with every local material. Promised production under specified inputs requires a result-guarantee stage.
- Training settles actual mentors, learners, hours, curriculum, and skill verification. Attendance without passing does not produce engineers; hour-service and qualification-result stages should be distinct.
- Success standards cannot rise retroactively. Out-of-contract applications cannot become seller default. Sellers without disposition rights cannot sell free control of all national knowledge.

Irreversible learning creates genuine disclosure risk: a buyer may learn part and refuse payment. Staged disclosure, real escrow, limited prepayment, and future services manage it; software cannot erase knowledge. On-site verification, sealed documents, or later encryption require technology/organization actually available at that time. Primitive societies do not receive free encrypted escrow.

Public failed experiments, authorized failure reports, and firsthand experience remain knowledge records. Losing future licenses/services does not remove historical evidence. Other restricted information does not appear without actual delivery. Contract performance is separate from objective completion; purchasing documentation does not directly satisfy FTL acceptance.

## 7. Joint research: contributions, risk, and exit

Each stage has one project account, lead, executing institution, executable budget, cash/material/personnel/compute commitments, minimum viable inputs, and a rights table for failure data/new results. Decades of research cannot become one opaque stage where a tiny final-month payment buys everything.

| Right or obligation | Rule |
| --- | --- |
| Background knowledge/equipment | Original ownership remains, with explicit project use scope; cooperation does not reveal every background technique |
| Actual services/failure data | Members satisfying stage contribution conditions receive agreed reports even after failure, with actual observation limits |
| New results | Vest under explicit stage conditions; completing an old stage does not grant later results |
| Existing jointly created assets | Preserve signed ownership shares/disposition authority; later exit does not confiscate everything |
| Open laboratory | Present participants actually learn; contracts acknowledge this. Confidentiality requires restricting actual contact, not deleting unpaid observations |
| Monthly contributions | Verify received money, inventory, people, and services, not paper promises; one hour/compute unit cannot contribute twice |

Deduct cash simultaneously from participant subaccounts using stage shares; preserve contributed inventory batch ownership. If one participant cannot cover its share, others do not automatically advance funds. Scale down to jointly affordable activity; pause below the minimum effective input. Presigned bounded advances create bounded debt and associated delivery conditions, not retroactive equity or unlimited credit. Cash already delivered to a project is no longer a member's available treasury.

Late payment enters one cure period and pauses that member's unvested new deliveries. After timeout, exit or a presigned replacement procedure may apply without deleting completed-stage rights. Replacements pay for future stages only, not exclusive results already vested elsewhere. Others may continue with sufficient rights/inputs. If indispensable nontransferable equipment or knowledge permissions stop, replace that capability or halt.

**Diligent failure:** charge completed actual services, retain consumed contribution shares, return unused funds/inventory to contributors, and deliver vested failure data. **Unperformed obligation:** fabricated hours, insufficient compute, omitted agreed tests, or diverted funds enter cure/dispute/default based on available evidence. Research uncertainty does not excuse diversion.

Exit notice timing begins at registry receipt. During the default notice period, committed current-stage obligations continue; afterward, unstarted next stages need not begin. Early termination of the current stage follows signed loss-sharing terms or affected-party consent. There is no costless cancel-all-future-debt button. Reserved unused assets release after settlement; consumed samples, time, training, and granted rights do not roll back.

## 8. Executable actions and bounded local automation

The eight clause types remain unchanged. The generic plan action `respond_contract` has common fields `treaty_ref, obligation_ref, operation, evidence_refs`, all referring to contracts/evidence known locally. Each operation opens only necessary extra fields.

| Operation | Additional content and meaning |
| --- | --- |
| `accept_delivery` | Received batch and quantity; only authorized receivers/certifiers may accept, without replacing required quality evidence |
| `submit_evidence` | Already-held inspection, service, or payment records; assertions remain labeled assertions, not authoritative credentials minted by free text |
| `dispute` | Batch, amount/quantity, and bounded reason type; actual review costs follow template; repeated dispute does not reset time |
| `cure` | Missing payment/delivery and required real resources from `cash_cap, asset_refs, service_commitment_refs`; authorization is not arrival/completed training |
| `terminate_notice` | Terminable future stage/scope; signed notice/liquidation rules, without reversing paid/consumed obligations |
| `authorize_release` | Actual custody assets within local authority and contract terms, without third-party conflict; all required permissions must exist |

These operations share reservations/communications with other plans. Receiving a qualified message does not mean remote execution has occurred. `break_treaty` remains explicit deliberate breach, settled under this chapter; `withdraw_offer` applies only before activation. Amendments require new `propose_treaty` versions/signatures. `respond_contract` cannot secretly change prices, success tests, or vested rights.

At signing, long contracts may choose public bounded response templates: pay when the designated inspector qualifies, provide promised service upon payment, notify shortages, return untransferred goods after termination. Templates obey the same accounts, knowledge, and authority, without arbitrary uploaded server code. They keep routine performance moving within annual decision windows; later planning may lawfully change choices not yet executed.

## 9. Early in-kind exchange

Prisoner release/exchange uses separate personnel-release obligations within `peace`; people are not `ProductSpec`. Terms identify known detention records, counts, release location/month, transport, and safe reception. Paired simultaneous verification is allowed. Released people become actual traveling/local free population retaining health, identity, and training, not automatically qualified loyal recruits. The one population ledger transfers them; missing people cannot be created through a collateral valuation.

Paired barter specifies two deliveries, common custody location, batch ratio, and deadline; for example, 2u tools for 5u food. Ownership transfers atomically only when both corresponding qualified batches are actually present. Ownership transfer does not transport goods home for free. An incomplete pair retains original ownership and returns after deadline. Without an executable custodian, first delivery is credit risk, not cross-region atomic exchange.

Settle the maximum complete batch count. Smaller residuals remain with owners rather than becoming fictional cash. Signed charges cover consumed inspection samples and custody food. Unspecified quality differences cannot trigger engine-adjusted quantities using an objective fair market price.

Goods arriving after closure neither transfer automatically nor trigger old payments. Record return-pending goods under original ownership; necessary custody charges follow prior transport/custody terms. New trade needs new authority. Late information actually read remains learned, without reopening the old contract or fabricating timely delivery.

## 10. Paper accounts and attacks

These are constructed local examples, not simulation results. c is an explicit currency unit; u denotes a fixed product specification within each example.

### Example 1: A 180c transfer with partial capability

The buyer escrows 180c: rights 20, documentation 60, engineering verification 100. The first two pass and release 80c; 100c remains. Performance fails under the seller-promised inputs/conditions and cure also fails. The result stage defaults and returns 100c. Previously consumed samples worth 12c and mentor time worth 8c remain charged to their actual accounts, without automatically refunding progress from the paid 80c. The buyer retains documentation, learning, and paid-stage rights.

If engineering instead predefined independently useful installation/calibration for 40c and stable output for 60c, accepted installation raises cumulative payment to 120c, leaving 60c refundable. An indivisible package's claimed 40% completion does not qualify. Checks: repeated installation-acceptance messages do not pay another 40c; resigning does not reset 120c paid; failure with different unagreed materials does not automatically justify a claim.

### Example 2: Buyer sabotage is not free information and compensation

With 80c already settled and 100c engineering escrowed, separately deposit 30c: inspection reservation 10c and buyer performance security up to 20c, total 210c. The buyer dismantles its promised test bench; the designated witness has contemporaneous work/equipment evidence. Testing cannot continue, but engineering is not declared qualified. Evidence pays actual inspection 10c and justified security 20c; return unqualified engineering payment 100c. Accounts are `80 + 10 + 20 + 100 = 210c`. The seller cannot also collect the full undelivered success payment.

Without those terms, security, or available evidence, referee knowledge of malice cannot secretly punish the buyer. The seller bears bounded credit/disclosure risk and may demand different terms later. Neither malicious refusal nor every technical failure automatically dictates the same outcome.

### Example 3: Joint-research delay and failure

A three-month stage plans 60c monthly with A/B/C shares 30/20/10. They deposit stage amounts 90/60/30, total 180c. Two months spend 120c, leaving 30/20/10. A diligent third-month experiment produces a negative result while spending 45c, charged 22.5/15/7.5. Total expense is 165c; return 7.5/5/2.5, totaling 15c. Fixed-point monetary units support fractional c. Members receive agreed failure reports, without a free completed technology node or refund of the consumed 165c.

In a separate monthly-funding branch, C pays nothing in month three and the agreed shares cannot support minimum effective scale. Pause by default; A's 30c and B's 20c do not secretly advance C's share. After six-month cure fails, C's unvested new deliveries end while prior data remains. A/B may agree a later stage or use a presigned bounded advance, without rewriting C's first two months.

Checks: one month's payment does not buy all future outcomes; A cannot divert 180c from the common account to defense; firsthand discovery does not vanish from C's memory; uncertain technical failure differs from proven diversion.

### Example 4: Custody interruption and timeout

A custodian holding 100c unaccepted buyer escrow is occupied. Only 70c remains executable; 30c was actually transferred away. Final close arrives without recovery. Return 70c under the unaccepted default rule and record 30c as a claim/stranded asset against known responsibility, not spendable buyer cash. Later recovery of 12c pays only 12c and leaves 18c claimed, rather than refunding another 100c. The transferred 30c must appear with the appropriator or in evidenced consumption/loss.

If the final signature activated at the registry in M242 but its receipt is traveling, a payer seeing the local offer deadline at M243 cannot release 100c for arms. Timeout closes active fulfillment without deleting claims; slow return communications neither double-spend nor disclose remote outcomes for free.

### Example 5: Partial barter

A deposits 6u tools; B deposits only 10u qualified food. Terms require 3 batches, each 2u tools for 5u food. Only 2 complete: A gets 10u food, B gets 4u tools, and 2u tools remain A's. The missing third batch enters cure; after timeout, remaining tools return or await actual transport. A cannot receive 15u food in advance, and incomplete overall performance does not reverse the two transferred batches.

## 11. Acceptance before and after implementation

These defaults fix states, triggers, time priority, cost ownership, and closure. Technical test recipes, local institutional capacity, measurement precision, and costs remain content calibration. Implementation must test same-month delivery/deadline, signature/withdrawal, nonpayment/cure, partial acceptance/dispute, closure/restored service, and competition among contracts for one asset.

The contract panel shows at least locally last-known status, registry/evidence times, remaining goods/money, paid/unpaid/pending-inspection/stranded amounts, next deadline, executable choices, and known responsibility disagreements. Unknown causes remain unconfirmed rather than one red failure label; private true responsibility stays hidden. Raw events, cost decomposition, and batches support bulk agent reads, with human panels using the same projection.
