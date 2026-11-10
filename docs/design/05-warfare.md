# Warfare and Technological Gaps

War changes control, security, access, and political relationships. At equal numbers, training, and supply, advanced technology gives a substantial direct combat advantage. Three roles counter one another within each military tier. Technology does not remove manpower, logistics, maintenance, or occupation costs.

[Monthly war resolution](13-war-resolution.md) governs mobilization, training, command, simultaneous casualties, retreat, surrender, capture, and governance. This chapter is the overview. Prototype numbers are calculable but have not been calibrated through combat simulation. Conquering every opponent still requires military-wide FTL acceptance; military victory is not an alternative endpoint. All v1.0 matches have at most one winning original seat.

## Three roles

The common roles are `assault`, `maneuver`, and `denial`. Assault counters denial, denial counters maneuver, and maneuver counters assault. Different equipment expresses the same relation across eras, limiting learning overhead.

| Military tier | Assault | Maneuver | Denial |
| --- | --- | --- | --- |
| 0: Subsistence and agricultural settlement | Melee groups; later shield warbands | Light hunters | Simple defenses; later spear formations |
| 1: Urban crafts | Heavy infantry | Cavalry | Pike formations |
| 2: Powered machinery | Assault infantry | Mounted archers and rapid units | Field artillery |
| 3: Industrial networks | Armored assault groups | Motorized raiders | Anti-armor positions |
| 4: Information and intelligence | Heavy combined-arms forces | Long-range mobile strike groups | Air-defense and anti-armor networks |
| 5: Planetary engineering | Heavy unmanned breakthrough groups | Distributed mobile swarms | Area-denial systems |

These are simplified operational roles, not a claim that all historical tactics fit a triangle. Punk traditions supply equipment and supply-chain variants, not dozens of extra independent roles. Interstellar unit types are not introduced before FTL.

Starting forces use only tools, cooperation, and defenses they possess. A tier label does not grant free shields, spears, or standing armies. Early temporary levies still perform the three kinds of tasks; sustained service and professional forces require later support and organization.

## Initial combat function

Population is not military strength. Recruitment first identifies people willing or effectively compelled to serve, then accounts for health, care, critical production, existing labor duties, and training. Only equipped and organized forces enter the combat function. A million residents cannot become a million combatants by command.

Culture and religion influence willingness, legitimacy, disciplinary practices, coordination, and acceptable forms of war. Education enables command, records, equipment operation, and maintenance. A group rejecting one kind of war may strongly defend its homeland. Military prestige cannot replace training or supplies. Response parameters are private; players receive recruitment, training, obedience, and casualty reports, not a “culture × religion → combat power” table.

Soldiers occupy population, food, equipment, training, and pay or in-kind support each month. Readiness already embodies training and organizational results; do not multiply again by universal culture or education bonuses. Technological comparisons assume comparable training and organization. A technologically advanced state unable to operate equipment, establish trust, or mobilize is not guaranteed to win.

Effective military tier is the level actually supported by equipment, training, maintenance, and operating systems, not the civilization's highest research tier:

`group base power = actual engaged personnel × 2.5^actual equipment tier × practical proficiency × supply satisfaction × command coverage × morale × terrain/preparation modifier`.

Sum friendly groups, allocate output to targets, then apply counters. Detailed notation and monthly casualty formulas are in the war specification. Proficiency, command, and morale expand the old ambiguous readiness factor; never multiply that old factor again.

Initial same-tier counter matrix, with friendly role in rows and opponent role in columns:

| | Assault | Maneuver | Denial |
| --- | --- | --- | --- |
| Assault | 1.00 | 0.80 | 1.25 |
| Maneuver | 1.25 | 1.00 | 0.80 |
| Denial | 0.80 | 1.25 | 1.00 |

Composition weights use actual base-power shares, preventing low-capability personnel from diluting or disguising equipment composition. Terrain and preparation together remain within 0.85–1.15; other fulfillment/capability fractions remain within 0–1. The v0.4 baseline has no independent combat die: uncertainty comes from actual environment, information, and opponents. Counters and terrain alone cannot reverse a one-tier advantage at equal numbers, training, organization, and full supply. Extreme-combination examples are in the detailed specification.

The symmetric matrix has an explicit equilibrium: at equal cost and task, with unknown enemy composition, one third of each role produces `(1 + 0.8 + 1.25) / 3 ≈ 1.0167` against any pure opposing role. It would be wrong to claim this contact-combat model has no easily found conservative solution.

