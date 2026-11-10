# 0.6 — Complete Technology Atlas and Industrial Transitions

This designer-facing atlas defines 138 technology nodes, their foundational dependencies, and economic requirements. Every match of one `content_version` uses the same complete node set, AND/OR dependencies, discovery/unlock rules, and scientific/FTL assumptions. “Candidate” means a civilization may choose to investigate or adopt a node, not that generation samples a subset. This is neither a catalog of every human invention nor a mandatory completion checklist. Players receive only locally discovered nodes and known conditions. Internal IDs, complete dependencies, unknown directions, and undiscovered FTL prerequisites are excluded from seat packages.

Version 0.7 adds [production chains and inputs](21-production-chains-v0.7.md) and [six technology strata](22-technology-strata-v0.7.md), correcting excessive prerequisites for generation, heat recovery, local electrochemistry, fertilizers, and polymers. Version 1.0 additionally corrects T048, T117, and T121 as recorded in [31](31-knowledge-and-culture-v1.0.md). IDs and counts remain unchanged; implementations still need their actual process conditions.

This atlas inherits the [knowledge state machine](16-knowledge-and-culture-engine.md), [monthly engine](../technical/07-monthly-engine-spec.md), and [fleet-wide FTL acceptance](15-victory-and-ftl.md). Political/cultural adoption is in the [cultural atlas](18-cultural-atlas-v0.6.md), and learning in the [education specification](19-education-and-transmission-v0.6.md). These are content designs, not an executable complete recipe package.

## Scientific boundaries and traditions

Steampunk, dieselpunk, and cyberpunk emerge from facilities, occupations, institutions, and distribution. They cannot bypass physics. Steam can deepen boilers, turbines, thermal management, and heavy machinery, but advanced spaceflight still requires electrical measurement, materials, computing, and control. Diesel has the same capability barriers; liquid fuel cannot burn directly into FTL.

| Label | Meaning | Use in this game |
| --- | --- | --- |
| [Established] | The underlying scientific/technical category has a real research or application basis | The abstraction is not the only historical sequence and grants no unspecified performance |
| [Extrapolated] | Engineering awaiting validation or scale-up | Declare assumptions, performance ranges, inputs, and failure conditions; a futuristic name gives no unlimited capability |
| [Fictional] | Explicit game-assumed FTL capability | Not established as feasible in reality; valid only under sealed game physics, not presented as mature engineering through theoretical terminology |

FTL uses one minimal fictional interface: under material and spacetime conditions fixed by the content version, a device can perform repeatable faster-than-light transport. Civilizations must discover and verify those conditions. High-throughput and high-precision implementations are two fixed engineering arrangements under that assumption, not two scientifically demonstrated FTL principles. Every route first needs genuine industrial and organizational capacity.

## Backbone and notation

`Subsistence and surplus → durable records, specialized craft, transport → measurement, comparison, reproducible methods → industrial manufacture and scaled education → electricity, materials, computing, reliability → orbital production and high-energy experiments → fictional FTL interface → sustained fleet capability`.

Society need not change eras uniformly. A mostly rural state may host a few advanced institutions. One school, imported device, or theory does not establish nationwide capability.

`&` means AND, `\|` means OR, parentheses define grouping, and `—` indicates an initial practice entry. Knowledge prerequisites normally require locally verified understanding. Actual facilities, materials, or people must also satisfy column four; researched does not mean constructed. Stage tasks specify whether understanding, a prototype, or adopted practice is needed.

Dependencies are fixed capabilities, not rerollable edges. All equipment/material alternatives and discovery entries remain in the version. Local resources, knowledge, and facilities determine visibility, implementation, and value. Seeds do not delete OR branches or change rules; choosing one does not erase another. Knowledge dependencies are acyclic; material and equipment reproduction cycles close through cross-month inventory.

Physical/process responses and discovery rules are versioned. Seeds create qualities, environments, and initial states; sealed actual-trial streams generate measurement error. Equipment, batches, and environments can change observations, but laws cannot change between matches or reroll after transition or failure. Knowledge states and operating capabilities are separate records. Lighting up a node never replaces prototyping, construction, maintenance, or qualified personnel.

Qualified teams with earlier knowledge and adjacent skills may conduct original research. Do not require graduates in an uninvented technology before allowing its invention. Actual research and verification first create teachable content.

## A. Subsistence, communities, and early craft: 16 nodes

