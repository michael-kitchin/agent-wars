# Campaign Objective, Win-First Coaching, At-Cap Production, and Prompt Layout

> **For agentic workers:** Work the phases in order. Finish each phase's verification before starting the next. Steps use checkbox (`- [ ]`) syntax; tick each one as you finish it. **Never commit or push** (`.cursor/rules/11-no-commit-or-push.mdc`). The user reviews every change first. Before you start, ask any questions you need to; if anything in this plan disagrees with the code you find, stop and ask instead of guessing.

**Goal:** AI commanders stop holding the border and start taking cities. The engine picks a campaign target for each AI side, gathers its ground units at a staging hex, and then sends them in together. The briefing, Best Options, and suggested destinations point at that target. The ranked goals put taking cities first. Production at the unit caps banks credits for mercenaries instead of fortifying every city. Finally, every turn-invariant sentence moves into the cached system prompt, and both the strategic and battle prompts get clean markdown structure.

**Why:** In a 500-turn Flash-Lite match the sides preserved their forces and fought only at the borders. The model copies the engine's tables almost verbatim. Those tables always pointed at the nearest visible enemy or the nearest enemy-home cell, so no side ever massed for a decisive attack. The goal list never ranked taking cities first, and its strategy lines ("disperse", "minimum force") argued against massing. At the caps, the production coaching named fortification first, so home cities became untakeable.

**Architecture:**
- **Pure campaign rules.** Scoring, staging, phase, and unit roles live in `src/main/openRouter/campaignRules.ts`.
- **Stored objective.** The objective is one `game_config` row, `campaign_objectives`.
- **Per consult.** `campaignObjectiveFlow.ts` resolves the objective, then builds a `CampaignPlan`. The plan is passed explicitly to every briefing builder that needs it. No builder reads the database to find it.
- **New briefing parts.** A Campaign Objective section and a Campaign Orders table.
- **Override.** An optional `campaignTarget` envelope field lets the commander replace the target.
- **Prompt layout.** Static text moves into a new `# Reading the Briefing` section and into the Rules and Scenario sections of the system prompt.

**Tech stack:** TypeScript, `node:test`, SQLite through the existing `gameDb` facade, `h3-js`. No new dependencies.

## Requirements

These come from the user's request and answers.

| # | Requirement |
| --- | --- |
| R1 | On a strategic `region_vs_region` consult, the engine picks one enemy city for each AI side's ground units, plus a staging hex and a phase (`assemble`, then `assault`). It keeps them between consults. |
| R2 | When scoring cities, every hex's urban count counts as public geography. Control and fortifications count only where the side has explored. An unexplored city inside an enemy home region counts as held by that home's side. |
| R3 | Campaign units get the campaign hex as their Suggested Destination and get `advance` rows in Best Options. A visible enemy elsewhere no longer redirects them. Home defenders and units in contact keep today's behavior. |
| R4 | The briefing shows the objective, a Campaign Orders table, and an attention bullet. The system prompt explains the campaign. |
| R5 | The commander may replace the target with an optional `campaignTarget` envelope field. The engine validates it and keeps it until it is taken or stops being an enemy city. |
| R6 | The ranked goals put taking cities first. The base strategy lines no longer contradict any doctrine. Balanced gets its own doctrine block. |
| R7 | At the caps, credits come first. Fortification is offered only for exposed cities, and the Controlled Hex Queues table shows an Exposed column. Raise Options lists cells nearest the campaign target first. |
| R8 | Everything that does not change from turn to turn goes in the cached system prompt, in both the strategic and battle prompts. Only facts that change per turn stay in the situation message. |
| R9 | Both prompts are readable markdown: one topic per heading, headings nest one level at a time, and paragraphs are separated by blank lines. |
| R10 | Existing roster gates stay. Air, naval, and missile text still appears only while the side has that arm. |
| R11 | An event-driven commander is consulted on the turn its assembly completes, so the assault is not delayed. |

### Sentences to Expect

| Where | Text |
| --- | --- |
| Best Options Action column | `advance` |
| Campaign Objective bullet | `- Target: TT, a Western Europe city with 54 city cells and no known fortifications. The engine chose it on turn 12.` |
| Campaign Objective bullet | `- Phase: assemble. 4 of 6 ground units are within 2 hexes of SS. The assault starts when 6 are.` |
| Attention flag | `Campaign: 3 units need a new standing order. Copy each Campaign Orders row into an assign_order entry.` |
| Drop reason | `campaignTarget dropped: QQ is not a known enemy city.` |
| Goal 1 | `(1) Take and hold enemy cities. Taking cities is how you knock sides out.` |
| Production attention | `blocked at cap, can build air, credits, fortification: DK` (credits before fortification; fortification only when exposed) |

## Decisions Already Made

Don't revisit these.

- **Who picks.** The engine picks the target (R1). The commander may override it (R5). A commander who sends the current target again changes nothing, so a model that echoes the field every turn does not reset the phase.
- **Scope of the campaign.** Strategic consults in `region_vs_region` with standing orders enabled. Ground units only: infantry and armor, mercenaries included, embarked units excluded. Naval and air units keep today's suggestions. Battles are unchanged.
- **Candidate cities (R2).** A hex with `urbanHexCount > 0`, whose known controller is an active enemy seat.
  - On an explored hex, the known controller is the snapshot's `strategicControl` entry.
  - On an unexplored hex inside exactly one active enemy's home region, the controller is that seat.
  - Any other unexplored hex is unknown and not a candidate. Neutral and knocked-out sides are never targets; the existing interest rows already grab uncontrolled cities.
  - Fortifications count only on explored hexes.
- **Reach.** Distance is land steps: a breadth-first walk over `canLandUnitTraverseEdge` from the side's ground units. The engine picks only targets within `CAMPAIGN_MAX_LAND_STEPS`. A stored or commander target stays valid while it is within `CAMPAIGN_REACH_LIMIT_STEPS`.
- **Score.** `urban × (2 if inside an enemy home, else 1) ÷ ((steps + 2) × (1 + knownFortified ÷ 4))`. The highest score wins. Ties go to fewer steps, then the lower H3 index.
- **Staging hex.** A hex the side controls, on land the force can reach, at least `CAMPAIGN_STAGING_MIN_STEPS` land steps from the target. The nearest such hex to the target wins. Ties go to fewer steps from the force, then the lower H3 index. With none, the staging hex is null and the phase is `assault` from the start. A kept objective keeps its staging hex while the side still controls it, and a kept objective with no staging hex keeps none.
- **Phase.**
  - The threshold is `min(CAMPAIGN_ASSAULT_MIN_UNITS, own ground units)`, at least 1.
  - `assemble` becomes `assault` when that many ground units are within `CAMPAIGN_MASS_RADIUS` hops of the staging hex.
  - `assault` falls back to `assemble` when fewer than half the threshold, rounded up, are within that radius of the staging hex or the target.
  - A new target starts in `assemble`, or in `assault` when there is no staging hex.
- **Retargeting.** The engine picks a new target when the stored one is no longer a candidate city: taken, lost to a third side as far as the side knows, or destroyed. It also picks a new one when the target is out of land reach. There is no timeout.
- **Unit roles.**
  - A **home defender** is a ground unit inside the side's own home region with an active enemy unit visible within `CAMPAIGN_HOME_DEFENSE_RADIUS` hops.
  - A unit **in contact** has an active enemy unit within `CAMPAIGN_CONTACT_RADIUS` hop.
  - Defenders and units in contact are not campaign units and keep today's suggestions and rows.
  - Every other ground unit that can reach the waypoint by land is a campaign unit.
  - The **waypoint** is the staging hex during `assemble` and the target during `assault`.
  - During `assemble`, a campaign unit already within `CAMPAIGN_MASS_RADIUS` of the staging hex **holds**: its order is `defend` on its own hex.
- **When the objective updates.** Once per strategic consult, before the briefing is built (`requestOrdersFlow.ts`). Between consults, units follow their standing orders. A new mandatory consult reason, `campaign_ready`, fires after resolution when an assembly is complete.
- **Explicit plumbing.** The consult computes one `CampaignPlan` and passes it as an optional argument to each builder. A builder called without one behaves exactly as today, which keeps every existing test valid.
- **Best Options.** For a campaign unit with no enemy contact this turn:
  - A holding unit gets no move row.
  - Otherwise, an uncontrolled city on a closing step is a `move/melee` row.
  - Otherwise, the closing steps toward the waypoint are `advance` rows.
  - With no closing step, the unit gets no move row. It never falls back to closing on the nearest enemy.
- **Campaign Orders** sits under Standing Order Status, because that file already decodes standing orders. It lists campaign units whose current standing order differs from their campaign order. Units with no standing order are in Units Without Standing Orders instead, with the same order as their Suggested Destination.
- **Doctrine.** Doctrine changes only prompt text. The engine's thresholds are the same for every doctrine.
- **Production (R7).**
  - A city is exposed when an active enemy unit, visible or in the side's intel, is within `PRODUCTION_EXPOSED_RADIUS` hops.
  - Fortification remains legal everywhere. Only the coaching, the attention bullet, and the new column change.
- **Prompt layout (R8, R9).** The target outlines are below.
  - **Kept in the situation message:** the closing instruction stays at its end, because it is the last thing the model reads.
  - **Allowed to change the system prompt:** the Sides table's Status column, and the enemy home list. Both change only when a side is knocked out.
  - **Turned into per-game gates:** text that today is gated per turn and now moves to the system prompt. The odds key is gated on the briefing being precomputed, and the scouting sentence is always present in strategic prompts.
- **Doc example prompts** are rewritten by hand to the new layout, as they are today ("edited to match the builders").

### Tunable Constants

All live in `src/main/openRouter/campaignRules.ts` except the last.

| Constant | Value | Meaning |
| --- | --- | --- |
| `CAMPAIGN_MAX_LAND_STEPS` | 12 | Farthest target the engine picks |
| `CAMPAIGN_REACH_LIMIT_STEPS` | 30 | Farthest a kept or commander target may be |
| `CAMPAIGN_STAGING_MIN_STEPS` | 2 | Closest a staging hex may be to the target |
| `CAMPAIGN_MASS_RADIUS` | 2 | Hops from the staging hex that count as massed |
| `CAMPAIGN_ASSAULT_MIN_UNITS` | 6 | Units needed to start the assault (capped by the force size) |
| `CAMPAIGN_HOME_DEFENSE_RADIUS` | 3 | Hops to an enemy that make a home unit a defender |
| `CAMPAIGN_CONTACT_RADIUS` | 1 | Hops to an enemy that leave a unit fighting |
| `CAMPAIGN_ENEMY_HOME_WEIGHT` | 2 | Score multiplier for a city inside an enemy home |
| `CAMPAIGN_FORTIFICATIONS_PER_PENALTY_STEP` | 4 | Known fortified cells that halve a city's score |
| `PRODUCTION_EXPOSED_RADIUS` (in `productionExposure.ts`) | 4 | Hops to an enemy that make a city exposed |

## Target Prompt Outlines

These are the heading outlines after Phase 10. Gated headings are marked. Use them as the authority for Phases 8 to 10.

**Strategic system message:**

```text
# Your Command
# Scenario Objective (Required)            [region_vs_region]
## Sides                                   [region_vs_region]
# Coordinates
# Rules
## Combat
## Bonuses                                 [origin or tech bonus on]
## Weather                                 [weather bonus on]
## Terrain Cover
## Resolution Order
## Movement
## Naval Units                             [side has naval]
## Air Units                               [side has air]
## Missiles                                [side has missiles]
## Fortifications                          [rule text present]
## Holding Fire                            [standing orders on]
## Production                              [production on]
## Rule Lookup                             [rules tool on]
# Strategic Context
## Campaign                                [campaign on]
# Reading the Briefing                     [briefing precomputed]
## Distances and Intel Age                 [a caveat line applies]
## Map Legend
## Best Options Odds
## Memory Slots                            [memory on]
## Air Operations Table                    [side has air]
## Missile Targets                         [side has missiles]
## Transport                               [side has naval or air]
# Available Tools
## How to Use These Tools Effectively
# Orders Guidance
## Winning                                 [region_vs_region or 3+ sides]
## Using the Briefing
## Standing Orders                         [standing orders on]
## Air and Naval Units                     [side has air or naval]
## Production Queues                       [production on]
## Memory and Callbacks
## Messages and Rounds
# Response Format
## Example Response
```

**Strategic situation message, with a precomputed briefing:**

```text
# Current Situation
# Commander's Briefing
## Unit Status and Threats
## Attention Flags
## Operational Map
### Best Options This Turn                 [rows exist]
## Campaign Objective                      [campaign plan exists]
## Supplemental Hex Intelligence           [assessments exist]
## Recent Turn Notes                       [notes exist]
## Production Status                       [production on]
### Paused Queues                          [paused queues]
### Controlled Hex Queues
## Your Strategic Memory                   [memory on]
### Persistent (Active Strategic Context)
### Reminders Triggered This Turn
## Standing Order Status                   [standing orders on]
### Units Without Standing Orders
### Campaign Orders                        [campaign plan exists]
## Active Callbacks
## Scenario Progress                       [region_vs_region]
## Air Operations Status                   [side has air]
## Missile Forces                          [side has missiles]
## Mercenaries                             [economy shown]
### Your Mercenaries / Rehire Candidates / Raise Options (as today)
## Naval Transport Status                  [side has naval or air]
## Unit Roster
```

Without a precomputed briefing there is no `# Commander's Briefing`. The production, memory, standing-order, Scenario Progress, status, and Unit Roster sections stay H1, as they are today.

**Battle system message:**

```text
# Your Command
# Coordinates
# Rules
## Combat
## Bonuses / ## Weather / ## Terrain Cover / ## Resolution Order / ## Movement   [as the gates allow]
## Naval Units / ## Air Units              [battle roster has them]
## Rule Lookup                             [rules tool on]
# Battle Context
# Reading the Briefing
## Map Legend
## Air Operations Table / ## Transport     [battle roster has them]
# Available Tools
## How to Use These Tools Effectively
# Orders Guidance
## Using the Briefing
## Air and Naval Units                     [battle roster has them]
## Callbacks and Messages
# Response Format
## Example Response
```

**Battle situation message:**

```text
# Current Situation
# Commander's Briefing
## Unit Status and Threats
## Attention Flags
## Operational Map
### Best Options This Turn                 [rows exist]
## Recent Turn Notes                       [notes exist]
## Active Callbacks
## Air Operations Status / ## Naval Transport Status   [battle roster has them]
## Unit Roster
```

## Global Constraints

- **Never commit or push.**
- **No plan identifiers.** Never write "Phase", "R1", or other plan identifiers in code, comments, or `doc/` (`.cursor/rules/12-no-plan-identifiers.mdc`).
- **Orienting comments.**
  - Every new or changed function, field, interface, and constant gets an orienting comment in the file's existing `Purpose / When to use / Expected outcome / Exceptions` style.
  - Field blocks may use `Contract` in place of `Purpose`, as the files already do.
  - eslint rejects one-line field comments.
  - Fix any comment whose stated behavior this plan changes.
- **Logging.** Getter-style helpers in `src/main/` log with `logTrace`; decisions log with `logDebug`. Files in `src/shared/` follow their file's existing logging; most do not log. Keep the existing log calls.
- **Sizes.**
  - Source files should stay under 600 lines, with a hard limit of 1000.
  - Functions take at most 6 named parameters; use an argument object beyond that.
  - Do not restructure a file that is already over 600 lines for a small addition (`briefingFormatter.ts`, `orderResponseParsing.ts`, `requestOrdersApplyParsed.ts`, `possibleUnitActionsTableAssembly.ts` if over, `callbackEvaluation.ts`, `afterResolution.ts`).
- **Tests.**
  - Tests cover contracts only. Add only the tests listed here.
  - When a phase moves or rewords text, update every existing assertion that pinned the old place or wording. Change only the expected place, heading, or wording. Never delete an assertion about content, and never weaken one to `assert.ok(true)`.
- **Docs.** Update the `doc/` text named in each phase as part of that phase. Don't touch `doc/release-notes/` or anything under `.spec/` except this file's checkboxes.
- **PowerShell.** It has no `&&`. Chain commands with `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`.
- **Text rules.** Prompt text that this plan writes is given exactly. Copy it verbatim, including punctuation. A `{name}` inside quoted text is filled from the named constant or value.

## Review Focus

1. **A visible ship no longer drags the army.** A campaign unit with an enemy unit 6 hexes away still gets `advance` rows toward the staging hex. Phase 3 test.
2. **Defenders stay home.** A home unit with an enemy 2 hexes away is not a campaign unit and keeps its approach row. Phase 1 test, Phase 3 wiring.
3. **The phase flips, and the commander is consulted.** Six units within 2 hexes of the staging hex turn `assemble` into `assault` at the next consult. The after-resolution check fires `campaign_ready`. Phases 1 and 2.
4. **Echoing the target is harmless.** `campaignTarget` equal to the stored target leaves the phase unchanged. Phase 5 test.
5. **Fog.** An unexplored city outside any enemy home is never picked. An unexplored enemy-home city is picked with no fortification penalty. Phase 1 test.
6. **Unchanged without a plan.** Every builder called without `campaignPlan` produces today's output. The existing test suite proves it.
7. **System prompt is stable across turns.** The same match one turn later produces an identical `staticSystemText`. Phase 8 test.
8. **Nothing turn-invariant is left in the situation message.** Phase 8 test.
9. **Headings nest.** `assertHeadingsNest` passes for both prompts. Phase 10.

## Test Commands

```text
npm run build:main
node dist/shared/FILE.test.js          (shared tests)
node dist/main/FILE.test.js            (main tests; use the test's folder under dist/main)
npm run check:renderer-types           (after any src/renderer/ change)
```

A TypeScript error from `build:main` counts as a failed step. Tests that open a database (`withTempGameDb`, `openGameDatabaseAtPathForTests`) need the Node build of the native module: run `npm run rebuild:native:node` once before the first one. `npm start` rebuilds it for Electron afterward.

**Prompt test sweep.** Phases 3 to 11 use this sweep. It runs every compiled test under the prompt folders, plus the main-folder tests, and stops at the first failure:

```powershell
npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run rebuild:native:node; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; $files = @(Get-ChildItem dist/main/openRouter, dist/main/briefing, dist/main/tools -Recurse -Filter *.test.js) + @(Get-ChildItem dist/main -Filter *.test.js); foreach ($f in $files) { node $f.FullName; if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: $($f.FullName)"; exit 1 } }
```

`npm run build:main` does not delete stale compiled files, and the full runner executes every `*.test.js` under `dist/`. If you delete or rename a test source, delete its compiled `.js`, `.js.map`, and `.d.ts` too.

---

## Phase 1: Pure Campaign Rules

All the campaign decisions as pure functions with no database and no terrain cache, plus two land-traversal helpers.

**Files:**
- Create `src/shared/campaignTypes.ts`, `src/main/openRouter/campaignRules.ts`, and `src/main/openRouter/campaignRules.test.ts`.
- Edit `src/shared/landTraversalStrategic.ts`, `src/shared/landTraversalStrategic.test.ts`, and `src/main/tools/orderlessUnitSuggestions.ts`.

**Produces:**
- `CampaignPhase`, `CampaignSource`, `CampaignObjective`, `CAMPAIGN_PHASES`, `CAMPAIGN_SOURCES`
- `landMassRecordsShareId`, `getLandStepDistances`
- Every constant in the Tunable Constants table except `PRODUCTION_EXPOSED_RADIUS`
- `HopDistance`, `CampaignCity`, `CampaignUnitInput`, `CampaignPlan`
- `knownCampaignCities`, `scoreCampaignCity`, `chooseCampaignTarget`, `chooseStagingHex`
- `campaignAssaultThreshold`, `campaignMassCenters`, `countMassedUnits`, `nextCampaignPhase`, `campaignWaypoint`
- `isHomeDefender`, `resolveCampaignObjective`, `campaignAssaultReady`, `buildCampaignPlan`
- `campaignOrderFor`, `campaignRoleForUnit`

- [x] **Step 1: Types.** Create `src/shared/campaignTypes.ts`.
  - It imports nothing, so `gameDb`, `openRouter`, and `tools` can all use it without a cycle.
  - File header Purpose: "One stored shape for an AI side's ground campaign, shared by the briefing, the response parser, and the stored game row."
  - Give every export and field a full block.

