# Invasion Strength, Doubled Payloads, and an 80% Knockout Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** Release 3.6.0 with three rules changes:

1. **80% knockout.** A side is knocked out when other sides and Neutral hold 80% of its home's original urban cells, down from 90%, on every map.
2. **Doubled payloads, everywhere.** A ship (and a naval sub-unit in a battle) has 4 cargo slots: infantry takes 1 and armor takes 2. An air unit (and an air sub-unit) carries 2 infantry. This holds for:
   - the strategic engine and every commander;
   - the engine's sea and air operations;
   - battles;
   - the human stack-popup slot editor.

   An air drop lands every infantry unit aboard.
3. **No token invasions.** When a sea raid's muster reaches its 10-turn timeout, the raid sails only if the ships at the port can carry at least 75% of the troops still assigned to it. Otherwise it is abandoned. Campaign lifts keep their own landing minimum.

The default game size stays Medium, labelled Default. See Evidence.

**Shape:**
- Phase 0 records a baseline.
- Phase 1 lowers the knockout share.
- Phases 2 and 3 only move code out of files over 600 lines. Behavior does not change.
- Phase 4 lets air operations carry every infantry unit listed.
- Phase 5 lets an air drop land every infantry unit aboard.
- Phase 6 doubles carrier capacity in the engine.
- Phase 7 adds the 75% launch rule.
- Phase 8 gives the slot editor N slots.
- Phase 9 updates the prompt texts.
- Phase 10 updates the docs, sets version 3.6.0, runs the final checks, and hands off.

**Tech:** TypeScript (Electron main, renderer, shared modules), `better-sqlite3`, `node:test` and script-style tests, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/check-circular-deps.cjs`.

**Shell:** Windows PowerShell. Working directory `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`. Search with `Get-ChildItem -Recurse src -Include *.ts | Select-String -Pattern '<text>' -SimpleMatch`.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Targeted testing only.** Every phase ends with the Phase Check: static checks plus the tests that phase names. Never run `npm test`, `npm run ui:smoke`, or `npm run doc:shots`, and never run test files the phase does not name. The user runs the full test, review, and fix pass afterwards.
- **Stop only when a check fails** and you cannot fix it within the phase's file lists. Then:
  1. revert that phase (see Backup and Revert);
  2. record the failure in the Defect Inventory;
  3. stop, and tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, `git mv`, `git rm`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**.
  - Do not edit other files, with three exceptions:
    - removing an import that lint reports unused in a listed file;
    - fixing a test that fails only because of a change the phase names (see the Large-file rule for a test file over 600 lines);
    - updating an import path that a move in the same phase broke.
  - Record every such file in the Completion Log.
- Find code by the quoted text or the symbol name, not by a line number. Line numbers in this plan are hints from the day it was written.
- **Code blocks are sketches** unless marked **Exact**.
  - Write the real code from the file you just read. When a sketch and the file disagree, the file wins; record the difference in the Completion Log.
  - Text marked **Exact** is copied character for character, including punctuation and spacing.
  - In Exact text, `${name}` means the value of that variable or constant, interpolated in a template literal.
- **Tests come first.** Write a new function's test with the function, and run it before any existing code calls it.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Set `$step` to the phase number and `$files` to that phase's **Edits** list.

```powershell
$step = '1'
$files = @('src/shared/victoryRules.ts', 'src/shared/victoryRules.test.ts')
$backup = Join-Path $env:TEMP "aw-360\step-$step"
foreach ($f in $files) {
  $dest = Join-Path $backup $f
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Copy-Item $f $dest -Force
}
```

To revert a phase, copy the backups back, then delete every file the phase **adds**:

```powershell
foreach ($f in $files) { Copy-Item (Join-Path $backup $f) $f -Force }
```

---

## Verification

### Native module

Tests that open a database load `better-sqlite3` under Node, and `npm install` builds it for Electron. Phase 0 runs `npm run rebuild:native:node`. Phase 10 runs `npm run rebuild:native:electron` last, so the app starts again.

- **Native module lock.** If a rebuild fails with `EBUSY` on `better_sqlite3.node`:
  1. close any running Electron app;
  2. rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`;
  3. run the rebuild again;
  4. delete the `.locked` file.

### Phase Check

Every phase from 1 to 10 ends with the Phase Check, run from the repo root:

```powershell
npm run build:main
npm run lint
npm run check:circular
```

- Add `npm run check:renderer-types` whenever the phase adds or edits a file under `src/shared` or `src/renderer`.
- Add `npm run build:renderer` whenever the phase edits a file under `src/renderer` or `static`.
- Then run every test file the phase adds and every existing test file it lists under **Tests to run**, and no others. All must pass.
  - Run a main-process test with `node dist/main/<path>.test.js`.
  - Run a shared test with `node dist/shared/<path>.test.js`.
- `check:circular` must print **no** cycle.
- A static check or a named test that already failed in Phase 0 is not yours to fix. A **new** failure is.
- Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a check pass.
- **No test may call a real model.** Do not start the app.
- Record each Phase Check result in the Completion Log.

---

## Non-Goals

- **Default game size.** It stays Medium, labelled Default. The user decided this from the Evidence; do not touch game-size code or docs.
- **No timeout changes.** `OPERATION_MUSTER_TIMEOUT_TURNS` (10), `OPERATION_TRANSIT_TIMEOUT_TURNS` (20), `OPERATION_ASSAULT_TIMEOUT_TURNS` (6), `OPERATION_AIR_TRANSIT_TIMEOUT_TURNS`, and `OPERATION_MIN_GROUND_UNITS` (2) keep their values.
- **No change to how forces are sized.** `liftGroundCap`, the lift shares, the campaign lift's `minGroundUnits`, `campaignLiftRequiredUnits`, unit costs, caps, movement, and combat stay as they are. A force now needs fewer ships only because each ship carries more.
- **Battles still start with no cargo aboard any sub-unit.** Only loading during a battle sees the new capacity.
- **Parent-level writes during a battle.** `applyTacticalEmbarkCommittedOrdersToStrategicDb` gets the shared air rule in place of its "one infantry" count. It gets no new naval check. The battle's transport baseline restores those rows when the battle ends.
- **One air unit per air operation.** Only the infantry count changes.
- **Known gap, already there before this change: battle embark orders are checked one at a time against the snapshot from before the beat.** `validateTacticalOpponentEmbarkOrder` is called from three places: `aiOnlyTacticalBeat.ts`, `humanTacticalDraftCommit.ts`, and `requestOrdersApplyParsed.ts` (776 lines). None of them counts orders already accepted for the same carrier in that beat, so several embark orders in one beat can overload a carrier in a battle. This change neither causes the gap nor fixes it; the user may plan a follow-up. Strategic embarks are not affected: `applyEmbarkOrdersForPlayer` reads the cargo again for each order.
- **No new prompt headings, sections, or paragraphs.** Sentences are replaced inside the paragraphs and bullets they already sit in.
- **No replay or save-format change.** `AirDropAnimationMove` is a playback row built each Ready; it is not stored.
- **Files not to edit at all:**

  | File | Lines | Why |
  | --- | --- | --- |
  | `src/main/tacticalBattle/tacticalBattleSession.ts` | 783 | Over 600; its imports from `../gameActions/sealift` keep working through re-exports |
  | `src/main/tacticalBattle/tacticalStrategicOrderPhases.ts` | 900 | Over 600; `applyTacticalEmbarkPhaseOnBattle` checks no capacity |
  | `src/main/openRouter/consultPromptParts.ts` | 602 | Over 600; prompt assembly does not change |
  | `src/main/openRouter/promptSpec/sectionHeadings.ts` | 615 | Over 600; importing from it is fine |
  | `src/main/openRouter/promptSpec/gameRuleText.test.ts` | 626 | Over 600; it keeps importing `buildAirEmploymentRule` from `./gameRuleText` through a re-export |
  | `src/main/operations/operationCommands.test.ts` | 727 | Over 600; see the Large-file rule if a test there fails |

