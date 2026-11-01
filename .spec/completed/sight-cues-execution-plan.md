# Sight cues execution plan

> **For the implementing agent:** Follow this plan from top to bottom, one phase at a time. Finish each phase's verification before you start the next one. When a check fails, stop and report the command, the actual output, and the expected output. Do not make a check pass by weakening a test or a smoke check. Do not commit or push. Do not build anything this plan does not name. Phase names in this file stay in this file. Never put them in code, comments, tests, `doc/`, or configuration.

**Goal:** A new Game Options checkbox, **Sight cues**, sits to the right of AI-Only Battles. While a match is being observed (Observe only, or Watch the rest after the human is knocked out), each strategic turn's playback can open with a new stage. In that stage, seat-colored beams run from every hex where an AI seat's units could see another owner's units at planning time, to the hex holding those units. The stage lasts 1.5 s and finishes before missile launches start. In the same change, every existing playback stage grows from 1000 ms to 1500 ms, so the two stages read as cause and effect.

**Architecture:** The main process works out the beams at the start of `executeReadyStrategicTurn`, from the same unit rows the AI commanders were briefed on. It stores a short per-seat memory of what each seat saw, so a beam can be marked as a new contact or an ongoing sighting. The beams ride back on `ReadyResult.sightCues`. The renderer adds one stage at the front of the playback timeline and draws the beams on the existing `#map-overlay` canvas with linear gradients.

**Tech stack:** TypeScript under `src/`, markup in `static/index.html`, chrome CSS in `static/newGameChrome.css`, Node `node:test`, H3 (`h3-js`), the 2D canvas, and the existing UI smoke run.

## Locked decisions

These come from the product owner. Do not change them.

- **Control.** A checkbox labeled `Sight cues`, element id `new-game-sight-cues-checkbox`, in the Game Options popover. It goes in the empty right half of the AI-Only Battles row of the `.new-game-victory` grid in [`static/index.html`](../static/index.html).
- **Storage.** The choice is stored with the match, in the `game_config` row `sight_cues` (`'1'` or `'0'`), the same way `ai_only_battles` is. A new match defaults to checked. Opening the new-game overlay sets the box back to checked. Changing the box does not rewrite a match that is already running. The value is sent only when Start game or New game succeeds.
- **Two parsers.** `sightCuesForRequest` is for a start payload: a boolean is stored as itself, and anything else stores `true`. `sightCuesFromStored` is for `game_config`: `'1'` is on, and anything else, including a missing row, is off. An older save therefore keeps today's playback.
- **Scope.** The stage runs only while observing, and only during strategic resolution. "Observing" means no human seat, or a human seat that is no longer active. Tactical battle playback never shows sight cues.
- **Fog of war off.** The stage never runs.
- **No stage.** When no AI seat is active, or no AI unit can see another owner's unit in another hex, the stage does not happen and adds no time.
- **Who spots.** Every unit of an active AI seat spots, except missiles, which see nothing. An air unit's vision is measured from the hex it stands on, which is its base airport.
- **What is a target.** Units of any other owner, including Neutral, other AI seats, and a knocked-out human's leftover units. Neutral has no commander, so it never spots.
- **Planning-time vision.** Use the unit rows as they are when Ready starts, before embarks, launches, strikes, or moves. Unit vision only: no forced home-region visibility, no stale ghosts, and no battles.
- **One beam per pair.** Draw one beam per spotter hex and target hex, for every pair where any non-missile unit of the seat in the spotter hex sees a unit of another owner in the target hex. A target watched from five hexes gets five beams.
- **Mutual sightings.** Draw both beams. No special handling.
- **New contact.** A beam is a new contact when its target hex holds at least one unit that the spotter's seat did not see, by unit vision, at the previous turn's planning. Otherwise it is an ongoing sighting. The memory is stored per seat in the `game_config` row `sight_cue_seen_units`, so it survives save and load.
- **View as.** "All sides" shows every seat's beams. A seat shows only that seat's outgoing beams.
- **Stage timing.** The beams draw in over 0.3 s, hold for 0.9 s, and fade over 0.3 s. That is 1.5 s total, and it ends before missile launches start.
- **Other stages.** Every existing playback stage changes from 1000 ms to 1500 ms: strategic and tactical, human matches and observed matches. Timed work inside a stage scales by the same 1.5x. Dice chip fade-in goes from 150 ms to 225 ms, dice chip fade-out from 250 ms to 375 ms, and the lightning and casualty pulse slows 1.5x. One constant drives all of it.
- **Style.** The table below is the specification.

| Property | Ongoing sighting | New contact |
| --- | --- | --- |
| Shape | Straight, solid line, fading from spotter to target | Same |
| Color | The spotter's seat map color | Same |
| Opacity | 45% at the spotter, fading to 5% | 85%, fading to 15% |
| Width | 0.5x the zoom-scaled strategic connector width | 0.8x |
| Casing | Order-line casing (white at 80%, 1.5 px pad), fading with the beam | Same |
| Ends | One unit radius from each hex center, with a round cap at the spotter and no arrowhead | Same |
| Extra | None | One expanding ring around the spotted hex, in the spotter's color |
| Draw order | First | On top |

- **Reduced motion.** When the system asks for reduced motion, show the beams statically during the hold.
- **Pilot tuning.** If dense fronts still look like a hairball, lower the ongoing beams' starting opacity first. Do not filter beams out.

## Implementation calls

The plan's author made these calls. They are locked for this plan, and the product owner reviews them along with it.

- **Where beams are computed.** The renderer only gets the after-resolution snapshot, so it cannot rebuild planning-time vision. `executeReadyStrategicTurn` takes one `listUnitsForSnapshot()` immediately after `getOrderedHexList()`, and before `prepareNeutralTransportsForTurn`. That function unloads or deletes Neutral transports, so the later `unitsBeforeMove` list is already resolution, not planning. Do not use `unitsBeforeMove` for sight cues.
- **Same hex.** A spotter hex never gets a beam to itself. Two owners in one hex is the battle case.
- **Memory contents.** For each active AI seat: every unit of another owner inside that seat's non-missile unit vision, including units in the spotter's own hex. On the first turn, or when the row is missing or unreadable, every beam is a new contact.
- **Memory updates.** Each strategic Ready rewrites the memory whenever the setting is on and fog is on, even while a human is still playing. "Watch the rest" then starts with the right history. Beams are only returned while observing.
- **Failures.** An error anywhere in the sight-cue step is logged at error level, and that turn has no sight cues. It must never fail Ready.
- **Melee pause.** The beams travel through the melee-pause snapshot and come back on the finalized `ReadyResult`. Do not put them on the `awaitingMeleeDecision` return. A turn that pauses for a battle plays its sight cues when strategic playback starts, before missile launches. Including the beams in `needsAnimation` is what makes battle entry wait for that stage.
- **Viewer filter.** The renderer filters beams once, when Ready returns, with `reportViewerSeatId()`, the same way every other playback list is filtered. Changing View as mid-playback does not change the beams already armed.
- **Stage alone.** The stage can play on a turn that has nothing else to animate. The turn-update toast keeps its current rule, which ignores sight cues.
- **Casualty timing.** Today, a playback frame with no stage flag set counts as "after all casualties". During the new opening stage, that would hide units that die later in the turn. The sight-cue stage maps to the earliest casualty timing instead (`'throughAirCasualties'`), so those units stay drawn.
- **Rings.** One ring per seat and target hex, for new contacts only. It appears when the beam arrives, at the end of the draw-in. During the hold it grows from one unit radius to two, and its opacity goes from 85% to 15%. It fades with the stage. It uses the same casing treatment as the beams. Its stroke is the new-contact beam width.
- **Caps.** The beam uses a round cap on both ends, because a canvas stroke takes one cap style. The target end is at 5–15% opacity, so its cap barely shows. This keeps the drawing code simple.
- **Short beams.** When two hex centers are closer on screen than twice the unit radius (when zoomed out), the inset at each end shrinks to a quarter of the beam's length. A beam shorter than 1 px is skipped.
- **Layer.** Paint the beams and rings after the unit tokens and before `drawResolutionCombatAndCasualtyOverlays`. A ring painted earlier is covered by the token. Dice chips are drawn inside that overlay call, so they stay above the beams. The line is inset by one unit radius, so it does not cross the token center.
- **Zoom.** Beams are not drawn at the zoom that hides strategic units (`shouldHideStrategicMapUnitsForZoom`), the same rule as dice chips. The stage still takes its time.
- **Saves.** Do not add `sight_cues` or `sight_cue_seen_units` to `MACHINE_LOCAL_CONFIG_KEYS`. A save keeps every other `game_config` row, which is how the setting and the memory survive save and load.
- **Reduced motion.** The stage keeps its full 1.5 s, so the timeline does not depend on the motion setting. Nothing shows during the draw-in and fade windows. During the hold, beams show at full style and rings show at their final size.
- **No snapshot field.** The renderer never reads the stored setting. Do not add `sightCues` to `GameStateSnapshot`.

