# Historical Evidence and Simulation Limits in 0.4

This historical design review concerns transferable conditions and feedback, not innate technological stagnation assigned to any country, ethnicity, or religion. Its sources constrain hypotheses; they do not prove that the game's formulas are the sole explanation of history. Version 1.0 uses the smaller population implementation in [32](../design/32-population-and-education-v1.0.md); the cautions below remain applicable.

## Population and development

OECD fertility research discusses housing affordability, employment and economic uncertainty, childrearing support, and the distribution of paid work and care. The design therefore retains both family norms and actual constraints, without rules that wealth necessarily prevents childbirth or that low fertility means moral decline. [Society at a Glance 2024](https://www.oecd.org/en/publications/2024/06/society-at-a-glance-2024_08001b73.html)

Research on historical Chinese population and epidemics particularly highlights registration difficulties, dynastic transitions, and changing statistical coverage. A fall in registration is not directly a death count. The game separates actual population, migration, and observed registration, while allowing war, food shortages, disease pressure, and failed governance jointly to reduce actual population. It imposes neither a fixed dynastic cycle nor an automatic halving during disorder. [Epidemic and population patterns in the Chinese Empire](https://www.cambridge.org/core/journals/epidemiology-and-infection/article/epidemic-and-population-patterns-in-the-chinese-empire-243-bce-to-1911-ce-quantitative-analysis-of-a-unique-but-neglected-epidemic-catalogue/0625FFA65353AA61935822AD538F6450)

One economic model of industrialization connects trade to the direction of innovation. It inspires combining resource costs, market scale, knowledge, and research investment; it is not a complete conclusion about European technological acceleration. Competition, institutions, energy, colonial relations, and knowledge networks cannot be replaced by a single cultural bonus. [Trade, Knowledge, and the Industrial Revolution](https://www.nber.org/papers/w13057)

## Regional labels that must not become rules

“Long-term technological and cultural stagnation of African and Indigenous American societies” cannot serve as a factual premise for whole continents across all periods. Maya lidar research found connected cities and extensive infrastructure. The game must therefore allow different forms of urbanization and agricultural engineering rather than only a European upgrade sequence. [Canuto et al., 2018, research paper and abstract](https://experts.nau.edu/en/publications/ancient-lowland-maya-complexity-as-revealed-by-airborne-laser-sca/)

The Great Zimbabwe archaeology project examines local metalworking and Indian Ocean exchange, likewise contradicting a fixed African setting without technological change or outside connections. [University of Cambridge archaeological project](https://www.arch.cam.ac.uk/research/projects/recently-completed-projects/archaeological-science-and-globalisation-great)

Use conditional tests instead. Transport isolation, missing energy sources or instruments, failed skill transmission, insufficient scale, or organizational resistance may stagnate a particular field while agriculture, materials, astronomy, or organization still advance. Colonial intervention, war, and infectious disease can be shocks associated with contact; they are not evidence of residents' inherent ability.

## Testing instead of telling a story

| Target phenomenon | Mechanism hypothesis | Counterfactual check |
| --- | --- | --- |
| Slow premodern growth and crises | Marginal land returns, actual food distribution, maintenance debt, disasters, disease, and war | Better transport, reserves, or governance can mitigate crises; collapse cannot be forced at a fixed year |
| Modern low births and aging | Delayed births, housing/care costs, expectations, age structure, and slowly changing family norms | Equal technology with different family services can produce different outcomes; one subsidy does not guarantee immediate recovery |
| Technological acceleration | Complementarity among people, instruments, reproducible knowledge, markets, energy, and organization | Removing a key complement reveals a bottleneck; restoring it permits recovery; larger population does not automatically create exponential innovation |
| Prolonged local stagnation | High replacement costs, isolation, skill loss, and incumbent organizational resistance | Changing geographic labels without state changes leaves outcomes unchanged; actual improvements to connections and training can permit breakthroughs |

First test direction, delays, and conservation in synthetic scenarios, then compare externally with historical series that include uncertainty ranges. Reserve periods and regions that were not used for calibration, and report phenomena the model cannot reproduce. Different mechanisms can generate similar curves; fitting a curve does not prove causation. An 80-year compressed campaign validates a gameplay loop, not the real chronology of agriculture, demographic transition, or civilizational rise and decline. The longer 1.0 candidate calendar also remains compressed fictional chronology rather than historical validation.