- Do not edit anything under `.spec/completed/`, release notes of versions before 3.6.0, or the historical documents named in `AGENTS.md`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`.

- **Large-file rule (rule 09, as the user applies it).** A file over 600 lines is never edited in place. When this plan must change code in one, it first moves that code into a new module (Phases 2 and 3), and the large file only loses lines. In a large file the only edits allowed are:
  - removing the moved code;
  - adding the import, re-export, spread, or `extends` that replaces it.

  Each large file must end with fewer lines than it started with. If a test in a test file over 600 lines fails because of a change this plan names, do not edit it in place:
  1. move that one test into a new sibling file named `<file>Capacity.test.ts`, using the file's runner style;
  2. move any fixture it needs into `src/main/testSupport/` and import it from both files;
  3. fix the test there;
  4. record it in the Completion Log.
- **Orienting comments.** Every new or changed declaration, and every field of an interface or parameter-object type, has a JSDoc block:
  - a one-line summary;
  - `Purpose:` (or `Contract:` for types and fields);
  - `When to use:`, `Expected outcome:`, and `Exceptions:`.

  Moved code keeps its comments. Update every comment whose behavior this plan changes. Afterwards, no comment may still say:
  - that a ship carries one armor or two infantry;
  - that an air unit carries one infantry unit, or that an air operation stores one infantry unit;
  - that the knockout share is 90% or `0.9`, or that a side "holds more than a tenth";
  - that a ship row has two slots or that `slotIndex` is `1 | 2`;
  - that a raid sails at the timeout with any `OPERATION_MIN_GROUND_UNITS` units.

  No generic filler.
- **Logging (rule 02).** Only `src/main` logs.
  - Database readers and flow functions log `logDebug` on entry.
  - Pure helpers in `src/main` log `logTrace`.
  - Every refusal logs `logDebug` with the reason.
  - Log seat ids, unit ids, hex ids, slot indexes, and counts only.
  - Code in `src/shared` and `src/renderer` does not log.
- **Names.** Use the file and symbol names this plan gives. camelCase functions, PascalCase types, UPPER_SNAKE constants.
- **No plan vocabulary** in code, comments, test names, or `doc/`.
- **Seat ids:** no literals in production code.
- **Size limits (rule 09).**
  - Each new file must stay under 350 lines.
  - Each edited file under 600 lines must stay under 600.
  - Record every final line count in the Completion Log.
- **Mutability (rule 13), arguments (rule 10).**
  - At most 2 parameters, or one parameter object with a commented type.
  - Pure functions never mutate their inputs; they return new maps and arrays.
  - Moved code keeps its signature in Phases 2 and 3. Phase 8 converts the 4-parameter slot functions to one object.
- **Reuse (rule 06).**
  - `src/shared/carrierCargoRules.ts` is the only place that knows carrier capacity, slot costs, and cargo layout. After Phase 6, no other file compares a cargo count with 1 or 2.
  - `applySealiftSlotEdit` is the only slot-edit logic. Strategic and tactical edits both call it.
- **Tests (rule 03).** Test contracts, not private helpers or call order. Copy the structure and runner style of the sibling test file named in each phase.
- **Prompt structure.** Follow the Design's Prompt Layout map.
  - Every changed sentence stays in its paragraph or bullet.
  - No new line breaks inside a paragraph, and no triple newline.
  - A pointer to another section uses that section's title constant.
- **Docs.** Phase 10 updates `doc/`, `README.md`, the release notes, and the bug template. Do not edit them earlier.

---

## Evidence

### Matches

- **g350** (3.5.0, Medium, turn 149) is an East/West stalemate:
  - Eastern Asia: 118 infantry (94 of them mercenaries), 16 armor, and 13 ships.
  - Northern America: 65 infantry (49 mercenaries), 13 armor, and 7 ships.
  - Eastern Asia's deepest home loss was about 17% (turn 80). Northern America's was 42 of 628 cells.
- **Every recent match has stalemated between Eastern Asia and Northern America**, at Small (g33, g341) and at Medium (gm, g350). The model cost per consult was the same, about $0.019. So the Default size did not break the stalemate, and switching back would not either. The user kept Medium as Default.
- **Sea invasions arrive weak.** An operation takes 15 to 20 turns from launch to landing, because ships move 2 hexes a turn. Landings:
  - op128 landed 6 of its 16 troops and was wiped out;
  - op46 landed 14 and was ground down to 0;
  - op105 landed 6 and held a city.

### Musters in g350

- **Counts.** 56 sea operations: 37 sailed (28 full, 9 partial) and 17 ended in muster.
- **Full musters are quick.** They took 1 to 10 turns. 27 of the 28 finished within 9 turns, and the median was about 4.
- **Timeout musters sail short because of missing ships, not missing troops.** Five sailed at the timeout, carrying 8 of 16, 4 of 12, 4 of 7, 2 of 5, and 2 of 4 troops. At each timeout the troops were all at the port, but only 0 to 2 of the 3 to 8 ships were.
- **With doubled payloads, four of the five clear 75%:**
  - op128: 16 of 16;
  - op38: 7 of 7;
  - op87: 4 of 4;
  - op60: 4 of 5 (80%);
  - op109: 8 of 12 (67%), so it would be abandoned.

### Decision

- **Keep the 10-turn timeout.** Doubling payloads halves the ships a muster needs, so the timeout case gets rarer.
- **Raise the timeout bar.** At the timeout a raid must carry at least `ceil(0.75 × troops still assigned)` and at least `OPERATION_MIN_GROUND_UNITS`. 75% passes the four strong cases above and stops the 67% one.

---

## Locked Decisions

1. **Knockout share.** `HOME_CONTROL_WIN_MIN_URBAN_SHARE` is `0.8`. It serves every map, as today. The prompt, the knockout notice, and the dialog already read it from the map profile.
2. **Capacity model** (`src/shared/carrierCargoRules.ts`):
   - a naval unit has `NAVAL_CARGO_SLOTS` = 4 slots and an air unit `AIR_CARGO_SLOTS` = 2;
   - infantry costs `INFANTRY_CARGO_SLOT_COST` = 1 slot and armor `ARMOR_CARGO_SLOT_COST` = 2;
   - an air unit takes infantry only;
   - a carrier accepts a land unit when it can take that type and the slots used plus its cost are at most its slots.

   This applies to strategic units and to tactical sub-units alike: the rule reads only the unit types.
3. **Ship packing** (`fillShip`): armor first, then infantry, each in id order (`compareCodeUnits`), up to 4 slots. `shipsNeeded` is `ceil(total slots / 4)`. Packing armor first makes repeated `fillShip` use exactly `shipsNeeded` ships.
4. **Raid launch at the timeout.** In `seaMusterReady`, when the muster has timed out:
   - `carried` is the troops present, capped by what the ships present can carry (`troopsShipsCanCarry`);
   - a raid is ready when `carried >= max(minUnitsAtTimeout, ceil(SEA_RAID_TIMEOUT_MIN_SHARE × remainingUnitCount))`;
   - a campaign lift is ready when `carried >= minUnitsAtTimeout`, as today.

   Before the timeout nothing changes. `SEA_RAID_TIMEOUT_MIN_SHARE` = `0.75` lives in `operationRules.ts`. Commanders are told the rule in one sentence of the Operations rules (Prompt text 14).
5. **Slot editor.** A carrier row shows one dropdown per slot: 4 for a ship, 2 for an air unit.
   - Cargo is packed armor first, then infantry, each in id order.
   - An armor unit fills its slot and the next. The next slot shows that armor's label and is disabled.
   - Choosing a unit in a slot replaces whatever is in that slot.
   - An edit that would overfill the carrier is refused with the carrier's full reason.
   - `slotIndex` is 1-based, an integer from 1 to the carrier's slot count.
6. **Air operations** carry every infantry unit in `operation.unitIds`, up to `AIRLIFT_INFANTRY_CAPACITY`.
   - A missing infantry unit is dropped from the list.
   - An infantry unit with its own order during muster is released.
   - The muster loads when every remaining infantry unit is at the airport.
   - The drop goes when every remaining infantry unit is aboard.
   - Operations stored with one infantry unit behave exactly as before.
7. **Air drops** land every infantry unit aboard. A shot-down drop loses all of them. A drop needs at least one infantry unit aboard. `AirDropAnimationMove.infantryUnitId` becomes `infantryUnitIds`.
8. **Release.** Version 3.6.0. A new `doc/release-notes/v3.6.0.md`, copied from `v3.5.0.md`. Nothing is committed.

---

## Design

### Shared capacity rules — `src/shared/carrierCargoRules.ts` (Phase 6)

Rewrite the module. It keeps `landUnitFightsWhileEmbarked` unchanged. Sketch:

```ts
export const NAVAL_CARGO_SLOTS = 4;
export const AIR_CARGO_SLOTS = 2;
export const MAX_CARRIER_CARGO_SLOTS = NAVAL_CARGO_SLOTS;
export const INFANTRY_CARGO_SLOT_COST = 1;
export const ARMOR_CARGO_SLOT_COST = 2;
export const AIRLIFT_INFANTRY_CAPACITY = AIR_CARGO_SLOTS / INFANTRY_CARGO_SLOT_COST;   // 2
export const NAVAL_INFANTRY_CAPACITY = NAVAL_CARGO_SLOTS / INFANTRY_CARGO_SLOT_COST;   // 4

export function carrierCargoSlots(carrierUnitType: string): number;            // naval 4, air 2, else 0
export function landCargoSlotCost(landUnitType: string): number;               // infantry 1, armor 2, else 0
export function carrierCarriesType(carrierUnitType: string, landUnitType: string): boolean;
  // naval: infantry or armor. air: infantry. else false.
export function cargoSlotsUsed(aboardUnitTypes: readonly string[]): number;    // sum of landCargoSlotCost

export type CarrierLoadQuery = {
  readonly carrierUnitType: string;
  readonly landUnitType: string;
  readonly aboardUnitTypes: readonly string[];   // cargo already aboard, not counting this unit
};
export function carrierAcceptsLandUnit(query: CarrierLoadQuery): boolean;
  // carrierCarriesType && cargoSlotsUsed(aboard) + landCargoSlotCost(land) <= carrierCargoSlots(carrier)
export function carrierFullReason(carrierUnitType: string): string;            // Exact texts below

export type CargoUnit = { readonly unitId: string; readonly unitType: string };
export type CargoSlotPosition = { readonly unitId: string | null; readonly coveredByUnitId: string | null };
export function layoutCargoSlots(query: { readonly carrierUnitType: string; readonly cargo: readonly CargoUnit[] }): CargoSlotPosition[];
```

**`layoutCargoSlots`:**
1. Start from `carrierCargoSlots(carrierUnitType)` empty positions (`{ unitId: null, coveredByUnitId: null }`).
2. Keep the cargo the carrier can take (`carrierCarriesType`).
3. Sort armor first, then infantry, each by `compareCodeUnits` on `unitId`.
4. Place each unit at the next free index.
   - Armor also writes `{ unitId: null, coveredByUnitId: <armor id> }` at the following index.
   - A unit that does not fit is left out.
5. Return a new array; the input is not changed.

**`carrierFullReason` — Exact:**
- naval: `That naval unit has no room for it. A naval unit has ${NAVAL_CARGO_SLOTS} cargo slots: infantry takes ${INFANTRY_CARGO_SLOT_COST} and armor ${ARMOR_CARGO_SLOT_COST}.`
- air: `That air unit has no room for it. An air unit carries up to ${AIRLIFT_INFANTRY_CAPACITY} infantry.`
- any other carrier: `That unit cannot carry land units.`

The module comment's Expected outcome becomes: "A ship has 4 slots and an air unit 2. Infantry takes 1 and armor 2; air takes infantry only. Air cargo never fights."

### Lift rules — `src/main/operations/liftRules.ts` (Phase 6)

- `fillShip(candidates)` keeps its signature.
  - It walks armor (by id), then infantry (by id).
  - It adds each unit for which `carrierAcceptsLandUnit({ carrierUnitType: 'naval', landUnitType, aboardUnitTypes: <types chosen so far> })` is true.
  - It returns the chosen ids.
- `shipsNeeded(unitTypes)` = `Math.ceil(cargoSlotsUsed(unitTypes) / NAVAL_CARGO_SLOTS)`. Types other than infantry and armor cost 0, as today.
- Update both comments to Locked Decision 3.

### Muster rule — `src/main/operations/seaMusterRules.ts` (Phase 7)

The timed-out branch of `seaMusterReady`. **Exact** logic:

```ts
  else if (timedOut) {
    const carried = Math.min(presentUnitTypes.length, troopsShipsCanCarry(presentUnitTypes, shipsPresentCount));
    const needed = args.campaignLift === true
      ? minUnitsAtTimeout
      : Math.max(minUnitsAtTimeout, Math.ceil(SEA_RAID_TIMEOUT_MIN_SHARE * remainingUnitCount));
    ready = carried >= needed;
  }
```

- Add `needed` (or `null` before the timeout) to the existing `logTrace` payload.
- `0.75 × n` is exact in binary for an integer `n`, so `ceil` has no float drift.

The new constant in `operationRules.ts`. Its value is **Exact**, and its comment follows the file's style:

```ts
/**
 * Share of a raid's remaining troops the ships at the port must be able to carry when its muster times out.
 *
 * Purpose: A raid that sails with a fraction of its force is ground down on landing, so a short raid is called off instead.
 * When to use: `seaMusterReady`, for a raid whose muster has reached `OPERATION_MUSTER_TIMEOUT_TURNS`. Campaign lifts use their own `minGroundUnits`.
 * Expected outcome: 0.75. The raid sails when it can carry at least `ceil(0.75 × remaining troops)` and at least `OPERATION_MIN_GROUND_UNITS`.
 * Exceptions: None.
 */
