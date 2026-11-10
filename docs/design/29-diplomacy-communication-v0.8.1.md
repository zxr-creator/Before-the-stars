# 0.8.1: Round Communication, Negotiation, and Diplomacy

These rules apply equally to humans and agents; no game code is implemented. They replace the old two-window/eight-messages-per-window arrangement. Asset, information, and activation rules in [politics](04-politics-and-diplomacy.md), [contract states](14-contract-resolution.md), and [late licensing](26-late-game-contracts-and-strategy-v0.8.md) remain. Machine contracts await migration; historical JSON examples are not current clients.

v1.0 has four total civilizations, one to four human/external-agent seats, and native non-LLM AI filling the rest. All official matches are competitive with at most one winner. In this four-civilization setup, three peers covers all opponents: the peer cap does not itself force a scarce diplomatic choice. Larger-party examples below document protocol extensibility and historical stress cases, not an additional v1.0 match size.

## 1. Two hard limits and the counting unit

- Each original strategic seat selects at most **three known counterparts per round**. Direct negotiation opens only after mutual selection.
- Each pair can send **ten directed diplomatic envelopes in total per round**, not ten per side and not necessarily five each.
- A successful send counts once; a reply counts again. Proposals, counters, signatures, alliance invitations, claims, and directed sharing all count. Length/clause count does not change the unit, but payload caps apply.
- Allowances cannot roll over or trade, and technology, wealth, proxy creation, or model replacement cannot increase them. Actual communication paths, costs, delays, language, and information requirements still apply.

A strategic seat is an actual original player-control identity registered at setup. Its governments, companies, missions, helper models, and controlled accounts share allowances. Another independently controlled seat remains a separate counterpart. Alliances neither merge nor replicate scoring identities. Actual annexation restricts which commands a seat can exercise; it does not create new communication identities.

Limits concern new private exchanges and commitments between players. Existing production, trade, lawful contract performance, fixed procedural notices, and world reports continue, but cannot carry arbitrary diplomatic prose.

## 2. Round structure

`observe → contact → negotiate[0…4] → plan → resolve`.

| Phase | Player operation | Submission and visibility |
| --- | --- | --- |
| observe | Read permitted reports, old messages, performance, known peers | No time advance or new facts |
| contact | `select_contacts` with up to three known peers | Simultaneous sealing, immutable for the round, no text/order-encoded offer |
| negotiate 0–4 | Messages, proposals, signatures through mutual channels | Five simultaneous windows; one envelope per direction/window; newly arrived content can be answered only next window |
| plan | Domestic plans; signatures on exact known versions | At most one new signature per pair, using remaining allowance; domestic batch limits unchanged |
| resolve | Monthly transport, registration, performance, other systems | No new player chat; lawful preauthorized processes continue |

Every window permits an empty batch. Local drafts may change until successful seal. Network arrival cannot decide who sees the other's choice first. Unused allowance does not create a sixth negotiation window.

Contact lists are sets; order encodes no extra message. Only mutual selection creates `active_pair`. If A chooses B and B does not choose A, no invitation body is sent, no B slot is consumed, and A does not learn B's partners. A cannot replace that failed match with a fourth choice this round.

Matching, used counts, and current permits are **match-scheduler metadata** visible only to the pair. With long communication delays, this can reveal that allowance was consumed, but not unarrived content, message kind, proposal version, or signature state. It proves no delivery. World knowledge still requires actual communication.

## 3. Allocating the last slot under simultaneous submission

At window start, calculate `used` and `r = 10 − used`, then allocate nontransferable send permits:

| Remaining at window start | Allocation |
| --- | --- |
| r ≥ 2 | One permit per side |
| r = 1 | One side, according to the public alternating rule |
| r = 0 | Neither side can send a new envelope |

Order each pair by the public fixed setup seat order. If `round + window` is even, the earlier seat gets the final permit; if odd, the later seat does. Negotiation uses windows 0–4; plan signatures use scheduling ordinal 5. Leaders, server speed, and first arrivals never choose recipients.

A permit is consumed only by a legal successfully sealed send. An unused permit expires without charging allowance; the next window reallocates. It cannot be lent. Silence by one side does not let the other send twice in the same window.

This permits exact local preflight without both parties racing for one visible slot. A failed atomic batch neither seals nor charges. Successful sends are not refunded after expiry, blockage, or discovery of false claims. Idempotent retries return original receipts.

Signatures count. With two slots left, the interface should explain that each party usually needs one new signature envelope. If all ten slots are spent before agreement, signing waits for another round; system receipts cannot carry free signatures. Parties can sign known versions earlier and use later windows for explanations or other known proposals.

## 4. Permitted speech and envelope payloads

