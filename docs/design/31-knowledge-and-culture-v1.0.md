# v1.0 — Fixed Knowledge Graphs, Dynamic Civilizations

> **2026-11-13 design precedence:** this chapter retains historical rules where it
> describes global-integration/fleet-wide victory, mandatory manual courses, or
> native access to unrevealed victory ancestry. For the next ruleset use
> [42: playability](42-ftl-completion-and-playability.md),
> [15: FTL completion](15-victory-and-ftl.md),
> [43: agent access](43-agent-access-and-decision-packets.md), and
> [44: institutional education](44-institutional-education.md). These are design
> changes awaiting implementation, not modifications to existing saves. Other
> nonconflicting rules and the later ruleset-3 calendar remain applicable.

This is a design specification, not an implemented simulation or a balance result. It revises the discovery, cultural development, education, and presentation rules in [16](16-knowledge-and-culture-engine.md)–[20](20-dynamic-development-v0.6.md). The complete catalogs remain **138 technologies, 64 cultural practices, and 24 course templates**. Population aggregation follows [32](32-population-and-education-v1.0.md). All playable modes are competitive; sharing knowledge or creating joint institutions never creates shared victory.

## 1. What is fixed, and what actually changes?

| Layer | Authoritative state | Changes during a match | Player and agent access |
| --- | --- | --- | --- |
| Complete content graph | Versioned technologies, practices, courses, alternative prerequisites, discovery rules, implementations, and scientific assumptions | None; no seed-dependent node removal or edge shuffle | Referee only during play; repository documentation is an authoring reference, not a player asset |
| Civilization knowledge | Observed phenomena, obtained records, understood methods, known practices, and project evidence | Exploration, experiments, teaching, translation, trade, loss of access, and espionage | Only evidence actually available to that civilization |
| Local implementation | Facilities, rights, inputs, qualified labor, operating procedures, and reliable capacity | Construction, maintenance, adoption, destruction, migration, interruption, and replacement | Local records and observations with their actual coverage and uncertainty |
| Population culture | Membership, experienced outcomes, inherited norms, and local cultural tendencies | Slow social learning, generational transmission, migration, and differentiation | Estimated population shares, surveys, behavior, and named traits; no hidden causal coefficients |

Knowing a process does not create a factory. Owning a factory does not prove that it works. Adopting a practice does not convert every resident. A group can support industrial workmanship, farming, and urban services simultaneously. Religion is another population identity: no religions exist initially; fictional religions emerge under the religion rules, then retain their founding doctrine while adherents and organizations change.

The world seed creates geography, deposits, climate, initial material conditions, and addressed event streams. These conditions change the cost and salience of available pathways. They do not decide that one civilization is inherently scientific, that one people must stagnate, or that a named political system must appear.

## 2. Complete catalog and v1.0 scope

The complete node-by-node definitions remain in the [technology atlas](17-technology-atlas-v0.6.md), [cultural atlas](18-cultural-atlas-v0.6.md), and [education catalog](19-education-and-transmission-v0.6.md), with the prerequisite corrections below. The following groups are navigation categories, not mutually exclusive national classes.

