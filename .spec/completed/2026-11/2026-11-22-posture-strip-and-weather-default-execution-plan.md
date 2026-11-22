# Posture Strip and Weather Default Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** Two more changes for release 3.4.0:

1. **Weather icons start off.** The world map opens with the Weather layer off. The player still turns it on and off with the existing Weather button under the minimap. The new-game map preview keeps showing weather. It already follows the new-game dialog rather than the Weather button, and it does not change.
2. **Posture over time.** The charts dialog gains a strip under the Stance and Agreements strips. It has one row per AI commander and one cell per turn, and color names the posture. Shading adds two qualifications:
   - full color when the posture's lead activity ran that turn, light when it did not;
   - an outline when the commander never declared a posture and is on the engine's default (overland).

**Prerequisite:** `.spec/2026-11-22-campaign-by-sea-execution-plan.md` is complete in this working tree. This plan uses its `isCampaignLift` and `campaignApproachOf` helpers and its 3.4.0 release notes.

**Shape:** Phase 0 checks the prerequisite and records a baseline. Phase 1 turns Weather off by default. Phase 2 records who launched each spent missile. Phase 3 records each AI seat's posture every turn. Phase 4 builds the strip's data in shared code. Phase 5 draws the strip. Phase 6 updates the docs and the release notes, runs the final checks, and hands off.

**Tech:** TypeScript (Electron main, sandboxed renderer bundled with esbuild, shared modules), `better-sqlite3`, `node:test`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/check-circular-deps.cjs`.

**Shell:** Windows PowerShell. Working directory `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Targeted testing only.** Every phase ends with the Phase Check: static checks plus the tests that phase names. Never run `npm test`, `npm run ui:smoke`, or `npm run doc:shots`, and never run test files the phase does not name. The user runs the full test, review, and fix pass after this plan.
- **Stop only when a check fails** and you cannot fix it within the phase's file lists. Then revert that phase (see Backup and Revert), record the failure in the Defect Inventory, and stop. Tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**. Do not edit other files, except to remove an import that lint reports unused in a listed file, or to fix a test that fails only because of a change the phase names. Record every such file in the Completion Log.
- Find code by the quoted text, not by a line number.
- **Code blocks are sketches** unless marked **Exact**. Write the real code from the file you just read. When a sketch and the file disagree, the file wins; record the difference in the Completion Log. Text marked **Exact** is copied character for character, including punctuation and spacing. In Exact text, `${name}` means the value of that variable, interpolated in a template literal.
- **Tests come first.** Write a new module's test with the module, and run it before any existing code calls the module.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Set `$step` to the phase number and `$files` to that phase's **Edit** list.

```powershell
$step = '1'
$files = @('src/shared/mapViewMode.ts', 'src/shared/mapViewMode.test.ts')
$backup = Join-Path $env:TEMP "aw-posture-strip\step-$step"
foreach ($f in $files) {
  $dest = Join-Path $backup $f
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Copy-Item $f $dest -Force
}
```

To revert a phase:

```powershell
foreach ($f in $files) { Copy-Item (Join-Path $backup $f) $f -Force }
# Then delete every file the phase added (its "Add" list).
```

---

## Verification

### Native module

Tests that open a database load `better-sqlite3` under Node, and the companion plan ended by rebuilding it for Electron. Phase 0 therefore runs `npm run rebuild:native:node`, and Phase 6 runs `npm run rebuild:native:electron` last.