export const SEA_RAID_TIMEOUT_MIN_SHARE = 0.75;
```

`OPERATION_MUSTER_TIMEOUT_TURNS`' Expected outcome becomes **Exact**: `10. A raid sails when the ships at the port can carry at least SEA_RAID_TIMEOUT_MIN_SHARE of its remaining troops and at least OPERATION_MIN_GROUND_UNITS; a campaign lift needs its own minimum. Otherwise the operation is abandoned.` Wrap the two constant names in backticks.

### Air operations — `src/main/operations/airOperationAdvance.ts` (Phase 4)

**Helpers:**
- `liveInfantry(operation, facts)`: `operation.unitIds` filtered to ids in `facts.unitHexById`, in stored order.
- `keepAirOperation` gains optional `unitIds` and `releasedIds`.
  - `next` is the stored operation object itself when the phase and the infantry list (same ids, same order) are both unchanged.
  - Otherwise `next` is `{ ...operation, unitIds, phase, phaseTurn }`, with `phaseTurn` refreshed only when the phase changed.
- `detachInfantry` is unchanged. It is called once per infantry unit.

**`advanceAirOperation`.** Keep the carrier lookup.
- Carrier missing → `lost`, `carrier-missing`. In muster, the actions are a `cancelOrder` for each live infantry unit.

**Muster**, in this order:
1. No live infantry → `abandoned`, `infantry-missing`, no actions.
2. Carrier not on `musterH3` → `abandoned`, `carrier-left`. The actions are `detachInfantry` for each live infantry unit.
3. **Released infantry.** Unless this is the launch tick, an infantry unit is released when it has a stored order that is not a march or defend on `musterH3`. This is the same test as today. `kept` is the live infantry minus the released ones.
4. `kept` empty → `abandoned`, `infantry-order`, `releasedIds: released`, no actions.
5. Elapsed ≥ `OPERATION_MUSTER_TIMEOUT_TURNS` → `abandoned`, `muster-timeout`. The actions are `detachInfantry` for each kept unit, with `releasedIds: released`.
6. Every kept unit on `musterH3` → keep, `loaded`, phase `transit`, `unitIds: kept`, `releasedIds: released`. The actions:
   - `holdUnless(carrier)`;
   - then, for each kept unit in order, `cancelOrder` and then `embark`.
7. Otherwise → keep, `mustering`, `unitIds: kept`, `releasedIds: released`. The actions:
   - `holdUnless(carrier)`;
   - then a `march` to `musterH3` for each kept unit that is not on it and not already marching there.

**Transit:**
1. No live infantry → `lost`, `infantry-missing`.
2. Split the live units into `aboard` (aboard this carrier) and `ashore`.
3. **`aboard` empty:**
   - Some ashore unit on the objective and `facts.objectiveIsOwn` → `completed`, `objective-held`.
   - Some ashore unit on the objective → keep, `assault`, phase `assault`, `unitIds`: the ashore units on the objective. The actions are a `defend` for every ashore unit at its own hex.
   - Otherwise → `abandoned`, `landed-elsewhere`. The actions are a `defend` for every ashore unit at its own hex.
4. **`aboard` not empty.** Each ashore unit gets a `defend` at its own hex and leaves the list. It is not released.
   - The drop is illegal (the same three conditions as today) → `abandoned`, `transit-unload`. The actions:
     - the ashore defends;
     - then, for each aboard unit, `unload` and a `defend` at the carrier hex.
   - Otherwise → keep, `in-transit`, `unitIds: aboard`. The actions are the ashore defends.

**Assault:**
- No live infantry → `lost`.
- Then `objectiveIsOwn` → `completed`.
- Then the timeout → `abandoned`.
- Otherwise keep `holding` with `unitIds: live`.

**`cancelAirOperation`:**
- `return` → unchanged.
- Carrier missing → `lost`. In muster, a `cancelOrder` for each live unit.
- Otherwise the actions are `[]` in assault, and `detachInfantry` for each live unit in the other phases.

With one infantry unit, every branch gives the same step as today.

**Turn orders** (`operationTurnOrders.ts`). In `operationTurnOrders`, replace the single-infantry lookup:

```ts
const cargo = operation.unitIds.map((id) => byId.get(id)).filter((unit) => unit !== undefined);
if (carrier === undefined || cargo.length === 0) continue;
if (cargo.some((unit) => unit.embarkedOnCarrierUnitId !== carrierId)) continue;
```

**Candidates** (`airOperationCandidates.ts`):
- `chosen` becomes the whole `infantry` array, which is already sliced to `AIRLIFT_INFANTRY_CAPACITY`. An empty array means `continue`.
- `infantrySteps` is the largest step count among the chosen.
- `unitIds` is every chosen id.

**Options row** (`briefingSectionsOperations.ts` `airPlanAndCost`). With `count = candidate.unitIds.length`, the plan is **Exact**:
- landing is the muster: `${count} infantry ${noun(count, 'unit')} ${count === 1 ? 'musters' : 'muster'} at ${format(candidate.musterH3)}; ${carrier} ${count === 1 ? 'carries it' : 'carries them'}; drops on ${format(candidate.objectiveH3)}`
- otherwise: the same, with `ferries ${count === 1 ? 'it' : 'them'} to ${format(candidate.landingH3)}` in place of `carries it` / `carries them`.

A one-infantry row is unchanged.

### Air drops (Phase 5)

- **`airDropValidation.ts`.** When the cargo is empty or holds a non-infantry unit, the refusal is **Exact**: `Air drop needs infantry aboard.`
- **`airDropResolution.ts`:**
  - `infantry` becomes `dbGetAll` of every land unit aboard the carrier, sorted with `compareCodeUnits` by id.
  - When the list is empty, `continue`.
  - The shot-down branch is unchanged: `applyTransportLossForRemovedCarriers` already removes all cargo. It uses `infantry[0].h3Index` where it used `infantry.h3Index`.
  - On a landing, each infantry unit has its assignment deleted and its hex set to the target.
  - The move gets `infantryUnitIds` with every landed id.
- **`AirDropAnimationMove`** (`src/shared/ipc/airDropTypes.ts`). `infantryUnitId?: string` becomes `infantryUnitIds?: readonly string[]`. Contract: "Every infantry unit that landed, in id order. Absent when the air unit was destroyed."
- **`tacticalAirDrop.ts`:**
  - `tacticalAirDropRefusal` refuses with `Air drop needs infantry aboard.` when no infantry sub-unit is aboard.
  - Resolution moves every infantry sub-unit embarked on the attacker to the target cell and clears its `embarkedOnSubUnitId`.
  - The move gets `infantryUnitIds`.
  - Shot-down removal is unchanged (`markTacticalSubUnitCasualty` expands to all cargo).
- **Renderer `orderDrawing.ts` `buildAirDropOutboundPlaybackMoves`:** one infantry move per id in `move.infantryUnitIds ?? []`.

### Slot editor model (Phase 8)

**IPC types** in `src/shared/ipc/sealiftTypes.ts`. Replace `SealiftNavalRow` and add the rest. Every field gets a JSDoc block.

```ts
export interface SealiftCargoSlot {
  unitId: string | null;            // land unit in this slot
  coveredByUnitId: string | null;   // the armor in the slot before, which also fills this one
  disabled: boolean;                // controlsDisabled or covered
  debarkEnabled: boolean;           // debark allowed here and unitId is set
}
export interface SealiftNavalRow {
  navalUnitId: string;
  carrierUnitType: 'naval' | 'air';
  slots: SealiftCargoSlot[];        // carrierCargoSlots(carrierUnitType) entries, in layoutCargoSlots order
  controlsDisabled: boolean;
}
export interface SealiftSlotEdit {
  h3Index: string;
  navalUnitId: string;
  slotIndex: number;                // 1-based
  landUnitId: string | null;        // null empties the slot (debark)
}
export interface SealiftSlotEditResult { success: boolean; reason?: string; state?: SealiftStackState }
```

`src/shared/sealiftStackState.ts` adds `sealiftRowCargoIds(row: SealiftNavalRow): string[]`. It returns the non-null `unitId`s of `row.slots`, in order.

**Pure assignment logic** in `src/main/gameActions/sealiftSlotAssignment.ts`. It replaces `SealiftSlotPair`, `buildSealiftSlotsByNavalId`, and `normalizeSealiftSlots`, and keeps `SealiftSlotAssignmentRow` and `buildSealiftStackState`.

```ts
export type CarrierCargoQuery = {
  readonly carrierIds: readonly string[];
  readonly carrierTypeById: ReadonlyMap<string, string>;
  readonly cargoByCarrierId: ReadonlyMap<string, readonly string[]>;
  readonly landTypeById: ReadonlyMap<string, 'infantry' | 'armor'>;
};
export function buildCargoByCarrierId(args: { carrierIds; assignments }): Map<string, string[]>;
export function normalizeCarrierCargo(query: CarrierCargoQuery): Map<string, string[]>;
export function applySealiftSlotEdit(args: { edit: { navalUnitId; slotIndex; landUnitId }; cargo: CarrierCargoQuery }): SealiftSlotEditOutcome;
export type SealiftSlotEditOutcome = { readonly ok: true; readonly cargoByCarrierId: Map<string, string[]> } | { readonly ok: false; readonly reason: string };
export function buildSealiftNavalRows(args: { cargo: CarrierCargoQuery; contextMode; debarkAllowed }): SealiftNavalRow[];
```

**`normalizeCarrierCargo`** returns a new map. For each carrier, in `carrierIds` order, it:
- drops ids missing from `landTypeById`;
- drops ids already kept on an earlier carrier;
- keeps the ids `layoutCargoSlots` places, in layout order.

**`applySealiftSlotEdit`** does these steps in order. The reasons are **Exact**:
1. `slots = carrierCargoSlots(type)`. When `slotIndex` is not an integer from 1 to `slots`, refuse with `That carrier has only ${slots} cargo slots.`
2. Lay out the target's current cargo. When the position at `slotIndex - 1` has a `coveredByUnitId`, refuse with `That slot is filled by the armor in the slot before it.`
3. When `landUnitId` is set and `carrierCarriesType` is false, refuse with `An air unit can carry only infantry.` (Only air refuses a land type.)
4. Copy the map and remove `landUnitId` from every carrier. Then remove the position's current occupant from the target, and append `landUnitId` to the target when it is set.
5. When `landUnitId` is set and `cargoSlotsUsed` of the target exceeds `slots`, refuse with `carrierFullReason(type)`.
6. Return `ok` with `normalizeCarrierCargo` of the new map.

Emptying an empty slot is `ok` and changes nothing.

**`buildSealiftNavalRows`.** For each carrier, it lays out its cargo and maps each position to a `SealiftCargoSlot`:
- `disabled = controlsDisabled || coveredByUnitId !== null`;
- `debarkEnabled = debarkAllowed && unitId !== null`.

`controlsDisabled` comes from `controlsDisabledFor(contextMode)`. Callers build ship rows with the hex's mode and debark flag, and air rows with `'coastal_port'` and `true`, as today. The old air-row override that blanked slot 2 is removed.

**Strategic** (`sealiftStackPopup.ts`):
- `readSealiftStackState` builds `carrierTypeById`: naval for ship ids, air for air ids.
- `executeSealiftSlotUpdate(edit: SealiftSlotEdit)` keeps its eligibility checks in order:
  - database;
  - carrier in stack;
  - debark/embark legality;
  - air with non-infantry;
  - land option present.

  It removes the old air `slotIndex === 2` refusal, the slot pair copy, and the armor-in-slot-1 refusal. Then it calls `applySealiftSlotEdit` with the cargo read from `state.navalRows` via `sealiftRowCargoIds`.
- `writeAssignmentsForHex` takes one object `{ h3Index, landOptions, cargoByCarrierId }` and inserts one row per id.

**Tactical** (`tacticalSealiftSlotUpdate.ts`, `tacticalSealiftStackState.ts`). The same with sub-unit ids. Carrier types come from `snap.subUnits`.
- `embarkOrdersFromTacticalSlots` becomes `embarkOrdersFromTacticalCargo(cargoByCarrierId)`, with carriers sorted by id and each carrier's ids in layout order.
- `applyTacticalSealiftSlotChangeInSession` builds its embark pairs from `projected.state.navalRows` with `sealiftRowCargoIds`.

**Pending embarks** (`src/shared/sealiftPendingEmbarks.ts`): `mergePendingEmbarksIntoSealiftState(args: { base: SealiftStackState; pendingEmbark: readonly EmbarkOrder[] }): SealiftStackState`.
- With no pending orders, it returns a deep copy.
- Otherwise, for each row:
  1. cargo = `sealiftRowCargoIds(row)` minus every pending land id, plus this row's pending land ids sorted by `compareCodeUnits`;
  2. lay it out with the land types from `base.landOptions`;
  3. each slot is `{ unitId, coveredByUnitId, disabled: row.controlsDisabled || coveredByUnitId !== null, debarkEnabled: unitId !== null && (row.carrierUnitType === 'air' || base.debarkAllowedAtHex) }`.

The renderer's `mergePendingTacticalEmbarkOrdersIntoSealiftState` keeps its name and signature and returns the shared function's result.

**Renderer** (`stackCalloutSealift.ts`):
- `nonSelectableEmbarkedIds` becomes **Exact**: `state.navalRows.flatMap((row) => sealiftRowCargoIds(row))`.
- `addSlotControl(slotIndex: number, slot: SealiftCargoSlot)` starts with `const debarkEnabled = slot.debarkEnabled;`.
  - **A covered slot:** the select is disabled and has exactly one option. Its value is `slot.coveredByUnitId` and its text is `buildSealiftUnitLabel(slot.coveredByUnitId, 'armor')`. The select keeps no change listener. It sits in the same tooltip host as the other selects, and its debark button is hidden.
  - **Every other slot** is built as today. `select.disabled = slot.disabled`, and the options are infantry only when `row.carrierUnitType === 'air'`.
- The two hard-coded `addSlotControl` calls become **Exact**: `row.slots.forEach((slot, index) => addSlotControl(index + 1, slot));`
- The `units.find(...)` carrier-type lookups are removed.
- Both API calls pass `slotIndex` unchanged.

**IPC boundary:**
- `parseSealiftSlotPayload` in `buildQueueSealiftIpcHandler.ts` is exported. It accepts `slotIndex` when `Number.isInteger(slotIndex) && slotIndex >= 1 && slotIndex <= MAX_CARRIER_CARGO_SLOTS`, and returns a `SealiftSlotEdit`. The engine then checks the index against the carrier's own slots.
- `updateSealiftSlot(edit: SealiftSlotEdit)` and `updateTacticalSealiftSlot(edit: SealiftSlotEdit)` take one object.
- `SealiftGameApi` and `sealiftPreloadApi` take `payload: SealiftSlotEdit` and return `SealiftSlotEditResult`. The tactical call returns `TacticalSealiftSlotEditResult = SealiftSlotEditResult & { tacticalBattle?: TacticalBattleSnapshot }`, which is declared in `sealiftGameApiTypes.ts`.

### Prompt texts — Exact (Phase 9)

All system texts read only constants, so the cached system prompt changes once with this release and then stays stable across turns.

1. `NAVAL_EMBARK_RULE` (`briefingGuideText.ts`): `Embark: coastal, a land seaport with water or coast next to it (control not required), or a water seaport you control. Capacity: ${NAVAL_CARGO_SLOTS} slots per naval unit; infantry takes ${INFANTRY_CARGO_SLOT_COST} and armor ${ARMOR_CARGO_SLOT_COST}, so a ship carries 4 infantry, 2 armor, or 1 armor and 2 infantry. Capacity Used in ${SECTION_TITLE_NAVAL_TRANSPORT_STATUS} counts slots.`
2. `TACTICAL_SEALIFT_RULE`: `Tactical sealift: ${NAVAL_CARGO_SLOTS} slots per naval sub-unit; infantry takes ${INFANTRY_CARGO_SLOT_COST} and armor ${ARMOR_CARGO_SLOT_COST}, so a naval sub-unit carries 4 infantry, 2 armor, or 1 armor and 2 infantry. Capacity Used in ${SECTION_TITLE_NAVAL_TRANSPORT_STATUS} counts slots. Debark before independent land marches.`
3. `AIRLIFT_RULE_STRATEGIC`: `An air unit carries up to ${AIRLIFT_INFANTRY_CAPACITY} infantry units, boarded with embark (one row per unit), moved with ferryOrders, unloaded with disembark or airDrops. A drop lands every infantry unit aboard.`
4. `AIRLIFT_RULE_TACTICAL`: `An air sub-unit carries up to ${AIRLIFT_INFANTRY_CAPACITY} infantry sub-units, boarded with embark (one row per sub-unit), unloaded with disembark or airDrops. A drop lands every infantry sub-unit aboard.`
5. `TACTICAL_AIR_OPERATIONS_TABLE_RULES`: `Air rules (tactical): strikes and drops cover this battle footprint; ferry is one hop between intact airport cells; an air sub-unit carries up to ${AIRLIFT_INFANTRY_CAPACITY} infantry sub-units.`
6. Coaching air bullet (`coachingTextStrategic.ts`): `Air units strike within ${AIR_STRIKE_RANGE_HEXES} hexes of their airport, carry up to ${AIRLIFT_INFANTRY_CAPACITY} infantry units between airports, and drop them within ${AIR_STRIKE_RANGE_HEXES} hexes.`
7. Tactical coaching (`coachingTextTactical.ts`): `- An air sub-unit may strike or drop anywhere in the footprint, or ferry one hop to an intact airport cell. It carries up to ${AIRLIFT_INFANTRY_CAPACITY} infantry sub-units, and a drop lands all of them. A drop onto a cell fortified by the other side is illegal. It cannot strike and drop, or drop and ferry, in the same beat.`
8. `buildAirEmploymentRule` (`gameRuleAirText.ts`):
   - tactical: `An air unit strikes and drops anywhere in the battle footprint and ferries one hop between intact airport cells. An air sub-unit carries up to ${AIRLIFT_INFANTRY_CAPACITY} infantry sub-units, and a drop lands all of them. A drop onto a cell fortified by the other side is illegal. A drop onto an enemy cell is fought in melee if both remain.`
   - strategic paragraph 3: `It carries up to ${AIRLIFT_INFANTRY_CAPACITY} infantry units. embark with that air unit's id in navalUnitId loads one infantry unit on the same hex; give one embark row per unit. disembark clears the assignment and then marches the infantry by normal land movement. The destination does not have to be a port or a coast. A destination of the current hex unloads and stays. ferryOrders carries the infantry along. While aboard, the infantry cannot fight and is destroyed if the air unit is destroyed.`
   - strategic paragraph 4: `airDrops lands every infantry unit aboard on a land hex within ${AIR_STRIKE_RANGE_HEXES} of the current airport, including an enemy hex, and the air unit stays based where it is. Enemy units there may shoot the air unit down; if they do, all of that infantry is lost. A drop and a strike cannot both be ordered. A drop and a ferry cannot both be ordered.`
   - Paragraphs 1, 2, and 5 are unchanged, and there are still five, joined by a blank line.