```ts
export type CampaignPhase = 'assemble' | 'assault';

export type CampaignSource = 'engine' | 'commander';

export const CAMPAIGN_PHASES: readonly CampaignPhase[] = ['assemble', 'assault'];

export const CAMPAIGN_SOURCES: readonly CampaignSource[] = ['engine', 'commander'];

export interface CampaignObjective {
  readonly targetH3: string;
  readonly stagingH3: string | null;
  readonly phase: CampaignPhase;
  readonly source: CampaignSource;
  readonly chosenTurn: number;
}
```

  Field notes:
  - `targetH3`: "The enemy city the campaign takes."
  - `stagingH3`: "Where ground units gather before the assault. Null when no controlled hex qualifies; the campaign then attacks directly."
  - `phase`: "`assemble` while gathering, `assault` while attacking."
  - `source`: "`engine` when the engine picked the target, `commander` when the model's `campaignTarget` did."
  - `chosenTurn`: "The turn the current target was picked."

- [x] **Step 2: Land helpers.** In `src/shared/landTraversalStrategic.ts`, add these two exports after `canLandUnitTraverseEdge`. This file does not log; keep it that way. Both need full blocks.

```ts
export function landMassRecordsShareId(a: StrategicLandMassRecord, b: StrategicLandMassRecord): boolean {
  return idsIntersect(a.continentIds, b.continentIds) || idsIntersect(a.islandIds, b.islandIds);
}

export function getLandStepDistances(args: {
  readonly originH3s: readonly string[];
  readonly hexSet: ReadonlySet<string>;
  readonly data: LandMassByH3;
  readonly maxDepth: number;
}): Map<string, number> {
  const steps = new Map<string, number>();
  const queue: string[] = [];
  for (const origin of args.originH3s) {
    if (!args.hexSet.has(origin) || steps.has(origin)) continue;
    steps.set(origin, 0);
    queue.push(origin);
  }
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!;
    const depth = steps.get(current) ?? 0;
    if (depth >= args.maxDepth) continue;
    let neighbors: string[];
    try {
      neighbors = gridDisk(current, 1);
    } catch {
      continue;
    }
    for (const neighbor of neighbors) {
      if (neighbor === current || steps.has(neighbor)) continue;
      if (!args.hexSet.has(neighbor) || !isOnMap(neighbor)) continue;
      if (!canLandUnitTraverseEdge(current, neighbor, args.data)) continue;
      steps.set(neighbor, depth + 1);
      queue.push(neighbor);
    }
  }
  return steps;
}
```

  Block notes:
  - `landMassRecordsShareId`
    - Purpose: "A march between two hexes needs a shared continent or island id."
    - Expected outcome: "True when the records share at least one continent id or one island id."
  - `getLandStepDistances`
    - Purpose: "Campaign scoring needs land route length, not straight hops, because a target across water cannot be marched to."
    - Expected outcome: "Every hex reachable by land within `maxDepth` steps of any origin, with its smallest step count. Origins are 0. Origins not in `hexSet` are skipped."
    - Exceptions: "None. A cell `gridDisk` rejects is skipped."
  - Armor's stop-on-entering rule is ignored on purpose. The count measures distance, not this turn's move.

- [x] **Step 3: Reuse the shared check.** In `src/main/tools/orderlessUnitSuggestions.ts`:
  - Delete the private `sharesLandMassId` function and its block.
  - Import `landMassRecordsShareId` from `../../shared/landTraversalStrategic`, beside the existing imports from that file.
  - Replace the one call. The behavior is identical: an empty id list never matches in either version.

- [x] **Step 4: Test the land helpers.** In `src/shared/landTraversalStrategic.test.ts`, add the test below. Import `gridDisk` and `latLngToCell` from `h3-js`, `getLandStepDistances` and `landMassRecordsShareId` from `./landTraversalStrategic`, and the record type. If `StrategicLandMassRecord` requires more fields than the four used here, add them with neutral values (empty arrays, `0`, or `false`).

```ts
test('land steps grow one per edge and stop at a cell on another continent', () => {
  const origin = latLngToCell(10, 10, 1);
  const disk = gridDisk(origin, 2);
  const ring1 = gridDisk(origin, 1).filter((h3) => h3 !== origin);
  const blocked = ring1[0]!;
  const data: LandMassByH3 = new Map(
    disk.map((h3) => [h3, { h3Index: h3, waterPct: 0, continentIds: h3 === blocked ? [2] : [1], islandIds: [] }])
  );
  const steps = getLandStepDistances({ originH3s: [origin], hexSet: new Set(disk), data, maxDepth: 2 });
  assert.equal(steps.get(origin), 0);
  for (const h3 of ring1) {
    if (h3 !== blocked) assert.equal(steps.get(h3), 1);
  }
  assert.equal(steps.has(blocked), false);
  const ring2 = disk.filter((h3) => h3 !== origin && !ring1.includes(h3));
  const reachedRing2 = ring2.filter((h3) => steps.has(h3));
  assert.ok(reachedRing2.length > 0);
  assert.ok(reachedRing2.every((h3) => steps.get(h3) === 2));
  const shallow = getLandStepDistances({ originH3s: [origin], hexSet: new Set(disk), data, maxDepth: 1 });
  assert.equal(ring2.some((h3) => shallow.has(h3)), false);
  assert.equal(landMassRecordsShareId(data.get(origin)!, data.get(blocked)!), false);
  assert.equal(landMassRecordsShareId(data.get(origin)!, data.get(ring1[1]!)!), true);
});
```

- [x] **Step 5: The rules.** Create `src/main/openRouter/campaignRules.ts`.
  - File header:
    - Purpose: "The model copies the engine's suggestions. Without a shared objective, every unit closed on the nearest visible enemy and no side massed for an attack. These rules pick one enemy city and one staging hex, and decide the phase from unit positions."
    - When to use: "From `campaignObjectiveFlow.ts`, which supplies inputs derived from the snapshot, and from tests."
    - Expected outcome: "The same result for the same inputs. Nothing here reads the database or the terrain cache."
  - Every export gets a full block. The tunable constants each get a block that states the value's meaning from the Tunable Constants table.
  - `chooseCampaignTarget`, `chooseStagingHex`, `resolveCampaignObjective`, and `nextCampaignPhase` log with `logDebug`, naming the chosen hex, the step count, and the phase.
  - Every other export logs once per call with `logTrace`, naming the function and its key counts.

```ts
import type { CampaignObjective, CampaignPhase } from '../../shared/campaignTypes';
import { logDebug, logTrace } from '../logger';

export const CAMPAIGN_MAX_LAND_STEPS = 12;
export const CAMPAIGN_REACH_LIMIT_STEPS = 30;
export const CAMPAIGN_STAGING_MIN_STEPS = 2;
export const CAMPAIGN_MASS_RADIUS = 2;
export const CAMPAIGN_ASSAULT_MIN_UNITS = 6;
export const CAMPAIGN_HOME_DEFENSE_RADIUS = 3;
export const CAMPAIGN_CONTACT_RADIUS = 1;
export const CAMPAIGN_ENEMY_HOME_WEIGHT = 2;
export const CAMPAIGN_FORTIFICATIONS_PER_PENALTY_STEP = 4;

export type HopDistance = (fromH3: string, toH3: string) => number | null;

export interface CampaignCity {
  readonly h3Index: string;
  readonly urbanHexCount: number;
  readonly ownerSeatId: string;
  readonly inEnemyHome: boolean;
  readonly knownFortifiedCount: number;
}

export interface CampaignUnitInput {
  readonly id: string;
  readonly h3Index: string;
}

export interface CampaignPlan {
  readonly objective: CampaignObjective;
  readonly waypointH3: string;
  readonly campaignUnitIds: ReadonlySet<string>;
  readonly holdUnitIds: ReadonlySet<string>;
  readonly defenderUnitIds: readonly string[];
  readonly massedCount: number;
  readonly threshold: number;
}

function anyWithinHops(fromH3: string, targets: readonly string[], radius: number, hopDistance: HopDistance): boolean {
  return targets.some((h3) => {
    const distance = hopDistance(fromH3, h3);
    return distance !== null && distance <= radius;
  });
}

export function knownCampaignCities(args: {
  readonly activeEnemySeatIds: ReadonlySet<string>;
  readonly infrastructure: readonly { readonly h3Index: string; readonly urbanHexCount: number; readonly fortifiedCount?: number }[];
  readonly controllerByH3: ReadonlyMap<string, string | null>;
  readonly explored: ReadonlySet<string>;
  readonly homeSeatByH3: ReadonlyMap<string, string>;
}): CampaignCity[] {
  const cities: CampaignCity[] = [];
  for (const row of args.infrastructure) {
    if (row.urbanHexCount <= 0) continue;
    const explored = args.explored.has(row.h3Index);
    const homeSeat = args.homeSeatByH3.get(row.h3Index) ?? null;
    const owner = explored ? (args.controllerByH3.get(row.h3Index) ?? null) : homeSeat;
    if (owner === null || !args.activeEnemySeatIds.has(owner)) continue;
    cities.push({
      h3Index: row.h3Index,
      urbanHexCount: row.urbanHexCount,
      ownerSeatId: owner,
      inEnemyHome: homeSeat !== null && args.activeEnemySeatIds.has(homeSeat),
      knownFortifiedCount: explored ? Math.max(0, Math.trunc(row.fortifiedCount ?? 0)) : 0,
    });
  }
  logTrace('campaignRules knownCampaignCities', { rowCount: args.infrastructure.length, cityCount: cities.length });
  return cities;
}

export function scoreCampaignCity(city: CampaignCity, landSteps: number): number {
  const homeWeight = city.inEnemyHome ? CAMPAIGN_ENEMY_HOME_WEIGHT : 1;
  const fortificationFactor = 1 + city.knownFortifiedCount / CAMPAIGN_FORTIFICATIONS_PER_PENALTY_STEP;
  logTrace('campaignRules scoreCampaignCity', { h3Index: city.h3Index, landSteps });
  return (city.urbanHexCount * homeWeight) / ((landSteps + 2) * fortificationFactor);
}

function campaignScoreBeats(
  city: CampaignCity,
  steps: number,
  other: CampaignCity,
  otherSteps: number
): boolean {
  const weight = city.inEnemyHome ? CAMPAIGN_ENEMY_HOME_WEIGHT : 1;
  const otherWeight = other.inEnemyHome ? CAMPAIGN_ENEMY_HOME_WEIGHT : 1;
  const left =
    city.urbanHexCount * weight * (otherSteps + 2) * (CAMPAIGN_FORTIFICATIONS_PER_PENALTY_STEP + other.knownFortifiedCount);
  const right =
    other.urbanHexCount * otherWeight * (steps + 2) * (CAMPAIGN_FORTIFICATIONS_PER_PENALTY_STEP + city.knownFortifiedCount);
  return left > right;
}

export function chooseCampaignTarget(
  cities: readonly CampaignCity[],
  landStepsFromForce: ReadonlyMap<string, number>
): string | null {
  let best: { readonly h3Index: string; readonly city: CampaignCity; readonly steps: number } | null = null;
  for (const city of cities) {
    const steps = landStepsFromForce.get(city.h3Index);
    if (steps === undefined || steps > CAMPAIGN_MAX_LAND_STEPS) continue;
    const better =
      best === null ||
      campaignScoreBeats(city, steps, best.city, best.steps) ||
      (!campaignScoreBeats(best.city, best.steps, city, steps) &&
        (steps < best.steps || (steps === best.steps && city.h3Index < best.h3Index)));
    if (better) best = { h3Index: city.h3Index, city, steps };
  }
  logDebug('campaignRules chooseCampaignTarget', { cityCount: cities.length, chosen: best?.h3Index ?? null, steps: best?.steps ?? null });
  return best?.h3Index ?? null;
}

export function chooseStagingHex(args: {
  readonly ownControlledLandHexes: readonly string[];
  readonly landStepsFromTarget: ReadonlyMap<string, number>;
  readonly landStepsFromForce: ReadonlyMap<string, number>;
}): string | null {
  let best: { readonly h3Index: string; readonly toTarget: number; readonly fromForce: number } | null = null;
  for (const h3Index of args.ownControlledLandHexes) {
    const toTarget = args.landStepsFromTarget.get(h3Index);
    const fromForce = args.landStepsFromForce.get(h3Index);
    if (toTarget === undefined || fromForce === undefined || toTarget < CAMPAIGN_STAGING_MIN_STEPS) continue;
    const better =
      best === null ||
      toTarget < best.toTarget ||
      (toTarget === best.toTarget && (fromForce < best.fromForce || (fromForce === best.fromForce && h3Index < best.h3Index)));
    if (better) best = { h3Index, toTarget, fromForce };
  }
  logDebug('campaignRules chooseStagingHex', {
    candidateCount: args.ownControlledLandHexes.length,
    chosen: best?.h3Index ?? null,
    steps: best?.toTarget ?? null,
  });
  return best?.h3Index ?? null;
}

export function campaignAssaultThreshold(groundUnitCount: number): number {
  return Math.max(1, Math.min(CAMPAIGN_ASSAULT_MIN_UNITS, groundUnitCount));
}

export function campaignMassCenters(objective: CampaignObjective): string[] {
  if (objective.stagingH3 === null) return [objective.targetH3];
  return objective.phase === 'assemble' ? [objective.stagingH3] : [objective.stagingH3, objective.targetH3];
}

export function countMassedUnits(
  unitHexes: readonly string[],
  centerH3s: readonly string[],
  hopDistance: HopDistance
): number {
  return unitHexes.filter((unitH3) => anyWithinHops(unitH3, centerH3s, CAMPAIGN_MASS_RADIUS, hopDistance)).length;
}

export function nextCampaignPhase(args: {
  readonly phase: CampaignPhase;
  readonly stagingH3: string | null;
  readonly massedCount: number;
  readonly threshold: number;
}): CampaignPhase {
  const phase: CampaignPhase =
    args.stagingH3 === null
      ? 'assault'
      : args.phase === 'assemble'
        ? args.massedCount >= args.threshold
          ? 'assault'
          : 'assemble'
        : args.massedCount < Math.ceil(args.threshold / 2)
          ? 'assemble'
          : 'assault';
  logDebug('campaignRules nextCampaignPhase', { from: args.phase, phase, massedCount: args.massedCount, threshold: args.threshold });
  return phase;
}

export function campaignWaypoint(objective: CampaignObjective): string {
  return objective.phase === 'assemble' && objective.stagingH3 !== null ? objective.stagingH3 : objective.targetH3;
}

export function isHomeDefender(args: {
  readonly unitH3: string;
  readonly ownHomeHexes: ReadonlySet<string>;
  readonly enemyUnitHexes: readonly string[];
  readonly hopDistance: HopDistance;
}): boolean {
  if (!args.ownHomeHexes.has(args.unitH3)) return false;
  return anyWithinHops(args.unitH3, args.enemyUnitHexes, CAMPAIGN_HOME_DEFENSE_RADIUS, args.hopDistance);
}

export function resolveCampaignObjective(args: {
  readonly stored: CampaignObjective | null;
  readonly turnNumber: number;
  readonly cities: readonly CampaignCity[];
  readonly landStepsFromForce: ReadonlyMap<string, number>;
  readonly ownControlledLandHexes: readonly string[];
  readonly landStepsFromTarget: (targetH3: string) => ReadonlyMap<string, number>;
  readonly groundUnitHexes: readonly string[];
  readonly hopDistance: HopDistance;
}): CampaignObjective | null {
  logTrace('campaignRules resolveCampaignObjective', {
    storedTarget: args.stored?.targetH3 ?? null,
    cityCount: args.cities.length,
    groundUnitCount: args.groundUnitHexes.length,
  });
  if (args.groundUnitHexes.length === 0) return null;
  const candidateH3s = new Set(args.cities.map((city) => city.h3Index));
  const stored = args.stored;
  const storedSteps = stored === null ? undefined : args.landStepsFromForce.get(stored.targetH3);
  if (
    stored === null ||
    !candidateH3s.has(stored.targetH3) ||
    storedSteps === undefined ||
    storedSteps > CAMPAIGN_REACH_LIMIT_STEPS
  ) {
    const targetH3 = chooseCampaignTarget(args.cities, args.landStepsFromForce);
    if (targetH3 === null) return null;
    const stagingH3 = chooseStagingHex({
      ownControlledLandHexes: args.ownControlledLandHexes,
      landStepsFromTarget: args.landStepsFromTarget(targetH3),
      landStepsFromForce: args.landStepsFromForce,
    });
    return { targetH3, stagingH3, phase: stagingH3 === null ? 'assault' : 'assemble', source: 'engine', chosenTurn: args.turnNumber };
  }
  const stagingStillHeld = stored.stagingH3 !== null && args.ownControlledLandHexes.includes(stored.stagingH3);
  const stagingH3 =
    stored.stagingH3 === null || stagingStillHeld
      ? stored.stagingH3
      : chooseStagingHex({
          ownControlledLandHexes: args.ownControlledLandHexes,
          landStepsFromTarget: args.landStepsFromTarget(stored.targetH3),
          landStepsFromForce: args.landStepsFromForce,
        });
  const withStaging: CampaignObjective = { ...stored, stagingH3 };
  const phase = nextCampaignPhase({
    phase: stored.phase,
    stagingH3,
    massedCount: countMassedUnits(args.groundUnitHexes, campaignMassCenters(withStaging), args.hopDistance),
    threshold: campaignAssaultThreshold(args.groundUnitHexes.length),
  });
  return { ...withStaging, phase };
}

export function campaignAssaultReady(args: {
  readonly objective: CampaignObjective;
  readonly groundUnitHexes: readonly string[];
  readonly hopDistance: HopDistance;
}): boolean {
  const { objective } = args;
  if (objective.phase !== 'assemble' || objective.stagingH3 === null || args.groundUnitHexes.length === 0) return false;
  const massed = countMassedUnits(args.groundUnitHexes, [objective.stagingH3], args.hopDistance);
  return massed >= campaignAssaultThreshold(args.groundUnitHexes.length);
}

export function buildCampaignPlan(args: {
  readonly objective: CampaignObjective;
  readonly groundUnits: readonly CampaignUnitInput[];
  readonly ownHomeHexes: ReadonlySet<string>;
  readonly enemyUnitHexes: readonly string[];
  readonly landStepsFromWaypoint: ReadonlyMap<string, number>;
  readonly hopDistance: HopDistance;
}): CampaignPlan {
  const waypointH3 = campaignWaypoint(args.objective);
  const assembling = args.objective.phase === 'assemble' && args.objective.stagingH3 !== null;
  const campaignUnitIds = new Set<string>();
  const holdUnitIds = new Set<string>();
  const defenderUnitIds: string[] = [];
  for (const unit of args.groundUnits) {
    const defender = isHomeDefender({
      unitH3: unit.h3Index,
      ownHomeHexes: args.ownHomeHexes,
      enemyUnitHexes: args.enemyUnitHexes,
      hopDistance: args.hopDistance,
    });
    if (defender) {
      defenderUnitIds.push(unit.id);
      continue;
    }
    if (anyWithinHops(unit.h3Index, args.enemyUnitHexes, CAMPAIGN_CONTACT_RADIUS, args.hopDistance)) continue;
    if (!args.landStepsFromWaypoint.has(unit.h3Index)) continue;
    campaignUnitIds.add(unit.id);
    if (assembling && anyWithinHops(unit.h3Index, [waypointH3], CAMPAIGN_MASS_RADIUS, args.hopDistance)) {
      holdUnitIds.add(unit.id);
    }
  }
  const unitHexes = args.groundUnits.map((unit) => unit.h3Index);
  const plan: CampaignPlan = {
    objective: args.objective,
    waypointH3,
    campaignUnitIds,
    holdUnitIds,
    defenderUnitIds,
    massedCount: countMassedUnits(unitHexes, campaignMassCenters(args.objective), args.hopDistance),
    threshold: campaignAssaultThreshold(unitHexes.length),
  };
  logTrace('campaignRules buildCampaignPlan', {
    waypointH3,
    campaignUnitCount: campaignUnitIds.size,
    holdCount: holdUnitIds.size,
    defenderCount: defenderUnitIds.length,
  });
  return plan;
}

export function campaignOrderFor(
  plan: CampaignPlan | null,
  unit: CampaignUnitInput
): { readonly orderType: 'march' | 'defend'; readonly destinationH3: string } | null {
  if (plan === null || !plan.campaignUnitIds.has(unit.id)) return null;
  if (plan.holdUnitIds.has(unit.id) || unit.h3Index === plan.waypointH3) {
    return { orderType: 'defend', destinationH3: unit.h3Index };
  }
  return { orderType: 'march', destinationH3: plan.waypointH3 };
}

export function campaignRoleForUnit(
  plan: CampaignPlan | null | undefined,
  unitId: string
): { readonly waypointH3: string; readonly hold: boolean } | null {
  if (!plan || !plan.campaignUnitIds.has(unitId)) return null;
  return { waypointH3: plan.waypointH3, hold: plan.holdUnitIds.has(unitId) };
}
```

  Block notes:
  - `knownCampaignCities` must state the fog rule from Decisions in its Purpose.
  - `resolveCampaignObjective`
    - Expected outcome: "Null with no ground units or no candidate. Otherwise the kept objective, with its staging hex refreshed only when it was lost, and the phase from `nextCampaignPhase`. A stored target is out of reach when its land steps are missing or greater than `CAMPAIGN_REACH_LIMIT_STEPS`. When the stored target is not a candidate or is out of reach, a new engine objective in `assemble`, or in `assault` without a staging hex."
  - `campaignOrderFor`
    - Purpose: "The Suggested Destination column and the Campaign Orders table must name the same order."
  - `campaignRoleForUnit`
    - When to use: "The Best Options move filter."
  - `CampaignPlan` fields each get a block:
    - `waypointH3`: the hex campaign units head for now.
    - `holdUnitIds`: units already massed during assemble.
    - `defenderUnitIds`: in roster order.
    - `massedCount`: units near the mass centers, counted across all ground units.
    - `threshold`: from `campaignAssaultThreshold`.

  The file should be about 380 lines with comments.