| Technology group | Nodes | Main contribution | Conditions that prevent automatic progress |
| --- | ---: | --- | --- |
| Subsistence and early craft, T001–T016 | 16 | Food management, material work, storage, measurement | Seasonal labor, resources, tools, transport, and accumulated observations |
| Specialized society, T020–T038 | 19 | Records, infrastructure, machinery, medicine, and military applications | Surplus, skilled workshops, materials, and local use cases |
| Measurement and science, T040–T058 | 19 | Calibration, repeatable experiments, mathematical models, and physical theory | Instruments, records, independent checking, and trained investigators |
| Industrial foundations, T060–T071 | 12 | Machine tools, standards, quality control, chemical production, and sanitation | Product demand, energy, capital equipment, and qualified operators |
| Steam and thermal engineering, T080–T087 | 8 | Reliable stationary power, thermal networks, and recovery | Fuel, water, pressure materials, maintenance, and useful heat demand |
| Diesel and mobile industry, T090–T097 | 8 | Refining, engines, mechanized logistics, and mobile production | Fuel access, precision parts, repair networks, and transport demand |
| Electric and electronic systems, T100–T109 | 10 | Generation, grids, motors, storage, electronics, and precision control | Conductors, insulation, stable supply, manufacturing quality, and trained labor |
| Computing, cyber systems, and AI, T110–T125 | 16 | Records, software, models, automation, networks, and bounded autonomy | Compute, data rights, valid evidence, integration, power, and continuing support |
| Biology and ecological systems, T130–T137 | 8 | Biological production, restoration, and increasingly closed habitats | Feedstock, controlled processes, monitoring, verification, and replacement supplies |
| Orbital and high-energy engineering, T140–T153 | 14 | Transport, orbital production, energy, and sustained deployment | Reliable logistics, physical trials, life support, and skilled maintenance |
| Relativity and FTL engineering, T160–T167 | 8 | Observations, explicit fictional anomaly, prototypes, and fleet acceptance | Prior science, experimental evidence, manufacturing, crews, support, and global integration |

The 64 cultural practices comprise four groups of 16: community and early organization (C001–C016), cities and knowledge institutions (C017–C032), industrial and public governance (C033–C048), and computational governance and multi-site obligations (C049–C064). Their cognitive graph describes ways to discover organizational ideas. Their adoption conditions describe what is needed to operate those ideas. These are separate tests.

The 24 course templates describe verifiable learning tasks, not a universal school sequence. Early ecological expertise can be sophisticated without literacy. Modern scientific training requires the relevant records, methods, instruments, and instructors. An early society cannot purchase an unknown advanced curriculum with a large education budget.

## 3. Prerequisite audit and required corrections

Several previous edges confuse one implementation with a universal intellectual prerequisite. v1.0 changes the following entries without adding or deleting nodes. `&` means AND; `|` means OR. Implementation requirements continue to consume real resources.

| Node | v1.0 knowledge prerequisites | Correction and retained material requirements |
| --- | --- | --- |
| T048, Scaled printing and inexpensive records | T030 & T016 | Repeatable manual relief or plate printing must not require mechanical clockwork. Manual and precision mechanical methods are fixed implementation variants. The precision variant additionally needs T044 and T043; every variant still needs suitable forms, marking material, media, workers, and distribution. Their actual cost and output differ. |
| T117, Accelerators and compute clusters | T111 & T106 & T102 | Scientific computing can justify clusters before statistical learning. T116 remains necessary for workloads that use that method. Batteries T105 are an option for continuity, not a universal requirement; each deployment must prove its chosen power and recovery arrangement. |
| T121, Engineering digital models and validation | T113 & T115 & T050 | Models can use measurements taken by people. T114 remains necessary when the deployed system actually controls robots. Model validity still requires relevant engineering knowledge, calibration, real equipment comparisons, and independent tests. |
| C045, Hazardous engineering review and responsibility | C029 & C036 & (C037 \| C040 \| C041) | Military command is one source of accountable hazardous operations, not the only source. Civil review or professional inspection can supply an alternative. The same actual stop-work authority, independent checks, incident provision, and liability must exist. |
| C047, Accountable data use and exchange | C020 & C031 & (C035 \| C026) | A public institution can govern data without first adopting corporate governance. Data identity, access records, licenses, measurement, and appeal still need real institutional capacity. |

These changes remove accidental bottlenecks. They do not promise equal costs for all routes. No route receives a compensating bonus simply because another route is popular.

Other broad nodes require careful implementation labels. An empirical pressure device is not automatically a reliable industrial steam plant; knowledge of semiconductors is not an entire chip industry; a habitat experiment is not a proven closed ecosystem. The visible card must state the capability that was actually demonstrated. Individual recipes may require additional known methods even after the broader concept has been understood.

## 4. How a dynamic technology view emerges

