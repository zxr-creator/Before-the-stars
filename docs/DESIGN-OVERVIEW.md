# Before the Stars

Before the Stars is a competitive civilization strategy game for humans and AI agents. Civilizations develop from primitive communities to sustained faster-than-light capability while managing the interdependence of technology, resources, production, population, factions, trade and culture. Cities organize networks of villages, mines, industry, schools and transport.

**Current status: v1.0 design documentation; no playable game has been implemented.** Rust will provide the authoritative simulation and match services. TypeScript will provide the browser interface, shared client tools and agent integrations. A local Mac application and a browser client will use the same rules. All documentation is in English.

## Read the current plan

- [Complete v1.0 plan](docs/design/30-complete-plan-v1.0.md)
- [Dynamic technology, culture and discovery](docs/design/31-knowledge-and-culture-v1.0.md)
- [Simplified population and education](docs/design/32-population-and-education-v1.0.md)
- [Competition and three native-AI difficulties](docs/design/33-competition-and-native-ai-v1.0.md)
- [Art, interface and Civilization-style chronicle](docs/design/34-art-interface-and-chronicle-v1.0.md)
- [Full documentation index](docs/README.md) and [development roadmap](docs/development-roadmap.md)

## The game in brief

Four civilizations compete. One to four seats can be controlled by humans or external agents; native non-LLM opponents fill the remaining seats, with Easy, Medium and Hard difficulty. Cooperation, alliances and trade are legal, but victory belongs to one strategic seat. Every victory requires both real global integration and sustained FTL military-system acceptance. Conquest alone and a single experimental engine are insufficient.

The complete technology and cultural-practice graphs are identical across matches of the same content version. What changes is each civilization's discovered subgraph, development direction, implementation opportunities and population adoption. Geography, resources, economic investment, education, religion and past experience shape these differences. Players cannot download the full hidden graph, private cultural mechanisms, rival secrets or the referee's seed.

Steam, diesel and electrical traditions have different infrastructure, talent requirements and conversion costs. They can develop alongside AI, cyber and biological applications, but steam and diesel do not magically propel an FTL vessel. Progress requires transitions through electrical, materials, computation and space capabilities. Known science, engineering extrapolation and the explicit FTL fiction are distinguished.

Population is aggregated rather than simulated person by person. Age structure, skills, culture, religion, access to essentials and service obligations remain relevant. Education takes people, equipment and time. Domestic production and foreign contracts draw on the same finite resources. Military strength requires willing or lawfully mobilized people who are trained, equipped, supplied and organized.

The visual direction is an original stylized 3D strategy atlas inspired by Civilization VI's readability, with a complete flat-map tier. The chronicle follows Civilization's illustrated Historic Moments timeline: accomplishments, crises and lasting changes become cards with optional evidence and consequence details. Timeline entries do not grant resources or score.

## Content and technical boundaries

The design catalog includes 138 technology nodes, 64 cultural practices, 24 courses, 34 production recipes, 10 capital modules, six industrial transitions, six three-layer technological traditions and nine postindustrial application packages. Parameters are provisional until prototype validation. Paper calculations are not whole-game simulations or proofs that no dominant strategy exists.

The standard candidate clock is 12 simulation months per round, with a 2,880-month horizon. All seats share it. This is a compressed fictional development history, not a literal Earth chronology. Culture, education, population, shipping and acceptance windows use the same simulation clock.

The engine must support real CPU multicore computation with deterministic replay. GPU rendering and optional GPU/NPU assistance cannot change authoritative outcomes or information access. Humans, built-in AI and external agents share the same observation boundary and legal actions. External agents can act through HTTP/MCP/CLI without controlling the screen.

## Design package

The [v1.0 release notes](docs/releases/v1.0-review-package.md) describe the revised scope, English translation, validation and remaining implementation gates. In the repository checkout, the complete archive is `dist/Before-the-Stars-design-v1.0.zip`, with an adjacent `.zip.sha256` checksum. Release archives are not nested inside the extracted documentation package.

Earlier release archives remain immutable historical artifacts. Their working documentation has been translated and annotated where current rules supersede it. Historical v0.1/v0.2 JSON schemas and examples are not a current executable API; see the [contract index](docs/contracts/README.md).

This repository is designer material and includes hidden mechanisms and eventual objectives. It must not be supplied wholesale to competitive player environments. A future public project and a secure competition deployment require separate player-facing packages and an isolated referee.