- [x] **Step 6: Tests.** Create `src/main/openRouter/campaignRules.test.ts` (`node:test`, `node:assert/strict`, usual header).
  - Use string hex ids `x:y` and this distance, which counts king moves on a grid. It stands in for H3 hops.
  - Land-step maps are built directly with `new Map(...)`.

```ts
const hop = (a: string, b: string): number => {
  const [ax, ay] = a.split(':').map(Number);
  const [bx, by] = b.split(':').map(Number);
  return Math.max(Math.abs(ax! - bx!), Math.abs(ay! - by!));
};
```

  Write these tests. Each expectation follows from the code above. If one does not hold, the code differs from this plan; stop and report.

  1. **`known cities follow explored control and assume unexplored enemy homes are held`**
     - Active enemies `a2` and `a3`.
     - Infrastructure rows:
       - `e1`: urban 10, explored, controller `a2`, fortified 8.
       - `e2`: urban 5, explored, controller `a1`.
       - `e3`: urban 5, explored, controller null.
       - `h1`: urban 20, unexplored, fortified 12, `homeSeatByH3` maps it to `a3`.
       - `u1`: urban 30, unexplored, no home.
       - `r0`: urban 0, explored, controller `a2`.
     - Expect exactly two cities:
       - `{ h3Index: 'e1', urbanHexCount: 10, ownerSeatId: 'a2', inEnemyHome: false, knownFortifiedCount: 8 }`
       - `{ h3Index: 'h1', urbanHexCount: 20, ownerSeatId: 'a3', inEnemyHome: true, knownFortifiedCount: 0 }`
  2. **`the target favors large enemy-home cities near the force and discounts known fortifications`**
     - Cities:
       - A: urban 40, in an enemy home, 0 fortified, 4 steps.
       - B: urban 60, not in a home, 0 fortified, 4 steps.
       - C: urban 40, in an enemy home, 8 fortified, 4 steps.
       - D: urban 100, in an enemy home, 13 steps.
     - `chooseCampaignTarget` returns `A`.
     - `scoreCampaignCity(A, 4)` equals `(40 * 2) / (6 * 1)`.
     - Second case: X (urban 20, not in a home, 2 steps) and Y (urban 30, not in a home, 4 steps) rank equal by the integer cross-product, so the result is `X` because it is fewer steps.
     - A city 13 steps away is not chosen even when it is the only candidate.
  3. **`the staging hex is the nearest controlled hex at least two steps from the target`**
     - Controlled hexes `s1` to `s4`.
     - From the target: `s1` 1, `s2` 2, `s3` 2, `s4` 5.
     - From the force: `s1` 0, `s2` 3, `s3` 1, `s4` 2.
     - Expect `s3`.
     - With only `s1` controlled, expect null.
  4. **`the phase flips at the threshold and falls back below half of it`**
     - `assemble` with staging, massed 6, threshold 6 gives `assault`; massed 5 gives `assemble`.
     - `assault`, threshold 6: massed 3 gives `assault`; massed 2 gives `assemble`.
     - Null staging gives `assault`.
     - `campaignAssaultThreshold(10)`, `(3)`, and `(0)` are 6, 3, and 1.
  5. **`resolve keeps a valid target, retargets a lost one, and keeps a null staging hex`**
     - Ground unit hexes `['3:0','4:0','5:0','6:0','7:0','5:1']`. All six are within 2 of `5:0`.
     - Stored `{ targetH3: '9:9', stagingH3: '5:0', phase: 'assemble', source: 'commander', chosenTurn: 3 }`.
     - Cities contain `9:9` (urban 10, not in a home, 0 fortified).
     - `landStepsFromForce` is `new Map([['9:9', 6], ['5:0', 0], ['8:8', 3]])`.
     - Controlled land hexes `['5:0']`. `landStepsFromTarget` returns `new Map([['5:0', 3]])` for any target.
     - Expect `{ targetH3: '9:9', stagingH3: '5:0', phase: 'assault', source: 'commander', chosenTurn: 3 }`.
     - **Retarget:** the same, but the cities hold only `8:8` (urban 10). Expect `{ targetH3: '8:8', stagingH3: '5:0', phase: 'assemble', source: 'engine', chosenTurn: <the passed turn> }`.
     - **No ground units:** the first case with no unit hexes gives null.
     - **Null staging:** stored with `stagingH3: null` and `phase: 'assault'` gives `stagingH3: null` and `phase: 'assault'`.
     - **Reach:** the same stored target with `landStepsFromForce` entry `9:9` at 20 steps is kept. The same entry at 31 steps is replaced by `8:8` when that city is the only other candidate and is within 12 steps. The map in this case includes both distances, so the limit is the comparison, not a missing key.
  6. **`defenders and units in contact stay out of the campaign, and massed units hold`**
     - Objective `{ targetH3: '9:0', stagingH3: '5:0', phase: 'assemble', source: 'engine', chosenTurn: 1 }`.
     - Own home `{'0:0','1:0'}`. Enemy unit hexes `['0:2','3:6']`.
     - Units:
       - `d1` at `0:0`: a home defender.
       - `c1` at `3:5`: in contact with `3:6`.
       - `h1` at `4:0`.
       - `m1` at `8:8`: not in `landStepsFromWaypoint`.
       - `g1` at `2:2`.
     - `landStepsFromWaypoint` holds `0:0`, `3:5`, `4:0`, and `2:2`.
     - Expect:
       - `defenderUnitIds` is `['d1']`.
       - Campaign units are `h1` and `g1`; hold units are `h1`.
       - `waypointH3` is `5:0`.
       - `campaignOrderFor` gives `defend 4:0` for `h1`, `march 5:0` for `g1`, and null for `d1`.
       - `massedCount` is 1 and `threshold` is 5.
  7. **`an assembly is ready once the threshold stands near the staging hex`**
     - Three ground units within 2 of the staging hex, phase `assemble`: true.
     - The same with phase `assault`: false.


- [x] **Step 7: Verify.**

```powershell
npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/shared/landTraversalStrategic.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/campaignRules.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run rebuild:native:node; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/tools/orderlessUnitSuggestions.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run check:circular
```

  Expected: all pass, and no new cycle.

---

## Phase 2: Stored Objective, the Consult Step, and the Ready Trigger

The objective is stored per side and refreshed once per strategic consult. After resolution, a side whose assembly is complete gets a mandatory consult.

**Files:**
- Create `src/main/gameDb/campaignObjectiveMemory.ts`, `src/main/gameDb/campaignObjectiveMemory.test.ts`, and `src/main/openRouter/campaignObjectiveFlow.ts`.
- Edit `src/main/gameDb/resetGame.ts`, `src/main/openRouter/requestOrdersFlow.ts`, `src/main/callbackEvaluation.ts`, `doc/save-files.md`, `doc/naming-conventions-contract-v1.md`, and `doc/hybrid-ai.md`.

**Produces:**
- `CAMPAIGN_OBJECTIVES_CONFIG_KEY`, `readCampaignObjectives`, `writeCampaignObjectiveForSeat`
- `CampaignStateInputs`, `campaignInputsFromState`, `loadCampaignLandMass`, `campaignLandSteps`, `resolveCampaignObjectiveForSeat`, `campaignPlanForState`
- The `campaign_ready` mandatory reason

- [x] **Step 1: Stored row.** Create `src/main/gameDb/campaignObjectiveMemory.ts`, modeled on `src/main/gameDb/queuePauseMemory.ts`.
  - File header:
    - Purpose: "An AI side keeps its campaign target, staging hex, and phase between consults and across a save and load."
    - When to use: "Read and replaced once per strategic consult. A new match deletes the row."
  - Every export gets a full block.

```ts
import { CAMPAIGN_PHASES, CAMPAIGN_SOURCES, type CampaignObjective } from '../../shared/campaignTypes';
import type { GameConfigKvDbOps } from './gameConfigKv';
import { selectGameConfigValue, upsertGameConfigValue } from './gameConfigRows';
import { logDebug, logError, logTrace } from '../logger';

export const CAMPAIGN_OBJECTIVES_CONFIG_KEY = 'campaign_objectives';

function parseCampaignObjective(value: unknown): CampaignObjective | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const { targetH3, stagingH3, phase, source, chosenTurn } = row;
  if (typeof targetH3 !== 'string' || targetH3.length === 0) return null;
  if (stagingH3 !== null && (typeof stagingH3 !== 'string' || stagingH3.length === 0)) return null;
  if (typeof phase !== 'string' || !(CAMPAIGN_PHASES as readonly string[]).includes(phase)) return null;
  if (typeof source !== 'string' || !(CAMPAIGN_SOURCES as readonly string[]).includes(source)) return null;
  if (typeof chosenTurn !== 'number' || !Number.isInteger(chosenTurn)) return null;
  return {
    targetH3,
    stagingH3: stagingH3 as string | null,
    phase: phase as CampaignObjective['phase'],
    source: source as CampaignObjective['source'],
    chosenTurn,
  };
}

export function readCampaignObjectives(ops: Pick<GameConfigKvDbOps, 'getOne'>): Map<string, CampaignObjective> {
  logTrace('readCampaignObjectives');
  const objectives = new Map<string, CampaignObjective>();
  const raw = selectGameConfigValue(ops, CAMPAIGN_OBJECTIVES_CONFIG_KEY);
  if (raw == null) return objectives;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      logError('readCampaignObjectives: stored value is not an object', { rawLength: raw.length });
      return objectives;
    }
    for (const [seatId, value] of Object.entries(parsed)) {
      const objective = parseCampaignObjective(value);
      if (objective) objectives.set(seatId, objective);
    }
    return objectives;
  } catch (err) {
    logError('readCampaignObjectives: could not parse stored value', { rawLength: raw.length }, err);
    return objectives;
  }
}

export function writeCampaignObjectiveForSeat(
  ops: Pick<GameConfigKvDbOps, 'getOne' | 'run'>,
  seatId: string,
  objective: CampaignObjective | null
): void {
  const all = readCampaignObjectives(ops);
  if (objective === null) all.delete(seatId);
  else all.set(seatId, objective);
  const record: Record<string, CampaignObjective> = {};
  for (const key of [...all.keys()].sort()) record[key] = all.get(key)!;
  logDebug('writeCampaignObjectiveForSeat', { seatId, cleared: objective === null, seatCount: all.size });
  upsertGameConfigValue(ops, CAMPAIGN_OBJECTIVES_CONFIG_KEY, JSON.stringify(record));
}
```

  Block notes:
  - `readCampaignObjectives`
    - Expected outcome: "Seat id to objective. Invalid entries are dropped. A missing row, which is what a save from before this row existed has, is an empty map."
    - Exceptions: "None. A parse error is logged and returns an empty map."
  - `writeCampaignObjectiveForSeat`
    - Expected outcome: "The row with this seat's entry replaced, or removed when `objective` is null. Other seats are kept."
    - Exceptions: "Propagates a database error."

- [x] **Step 2: Test the row.** Create `src/main/gameDb/campaignObjectiveMemory.test.ts`. Follow `gameConfigRows.test.ts` for imports and `withTempGameDb`.

```ts
test('campaign objectives round-trip per seat and tolerate a bad row', () => {
  withTempGameDb('aw-campaign-memory-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    const first = { targetH3: 'T1', stagingH3: 'S1', phase: 'assemble' as const, source: 'engine' as const, chosenTurn: 4 };
    const second = { targetH3: 'T2', stagingH3: null, phase: 'assault' as const, source: 'commander' as const, chosenTurn: 9 };
    writeCampaignObjectiveForSeat(ops, 'a1', first);
    writeCampaignObjectiveForSeat(ops, 'a2', second);
    assert.deepEqual(readCampaignObjectives(ops).get('a1'), first);
    assert.deepEqual(readCampaignObjectives(ops).get('a2'), second);
    writeCampaignObjectiveForSeat(ops, 'a1', null);
    assert.deepEqual([...readCampaignObjectives(ops).keys()], ['a2']);
    upsertGameConfigValue(ops, CAMPAIGN_OBJECTIVES_CONFIG_KEY, '{"a1":{"targetH3":7},"a2":{"targetH3":"T2","stagingH3":null,"phase":"assault","source":"commander","chosenTurn":9}}');
    assert.equal(readCampaignObjectives(ops).has('a1'), false);
    assert.deepEqual(readCampaignObjectives(ops).get('a2'), second);
    upsertGameConfigValue(ops, CAMPAIGN_OBJECTIVES_CONFIG_KEY, '{"a1":{"targetH3":"T","stagingH3":"","phase":"assemble","source":"engine","chosenTurn":1}}');
    assert.equal(readCampaignObjectives(ops).size, 0);
  });
});
```

- [x] **Step 3: A new match clears it.** In `src/main/gameDb/resetGame.ts`:
  - After `deleteGameConfigRow({ run }, SIGHT_CUE_SEEN_UNITS_CONFIG_KEY);`, add `deleteGameConfigRow({ run }, CAMPAIGN_OBJECTIVES_CONFIG_KEY);`.
  - Import the key from `./campaignObjectiveMemory`.
  - If the queue-pause key's delete line sits there too, put the new line after it.

- [x] **Step 4: The consult step.** Create `src/main/openRouter/campaignObjectiveFlow.ts`.
  - File header:
    - Purpose: "Turns a side's briefing snapshot into campaign inputs, refreshes the stored objective once per consult, and builds the plan that the briefing builders receive."
    - When to use: "`requestOrdersFlow.ts` before the strategic briefing, and the `campaignTarget` override."
  - Every export gets a full block.

```ts
import type { GameStateSnapshot } from '../gameDb';
import { dbGetOne, dbRun } from '../gameDb';
import { readCampaignObjectives, writeCampaignObjectiveForSeat } from '../gameDb/campaignObjectiveMemory';
import { briefingOwnSeatId, ownHomeHexes } from '../briefing/briefingPerspective';
import { getLandStepDistances, landUnitCanOccupyHex, type LandMassByH3 } from '../../shared/landTraversalStrategic';
import { isAiSeatId } from '../../shared/seatIds';
import type { CampaignObjective } from '../../shared/campaignTypes';
import { getStrategicLandMassByH3 } from '../terrainClassificationCache';
import { computeGridDistanceWithPathFallbackPure } from '../../shared/h3GridRangePure';
import { logDebug, logError, logTrace } from '../logger';
import {
  CAMPAIGN_REACH_LIMIT_STEPS,
  buildCampaignPlan,
  campaignWaypoint,
  knownCampaignCities,
  resolveCampaignObjective,
  type CampaignCity,
  type CampaignPlan,
  type CampaignUnitInput,
} from './campaignRules';

export interface CampaignStateInputs {
  readonly seatId: string;
  readonly groundUnits: readonly CampaignUnitInput[];
  readonly ownHomeHexes: ReadonlySet<string>;
  readonly enemyUnitHexes: readonly string[];
  readonly cities: readonly CampaignCity[];
  readonly ownControlledLandHexes: readonly string[];
  readonly hexSet: ReadonlySet<string>;
}

export function campaignInputsFromState(state: GameStateSnapshot, landMass: LandMassByH3): CampaignStateInputs {
  const seatId = briefingOwnSeatId(state);
  const activeEnemySeatIds = new Set(
    (state.seats ?? []).filter((seat) => seat.seatId !== seatId && seat.outTurn == null).map((seat) => seat.seatId as string)
  );
  const groundUnits = state.units
    .filter(
      (unit) =>
        unit.player === seatId &&
        (unit.unitType === 'infantry' || unit.unitType === 'armor') &&
        !unit.embarkedOnCarrierUnitId
    )
    .map((unit) => ({ id: unit.id, h3Index: unit.h3Index }));
  const enemyUnitHexes = state.units.filter((unit) => activeEnemySeatIds.has(unit.player)).map((unit) => unit.h3Index);
  const homeSeatByH3 = new Map<string, string>();
  const inSeveralHomes = new Set<string>();
  for (const enemySeatId of activeEnemySeatIds) {
    for (const h3Index of state.homeRegionHexesBySeat?.[enemySeatId] ?? []) {
      if (homeSeatByH3.has(h3Index)) inSeveralHomes.add(h3Index);
      homeSeatByH3.set(h3Index, enemySeatId);
    }
  }
  for (const h3Index of inSeveralHomes) homeSeatByH3.delete(h3Index);
  const controllerByH3 = new Map((state.strategicControl ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));
  const explored = new Set(state.exploredHexes ?? state.hexes.map((hex) => hex.h3Index));
  const cities = knownCampaignCities({
    activeEnemySeatIds,
    infrastructure: state.strategicInfrastructure ?? [],
    controllerByH3,
    explored,
    homeSeatByH3,
  });
  const ownControlledLandHexes = (state.strategicControl ?? [])
    .filter((row) => row.controllerPlayerId === seatId && landUnitCanOccupyHex(row.h3Index, landMass))
    .map((row) => row.h3Index);
  logTrace('campaignObjectiveFlow campaignInputsFromState', {
    seatId,
    groundUnitCount: groundUnits.length,
    cityCount: cities.length,
  });
  return {
    seatId,
    groundUnits,
    ownHomeHexes: new Set(ownHomeHexes(state)),
    enemyUnitHexes,
    cities,
    ownControlledLandHexes,
    hexSet: new Set(state.hexes.map((hex) => hex.h3Index)),
  };
}

export function loadCampaignLandMass(seatId: string): LandMassByH3 | null {
  try {
    return getStrategicLandMassByH3();
  } catch (err) {
    logError('campaignObjectiveFlow: terrain cache unavailable; no campaign this consult', { seatId }, err);
    return null;
  }
}

export function campaignLandSteps(
  inputs: CampaignStateInputs,
  landMass: LandMassByH3,
  originH3s: readonly string[]
): Map<string, number> {
  return getLandStepDistances({ originH3s, hexSet: inputs.hexSet, data: landMass, maxDepth: CAMPAIGN_REACH_LIMIT_STEPS });
}

export function resolveCampaignObjectiveForSeat(state: GameStateSnapshot): CampaignObjective | null {
  if (state.scenarioId !== 'region_vs_region') return null;
  const seatId = briefingOwnSeatId(state);
  const landMass = loadCampaignLandMass(seatId);
  if (landMass === null) return null;
  const inputs = campaignInputsFromState(state, landMass);
  const ops = { getOne: dbGetOne, run: dbRun };
  const stored = readCampaignObjectives(ops).get(seatId) ?? null;
  const groundUnitHexes = inputs.groundUnits.map((unit) => unit.h3Index);
  const next = resolveCampaignObjective({
    stored,
    turnNumber: state.turnNumber,
    cities: inputs.cities,
    landStepsFromForce: campaignLandSteps(inputs, landMass, groundUnitHexes),
    ownControlledLandHexes: inputs.ownControlledLandHexes,
    landStepsFromTarget: (targetH3) => campaignLandSteps(inputs, landMass, [targetH3]),
    groundUnitHexes,
    hopDistance: computeGridDistanceWithPathFallbackPure,
  });
  writeCampaignObjectiveForSeat(ops, seatId, next);
  logDebug('campaignObjectiveFlow resolveCampaignObjectiveForSeat', {
    seatId,
    turnNumber: state.turnNumber,
    storedTarget: stored?.targetH3 ?? null,
    target: next?.targetH3 ?? null,
    staging: next?.stagingH3 ?? null,
    phase: next?.phase ?? null,
  });
  return next;
}

export function campaignPlanForState(state: GameStateSnapshot): CampaignPlan | null {
  if (state.scenarioId !== 'region_vs_region') return null;
  if (!state.playerPerspective || !isAiSeatId(state.playerPerspective)) return null;
  const seatId = briefingOwnSeatId(state);
  const objective = readCampaignObjectives({ getOne: dbGetOne }).get(seatId) ?? null;
  if (objective === null) return null;
  const landMass = loadCampaignLandMass(seatId);
  if (landMass === null) return null;
  const inputs = campaignInputsFromState(state, landMass);
  if (!inputs.hexSet.has(objective.targetH3)) return null;
  const plan = buildCampaignPlan({
    objective,
    groundUnits: inputs.groundUnits,
    ownHomeHexes: inputs.ownHomeHexes,
    enemyUnitHexes: inputs.enemyUnitHexes,
    landStepsFromWaypoint: campaignLandSteps(inputs, landMass, [campaignWaypoint(objective)]),
    hopDistance: computeGridDistanceWithPathFallbackPure,
  });
  logDebug('campaignObjectiveFlow campaignPlanForState', {
    seatId,
    waypoint: plan.waypointH3,
    campaignUnitCount: plan.campaignUnitIds.size,
  });
  return plan;
}
```

  Block notes:
  - `loadCampaignLandMass`
    - Expected outcome: "The terrain cache's land-mass records, or null after logging when the cache cannot be loaded."
  - `campaignLandSteps`
    - Expected outcome: "Land steps from the origins up to `CAMPAIGN_REACH_LIMIT_STEPS`. That depth is required: a kept target 13 to 30 steps away must still be in the map. Pass `computeGridDistanceWithPathFallbackPure` as `hopDistance` everywhere this flow measures pairs. `gridHopDistanceBetween` logs once per pair and returns that same result."
  - `campaignInputsFromState`
    - Expected outcome: "Ground units are the seat's infantry and armor that are not aboard a carrier. Enemy units are visible units of active enemy seats. Cities follow `knownCampaignCities`. A hex in more than one enemy home has no assumed owner."
  - `resolveCampaignObjectiveForSeat`
    - Expected outcome: "Outside `region_vs_region`, or when the terrain cache is missing, null and nothing written. Otherwise the resolved objective, also written for the seat; null clears the seat's entry."
  - `campaignPlanForState`
    - Expected outcome: "Null unless the snapshot belongs to an AI seat with a stored objective whose target is on this map."
    - Exceptions: "Propagates a database error, which only happens when no match is open."
  - If TypeScript rejects `seat.seatId as string` or `seat.outTurn`, read the seat fields the same way `enemyHomeHexes` in `src/main/briefing/briefingPerspective.ts` does.

