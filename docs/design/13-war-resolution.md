# War: Mobilization, Organization, and Monthly Resolution

This normative specification completes the [warfare overview](05-warfare.md). All values are hand-checkable, uncalibrated prototype rules, not historical parameters or validated balance conclusions. Hidden cultural, religious, and organizational responses remain referee-side. Known equipment, courses, tasks, supply costs, and verifiable battle reports follow information permissions. Military control is not political integration; total conquest does not replace FTL acceptance. Version 1.0 uses [32](32-population-and-education-v1.0.md) for aggregated people, cached job choices, and event-driven qualifications.

## 1. Minimum entities and one population ledger

| Record | Required state | Ownership and visibility |
| --- | --- | --- |
| RecruitmentPool | Source groups, available adults, committed people, volunteering/requisition/resistance records | Actual counts private; registration, applications, and enforcement reports visible by permission |
| TrainingCohort | Count, course, foundations, effective training months, instructors, equipment, interruptions | Own actual inputs and qualifications can be checked |
| Formation | Counts in three roles, equipment batches, qualified skills, command relationships, task, location, supply, morale | Opponents obtain estimates through reconnaissance/contact |
| CommandNetwork | Command staff, language/procedure compatibility, communication links, coordination capacity, order arrival | Project only known delays, exercises, and order-execution records |
| Battle | Month, location, actual participants, frontage capacity, hostility graph, output allocation, common snapshot | Full resolution private; reports separately projected |
| ControlRecord | Node control, capture progress, garrison, local administration, services, unresolved responsibilities | Separate from sovereignty, property, and resident identification |

Service members remain world population; work allocation moves from civilian activity to service/training. Wounded, captured, retired, and traveling people retain age, skills, culture, religion, and origin. Army IDs/names are not population entities. Splitting forces, changing flags, and joining alliances neither copy people nor erase arrears, injuries, and obligations.

## 2. How culture, religion, and education enter military organization

There is no nationwide martial-culture-times-religious-strength multiplier. The following mechanisms act on real groups/organizations, then enter common training/readiness accounts without another cultural bonus.

| Source | Affects | Actual result | Constraints and costs |
| --- | --- | --- | --- |
| Military occupational esteem and public-duty practices | Volunteering and acceptable service duration | Recruitment and reenlistment | Withdraws farming, industry, care, and education labor; rejected war aims can still cause refusal |
| Cooperation and authority practices | Accepted commanders and cross-organization work | Connected command links, execution delays, joint exercises | Shared culture does not create free communications or officers |
| Experience-revision practices | Fault reporting, review, and training improvements | Repair, actual courses, adopted tactical procedures | Requires time/resources; punishment of bad news can bias readiness reports |
| Fixed religious obligations/prohibitions | Acceptable tasks, care, rest, and relief duties | Combat/logistics volunteering, task objections, service contributions | May support defense while opposing aggression; relief consumes real people/materials |
| Education and occupational skills | Map reading, oral coordination, calculation, repair, records, command | Operable equipment, instructor qualification, coordination capacity | Literacy is not required for all early cooperation; modern equipment requires real specialized training |
| Current treatment and experience | Compensation, casualties, protected people, arrears, family supply | Attendance, continuation, morale, flight | Cultural labels cannot override hunger, coercion, or broken commitments |

Doctrine remains fixed, while organizations may interpret the same beliefs differently in a particular war. Interpretations are sourced political information, not ad hoc LLM rule changes. Actual practice, organizational credibility, and known war experience affect participation. Nonreligious people also have family, organizational, and political constraints.

Mobilization uses the same bounded choice system as other work. Groups compare current work, combat, logistics, and lawful exit using expected subsistence, task acceptance, risk, obligations, and migration costs. Private norms and religious practice affect defined utility components; actual known wages, rations, and risk reports supply the information. The archived 0.4 allocation used bounded `u_a` and `p_a = exp(u_a/τ) / Σ_b exp(u_b/τ)`, with `τ > 0`, fixed-point lookup, and carried count remainders. Utility scales, coefficients, and τ were private fixed content, never changed by civilization names, real ethnicity, or player rank. Unknown true enemy strength could not enter willingness.

