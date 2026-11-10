# 0.7 — Production Chains, Talent, and Economic Investment

Later 0.8 material appears in the [postindustrial overview](28-postindustrial-plan-v0.8.md), [AI/cyber/bio applications](25-ai-cyber-bio-industries-v0.8.md), and [four-civilization case](../reviews/07-postindustrial-campaign-v0.8.md). Complete technology/culture graphs are fixed within a version; actual conditions change development emphasis and locally visible portions. These industrial semantics remain valid in v1.0; [31](31-knowledge-and-culture-v1.0.md) and [32](32-population-and-education-v1.0.md) govern updated knowledge/population interfaces.

This candidate content package turns [17's capabilities](17-technology-atlas-v0.6.md) into products, facilities, tasks, and conversion projects. It neither changes known physics nor treats steam, diesel, electric, AI, cyber, or bio styles as resources. Numbers are game recipes awaiting calibration, not historical statistics, commercial quotes, or real engineering plans.

This chapter freezes calculable module interfaces and baseline batches, not final bills of materials for all 138 nodes. Early comparisons may use qualified instances with coal at 24 GJ/t, fuel at 42 GJ/t, and different engine efficiencies. Never mix scenario and chapter heating values, rates, or costs. A node without an instantiated recipe may exist as knowledge, never free mass production. Paired comparisons use explicitly scaled instances that name the corresponding interface and declare their own inputs, outputs, and initial stocks. Different module specifications cannot be combined silently.

## 1. Units, product specifications, and scope

Materials use t/kg, water m³, labor person-hours h, equipment station-hours. Energy distinguishes usable heat `GJ_th`, shaft work `GJ_shaft`, and electricity `MWh_e`. One MWh equals 3.6 GJ, but conversion requires equipment. Services also carry location, temperature/voltage/reliability grade, and delivery month. Low-temperature waste heat cannot replace furnace heat. Land, deposits, and hydropower retain location and environmental capacity.

| Family/shorthand | Minimum specification | Essential distinctions |
| --- | --- | --- |
| Ore `ore` | t; mineral, concentration, impurities, mine | Equal ore mass is not equal metal; reserves differ from extraction capacity |
| Structural metal `ST` | t; known strength, temperature, corrosion, weldability | Ordinary steel is not automatically pressure-vessel or space material |
| Mechanical components `ME` | t; component family, tolerances, speed/pressure range | Gears are not injection parts; shared shorthand only summarizes tables |
| Conductors `CU` | t; conductivity, wire diameter, form | Ore, crude copper, and qualified winding wire need processing between them |
| Insulation/seals `IN` | t; thermal/pressure/chemical compatibility | Natural material, ceramic, polymer have different scopes |
| High-purity/electronic substrate `HP` | kg; purity, crystal/substrate, cleanliness | Ordinary glass, sand, or metal are not chip substrates |
| Electronic devices `EC` | Accepted pieces; function, rating, version | A piece is a defined device interface, not universal electronic currency |
| Computer/accelerator module `HW` | Units; memory, bandwidth, numeric formats, power | Workload compatibility, lifetime, actual throughput separate |
| Biological feedstock `BF` | kg dry matter; carbon/nitrogen composition, contamination | Untreated waste is not sterile medium; food requires separate acceptance |
| Biological product `BP` | kg dry matter; identity, batch, use standard | Drugs, foods, polymers, strains differ; failed batches are not finished goods |
| Maintenance material `SP` | kg; equipment-specific spare/lubricant/filter specification | Not universal repair currency; recipes name equipment and fault task |

Here coal is 25 GJ/t and qualified liquid fuel 40 GJ/t: verified properties of these variants, not universal deposit/fuel truth. Lower-value batches supply their actual heat; sulfur, moisture, and impurities separately affect usability/treatment. Units convert between kg/t without upgrading quality.

Bounded families reduce complexity while preserving critical mineral, fuel, electronic, and biological qualities. Shorthand cannot merge every ME, SP, or EC item into interchangeable inventory.

## 2. Recipes and monthly operating contracts

Every recipe instance declares applicable knowledge, location, facility version, minimum batch, monthly capacity, input specifications, service grades, qualifications/hours, equipment time, upkeep, startup, outputs/residues, acceptance, and safe shutdown. Tables describe one batch, not unlimited equipment capacity; facility/scenario definitions set monthly limits.

Executed batches are the minimum jointly supported by equipment, people, materials, services, permits, and money under the [monthly engine](../technical/07-monthly-engine-spec.md). Whole equipment and independent trials are indivisible; declared continuous processes may use fixed-precision fractions. Goods, construction, and repairs take effect next month. Same-month heat/power/cooling/compute follow a valid service dependency graph and expire at month end.

Hours are task totals, not headcounts. Production, maintenance, teaching, and military training share each person's one time account. V2/V3 are specific skill families; current authority follows [education](19-education-and-transmission-v0.6.md), updated by 32. Hours cannot switch specialties without qualification.

Solid/liquid residues are explicit. Air, combustion gases, and heat may use versioned environmental aggregates rather than molecules. A saleable byproduct needs composition and collection recipes. Unmodeled detail is not free captured CO₂, oxygen, hydrogen, or rare elements. Check energy bounds first; recovered heat has value only with suitable temperature, networks, and real demand.

## 3. Shared materials and manufacture: R001–R010

| Recipe/technology | Actual inputs per batch | Outputs and residues | Staff and equipment |
| --- | --- | --- | --- |
| R001 Shallow ore extraction; applicable T014/T063 | Surveyed orebody 2 t, access rights, 1 GJ_shaft, SP 1 kg | ore 2 t; same amount deducted from recoverable deposit; local overburden disturbance | Extraction V2 24h; equipment 12h; deep mines need separate drainage/ventilation |
| R002 Fuel extraction/separation; T063/T090 | Geological batch 1.2 t, 0.5 GJ_shaft, SP 0.5 kg | Qualified coal or crude 1 t; 0.2 t residue/water to specified treatment/environment | Domain V2 16h, equipment 8h; coal/oil separate instances and equipment |
| R003 Smelting/structural material; applicable T023/T060 | Iron-bearing feed 2 t, adapted reductant/flux 0.8 t, 12 GJ_th, water 2 m³ | ST 1 t; solid slag/captured dust 1.1 t; feed-derived gases 0.7 t; additional air exchange separately accounted | Smelting V2 40h, quality V3 4h, furnace 16h; pressure material needs further heat treatment/acceptance |
| R004 Precision machining; T061/T066 | Suitable ST 1.25 t, 3 GJ_shaft, cutting/lubricant 10 kg | Specified ME 1 t, swarf 0.25 t, used lubricant 10 kg | Mechanical V2 80h, metrology V3 8h, machine tools 48h |
| R005 Copper refining/wire; T015 upstream, T103 electrolytic variant | Qualified crude copper 1.1 t, reagent 20 kg, 1 MWh_e, 2 GJ_th, water 4 m³ | CU 1 t, copper-bearing residue 0.1 t, used reagent 20 kg; water reuse needs treatment | Electrorefining/wire V2 36h, checking 4h, equipment 24h |
| R006 Insulation/seals; T093 or qualified early substitute | Matching resin/rubber/ceramic feed 1.2 t, 3 GJ_th, 0.2 MWh_e | IN 1 t, offcuts/rejects 0.2 t | Chemical/ceramic V2 32h, quality 4h, equipment 24h; not all insulation requires petroleum |
| R007 Fractionation/fuel quality; T090 | Crude 1 t, 3 GJ_th, 0.1 MWh_e, water 2 m³ | Qualified middle fraction 0.55 t, other testable fractions 0.35 t, residue 0.10 t | Refining V2 24h, quality 4h, equipment 16h; other fractions need actual compatible uses/buyers |
| R008 Specified mechanical maintenance inputs; T065/T071 | Matching ME 12 kg, lubricant 3 kg; either electric 0.01 MWh_e or pre-electric mechanical 0.04 GJ_shaft | Matching SP 14 kg, offcut/reject 1 kg | Repair V2 3h, corresponding electric/mechanical station 2h; equipment-specific bill |
| R009 Structural scrap recovery; T060/T064 | Sorted metal scrap 1 t, 4 GJ_th, 0.2 MWh_e | Accepted recycled structural material 0.85 t, residue 0.15 t | Smelting V2 24h, sorting/checking 8h, furnace 12h; mixed advanced components need not regain original quality |
| R010 Industrial water treatment; T069/T064 | Specified raw/treatable water 10 m³, 0.02 MWh_e, filters/reagents 2 kg | Specified water 9 m³, concentrate 1 m³, used filters 2 kg | Water V2 4h, facility 4h; drinking/boiler/electronic water are separate instances |

R003 applies only to this ore/smelting variant. Freeze elemental composition and gas sources/sinks; 1.1 t solid residue is not a universal smelting yield. R005 crude copper, R006 precursors, and R008 lubricants need real initial stocks, known supply contracts, or separate upstream recipes. No infinite external supplier is implied. Missing undeveloped upstream supply is a loading error or visible bottleneck, never a free default.

R008's mechanical variant applies only where mechanical processing can actually make the maintenance material, not electronic/clean spares. A zero-electricity steam shop may start with qualified month-opening boiler/upkeep stocks, then use delivered shaft work for later spares, entering inventory next month. Initial SP, lubricants, and components must exist or have arrived. No borrowing future maintenance goods, and no mandatory power station before maintaining the first steam engine.

## 4. Steam, diesel, and electrical power: R011–R020

| Recipe/technology | Actual inputs per batch | Net service/output and losses | Personnel/operating conditions |
| --- | --- | --- | --- |
| R011 Basic steam machinery; T080/T082 | Example coal 0.4 t =10 GJ, makeup water 0.2 m³, SP 0.5 kg | 2 GJ_shaft; up to 4 GJ_th useful heat; other 4 GJ plus unused heat rejected; smoke follows composition | Boiler/mechanical V2 2h; one boiler/transmission operating batch; auxiliaries included |
| R012 High-parameter cogeneration; T083/T086 | Adapted fuel 10 GJ, water 0.15 m³, SP 0.5 kg | Net 0.8 MWh_e =2.88 GJ, heat 4 GJ_th, at least 3.12 GJ rejected; no additional R011 shaft claim | Thermal V2 1h, electrical V2 1h; working pressure, generation, control systems |
| R013 Diesel mechanical power; T091/T092 | Specified fuel 0.25 t =10 GJ, water 0.05 m³, SP 0.4 kg | 3 GJ_shaft; up to 2 GJ_th recovered, at least 5 GJ rejected; exhaust separate | Engine operation/repair V2 1.5h; equal heat does not make incompatible fuel usable |
| R014 Shaft-to-electric generation; T100 | 4 GJ_shaft, SP 0.1 kg | Net 1 MWh_e =3.6 GJ, loss 0.4 GJ | Electrical V2 0.5h, generator one batch; diesel/steam/water shaft supply must be locally deliverable |
| R015 Waterwheel extraction; T029/T100 | Actual monthly local head/flow representing 5 GJ potential, corresponding water flow, rights, SP 0.2 kg | 4 GJ_shaft, 1 GJ loss; water returns downstream, not consumed water or stored monthly energy | Waterworks V2 0.5h, mechanical V2 0.5h; shared basin/drought/upstream limits |
| R016 Electricity distribution; T102 | Input 1 MWh_e, real line capacity, SP 0.1 kg | Qualified destination power 0.92 MWh_e, heat loss 0.08 | Grid V2 0.2h; instance-specific loss, other distances/loads/faults separately defined |
| R017 Motor drive; T101/T107 | Local qualified 1 MWh_e, SP 0.1 kg | 3.24 GJ_shaft, rejected heat 0.36 GJ | Motor V2 0.2h; only compatible mechanical work, not automatic conversion of every old tool |
| R018 Cross-month electricity inventory; T105 | Charge 1 MWh_e, remaining rated capacity, SP 0.05 kg | Discharge balance +0.8 MWh_e, loss 0.2; new charge usable next month at earliest; current discharge reads opening balance with power/lifetime limits | Electrical V2 0.2h; validated batteries only; intraday uses the separate net variant below, no repeated credit across phases |
| R019 Known synthetic fuel; T096 | Collected carbon-rich feed 0.35 t with usable C≥0.215 t; accepted hydrogen source 0.05 t with usable H≥0.035 t; 5 MWh_e, 2 GJ_th, water 0.5 m³, catalyst makeup 0.5 kg | Target hydrocarbon 0.25 t containing C 0.215/H 0.035; byproduct/unreacted 0.15 t, phase by composition; used catalyst, water, extra gases separate | Chemical V2 20h, quality 4h; actual extraction/preparation, collection, purity, transport; carbon-bearing feeds not universally interchangeable |
| R020 Mobile freight; T094 | Fuel 0.05 t, SP 0.2 kg, qualified vehicle, road-edge capacity | Example flat-route 100 t·km; fuel, empty running, road wear follow specified route | Driving/repair V2 8h; not instant arrival, at least one month travel |

Thermal data preserve useful heat without treating all waste heat as revenue. **Cogeneration cannot claim full pre-generation mechanical energy and fuel heat simultaneously.** R012 is integrated; do not reapply R011/R014 to claim duplicate outputs. R018 alone defines cross-month electric storage here; ordinary electricity expires. Coal/oil remain physical storable fuels. T087 thermal storage needs separately declared media, temperature, capacity, insulation loss, charge/discharge power, and upkeep, not generic battery credit.

Intraday balancing may use a separately defined net generation+battery+load facility. Its sealed finite time slices must show generation, loads, charge/discharge power, losses, cumulative cycling, and state-of-charge bounds, checking each slice. Capacity/lifetime reserved for this cannot also be sold fully to cross-month storage. The monthly network receives qualified net output after auxiliaries/losses, not arbitrary phase-3 charging loops. Without this instantiated variant and a feasible schedule, monthly energy plus a battery name cannot establish continuous solar/variable-power coverage.

R019 is a specified carbon-rich feed variant, not direct CO₂-to-fuel. For example, 0.35 t CO₂ contains about 0.095 t carbon, insufficient for 0.215 t C. Oxygen-bearing sources require enough carbon, oxygen destinations, separation, and hydrogen inputs; water is not free hydrogen. Close C/H/O and impurities for feed, product, unreacted/byproduct streams. No substitution without composition. Feed/hydrogen chemical energy also enters source accounting: electricity/heat alone cannot define net efficiency, and consumed hydrogen cannot also be fully recovered.

R013→R014 yields 0.75 MWh per 10 GJ fuel; R015→R014 yields 1 MWh per 5 GJ local water potential. Location, capacity, construction time, logistics, heat demand, and downtime still differ. Ratios alone cannot prove diesel or hydropower dominant.

Preindustrial supply need not use R005 electrorefining. Purchases or defined early smelting/wire variants may supply adequate conductors. This chapter has not frozen that early copper variant; composition, furnace charge, heat, shaft/manual steps, hours, residues, and final wire purity remain mandatory. Without it, do not claim an independently closed local copper chain. A checkpoint may use explicit existing stocks or finite delivered contracts, not infer primitive-start feasibility. Requiring an electrical project's own outputs for every startup input is a content deadlock. R007 may use independent heat and existing small mechanical/electrical assistance; refining does not freely activate modern chemistry.

## 5. Electronics, AI, and cyber systems: R021–R028

Five layers remain: materials → equipment → powered operation → data/validation → actual use. `CB(task_spec)` denotes a compatible versioned benchmark workload, distinct from conductor CU. It is not intelligence currency interchangeable across models, precision, or problems. In this instance, 1 CB uses one hardware-hour and 0.002 MWh IT electricity. Replacement hardware needs verified throughput, memory, and numeric quality, not relabeling.

| Recipe/technology | Actual inputs per batch | Delivery and residues | Personnel and constraints |
| --- | --- | --- | --- |
| R021 Electronic device manufacture; T106 | Local HP 2 kg, packaging/conductors 8 kg, reagents 5 kg, 0.5 MWh_e, pure water 2 m³ | 100 specified accepted EC pieces, mass 8 kg; solid residue 2 kg, used reagent 5 kg, wastewater separate; actual rejects reduce 100 | Electronic V2 24h, quality V3 4h, clean equipment 16h; 100 is acceptance target, not guaranteed unknown-batch yield |
| R022 Computer assembly; T111/T117 | Accepted EC 400, ME 30 kg, CU 10 kg, IN 5 kg, 0.2 MWh_e | One specified HW unit; inputs become active assets; failed checks leave repair work, not compute | Electronic V2 20h, validation V3 8h, assembly 12h; CPU/accelerator versions distinct |
| R023 Facility computing; T111/T117 | HW 1h, IT electricity 0.002 MWh_e, delivered cooling/distribution equivalent 0.0008 MWh_e, cooling water 0.002 m³ | 1 CB current-month service; total 0.0028 MWh eventually rejected as heat; no physical compute inventory | Operations V2 0.01h, hardware use/lifetime accrued; example PUE=1.4, no duplicate cooling charge |
| R024 Data preparation and independent validation set; T113/T115 | Lawfully sourced/readable data, labeling/checking 20h, specialist 8h, 20 CB | One sourced/deduplicated/scoped data asset; copies add no independent samples | Preserve versions, rights, biases, holdout isolation; reading does not consume the source but takes copying/time |
| R025 Application-model training/adaptation; T116 | Training rights/data, isolated validation set, 2,000 CB, engineering 80h, domain review 40h | Candidate model/version and training records; scope only after validation; failure retains records/consumption | A fixed small application-model instance, not 2,000 CB for general AGI |
| R026 Inference and human checking; T116/T122 | Approved model, 100 CB, domain review 4h, actual inputs/rights | At most 1,000 same-specification assisted responses; usability depends on independent validation/real downstream tasks | Counts do not directly create research success, people, or labor; unvalidated outputs remain advice |
| R027 Automated experiment execution; T118 | Authorized program/model, station 16h, original experimental recipe, 20 CB, supervision 4h | One actual experimental record; products/waste recorded once under original recipe | Replaces only validated steps; samples, devices, calibration, cleanup, safety remain |
| R028 Network/administrative execution; T112/T123/T124 | Built nodes, 0.05 MWh_e, 50 CB, maintenance 8h, human appeals/exceptions 8h | Capacity for 1,000 traceable messages/administrative tasks under lawful rules and real subjects | No tax authority, political agreement, or nationwide zero latency; bandwidth, terminals, language, uncovered regions separate |

R023 uses water cooling in this instance. Other locations can use dry/hybrid variants with different construction, electricity, and water. PUE compares facility with IT electricity, not task value, and cannot justify omitting non-IT loads. [US Department of Energy on PUE and cooling](https://www.energy.gov/cmei/femp/cooling-water-efficiency-opportunities-federal-data-centers)

R025's 2,000 CB uses 2,000 hardware-hours and 5.6 MWh total, plus data, people, rental/upkeep, and validation. A single module delivering 400 hours/month requires at least 5 effective months for computation alone. Training/inference share hardware and power, not simultaneous full capacity. Checkpoints require actual storage/writes; interruption loses work since the last saved state rather than rerolling free progress.

AI political authority additionally needs T125, delegation, institutions, dissent handling, and takeover. Successful R028 transfers no sovereignty. Public bodies, cooperatives, companies, or military organizations may run cyber systems; actual property/conflict determines society, not a mandatory cyberpunk regime.

## 6. Biological industry and life support: R029–R034

These abstract interfaces cover food, materials, treatment, and life support. Biology still needs chemistry, instruments, electricity, data, trained people, and long validation. Ecological processes substitute some flows, not mineral sources or energy.

| Recipe/technology | Inputs per batch | Outputs and residues | Personnel and capacity |
| --- | --- | --- | --- |
| R029 Feedstock purification/medium; T064/T131 | Known harmless feed 120 kg dry matter, water 1 m³, 0.5 GJ_th, 0.05 MWh_e | Accepted BF 100 kg dry, residue 20 kg; water partitioned by wet-feed moisture/wastewater | Bio/chemical V2 8h, checking 4h, equipment 8h; renaming cannot qualify rejected feed |
| R030 Specified biological product; T132 | BF 100 kg dry, validated strain-use rights, water 2 m³, 0.2 MWh_e, 0.5 GJ_th, filters 2 kg | BP 30 kg dry, residue/metabolic output 70 kg dry-matter equivalent; used filters 2 kg; water/gas separate | Specific bio V2 16h, checking 8h, reactor 24h; identity fixed, unaccepted batches quarantined |
| R031 Biological data design/checking; T134 | Lawful observations, 100 CB, specialist research 24h, independent review 12h | One testable proposal with limits; actual experiments separately fund R027/manual work | No direct BP or skipped long effects; recomputing data is not independent evidence |
| R032 Sorted-waste recovery; T130/T133 | Treatable organic residue 100 kg dry, water 0.5 m³, 0.05 MWh_e, treatment space | Qualified soil amendment 40 kg dry, other residue/gas 60 kg equivalent; not automatically food feedstock | Environmental V2 8h, checking 4h, equipment/storage one batch-month; contaminated waste differs |
| R033 Life-support water regeneration; T069/T144 | Classified wastewater 10 m³, 0.2 MWh_e, filters 2 kg, operating environment | Accepted water 9.5 m³, concentrate 0.5 m³, used filters; rejected water awaits retreatment | Life-support V2 8h, checking 4h; 95% water recovery, not 95% closure of the entire ecosystem |
| R034 Controlled habitation cycles; T135/T137 | Habitat, actual monthly food/air/water needs, built R033/other subsystems, supplements, power, upkeep, redundancy | Habitable person-months and unmet needs from actual subsystem delivery; no separate net food/water output | Schedule life-support, agronomy, repairs, medicine separately; shared bottleneck capacity, no additional global ecological multiplier |

R030 dry-matter equivalent is a lightweight accounting convention, not recyclable medium made directly from metabolic gas. Open-process oxygen/CO₂/nitrogen exchanges use declared environmental components. Before closed habitation, close critical gases, water, usable nutrients, and heat individually. An incomplete R034 cannot pass final life-support acceptance.

Real life support separately manages water, air, oxygen, waste, and other flows. High water recovery does not eliminate food/air/material resupply. NASA's ISS milestone supports this boundary, not the example 95% parameter. [NASA water-recovery explanation](https://www.nasa.gov/missions/station/nasa-achieves-water-recovery-milestone-on-international-space-station/)

## 7. Capital construction, maintenance, recoverable assets

Civil works mean accepted foundations/buildings/roads requiring real upstream stone, wood, or cement recipes, not money alone. Specialty hours must be schedulable; minimum construction times cannot be compressed without bound by more people. Completed facilities still need operating recipes and do not automatically run at full output.

| Module | Main one-time capital | Construction hours/minimum months | Monthly ceiling/fixed upkeep |
| --- | --- | --- | --- |
| F01 Steam machinery station | One civil site, ST 20 t, boiler/transmission ME 2 t, CU 0.1 t, IN 0.2 t | Civil 1,600h, mechanical V2 2,400h, inspection V3 400h; 12 months | R011≤120 batches; fixed mechanical 24h, matching SP 10 kg/month; operating SP additional |
| F02 Diesel machinery station | One civil site, ST 12 t, engine ME 3 t, CU 0.1 t, IN 0.1 t, safe fuel tanks | Civil 800h, engine V2 2,800h, inspection 600h; 18 months | R013≤120; fixed maintenance 20h/SP 8 kg/month; fuel bought separately |
| F03 Waterworks and generation | Site-specific civil works, ST 20 t, CU 2 t, wheel/generator ME 3 t, IN 0.5 t | Waterworks 6,000h, electrical V2 2,400h, inspection 600h; 24 months | R015+R014≤90/month, subject to water; upkeep 40h/SP 12 kg |
| F04 Distribution segment | Real corridor, ST 5 t, CU 1 t, IN 0.3 t, protection equipment | Line work 1,600h, electrical 800h, protection inspection 200h; 12 months | R016≤100; upkeep 16h/SP 4 kg; roads/military corridors not automatically shared |
| F05 Mechanical/electrical training shop | One civil site, relevant ME 0.5 t, tools/gauges; electrical adds CU 0.1 t/IN 0.05 t | Building 800h, domain V3 240h; 6 months | 384 qualified practice-hours/month; upkeep 12h/SP 2 kg; empty without teachers |
| F06 Electronic manufacturing cell | Clean site, precision ME 2 t, control EC 1,000, measurement/clean equipment | Precision V2 4,000h, electronic V3 1,200h, independent validation 600h; 24 months | R021≤20; upkeep 80h, specified clean filters/spares 20 kg; not universal advanced-chip manufacture |
| F07 Computing unit | Dedicated room, HW 10, network, cooling/distribution | Electrical/room 1,600h, computing operations 800h, safety 400h; 12 months | Each HW≤400 compatible hours/month; fixed 40h/spares 2 kg, power/water additional |
| F08 Data/validation institution | Archive room or usable terminals, independent holdout storage, audit rights | Record/governance organization 400h, validation 400h; 6 months | Only allocated hours/storage; institutional level produces no free data |
| F09 Biological manufacture | Clean site, reactor ME 1 t, IN 0.1 t, instrument EC 100 | Chemical/bio V2 2,000h, quality V3 800h; 18 months | R030≤20; upkeep 40h, matching filters/spares 10 kg; feed/operating inputs additional |
| F10 Water regeneration | Civil site, pumps/pipes ME 0.5 t, IN 0.05 t, instruments | Waterworks 800h, relevant electrical 400h, inspection 200h; 12 months | R033≤20; upkeep 16h/spares 2 kg, filters/power additional |

Each module still needs a distinct equipment list, land, and local civil specification. A set of instruments is not an unlimited black box: specify components, actual sources, and task scope. Qualified manual workshops can make early equipment. Electronics upgrades use existing lower-specification machinery, imports, or a declared bootstrap process, not the factory manufacturing all its own prerequisites before construction.

Pay fixed checks and actual-use wear separately. Planned shutdown still needs safety preservation, guards, and necessary corrosion/storage measures. Abandonment without upkeep loses availability through real damage, not full restoration on restart. Splitting, related-party sales, or renaming do not reset operating hours, faults, or duties.

## 8. Explicit conversion work packages

Steam, diesel, and early electricity can reach common advanced capabilities; reusable assets depend on inspection. These bridges assume a valid existing station and knowledge prerequisites, not low-tech shortcuts to electronics.

| Package | Assets retained | New inputs/duration baseline | Talent and acceptance |
| --- | --- | --- | --- |
| X01 Steam shaft to generation | Qualified boiler, transmission, civil works, water; R011 supplies real shaft work | Generator ME 0.5 t, CU 0.5 t, IN 0.1 t; mechanical 400h, electrical 800h, inspection 200h; ≥6 months, final month stopped for connection | Boiler qualifications persist; new electrical roles need E017/equivalent; R011→R014, not R012 performance |
| X02 Steam to cogeneration | Components passing pressure/material checks, building, heat network | High-parameter ME 1 t, suitable ST 5 t, CU 0.5 t, IN 0.2 t; thermal 1,200h, electrical 800h, inspection 400h; ≥12 months, final 3 stopped | Actually adopted T083/T086, pressure/control tasks; R012 replaces R011 on the same heat flow |
| X03 Diesel shaft to generation | Qualified engine, tanks, repair site | Generator ME 0.5 t, CU 0.5 t, IN 0.1 t; mechanical 400h, electrical 800h, inspection 200h; ≥6 months, final month stopped | R013→R014; separate engines may remain mobile, but equipment/time allocates once |
| X04 Staged shop motorization | Qualified tool bodies, gauges, proven general machining | Per section motor ME 0.2 t, CU 0.1 t, IN 0.03 t; mechanical 240h, electrical 240h, validation 80h; ≥3 months, final section-month stopped | Workers learn equipment/safety/control gaps, not automatic chip/instrument/software skills |
| X05 Digital-control retrofit | Old equipment meeting positioning/structural requirements; replace deficient frames | Per station EC 100, sensor/actuator ME 0.05 t, software validation 120h, mechanical/electrical 120h each; ≥6 months | T107/T114, E018 or relevant staff; demonstrate actual reduced operator tasks, no whole-factory AI multiplier |
| X06 Biological-process integration | Qualified water/heat/power/chemistry/inspection and some buildings | Differential F09 clean/reactor equipment, segregated pipes, samples, waste streams | E020 specialty and actual quality system; petrochemical operators credit only truly shared safety/instrument tasks |

Old assets operating during conversion still consume operators, fuel, and upkeep; final shutdown produces nothing. Construction, teaching, and production cannot share a person's same hour. Inspect reused parts; recovery follows R009 or a specific recipe. No refund of historical wages, fuel, spent lifetime, or original full purchase price.

## 9. Actual talent and education accounts

| Stage | Reusable capabilities | Necessary additions | Quantities money cannot directly replace |
| --- | --- | --- | --- |
| Steam expansion | Smelting, machining, measurement, boiler practice | Pressure/thermal safety, sustained repair, operating competence | Real stations, shifts, fuel transport, makeup water |
| Diesel expansion | Machining, transport organization, chemical records | Fuel analysis, precision engine parts, lubrication/fuel safety | Fuel quality, injection/seal stations, distributed maintainers |
| Early electrification | Waterworks, metrology, mechanical manufacture | Electrical safety, windings/insulation, protection, motor repair | Conductors, insulation, generation sites, E017 practice |
| Digital/AI | Electricity, records, computing foundations | Software, statistics, data rights, validation, operations | Qualified hardware, continuing electricity/water, independent data, actual teachers |
| Cyber infrastructure | Networks, computation, existing public/corporate services | Cross-institution authority, recovery, professional services, liability | Terminals, maintainers, appeal staff; coverage is not consent |
| Biological industry | Chemistry, instruments, medical/agricultural experience | Product quality, cleanliness, field validation, ecological upkeep | Feed, samples, time, stations, waste, qualified jobs |

E017 permits 8 learners/class, teacher 64h/month, learner 96h/month, 24 effective months, 32 equipment-hours/person/month. A full class uses 64 teacher-hours, 768 learner-hours, 256 equipment-hours monthly; over 24 months, 1,536 teacher-hours, 18,432 learner-hours, 6,144 equipment-hours. Qualifications apply no earlier than month 25. Eight former machinists studying cannot simultaneously count as eight full-time machinists and eight full-time students.

X01/X03's 6-month construction is not a promise to train every electrician within six months. Existing electricians can build while teaching expands. Otherwise import them, let qualified foundational teams demonstrate new expertise, or finish courses first. Examples cannot waive knowledge/course prerequisites. Bridge waivers need task-level evidence, not an automatic 80% exemption for diesel workers.

Culture changes applications, accepted employment/teaching terms, knowledge sharing, and performance. Religious/guild/public schools can teach with actual knowledge/resources. Excluding foreign instructors may keep posts vacant; stable apprenticeships may reduce departures. No cultural/religious industrial multiplier. Fast job changes and slow norms remain distinct under 16/20.

## 10. Cash, capital, and social costs

Purchases transfer cash rather than destroy social money. Material consumption, hours, wear, and forgone tasks are actual opportunity costs. Output becomes sales revenue only with a buyer, payment, and delivery; reference prices cannot automatically become taxes or treasury money. License fees transfer cash/rights without creating equipment, teachers, or capacity.

For local accounting only, an example signed fixed-price deliverable contract quotes ST 400 c/t, ME 1,500 c/t, CU 2,000 c/t, IN 1,000 c/t; ordinary construction 1 c/h, specialist V2 2 c/h, inspector V3 3 c/h. c is game currency, not real money. These are neither global fixed prices nor infinite supply commitments.

X01/X03 direct additional purchases are ME 750 c, CU 1,000 c, IN 100 c, specialist work 2,400 c, inspection 600 c: total 4,850 c. Add transport, taxes, training, shutdown obligations, construction electricity/consumables, and new upkeep separately. They are not silently included. A scenario claiming total project price must itemize them or identify existing contracts that already pay them.

Every project needs four noninterchangeable accounts:

1. **Cash and obligations:** opening spendable funds, actual wages/purchases, escrow, future dues, closing funds; unspent budgets remain.
2. **Capital and capability:** construction, acceptance, operable, repair, idle, recovery; book value is not current output.
3. **Materials and services:** flows, energy sources/losses, transport, equipment-hours, upkeep, residues.
4. **People and opportunity costs:** original job withdrawal, teacher/learner hours, construction/operation/repair, waits, actual qualifications.

Research likewise separates investigation, samples, instruments, people, replication, deployment. Partial failure preserves physical assets, knowledge, and acceptance records; it neither refunds everything nor converts remaining budget into certain success. Joint research/licensing rights, delivery, breach, and partial failure follow [contracts](14-contract-resolution.md); recipes define the physical obligations.

## 11. Exploits for scenario review

| Candidate exploit | Requirement |
| --- | --- |
| Double-count cogeneration or generate net energy through synthetic-fuel loops | Check every source/grade; integrated facilities deliver net services; synthetic fuel includes electricity/heat/carbon/hydrogen |
| Fuel-free hydropower grows without bound | Shared location/season/basin water; civil works, lines, maintenance, competing uses |
| Build factories without teachers/upkeep | Joint equipment/hour/qualification/input bottlenecks; teaching and repair compete for experts |
| Force instant occupational and cultural conversion | Authority, actual participation, skills, long preferences separate; coercion creates no knowledge |
| Copy data/models into intelligent population | Deduplication/rights and unique hardware scheduling; no automatic people or political rights |
| Infinite biological feed and perfect closure | Separate dry matter, water, gases, nutrients, energy; recovery grades/losses; incomplete loops fail acceptance |
| Build advanced plants then assume upstream capacity existed | Construction uses actual suppliers, methods, startup equipment; a procurement label cannot conceal unknown machinery |
| Buy every route and switch freely | Real capital, upkeep, workers, dual operation, downtime; retained assets do not operate free |
| Neglect then repair to farm output/culture | Preserve damage, liability, experience provenance; repair never backfills lost production |
| Fixed sample prices become permanent arbitrage | Quotes bind explicit quantity, place, term, supply; exhausted contracts cannot keep buying from virtual markets |

This does not prove absence of optimal strategies. It locates advantages in observable but imperfectly known conditions: heat demand/fuel logistics, loads, hydrology/lines, transition talent, data/validation, and life support. Long-run dominance requires complete cash/material/talent comparisons across paired starts, varied demand, and shared shocks. Do not secretly penalize leaders to make three routes look balanced.