## Global constraints

- Follow `AGENTS.md` and every file in `.cursor/rules/`. Never commit or push.
- No plan, phase, or workflow identifiers in code, comments, tests, `doc/`, or configuration.
- Every new or changed function, type, interface member, and module-level constant gets an orienting comment: Purpose, When to use, Expected outcome, Exceptions. Copy the style of [`src/shared/aiOnlyBattles.ts`](../src/shared/aiOnlyBattles.ts) and [`src/shared/resolutionPlaybackPhase.ts`](../src/shared/resolutionPlaybackPhase.ts). When you change a constant whose comment is generic boilerplate, such as `RESOLUTION_FADE_MS`, replace that comment with a real one.
- **Logging, main process only.** Public functions log at debug on entry with useful counts or ids. Caught exceptions log at error with context and the error object. Getters that do not change state log at trace. Use `logDebug`, `logTrace`, and `logError` from `src/main/logger.ts`. Shared modules (`src/shared/`) and renderer modules have no logger, and new ones stay that way.
- **Tests.** Cover the happy path and the essential failures of each new contract, and nothing more. Do not test markup, constant values, or a function that only forwards a call.
- **Where tests run.** `npm run build:main` compiles `src/main` and `src/shared`, including tests. `scripts/run-main-node-tests.cjs` runs every `*.test.js` under `dist/main` and `dist/shared`. Renderer modules are not tested, so logic that needs a test goes in `src/shared/` or `src/main/`.
- **Generated bundle.** Do not edit `static/renderer.js` by hand. Run `npm run build:renderer` after renderer changes.
- **Shell.** Windows PowerShell at `F:\Projects\Personal\agent-wars-public`. Run one command per line. Do not chain with `&&`.
- **Line endings.** Keep each file's existing line endings.
- **File size.** The desirable limit is 600 lines and the hard limit is 1000. Check with the Read tool before and after editing. These files are already near or over 600, so add only the lines this plan names: `src/renderer/rendering/gameScene.ts` (about 815), `src/shared/ipc/readyTypes.ts` (about 820), `src/renderer/core/state.ts` (about 860), `src/main/gameActions/readyStrategicResolutionPipeline.ts` (about 570), `src/main/gameActions/meleeInterceptReadyFinalize.ts` (about 550). New behavior goes in new files.
- **Arguments.** At most 6 named arguments per function. Use one parameter object when you need more.
- **Immutability.** Use `const` and `readonly` wherever a value does not change.
- **Naming.** Follow [`doc/naming-conventions-contract-v1.md`](../doc/naming-conventions-contract-v1.md). New directories and files under `src/` are camelCase. Do not use `Utils` or `Impl`. Do not rename existing frozen strings.
- **Docs.** Update the `doc/` files each phase names, in that phase. Take numbers and names from the code, and name the symbol they come from.

## Phase 1: Stage length becomes 1.5 s

**Outcome:** Every playback stage lasts 1500 ms. Dice chip fades and the combat pulse scale with it. There is no sight-cue behavior yet.

### Files

- Create `src/shared/resolutionPlaybackTiming.ts`.
- Modify [`src/renderer/rendering/resolutionPlayback.ts`](../src/renderer/rendering/resolutionPlayback.ts) (`RESOLUTION_FADE_MS`, `LIGHTNING_DURATION_MS`).
- Modify [`src/shared/combatDiceChips.ts`](../src/shared/combatDiceChips.ts) (`COMBAT_DICE_FADE_IN_MS`, `COMBAT_DICE_FADE_OUT_MS`).
- Modify [`src/renderer/rendering/resolutionCombatOverlays.ts`](../src/renderer/rendering/resolutionCombatOverlays.ts) (the two `Math.sin(... * 0.008)` pulses).
- Modify [`doc/ux/resolution-playback.md`](../doc/ux/resolution-playback.md).

### Steps

1. Create `src/shared/resolutionPlaybackTiming.ts`. Give it a module comment, then these exports, each with an orienting comment. Use integer arithmetic so every value is exact.

   ```ts
   export const RESOLUTION_STAGE_MS = 1500;
   export const RESOLUTION_PULSE_RADIANS_PER_MS = 8 / RESOLUTION_STAGE_MS;
   ```

   - `RESOLUTION_STAGE_MS` comment: the length of every playback stage (fade and lightning). Changing it rescales the timed work that the other constants derive from it. Keep it divisible by 20 so those durations stay whole milliseconds.
   - `RESOLUTION_PULSE_RADIANS_PER_MS` comment: the angular rate of the combat and casualty opacity pulse. It completes the same number of pulses per stage at any stage length. It was 0.008 when stages lasted 1000 ms.

2. In `resolutionPlayback.ts`, import `RESOLUTION_STAGE_MS`. Set `export const RESOLUTION_FADE_MS = RESOLUTION_STAGE_MS;` and `export const LIGHTNING_DURATION_MS = RESOLUTION_STAGE_MS;`. Replace both boilerplate comments with real ones: the fade stage length (air legs and movement), and the lightning stage length (combat and casualties).

3. In `combatDiceChips.ts`, import `RESOLUTION_STAGE_MS`. Set `COMBAT_DICE_FADE_IN_MS = (RESOLUTION_STAGE_MS * 3) / 20` (225) and `COMBAT_DICE_FADE_OUT_MS = RESOLUTION_STAGE_MS / 4` (375). Update both comments to say they scale with the stage length.

4. In `resolutionCombatOverlays.ts`, replace both `0.008` literals with `RESOLUTION_PULSE_RADIANS_PER_MS`, imported from `../../shared/resolutionPlaybackTiming`.

5. Search `src/` for other playback timing literals tied to the 1000 ms stage. Run `rg -n "1000|0\.008" src/renderer/rendering src/renderer/tactical src/shared/resolution* src/shared/combatDice*`. Only change values that are clearly per-stage playback timing, and list every change in your phase report. Do not touch tooltip delays, toasts, polling, or timeouts.

6. In `doc/ux/resolution-playback.md`:
   - Under Information Displayed, after the stage list, add: "Each stage lasts 1.5 s (`RESOLUTION_STAGE_MS` in `src/shared/resolutionPlaybackTiming.ts`), on the world map and in battles."
   - Add `src/shared/resolutionPlaybackTiming.ts` to Code Entry Points.

### Verification

```powershell
npm run build:main
node dist/shared/combatDiceChips.test.js
node dist/shared/resolutionPlaybackPhase.test.js
npm run typecheck:renderer
npm run lint
```

All of these must pass. `resolutionPlaybackPhase.test.ts` passes its own durations, so it does not change.

## Phase 2: The Sight cues setting

**Outcome:** The checkbox exists, it is checked by default, and Start stores `sight_cues`. The main process can read the setting. Nothing draws yet.

### Files