| ID | Node | Knowledge prerequisites | Real facility/material/talent requirements | Capability and discovery entry |
| --- | --- | --- | --- | --- |
| T001 | [Established] Composite stone and bone tools | — | Workable stone, bone/wood, skilled production time | Cutting and working; wear and material differences expose problems |
| T002 | [Established] Controlled fire and heat treatment | — | Fuel, safe hearths, fire-tending labor | Cooking, drying, heat treatment; inadequate temperature creates clues |
| T003 | [Established] Ecological observation and combined hunting/fishing | T001 | Seasonal observation, tools, teaching, supplies | Bounded gathering/hunting improvement; migration and depletion motivate investigation |
| T004 | [Established] Fibers, ropes, nets, and weaving | T001 | Fiber preparation, manual labor, drying space | Cordage, nets, containers, clothing; strength and durability problems |
| T005 | [Established] Cultivation and seed selection | T003 & T001 | Suitable plants, land, water, full-season observations | Cultivation and repeatable selection; seasonal/output variation supplies evidence |
| T006 | [Established] Husbandry and breeding | T003 & T004 | Suitable species, feed, space, care | Animal products and potential traction; disease and feed competition constrain scale |
| T007 | [Established] Drying, storage, and preservation | T002 & T004 | Stores, containers, fuel or salt, pest maintenance | Seasonal food stocks; spoilage and allocation failures expose improvements |
| T008 | [Established] Kiln-fired pottery | T002 | Suitable clay/minerals, kiln, fuel, trial batches | Heat-resistant vessels and building material; glazing and temperature control |
| T009 | [Established] Counting and recording marks | T001 & T003 | Real exchange/allocation tasks, marking media, teaching | External memory and quantity correspondence; not automatically full writing |
| T010 | [Established] Seasonal calendars | T009 & T003 | Continuous observation, stable records, comparison | Timing sowing/migration; errors motivate astronomy and measurement |
| T011 | [Established] Land improvement and water diversion | T005 & T008 | Water, land rights, civil labor, maintenance obligations | Fields, irrigation, drainage; upstream disputes and silt remain real |
| T012 | [Established] Woodworking and structural joints | T001 & T004 | Timber, tools, craftspeople, load trials | Housing, bridges, machine components; investigable structural failures |
| T013 | [Established] Hulls and coastal navigation | T012 & T004 | Timber or equivalent hull material, crew, supplies, accessible water | Freight and contact; weather and route risk generate experience |
| T014 | [Established] Mineral identification and concentration | T001 & T002 | Accessible minerals, samples, fuel, craftspeople | Identify usable ores; exploration changes knowledge, not deposit quantities |
| T015 | [Established] Early copper smelting | T014 & T008 | Copper ore, furnace charge, reducing fuel, labor | Metal objects; ore and furnace temperature limit actual output |
| T016 | [Established] Length, volume, and weighing standards | T009 & T012 | Standards, checking personnel, storage, recalibration | Comparable physical quantities; inconsistent standards motivate coordination |

Starting scenarios provide a few practiced nodes or observable clues, not all of group A. Agriculture is not the sole foundation for specialization: stable fishing, pastoral production, and trade can supply surplus if actual provision and transport exist.

## B. Specialized society, records, transport, and equipment: 19 nodes

| ID | Node | Knowledge prerequisites | Real facility/material/talent requirements | Capability and discovery entry |
| --- | --- | --- | --- | --- |
| T020 | [Established] Animal traction and agricultural tools | T005 & T006 & T012 | Suitable animals, implements, feed, land | More cultivated area per worker; water, soil, and seasons remain limiting |
| T021 | [Established] Water lifting and distribution | (T011 \| T024) & T012 & T016 | Irrigation or settlement wells/channels, lifting equipment, maintenance, durable organization | Farm or residential needs motivate lifting; net supply and head are measurable |
| T022 | [Established] Alloy casting | T015 & T016 | Alloy constituents, molds, furnace control, mixture experience | Castings and tools; different alloys require actual distinct resources |
| T023 | [Established] Iron smelting and forging | T014 & T008 & T016 | Iron ore, fuel, lining, smiths | Iron tools, structures, weapons; fuel and maintenance limit scale |
| T024 | [Established] Masonry and load-bearing structures | T008 & T012 & T016 | Stone/brick, binders, construction, maintenance | Durable buildings, stores, public facilities; trials accumulate evidence |
| T025 | [Established] Reproducible writing | T009 & T016 | Durable media, actual writers, language teaching | Intergenerational records and complex orders; not universal literacy |
| T026 | [Established] Arithmetic and accounting tools | T025 & T016 | Real accounting tasks, recorders, review time | Income, inventory, quantity calculations; money and financial rights need institutions |
| T027 | [Established] Roads and staged transport | T012 & T016 | Passage rights, roads/bridges, vehicles, supplies, maintenance | Land capacity and predictable trips; geographic costs persist |
| T028 | [Established] Sailing and navigational positioning | T013 & T010 & T026 | Rigging, crew, observations, maritime supply | Wider routes; unexplored waters retain uncertainty and risk |
| T029 | [Established] Waterwheels and wind machinery | T012 & T016 | Water/wind, transmission materials, seasonal upkeep | Nonhuman power; geographic and output variation motivate alternatives/storage |
| T030 | [Established] Recording media and teaching-text reproduction | T025 & T004 | Paper, tablets, or other media; copyists, storage | More known texts; manual copying remains costly and slow |
| T031 | [Established] Glass and glaze processes | T008 & T014 | Suitable feedstock, heat, crucibles, trial firings | Candidate transparent/chemical vessels; vessel glass is not optical glass |
| T032 | [Established] Medicinal observation and trauma care | T003 & T007 & T001 | Identifiable materials, clean tools, carers, records | Empirical care; benefits and side effects need comparison, not assumed traditional efficacy |
| T033 | [Established] Drinking water, waste removal, and settlement hygiene | (T011 \| T021) & T024 | Water sources, channels, disposal space, cleaning labor | Can develop from farm or settlement waterworks; not permanent immunity after construction |
| T034 | [Established] Mechanical timekeeping | (T029 \| T012) & T026 & T023 | Gears, machining, real drive/storage such as weights, escapement, calibrators, stable site | Time comparison and regulation; friction/material limits, no mandatory waterwheel/windmill |
| T035 | [Established] Mechanical projection and stored-energy components | T012 & T004 & T016 | Elastic/counterweight parts, manufacture, trials, training | Projectile and engineering equipment; specific recipes, not national combat bonuses |
| T036 | [Established] Propellants and controlled combustion | T014 & T008 & T040 | Qualified ingredients, controlled preparation, isolated trials, batch inspection | Verified combustion/propulsion materials; actual inputs, losses, accidents |
| T037 | [Established] Barrel weapons and proof testing | T036 & (T022 \| T023) & T045 | Qualified barrels, propellants, inspection space, assembly, training | Period-appropriate firearms; scale and unit use follow warfare rules |
| T038 | [Established] Aerodynamics and powered flight | T051 & T050 & (T091 \| T101) | Wings, power, controls, flight tests, ground support | Powered aircraft and mission equipment; military aircraft are not mandatory for every space route |