- [x] **Step 5: Call it once per strategic consult.** In `src/main/openRouter/requestOrdersFlow.ts`:
  - Import `resolveCampaignObjectiveForSeat` from `./campaignObjectiveFlow`.
  - Inside `if (!tacticalBattle) {`, right after `expireAndUpdateStatus(seatId, planState);`, add:

```ts
    if (flags.ordersEnabled) resolveCampaignObjectiveForSeat(planState);
```

  Phase 3 replaces this line with one that also keeps the plan.

- [x] **Step 6: The ready trigger.** Do not add a parameter to `evaluateMandatoryOverrides`. It already has seven, and the attack-mix block sits between the deadman check and the return.
  1. Add a member `{ type: 'campaign_ready' }` to `MandatoryOverrideResult` in `src/main/callbackEvaluation.ts`, documented in the same style as the `first_consultation` member.
     - Contract: "The stored campaign is assembling and enough ground units stand near its staging hex."
     - When to use: "After resolution, so the next consult can start the assault."
  2. In `src/main/openRouter/afterResolution.ts`, after `evaluateMandatoryOverrides` and before `computePostResolutionConsultTriggers`, push the reason onto `mandatoryFired` only when all of these hold:
     - `getToolFlags(deps.enabledToolNames).ordersEnabled`
     - `state.scenarioId === 'region_vs_region'`
     - a stored objective for `seatId` for which `campaignAssaultReady` is true
  3. Ground units are that seat's infantry and armor that are not embarked. Pass `computeGridDistanceWithPathFallbackPure` as `hopDistance`.
  4. When orders are off, do not push the reason. The phase only advances on an orders-enabled consult, so a stored assemble row would otherwise consult on every later resolution.
  5. `callbackEvaluation.ts` is over 600 lines; add only the union member. Import `getToolFlags` from the module `afterResolution` already uses for tool flags, or from `./openRouterToolGroups` if it does not.

- [x] **Step 7: Docs.**
  - `doc/save-files.md`, in the paragraph that lists match rows that stay in the file, add: "The match row `campaign_objectives` stays in the file too. A missing row reads as no campaign (`readCampaignObjectives`), so the next strategic consult picks one."
  - `doc/naming-conventions-contract-v1.md`: add `'campaign_objectives'` to the `game_config` keys row, after the last key there.
  - `doc/hybrid-ai.md`, the mandatory overrides list (`evaluateMandatoryOverrides`): add `campaign_ready`, described as "an assembling campaign has enough ground units near its staging hex".

- [x] **Step 8: Ready and overlap tests.**
  - In `callbackEvaluation.test.ts`, with `withTempGameDb`, store an assemble objective whose staging hex has enough ground units within `CAMPAIGN_MASS_RADIUS`. Call the same helper `afterResolution` uses, or call `campaignAssaultReady` through a small exported function `campaignReadyOverride(state, seatId)` in `afterResolution.ts` if the runner itself cannot be called without a model. Assert the result type is `campaign_ready`. An assault objective, and the same assemble objective when the helper is told orders are off, returns null.
  - Add `src/main/openRouter/campaignObjectiveFlow.test.ts`. Build a snapshot by hand. Two active enemy homes both contain `h1`. `campaignInputsFromState` does not return a city for `h1`. Pass a `LandMassByH3` that marks the controlled hexes occupiable.

- [x] **Step 9: Verify.**

```powershell
npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run rebuild:native:node; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/gameDb/campaignObjectiveMemory.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/campaignRules.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/openRouter/campaignObjectiveFlow.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node dist/main/callbackEvaluation.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run check:circular
```

  Expected:
  - All pass.
  - No new cycle. If `check:circular` reports a cycle through `campaignObjectiveFlow.ts`, stop and report it; do not reshuffle imports to hide it.
  - `EXPECTED_USER_VERSION` in `src/main/gameDb.ts` is unchanged.

---

## Phase 3: Point Suggestions and Best Options at the Campaign

The consult builds the plan once and passes it to the suggestion and Best Options builders. Campaign units get the campaign hex as their Suggested Destination and `advance` rows. Nothing else changes yet.

**Files:**
- `src/main/openRouter/possibleUnitActionsTableAssembly.ts`, `src/main/openRouter/possibleUnitActionsBestOptionsInterest.ts`, and `src/main/openRouter/possibleUnitActions.ts`
- `src/main/briefing/map/briefingMapSection.ts`, `src/main/tools/orderlessUnitSuggestions.ts`, `src/main/tools/standingOrdersInjectionText.ts`, and `src/main/briefingFormatter.ts`
- `src/main/openRouter/requestOrdersInjection.ts`, `src/main/openRouter/consultPromptParts.ts`, and `src/main/openRouter/requestOrdersFlow.ts`
- Create `src/main/openRouter/possibleUnitActionsCampaign.test.ts`. Edit `src/main/tools/orderlessUnitSuggestions.test.ts`.

**Produces:** `ACTION_ADVANCE`, and an optional `campaignPlan` argument on each builder named below.

- [x] **Step 1: The action label.** In `possibleUnitActionsTableAssembly.ts`:
  1. After `ACTION_APPROACH`, add the following, with a block. Purpose: "A one-step move toward the campaign hex, kept apart from approach rows, which close on the nearest enemy."

```ts
export const ACTION_ADVANCE = 'advance';
```

  2. In `urbanCountForRowPriority`, treat `ACTION_ADVANCE` like `ACTION_APPROACH` (return 0), and update its Expected outcome.
  3. In `ACTION_TYPE_ORDER`, add `[ACTION_ADVANCE]: 0,` after the approach entry.
  4. In `canonicalBestOptionsAction`, add `if (token === ACTION_ADVANCE) return 'advance';` after the approach line.
  5. Grep `src/main` for `ACTION_APPROACH`. Every other use that treats approach as a one-step move must treat advance the same way. The known one is `ONE_STEP_MOVE_LABELS` in `orderlessUnitSuggestions.ts` (Step 5).

- [x] **Step 2: The move filter.** In `possibleUnitActionsBestOptionsInterest.ts`:
  1. Import `ACTION_ADVANCE` beside the other labels.
  2. Add a field to the `applyInterestOrApproach` argument type, with this block:
     - Contract: "Set only for a campaign unit on a strategic this-turn table. Omitted in battle."
     - When to use: "From `campaignRoleForUnit`."
     - Expected outcome: "Enemy contact still wins. Otherwise a holding unit gets no move hexes. Any other campaign unit gets uncontrolled cities on a closing step as move/melee, else its closing steps as advance, else no move hexes. It never falls back to closing on the nearest enemy."

```ts
  campaign?: { readonly waypointH3: string; readonly hold: boolean };
```

  3. Move the code that builds the `occupied` set inside the approach branch into a private helper, `occupiedForApproach(args)`, that returns the same set. Both branches use it.
  4. Change the branch structure to:

```ts
  if (hasEnemyContact) {
    result = { hexes: args.interest, actionType: ACTION_MOVES_MELEE };
  } else if (args.campaign) {
    result = campaignMoveResult(args, args.campaign);
  } else {
    // the existing approach code, now calling occupiedForApproach(args)
  }
```

  5. Add the private helper, with a block:

```ts
function campaignMoveResult(
  args: Parameters<typeof applyInterestOrApproach>[0],
  campaign: { readonly waypointH3: string; readonly hold: boolean }
): { hexes: string[]; actionType: string; enemySummaryOverride?: string } {
  if (campaign.hold) return { hexes: [], actionType: ACTION_ADVANCE };
  const occupied = occupiedForApproach(args);
  const candidates = args.legalHexes.filter(
    (h3) => !occupied.has(h3) || (h3 === campaign.waypointH3 && !args.enemyOccupiedH3.has(h3))
  );
  const closing = pickApproachHexesTowardNearestEnemy(args.unitH3, candidates, new Set([campaign.waypointH3]));
  const grabs = args.interest.filter((h3) => closing.includes(h3));
  if (grabs.length > 0) return { hexes: grabs, actionType: ACTION_MOVES_MELEE };
  return { hexes: closing, actionType: ACTION_ADVANCE, enemySummaryOverride: '—' };
}
```

     Passing the waypoint as the only "enemy" hex reuses the shared closing rule: a step must strictly reduce the hop distance to it. A friendly-held waypoint stays a legal step, because units gather there.
  6. Add `campaign: Boolean(args.campaign)` to the existing `logTrace` call. Update the file header's Expected outcome to mention advance rows.

- [x] **Step 3: The row collector.** In `possibleUnitActions.ts`, `collectAggregatedPossibleActionRows`:
  1. Add an optional argument with a full block:
     - Contract: "The consult's campaign plan. Omitted or null means today's rows."
     - When to use: "Strategic briefing builders."

```ts
  campaignPlan?: CampaignPlan | null;
```

  2. In the strategic (`else`) branch of the ground-move filter, where `applyInterestOrApproach` is called with `stayPutFriendlyH3`, add the role:

```ts
        const campaignRole = campaignRoleForUnit(args.campaignPlan, unit.id);
        const resolved = applyInterestOrApproach({
          unitH3: unit.h3Index,
          legalHexes: moveHexes,
          interest: filterGroundMoveHexesForThisTurnOptionsTable(indexed, moveHexes),
          enemyOccupiedH3: strategicEnemyOccupiedH3,
          indexed,
          stayPutFriendlyH3,
          ...(campaignRole ? { campaign: campaignRole } : {}),
        });
```

  3. Do not pass anything in the tactical branch.
  4. Import `campaignRoleForUnit` and `type CampaignPlan` from `./campaignRules`.
  5. The other caller in this file (around line 576) passes its `args` through, so it needs no change.
  6. The file is at 599 lines; these few added lines are allowed. Do not split it.

- [x] **Step 4: The strategic map section.** In `src/main/briefing/map/briefingMapSection.ts`:
  - Add `campaignPlan?: CampaignPlan | null` to the `buildStrategicOperationalMapSectionMarkdown` argument type, with a block.
  - Pass it to the strategic `collectAggregatedPossibleActionRows` call (around line 105). Leave the tactical call (around line 288) alone.

- [x] **Step 5: Suggested destinations.** In `src/main/tools/orderlessUnitSuggestions.ts`:
  1. Add `ACTION_ADVANCE` to `ONE_STEP_MOVE_LABELS` and to the import.
  2. `collectOrderlessMissionContext`: add `campaignPlan?: CampaignPlan | null` to its argument object, with a block. Pass it to the first `collectAggregatedPossibleActionRows` call and as `{ campaignPlan }` on `suggestApproachDestinationsForOrderlessUnits`.
  3. `suggestApproachDestinationsForOrderlessUnits`: add a trailing options object `{ readonly campaignPlan?: CampaignPlan | null }` as the last parameter, and update its block. Do not add a bare sixth positional value; the function already has five parameters, and a plan can be confused with `airStrikeUnitIds`. Then change the loop body so a campaign unit takes its campaign order whenever it has no contact step:

```ts
    const campaignOrder = campaignOrderFor(campaignPlan ?? null, { id: unit.id, h3Index: unit.h3Index });
    let suggestion: OrderlessMissionSuggestion | null = null;
    if (standingOrderTypeRejectionReason(unit.unitType, 'march') !== null) {
      if (unit.unitType === 'air') {
        suggestion = { orderType: 'defend', destinationH3: unit.h3Index };
      }
    } else if (enemyVisible) {
      const legal = getValidDestinations(unit, state).filter((h3) => h3 !== unit.h3Index);
      const contact = legal.filter((h3) => enemyOccupiedH3.has(h3));
      const contactDestination = bestClosingDestination(unit.h3Index, contact, enemyOccupiedH3);
      if (contactDestination !== null) {
        suggestion = { orderType: 'march', destinationH3: contactDestination };
      } else if (campaignOrder !== null) {
        suggestion = campaignOrder;
      } else {
        const approach = legal.filter((h3) => !enemyOccupiedH3.has(h3) && !stayPut.has(h3));
        const destination = bestClosingDestination(unit.h3Index, approach, enemyOccupiedH3);
        if (destination !== null) suggestion = { orderType: 'march', destinationH3: destination };
      }
    } else if (campaignOrder !== null) {
      suggestion = campaignOrder;
    } else {
      // the existing nearestEnemyHomeMarchHex branch, unchanged
    }
```

     Without a plan this is exactly today's logic: contact first, then approach, then the blind march.
  4. Add `campaign: campaignOrder !== null` to the per-unit `logTrace`.
  5. Update the `OrderlessMissionSuggestion` field blocks. `defend` is now also a holding campaign unit on its own hex, not only an air unit.
  6. Update the file header's Purpose with one sentence: campaign units take the campaign order.
  7. Import `campaignOrderFor` and `type CampaignPlan` from `../openRouter/campaignRules`.

- [x] **Step 6: Standing-order section.** In `src/main/tools/standingOrdersInjectionText.ts`, `getInjectionText`:
  - Add a fourth parameter, `campaignPlan?: CampaignPlan | null`, documented.
  - Pass it into its `collectOrderlessMissionContext` call as `campaignPlan`.

- [x] **Step 7: Injection texts.** In `src/main/openRouter/requestOrdersInjection.ts`, `buildStatusInjectionTexts`:
  - Add `readonly campaignPlan?: CampaignPlan | null;` to `StatusInjectionArgs`, with a block.
  - Pass `args.campaignPlan ?? null` as the fourth argument of the `getStandingOrderInjectionText(seatId, args.state, args.coordinateContext)` call. That alias is the standing-order `getInjectionText`, re-exported by `../tools/standingOrders`. The memory `getInjectionText` is a different function.
  - If the re-export in `src/main/tools/standingOrders.ts` names its parameters, keep it a plain re-export so the new parameter passes through.

- [x] **Step 8: The precomputed briefing.** In `src/main/briefingFormatter.ts`:
  - Add `campaignPlan?: CampaignPlan | null` to `FormatBriefingSharedContext`, with a block.
  - In `formatBriefing`, pass `campaignPlan: sharedContext?.campaignPlan ?? null` to both `collectOrderlessMissionContext` and `buildStrategicOperationalMapSectionMarkdown`.

- [x] **Step 9: The no-briefing path.** In `src/main/openRouter/consultPromptParts.ts`, `buildConsultPromptParts`:
  - Add `readonly campaignPlan?: CampaignPlan | null;` to the input type, with a block.
  - Pass `campaignPlan: input.campaignPlan ?? null` to its `buildStatusInjectionTexts` call.

- [x] **Step 10: The consult.** In `src/main/openRouter/requestOrdersFlow.ts`:
  1. Declare `let campaignPlan: CampaignPlan | null = null;` beside `let productionAttention`.
  2. Replace the Phase 2 line with:

```ts
    if (flags.ordersEnabled) {
      resolveCampaignObjectiveForSeat(planState);
      campaignPlan = campaignPlanForState(planState);
    }
```

  3. Pass `campaignPlan` in three places:
     - the `buildStatusInjectionTexts` call
     - the `formatBriefing` shared-context object
     - the `buildConsultPromptParts` call
  4. Import `campaignPlanForState` and `type CampaignPlan`.

- [x] **Step 11: Tests.**
  1. Create `src/main/openRouter/possibleUnitActionsCampaign.test.ts` (`node:test`, usual header).
     - Use `withTempGameDb` and `getGameStateForPlayer(AI_SEAT_IDS[0], { maskUnexploredTerrain: false })`.
     - Build `latLngByH3` with `buildLatLngCoordinateMap(state.hexes.map((hex) => hex.h3Index))` from `../mapData`.
     - Call `ensureStrategicCoordinateRegistryInitialized()` first.
     - Scan the seat's ground units. Pick the first unit that has a legal step strictly closer, by `computeGridDistanceWithPathFallbackPure`, to some land hex at least two hops away. That land hex is the waypoint. Fail only when no ground unit has such a step.
     - Build a plan by hand:

```ts
const plan = (hold: boolean): CampaignPlan => ({
  objective: { targetH3: waypoint, stagingH3: null, phase: 'assault', source: 'engine', chosenTurn: state.turnNumber },
  waypointH3: waypoint,
  campaignUnitIds: new Set([unit.id]),
  holdUnitIds: new Set(hold ? [unit.id] : []),
  defenderUnitIds: [],
  massedCount: 0,
  threshold: 1,
});
```

     Four tests:
     1. **`a campaign unit gets advance rows that close on the campaign hex`**
        - With `plan(false)`, the unit has at least one row whose `actionTypes` includes `advance`.
        - Every such row's `targetH3` is strictly closer, by `computeGridDistanceWithPathFallbackPure`, to the waypoint than the unit is.
     2. **`a visible enemy six hops away does not redirect a campaign unit`**
        - Copy the state and add an active enemy infantry unit on a hex six hops from the campaign unit. That hex must not be one of the unit's legal steps.
        - `collectAggregatedPossibleActionRows` reads `state.units`.
        - The campaign unit still has `advance` rows, and none of its rows use that enemy hex.
     3. **`a holding campaign unit gets no move row`**
        - With `plan(true)`, the unit has no row whose `actionTypes` includes `advance` or `approach`.
     4. **`without a plan no row is labeled advance`**
        - With no `campaignPlan`, no row in the whole table has `advance`.

     Call `collectAggregatedPossibleActionRows({ state, latLngByH3, formatLatLng: (ll) => formatLatLng(ll, LATLNG_DECIMAL_PLACES), forThisTurnOptionsTable: true, campaignPlan })`, importing `formatLatLng` from `./promptText` and `LATLNG_DECIMAL_PLACES` from `../mapData`.

  2. In `src/main/tools/orderlessUnitSuggestions.test.ts`, add **`a campaign unit is told to march to the campaign hex, or to defend where it is when it holds`**.
     - Use the same fixture style as that file.
     - Call `suggestApproachDestinationsForOrderlessUnits(seat, state, [unit.id], new Map(), undefined, { campaignPlan: plan })`.
     - Expect `{ orderType: 'march', destinationH3: waypoint }`, unless the unit has an enemy-occupied legal step. In that case, pick another unit.
     - With hold, expect `{ orderType: 'defend', destinationH3: unit.h3Index }`.
     - Add an active enemy unit six hops away that is not a legal step. The suggestion stays the campaign hex.
     - A unit not in the plan gets exactly what it gets with no plan.