- Create `src/shared/sightCueSettings.ts` and `src/shared/sightCueSettings.test.ts`.
- Modify [`src/shared/ipc/ordersTypes.ts`](../src/shared/ipc/ordersTypes.ts) (`NewGameIpcPayload`, after `aiOnlyBattles`).
- Modify [`src/main/main.ts`](../src/main/main.ts) (the `IPC_GAME.newGame` handler, near line 328).
- Modify [`src/main/gameDb/resetGame.ts`](../src/main/gameDb/resetGame.ts) (`ResetGameForNewMatchOptions` and `resetGameForNewMatch`).
- Modify [`src/main/gameDb/gameConfigKv.ts`](../src/main/gameDb/gameConfigKv.ts) (add `readSightCuesEnabled` after `readAiOnlyBattles`).
- Modify [`static/index.html`](../static/index.html) and [`static/newGameChrome.css`](../static/newGameChrome.css).
- Modify [`src/renderer/chrome/controlTooltipText.ts`](../src/renderer/chrome/controlTooltipText.ts).
- Modify [`src/renderer/gameplay/newGameVictoryUi.ts`](../src/renderer/gameplay/newGameVictoryUi.ts), [`src/renderer/gameplay/newGameSidesUi.ts`](../src/renderer/gameplay/newGameSidesUi.ts) (`readNewGameSeatsStart`), and [`src/renderer/gameplay/newGame.ts`](../src/renderer/gameplay/newGame.ts) (the `newGame` payload near line 337).
- Modify [`scripts/ui-smoke/ui-smoke-new-game-checks.cjs`](../scripts/ui-smoke/ui-smoke-new-game-checks.cjs) (the `new-game-options-popover` check).
- Docs: [`doc/ux/new-game-dialog.md`](../doc/ux/new-game-dialog.md), [`doc/ux/control-tooltips.md`](../doc/ux/control-tooltips.md), [`doc/save-files.md`](../doc/save-files.md), [`doc/naming-conventions-contract-v1.md`](../doc/naming-conventions-contract-v1.md), [`doc/how-to-play.md`](../doc/how-to-play.md), [`doc/ui-style-guide.md`](../doc/ui-style-guide.md).

### Steps

1. Create `src/shared/sightCueSettings.ts`. It has no imports from main or renderer, and no logger. Each export gets an orienting comment.

   ```ts
   export const SIGHT_CUES_CONFIG_KEY = 'sight_cues';
   export const SIGHT_CUE_SEEN_UNITS_CONFIG_KEY = 'sight_cue_seen_units';
   export const DEFAULT_SIGHT_CUES = true;
   export const STORED_SIGHT_CUES_WHEN_MISSING = false;

   export function sightCuesForRequest(value: unknown): boolean {
     return typeof value === 'boolean' ? value : DEFAULT_SIGHT_CUES;
   }

   export function sightCuesFromStored(value: unknown): boolean {
     if (value === '1') return true;
     if (value === '0') return false;
     return STORED_SIGHT_CUES_WHEN_MISSING;
   }
   ```

2. Create `src/shared/sightCueSettings.test.ts`, using `node:test` and `node:assert/strict` like `aiOnlyBattles.test.ts`. Two tests:
   - A start request with no value, or a non-boolean, stores on. `false` stores off.
   - A stored `'1'` is on. `'0'`, a missing row (`undefined`), `null`, and an unknown string are off.

3. In `NewGameIpcPayload`, add `sightCues?: boolean;` after `aiOnlyBattles`, with a comment in that interface's style: "Omitted or not a boolean stores on. Stored as `sight_cues`. Changing the box does not rewrite a match that is already running."

4. In `ResetGameForNewMatchOptions`, add `readonly sightCues?: boolean;` after `aiOnlyBattles`, with a matching comment. In `resetGameForNewMatch`:
   - Next to `const aiOnlyBattles = ...`, add `const sightCues = sightCuesForRequest(options?.sightCues);`, and add `sightCues` to the existing `logDebug('gameDb resetGameForNewMatch', ...)` object.
   - Right after the `ai_only_battles` insert, add `run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [SIGHT_CUES_CONFIG_KEY, sightCues ? '1' : '0']);`.
   - Next to `run("DELETE FROM game_config WHERE key LIKE 'fog_new_contacts_%'");`, add `run('DELETE FROM game_config WHERE key = ?', [SIGHT_CUE_SEEN_UNITS_CONFIG_KEY]);`.

5. In the `main.ts` new-game handler, add `sightCues: payload?.sightCues ?? null` to the `logDebug('main game:newGame', ...)` object. Add `sightCues: payload?.sightCues` to the `resetGameForNewMatch({...})` call.

6. In `gameConfigKv.ts`, add `readSightCuesEnabled(ops: GameConfigKvDbOps): boolean`. Mirror `readAiOnlyBattles`: log at trace on entry, return `STORED_SIGHT_CUES_WHEN_MISSING` when `ops.hasDb && !ops.hasDb()`, read the row with `SELECT value FROM game_config WHERE key = ?` and `[SIGHT_CUES_CONFIG_KEY]`, parse it with `sightCuesFromStored`, and log the result at trace. Comment: a missing row (an older save) is off.

7. In `static/index.html`, inside `<div class="new-game-victory">` and right after the AI-Only Battles `</select>`, add:

   ```html
   <label class="new-game-check new-game-sight-cues" for="new-game-sight-cues-checkbox"><input type="checkbox" id="new-game-sight-cues-checkbox" checked data-control-tooltip="Leave this checked to start each turn's playback with lines from each AI commander's units to the units they could see when they planned. This applies only while you are observing." /> Sight cues</label>
   ```

8. In `static/newGameChrome.css`, after the `.new-game-victory > select` rule, add the rule below. Update the comment above `.new-game-victory` so it says Sight cues fills the right half of the AI-Only row.

   ```css
   /* Sight cues fills the right half of the AI-Only Battles row, set apart like Turn limit. */
   .new-game-victory > .new-game-sight-cues {
     grid-column: 3 / 5;
     padding-left: 10px;
   }
   ```

   The label is the fourth `label` in the grid, so the existing `label:nth-of-type(2)` rule does not touch it.

9. In `controlTooltipText.ts`, add `sightCuesCheckboxTooltipText` with the exact sentence from step 7. Its comment says: "`#new-game-sight-cues-checkbox`. The same sentence is the `data-control-tooltip` on that checkbox in `static/index.html`." Place it right after `aiOnlyBattlesSelectTooltipText`.

10. In `newGameVictoryUi.ts`:
    - Add `readNewGameSightCues(): boolean`. It reads `#new-game-sight-cues-checkbox`, returns `checked` when the element is an `HTMLInputElement`, and returns `DEFAULT_SIGHT_CUES` otherwise.
    - In `resetNewGameVictory`, set that checkbox's `checked` to `DEFAULT_SIGHT_CUES`. Update the function's Expected outcome to mention Sight cues.

11. In `newGameSidesUi.ts`, add `readonly sightCues: ReturnType<typeof readNewGameSightCues>;` to the start type next to `aiOnlyBattles`. Add `sightCues: readNewGameSightCues(),` to `readNewGameSeatsStart`. In `newGame.ts`, add `sightCues: seatsStart.sightCues,` next to `aiOnlyBattles: seatsStart.aiOnlyBattles,`.

12. In `ui-smoke-new-game-checks.cjs`, in the `new-game-options-popover` check:
    - Add `'#new-game-sight-cues-checkbox'` to `needs`.
    - After the AI-Only width checks, add `const sightCues = el('#new-game-sight-cues-checkbox');`.
    - Return a failure message when `Math.abs((sightCues.y + sightCues.h / 2) - (aiOnly.y + aiOnly.h / 2)) > 4`, which means it is not on the AI-Only row.
    - Return a failure message when `sightCues.x < aiOnly.x + aiOnly.w`, which means it is not to the right of the AI-Only select.
    - Use `fmt(...)` in both messages, like the existing checks.

13. Docs:
    - `doc/ux/new-game-dialog.md`, Victory bullet (line 20): replace "and the right half is empty" with a description of Sight cues (`#new-game-sight-cues-checkbox`) in the right half. Say it is checked when the overlay opens, that Start stores it as `sight_cues`, that a match with no row reads as off (`sightCuesFromStored`), that changing it does not rewrite a running match, and that it applies only while observing. Add `#new-game-sight-cues-checkbox` to the `static/index.html` list in Code Entry Points.
    - `doc/ux/control-tooltips.md`: add the tip sentence next to the AI-Only Battles sentence (around line 33). Add `sightCuesCheckboxTooltipText` to the Source Anchors list on line 199.
    - `doc/save-files.md`: after the `ai_only_battles` sentence on line 32, add: "The match rows `sight_cues` and `sight_cue_seen_units` stay in the file too. A missing `sight_cues` row reads as off (`sightCuesFromStored`)."
    - `doc/naming-conventions-contract-v1.md` line 48: add `'sight_cues'` and `'sight_cue_seen_units'` to the `game_config` keys list.
    - `doc/how-to-play.md` line 72: after the AI-Only Battles sentences, add one sentence. Sight cues, on by default, starts each watched turn's playback with lines showing which units each AI commander could see when it planned.
    - `doc/ui-style-guide.md`: find the New game live-chrome bullet that names AI-Only Battles (around line 206), and add Sight cues beside it in the same voice.