**Version 1.0 retains those information/behavior constraints but replaces exhaustive monthly choice evaluation with [32](32-population-and-education-v1.0.md)'s aggregate task groups, at most three cached alternatives, and scheduled or materially triggered refresh.** The archived softmax is not a requirement to evaluate every person or every recruitment project monthly. Real offers deduplicate by task, employer, and terms. A hundred identical projects increase only genuinely funded training/supply capacity, not a hundred choice probabilities. Different offers may attract different people while sharing actual candidate counts and hours.

`training entrants = min(known template's fixed headcount ceiling, age/health-eligible available people, actual volunteers or successfully requisitioned people, teaching seats, camp subsistence, available basic equipment)`.

These are intersecting conditions, not independently multiplied fractions that subtract people repeatedly. Underage, traveling, already-serving, full-time studying, or task-ineligible injured people cannot enter twice. Care and accepted employment obligations join common time arbitration. The state may lawfully change future obligations, but lost production and family services still follow.

Compulsory recruitment needs known legal authority, enforcement staff, transport, and actual collection. Execution capacity limits recruits. Flight, concealment, and resistance resolve through organization and contact; refusal cannot simply be rewritten as army membership. Successful requisition is neither training nor willingness for every task. Advertisements, temporary rations, and cancellation/recruitment cycles do not repeatedly create trust.

## 3. Training, qualifications, and organization

At each training month's opening, reserve learners, instructors, subsistence, space, equipment, and consumables across all projects. Progress is limited by the scarcest input. Missing key equipment stops that equipment course, although a separate known theoretical course may continue. Graduates begin new tasks no earlier than next month; one month cannot contain both full-time completion training and full combat service.

| Course | Minimum effective training | Instructor capacity | Completion requirements |
| --- | ---: | ---: | --- |
| Simple-tool local defense | 3 months | 20 learners/instructor | One passed operation and one basic-coordination task |
| Professional standing formation | 6 months | 20 learners/instructor | Equipment operation, discipline procedures, supply, and coordination |
| Powered/industrial equipment role | 12 months | 10 learners/instructor | Required occupational foundations and fault-handling verification |
| Information, unmanned systems, advanced command | 18 months | 10 learners/instructor | Relevant technology, calculation/records, communications, and practical verification |

Converting an existing comparable qualification to a same-layer variant needs at least 2 adaptation months. Crossing layers cannot skip new mandatory skills. These are job requirements, not a demand that every ordinary soldier complete advanced research education. Mixed formations operate according to each position's actual qualification.

Ungraded trainees may perform already-qualified simple local defense using real equipment/skills, not an advanced layer merely because the research graph unlocked it. Learned skills survive interruption. Equipment, instructors, and practice authorization may deteriorate without maintenance; freezing/restarting a project earns no free training months. Current/review-due/supervised/restoring/dormant qualification states follow [32](32-population-and-education-v1.0.md).

A valid command group initially coordinates 100 people. The prototype group consists of 1 qualified commander and 4 appropriately qualified record/messenger staff, all consuming real service time, plus actual communications. Known organizational templates can expand capacity with additional positions/services. Oral communities use equivalent oral/messenger roles and are not blocked by a modern literacy requirement.

Command, transport, and medical staff count as military personnel but cannot simultaneously count as full frontline fighters. `N` below includes only qualified combat positions actually assigned to contact. Command groups separately consume people/supplies. Support staff exposed by capture or interception enter combat/capture according to their actual task; they cannot produce free combat output while immune to contact risk.

`command coverage O = min(1, connected qualified coordination capacity / actually deployed personnel)`.

Obedience to two headquarters does not double capacity. Allied common command requires authority, communications, and joint exercises; otherwise they remain separate participants. Cultural/religious differences do not automatically lower strength. Actual task disputes, language, or procedural obstacles lower coverage only when they prevent connections. Translation and joint exercises may repair cooperation at a time cost.

## 4. Tasks, time, and logistics

Each formation has one principal monthly task, not full simultaneous defense, attack, interception, and training. Existing orders plus arrived changes form the opening task snapshot. Standing orders read only locally received intelligence, without omniscient automated routing.

| Task | Time and resources | Role capability |
| --- | --- | --- |
| Relocation | Actual transport capacity; at least 1 month per cross-region edge, no multiple-edge traversal in one month | Moves only as far as the month permits; attacks en route use relocation state |
| Node capture | Continued frontline deployment, supply, and combat | Breakthrough/mobility/denial task weights 1/0.5/0.25 |
| Prepared defense | Normal subsistence and engineering materials each preparation month | Preparation +0.25/month, maximum 1; relocation clears it, damage follows rules below |
| Escort | Same route, months, and transport as a designated shipment | Mobility provides 1 escort capacity/person, other roles 0.5; equipment templates specify capacity per cargo unit |
| Interception | Actual route contact and reserved mobile forces | Same interception-capacity basis; undiscovered/unreachable goods cannot be attacked |
| Training/rest/demobilization | Mutually exclusive with combat; maintain supply and release/restore roles | No free combat experience; demobilization/homecoming requires transport |