The referee retains the full fixed graph. A civilization accumulates a local **evidence graph** containing known problems, observations, sources, methods, and projects. A discoverable node must have a legitimate evidence path into that graph. Geography influences encountered problems and attainable experiments; existing investment influences available instruments and staff; culture and institutions influence participation and information exchange. None supplies an invisible research multiplier.

The progression is `unknown → hinted → discovered → investigating → understood → prototyped → adopted`. These states have distinct meanings:

1. A hint is an observed problem or report, with source, date, confidence, and scope. It need not reveal a future technology name.
2. Discovery identifies a plausible method or question that local investigators can formulate. Required knowledge may still be missing.
3. Investigation executes funded work packages with staff, equipment, materials, duration, and measurement plans. Partial failure preserves usable evidence, not fabricated progress points.
4. Understanding records reproducible knowledge. Prototyping demonstrates a bounded capability. Neither guarantees economical manufacturing.
5. Adoption attaches a validated implementation to actual facilities and trained operators. Deployment scale, reliability, and supply remain local.

Population loss can remove operating expertise without erasing surviving records. Destroying a factory removes its capacity, not the historical discovery. Losing the only surviving record or instructor can make knowledge inaccessible; recovery follows actual surviving sources, not an arbitrary automatic reset.

### Active discovery without a permanent path lock

Players can investigate known failures, survey accessible material or terrain, compare operating techniques, reproduce a received report, acquire teaching, or organize a cross-specialty project. Each action identifies an already observed object, phenomenon, or problem and uses methods the civilization can actually perform. It never requires guessing a hidden node ID.

A generic request such as “investigate alternative sources of motive power” must become a bounded study: available sites, responsible team, known measurement methods, sampled materials, time, and budget. The engine resolves fixed study templates and evidence rules. Free-form prose cannot summon an unimplemented technology or persuade a language model referee to award success.

Cross-domain work can reveal neglected opportunities when it connects genuine evidence. A mining community may encounter pressure and drainage problems; a river workshop may learn electrical measurement through an acquired instrument; an agricultural region may develop careful trials before building heavy industry. Reports and trade can expose a route unavailable to local observation. These are opportunities to spend on investigation, not free unlocks.

An unsuccessful study reports what was observed, its limitations, and actual costs. Repeating the same unchanged study does not reroll a hidden discovery lottery. A materially different sample, instrument, method, location, or replication team can produce new evidence. Evidence identity and addressed randomness prevent reloads, renamed projects, and split requests from multiplying chances.

An isolated civilization must retain at least one physically feasible route into measurement, reproducible science, industrial power, electronic control, and orbital engineering on every supported start. “Feasible” means obtainable resources or workable substitutes within the generated world, not guaranteed cheapness. World generation must reject starts with no viable transition path. Losses caused by later war, institutional choices, or exhausted accessible resources can still cause real stagnation.

## 5. Economic selection, branching, and transition

The branch a civilization experiences is a consequence of the assets it chooses to build and the evidence those assets produce. Each project competes for the same trained people, usable materials, energy, transport, capital services, and funding as production, education, defense, and consumption. Raising its budget only helps if a purchasable constraint is binding.

Each visible project separates **known requirement**, **observed availability**, **committed input**, **completed evidence**, and **remaining uncertainty**. Forecasts report scenario ranges and assumptions. They must not reveal an undiscovered substitute, the referee's private failure threshold, or an opponent's true capacity.

