# 0.5 — Dynamic Knowledge, Culture, and Organizations

This referee specification unifies technology trees, cultural-practice graphs, cultural profiles, and religious organizations. It is excluded from seat packages. Numbers are versioned design baselines; calibration cannot alter a sealed match. See the [state catalog](../technical/06-state-variable-catalog.md) for variables and the [monthly engine sequence](../technical/07-monthly-engine-spec.md) for read/write ordering. The clarifications in [v1.0 knowledge and culture](31-knowledge-and-culture-v1.0.md) and [v1.0 population](32-population-and-education-v1.0.md) supersede revised details, including individual-family transmission bookkeeping.

Complete v0.6 nodes, cultural directions, courses, and transitions appear in [17](17-technology-atlas-v0.6.md), [18](18-cultural-atlas-v0.6.md), [19](19-education-and-transmission-v0.6.md), and [20](20-dynamic-development-v0.6.md). Within one `content_version`, complete graphs, AND/OR dependencies, discovery/unlock rules, practice conditions, and scientific/FTL assumptions are identical across matches. Seeds alter world state and experience, not the graph. These state machines remain valid. Steam and diesel require cross-domain conversion; FTL is separately labeled final-stage fiction.

## Four distinct objects

| Object | Actual content | How it changes |
| --- | --- | --- |
| Complete technology graph | All versioned questions, capabilities, recipes, engineering dependencies, and scientific/FTL assumptions | Content-version changes only; identical across matches and unchanged during play |
| Civilization knowledge graph | Local clues, evidence, explanations, prototypes, and historical adoption | Observation, research, and actual teaching; no direct copy of the world graph |
| Practice graph and adoption records | Fixed methods of transmission, cooperation, ownership, education, and organization, with prerequisites; separate population practice states | Fixed graph unchanged; ideas encountered, organizations experiment, populations adopt or leave; history may recur |
| Population cultural profiles | Eight tendencies, actual practices, language/obligations, transmission experience | Local learning, migration, generational replacement, and organization, with inertia |

Religious movements, organizations, and definitions fixed after founding are separate. Losing a factory does not erase technical knowledge. Discovering a practice does not make everyone adopt it. A shared religion does not imply shared culture. Government policy is not population belief.

## Fixed content and world initialization

Content must explicitly define capability tags and units, stage dependencies, discovery signals, minimum inputs, outputs, independently testable tasks, adaptation conditions, transmission, and future clues. Tags cannot be era points without physical use.

1. Author every final interface and its energy, material, measurement, control, manufacturing, organizational, and cross-domain implementations. Steam pressure itself cannot be an FTL principle. Scientific/FTL assumptions belong to content, not world randomness.
2. Decompose implementations into fixed theory, experimental, process, equipment, and scaled-adoption dependencies, retaining all AND/OR options. Every noninitial node needs a discovery entry from subsistence or an earlier capability. Legitimate transfer/prototyping alternatives are predefined.
3. Validate capability ordering, discovery entries, and interface compatibility. Resolve industrial input cycles through cross-month inventory, service-production ordering, and startup equipment; not every economic cycle is an invalid technology cycle.
4. Load and verify the same content-graph hash in every match, then generate terrain, quality, connectivity, population, and organizations. Materials can affect whether a recipe works locally but cannot remove it or change its prerequisites.
5. Establish local known subgraphs and discovery conditions using fixed rules. The same entry produces signals according to real activities, observations, and contacts, not separately sampled regional unlock rules.
6. Check independent paths, startup requirements, and actual economic reachability for each civilization, plus at least two final paths with different cost structures worldwide. Regenerate invalid worlds; reject defective content versions rather than silently rewiring edges.
7. Save the graph hash, private world state, and trial random streams. Lazy instantiation caches templates and task/observation records; it never creates capabilities, dependencies, or discovery rules, and never changes a route based on player performance.

Identical material, process, and equipment conditions obey identical rules. Regional differences arise from actual quality, environment, equipment, and skills. No hidden civilization coefficient may make an otherwise identical experiment necessarily fail elsewhere. Regional parameters must resolve to meaningful conditions.

## Knowledge and project transitions

| Previous state | Trigger and real inputs | New state and retained facts |
| --- | --- | --- |
| unknown | A production problem, observation, contact, or paid survey creates an allowed signal | hinted; only a clue handle, no node count or future tier |
| hinted | Real methods classify the problem and collect sufficient relevant evidence | discovered; local node handle and known conditions |
| discovered | An authorized project actually starts with personnel, material, and equipment | investigating; sealing an order alone is insufficient |
| investigating | Required explanation/measurement tasks and checks succeed | understood; failure can retain evidence, unused resources are not charged |
| understood | A prototype meeting input specifications passes acceptance | prototyped; one prototype is not mass production |
| prototyped | Required scale, sustained-operation, and organizational tasks succeed | adopted; actual coverage and currently usable capability remain separate |

Suspension, bankruptcy, and war damage interrupt tasks without reversing proven understanding. Historical adoption and current capacity differ. Copying drawings does not automatically pass comprehension, practical, or scale tests. Teams with the necessary foundations can use shorter verification courses rather than repeating the full original research cost. If evidence later proves wrong, append a correction and credibility state; do not delete history or restore consumed resources.