- **Native module lock.** If a rebuild fails with `EBUSY` on `better_sqlite3.node`, close any running Electron app, rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`, run the rebuild again, then delete the `.locked` file.

### Phase Check

Every phase from 1 to 6 ends with the Phase Check, run from the repo root:

```powershell
npm run build:main
npm run lint
npm run check:circular
```

- Add `npm run check:renderer-types` when the phase adds or edits any file under `src/shared` or `src/renderer`.
- Add `npm run build:renderer` when the phase adds or edits any file under `src/renderer` or `static/`. It rewrites `static/renderer.js`. That is expected.
- Then run, with `node dist/main/<path>.test.js` or `node dist/shared/<path>.test.js`, every test file the phase adds and every existing test file the phase lists under **Tests to run**, and no others. All must pass.
- No script runs tests under `src/renderer`. The strip's rules live in `src/shared` and are tested there. The renderer files are checked by the renderer typecheck and the bundle build only.
- `check:circular` must print **no** cycle.
- A static check or a named test that already failed in Phase 0 is not yours to fix. A **new** failure is.
- Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a check pass.
- **No test may call a real model.** Do not start the app.
- Record each Phase Check result in the Completion Log.

---

## Non-Goals

- No change to the new-game preview's weather icons, the hex tooltip's weather line, the weather bonus, or the battle header's weather.
- The Weather choice is still not saved between app runs. It starts off each time the app opens, and a choice lasts until the app closes, as the other layer choices do.
- No change to the Control, Tech, or Production defaults.
- No change to how postures are chosen, stored, or applied. The strip only reads them.
- No posture for the human seat. The human has no posture.
- No reconstruction of postures for turns recorded before 3.4.0. Those cells read "not recorded".
- No letters in posture cells. Color names the posture (the user's rule: colors or labels, not both).
- No change to the stance strip, the agreement strip, the relationship stacks, or the line charts.
- Do not edit anything under `.spec/completed/`, release notes of earlier versions, or the historical documents named in `AGENTS.md`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

The same rules as the companion plan's Conventions section apply here. In short:

- **Orienting comments** on every new or changed declaration and every field (`Purpose:` or `Contract:`, `When to use:`, `Expected outcome:`, `Exceptions:`), with no generic filler. Update the comment of every declaration whose behavior changes, so none still says Weather is on at start.
- **Logging (rule 02):** only `src/main` logs. Database readers use `logDebug`, per-cell or per-seat calculators use `logTrace`, and every catch uses `logError`.
- **Names:** use the file and symbol names given here.
- **No plan vocabulary:** never mention this plan, its phases, or its headings in code, comments, tests, or `doc/`.
- **Seat ids:** use the guards in `src/shared/seatIds.ts` (`isAiSeatId`), never literals, in production code.
- **Size limits (rule 09):** files under 600 lines where possible, and never 1000. `src/renderer/charts/chartsDialog.ts` (about 492 lines) may grow by at most 40 lines. `src/shared/agreementStrip.ts` (601) must not be edited.
- **Mutability (rule 13), arguments (rule 10),** and **tests (rule 03)** as in the companion plan.
- **Reuse (rule 06):** the strip uses `createStripTimeline` and `stripCssColor` from `stripTimelineCore.ts`, `appendBlock` from `chartsDialogBlocks.ts`, and the agreement block's legend-height approach. Do not copy their code.
- **Docs:** Phase 6 updates `doc/`. Do not edit `doc/` earlier.

---

## Locked Decisions

1. **Weather off by default** on the world map, in both views. `DEFAULT_WEATHER_ICONS_SHOWN = false`. The Weather button works as before. The new-game preview already ignores the button (`previewWeatherIcon` reads the dialog's month and weather bonus only), so it keeps showing weather.
2. **The strip's rows** are the match's AI seats in seat order. The human seat never has a row.
3. **One cell per recorded strategic turn**, the same turns as the other strips. A cell shows the posture recorded in that turn's `side_statistics`, which is written at the start of the turn and refreshed when the match is exported or saved, the same as relationship reports.
4. **Colors name the posture.** The CSS variables are **Exact**:
   - `--posture-overland: #C08A4E;`
   - `--posture-maritime: #4BA3E3;`
   - `--posture-strangle: #B07CD8;`
   - `--posture-blitz: #F2C14E;`
5. **Shading.**
   - A declared posture whose lead activity ran is drawn at full color.
   - A declared posture whose lead activity did not run is drawn at alpha 0.45, the stance strip's carried-over alpha.
   - The default posture (no stored row) is a 2 px outline in the overland color, with no fill, whether or not its activity ran. Its tooltip says which.
   - A cell that is not recorded, or a seat that is out or has no report, is the stance strip's empty cell: a 1 px `--chrome-muted` outline.
6. **Lead activity** (`acting`), read when the turn's statistics are written. For seat `s` on posture `p`:
   - `overland`: `s` has a stored campaign objective with `phase === 'assault'` and `campaignApproachOf(objective) === 'land'`.
   - `maritime`: `s` has a stored operation with `method === 'sea'` and `phase` of `'transit'` or `'assault'`, raid or campaign lift.
   - `blitz`: `s` has a stored operation with `method === 'air'`, in any phase.
   - `strangle`: a missile of `s` was spent since the previous strategic step (the set `recordTurnStatistics` already takes from `spentMissiles.ts`).