T035–038 are optional equipment/application knowledge, adding no war-command categories or mandatory gunpowder, conquest, or air force prerequisite for FTL. Equipment still needs era recipes, manufacture, training, command, and supply. An application node cannot directly become a combat multiplier.

## C. Measurement, experiments, and teachable science: 19 nodes

| ID | Node | Knowledge prerequisites | Real facility/material/talent requirements | Capability and discovery entry |
| --- | --- | --- | --- | --- |
| T040 | [Established] Quantitative measurement and calibration | T016 & T026 | Comparable standards, instruments, records, repeated calibration | Error bounds and cross-location checking; one reading is not truth |
| T041 | [Established] Precision optics and reflective devices | (T031 \| T023) & T040 | Optical-quality materials, grinding/polishing, checking, stable supports | Microscopic/astronomical instruments; glass and reflective routes pay distinct costs |
| T042 | [Established] Pressure, fluids, and vacuum equipment | T021 & T040 | Seals, pumps, vessels, pressure/leak measurement | Fluid trials; leaks, corrosion, strength remain constraints |
| T043 | [Established] Chemical separation and quantitative analysis | (T031 \| (T008 & T023)) & T040 | Glass or qualified ceramic/metal vessels, separators, samples, protection | Composition and purity checks; substitutes differ in corrosion, transparency, heat, contamination |
| T044 | [Established] Precision transmission and machining gauges | T034 & T023 & T040 | Turning/grinding, gauges, skilled labor, adjustment | Reproducible mechanisms; precision comes from manufacturing, not era labels |
| T045 | [Established] Controlled comparisons and repeated trials | T025 & T040 | Control samples, separate records, staff, repeated inputs | Excludes some confounders; early farm/craft use is not a modern national research system |
| T046 | [Established] Anatomy, physiology, and clinical records | T032 & T025 & T045 | Lawful samples, care/testing facilities, investigators | More checkable medical explanations; law and culture affect participation/sampling |
| T047 | [Established] Algebra, geometry, and astronomical models | T026 & T010 & T040 | Calculators/measurers, texts, continuing observation | Computable predictions; model error creates questions |
| T048 | [Established] Scaled printing and inexpensive records | T030 & T016 | Manual relief/plate or precision printing equipment, suitable marking material and media, distribution, operators; precision mechanical implementation also needs T044 & T043 | Lower real copying costs; no universal clockwork prerequisite; readers and delivery remain necessary |
| T049 | [Established] Reproducible scientific methods | T045 & T047 & T040 | Effective review, retained data, measurement, sustained research organization | Systematic scientific agenda; several cultural institutions can organize it |
| T050 | [Established] Material strength and failure analysis | T023 & T045 & T040 | Samples, load equipment, records, qualified analysis | Reliable design evidence; failed specimens consume real materials |
| T051 | [Established] Mechanics and continuous-quantity calculation | T047 & T050 & T049 | Measurement, mathematical training, verified motion experiments | Mechanical, ballistic, orbital calculation; no free engine |
| T052 | [Established] Thermodynamics and energy accounting | T042 & T043 & T049 | Temperature/pressure measurement, heat, instruments, experimental teams | Heat-engine/loss analysis; efficiency labels cannot exceed available fuel |
| T053 | [Established] Microorganisms and infection mechanisms | T041 & T046 & T049 | Microscopy, samples, clean work, care research | Causal and disinfection evidence; treatments need separate verification |
| T054 | [Established] Electromagnetic phenomena and measurement | T043 & T040 & T049 | Conductors, magnetic materials, experimental power sources, instruments | Repeatable electromagnetic effects; not a free grid |
| T055 | [Established] Probability, statistics, and error analysis | T026 & T045 & T049 | Records, sufficient samples, reviewers, computation | Uncertainty estimation and quality checks; correlated samples are not independent |
| T056 | [Established] Soils, nutrition, and agricultural experiments | T005 & T043 & T045 | Trial plots, water, samples, multi-season records | Input responses and improvements; no instant removal of land constraints |
| T057 | [Established] Quantum phenomena and testable models | T041 & T054 & T055 & T049 | Spectral/electromagnetic experiments, mathematics, repeatable measurements, independent checks | Test microscopic phenomena; no FTL communication or free compute |
| T058 | [Established] Statistical physics and condensed matter | T057 & T052 & T050 & T043 | Temperature control, samples, composition checks, computation, measurement | Transport, phase transitions, electronic properties; devices still require manufacture/verification |

## D. Industrial foundations and material conditions for scale: 12 nodes