Changing roles needs equipment, qualified people, and at least one reorganization month. The old formation cannot fight at full prior strength during reorganization. People/equipment persist rather than copying into a new template.

Known equipment templates specify food, ammunition/consumables, fuel, and maintenance. Reserve actual opening inventories and arrived services; current production is usable next month. Supply `S` is the minimum fulfillment ratio of required consumables, in 0..1. Early forces with no fuel requirement do not acquire a fictional fuel shortage. Missing critical operating consumables prevents that weapon group from producing advanced output.

Road, river, and sea shipping share capacity between military and civilian use. Carried supplies consume payload; personal packs are not unlimited. Transport loss, abandonment, and capture create inventory transfers. Intercepted goods cannot also count as delivered under the original contract.

Escort and interception on one connection/month form one contact battle using actual forces. Compare surviving capacities afterward. If interception exceeds escort, it may detain cargo up to the difference's supported payload, allocated by declared shipment priority; remaining cargo continues. Captured goods enter the captor's transit/pending-inspection inventory, usable no earlier than next month. Unescorted cargo remains limited by interceptor carrying capacity; one rider cannot carry an entire trade route. The first version has no hidden random “capture all cargo” outcome.

## 5. A computable simultaneous-combat baseline

### Battlefield and strength

Nodes/edges have public or surveyable frontage capacity in simultaneously committed people, with a separate ceiling for each side. Forces under one actual command aggregate before priorities allocate frontage; others remain reserves. One person may enter only one contact battle per month. Cross-battlefield claims allocate jointly before resolution, preventing iteration order from granting extra actions.

Countries form one side only under effective common command; otherwise they remain separate. Hostility defines a battlefield graph, not an assumed two-side limit. Each side allocates output `a(i,j)` among contacted enemies by preset priorities, summing to at most 1. Default allocation follows visible contacted enemy headcount. Splitting alliances/formations under one actual controller still shares output/frontage and cannot create repeated attacks.

For actual participating group g with uniform equipment, role, and qualification:

`B_g = N_g × 2.5^L_g × Q_g × S_g × O_g × M_g × G_g`.

- `N` is actual exposed, qualified people assigned combat positions at that contact node, never robot/drone count. Equipment, maintenance, and compute requirements further limit deployable positions. In this baseline, unmanned formations combine frontline operators/support with unmanned equipment whose effectiveness is already represented by system layer. No fictional personnel conversion is added. Rear operators cannot be killed proportionally when distant drones are lost. Cross-node remote-fire projection is deferred until a separate equipment-exposure/personnel-risk model is designed.
- `L` is the equipment layer actually operable by that group, not national maximum technology or an average subsequently exponentiated.
- `Q` is verified practical job quality, 0..1, with initial qualifying threshold 0.6. Temporary defenders use their actual simple-role qualifications.
- `S` is actual supply; `O` actual command coverage; `M` short-term morale, 0..1. Each has its own realized records; no additional national culture, religion, or education multiplier applies.
- `G` combines terrain/preparation and is clamped to 0.85–1.15. Terrain bases are known through maps; full preparation adds 0.10 within that final range.

Sum group strengths into `B_i`. The overview's role-counter matrix is 1/0.8/1.25. Role shares use **B-weighted** groups so a few advanced troops plus many unequipped people cannot fake a whole-army role advantage. Opposing weights produce `K(i,j)`; output is `a(i,j) × B_i × K(i,j)`.

The baseline adds no extra combat die; environment and intelligence already create uncertainty. Future randomness must be versioned and separately validated, with no rerolls from cancellation/recreation. All real-valued expressions use normative fixed-point arithmetic. Loss residues persist across months on source-population/actual-control lineage accounts. Battle/month are evidence, not reset keys; chosen IDs, renaming, merges, and switching battlefields cannot clear them.

### Casualties, equipment, and morale

Let `H_i = Σ_j a(j,i) × B_j × K(j,i)` be hostile output against i. Monthly incapacitation is:

