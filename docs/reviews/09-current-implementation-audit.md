# Current implementation audit — 2026-11-13

Scope: source inspection and unmodified headless campaigns, followed by documentation
changes only. No gameplay, content JSON, provider adapter or deployment code was changed.
No paid model call or live browser/UI compatibility test was performed.

Repository: https://github.com/zxr-creator/Before-the-stars
Audited main commit: `fabe33b` (full SHA below). Review worktree:
`codex/ftl-design-agent-access`. The old local observer branch was not used as current code.

## Reproduction

Built the pinned dependency tree with `cargo build --release -p bts-server
--no-default-features`; build succeeded. Ran these two commands independently:

```sh
./target/release/bts run --seed eval-0 --ai hard,medium,medium,easy --calendar standard --regions 60 --rounds 525 --quiet --curve /tmp/eval-0.csv --save /tmp/eval-0.json
./target/release/bts run --seed riverland --ai hard,medium,medium,easy --calendar standard --regions 60 --rounds 525 --quiet --curve /tmp/riverland.csv --save /tmp/riverland.json
```

The actual temporary output prefix in this session was
`/private/tmp/bts-review-20261113/`. The CLI uses `Session::new(cfg, 7)`, whose policy
seeds differ from the independently constructed policies in `bts-ai/tests/perf.rs`.
Consequently the report's successful performance fixture and this unsuccessful CLI
riverland run are not identical policy-seed experiments. Do not call this difference
nondeterminism or a reproduction of that exact performance test.

Both jobs ran concurrently. Timings are diagnostic wall time under shared load,
not a reference-machine performance benchmark. Both reached round 525, month 89988,
AD 2500 with winner None.

| Seed | Elapsed | Final state hash | Diagnostic |
| --- | --- | --- | --- |
| eval-0 | 61.9 s | f832bb22f06fb06c | Hard eliminated; surviving seats 2/3 held 47/13 regions |
| riverland | 59.7 s | 80109f81f1389f72 | Hard held all 60 regions, understood 300 technologies, 103 governance months and 0 FTL months |

The checked-in 32-match report also records 0/32 wins; these two runs are additional
diagnostics, not a new calibrated win-rate estimate. Source baseline:
[final report](../calibration/ruleset3-final-eval.txt).

## End-state diagnostics extracted from saved authoritative state

These diagnostics are designer/referee information. They are not a player observation
or an example of data an agent may retrieve during competition. Secrets and seat tokens
from saves are not included.

### eval-0, seat 2: Amberfen

- Two operational assemblies from two independent lines: 5 operational; series manufacture not verified
- Three deployment nodes operating: 0 of 3 nodes operating
- Three-node deployment exercise completed: Not yet held
- Assembly replacement and crew relief verified: Not yet verified
- Educational base: qualified crews for every post, with reliefs: 716 jump engineers for 50,000 posts (75,000 needed); 1,364,216 orbital crew for 152,000 posts (228,000 needed); seconded experts resident here count
- Educational base: training that replaces the crews: jump engineers: 0 places in running courses (2,500 needed); orbital crews: 80,005 places in running courses (7,600 needed)
- Industrial base: a year of flight hardware from own output or contracts: magnets and superconductors: 39 made and 0 contracted of 172 needed; interface lattice: 0 made and 0 contracted of 950 needed
- Logistical base: a year of fuel and spares in store: 76,809 spares (3,864 needed), 383 fuel (3,384 needed)
- Launch and recovery services operating: launch complex not operating (boost made or stood down at the cap 0 of the last 12 months); a station in low Earth orbit with a shipyard module not operating
- Common mission charter across sites established: Not established

Raw save SHA-256 (file kept locally; not packaged): `ecaecb5443642a9d71abc5bfd1ac215d75ced1d678b4150f3d7190db43a24772`.

### riverland, seat 0: Stonewold

- Three deployment nodes operating: 0 of 3 nodes operating
- Scientific base: frontier research capacity: 571,750 researcher-months of frontier research a month (30,000 needed); high-energy laboratory not operating
- Industrial base: a year of flight hardware from own output or contracts: computing hardware: 0 made and 0 contracted of 86 needed; magnets and superconductors: 21 made and 0 contracted of 172 needed; interface lattice: 0 made and 0 contracted of 950 needed
- Logistical base: a year of fuel and spares in store: 0 spares (2,436 needed), 596 fuel (3,624 needed)
- Logistical base: freight links and electric supply at every programme site: 5 sites; 0 below transport grade 2; 4 received less than 90% of their electric demand
- Launch and recovery services operating: launch complex not operating (boost made or stood down at the cap 0 of the last 12 months); a station in low Earth orbit with a shipyard module not operating

Raw save SHA-256 (file kept locally; not packaged): `dc3de2acfb47b1f4c4379ff02e884e49a3430916ae7464840fef73c1979afce0`.

## Source evidence and limits

- [Victory](../../crates/bts-engine/src/sim/victory.rs): global trial recording;
  G96/F24/trial conjunction; three global nodes; expanding programme requirements;
  legacy regional-yard trial support versus station-yard acceptance.
- [Native policy](../../crates/bts-ai/src/policy.rs): global-governance-dependent
  trial scheduling; heuristic plans; course scheduling; full-graph-based research scoring.
- [Native tables](../../crates/bts-ai/src/tables.rs): compiled technology/practice
  catalogs, critical ancestry and undiscovered alternative protection. This is a
  design conflict with discovery parity even if content is in a public repository.
- [Turn packets](../../crates/bts-host/src/turn.rs), [briefing](../../crates/bts-host/src/brief.rs)
  and [MCP tool schema](../../tools/mcp-tools.json): section coverage/scale examples.
  Missing sections are absent from advertised MCP choices, not absent from the full
  authoritative Observation or necessarily every raw HTTP request.
- [Current API](../agent-api.md): managed CLIs and direct APIs already exist. No claim
  is made that fresh live Codex/Claude/DeepSeek integration was tested in this review.
- [Policy construction](../../crates/bts-host/src/session.rs) versus
  [performance fixture](../../crates/bts-ai/tests/perf.rs): different policy seeds.

The source inconsistencies are implementation repair tasks. The revised completion,
institutional education and packet proposals are design work awaiting implementation.
The two current-code runs cannot validate the proposed simpler rules or demonstrate
that any strategy is universally best.

## Decisions handed to the implementer

Read [42](../design/42-ftl-completion-and-playability.md),
[15](../design/15-victory-and-ftl.md),
[44](../design/44-institutional-education.md) and
[43](../design/43-agent-access-and-decision-packets.md) in that order.
First close the new winning project and education pipeline; then simplify onboarding
and packet coverage; then calibrate native policies under their declared information
track. Do not add more tech branches, impose a universal population threshold or
hide unfinished endgame behavior behind an easier AI label.

Audited full commit: `fabe33b18200ec1a54c1fc59cdeaf55a926af207`. Host for these runs: `Darwin arm64`.
