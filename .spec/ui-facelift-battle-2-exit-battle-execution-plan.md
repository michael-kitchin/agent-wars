# UI Facelift Battle, Plan 2 of 3: Exit Battle in the Header

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Move Exit Battle (`#tactical-exit-btn`) from the control at the bottom of the map into the battle header, beside Settings, with the same rules and tip, and remove the old control (`#tactical-battle-hud`).

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 2 of the three that build the spec's Phase 5; [ui-facelift-battle-execution-plan.md](ui-facelift-battle-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- Exit Battle sits in a tip host in the battle header, so its tip shows while it is disabled. It keeps its id, its click handler, and its rules: enabled while the player plans a beat, disabled while a beat resolves or plays back, and hidden while the annihilation dialog is open.
- It uses the shared button colors, at the header's 30 px height, with an exit icon. The block that holds it hides with it while the annihilation dialog is open.
- `#tactical-battle-hud` and its styles are removed. The build popup's outside-click check no longer names it.
- Code that named the old control now names Exit Battle: the battle-start side effect `refreshTacticalExitHud` becomes `refreshTacticalExitButton`, and the comments that named it, in nine renderer files, follow. No behavior changes there.
- The smoke run leaves the battle with Exit Battle after the beat, or closes the result if a side was wiped out, and records the world map that follows. The battle checks cover Exit Battle in the header.
- `doc/` says where Exit Battle is.

**Out of scope:**

- The force bar (plan 3).
- The annihilation dialog, which is unchanged.

**How this plan was checked:** every step below was applied to a copy of the repository in the state the previous plan leaves, and the result matched the verified files exactly. On that result, the fast loop and the smoke run passed against the real app in Electron. The full tests ran once, after the last plan, and the test total below follows from the tests this plan adds and removes. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

## Ground Rules

- Follow `AGENTS.md` and every rule in `.cursor/rules/`. These matter most here:
  - **Never commit or push** (rule 11). The reviewer commits after reading your report.
  - **No plan or phase identifiers** (rule 12) in code, comments, tests, `doc/`, or configuration: no plan numbers, no "Phase 5", and no "facelift" outside `.spec/`. Every block in this plan already follows this.
  - Do not add, reword, or "improve" anything this plan does not ask for. The blocks already meet the orienting-comment, file-size, naming, logging, and documentation rules. If you think something is wrong, finish the plan as written and say so in your report.
- **Shell:** Windows PowerShell, at the repository root `F:\Projects\Personal\agent-wars-public`. Run one command at a time; do not chain commands with `&&`.
- **Line endings:** your working tree uses Windows line endings (CRLF). The blocks in this plan show plain lines. Treat each line break in a block as the file's own line break, and keep each file's existing line endings. If your editing tool matches text byte for byte, convert a block to CRLF before matching, or edit line by line.
- **How to apply a step:**
  - "Create" and "Replace the whole file": write exactly the block's content.
  - "Find ... Replace ...": the Find text occurs exactly once in the file at that moment. Match it exactly, including leading spaces. A Find block can be part of a single line.
  - Every code block starts at the left margin of this document, so every space inside a block is part of the text.
  - If a Find text is missing, or occurs more than once, stop and report the step number, the file, and what you found. Do not adapt the edit.
- `static/renderer.js` is a committed build output. It changes whenever `npm run build:renderer` or `npm run ui:smoke` runs. Leave it changed; do not revert it.
- No step needs an API key, and the smoke run makes no model calls.

## Verification Commands

These are used in Before You Start and in Verify.