7. **Old turns** (no `postures` field, or an invalid one) are "not recorded".
8. **Release.** 3.4.0, the same release as the companion plan. This plan only adds bullets.

---

## Design

### Data

`src/shared/matchStatistics.ts` gains:

```ts
export interface PostureReport {
  readonly seatId: string;   // an AI seat id
  readonly posture: Posture; // stored posture, or DEFAULT_POSTURE when none is stored
  readonly declared: boolean; // true when a posture row is stored for the seat
  readonly acting: boolean;   // Locked Decision 6
}
```

`TurnStatistics` gains `readonly postures?: readonly PostureReport[]`. It is absent in turns recorded before 3.4.0.

`isTurnStatistics` (in `statisticsHistory.ts`) does **not** check `postures`. A bad `postures` value must never hide a turn's other statistics. Readers go through `postureReportsOf` (below), which validates.

### Strip data — `src/shared/postureStrip.ts` (new, no logging)

- `postureReportsOf(turn: TurnStatistics): readonly PostureReport[] | null`. It returns null when `postures` is absent or is not an array. Otherwise it returns the entries that have a string `seatId`, a `posture` in `POSTURES`, and boolean `declared` and `acting`, and drops the rest.
- `interface PostureStripCell { readonly recorded: boolean; readonly posture: Posture | null; readonly declared: boolean; readonly acting: boolean }`.
- `interface PostureStrip { readonly turns: readonly number[]; readonly rows: readonly { readonly seatId: string; readonly cells: readonly PostureStripCell[] }[] }`.
- `postureStrip(snapshot: MatchChartsSnapshot): PostureStrip`:
  - The rows are the seats with `kind === 'ai'`, sorted by `seatOrder`.
  - Each turn gives one cell per row:
    - `postureReportsOf(turn)` is null → `{ recorded: false, posture: null, declared: false, acting: false }`;
    - the report for the seat → `{ recorded: true, posture, declared, acting }`;
    - otherwise → `{ recorded: true, posture: null, declared: false, acting: false }`.
- `postureCellTooltipText(args: { name: string; cell: PostureStripCell; outTurn: number | null | undefined; turnNumber: number }): string`, **Exact** results:
  - not recorded: `` `${name}: not recorded` ``
  - `posture === null` and `outTurn != null && turnNumber >= outTurn`: `` `${name}: out of the match` ``
  - `posture === null` otherwise: `` `${name}: no report` ``
  - not declared: `` `${name}: overland by default, ${cell.acting ? 'acting' : 'idle'}` ``
  - declared: `` `${name}: ${cell.posture}, ${cell.acting ? 'acting' : 'idle'}` ``

### Legend — Exact

After the plot, one paragraph with class `charts-posture-legend`:

1. Four items, in `POSTURES` order. Each is a `span` with class `charts-posture-swatch`, its `background` set to `var(--posture-<name>)`, followed by the posture name and a space.
2. Then this text:

```text
Full color: the posture's lead activity ran that turn. Light: declared, but that activity did not run. Colored outline: overland by default, never declared. Gray outline: not recorded, or out of the match. Lead activity: overland, the land campaign assaulting; maritime, a sea operation at sea or landed; strangle, a missile launched; blitz, an air operation.
```

Block title, **Exact:** `Posture over time`. Empty text, **Exact:** `No AI commander has a posture.`

---

## Phase 0 — Prerequisite and Baseline

**Goal:** Confirm the companion plan is in place and record the starting state.

### Steps

1. Confirm each of these exists. If any is missing, stop and tell the user the companion plan must finish first.
   - `export function isCampaignLift` in `src/shared/operationPurpose.ts`;
   - `export function campaignApproachOf` in `src/shared/campaignTypes.ts`;
   - `doc/release-notes/v3.4.0.md`;
   - `"version": "3.4.0"` in `package.json`.
