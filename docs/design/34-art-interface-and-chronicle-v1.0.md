# Art, interface, and chronicle — v1.0

Status: a design specification, not an implemented renderer or measured performance result. This chapter supersedes the earlier requirement that the entire game use pixel art. It applies to every human view, native-AI observation, LLM observation, replay, and export together with [information boundaries](06-information-and-history.md).

## 1. Art direction: a living, illustrated strategy atlas

Use an original stylized three-dimensional map with a restrained, mostly orthographic camera, readable silhouettes, warm materials, and illustrated cartography. Cities, surrounding villages, mines, workshops, transport corridors, and power networks should form one visible economic landscape. The desired impression is a beautiful model of a civilization that can also be read as a map.

Civilization VI is a useful reference for recognizable shapes, color, settlement sprawl, and map-like fog. Firaxis's [art-director interview](https://store.steampowered.com/news/posts/?appids=289070&enddate=1468936810&feed=steam_community_announcements) explicitly discusses these priorities. Before the Stars should use its own buildings, icons, palette, ornaments, faction symbols, and compositions. It does not need leader cinematics or a copy of Civilization's interface.

The project no longer combines realistic terrain, pixel buildings, and glossy interface panels in the default theme. Small pixel illustrations can survive as optional chronicle ornaments or a later alternate theme; they are not a second required asset pipeline in v1.0. A flat atlas view is a complete low-cost rendering option with identical information and actions.

| Layer | Required visual language | Strategic information |
| --- | --- | --- |
| Terrain | Broad landforms, readable water, restrained surface detail | Passes, rivers, coasts, soil and known resource zones |
| Settlements | Distinct silhouettes for village, city, extraction site, and industrial cluster | Settlement function and observed scale, not individual residents |
| Infrastructure | Roads, rail, ports, grid and supply overlays with direction and capacity cues | Actual routes, dependencies, outages and movement |
| Industry | Modular buildings, era-specific machinery, limited smoke and light | Observed activity, idle capacity, maintenance and conversion |
| Armed forces | Formation markers with three clear role shapes per technological layer | Known position, supply, composition and readiness |
| Knowledge | Illustrated node cards, clear links and expandable requirements | Discovered questions, evidence, engineering and adoption |
| Culture | Population shares, practice cards and local histories | Observed participation and adoption, not hidden response coefficients |
| Fog | Surveyed historical map, uncertain reports and unexplored paper | Last observation date, confidence, missing coverage |

Industrial traditions are visible in infrastructure rather than universal costumes. Steam-heavy regions have boilers, workshops and rail yards; diesel-heavy regions show mobile equipment, fuel storage and road logistics; electrification adds substations, transmission and motors. Cyber and biological applications alter specific facilities. A country may contain all of these at once. The renderer must not turn a discovered technology into buildings that have not actually been constructed.

Culture is not assigned a permanent racial building set. Local construction materials, wealth, practical methods, exchanges and past rebuilding shape architecture. Fictional religious symbols are generated from an original, reviewed vocabulary. No symbol carries an unannounced statistical bonus.

## 2. What “better graphics” means for this game

Prioritize, in order: truthful and legible information; a consistent visual identity; attractive terrain and settlement composition; clear transitions over time; smooth interaction; optional close-up detail. Polygon count, ray tracing, cinematic faces and numerous animated citizens are not primary quality measures.

Anthropic's [Fable 5.2 announcement](https://www.anthropic.com/claude-fable-and-mythos-5-2) includes a Unity testimonial about stronger 3D-scene creation and difficult game-development tasks. That supports evaluating such tools during production. It does not establish the frame rate, coherent asset coverage, accessibility, or quality of this particular game. Generated samples must pass the same review as other assets. No development model is required at runtime.

The production acceptance scene must contain a crowded coast, a rural catchment, a mine, two competing industrial traditions, an army, a transport interruption, a fog boundary and open information panels. Review it at three camera distances and with reduced motion. A beautiful empty landscape is insufficient.