**Fast loop.** Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
npm run naming:check
npm run build:renderer
npm run check:circular
```

Each command exits 0, with two expected outputs and one exception:

- `check:renderer-types` prints `check-renderer-typecheck: ok`. It also prints an `entries=` count, a `resolved baseline entries=` count, and the baseline lines it no longer finds. Those are notes from the check, not failures.
- `naming:check` prints `naming check: ok`.
- `check:circular` is the exception. It exits 1 and prints `check-circular-deps: found circular dependencies`, then exactly two cycle lines starting with ` - `, both through `src/main/tools/standingOrders.ts`. Those two cycles already exist. A third line means this plan added a cycle: stop and report.

**Full tests.** Run these one at a time. `clean:dist` removes compiled copies of deleted tests, so the count is exact.

```powershell
npm run clean:dist
npm test 2>&1 | Tee-Object -FilePath "$env:TEMP\agent-wars-npm-test.log"
$testLog = Get-Content "$env:TEMP\agent-wars-npm-test.log"
($testLog | Select-String -Pattern '^\S+ tests (\d+)$' | ForEach-Object { [int]$_.Matches[0].Groups[1].Value } | Measure-Object -Sum).Sum
($testLog | Select-String -Pattern '^\S+ fail (\d+)$' | ForEach-Object { [int]$_.Matches[0].Groups[1].Value } | Measure-Object -Sum).Sum
```

The `npm test` output ends with the notices check, and the last two commands print the test total and the failure total. Error-looking log lines such as `hex-code-translator h3ToCode: missing mapping` come from tests that check failure paths and are expected.

**Smoke run.**

```powershell
npm run ui:smoke -- --label <label>
```

- The run builds the app and takes about four minutes. It opens the app window three times: it closes the app twice to change its throwaway copy of the match, then reopens it. Do not use the mouse or keyboard in those windows while it runs.
- It prints one `PASS` or `FAIL` line per check, then a summary line: `ui-smoke <label>: P passed, F failed, E page errors, N screenshots in <folder>`.
- The window can show a "map tiles failed to load" toast when the network is slow. That toast is not a failure.
- After a smoke run the SQLite module is built for Electron. `npm test` rebuilds it for Node by itself, and `npm start` works as usual.

## Before You Start

- [ ] **Read**

1. [ui-facelift-spec.md](ui-facelift-spec.md): Tactical Battles.
2. `doc/ux/tactical-battle-controls.md`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files. Then check that plan 1 is in and this plan is not:

```powershell
Test-Path src/shared/battleHeaderText.ts
[bool](Select-String -Path static/index.html -Pattern 'tactical-exit-host' -Quiet)
```

Expected: `True`, then `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **885**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/renderer/tactical/tacticalExitButtonDom.ts`
- `src/renderer/gameplay/buildQueuePopup.ts`
- `src/renderer/chrome/controlTooltipText.ts`
- `src/renderer/tactical/tacticalIpcHandlers.ts`
- `src/renderer/tactical/tacticalEntryFlow.ts`
- `src/renderer/tactical/tacticalUiOrchestration.ts`
- `src/renderer/tactical/tacticalAnnihilationDialog.ts`
- `src/renderer/tactical/tacticalExitFlow.ts`
- `src/renderer/entryCallbacks.ts`
- `src/renderer/renderer.ts`
- `src/renderer/gameplay/readyHandlerTypes.ts`
- `src/renderer/core/state.ts`
- `static/index.html`
- `static/overlayChrome.css`
- `static/frameChrome.css`
- `scripts/ui-smoke/ui-smoke-scenes.cjs`
- `scripts/ui-smoke/ui-smoke.cjs`
- `scripts/ui-smoke/ui-smoke-battle-checks.cjs`
- `doc/ux/tactical-battle-controls.md`
- `doc/ux/top-bar.md`
- `doc/ux/modes-and-transitions.md`
- `doc/ux-specification.md`
- `doc/how-to-play.md`

- [ ] **Step 1: Edit `src/renderer/tactical/tacticalExitButtonDom.ts`**

Exit Battle's rules stay as they were; only the old map control that held it is gone. The battle header shows and hides the button with the battle.

1. In `src/renderer/tactical/tacticalExitButtonDom.ts`, find this line. It occurs exactly once:

```ts
 * DOM sync for the tactical battle HUD exit control from `rendererSharedState`.
```

Replace it with:

```ts
 * DOM sync for Exit Battle in the battle header from `rendererSharedState`.
```

2. In `src/renderer/tactical/tacticalExitButtonDom.ts`, find these lines. Together they occur exactly once:

```ts
 * Updates `#tactical-battle-hud` / `#tactical-exit-btn` visibility and disabled state from tactical session flags.
 *
 * Purpose: Single place for exit-button rules so annihilation dialog code does not import the broader tactical UI orchestration module.
 * When to use: After tactical snapshot or phase changes, beat playback start or end, annihilation dialog open/close, and tactical HUD teardown.
 * Expected outcome: HUD hidden when no snapshot; exit hidden and disabled while `S.tacticalAnnihilationOutcomeDialog` is set; otherwise exit is disabled when there is no battle, when `S.tacticalPhasePlanning` is false, or while a battle snapshot is set and beat playback is running. A control tip whose control no longer has an on-screen area is hidden.
 * Exceptions: None when nodes are missing (no-op for absent elements).
 */