`L_i = min(N_i, round_with_carry[N_i × 0.08 × H_i / (B_i + H_i)])`.

A zero denominator gives no battle loss. Allocate group incapacitation by actual participants with carried remainders. All sides resolve from one snapshot; resolving first cannot suppress the other's current output. This campaign-scale prototype is not a claim about real casualty probabilities.

One quarter of incapacitation is death and three quarters wounded, with carried remainders. Death enters the unique population sink. Wounded people remain alive but unavailable for work/combat. Real medical capacity supplies care. Return to training/forces requires at least 3 effective care months and a health check. Uncared illness/death belongs to population health rules, without another military deduction. Death lists, medical reports, and population changes may arrive at different times.

Equipment quantities corresponding to casualties enter damage accounts. Half of equipment associated with deaths becomes unrecoverable loss; half remains salvageable wreckage. Wounded personnel's equipment enters repair inventory. Carried remainders prevent splitting from reducing loss. Wreck repair needs half the original recipe's materials/hours; wounded-associated repair needs one quarter; each requires at least 1 full maintenance month. Equipment cannot be reissued intact without actual repair. Battlefield control determines salvage access, which consumes transport/labor. Undamaged personal equipment follows demobilized, captured, or surviving people without appearing in both parties' inventories.

After battle:

`M' = clamp(M + R - 0.5×L/N - 0.10×(1-S) - 0.03×U - 0.05×C, 0, 1)`.

`U` is the current unpaid share of agreed subsistence; `C` is already experienced and known command interruption. `R=0.03` only during a noncombat rest month with adequate supply and fulfilled obligations; otherwise 0. Morale is not long-term culture. Arrears cannot be deducted repeatedly under synonymous metrics.

A recruit without service history starts at morale 0.6. Reorganization inherits people-weighted existing morale, never resets a lower value to 0.6. Demobilized people's service experience/morale remains with source groups; reenlistment, merging, migration, and naturalization preserve it. During retirement, actual qualifying rest and family supplies may restore 0.03/month; demobilization itself grants no instant recovery. Replacements mix by headcount and require actual training/supply. `C` affects later confidence; current command capacity already enters `O`, so `C` is not another current-output factor. If `N=0`, omit the casualty-rate term and close the personnel-empty formation record.

Known war aims may change cultural/religious participation, continuation, and executable tasks next month through people/command records. Do not add a final “faith casualty” adjustment. Underlying training norms obey slow cultural drift.

### Retreat, surrender, and multiple opponents

Players may set more cautious retreat thresholds. Forced retreat occurs at postbattle `M < 0.25`, critical supply below 0.25 for 2 consecutive months, or the node-capture evacuation condition below. Forces enter a retreat queue and cannot initiate a new attack next month. Retreat needs a known lawful route, access, and transport, not teleportation.

Ordinary retreat with a route but insufficient transport leaves people defending/waiting with continued subsistence. Capacity evacuates wounded first, then those no longer combat-qualified, then others. Complete encirclement with `M < 0.25`, or 3 consecutive months without basic supply and no executable exit, triggers surrender. Survivors become prisoners; goods follow actual control. Incapacitation is not counted as another death. Capture progress 100 imposes a separate one-month deadline: evacuate those who can actually travel next month; surviving people left behind surrender. Infinite waiting cannot prevent a breached node falling. Route checks use known paths and actual attempts; undiscovered safe routes do not rescue forces for free.

With several besiegers, prisoners belong to whoever actually controls their node. While hostile claimants still contest it, record a locally restrained group; no party can requisition it in advance. Transfer follows unique control, while care, food, and population continue. Prisoners cannot instantly become qualified loyal recruits. Release, exchange, and reenlistment require separate agreement, transport, legal-status, and training processes.

## 6. Capture, occupation, and governance

A node's resistance scale `F` depends on constructed defenses, roads, and garrison facilities, with minimum 100 standard capability units. It does not depend on player rank. Previously unknown defenses may become reportable through contact. Breakthrough/mobility/denial capture weights are 1/0.5/0.25; defense weights 0.5/0.5/1. Preparation enters only once through `G`.

Each node has one actual capture process. Mutually hostile attackers first fight according to capabilities and hostility. Without a unique, nonretreating strongest controller candidate, capture does not advance; IDs do not break ties. Valid common-command allies may combine, with ownership following prior agreement.

