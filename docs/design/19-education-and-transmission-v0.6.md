# 0.6 — Education, Skills, and Intergenerational Transmission

This referee/content-design document implements the [rural–urban education principles](11-settlements-and-education.md) as inspectable abilities, courses, capacities, and transmission. It adds documentation only. Monthly ordering follows the [engine](../technical/07-monthly-engine-spec.md); cultural signals follow [knowledge and culture](16-knowledge-and-culture-engine.md). Hours, class sizes, durations, and forgetting rates are proposed calibration baselines, not empirical estimates of historical schooling or human learning.

**Version precedence:** [31](31-knowledge-and-culture-v1.0.md) and [32](32-population-and-education-v1.0.md) preserve the 24 course templates and real learning constraints while replacing individual-family bookkeeping and continuous per-qualification readiness with sparse cohorts and event-driven Current / Review due / Supervised / Restoring / Dormant states. Section 7 retains the older design for traceability; its continuous numerical decay is not the v1.0 runtime rule.

## 1. Education is not one national level

Store population ability distributions, enrollment, current assignments, and educational supply. Distinguish knowledge depth, coverage, recent verification quality, actual use, and access. A city with a few scholars is not a universally educated population. A nonliterate community can possess highly developed navigation, gathering, building, and ecological knowledge.

| Concept | Definition | What it cannot replace |
| --- | --- | --- |
| Demonstrated depth | Task qualifications/evidence in four domains; occupations stored by skill family | Not technology tier, national output multiplier, or cultural advancement |
| Coverage | Qualified people divided by a named age/region/survey population | A few advanced experts are not the mean; unknown is not zero |
| Current proficiency and quality | Recent practice, test performance, errors, recovery training | Certificate counts cannot prove every graduate can currently work independently |
| Use | Qualified hours actually used, vacancies, mismatch | Graduation creates no jobs, equipment, or demand |
| Access | Reachable courses, affordability, places, language, care, released time | A school does not guarantee entitlement or ability to attend |

Basic literacy may be reported for ages 15 and older, with children's enrollment and ages separately. This statistical definition neither makes people literate on their fifteenth birthday nor forbids earlier learning. Label other denominators explicitly. Report research, vocational, scientific-method, and basic literacy qualifications separately, not as one farmable education score.

## 2. Four domains and verified levels

Levels describe demonstrated task scope, retaining language, material, equipment, and specialty tags. L, N, V, and R need not advance together and do not sum into national education.

| Domain | 0: no corresponding qualification | 1: foundational | 2: independent routine work | 3: complex use and correction | 4: specialist leadership and teaching |
| --- | --- | --- | --- | --- | --- |
| Expression/literacy L | Natural language possible; no verified record task | Reliable oral procedures, memory, recognized marks | Read/write everyday records in this script | Understand specialist texts, compare versions, provide traceable explanations | Organize teaching material, verified translation, teaching review in known fields |
| Quantity/records N | No verified quantity task | Counting, proportions, concrete standards | Arithmetic, accounts, area, ordinary quantities | Known algebra/geometry, errors, procedural computation | Design/check known statistical or mathematical models across institutions |
| Vocational V, by family | Cannot operate this facility type independently | Limited supervised steps | Operate known equipment/processes | Diagnose, modify, inspect, mentor | Organize complex production, quality, and specialist teaching |
| Research methods R | Experience/attempts without formal methods | Repeatable observations and retained samples/records | Compare conditions, repeat trials, distinguish known confounders | Reproducible measurement, errors, independent replication | Design questions, evidence chains, cross-team checks within a known field |

N3 does not grant all modern mathematics; R4 cannot perform arbitrary science. Early experts may hold V4 in their craft without L2. Observation and limited comparison can use objects and oral records. Modern research training requires reproducible methods, precision measurement, circulating records, and actual research institutions. Before scientific methods, R1/R2 address concrete livelihood questions rather than an abstract national scientific objective.