9. Operations air paragraph (`operationRuleText.ts`): `By air, it marches up to ${AIRLIFT_INFANTRY_CAPACITY} infantry units to an air unit's airport, loads them, ferries to an airport in range when it must, and drops them onto a city that holds no enemy unit.`
10. Option copy (`optionCopyText.ts`): `` An air ${actor} picks only one of air strike, air drop, and ferry. When its Aboard column lists fewer than ${AIRLIFT_INFANTRY_CAPACITY} infantry, embark infantry ${actor}s from its hex in the same orders list, one embark row each.`` (It starts with a space, as today.)
11. Naval Transport Status (`briefingSectionsSealift.ts`, both modes): the Capacity Used cell is `` `${cargoSlotsUsed(embarked.map((unit) => unit.unitType))}/${NAVAL_CARGO_SLOTS}` ``. The `capacityUsed` arithmetic is removed.
12. Air Operations Status (`briefingSectionsAirOps.ts` `infantryAboardLabel`): the ids of every infantry unit aboard, sorted with `compareCodeUnits` and joined with `', '`, or `none`.
13. Operation Options air row: see Air operations above. Its code lands in Phase 4 because it reads the candidate.
14. Operations sea paragraph (`operationRuleText.ts`), the whole paragraph: `By sea, it musters units and ships at a port, loads them, sails to a landing beside the city, unloads, and marches onto it. If the force has not gathered after ${OPERATION_MUSTER_TIMEOUT_TURNS} turns, it sails only when the ships at the port can carry at least ${Math.round(SEA_RAID_TIMEOUT_MIN_SHARE * 100)}% of its ground units, and is called off otherwise, so keep its ships with it. A campaign lift needs only its own minimum.` It renders "…after 10 turns, … at least 75% of its ground units…".

### Prompt Layout

| Text | Builder | Message | Where | Change |
| --- | --- | --- | --- | --- |
| 1, 2 | `buildBriefingGuideSection` | System | Reading the Briefing → `SECTION_TITLE_TRANSPORT`, first paragraph | sentence replaced |
| 3, 4 | `buildBriefingGuideSection` | System | same subsection, second paragraph | sentence replaced |
| 5 | `buildBriefingGuideSection` | System (battle) | `SECTION_TITLE_AIR_OPERATIONS_TABLE` | sentence replaced |
| 6 | strategic coaching list | System | coaching bullet for air | bullet text replaced |
| 7 | tactical coaching list | System (battle) | coaching bullet for air | bullet text replaced |
| 8 | `buildAirEmploymentRule` | System | rules, air paragraphs | paragraphs 3 and 4 replaced |
| 14 | `buildOperationRuleBlock` | System | Operations rules, second paragraph | two sentences appended inside the paragraph |
| 9 | `buildOperationRuleBlock` | System | Operations rules, third paragraph | paragraph replaced |
| 10 | `buildOptionCopyMappingClause` | System | tools and option-copy guidance | clause replaced |
| knockout share | `regionalWinPathsBullet`, `buildScenarioObjectiveRulesBlock` | System | win paths | none: reads `controlWinMinUrbanShare`, now 80% |
| 11 | `briefingSectionsSealift.ts` | Situation | `# Naval Transport Status` | cell value |
| 12 | Air Operations Status table | Situation | `# Air Operations Status` | cell value |
| 13 | Operation Options | Situation | Operation Options table | row text |
| knockout progress | `buildScenarioProgressLines` | Situation | Scenario Progress | none |

No heading is added, removed, or renamed. No row, column, or table is added.

---

## Phase 0 — Baseline

**Goal:** Know what already fails, confirm the anchors, and record line counts.

### Steps

1. `npm run rebuild:native:node`
2. Run `npm run build:main`, `npm run lint`, `npm run check:circular`, `npm run check:renderer-types`, and `npm run build:renderer`. Record each result.
3. Run each test file named under **Tests to run** in Phases 1 to 9 that already exists. Record any that fail now: they are not yours to fix.
4. Confirm each anchor below appears exactly once in the file named. A missing or doubled anchor is a stop.
   - `export const HOME_CONTROL_WIN_MIN_URBAN_SHARE = 0.9;` — `src/shared/victoryRules.ts`
   - `export const AIRLIFT_INFANTRY_CAPACITY = 1;` — `src/shared/carrierCargoRules.ts`
   - `if (land.unitType === 'infantry' && (existingArmor || existingInfantryCount >= 2)) continue;` — `src/main/gameActions/sealift.ts`
   - `if (aboard >= 1) return tacticalInvalidResult('An air unit has only one infantry slot.');` — `src/main/tacticalBattle/tacticalOpponentOrderValidation.ts`
   - `const needed = armorCount + Math.ceil(infantryCount / 2);` — `src/main/operations/liftRules.ts`
   - `Math.min(2 * navalCap,` — `src/main/openRouter/postureFit.ts`
   - `const capacityUsed = armor >= 1 ? 2 : Math.min(infantry, 2);` — `src/main/openRouter/briefingSectionsSealift.ts` (twice: record both)
   - `Air drop needs exactly one infantry unit aboard.` — `airDropValidation.ts` and `tacticalAirDrop.ts`
   - `const infantryId = operation.unitIds[0];` — `airOperationAdvance.ts` (twice: record both) and `operationTurnOrders.ts`
   - `(payload?.slotIndex !== 1 && payload?.slotIndex !== 2)` — `src/main/ipc/buildQueueSealiftIpcHandler.ts`
   - `export function buildAirEmploymentRule(` — `src/main/openRouter/promptSpec/gameRuleText.ts`
   - `function advanceMuster(` — `src/main/operations/seaOperationAdvance.ts`
   - `'By sea, it musters units and ships at a port, loads them, sails to a landing beside the city, unloads, and marches onto it.',` — `src/main/openRouter/promptSpec/operationRuleText.ts`
5. Record the line count of every file this plan edits. The files over 600 lines must be:
   - `sealift.ts` 920, `gameActionsCore.ts` 729, `preload.ts` 901;
   - `gameApiTypes.ts` 918, `readyTypes.ts` 897;
   - `seaOperationAdvance.ts` 718, `gameRuleText.ts` 743;
   - `sealift.test.ts` 836, `gameActionsMultiSelect.test.ts` 871;
   - `seaOperationAdvance.test.ts` 639, `openRouterMatrix.test.ts` 678.

   A large difference means the code moved; read before you continue.

### Verification

Every result, anchor, and count is recorded in the Phase 0 Inventory.

---

## Phase 1 — The 80% Knockout

**Goal:** A side is knocked out at 80% on every map.

**Edits:**
- `src/shared/victoryRules.ts`, `src/shared/victoryRules.test.ts`
- `src/shared/gameMapTypes.ts` (comment only)
- `src/main/gameActions/knockoutConsequences.test.ts` (comment only)

### Steps

1. In `victoryRules.ts`, set `HOME_CONTROL_WIN_MIN_URBAN_SHARE = 0.8`. Its comment becomes:
   - Purpose: `One home-loss threshold serves every map, so a side keeps fighting while it holds more than a fifth of its home.`
   - Expected outcome: `` `0.8`. ``
2. In `gameMapTypes.ts`, the `controlWinMinUrbanShare` comment's `` (`0.9`) `` becomes `` (`0.8`) ``.
3. In `knockoutConsequences.test.ts`, the comment "the rule needs 90% of the home's urban cells lost" becomes "the rule needs 80% of the home's urban cells lost".
4. In `victoryRules.test.ts`, add one test in the file's style. **Exact** name: `the home-loss share is 80% on every map`. It asserts `HOME_CONTROL_WIN_MIN_URBAN_SHARE === 0.8`.

### Tests to run

`dist/shared/victoryRules.test.js`, `dist/shared/knockoutDialogCopy.test.js`, `homeControlProgress.test`, `knockoutStatus.test`, `knockoutConsequences.test`, `endOfTurnOutcomeRules.test`, `scenarioGoals.test` (the last five under `dist/main/...`).

### Verification

The Phase Check with `check:renderer-types`.

---

## Phase 2 — Move Sealift Code Out of Large Files

**Goal:** Every sealift function this plan changes lives in a file under 600 lines. Behavior and signatures do not change.