| ID | Node | Knowledge prerequisites | Real facility/material/talent requirements | Capability and discovery entry |
| --- | --- | --- | --- | --- |
| T060 | [Established] Coking, steel, and furnace control | T023 & T050 & T052 | Ore, coke or verified substitute, furnaces, transport | Structural materials at scale; actual fuel/environmental costs |
| T061 | [Established] Standardized machine tools | T044 & T050 | Precision tools, power, frames, gauges, machinists | Reproducible equipment machining; one prototype is not national capacity |
| T062 | [Established] Textile machinery and powered production | T029 & T061 & T004 | Fiber, power, maintenance, workers, product demand | Textile lines; expansion requires actual buyers or uses |
| T063 | [Established] Mechanical drainage and deep extraction | T042 & T061 & T050 | Pumps, supports, power, miners, safety services | Harder deposits become extractable; grade, accidents, and transport still constrain |
| T064 | [Established] Industrial chemistry and process control | T043 & T052 & T061 | Feedstock, reactors, energy, protection, process personnel | Bulk separation, reaction, cleaning products; waste needs a destination |
| T065 | [Established] Vocational teaching and training equipment | T030 & T061 & T045 | Qualified instructors, workstations, materials, student provision | Repeatable training tasks; access and qualification rights remain institutional |
| T066 | [Established] Interchangeable parts and tolerances | T061 & T040 & T055 | Independent gauges, machining, sampling, supplier coordination | Repair and scale; claimed specifications are not measured acceptance |
| T067 | [Established] High-pressure vessels and seals | T060 & T052 & T066 | Quality steel, seals, nondestructive inspection, proof tests | Safer high-pressure equipment; pressure cannot increase without bound |
| T068 | [Established] Rail and heavy transport | T027 & T060 & T066 & (T080 \| T091 \| T101) | Rights of way, track, powered vehicles, maintenance, dispatch | Bulk logistics; military/civilian users share one capacity |
| T069 | [Established] Urban water treatment and sanitation | T033 & T053 & T064 | Pipes, treatment, repairs, chemicals, operators | More reliable services; continuing costs and coverage are recorded |
| T070 | [Established] Vaccination and pharmaceutical manufacture | T046 & T053 & T064 | Disease-specific evidence, production checks, medical staff, distribution | Reduces corresponding hazards, not one immunity tag for every disease |
| T071 | [Established] Scaled quality and reliability engineering | T066 & T065 & T055 | Independent checks, maintenance data, training, responsibility records | Multi-factory cooperation and reliability; distorted sampling leaves real defects |

## E. Steam and thermal traditions: 8 nodes

| ID | Node | Knowledge prerequisites | Real facility/material/talent requirements | Capability and discovery entry |
| --- | --- | --- | --- | --- |
| T080 | [Established] Practical steam power | T042 & T052 & T061 | Boilers, water, fuel, machining, operators, repair | Steady mechanical work; supply, heat losses, and accidents constrain operation |
| T081 | [Established] High-pressure compound engines | T080 & T067 | Qualified pressure materials, tests, condensation, staff | Bounded efficiency/power-density gains; neither requires nor permits pure steam to the endpoint |
| T082 | [Established] Governors and mechanical feedback | T080 & T044 | Transmission, sensing elements, load tests, maintenance | Local speed regulation, not general AI |
| T083 | [Established] Steam turbines and turbine manufacture | T081 & T066 | Blade materials, precision machining, balancing, heat | High-throughput conversion; compatible with generators and later heat sources |
| T084 | [Established] District heat and industrial steam networks | T081 & T027 | Pipes, insulation, water, routes, operating organization | Shared heat; transport losses and centralized failures have costs |
| T085 | [Established] Waste-heat recovery and process integration | T052 & T064 & T066 | Exchangers, measurement, maintenance, temperature-matched demand | Simple recovery can precede combined cycles; particular cycles need their engines/turbines; no double-counted energy |
| T086 | [Established] High-parameter steam cycles | T067 & T083 & T100 | High-temperature materials, water treatment, electric monitoring, safety | Better thermal-electric equipment; already crosses into electricity/materials |
| T087 | [Established] Thermal storage and multi-source heat networks | T085 & T050 & T064 | Storage medium, insulation, exchange, controls, useful heat demand | Integrates multiple energy sources; temperature, losses, charge limits remain; no mandatory electrochemical battery |

Leaving a steam-only system does not mean scrapping every boiler. Turbines, heat exchange, materials, and maintenance can become parts of electric, high-temperature, and nuclear systems. Replacing inefficient equipment still incurs modification and opportunity costs.

## F. Diesel, chemistry, and mobile industry: 8 nodes