| Development pattern | Valuable inherited assets | Transition work that cannot be skipped | Strategic vulnerability |
| --- | --- | --- | --- |
| Steam-intensive industry | Machine tools, metallurgy, pressure handling, maintenance, and freight | Generators, electrical measurement, conductors, control training, electronics, and later orbital systems | Coal and water concentration, immobile plant, maintenance burden, and stranded expansion |
| Diesel-intensive industry | Precision engines, refining, mobile repair, chemical production, and logistics | Reliable electric supply, electronic manufacturing, software and controls, and specialized research | Fuel access, transport exposure, dispersed maintenance, and competing refinery uses |
| Early electrification | Motors, local grids, electrical skills, and flexible industrial sites | Sufficient machine tools and material quality, expansion finance, power continuity, and precision industry | Imported conductors, fragile distribution, prematurely idle capacity, and scarce technicians |
| Cyber-intensive economy | Data systems, networks, verified automation, and coordinated facilities | Physical maintenance, independent observations, safe recovery, and qualified humans or validated substitutes | Correlated software errors, ownership concentration, dependence on networks and compute |
| Bio-intensive economy | Controlled production, ecological monitoring, specialized organisms, and habitat skills | Reliable feedstock, containment, utilities, measured closure, and continued precision engineering | Long validation, contamination, biological variability, and hidden reliance on outside supplies |

“Steampunk,” “dieselpunk,” “electropunk,” “cyberpunk,” and “biopunk” describe recognizable material and social patterns. They are not exclusive research classes or permanent era gates. A rich steam tradition can remain visible in architecture and heavy industry while electronics and orbital engineering become essential. No route operates a steam-powered FTL drive.

Technology transfer distinguishes documents, equipment, teaching, service, rights, and continuing support. Licensing understood knowledge can save duplicated investigation; it cannot create missing operators or a functioning plant. Public knowledge remains non-rival. Exclusive promises cannot privately resell a secret that has already been published. Partial deliveries, termination, and surviving use rights follow the contract state machine.

## 6. Cultural practices, traits, and population shares

The cultural practice graph is a menu of discoverable organizational solutions. The population's culture is the distribution of slowly changing norms and actual participation. Neither is a spendable culture-point tree.

| Private tendency | Typical observed behavior | Why maximizing it is not automatically desirable |
| --- | --- | --- |
| Openness, O | Admission of outsiders, exchange of accounts, and willingness to encounter unfamiliar methods | Contact also consumes translation and verification effort and can expose dependencies |
| Revisability, R | Willingness to question procedures, report errors, and test claims | Inquiry takes time and can collide with urgent coordination; it never substitutes for evidence |
| Exploration, X | Participation in surveys, trials, and uncertain journeys | Resources can be diverted from maintenance and known needs |
| Agricultural stewardship, A | Attention to land, food systems, water, and seasonal continuity | Skills and resources may remain concentrated in low-return practices when conditions change |
| Industrial workmanship, I | Interest in craft precision, manufacturing, maintenance, and reliable throughput | Existing workshops and qualifications can become politically defended sunk investments |
| Urban organization, U | Support for shared services, dense settlement, and coordinated infrastructure | Density requires sustained housing, sanitation, transport, and legitimate service obligations |
| Exchange orientation, E | Participation in trade, credit, bargaining, and specialization | Dependence, unequal bargaining power, contract costs, and exposure remain real |
| Martial obligation, M | Willingness to train, serve, and accept collective defense duties | Mobilization removes skilled labor and can strengthen interests favoring costly conflict |

These are referee-side explanatory tendencies, not eight player sliders. They affect eligible participation, perceived risks, institutional support, and actual choices within economic and legal constraints. They do not multiply national output, science, birth rates, or combat strength a second time after those choices have already been accounted for.

The public view summarizes observed traits with evidence and uncertainty. A label such as “workshop-oriented” describes sustained behavior in a specified population. It is not an objective moral ranking. Harmful practices are represented through real exclusion, suppressed error reports, neglected maintenance, coerced labor, or privileges that shift obligations. There is no ethnic “decadence” statistic.

### Slow change with meaningful crises

Local cultural lineages aggregate the experience of their actual members. The engine batches relevant events by population, location, practice, and period. The update includes reach, reliability as perceived through available evidence, distribution of benefits and burdens, previous memory, and existing norms. A successful trade contract affects people who actually encountered its results; it does not instantly make a remote farming district cosmopolitan.