**Adds:**
- `src/main/gameActions/sealiftHexEligibility.ts`
- `src/main/gameActions/sealiftStackPopup.ts`, `src/main/gameActions/sealiftStackPopup.test.ts`
- `src/main/gameActions/sealiftEmbarkOrders.ts`, `src/main/gameActions/sealiftEmbarkOrders.test.ts`
- `src/main/testSupport/sealiftTestFixtures.ts`
- `src/main/gameActions/sealiftSlotActions.ts`
- `src/shared/ipc/sealiftGameApiTypes.ts`
- `src/main/preloadSealiftApi.ts`
- `src/main/gameActionsEmbarkedLand.test.ts`

**Edits:**
- `src/main/gameActions/sealift.ts`, `src/main/gameActions/sealift.test.ts`
- `src/main/gameActions/gameActionsCore.ts`
- `src/shared/ipc/gameApiTypes.ts`, `src/main/preload.ts`
- `src/main/preloadIpcChannelParity.test.ts`
- `src/main/gameActionsMultiSelect.test.ts`

### Steps

1. **`sealiftHexEligibility.ts`.** Move these from `sealift.ts`, with their comments and the imports they need:
   - the `HexEmbarkContext` type (whatever `getHexEmbarkContext` returns);
   - `getHexEmbarkContext`;
   - `canPlayerEmbarkFromHex` (now exported);
   - `canManualDebarkFromHex`;
   - `getSealiftStackContextModeForHex`.

   Then:
   - Give the file a module comment: "Where a side may load or unload a ship."
   - It must not import `sealift.ts`.
   - In `sealift.ts`, add **Exact**: `export { canManualDebarkFromHex, canPlayerEmbarkFromHex, getSealiftStackContextModeForHex } from './sealiftHexEligibility';`
   - Import whatever `sealift.ts` still calls from the new module.
2. **`sealiftStackPopup.ts`.** Move these, with their comments:
   - `interface UnitRow`, `interface AssignmentRow`, and `type SealiftSlots`;
   - `getUnitsAtHex`, `getHumanNavalIds`, `airliftRowIds`, `getHumanLandOptions`;
   - `loadAssignmentsAtHex`, `writeAssignmentsForHex`, `readSealiftStackState`, `executeSealiftSlotUpdate`.

   Then:
   - Module comment: "The stack popup's sealift rows for the human, and its slot edits."
   - It imports eligibility from `./sealiftHexEligibility`, never from `./sealift`.
   - If `sealift.ts` still uses `UnitRow` or `AssignmentRow` after the move, move that type to `sealiftHexEligibility.ts` instead, export it, and import it in both files.
   - In `sealift.ts`, add **Exact**: `export { executeSealiftSlotUpdate, readSealiftStackState } from './sealiftStackPopup';`
3. **`sealiftEmbarkOrders.ts`.** Move `applyTacticalEmbarkCommittedOrdersToStrategicDb`, `syncStrategicSealiftFromTacticalHexEmbarkPairs`, and `applyEmbarkOrdersForPlayer`, with their comments.
   - Module comment: "Embark orders from commanders and from battle commits, written to `unit_transport_assignments`."
   - It imports `canPlayerEmbarkFromHex` from `./sealiftHexEligibility`.
   - In `sealift.ts`, add **Exact**: `export { applyEmbarkOrdersForPlayer, applyTacticalEmbarkCommittedOrdersToStrategicDb, syncStrategicSealiftFromTacticalHexEmbarkPairs } from './sealiftEmbarkOrders';`
4. **`sealift.ts`** now holds the rest and the three re-export lines. No importer of `./sealift` changes.
5. **`sealiftSlotActions.ts`.** Move these from `gameActionsCore.ts`, with their comments:
   - `cancelHumanStrategicMarchOrdersForParentUnit` and `cancelHumanMovementOrdersForUnit` (private here too);
   - `getSealiftStackState`, `getTacticalSealiftStackState`, `updateSealiftSlot`, `updateTacticalSealiftSlot`.

   Then:
   - Module comment: "Human sealift reads and slot edits, strategic and in a battle."
   - In `gameActionsCore.ts`, add **Exact**: `export { getSealiftStackState, getTacticalSealiftStackState, updateSealiftSlot, updateTacticalSealiftSlot } from './sealiftSlotActions';`
   - Remove imports that are now unused. The `gameActions.ts` barrel is unchanged.
6. **`sealiftGameApiTypes.ts`.** Move the four members `getSealiftStackState`, `getTacticalSealiftStackState`, `updateTacticalSealiftSlot`, and `updateSealiftSlot` out of `GameApi`, with their comments, into `export interface SealiftGameApi`.
   - In `gameApiTypes.ts`, `export interface GameApi {` becomes `export interface GameApi extends SealiftGameApi {`, and you import it.
   - Give `SealiftGameApi` a comment block. Purpose: "The sealift part of the renderer bridge, kept beside its types."
7. **`preloadSealiftApi.ts`.** Move the four matching members of the `gameApi` object out of `preload.ts`, with their comments, into `export const sealiftPreloadApi = { … } satisfies SealiftGameApi;`.
   - It imports `ipcRenderer` from `electron` and `IPC_GAME` from `../shared/ipc/channels`.
   - In `preload.ts`, put `...sealiftPreloadApi,` where the four members were, and import it.
   - `satisfies GameApi` must still pass.
8. **`preloadIpcChannelParity.test.ts`.** In `run()`, also read `src/main/preloadSealiftApi.ts` and pass it to `assertNoLiteralChannels`.
9. **Test fixtures.** Move these helpers from `sealift.test.ts` into `src/main/testSupport/sealiftTestFixtures.ts`, exported, with their comments:
   - `withTempDb`, `pickHex`, `insertUnit`;
   - `setHexTerrain`, `setPortControl`, `prepareWaterHex`, `loadAssignments`.
10. **Split `sealift.test.ts`:**
    - A test that calls `readSealiftStackState` or `executeSealiftSlotUpdate` moves to `sealiftStackPopup.test.ts`.
    - Otherwise a test that calls `applyEmbarkOrdersForPlayer`, `syncStrategicSealiftFromTacticalHexEmbarkPairs`, or `applyTacticalEmbarkCommittedOrdersToStrategicDb` moves to `sealiftEmbarkOrders.test.ts`.
    - Every other test stays.
    - Each new file imports from the new module directly, and ends with its own `run()` that calls its tests in their original order and logs `<file name> passed`.
    - Remove the moved calls from `sealift.test.ts`'s `run()`.
11. **Split `gameActionsMultiSelect.test.ts`.** Move these to `src/main/gameActionsEmbarkedLand.test.ts`, with the same fixtures import style:
    - `testAssignMarchForEmbarkedLandUnitDoesNotAutoDebark`;
    - `testEmbarkedLandOnCoastalHexBlockedUntilManualDebark`;
    - `testEmbarkImmediatelyCancelsExistingHumanMovementOrder`;
    - any other test that calls `getSealiftStackState` or `updateSealiftSlot`.

    It ends with its own `run()`.
12. Check that every file over 600 lines lost lines.

### Tests to run

- New: `sealiftStackPopup.test`, `sealiftEmbarkOrders.test`, `gameActionsEmbarkedLand.test`.
- Existing:
  - `sealift.test`, `airlift.test`, `sealiftSlotAssignment.test`;
  - `gameActionsMultiSelect.test`, `computeTacticalBattleSnapshotDb.test`, `neutralTurn.test`, `sanitizeOpponentTacticalDraft.test`;
  - `preloadIpcChannelParity.test`, `preloadBundle.test`, `rendererStackPopoverContracts.test`.

### Verification

The Phase Check with `check:renderer-types`. Every moved test passes unchanged, and `check:circular` prints no cycle.

---

## Phase 3 — Move Muster, Air-Rule, and Playback Code Out of Large Files

**Goal:** The sea muster, the air rule text, the roster prompt assertions, and the air-drop playback field each live in a small file. Behavior does not change.

**Adds:**
- `src/main/operations/seaOperationStepHelpers.ts`
- `src/main/operations/seaOperationMuster.ts`, `src/main/operations/seaOperationMuster.test.ts`
- `src/main/testSupport/seaOperationTestFixtures.ts`
- `src/main/openRouter/promptSpec/gameRuleAirText.ts`, `src/main/openRouter/promptSpec/gameRuleAirText.test.ts`
- `src/main/testSupport/promptRosterAssertions.ts`

**Edits:**
- `src/main/operations/seaOperationAdvance.ts`, `src/main/operations/seaOperationAdvance.test.ts`
- `src/main/openRouter/promptSpec/gameRuleText.ts`
- `src/main/openRouter/openRouterMatrix.test.ts`
- `src/shared/ipc/readyTypes.ts`, `src/shared/ipc/airDropTypes.ts`

### Steps

1. **`seaOperationStepHelpers.ts`.** Move `elapsedTurns`, `cancelAll`, `ended`, and `continueOperation` from `seaOperationAdvance.ts`, exported, with their comments.
   - Module comment: "Steps every sea-operation phase shares."
   - Types come from `./operationStepTypes`.
2. **`seaOperationMuster.ts`.** Move `emptyMusterOutcome`, `gatherAction`, `loadAndSail`, and `advanceMuster`. Rename `advanceMuster` to the exported `advanceSeaMuster`. As a new export it takes one object (rule 10): `advanceSeaMuster(input: SeaMusterInput)`, where `SeaMusterInput` is `{ operation; facts; unitIds; carrierIds; releasedIds }`, exported and commented field by field. The body is unchanged.
   - Module comment: "The muster phase of a sea operation: gather, load, or give up."
   - It imports the helpers module, `seaMusterRules`, `liftRules`, and `operationRules`, never `seaOperationAdvance`.
   - `seaOperationAdvance.ts` imports `advanceSeaMuster` and the helpers.
3. **Fixtures.** Move `PORT`, `CITY`, `BEACH`, `operation`, `facts`, `placed`, and `spares` from `seaOperationAdvance.test.ts` into `src/main/testSupport/seaOperationTestFixtures.ts`, exported.
4. **Muster tests.** Move every test whose operation is in `phase: 'muster'` and that calls `advanceSeaOperation` into `seaOperationMuster.test.ts`. It still calls `advanceSeaOperation`, the public entry. Tests of `cancelSeaOperation` stay. Expected moves:
   - from "muster with nobody at the port…" to "a ground unit marched somewhere else is released with no action";
   - the three "a muster whose only ship…" / "a muster with its ship taken out…" tests.
5. **`gameRuleAirText.ts`.** Move `buildAirEmploymentRule` with its comment and the imports only it needs. It imports `type GameRuleTextGates` from `./gameRuleText`, as `gameRuleMissileText.ts` does.
   - In `gameRuleText.ts`, import it for `buildRulesSections` and add **Exact**: `export { buildAirEmploymentRule } from './gameRuleAirText';`
   - Remove imports that are now unused.
   - Add `gameRuleAirText.test.ts`, in `gameRuleText.test.ts`'s style, with **Exact** test names:
     - `the strategic air rule has five paragraphs`;
     - `the battle air rule is one paragraph about the footprint`;
     - `the air rule is empty without air units`.

     Assert against the current text.
6. **`promptRosterAssertions.ts`.** In `openRouterMatrix.test.ts`, move the block from the first `if (hasAir) {` (air operations status) through the end of the `transport_move` `if`/`else` into `export function assertRosterTransportGuidance(args: { systemPrompt: string; mask: number; hasAir: boolean; hasNaval: boolean }): void`.
   - The test calls it with the same values.
   - The two `const hasAir` / `const hasNaval` lines stay in the test.
7. **`AirDropPlaybackFields`.** In `airDropTypes.ts`, add `export interface AirDropPlaybackFields` holding the `airDropMoves?: AirDropAnimationMove[]` member with its current comment.
   - In `readyTypes.ts`, remove that member and add the interface to `ReadyResult`'s `extends` list.
   - Import it.

### Tests to run

- New: `seaOperationMuster.test`, `gameRuleAirText.test`.
- Existing: `seaOperationAdvance.test`, `seaMusterRules.test`, `operationTurnFlow.test`, `operationCommands.test`, `gameRuleText.test`, `referenceTools.test`, `openRouterMatrix.test`, `strategicLossAttribution.test`, `tacticalLossAttribution.test`.

### Verification

The Phase Check with `check:renderer-types`. Every moved test passes unchanged, and the files over 600 lines lost lines.

---

## Phase 4 — Air Operations Carry Every Listed Infantry Unit