- [x] **Step 12: Verify.** Run the prompt test sweep (Test Commands).
  - Expected: every test passes, including the existing ones, because every builder without a plan behaves as before.
  - Then run `npm run check:circular`. Expected: no new cycle. The `tools` files import only the type and the two pure functions from `campaignRules.ts`.

---

## Phase 4: Show the Campaign in the Briefing and Explain It

The situation message shows the objective, a Campaign Orders table, and an attention bullet. The system prompt explains the campaign and the `advance` rows.

**Files:**
- Create `src/main/openRouter/briefingSectionsCampaign.ts`, `src/main/openRouter/briefingSectionsCampaign.test.ts`, and `src/main/openRouter/promptSpec/campaignRuleText.ts`.
- Edit:
  - `src/main/openRouter/promptSpec/sectionHeadings.ts`
  - `src/main/tools/standingOrdersInjectionText.ts` and `src/main/tools/standingOrdersInjectionMission.test.ts`
  - `src/main/openRouter/requestOrdersInjection.ts`, `src/main/briefingFormatter.ts`, `src/main/openRouter/consultPromptParts.ts`, and `src/main/openRouter/requestOrdersFlow.ts`
  - `src/main/openRouter/promptSpec/coachingGates.ts`, `src/main/openRouter/promptSpec/coachingTextStrategic.ts`, `src/main/openRouter/promptSpec/optionCopyText.ts`, `src/main/openRouter/promptText.ts`, and `src/main/openRouter/promptSpec/consultationText.ts`
- Docs named in Step 10.

**Produces:**
- `SECTION_TITLE_CAMPAIGN_OBJECTIVE`, `SECTION_TITLE_CAMPAIGN_ORDERS`, `SECTION_TITLE_CAMPAIGN`
- `buildCampaignObjectiveSection`, `CampaignOrderRow`, `buildCampaignOrderRows`, `formatCampaignAttentionBullet`, `buildCampaignRuleBlock`
- The `campaignEnabled` coaching gate, and the `campaignText` and `campaignAttention` injection fields

- [x] **Step 1: Titles.** In `sectionHeadings.ts`, add three constants in the existing style, each with a block:
  - `SECTION_TITLE_CAMPAIGN_OBJECTIVE = 'Campaign Objective'`
  - `SECTION_TITLE_CAMPAIGN_ORDERS = 'Campaign Orders'`
  - `SECTION_TITLE_CAMPAIGN = 'Campaign'`
  - If `sectionHeadings.test.ts` checks that titles are unique or listed, add these to its list.

- [x] **Step 2: The objective section.** Create `briefingSectionsCampaign.ts`.
  - File header Purpose: "Names the campaign target, staging hex, phase, and home defenders in the situation message."
  - Every export gets a full block.

```ts
import type { GameStateSnapshot } from '../gameDb';
import { briefingOwnSeatId } from '../briefing/briefingPerspective';
import { CAMPAIGN_HOME_DEFENSE_RADIUS, CAMPAIGN_MASS_RADIUS, type CampaignPlan } from './campaignRules';
import { SECTION_TITLE_CAMPAIGN_OBJECTIVE, topLevelHeading } from './promptSpec/sectionHeadings';
import { logTrace } from '../logger';

function targetOwnerName(state: GameStateSnapshot, targetH3: string): string | null {
  const explored = new Set(state.exploredHexes ?? []);
  const activeEnemySeatIds = new Set(
    (state.seats ?? []).filter((seat) => seat.seatId !== briefingOwnSeatId(state) && seat.outTurn == null).map((seat) => seat.seatId)
  );
  let ownerSeatId: string | null = null;
  if (explored.has(targetH3)) {
    ownerSeatId = (state.strategicControl ?? []).find((row) => row.h3Index === targetH3)?.controllerPlayerId ?? null;
  } else {
    const homes = [...activeEnemySeatIds].filter((seatId) => (state.homeRegionHexesBySeat?.[seatId] ?? []).includes(targetH3));
    ownerSeatId = homes.length === 1 ? homes[0]! : null;
  }
  const seat = (state.seats ?? []).find((row) => row.seatId === ownerSeatId);
  return seat?.homeRegion ?? null;
}

function fortificationPhrase(state: GameStateSnapshot, targetH3: string): string {
  const explored = new Set(state.exploredHexes ?? state.hexes.map((hex) => hex.h3Index));
  const fortified = explored.has(targetH3)
    ? Math.max(0, Math.trunc((state.strategicInfrastructure ?? []).find((row) => row.h3Index === targetH3)?.fortifiedCount ?? 0))
    : 0;
  if (fortified === 0) return 'no known fortifications';
  return fortified === 1 ? '1 known fortified cell' : `${fortified} known fortified cells`;
}

export function buildCampaignObjectiveSection(args: {
  readonly state: GameStateSnapshot;
  readonly plan: CampaignPlan;
  readonly format: (h3Index: string) => string;
}): string {
  const { state, plan, format } = args;
  const objective = plan.objective;
  const target = format(objective.targetH3);
  const urban = (state.strategicInfrastructure ?? []).find((row) => row.h3Index === objective.targetH3)?.urbanHexCount ?? 0;
  const owner = targetOwnerName(state, objective.targetH3);
  const cityNoun = owner ? `a ${owner} city` : 'an enemy city';
  const cellNoun = urban === 1 ? 'city cell' : 'city cells';
  const chooser = objective.source === 'commander' ? 'You chose' : 'The engine chose';
  const lines: string[] = [
    topLevelHeading(SECTION_TITLE_CAMPAIGN_OBJECTIVE),
    '',
    `- Target: ${target}, ${cityNoun} with ${urban} ${cellNoun} and ${fortificationPhrase(state, objective.targetH3)}. ${chooser} it on turn ${objective.chosenTurn}.`,
  ];
  if (objective.stagingH3 === null) {
    lines.push(`- Staging hex: none. No hex you control is far enough from ${target}, so campaign units march on it directly.`);
    lines.push(`- Phase: assault. There is no staging hex, so the assault continues until ${target} is taken.`);
  } else {
    const staging = format(objective.stagingH3);
    lines.push(`- Staging hex: ${staging}.`);
    if (objective.phase === 'assemble') {
      const verb = plan.massedCount === 1 ? 'is' : 'are';
      lines.push(
        `- Phase: assemble. ${plan.massedCount} of ${plan.threshold} ground units ${verb} within ${CAMPAIGN_MASS_RADIUS} hexes of ${staging}. The assault starts when ${plan.threshold} are.`
      );
    } else {
      const noun = plan.massedCount === 1 ? 'ground unit is' : 'ground units are';
      lines.push(
        `- Phase: assault. ${plan.massedCount} ${noun} within ${CAMPAIGN_MASS_RADIUS} hexes of ${staging} or ${target}. The campaign falls back to assemble below ${Math.ceil(plan.threshold / 2)}.`
      );
    }
  }
  if (plan.defenderUnitIds.length > 0) {
    lines.push(
      `- Home defenders: ${plan.defenderUnitIds.join(', ')}. Each has an enemy unit within ${CAMPAIGN_HOME_DEFENSE_RADIUS} hexes, so it stays home.`
    );
  }
  logTrace('briefingSectionsCampaign buildCampaignObjectiveSection', { target, phase: objective.phase });
  return lines.join('\n');
}
```

  Notes:
  - The section is H1 when it stands alone. `formatBriefing` shifts it to H2.
  - `targetOwnerName` applies the same fog rule as `knownCampaignCities`.

- [x] **Step 3: Campaign Orders.** In `standingOrdersInjectionText.ts`:
  1. Add an exported interface and builder, each with a full block.

```ts
export interface CampaignOrderRow {
  readonly unitId: string;
  readonly unitType: string;
  readonly currentOrder: string;
  readonly campaignOrder: string;
}

export function buildCampaignOrderRows(args: {
  readonly playerId: string;
  readonly state: GameStateSnapshot;
  readonly plan: CampaignPlan;
  readonly coordinateContext: CoordinateContext;
}): CampaignOrderRow[] {
  const rows = dbGetAll<StandingOrderRow>('SELECT * FROM standing_orders WHERE player_id = ? ORDER BY unit_id', [
    args.playerId,
  ]);
  const { resolveToH3 } = buildLatLngCoordinateMap(args.state.hexes.map((hex) => hex.h3Index));
  const unitsById = new Map(args.state.units.map((unit) => [unit.id, unit]));
  const result: CampaignOrderRow[] = [];
  for (const row of rows) {
    const unit = unitsById.get(row.unit_id);
    if (!unit) continue;
    const desired = campaignOrderFor(args.plan, { id: unit.id, h3Index: unit.h3Index });
    if (desired === null) continue;
    const params = parseOrderParams(row);
    const stored = row.order_type === 'march' ? params.destination : row.order_type === 'defend' ? params.defendHex : undefined;
    const storedH3 =
      Array.isArray(stored) && stored.length >= 2 ? resolveToH3(Number(stored[0]), Number(stored[1])) : undefined;
    if (row.order_type === desired.orderType && storedH3 === desired.destinationH3) continue;
    const currentTarget =
      storedH3 !== undefined
        ? ` ${h3ToBriefingHexDisplay(storedH3, args.coordinateContext)}`
        : row.order_type === 'pursue' && params.targetUnitId
          ? ` ${String(params.targetUnitId)}`
          : '';
    result.push({
      unitId: unit.id,
      unitType: unit.unitType,
      currentOrder: `${row.order_type}${currentTarget}`,
      campaignOrder: `${desired.orderType} ${h3ToBriefingHexDisplay(desired.destinationH3, args.coordinateContext)}`,
    });
  }
  logTrace('standingOrders buildCampaignOrderRows', { playerId: args.playerId, rowCount: result.length });
  return result;
}
```

     - `parseOrderParams`, `StandingOrderRow`, `h3ToBriefingHexDisplay`, `buildLatLngCoordinateMap`, and `dbGetAll` are the helpers `getInjectionText` and `toStandingOrderPromptRow` already use; import them the same way.
     - Import `campaignOrderFor` and `type CampaignPlan` from `../openRouter/campaignRules`.
     - If `parseOrderParams` returns a type where `params.destination` needs a cast, cast it the way `toStandingOrderPromptRow` does.
     - Do not write a second decoder.
     - It reads the rows as they are. Callers run it after `expireAndUpdateStatus`, so finished marches are already gone. In `buildStatusInjectionTexts`, compute the attention count after the standing-order `getInjectionText` call.
  2. In `getInjectionText`, after the Units Without Standing Orders table and only when `campaignPlan` is set, append:

```ts
  if (campaignPlan) {
    const campaignRows = buildCampaignOrderRows({ playerId, state, plan: campaignPlan, coordinateContext: ctx });
    lines.push('');
    lines.push(subHeading(SECTION_TITLE_CAMPAIGN_ORDERS));
    lines.push('');
    lines.push(
      ...buildPromptTableLines(
        ['Unit ID', 'Unit Type', 'Current Order', 'Campaign Order'],
        campaignRows.map((row) => [row.unitId, row.unitType, row.currentOrder, row.campaignOrder]),
        ['—', '—', '—', '—']
      )
    );
  }
```

  3. Units with no standing order never appear here. Their Suggested Destination already names the same order (Phase 3).

- [x] **Step 4: Injection fields.** In `requestOrdersInjection.ts`:
  1. Add two fields to `StatusInjectionTexts`, each with a block:
     - `readonly campaignText: string;`: "The Campaign Objective section, or empty when there is no plan."
     - `readonly campaignAttention: string | null;`: "The campaign attention bullet, or null when no campaign unit needs a new order."
  2. Add an exported formatter with a block:

```ts
export function formatCampaignAttentionBullet(count: number): string | null {
  if (count <= 0) return null;
  const subject = count === 1 ? '1 unit needs' : `${count} units need`;
  return `Campaign: ${subject} a new standing order. Copy each Campaign Orders row into an assign_order entry.`;
}
```

  3. In `buildStatusInjectionTexts`, when `args.campaignPlan` is set, strategic, and `args.ordersEnabled`:
     - `campaignText` is `buildCampaignObjectiveSection({ state: args.state, plan: args.campaignPlan, format })`, where `format` is `(h3) => { const ll = args.latLngByH3.get(h3); return ll ? args.formatHexLabel(ll) : h3; }`.
     - `campaignAttention` is `formatCampaignAttentionBullet(buildCampaignOrderRows({ playerId: seatId, state: args.state, plan: args.campaignPlan, coordinateContext: { mode: 'strategic' } }).length)`.
     - Otherwise `''` and `null`. Add both fields to the object the function returns. Compute `campaignAttention` after the `getStandingOrderInjectionText` call, which runs `expireAndUpdateStatus`.
     - Import `buildCampaignOrderRows` from `../tools/standingOrdersInjectionText` and `buildCampaignObjectiveSection` from `./briefingSectionsCampaign`.
  4. If the TypeScript build names another place that builds a `StatusInjectionTexts` object, add `campaignText: ''` and `campaignAttention: null` there. One is the attention-supplied branch in `consultPromptParts.ts`. Use `campaignAttention: input.campaignAttention ?? null` there (Step 6).

- [x] **Step 5: The precomputed briefing.** In `briefingFormatter.ts`:
  1. Add `campaignText?: string` and `campaignAttention?: string | null` to `FormatBriefingSharedContext`, with blocks.
  2. Right after the operational map push (`sections.push('\n\n' + operational.trim());`) and before Supplemental Hex Intelligence, add:

```ts
  const campaignText = sharedContext?.campaignText ?? '';
  if (campaignText.trim().length > 0) {
    sections.push('\n\n' + shiftMarkdownHeadings(campaignText.trim(), 1));
  }
```

  3. Wrap the attention-flag expression one more level so the campaign bullet comes last:

```ts
    appendProductionAttentionBullet(
      appendProductionAttentionBullet(
        appendProductionAttentionBullet(
          buildAttentionFlags(precomputed.unitAssessments, 'strategic', standingOrdersActive, orderlessAction, airStrikeRowUnitIds),
          sharedContext?.productionAttention ?? null
        ),
        sharedContext?.pausedProductionAttention ?? null
      ),
      sharedContext?.campaignAttention ?? null
    )
```

  4. `appendProductionAttentionBullet` is generic. Add one sentence to its Purpose in `productionAttention.ts`: it also appends the campaign bullet.

- [x] **Step 6: Prompt parts and the consult.**
  1. **`consultPromptParts.ts`.**
     - Add `readonly campaignAttention?: string | null;` to the input, with a block.
     - In the attention-supplied branch, add `campaignText: ''` and `campaignAttention: input.campaignAttention ?? null`.
     - In the no-briefing `liveStatus`, put `injection.campaignText` (plus `'\n\n'` when not empty) immediately before the standing-order block.
     - Pass `hasCampaignOrders: injection.campaignAttention !== null` to `getInitialUserMessage`.
  2. **`requestOrdersFlow.ts`.**
     - Keep `let campaignAttention: string | null = null;` beside `productionAttention`, and set it from `injection.campaignAttention`.
     - Pass `campaignText: injection.campaignText` and `campaignAttention: injection.campaignAttention` in the `formatBriefing` shared context.
     - Pass `campaignAttention` to `buildConsultPromptParts`.
  3. **`consultationText.ts`.**
     - Add `hasCampaignOrders?: boolean` to the opening-message gates, with a block.
     - In `buildOpeningActionClause`, strategic branch, append `' Give each unit in Campaign Orders the order its row names.'` after the orderless clause when `gates.ordersEnabled && gates.hasCampaignOrders === true`.
     - Thread the flag through `getInitialUserMessage` the same way `hasProductionAttention` is threaded.

- [x] **Step 7: The system-prompt rule.**
  1. In `coachingGates.ts`, add `readonly campaignEnabled?: boolean;` to `CoachingGates`, with a block:
     - Contract: "True on a strategic `region_vs_region` consult with standing orders on. Fixed for a match, so the system prompt stays cacheable."
  2. In `consultPromptParts.ts`, set `campaignEnabled: coordinateContext.mode !== 'tactical' && state.scenarioId === 'region_vs_region' && flags.ordersEnabled` in `coachingGates`.
     - In `promptText.ts`'s default `resolvedGates`, set `campaignEnabled: false`, so the default stays unchanged.
  3. Create `promptSpec/campaignRuleText.ts` with `buildCampaignRuleBlock(): string`, with file header and block. Fill the numbers from the imported constants. It returns exactly:

```text
## Campaign

The engine picks one enemy city for your ground units to take: the campaign target. The Campaign Objective section of the briefing names it, a staging hex near it, and the phase.

In the assemble phase, campaign units march to the staging hex and hold there. When enough of them are within {CAMPAIGN_MASS_RADIUS} hexes of it, the phase becomes assault and they march on the target together. Units that arrive one at a time are destroyed one at a time.

Ground units in your home region with an enemy unit within {CAMPAIGN_HOME_DEFENSE_RADIUS} hexes are home defenders and stay out of the campaign. A unit within {CAMPAIGN_CONTACT_RADIUS} hex of an enemy keeps fighting it.

Campaign Orders, under Standing Order Status, lists each campaign unit whose standing order should change. Give each listed unit the order its row names. A campaign unit without a standing order has the campaign hex as its Suggested Destination.

Best Options lists advance rows for campaign units. An advance row is a one-step move toward the campaign hex. Copy it into explicit_move like an approach row.

To choose a different target, set "campaignTarget" to the hex code of an enemy city in your final JSON. Omit it to keep the target. Sending the current target changes nothing. The engine keeps your target until you take it, it stops being an enemy city, or no ground unit can reach it by land. An unknown or unreachable city is dropped.
```

     Build it with `subHeading(SECTION_TITLE_CAMPAIGN)` and paragraphs joined by `'\n\n'`. Phase 5 adds the `campaignTarget` field. Until then the last paragraph names a field the parser ignores; that is fine between phases.
  4. In `coachingTextStrategic.ts`, `buildStrategicContextCoaching`: when `gates.campaignEnabled === true`, append `'\n\n' + buildCampaignRuleBlock()` after the message block. Update the function's Expected outcome.

- [x] **Step 8: Name advance rows where approach rows are named.** Change only the strategic wording; battle prompts never have advance rows.
  - `optionCopyText.ts`:
    - "(approach or move/melee)" becomes "(approach, advance, or move/melee)".
    - "approach and move/melee Target Hexes" becomes "approach, advance, and move/melee Target Hexes".
    - Change both only for the strategic actor (`unit`, this-turn). The battle forms (`sub-unit`, this-beat) stay as they are.
  - `promptText.ts`, `getMovementOrderInstruction`: in the strategic sentences, "approach or move/melee" becomes "approach, advance, or move/melee".
  - `coachingTextStrategic.ts`, the orderless bullet: "copy a Best Options approach or move/melee Target Hex" becomes "copy a Best Options approach, advance, or move/melee Target Hex".
  - Leave `plan_route`'s tool line alone. It is shared with battles.

- [x] **Step 9: Tests.**
  1. Create `briefingSectionsCampaign.test.ts`. Build a small snapshot by hand and cast it with `as unknown as GameStateSnapshot`. Use `format = (h3) => h3.toUpperCase()`. Set:
     - `seats`: `a1` with home `Northern America`, and `a3` with home `Western Europe`, both with `outTurn: null`.
     - `homeRegionHexesBySeat`: `{ a3: ['t1'] }`.
     - `strategicInfrastructure`: `t1` with urban 54 and fortified 3.
     - `strategicControl`: `t1` held by `a3`.
     - `exploredHexes`: `[]`.
     - `hexes`: `[{ h3Index: 't1' }]`.

     Assert the exact text for:
     1. Assemble with staging `s1`, `massedCount: 4`, `threshold: 6`, `source: 'engine'`, `chosenTurn: 12`, no defenders:

```text
# Campaign Objective

- Target: T1, a Western Europe city with 54 city cells and no known fortifications. The engine chose it on turn 12.
- Staging hex: S1.
- Phase: assemble. 4 of 6 ground units are within 2 hexes of S1. The assault starts when 6 are.
```

        The fortifications are unknown because `t1` is unexplored.
     2. Assault with staging, `massedCount: 1`, `threshold: 6`, `source: 'commander'`, defenders `['a1-i3', 'a1-t2']`, with `t1` added to `exploredHexes`. The lines:
        - `- Target: T1, a Western Europe city with 54 city cells and 3 known fortified cells. You chose it on turn 12.`
        - `- Phase: assault. 1 ground unit is within 2 hexes of S1 or T1. The campaign falls back to assemble below 3.`
        - `- Home defenders: a1-i3, a1-t2. Each has an enemy unit within 3 hexes, so it stays home.`
     3. Null staging. The two lines:
        - `- Staging hex: none. No hex you control is far enough from T1, so campaign units march on it directly.`
        - `- Phase: assault. There is no staging hex, so the assault continues until T1 is taken.`
     4. Unexplored `t1` also listed in `a1`'s home and `a3`'s home. The target line says `an enemy city`, not either home name.
  2. In `standingOrdersInjectionMission.test.ts`, add **`campaign orders list only units whose standing order differs from their campaign order`**.
     - Use that file's fixture style. Pick two of an AI seat's ground units, A and B.
     - Insert a `defend` order for A on its own hex, status `holding`, with the SQL pattern in `standingOrders.test.ts` around line 799.
     - Insert a `march` order for B to the waypoint W, status `en_route`, params `{ type: 'march', destination: [lat, lng] }` from `cellToLatLng(W)`.
     - Build a plan by hand: both units campaign units, neither holding, waypoint W.
     - `buildCampaignOrderRows` returns exactly one row: A, with `currentOrder` `defend <A's code>` and `campaignOrder` `march <W's code>`.
     - `getInjectionText(seat, state, { mode: 'strategic' }, plan)` contains `## Campaign Orders` and that row.
     - Without a plan, it does not contain `Campaign Orders`.
  3. In `promptContracts.test.ts`, add `testCampaignRuleAppearsOnlyWhenEnabled` and call it from `run()`.
     - `buildStrategicContextCoaching` with `campaignEnabled: true` includes `## Campaign` and `Copy it into explicit_move like an approach row.`.
     - With the gate off, neither appears.
  4. Add `formatCampaignAttentionBullet` cases to the same new test file or to an existing `requestOrdersInjection` test:
     - 0 gives null.
     - 1 gives `Campaign: 1 unit needs a new standing order. Copy each Campaign Orders row into an assign_order entry.`
     - 3 gives `Campaign: 3 units need ...`.

- [x] **Step 10: Docs.**
  - **`doc/ai-commander-prompts/strategic-prompt.md`.**
    - Add a `#### \`## Campaign Objective\`` entry after the Operational Map entries: Include, Content (the bullet forms above), and Model use.
    - Under Standing Order Status, describe `### Campaign Orders`.
    - In Attention Flags, add the campaign bullet after the paused-queue pointer.
    - In Strategic Context, add the `## Campaign` block.
    - In Best Options, add the `advance` action.
  - **`doc/ai-commander-prompts/assembly-contract.md`, §3.** Add matrix rows for:
    - `## Campaign Objective` (strategic: when a campaign plan exists; tactical: never)
    - `### Campaign Orders` (inside Standing Order Status when a plan exists)
    - `## Campaign` in Strategic Context (when the campaign gate is on)

    Add the campaign bullet to the Attention Flags row.
  - **`doc/ai-commander-prompts/information-decision-model.md`.** Add the campaign target to the inputs of the movement decisions it lists.
  - **`doc/ai-commander-prompts/source-inventory.md`.** Add `briefingSectionsCampaign.ts`, `campaignRules.ts`, `campaignObjectiveFlow.ts`, and `campaignRuleText.ts` where similar sources are listed.

- [x] **Step 11: Verify.** Run the prompt test sweep. Expected: all pass.

---

## Phase 5: Let the Commander Override the Target

An optional `campaignTarget` envelope field. The engine validates it, keeps a valid one, and ignores an echo of the current target.

**Files:**
- `src/main/openRouter/promptSpec/envelopeContract.ts` and `src/main/openRouter/promptSpec/envelopeJsonSchema.ts`
- `src/main/openRouter/promptContracts.ts`, `src/main/openRouter/consultPromptParts.ts`, and `src/main/openRouter/requestOrdersFlow.ts`
- `src/main/openRouter/orderResponseParsing.ts` and `src/main/openRouter/requestOrdersApplyParsed.ts`
- Create `src/main/openRouter/campaignTargetOverride.ts` and `src/main/openRouter/campaignTargetOverride.test.ts`.
- Update the envelope tests named in Step 7, and docs.

**Produces:** the `campaignTarget` field, the `includeCampaignTarget` gate, `campaignTargetCode` on the parsed result, and `applyCampaignTargetOverride`.

- [x] **Step 1: The field and its gate.** In `envelopeContract.ts`:
  - Add `'campaignTarget'` at the end of `ENVELOPE_FIELD_ORDER`.
  - Add `readonly includeCampaignTarget?: boolean;` to `EnvelopeGates`, with a block:
    - Contract: "Strategic `region_vs_region` consults with standing orders on."
  - In `envelopeFieldsForGates`, add `if (field === 'campaignTarget') return gates.coordinateMode !== 'tactical' && gates.includeCampaignTarget === true;`.

- [x] **Step 2: The schema.** In `envelopeJsonSchema.ts`, `envelopeFieldSchema`, add `case 'campaignTarget': return { ...STRING_SCHEMA };`. Do not add it to `required`.

- [x] **Step 3: The contract text.** In `promptContracts.ts`:
  1. Add `includeCampaignTarget?: boolean` to the `buildFinalJsonContractInstruction` argument and pass it into `gates`.
  2. Add `campaignTarget: '"campaignTarget": "<optional hex code>"',` to `headerSlots`.
  3. When the gate is on, add this paragraph after the callbacks paragraphs and before the memory paragraph:

```text
Optional "campaignTarget": the hex code of an enemy city for your ground campaign, as a string. Omit it to keep the target. Sending the current target changes nothing. The engine keeps your target until you take it, it stops being an enemy city, or no ground unit can reach it by land. An unknown or unreachable city is dropped.
```

  4. `getFinalJsonOrdersExampleBlock` needs no change. It has no value for `campaignTarget`, and `JSON.stringify` leaves out undefined keys.

- [x] **Step 4: Gate both builders the same way.**
  - In `consultPromptParts.ts`, pass `includeCampaignTarget: coachingGates.campaignEnabled === true` to `buildFinalJsonContractInstruction`.
  - In `requestOrdersFlow.ts`, add `includeCampaignTarget: !tacticalBattle && flags.ordersEnabled && planState.scenarioId === 'region_vs_region'` to `envelopeGates`.
  - The two must agree. A test in Step 7 checks the strategic default.

- [x] **Step 5: Parse it.** In `orderResponseParsing.ts`:
  1. Add `campaignTargetCode?: string;` to the parsed result type, with a block:
     - Contract: "The trimmed code from `campaignTarget`. Not resolved here; `applyCampaignTargetOverride` checks it against the map."
  2. In the success path, beside the callbacks and memory normalization:

```ts
        const rawCampaignTarget = obj.campaignTarget;
        const campaignTargetCode =
          context.mode !== 'tactical' && typeof rawCampaignTarget === 'string' && HEX_CODE_PATTERN.test(rawCampaignTarget.trim())
            ? rawCampaignTarget.trim()
            : undefined;
```

  3. When `rawCampaignTarget !== undefined` and `campaignTargetCode === undefined`, add the drop reason `campaignTarget dropped: expected one two-character hex code.` to the parser's existing drop-reason list.
  4. Return `campaignTargetCode` in the result object.
  5. The file is over 600 lines; add only these lines.

- [x] **Step 6: Apply it.**
  1. Create `campaignTargetOverride.ts` (file header, full block).
     - Import `loadCampaignLandMass`, `campaignLandSteps`, and `campaignInputsFromState` from `./campaignObjectiveFlow`.
     - Import `CAMPAIGN_REACH_LIMIT_STEPS` and `chooseStagingHex` from `./campaignRules`.
     - Import `codeToH3` from `../briefing/map/hexCodeTranslator`.
     - Import the memory functions, `dbGetOne` and `dbRun`, the logger, `briefingOwnSeatId` from `../briefing/briefingPerspective`, `type GameStateSnapshot` from `../gameDb`, and `type CoordinateContext` from `../briefing/map/coordinateContext`.

```ts
export function applyCampaignTargetOverride(args: {
  readonly state: GameStateSnapshot;
  readonly code: string;
  readonly context: CoordinateContext;
}): { readonly applied: boolean; readonly dropReasons: string[] } {
  const drop = (reason: string) => ({ applied: false, dropReasons: [`campaignTarget dropped: ${reason}`] });
  if (args.state.scenarioId !== 'region_vs_region') return drop('this scenario has no campaign.');
  let targetH3: string;
  try {
    targetH3 = codeToH3(args.code, args.context);
  } catch {
    return drop(`${args.code} is not a hex code on this map.`);
  }
  const seatId = briefingOwnSeatId(args.state);
  const ops = { getOne: dbGetOne, run: dbRun };
  const stored = readCampaignObjectives(ops).get(seatId) ?? null;
  if (stored?.targetH3 === targetH3) {
    logDebug('campaignTargetOverride: echo of the current target ignored', { seatId, code: args.code });
    return { applied: true, dropReasons: [] };
  }
  const landMass = loadCampaignLandMass(seatId);
  if (landMass === null) return drop('terrain data is not loaded.');
  const inputs = campaignInputsFromState(args.state, landMass);
  if (!inputs.cities.some((city) => city.h3Index === targetH3)) return drop(`${args.code} is not a known enemy city.`);
  const landStepsFromForce = campaignLandSteps(inputs, landMass, inputs.groundUnits.map((unit) => unit.h3Index));
  const steps = landStepsFromForce.get(targetH3);
  if (steps === undefined || steps > CAMPAIGN_REACH_LIMIT_STEPS) return drop(`no ground unit of yours can reach ${args.code} by land.`);
  const stagingH3 = chooseStagingHex({
    ownControlledLandHexes: inputs.ownControlledLandHexes,
    landStepsFromTarget: campaignLandSteps(inputs, landMass, [targetH3]),
    landStepsFromForce,
  });
  writeCampaignObjectiveForSeat(ops, seatId, {
    targetH3,
    stagingH3,
    phase: stagingH3 === null ? 'assault' : 'assemble',
    source: 'commander',
    chosenTurn: args.state.turnNumber,
  });
  logDebug('campaignTargetOverride: commander target stored', { seatId, code: args.code, stagingH3 });
  return { applied: true, dropReasons: [] };
}
```

  2. In `requestOrdersApplyParsed.ts`, right after the memory updates are applied and their drop reasons pushed:

```ts
  if (!tacticalBattle && ordersEnabled && parsed.campaignTargetCode) {
    const campaignResult = applyCampaignTargetOverride({
      state: planState,
      code: parsed.campaignTargetCode,
      context: { mode: 'strategic' },
    });
    dropReasons.push(...campaignResult.dropReasons);
  }
```

     The file is over 600 lines; add only these lines and the import.

- [x] **Step 7: Tests.**
  1. Create `campaignTargetOverride.test.ts`.
     - Use `withTempGameDb` and `getGameStateForPlayer(AI_SEAT_IDS[0], { maskUnexploredTerrain: false })`.
     - Call `ensureStrategicCoordinateRegistryInitialized()`, and use `h3ToCode(h3, { mode: 'strategic' })` for codes.
     - Find an enemy city the seat can reach from `campaignInputsFromState(state, loadCampaignLandMass(seat)!)`: a city whose `campaignLandSteps` entry exists. If none exists, stop and report.

     Assert:
     1. A known, reachable city's code is applied. `readCampaignObjectives` then holds that target with `source: 'commander'`, and `phase` is `assemble` when a staging hex exists, else `assault`.
     2. **Echo test.** Rewrite the stored entry with `phase: 'assault'` using `writeCampaignObjectiveForSeat`. Apply the same code again. The stored `phase` is still `assault`.
     3. The code of a city the seat itself controls is dropped with `campaignTarget dropped: <code> is not a known enemy city.`.
     4. A code that is not on the map is dropped with `is not a hex code on this map.`.
  2. **`envelopeContract.test.ts` and `consultationContract.test.ts`.**
     - Wherever a test lists the fields for a gate set, add `campaignTarget` only when the test's gates set `includeCampaignTarget: true`.
     - Add one case: strategic gates with `includeCampaignTarget: true` list `campaignTarget` last. The same gates in tactical mode do not list it.
  3. **`envelopeJsonSchema.test.ts`.** If it checks the property set, add the strategic case with the gate on.
  4. **Parser test.** In the parser's test file (search `src/main/openRouter` for tests that call `parseOrdersResponse`), add:
     - `"campaignTarget":"AB"` yields `campaignTargetCode: 'AB'`.
     - `"campaignTarget":7` yields no code and the drop reason.

- [x] **Step 8: Docs.**
  - `doc/ai-commander-prompts/strategic-prompt.md`, §3 (envelope): add the `campaignTarget` field, its gate, and its rules.
  - `doc/ai-commander-prompts/assembly-contract.md`: in the envelope section, list `campaignTarget` as an optional strategic field.

- [x] **Step 9: Verify.** Run the prompt test sweep. Expected: all pass.

---

## Phase 6: Win-First Goals, Doctrine, and the Memory Note

Prompt text only. The ranked goals put taking cities first, the base strategy lines fit every doctrine, and Balanced gets a block.

**Files:**
- `src/main/openRouter/promptSpec/coachingTextStrategic.ts`, `src/main/openRouter/promptSpec/coachingTextTactical.ts`, and `src/main/openRouter/promptSpec/doctrineText.ts`
- `src/main/openRouter/promptSpec/doctrineText.test.ts`, `src/main/openRouter/promptSpec/coachingText.test.ts`, and `src/main/openRouter/openRouterMatrix.test.ts`
- Docs named in Step 6.

- [x] **Step 1: Goals.** Replace `buildStrategicGoalsBlock` so it returns exactly the text below. Indentation is four spaces before each `(n)`, as today. Update its block: Purpose, "Taking cities wins, so it is ranked first; massing comes second because piecemeal attacks fail."
  - With `includeScenarioWinPaths`:

```text
- Your goals are, in priority order:
    (1) Take and hold enemy cities. Taking cities is how you knock sides out.
    (2) Mass your ground units before each attack. Units that arrive one at a time are destroyed one at a time.
    (3) Keep enough units at home to stop a raid on your cities.
    (4) Keep every city building. At your unit caps, bank credits and hire mercenaries.
    (5) Scout with a few units, not your main force.
```

  - Without it:

```text
- Your goals are, in priority order:
    (1) Destroy enemy forces where you outnumber them.
    (2) Mass your ground units before each attack. Units that arrive one at a time are destroyed one at a time.
    (3) Keep every city building.
```

- [x] **Step 2: Strategy lines.**
  - Replace the shared `STRATEGY_BLOCK` constant with an exported function `buildStrategyBlock(mode: 'strategic' | 'tactical'): string`, with a block. It returns the text below, with `{period}` as `turn` in strategic and `beat` in tactical.
  - Update both callers: `buildStrategicContextCoaching`, and the battle context builder in `coachingTextTactical.ts`.

```text
- Your strategy is:
    (1) Attack where you outnumber the defenders, and avoid fights where you do not.
    (2) Strike gaps the enemy cannot reinforce quickly.
    (3) Keep the initiative: move toward your objective every {period}.
```

- [x] **Step 3: Doctrine.** In `doctrineText.ts`:
  - Change `buildDoctrineBlock(doctrine)` to `buildDoctrineBlock(doctrine: Doctrine, campaignEnabled: boolean): string`.
  - Pass `gates.campaignEnabled === true` from `buildStrategicContextCoaching`.
  - In the texts below:
    - `{objective}` is `the campaign target` when the campaign is on, else `the nearest enemy home region`.
    - `{gather}` is `to the campaign staging hex` when on, else `toward the nearest enemy home region`.
  - Balanced now returns its block instead of an empty string. Update the function's block and the file header.

```text
- Your doctrine is balanced:
    (1) Advance on {objective} while your home cities are safe.
    (2) Trade a unit for a city when the odds favor you. At your unit caps, a lost unit is usually rebuilt within a turn or two, and a lost city is not.
```

```text
- Your doctrine is aggressive:
    (1) Advance on {objective} from the first turn, and engage every enemy force you can reach on the way.
    (2) Accept losses when a trade gains ground, cities, or tempo. At your unit caps, a lost unit is usually rebuilt within a turn or two.
    (3) Strike enemy cities, airports, and seaports even when you cannot hold them; production you deny is production they lose.
    (4) Keep only enough force at home to stop a raid from taking it.
```

```text
- Your doctrine is cautious:
    (1) Hold your home region and the cities next to it, and send the rest {gather}.
    (2) Attack only from cover or with your full massed force. Pull back exposed units rather than lose them.
    (3) Prefer a target an enemy is already fighting a third side for.
```

- [x] **Step 4: Memory note.** Turn `MEMORY_BULLET` into `memoryBullet(campaignEnabled: boolean): string`, with a block, and update its one caller.
  - When the campaign is on, it appends ` Do not persist the campaign target either; the Campaign Objective section supplies it.` after the sentence that ends `which the briefing already supplies fresh each turn.`.
  - Otherwise the text is unchanged.

- [x] **Step 5: Tests.**
  - **`doctrineText.test.ts`.** Expect the three blocks above for both campaign states. Balanced is no longer empty.
  - **`coachingText.test.ts` and `openRouterMatrix.test.ts`.** Update every assertion that pinned the old goals or strategy lines:
    - `Your goals are`
    - `Disperse your units`
    - `minimum force`
    - `Engage enemy forces to reduce`

    Assert the new lines instead. Keep each assertion's place.
  - **`openRouterMatrix.test.ts`.** If it asserts that balanced adds no doctrine text, change it to assert the balanced block.

- [x] **Step 6: Docs.**
  - `doc/ai-commander-prompts/strategic-prompt.md`, §1.8 Strategic Context: the new goals, the strategy lines, the three doctrine blocks, and the memory sentence.
  - `doc/ai-commander-prompts/tactical-prompt.md`, Battle Context: the new strategy lines with `beat`.
  - `doc/ai-commander-prompts/variants.md`: wherever doctrine variants are described, note that balanced now has a block and that the texts name the campaign target when the campaign is on.
  - `doc/ai-commander-prompts/assembly-contract.md`: replace the doctrine sentence that says "maximum disruption with minimum force" and "Balanced adds no block" with the new strategy lines and the balanced block.

- [x] **Step 7: Verify.** Run the prompt test sweep. Then grep `src/` and the docs this phase edits (`strategic-prompt.md`, `tactical-prompt.md`, `variants.md`, `assembly-contract.md`) for `Disperse your units`, `minimum force`, and `Engage enemy forces to reduce their combat effectiveness`. Each must return nothing. Leave the example prompts for Phase 10; Phase 11 greps all of `doc/` after those are rewritten.

---

## Phase 7: Production at the Caps

Credits come first. Fortification is suggested only for exposed cities, which the queue table now marks. Raise Options lists cells nearest the campaign target first.

**Files:**
- Create `src/main/openRouter/productionExposure.ts` and `src/main/openRouter/productionExposure.test.ts`.
- Edit:
  - `src/main/openRouter/productionAttention.ts` and `src/main/openRouter/productionAttention.test.ts`
  - `src/main/openRouter/briefingSections.ts`, `src/main/productionCaps.ts`, and `src/main/openRouter/promptSpec/coachingTextStrategic.ts`
  - `src/main/openRouter/briefingSectionsMercenaries.ts`, `src/main/openRouter/briefingSectionsMercenaries.test.ts`, and `src/main/openRouter/consultPromptParts.ts`
- Docs named in Step 8.

**Produces:** `PRODUCTION_EXPOSED_RADIUS`, `EXPOSED_COLUMN_HEADER`, `listExposedCityHexes`, the `Exposed` column, `compareByCampaignTarget`, and the `campaignTargetH3` option.