### Verification

```powershell
npm run build:main
node dist/shared/sightCueSettings.test.js
npm run typecheck:renderer
npm run lint
npm run build:renderer
npm run ui:smoke
```

All must pass, including the `new-game-options-popover` smoke check. Open one of the 800 x 600 screenshots under `.test/ui-smoke/<label>/` that shows Game Options, and confirm the checkbox and its label fit the row.

## Phase 3: Computing sightings (pure main-process logic)

**Outcome:** A pure function returns the beams and the per-seat memory for a list of units. It is not wired into Ready yet.

### Files

- Modify [`src/main/visibility.ts`](../src/main/visibility.ts).
- Create `src/shared/ipc/sightCueTypes.ts`, and export it from [`src/shared/ipc/index.ts`](../src/shared/ipc/index.ts).
- Create `src/main/sightCues/sightCueBeams.ts` and `src/main/sightCues/sightCueBeams.test.ts`.

### Steps

1. In `visibility.ts`, extract the per-unit body of `computeVisibleHexesForSide` into an exported function:

   ```ts
   export function visibleHexesFromUnit(
     unit: { readonly id: string; readonly unitType: string; readonly h3Index: string },
     mapHexSet: ReadonlySet<string>
   ): string[]
   ```

   Use this structural parameter type, not a `Pick` of the snapshot unit type. The sight-cue unit type in step 3 declares `unitType` as `string`, and `VISION_RANGE_BY_UNIT_TYPE` is a `Record<string, number>`.

   - It keeps today's behavior exactly: look up the radius in `VISION_RANGE_BY_UNIT_TYPE`; log at error and throw on an unknown type; take `gridDisk`; keep cells in `mapHexSet` that pass `isOnMap`; on a `gridDisk` error, log at error and fall back to the unit's own hex when it is in `mapHexSet`.
   - Log at trace on entry with the unit id.
   - `computeVisibleHexesForSide` then loops over its units and adds each result to its set.
   - Replace the boilerplate comment on `computeVisibleHexesForSide` with a real one, and give the new function its own.
   - `visibility.test.ts` must still pass unchanged.

2. Create `src/shared/ipc/sightCueTypes.ts`:

   ```ts
   import type { SeatId } from '../seatIds';

   export interface SightCueBeam {
     readonly seatId: SeatId;
     readonly fromH3Index: string;
     readonly toH3Index: string;
     readonly isNewContact: boolean;
   }
   ```

   Give the interface and each member an orienting comment:
   - `seatId` is the AI seat whose units spotted.
   - `fromH3Index` is the spotter hex, and the beam starts there.
   - `toH3Index` is the target hex. It is never the same as `fromH3Index`.
   - `isNewContact` is true when the target hex holds a unit this seat did not see at the previous turn's planning.

   Add `export * from './sightCueTypes';` to `src/shared/ipc/index.ts`, in alphabetical position with the other lines.

3. Create `src/main/sightCues/sightCueBeams.ts`:

   ```ts
   export interface SightCueUnit {
     readonly id: string;
     readonly player: string;
     readonly unitType: string;
     readonly h3Index: string;
   }

   export interface SightCueBeamsInput {
     readonly units: readonly SightCueUnit[];
     readonly spotterSeatIds: readonly SeatId[];
     readonly mapHexSet: ReadonlySet<string>;
     readonly previousSeenUnitIdsBySeat: Readonly<Record<string, readonly string[]>>;
   }

   export interface SightCueBeamsResult {
     readonly beams: readonly SightCueBeam[];
     readonly seenUnitIdsBySeat: Readonly<Record<string, readonly string[]>>;
   }

   export function computeSightCueBeams(input: SightCueBeamsInput): SightCueBeamsResult
   ```

   Algorithm, written as small private helpers with orienting comments:
   1. Group `input.units` by `h3Index` into a `Map<string, SightCueUnit[]>`.
   2. For each seat in `spotterSeatIds`, in the given order:
      1. Spotters are the units with `player === seat` and `unitType !== MISSILE_UNIT_TYPE` (from `src/shared/missileRules.ts`).
      2. Build `visibleByOrigin: Map<string, Set<string>>`. For each spotter, add every hex from `visibleHexesFromUnit(spotter, input.mapHexSet)` into the set for `spotter.h3Index`. Two spotters in one hex share one set, which gives one beam per hex pair.
      3. Targets in a hex are the units there with `player !== seat`.
      4. `seen` is every target id in every hex of every set, including the origin hex itself.
      5. `previous` is `new Set(input.previousSeenUnitIdsBySeat[seat] ?? [])`.
      6. For each origin, and each visible hex that is not the origin and has at least one target, push `{ seatId: seat, fromH3Index: origin, toH3Index: hex, isNewContact: targets.some((t) => !previous.has(t.id)) }`.
      7. Store `seenUnitIdsBySeat[seat]` as `[...seen].sort()`.
   3. Sort each seat's beams by `fromH3Index`, then `toH3Index`, with `localeCompare`. Keep seats in the given order.
   4. Log at debug on entry (unit count, seat count) and before returning (beam count, new-contact count).
   5. Do not catch errors here. The caller in the next phase catches them.

4. Create `src/main/sightCues/sightCueBeams.test.ts`. Copy the setup from `src/main/visibility.test.ts`: `center = latLngToCell(0, 0, 1)` and `mapHexSet = new Set(gridDisk(center, 4))`. No map is loaded, so `isOnMap` returns true. For a cell at distance exactly `k`, add a helper that returns the first cell, sorted, of `gridDisk(center, k)` minus `gridDisk(center, k - 1)`. Use `AI_SEAT_IDS[0]` and `AI_SEAT_IDS[1]` as seats and `NEUTRAL_OWNER_ID` for Neutral. Tests:
   1. An infantry of seat A at `center` and an infantry of seat B one hex away give exactly one beam, A from `center` to that hex, marked as a new contact. With seat B's unit id in A's previous memory, the same input gives an ongoing beam. `seenUnitIdsBySeat[A]` contains B's unit.
   2. When both A and B are spotters with adjacent infantry, there are two beams, one in each direction.
   3. A Neutral infantry one hex from A's infantry gets a beam from A. Neutral is never a spotter, so no beam starts at Neutral's hex.
   4. With an A infantry and a B infantry in the same hex, and nothing else, there are no beams, but B's unit is in `seenUnitIdsBySeat[A]`.
   5. When seat A's only unit is a missile, with B units in its hex and one hex away, there are no beams and A's seen list is empty.
   6. An A air unit at `center` gets a beam to a B unit three hexes away. An A infantry at `center` with that same B unit gives no beam.
   7. Two A infantry in `center` with one B unit one hex away give exactly one beam.

### Verification

```powershell
npm run build:main
node dist/main/visibility.test.js
node dist/main/sightCues/sightCueBeams.test.js
npm run lint
npm run naming:check
```

## Phase 4: Ready integration (main process)

**Outcome:** A strategic Ready in an observed match returns `sightCues` when the setting is on, fog is on, and there is at least one beam. Every Ready with the setting and fog on rewrites the memory row.

### Files