**Goal:** An air operation with two infantry units musters, loads, drops, and cancels both. One-infantry operations are unchanged. Capacity is still 1 at runtime, so the engine still launches with one; tests build two-infantry operations directly.

**Edits:**
- `src/main/operations/airOperationAdvance.ts`, `airOperationAdvance.test.ts`
- `src/main/operations/operationTurnOrders.ts`, `operationTurnOrders.test.ts`
- `src/main/operations/airOperationCandidates.ts`
- `src/main/openRouter/briefingSectionsOperations.ts`, `briefingSectionsOperations.test.ts`
- `src/shared/operationTypes.ts` (comments only)

### Steps

1. Rewrite `airOperationAdvance.ts` to the Design's Air operations. Update the module comment and every function comment.
2. Update `operationTurnOrders` and its comments: "Orders for transit operations whose infantry is all aboard."
3. In `airOperationCandidates.ts`, apply the Design's Candidates.
4. In `briefingSectionsOperations.ts`, apply the Design's Options row, and update the `airPlanAndCost` comment.
5. In `operationTypes.ts`:
   - "`air` for one infantry unit dropped from an air unit" becomes "`air` for up to `AIRLIFT_INFANTRY_CAPACITY` infantry units dropped from one air unit";
   - "Air is the one infantry." becomes "Air is the infantry it carries."

### Tests

Copy the style of `airOperationAdvance.test.ts`. **Exact** names:

- `a two-infantry air muster marches the infantry that is not yet at the airport`. One unit is at the airport and one is away. Expect a `march` for the away unit only, no `embark`, and the phase stays `muster`.
- `a two-infantry air muster loads both and enters transit`. Expect the actions to be:
  - a `holdFire`;
  - `cancelOrder` and `embark` for the first unit;
  - `cancelOrder` and `embark` for the second unit.

  `next.unitIds` holds both.
- `an air muster goes on with the infantry left when one is gone`. One id is missing from `unitHexById`. `next.unitIds` holds only the present one.
- `an air muster releases infantry given its own order and keeps the other`. Expect `releasedIds` with that unit, `next.unitIds` with the other, and no action for the released unit.
- `a two-infantry transit that dropped both assaults with both`. Both are off the carrier and on the objective. Expect phase `assault`, both in `unitIds`, and a `defend` for each.
- `a two-infantry transit past its timeout unloads both`. Expect `unload` and `defend` for each, and the outcome `abandoned`.
- `cancelling a two-infantry air muster cancels both marches`.

In `operationTurnOrders.test.ts`: `a two-infantry air operation drops only when both are aboard`. With one aboard there are no orders. With both aboard at the landing there is one drop.

In `briefingSectionsOperations.test.ts`: `an air option with two infantry names them in the plural`. Expect `2 infantry units muster at`, `carries them`, or `ferries them to`. Keep the file under 600 lines.

### Tests to run

`airOperationAdvance.test`, `operationTurnOrders.test`, `airOperationCandidates.test`, `briefingSectionsOperations.test`, `briefingSectionsOperationsLift.test`, `operationTurnFlow.test`.

### Verification

The Phase Check with `check:renderer-types` (`operationTypes.ts` is shared).

---

## Phase 5 — An Air Drop Lands Every Infantry Unit Aboard

**Goal:** Strategic and tactical drops land, or lose, all the infantry aboard, and playback shows each one.

**Edits:**
- `src/main/gameActions/airDropValidation.ts`, `airDropValidation.test.ts`
- `src/main/gameActions/airDropResolution.ts`, `airDropResolution.test.ts`
- `src/main/tacticalBattle/tacticalAirDrop.ts`, `tacticalAirDrop.test.ts`
- `src/shared/ipc/airDropTypes.ts`, `src/shared/ipc/tacticalPlaybackTypes.ts` (comment only, if it names `infantryUnitId`)
- `src/renderer/rendering/orderDrawing.ts`
- `src/main/openRouter/possibleUnitActionsAirDrop.ts` (comments only)

### Steps

1. Apply the Design's Air drops.
2. Update every comment that says "one infantry" or names `infantryUnitId`:
   - the resolution module comment ("Lands embarked infantry from an air unit, or loses all of it…");
   - `AirDropPhaseResult`;
   - `resolveAirDropPhase`;
   - `tacticalAirDropRefusal` ("when the air unit carries at least one infantry unit");
   - `buildAirDropOutboundPlaybackMoves` ("plus one infantry move per id in `infantryUnitIds`");
   - `AirDropPlaybackFields`;
   - `airUnitCanListDrop` ("when at least one own infantry unit is aboard").
3. Fix every compile error from the field rename. Search for `infantryUnitId` across `src`; when you are done, no match may remain except `infantryUnitIds`.

### Tests

**Exact** names:
- `airDropValidation.test.ts`:
  - `a drop with two infantry aboard is legal`;
  - `a drop with nothing aboard needs infantry aboard`. It asserts the reason `Air drop needs infantry aboard.`
- `airDropResolution.test.ts`:
  - `a drop lands every infantry unit aboard`. Both are on the target, neither has an assignment, and `infantryUnitIds` holds both in id order.
  - `a shot-down drop loses every infantry unit aboard`. Both are in `removedUnitIds`, and `carrierIdByCargoId` maps both to the carrier.

  Insert the second assignment row directly; capacity is not checked here.
- `tacticalAirDrop.test.ts`: the same two cases for sub-units, plus `a battle drop with no infantry aboard needs infantry aboard`.

Update existing assertions on `infantryUnitId` to `infantryUnitIds`.

### Tests to run

`airDropValidation.test`, `airDropResolution.test`, `tacticalAirDrop.test`, `possibleUnitActionsAirDrop.test`, `strategicLossAttribution.test`, `tacticalLossAttribution.test`, `airFerryResolution.test`.

### Verification

The Phase Check with `check:renderer-types` and `build:renderer`.

---

## Phase 6 — Doubled Capacity in the Engine

**Goal:** Every engine check uses the shared rule: 4 slots per ship and 2 infantry per air unit, for units and sub-units, for commanders and operations.

**Edits:**
- `src/shared/carrierCargoRules.ts`, `src/shared/carrierCargoRules.test.ts`
- `src/main/gameActions/airlift.ts`, `airlift.test.ts`
- `src/main/gameActions/sealiftEmbarkOrders.ts`, `sealiftEmbarkOrders.test.ts`
- `src/main/tacticalBattle/tacticalOpponentOrderValidation.ts`, `tacticalEmbarkOrderValidation.test.ts`
- `src/main/operations/liftRules.ts`, `liftRules.test.ts`
- `src/main/operations/seaOperationMuster.test.ts`
- `src/main/openRouter/postureFit.ts`
- `src/main/operations/airOperationCandidates.test.ts`

### Steps

1. Rewrite `carrierCargoRules.ts` to the Design.
2. **`airlift.ts`.** `airliftEmbarkAllowed` calls `carrierAcceptsLandUnit({ carrierUnitType: args.carrierUnitType, landUnitType: args.landUnitType, aboardUnitTypes: args.embarkedLandUnitTypes })`.
3. **`sealiftEmbarkOrders.ts`:**
   - **`applyEmbarkOrdersForPlayer`.** Replace the naval branch's two capacity lines (anchors from Phase 0) with one `carrierAcceptsLandUnit` check on `existingCargo`. When it fails, log `logDebug('sealift applyEmbarkOrdersForPlayer skip full carrier', { unitId, navalUnitId })` and `continue`.
   - **`applyTacticalEmbarkCommittedOrdersToStrategicDb`.** In the air branch, replace the `COUNT(*)` query and `>= 1` test with:
     - a query of the parent carrier's other cargo types;
     - a `carrierAcceptsLandUnit` check.

     Keep the skip log. The naval branch is unchanged (Non-Goals).
4. **`tacticalOpponentOrderValidation.ts`**, in `validateTacticalEmbarkOrderForPlayer`:
   - **Air:** replace the `aboard >= 1` lines with a `carrierAcceptsLandUnit` check over the types embarked on that air sub-unit. Refuse with `carrierFullReason('air')`.
   - **Naval:** replace the armor and infantry checks with one `carrierAcceptsLandUnit` check. Refuse with `carrierFullReason('naval')`.
   - Update the export comments to "capacity matches `carrierAcceptsLandUnit`".
5. **`liftRules.ts`.** Apply the Design.
6. **`postureFit.ts`.** `2 * navalCap` becomes `NAVAL_INFANTRY_CAPACITY * navalCap`.
7. Fix every caller of the old three-argument `carrierAcceptsLandUnit` the build reports.

### Tests

- **`carrierCargoRules.test.ts`.** Replace both tests with these **Exact** names:
  - `a ship has four slots: four infantry, two armor, or one armor and two infantry`. Cover:
    - 4 infantry accepted, a 5th refused;
    - 2 armor accepted, a 3rd refused;
    - armor plus 2 infantry accepted, a 3rd infantry refused;
    - 3 infantry plus armor refused.
  - `an air unit carries two infantry and no armor`.
  - `cargo slots are laid out armor first, and armor covers the next slot`:
    - naval `[inf-b, arm-x, inf-a]` gives `[arm-x, covered by arm-x, inf-a, inf-b]`;
    - air `[inf-b, inf-a]` gives `[inf-a, inf-b]`;
    - a unit that does not fit is left out.
  - `the full reasons name the carrier's capacity`. Assert the Exact texts.
  - `embarked cargo fights only off the water, and never on air`. These are the old fight assertions.
- **`liftRules.test.ts`.** Replace the two tests:
  - `fillShip loads armor first, then infantry, up to four slots`;
  - `shipsNeeded counts four slots to a ship`. Cases: `['infantry','infantry','infantry','armor']` gives 2, `[]` 0, `['naval']` 0, four infantry 1, three armor 2.
  - `repeated fillShip uses exactly the ships shipsNeeded counts`. Check at least six mixes.
- **`sealiftEmbarkOrders.test.ts`.** Update `testApplyEmbarkOrdersEnforcesCapacityAndReassignment` to the new capacity: four infantry board, a fifth is skipped, and armor fits only with room.
- **`tacticalEmbarkOrderValidation.test.ts`.** Update the reasons, and add `a naval sub-unit takes four infantry sub-units`.
- **`seaOperationMuster.test.ts`.** Replace the two ship-count tests:
  - `a muster waits while a needed ship is still at sea`: six infantry, two ships, `ship-2` at sea. It stays in `muster` and marches `ship-2`.
  - `a muster sails once every needed ship is at the port`: six infantry, both ships present. `ship-1` takes four, `ship-2` takes two, and both carriers stay.
- **`airlift.test.ts`.** A commander's second infantry embark on air is accepted, and a third is skipped. Slot-editor cases are unchanged until Phase 8.
- **`airOperationCandidates.test.ts`.** Add `an air option takes up to two nearest infantry and times the farther one`. Fix any expectation that assumed one infantry.

### Tests to run

- The files above.
- `seaMusterRules.test`, `seaOperationAdvance.test`, `seaOperationCandidates.test`, `campaignLiftLaunch.test`.
- `operationCommands.test` (see the Large-file rule), `operationTurnFlow.test`, `postureFit.test`, `briefingSectionsPosture.test`, `campaignSeaRules.test`.
- `computeTacticalBattleSnapshotDb.test`.

### Verification

The Phase Check with `check:renderer-types`. A search of `src` (non-test) for `>= 2)`, `< 2`, and `aboard >= 1` near cargo code finds no capacity comparison outside `carrierCargoRules.ts`.

---

## Phase 7 — No Under-Strength Raids

**Goal:** A raid at the muster timeout sails only with at least 75% of its troops aboard.

**Edits:**
- `src/main/operations/operationRules.ts`
- `src/main/operations/seaMusterRules.ts`, `seaMusterRules.test.ts`
- `src/main/operations/seaOperationMuster.ts` (comment), `seaOperationMuster.test.ts`

### Steps

1. Add `SEA_RAID_TIMEOUT_MIN_SHARE`, and update the `OPERATION_MUSTER_TIMEOUT_TURNS` comment (Design).
2. Apply the Design's muster rule. Update the comments on `seaMusterReady` and on `SeaMusterReadyArgs.minUnitsAtTimeout` ("For a raid, the floor under `SEA_RAID_TIMEOUT_MIN_SHARE`; for a campaign lift, the whole minimum.").
3. In `seaOperationMuster.ts`, `advanceSeaMuster`'s Purpose becomes **Exact**: `The force marches to the port and boards when every troop and the ships those troops need are there. At the timeout a raid sails when the ships at the port can carry at least SEA_RAID_TIMEOUT_MIN_SHARE of its remaining troops and at least OPERATION_MIN_GROUND_UNITS; a campaign lift sails when they can carry its own minGroundUnits.` Wrap the three names in backticks.