| ID | Node | Knowledge prerequisites | Real facility/material/talent requirements | Capability and discovery entry |
| --- | --- | --- | --- | --- |
| T090 | [Established] Fuel refining and composition checks | T064 & (T014 \| T063) & T055 | Surface/shallow feedstock, deep extraction, or verified substitute; refining, inspection, logistics | Specified liquid fuels; no universal deep-mine prerequisite; actual resources remain finite |
| T091 | [Established] Internal combustion and combustion control | T090 & T066 & T052 | Fuel, compression/ignition components, cooling, lubrication | Dense mobile power; actual operation produces faults and emissions |
| T092 | [Established] Heavy diesel power | T091 & T067 | High-pressure injection, machining, fuel quality, repair networks | Heavy machinery and ships; no free military advantage |
| T093 | [Established] Polymers and chemical materials | T064 & T050 | Suitable fossil/biological feedstock, reactors, verification, treatment | Seals, insulation, engineering materials; not all polymers require refining; use-specific performance |
| T094 | [Established] Mobile logistics and mechanized work | T091 & T027 & T071 | Vehicles, repair, roads, fuel, dispatch | Transport and mobile operations; military/civilian demand shares the network |
| T095 | [Established] Manufactured agricultural inputs | T064 & T056 & T055 | Relevant nutrient minerals or gas/hydrogen sources, reactors, energy, field trials, delivery | Conditional fertilizer/other inputs; separate product acceptance; no mandatory polymer/refinery route or proportional yield bonus |
| T096 | [Established] Synthetic fuels and carbon-cycle processes | T090 & T103 & T064 | Electricity, hydrogen/carbon sources, catalysts, actual energy | Replaces some natural fuels; not free or automatically zero-emission |
| T097 | [Established] Modular mobile industry | T094 & T071 & T102 | Movable equipment, power, supplies, qualified teams | Deployed construction/repair; moved equipment cannot also run fully at its original plant |

Diesel can transition through electrification, precision chemistry, and synthetic fuels; liquid fuels may retain suitable uses. There is no permanent prohibition on studying electricity.

## G. Electricity, electronics, and distributed control: 10 nodes

| ID | Node | Knowledge prerequisites | Real facility/material/talent requirements | Capability and discovery entry |
| --- | --- | --- | --- | --- |
| T100 | [Established] Generation and electromechanical conversion | T054 & T066 & (T029 \| T080 \| T083 \| T091) | Qualified mechanical input, transmission/governing, conductors, magnets, generators, maintenance | Water/wind, reciprocating steam, turbines, or combustion can drive generators; installed capacity is not energy generated |
| T101 | [Established] Motors and electric drives | T100 & T054 & T061 | Power, wiring, manufacture, operation | Electrical mechanical work; grids and machines need separate maintenance |
| T102 | [Established] Grids, protection, and dispatch | T100 & T055 & T066 | Lines, conversion, protective devices, operators | Network supply; islands, broken lines, and priorities affect service |
| T103 | [Established] Electrochemistry and high-purity materials | T054 & T064 & T100 | Local/network supply meeting load/stability needs, feedstock, reaction/purification, checks | Electrolysis, refining, purification; real energy costs, no mandatory large grid |
| T104 | [Established] Wireless communication and vacuum electronics | T054 & T042 & T100 | Power, vacuum devices or suitable detectors, tuning, maintenance | Wireless information and amplification; communication gives no instant world truth |
| T105 | [Established] Batteries and storage management | T103 & T050 | Active materials, separation, thermal management, lifetime tests | Time-shifted energy; losses, capacity, degradation accounted separately |
| T106 | [Established] Semiconductors and integrated manufacture | T103 & T041 & T055 & T058 | Pure materials, patterning, clean facilities, yield control | Devices and integration; theory does not replace manufacturing equipment |
| T107 | [Established] Power electronics and precision control | T106 & T102 & T055 | Sensors, devices, calibration, control staff, power | Motor/grid/experiment control; actuators and safety tests remain necessary |
| T108 | [Established] Cryogenics and superconducting engineering | T052 & T058 & T067 & T054 | Refrigeration, insulation, low-temperature materials, electromagnetic measurement, continuous power | Qualified cold/superconducting components; actual critical conditions, no assumed room-temperature superconductivity |
| T109 | [Established] Lasers and optoelectronic metrology | T057 & T041 & T103 & T107 | Optical media, pumping, detection, calibration, control, safety | Controlled light and precision measurement; real power, bandwidth, noise limits |

## H. Computing, cyber infrastructure, and high autonomy: 16 nodes