Equal V levels in stonework, boilers, semiconductors, ecology, or FTL are not interchangeable. Safety, measurement, and maintenance experience can transfer, but new materials, scales, hazards, and controls need additional learning/practice. These are real costs when steam/diesel traditions acquire electricity, materials, electronics, and spaceflight.

## 3. Knowledge ceilings and population coverage

What can be taught depends on understood or legitimately obtained content, qualified instructors, and demonstration equipment. How many can learn depends on teachers, reproduction of material, sites, language, transport, finance/shared reserves, production withdrawal, and care. Era names summarize rather than determine executable courses.

| Development conditions | Feasible education | What does not follow automatically, and why |
| --- | --- | --- |
| Oral and manual livelihoods | Ecology, quantity marks, crafts, mutual transmission; high local expertise possible | Without writing, no mass written literacy; without theory/equipment, no modern engineering |
| Writing, agrarian surplus, specialist institutions | Copyists, accounting, calendars, navigation, crafts, a few scholars | Manual texts, scarce instructors, labor withdrawal, distant villages limit coverage; not a fixed intelligence ceiling |
| Reproduction, printing, measurement, research organization | Broader literacy, technical texts, comparisons, research training | Printing pays no wages and removes neither care nor experimental costs |
| Industry and public/private school networks | Mass foundations, specialist tracks, engineers/researchers | Missing jobs/equipment cause mismatch; high budgets create no infinite experts |
| Networks and validated assisted teaching | Remote material, individualized feedback, retraining, simulations | No graduation from registration alone without terminals, power, inference, or practice |
| Orbital/pre-interstellar engineering | Cross-specialty work, life support, remote autonomous maintenance, safety-critical operation | FTL remains fictional and separately verified; no mechanical tradition, knowledge download, or single AI teacher bypass |

Early societies can expand literacy if supply truly supports it. Modern societies can lose coverage through war, exclusion, hunger, or teacher departures. There is no medieval population of modern scientists: unknown content cannot be taught, advanced qualifications do not copy themselves, and people, teachers, equipment, and time remain real.

## 4. Capacity, effective study, and graduation

A course instance binds its version, knowledge/vocational tags, instructors, learner cohort, site, and equipment. Teaching is actual activity, not a culture-point purchase.

The table gives maximum class N, full-class teacher hours H/month, learner hours S/person/month, and effective months M. Teacher time consists of fixed preparation `H/4` plus `3H/(4N)` per learner. A full class costs H; small classes still pay preparation. Fractional instructors cannot become several full classes. Each independently opened class pays preparation and draws from the same real teacher-hour ledger.

For n eligible learners progressing together, n≤N:

`q_course = min(1, max(0, H_available − H/4) / [n × 3H/(4N)], S_available / (nS), site_supported_people/n, each_practice_or_material_supported_people/n)`.

Different actual allocations create separate learner groups; a national average cannot credit everyone fully. Executed preparation and committed wages may cost resources even at q_course=0. Practice materials are consumed only by actual execution; unused money does not vanish. q_course advances only this course's effective months. It is not transferable research currency or the cultural evidence-scaling q in 16. A person earns at most one effective month per course per actual month; multiple courses compete for the same personal hours.

After M effective months, learners must pass specified independent tasks. Reciting answers cannot replace operation. Tool-assisted and unaided qualifications differ. Tests consume real examiners, samples, and space, included in the last effective month's prescribed practice, not a free extra trial. Failure preserves learning/error records and repairs actual deficiencies; switching testing sites cannot grant free rerolls.

Phase 2 reserves people/material/services; phase 3 teaches; phases 6/7 record learning and verify. New job qualifications apply no earlier than next month. Learners may continue permitted supervised practice, but cannot use future graduation to produce or teach this month.

Teachers must demonstrate both the task and reliable transmission. Early masters can train apprentices without a modern teaching certificate. Large classes, complex experiments, and remote instruction add organizational requirements. Section 6 addresses the first teachers.

