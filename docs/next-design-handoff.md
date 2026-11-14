# Next-design implementation handoff

Documentation revision: 2026-11-13. Baseline: `fabe33b`, game 0.4.0 / ruleset 3.0.0.
This branch changes documentation only. Do not report its proposals as shipped fixes.

## Short implementation prompt

Continue from the latest main of `zxr-creator/Before-the-stars`. Read design chapters
42, 15, 44 and 43 in that order and the evidence in `docs/reviews/09-current-implementation-audit.md`.

Make the next ruleset winnable by completing an operational FTL engine project:
construction, commissioning, a real loaded flight and recovery. Remove global
unification and fleet-wide deployment from victory, including indirect requirements
in trial recording, AI policy, three global test sites, prerequisites, UI and rewards.
Retain actual industrial inputs, qualified people, launch/recovery services and
exclusive resource accounting. Research alone does not win.

Replace manual training programmes with maintained institutions. Schools, technical
institutes, universities and future learning institutions automatically admit, educate
and graduate people. Players choose construction/expansion, broad focus and persistent
Economy/Standard/Priority budgets. Learning remains delayed and bounded by teachers,
facilities, resources and technology. Use broad education bands and automatic paid
on-the-job conversion for specialist projects; no recurring course commands.

Simplify agent onboarding using the existing host and two-tool decision loop. Provide
managed Codex/Claude Code, external app/CLI connections and direct model APIs including
tested compatible DeepSeek configurations. Do not require MCP installation for direct
APIs. Repair missing era/market/space packet coverage, valid action schemas, bounded
memory and retry-safe submissions. Quiet rounds should need one substantive decision;
live negotiation retains its existing limits and causality. Do not silently replace
a failed LLM with native AI in benchmark results.

Use only seat-visible information for discovery native policies. The current compiled
hidden victory ancestry must not be treated as equal-information play. Version the
new rules and retain legacy saves or explicitly migrate unranked copies. Test actual
primitive-start completion, including a peaceful independent winner, then run the
specified calibration and held-out campaigns. Report results and remaining failures;
do not declare success from a single late-game fixture or a lowered threshold alone.

## Definition of done

- Peaceful FTL completion wins with surviving independent rivals; conquest without
  FTL fails; ties, horizon settlement and partial failure follow chapter 15.
- Decades of institutional schooling operate without manual course actions. Population,
  teacher, student, employment and material ledgers conserve their quantities.
- Every visible subsystem is accessible in bounded agent packets, with the same
  decisions available to humans; hidden content remains isolated in official evaluation.
- CLI/API adapters are actually tested for the supported provider/client versions.
- All relevant invariants and full-game evidence are reported; fresh rules/policy
  versions distinguish the results from the old 0/32 baseline.
