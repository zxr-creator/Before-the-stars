# Era Knowledge, Agendas, and the Ultimate Objective

The endpoint is military-wide FTL acceptance and effective global political integration. Conquest cannot replace FTL. [The victory specification](15-victory-and-ftl.md) governs the tests. Designers know this framework, but exploration configurations do not disclose it in the opening prompt; referee rules remain fixed. A trained policy may already know the objective, so exploration evaluations must disclose training history rather than pretend to erase prior knowledge.

[The first-game walkthrough](27-first-game-mental-model-v0.8.md) illustrates development. Its historical cooperative outcome is not a v1.0 victory mode. Having no match memory does not remove real scientific knowledge: restrictions concern match information, action eligibility, and obtainable evidence. The complete walkthrough contains late-game information and must not be included in exploration starting materials.

## Three distinct kinds of objectives

| Layer | Holder | Purpose |
| --- | --- | --- |
| Near-term agenda | Players, population groups, institutions | Guides population, economy, land, resources, and later research development |
| Evidenced long-term mission | Civilizations meeting knowledge conditions | Provides an understandable, actionable distant direction |
| Complete match victory contract | Referee and isolated evaluator | Defines exact victory requirements, projected to a seat after discovery |

Agendas are not points redeemable for technology. Population must grow through demographic processes, territory must be actually governed, and economic development concerns sustained real output and resident supply. Repeated high-price reciprocal sales cannot manufacture progress.

## Initial agendas

Initial visible objectives arise from four categories, using the civilization's known circumstances:

- Population development: improve supply and health, support migration and sustainable expansion; never reward births followed by starvation.
- Economic development: reduce stoppages, establish reliable surplus, improve labor returns and maintenance capacity.
- Territorial expansion: develop and govern reachable regions, rather than merely count planted flags.
- Resource control: secure stable extraction, trade, or access rights at known sources; political control and exclusive resource monopoly are recorded separately.

There is initially no abstract “technology development” objective. Repairing tools, improving cultivation, comparing smelting processes, and solving known problems remain possible; otherwise scientific method could never emerge. `start_project` and `investigate` support already discovered concrete processes.

Agenda candidates derive from faction demands and known facts. `set_agenda` allocates priorities totaling 10000 across known objectives. It expresses government commitments and organizational attention; it does not allocate money, rewrite beliefs, or complete objectives. Arbitrary free text cannot define an executable objective.

## Knowledge progression

| Internal milestone | Actual requirements | Newly available content |
| --- | --- | --- |
| Craft and experience | Production, records, or local trials | Concrete improvements and investigations |
| Scientific method | Understood reproducible methods plus functioning measurement, recordkeeping, and verification institutions | Systematic technology agendas, research networks, research programs |
| Planetary perspective | Sufficient geography, astronomy, energy, communications, and evidence | Planetary coordination, space industry, long-term resource planning |
| Interstellar feasibility | Valid theory, reproducible anomalous/experimental signals, engineering feasibility assessment | The match's FTL engineering route and complete victory contract |

These are not four locked slots shown from day one. APIs expose neither hidden objective counts nor future milestone names, endpoint countdowns, or placeholder fields. The table is designer-facing.

Scientific method is a capability combination, not a technology label alone. Practice and institutions must operate before the scientific agenda unlocks. Each civilization discovers objectives independently; no global upgrade is required. Known objectives are not forgotten when a factory stops, although executable capability can decline.

The complete endgame requirements must be revealed before a civilization can actually start final engineering, including exact trials, governance continuity, and victory attribution. Players should not receive special penalties for failing to guess unsupported hidden conditions. Implementation tests must show a meaningful action window between revelation and possible completion. The horizon may still produce unresolved games.

## Information propagation and the limits of secrecy

Civilizations may exchange genuine technology, conjectures, and propaganda. An early civilization can hear rumors of interstellar travel; the engine cannot censor opponents' messages to force ignorance. A rumor is not a locally verified engineering plan or official objective. Reports preserve source and credibility status. Instruments, training, and evidence supplied by a partner can satisfy local knowledge conditions; text alone cannot bypass capability requirements.

**Isolation can prevent reading secrets; it cannot guarantee a model does not know or infer FTL.** Project names, public design documents, training data, earlier games, and human experience can provide priors. A general model cannot be required to forget scientific concepts. The design controls verifiable in-game knowledge, action eligibility, and supplied inputs, not every internal belief.

Evaluate two information configurations separately:

- **Exploration:** only current knowledge, isolated workspace, and current agendas; no repository mount. The private endpoint's engineering configuration and exact conditions are fixed at setup. Evaluate evidence acquisition, changes of direction, and integration.
- **Revealed objective:** disclose the final framework initially while retaining map and opponent secrets. This is the comparison for long-range planning.

Both use the same physical rules and endpoint configuration distribution and are strictly competitive. Their information regimes differ, so results are reported separately. Do not claim exploration proves every model ignorant of the endpoint; report leakage tests, materials supplied, and limits from model priors. The complete technology/culture graphs remain fixed within a content version; local feasibility and knowledge vary.

## Preventing reward farming and information leaks

Agenda fulfillment changes actual support, trust, and organizational cooperation through the people who made or received commitments. There is no hidden monthly reward proportional to distance from FTL: changing scores would leak the objective. Final evaluation scores and private verifier logs are unavailable to seats during play.

Formal RL return uses complete victory time, not agenda points. Monthly accounts, prediction errors, and process feedback may be rich, but private training rewards and critic state must not enter actor tools, panels, or history. Optional potential-based shaping requires whole-trajectory cancellation and correct termination handling; see [feedback specifications](../technical/05-feedback-and-rl.md).

Assess an agenda against its known baseline at commitment and sustained actual service. Declaring an already finished task cannot earn retroactive benefits. The same beneficiaries, service, and commitment cannot settle repeatedly. Deliberately creating famine and then providing relief does not erase known responsibility for harm. Renaming government, groups, or objectives does not clear memory. People may be deceived, but any benefit must arise from actual information transmission and changed trust, never an unconditional engine payout per completed agenda.

Agendas can change, but signed contracts, sunk investment, and public commitments remain. Repeatedly promising and abandoning work accumulates in affected groups' memories. Trust effects follow who suffered which losses, not an indiscriminate penalty per agenda switch.

Internal objective nodes hold `reveal_requirements`, participants, visible metrics, completion conditions, cited evidence, and state. Only known `ObjectiveView` projections are exposed. [Native-agent isolation](../technical/04-native-agents-and-isolation.md) protects all hidden conditions and the actual victory contract. Native Easy/Medium/Hard AI obeys the same objective discovery and information constraints; difficulty grants no future graph or prewritten FTL itinerary.