Let candidate attack-task capacity be `A`, and present defending capacity opposing its control total `D`. Progress `Z` is 0..100. Recompute task capacity after current casualties, morale, and retreat using surviving deployments. Dead, retreating, or otherwise-tasked people contribute neither capture nor defense. Q, supply, and command use actual current records, without another round of consumption/combat. New preparation affects G no earlier than next month; attackers cannot simultaneously earn defensive preparation.

`Z' = clamp(Z + clamp(20 × (A-D)/F, -20, 20), 0, 100)`.

Positive progress requires actual supplied deployment. After attackers retreat/leave, progress decays 20/month; a nominal distant army cannot preserve a siege forever. A new attacking controller inherits real fortification damage but begins Z at 0. Renaming/splitting the same controller neither resets nor stacks progress. Even undefended nodes require at least 5 months at maximum progress to arrive, clear, and organize control; one scout cannot annex a nation.

At 100, enemy defenders must evacuate or face surrender next month. Control changes only after actual evacuation/restraint and present personnel capable of maintaining control, effective the following month. Without unique control, the node remains contested. Each additional 20 effective progress removes 0.25 existing defensive preparation, minimum 0. This represents breached deployment/temporary obstacles, not automatically deleted permanent buildings. No extra random facility destruction is modeled. Deliberate demolition of controlled facilities uses actual work/material-recovery project rules. Capture does not automatically destroy housing or kill residents.

Military control still needs administration. Each 100 governed residents requires at least 1 qualified administrative/security labor equivalent per month, with a node minimum of 20. Communications, actual patrols, and records must be reachable. Qualified willing locals can supply them; garrisons cannot simultaneously fight and administer full-time. This is a prototype service recipe; later technology may reduce unit hours but cannot bypass communications/resident contact.

Stable control requires 6 consecutive months of fulfilled administration/security demand, no remaining executable enemy control, actual food/basic-water supply at least 90% for every covered group, and real projects addressing displaced people, wounded residents, and facility maintenance. Any failure suspends qualification and clears the consecutive count, without erasing built facilities or knowledge. Stable local governance does not automatically grant global victory.

Sovereignty transfers under effective peace terms or takeover rules after the original government loses actual independent-governance capacity. Occupation does not freely rewrite private ownership, culture, religion, or technological mastery. Genuinely independent remnants retain actions; shell renaming creates no sovereignty. Global integration still requires sustained governance and FTL acceptance.

Minimum takeover test: every actual administrative node of the old polity is under another's stable control, and its government has no other present organization with real residents, independent administrative/tax execution, and external-security command. A name, account, or fugitive army alone is not a new government. A remnant that genuinely governs residents blocks complete takeover. When qualified, the successor may register takeover and inherit responsibilities; the original player loses an independent seat. Occupied assets, historical debts, displaced residents, and local resistance persist. Federal members retaining actual constitutional authority continue acting under their charter, but 1.0 victory remains single-seat competitive.

## 7. Action entries and state transitions

Every process has an explicit entry rather than free text creating actions. Validate permissions by stage; protocol-field migration is summarized in the 0.4 contract addendum.

| Entry | Inputs and transition | Failure/cancellation |
| --- | --- | --- |
| `start_project`: recruitment/training | Known fixed-size role template, location, monthly budget, and known `choices` for source/candidates/formations; candidate → training → verification → qualified | Train actual arrivals if recruitment is short; funding interruption pauses while preserving real skills and consumed inputs |
| `start_project`: reorganization | Known formation and target role/equipment template; active → reorganizing → verification → new formation | At least 1 month; missing inputs do not undo consumption; actual people/assets remain in reorganization |
| `military_order` | Formation, task, known target, route, supply sources, monthly ceiling, retreat threshold, known enemy priorities, local emergency conditions | Failed movement leaves actual location; stale intelligence is not free scouting; one final order per formation/batch |
| `military_order`: rest/demobilize | Rest reserves subsistence/maintenance; demobilization names a reachable return node and releases future service | Transit still requires supply; no instant local civilian worker; prior responsibilities remain |
| `start_project`: joint exercise/command | Participating formations, authorized common command, personnel, communications, practical template | Unauthorized allies cannot be commanded remotely; exercises do not magically change hidden culture |
| `propose_treaty` / `sign_treaty` | Peace, access, common defense, prisoner exchange, subsequent sovereignty | Only stated terms and executable authority apply; natural-language submission does not transfer power instantly |