Each milestone uses explicit work units such as qualified team-hours, valid sample batches, or operating months. Units are not exchangeable across projects. Monthly executable work is limited by the minimum support from materials, people, instrument time, energy, and compute. Charge actual executed tasks and record their outputs as evidence and task records. Only results satisfying the acceptance template advance a stage; spending is not work.

Experimental outcomes distinguish repeatable physical measurement, equipment/environmental error, and uncertain adaptation. Sealed conditions define private truth; actual trial identity addresses measurement randomness. Renaming or canceling/recreating projects creates no extra trial. Repetition may improve confidence, but samples sharing instrument or material defects are not independent verification.

Known physical thresholds, procurement specifications, and contract acceptance can be public. Unknown adaptation and undiscovered prerequisites cannot be answered through a `satisfied` field. Failure reports show observable measurements, costs, and uncertainty, not an uninformative “technology mismatch.”

## Traditions, stagnation, and licensing

Steam, diesel, electrical, and computing traditions are joint investments in equipment, processes, skills, and interfaces, not immutable national classes. Conversion may require refitting; some skills transfer; bought components can avoid local construction while creating dependencies. Compatible capabilities can combine. An OR edge is not a free, lossless switch.

Stagnation has three separately addressable causes: insufficient evidence; understanding without complementary engineering; or a viable process without adoption, rights, or demand. Investigation, instruments, training, licensing, logistics, and reform affect different constraints. There is no additional hidden national stagnation penalty.

Licenses separately convey rights, documents, teaching, equipment, and guarantees. Actual delivery and learning produce knowledge transfer. [Contracts](14-contract-resolution.md) govern performance and payment; this document governs acquired understanding and capability. Do not collapse both into a single “contract succeeded, technology adopted” boolean.

## Discovering, piloting, and operating practices

Knowledge and adoption are separate axes. Knowledge is unknown/hinted/recognized; local execution is inactive/piloting/operating/suspended. Every organization, settlement, and population has its own adoption count and coverage, not a nationwide switch.

| Transition | Conditions and costs | Failure or exit |
| --- | --- | --- |
| Contact → recognized | Actual contact, translation, demonstration, or an intelligible local proposal | Encountering a claim does not imply acceptance or understanding all execution conditions |
| inactive → piloting | Known template, lawful authority, participants, real inputs | No trials on inaccessible objects or unauthorized enemy assets; preflight does not reveal latent acceptance |
| piloting → operating | Qualified staff, services, procedures, and consent actually function for the required period | Retain experience and paid costs; award no culture points |
| operating → suspended | Essential service/authority interruption or actual participant withdrawal | Knowledge and skills remain; suspended service does not instantly change identity |
| suspended → operating | Conditions restored and required reorganization completed | Renaming earns no adoption bonus; existing obligations remain separately enforceable |

Coercive reform can change institutions and public conduct despite low agreement, but needs real personnel and recurring costs. Voting uses actual rights and rolls; coercion uses legal and organizational capabilities. A sufficiently large cultural budget cannot automatically purchase consent. Support comes from participation or expressed positions, not private cultural thresholds converted into legal votes.

Transmission first creates contact, then allocates teaching, demonstration, organizational, and media capacity; groups decide whether to participate. Conflicting claims on the same work time or role are settled together. Compatible practices may coexist, but one person cannot hold two full-time jobs simultaneously. Records, schools, and migration transmit knowledge; overseas contact still needs transport and communication.

## Slow updates of eight tendencies

The tendencies remain openness, revisability, exploration, agriculture, industry, urbanism, exchange, and martial. Each ranges from 0–10000, independently. They affect bounded behavior and organizational proposals, not national GDP, births, or combat multipliers.

Construct an evidence-supported target from the group's actual encounters and interpretations, never omniscient policy outcomes:

1. Aggregate material concerning the same real process, affected group, and month into net changes. More reports do not add weight. Store first exposure, covered population, and cumulative exposure against the real event and recipient lineage. Repetition may reach previously unexposed people or correct evidence through new checking, but cannot refresh existing recipients' decay age or add independent samples. Different sources and interpretations share the same exposure allowance. Genuinely new monthly income, performance, and losses are new events.
2. Compare knowable livelihood, safety, performance, and action outcomes with the group's prior expectation to obtain a bounded difference z in −1 to 1. Normalize each metric against explicit references before combining; money, deaths, and hours cannot be added directly.
3. Give each source credibility r from 0 to 1, using only verification/performance the group could know. Organizations can offer different interpretations. Attribution and truth are stored separately; omniscient answers do not assign credibility.
4. Practice p has a fixed direction vector v(p,d), with each axis in −1 to 1. It describes the relationship between learned content and tendency. It does not mean success produces moral improvement: an exclusive guild's success can reinforce exclusion.
5. Within bounded memory, weight evidence by actual exposure, r, and net magnitude. Each axis includes only relevant evidence: `s(d)=Σ(w×z×v)/Σw`, bounded to −1 to 1. Keep total effective weight W separately and use a positive same-unit reference Wref to obtain `q=min(1,W/Wref)`. A normalized mean alone would give one weak, low-coverage report full influence. Scale Wref and exposure consistently with source population; splitting groups cannot increase q. When W=0, target equals current.
6. With evidence, calculate `raw_target(d)=clamp(inherited_anchor(d)+5000×s(d),0,10000)` and `gap=raw_target−current`. Limit direction: for s>0 use `directed_gap=max(0,gap)`; for s<0 use `directed_gap=min(0,gap)`; for s=0 use 0. Then `target=current+q×directed_gap`. Positive evidence cannot lower an already higher value, nor negative evidence raise it. Without evidence, preserve current. The anchor is inherited: initially the actual generated profile, and for new population the weighted cultural exposure of actual care and transmission sources. Ordinary adult learning changes current, not anchor whenever a profile version changes. Splits, mergers, and generational replacement preserve source distributions. Education affects current learning and actual later transmission; monthly versioning cannot refresh the baseline indefinitely. The initial 5000 scale requires calibration and is not a public intervention formula.
7. Calculate `delta(d)=λ×(target(d)−current(d))`, then apply [slow-change limits](11-settlements-and-education.md): ordinary λ≤0.002/month and crisis λ≤0.006/month, with rolling absolute-drift and trait-duration limits. Preserve fixed-point residues; splitting cannot gain extra whole points.

Initial signal memory is 120 months from first effective exposure; monthly weights have a 36-month half-life. Recipient populations retain actual encounter dates. Responsibility and major-loss archives outlive the signal window and can reach previously uninformed people, but cannot refresh old recipients' windows or crisis allowances. Retain sufficient statistics by actual source. Bounded memory cannot erase debt or postwar responsibility. New verification corrects an old record rather than pretending the loss happened again.

Public services change outcomes and contact; education changes learning and access; geography changes contact cost; technology changes occupations and equipment practices; religion supplies obligations and interpretation; war changes safety and losses. All enter this chain, without separate duplicate cultural drift. Different beneficiaries and cost bearers produce local differences; one port does not rewrite an entire lineage.

Fear, wages, and compliance can change behavior quickly and update separately from enduring norms. For current=4000, raw_target=8000, q=1, and λ=0.002, uncapped monthly change is 8, producing 4008. At 1% of reference evidence, q=0.01 and change is 0.08, with the residue retained. Neither produces output points directly.

## Differentiation, fusion, and population flows

Profile versions compress shared practices and similar tendencies. A version creates no people; it classifies existing groups after adoption, transmission, or migration. Persistent practice differences can create sublineages after the required evidence duration. A display-name change needs no new behavioral state.

One region may contain several lineages; one lineage may have regional versions. Fusion requires actual shared life, schooling, or organization, not a federation signature. Merging preserves weighted distributions, important minority practices, learning residues, and responsibility provenance. National means are summaries only.

New people acquire initial cultural records through actual care and educational exposure, not a flag's national mean. Later schooling and peers can change those records. Initial religious membership follows existing transmission organizations; however, the initial world has no religions and cannot assign one before founding. Registration as an adherent differs from real participation. In v1.0 these transfers use aggregate source cohorts rather than simulated individual families.

## Fixed religions and changing organizations

The established sequence remains local movement → pantheon → holy site/founder formation → formal religion. Every stage uses real participants, organizers, supplies, space, transmission, and training. Mountains and disasters do not create spendable faith coins. Founding slots are an explicit game constraint, shown only through permitted known rules, without a future religion list.

Mobilization reserves must represent still-valid member commitments and organizational capacity. Redemption still checks available people and supplies; expiry, departure, and broken contact reduce usable commitments. Ancient faith reserves cannot buy modern services after the members have left. Religious activity can supply education, relief, organization, and discipline, but can also divert resources or restrict action. Secular organizations can provide those capacities too.

After founding, beliefs, taboos, and organizational principles stay fixed. Institutional wealth, membership, and interpretations of events can change. Interpretation cannot rewrite doctrinal effects or skip real adoption. LLM narration cannot add attributes.

## Single-settlement constraints and acceptance

- A production improvement changes its recipe/capability once. Culture affects participation indirectly without an extra efficiency multiplier.
- Preserve identity and residues for people, qualification courses, and experiments; renaming or splitting cannot farm skill, evidence, or cultural change.
- Policy costs and known equipment conditions can have precise feedback. Cultural targets, weights, true acceptance, and undiscovered knowledge paths remain private.
- The same culture with different actual loss bearers should produce local differences. The same geography with different educational or organizational responses must not force one route.
- The same intent may produce different outcomes in different months because conditions change. Identical full state, content version, and sealed random inputs must replay exactly.
- Compare more teachers without instruments, instruments without operators, and understood methods rejected by organizations. Each must produce a distinct, investigable bottleneck.

This chapter fixes state meanings, update order, and function structure. Practice direction vectors, normalization references, courses, acceptance thresholds, and recipes still need entries in the [content-freeze checklist](00-v0.5-engine-plan.md). Without those tables, a complete match cannot be calculated. Complete prose rules are not a complete content package.