| ID | Node | Knowledge prerequisites | Real facility/material/talent requirements | Capability and discovery entry |
| --- | --- | --- | --- | --- |
| T110 | [Established] Formal algorithms and executable procedures | T026 & T055 & T049 | Mathematical training, records, checkable tasks | Programs/algorithms; paper descriptions provide no compute |
| T111 | [Established] Programmable computers | T110 & T066 & (T104 \| T106) | Logic, storage, power, cooling, engineers | Digital computation; mechanical computing can precede/assist, not equal advanced chips |
| T112 | [Established] Digital communication networks | T111 & T104 | Nodes, protocol equipment, bandwidth, power, operation | Remote data exchange; latency, capacity, permissions constrain cooperation |
| T113 | [Established] Databases and traceable records | T111 & T048 | Storage, collection, labeling, maintenance, provenance checks | Searchable data; names do not remove duplication, bias, or missing records |
| T114 | [Established] Numerical control and industrial robots | T111 & T107 & T071 | Actuators, sensors, workstations, maintenance, safety | Specific automated tasks; uncovered work still needs people |
| T115 | [Established] Software verification and safety engineering | T110 & T111 & T055 | Testing, independent review, fault records, qualified staff | Bounded system reliability; explicit cost and coverage |
| T116 | [Established] Statistical learning and application models | T111 & T113 & T055 | Training/inference compute, data rights, talent, use-case validation | Bounded prediction/generation, not a universal scientific solution |
| T117 | [Established] Accelerators and compute clusters | T111 & T106 & T102 | Chips, interconnects, power, cooling, maintenance, scheduling; verified continuity/recovery; T105 optional for battery-backed designs | More real task throughput, not AI points; T116 required only for learning workloads |
| T118 | [Established] Automated experiments and instrument orchestration | T114 & T116 & T115 | Robotic facilities, samples, calibration, human oversight | More paid physical experiments; software retries create no free evidence |
| T119 | [Established] Medical implants and assistive devices | T070 & T106 & T114 | Medical support, qualified materials, power, follow-up, repair | Specific sensory/motor/medical support, not universal intelligence gains |
| T120 | [Extrapolated] High-bandwidth neural interfaces | T119 & T116 | Long-term safety, individual fitting, clinicians, data protection | Closer bounded-task cooperation; no assumed mind reading, uploading, or free knowledge infusion |
| T121 | [Established] Engineering digital models and validation | T113 & T115 & T050 | Calibration data, compute, real-equipment comparison, engineers; T114 when actual robotic control is deployed | Design/maintenance predictions; manual observations are allowed; mismatch still needs physical tests |
| T122 | [Extrapolated] Validated high-autonomy general agents | T116 & T115 & T118 & T117 | Sustained compute, independent tests, fault isolation, takeover | Complex authorized tasks; calling a system general proves neither safety nor capability |
| T123 | [Established] Critical-infrastructure cybersecurity | T112 & T115 & T107 | Segmentation, identity, recovery equipment, maintenance, response | Bounded access/recovery, not complete immunity |
| T124 | [Established] Auditable administrative computing | T113 & T115 & T123 | Actual administrative data/rules, independent review, appeals | Assists or executes authorized procedures; no automatic taxation or sovereignty |
| T125 | [Extrapolated] High-autonomy governance infrastructure | T122 & T124 & T123 | Redundant compute, execution interfaces, external audits, support, takeover | Broader technical administrative scope; political/cultural rules decide highest authority |

Cyberpunk is not a clickable technology. Networking, augmentation, concentrated assets/power, private jurisdictions, data dependence, and distributional conflict jointly form that social condition. The same technology can support public services, cooperatives, or bounded automation. AI rule is not a free T125 effect. Actual changes in highest authority still affect seats, charters, responsibility, and victory continuity.

## I. Biology, ecology, and life support: 8 nodes

| ID | Node | Knowledge prerequisites | Real facility/material/talent requirements | Capability and discovery entry |
| --- | --- | --- | --- | --- |
| T130 | [Established] Ecology and material-cycle accounting | T056 & T053 & T055 | Long records, field plots, measurement, researchers | Tracks water, nutrients, waste; an ecological label cannot create net resources |
| T131 | [Established] Molecular analysis and bioengineering foundations | T053 & T103 & T041 | Reagents, instruments, samples, clean facilities, training | Molecular measurements and bounded intervention; results need replication |
| T132 | [Established] Controlled biological manufacture | T131 & T064 & T071 | Bioreactors, feedstock, sterility, batch checks, maintenance | Specific foods/materials/drugs with distinct recipes |
| T133 | [Established] Environmental restoration and agricultural cycles | T130 & T132 & T095 | Field works, water/land, nutrients, maintenance | Modeled pollution treatment and recovery; time and material destinations remain real |
| T134 | [Established] Biological data and verifiable design | T131 & T113 & T115 | Data rights, compute, experiments, error checks | Bounded biological predictions; computation cannot replace samples or long observation |
| T135 | [Extrapolated] High-closure ecological life support | T130 & T132 & T069 & T121 | Food/water/air cycles, buffer stocks, independent monitoring, maintenance | Less external supply; no absolute closure or ecological perpetual motion |
| T136 | [Extrapolated] Reliable regenerative and augmented medicine | T134 & T119 | Long safety validation, medical provision, materials, clinical teams | Health extension or recovery for validated uses, not immortal population |
| T137 | [Extrapolated] Adaptive closed habitats | T135 & T107 & T121 | Structure, life support, energy, maintainers, isolation | Longer difficult-environment residence; failures still need supplies and people |

Biology/ecology may reduce some life-support inputs, not replace precision instruments, energy, or orbital industry. Digital/biological transitions do not redefine population entities automatically. Digital-person gameplay beyond existing cohorts requires separately frozen identity and responsibility rules.

## J. Orbital, high-energy, and reliable deployment: 14 nodes