`military_order` tasks include relocation, capture, defensive preparation, escort, interception, rest, and demobilization. Cargo, connection, or return-node references are conditionally required. Trainees/reorganizing personnel lacking an executable combat template cannot be ordered into qualified status. Pause/cancel still uses `manage_project`; there is no direct resource-bypassing add-troops action.

Recruitment/training use fixed-size protocol templates, without arbitrary `requested_people` or `target_people` fields. Template size caps candidate capacity; actual shortages allow smaller attendance, not fictional filling to 500. Expansion uses another known template or genuinely funded projects sharing instructors, candidates, and equipment under common arbitration.

Mutually exclusive personnel states begin `civilian → recruited → training → qualified`, then transition among `deployed / reorganizing / resting / returning` under valid orders. Combat can produce `wounded / captive / dead`. Actual care returns wounded people to qualified/civilian; release and travel return captives to civilian; death is terminal. Demobilization first enters returning, with local labor available only after arrival. Transitions carry actual counts/assets and follow stages actually occurring that month; a chain of commands cannot skip time gates.

## 8. Examples and attacks

### Equal population does not mean equal mobilization

A and B each register 10,000 people. A has 2000 potential candidates after age, health, care, and obligations; 600 accept the war task, instructors can teach 400, camp supply supports 500, and equipment supports 450. At most 400 begin training. B has only 1600 candidates but 900 willing to defend locally, teaching capacity 800, camp capacity 750, and equipment 700: at most 700. These people leave prior work; original production cannot remain unchanged. These are assumed snapshots, not fixed traits of cultures.

After 3 months A may qualify for simple local defense, not automatically B's professional standing roles. It may expand teaching/supply, change war aims, or improve family support. Doubling budget without adding instructors cannot exceed 400 simultaneous seats.

### Technology, supply, and simultaneous losses

Assume identical roles, terrain 1, command/training/morale 1. A has 1200 people one layer higher; B has 1600 lower-layer people. Strength is 3000 versus 1600. With full mutual output, first unrounded incapacitation is A `1200×0.08×1600/4600≈33.3913`, B `1600×0.08×3000/4600≈83.4783`. Submission order changes neither.

At supply 0.45, A's strength falls to 1350; unrounded losses become about 52.0678 and 58.5763. The gap narrows and A also loses supply-related morale, potentially retreating. This does not prove B has conquered A. Fractional losses stay with actual process lineage; splitting into 1200 one-person formations cannot avoid them.

Even under the least favorable pure-role/terrain pairing, otherwise equal one-layer-higher strength has relative value `2.5×0.8×0.85/(1.25×1.15)≈1.1826 > 1`. One role choice cannot reverse this trained-equipment advantage; inadequate supply, organization, and numbers still can.

### Tactical output cannot duplicate

In three-way combat, A has 1000 capability and is hostile to B/C. Allocating 0.5 each with counters 1 sends 500 to each. Two A flags still share 1000 output and one frontage; each cannot send 1000 to both opponents. Alliance without common-command development does not create seamless coordination.

### Occupation cannot farm victory

At `F=100`, attack capacity 200 and defense 50 imply progress 30, capped at 20/month. Reaching 100 takes at least 5 months, followed by actual evacuation/takeover. Stable control then requires at least 6 continuous months of administration/supply. Expulsion does not erase resettlement obligations. Controlling every region still requires military-wide FTL and the global governance window.

## 9. Required checks

- A person cannot work, train, or fight in multiple simultaneous places; command, weapons, and logistics cannot duplicate.
- Simultaneous output, stage barriers, fixed rounding, and multicore scheduling leave losses, capture, and control unchanged.
- Role counters and otherwise-equal technology superiority hold. Task variety does not force equal mixed composition to be optimal, nor prove it must fail.
- Captive, wounded, and retired counts conserve people; combat/health deaths have exclusive entries.
- Flags do not instantly change religion/culture; conquest preserves educational history; battle-report explanations do not expose secret causal tables.
- Arrears, reform, intimidation, and advocacy require actual propagation/execution; renaming or repeated orders cannot reset attitudes.
- Lower technology can gain local advantage through numbers, supply, and organization, without free advantages from tiny formations, extra attacks, or rerolls.

The chapter closes mechanisms sufficiently for finite-state/accounting tests. Equipment recipes, map capacities, and technology-specific job courses remain versioned content. They may change costs/pacing, not conservation, simultaneity, or information boundaries. No war simulation has run; these examples do not establish balance.