Provisional acceptance targets, to be measured on a declared baseline MacBook and an integrated-GPU browser device:

| Target | Baseline requirement |
| --- | --- |
| Strategic view | Stable 30 fps at 1440 × 900; 60 fps is the preferred tier |
| Input response | Ordinary selection/panel feedback within 100 ms, excluding network and turn resolution |
| Readability | Main text remains readable at 100% scale; optional 125–150% scale and color-independent markings |
| Detail scaling | Lower shadows, water, particles and vegetation without removing information |
| Headless play | No renderer, animation or image-generation dependency |
| Loading | Incremental visible-region assets; loading behavior must not expose hidden map contents |

These are product targets, not achieved benchmarks. Lock asset and memory budgets only after the reference scene is measured. The authoritative simulation does not update more frequently because the camera zooms in. Decorative structures are instances, not simulation entities. Animation can be skipped without skipping a game event or changing its time.

## 3. Technology and culture presentation

Use the legibility of a Civilization-style card graph while changing what the graph means. [Chapter 31](31-knowledge-and-culture-v1.0.md) defines the mechanics; this section defines the interface contract.

There are four useful views: **Frontier** for current questions and clues; **Known graph** for discovered relationships; **Implementation** for real projects and operating capability; **History** for how a capability or practice became established. The full hidden graph is never a client-side dataset with a visual mask.

Technology cards distinguish rumor, investigated question, reproducible knowledge, demonstrated method and functioning capacity. A learned method can coexist with unavailable equipment or expired operating qualifications. A project card shows committed and consumed inputs, actual work, known bottlenecks, next review date, credible cost/time ranges and their sources. It must not show a guaranteed success chance computed from hidden state.

Culture cards distinguish an observed practice, a legal permission, an institution able to support it, local participation and durable adoption. They display population coverage and geography. There is no spendable national culture currency, instantaneous adoption button or single percentage declaring that the country has “completed” a culture.

Known links may appear only after their relationship has been learned. Unknown future nodes have no preallocated slots, exact count, recognizable icon silhouettes, blank era columns or stable hidden IDs. A clue can legitimately say that a reported method needs better measurement without revealing every later instrument. Player-authored notes and hypotheses are visually distinct from verified discoveries.

Card positions should remain stable within a player's known graph where possible. Opening a new branch appends or locally rearranges visible cards; invisible graph changes cannot move visible cards, alter the scrollbar or trigger a notification. Graph search only searches the visible projection. The same restriction applies to accessibility labels, saved layouts, tooltips and exported images.

## 4. One information model for people and agents

| Panel | Default question | Expandable evidence and actions |
| --- | --- | --- |
| Round briefing | What changed, and what requires a decision? | Three to five material developments; deadlines and unresolved commitments |
| Economy and network | Which missing service blocks useful output? | Flow diagrams, prices, inventories, accounts, route capacity and maintenance |
| Population and education | Who can work, learn, serve, or needs support? | Age structure, access, actual qualifications, course queues and surveys |
| Knowledge and practices | What can we investigate or implement? | Visible graph, experiments, licenses, institutions and adoption history |
| Domestic politics | Who can help or obstruct this plan? | Actual rights, assets, demands, commitments and recorded behavior |
| Diplomacy | What can I believe and commit to? | Selected partners, messages, evidence, offers, signatures, obligations and disputes |
| Military and control | Can the force operate and the government govern? | Supply, trained roles, command capacity, deployments and local services |
| Chronicle | How did we arrive here? | Events, processes, disputed accounts, historical maps and source links |

Every displayed number has a unit, period, source, coverage, observation time and status: verified, reported, estimated, forecast, or unknown. An estimate is not labeled “exact” simply because the engine knows the truth. Changes should reconcile to visible receipts where possible. Missing evidence remains missing.