export function syncTacticalExitButtonElementVisibility(): void {
  const hud = document.getElementById('tactical-battle-hud');
  const exitBtn = document.getElementById('tactical-exit-btn') as HTMLButtonElement | null;
  const active = !!S.tacticalBattleSnapshot;
  const annihilationDialogOpen = S.tacticalAnnihilationOutcomeDialog != null;
  hud?.classList.toggle('hidden', !active);
```

Replace them with:

```ts
 * Updates `#tactical-exit-btn` visibility and disabled state from tactical session flags.
 *
 * Purpose: Single place for exit-button rules so annihilation dialog code does not import the broader tactical UI orchestration module.
 * When to use: After tactical snapshot or phase changes, beat playback start or end, annihilation dialog open/close, and battle teardown.
 * Expected outcome: The button is in the battle header, which shows only while a battle is open (`renderBattleHeader`).
 *   It is hidden and disabled while `S.tacticalAnnihilationOutcomeDialog` is set; otherwise it is disabled when there is
 *   no battle, when `S.tacticalPhasePlanning` is false, or while a battle snapshot is set and beat playback is running.
 *   A control tip whose control no longer has an on-screen area is hidden.
 * Exceptions: None when nodes are missing (no-op for absent elements).
 */
export function syncTacticalExitButtonElementVisibility(): void {
  const exitBtn = document.getElementById('tactical-exit-btn') as HTMLButtonElement | null;
  const active = !!S.tacticalBattleSnapshot;
  const annihilationDialogOpen = S.tacticalAnnihilationOutcomeDialog != null;
```

- [ ] **Step 2: Edit `src/renderer/gameplay/buildQueuePopup.ts`**

The check that keeps the build popup open no longer names the old map control, and its comment now says what it does.

1. In `src/renderer/gameplay/buildQueuePopup.ts`, find these lines. Together they occur exactly once:

```ts
 * Defines the `isBuildPopupOrEntryTarget` function shape (export function isBuildPopupOrEntryTarget(target: EventTarget | null): boolean).

 * Purpose: Supports maintainability by documenting why `isBuildPopupOrEntryTarget` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
```

Replace them with:

```ts
 * Reports whether a pointer target is the build popup, a build marker, or a battle-entry marker.
 *
 * Purpose: A press on any of these must not close the open build popup; a press anywhere else does.
 * When to use: From the window's `pointerdown` handler while the build popup is open.
 * Expected outcome: True when `target` is inside `#build-popup`, `#build-entry-layer`, or `#tactical-entry-layer`.
 * Exceptions: None; a target that is not a DOM node returns false.
```

2. In `src/renderer/gameplay/buildQueuePopup.ts`, find these lines. Together they occur exactly once:

```ts
  const tacticalHud = document.getElementById('tactical-battle-hud');
  return !!(
    popup?.contains(target) ||
    layer?.contains(target) ||
    tacticalLayer?.contains(target) ||
    tacticalHud?.contains(target)
  );
```

Replace them with:

```ts
  return !!(popup?.contains(target) || layer?.contains(target) || tacticalLayer?.contains(target));
```

- [ ] **Step 3: Edit `src/renderer/chrome/controlTooltipText.ts`**

Exit Battle's tip now sits on its host in the battle header.

In `src/renderer/chrome/controlTooltipText.ts`, find this line. It occurs exactly once:

```ts
 * When to use: `#tactical-battle-hud`.
```

Replace it with:

```ts
 * When to use: `#tactical-exit-host`, around Exit Battle in the battle header.
```

- [ ] **Step 4: Edit `src/renderer/tactical/tacticalIpcHandlers.ts`**

Renames the battle-start side effect `refreshTacticalExitHud` to `refreshTacticalExitButton`, since the control it named is gone, and updates one comment to match.

1. In `src/renderer/tactical/tacticalIpcHandlers.ts`, find this line. It occurs exactly once:

```ts
  refreshTacticalExitHud: () => void;
```

Replace it with:

```ts
  refreshTacticalExitButton: () => void;
```

2. In `src/renderer/tactical/tacticalIpcHandlers.ts`, find these lines. Together they occur exactly once:

```ts
  fx.enterTacticalView(result.battle.tacticalChildH3Indexes);
  fx.setStrategicSidebarTactical(true);
  fx.refreshTacticalExitHud();
  fx.scheduleAnnihilationExit();
```

Replace them with:

```ts
  fx.enterTacticalView(result.battle.tacticalChildH3Indexes);
  fx.setStrategicSidebarTactical(true);
  fx.refreshTacticalExitButton();
  fx.scheduleAnnihilationExit();
```

3. In `src/renderer/tactical/tacticalIpcHandlers.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: Tactical HUD, sidebar suppression, and map bounds match a freshly started tactical session.
```

Replace it with:

```ts
 * Expected outcome: Exit Battle, sidebar suppression, and map bounds match a freshly started tactical session.
```

4. In `src/renderer/tactical/tacticalIpcHandlers.ts`, find this line. It occurs exactly once:

```ts
  fx.refreshTacticalExitHud();
```

Replace it with:

```ts
  fx.refreshTacticalExitButton();
```

- [ ] **Step 5: Edit `src/renderer/tactical/tacticalEntryFlow.ts`**

Follows the rename, and updates three comments that named the old control.

1. In `src/renderer/tactical/tacticalEntryFlow.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: Same toasts, map mode transitions, and HUD updates as the pre-extraction inline paths.
```

Replace it with:

```ts
 * Expected outcome: Same toasts, map mode transitions, and Exit Battle updates as the pre-extraction inline paths.
```

2. In `src/renderer/tactical/tacticalEntryFlow.ts`, find this line. It occurs exactly once:

```ts
    refreshTacticalExitHud: tacticalUpdateExitButtonVisibility,
```

Replace it with:

```ts
    refreshTacticalExitButton: tacticalUpdateExitButtonVisibility,
```

3. In `src/renderer/tactical/tacticalEntryFlow.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: Tactical HUD and tactical bounds match a freshly started tactical session.
```

Replace it with:

```ts
 * Expected outcome: Exit Battle and tactical bounds match a freshly started tactical session.
```

4. In `src/renderer/tactical/tacticalEntryFlow.ts`, find this line. It occurs exactly once:

```ts
 * When to use: Tactical HUD exit button and annihilation modal `Exit Battle` confirmation.
```

Replace it with:

```ts
 * When to use: Exit Battle in the battle header, and the annihilation modal's `Exit Battle` confirmation.
```

- [ ] **Step 6: Edit `src/renderer/tactical/tacticalUiOrchestration.ts`**

Comments only: they name Exit Battle instead of the old control.

1. In `src/renderer/tactical/tacticalUiOrchestration.ts`, find this line. It occurs exactly once:

```ts
 * DOM and renderer-state orchestration for tactical battle HUD, sidebar suppression, and entry-layer sync.
```

Replace it with:

```ts
 * DOM and renderer-state orchestration for Exit Battle, sidebar suppression, and entry-layer sync.
```

2. In `src/renderer/tactical/tacticalUiOrchestration.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: Tactical HUD hidden, tactical map bounds released, resolution animation cancelled, `S.tacticalBattleSnapshot` null; sidebar turn uses `nextState`.
```

Replace it with:

```ts
 * Expected outcome: Exit Battle hidden with the battle header, tactical map bounds released, resolution animation cancelled, `S.tacticalBattleSnapshot` null; sidebar turn uses `nextState`.
```

3. In `src/renderer/tactical/tacticalUiOrchestration.ts`, find this line. It occurs exactly once:

```ts
 * Updates tactical HUD visibility and exit button disabled state from renderer shared state.
```

Replace it with:

```ts
 * Updates whether Exit Battle is hidden or disabled, from renderer shared state.
```

- [ ] **Step 7: Edit `src/renderer/tactical/tacticalAnnihilationDialog.ts`**

A comment only: it names Exit Battle instead of the old control.

In `src/renderer/tactical/tacticalAnnihilationDialog.ts`, find this line. It occurs exactly once:

```ts
 * Shows the annihilation overlay, blocks map interaction, and refreshes tactical HUD / Ready affordances.
```

Replace it with:

```ts
 * Shows the annihilation overlay, blocks map interaction, and refreshes Exit Battle and Ready.
```

- [ ] **Step 8: Edit `src/renderer/tactical/tacticalExitFlow.ts`**

A comment only: it names Exit Battle instead of the old control.

In `src/renderer/tactical/tacticalExitFlow.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: At most one modal per annihilation beat; `io.redraw` refreshes HUD exit visibility.
```

Replace it with:

```ts
 * Expected outcome: At most one modal per annihilation beat; `io.redraw` refreshes whether Exit Battle shows.
```

- [ ] **Step 9: Edit `src/renderer/entryCallbacks.ts`**

A comment only: it names Exit Battle instead of the old control.

In `src/renderer/entryCallbacks.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: Identical sequencing for sidebar suppression, tactical entry, HUD refresh, and redraw.
```

Replace it with:

```ts
 * Expected outcome: Identical sequencing for sidebar suppression, tactical entry, Exit Battle refresh, and redraw.
```

- [ ] **Step 10: Edit `src/renderer/renderer.ts`**

A comment only: it says where Exit Battle is.

In `src/renderer/renderer.ts`, find this line. It occurs exactly once:

```ts
 * When to use: Tactical HUD exit button and annihilation modal `Exit Battle` confirmation.
```

Replace it with:

```ts
 * When to use: Exit Battle in the battle header, and the annihilation modal's `Exit Battle` confirmation.
```

- [ ] **Step 11: Edit `src/renderer/gameplay/readyHandlerTypes.ts`**

A comment only: it names Exit Battle instead of the old control.

In `src/renderer/gameplay/readyHandlerTypes.ts`, find this line. It occurs exactly once:

```ts
   * Contract: Tactical Ready stores playback before later awaits, and the HUD must disable Exit Battle before those awaits return.
```

Replace it with:

```ts
   * Contract: Tactical Ready stores playback before later awaits, and Exit Battle must be disabled before those awaits return.
```

- [ ] **Step 12: Edit `src/renderer/core/state.ts`**

A comment only: it says where Exit Battle is.

In `src/renderer/core/state.ts`, find this line. It occurs exactly once:

```ts
   * Purpose: While non-null, the tactical annihilation win/loss modal is shown and the HUD exit control stays hidden until the player confirms `Exit Battle`.
```

Replace it with:

```ts
   * Purpose: While non-null, the tactical annihilation win/loss modal is shown and Exit Battle in the battle header stays hidden until the player confirms `Exit Battle`.
```

- [ ] **Step 13: Checkpoint: build, types, and lint**

Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
```

Each exits 0, and `check:renderer-types` prints `check-renderer-typecheck: ok`. An error here comes from the steps above: open the file the error names, compare it with its step, fix your copying mistake, and run the three again. If the steps as written cannot compile, stop and report.

- [ ] **Step 14: Edit `static/index.html`**

Moves Exit Battle into the battle header, beside Settings, in a tip host so its tip shows while it is disabled. Removes the old control at the bottom of the map.

1. In `static/index.html`, find this line. It occurs exactly once:

```html
    <div id="battle-header-center" class="battle-header-center battle-header-only"></div>
```

Replace it with:

```html
    <div id="battle-header-center" class="battle-header-center battle-header-only"></div>
    <div class="battle-header-exit battle-header-only">
      <span id="tactical-exit-host" class="control-tooltip-host" data-control-tooltip="Leave the battle, bring back your world-map orders, and play that turn. The button does nothing while a battle turn is resolving or playing back."><button type="button" id="tactical-exit-btn" class="battle-exit-btn"><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3H3v10h3M10 5l3 3-3 3M13 8H6"></path></svg>Exit Battle</button></span>
    </div>
```

2. In `static/index.html`, delete these lines, including the line break at the end. Together they occur exactly once:

```html
    <div id="tactical-battle-hud" class="tactical-battle-hud hidden" role="group" aria-label="Tactical battle controls" data-control-tooltip="Leave the battle, bring back your world-map orders, and play that turn. The button does nothing while a battle turn is resolving or playing back.">
      <button type="button" id="tactical-exit-btn" class="tactical-exit-btn" aria-label="Exit battle">Exit Battle</button>
    </div>
```

- [ ] **Step 15: Edit `static/overlayChrome.css`**

Removes the old control's styles.

In `static/overlayChrome.css`, find these lines. Together they occur exactly once:

```css
.tactical-battle-hud {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  z-index: 6600;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.45rem;
  pointer-events: auto;
  max-width: calc(100vw - 24px);
  flex-wrap: wrap;
  justify-content: center;
}
.tactical-battle-hud.hidden { display: none; }
.tactical-exit-btn {
  margin: 0;
  padding: 0.4rem 0.9rem;
  font-size: 13px;
  font-weight: 600;
  font-family: system-ui, sans-serif;
  border-radius: 3px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  cursor: default;
}
/* Buttons drawn over the pale map get a navy focus ring; the light teal ring would vanish there. */
.build-entry-btn:focus,
.tactical-entry-btn:focus,
.tactical-exit-btn:focus {
  outline: 1px solid var(--chrome-bg);
}
.tactical-exit-btn.hidden {
  display: none;
```

Replace them with:

```css
/* Buttons drawn over the pale map get a navy focus ring; the light teal ring would vanish there. */
.build-entry-btn:focus,
.tactical-entry-btn:focus {
  outline: 1px solid var(--chrome-bg);
```

- [ ] **Step 16: Edit `static/frameChrome.css`**

Styles Exit Battle in the header: the shared button colors at the header's 30 px button height, in a block that hides with the button while the annihilation dialog is open.

In `static/frameChrome.css`, find these lines. Together they occur exactly once:

```css
  justify-content: center;
  border-left: 1px solid var(--chrome-divider);
}
```

Replace them with:

```css
  justify-content: center;
  border-left: 1px solid var(--chrome-divider);
}
/* Exit Battle, beside Settings. Its colors are the shared button colors; the annihilation dialog hides it with its block. */
.battle-header-exit {
  display: flex;
  align-items: center;
  flex: none;
  padding: 0 12px;
  border-left: 1px solid var(--chrome-divider);
}
.battle-header-exit:has(.battle-exit-btn.hidden) {
  display: none;
}
.battle-exit-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}
.battle-exit-btn.hidden {
  display: none;
}
```

- [ ] **Step 17: Edit `scripts/ui-smoke/ui-smoke-scenes.cjs`**

Adds the scene after leaving the battle.

In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find this line. It occurs exactly once:

```js
  battleBeat: 'battle-beat',
```

Replace it with:

```js
  battleBeat: 'battle-beat',
  battleExited: 'battle-exited',
```

- [ ] **Step 18: Edit `scripts/ui-smoke/ui-smoke.cjs`**

Leaves the battle with Exit Battle after the beat, or closes the result if a side was wiped out, then records the world map.

1. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
 * Runs the second session: the reopened match, a battle on the hex both sides now hold, and a new regional match.
```

Replace it with:

```js
 * Runs the second session: the reopened match, a battle on the hex both sides now hold, leaving that battle, and a new
 * regional match.
```

2. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
  await recordScene(page, report, outDir, SCENES.battleBeat);
  if (await page.isVisible(annihilation)) {
    await page.click('#tactical-annihilation-exit-btn');
    await waitForWorldPlanning(page);
  }
```

Replace them with:

```js
  await recordScene(page, report, outDir, SCENES.battleBeat);

  // Leave the battle mid-fight with Exit Battle in the header, or close the result if a side was wiped out. Either way
  // the world-map turn then plays.
  await page.click((await page.isVisible(annihilation)) ? '#tactical-annihilation-exit-btn' : '#tactical-exit-btn');
  await waitForWorldPlanning(page);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.battleExited);
```

- [ ] **Step 19: Edit `scripts/ui-smoke/ui-smoke-battle-checks.cjs`**

Adds the checks that Exit Battle is in the header and usable while the player plans, and gone after leaving.

1. In `scripts/ui-smoke/ui-smoke-battle-checks.cjs`, find this line. It occurs exactly once:

```js
 * in place of the match status.
```

Replace it with:

```js
 * in place of the match status, and holds Exit Battle.
```

2. In `scripts/ui-smoke/ui-smoke-battle-checks.cjs`, find these lines. Together they occur exactly once:

```js
  {
    name: 'battle-header-small-window',
```

Replace them with:

```js
  {
    name: 'exit-battle-in-header',
    scenes: BATTLE_SCENES,
    needs: ['#tactical-exit-btn', '#tactical-annihilation-overlay'],
    run: (p, el) => {
      const exit = el('#tactical-exit-btn');
      if (el('#tactical-annihilation-overlay').shown) return exit.shown ? 'Exit Battle shows beside the annihilation dialog' : null;
      if (!exit.shown || exit.disabled) return `Exit Battle is ${exit.shown ? 'disabled' : 'hidden'} while the player plans a beat`;
      return exit.ancestorIds.includes('app-topbar') ? null : 'Exit Battle is not in the top bar';
    },
  },
  {
    name: 'world-map-after-exit',
    scenes: [SCENES.battleExited],
    needs: ['#topbar-turn-phase', '#tactical-exit-btn'],
    run: (p, el) => {
      const turn = el('#topbar-turn-phase').text;
      if (!/^Turn \d+ · Planning$/.test(turn)) return `the top bar reads "${turn}", expected world-map planning`;
      return el('#tactical-exit-btn').shown ? 'Exit Battle still shows on the world map' : null;
    },
  },
  {
    name: 'battle-header-small-window',
```

- [ ] **Step 20: Edit `doc/ux/tactical-battle-controls.md`**

Exit Battle is in the battle header.

1. In `doc/ux/tactical-battle-controls.md`, find this line. It occurs exactly once:

````markdown
Exit Battle during a battle, and the annihilation dialog that can replace it.
````

Replace it with:

````markdown
Exit Battle in the battle header, and the annihilation dialog that can replace it.
````

2. In `doc/ux/tactical-battle-controls.md`, find these lines. Together they occur exactly once:

````markdown
The Exit Battle control is shown whenever a battle is active, including during a tactical Resolution playback, and hidden when no battle is active. It is enabled during Tactical planning. It is disabled from the moment a tactical Ready commits a beat until that beat's playback ends. It is hidden and disabled while the annihilation dialog is open. See [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- A button labeled "Exit Battle" while a battle is active and annihilation is not showing.
````

Replace them with:

````markdown
Exit Battle sits in the battle header, the top bar's form during a battle, beside Settings. See [top-bar.md](top-bar.md). It is shown whenever a battle is active, including during a tactical Resolution playback, and hidden when no battle is active. It is enabled during Tactical planning. It is disabled from the moment a tactical Ready commits a beat until that beat's playback ends. It is hidden and disabled while the annihilation dialog is open. See [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- A button with an exit icon and the label "Exit Battle", in the battle header, while a battle is active and annihilation is not showing. It uses the shared button colors, and the dimmed teal while it is disabled.
````

3. In `doc/ux/tactical-battle-controls.md`, find this line. It occurs exactly once:

````markdown
- [modes-and-transitions.md](modes-and-transitions.md)
````

Replace it with:

````markdown
- [modes-and-transitions.md](modes-and-transitions.md)
- [top-bar.md](top-bar.md)
````

4. In `doc/ux/tactical-battle-controls.md`, find this line. It occurs exactly once:

````markdown
- `static/index.html` (`#tactical-battle-hud`, `#tactical-exit-btn`, `#tactical-annihilation-overlay`, `#tactical-annihilation-message`, `#tactical-annihilation-exit-btn`)
````

Replace it with:

````markdown
- `static/index.html` (`#tactical-exit-host`, `#tactical-exit-btn`, `#tactical-annihilation-overlay`, `#tactical-annihilation-message`, `#tactical-annihilation-exit-btn`)
- `static/frameChrome.css` (`.battle-header-exit`, `.battle-exit-btn`)
````

- [ ] **Step 21: Edit `doc/ux/top-bar.md`**

Adds Exit Battle to the battle header.

1. In `doc/ux/top-bar.md`, find this line. It occurs exactly once:

````markdown
- Under the title, the status line: "Beat N · Tactical planning" while the player drafts, or "Beat N · Tactical resolution" while a beat resolves or plays back, then the match date, then the battle's weather icon and word when the battle has weather (`formatBattleHeaderStatus` in `src/shared/battleHeaderText.ts`).
````

Replace it with:

````markdown
- Under the title, the status line: "Beat N · Tactical planning" while the player drafts, or "Beat N · Tactical resolution" while a beat resolves or plays back, then the match date, then the battle's weather icon and word when the battle has weather (`formatBattleHeaderStatus` in `src/shared/battleHeaderText.ts`).
- Exit Battle, beside Settings. When it is shown, enabled, or hidden is in [tactical-battle-controls.md](tactical-battle-controls.md).
````

2. In `doc/ux/top-bar.md`, find this line. It occurs exactly once:

````markdown
- [control-tooltips.md](control-tooltips.md)
````

Replace it with:

````markdown
- [control-tooltips.md](control-tooltips.md)
- [tactical-battle-controls.md](tactical-battle-controls.md)
````

3. In `doc/ux/top-bar.md`, find this line. It occurs exactly once:

````markdown
- `static/index.html` (`#app-topbar`, `#game-menu-btn`, `#topbar-human-side`, `#topbar-opponent-side`, `#topbar-stat-production`, `#topbar-stat-production-suffix`, `#topbar-stat-forces-host`, `#topbar-stat-forces`, `#topbar-stat-forces-cap`, `#topbar-stat-human-home`, `#topbar-stat-human-home-total`, `#topbar-stat-opponent-home`, `#topbar-stat-opponent-home-total`, `#topbar-date`, `#topbar-turn-phase`, `#topbar-settings-btn`, `#topbar-help-btn`, `#battle-header-place`, `#battle-header-title`, `#battle-header-caption`, `#battle-header-status`, `#battle-header-center`)
````

Replace it with:

````markdown
- `static/index.html` (`#app-topbar`, `#game-menu-btn`, `#topbar-human-side`, `#topbar-opponent-side`, `#topbar-stat-production`, `#topbar-stat-production-suffix`, `#topbar-stat-forces-host`, `#topbar-stat-forces`, `#topbar-stat-forces-cap`, `#topbar-stat-human-home`, `#topbar-stat-human-home-total`, `#topbar-stat-opponent-home`, `#topbar-stat-opponent-home-total`, `#topbar-date`, `#topbar-turn-phase`, `#topbar-settings-btn`, `#topbar-help-btn`, `#battle-header-place`, `#battle-header-title`, `#battle-header-caption`, `#battle-header-status`, `#battle-header-center`, `#tactical-exit-host`, `#tactical-exit-btn`)
````

- [ ] **Step 22: Edit `doc/ux/modes-and-transitions.md`**

Exit Battle is in the battle header.

1. In `doc/ux/modes-and-transitions.md`, find this text. It occurs exactly once:

````markdown
The player sees the battle map for one contested hex, the Exit Battle control, the top bar as the battle header, and the same right panel.
````

Replace it with:

````markdown
The player sees the battle map for one contested hex, the top bar as the battle header with Exit Battle, and the same right panel.
````

2. In `doc/ux/modes-and-transitions.md`, find this line. It occurs exactly once:

````markdown
- `static/index.html` (`#game-over-overlay`, `#tactical-annihilation-overlay`, `#tactical-battle-hud`, `#ready-btn`)
````

Replace it with:

````markdown
- `static/index.html` (`#game-over-overlay`, `#tactical-annihilation-overlay`, `#tactical-exit-btn`, `#ready-btn`)
````

- [ ] **Step 23: Edit `doc/ux-specification.md`**

The smoke run now leaves the battle with Exit Battle.

In `doc/ux-specification.md`, find this text. It occurs exactly once:

````markdown
The second reopens that match, opens a battle in it, shows that battle at the 800 × 600 minimum too, and then starts a new regional match.
````

Replace it with:

````markdown
The second reopens that match, opens a battle in it, shows that battle at the 800 × 600 minimum too, leaves it with Exit Battle, and then starts a new regional match.
````

- [ ] **Step 24: Edit `doc/how-to-play.md`**

Says where Exit Battle is.

1. In `doc/how-to-play.md`, find this text. It occurs exactly once:

````markdown
Players win tactical battles by destroying their opponent's units, but they can leave at any time by clicking the **Exit Battle** button.
````

Replace it with:

````markdown
Players win tactical battles by destroying their opponent's units, but they can leave at any time by clicking **Exit Battle** at the top right of the window.
````

2. In `doc/how-to-play.md`, find this line. It occurs exactly once:

````markdown
- **Exit Battle:** you can leave between beats. A unit that kept fewer than half its sub-units is destroyed. Exactly half survives.
````

Replace it with:

````markdown
- **Exit Battle:** you can leave between beats with **Exit Battle** in the battle header, beside Settings. A unit that kept fewer than half its sub-units is destroyed. Exactly half survives.
````

## Verify

- [ ] **Step 25: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 26: Full tests**

Run the full tests. Expected: exit 0, test total **885**, failure total **0**.

- [ ] **Step 27: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/renderer/tactical/tacticalExitButtonDom.ts src/renderer/gameplay/buildQueuePopup.ts src/renderer/chrome/controlTooltipText.ts src/renderer/tactical/tacticalIpcHandlers.ts src/renderer/tactical/tacticalEntryFlow.ts src/renderer/tactical/tacticalUiOrchestration.ts src/renderer/tactical/tacticalAnnihilationDialog.ts src/renderer/tactical/tacticalExitFlow.ts src/renderer/entryCallbacks.ts src/renderer/renderer.ts src/renderer/gameplay/readyHandlerTypes.ts src/renderer/core/state.ts static/index.html static/overlayChrome.css static/frameChrome.css scripts/ui-smoke/ui-smoke-scenes.cjs scripts/ui-smoke/ui-smoke.cjs scripts/ui-smoke/ui-smoke-battle-checks.cjs doc/ux/tactical-battle-controls.md doc/ux/top-bar.md doc/ux/modes-and-transitions.md doc/ux-specification.md doc/how-to-play.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/renderer/tactical/tacticalExitButtonDom.ts` | `a522a17bbad328bc` |
| `src/renderer/gameplay/buildQueuePopup.ts` | `9548d36af1cf4955` |
| `src/renderer/chrome/controlTooltipText.ts` | `59f5ee1878e2e62f` |
| `src/renderer/tactical/tacticalIpcHandlers.ts` | `9a78a49ed93d0acb` |
| `src/renderer/tactical/tacticalEntryFlow.ts` | `00cc0bdea23443d7` |
| `src/renderer/tactical/tacticalUiOrchestration.ts` | `d49616987e38be8f` |
| `src/renderer/tactical/tacticalAnnihilationDialog.ts` | `2211244a8e0b5f4b` |
| `src/renderer/tactical/tacticalExitFlow.ts` | `d7be47b417a61026` |
| `src/renderer/entryCallbacks.ts` | `82cb9bd60c93e193` |
| `src/renderer/renderer.ts` | `5b810d718867a4d5` |
| `src/renderer/gameplay/readyHandlerTypes.ts` | `c6391ce33caab3cc` |
| `src/renderer/core/state.ts` | `934e1a96b62f9731` |
| `static/index.html` | `a06ab251096f62fc` |
| `static/overlayChrome.css` | `ddd73520c9064f81` |
| `static/frameChrome.css` | `91989bb208ded587` |
| `scripts/ui-smoke/ui-smoke-scenes.cjs` | `a9fa0792ba05a567` |
| `scripts/ui-smoke/ui-smoke.cjs` | `a789056319774699` |
| `scripts/ui-smoke/ui-smoke-battle-checks.cjs` | `6890d315fd34fffa` |
| `doc/ux/tactical-battle-controls.md` | `e9887b4b0feab056` |
| `doc/ux/top-bar.md` | `a40d28b84067bb5d` |
| `doc/ux/modes-and-transitions.md` | `f70af87e7c211e49` |
| `doc/ux-specification.md` | `8c0a9043ccbdd09b` |
| `doc/how-to-play.md` | `d4737d0bca630b79` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

- [ ] **Step 28: Smoke run**

```powershell
npm run ui:smoke -- --label exit-battle
```

Expected summary line:

```text
ui-smoke exit-battle: 406 passed, 0 failed, 0 page errors, 34 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\exit-battle
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/exit-battle/report.json`.

- [ ] **Step 29: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/exit-battle/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast. The small origin flags beside unit names can also differ from run to run. The battle's units are placed when it opens, and the world-map turn after leaving the battle depends on the dice, so those scenes can differ in units, losses, and toasts.

- `27-battle-orders.png` against [ui-facelift-battle-2-expected-exit.png](ui-facelift-battle-2-expected-exit.png): a battle with a march queued. Exit Battle, with its icon, sits in the header between the empty middle and Settings, and nothing is left at the bottom of the map.
- `30-battle-exited.png` against [ui-facelift-battle-2-expected-exited.png](ui-facelift-battle-2-expected-exited.png): the world map after leaving the battle: the top bar shows the sides, the readouts, and "Turn N · Planning" again. The turn's toast, and its combat marks and dice, can still be showing.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 26.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 29.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. With your own match, enter a battle: Exit Battle is in the header beside Settings, and nothing is at the bottom of the map. Point at it: its tip shows.
2. Press Ready: Exit Battle dims while the beat plays back, its tip still shows, and it is usable again afterwards.
3. Click Exit Battle between beats: the battle closes, the world-map turn plays, and the top bar shows the match status.
4. Play a battle to the end: when a side is wiped out, the annihilation dialog opens and Exit Battle leaves the header; the dialog's Exit Battle returns you to the world map.
5. Press Tab until Exit Battle has focus, then Enter: it leaves the battle, as a click does.

## Next

Plan 3 adds the force bar to the middle of the battle header.