- Modify [`src/main/gameDb/fogState.ts`](../src/main/gameDb/fogState.ts) (export `isFogOfWarEnabled`).
- Create `src/main/sightCues/sightCueMemory.ts`, `src/main/sightCues/sightCueReadyStage.ts`, and `src/main/sightCues/sightCueReadyStage.test.ts`.
- Modify [`src/main/gameActions/readyStrategicResolutionPipeline.ts`](../src/main/gameActions/readyStrategicResolutionPipeline.ts).
- Modify [`src/main/gameActions/meleeInterceptPendingState.ts`](../src/main/gameActions/meleeInterceptPendingState.ts) (`MeleeInterceptReadyPauseSnapshot`).
- Modify [`src/main/gameActions/meleeInterceptStrategicResolve.ts`](../src/main/gameActions/meleeInterceptStrategicResolve.ts).
- Modify [`src/main/gameActions/meleeInterceptReadyFinalize.ts`](../src/main/gameActions/meleeInterceptReadyFinalize.ts) (`FinalizeReadyAfterMeleeArgs` and the result object).
- Modify [`src/shared/ipc/readyTypes.ts`](../src/shared/ipc/readyTypes.ts) (`ReadyResult`).
- Modify [`src/main/ipc/readyIpcResolutionMapping.ts`](../src/main/ipc/readyIpcResolutionMapping.ts) (`ReadyResolutionIpcMirrorSource` and `pickReadyResolutionIpcMirrorFields`).

### Steps

1. In `fogState.ts`, change `function isFogOfWarEnabled(ops: FogDbOps)` to `export function isFogOfWarEnabled(ops: Pick<FogDbOps, 'getOne'>)`. The body only uses `getOne`, so existing callers are unaffected. Replace its boilerplate comment: fog is on unless the row is `'0'` or `'false'`, and a missing row is on. Do not add logging. It is called on hot paths, and adding a trace line there is not part of this change.

2. Create `src/main/sightCues/sightCueMemory.ts`:
   - `readSightCueSeenUnits(ops: Pick<GameConfigKvDbOps, 'getOne'>): Record<string, string[]>`. Log at trace. Read the `SIGHT_CUE_SEEN_UNITS_CONFIG_KEY` row. A missing row returns `{}`. Otherwise `JSON.parse` it inside `try`. The parsed value must be a plain object whose values are all arrays of strings. Keep only entries that pass, so invalid entries are dropped. On a parse error, or when the value is not an object, log at error with the raw length and return `{}`.
   - `writeSightCueSeenUnits(ops: Pick<GameConfigKvDbOps, 'run'>, seenBySeat: Readonly<Record<string, readonly string[]>>): void`. Log at debug with the seat count and total id count. Write `INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)` with the key and `JSON.stringify(seenBySeat)`.

3. Create `src/main/sightCues/sightCueReadyStage.ts`:

   ```ts
   export interface SightCuesForReadyInput {
     readonly units: readonly SightCueUnit[];
     readonly hexList: readonly string[];
   }

   export function buildSightCuesForReady(input: SightCuesForReadyInput): SightCueBeam[] | undefined
   ```

   Imports, and no others: `logDebug` and `logError` from `../logger`; `dbGetOne`, `dbRun`, and `getSeatRoster` from `../gameDb`; `readSightCuesEnabled` from `../gameDb/gameConfigKv`; `isFogOfWarEnabled` from `../gameDb/fogState`; `activeAiSeatIds`, `findHumanSeat`, and `isSeatActive` from `../../shared/seatRoster`; `computeSightCueBeams` and `SightCueUnit` from `./sightCueBeams`; `readSightCueSeenUnits` and `writeSightCueSeenUnits` from `./sightCueMemory`; `SightCueBeam` from `../../shared/ipc/sightCueTypes`.

   Body:
   1. `logDebug('buildSightCuesForReady', { unitCount, hexCount })`.
   2. Inside one `try`:
      1. `const ops = { getOne: dbGetOne, run: dbRun };`, imported from `../gameDb`, the same way the pipeline calls `readAiOnlyBattles`.
      2. When `!readSightCuesEnabled(ops)`, log at debug with `{ skipped: 'setting_off' }` and return `undefined`. Do not write memory.
      3. When `!isFogOfWarEnabled(ops)`, log at debug with `{ skipped: 'fog_off' }` and return `undefined`. Do not write memory.
      4. `const roster = getSeatRoster();` and `const spotterSeatIds = activeAiSeatIds(roster);`. When the list is empty, log at debug with `{ skipped: 'no_active_ai' }` and return `undefined`.
      5. `const human = findHumanSeat(roster);` and `const observing = human == null || !isSeatActive(human);`. This is the same definition the pipeline uses, so do not add a different one.
      6. Call `computeSightCueBeams({ units: input.units, spotterSeatIds, mapHexSet: new Set(input.hexList), previousSeenUnitIdsBySeat: readSightCueSeenUnits(ops) })`.
      7. `writeSightCueSeenUnits(ops, result.seenUnitIdsBySeat);`
      8. Return `undefined` when `!observing` or `result.beams.length === 0`. Otherwise return `[...result.beams]`.
   3. `catch (err)`: `logError('buildSightCuesForReady failed; this turn has no sight cues', { unitCount }, err);` then return `undefined`.

4. In `readyStrategicResolutionPipeline.ts`, take the planning snapshot before Neutral transport prep. The current order is `hexList = getOrderedHexList()`, then `prepareNeutralTransportsForTurn(...)`, then `unitsBeforeMove = listUnitsForSnapshot()`. Change it to:

   ```ts
   const hexList = getOrderedHexList();
   const planningUnits = listUnitsForSnapshot();
   const sightCues = buildSightCuesForReady({ units: planningUnits, hexList });
   prepareNeutralTransportsForTurn(buildLatLngCoordinateMap(hexList));
   const unitsBeforeMove = listUnitsForSnapshot();
   ```

   Leave the rest of the function on `unitsBeforeMove`. Do not add `sightCues` to the `awaitingMeleeDecision` return near line 537.
   - In the `MeleeInterceptReadyPauseSnapshot` literal (line 503 and following), add `sightCues,` after `missileLaunchResult,`.
   - In the final `finalizeReadyTurnAfterMelee({...})` call, add `sightCues,`.

5. In `MeleeInterceptReadyPauseSnapshot`, add `sightCues?: SightCueBeam[];` with a comment: beams computed before the pause, passed into finalize on resume, absent when the turn has none. It is optional so a pending snapshot built by an older code path still type-checks.

6. In `FinalizeReadyAfterMeleeArgs`, add `sightCues: SightCueBeam[] | undefined;`. It is required with an explicit `undefined`, so both callers must pass it. In `meleeInterceptStrategicResolve.ts`, pass `sightCues: pending.sightCues,`. In the result object, after `missileLaunches`, add `sightCues: args.sightCues && args.sightCues.length > 0 ? [...args.sightCues] : undefined,`.

7. In `ReadyResult` (`readyTypes.ts`), add `sightCues?: SightCueBeam[];` near `missileLaunches`, importing the type from `./sightCueTypes`. Comment: present only on a completed strategic turn while observing, with the setting on, fog on, and at least one beam. The renderer plays it as the first stage. Keep the addition to this field and its comment, because this file is already over 600 lines.

8. In `readyIpcResolutionMapping.ts`, add `| 'sightCues'` to `ReadyResolutionIpcMirrorSource`. Add `sightCues: source.sightCues,` to `pickReadyResolutionIpcMirrorFields`, after `missileLaunches`. Without this step the renderer never receives the field.

9. Run `npm run build:main` and fix every compile error the new required finalize argument reveals. Search for other `finalizeReadyTurnAfterMelee(` callers, including tests, and pass `sightCues: undefined` where no beams apply.