The slow-update limits from [20](20-dynamic-development-v0.6.md) remain the initial design parameters: normal change is capped at 150 basis points per tendency over a rolling 12 months; a bounded crisis interval can reach 500. Named traits require sustained entry or exit conditions. These are calibration parameters, not empirical estimates of historical cultures. A crisis can rapidly change policy, officeholders, and expenditure while deeper population norms move slowly.

An outcome is counted once per underlying event and affected population. Schools, newspapers, ceremonies, and agents can distribute an account but cannot independently mint another successful event. A report may be believed without being true; the referee distinguishes the real outcome, available account, and audience belief. Surveys and official reports can be incomplete without making the UI arbitrarily unreliable.

Migration changes composition immediately through real arrivals and departures. It does not rewrite migrants' norms on arrival. Cultural splits inherit histories and remaining change limits; renaming or splitting a group cannot reset memory or accelerate conversion. Fusion requires sustained shared life and transmission. Minority experience is not erased by averaging it into a national score.

### Practice recognition and adoption

Independent recognition follows the fixed cognitive graph and encountered problems. A received description can introduce a practice without reproducing its entire intellectual history. Implementation still needs the actual rights, institutions, resources, and participants specified by that practice.

Learning constitutional review does not force its adoption. Adopting a public school system does not require every resident to agree with it. Different organizations can operate different practices where their rights do not conflict. Conflicts are resolved at the actual land, facility, jurisdiction, or decision: two institutions cannot both spend the same treasury or claim incompatible final authority over one command.

There is no mandatory final ideology. Hierarchical government, constitutional arrangements, negotiated integration, mixed public and private services, and authorized AI administration can address late-game responsibilities differently. Each must actually deliver continuity, correction, safety, provision, and command. A named practice cannot waive a victory condition.

## 7. Education after population simplification

The shared population representation is specified in [32](32-population-and-education-v1.0.md): sparse real population blocks, compact age distributions, joint cultural and religious identities, access to living conditions, basic L/N/R qualifications, and specific vocational qualifications. It does not enumerate every possible identity combination or simulate individual families.

Education preserves the meaningful constraints of the 24 courses: known content, suitable language, qualified teachers, student time, equipment, practice material, effective learning months, and independent task verification. Calculate progress only for actual teaching and workplace batches. Generic population does not receive a monthly update for every possible profession.

Continuous per-qualification `readiness` decay in the older education document is superseded by event-driven authorization states: current, review due, supervised, restoring, or dormant. Expiry and actual incidents schedule appropriate review; a documented successful work or test event refreshes only its relevant authorization. Historic qualifications remain archived. A person maintains a primary specialty and at most two additional currently maintained specialties under the population representation; this is a runtime representation limit, not a limit on remembered knowledge.

The first practitioners of a new method emerge from the actual prototype team and independent reproduction. They need not wait for graduates of a course that cannot yet exist. Teaching then consumes the same people and equipment that production and research use. A newly qualified batch becomes available no earlier than the next monthly scheduling step.

Education panels show age-qualified coverage, available places, waiting demand, teacher shortages, attendance, completions, failed tasks, employment mismatch, and actual costs. They separate literacy, numeracy, research preparation, and named vocational fields. A national average cannot qualify a whole army or a semiconductor workforce.

AI tutoring is a measured service, with power, terminals, inference, supervision, and local validation. It can reduce a demonstrated teaching bottleneck, but it cannot convey unknown content, provide real laboratory practice through text alone, or confer qualifications by repeating test answers. Military training, research work, and civilian courses draw on the same population and labor time.

## 8. A readable tree without leaking the hidden graph

The presentation should borrow the readable card-and-link organization of a civilization strategy game while making deployment and uncertainty legible. The player can switch between a compact knowledge map, a project list, and a local capability view. Culture has a parallel practice map and a separate population distribution view.