### Tests

- **`seaMusterRules.test.ts`.** Add, with **Exact** names:
  - `a timed-out raid sails when its ships carry three quarters of its troops`: 8 remaining, 6 present, one ship. Not ready, because the ship carries 4. With two ships it is ready.
  - `a timed-out raid needs at least the minimum`: 2 remaining, 2 present, one ship → ready.
  - `a timed-out raid counts only what its ships can carry`: 6 remaining, 6 present, one ship → not ready, because 4 < 5.
  - `a timed-out campaign lift keeps its own minimum`: `minUnitsAtTimeout` 4, 4 carried → ready, even though fewer than 75% of 8 remain.
- **`seaOperationMuster.test.ts`.** Replace `muster timeout abandons one arrival and sails with two` with:
  - `muster timeout abandons a raid with one arrival of two`;
  - `muster timeout sails a raid that carries three of four`: three present, one ship, the fourth away. It sails with three, and the fourth gets `cancelOrder`.
  - `muster timeout abandons a raid that carries two of four`.

### Tests to run

`seaMusterRules.test`, `seaOperationMuster.test`, `seaOperationAdvance.test`, `campaignLiftLaunch.test`, `operationTurnFlow.test`.

### Verification

The Phase Check.

---

## Phase 8 — The Slot Editor Shows Every Slot

**Goal:** The human sees and edits 4 slots per ship and 2 per air unit, strategically and in a battle.

**Adds:**
- `src/shared/sealiftPendingEmbarks.ts`, `src/shared/sealiftPendingEmbarks.test.ts`
- `src/main/ipc/buildQueueSealiftIpcHandler.test.ts`

**Edits:**
- `src/shared/ipc/sealiftTypes.ts`, `src/shared/sealiftStackState.ts`, `src/shared/ipc/sealiftGameApiTypes.ts`
- `src/main/gameActions/sealiftSlotAssignment.ts`, `sealiftSlotAssignment.test.ts`
- `src/main/gameActions/sealiftStackPopup.ts`, `sealiftStackPopup.test.ts`
- `src/main/gameActions/sealiftSlotActions.ts`, `airlift.test.ts`
- `src/main/tacticalBattle/tacticalSealiftSlotUpdate.ts`, `tacticalSealiftStackState.ts`, `computeTacticalBattleSnapshotDb.test.ts`
- `src/main/ipc/buildQueueSealiftIpcHandler.ts`, `src/main/preloadSealiftApi.ts`
- `src/main/gameActionsEmbarkedLand.test.ts`, `src/main/rendererStackPopoverContracts.test.ts`
- `src/renderer/map/stackCalloutSealift.ts`, `src/renderer/tactical/tacticalEmbarkSealiftMerge.ts`

### Steps

1. **Types:**
   - In `sealiftTypes.ts`, apply the Design's IPC types.
   - Add `sealiftRowCargoIds` to `sealiftStackState.ts`.
   - In `sealiftGameApiTypes.ts`, add `TacticalSealiftSlotEditResult`, and change the two update members to `(payload: SealiftSlotEdit) => Promise<…>`. Update their comments.
2. **`sealiftSlotAssignment.ts`.** Rewrite it to the Design. Write `sealiftSlotAssignment.test.ts` first.
3. **`sealiftStackPopup.ts`.** Apply the Design's Strategic part.
4. **Tactical.** Apply the Design's Tactical part.
5. **`sealiftSlotActions.ts`.** `updateSealiftSlot(edit: SealiftSlotEdit)` and `updateTacticalSealiftSlot(edit: SealiftSlotEdit)`; the logs log `edit`'s fields. `applyTacticalSealiftSlotChangeInSession(edit)` and `projectTacticalSealiftSlotChange(snap, edit)` take the same shape.
6. **IPC:**
   - **`buildQueueSealiftIpcHandler.ts`.** Export `parseSealiftSlotPayload` with the new range, and pass the parsed object straight through. The rejection replies keep their text.
   - **`preloadSealiftApi.ts`.** `payload: SealiftSlotEdit`.
7. **Pending embarks.**
   - Add `sealiftPendingEmbarks.ts` (Design).
   - `tacticalEmbarkSealiftMerge.ts`'s function returns `mergePendingEmbarksIntoSealiftState({ base, pendingEmbark })`.
8. **Renderer.** Apply the Design to `stackCalloutSealift.ts`.
9. Search `src` for `slot1UnitId`, `slot2UnitId`, `slot2Disabled`, `debarkSlot`, `1 | 2`, and `SealiftSlotPair`. No match may remain in code, tests, or comments.

### Tests

- **`sealiftSlotAssignment.test.ts`.** Rewrite it. **Exact** names:
  - `cargo drops unknown units, duplicates, and armor on an air unit`;
  - `cargo beyond a carrier's slots is left out`;
  - `a slot edit outside the carrier's slots is refused`;
  - `a slot covered by armor cannot be edited`;
  - `armor needs two free slots`;
  - `a slot edit replaces that slot's unit`;
  - `a slot edit moves a unit from another carrier`;
  - `emptying a slot debarks its unit`;
  - `ship rows have four slots and air rows two`;
  - `a covered slot is disabled and has no debark`;
  - `controls are disabled at sea`.
- **`sealiftPendingEmbarks.test.ts`:**
  - `pending embarks join a ship's cargo, armor first`;
  - `a pending embark leaves the carrier it was on`;
  - `debark stays off on a ship where debark is not allowed`.
- **`buildQueueSealiftIpcHandler.test.ts`.** `the slot index is an integer from 1 to 4`: 1 and 4 accepted; 0, 5, 1.5, and `'1'` rejected.
- **`sealiftStackPopup.test.ts`.** Adapt the existing tests to `slots`, and add:
  - `a ship takes four infantry through the slot editor`;
  - `armor in the first slot covers the second`.
- **`airlift.test.ts`:**
  - slot 2 of an air unit now takes a second infantry;
  - slot 3 is refused with `That carrier has only 2 cargo slots.`;
  - armor is refused with `An air unit can carry only infantry.`
- **`computeTacticalBattleSnapshotDb.test.ts`, `gameActionsEmbarkedLand.test.ts`.** Adapt to `slots` and the object call.
- **`rendererStackPopoverContracts.test.ts`.** Expect:
  - `.flatMap((row) => sealiftRowCargoIds(row))`;
  - `row.slots.forEach((slot, index) => addSlotControl(index + 1, slot))`;
  - `const debarkEnabled = slot.debarkEnabled;`;
  - the unchanged `debarkBtn.style.visibility` and `slotRow.appendChild(debarkBtn)` strings.

### Tests to run

The tests above, plus `sealift.test`, `sealiftEmbarkOrders.test`, `tacticalEmbarkOrderValidation.test`, `preloadIpcChannelParity.test`, `preloadBundle.test`, `neutralTurn.test`.

### Verification

The Phase Check with `check:renderer-types` and `build:renderer`.

---

## Phase 9 — Prompt Texts

**Goal:** Commanders read the new capacities, the drop rule, the air-operation size, and the raid timeout rule, each in the place the Prompt Layout names.

**Adds:** `src/main/openRouter/promptSpec/operationRuleText.test.ts`

**Edits:**
- `src/main/openRouter/promptSpec/briefingGuideText.ts`, `coachingTextStrategic.ts`, `coachingTextTactical.ts`
- `src/main/openRouter/promptSpec/gameRuleAirText.ts`, `gameRuleAirText.test.ts`
- `src/main/openRouter/promptSpec/operationRuleText.ts`, `optionCopyText.ts`
- `src/main/openRouter/briefingSectionsSealift.ts`, `briefingSectionsSealift.test.ts`
- `src/main/openRouter/briefingSectionsAirOps.ts`, `briefingSectionsAirOps.test.ts`
- `src/main/testSupport/promptRosterAssertions.ts`
- `src/main/openRouter/consultPromptParts.test.ts`
- any test file found in step 3 (under 600 lines; otherwise the Large-file rule)

### Steps

1. Apply texts 1 to 12 and 14 of the Design's Prompt texts. Text 14 imports `OPERATION_MUSTER_TIMEOUT_TURNS` and `SEA_RAID_TIMEOUT_MIN_SHARE` from `../../operations/operationRules`. Turn a single-quoted string into a template literal where it now interpolates. Update each constant's comment.
2. In `promptRosterAssertions.ts`, the airlift assertion expects `An air unit carries up to 2 infantry units`.
3. Search every `*.test.ts` under `src` for these old fragments:
   - `1 armor or 2 infantry`, `carries one infantry`, `carry one infantry`, `one infantry sub-unit`;
   - `marches one infantry`, `embark one infantry`, `It carries one infantry unit`, `lands that infantry`, `2/2`, `Capacity Used`.

   Update each assertion to the new Exact text and run that file.
4. In `consultPromptParts.test.ts`, add `capacity rules sit in the system message and capacity use in the situation`. For a strategic roster with naval and air units:
   - `staticSystemText` includes the `NAVAL_EMBARK_RULE` text and `AIRLIFT_RULE_STRATEGIC`;
   - `situationText` includes neither;
   - `situationText` includes `/4`.

### Tests

- `briefingSectionsSealift.test.ts`: one armor aboard reads `2/4`, and two infantry plus one armor read `4/4`, in both modes.
- `briefingSectionsAirOps.test.ts`: `the Aboard cell lists every infantry unit aboard` (two ids, id order, `, `).
- `gameRuleAirText.test.ts`: assert the new paragraphs 3 and 4, and the tactical text.
- `operationRuleText.test.ts` (new, `node:test` style like `coachingText.test.ts`), **Exact** names:
  - `the sea paragraph states the raid timeout rule`. The block includes text 14's paragraph, and `at least 75% of its ground units`.
  - `the air paragraph says up to two infantry units`.
  - `the sea paragraph is still one paragraph`. Split the block on a blank line: the paragraph that starts `By sea,` holds the whole of text 14 and contains no line break.

### Tests to run

The files above, `coachingText.test`, `openRouterMatrix.test`, `gameRuleText.test`, `referenceTools.test`, `briefingSectionsOperations.test`, and every file step 3 found. Add `called off otherwise` to step 3's search list when you look for prompt-text assertions.

### Verification

The Phase Check.
- Every Exact text matches.
- No prompt heading changed.
- Paragraph counts are unchanged (five in the strategic air rule).

---

## Phase 10 — Docs, Version 3.6.0, Final Checks, and Hand-Off

**Goal:** The docs match the code, the version is 3.6.0, and the static checks pass.

**Adds:** `doc/release-notes/v3.6.0.md`

**Edits:**
- `doc/combat-rules-v3.md`, `doc/how-to-play.md`, `doc/hybrid-ai.md`
- `doc/region-vs-region.md`, `doc/game-vision-v2.md`, `doc/save-files.md`
- `doc/ux/stack-callout.md`, `doc/ux/modes-and-transitions.md`
- `doc/ai-commander-prompts/` files that contain a changed sentence or a moved symbol
- `README.md`, `doc/README.md`, `.github/ISSUE_TEMPLATE/bug_report.yml`
- `package.json`, `package-lock.json`

### Steps

1. **Search `doc/`** (not the historical documents or old release notes) for each of these, and update every copy that describes current behavior:
   - `90%`, `0.9`, `a tenth`;
   - `one infantry`, `1 armor or 2 infantry`, `one armor or two infantry`, `two infantry`;
   - `exactly one infantry`, `one infantry slot`, `slot 2`;
   - `infantryUnitId`, `buildAirEmploymentRule`, `advanceMuster`.
2. **`combat-rules-v3.md`:**
   - **§2 air move:** "An air unit carries up to 2 infantry units (`AIRLIFT_INFANTRY_CAPACITY`)…".
   - **§9.1:** the slot model (Locked Decision 2) with its constants, packing armor first, and the slot editor (Locked Decision 5).
   - **§9.2:** the muster timeout rule (Locked Decision 4).
   - **§12.6 air drops:** every embarked infantry sub-unit lands, and a shot-down drop destroys all of them.
   - **The knockout paragraph:** 80%.
