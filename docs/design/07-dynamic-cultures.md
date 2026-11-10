# Dynamic Cultures and Religions Fixed After Founding

Design 0.5 inherits the eight tendencies and slow-change rules. This is referee/designer material, excluded from player knowledge packages. Culture presentation borrows CK3's compact combinations of traits, while population experience and organizational behavior drive change. Cultures can become more conservative, shift from agricultural management toward industry and cities, or differentiate geographically. Players cannot edit cultural attributes or directly read their underlying relationships with technology, religion, resources, and geography.

This chapter defines each tendency's role. The [engine specification in 16](16-knowledge-and-culture-engine.md) governs experience deduplication, targets, inheritance, and bounded updates. Fields and visibility are in the [state catalog](../technical/06-state-variable-catalog.md); do not expose this internal table as an agent panel. The v1.0 clarification in [31](31-knowledge-and-culture-v1.0.md) and population aggregation in [32](32-population-and-education-v1.0.md) take precedence where they revise older detail.

Version 0.6 expands the practices in the [complete cultural atlas](18-cultural-atlas-v0.6.md), including eight-axis learning directions, economic/organizational requirements, cyber/AI governance, and several interstellar preparation combinations. [20](20-dynamic-development-v0.6.md) adds generation, attribution, and educational transmission. The slow-change and information boundaries still apply.

## Fixed and changing elements

No religious entities exist initially. Every population has `religion_id = None`, and no pantheon is preactivated. Sustained gatherings, rituals, demand for explanations, and organization can produce movements in some places. [Religious origins and transmission](10-religion.md) then govern pantheons, holy sites, and formal religions. World generation fixes only the belief-candidate grammar and naming rules, not adherents to religions that have not appeared.

At formal founding, `ReligionDefinition` fixes the name, core beliefs, taboos, and organizational principles. The first version does not rewrite doctrine or model religious schisms. People can convert through transmission or remain nonreligious; migration and intergenerational changes are settled separately. “Fixed” constrains the definition, not the population's beliefs.

Religious institutions can gain or lose wealth, facilities, members, and political influence. Fixed doctrine affects education, cooperation, and legitimacy through actual adherent participation, not nationwide bonuses. One religion can contain different cultures; one culture can contain different religions. Store `culture_profile_id` and `religion_id` separately. Cultural fusion does not automatically merge religions.

## Eight internal cultural tendencies

The earlier cultivation orientation is separated into agricultural stewardship, industrial workmanship, and urban organization, producing eight tendencies. Internal values use basis points, but their exact values and causal table are not automatically sent to agents. The UI normally shows 2–4 traits and behavioral trends supported by local evidence. Tendencies are independent and need not sum to 10000; cultural population shares do. National means are summaries only. Production and politics use the relevant populations, institutions, and actual behavior.

| Attribute | Meaning | Conditional benefits | Costs and limits |
| --- | --- | --- | --- |
| Openness `openness` | Acceptance of outside members, methods, and cooperation | Broadens employment, knowledge contact, and cross-group trade | Verification, adjustment, and external dependence; does not imply trusting every foreigner |
| Revisability `revisability` | Willingness to revise practice in response to outcomes | Supports comparisons and correction of failed methods | Experiments consume time/material; existing skills and authorities can lose value |
| Exploration `exploration` | Prestige of travel, surveying, and unfamiliar occupations | More participants in funded expeditions and investigation | Diverts local labor and accepts transport/failure risks |
| Agricultural stewardship `agriculture` | Prestige of land, irrigation, storage, and agricultural transmission | Supports actual field maintenance and agricultural learning | Strengthens land interests and can impede labor or land-use changes |
| Industrial workmanship `industry` | Prestige of manufacture, maintenance, standards, and technical work | Supports paid apprenticeships, maintenance, and process improvement | Consumes energy, materials, and training; creates equipment and occupational transition costs |
| Urban organization `urbanism` | Prestige of settlement cooperation, housing, and public facilities | Supports water, sanitation, housing, and urban services | Continuing service costs; concentration creates congestion, pollution, and infrastructure dependence |
| Exchange orientation `exchange` | Prestige of commerce, contracts, and regional specialization | Attracts labor to trade routes, bookkeeping, and contracts | Commercial risks, supply dependence, and distributional conflict |
| Martial obligation `martial` | Prestige of service, preparedness, and armed organization | Supports recruitment, training, and retention of supplied forces | Military spending, displaced labor, and military-political demands |

Revisability is not modern science. An agricultural community can compare crops without a systematic national scientific agenda. Scientific methods additionally require checkable records, measurement, training, and sustained organization.

The tendencies do not directly multiply output. They affect occupational choices, cooperation, proposals, and willingness to participate. Actual skills, maintenance, evidence, and networks determine effectiveness. Several orientations can be strong simultaneously without exceeding total labor, budget, and attention. Occupational allocation also considers wages, living needs, commuting, and training. Culture cannot force everyone to accept loss-making work.

“Development” includes agriculture, industry, cities, and public facilities; it is not a universal agriculture bonus. Industrial orientation does not unlock factories by itself, and urban orientation does not create housing. Technology and inputs remain necessary.

## Readable traits and conditional benefits

A profile displays roughly 2–4 prominent traditions, such as public experimentation, irrigation cooperation, maritime networks, or exclusive guilds. These summarize adopted practices and coverage; they do not add another layer of bonuses.

A maritime network may reduce duplicate surveys by sharing route records, but still needs ships, supplies, and navigation. Players see known routes, record sources, and actual survey expense, not a complete culture-to-technology-to-benefit table in a tooltip. Labels such as craft-oriented or committed to public works must likewise follow observed behavior, never act as perfect hidden-state probes.