## 5. Complete course-template library

These 24 templates refer to [technology capabilities](17-technology-atlas-v0.6.md). The locality must actually understand, access, and have operating rights to the taught content, not merely recognize its name. Course inputs do not cover all learner food, housing, care, or commuting.

Instructor V3/V4 refers to the specific skill family. Generic teaching competence conveys no unknown specialty. Equivalent verified tasks may satisfy learner prerequisites without repurchasing a named course. E IDs are internal references, not a full list disclosed before discovery.

| ID/course | Knowledge and learner prerequisites | Instructors and organization | N; H; S; M (months) | Practice and verified output |
| --- | --- | --- | --- | --- |
| E001 Oral ecology and livelihood transmission | Actual local experience, T003; local-language comprehension | Experienced practitioners and reliable oral procedure | 8; 24h; 24h; 6 | 8h/person/month real observation/classification, travel/samples; L1 and livelihood V1, not literacy |
| E002 Materials and manual apprenticeship | Existing tool processes; E001 or equivalent | Material-family V3 craftsperson | 4; 40h; 60h; 12 | 24 station-hours/person/month plus wood/stone/fiber practice inputs; specific V2 and safety |
| E003 Farming, water/soil, storage | Locally adopted processes; E001 | Agricultural V3, actual demonstration fields/stores | 8; 40h; 60h; 24 | 24h/person/month field/storage work and observations across at least two local production cycles; specific V2, local climate adaptation |
| E004 Quantities and standards | Agreed marks/physical measures; E001 or communication equivalent | Practitioner able to check quantity tasks | 12; 32h; 32h; 8 | 8h/person/month counting/weighing/comparison with real objects; N1, not written accounting |
| E005 Basic literacy | T025 transferable script; L1 | L3 in the script or demonstrated teaching ability | 8; 64h; 64h; 24 | 8 writable practice-media units/person/month plus shared exemplars; L2, actual bridging for another script |
| E006 Arithmetic and ledgers | Known measurement/accounting; E004/E005 or equivalent | N3, L2, real reconciliation competence | 12; 48h; 48h; 18 | 12h/person/month accounts/reconciliation and 4 record-media units; N2, specific routine records |
| E007 Furnace/metallurgical apprenticeship | Adopted smelting/process recipe; E002/E004 | Relevant V3 and safety supervision | 4; 48h; 96h; 36 | 32 furnace/station-hours/person/month, trial materials, protection; process V2, not all metalworking |
| E008 Construction and waterworks | Local process; N2 or equivalent measurement | Construction V3, safety, actual land rights | 8; 48h; 80h; 24 | 32h/person/month site work, allocated instruments/material; construction V2, valid dimensional records |
| E009 Mapping and navigation | Known surveying/navigation; N2 and L2 or reliable equivalent notation | Navigation V3, local route practice | 8; 48h; 64h; 24 | 16h/person/month actual survey/voyage, instruments/capacity; V2, relevant geometric N3; no unexplored map knowledge |
| E010 Teaching organization and verification | Available texts/oral curriculum; independent competence in one field | Domain teacher able to observe lessons and learner tasks | 8; 48h; 64h; 12 | 16h/person/month supervised teaching and 8h checks; teaching qualification only for known content |
| E011 Teaching-media reproduction and archives | T030; E005; adopted copying method | Reproduction/archive V3, source rights | 8; 48h; 64h; 12 | 24 station-hours/person/month, actual media; reproduction/version-management V2, no knowledge from publication counts |
| E012 General foundational education | Literacy/arithmetic texts; T030 or T048 copying; L1 | L3/N3 teachers with classroom capability | 24; 96h; 80h; 36 | Text access, 8 practice-media units, 16h reading/quantity practice/person/month; L2/N2, nutrition/care separately supplied |
| E013 Measurement and comparative practice | T040/T045; N2, recording ability | Measurement V3 and comparative R2 | 8; 64h; 80h; 24 | 24 instrument/station-hours/person/month and samples; domain N3/R2, not advanced scientific-method qualification |
| E014 Reproducible scholarly training | T049; E013, domain reading | R3/L3 and actual review institution | 12; 80h; 100h; 36 | 24h evidence organization and 16 replication station-hours/person/month; R3/domain L3, retained errors/failures |
| E015 Industrial equipment apprenticeship | T061/T065; N2, basic craft V1 | Equipment V3, maintenance/safety | 8; 64h; 120h; 36 | 48 equipment-hours/person/month or validated equivalent trainer, maintenance inputs; V2, new equipment needs bridging |
| E016 Instruments and laboratory work | Adopted precision instruments; E013, related craft V1 | Instrument V3/R3 and safety | 6; 72h; 120h; 36 | 40 calibration/lab station-hours/person/month, standards; instrument V2 and relevant quality/checking |
| E017 Electrical and control practice | Actual relevant T100–T107 processes; E015 or equivalent | Electrical-domain V3 and safety | 8; 64h; 96h; 24 | 32 electrical station-hours/person/month, power, fault parts, protection; V2, not inherited automatically from boilers |
| E018 Programming and applied statistics | T110/T111 and taught statistics; N3/L2 | Programming V3 and relevant statistical N4 | 16; 64h; 96h; 24 | 48 terminal-hours/person/month, metered compute, test samples; programming V2 and verified statistical-task N4 |
| E019 Specialist research and design | T049/domain content; R3, relevant V2/N3 | Domain R4, independent replication, research site | 6; 96h; 120h; 48 | 40 research equipment-hours/person/month plus samples/compute; reproducible project, domain R4/V3; not a new technology merely for completing a course |
| E020 Life science, medical, or ecological specialty | Verified selected content; R3, relevant N3 | Domain V3, actual supervised service institution | 8; 72h; 120h; 36 | 40h/person/month field/lab, safe samples/care/ecological facilities; selected-domain V2 only, not all medicine/ecology |
| E021 Validated AI-assisted foundational teaching | All E012 content/tasks; T115/T116, usable model/terminals | Foundational teachers plus model maintenance/validation | 32; 64h; 80h; 36 | 32 terminal-hours and 40 specified tutoring tasks/person/month plus E012 physical practice; L2/N2 only, no instant download |
| E022 Models, agents, and algorithm audits | T115/T116; autonomous content also T122; E018/R3 | Model-validation V3, real data/deployment rights | 8; 80h; 100h; 24 | 32 test-environment hours/person/month, specified training/inference, independent holdouts, incident drills; audit V2, no political authority |
| E023 Orbital operations and life support | Adopted T144 and relevant T140–T145; equipment V2; T135 only for high-closure specialization | Orbital/life-support V3, real drill site | 8; 80h; 120h; 36 | 48 compartment/simulator/operating hours/person/month, real supply or adopted closed ecology, delay drills; scoped V2, not universal FTL crew qualification |
| E024 Specialist FTL engineering | Actual validated T164 or T165 prototype tasks; E016/E017, necessary E023 experience | Cross-domain team and locally validated prototype teaching procedure | 4; 100h; 120h; 48 | 48 applicable equipment-hours/person/month, field/material practice, safety drills; scoped engineering V3/maintenance review; later T166/T167 add differential training, not prerequisites for the first class |