3. **`how-to-play.md`:**
   - ship capacity, and the unit table's "Carries…" cells: "Carries 4 infantry, 2 armor, or 1 armor and 2 infantry";
   - air carries 2 infantry and a drop lands both;
   - the slot editor (4 dropdowns, armor fills two);
   - the knockout share at 80% in both places.
4. **`hybrid-ai.md`:**
   - the air operation paragraph (Locked Decision 6);
   - the muster paragraph: `shipsNeeded` is one ship per 4 slots, `fillShip` packs armor first, and the raid timeout rule with `SEA_RAID_TIMEOUT_MIN_SHARE`.
5. **`region-vs-region.md`, `game-vision-v2.md`, `doc/ux/modes-and-transitions.md`:** 80% and `ceil(0.8 × total)`.
6. **`save-files.md`:** "Since 3.6.0 that means a side that has already lost 80% of its home's original urban cells is knocked out at the end of the first turn after the load (3.3.0 through 3.5.0 used 90%)."
7. **`doc/ux/stack-callout.md`:**
   - ship rows have 4 slots;
   - armor fills its slot and the next, which shows that armor and is disabled;
   - cargo packs armor first;
   - the air row has 2 infantry slots.
8. **`doc/ai-commander-prompts/`:**
   - copy each changed prompt text into `example-strategic-prompt.md`, `strategic-prompt.md`, `tactical-prompt.md`, and `assembly-contract.md` wherever the old text appears;
   - the `information-decision-model.md` `WIN_CONDITIONS` row reads 80%;
   - `source-inventory.md` lists `gameRuleAirText.ts` beside `gameRuleMissileText.ts`.
9. **`doc/README.md`:**
   - in the sea-operation constants sentence, add `SEA_RAID_TIMEOUT_MIN_SHARE` after `OPERATION_MUSTER_TIMEOUT_TURNS`;
   - after that sentence, add **Exact**: ``Cargo capacity is `NAVAL_CARGO_SLOTS`, `AIR_CARGO_SLOTS`, `INFANTRY_CARGO_SLOT_COST`, and `ARMOR_CARGO_SLOT_COST` in `src/shared/carrierCargoRules.ts`. When one of those changes, update §9 of [combat-rules-v3.md](combat-rules-v3.md) in the same change.``
10. `npm version 3.6.0 --no-git-tag-version`.
11. **Release notes.** Copy `doc/release-notes/v3.5.0.md` to `v3.6.0.md`. In the copy:
    - change the version in the title line, the downloads table, and the executable names;
    - in **Saves**, keep "through 3.5.0 still opens" as written, and change "will not load in 3.5.0" to "will not load in 3.6.0". Append **Exact**: ` A 3.5.0 match plays by the 3.6.0 rules from its next turn: a side that has already lost 80% of its home's city cells is knocked out at the end of that turn, and ships keep their cargo with room for more.`
    - rename `## What's in 3.5.0` to `## What's in 3.6.0`, and replace its bullets with these four, **Exact**:
      - `- **Easier knockouts.** A side is now knocked out when other sides and Neutral hold 80% of its home's original city cells, down from 90%, on every map.`
      - `- **Bigger payloads.** A ship now has 4 cargo slots: infantry takes 1 and armor 2, so it carries 4 infantry, 2 armor, or 1 armor and 2 infantry. An air unit carries 2 infantry, and an air drop lands both. Ships and air units in battles carry the same.`
      - `- **Every slot in the stack popup.** A ship row shows 4 slots and an air row 2. Armor fills its slot and the next one.`
      - `- **No token invasions.** When a sea raid's muster times out, it sails only if the ships at the port can carry at least three quarters of its troops. Otherwise it is called off, and commanders are told to keep a raid's ships with it. The engine's air operations now fly up to 2 infantry units.`

    Run `node scripts/check-doc-links.cjs`.
12. **`README.md`:**
    - update the executable names and the version under Status to 3.6.0;
    - leave the test count for the user;
    - add above the `- **3.5.0** …` bullet, **Exact**: `- **3.6.0** knocks a side out at 80% of its home's city cells, doubles what ships and air units carry (4 cargo slots per ship, 2 infantry per air unit), and calls off a sea raid whose ships cannot carry three quarters of its troops when its muster times out.`
13. **`doc/README.md`:**
    - set the shipping version to 3.6.0;
    - add a `Release **3.6.0** …` paragraph, with the README bullet's text, directly before the `Release **3.5.0**` paragraph.
14. **`.github/ISSUE_TEMPLATE/bug_report.yml`:** placeholder `"3.6.0"`.
15. Run the Phase Check plus `npm run check:renderer-types` and `npm run build:renderer`, then `npm run rebuild:native:electron` last.
16. Fill in the Completion Log, and give the user the checklist below.

### Manual checklist for the user

Part of your final pass:

1. **Slot editor.** On a coast with a ship and a seaport:
   - load 4 infantry;
   - load armor into slot 1: slot 2 shows the armor and is disabled;
   - armor plus 2 infantry fits, and a third infantry is refused with the toast;
   - an air unit shows 2 infantry slots.
2. **Battle slot editor.** In a battle with a naval sub-unit, the same rules hold with sub-unit ids, and Ready keeps the cargo.
3. **Air drop.** Load 2 infantry on an air unit and drop on an empty enemy city. Both land, and playback shows both.
4. **Operations log.** In a commander match's debug log:
   - `seaMusterRules seaMusterReady` shows `needed` at a timeout;
   - a raid below 75% ends `muster-timeout`;
   - raids carry up to 4 units per ship.
5. **Knockout.** The knockout notice and dialog say 80%.
6. Run `npm run ui:smoke` and `npm run doc:shots`. The stack-popup screenshots change.

### Verification

The Phase Check passes, `check-doc-links` passes, and the Completion Log is complete.

---

## Reliability Checklist

- [ ] Every file over 600 lines ended with fewer lines than it started with, and was changed only by moves. The six files under Non-Goals are unchanged.
- [ ] `carrierCargoRules.ts` is the only capacity logic. Nothing outside it compares a cargo count with 1 or 2.
- [ ] `applySealiftSlotEdit` is the only slot-edit logic, used by both the strategic and the tactical edit.
- [ ] Repeated `fillShip` uses exactly `shipsNeeded` ships (tested).
- [ ] A one-infantry air operation behaves exactly as before (the existing tests pass unchanged).
- [ ] No `infantryUnitId`, `slot1UnitId`, `slot2UnitId`, `slot2Disabled`, `debarkSlot`, `SealiftSlotPair`, or `slotIndex: 1 | 2` remains.
- [ ] `parseSealiftSlotPayload` accepts only integers 1 to 4, and the engine checks the carrier's own slots.
- [ ] Every Exact text matches character for character. No prompt heading, section, or paragraph was added or removed.
- [ ] Capacity rules and the raid timeout sentence are in the system message, and capacity use is in the situation message (tested).
- [ ] `check:circular` prints no cycle. No plan vocabulary in code, tests, or `doc/`.

## Success Definition

- A side is knocked out at 80% on every map.
- Ships carry 4 slots and air units 2 infantry, for every side, in operations and in battles. The human edits every slot.
- An air drop lands every infantry unit aboard.
- A raid at its muster timeout sails only with at least 75% of its troops.
- Version 3.6.0, its release notes, and the docs are updated. The named tests and static checks pass.

## Phase 0 Inventory

| Item | Value |
| --- | --- |
| Static check results | Build, lint, circular, renderer types: clean before the first edit. |
| Pre-existing failures in named tests | None. |
| Anchors confirmed | Every symbol and file the plan names was found before editing. |
| Line counts | Files over 600 lines at the start only lost lines. Final counts: `gameActionsMultiSelect.test.ts` 736, `openRouterMatrix.test.ts` 647, `gameRuleText.ts` 718, `preload.ts` 863, `gameApiTypes.ts` 867, `readyTypes.ts` 888. |

## Defect Inventory

| Phase | Defect | Fix or reason for stopping |
| --- | --- | --- |
| 10 review | The air operation briefing line named one infantry unit; a blank `landUnitId` got the wrong refusal; `tactical-prompt.md` said one infantry. | Fixed, with tests. |

## Completion Log

| Phase | Result | Files changed beyond the lists | Sketch differences | Notes |
| --- | --- | --- | --- | --- |
| 0 | Baseline clean: no pre-existing failures in the named tests. | None. | None. | |
| 1 | Pass. | None. | None. | |
| 2 | Pass. `sealift.ts` 920 to 264, `gameActionsCore.ts` 729 to 578, `sealift.test.ts` 836 to 278, `gameActionsMultiSelect.test.ts` 871 to 736 (still over 600, only lost lines), `gameApiTypes.ts` 918 to 867, `preload.ts` 901 to 863. | `sealiftHexEligibility.ts`, `sealiftSlotActions.ts`, `sealiftEmbarkOrders.ts` (+ test), `sealiftStackPopup.ts` (+ test), `src/main/testSupport/sealiftTestFixtures.ts`, `src/shared/ipc/sealiftGameApiTypes.ts`, `src/main/preloadSealiftApi.ts`, `gameActionsEmbarkedLand.test.ts`. | `GameApi extends SealiftGameApi`; `preload.ts` spreads `sealiftPreloadApi`. | `preloadIpcChannelParity.test.ts` also reads `preloadSealiftApi.ts`. |
| 3 | Pass. `seaOperationAdvance.ts` 510, `seaOperationAdvance.test.ts` 358, `gameRuleText.ts` 718 (re-exports `buildAirEmploymentRule`), `openRouterMatrix.test.ts` 647, `readyTypes.ts` 888. | `seaOperationStepHelpers.ts`, `seaOperationMuster.ts` (+ test), `testSupport/seaOperationTestFixtures.ts`, `promptSpec/gameRuleAirText.ts` (+ test), `testSupport/promptRosterAssertions.ts`, `airDropTypes.ts` (`AirDropPlaybackFields`). | `blocks.cjs` end-of-function detection fixed during the move. | Files over 600 only lost lines. |
| 4 | Pass. | None. | `airOperationAdvance.ts` rewritten for several infantry. | `airOperationCandidates.test.ts` got its new test in Phase 6. |
| 5 | Pass. No `infantryUnitId` left except a local in `orderDrawing.ts`. | None. | None. | |
| 6 | Pass. | `seaOperationCandidates.test.ts`, `campaignLiftLaunch.test.ts` (one ship now carries four), `coachingText.test.ts` (Phase 9). | `fillShip`/`shipsNeeded` use `NAVAL_CARGO_SLOTS`. | |
| 7 | Pass. | None. | The timed-out branch uses `troopsShipsCanCarry` for raids too. | `needed` logged in `seaMusterReady`. |
| 8 | Pass. | `sealiftStackPopup.ts` trimmed from 368 to 312 lines (private row interfaces compacted). | `SealiftNavalRow` carries `carrierUnitType`. | `parseSealiftSlotPayload` exported. |
| 9 | Pass. | `coachingText.test.ts`, `briefingSectionsSealift.ts`, `briefingSectionsAirOps.ts` tests. | None. | Text 14 imports both operation constants. |
| 10 | Pass. | `doc/region-summary-1.md` (80% and the 90% history), `doc/ai-commander-prompts/example-strategic-prompt.md`. | The 3.5.0 bullets moved into a collapsed 3.5.0 block in `v3.6.0.md` so the page still lists every 3.x release. | Version 3.6.0. `npm run ui:smoke` and `npm run doc:shots` are left for the user. |
| Review | Pass after fixes. | `briefingSectionsOperations.ts` (+ test): the air operation bullet names every infantry unit, with plural verbs. `buildQueueSealiftIpcHandler.ts` (+ test): a blank `landUnitId` empties the slot. `doc/ai-commander-prompts/tactical-prompt.md`: air embark text matches `AIRLIFT_INFANTRY_CAPACITY`. `doc/how-to-play.md`: unit table re-padded. JSDoc rewritten on `writeAssignmentsForHex`, `readSealiftStackState`, and preload `updateSealiftSlot`. | None. | Left as is: when battle cargo is written back to the strategic carrier, the parent can end up over capacity, and the next popup write debarks what does not fit. This happened before this change too (two air sub-units could each take one infantry), so it is left for a separate change. |
