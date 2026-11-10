# References and design boundaries

Sources constrain hypotheses; they do not prescribe a fixed historical destiny. See [historical evidence](reviews/04-historical-evidence-v0.4.md) for fertility, registration, technological development and regional variation, and [feedback/RL](technical/05-feedback-and-rl.md) for research-use boundaries.

The project draws mechanical inspiration rather than copying code, assets or settings. These comparisons describe its priorities; they do not assert that every version, expansion or mod of a reference lacks comparable systems.

| Reference | Inspiration | Before the Stars decision |
| --- | --- | --- |
| Civilization series | Readable turns, development, technology/civics and illustrated history | Hidden full graph; real production and population institutions determine feasible research/adoption; Historic Moments presentation |
| Europa Universalis series | Geography, trade, state capacity and diplomatic competition | Concrete specifications, transport and contracts; technological dependence and licenses as bargaining assets |
| Crusader Kings III | Domestic actors with distinct interests and constraints | Asset-owning factions rather than many individually simulated named characters |
| Stellaris | Speculative technology, civilizational variation and exploration | First game ends at FTL; industrial traditions, projects and transmission create differences |
| [WorldBox](https://www.superworldbox.com/) | Observable civilization change, map-based rise/fall and events | A constrained government player, traceable mechanisms, structured diplomacy and economic commitments |
| [civ-atlas](https://github.com/guaner-334/civ-atlas) | Layered geography/world generation and evolving settlement maps | A geography reference only in the current plan; the user selected Civilization as the chronicle reference |

WorldBox changes over time; consult its [official changelog](https://www.superworldbox.com/changelog) for specific features. Reference repositories also change. Any later code reuse requires a pinned commit and separate license review. No reference code or art was imported for this design.

## v1.0 art and timeline research

Research was conducted on 2026-11-09; the English v1.0 package was completed subsequently. The [Civilization VI art-director interview](https://store.steampowered.com/news/posts/?appids=289070&enddate=1468936810&feed=steam_community_announcements) supports studying strong forms, readable silhouettes, settlement sprawl and cartographic fog. Our proposed atlas, resource overlays, quality tiers and performance targets are original design choices, not claims about Civilization's implementation.

For the chronicle, use Civilization VI: Rise and Fall's illustrated Historic Moments/Timeline as the principal reference, as documented in the [official announcement](https://steamcommunity.com/games/289070/announcements/detail/1465222576769486958), [2K release overview](https://newsroom.2k.com/news/sid-meiers-civilizationr-vi-rise-and-fall-available-now) and [expansion manual](https://steamcdn-a.akamaihd.net/steam/apps/645402/manuals/CIV_VI_EXP_ONLINE_MANUAL_ENG.PDF). Before the Stars adds optional evidence detail and audience filtering; it does not introduce era-score farming or automatic golden-age bonuses.

[Anthropic's Fable 5.2 announcement](https://www.anthropic.com/claude-fable-and-mythos-5-2) includes a Unity testimonial about 3D scenes and game-development work. This warrants evaluating production assistance, not claiming that our renderer, assets or frame rate already exist. No specific model is a runtime dependency.

The inspected civ-atlas commit was `4a1267b683c9c228b64fc6212d44f231074ccd50`. Its README and selected history source were reviewed before the user's chronicle correction. That investigation does not make it the current narrative template or imply that this project already exceeds its capabilities. Original implementation avoids importing its code/assets in this phase.

## Historical and scientific limits

Historical questions generate hypotheses, not permanent civilization statistics. Do not describe European development as innate cultural superiority or every Chinese registration decline as actual deaths. Separate actual state, observable records and scholarly explanations.

The claim that ancient China had no glass and therefore could not develop related science is not a design premise. Model combinations of quality, precision manufacturing, uses, instruments, skilled people and knowledge networks. Glass may support an optical route, but imports, crystals or reflective systems can be alternatives under real constraints. This is a modeling choice, not endorsement of a single-factor historical explanation.

Steam, diesel and electricity are persistent, convertible industrial traditions, not civilization races or eternally fixed eras. They must transition through electrical systems, materials, computation/control and space capability. Punk aesthetics cannot justify magically unlimited engines. Separate established science, unverified engineering extrapolation and the FTL fiction. Seeds do not change physics.

## v0.6 technology, culture and scientific boundaries

Civilization VI's technology/civics organization informs readability. Our system uses evidence, engineering and population adoption rather than universal points. See the [2K manual](https://downloads.2kgames.com/civilization/vi/manuals/eu/CIV_VI_25TH_ONLINE_MANUAL_ENG.pdf).

Civilization VI already introduced a mode that shuffled and hid technology/civics within eras; randomness plus concealment is not a unique claim. Our difference is actual capability dependencies, resource/demand-driven investment, conversion, population practice and educational transmission. See the [August 2020 official update](https://store.steampowered.com/news/posts/?appids=353370%2C289070&enddate=1602601207). Our current complete graphs themselves remain fixed.

FTL is an explicit game premise, not a necessary consequence of known propulsion. [Alcubierre's paper](https://arxiv.org/abs/gr-qc/0009013) discusses a mathematical construction requiring unusual matter conditions, not a manufacturing recipe. [NASA's related questions](https://science.gsfc.nasa.gov/attic/cosmicopia.gsfc.nasa.gov/qa_sp_sl.html) distinguish theory, unobserved objects and engineering. AI government does not assume consciousness is proven, and legal status is not a consciousness test. Course numbers and cultural vectors are versioned design parameters, not validated by these sources.

## Evidence versus game parameters

The following primary sources informed industrial boundaries. They do not validate candidate efficiency, price, duration, population or course values.

| Source | Supported boundary |
| --- | --- |
| [Smithsonian: Pearl Street station model](https://www.si.edu/object/model-edisons-pearl-street-power-station%3Anmah_712587) | Reciprocating steam engines can drive generators; steam electricity does not require a turbine first |
| [US DOE: hydrogen electrolysis](https://www.energy.gov/cmei/fuels/hydrogen-production-electrolysis) | Electrolysis requires actual water and electricity, at different scales/sources; a national grid is not a universal scientific prerequisite |
| [EPA: synthetic ammonia](https://www.epa.gov/sites/default/files/2020-09/documents/8.1_synthetic_ammonia.pdf) | Hydrogen, nitrogen and process inputs matter; polymers are not a general prerequisite |
| [NIST: mechanical timekeeping](https://www.nist.gov/pml/time-and-frequency-division/popular-links/walk-through-time/walk-through-time-revolution) | Weights and escapements can provide mechanical timekeeping without a universal waterwheel prerequisite |
| [US DOE: data-center cooling and PUE](https://www.energy.gov/cmei/femp/cooling-water-efficiency-opportunities-federal-data-centers) | IT electricity and facility power/cooling are separate; PUE is not task value |
| [NASA: ISS water recovery](https://www.nasa.gov/missions/station/nasa-achieves-water-recovery-milestone-on-international-space-station/) | Water recovery is one life-support subsystem; high recovery does not make an entire ecology supply-free |

The v0.7 120-month comparison is a bounded paper fixture. Sources do not certify its output, cash or transition dates, nor prove any real region must take a particular industrial path. Recipes, grouping, prices, cultural basis points, unit counters and FTL tests are design choices rather than laws derived from historical statistics. A mechanism should be explainable, refutable and testable; simplify it if it changes no meaningful choice.

Future historical or disputed causal content must record sources and uncertainty in its template. Do not expand a design example into an unverified encyclopedia claim.

## v0.8 advanced tasks and life support

Checked 2026-11-09. These sources support separate accounting and validation principles, not our package costs, recovery fractions, observation periods or success rates.

| Source | Design use |
| --- | --- |
| [NIST AI RMF Core](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) | Record model version, application domain, actual evidence and continuing feedback rather than a nationwide AI multiplier |
| [NASA ECLSS](https://www.nasa.gov/reference/environmental-control-and-life-support-systems-eclss/) | Air, water and oxygen are distinct subsystems; water recovery cannot represent complete ecological closure |

Fixed complete graphs and dynamic local discovery are gameplay conventions. The historical M336 completion was a conditional cooperative paper schedule, not a historical prediction, current competitive demonstration or claim of real FTL feasibility.

## Mechanism and engineering research

The initial research was checked on 2026-11-08. These are algorithm/platform references; combination, permissions and gameplay remain project decisions. Dependencies were not installed or integrated for the design release.

| Primary source | Use or evaluation |
| --- | --- |
| [Civilization VI manual](https://downloads.2kgames.com/civilization/vi/manuals/eu/CIV_VI_25TH_ONLINE_MANUAL_ENG.pdf) | Pantheons, sacred sites, founding eligibility and propagation adapted with fictional names and real organizational costs |
| [Red Blob noise maps](https://www.redblobgames.com/maps/terrain-from-noise/) | Multiscale terrain and ecology |
| [Red Blob Mapgen2](https://www.redblobgames.com/maps/mapgen2/) | Geography matched to gameplay constraints |
| [Azgaar repository](https://github.com/Azgaar/Fantasy-Map-Generator) | Layered fantasy maps and data/render separation; research only |
| [Priority-Flood](https://arxiv.org/abs/1511.04463) | Depression treatment, watersheds and drainage |
| [Random123](https://www.thesalmons.org/john/random123/papers/random123sc11.pdf) | Counter-addressed parallel random streams; statistical randomness is not secrecy |
| [Rayon](https://docs.rs/rayon/latest/rayon/) | Rust data parallelism and pools |
| [Metal compute](https://developer.apple.com/documentation/metal/performing-calculations-on-a-gpu) | Optional GPU kernels |
| [Core ML performance](https://developer.apple.com/documentation/coreml/analyzing-a-core-ml-model-s-performance-in-xcode) | Supported operators and CPU/GPU/Neural Engine measurement |
| [Codex noninteractive use](https://developers.openai.com/codex/noninteractive/) and [MCP](https://developers.openai.com/codex/mcp/) | Native CLI/tool operation; historical references requiring implementation-time verification |
| [Claude Code programmatic operation](https://code.claude.com/docs/en/headless) and [MCP](https://code.claude.com/docs/en/mcp) | Native CLI/tool integration |
| [Harbor separate verifier](https://docs.harborframework.com/tasks/separate-verifier) and [network policies](https://docs.harborframework.com/tasks/network-policies) | Lifecycle/isolation/scoring shell; still needs our referee, gateway and multi-seat coordinator |
