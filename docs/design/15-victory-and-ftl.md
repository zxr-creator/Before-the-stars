# 1.0: Military-Wide FTL Acceptance and Complete Victory

The user confirmed that global integration remains mandatory and the reward measures complete-victory time; pure FTL achievement is recorded separately. **Conquering everyone still requires FTL. Possessing FTL without global integration does not win.** This document replaces the 0.3 interpretation of two prototype trials as sufficient FTL acceptance. Two trials remain necessary.

Version 1.0 has competitive matches only. Cooperation, alliances, licensing, and federal institutions remain available actions, but every completed match has at most one winning original seat. The full competition specification is [33](33-competition-and-native-ai-v1.0.md).

## Meaning of military-wide capability

“Military-wide” means the highest command system can continuously command, transport, maintain, and replenish the military forces needed for its responsibilities. Every infantry soldier does not need an engine, and starting a war is not required. Strategic transport and local defense may specialize; peaceful integration can pass through standard exercises. Acceptance tests actual control, personnel, equipment, manufacturing, and services, rather than substituting a national technology level.

The victory contract is sealed at initialization and its complete verifiable requirements become available when the final objective is revealed. The standard template contains six capabilities. Steam and diesel traditions must transition across domains, acquiring electrical, computing, materials, and space capabilities before implementing different engineering solutions under the same explicit science-fiction assumption. There is no scientifically asserted steam-to-FTL shortcut.

The historical [0.8 multicivilization case](../reviews/07-postindustrial-campaign-v0.8.md) specifies components, training, manufacturing, trials, and governance dates for its scenario. Those numbers do not replace this chapter's general windows; its former cooperative-winner interpretation is superseded by 1.0 competition. Advanced AI, cybernetic, and biological capabilities are specified in [25](25-ai-cyber-bio-industries-v0.8.md); they are not all mandatory FTL branches.

| Acceptance item | Standard task and persistence requirement | Exploit prevented |
| --- | --- | --- |
| Engineering reliability | At least two loaded FTL round trips, at least 12 months apart, using two independently operable propulsion assemblies | Repeatedly claiming success with one prototype; treating an unloaded signal as transport capability |
| Military-wide interfaces | Joint exercise of highest command, safety authorization, communications, navigation, task allocation, supply, and maintenance; every active task formation has compatible transport or local support | Research knowledge without deployable forces; nominal compatibility |
| Deployment tasks | Demonstrate transport, maintenance, and recovery at each of 3 fixed revealed test nodes, with scenario-defined mass, energy, and personnel, within 6 months | A single factory-door flight; renaming formations to erase distant obligations |
| Series manufacturing | Produce at least 2 qualified standard assemblies within 24 months from actual inputs at two independently executable manufacturing units, with usable plans, personnel, and lawful continuing use rights | Merely buying two finished units, registering one assembly twice, or borrowing a ship for a day |
| Maintenance and replacement | Maintain task capability for 24 consecutive months; actually replace one assembly and hand over to a replacement crew; inventory/contracts cover the following 12-month maintenance plan | Ending production immediately after the maiden flight; lacking spares, instructors, or training |
| Social and fiscal support | Maintain resident services and effective finance/logistics throughout the governance window below; military resources cannot also count as delivered civilian services | Cutting water, food, and maintenance to cross the finish line once |

Standard task scale is fixed at initialization from world scale, initial population, and task distance, expressed in actual product units and personnel teams. Temporary demobilization does not reduce it. The first numeric content pack must specify each FTL design's payload, energy, assembly recipes, and training hours. These content parameters may be calibrated; the six acceptance mechanisms are no longer unspecified. Standards cannot change during a match to make a model win.

Two manufacturing units need not mean two countries or incompatible technologies. Independent execution means critical machines and working hours cannot be counted twice; renaming one factory does not create two units. This is the game's reliability standard, not a claim about necessary real interstellar engineering.

## Rights, joint contributions, and acceptance scope

Imported equipment, joint research, manufacturing licenses, and federal specialization may contribute if the eventual winner has genuinely executable command and service rights throughout the complete window. Licenses expiring during that window, unaccepted outsourced services, and private facilities beyond its authority cannot count as owned capability. Signed future services may support planning; only months actually performed count toward sustained acceptance.

Force establishment does not determine minimum task scale. Acceptance covers all actual active tasks and defense, occupation, and resettlement responsibilities still unresolved from the preceding 24 months. Reasonable withdrawal can reduce future expenditure, but cannot delete unfinished responsibilities or substitute for fixed standard tasks. Formation transfers, renaming armies, and relabeling combat personnel as contractors preserve responsibility lineage. Demobilization, leasing, and specialization are permitted strategies when a genuinely sustainable substitute remains.

When the highest actual controlling seat changes, that seat's governance counter restarts. Renaming the same controlling entity does not reset its assets, responsibilities, or achievements. Federal members may retain agreed authority, but only the original seat satisfying the highest actual authority predicate can win. Research contributions, honorary positions, and nominal charters do not inherit another seat's G96.