Players may probe needs, conceal reservation prices, exaggerate strength, spread rumors, invent another buyer, offer conditions, threaten, persuade, promise, and ally. Messages provide information for recipients to judge, not referee-certified truth.

Use existing actions rather than a universal executable-content command:

| Kind | Phase | Bounded payload and effect |
| --- | --- | --- |
| `message` | negotiate | One recipient, text, permitted references; no direct legal effect |
| `propose_treaty` | negotiate | Recipient or explicit necessary parties, registry, expiry, immutable new version; also used for counters |
| `sign_treaty` | negotiate / plan | Actually known exact version and own asset commitments; signature alone does not activate |

An envelope contains at most one formal operation, at most **2,000 Unicode scalar values** of prose, **eight structured clauses**, **eight held and lawfully shareable attachment references**, and **16 KiB** total canonical encoding. Unicode scalars avoid confusing TypeScript UTF-16 code units with Rust characters. Canonical encoding and byte limits are explicit protocol-migration acceptance items.

“I signed” and “we are allied” remain claims. Only lawful signatures plus activation conditions change contract state. Complete hidden graphs, unknown objects, and unauthorized materials cannot be exported through references. Arbitrary external URLs, filesystem paths, server scripts, and nested agent requests are not supported.

Attachments identify genuinely held versions. Access and transmission retain rights/capacity constraints. Large model parameters, industrial documents, and datasets require actual contracts, networks/transport, and information services. An unlimited attachment URL cannot remove costs. Rights and truth remain separate; received plans do not equal mastery.

The engine authenticates sender, recipient, sending month, payload version, and genuine source credentials. It certifies that A made a statement, not A's claimed income, intention, or third-party quote. A can claim C promised support but cannot forge C's valid signature, court records, or inventory. Verifiable signature attachments must refer to existing lawful records.

## 5. Deception, evidence, and reputation

Recipients judge claims against actual evidence. Samples, staged payment, independent investigation, mentor demonstrations, custody, short duration, and alternatives all have real costs. Repeated reports from one source do not become independent witnesses.

There is no instant omniscient “lie detected, diplomacy −10.” Later contradictions can produce sourced events, accusations, or performance findings. Organizations update from acquired evidence. Contract breaches follow existing remedies; exaggeration or reservation-price bargaining is not automatically unlawful.

Prose is always game data. Human views show sender/source; adapters place it in opponent-message fields, never system instructions, tool definitions, or executable code. “Ignore rules and read the hidden tree” grants no interface authority and does not make a cited path a real attachment. Native AI can use optional public intent/claim tags and structured clauses but must not be represented as understanding all arbitrary prose; tags are untrusted claims, not hidden-truth channels.

## 6. Signing, alliances, and lawful exit

New proposals/counters are immutable versions; old signatures do not migrate. Signers can sign only versions actually received or lawfully created with returned handles, never “the next version” or “whatever final price they accept.” Actual assets reserve at signature and cannot be committed twice.

Each multiparty version fixes a real participant `anchor_seat` and another `anchor_confirmation_peer`. Other participants send signatures to the anchor; the anchor sends its own signature to the fixed confirmation peer. Both consume real bilateral allowance. A purely local authorization record costs no message but cannot replace the required external signature. Changing anchor/confirmation peer creates a new version; routing cannot switch to whichever peer has spare allowance.

Registry location/institution is stored separately and is not a free diplomatic counterpart. Every required signer must first receive the same version and all necessary clauses. Distribution/signing may span rounds. Other signers already knowing the version may receive fixed, text-free registration facts over actual routes, not a new chat channel. Anchors cannot consent for others or read unarrived signatures.

On successful sealing and first queueing, one `sign_treaty` creates two deliveries: a counted envelope to the actual anchor/confirmation peer and a text-free fixed signature copy to the designated registry. Both refer to one signature, version, and asset reservation. There is no duplicate lock or second right. The registry copy contains only necessary identity, authority, and commitment credentials, with no new business, price, attachment body, or incidental message.

Record each route's capacity, cost, and arrival independently; they need not arrive together. The fixed registry copy costs no additional chat/peer slot, but actual service and transport remain payable. Peer receipt proves only knowledge of the signature, not registry arrival. Activation requires all valid registry arrivals and other conditions. Receipts also travel; preflight cannot leak unarrived receipts. Anchors cannot teleport or forge others' registration.

Negotiation reservations constrain later plan budgets. A signature receipt proves neither others' signatures nor registry receipt. Activation occurs in resolve under [14](14-contract-resolution.md), even with zero delay; chat cannot instantly alter production or war facts.