Practice media map to real `ProductSpec` items, such as reusable boards or consumed paper. A unit denotes specified record capacity, not immaterial learning points. Durable media use time, wear, and maintenance rather than charging the full object every month; consumables reduce inventory. Practice material, samples, power, terminals, and compute tasks require corresponding recipes. Unmapped content cannot execute.

Learners need not take E001 through E024 sequentially. Known tasks support agriculture/waterworks, craft/industry, electrical/information, research, and life-support tracks. E020's medical/ecological and E024's FTL engineering uses instantiate separate specialty tags; sharing a template does not grant all qualifications. Warfare defines military specialist courses. One real exercise meeting two acceptances may share evidence, but consumes time/material once and does not create two people.

E023 resupplied life support and high-closure ecology are distinct options. Without T135, actual T144 supply, stocks, and maintenance can still train crews and sustain deployment. E024 concerns FTL specifically. Nuclear, plasma, and precision-field specialists use appropriate E016/E017/E019 instances without waiting for FTL. Prototype teams first codify verified operations into E024, train deployment/repair/replacement capacity, then meet T166/T167's fuller acceptance. New standards cause differential training rather than circularly gating the entire education chain.

E021's class/teacher numbers are provisional and usable only after controlled validation in local language, curriculum, and learner conditions. Unvalidated versions use E012 human capacity or a more conservative demonstrated limit. Wrong explanations, leaked tests, and unsupported minority languages are measured maintenance problems, not resolved by AI level. High-autonomy agents remain extrapolated rather than a proven universal teaching solution.