| View | What it shows | What it must not reveal |
| --- | --- | --- |
| Technology map | Discovered concepts, evidenced connections, active questions, and known alternative methods | Total hidden descendants, silhouettes of all future nodes, full prerequisite counts, or the final goal before discovery |
| Technology card | Understanding, prototype status, actual deployment, available evidence, known constraints, and legal next actions | Perfect success probability, inaccessible recipes, or private opponent research |
| Cultural practice map | Recognized practices, observed examples, known implementation conditions, and local trials | A predetermined national destiny or all future political arrangements |
| Population culture view | Estimated shares, local traits, adoption, participation, opposition, and source coverage | Exact latent axes, private causal weights, or unseen minority beliefs |
| Education view | Real cohorts, vacancies, courses, progression, measured qualifications, and costs | Unobserved individual aptitude or a single universal education level |

Layout is computed only from the disclosed graph. Unknown nodes do not reserve visible empty slots. Scroll extent, animation timing, search suggestions, assets, IDs, error messages, and accessibility text must not reveal hidden content. Persistent screen positions derive from the order and relationships of disclosed items, not their position in the global atlas. Public historical references can remain on the map when a source becomes inaccessible, with access status marked explicitly.

Human and agent interfaces consume the same permission-filtered observation object. A human card can visualize it; an agent can request its structured fields. Neither can query undiscovered catalog IDs. An invalid request must not distinguish a valid hidden ID from a nonexistent ID. Forecast and explanation services use the same visible evidence and cannot become an indirect full-state oracle.

Complete rules in a public GitHub repository cannot be made unknowable to a pretrained or previously trained model. Runtime isolation protects match secrets, unavailable observations, and hidden objectives from direct access; it does not erase prior knowledge. Evaluation must distinguish a fresh-context run from a model trained on the content version. Dynamic visibility creates an in-game discovery process, not a claim of cryptographic secrecy about published design.

## 9. Worked route divergence and competitive decisions

This is a qualitative consistency walkthrough, not an executed economic simulation. Begin three counterfactual runs from the same river-basin start: abundant accessible coal and iron, a modest water-power site, limited local copper, a nearby petroleum holder, the same population, and the same known methods. Keep weather and addressed shocks paired when comparing policy.

| Decision period | Steam emphasis | Diesel emphasis | Early electric emphasis |
| --- | --- | --- | --- |
| First industrial expansion | Uses local coal, pumping demand, machine tools, and pressure work | Pays for fuel access and precision engine capacity to serve scattered sites | Uses the river site but must obtain conductors and train electrical workers |
| First binding constraint | Freight and plant maintenance absorb skilled labor | Fuel supply and repair capacity become bargaining constraints | Grid completion and technician scarcity can leave productive assets idle |
| High-value decision | License generators and cross-train maintenance crews before building another oversized steam district | Secure substitutable fuel deliveries and local repair knowledge instead of buying engines alone | Sequence electrification around actual loads and an islandable core rather than uniform coverage |
| Path toward advanced industry | Existing metallurgy and machine tools support electrical and electronic transition | Mobility and chemical capacity support electrified manufacturing and logistics | Electrical skills support controls; heavy precision production still needs deliberate investment |
| Potential strategic error | Political protection of old works crowds out the transition | An apparently cheap exclusive supplier controls continuing operations | Premature national expansion absorbs capital before customers and instructors exist |

Culture affects who participates in each transition and how conflict is handled. A respected workshop tradition may ease apprenticeships while its guild excludes outsiders. A trade-oriented port may obtain licenses cheaply but lack a local pool of teachers. A centralized authority may coordinate construction rapidly while suppressing fault reports. These are distinct causal chains, not permanent route bonuses.

Suppose the steam-focused civilization offers pressure-vessel expertise for a limited generator license, teacher visits, and tested replacement parts. The electric-focused rival can gain construction revenue and access to high-quality materials while retaining its more advanced control process. Both may rationally sign. Their competition shifts to the next constraint and eventual global authority. Merely exchanging promises creates no technology, money, or diplomatic reward.

A later treaty can pool orbital research while reserving separate operating rights. Delivery milestones pay for accepted work; partial failure leaves documented results and the agreed surviving rights. If one party gains a large lead, rivals may diversify suppliers or coordinate defense, provided their actual information, interests, and diplomatic limits support it. There is no automatic anti-leader punishment.