| ID | Node | Knowledge prerequisites | Real facility/material/talent requirements | Capability and discovery entry |
| --- | --- | --- | --- | --- |
| T140 | [Established] Controlled rocket propulsion | T052 & T064 & T067 & T107 | Propellant, test stands, hot structures, controls, safety | Testable thrust; payload and accidents follow actual performance |
| T141 | [Established] Orbital calculation and navigation control | T047 & T051 & T111 & T107 | Observations, computation, tracking, communication, control engineering | Plans/measures trajectories; successful calculation does not grant orbital position |
| T142 | [Established] Repeatable orbital transport | T140 & T141 & T071 | Launch facilities, vehicles, tests, supplies, ground crews | Paid delivery of real payloads; every trip has inputs and risk |
| T143 | [Established] Vacuum, radiation, and space materials | T050 & T103 & T106 | Environmental tests, qualified materials, inspectors, manufacturers | Equipment qualified for specific conditions, not unlimited heat/pressure resistance |
| T144 | [Established] Spaceflight life support | T069 & T070 & T143 | Air, water, food, environmental controls, stocks, medical care, repair | Finite-duration crewed operation; ground/orbital people share one population ledger |
| T145 | [Extrapolated] Scaled orbital construction and manufacture | T142 & T143 & T114 | Real transport, machines, power, stations, maintenance | Orbital industry and deployment; factories receive no free terrestrial inputs |
| T146 | [Established] Nuclear processes and particle measurement | T049 & T054 & T043 & T104 | Sources/detectors, shielding, precision, investigators | Nuclear evidence; discovery does not jump directly to mass-produced reactors |
| T147 | [Established] Fission power and nuclear safeguards | T146 & T143 & T102 & T083 | Qualified fuel, reactors, cooling, shielding, safeguards | Sustained dense power; heat conversion, waste, maintenance remain |
| T148 | [Established] High-temperature plasma experiments | T146 & T107 & T143 & T057 | Energy, confinement, vacuum, diagnostics, trials | Verified plasma conditions; superconducting magnets not universally mandatory; not net power |
| T149 | [Extrapolated] Maintainable net-power fusion | T148 & T121 & T143 & (T108 \| T109) | Specific confinement, material lifetime, fuel cycle, heat rejection, repair, net-energy audit | Magnetic/laser extrapolations separately tested; cryogenics or lasers alone prove no reactor |
| T150 | [Extrapolated] Orbital energy collection and delivery | T145 & T102 & T107 & T143 | Large arrays, delivery, receivers, positions, maintenance | Candidate space power; losses and interruptions at every stage |
| T151 | [Extrapolated] Large-baseline precision optical interferometry | T145 & T041 & T115 & T109 | Multiple instruments, laser metrology, time references, calibration, computation, communication | High-precision spatial measurement; ordinary wireless is not error-free metrology |
| T152 | [Established] Fault-tolerant space control | T143 & T115 & T123 | Independent redundancy, radiation tests, takeover, spares | Auditable mission control; copied defects are not independent redundancy |
| T153 | [Extrapolated] Sustained orbital deployment and relief systems | T144 & T145 & T152 | Transport, replacement crews, supplies, repair, real command | Extended operation and rotation; closed ecology optional, imported supply must actually arrive |

## K. Minimal fictional boundary and FTL engineering: 8 nodes

| ID | Node | Knowledge prerequisites | Real facility/material/talent requirements | Capability and discovery entry |
| --- | --- | --- | --- | --- |
| T160 | [Established] Relativity and spacetime models | T051 & T054 & T055 | Theory training, comparable observations, computation, independent checks | Test relativity; no prerequisite orbital industry/AI, no FTL capability |
| T161 | [Extrapolated] Extreme vacuum and field-state experiments | T146 & T151 & T143 & T107 | Vacuum, field control, diagnostics, shielding, advanced teams | More demanding environments; real research does not establish the next fictional node |
| T162 | [Fictional] Repeatable spacetime anomaly | T160 & T161 | Versioned trigger conditions, samples, experiments, independent replication | Discovers the assumed phenomenon; random narrative cannot declare success |
| T163 | [Fictional] Testable jump-interface theory | T162 & T115 | Anomaly evidence, computable predictions, error exclusion, repeated tests | The game's single FTL interface/conditions, not established real theory |
| T164 | [Fictional] High-throughput jump prototype | T163 & T145 & T152 & (T147 \| T149 \| T150) | Interface components, greater energy/heat rejection, manufacture, control | More energy/redundancy tolerates wider engineering error; fuel type alone cannot win |
| T165 | [Fictional] High-precision jump prototype | T163 & T145 & T151 & T152 & T107 & (T147 \| T150) | Stricter materials, calibration, controls, vibration isolation; substantial real energy | Precision reduces some throughput requirements; precision failures undermine the benefit |
| T166 | [Fictional] Repeated loaded jumps and recovery | (T164 \| T165) & T153 | Two independent component sets, payload, route, crew, measurement, verified recovery | Real loaded round-trip evidence; two trials and continuity windows timed separately |
| T167 | [Fictional] Fleet-wide FTL engineering standards | T166 & T071 & T065 | Independent manufacture, fleet interfaces, deployment, training, maintenance, replacements | Sustained mission systems beyond prototypes; no automatic global integration or victory |

T160 can be understood before orbital industry. T161/T162 require this version's advanced spatial measurement and experiments. Separate basic theory, instrumentation, and acceptance of a new phenomenon: do not lock understandable science behind late experiments or grant FTL merely for understanding relativity.

T164/T165 requirements, recipes, anomaly conditions, and performance functions are fixed by content version, retaining both arrangements every match. Resources, supply, talent, and equipment quality change feasibility, market costs, and performance, with investigable tradeoffs. Seeds cannot alter prerequisites or remove either option. No undeclared negative mass, infinite energy, lossless transfer, or consciousness uploading supplies free resources. Additional fictional assumptions must be explicit; imagination is not a hidden rules exception.

## Leaving an early industrial path

These are bridge backbones, not replacements for AND prerequisites, construction, or skills. Shared later science is necessary for scientific coherence. Strategic differences remain in inherited assets, resources, skill transfer, cooperation, and timing.