- [x] **Step 1: Exposure.** Create `productionExposure.ts`.
  - File header Purpose: "Fortifying a city no enemy can reach soon wastes production that credits could turn into mercenaries."
  - Each export gets a full block.

```ts
import type { GameStateSnapshot } from '../gameDb';
import type { HopDistance } from './campaignRules';
import { computeGridDistanceWithPathFallbackPure } from '../../shared/h3GridRangePure';
import { logTrace } from '../logger';

export const PRODUCTION_EXPOSED_RADIUS = 4;

export const EXPOSED_COLUMN_HEADER = 'Exposed';

export function listExposedCityHexes(
  state: GameStateSnapshot,
  seatId: string,
  hopDistance: HopDistance = computeGridDistanceWithPathFallbackPure
): Set<string> {
  const activeEnemySeatIds = new Set(
    (state.seats ?? []).filter((seat) => seat.seatId !== seatId && seat.outTurn == null).map((seat) => seat.seatId as string)
  );
  const threatHexes = [
    ...state.units.filter((unit) => activeEnemySeatIds.has(unit.player)).map((unit) => unit.h3Index),
    ...(state.enemyIntel ?? [])
      .filter((row) => row.player === undefined || activeEnemySeatIds.has(row.player))
      .map((row) => row.lastKnownH3Index),
  ];
  const urbanByH3 = new Map((state.strategicInfrastructure ?? []).map((row) => [row.h3Index, row.urbanHexCount]));
  const exposed = new Set<string>();
  for (const row of state.strategicControl ?? []) {
    if (row.controllerPlayerId !== seatId || (urbanByH3.get(row.h3Index) ?? 0) <= 0) continue;
    const near = threatHexes.some((h3) => {
      const distance = hopDistance(row.h3Index, h3);
      return distance !== null && distance <= PRODUCTION_EXPOSED_RADIUS;
    });
    if (near) exposed.add(row.h3Index);
  }
  logTrace('productionExposure listExposedCityHexes', { seatId, threatCount: threatHexes.length, exposedCount: exposed.size });
  return exposed;
}
```

  Block note: Expected outcome, "The seat's city hexes with an active enemy unit, visible or remembered in intel, within `PRODUCTION_EXPOSED_RADIUS` hops. An intel row with no owner counts. Neutral units never count."

- [x] **Step 2: Credits first, fortification only when exposed.** In `productionAttention.ts`, `findIdleProductionHexes`:
  - Add a fourth parameter `isExposed: (row: ControlledHexQueueSnapshot) => boolean = () => true`, and update the block.
  - Replace the `extras` and `buildableTypes` lines with the code below.
  - Import `CREDITS_QUEUE_ITEM` and `FORTIFICATION_QUEUE_ITEM` from the modules `controlAndProduction.ts` imports them from.
  - Update the `buildableTypes` field block: "Uncapped unit types, then `credits`, then `fortification` when the hex is exposed, then any other listed item."

```ts
    const extras = available.filter((item) => isBuildQueueItemType(item) && !isBuildUnitType(item));
    const credits = extras.filter((item) => item === CREDITS_QUEUE_ITEM);
    const fortification = extras.filter((item) => item === FORTIFICATION_QUEUE_ITEM && isExposed(row));
    const others = extras.filter((item) => item !== CREDITS_QUEUE_ITEM && item !== FORTIFICATION_QUEUE_ITEM);
    const buildableTypes = [...unitTypes.filter((unitType) => !maxedTypes.has(unitType)), ...credits, ...fortification, ...others];
```

- [x] **Step 3: The Exposed column.** In `briefingSections.ts`, `buildProductionBriefing`:
  1. After `const ownSeat = ...`, add the exposure lookup:

```ts
  const exposedH3 = listExposedCityHexes(args.state, ownSeat);
  const isExposed = (row: ControlledHexQueueSnapshot): boolean => {
    const ll = Array.isArray(row.hex) ? (row.hex as [number, number]) : null;
    const h3 = ll ? args.resolveToH3(ll[0], ll[1]) : undefined;
    return h3 !== undefined && exposedH3.has(h3);
  };
```

  2. Pass `isExposed` as the fourth argument of `findIdleProductionHexes`.
  3. Give `normalizeControlledHexQueueRow` a fourth parameter `isExposed`, and add a field `exposed: string` (`'yes'` or `'no'`) to its row type, with a block.
  4. Insert `EXPOSED_COLUMN_HEADER` after `FORTIFIED_COLUMN_HEADER` in the table headers, and `row.exposed` after `row.fortified` in each row.

- [x] **Step 4: The cap guidance.** In `src/main/productionCaps.ts`, set `PRODUCTION_CAP_QUEUE_GUIDANCE` to exactly the text below. Keep the `. A hex whose available types` break; `productionSubmitText.ts` and `PRODUCTION_BULLET` split the text there. Update its block.

```ts
export const PRODUCTION_CAP_QUEUE_GUIDANCE =
  'Do not queue types at maximum while other types can still be built; replace blocked queues with a still-available type. ' +
  'When every unit type a hex can build is at cap, queue credits and spend them on mercenaries. Queue fortification only in a city whose Exposed column says yes, and replace a fortification queue in a city that is not exposed with credits. ' +
  `A hex whose available types are marked "${ALL_AVAILABLE_TYPES_AT_CAP_NOTE}" and which lists neither has no alternative — leave that queue as it is so it resumes when the cap frees up.`;
```

  In `coachingTextStrategic.ts`, `PRODUCTION_BULLET`, append `'\n\n  A city is exposed when an enemy unit you can see or remember is within {PRODUCTION_EXPOSED_RADIUS} hexes.'` after the paused-queue sentence, with the number filled from the constant. Update its block.

- [x] **Step 5: Raise Options toward the target.** In `briefingSectionsMercenaries.ts`:
  1. Add an exported pure comparator with a full block:

```ts
export function compareByCampaignTarget(
  leftH3: string,
  rightH3: string,
  targetH3: string | null,
  hopDistance: HopDistance
): number {
  if (targetH3 === null) return 0;
  const left = hopDistance(leftH3, targetH3);
  const right = hopDistance(rightH3, targetH3);
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}
```

  2. Give `raiseTable` a sixth parameter, `campaignTargetH3: string | null`.
     - In its sort, insert `compareByCampaignTarget(left.h3Index, right.h3Index, campaignTargetH3, computeGridDistanceWithPathFallbackPure)` right after the `Resumes building` comparison and before `compareDistance`. A zero result is a tie, so the next key still runs.
     - Add to its orienting block: "Then cells nearest the campaign target."
  3. Add `campaignTargetH3?: string | null` to the `buildMercenariesBriefingBlock` options, with a block, and pass `options.campaignTargetH3 ?? null` to `raiseTable`.
  4. In `consultPromptParts.ts`, pass `campaignTargetH3: input.campaignPlan?.objective.targetH3 ?? null` in that options object.

- [x] **Step 6: Tests.**
  1. Create `productionExposure.test.ts`. Use a snapshot built by hand and cast, plus the grid `hop` from Phase 1's test.
     - Seats `a1` and `a2` active; `a3` with `outTurn: 5`.
     - `a1` cities: `0:0` (urban 5), `9:9` (urban 5), `1:1` (urban 0).
     - Units: `a2` at `3:0`, `a3` at `9:7`, neutral at `9:8`.
     - `enemyIntel` with player `a2` at `8:9`.
     - Expect `listExposedCityHexes(state, 'a1', hop)` to be `0:0` and `9:9`. `0:0` is exposed by the `a2` unit, and `9:9` by the intel row. The knocked-out and neutral units do not count, and `1:1` is not a city.
     - Removing the intel row leaves only `0:0`.
  2. **`productionAttention.test.ts`.**
     - Update every expectation that listed `fortification, credits` to `credits, fortification`.
     - Add **`a city that is not exposed is offered credits and not fortification`**: pass `() => false` and expect `credits` with no `fortification`.
  3. **`briefingSectionsMercenaries.test.ts`.** Add `compareByCampaignTarget` cases with the grid `hop`:
     - The nearer cell sorts first.
     - A null target returns 0.
     - A null distance sorts last.

- [x] **Step 7: Production Status docs and text.**
  - `doc/ai-commander-prompts/strategic-prompt.md`, Production Status: add the `Exposed` column and its rule.
  - Same file, Mercenaries: Raise Options now orders `Resumes building` first, then nearest the campaign target, then nearest your units.
  - Same file, the production coaching item: the new cap sentence.

- [x] **Step 8: Docs.** Also update `doc/ai-commander-prompts/information-decision-model.md`: the production decision now reads the Exposed column and prefers credits at the caps.

- [x] **Step 9: Verify.** Run the prompt test sweep. Then grep `src/` for `queue fortification or credits if they are listed`. It must return nothing.

---

## Phase 8: Move Turn-Invariant Text into the System Prompt

The situation message keeps only what changes per turn. Every rule, legend, and key moves to the system prompt, so the cached prefix covers it. This applies to the strategic and battle prompts.

**Files:**
- Create:
  - `src/main/openRouter/promptSpec/briefingGuideText.ts`
  - `src/main/briefing/briefingDistanceCaveat.ts`
  - `src/main/openRouter/systemPromptStability.test.ts`
- Edit the builders named in the inventory below:
  - `src/main/openRouter/consultPromptParts.ts`, `src/main/openRouter/scenarioGoals.ts`, and `src/main/openRouter/promptSpec/gameRuleText.ts`
  - `src/main/openRouter/promptSpec/coachingTextStrategic.ts` and `src/main/openRouter/promptSpec/sectionHeadings.ts`
- Update tests that pinned moved text, and docs in Step 11.

**Inventory.** Every row moves from the situation message to the system prompt, or is deleted as a duplicate. Line numbers are approximate; find each by its text.

| # | Text | Builder today | New place | Gate |
| --- | --- | --- | --- | --- |
| 1 | Intel staleness rule | `buildIntelStalenessRule()`, pushed by `formatBriefing` | `# Reading the Briefing` → `## Distances and Intel Age` | strategic, briefing precomputed, fog on |
| 2 | Fog path distance line | `FOG_PATH_DISTANCE_BRIEFING_LINE`, pushed by `formatBriefing` | same subsection | strategic, briefing, `usesFogPathDistanceBriefing` true |
| 3 | Hop-count line with fog off | `omniscientGridProximityBriefingLine(state)`, pushed by `formatBriefing` | same subsection | strategic, briefing, the line is not empty |
| 4 | Strategic map legend (five lines) | `strategicOperationalMapLegend` in `briefing/map/strategicMapWindow.ts` | `## Map Legend` | strategic, briefing |
| 5 | Battle map legend | two literal legends in `briefing/map/briefingMapSection.ts` | `## Map Legend` | battle, briefing |
| 6 | Odds key | `BEST_OPTIONS_ODDS_LINE` in `briefing/map/briefingTables.ts` | `## Best Options Odds` | briefing precomputed, in the modes whose table has an Odds column |
| 7 | Cost line, deployment caps line, income rule, buildability rule, spawn timing line | `buildProductionBriefing` in `briefingSections.ts` | `# Combat and Movement Rules` → `## Production` (renamed `# Rules` in Phase 9) | strategic, production on |
| 8 | Cap guidance after "You are currently at maximum for" | `PRODUCTION_CAP_QUEUE_GUIDANCE`, pushed by `buildProductionBriefing` | deleted; the system prompt already has it | — |
| 9 | "A new persistent key replaces…" and "Use memory_read to retrieve…" | `tools/memory.ts` | `## Memory Slots` | strategic, memory on |
| 10 | "Air rules: …" and "Callback support: …" | `briefingSectionsAirOps.ts` | `## Air Operations Table` | side has air. Battle: move the battle branch's lines that do not read the snapshot the same way |
| 11 | "Best missile targets are explored enemy hexes…" | `briefingSectionsMissiles.ts` | `## Missile Targets` | side has missiles |
| 12 | "Embark: … Capacity: …" and the airlift sentence (both mode variants) | `briefingSectionsSealift.ts` | `## Transport` | side has naval (embark line) or air (airlift line) |
| 13 | `MERCENARY_ENVELOPE_ROWS_SENTENCE` in the Mercenaries section | `briefingSectionsMercenaries.ts` | deleted; Response Format already has it | — |
| 14 | The empty Active Callbacks row's long sentence | `briefing/activeCallbacksSection.ts` | the row becomes `None.`; the callbacks coaching bullet already states the rule | — |
| 15 | "With no enemy observed, move to regain contact…" | `scoutingSentence` in `consultPromptParts.ts` | a strategic coaching bullet, always present | strategic |
| 16 | Scenario, home regions, win lines, outline sentence | `buildRegionVsRegionScenarioObjectiveBlock` | `# Scenario Objective (Required)`, after `# Your Command` | `region_vs_region` |
| 17 | Home hex lists, shared-hex line, territory sentence | `regionHomeProgressAndHexBullets` in `consultPromptParts.ts` | the same Scenario section | `region_vs_region` |
| 18 | Sides table | `buildSidesPromptBlock` | `## Sides` under the Scenario section | strategic |

Everything else stays in the situation message:
- The turn line, the warning, and the narrative
- Every table and its counts
- The `Shown:` line and "Units at featured hexes"
- "Your current unit counts" and "You are currently at maximum for"
- The memory slot counts
- "Air units: yours=…" and "Enemy infrastructure in your current strike envelope"
- Explored, controlled, and home-control lines, and urban-share progress lines
- The roster line and the closing instruction

- [x] **Step 1: Distance caveat helper.** Create `src/main/briefing/briefingDistanceCaveat.ts` with `briefingDistanceCaveatLines(state: GameStateSnapshot): string[]`. Give it a file header and full block.
  - It returns exactly what `formatBriefing` pushes today:
    - `[gridProximityLine]` when that line is not empty;
    - otherwise the staleness rule when fog is on, then the fog path line when it applies.
  - Move the imports it needs from `briefingFormatter.ts`.
  - In `formatBriefing`, delete the caveat block; keep the `logDebug` with the same fields, computed from the helper.

- [x] **Step 2: The reading guide.** Create `promptSpec/briefingGuideText.ts`.
  - File header Purpose: "The rules for reading the briefing do not change from turn to turn, so they live in the cached system prompt."
  - Export the moved strings as named constants, so builders and tests share them:
    - `STRATEGIC_MAP_LEGEND_LINES` (array)
    - `TACTICAL_MAP_LEGEND_LINES` (array, always including `FORTIFIED_MAP_LEGEND_FRAGMENT` in the Features line)
    - `MEMORY_SLOT_RULES`, `AIR_OPERATIONS_TABLE_RULES`, `MISSILE_TARGETS_RULE`, `NAVAL_EMBARK_RULE`
    - `AIRLIFT_RULE_STRATEGIC`, `AIRLIFT_RULE_TACTICAL`
  - Move `BEST_OPTIONS_ODDS_LINE` here, or import it here from where it is; keep one definition.
  - Export `buildBriefingGuideSection(gates)`. Gates:
    - `coordinateMode`, `hasPrecomputedBriefing`, `distanceCaveatLines`, `includeOddsKey`
    - `memoryEnabled`, `hasAirUnits`, `hasNavalUnits`, `hasMissileUnits`
  - It returns `# Reading the Briefing`, then only the subsections whose gate holds, in the outline order:
    - `## Distances and Intel Age`
    - `## Map Legend`
    - `## Best Options Odds`
    - `## Memory Slots`
    - `## Air Operations Table`
    - `## Missile Targets`
    - `## Transport`
  - Format:
    - Each subsection is its heading, a blank line, then its paragraphs separated by blank lines.
    - The map legends are bullet lists, one bullet per legend line.
    - With no subsection, it returns `''`.
  - Add the title constants `SECTION_TITLE_READING_THE_BRIEFING = 'Reading the Briefing'` and one constant per subsection to `sectionHeadings.ts`, with blocks.
  - Phase 7's `## Production Table` subsection is not needed. The Exposed rule lives in the production coaching bullet.

- [x] **Step 3: Remove the moved text from the builders.**
  - **Row 4.** Replace `strategicOperationalMapLegend(shownLine)` with `strategicOperationalMapShownBlock(shownLine)`. It returns the `Shown:` line plus a blank line, or `''`. Update its callers and block.
  - **Row 5.** In `briefingMapSection.ts`, both battle legends shrink to the `Shown:` line (when cropped) and the blank line.
  - **Row 6.** `renderThisTurnOptionsTableMarkdown` stops appending the odds line.
    - Check which modes pass an odds resolver. Set `includeOddsKey` to `hasPrecomputedBriefing && <that mode>`.
    - Today that is strategic. If battles also have an Odds column, include battles.
  - **Rows 7 and 8.** In `buildProductionBriefing`, delete:
    - the cost line, the deployment caps line, the income rule, and the buildability rule
    - the `PRODUCTION_CAP_QUEUE_GUIDANCE` line
    - the spawn-timing line
    - the blank lines that separated them

    Keep the unit counts and the at-maximum line, with a blank line between them.
  - **Rows 9 to 14.** Delete each sentence from its builder.
    - Keep the surrounding dynamic lines and their blank lines.
    - The callbacks empty row becomes `| — | None. |`.
    - Update each builder's orienting block.

- [x] **Step 4: Production rules in the system prompt.** In `gameRuleText.ts`, add `buildProductionRulesParagraphs(caps: Readonly<Record<BuildUnitType, number>>): string[]`, with a block. It returns, in order:
  1. `buildProductionCostRulesLine()`
  2. The deployment caps line, moved verbatim from `buildProductionBriefing`
  3. `buildProductionIncomeRule()`
  4. `buildBuildabilityRule()`
  5. `'Production progress/spawn resolves after Ready, after combat and control resolution.'`

  If importing `buildBuildabilityRule` into `gameRuleText.ts` creates an import cycle (`npm run check:circular`), put `buildProductionRulesParagraphs` in `gameRuleMercenaryText.ts` instead.

  In `consultPromptParts.ts`:
  - When production is on and the mode is strategic, compute the caps the same way `buildProductionBriefing` does (`getMaxUnitsPerType(parseGameSize(state.gameSize))`).
  - Append `## Production` and those paragraphs, joined by blank lines, at the end of the rules block.

- [x] **Step 5: Scenario in the system prompt.** In `scenarioGoals.ts`, split `buildRegionVsRegionScenarioObjectiveBlock` into two exports, each with a full block. Delete the old function.
  - **`buildScenarioObjectiveRulesBlock(state, { controlWinMinUrbanShare })`.** Returns the heading, the scenario, own and enemy home lines, the win lines, and the outline sentence. In other words, today's text without the urban-share progress lines.
  - **`buildScenarioProgressLines(state, { controlWinMinUrbanShare, enemyProgress })`.** Returns only the urban-share progress bullets, or `[]`.

  In `consultPromptParts.ts`:
  - **System prompt.** Right after the `# Your Command` paragraph, put:
    - the rules block
    - the home hex list bullets (`- Your home region hexes are: …`, `- <Name> home region hexes are: …`)
    - the shared-hex line and the territory sentence
    - a blank line, then the Sides block as `## Sides`

    These are split out of `regionHomeProgressAndHexBullets`. Keep each hex-list line's exact prefix: `wrapLongProseLines` exempts the home-region hex list by its text.
  - **Situation message.** In place of today's scenario and progress text, emit `# Scenario Progress`, a blank line, then:
    - the `Explored` and `Controlled` bullets
    - the home-control bullets
    - the urban-share progress bullets

    Add `SECTION_TITLE_SCENARIO_PROGRESS = 'Scenario Progress'` to `sectionHeadings.ts`.
  - Delete `sidesPrefix` from the situation message. The Sides block is always H2 now, so the `shiftMarkdownHeadings(sidesBlock, -1)` special case goes away.

- [x] **Step 6: Scouting sentence.** In `coachingTextStrategic.ts`:
  - Add a constant `SCOUTING_BULLET = '- When the briefing shows no observed enemy unit, move to regain contact along plausible approaches rather than holding position.'`, with a block.
  - Push it right after the copy-or-route bullet, in strategic mode.
  - In `consultPromptParts.ts`, delete `scoutingSentence` and its use.
  - Remove `hasObservedEnemy` from `CoachingGates` only if nothing else reads it. Grep first.

- [x] **Step 7: Assemble the system prompt.** In `consultPromptParts.ts`, `staticSystemText` is assembled in this order:

