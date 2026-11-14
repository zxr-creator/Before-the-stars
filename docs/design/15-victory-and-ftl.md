# Victory: complete an operational FTL engine

Revised 2026-11-13 at the user's request. **Next-design specification, not yet implemented.**
This replaces `G96 AND F24 AND Trials96`. Ruleset 3.0.0 at the audited commit still
uses that old rule. See [chapter 42](42-ftl-completion-and-playability.md) for evidence.

## 1. Sole victory condition

The first eligible original civilization to complete a verified operational FTL engine
project wins. **Global integration is not required.** Conquest, population, territory
and military supremacy are not alternate victories. A conqueror still needs FTL;
a peaceful civilization can win while independent rivals survive.

Completion requires physical construction, commissioning and a verified loaded jump
and recovery. Researching a technology, hoarding money or announcing success is not
completion. Scientific, educational and industrial capacity must actually support the
project; unrelated national systems need not pass simultaneous acceptance checks.

The proposed acceptance scope is deliberately narrower than the former military-wide
requirement: finish a working engine programme. Second independent assembly plants,
three global deployment nodes, replacement fleets, 96 governance months and 24 months
of fleet-wide readiness are not mandatory. Fleet-wide deployment may remain an optional
post-victory achievement. This is a design choice accompanying the user's FTL-only
request, not a claim that deleting governance alone fixes the current game.

## 2. Engineering state machine

`unknown → revealed → authorized → constructing → commissioning → flight_ready
→ trial_in_progress → recovered_and_verified → completed`.

| Stage | Required evidence | Interruption behavior |
| --- | --- | --- |
| Revealed | Acquired evidence exposes the objective and known prerequisites | No early packet or example reveals hidden FTL targets |
| Authorized | Known viable design, sponsoring seat and funded project | Authorization is not construction; show missing observed requirements |
| Constructing | Delivered engine materials, real work and facilities | Shortages pause affected work; consumed inputs remain spent |
| Commissioning | Installed engine, quality tests, assigned qualified team, launch/recovery support | Automatic specialist conversion is a real project stage, not a separate course click |
| Flight ready | Exclusive mission input/capacity reservations and completed tests | Reserved stock, staff and service slots cannot be spent elsewhere |
| Trial in progress | Standard nonzero payload follows the paid loaded jump-and-return protocol | Actual interruptions cause documented delay, damage or loss; no arbitrary failure added to prolong the game |
| Recovered and verified | Returned payload/engine and telemetry pass the test; programme rights held through recovery | Diplomatic claims and undelivered promises do not count |
| Completed | Month-end settlement confirms evidence and eligibility | Record immutable completion time; adjudicate all seats together |

Manufacturing replication and quality evidence belong within the engine's construction
and commissioning. They are not a requirement to build a second space empire. The
new content version must define a concrete bill, minimum work/durations, standard
payload and support capacity, exposed when discovered. Reuse relevant current prototype
and trial recipes as calibration inputs, removing global/fleet prerequisites rather
than applying an unexplained universal discount. Current T166 and its physical
requirements are the starting point; T167 fleet standards are not the terminal gate.
Audit all transitive practice, material, teaching and site prerequisites.

Research and accepted components persist. Missing fuel pauses preparation rather than
erasing science. Physical damage can destroy an engine; material design changes
invalidate only affected tests. Operating services are checked when used, not inferred
from old certificates. The same operational predicate must serve quotes, UI, project
start and flight/recovery, including upgraded stations and partner services.

## 3. Cooperation and control

Launch, fabrication, laboratories and teams may be domestic or contracted. Count actual
exclusive delivered capacity, not nominal future promises. A supplier cannot sell the
same slot twice. People assigned to a mission cannot simultaneously work elsewhere.
Necessary test material has a reachable acquisition/substitution path; direct ownership
of every world test node cannot remain a hidden victory gate.

Every programme has one sponsoring original seat with valid operational rights. Joint
funding can benefit competitors but does not create shared victory. Contracts identify
asset control, service rights and attribution before the flight. Merely licensing an
idea or funding a rival's engine is not your completion. A genuine asset purchase can
be useful, but the buyer commissions its team and performs its own qualifying flight;
past completion records cannot be sold. Scientific knowledge need not be rediscovered.

Only active, nonforfeited original seats with independent programme authority are
eligible. Existing subordinate restrictions remain; independent allies and contracting
states do not need a common sovereign. Eliminated seats and caretakers cannot win.
A remote colony's trouble matters only if it actually removes required capacity.
Unrelated expansion must not increase a funded mission's acceptance specification.

## 4. Timing and reward

Settle all eligible completions in a month before adjudication. Earliest valid completion
wins. Simultaneous first completions produce a competitive draw with the tied finishers,
not a lower-seat-ID, CPU-thread or HTTP-arrival winner. This is not an allied shared
victory. Extend outcome metadata for tied finishers. At the horizon, check completion
before declaring timeout.

Next-design reward: sole winner `2 - T/H`, tied earliest finishers `0`, everyone else
`-1`, where T and H are elapsed simulation months under the frozen calendar. Use
undiscounted finite-horizon returns. Report raw completion date and rounds separately.
The current `calendar::winner_reward` uses a post-1950 reference and clamp; it is a
legacy formula and must be explicitly versioned on migration, not silently mixed
with this one. No mid-match scoring changes.

No population, graduation, conquest, GDP or technology-node payouts in the principal
benchmark. Dense factual feedback is not a farmable reward. Provider outages are
infrastructure truncations, not strategic losses or silent native-AI successes.
Discovery actors receive no private reward decomposition revealing FTL early. Models
with prior graph knowledge belong to an informed evaluation track.

## 5. Required cases

- Independent FTL completion with three surviving sovereign rivals wins without war.
- Global conquest with no working engine does not win.
- All technologies researched but no commissioned engine does not win.
- Large legitimate investments and clever contracts may win faster; that is desired.
- Retry/cancel, reload, forged claims, undelivered contracts and double-booked services
  cannot duplicate resources or produce a completion certificate.
- Upgraded orbital infrastructure satisfies every use of its operational service.
- A one-month shortage does not erase unrelated completed science or components.
- Selling an asset cannot transfer a past winning flight record to another seat.
- Same-month completions draw; a one-month lead wins; horizon-month completion wins
  before timeout. Network and seat ordering cannot decide a tie.
- Extra factories, population or administrative obligations cannot move the mission's
  fixed goalposts after funding.

Existing saves retain their old rules. A migrated unranked copy must explicitly update
victory state, course conversion, project recipes, controller goals and score version;
never reinterpret a past failed global-governance trial as a new ranked victory.