Knowledge trade, teacher recruitment, specialization, and well-timed conversion can produce large legitimate gains. A policy that adapts to measured constraints should often outperform constant maximum spending, but “adapt to constraints” is a decision problem, not a free algorithmic bonus. Agents face uncertain measurements, delayed education, sunk capital, conflicting faction claims, rival bids, and future supply risk. Whether a route is dominated requires measured counterfactuals across supported worlds and opponents.

## 10. AI, interstellar preparation, and victory

Game-world AI consists of actual computing services, models, equipment, data, and organizational authorization. External LLM players and the built-in easy/medium/hard controllers do not supply those resources. Their reasoning budgets cannot increase simulated compute or bypass a discovered capability.

Specialized models, validated automation, high-autonomy agents, and AI-led administration are different milestones. C049 permits scoped advice; C050 permits bounded delegation; C053 permits an actually authorized highest administrative system with continuing support and correction. A model's benchmark score alone cannot transfer sovereignty. Human-led administration remains a valid route to victory.

Advanced biological manufacture, augmentation, high closure, autonomous science, and net fusion remain separately labeled extrapolations where appropriate. They are neither assured merely by their names nor mandatory as a bundle. In particular, ordinary resupplied orbital habitats remain possible without the advanced closed-ecology branch.

Every viable industrial tradition must eventually establish sufficient physical science, electrical control, precision manufacture, orbital operation, energy, and verified personnel to undertake FTL engineering. T162 introduces the explicit fictional anomaly; preceding branches do not secretly redefine known physics. T164 and T165 are alternative engineered prototypes under that same assumption, followed by repeatable trials and fleet-wide capability acceptance.

Late cultural preparation concerns maintained obligations: recoverable records, long-duration finance, incident accountability, delegated authority under delay, life support, and legitimate global responsibilities. It is not a universal ideological transformation or a population-wide willingness to join a fleet.

Global integration and fleet acceptance remain necessary even after conquest. Competitive victory belongs to one eligible original seat under the v1.0 victory rules; alliances, shared research, C061–C064, and joint institutions are instruments that can contribute to one contestant's actual integration. Their existence does not turn a match into a cooperative game. A civilization that helps a rival become the sole qualifying authority may have made a rational short-term bargain but has not also won.

## 11. Acceptance criteria before implementation

1. Parse the corrected catalog: exactly 138 technology nodes, 64 practice nodes, and 24 course templates; no dangling references or prerequisite cycles. Every implementation variant has a fixed content definition.
2. Check FTL structural reachability without advanced AI, augmentation, advanced closed ecology, and any one industrial tradition in turn. This tests accidental graph locks, not resource affordability or victory timing.
3. Check supported generated starts for obtainable material and knowledge transitions. Do not force equal returns or reveal the discovered feasible route to the player.
4. Construct observations for identical permitted evidence over different hidden graphs or opponent states: visible layout, identifiers, errors, forecasts, and action lists must not disclose forbidden differences.
5. Verify that publication, licensing, copied curricula, split cohorts, renamed cultures, duplicate experiments, and model-generated datasets cannot create physical resources, person-hours, independent evidence, or additional winners.
6. Verify that a new field can bootstrap its first instructors, that a receiving civilization can learn an externally described practice, and that both still pay their real implementation costs.
7. Exercise interrupted education, maintenance collapse, migration, policy reversal, and repeated crisis messaging. Knowledge, qualifications, actual capacity, and cultural membership must change according to their distinct rules.
8. Compare fixed-spending and adaptive policies across paired seeds and opponents using victory time, economic consumption and investment, deployment, qualified labor, accepted evidence, and failure causes. Report confidence and incomplete runs. No qualitative walkthrough is sufficient to certify that no dominant strategy exists.

Implementation should begin only after these rules and the shared data contracts are reviewed. Numeric limits are initial calibration choices; the conservation rules, permission boundaries, fixed content semantics, and separation of knowledge from capacity are invariants.