## 6. First teachers and transition without deadlock

Courses copy existing knowledge; research creates and verifies it. Original projects require foundational abilities, real trials, and cross-specialty work, not graduates of their own nonexistent course.

1. Existing teams complete the prototype and reproducible tasks, producing records, failure bounds, and operating qualifications.
2. They prepare a teachable procedure and at least one independent learner/team reproduces key tasks. Trial teaching uses real learners, materials, equipment, and mentors; requesting instructor certification creates no free replication.
3. Only then can the course expand. Original experts may teach and research, sharing one time budget. Understanding can coexist with stalled diffusion when nobody can leave production to teach.
4. Imported instructors, licensed texts, and equipment shorten different parts of the path through actual delivery. Buying texts does not buy teachers. Declaring electrification does not qualify boiler crews to maintain motors.

E010 expands teaching organization rather than preceding all historical teaching. The prototype team supplies initial E024 expertise. FTL education cannot be required before investigating the first device.

Retraining uses a task-difference list. Still-valid prior tasks receive credit; new theory, equipment, hazards, and practice remain. Credit follows actual task equivalence, not an arbitrary 80% waiver for the same industrial tradition. Different jobs, language, or equipment can make gaps large.

Courses are not the only route. The initial V2→V3 baseline requires at least 6 effective months of real diagnostic/maintenance practice, two distinct fault classes, and independent validation. V3→V4 requires at least 12 effective months organizing quality/transmission, with two learner groups independently reproducing tasks. Existing methods can use mentors; original methods use the founding-team procedure. Courses/workplace routes share task records, never duplicate promotion. L4/N4/R4 likewise require checked teaching/quantity-model/research-design tasks, not universal advancement through tenure.

## 7. Inactivity, forgetting, review, and population change — historical 0.6 model

This section preserves the former detailed model. Version 1.0 uses the event-driven authorization states in [32](32-population-and-education-v1.0.md) instead of monthly continuous readiness, while retaining actual review, task coverage, and no-double-counting requirements.

Historically, verified qualifications/results persist while private `readiness` in 0–10000 controls current task permissions. Initial acceptance sets 10000. It does not multiply national output/combat again. Actual errors can require review; old certificates do not override failure.

| Domain | Inactive grace months | Monthly decay after grace | Sufficient practice h_ref/month |
| --- | ---: | ---: | ---: |
| L, learned language/record tasks | 120 | 10bp | 8h |
| N, corresponding quantity methods | 120 | 10bp | 8h |
| V, specific craft family | 24 | 25bp | 16h |
| R, corresponding research methods | 36 | 20bp | 16h |

Practice must be actually executed and checkable. `u=min(1, credited_hours/h_ref)`. Required key operations have positive shares summing to 1, each capped separately; repeating one step cannot fill the others. Course/research/work tasks can provide the same actual practice evidence but do not credit one hour through synonymous courses repeatedly.