10. Create `src/main/sightCues/sightCueReadyStage.test.ts`, copying the structure of `src/main/tacticalBattle/tacticalPartiesSeats.test.ts` (`withSeatedTempGameDb`, `ready`, and `clearMeleeInterceptPendingSnapshot` in `finally`).
    - Map choice: the first `listGameMaps()` entry with at least two side groups. Skip the test (`t.skip`) when there is none.
    - Before each `ready()`, write `ai_only_battles` as `'none'` so Ready never pauses for a battle.
    - Placement helper: copy `infantryAt` from `tacticalPartiesSeats.test.ts`. From seat A's hex, choose a cell in `gridDisk(aHex, 1)` other than `aHex` whose `hexes` row has `terrain` other than `'water'` (infantry can stand on land, coastal, and wetlands). Move seat B's first infantry there with `UPDATE units SET h3_index = ? WHERE id = ?`. Fail with a clear assertion that names `aHex` when either seat has no infantry or no such neighbor exists. Do not stack the two units on one hex, and do not change the turn phase. Reset already leaves it in planning.

    Tests:
    1. Two AI seats, with defaults (fog on, sight cues on because the request omits it). After placement, `ready()` succeeds. `result.sightCues` contains a beam with `seatId === AI_SEAT_IDS[0]`, `fromH3Index === aHex`, and `toH3Index` equal to the chosen neighbor. Every beam's `seatId` is an AI seat id. The `sight_cue_seen_units` row parses to an object whose `AI_SEAT_IDS[0]` list contains seat B's moved unit id.
    2. A human seat and an AI seat, with the human still active. Move the human infantry onto a passable neighbor of the AI infantry. `result.sightCues` is `undefined`. The `sight_cue_seen_units` row parses to an object whose AI seat list contains that human unit id.
    3. Two AI seats with `sight_cues` set to `'0'` before Ready. `result.sightCues` is `undefined`, and there is no `sight_cue_seen_units` row.
    4. Two AI seats started with `fogOfWarEnabled: false`. `result.sightCues` is `undefined`, and there is no `sight_cue_seen_units` row.

### Verification

```powershell
npm run build:main
node dist/main/sightCues/sightCueReadyStage.test.js
node dist/main/tacticalBattle/tacticalPartiesSeats.test.js
node dist/main/gameIpcHandlers.test.js
npm test
```

`npm test` must pass in full. It runs lint, the naming check, the renderer typecheck, every compiled test, and the notices check.

## Phase 5: Playback timeline and renderer data (no drawing yet)

**Outcome:** In an observed match with sight cues, playback opens with an empty 1.5 s stage, then plays missiles and the rest as before. Units that die later in the turn stay on the map during that opening stage.

### Files

- Modify `src/shared/resolutionPlaybackTiming.ts`.
- Modify [`src/shared/resolutionPlaybackPhase.ts`](../src/shared/resolutionPlaybackPhase.ts) and [`src/shared/resolutionPlaybackPhase.test.ts`](../src/shared/resolutionPlaybackPhase.test.ts).
- Modify [`src/shared/combatDiceChips.test.ts`](../src/shared/combatDiceChips.test.ts) (its `getResolutionPlaybackPhase` call near line 121).
- Modify [`src/shared/resolutionCasualtyDraw.ts`](../src/shared/resolutionCasualtyDraw.ts) and [`src/shared/resolutionCasualtyDraw.test.ts`](../src/shared/resolutionCasualtyDraw.test.ts).
- Modify [`src/renderer/rendering/resolutionPlayback.ts`](../src/renderer/rendering/resolutionPlayback.ts) (`ResolutionAnimationInput`, `ResolutionPlaybackState`, `buildResolutionPlaybackState`).
- Modify [`src/renderer/core/resolutionMoveAnimationTypes.ts`](../src/renderer/core/resolutionMoveAnimationTypes.ts).
- Create `src/shared/sightCueDrawModel.ts` and `src/shared/sightCueDrawModel.test.ts`. This phase adds only the viewer filter; the next phase adds the drawing math.
- Modify [`src/renderer/gameplay/readyHandler.ts`](../src/renderer/gameplay/readyHandler.ts).

### Steps

1. In `resolutionPlaybackTiming.ts`, add these exports with comments: the three windows of the sight-cue stage, and the stage total, which equals `RESOLUTION_STAGE_MS`.

   ```ts
   export const SIGHT_CUE_DRAW_IN_MS = RESOLUTION_STAGE_MS / 5;
   export const SIGHT_CUE_HOLD_MS = (RESOLUTION_STAGE_MS * 3) / 5;
   export const SIGHT_CUE_FADE_MS = RESOLUTION_STAGE_MS / 5;
   export const SIGHT_CUE_STAGE_MS = SIGHT_CUE_DRAW_IN_MS + SIGHT_CUE_HOLD_MS + SIGHT_CUE_FADE_MS;
   ```

2. In `resolutionPlaybackPhase.ts`:
   - Add `hasSightCues: boolean` and `sightCueMs: number` to `ResolutionPlaybackPhaseArgs`, with comments in that interface's style: "False gives that stage duration 0." and "Pass `SIGHT_CUE_STAGE_MS`."
   - Add `sightCueStart: number`, which is always 0, and `inSightCues: boolean` to `ResolutionPlaybackPhase`, with comments.
   - In `getResolutionPlaybackPhase`, set `const sightCueStart = 0;` and `const sightCueEnd = sightCueStart + (args.hasSightCues ? args.sightCueMs : 0);`. Change `const airStrikeOutboundStart = 0;` to `const airStrikeOutboundStart = sightCueEnd;`. Return `sightCueStart` and `inSightCues: args.hasSightCues && args.sightCueMs > 0 && args.elapsed >= sightCueStart && args.elapsed < sightCueEnd`.
   - Update the `airStrikeOutboundStart` member comment from "Always 0" to "Equals the sight-cue stage's end, or 0 when there is none". Update the module comment and the `getResolutionPlaybackPhase` comment so the stage order starts with the sight-cue stage.

3. Update the tests:
   - In `resolutionPlaybackPhase.test.ts`, add `hasSightCues: false` and `sightCueMs: 1500` to the `phase()` helper defaults. Add a `describe` with two tests:
     - With `hasSightCues: true` and `hasAirStrikeOutbound: true`: at `elapsed: 0`, `inSightCues` is true and `inAirStrikeOutbound` is false. `airStrikeOutboundStart` equals `sightCueMs`. At `elapsed: sightCueMs`, `inSightCues` is false and `inAirStrikeOutbound` is true. `totalMs` equals `sightCueMs + fadeMs`.
     - Without sight cues: `airStrikeOutboundStart` is 0 and `inSightCues` is false.
   - In `combatDiceChips.test.ts`, add `hasSightCues: false, sightCueMs: 0` to its `getResolutionPlaybackPhase` call.

4. In `resolutionCasualtyDraw.ts`, add `'inSightCues'` to the `Pick` in `resolutionCasualtyTiming`. Change the first condition to `if (phase.inSightCues || phase.inAirStrikeOutbound || phase.inAirStrikeLightning || phase.inAirStrikeCasualty) return 'throughAirCasualties';`. Update the comment: the sight-cue stage comes before every casualty, so every removed unit is still drawn. In `resolutionCasualtyDraw.test.ts`, add `inSightCues: false` to the `flags` object and add `assert.equal(resolutionCasualtyTiming({ ...flags, inSightCues: true }), 'throughAirCasualties');`.

5. Run `npm run build:main` and `npm run typecheck:renderer`. Fix every compile error from objects that build a `ResolutionPlaybackPhase` or a `ResolutionPlaybackPhaseArgs` by hand: add `sightCueStart: 0, inSightCues: false` or `hasSightCues: false, sightCueMs: 0`. Do not change their behavior.

6. In `resolutionPlayback.ts`:
   - Add `sightCues?: unknown[];` to `ResolutionAnimationInput`, with comment: "A non-empty list gives the sight-cue stage its duration."
   - Add `hasSightCues: boolean` to `ResolutionPlaybackState`.
   - In `buildResolutionPlaybackState`, compute `const hasSightCues = (anim.sightCues?.length ?? 0) > 0;`, return it, and pass `hasSightCues` and `sightCueMs: SIGHT_CUE_STAGE_MS` into `getResolutionPlaybackPhase`.

7. In `resolutionMoveAnimationTypes.ts`, add `sightCues?: SightCueBeam[];` to `ResolutionMoveAnimationState`, with comment: "Beams for the opening sight-cue stage, already filtered for the viewer when Ready returned. Absent on tactical playback and on turns with no sightings."

8. Create `src/shared/sightCueDrawModel.ts` with its module comment and:

   ```ts
   export function sightCueBeamsForViewer(
     beams: readonly SightCueBeam[],
     viewerSeatId: string | null
   ): SightCueBeam[]
   ```

   A `null` viewer (All sides) returns a copy of every beam. A seat id returns only that seat's beams. Create `sightCueDrawModel.test.ts` with one test that covers both.