Human controls and agent commands share the same authorization and resource checks. Humans receive useful visual aggregation; agents receive equivalent structured aggregates, pagination and evidence links. A chart cannot secretly reveal a trend that is omitted from the agent view, and a machine endpoint cannot return the hidden state behind a human chart. UI convenience is not a different ruleset.

## 5. Chronicle reference: Civilization's Historic Moments

The user's final direction is a Civilization-style chronicle, specifically the illustrated Historic Moments and Timeline presentation of Civilization VI: Rise and Fall. The [official announcement](https://steamcommunity.com/games/289070/announcements/detail/1465222576769486958) describes turning points and an illustrated timeline; [2K's release overview](https://newsroom.2k.com/news/sid-meiers-civilizationr-vi-rise-and-fall-available-now) identifies it as a visual journey through a civilization's history. This supersedes the earlier suggestion to use civ-atlas as the chronicle model. That repository remains a geography/world-generation reference only.

The primary screen is a horizontally browsable illustrated timeline, not a generated history book. Each major moment has a date or interval, short title, original vignette, one or two sentences, and a clear category. Selecting it opens an optional detail drawer with consequences, contemporary reports, relevant map location and evidence. A short end-of-round toast adds a new card without forcing a modal interruption.

The moment catalog includes first established settlement; first sustained food surplus; first reliable school or instrument workshop; a locally demonstrated technology; a major transition in production; an enduring cultural practice; a fictional religion's founding; a consequential treaty or license; a migration; a defeat, famine or recovery; global integration; and authorized endgame milestones. Use actual completed capabilities rather than merely clicking a research button. A lasting transformation can span years and need not be reduced to a single discovery date.

Maintain a national timeline during play and, after authorized disclosure, a synchronized world timeline for comparison. A “first in the world” badge is only shown if the seat can legitimately verify it; an unknown rival's achievement must not leak through a missing badge. Historical pictures contain no secret geography or future technology. All artwork is original and selected from versioned templates, with bounded combinations for geography, activity and era.

Scientific transitions, domestic institutions, trade dependence, disputed information and delayed consequences receive attention alongside conquest. Chronology is a presentation layer, not a second victory system: no era-score currency, automatic golden-age multiplier or reward for repeatedly creating the same moment. If a real event changes confidence or institutions, the simulation applies its existing mechanisms once; creating its card adds nothing.

Do not add individual family trees or simulate every named citizen just to produce stories. Named roles can label actual institutions, delegations and project teams; their biographies cannot create nonexistent strategic actors. Optional long-form prose is a secondary export, never the main chronicle or a prerequisite for it.

## 6. Chronicle pipeline and records

The pipeline is: committed authoritative events → seat-specific observation projection → visible process grouping → deterministic narrative templates → optional prose styling. Permission filtering happens **before** summarization, significance ranking, retrieval and any language-model request.

| Record | Required information | Ownership |
| --- | --- | --- |
| FactEvent | Stable private ID, month, entities, state changes, decision references, actual input events, rules/content versions | Referee only until authorized disclosure |
| ObservationRecord | Seat-visible handle, source, observed claim, event-time estimate, receipt time, coverage and uncertainty | The observing seat |
| ProcessRecord | Visible component handles, interval, measured changes, grouping rule and revision | The same visible audience |
| ChronicleEntry | Title, text/template, scope, interval, epistemic labels, evidence handles and generation version | Audience-specific output |
| Interpretation | Author/source, claim, supporting/contradicting evidence, recorded date | Explicitly attributed; never engine truth |
| ReplayBranch | Parent checkpoint, branch ID, changed decisions, rules and result scope | Post-match or authorized analysis only |

Facts remain append-only. Corrected reports create new records linked to the older claim. Historical names use the event-time name snapshot; renaming a nation does not rewrite its previous treaties. Foreign information learned in month 40 about an event in month 31 appears as “reported in 40; said to have occurred in 31.” A live timeline must not backdate knowledge into earlier observations.

Grouping rules merge repeated incidents into a process without deleting the supporting records: a blockade and its interruptions; a migration wave; a course program producing several graduating cohorts; a region moving from subsistence to imported food; a sequence of failed experiments followed by a verified method. A later assessment can promote an old event's significance by adding an annotation. It cannot retroactively create knowledge that a player lacked.

Significance is based on observed scale, duration, novelty, consequences and selected interests. Use category diversity and repetition suppression so wars cannot crowd out every economic or cultural development. Significance never awards research progress, prestige, currency, reward or cultural adoption. Splitting one project into a hundred events therefore cannot farm a narrative benefit.

## 7. Useful causal stories without an oracle

Chronicles may state direct, recorded mechanisms: a shipment arrived; the licensed instrument was installed; a course completed; a factory began producing after its required inputs were supplied. They may show a decision's committed cost and subsequent observable effects. A dependency reference proves that a recorded input was used, not that the decision was the unique or optimal cause of history.

Hidden cultural response functions and opponents' intentions stay hidden. “Workshop applications rose after the housing program” can be supported by a survey. “Housing raised the secret urban preference coefficient by 0.07” is forbidden. A domestic official's explanation remains that official's claim, including when wrong.

Post-match comparison may replay an explicitly changed decision, but it must label the branch, frozen opponent-policy assumptions and uncertainty. One replay is not proof that an action would always have won. Competitive seats never receive a free live counterfactual computed from the real hidden state.

Example, fictional and conditional:

> Months 145–168 — The instrumentation agreement. Riverplain paid for a limited calibration license and trained two local cohorts. Its first accepted production batch arrived in month 168. Harbor's public statement called the agreement a lasting partnership; Riverplain's negotiators described it as a temporary dependency. A later export restriction interrupted replacements. The records establish the deliveries and interruption; they do not establish either government's private intentions.

The story links to the signed scope, payments, training completion, production receipt, restriction and each attributed statement. A third civilization sees only the parts it actually learned. A false enemy boast may appear as a boast, never as a verified breakthrough.

## 8. Narrative modes and export

During a match, each seat can browse its illustrated Historic Moments timeline, watch a short round recap, follow a region/project/network, and export its authorized record. All are read-only queries; they do not advance time or reroll events. Free-text export cannot become a covert fourth diplomatic contact or an unmetered broadcast channel.

After the match closes and disclosure is authorized, offer a world atlas timeline, parallel national accounts, a treaty and discovery chronology, an economic transformation story, and a documented victory/failure account. Competitive elimination alone does not grant omniscient spectator access while others are still playing. Public sharing of an ongoing match uses delayed or seat-scoped views according to the match policy.

Exports: Markdown and JSON first; illustrated HTML/print output and short rendered recaps later. A human-readable document includes evidence links or an accompanying index. Generated prose is labeled, reproducible where a fixed template is used, and separately versioned from the historical data.

The baseline chronicle works offline with deterministic templates and no LLM. Optional writing receives only authorized records, cannot introduce facts or executable instructions, and cannot alter the world. Unsupported claims are rejected or removed with a recorded warning. A failed writer falls back to the template. Generation cost is external presentation cost, not the civilization's in-game compute consumption.

## 9. Performance and acceptance

The referee logs consequential state deltas and compact ledger batches, not one narrative sentence per resident or transaction. Raw ledgers support audits; indexed events support discovery; summaries are cached per audience, snapshot and projection version. Private changes do not invalidate another seat's visible cache or change its result counts. Queries have explicit pagination and size limits.

Acceptance cases must cover: hidden breakthrough; forged report; delayed report; renamed polity; disputed treaty; repeated failed experiments; partial shipment; regional cultural divergence; migration without population duplication; eliminated spectator; and a post-match counterfactual branch. Repeated prose generation must not create additional events, messages, randomness, rewards or resource use in the simulation.

The visual vertical slice and chronicle vertical slice are separate gates. Both must pass information-isolation checks before a polished public demo is described as competition-ready.