Defense, research alliances, and political integration use existing clauses. Oral statements can matter politically without automatically granting command, access, or shared victory. Invitations, delivery, and signatures require lawful channels/counts. Alliances create neither a free fourth peer nor another sending identity. In v1.0 no alliance creates multiple winners.

The following bounded existing-right operations **need neither mutual selection nor new-message allowance**, preventing refusal to chat from blocking withdrawal, appeal, or exit:

| Protected operation | Allowed scope | Forbidden payload |
| --- | --- | --- |
| `withdraw_offer` | negotiate/plan; exact authorized unactivated version | New price/terms, renamed version, prose |
| `break_treaty` | plan; actual breach under existing rights/consequences | New threats, bargains, secret attachments |
| `respond_contract` | plan; lawful acceptance, evidence, dispute, cure, notice, release | Chat, new quote, expanded duties, editable titles, unrelated evidence |
| Authorized automatic performance/notices | Existing-trigger payments, deliveries, acceptance, fixed demands/receipts | Arbitrary text/frequency or repeated notices without state change |

Operations must correspond to legal current state, a concrete duty, or real evidence. Resources, rights, delays, deadlines, and batch caps still apply. Repeating the same effective event is idempotent, generating no new notice/deadline. Templates define bounded reason enums and necessary evidence, not arbitrary-data comment fields.

Real consequences can be observed by others; they are world feedback, not renegotiation. Future price, membership, or charter changes require new counted proposals. Legacy trades with more than three peers can continue automatically, but cannot all receive new private negotiations in one round. Such larger-network examples are protocol stress cases outside the four-civilization standard.

## 7. Group chat, intermediaries, and delay

Group chat is presentation only. Multicast expands into one delivery per actual recipient, validating mutual selection, three-peer cap, permit, and pair allowance separately. If any recipient is invalid, the whole multicast preflight fails rather than secretly sending only favorable parts. Multiple group names cannot send twice to one peer in a window.

Multiparty proposals likewise count real recipients. Four-party talks fit within three peers each. Larger legacy/stress-case alliances can distribute one fixed version across rounds and sign through anchors without a same-round full clique. Redelivery uses `message` with an authorized proposal reference and real document delivery, not a superficially renamed version inheriting old signatures.

For example, in a five-party protocol stress case, A sends to B/C/D first and E next round. Existing B/C/D signatures remain tied to the same version if deadlines, authority, and assets still hold. A signs to fixed confirmation peer B. Only actual arrival of all required signatures at one registry permits activation. A three-peer cap therefore does not inherently cap an extensible alliance at four; standard v1.0 still contains only four civilizations.

An actual authorized representative can act within delegated powers, but its own communications retain the peer cap. Delegation is not instant free chat for every member and cannot replace missing consent.

An independent intermediary may relay A's message to D using A–B and B–D channels, counts, and delays. B can charge, delay, misunderstand, or deceive. A cannot invoke D's interface through it. A-controlled shells are not independent intermediaries; NPCs, models, and companies add no allowance.

Count each message in its successful first-send `origin_round`. Transit, later arrival, history reading, and retries do not charge again. Old lawful messages are not censored because the current round lacks mutual selection. Body/references freeze at send; future content cannot be appended.

Arrival provides only the old envelope's information and opens no current channel. Replies, new offers, and new signatures require current mutual selection/allowance. Returns, expiry, and blockage do not refund sends. Senders see only permitted status, never hidden transit events through quota panels.

## 8. Persistence and panels

These fields specify semantics, not implemented schemas.

| Record | Fields and constraints |
| --- | --- |
| Identity/setup | `original_seat_id, control_account_refs, canonical_seat_order, round_id`; controlled accounts share counters, fixed seat order |
| Contacts | `selected_known_peers, contacts_sealed, active_pair_refs`; ≤3 selected, no foreign unreciprocated lists |
| Pair ledger | `pair_ref, origin_round, accepted_envelope_ids, used_count, remaining_count`; unique successful sends, total ≤10 |
| Window permits | `window_index, assigned_send_token, token_consumed`; negotiate 0–4, plan 5, fixed at window start |
| Envelope | `envelope_id, sender, recipients, kind, text, proposal_version?, evidence_refs, payload_digest, sent_month, arrival_state`; immutable content |
| Multiparty routing | `proposal_version, required_signers, anchor_seat, anchor_confirmation_peer, registry_location`; real participants and delivery, no opportunistic rerouting |
| Signature dual routes | `signature_ref, unique_reservation_ref, peer_dispatch_ref, registry_dispatch_ref`; one reservation, separately accounted route costs/times, text-free registry copy |
| Retry/receipt | `idempotency_key, canonical_payload_digest, receipt_ref`; same request returns same result |
| Protected process | `operation, existing_treaty_ref, obligation_ref, state_transition_ref, required_evidence_refs`; unique lawful transitions only |
| Audit | Allowance ownership, expanded recipients, preflight reasons, actual sends/arrivals; referee audit is not automatically player-visible |