9. In `readyHandler.ts`:
   - After the `visibleMissileLaunches` filter (near line 261), add `const sightCuesForPlayback = sightCueBeamsForViewer(readyResult.sightCues ?? [], reportViewerSeatId());`.
   - Rename the existing `const needsAnimation = ...` expression (near line 319) to `const needsCombatOrMovementAnimation = ...`, unchanged. Add `const needsAnimation = needsCombatOrMovementAnimation || sightCuesForPlayback.length > 0;`.
   - Change only the announce condition, `if (needsAnimation || holdForBattle || hasPendingDestroyedBattleParents())` near line 344, to use `needsCombatOrMovementAnimation`, so a turn whose only playback is sight cues keeps today's toast rule. Every other use stays on `needsAnimation`: `deferTacticalEntryUntilStrategicPlayback`, `scheduleResolutionPlaybackCompleteNotify`, and the `if (needsAnimation)` block that arms playback.
   - In the `S.resolutionMoveAnimation = {...}` literal, add `...(sightCuesForPlayback.length > 0 ? { sightCues: sightCuesForPlayback } : {}),`.

### Verification

```powershell
npm run build:main
node dist/shared/resolutionPlaybackPhase.test.js
node dist/shared/resolutionCasualtyDraw.test.js
node dist/shared/combatDiceChips.test.js
node dist/shared/sightCueDrawModel.test.js
npm test
npm run build:renderer
```

Then a manual check with `npm start`:
1. Start a regional match with Observe only, Sight cues checked, and fog on.
2. Turn on "Start the next turn when every commander is ready", or press Ready.
3. On turns where AI units see other owners, playback holds for about 1.5 s before missiles or air strikes start. Units that die later in the turn are still drawn during that pause.
4. In a match started with Sight cues unchecked, there is no pause.
5. In a human match, there is no pause, and stages now last 1.5 s.

## Phase 6: Drawing the beams and rings

**Outcome:** The opening stage draws the beams and rings exactly as the style table specifies.

### Files

- Modify `src/shared/sightCueDrawModel.ts` and `src/shared/sightCueDrawModel.test.ts`.
- Create `src/renderer/rendering/sightCueDrawing.ts`.
- Modify [`src/renderer/chrome/panelSlideHelpers.ts`](../src/renderer/chrome/panelSlideHelpers.ts) (export `reducedMotionRequested`).
- Modify [`src/renderer/rendering/gameScene.ts`](../src/renderer/rendering/gameScene.ts). Add one guarded call only; this file is already over 600 lines.
- Docs: [`doc/ux/resolution-playback.md`](../doc/ux/resolution-playback.md), [`doc/ux/map-overlays.md`](../doc/ux/map-overlays.md), [`doc/ui-style-guide.md`](../doc/ui-style-guide.md).

### Steps

1. Add the pure drawing model to `sightCueDrawModel.ts`. Give every export an orienting comment. Lines written `/** ... */` below stand for the full orienting comment the global constraints require.

   ```ts
   /** ... Tune here; for dense fronts lower ongoing.startOpacity first. casingAlpha matches ORDER_LINE_CASING_COLOR. */
   export const SIGHT_CUE_STYLE = {
     ongoing: { startOpacity: 0.45, endOpacity: 0.05, widthMultiplier: 0.5 },
     newContact: { startOpacity: 0.85, endOpacity: 0.15, widthMultiplier: 0.8 },
     ring: { startRadiusMultiplier: 1, endRadiusMultiplier: 2, startOpacity: 0.85, endOpacity: 0.15 },
     casingAlpha: 0.8,
   } as const;

   export interface SightCuePoint { readonly x: number; readonly y: number }

   export interface SightCueFrame {
     readonly drawProgress: number;        // 0..1 along the inset segment
     readonly alpha: number;               // 0..1 stage envelope applied to every opacity
     readonly ringProgress: number | null; // null hides rings; 0..1 grows them
   }

   export function sightCueFrameAt(stageElapsedMs: number, reducedMotion: boolean): SightCueFrame
   export function insetBeamSegment(from: SightCuePoint, to: SightCuePoint, inset: number):
     { readonly start: SightCuePoint; readonly end: SightCuePoint } | null
   export function sightCueRingTargets(beams: readonly SightCueBeam[]): SightCueBeam[]
   export function lerpNumber(from: number, to: number, t: number): number
   ```

   - `sightCueFrameAt`. Let `t = Math.max(0, stageElapsedMs)`, `D = SIGHT_CUE_DRAW_IN_MS`, `H = SIGHT_CUE_HOLD_MS`, and `F = SIGHT_CUE_FADE_MS`.
     - Normal: `drawProgress = Math.min(1, t / D)`. `alpha` is `1` while `t < D + H`, then `Math.max(0, 1 - (t - D - H) / F)`. `ringProgress` is `null` while `t < D`, then `Math.min(1, (t - D) / H)`.
     - Reduced motion: `inHold = t >= D && t < D + H`. Return `{ drawProgress: 1, alpha: inHold ? 1 : 0, ringProgress: inHold ? 1 : null }`.
   - `insetBeamSegment`. Let `L = Math.hypot(dx, dy)`. When `L < 1`, return `null`. Let `eff = L < inset * 2 ? L / 4 : inset`. Move `start` toward `to` by `eff` and `end` toward `from` by `eff`.
   - `sightCueRingTargets`. Return the first new-contact beam for each distinct `seatId` and `toH3Index` pair, in input order. The caller uses that beam's `fromH3Index` so the ring lands on the same world copy as the beam.
   - `lerpNumber`. Return `from + (to - from) * t`, with `t` clamped to `[0, 1]`.

2. Extend `sightCueDrawModel.test.ts` with these contract tests. Use `SIGHT_CUE_*` constants in the inputs, not literals.
   - Normal frames:
     - At 0: `drawProgress` 0, `alpha` 1, `ringProgress` null.
     - Halfway through the draw-in: `drawProgress` 0.5.
     - Halfway through the hold: `drawProgress` 1, `alpha` 1, `ringProgress` 0.5.
     - Halfway through the fade: `alpha` 0.5.
     - At `SIGHT_CUE_STAGE_MS`: `alpha` 0.
   - Reduced-motion frames: during the draw-in, `alpha` 0. During the hold, `drawProgress` 1, `alpha` 1, `ringProgress` 1. During the fade, `alpha` 0.
   - `insetBeamSegment`, with `from` at `(0, 0)`:
     - To `(100, 0)` with inset 18: start x is 18 and end x is 82.
     - To `(40, 0)` with inset 18: start x is 18 and end x is 22. Twice the inset is 36, so 40 still uses the full inset.
     - To `(30, 0)` with inset 18: start x is 7.5 and end x is 22.5.
     - To `(0.5, 0)` with inset 18: `null`.
   - `sightCueRingTargets`: two new-contact beams from different hexes to one target for one seat give one ring. An ongoing beam gives none. The same target for two seats gives two rings.

3. In `panelSlideHelpers.ts`, change `function reducedMotionRequested()` to `export function reducedMotionRequested()`. Keep the body. Widen the "When to use" line so it names both a panel slide and the sight-cue stage. The existing caller is unaffected.