2. Run `npm run rebuild:native:node`, then `npm run build:main`, `npm run lint`, `npm run check:circular`, and `npm run check:renderer-types`. Record each result.
3. Run each existing test file named under **Tests to run** in Phases 1 to 4 once, and record any that already fail.
4. Record the line counts of `src/renderer/charts/chartsDialog.ts`, `chartsDialogTypes.ts`, `src/shared/matchStatistics.ts`, `src/main/matchStatistics/statisticsRecording.ts`, and `src/main/matchStatistics/spentMissiles.ts`.
5. Confirm these anchors exist exactly once:
   - `export const DEFAULT_WEATHER_ICONS_SHOWN = true;` in `src/shared/mapViewMode.ts`;
   - `id="map-mode-weather" class="map-mode-btn" aria-pressed="true"` in `static/index.html`;
   - `function spendMissile(unitId: string): void {` in `src/main/gameActions/missileLaunchResolution.ts`;
   - `const agreementBlock = appendBlock(body, 'Agreements over time');` in `chartsDialog.ts`;
   - `mapWeatherOff: 'map-weather-off',` in `scripts/ui-smoke/ui-smoke-scenes.cjs`.

### Verification

The Phase 0 Inventory is filled in.

---

## Phase 1 — Weather Starts Off

**Goal:** The world map opens without weather icons. The Weather button turns them on.

**Edits:** `src/shared/mapViewMode.ts`, `src/shared/mapViewMode.test.ts`, `src/renderer/map/mapViewModeState.ts`, `static/index.html`, `scripts/ui-smoke/ui-smoke.cjs`, `scripts/ui-smoke/ui-smoke-scenes.cjs`, `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`

### Steps