| Tradition | Sustainable early depth | Required cross-domain bridge | Later FTL path |
| --- | --- | --- | --- |
| Steam/heavy machinery | T080–087 boilers, turbines, recovery, thermal networks | Qualified T080/T083 engines support T100, then later electrical capability; tools/tolerances support electronics and space; thermal assets enter power/high-energy systems | Computing, orbit, materials, precision, then T162–167 |
| Diesel/mobile industry | T090–097 fuels, chemicals, transport, modular sites | T091 supports T100; T093/096 support materials/fuel transition; combustion control cannot permanently replace electronics | Electricity/computing → orbital deployment/experiments → shared FTL interface |
| Water/wind and electric networks | T029 can reach T100 without a complete steam/diesel industry | T102–107 plus materials, thermal engineering, precision, actual storage; weather/network risks managed | Orbital or other high energy → shared interface |
| Computing/automation | T110–118 design, scheduling, real automated experiments | Chips, energy, data, manufacture cannot be outsourced to a nonexistent market; experiments still consume samples/instruments | Reduces some search/control costs, not physical construction |
| Cyber society | Group H plus particular property, data, augmentation adoption | Resource concentration, services, legitimate authority, dependencies; coverage alone does not qualify governance | Human constitutional, corporate, or AI governance still meets identical final audit |
| Biological/ecological industry | T130–137 manufacture, restoration, life support | Electricity, materials, computing, orbital logistics; ecological provision cannot replace high-energy measurement | Lower some habitation burdens; shared science and FTL interface |
| AI-led governance | T122/124/125 technology plus cultural authorization | Redundant compute, correction, execution, data, supply; the external player is not an in-world resource | No special FTL discount; contracts, population duties, G96 persist |

Each tradition can bridge through independent research, legitimate teaching, equipment trade, licensing, or joint projects. At least one independent path must not require a specific rival's voluntary gift of indispensable knowledge. Imports may accelerate development greatly, with real interruption and term risks. Generation guarantees a feasible legal start, not victory after war, depletion, or bad investment.

“All routes can reach FTL” means each industrial tradition can transition into the final capability chain. It does not make every optional node compulsory or guarantee success while permanently refusing required new capabilities.

## Dynamic development on a fixed graph

1. **Fixed complete content:** all matches share nodes, AND/OR rules, discovery/unlock rules, and scientific/FTL assumptions. Names, seeds, and rankings do not change technology rules.
2. **Different conditions:** geography, quality, population, and institutions differ. Every process remains in the catalog; real inputs/actions change implementation, signals, cost, and adoption order, not the root graph.
3. **Discovery:** evidence expands the known graph; clues may be ambiguous. Seeing one device does not reveal its full manufacturing ancestry.
4. **Investment:** assets, training, and suppliers make a route temporarily cheaper. Alternatives remain, but conversion costs time and refurbishment, not a capital reset.
5. **Revision:** experiments can disprove local explanations and revise adaptation estimates, not retroactively alter truth or erase all historical knowledge.
6. **Organization:** open networks, secret factories, and military institutions can develop the same knowledge with different access to people, resources, evidence, and sharing.

A fixed graph does not imply a fixed best route. Prices, inherited assets, contact, and opponents change tradeoffs. Those differences need investigable evidence rather than rewritten causality. Full initialization, discovery, and adoption follow [20](20-dynamic-development-v0.6.md).

## Required counterexamples

- A large steam industry without electrical/electronic capacity can improve and bridge, but cannot start FTL directly.
- Petroleum exhaustion can stop diesel assets, prompt valid synthetic fuel, or gradual electrification. Conversion is costly, not stylistically forbidden.
- Computers without power, cooling, and maintainers exist as assets with inadequate/zero service; buying them does not unlock advanced model courses automatically.
- AI administration without authority or execution can advise or fail in trials; a node cannot rewrite sovereignty or culture.
- Advanced theory without equipment/qualified scale can be understood without prototyped/adopted/current capacity.
- Many literate people without advanced mathematics/experiments can expand basic education, not skip advanced knowledge/course requirements.
- Stable fishing/pastoral supply and settlement waterworks can reach fluids through T024 → T021 without agriculture; real livelihoods, water, and staff remain necessary.
- Without glass, reflective optics and some qualified ceramic/metal chemistry remain possible. Transmission, sealing, and corrosion requirements still apply; no substitute works universally.
- Refusing high-autonomy AI retains human research, numerical computation, automatic control, independent verification, and an FTL route. T116/T122/T125 and AI rule are not compulsory.
- One FTL prototype may start T166 evidence but cannot satisfy manufacture, training, deployment, replacement, and governance windows.
- All technologies with a divided world yield technical achievement, not complete victory. Node counts award no formal reward.

## Content freeze and graph acceptance

This version fixes nodes, capability meanings, foundational dependencies, and bridges. Every node still needs recipes, stage work units, known/unknown conditions, error models, scale acceptance, maintenance, teachable courses, and transfer costs. An entry such as “high-energy input” must not leave numerical invention to implementation.

Validate 138 unique IDs, existing references, parseable acyclic AND/OR expressions, reachability from legitimate starting practices, continuing transitions for every tradition, and no undeclared final fictional assumption. Across seeds of one version, node sets, dependencies, discovery/unlock rules, and complete graph hashes must match exactly; only known/local-feasible subgraphs may differ. After numeric freeze, test economic and discovery reachability and strategies across worlds. Structural success proves neither completed balance nor real-world FTL feasibility.