The matrix remains a contact modifier; strategic depth comes from actual tasks and deployment. Assault captures nodes. Maneuver requires the roads, fodder, or fuel appropriate to its equipment to intercept or escort. Denial must establish and hold positions. Preparation, movement, and supplies prevent costless monthly reorganization. Attack, escort, and defense consume different task capacities. A one-third mix can be a blind-combat baseline without being best for a mountain pass, transport interdiction, or a time-critical offensive. Prototype task weights are defined in the detailed specification but require adversarial evaluation; extra coefficients must not merely conceal the equilibrium.

Mixed equipment tiers are evaluated group by group and summed. One advanced item cannot raise the entire army's tier; averaging tiers before exponentiation is also prohibited. Multiple armies on one battlefield first merge actual engaged composition and task capacity. Splitting into a hundred armies adds no attacks, minimum damage, draws, or supply capacity. Transport and battlefield frontage limit engagement; reserves cannot all fight simultaneously through a narrow pass.

Numbers, disrupted supplies, urban fighting, and political resistance can still defeat advanced forces. Cross-tier coefficients need calibration. Low-tier units do not ignore technological gaps through lucky dice.

## Campaign resolution

The map consists of regions and connections. Players assign existing armies a task, target, supply source, route, and retreat threshold rather than move individual soldiers. Recruitment and equipment templates fix unit scale and role composition. v1.0 supports campaigns through different single-role or mixed templates and joint deployment, without individual-soldier organization. Both sides resolve from the same authoritative month-start state; each player decides using its own observation.

Monthly combat first calculates accessible personnel and supplies, then composition, terrain, and power, and finally writes casualties, equipment losses, and morale simultaneously. Casualties cannot exceed actual people. Deaths and demobilization update population accounts. Unengaged reserves take no combat casualties but still incur supply and maintenance costs.

Orders include explicit local contingencies: defend when attacked, withdraw below supply thresholds, stop when the specified route is blocked, and assist only within signed defensive commitments. Automation reads reports received by the army or government; it cannot perform omniscient monthly replanning. The detailed rules specify simultaneous casualties, surrender, at least five months to capture a node, and six months to verify stable control. Recipes and map capacities belong to later content tables; battle win rates have not been established.

Sieges and regional capture require continuous battlefield and logistical control. One skirmish cannot instantly transfer an entire state. Assault, maneuver, and denial affect capture, transport disruption, and line holding respectively; task effects and the public counter matrix are versioned.

## Reconnaissance and orders

Enemy equipment, numbers, supplies, and intentions may have different accuracy and observation dates. Own registered forces and inventories can be exact, while distant battles have communication/report delays. Reconnaissance, transport observation, shared reports, and combat contact improve intelligence.

Orders contain routes and supply budgets. Exploration and conditional movement can target frontier leads, but path-validity errors cannot enumerate hidden armies or facilities. Unreachable-target results reflect information actually acquired during execution.

If `military_order` omits a route or supply source, a public deterministic rule chooses using only known connections, costs, and risks, never hidden safe routes. `route_refs` specifies successive connection handles from the current location and must terminate at the target. `supply_source_ref` identifies the supply site. Unknown regions can be approached through visible frontier leads, not invented IDs. Attacking foreign control creates hostility. Violating a ceasefire, access agreement, or defense commitment creates breach events; the engine does not cancel treaties first on the player's behalf.

## War aims and occupation

v1.0 supports regional capture, access, lifting blockades, reparations, and political submission. Peace agreements use contract mechanisms; prose cannot create extra effects.

Military control, legal sovereignty, facility ownership, operational cooperation, and knowledge mastery are separate. Occupation needs garrisons, public services, maintenance, personnel, and local organizations. Flight, damage, and disrupted supply can disable captured industry. Culture does not change immediately with a flag.

Actual defeat changes command authority. An annexed former player cannot continue issuing sovereign orders without a real institution and rights. Local autonomy permits only retained powers, while real resistance remains subject to personnel, resources, organization, and detection. No eliminated seat holds a costless permanent veto over global verification; see [competition and native AI](33-competition-and-native-ai-v1.0.md).

Indiscriminate destruction cannot bypass global-governance requirements. The first release provides no mass-extermination action. Research or deterrence involving major weapons needs a separate design and is not automatically unlocked by high-energy engineering.

## Acceptance criteria

- Same-tier pure compositions follow the counter triangle under mirrored terrain and supplies.
- A one-tier equipment advantage is substantial under equal conditions; role selection alone does not erase it.
- Mixed forces, reconnaissance, transport, and concentration have measurable strategic value.
- Advanced forces cannot fight indefinitely without maintenance and supplies.
- Combat, migration, death, and prisoner records agree with population accounts.
- Earlier command submission or entity traversal gives no systematic advantage.