Only reaching h_ref and every required operation restores at most 200bp and resets inactivity. Partial real practice restores nothing and resets no clock; after grace it only reduces decay to `δ(1−u)`. Within grace it adds no readiness. Clamp to 0–10000. Unexecuted/unverifiable activity gives no hours. This prevents token practice from maintaining full readiness forever.

For V with h_ref=16h and δ=25bp, 2 qualifying hours after grace give u=0.125 and net `−25×(1−0.125)=−21.875bp`, preserving residues. It is not a 25bp recovery followed by 21.875bp loss. Completing 16h and all operations can restore at most 200bp and reset the clock, never exceed 10000. These are calibration baselines, not precise human biological laws.

Ordinary independent work historically required the relevant qualification, equipment adaptation, readiness≥8000, and task evidence. At 5000–7999 only specified supervised work was allowed; below 5000 required recovery. Safety-critical work required readiness≥9000 and practical review within 24 months; particular jobs could be stricter. Failure to qualify for a high-energy role does not prohibit ordinary life or other expertise.

Supervised recovery has explicit gap tasks, people, material, and equipment. One fully resourced effective recovery month restores at most 500bp, not added to the same ability's ordinary 200bp recovery. Partial inputs preserve progress and reduce decay through actual practice without early full recovery. Required tests must pass before permissions return. Cash alone buys no 500 points; redundant refresher study cannot increase an already complete qualification. Panels show recent tests, authorized work, known refresher tasks, and uncertainty, not hidden learning weights. Preflight does not probe private readiness thresholds; public certificate expiry may require review, while unknown deficiencies need execution or paid testing as evidence.

Ageing, death, and migration change real skill distributions. Graduates and less-trained new cohorts change coverage. School interruption first reduces enrollment/completions; literate adults do not forget next month. Records/equipment can remain after instructors depart, separating archives from actual operational ability.

## 8. Cultural transmission through education

Contact records arise from actual care, instruction, shared practice, discussion, and received media. Each records source organization/population, recipients, time, content, language, and duration. A person has one primary activity per hour. Compatible content may share it, with exposure shares bounded by actual contact; one hour cannot become ten propaganda hours.

Transmission first exposes practices/interpretations, then real participation creates personal outcomes/checking, and finally enters 16's q scaling, cross-month deduplication, decay, and slow updates. Hearing a claim is not verified social success. More textbooks permit wider contact, but without reader time/comprehension create no coverage. Repeating one passage creates no independent success evidence.

Initial transmission anchors follow actual care/source exposure—aggregate source cohorts in v1.0. Later learning changes current/practice, not an annually reset anchor for a new school. Migration, school changes, and profile splits preserve provenance, received events, residues, and change allowances. Generational replacement changes composition; it is not simultaneous conversion of all existing adults.

Content, teaching organization, jobs, and post-graduation experience jointly shape direction. A closed modern engineering institution can produce excellent technicians while restricting outside cooperation; an open classroom can lack equipment. Education does not automatically increase axes, cause openness, remove religion, or lower fertility. Expectations, care, and work still follow [population rules](12-population-and-development.md), revised by [32](32-population-and-education-v1.0.md).

AI teaching's actual terminals, inference, power, networks, validation, and on-site mentors enter the same chain. AI governance authority, oversight, and liability belong to [cultural practices](18-cultural-atlas-v0.6.md), not E022 graduation. Copying models copies neither people, teacher-hours, nor votes. Future synthetic subjects need explicit operating, learning, identity, and political states/costs, not creation through an education interface.

## 9. Four calculable examples

### Early community: skilled craft is not overnight modernization

A community has 40 eligible residents; 8 request E002. One craftsperson supplies 40 teaching hours, and 4 stations each supply the required 24 hours per learner/month. With N=4,H=40,S=60,M=12, only 4 receive a full class: 40 instructor-hours, 240 learner-hours, and 96 equipment-hours/month. After 12 effective months and accepted practice, 4 new material-family V2 workers become available no earlier than month 13.