Once cultural behavior affects production, training, or trade, count it once. Do not add another efficiency multiplier on the culture panel. A culture suited to one investment should not dominate every domain, but balancing need not force conservative and open extremes to perform equally in every situation.

Low openness and low revisability differ: a society may restrict foreign contact while improving domestic methods, or trade widely while protecting academic authority. Isolationism is an institutional and border-enforcement state. Culture affects support and execution costs; falling openness does not automatically delete trade links.

## Monthly evolution

Detailed rates, education conditions, and transmission appear in [settlements, rural–urban networks, and education](11-settlements-and-education.md). Record short-term confidence, organizational habits, and enduring norms separately. Coerced public behavior does not prove changed beliefs. Ordinary drift and major shocks have monthly and rolling annual limits. Trait entry/exit also requires sustained evidence; raising an event weight cannot bypass slow change.

Culture is population-based. The same lineage keeps local versions and experiences in different regions. An attack on one port cannot rewrite all members of that culture everywhere.

1. Collect outcomes, organizational actions, and reports the group actually encounters. Unknown foreign events cannot affect attitudes.
2. Use contact networks, occupations, religious obligations, and organizational participation to form a bounded set of learnable practices. No contact channel means no spontaneous copying of an overseas institution.
3. Compare observable participant outcomes with prior expectations, accounting for recent shocks, long experience, and source credibility. Interest groups can circulate explanations, which need not be true.
4. Update tendencies and participation with a bounded monthly step. Coercion, poverty, and fear can suppress participation without becoming sincere agreement.
5. Within education, organizational, transmission, and conversion capacity, transfer some people to new profiles. Remove before adding, preserving population, religion, property, and skills.
6. A new trait requires sustained crossing of its entry threshold; exit uses a separate threshold and duration. Record versions, differentiation, and fusion in history so older states remain replayable.

Conceptually: `next state = current state + bounded learning rate × (evidence-supported target − current state)`. Contact, observed results, organizational transmission, and fixed religious obligations shape the target. Coefficients control speed, not a civilization's destiny. Cultural adoption and economic returns feed back no earlier than the following month.

## Five external drivers

| Driver | Path into culture | Rejected shortcut |
| --- | --- | --- |
| Geography | Contact cost, livelihoods, disasters, migration experience | Islands are always open; mountains always conservative |
| Technology | New occupations, tool successes/failures, knowledge organizations | Unlocking a technology changes national culture immediately |
| Economy | Actual incomes, who bears losses, organizational growth, labor allocation | High GDP necessarily causes one institution |
| Religion | Fixed obligations, taboos, education, relief participation | A religion has an unavoidable permanent science penalty |
| Military experience | Service, casualties, protection, conquest, propaganda | Victory always causes militarism; defeat always causes closure |

Port prosperity can expand cross-border merchant networks. Repeated attacks and failed compensation can lead harmed groups to support restricted passage. Reliable escorts and risk sharing can help openness recover. Events, responsibility, and organizational response determine direction; no fixed story does.

## Harmful practices, education, and recovery

Not every cultural practice has a net benefit. Exclusive guilds can reject qualified entrants; status competition can divert real surplus into display; powerful groups can avoid maintenance, tax, or service obligations. These can persistently damage production, services, and defense through actual participation, resource flows, execution, and transmission. Do not assign a permanent ethnic laziness coefficient or require every harmful practice to have an equal compensating benefit.

The eight tendencies describe orientations. Harmful practices are recorded as adopted rules and behavior rather than another civilization morality score. Effort also depends on health, nutrition, pay, safety, leisure needs, and whether the results of work are confiscated. Poverty, care burdens, reasonable rest, or resistance to forced levies are not automatically decadence. Elite evasion is not the whole population's fault.

Education provides contact, comparison, and skills, but its organization and content differ: it can teach verification or reinforce authority. Religious obligations can organize relief, records, and discipline, or restrict particular occupations, investigations, and military actions. Effects concern relevant adherents' actual participation. Nonreligious people are not presumed more advanced. Fixed doctrine can have different benefits and costs in different circumstances.

Repeated success may entrench organizations opposed to new routes, while neglected maintenance erodes success. Such feedback can generate rise and decline without an automatic collapse after a set number of prosperous turns. A failure can provoke reconsideration, but reform still needs credible explanations, alternatives, education, and subsequent results. Historical examples motivate hypotheses, not a supposedly proven single law that an empire fell through moral decadence.

## Lightweight state and data

`CultureProfileVersion` stores lineage, parent versions, eight private tendencies, adopted practices, prominent traditions, and evidence links. `CulturalExperience` stores a bounded window of monthly aggregates rather than individual psychology. Different regions can reference different versions. Player projections contain only names, covered population, observed practices, sourced trait descriptions, and survey records.

Aggregation preserves geography, age, skills, economic position, religion, and material cultural differences. Merge only profiles equivalent within rule tolerances, preserving population-weighted statistics and lineage. Do not erase politically important minorities to meet an object target. Excessive state growth is a design issue requiring improved aggregation, never silent deletion of people.

Splits, migration, renaming, and merging cannot clear experience, debts, learning cooldowns, or rounding residues. Residues accumulate against actual flows and original event records; there is no minimum of one conversion per tiny group. Repeated subsidies, relief, and publicity update experience from net service, actual losses, and source credibility, not event counts. Causing harm and then providing relief does not automatically erase known responsibility.

Acceptance scenarios: different cultures within one religion; different religions within one culture; war-induced closure with conditional recovery; trade orientation producing no free returns when there is no trading partner; research orientation creating no scientists without teachers and support; and civilizations with identical national averages but different population distributions producing different local outcomes.
