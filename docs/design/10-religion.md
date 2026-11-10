# Religious Emergence, Founding, and Spread

There are no religions at the start. Religion is neither an initial civilization label nor a permanent bonus distributed by the world generator. It emerges at particular places and subsequently spreads through organizations and populations. All names, figures, symbols, and doctrinal text are fictional. Do not use real religions or thinly disguised name substitutions.

## Reference to Civilization VI

The reference is its sequence of accumulating faith, establishing a pantheon, developing a Holy Site and Great Prophet, founding a religion and choosing beliefs, then spreading it, together with competition for scarce founding opportunities. See the Religion chapter in [2K's official Civilization VI manual](https://downloads.2kgames.com/civilization/vi/manuals/eu/CIV_VI_25TH_ONLINE_MANUAL_ENG.pdf). The following adapts that structure; it does not claim identical values, propagation formulas, or detailed rules.

To keep the game lightweight, there is no separate religious victory, tactical combat between religious units, inquisitor system, or repeated doctrinal revision. Religion may influence diplomacy, culture, and domestic organization, but cannot replace the final FTL and political-integration requirements.

## From no religion to a local movement

Initially all groups have `religion_id = None`, with no religious organizations, accumulated religious points, or selected pantheon. Culture may include mutual aid, commemoration, and observation of nature, but the engine does not automatically classify these as religion.

When a location supports a continuing gathering population, dedicated organizers, public meeting space, and paid living supplies, cultural processes may form a `ReligiousMovement`. Migration, remembrance, natural landscapes, explanations of disasters, and mutual-aid networks can provide different origins. Disaster is not required and does not automatically create a denomination. Emergence requires actual participation and sustained organization; it is not a nationwide event scheduled for a fixed turn.

Government may fund public activities, permit private organization, or remain uninvolved. Regions may remain without religion indefinitely. Nonreligion is not a backward state and carries no automatic technology or culture penalty. Origins are not restricted by civilization name, ethnicity, or real geography.

## Founding sequence

| Stage | Conditions and actions | Result |
| --- | --- | --- |
| Local movement | Participating people, organizers, space, and supplies | Visible local belief activity without a formal religion |
| Pantheon | Sufficient participation and organizational commitment; choose one known local belief | A local tradition enters the practice graph without converting the entire nation |
| Holy Site | Invest land, materials, labor, and maintenance in a continuing activity center | Actual religious facilities and training capacity |
| Great Prophet | Trained organizers, sufficient recognition, and a mature movement compete for limited qualification | One founding qualification; the first version models an organizational role, not a complete individual character |
| Formal founding | Qualification, Holy Site, supporting groups, and chosen beliefs satisfy a completed founding project | Record origin, founding organization, and immutable religious definition |
| Propagation | Mission projects, migration, contact, and organizational services | Change relevant population affiliation shares without automatically changing culture |

The readable concepts of faith and Great Prophet progress summarize organizational commitment and personnel development. Faith mobilization reserves come from actual activities and member contributions, have an organizational capacity limit, and decay with lost participation. Spent reserves cannot be reused or converted into materials, money, research, or armies. Training consumes people and supplies. Proximity to a mountain does not create an unconditional resource stream.

Founding slots are an explicit limited competition rule configured and disclosed at initialization; for example, a four-civilization scenario may allow at most three formal religions. This is a gameplay constraint, not historical inevitability. A civilization without a slot may keep local traditions, remain nonreligious, or adopt an existing religion. No FTL route may require founding a national religion.

A slot is consumed when a qualified founding project is finally committed, not permanently reserved by recruiting a candidate. This prevents hoarding candidates to lock the match. Maturity and qualification checks settle simultaneously. Same-month competition for the final slot ranks publicly accumulated training and recognition, with exact ties resolved by derived randomness rather than network arrival order. Unspent reservations return to unsuccessful candidates, while their actual organizations and facilities remain.

Each civilization may use a founding qualification at most once per match. Organizational branches, renaming, puppet registration, and restarting projects do not reset it; one actually controlled movement cannot obtain multiple slots simultaneously. A split country's qualification follows its founding record, rather than becoming a free new opportunity. Other countries may support, adopt, or suppress a religion, but foreign founding rights do not become a fresh domestic qualification.

Qualification accumulates from actual organization, people, and continuing activity, not project counts. Participation and organizational capacity decline without maintenance. Securing a slot early has a real opportunity cost. Secular organizations can also build shared granaries, schools, records, and mutual aid. Religion does not monopolize basic public-service recipes; its differences concern mobilization, obligations, and organizational relationships. It must not become a free universal technology bonus that everyone must rush.

## Fixed beliefs, changing followers and organizations

At founding, every formal religion selects four core belief categories from known candidates: founding-organization obligations, follower practices, worship facilities, and propagation methods. For simplicity, the entire combination is fixed once; beliefs cannot later be replaced or added incrementally. Candidate combinations depend on economic and organizational capabilities. Founding cannot bypass institutional prerequisites for practices that cannot yet be executed.

Founding obligations define where real donations go and what responsibilities arise. Follower practices affect cooperation, worship facilities require construction and maintenance, and propagation methods change personnel/contact requirements. For example, the fictional Grain Oath Fellowship might gain support through shared granaries and famine aid, while the Clear Radiance Society attracts members through observation records and teaching. Both must pay actual food, personnel, and facility costs. These original names are not preset analogues of real religions.

Benefits accrue to actual participants and capable organizations, not everyone under the founding civilization's flag. Capturing a Holy Site does not transfer all knowledge, followers, or founding rights. Founding slots are not recycled when a religion disappears, preventing destruction from farming new slots.

Fixed beliefs express organizational principles, rather than freezing facilities at their founding technology. Later techniques may implement the same obligation, but still require research, construction, and authorization. Delaying founding cannot grant costless advanced-era rewards. Public belief text describes claims and actual obligations, not private response formulas linking culture, technology, and geography.

## Population propagation and cultural interaction

Migration directly carries religious affiliation. Other spread requires actual contact, services, advocacy, missionaries, and trust. Monthly conversions are jointly limited by actual contacts, organizational capacity, willingness, and a monthly ceiling; they cannot exceed the source population. Competing religions allocate conversions jointly so that each cannot subtract the same people independently.

A mission project must target a reachable region and a religion its organization is authorized to propagate. It consumes mobilization reserves, personnel, transport, and daily supplies. Border policy and cultural openness affect contact conditions; a command cannot rewrite population belief. The first version has no forced-conversion action. Groups without a formal religion remain valid categories.

Culture and religion are distinct dimensions. Sustained religious practice may influence cultural attributes, but conversion does not immediately switch all attributes. One culture can include different faiths. Becoming culturally open or conservative does not automatically amend doctrine. Version 1.0 preserves their actual joint distribution in the bounded sparse population representation in [32](32-population-and-education-v1.0.md), rather than multiplying unrelated national averages.

## Interface, records, and acceptance

Holy Sites, organizational activities, candidate training, founding, and missions reuse `start_project`. Project templates declare currently visible choice slots. `choices` selects belief, founding-role, location-relationship, and name handles by slot. It cannot contain free scripts or undisclosed religion IDs. Activity funding still requires actual property and organizational authority. The engine creates the formal `religion_ref`; the client cannot invent it beforehand.

The official interface and agents choose only engine-generated original name options. Generated name corpora and authored content may not include real religions, real religious figures, or direct allusions. Keep `ReligiousMovement`, immutable `ReligionDefinition`, population `religion_id`, and existing `Organization`; do not add a separate individual-level religious simulator.

At data level, `religion_id = None` means not affiliated with a formal religion. Pantheon or local-movement participation is recorded separately through organizational membership and cultural practice. Neither exists initially. Later interfaces must distinguish people participating in local beliefs without a formal religion from people with no belief-organization affiliation; a null reference cannot establish that every person lacks any belief.

Record first movements, pantheons, Holy Sites, foundations, cross-border propagation, and major population changes. Reports disclose only religions known to the observer, not every possible belief or the unknown world's complete list. Religious population shares include the unaligned category; mutually exclusive shares for a nonempty covered population sum to 10000.

Acceptance must cover an initially nonreligious population; movements appearing at different places and times; no automatic priesthood without investment; simultaneous slot conflicts; conversion conserving people without changing culture; immutable post-founding doctrine; viable nonreligious development; and absence of real religious names.