Scoreable original seats and the competitive rule set are sealed at initialization. Constitutional membership and rights can subsequently change; shell organizations, copied AI instances, and renaming do not create scoreable seats. Ordinary deliberation, rotation within an unchanged governing authority, or upgrading an advisory model does not by itself transfer highest control. Actual transfer is determined from executable authority under the competition specification, not from labels. It restarts the relevant governance window and cannot manufacture a shared winner.

## Time windows and service conditions

Check every month-end; a new player submission is not required. At current month t:

- `G96(t)`: actual global integration and governance services held for every one of the preceding 96 consecutive months.
- `F24(t)`: military-wide FTL deployment, maintenance, command, and training remained available for 24 consecutive months, with series production and replacement verification complete.
- `Trials96(t)`: two successful trials within the preceding 96 months are separated by at least 12 months. Both were actually controlled by the final winning entity or validly inherited under its effective constitution, and occurred during its valid global governance period.
- Complete victory is `EligibleWinner(seat) AND HighestActualControl(seat,t) AND G96(t) AND F24(t) AND Trials96(t)`, settled at the first qualifying month. `EligibleWinner` means the original seat's `scoring_status` is `active`; it does not require global control merely to remain in competition. A historical certificate without current capability does not satisfy F24.

Verify basic governance services at every actually inhabited node. Over the latest 12 months, person-month-weighted food and safe-water fulfillment must each be at least 95%, and each must be at least 80% in the current month. No eviction/disaster resettlement gap may remain unattended for 3 consecutive months. Verify basic maintenance, fiscal payments, and security adjudication from actual execution records. National averages cannot hide local minority deficits. The initial 95/80 standards are gameplay values, not ethical or historical judgments. Lacking modern medicine does not prevent early governance; the current contract's specified basic services are what matter.

War-created refugees, service interruptions, and origin-region responsibilities require resolution. Death or disappearance from registration does not automatically close a case. Every responsibility records arrival, resettlement, repair, or actual loss. The system neither requires caring for nonexistent people forever nor treats killing people as resettlement. Closure requires reconstruction, arrangements for survivors/dependents, and service audit; changing a denominator cannot waive it.

A failed window clears only its corresponding consecutive counter. Power failure can break F24; actual political fragmentation can break G96. Known knowledge, lawfully held equipment, and historical successful trials persist, although trials outside the rolling window no longer satisfy current acceptance. A broken window cannot resume at month 95, and a local accident that leaves services intact does not erase all research.

## Reward and termination

Each original seat has `scoring_status: active / forfeited / eliminated`. Formal withdrawal or adjudicated permanent disconnection makes forfeiture irreversible and fixes that participant at −1. A maintenance controller preserves actual society and rights, but its later completion is diagnostic: it cannot win, create a replacement scoring seat, or end other active seats' match. If no original seat remains active, terminate with `all_seats_ineligible` and no winner. Surviving competitors can otherwise acquire actual control through ordinary rules. Controller replacement without forfeiture preserves the same seat and does not itself reset governance. Renaming cannot restore scoring eligibility.

The formal score uses fixed scenario horizon H in simulation months and first complete-victory time T. The winning seat receives `R = 2 - T/H`; every nonwinner, eliminated or forfeited seat, and unresolved seat at the horizon receives `R = -1`. T may equal H: finish monthly settlement, check eligible complete victory, then declare a horizon without a winner. Report H and content span separately across scenarios; rewards under different compression rates are not directly the same speed measure. The 1.0 standard candidate is H=2880 with 12 months per decision round; feasibility remains subject to validation. Short developer fixtures are not ranked equivalents.

Incremental implementation records `-Δm/H` for each Δm advanced, adds 2 upon victory, and adds `-1 + T/H` when a nonwinner terminates at T. All failures therefore sum to -1. Early departure does not avoid the time penalty. Cancellation, queries, empty negotiation windows, and illegal retries do not advance simulation time and give reward 0. Main evaluation adds no territory, kill, birth, GDP, or technology-node bonuses. Use undiscounted finite-horizon return γ=1; arbitrary per-decision γ<1 changes incentives across window lengths and is a different benchmark.

This objective maximizes expected completion return under risk; it does not mathematically eliminate every risky strategy. Report win rate, successful-game T distributions, failure causes, and tail risk rather than selecting only the fastest game. Record first technical trial, first military-wide capability, and integration completion as diagnostics, without adding them to formal reward.

Discovery-track actors receive no unrevealed FTL progress or private reward breakdown. Time cost already follows the public calendar. The training side may compute reward after the complete trajectory; dense feedback is specified in [panels and RL](../technical/05-feedback-and-rl.md). A trained model may know the destination, so it cannot subsequently be described as having no prior knowledge.

## Worked examples and boundaries

For an illustrative H=1200 fixture, A conquers the world at M600 but completes all FTL acceptance only at M900. If all other windows hold, T=900 and R=1.25. In another game B meets FTL requirements at M800, completes 96 months of governance at M950, and continuously maintains FTL; T=950 and R≈1.20833. Early conquest and an early engine are each insufficient.

If A still lacks one month of its continuous 24-month acceptance at M900, a signed future maintenance contract cannot count as elapsed time; M901 is the earliest possible completion. A seat eliminated at M1100 accumulates time cost -11/12 and terminal adjustment -1/12, still totaling -1. Early self-destruction cannot earn a better score.