The other 4 wait or continue their work. A larger classroom adds neither craftsperson time nor equipment. Graduates cannot backfill month-12 teaching. This is skilled craft and oral culture, not a modern higher-education population without writing or modern theory.

### Scribal settlement: scholars are not universal schooling

A 2,000-person settlement has 4 E005-qualified scribes, each releasing 64 teaching hours/month. Four classes of 8 nominally serve 32, using 2,048 learner-hours. However, only 192 practice-media units are available; at 8 per learner, they support 24.

Run 3 full classes with 192 instructor-hours. The other 64 may serve other planned work, not an imaginary fourth class. With sustained inputs and tests, 24 people earn L2 after 24 months and fill roles no earlier than month 25. They are 1.2% of total population; adult literacy needs its adult denominator. Quadrupling willingness to spend does not remove media, teacher, or labor-withdrawal limits.

### Industrial conversion: learners need real machines

There are 96 E015-eligible applicants and 12 instructor classes supplying 64 hours each, nominally serving 96. Six equipment groups each supply 384 station-hours/month. At 48 hours per learner, capacity is 48. Six full classes use 384 teaching hours, 5,760 learner-hours, and 2,304 equipment-hours/month. After 36 effective months and acceptance, 48 equipment-specific V2 workers become available no earlier than month 37.

Opening 12 classes without equipment adds preparation and committed wages, not graduates. Earlier equipment expansion consumes current materials, maintenance, and engineers but can reduce later shortages. Training first risks temporary joblessness; building first risks idle capacity. Both retain meaningful planning tradeoffs.

### AI-assisted classroom: more content still needs practice and verification

A locally validated E021 model has 4 teachers at 64 hours each and terminals for 128 learners. Purchased inference completes only 3,200 prescribed tutoring tasks/month. At 40 each, this supports 80; physical practice supports 96, so schedule 80.

Classes of 32,32,16 cost `64+64+[16+16×1.5]=168` teacher-hours; `80×80=6,400` learner-hours; `80×32=2,560` terminal-hours; and 3,200 actual inference services. After 36 effective months and the same foundational tests, L2/N2 become available no earlier than month 37. AI grants neither shorter biological age nor automatic advanced degrees. Model maintenance/verification, power, and records also cost resources. The unused fourth teacher can do other work only when real scheduling permits.

## 10. Exploits and boundaries

| Attempt | Required rule |
| --- | --- |
| Raise average education to boost every job | Use actual role qualifications, hours, equipment; aggregates never write back into production |
| Repeat courses, change schools/names to farm graduates | Deduplicate by population provenance, ability tags, task records; duplicate coverage creates no qualified people |
| Register one teacher at multiple schools | One time ledger covers preparation, instruction, travel; no simultaneous duplicated teaching |
| Use graduates for research/teaching in their graduation month | New qualifications start next month, never retroactively |
| Enroll everyone while retaining full production | Actual learning/care time must be released; coercion creates no hours |
| Require a matching advanced course before every invention | Original teams bridge from existing skills, then create teaching material/qualifications |
| Ancient high budgets buy modern science | No verified content, equipment, teachers, or institutions means no course; imagination is not teaching ability |
| AI instructors make unlimited experts | Bound validation, terminals, inference, power, practice; no direct people or authority creation |
| Tiny monthly practice preserves full ability, or false activity | Historical model: partial practice only reduces decay; full operations required for restoration/reset. v1.0: only qualifying tasks refresh authorization. False activity never counts |
| Repeat one success story to refresh culture | Bound contact duration, deduplicate recipient histories, never treat unverified claims as new success |
| Count practice as separate full commercial production | Record the actual product once; actual teaching time, quality, rework, sale rights govern |
| Probe hidden culture/technology through instructor verification | Check observable tasks for currently known courses only, not future course counts, private rates, or hidden cultural thresholds |

The catalog and semantics still need actual `ProductSpec`, equipment, recipes, and prices. Missing practice or compute recipes are content-validation errors, not free inputs. Document examples do not establish that durations or class sizes are balanced.