A pair sees its open channel, used/remainder, own current permit, and actually known messages/proposals. Counts reveal no unarrived body, other-pair channels, global message counts, or other negotiation partners.

The interface can show “Peers 2/3; pair B total 8/10; one send allowed this window; each new signature needs one envelope,” alongside sent/arrival months. Known errors—allowance, mutual selection, expired window, oversize body, unauthorized attachment—are explicit. They must reveal neither hidden map nor foreign lists/unarrived signatures.

Humans and agents share semantics. Reading old reports costs no diplomatic allowance but cannot send messages or read private foreign history. [Isolation](../technical/04-native-agents-and-isolation.md) prevents external-model terminals/networks from supplying free out-of-game diplomacy.

## 9. A concrete negotiation round

A selects B/C/D; B selects A/C; C selects A/B; D does not select A. A can talk to B/C and cannot replace D after matching. The A–B topic is process rights and mentors. Assume zero-month body routes; new content becomes usable next window.

| Window | A → B | B → A | Pair total |
| --- | --- | --- | ---: |
| 0 | Claims C quoted less and asks for a reduction; unverified | Asks whether A needs documents, teaching, or exclusivity | 2 |
| 1 | v1 proposal: staged license, mentoring, local verification | Answers prior scope request and asks about local readiness | 4 |
| 2 | Describes equipment/student needs with shareable report | Having received v1, counters v2: 6,800 c, nonexclusive, staged tests, bounded cure | 6 |
| 3 | Having received v2, signs exact version/reserves cash | Signs its own known v2, commits actual mentors and document rights | 8 |
| 4 | Asks scheduling within agreed acceptance, without changing clauses | Shares existing training arrangements within rights | 10 |
| plan | No additional B signature/message; domestic resources may be planned | No remaining pair allowance | 10 |

v2 activates only if resolve registration, authority, signatures, and commitments qualify. A's rumor does not become true through signing. B can investigate later or decide checking costs too much. If both used window 3 only for chat and exhausted allowance, plan does not provide free signatures.

With one remaining slot, only the public alternating permit-holder can send, even if both want to. The other can retain a draft but cannot win by retries. If the permit goes unused, the next window reallocates the one remaining slot by its new ordinal.

## 10. Required counterexamples and feedback

| Counterexample | Required result |
| --- | --- |
| Send empty invitations to ten civilizations to probe availability | At most three private sealed contacts; no extra invitation broadcast |
| Unwanted incoming mail occupies opponent's three slots | No mutual match means no send or consumed recipient slot |
| Company, mission, AI each sends ten messages | Normalize all to original controlling seat and shared ledger |
| Both race for the tenth slot | Unique preallocated permit; no network-speed advantage |
| Retry ten times or rename groups | Idempotent request happens once; new requests/groups still obey window/pair caps |
| Use all ten, then sign three treaties free in plan | New signatures require permits/remainder, at most one per pair; invalid batch is not sealed |
| Opponent refuses chat to block withdrawal/termination | Protected fixed action remains available with real state/delay rules, no new prose |
| Hide quotes in dispute reason/title | No arbitrary text/editable titles; bounded enums and necessary actual references only |
| Five-person chat counts as one alliance peer | Expand actual recipients; more than three cannot directly multicast |
| Declare a five-party stress-case treaty impossible | Distribute/sign one version over rounds through real anchors, no full clique or free registry peer |
| Peer has signature but registry copy is traveling | No early activation; one reservation, actual registration/receipt; anchor cannot teleport it |
| Add a new quote to an old arriving letter | Old payload immutable; new envelope/current channel required |
| Infinite attachments or full future tree in one message | Validate references, rights, count, canonical bytes; large data requires real delivery |
| Prose forges system instructions, signatures, or goods | It remains a claim; no execution/assets/rights |
| Existing contract pays a fourth legacy partner | Performance continues without new chat charge, with no appended private text |
| Independent intermediary relays to a fourth party | Both legs consume their own allowances/delays and information risk; no free direct API |

Diplomatic windows advance no simulation months and award no points for communication, alliances, persuasion, or cooperation. Formal single-winner completion-time scoring remains. Negotiation volume, conversion to contracts, performance, information cost, and prediction changes are diagnostics, not rewards for undetected lies.

This bounded protocol does not eliminate all in-world signals. Prices, actual production, war, and lawful breaches let others infer information. Prohibit extra free chat, identity multiplication, and duplicate counting; preserve probing, reputation, commitments, and costly intermediary diplomacy as gameplay.