4. Create `src/renderer/rendering/sightCueDrawing.ts`:

   ```ts
   export function drawSightCueBeams(
     ctx: CanvasRenderingContext2D,
     beams: readonly SightCueBeam[],
     stageElapsedMs: number
   ): void
   ```

   Use the existing helpers:
   - `hexCenterPx` and `hexCenterPxRelativeTo` from `../map/mapHelpers`.
   - `paletteForCurrentOwner` from `./ownerColors`.
   - `getCurrentRangeOverlayLineWidth('connector')` from `./rangeOverlayStroke`, which is the zoom-scaled strategic connector width.
   - `UNIT_RADIUS` and `ORDER_LINE_CASING_PAD` from `../core/constants`.
   - `withOpacityHex` from `./canvasColor`.
   - `reducedMotionRequested` from `../chrome/panelSlideHelpers`.

   Behavior:
   1. Return when `beams` is empty. Compute `frame = sightCueFrameAt(stageElapsedMs, reducedMotionRequested())`. Return when `frame.alpha <= 0` or `frame.drawProgress <= 0`.
   2. `const baseWidth = getCurrentRangeOverlayLineWidth('connector');`
   3. Order the beams with every ongoing beam first, then every new contact. Use two `filter` calls; do not sort in place.
   4. For each beam, in a private helper `drawOneBeam`:
      1. `color = paletteForCurrentOwner(beam.seatId)?.map`. Skip the beam when it is missing.
      2. `from = hexCenterPx(beam.fromH3Index)` and `to = hexCenterPxRelativeTo(beam.fromH3Index, beam.toH3Index)`.
      3. `seg = insetBeamSegment(from, to, UNIT_RADIUS)`. Skip the beam when it is `null`.
      4. `style = beam.isNewContact ? SIGHT_CUE_STYLE.newContact : SIGHT_CUE_STYLE.ongoing` and `width = baseWidth * style.widthMultiplier`.
      5. `tip` is the point `lerpNumber`-interpolated from `seg.start` to `seg.end` by `frame.drawProgress`.
      6. Build two gradients with `ctx.createLinearGradient(seg.start.x, seg.start.y, seg.end.x, seg.end.y)`. They span the full inset segment, so a drawing-in tip already shows the interpolated opacity.
         - Casing: stop 0 is `withOpacityHex('#ffffff', SIGHT_CUE_STYLE.casingAlpha * style.startOpacity * frame.alpha)`, and stop 1 uses `style.endOpacity` the same way.
         - Core: stop 0 is `withOpacityHex(color, style.startOpacity * frame.alpha)`, and stop 1 is `withOpacityHex(color, style.endOpacity * frame.alpha)`.
      7. Wrap the drawing in `ctx.save()` and `ctx.restore()`. Call `ctx.setLineDash([])` and set `ctx.lineCap = 'round'`. Stroke the path from `seg.start` to `tip` first with the casing gradient at `width + ORDER_LINE_CASING_PAD * 2`, then with the core gradient at `width`.
   5. Rings, in a private helper `drawRings`, after every beam and only when `frame.ringProgress !== null`. For each `sightCueRingTargets(beams)` entry:
      1. `color` comes from the palette. Skip the ring when it is missing.
      2. `center = hexCenterPxRelativeTo(target.fromH3Index, target.toH3Index)`.
      3. `radius = UNIT_RADIUS * lerpNumber(ring.startRadiusMultiplier, ring.endRadiusMultiplier, frame.ringProgress)`.
      4. `opacity = lerpNumber(ring.startOpacity, ring.endOpacity, frame.ringProgress) * frame.alpha`.
      5. `ringWidth = baseWidth * SIGHT_CUE_STYLE.newContact.widthMultiplier`.
      6. Wrap the ring in `ctx.save()` and `ctx.restore()`. Call `ctx.setLineDash([])`. Stroke a full circle first in white at `casingAlpha * opacity`, width `ringWidth + ORDER_LINE_CASING_PAD * 2`. Then stroke it in `withOpacityHex(color, opacity)` at `ringWidth`.
   6. No logging, since this is renderer code. No exceptions are expected. Canvas calls do not throw for these inputs.

5. In `gameScene.ts`, import `drawSightCueBeams`. In the strategic paint path, add the call below after the `if (!hideStrategicUnits) { drawUnits(...) }` block (near line 658) and before `drawResolutionCombatAndCasualtyOverlays` (near line 669). Do not put it in the earlier playback block near line 589, and do not add it to the tactical branch. `hideStrategicUnits` is the existing `shouldHideStrategicMapUnitsForZoom()` result.

   ```ts
   if (playbackPhase?.inSightCues && anim?.sightCues && !hideStrategicUnits) {
     drawSightCueBeams(ctx, anim.sightCues, elapsedStrategic - playbackPhase.sightCueStart);
   }
   ```

   This paints the ring around the token. The combat-overlay call after it keeps lightning and dice chips above the beams.

6. Docs:
   - `doc/ux/resolution-playback.md`:
     - Availability: say that playback also runs when an observed strategic turn has sight cues.
     - Information Displayed: add a first bullet for the stage. While observing with Sight cues on and fog on, beams from each spotter hex to each hex where that seat's units saw another owner's units at planning time, in the spotter's map color, fading from spotter to target. New contacts are stronger, with a ring. It draws in over 0.3 s, holds 0.9 s, and fades 0.3 s (`SIGHT_CUE_*_MS`). View as a seat shows only that seat's beams. Reduced motion shows them still during the hold.
     - Invariants: change the first invariant to include sight cues. Add "Sight cues never appear in a battle, while a human seat is playing, or when fog of war is off."
     - Strategic and Tactical Differences table: add a "Sight cues" row: "Opening stage while observing" against "None".
     - Code Entry Points: add `src/main/sightCues/sightCueReadyStage.ts` (`buildSightCuesForReady`), `src/main/sightCues/sightCueBeams.ts` (`computeSightCueBeams`), `src/shared/sightCueDrawModel.ts`, and `src/renderer/rendering/sightCueDrawing.ts`.
   - `doc/ux/map-overlays.md`:
     - Information Displayed: add a bullet for sight-cue beams and rings, drawn only during that stage. Explain why they use a fade with no arrowhead and no dash: movement lines, attack lines, and home borders already use every dash pattern.
     - Code Entry Points: add `src/renderer/rendering/sightCueDrawing.ts`.
   - `doc/ui-style-guide.md`, section 1.3 palette table: add a "Sight cue beam" row after "Order-line casing". The color is the spotter's seat map color. The opacities and widths come from `SIGHT_CUE_STYLE`. The casing is order-line casing scaled by the beam's opacity. The ring is for new contacts.

### Verification

```powershell
npm run build:main
node dist/shared/sightCueDrawModel.test.js
npm test
npm run build:renderer
npm run ui:smoke
```

Then a manual check with `npm start`, using a four-side regional Observe match with fog on:
1. Beams draw in from spotters, hold, and fade before missile and air-strike lines start.
2. New contacts are thicker and stronger, with one expanding ring per seat and target hex.
3. View as a seat shows only that seat's beams starting on the next turn. View as All sides shows every seat's.
4. Beams do not draw at the zoom that hides strategic units.
5. With Windows "Show animations" turned off, beams appear still during the hold only.

## Phase 7: Final sweep and pilot tuning

### Steps

1. Run the full verification.

   ```powershell
   npm test
   npm run build:renderer
   npm run ui:smoke
   ```

2. **Pilot tuning.** With `npm start`, watch a four-way front in an Observe match for at least five turns at the normal playback pace.
   - If dense fronts read as a hairball, lower `SIGHT_CUE_STYLE.ongoing.startOpacity` in steps of 0.05, down to no lower than 0.25.
   - Do not filter beams out, and do not change the new-contact values.
   - Record the final value in your report. Update `doc/ui-style-guide.md` and `doc/ux/resolution-playback.md` if they quote the number.

3. **Docs sweep.** Search `doc/` for `AI-Only Battles`, `observ`, `RESOLUTION_FADE_MS`, `LIGHTNING_DURATION_MS`, and `COMBAT_DICE_FADE`.
   - Make sure nothing still says stages last one second, and that `doc/ux/modes-and-transitions.md` (lines 13, 65, 108, and 142 mention observing) does not contradict the new stage.
   - Add a short sentence where a document lists what an observed turn shows.
   - Do not edit the historical documents listed in `AGENTS.md`.

4. **Rule audit.** Check each new and changed file:
   - Orienting comments are present.
   - The main process logs at debug on entry, at error in catches, and at trace in getters.
   - No plan or phase words appear.
   - Every file is under 1000 lines, and no new file is over 600.
   - No function has more than 6 named arguments.
   - `readonly` and `const` are used where values do not change.

5. Report the files changed, the tests added, every `doc/` file updated, any literal changed in the timing search from Phase 1, and the final tuned opacity.

## Out of scope

- No replay of past turns, no per-unit beams, and no tooltip on beams.
- No change to what AI commanders are told, to fog rules, or to `VISION_RANGE_BY_UNIT_TYPE`.
- No sight cues in tactical battles, in human-played matches, or with fog off.
- No `EXPECTED_USER_VERSION` change. The new data lives in `game_config` rows, which saves already carry.