1. `mapViewMode.ts`: `export const DEFAULT_WEATHER_ICONS_SHOWN = false;`. Rewrite its comment: the map starts without weather icons until the player turns Weather on, the choice lasts until the app closes, and the new-game preview does not use it. Update the file's header comment where it describes Weather.
2. `mapViewModeState.ts`: update any comment that says Weather starts on.
3. `index.html`: the Weather button's `aria-pressed="true"` becomes `aria-pressed="false"`, so the first paint matches the stored choice. Leave its tooltip text as it is.
4. ui-smoke scripts, which this plan does not run (the user's final pass does). Update them so they still describe the app:
   - In `ui-smoke-scenes.cjs`, rename the key `mapWeatherOff` to `mapWeatherOn` with the id `'map-weather-on'`, and replace every use in the ui-smoke scripts.
   - In `ui-smoke.cjs`, the map-mode sequence clicks Weather to turn it **on**, records `SCENES.mapWeatherOn`, then clicks it again to turn it off. Update the comment above the sequence. It currently says Tech is recorded "with the weather icons still on", which becomes "with the weather icons off".
   - In `ui-smoke-map-chrome-checks.cjs`:
     - `map-mode-defaults` expects `'#map-mode-weather pressed=false'`;
     - rename `map-mode-tech-on-keeps-weather` to `map-mode-tech-on-leaves-weather`, expecting `'Weather pressed=false, Tech pressed=true'`;
     - `map-mode-layers-swapped` expects `#map-mode-weather pressed=false`;
     - rename `map-mode-weather-off` to `map-mode-weather-on`, expecting `'Weather pressed=true, Tech pressed=false'`;
     - update the comment on `TABS_SHOWN_SCENES` to say Weather turned on.
   - Search `scripts/` for any other use of `mapWeatherOff`, `map-weather-off`, or a `#map-mode-weather pressed=true` expectation, and update it. Record each file in the Completion Log.

### Tests

`mapViewMode.test.ts`: the default assertion becomes `assert.equal(DEFAULT_WEATHER_ICONS_SHOWN, false);`. If the test's name says on, rename it to say off.

**Tests to run:** `dist/shared/mapViewMode.test.js`, `dist/shared/newGameMapPreviewCore.test.js` if it exists. That second test proves the preview still shows weather.

### Verification

Phase Check, with the renderer typecheck and the bundle build.

---

## Phase 2 — Who Launched a Spent Missile

**Goal:** The statistics step can tell which seat spent each missile.

**Edits:** `src/main/matchStatistics/spentMissiles.ts`, `src/main/matchStatistics/spentMissiles.test.ts`, `src/main/gameActions/missileLaunchResolution.ts`

### Steps

1. `spentMissiles.ts`:
   - The pending and per-turn sets become `Map<string, string | null>` (unit id → owner seat id).
   - `noteSpentMissile(unitId: string, ownerSeatId: string | null)`.
   - `takeSpentMissileIds(turnNumber)` keeps its signature and its swap behavior, and returns the map's keys as a set.
   - Move the swap into a private `spentForTurn(turnNumber)` used by both readers.
   - Add `spentMissileSeatIds(turnNumber: number): ReadonlySet<string>`: the non-null owners for that turn, from the same swap. Calling it before or after `takeSpentMissileIds` for the same turn returns the same turn's owners.
   - Log `logTrace` with counts. Update the header comment.
2. `missileLaunchResolution.ts`, `spendMissile`: before the delete, read the owner with `dbGetOne<{ player: string }>('SELECT player FROM units WHERE id = ?', [unitId])?.player ?? null`, and pass it to `noteSpentMissile`.

### Tests

`spentMissiles.test.ts`:
- two missiles of two seats noted, then `takeSpentMissileIds(5)` returns both ids, and `spentMissileSeatIds(5)` returns both seats;
- `spentMissileSeatIds(5)` called first gives the same result;
- a missile noted after the take belongs to turn 6;
- a null owner is left out of the seats.

Keep the existing cases. Update their calls to pass an owner.

**Tests to run:** `dist/main/matchStatistics/spentMissiles.test.js`, `dist/main/gameActions/missileLaunchResolution.test.js`, `dist/main/matchStatistics/statisticsRecording.test.js`

### Verification

Phase Check.

---

## Phase 3 — Each AI Seat's Posture, Every Turn

**Goal:** Every `side_statistics` event from 3.4.0 on carries one posture report per active AI seat.

**Adds:** `src/main/matchStatistics/postureReportsRead.ts`, `src/main/matchStatistics/postureReportsRead.test.ts`
**Edits:** `src/shared/matchStatistics.ts`, `src/main/matchStatistics/statisticsRecording.ts`, `src/main/matchStatistics/statisticsRecording.test.ts`

### Steps

1. `matchStatistics.ts`: add `PostureReport` and `TurnStatistics.postures?` (Design, Data), with `Contract:` comments. Say that absence means the turn was recorded before posture reports existed.
2. `postureReportsRead.ts`:
   - Pure, exported: `postureActing(args: { posture: Posture; objective: CampaignObjective | null; operations: readonly Operation[]; launchedMissile: boolean }): boolean`, per Locked Decision 6. Log `logTrace`.
   - Reader, exported: `readPostureReports(args: { ops: GameConfigKvDbOps; seats: readonly SeatForStatistics[]; turnNumber: number }): PostureReport[]`. Log `logDebug`.
     - For each seat where `isAiSeatId(seat.seatId)` and `seat.outTurn == null`, in the given order: `stored = readPosture(ops, seatId)`, `posture = stored?.posture ?? DEFAULT_POSTURE`, and `declared = stored !== null`.
     - Then `acting` from `postureActing`, using:
       - that seat's entry of `readCampaignObjectives(ops)`;
       - its entry of `readOperations(ops)` (empty when absent);
       - `spentMissileSeatIds(turnNumber).has(seatId)`.
     - Read each of the three stores once per call, not once per seat.
   - Use the `ops` type the gameDb helpers already accept. `gameDbOps` is what `statisticsRecording.ts` passes.
3. `statisticsRecording.ts`:
   - `recordTurnStatistics` adds `postures: readPostureReports({ ops: gameDbOps, seats, turnNumber: step.turnNumber })` to the payload, inside the existing try.
   - `refreshedTurnStatistics` sets `postures` the same way with `recorded.turnNumber`, because a refresh rewrites the newest event after a consult may have changed the posture.

### Tests

- `postureReportsRead.test.ts` (copy `sideStatisticsRead.test.ts` for the database setup):
  - `postureActing`, one case each:
    - overland acting with an assault objective;
    - overland idle in assemble;
    - overland idle with an assault objective whose `approach` is `'sea'`;
    - maritime acting with a sea operation in transit;
    - maritime idle with one in muster;
    - blitz acting with an air operation;
    - strangle acting with a launched missile, idle without one.
  - `readPostureReports`:
    - a seat with no stored posture reports `overland`, `declared: false`;
    - a seat with `maritime` stored reports `declared: true`;
    - the human seat and a seat with `outTurn` set get no report.
- `statisticsRecording.test.ts`: a recorded payload has a `postures` array with one entry per active AI seat. Keep the existing cases.

**Tests to run:** the new test, `dist/main/matchStatistics/statisticsRecording.test.js`, `dist/main/matchStatistics/statisticsHistory.test.js`, `dist/main/matchStatistics/sideStatisticsRead.test.js`

### Verification

Phase Check, with the renderer typecheck (this phase edits `src/shared`).

---

## Phase 4 — The Strip's Data

**Goal:** Shared, tested functions turn a charts snapshot into the strip's rows, cells, and tooltip lines.

**Adds:** `src/shared/postureStrip.ts`, `src/shared/postureStrip.test.ts`

### Steps

Write `postureReportsOf`, `PostureStripCell`, `PostureStrip`, `postureStrip`, and `postureCellTooltipText` exactly as in Design, Strip data. No logging (shared).

### Tests

`postureStrip.test.ts` (copy the snapshot-building style of `matchChartSeries.test.ts`):
- a turn with no `postures` gives `recorded: false` cells;
- `postures: 'bad'` gives `recorded: false`;
- an entry with `posture: 'siege'` is dropped, so that seat's cell is `posture: null`;
- rows are AI seats in seat order, and the human has no row;
- a seat out on turn 7 reads `out of the match` on turn 8, and `no report` before then when its report is missing;
- each Exact tooltip text.

**Tests to run:** `dist/shared/postureStrip.test.js`, `dist/shared/matchChartSeries.test.js`

### Verification

Phase Check, with the renderer typecheck.

---

## Phase 5 — Drawing the Strip

**Goal:** The charts dialog shows "Posture over time" between the agreements block and the legend.

**Adds:** `src/renderer/charts/postureTimeline.ts`, `src/renderer/charts/postureStripBlock.ts`
**Edits:** `src/renderer/charts/chartsDialog.ts`, `src/renderer/charts/chartsDialogTypes.ts`, `static/shellChrome.css`, `static/chartsChrome.css`

### Steps

1. `shellChrome.css`: add the four posture variables (Locked Decision 4) directly after the `--stance-friendly` line.
2. `chartsChrome.css`, after `.charts-agreement-legend`:
   - `.charts-posture-legend` with the same rules as `.charts-agreement-legend`;
   - `.charts-posture-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin: 0 0.25rem 0 0.5rem; vertical-align: -1px; }`.
3. `postureTimeline.ts`: copy the structure of `relationshipTimeline.ts`, with `createPostureTimeline(args)` returning `{ update(strip: PostureStrip), resize, destroy }`.
   - `paintPostureCell` follows Locked Decision 5:
     - empty → 1 px `--chrome-muted` stroke, as `paintStanceCell` does;
     - not declared → `context.lineWidth = 2` and `strokeStyle = stripCssColor('--posture-overland', '#C08A4E')`, `strokeRect(x + 1, y + 1, width - 2, height - 3)`, guarding negative sizes with `Math.max(0, …)`;
     - declared → `globalAlpha = acting ? 1 : 0.45`, fill with `stripCssColor(\`--posture-${posture}\`, <the Exact hex>)`, then reset `globalAlpha`.
   - Draw no text in cells.
   - The tooltip heading is `` `Turn ${turn}` ``, with one line per row from `postureCellTooltipText`, `emphasis: false`. Get `outTurn` from a `outTurnOf(seatId)` argument the dialog passes.
   - Use the empty text from Design.
4. `postureStripBlock.ts`: copy the shape of `createAgreementStripBlock` **without** the dropdowns.
   - Its arguments are `titleRow`, `plotHost`, `width`, `plotHeightFor`, `nameOf`, `flagOf`, and `snapshot`.
   - It mounts the timeline in `plotHost` and puts the legend (Design, Legend) right after `plotHost`. Build it with DOM nodes, not `innerHTML`.
   - It sizes the plot as the agreement block does, with `legendSpace()`.
   - It returns `{ titleRow, update(snapshot), resize(width, height), destroy() }`.
   - `outTurnOf` reads `snapshot.seats`.
   - `update` calls `postureStrip(snapshot)`.
5. `chartsDialogTypes.ts`: add `readonly postures: PostureStripBlockHandle` to `ChartsView`, with a `Contract:` comment.
6. `chartsDialog.ts`:
   - In `buildBody`, after the agreements block and before `buildLegend`, build `appendBlock(body, 'Posture over time')` and `createPostureStripBlock({...})`, and store the result in `view`.
   - In `applySnapshot`, call `view.postures.update(snapshot)`.
   - In `resizeCharts`, call `view.postures.resize(width, chartPlotHeight(height, view.postures.titleRow.offsetHeight))`.
   - In `destroyView`, call `view.postures.destroy()`.
   - Update the comment of `buildBody` ("In order: …") and any comment that lists the dialog's blocks.

### Tests

None run. The renderer has no test script. The rules are tested in Phase 4.

### Verification

Phase Check, with the renderer typecheck and the bundle build. `chartsDialog.ts` grew by at most 40 lines.

---

## Phase 6 — Docs, Release Notes, Final Checks, and Hand-Off

**Goal:** The docs and the 3.4.0 notes describe both changes, and the static checks pass.

**Edits:** `doc/ux/charts-dialog.md`, `doc/ux/minimap.md`, `doc/ux/map-surface.md`, `doc/how-to-play.md`, `doc/ui-style-guide.md`, `doc/match-statistics.md`, `doc/match-recording.md`, `doc/release-notes/v3.4.0.md`, `README.md`, `doc/README.md`

### Steps

1. `doc/ux/charts-dialog.md`:
   - Add item 4, **Posture over time**, after Agreements over time, and renumber the legend and the line charts.
   - Add a "The posture strip" section: rows, cells, colors, shading, lead activity, the not-recorded rule, the tooltip texts, and that `postureStrip.ts` holds the rules.
   - Add it to the quarter-height sentence, since its block counts its legend.
2. `doc/ux/minimap.md`: "On when the app opens." for Weather becomes "Off when the app opens."
3. `doc/ux/map-surface.md`: "Weather is on when the app opens." becomes "Weather is off when the app opens." Keep the sentence that the preview follows the dialog, not the Weather tab.
4. `doc/how-to-play.md`:
   - In Map modes, say Weather is off by default, as Control says it is on by default.
   - In Charts, add the posture strip to the list of what the charts show, and to the image caption only if the caption lists the strips.
5. `doc/ui-style-guide.md`: in the strategic status icons bullet, say Weather starts off.
6. `doc/match-statistics.md` and `doc/match-recording.md`: the `side_statistics` payload has `postures`, one report per active AI seat. Name the fields, say it is absent before 3.4.0, and say a refresh rewrites it.
7. `doc/release-notes/v3.4.0.md`: under `## What's in 3.4.0`, add these two bullets after the companion plan's bullets, **Exact**:
   - `- **Weather icons start off.** The world map opens without weather icons. The Weather button under the minimap turns them on and off as before. The new-game preview still shows the starting month's weather.`
   - `- **Posture over time.** The charts gain a strip under Agreements over time: one row per AI commander and one cell per turn, colored by posture. Full color means the posture's lead activity ran that turn, light means it did not, and an outline means the commander never declared a posture. Turns recorded before 3.4.0 show as not recorded.`

   In **Saves**, add: `Turns played before 3.4.0 show as not recorded in the posture strip.`
8. `README.md` and `doc/README.md`: append to the 3.4.0 bullet and paragraph, **Exact:** ` The world map starts with weather icons off, and the charts gain a Posture over time strip.`
9. Run `node scripts/check-doc-links.cjs`.
10. Run the Phase Check with the renderer typecheck and `npm run build:renderer`, then `npm run rebuild:native:electron` last.
11. Fill in the Completion Log and give the user the checklist below.

### Manual checklist for the user

Part of your final pass:

1. **Weather.** Start or load a match. The Weather button reads off and no weather icons show. Click it: icons appear. Open New game: the preview shows weather icons whatever the Weather button says.
2. **Posture strip.** Open the charts (C). "Posture over time" sits under Agreements over time, with one row per AI commander.
3. **Old turns.** Load the 3.3.0 save: its turns read "not recorded" (gray outlines). New turns fill in.
4. **Shading.** A commander on the default shows a colored outline. One that declared `maritime` shows full blue on turns with a sea operation at sea or landed, and light blue otherwise.
5. **ui-smoke.** Run `npm run ui:smoke` in your pass. Its map-mode expectations were updated for Weather starting off.

### Verification

The Phase Check passes, `check-doc-links` passes, and the Completion Log is complete.

---

## Reliability Checklist

- [ ] No file outside a phase's lists was edited, except those recorded.
- [ ] A turn with a malformed `postures` value still shows on every other chart (`isTurnStatistics` ignores `postures`).
- [ ] `readPostureReports` runs inside `recordTurnStatistics`'s existing try, so a failure cannot stop statistics from being recorded.
- [ ] The human seat never gets a row or a report.
- [ ] No cell draws text, and all colors come from the four CSS variables, with the Exact hex values as fallbacks.
- [ ] The new-game preview's weather code was not edited.
- [ ] `check:circular` prints no cycle, and `chartsDialog.ts` grew by at most 40 lines.
- [ ] No plan vocabulary in code, tests, or `doc/`.

## Success Definition

- Weather starts off on the world map, and the button turns it on.
- Every turn from 3.4.0 on records each active AI seat's posture, whether it was declared, and whether its lead activity ran.
- The charts show the posture strip with the Exact colors, shading, legend, and tooltips. Older turns read not recorded.
- Docs and the 3.4.0 notes describe both changes, and the named tests and static checks pass.

## Phase 0 Inventory

| Item | Value |
| --- | --- |
| Prerequisite present | Yes: `isCampaignLift`, `campaignApproachOf`, `doc/release-notes/v3.4.0.md`, version 3.4.0 |
| Static check results | `rebuild:native:node`, `build:main`, `lint`, `check:circular` (no cycle), `check:renderer-types` all ok |
| Pre-existing failures in named tests | None. `postureStrip.test.js` does not exist yet (Phase 4) |
| Line counts | chartsDialog.ts 460, chartsDialogTypes.ts 122, matchStatistics.ts 427, statisticsRecording.ts 96, spentMissiles.ts 49 |
| Anchors confirmed | All five found exactly once |

## Defect Inventory

| Phase | Defect | Fix or reason for stopping |
| --- | --- | --- |

## Completion Log

| Phase | Result | Files changed beyond the lists | Sketch differences | Notes |
| --- | --- | --- | --- | --- |
| 0 | Done | None | None | Ran rebuild:native:node first. |
| 1 | Passed: build:main, lint, check:circular, check:renderer-types, build:renderer, mapViewMode and newGameMapPreviewCore tests | None. The only `scripts/` files touched are the three listed ui-smoke files; no other use found | None | Test name reworded to say weather off. `static/renderer.js` rewritten by build:renderer. |
| 2 | Passed: build:main, lint, check:circular, spentMissiles, missileLaunchResolution, statisticsRecording tests | None | `takeSpentMissileIds` returns a copy `Set` of the map keys | Added test cases for seats, order independence, next-turn, null owner. |
| 3 | Passed: build:main, lint, check:circular, check:renderer-types, postureReportsRead, statisticsRecording, statisticsHistory, sideStatisticsRead tests | None | `postureActing` takes a named `PostureActingInput` and `readPostureReports` a named `PostureReportsArgs` interface; `ops` typed `Pick<GameConfigKvDbOps, 'getOne'>` | `refreshedTurnStatistics` comment updated. Maritime acting is method `sea` in transit/assault regardless of purpose. |
| 4 | Passed: build:main, lint, check:circular, check:renderer-types, postureStrip (5 tests) and matchChartSeries tests | None | Added an exported `PostureStripRow` and `PostureCellTooltipArgs` interface for the inline row type and the tooltip argument object | No logging, shared module. |
| 5 | Passed: build:main, lint, check:circular, check:renderer-types, build:renderer | None | `outTurnOf` is read from the block's latest snapshot | `chartsDialog.ts` grew by 14 lines (492 to 506). Header comment of `chartsDialog.ts` also updated. |
| 6 | Passed: build:main, lint, check:circular, check:renderer-types, build:renderer, check-doc-links, postureStrip test, rebuild:native:electron | None | `doc/ux/minimap.md` line on layer defaults and `doc/how-to-play.md` image alt text also updated | Docs updated: ux/charts-dialog, ux/minimap, ux/map-surface, how-to-play, ui-style-guide, match-statistics, match-recording, release-notes/v3.4.0, README, doc/README. |