```text
# Your Command
<scenario rules block, home hex lists, ## Sides>        (strategic)
# Coordinates
# Combat and Movement Rules … ## Production             (production subsection: strategic, production on)
# Strategic Context or # Battle Context (## Campaign)
<buildBriefingGuideSection(...)>                         (omitted when empty)
# Available Tools …
# Response Format
## Example Response
```

  The situation message is assembled in this order:

```text
# Current Situation
<turn line, warning>
<briefing or standalone sections>
# Scenario Progress                                     (strategic, region_vs_region)
<air ops, missiles, mercenaries, sealift>
# Unit Roster
<roster line, closing instruction>
```

- [x] **Step 8: Update tests that pinned moved text.** Expected updates; each keeps its assertion and changes only where it looks:
  - `briefingSectionsSealift.test.ts` (Embark line)
  - `variantConformance.test.ts` (`Deployment caps (per side)`, `Scenario Objective`)
  - `openRouterMatrix.test.ts` (`Scenario Objective`)
  - `sectionHeadings.test.ts`
  - `tacticalPromptSectionParity.test.ts`
  - Any test that asserted the legend, the odds key, or the callbacks sentence in briefing text

  A test that builds only the situation or only the briefing and asserted a moved sentence there should now assert that the sentence is absent there. Add a separate assertion that the system text contains it, when that test can build the system text.

- [x] **Step 9: Stability test.** Create `systemPromptStability.test.ts`. Build a strategic prompt the way `promptOutline.test.ts` does:
  - open a database, reset a match, get the state, run precomputation, build the injection, format the briefing
  - but call `buildConsultPromptParts` directly, with `briefingOverride` set to the briefing

  Assert:
  1. **`the system prompt does not change when only the turn and date change`.**
     - Build the parts for `state`, and for `{ ...state, turnNumber: state.turnNumber + 1, currentDateLabel: 'October, Year 1' }` with the same briefing.
     - `staticSystemText` is identical.
     - Build again after moving one own unit to another hex on the copy and replacing `exploredHexes` with `[]`. `staticSystemText` is still identical. A turn-and-date pair alone would miss a per-turn fact copied from the same snapshot. Do not knock a side out in this copy; that change is allowed to rewrite the system prompt.
  2. **`turn-invariant text is in the system prompt and not in the situation message`.**
     - Each of these strings is in `staticSystemText` and not in `situationText`:
       - `Each cell: top = hex code`
       - `Odds is Kill, Hurt, and Loss`
       - `Production progress/spawn resolves`
       - `Deployment caps (per side)`
       - `Use memory_read to retrieve`
       - `Every home-region outline is always visible`
       - `home region hexes are:`
       - `move to regain contact`
     - Also check `Air rules:` when the fixture seat has an air unit, and `Embark: coastal` when it has a naval unit.
  3. **`the situation message still carries the per-turn facts`.**
     - `situationText` contains `Current turn: `, `# Scenario Progress`, and `Your current unit counts:`.

  End with the same `console.log` success line style as `promptOutline.test.ts`.

- [x] **Step 10: Verify.** Run the prompt test sweep. Expected: all pass, including `promptOutline.test.js`. Its subsequence check still holds, because only new headings were added and the moved ones were not in its list.

- [x] **Step 11: Docs.**
  - **`doc/ai-commander-prompts/assembly-contract.md`.**
    - §2: rows 1 to 13 follow the Step 7 orders.
    - §3: move the Scenario Objective and Sides rows to the system message, add `# Scenario Progress`, add `# Reading the Briefing` and its subsections, and change the Active Callbacks empty state to `None.`.
    - §3 also gets the live-assembler note that the system prompt holds every turn-invariant sentence.
  - **`doc/ai-commander-prompts/strategic-prompt.md` and `tactical-prompt.md`.** Move each moved entry under the new system section, with its gate.
  - **`doc/ai-commander-prompts/variants.md`.** The gates for the moved text, from the inventory.
  - **`doc/ai-commander-prompts/source-inventory.md`.** Add `briefingGuideText.ts` and `briefingDistanceCaveat.ts`.

---

## Phase 9: Rules, Guidance, and Response Format Structure

One topic per heading in the system prompt. No content changes except removing exact duplicates.

**Files:**
- `src/main/openRouter/promptSpec/sectionHeadings.ts`, `src/main/openRouter/promptSpec/gameRuleText.ts`, and `src/main/openRouter/consultPromptParts.ts`
- `src/main/openRouter/promptText.ts`, `src/main/openRouter/promptSpec/coachingText.ts`, `src/main/openRouter/promptSpec/coachingTextStrategic.ts`, and `src/main/openRouter/promptSpec/coachingTextTactical.ts`
- `src/main/openRouter/promptContracts.ts`, plus the builder of the action list (Step 4)
- Tests and docs as named.

**Produces:** `SECTION_TITLE_RULES`, `buildRulesSections`, `CoachingSection`, `buildCoachingSections`, `buildOrdersGuidanceSection`, and `SECTION_TITLE_ORDERS_GUIDANCE`.

- [x] **Step 1: Rename the rules heading.**
  - Replace `SECTION_TITLE_COMBAT_AND_MOVEMENT_RULES = 'Combat and Movement Rules'` with `SECTION_TITLE_RULES = 'Rules'`, and update every import.
  - Add `SECTION_TITLE_ORDERS_GUIDANCE = 'Orders Guidance'` and one constant per subsection title used below, with blocks.

- [x] **Step 2: Rules subsections.**
  - Replace `buildCombatRulesParagraph(gates)` with `buildRulesSections(gates)`, which returns markdown. Update its block, its callers, and its tests.
  - Each subsection is `## Title`, a blank line, then its paragraphs separated by blank lines. A subsection with no paragraph is omitted.
  - The two new gates:
    - `productionRules?: readonly string[]` replaces the Phase 8 append in `consultPromptParts.ts`.
    - `extraCombatText?: string` carries `combatAssessHint`.
  - `navalPlanRouteHint` joins Naval Units.

| Title | Paragraphs, in order |
| --- | --- |
| Combat | `buildCombatStatsLine(...)`, `buildCasualtySortRule(...)`, then `gates.extraCombatText` when set |
| Bonuses | origin bonus rule, tech bonus rule, and any terrain-bonus rule the battle prompt prints |
| Weather | weather rule |
| Terrain Cover | `buildTerrainCoverRule(...)` |
| Resolution Order | the resolution paragraph |
| Movement | `buildMovementBudgetRule(...)`, `buildDestinationOccupancyRule(...)` |
| Naval Units | naval clause, then `navalPlanRouteHint` when set (gate: naval) |
| Air Units | `buildAirEmploymentRule(gates)` |
| Missiles | `buildMissileEmploymentRule(gates)` |
| Fortifications | `buildFortificationRule(gates)` |
| Holding Fire | `buildHoldFireRule()` when orders are on |
| Production | `gates.productionRules` |
| Rule Lookup | `RULES_POINTER_LINE` when the `rules` tool is enabled |

  To pass the last three in, add `navalPlanRouteHint?: string`, `productionRules?: readonly string[]`, `extraCombatText?: string`, and `rulesPointer?: string` to `GameRuleTextGates`, each with a block. Delete the matching string concatenation in `consultPromptParts.ts`.

- [x] **Step 3: Orders Guidance.** In `coachingText.ts`:
  1. Add the section type and builder, each with a full block:

```ts
export interface CoachingSection {
  readonly title: string;
  readonly bullets: readonly string[];
}

export function buildCoachingSections(gates: CoachingGates): readonly CoachingSection[] {
  // strategic or tactical, as buildCoachingBullets dispatches today; drop sections with no bullets
}
```

  2. `buildCoachingBullets` becomes the flattened bullets of `buildCoachingSections`, in section order. Keep it exported for existing tests.
  3. Strategic sections, built in `coachingTextStrategic.ts` from the same constants and gates as today:

| Section | Bullets, in order |
| --- | --- |
| Winning | win paths (with the turn-limit sentence), free-for-all, shared home |
| Using the Briefing | copy-or-route, scouting (Phase 8), fire still moves, tempo |
| Standing Orders | orderless, leave missions |
| Air and Naval Units | idle air, airlift preference, naval routing, sealift |
| Production Queues | production |
| Memory and Callbacks | memory, callbacks, unconsulted turn |
| Messages and Rounds | message discipline, tool budget |

  4. Battle sections, from `coachingTextTactical.ts`:

| Section | Bullets, in order |
| --- | --- |
| Using the Briefing | tempo, standing orders inert, copy-or-route, reach |
| Air and Naval Units | air strike, sealift |
| Callbacks and Messages | callbacks, unconsulted beat, message discipline, exit battle |

  5. Add `buildOrdersGuidanceSection(gates)`, with a block. It renders:
     - `# Orders Guidance`, a blank line
     - then each section as `## Title`, a blank line, and its bullets one per line, keeping each bullet's indented continuation lines
     - a blank line between sections
     - It returns `''` when there are no bullets.
  6. In `promptText.ts`, `buildToolUsageGuidance` stops appending coaching bullets. It returns only its tool lines under `## How to Use These Tools Effectively`:
     - the briefing-present line
     - the `assess_unit` line
     - the `plan_route` line
     - the batch line
     - the memory tiers line
     - the production tool line

     Update its block. The `resolvedGates` default is no longer needed there; delete it if nothing else uses it.
  7. In `consultPromptParts.ts`, put `buildOrdersGuidanceSection(coachingGates)` after the tools section and before `# Response Format`.

- [x] **Step 4: The action list.**
  - Find the builder of `Actions: assign_order, cancel_order, …` and the long `assign_order (include "order": {` sentence with `grep -rn "required fields per type" src/main/openRouter`.
  - Render it as `Actions:` followed by a blank line and one bullet per action. Keep the words, and split only at the commas that separate actions.
  - Each gated sentence stays gated: the air sentence, the naval actions, the standing-order actions.
  - The strategic form with every gate on is:

```text
Actions:

- assign_order: include "order": { "type": "defend"|"march"|"pursue"|"patrol"|"hold_fire", ... }. Required fields per type: "march" needs "destination" (one two-character briefing hex code); "defend" needs "defendHex" (one hex code); "patrol" needs "waypoints" (an array of two or more hex codes, visited in order then looped — a single "destination" is not a valid patrol); "pursue" needs "targetUnitId" (an enemy unit id string); "hold_fire" needs no extra fields. Air units never move hex by hex, so "march", "patrol", and "pursue" are rejected for them — use airStrikes for attacks, ferryOrders to reposition, airDrops to land embarked infantry, or a "defend" order to keep striking targets in range.
- cancel_order
- explicit_move: include "destination": briefing hex code for this turn's move; auto-debarks embarked cargo before marching.
- ranged_attack: include exactly one of targetHexCode or targetUnitId; units with a strategic ranged reach of at least one, never infantry.
- transport_move: include "navalUnitId" and "destination" hex code.
- disembark: include "unitId" and "destination" hex code — clears cargo assignment then moves in one action.
- embark: include "unitId" and "navalUnitId".
```

- [x] **Step 5: Point at the right message.** The system prompt comes before the briefing, so "above" is wrong there.
  - In system-prompt builders only, replace "the Commander's Briefing above" with "the Commander's Briefing in the situation message".
  - Replace "(both are shown above)" with "(both are in the situation message)".
  - Use `grep -rn "Briefing above\|shown above" src/main/openRouter` to find them.
  - Leave the closing instruction alone. It is in the situation message, after the briefing.

- [x] **Step 6: Remove exact duplicates.**
  - For each paragraph in `# Rules`, search `## How to Use These Tools Effectively` and `# Orders Guidance` for a bullet that repeats it word for word. In battles, today, that includes the casualty-order sentence and the stacking sentence. Delete the repeat from the guidance side.
  - Do not delete a bullet that only resembles a rule.
  - List each deletion in the phase summary.

- [x] **Step 7: Fix the extra blank line.**
  - The battle prompt prints `# Battle Context` followed by two blank lines. Find where the context text starts with an extra `'\n'` and remove it.
  - Check the strategic context the same way.

- [x] **Step 8: Tests.**
  - Update every test that used `SECTION_TITLE_COMBAT_AND_MOVEMENT_RULES` or the literal `Combat and Movement Rules`, or that expected coaching bullets under `How to Use These Tools Effectively`. Expect the new headings instead.
  - In `promptOutline.test.ts`, replace `'# Combat and Movement Rules'` with `'# Rules'`, and add `'# Orders Guidance'` after `'## How to Use These Tools Effectively'`. Do the same in the battle outline list in `tacticalPromptSectionParity.test.ts`.
  - If a test pinned the old flat bullet order, update it to the section order above.
  - In `promptContracts.test.ts`, `testProductionGuidanceSkipsTypesAtDeploymentCap` (and any other test that reads coaching text from `buildToolUsageGuidance`) must read it from `buildOrdersGuidanceSection` instead.
    - Pass explicit `CoachingGates` equal to the old default `resolvedGates` values, with `campaignEnabled: false`.
    - Keep every assertion's expected text.

- [x] **Step 9: Docs.**
  - `doc/ai-commander-prompts/assembly-contract.md`, §2 and §3:
    - `# Rules` and its subsections
    - `# Orders Guidance` and its subsections
    - `## How to Use These Tools Effectively` holds tool lines only
    - the action list form
  - `doc/ai-commander-prompts/strategic-prompt.md`, §1.5 and §4: the same structure.
  - `doc/ai-commander-prompts/tactical-prompt.md`: the battle structure.

- [x] **Step 10: Verify.** Run the prompt test sweep. Expected: all pass.

---

## Phase 10: Situation Message Structure and Example Prompts

Inside the briefing, every section is a level under `# Commander's Briefing`. Paragraphs are separated. The two example prompts in `doc/` show the new layout.

**Files:**
- `src/main/openRouter/consultPromptParts.ts`, `src/main/openRouter/briefingSections.ts`, `src/main/tools/memory.ts`, and `src/main/openRouter/briefingSectionsAirOps.ts`
- `src/main/openRouter/promptOutline.test.ts`, `src/main/testSupport/promptOutlineHelpers.ts`, and `src/main/openRouter/tacticalPromptSectionParity.test.ts`
- Docs named in Step 5.

- [x] **Step 1: One level under the briefing.** In `consultPromptParts.ts`, when the briefing is precomputed, pass each of these through `shiftMarkdownHeadings(block, 1)` before joining:
  - `# Scenario Progress`
  - the air operations block
  - the missile block
  - the mercenary block
  - the sealift block
  - `# Unit Roster`; use `subHeading` instead of `topLevelHeading` there

  Without a precomputed briefing, leave them H1. The result must match the Target Prompt Outlines.

- [x] **Step 2: Paragraph breaks.** In the situation builders below, separate consecutive prose lines that are separate statements with a blank line. Do not touch table rows, list items, or fenced lines.
  - **`buildProductionBriefing`:** between `Your current unit counts: …` and `You are currently at maximum for: …`.
  - **`tools/memory.ts`:** between the slot-count line and the stored-not-triggered summary.
  - **`briefingSectionsAirOps.ts`:** between the strike-envelope line and anything after it.
  - Look for any other place in a situation builder that joins two prose sentences with a single `'\n'`. Fix those too and list them in the phase summary.

- [x] **Step 3: Outline checks.**
  1. In `src/main/testSupport/promptOutlineHelpers.ts`, add `assertNoTripleBlankLines(prompt: string)`, with a full block. It fails when a run of three or more newlines appears outside a fence. Toggle fence state on lines that start with three backticks.
  2. In `promptOutline.test.ts`, replace `STRATEGIC_ALWAYS_PRESENT` with:

```ts
const STRATEGIC_ALWAYS_PRESENT: readonly string[] = [
  '# Your Command',
  '# Scenario Objective (Required)',
  '## Sides',
  '# Coordinates',
  '# Rules',
  '## Combat',
  '# Strategic Context',
  '# Reading the Briefing',
  '## Map Legend',
  '# Available Tools',
  '## How to Use These Tools Effectively',
  '# Orders Guidance',
  '# Response Format',
  '## Example Response',
  '# Current Situation',
  "# Commander's Briefing",
  '## Unit Status and Threats',
  '## Attention Flags',
  '## Operational Map',
  '## Scenario Progress',
  '## Unit Roster',
];
```

     Call `assertNoTripleBlankLines(prompt)` beside `assertHeadingsNest(outline)`. If the fixture's scenario is not `region_vs_region`, stop and report, since the list assumes it.
  3. In `tacticalPromptSectionParity.test.ts`, update the battle outline list to the Battle outlines above, and add the triple-blank check.

- [x] **Step 4: Verify.** Run the prompt test sweep. Expected: all pass. `assertHeadingsNest` passes for both prompts.

- [x] **Step 5: Docs.**
  - **`doc/ai-commander-prompts/example-strategic-prompt.md` and `example-tactical-prompt.md`.** Rewrite each to the new layout:
    - Move every block to its new place.
    - Keep each block's existing example content.
    - Add the Campaign Objective section, Campaign Orders, `## Campaign`, and an `advance` row with plausible codes from the same example map.
    - Keep each file's opening note: "edited to match the builders rather than captured".
  - **`doc/ai-commander-prompts/assembly-contract.md`, §2.** The heading-nesting paragraph: Scenario Progress, the status sections, and Unit Roster are H2 inside the briefing, and H1 without it. Sides is always H2, under the Scenario section.
  - **`doc/ai-commander-prompts/README.md`.** If it summarizes the prompt layout, update that summary.

---

## Phase 11: Final Verification

```powershell
npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run build:renderer; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run lint; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run naming:check; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run check:renderer-types; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run check:circular
```

Then run the prompt test sweep.

Then the checks:
- **Removed wording.** Grep `src/` and `doc/` (not `doc/release-notes/`) for each of these. Each must return nothing.
  - `Combat and Movement Rules`
  - `SECTION_TITLE_COMBAT_AND_MOVEMENT_RULES`
  - `buildCombatRulesParagraph`
  - `buildRegionVsRegionScenarioObjectiveBlock`
  - `strategicOperationalMapLegend`
  - `Disperse your units`
  - `minimum force`
  - `queue fortification or credits if they are listed`
  - `sharesLandMassId`
  - `Commander's Briefing above`
- **No plan identifiers.** Grep `src/` for `Phase` in the files this plan touched. Nothing new may appear.
- **Sizes.** Every touched file is under 600 lines, or was already over 600 and grew by no more than the lines this plan names.
- **Save format.** `EXPECTED_USER_VERSION` in `src/main/gameDb.ts` is unchanged.
- **Optional.** Run the full `npm test` (about 30 minutes). It rebuilds the native module itself.

**Manual checks for the user** (the agent cannot run the game). List these in the summary.

1. **A logged match.** Start a 4-side AI-only match with Balanced doctrine and Flash-Lite, with prompt logging on (see the README's prompt-debugging section). After a few turns, open `debug-last-strategic-prompt-*.txt` and `debug-last-user-prompt-*.txt`. Check:
   - The system file has the Scenario, Rules, Reading the Briefing, and Orders Guidance sections.
   - The situation file has Campaign Objective.
   - Best Options shows `advance` rows.
   - Suggested Destinations name the staging hex.
2. **Cache stability.** Compare two consecutive system prompt files for one seat. They are identical unless that seat gained or lost an arm, or a side was knocked out. In the matching `debug-last-openrouter-response-body-*.txt`, `cached_tokens` should be close to the system prompt's size.
3. **The assault.** Watch a campaign reach its threshold. The phase reads assault, the units march on the target, and the target changes hands or the campaign falls back. Compare the number of cities changing hands per 50 turns with last night's run.
4. **Production at the caps.** The attention bullet lists `credits` before `fortification`, the Controlled Hex Queues table has an Exposed column, and interior cities stop fortifying.
5. **The battle prompt.** One battle prompt follows the battle outlines.
6. **Old save.** Load a save made before this change. It loads, and the first strategic consult picks a campaign.

**Final summary for the user:**

- Name every changed, created, and deleted source file, grouped by phase.
- Name every changed doc.
- **Behavior changes:**
  - AI sides now run a ground campaign toward one enemy city.
  - The ranked goals and doctrines changed.
  - At the caps, credits come before fortification, and only exposed cities are offered fortification.
  - Turn-invariant text moved to the system prompt.
  - Both prompts have new headings.
- List every duplicate removed in Phase 9, Step 6, and every paragraph-break fix in Phase 10, Step 2.
- Saves from before this change still load. Their first strategic consult picks a campaign.
- Do not commit.
