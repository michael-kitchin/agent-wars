# UI Facelift Toggles, Plan 1 of 3: Console Header and Selection Bar

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Remove the console's collapse button, since a click on the selected rail tab already folds the console, and say so in the tabs' tips. In the selection bar, give the close control (×) the expand control's style at the bar's right end, and replace the Ranged and Strike labels with one target-reticle icon that stays on screen as a pressed toggle while the player aims. A second click on it stops aiming, so the air-strike Cancel button goes.

**Requirements:** [ui-facelift-toggles-execution-plan.md](ui-facelift-toggles-execution-plan.md) lists the requested changes and the decisions made for them. This plan is part 1 of the three that build them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and that index disagree, follow this plan and report the disagreement.

**What this plan changes:**

- `static/index.html` and `static/frameChrome.css`: `#console-collapse-btn` and its rules go; the header's right padding matches its left. `consoleFrame.ts` drops its wiring. Each enabled console tab's tip gains "Click the selected tab to hide the console and widen the map." (`frameTooltipText.ts`).
- `static/selectionChrome.css`: `#selection-panel-close` takes the bar's full height at its right end, 32 px wide with a divider on its left, the mirror of `#selection-panel-expand`; in `static/index.html` its × becomes a line icon like the chevron. The resize grip, shown only while the panel is expanded, sits over the close control's top-right corner.
- `#ranged-attack-btn` becomes `.selection-panel-reticle`: a square button with a reticle icon and no text, the same for both attacks. Its accessible name is "Ranged attack" or "Air strike", and `aria-pressed` is true while that attack is aimed, when its face takes the ranged amber or the strike purple, the same color as the panel's border.
- `updateRangedSidebar` keeps the reticle on screen while aiming and shows the strike target list beside it. A click on the pressed reticle stops aiming (`initCore.ts`). `#air-strike-cancel-btn` goes.
- `selectionSupportAction` returns `kind` (`ranged` or `strike`) in place of `label`, and `supportButtonTooltipText` picks the reticle's tip.
- The smoke run gains two scenes, a ranged attack aimed and a strike stopped by the reticle, and checks the close control's place, the reticle in each state, and the header without a button. It collapses the console from its selected tab.
- `doc/` follows.

**Out of scope:**

- The build popups' and the stack callout's close controls. They are popups, not drawers, and they keep their ×.
- Anything new in the space the collapse button leaves. The title and the subtitle take the width.
- The minimap (plans 2 and 3).
- Image captions in `doc/how-to-play.md` that still say Ranged and Strike. They describe the current screenshots, and the release plans' media step rewrites them with new images.

**How this plan was checked:** every step below was applied to a copy of the repository at commit `779f214`, and the result matched the verified files exactly. On that result, the fast loop, the full tests, and the smoke run against the real app in Electron passed. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

## Ground Rules

- Follow `AGENTS.md` and every rule in `.cursor/rules/`. These matter most here:
  - **Never commit or push** (rule 11). The reviewer commits after reading your report.
  - **No plan or phase identifiers** (rule 12) in code, comments, tests, `doc/`, or configuration: no plan numbers, no phase names, and no "facelift" outside `.spec/`. Every block in this plan already follows this.
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

1. `AGENTS.md` and each file in `.cursor/rules/`.
2. [ui-facelift-toggles-execution-plan.md](ui-facelift-toggles-execution-plan.md): Requested Changes and Decisions.
3. `doc/ux/console.md`, `doc/ux/selection-panel.md`, and `doc/ux/console-command-bar.md`.
4. `updateRangedSidebar` in `src/renderer/gameplay/tacticalOrders.ts`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected:

- `git status --short` prints nothing, or only `.spec/` files.
- The last commit is `779f214 Doc moves.`, or a later commit of yours that changes only `.spec/`. If it is anything else, stop and report: every block in this plan was checked against `779f214`.

Then check that the console documents have their current names and that this plan is not in:

```powershell
Test-Path doc/ux/console.md
[bool](Select-String -Path static/index.html -Pattern 'console-collapse-btn' -SimpleMatch -Quiet)
[bool](Select-String -Path static/index.html -Pattern 'selection-panel-reticle' -SimpleMatch -Quiet)
```

Expected: `True`, `True`, `False`. Any other result: stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **896**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/shared/selectionSupportButtonMode.ts`
- `src/shared/selectionSupportButtonMode.test.ts`
- `src/renderer/chrome/controlTooltipText.ts`
- `src/renderer/chrome/frameTooltipText.ts`
- `src/renderer/gameplay/tacticalOrders.ts`
- `src/renderer/map/initCore.ts`
- `src/renderer/chrome/consoleFrame.ts`
- `src/renderer/renderer.ts`
- `src/main/rendererConsolidation.test.ts`
- `static/index.html`
- `static/frameChrome.css`
- `static/selectionChrome.css`
- `scripts/ui-smoke/ui-smoke-scenes.cjs`
- `scripts/ui-smoke/ui-smoke-checks.cjs`
- `scripts/ui-smoke/ui-smoke-console-checks.cjs`
- `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`
- `scripts/ui-smoke/ui-smoke.cjs`
- `doc/ux/console.md`
- `doc/ux/console-command-bar.md`
- `doc/ux/selection-panel.md`
- `doc/ux/selection-model.md`
- `doc/ux/order-lifecycle.md`
- `doc/ux/control-tooltips.md`
- `doc/ux-specification.md`
- `doc/ui-style-guide.md`
- `doc/how-to-play.md`

- [ ] **Step 1: Edit `src/shared/selectionSupportButtonMode.ts`**

The support action names the attack it aims as `kind`, `ranged` or `strike`, in place of the old button label, because the reticle has no text. The comments say "reticle".

1. In `src/shared/selectionSupportButtonMode.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: One result for the button's label and the button click, so those two gates cannot drift.
 * When to use: Branch on the value returned by `selectionSupportButtonMode`. Do not re-derive air versus ranged at the call site.
 * Expected outcome: `hidden` starts nothing (the button is greyed out, see `selectionSupportAction`), `ranged` shows
 *   Ranged or Cancel, and `strike` shows Strike.
```

Replace them with:

```ts
 * Purpose: One result for the reticle's state and its click, so those two gates cannot drift.
 * When to use: Branch on the value returned by `selectionSupportButtonMode`. Do not re-derive air versus ranged at the call site.
 * Expected outcome: `hidden` starts nothing (the reticle is greyed out, see `selectionSupportAction`), `ranged` aims a
 *   ranged attack, and `strike` aims an air strike.
```

2. In `src/shared/selectionSupportButtonMode.ts`, find this line. It occurs exactly once:

```ts
 * Chooses whether the shared support button offers Ranged, Strike, or nothing.
```

Replace it with:

```ts
 * Chooses whether the selection panel's reticle aims a ranged attack, an air strike, or nothing.
```

3. In `src/shared/selectionSupportButtonMode.ts`, find these lines. Together they occur exactly once:

```ts
 * What the support button shows for a selection: its label, whether it can be clicked, and why not.
 *
 * Purpose: The button stays visible while units are selected, so a selection that cannot fire still needs a label
```

Replace them with:

```ts
 * What the reticle shows for a selection: which attack it names, whether it can be clicked, and why not.
 *
 * Purpose: The reticle stays visible while units are selected, so a selection that cannot fire still needs a name
```

4. In `src/shared/selectionSupportButtonMode.ts`, find these lines. Together they occur exactly once:

```ts
   * The button's label before aiming starts.
   *
   * Contract: Strike whenever the selection has an air unit, Ranged otherwise.
   * When to use: The button's text while not aiming.
   * Expected outcome: Matches what a click would start.
   * Exceptions: None.
   */
  readonly label: 'Ranged' | 'Strike';
```

Replace them with:

```ts
   * The attack the reticle names, enabled or greyed out.
   *
   * Contract: `strike` whenever the selection has an air unit, `ranged` otherwise.
   * When to use: The reticle's accessible name and its tip.
   * Expected outcome: Matches what a click would start.
   * Exceptions: None.
   */
  readonly kind: 'ranged' | 'strike';
```

5. In `src/shared/selectionSupportButtonMode.ts`, find these lines. Together they occur exactly once:

```ts
 * Decides the support button's label, whether it can be clicked, and the reason it cannot.
 *
 * Purpose: The selection panel shows Ranged or Strike for every selection and explains a greyed-out button.
 * When to use: Each time the selection or the theater changes, next to `selectionSupportButtonMode`.
 * Expected outcome: All air: Strike, enabled. All able to fire: Ranged, enabled. Air with other types: Strike,
 *   disabled, `STRIKE_NEEDS_AIR_ONLY_REASON`. World-map infantry without air: Ranged, disabled,
 *   `INFANTRY_CANNOT_FIRE_REASON`. Anything else: Ranged, disabled, no reason.
```

Replace them with:

```ts
 * Decides which attack the reticle names, whether it can be clicked, and the reason it cannot.
 *
 * Purpose: The selection panel shows the reticle for every selection and explains a greyed-out one.
 * When to use: Each time the selection or the theater changes, next to `selectionSupportButtonMode`.
 * Expected outcome: All air: strike, enabled. All able to fire: ranged, enabled. Air with other types: strike,
 *   disabled, `STRIKE_NEEDS_AIR_ONLY_REASON`. World-map infantry without air: ranged, disabled,
 *   `INFANTRY_CANNOT_FIRE_REASON`. Anything else: ranged, disabled, no reason.
```

6. In `src/shared/selectionSupportButtonMode.ts`, find these lines. Together they occur exactly once:

```ts
  if (mode === 'strike') return { label: 'Strike', enabled: true, reason: null };
  if (mode === 'ranged') return { label: 'Ranged', enabled: true, reason: null };
  if (unitTypes.includes('air')) return { label: 'Strike', enabled: false, reason: STRIKE_NEEDS_AIR_ONLY_REASON };
  if (!tacticalBattleActive && unitTypes.includes('infantry')) {
    return { label: 'Ranged', enabled: false, reason: INFANTRY_CANNOT_FIRE_REASON };
  }
  return { label: 'Ranged', enabled: false, reason: null };
```

Replace them with:

```ts
  if (mode === 'strike') return { kind: 'strike', enabled: true, reason: null };
  if (mode === 'ranged') return { kind: 'ranged', enabled: true, reason: null };
  if (unitTypes.includes('air')) return { kind: 'strike', enabled: false, reason: STRIKE_NEEDS_AIR_ONLY_REASON };
  if (!tacticalBattleActive && unitTypes.includes('infantry')) {
    return { kind: 'ranged', enabled: false, reason: INFANTRY_CANNOT_FIRE_REASON };
  }
  return { kind: 'ranged', enabled: false, reason: null };
```

- [ ] **Step 2: Edit `src/shared/selectionSupportButtonMode.test.ts`**

The expected results use `kind`. The test count does not change.

1. In `src/shared/selectionSupportButtonMode.test.ts`, find these lines. Together they occur exactly once:

```ts
    assert.deepEqual(selectionSupportAction(['armor'], false), { label: 'Ranged', enabled: true, reason: null });
    assert.deepEqual(selectionSupportAction(['air', 'air'], false), { label: 'Strike', enabled: true, reason: null });
    assert.deepEqual(selectionSupportAction(['infantry'], true), { label: 'Ranged', enabled: true, reason: null });
```

Replace them with:

```ts
    assert.deepEqual(selectionSupportAction(['armor'], false), { kind: 'ranged', enabled: true, reason: null });
    assert.deepEqual(selectionSupportAction(['air', 'air'], false), { kind: 'strike', enabled: true, reason: null });
    assert.deepEqual(selectionSupportAction(['infantry'], true), { kind: 'ranged', enabled: true, reason: null });
```

2. In `src/shared/selectionSupportButtonMode.test.ts`, find these lines. Together they occur exactly once:

```ts
    assert.deepEqual(selectionSupportAction(['armor', 'infantry'], false), {
      label: 'Ranged',
```

Replace them with:

```ts
    assert.deepEqual(selectionSupportAction(['armor', 'infantry'], false), {
      kind: 'ranged',
```

3. In `src/shared/selectionSupportButtonMode.test.ts`, find these lines. Together they occur exactly once:

```ts
    assert.deepEqual(selectionSupportAction(['infantry', 'air'], false), {
      label: 'Strike',
```

Replace them with:

```ts
    assert.deepEqual(selectionSupportAction(['infantry', 'air'], false), {
      kind: 'strike',
```

4. In `src/shared/selectionSupportButtonMode.test.ts`, find this line. It occurs exactly once:

```ts
      label: 'Strike',
```

Replace it with:

```ts
      kind: 'strike',
```

5. In `src/shared/selectionSupportButtonMode.test.ts`, find this line. It occurs exactly once:

```ts
    assert.deepEqual(selectionSupportAction([], false), { label: 'Ranged', enabled: false, reason: null });
```

Replace it with:

```ts
    assert.deepEqual(selectionSupportAction([], false), { kind: 'ranged', enabled: false, reason: null });
```

- [ ] **Step 3: Edit `src/renderer/chrome/controlTooltipText.ts`**

The reticle's four tips, one for each attack while it is off and while it is pressed, chosen by `supportButtonTooltipText`. The air-strike Cancel tip goes, and the target list's tip ends "until you stop aiming".

1. In `src/renderer/chrome/controlTooltipText.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: Says to double-click the target and that the button will read Cancel.
 * When to use: `#ranged-attack-btn` in ranged mode before targeting.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const rangedAimTooltipText =
  'Turn this on, then double-click the target on the map. The button then reads Cancel.';

/**
 * Purpose: Says queued ranged attacks stay in the list.
 * When to use: `#ranged-attack-btn` while ranged targeting is on.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const rangedCancelTooltipText =
  'Stop aiming a ranged attack. Attacks already in the list stay there.';

/**
 * Purpose: Says the target list and Cancel replace this button.
 * When to use: `#ranged-attack-btn` when the selection is air and strike targeting is off.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const strikeAimTooltipText =
  'Turn this on to aim an air strike. A target list and a Cancel button replace this button.';
```

Replace them with:

```ts
 * Purpose: Names the attack the reticle aims for a selection that can fire, and says to double-click the target.
 * When to use: `#ranged-attack-btn` for a ranged selection while ranged targeting is off.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const rangedAimTooltipText = 'Aim a ranged attack. Turn this on, then double-click the target on the map.';

/**
 * Purpose: Says a second click stops aiming and queued ranged attacks stay in the list.
 * When to use: `#ranged-attack-btn` while ranged targeting is on.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const rangedStopTooltipText = 'Stop aiming a ranged attack. Attacks already in the list stay there.';

/**
 * Purpose: Names the attack the reticle aims for an all-air selection, and points to the target list beside it.
 * When to use: `#ranged-attack-btn` for an air selection while strike targeting is off.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const strikeAimTooltipText =
  'Aim an air strike. Turn this on, pick a target type in the list beside it, then double-click the target on the map.';

/**
 * Purpose: Says a second click stops aiming and queued strikes stay in the list.
 * When to use: `#ranged-attack-btn` while strike targeting is on.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const strikeStopTooltipText = 'Stop aiming an air strike. Strikes already in the list stay there.';
```

2. In `src/renderer/chrome/controlTooltipText.ts`, find these lines. Together they occur exactly once:

```ts
  'Choose enemy units, production, airports, or seaports. Your next double-click uses that choice until you cancel.';

/**
 * Purpose: Says Strike returns and queued strikes stay.
 * When to use: `#air-strike-cancel-btn`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const airStrikeCancelTooltipText =
  'Stop aiming an air strike and show Strike again. Strikes already in the list stay there.';

/**
 * Purpose: One button wears three labels. The tip must match the label on screen.
 * When to use: Beside each assignment of `#ranged-attack-btn` text.
 * Expected outcome: The sentence for that label.
 * Exceptions: None. The parameter is only those three labels.
 */
export function rangedButtonTooltipText(label: 'Ranged' | 'Cancel' | 'Strike'): string {
  if (label === 'Cancel') return rangedCancelTooltipText;
  if (label === 'Strike') return strikeAimTooltipText;
  return rangedAimTooltipText;
```

Replace them with:

```ts
  'Choose enemy units, production, airports, or seaports. Your next double-click uses that choice until you stop aiming.';

/**
 * Purpose: One reticle aims both kinds of attack and stops aiming when clicked again. The tip must match the attack it
 *   aims and whether it is pressed.
 * When to use: Each time `#ranged-attack-btn` is updated for a selection that can use it.
 * Expected outcome: The sentence for that attack and that state.
 * Exceptions: None.
 */
export function supportButtonTooltipText(kind: 'ranged' | 'strike', aiming: boolean): string {
  if (kind === 'strike') return aiming ? strikeStopTooltipText : strikeAimTooltipText;
  return aiming ? rangedStopTooltipText : rangedAimTooltipText;
```

- [ ] **Step 4: Edit `src/renderer/chrome/frameTooltipText.ts`**

The collapse button's tip goes. Each enabled console tab's tip gains one sentence saying how to hide the console.

1. In `src/renderer/chrome/frameTooltipText.ts`, find these lines. Together they occur exactly once:

```ts
 * The Orders tab's tip. This module holds the control tips for the app frame around the map: set
 * `data-control-tooltip` from these values, and keep the static markup in `static/index.html` the same, character for
 * character.
 *
 * Purpose: Says what the Orders tab shows.
 * When to use: `#console-tab-orders`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const ordersTabTooltipText = 'Show the orders queued for this turn or beat.';
```

Replace them with:

```ts
 * The sentence that ends each enabled console tab's tip. This module holds the control tips for the app frame around
 * the map: set `data-control-tooltip` from these values, and keep the static markup in `static/index.html` the same,
 * character for character.
 *
 * Purpose: The console has no collapse button, so each tab says how to hide it.
 * When to use: The last sentence of the Orders, Reports, and Opponent tabs' tips.
 * Expected outcome: The control tip ends with this sentence.
 * Exceptions: None.
 */
const consoleTabCollapseSentence = 'Click the selected tab to hide the console and widen the map.';

/**
 * The Orders tab's tip.
 *
 * Purpose: Says what the Orders tab shows, and how to hide the console.
 * When to use: `#console-tab-orders`.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const ordersTabTooltipText = `Show the orders queued for this turn or beat. ${consoleTabCollapseSentence}`;
```

2. In `src/renderer/chrome/frameTooltipText.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: Says what the Opponent tab shows.
 * When to use: `#console-tab-opponent`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const opponentTabTooltipText = "Show whether the opponent is planning, its model, its tools, and the AI activity log.";
```

Replace them with:

```ts
 * Purpose: Says what the Opponent tab shows, and how to hide the console.
 * When to use: `#console-tab-opponent`.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const opponentTabTooltipText =
  `Show whether the opponent is planning, its model, its tools, and the AI activity log. ${consoleTabCollapseSentence}`;
```

3. In `src/renderer/chrome/frameTooltipText.ts`, find these lines. Together they occur exactly once:

```ts
/**
 * Purpose: Says collapsing widens the map and how to bring the console back.
 * When to use: `#console-collapse-btn`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const collapseConsoleTooltipText = 'Hide the console to widen the map. Click a tab to show it again.';

/**
```

Replace them with:

```ts
/**
```

4. In `src/renderer/chrome/frameTooltipText.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: Says what the Reports tab lists.
 * When to use: `#console-tab-reports`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const reportsTabTooltipText = 'Show the turn reports, opponent messages, and notices from this match, newest first.';
```

Replace them with:

```ts
 * Purpose: Says what the Reports tab lists, and how to hide the console.
 * When to use: `#console-tab-reports`.
 * Expected outcome: The control tip shows these sentences.
 * Exceptions: None.
 */
export const reportsTabTooltipText =
  `Show the turn reports, opponent messages, and notices from this match, newest first. ${consoleTabCollapseSentence}`;
```

- [ ] **Step 5: Edit `src/renderer/gameplay/tacticalOrders.ts`**

`updateRangedSidebar` keeps the reticle on screen while aiming. It sets the reticle's accessible name and `aria-pressed`, and shows the strike target list beside it while a strike is aimed. The Cancel label and the Cancel button go.

1. In `src/renderer/gameplay/tacticalOrders.ts`, find these lines. Together they occur exactly once:

```ts
import { rangedButtonTooltipText } from '../chrome/controlTooltipText';
export { refreshHoverRoutePreview };
```

Replace them with:

```ts
import { supportButtonTooltipText } from '../chrome/controlTooltipText';
export { refreshHoverRoutePreview };

/**
 * The reticle's accessible names, one per kind of attack.
 *
 * Purpose: The reticle is an icon with no visible label, so assistive technology and the smoke run read this name.
 * When to use: `updateRangedSidebar`, as `aria-label` on `#ranged-attack-btn`.
 * Expected outcome: The name of the attack a click would aim, greyed out or not.
 * Exceptions: None.
 */
const SUPPORT_BUTTON_NAMES = Object.freeze({ ranged: 'Ranged attack', strike: 'Air strike' });
```

2. In `src/renderer/gameplay/tacticalOrders.ts`, find these lines. Together they occur exactly once:

```ts
 * Rebuilds the pending ranged and air-strike rows and sets Ranged or Strike for the current selection.
 *
 * Purpose: The shared button follows `selectionSupportButtonMode`, and `selectionSupportAction` labels and explains it
 *   when it cannot be used. Clearing a targeting flag here must also drop a hover preview that sampled the old flag.
 * When to use: After a selection change, a pending-order change, or a targeting-mode toggle.
 * Expected outcome: Pending rows match the draft arrays. The button shows while units are selected; its tip host
 *   (`#ranged-attack-tip-host`) is what shows and hides. It is enabled when every resolved unit can range, or every
 *   resolved unit is air; otherwise it is greyed out, and its reason is in `#selection-panel-action-note` and is the
 *   tip host's tip. `Cancel` stays while ranged mode is still valid. A true-to-false flag change nulls the hover preview,
```

Replace them with:

```ts
 * Rebuilds the pending ranged and air-strike rows and sets the reticle for the current selection.
 *
 * Purpose: The reticle follows `selectionSupportButtonMode`, and `selectionSupportAction` names it and explains it when
 *   it cannot be used. Clearing a targeting flag here must also drop a hover preview that sampled the old flag.
 * When to use: After a selection change, a pending-order change, or a targeting-mode toggle.
 * Expected outcome: Pending rows match the draft arrays. The reticle shows while units are selected; its tip host
 *   (`#ranged-attack-tip-host`) is what shows and hides. It is enabled when every resolved unit can range, or every
 *   resolved unit is air; otherwise it is greyed out, and its reason is in `#selection-panel-action-note` and is the
 *   tip host's tip. Its `aria-label` names the attack, and `aria-pressed` is true while that attack is aimed; the strike
 *   target list shows beside it only while a strike is aimed. A true-to-false flag change nulls the hover preview,
```

3. In `src/renderer/gameplay/tacticalOrders.ts`, delete this line, including the line break at the end. It occurs exactly once:

```ts
  const strikeCancelEl = document.getElementById('air-strike-cancel-btn') as HTMLButtonElement | null;
```

4. In `src/renderer/gameplay/tacticalOrders.ts`, find these lines. Together they occur exactly once:

```ts
    if (mode === 'strike') {
      S.rangedModeActive = false;
      btnEl.textContent = 'Strike';
      btnEl.setAttribute('data-control-tooltip', rangedButtonTooltipText('Strike'));
      // An empty display hands the host back to `.control-tooltip-host`, whose inline flex keeps the button centered.
      btnHostEl.style.display = S.airStrikeModeActive ? 'none' : '';
```

Replace them with:

```ts
    // An empty display hands the host back to `.control-tooltip-host`, whose inline flex keeps the button centered.
    btnHostEl.style.display = '';
    // The reticle has no visible label, so its name says which attack it aims, greyed out or not.
    btnEl.setAttribute('aria-label', SUPPORT_BUTTON_NAMES[action.kind]);
    if (mode === 'strike') {
      S.rangedModeActive = false;
      btnEl.setAttribute('aria-pressed', String(S.airStrikeModeActive));
      btnEl.setAttribute('data-control-tooltip', supportButtonTooltipText('strike', S.airStrikeModeActive));
```

5. In `src/renderer/gameplay/tacticalOrders.ts`, find these lines. Together they occur exactly once:

```ts
      if (strikeCancelEl) {
        strikeCancelEl.style.display = S.airStrikeModeActive ? '' : 'none';
      }
    } else if (mode === 'ranged') {
      S.airStrikeModeActive = false;
      btnHostEl.style.display = '';
      btnEl.textContent = S.rangedModeActive ? 'Cancel' : 'Ranged';
      btnEl.setAttribute(
        'data-control-tooltip',
        rangedButtonTooltipText(S.rangedModeActive ? 'Cancel' : 'Ranged')
      );
      if (strikeTypeEl) strikeTypeEl.style.display = 'none';
      if (strikeCancelEl) strikeCancelEl.style.display = 'none';
    } else {
      // Greyed out with its reason: the button stays visible so the player can see why it cannot be used.
      btnHostEl.style.display = '';
      btnEl.textContent = action.label;
```

Replace them with:

```ts
    } else if (mode === 'ranged') {
      S.airStrikeModeActive = false;
      btnEl.setAttribute('aria-pressed', String(S.rangedModeActive));
      btnEl.setAttribute('data-control-tooltip', supportButtonTooltipText('ranged', S.rangedModeActive));
      if (strikeTypeEl) strikeTypeEl.style.display = 'none';
    } else {
      // Greyed out with its reason: the reticle stays visible so the player can see why it cannot be used.
      btnEl.setAttribute('aria-pressed', 'false');
```

6. In `src/renderer/gameplay/tacticalOrders.ts`, delete this line, including the line break at the end. It occurs exactly once:

```ts
      if (strikeCancelEl) strikeCancelEl.style.display = 'none';
```

- [ ] **Step 6: Edit `src/renderer/map/initCore.ts`**

A click on the pressed reticle stops aiming, for a ranged attack or an air strike alike. The air-strike Cancel button's handler goes.

1. In `src/renderer/map/initCore.ts`, find these lines. Together they occur exactly once:

```ts
  document.getElementById('ranged-attack-btn')?.addEventListener('click', () => {
    if (S.airStrikeModeActive) {
      S.airStrikeModeActive = false;
      void deps.refreshHoverRoutePreview();
    } else if (S.rangedModeActive) {
      S.rangedModeActive = false;
```

Replace them with:

```ts
  // The reticle is a toggle: a click while a ranged attack or an air strike is aimed stops aiming, and otherwise starts
  // aiming the attack the selection can make.
  document.getElementById('ranged-attack-btn')?.addEventListener('click', () => {
    if (S.airStrikeModeActive || S.rangedModeActive) {
      S.airStrikeModeActive = false;
      S.rangedModeActive = false;
      hideOrderSlowerHexTooltip();
```

2. In `src/renderer/map/initCore.ts`, delete these lines, including the line break at the end. Together they occur exactly once:

```ts
  });
  document.getElementById('air-strike-cancel-btn')?.addEventListener('click', () => {
    S.airStrikeModeActive = false;
    hideOrderSlowerHexTooltip();
    void deps.refreshHoverRoutePreview();
    deps.updateRangedSidebar();
    deps.redraw();
```

- [ ] **Step 7: Edit `src/renderer/chrome/consoleFrame.ts`**

The collapse button's wiring goes. A click on the selected tab already collapses the console (`nextConsoleTabState`).

1. In `src/renderer/chrome/consoleFrame.ts`, find this line. It occurs exactly once:

```ts
 * The console docked on the right: its tab rail, its title, and collapsing it to the rail.
```

Replace it with:

```ts
 * The console docked on the right: its tab rail, its title, and collapsing it to the rail. A click on the selected tab
 * collapses the console, and a click on any tab expands it again, so the header has no collapse button of its own.
```

2. In `src/renderer/chrome/consoleFrame.ts`, find this line. It occurs exactly once:

```ts
 * Purpose: The rail, the panels, the title, the collapse attribute, and the collapse button change together.
```

Replace it with:

```ts
 * Purpose: The rail, the panels, the title, and the collapse attribute change together.
```

3. In `src/renderer/chrome/consoleFrame.ts`, delete this line, including the line break at the end. It occurs exactly once:

```ts
  document.getElementById('console-collapse-btn')?.setAttribute('aria-expanded', consoleState.collapsed ? 'false' : 'true');
```

4. In `src/renderer/chrome/consoleFrame.ts`, find these lines. Together they occur exactly once:

```ts
 * Wires the rail's tabs and the collapse button.
 *
 * Purpose: One bootstrap for the console's own behavior.
 * When to use: Once during renderer startup, after the page markup exists.
 * Expected outcome: A tab click follows `nextConsoleTabState`. The collapse button collapses the console. The header
 *   and badges follow every change to the queued orders and the reports. The console starts expanded on Orders.
```

Replace them with:

```ts
 * Wires the rail's tabs.
 *
 * Purpose: One bootstrap for the console's own behavior.
 * When to use: Once during renderer startup, after the page markup exists.
 * Expected outcome: A tab click follows `nextConsoleTabState`: the selected tab collapses the console, and any tab
 *   expands it. The header and badges follow every change to the queued orders and the reports. The console starts
 *   expanded on Orders.
```

5. In `src/renderer/chrome/consoleFrame.ts`, delete these lines, including the line break at the end. Together they occur exactly once:

```ts
  document.getElementById('console-collapse-btn')?.addEventListener('click', () => {
    consoleState = { activeTabId: consoleState.activeTabId, collapsed: true };
    applyConsoleState();
  });
```

- [ ] **Step 8: Edit `src/renderer/renderer.ts`**

A comment only: the source-contract anchor for hiding Strike while aiming goes.

In `src/renderer/renderer.ts`, delete this line, including the line break at the end. It occurs exactly once:

```ts
  // btnHostEl.style.display = S.airStrikeModeActive ? 'none' : '';
```

- [ ] **Step 9: Edit `src/main/rendererConsolidation.test.ts`**

The source-contract check looks for the reticle's pressed state in place of Strike hiding while aiming. The test count does not change.

In `src/main/rendererConsolidation.test.ts`, find these lines. Together they occur exactly once:

```ts
    source.includes("btnHostEl.style.display = S.airStrikeModeActive ? 'none' : '';") &&
      tacticalOrdersSource.includes("btnHostEl.style.display = S.airStrikeModeActive ? 'none' : '';"),
    'Strike button should hide while strike planning mode is active'
```

Replace them with:

```ts
    tacticalOrdersSource.includes("btnEl.setAttribute('aria-pressed', String(S.airStrikeModeActive));") &&
      tacticalOrdersSource.includes("btnEl.setAttribute('aria-pressed', String(S.rangedModeActive));"),
    'the reticle should stay shown and read as pressed while strike or ranged planning mode is active'
```

- [ ] **Step 10: Checkpoint: build, types, and lint**

Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
```

Each exits 0, and `check:renderer-types` prints `check-renderer-typecheck: ok`. An error here comes from the steps above: open the file the error names, compare it with its step, fix your copying mistake, and run the three again. If the steps as written cannot compile, stop and report.

- [ ] **Step 11: Edit `static/index.html`**

The console header loses its collapse button, and each enabled console tab's tip gains the sentence from `frameTooltipText.ts`. In the selection bar, Ranged becomes the reticle button, the air-strike Cancel button goes, the target list's tip changes, and the close control's × becomes a line icon like the chevron.

1. In `static/index.html`, find these lines. Together they occur exactly once:

```html
          <span id="ranged-attack-tip-host" class="control-tooltip-host" style="display: none;"><button type="button" id="ranged-attack-btn" class="ranged-btn">Ranged</button></span>
          <select id="air-strike-target-type" class="ranged-btn" style="display: none;" data-control-tooltip="Choose enemy units, production, airports, or seaports. Your next double-click uses that choice until you cancel.">
```

Replace them with:

```html
          <span id="ranged-attack-tip-host" class="control-tooltip-host" style="display: none;"><button type="button" id="ranged-attack-btn" class="selection-panel-reticle" aria-label="Ranged attack" aria-pressed="false"><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.5"></circle><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3"></path></svg></button></span>
          <select id="air-strike-target-type" class="ranged-btn" style="display: none;" data-control-tooltip="Choose enemy units, production, airports, or seaports. Your next double-click uses that choice until you stop aiming.">
```

2. In `static/index.html`, find these lines. Together they occur exactly once:

```html
          <button type="button" id="air-strike-cancel-btn" class="ranged-btn" style="display: none;" data-control-tooltip="Stop aiming an air strike and show Strike again. Strikes already in the list stay there.">Cancel</button>
        </div>
        <button type="button" id="selection-panel-close" class="selection-panel-close" aria-label="Clear the selection" data-control-tooltip="Clear the selection. Queued orders stay.">×</button>
```

Replace them with:

```html
        </div>
        <button type="button" id="selection-panel-close" class="selection-panel-close" aria-label="Clear the selection" data-control-tooltip="Clear the selection. Queued orders stay."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"></path></svg></button>
```

3. In `static/index.html`, delete this line, including the line break at the end. It occurs exactly once:

```html
        <button type="button" id="console-collapse-btn" class="console-collapse-btn" aria-label="Collapse the console" aria-controls="sidebar" aria-expanded="true" data-control-tooltip="Hide the console to widen the map. Click a tab to show it again."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5"></path></svg></button>
```

4. In `static/index.html`, find these lines. Together they occur exactly once:

```html
      <button type="button" id="console-tab-orders" class="console-tab" role="tab" aria-selected="true" aria-controls="console-panel-orders" data-control-tooltip="Show the orders queued for this turn or beat."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 4h9M5 8h9M5 12h9M2 4h.1M2 8h.1M2 12h.1"></path></svg><span>Orders</span><span id="console-tab-orders-badge" class="console-tab-badge" hidden></span></button>
      <button type="button" id="console-tab-reports" class="console-tab" role="tab" aria-selected="false" aria-controls="console-panel-reports" data-control-tooltip="Show the turn reports, opponent messages, and notices from this match, newest first."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 9.5l2-6h9l2 6v4h-13zM1.5 9.5h4l1 1.5h3l1-1.5h4"></path></svg><span>Reports</span><span id="console-tab-reports-badge" class="console-tab-badge" hidden></span></button>
      <button type="button" id="console-tab-opponent" class="console-tab" role="tab" aria-selected="false" aria-controls="console-panel-opponent" data-control-tooltip="Show whether the opponent is planning, its model, its tools, and the AI activity log."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1"></rect><path d="M6 1.5V4M10 1.5V4M6 12v2.5M10 12v2.5M1.5 6H4M1.5 10H4M12 6h2.5M12 10h2.5"></path></svg><span>Opponent</span></button>
```

Replace them with:

```html
      <button type="button" id="console-tab-orders" class="console-tab" role="tab" aria-selected="true" aria-controls="console-panel-orders" data-control-tooltip="Show the orders queued for this turn or beat. Click the selected tab to hide the console and widen the map."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 4h9M5 8h9M5 12h9M2 4h.1M2 8h.1M2 12h.1"></path></svg><span>Orders</span><span id="console-tab-orders-badge" class="console-tab-badge" hidden></span></button>
      <button type="button" id="console-tab-reports" class="console-tab" role="tab" aria-selected="false" aria-controls="console-panel-reports" data-control-tooltip="Show the turn reports, opponent messages, and notices from this match, newest first. Click the selected tab to hide the console and widen the map."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 9.5l2-6h9l2 6v4h-13zM1.5 9.5h4l1 1.5h3l1-1.5h4"></path></svg><span>Reports</span><span id="console-tab-reports-badge" class="console-tab-badge" hidden></span></button>
      <button type="button" id="console-tab-opponent" class="console-tab" role="tab" aria-selected="false" aria-controls="console-panel-opponent" data-control-tooltip="Show whether the opponent is planning, its model, its tools, and the AI activity log. Click the selected tab to hide the console and widen the map."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1"></rect><path d="M6 1.5V4M10 1.5V4M6 12v2.5M10 12v2.5M1.5 6H4M1.5 10H4M12 6h2.5M12 10h2.5"></path></svg><span>Opponent</span></button>
```

- [ ] **Step 12: Edit `static/frameChrome.css`**

The collapse button's rules go, and the header's right padding matches its left.

1. In `static/frameChrome.css`, find these lines. Together they occur exactly once:

```css
}
.console-header {
```

Replace them with:

```css
}
/* The title and the subtitle. The header has no collapse button: clicking the selected tab collapses the console, so
   the subtitle runs to the same 16 px inset on the right as the title has on the left. */
.console-header {
```

2. In `static/frameChrome.css`, find this line. It occurs exactly once:

```css
  padding: 0 10px 0 16px;
```

Replace it with:

```css
  padding: 0 16px;
```

3. In `static/frameChrome.css`, delete these lines, including the line break at the end. Together they occur exactly once:

```css
}
.console-collapse-btn {
  flex: none;
  width: 28px;
  height: 28px;
  margin-left: auto;
  padding: 0;
  border: 1px solid var(--chrome-border);
  border-radius: 4px;
  background: transparent;
  color: var(--chrome-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.console-collapse-btn:hover {
  background: var(--chrome-bg-raised);
```

- [ ] **Step 13: Edit `static/selectionChrome.css`**

The close control mirrors the expand control at the bar's right end: the bar's full height, 32 px wide, with a divider on its left. The reticle gets its square size and its pressed colors.

1. In `static/selectionChrome.css`, find these lines. Together they occur exactly once:

```css
/* One 50 px row that never scrolls: the expand control, two lines of text, a divider, Ranged or Strike, and the close
   control. The controls keep their size and the text gives way. The right padding keeps the close control clear of the
   grip. */
```

Replace them with:

```css
/* One 50 px row that never scrolls: the expand control, two lines of text, a divider, the reticle, and the close
   control. The controls keep their size and the text gives way. */
```

2. In `static/selectionChrome.css`, find these lines. Together they occur exactly once:

```css
  padding: 0 16px 0 0;
  box-sizing: border-box;
}
/* The bar's full height on its left edge. The chevron points up while the panel is compact or expanding, and turns down
   once it is expanded, until it is compact again. */
.selection-panel-expand {
```

Replace them with:

```css
  padding: 0;
  box-sizing: border-box;
}
/* The two end controls take the bar's full height, each with a divider on its inner side: expand on the left edge and
   close on the right. The chevron points up while the panel is compact or expanding, and turns down once it is
   expanded, until it is compact again. While the panel is expanded, the resize grip sits over the close control's
   top-right corner, clear of its glyph. */
.selection-panel-expand,
.selection-panel-close {
```

3. In `static/selectionChrome.css`, delete this line, including the line break at the end. It occurs exactly once:

```css
  border-right: 1px solid var(--chrome-divider);
```

4. In `static/selectionChrome.css`, find these lines. Together they occur exactly once:

```css
.selection-panel-expand:hover {
  background: var(--chrome-bg-raised);
}
.selection-panel-expand:focus {
```

Replace them with:

```css
.selection-panel-expand {
  border-right: 1px solid var(--chrome-divider);
}
.selection-panel-close {
  border-left: 1px solid var(--chrome-divider);
}
.selection-panel-expand:hover,
.selection-panel-close:hover {
  background: var(--chrome-bg-raised);
}
.selection-panel-expand:focus,
.selection-panel-close:focus {
```

5. In `static/selectionChrome.css`, delete these lines, including the line break at the end. Together they occur exactly once:

```css
}
.selection-panel-close {
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--chrome-border);
  border-radius: 3px;
  background: transparent;
  color: var(--chrome-text);
  font-size: 14px;
  line-height: 1;
}
.selection-panel-close:hover {
  background: var(--chrome-bg-raised);
```

6. In `static/selectionChrome.css`, find these lines. Together they occur exactly once:

```css
/* Ranged or Strike, or the strike target list and its Cancel, in the bar. The reason a greyed-out control cannot be used
   sits in the details under the unit rows. */
```

Replace them with:

```css
/* The reticle that aims a ranged attack or an air strike, and while a strike is aimed, the target list beside it. The
   reason a greyed-out reticle cannot be used sits in the details under the unit rows. */
```

7. In `static/selectionChrome.css`, find this line. It occurs exactly once:

```css
  gap: 0.35rem;
```

Replace it with:

```css
  gap: 0.35rem;
}
/* One square button for both kinds of attack, at the target list's height. Its colors come from the shared button rules
   until the player aims: then it reads as pressed in the color of the order being aimed, the same color as the panel's
   border (selectionBar.ts sets data-aim, and tacticalOrders.ts sets aria-pressed). */
.selection-panel-reticle {
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.selection-panel[data-aim="ranged"] .selection-panel-reticle[aria-pressed="true"] {
  background: var(--order-ranged);
  border-color: var(--order-ranged);
}
.selection-panel[data-aim="strike"] .selection-panel-reticle[aria-pressed="true"] {
  background: var(--order-strike);
  border-color: var(--order-strike);
}
.selection-panel[data-aim] .selection-panel-reticle[aria-pressed="true"]:hover {
  filter: brightness(1.2);
```

- [ ] **Step 14: Edit `scripts/ui-smoke/ui-smoke-scenes.cjs`**

Two new scenes, a ranged attack aimed and a strike stopped. The selection bar constants gain the ferry hint, the reticle's two names, and the ranged amber.

1. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find these lines. Together they occur exactly once:

```js
  selectionCleared: 'selection-cleared',
  selectionStack: 'selection-stack',
  strikeAiming: 'strike-aiming',
```

Replace them with:

```js
  rangedAiming: 'ranged-aiming',
  selectionCleared: 'selection-cleared',
  selectionStack: 'selection-stack',
  strikeAiming: 'strike-aiming',
  strikeStopped: 'strike-stopped',
```

2. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find these lines. Together they occur exactly once:

```js
 * The selection bar's hints the smoke scenes reach, and the border color while a strike is aimed.
 *
 * Purpose: The checks compare the bar's second line and border with the rules in `src/shared/selectionBarText.ts` and
 *   `static/selectionChrome.css`.
 * When to use: The selection bar checks.
 * Expected outcome: The move hint, the targeting hint, and the strike purple as a computed color.
```

Replace them with:

```js
 * The selection bar's hints the smoke scenes reach, the reticle's names, and the colors of an aimed attack.
 *
 * Purpose: The checks compare the bar's second line, the reticle, and the border with the rules in
 *   `src/shared/selectionBarText.ts`, `src/renderer/gameplay/tacticalOrders.ts`, and `static/selectionChrome.css`.
 * When to use: The selection bar checks.
 * Expected outcome: The move, ferry, and targeting hints; the reticle's accessible name for each attack; and the ranged
 *   amber and strike purple as computed colors. While an attack is aimed, the panel's border and the pressed reticle's
 *   face both take that attack's color.
```

3. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find this line. It occurs exactly once:

```js
  targetingHint: 'Double-click a target in range',
```

Replace it with:

```js
  ferryHint: 'Double-click a hex to ferry · right-click to deselect',
  targetingHint: 'Double-click a target in range',
  rangedName: 'Ranged attack',
  strikeName: 'Air strike',
  rangedBorder: 'rgb(160, 96, 32)',
```

- [ ] **Step 15: Edit `scripts/ui-smoke/ui-smoke-checks.cjs`**

The probe also reads each element's accessible name and background color.

1. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
   *   border color, and pointer events, its control tip sentence, and selected attributes, and the trimmed text of every
   *   match, or null when the selector matches nothing.
```

Replace them with:

```js
   *   border color, background color, and pointer events, its control tip sentence, and selected attributes, including
   *   its accessible name, and the trimmed text of every match, or null when the selector matches nothing.
```

2. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
      fontSize: getComputedStyle(el).fontSize,
      borderColor: getComputedStyle(el).borderTopColor,
```

Replace them with:

```js
      label: el.getAttribute('aria-label'),
      fontSize: getComputedStyle(el).fontSize,
      borderColor: getComputedStyle(el).borderTopColor,
      background: getComputedStyle(el).backgroundColor,
```

- [ ] **Step 16: Edit `scripts/ui-smoke/ui-smoke-console-checks.cjs`**

Checks for the close control's place, the reticle in each state, and the console header without a collapse button.

1. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
/**
 * The content checks for the console and the selection panel, one row each.
```

Replace them with:

```js
/**
 * The console header's inset on each side, in CSS pixels.
 *
 * Purpose: With no collapse button, the subtitle runs to the same inset on the right as the title has on the left.
 * When to use: The console header check.
 * Expected outcome: Matches the padding of `.console-header` in `static/frameChrome.css`.
 * Exceptions: None.
 */
const CONSOLE_HEADER_INSET = 16;

/**
 * Says what is wrong with the selection bar's reticle, if anything.
 *
 * Purpose: Every reticle check reads the same things: it shows in the bar as an icon with no text, its accessible name
 *   says which attack it aims, and its enabled and pressed states.
 * When to use: With the probe of `#ranged-attack-btn` and the expected `{ name, enabled, pressed }`.
 * Expected outcome: Null when the reticle matches, otherwise a failure message.
 * Exceptions: None.
 */
function reticleProblem(reticle, expected) {
  if (!reticle.shown || !reticle.ancestorIds.includes('selection-panel-bar')) return 'the reticle is not shown in the summary bar';
  if (reticle.text !== '') return `the reticle reads "${reticle.text}", expected an icon with no text`;
  if (reticle.label !== expected.name) return `the reticle is named "${reticle.label}", expected "${expected.name}"`;
  if (reticle.disabled === expected.enabled) return `the reticle is ${reticle.disabled ? 'greyed out' : 'enabled'}, expected it ${expected.enabled ? 'enabled' : 'greyed out'}`;
  return reticle.pressed === String(expected.pressed) ? null : `the reticle reads aria-pressed=${reticle.pressed}, expected ${expected.pressed}`;
}

/**
 * The content checks for the console and the selection panel, one row each.
```

2. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find this line. It occurs exactly once:

```js
    scenes: [SCENES.ordersQueued, SCENES.selectionStack, SCENES.strikeAiming, SCENES.selectionExpanded],
```

Replace it with:

```js
    scenes: [SCENES.ordersQueued, SCENES.rangedAiming, SCENES.selectionStack, SCENES.strikeAiming, SCENES.selectionExpanded],
```

3. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find this line. It occurs exactly once:

```js
      if (!el('#selection-panel-close').ancestorIds.includes('selection-panel-bar')) return 'the close control is not in the summary bar';
```

Replace it with:

```js
      const close = el('#selection-panel-close');
      if (!close.ancestorIds.includes('selection-panel-bar')) return 'the close control is not in the summary bar';
      if (!near(close.x + close.w, s.x + s.w - 1) || !near(close.h, SELECTION_BAR_HEIGHT) || !near(close.w, expand.w)) {
        return `the close control is at ${fmt(close)}, expected the bar's full height at its right edge, as wide as the expand control ${fmt(expand)}`;
      }
```

4. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
      return ranged.shown && !ranged.disabled && ranged.text === 'Ranged' && ranged.ancestorIds.includes('selection-panel-bar')
        ? null
        : `Ranged reads "${ranged.text}"${ranged.shown ? '' : ' and is hidden'}${ranged.disabled ? ' and is disabled' : ''}, expected it enabled in the summary bar`;
```

Replace them with:

```js
      return reticleProblem(ranged, { name: SELECTION_BAR.rangedName, enabled: true, pressed: false });
```

5. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
      const ranged = el('#ranged-attack-btn');
      if (!(ranged.shown && ranged.disabled && ranged.text === 'Ranged')) {
        return `Ranged reads "${ranged.text}"${ranged.shown ? '' : ' and is hidden'}${ranged.disabled ? '' : ' and is enabled'}, expected it greyed out`;
      }
```

Replace them with:

```js
      const problem = reticleProblem(el('#ranged-attack-btn'), { name: SELECTION_BAR.rangedName, enabled: false, pressed: false });
      if (problem) return problem;
```

6. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
    name: 'strike-aiming-in-panel',
    scenes: [SCENES.strikeAiming],
    needs: ['#ranged-attack-btn', '#air-strike-target-type', '#air-strike-cancel-btn', '#sidebar-selected-unit', '#selection-panel-hint', '#selection-panel'],
    run: (p, el) => {
      if (el('#ranged-attack-btn').shown) return 'Strike still shows while aiming';
      const missing = ['#air-strike-target-type', '#air-strike-cancel-btn']
        .filter((selector) => !el(selector).shown || !el(selector).ancestorIds.includes('selection-panel-bar'));
      if (missing.length > 0) return `not shown in the summary bar: ${missing.join(', ')}`;
```

Replace them with:

```js
    name: 'ranged-aiming-in-panel',
    scenes: [SCENES.rangedAiming],
    needs: ['#ranged-attack-btn', '#air-strike-target-type', '#selection-panel-hint', '#selection-panel'],
    run: (p, el) => {
      const ranged = el('#ranged-attack-btn');
      const problem = reticleProblem(ranged, { name: SELECTION_BAR.rangedName, enabled: true, pressed: true });
      if (problem) return problem;
      if (el('#air-strike-target-type').shown) return 'the strike target list shows while a ranged attack is aimed';
      const hint = el('#selection-panel-hint').text;
      if (hint !== SELECTION_BAR.targetingHint) return `the hint reads "${hint}", expected "${SELECTION_BAR.targetingHint}"`;
      const border = el('#selection-panel').borderColor;
      if (border !== SELECTION_BAR.rangedBorder) return `the panel's border is ${border}, expected the ranged amber ${SELECTION_BAR.rangedBorder}`;
      return ranged.background === SELECTION_BAR.rangedBorder ? null : `the pressed reticle's face is ${ranged.background}, expected the ranged amber ${SELECTION_BAR.rangedBorder}`;
    },
  },
  {
    name: 'strike-aiming-in-panel',
    scenes: [SCENES.strikeAiming],
    needs: ['#ranged-attack-btn', '#air-strike-target-type', '#sidebar-selected-unit', '#selection-panel-hint', '#selection-panel'],
    run: (p, el) => {
      const strike = el('#ranged-attack-btn');
      const problem = reticleProblem(strike, { name: SELECTION_BAR.strikeName, enabled: true, pressed: true });
      if (problem) return problem;
      const list = el('#air-strike-target-type');
      if (!list.shown || !list.ancestorIds.includes('selection-panel-bar')) return 'the strike target list is not shown in the summary bar';
      if (list.x < strike.x + strike.w) return `the target list ${fmt(list)} is not to the right of the reticle ${fmt(strike)}`;
```

7. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find this line. It occurs exactly once:

```js
      return border === SELECTION_BAR.strikeBorder ? null : `the panel's border is ${border}, expected the strike purple ${SELECTION_BAR.strikeBorder}`;
```

Replace it with:

```js
      if (border !== SELECTION_BAR.strikeBorder) return `the panel's border is ${border}, expected the strike purple ${SELECTION_BAR.strikeBorder}`;
      return strike.background === SELECTION_BAR.strikeBorder ? null : `the pressed reticle's face is ${strike.background}, expected the strike purple ${SELECTION_BAR.strikeBorder}`;
    },
  },
  {
    name: 'strike-stopped-by-reticle',
    scenes: [SCENES.strikeStopped],
    needs: ['#ranged-attack-btn', '#air-strike-target-type', '#selection-panel-hint', '#selection-panel'],
    run: (p, el) => {
      const problem = reticleProblem(el('#ranged-attack-btn'), { name: SELECTION_BAR.strikeName, enabled: true, pressed: false });
      if (problem) return problem;
      if (el('#air-strike-target-type').shown) return 'the strike target list still shows after the reticle stopped aiming';
      const hint = el('#selection-panel-hint').text;
      if (hint !== SELECTION_BAR.ferryHint) return `the hint reads "${hint}", expected "${SELECTION_BAR.ferryHint}"`;
      const border = el('#selection-panel').borderColor;
      return border === SELECTION_BAR.strikeBorder ? 'the panel keeps the strike border after the reticle stopped aiming' : null;
    },
  },
  {
    name: 'console-header-without-collapse-button',
    scenes: [SCENES.strategic],
    needs: ['#console-main', '#console-subtitle'],
    run: (p, el) => {
      const main = el('#console-main');
      const subtitle = el('#console-subtitle');
      return near(subtitle.x + subtitle.w, main.x + main.w - CONSOLE_HEADER_INSET)
        ? null
        : `the subtitle ends at ${Math.round(subtitle.x + subtitle.w)}, expected it to run to ${CONSOLE_HEADER_INSET} px inside the console's right edge at ${Math.round(main.x + main.w)}`;
```

- [ ] **Step 17: Edit `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`**

The battle's support-button check reads the reticle's name.

In `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`, find these lines. Together they occur exactly once:

```js
      return ranged.shown && !ranged.disabled && ranged.text === 'Ranged'
        ? null
        : `Ranged reads "${ranged.text}"${ranged.shown ? '' : ' and is hidden'}${ranged.disabled ? ' and is disabled' : ''}, expected it enabled`;
```

Replace them with:

```js
      if (!ranged.shown || ranged.disabled) return `the reticle is ${ranged.shown ? 'greyed out' : 'hidden'}, expected it enabled`;
      return ranged.label === SELECTION_BAR.rangedName ? null : `the reticle is named "${ranged.label}", expected "${SELECTION_BAR.rangedName}"`;
```

- [ ] **Step 18: Edit `scripts/ui-smoke/ui-smoke.cjs`**

The run collapses the console from its selected tab, aims a ranged attack with the reticle and stops it, and stops the air strike with the reticle.

1. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
  await page.click('#console-collapse-btn');
```

Replace it with:

```js
  // Orders is the selected tab, so a click on it collapses the console to its rail; the console has no collapse button.
  await page.click('#console-tab-orders');
```

2. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
  await recordScene(page, report, outDir, SCENES.ordersQueued);

  await page.click('#selection-panel-close');
```

Replace them with:

```js
  await recordScene(page, report, outDir, SCENES.ordersQueued);

  // Aim a ranged attack with the armor unit from the reticle, record it, then click the reticle again to stop aiming.
  await page.click('#ranged-attack-btn');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.rangedAiming);
  await page.click('#ranged-attack-btn');

  await page.click('#selection-panel-close');
```

3. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
  // Aim an air strike from the selection panel, record it, then stop aiming.
```

Replace it with:

```js
  // Aim an air strike from the reticle and record it, then click the reticle again to stop aiming and record that.
```

4. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
  await page.click('#air-strike-cancel-btn');
```

Replace it with:

```js
  await page.click('#ranged-attack-btn');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.strikeStopped);
```

- [ ] **Step 19: Edit `doc/ux/console.md`**

The header has no collapse button; the tabs' tips say how to hide the console.

1. In `doc/ux/console.md`, find these lines. Together they occur exactly once:

````markdown
- A header with the selected tab's name, a subtitle, and a button that collapses the console. On the Orders tab the subtitle reads "N queued for turn T", or "N queued for beat B" in a battle, where N counts every row of the three order groups (`formatQueuedOrdersSubtitle` in `src/shared/orderRowDetail.ts`). On the Reports tab it reads "this match". On the Opponent tab it names the opponent's home region, as the top bar does.
- A count on the Orders tab in the rail: the number of queued orders, the same N. It is hidden while nothing is queued.
- A count on the Reports tab in the rail: the number of unread reports. It is hidden at zero. See [reports-tab.md](reports-tab.md).
- The Orders tab: the order groups. See [orders-tab.md](orders-tab.md). The selected units, and the Ranged and Strike controls, are in the [selection panel](selection-panel.md) on the map.
````

Replace them with:

````markdown
- A header with the selected tab's name and a subtitle. It has no collapse button: the selected tab collapses the console. On the Orders tab the subtitle reads "N queued for turn T", or "N queued for beat B" in a battle, where N counts every row of the three order groups (`formatQueuedOrdersSubtitle` in `src/shared/orderRowDetail.ts`). On the Reports tab it reads "this match". On the Opponent tab it names the opponent's home region, as the top bar does.
- A count on the Orders tab in the rail: the number of queued orders, the same N. It is hidden while nothing is queued.
- A count on the Reports tab in the rail: the number of unread reports. It is hidden at zero. See [reports-tab.md](reports-tab.md).
- The Orders tab: the order groups. See [orders-tab.md](orders-tab.md). The selected units, and the reticle that aims a ranged attack or an air strike, are in the [selection panel](selection-panel.md) on the map.
````

2. In `doc/ux/console.md`, find this line. It occurs exactly once:

````markdown
- Control tips for the tabs and the collapse button are in [control-tooltips.md](control-tooltips.md).
````

Replace it with:

````markdown
- Control tips for the tabs are in [control-tooltips.md](control-tooltips.md). Each enabled tab's tip ends by saying that a click on the selected tab hides the console.
````

3. In `doc/ux/console.md`, delete this line, including the line break at the end. It occurs exactly once:

````markdown
- When the player clicks the collapse button, the console collapses to its rail.
````

4. In `doc/ux/console.md`, find this line. It occurs exactly once:

````markdown
- `static/index.html` (`#sidebar`, `#console-main`, `#console-title`, `#console-subtitle`, `#console-tab-orders-badge`, `#console-collapse-btn`, `#console-panel-orders`, `#console-panel-reports`, `#console-panel-opponent`, `#console-rail`, `#console-tab-orders`, `#console-tab-reports`, `#console-tab-reports-badge`, `#console-tab-opponent`, `#console-tab-build`, `#console-tab-forces`, `#console-footer`, `#opponent-status-line`, `#opponent-status-label`, `#opponent-status-model`, `#opponent-status-cost`)
````

Replace it with:

````markdown
- `static/index.html` (`#sidebar`, `#console-main`, `#console-title`, `#console-subtitle`, `#console-tab-orders-badge`, `#console-panel-orders`, `#console-panel-reports`, `#console-panel-opponent`, `#console-rail`, `#console-tab-orders`, `#console-tab-reports`, `#console-tab-reports-badge`, `#console-tab-opponent`, `#console-tab-build`, `#console-tab-forces`, `#console-footer`, `#opponent-status-line`, `#opponent-status-label`, `#opponent-status-model`, `#opponent-status-cost`)
````

- [ ] **Step 20: Edit `doc/ux/console-command-bar.md`**

Ranged and Strike become the reticle, pressed while aiming. The Cancel button goes.

1. In `doc/ux/console-command-bar.md`, find this line. It occurs exactly once:

````markdown
Ready, in the console's footer, and the Ranged and air-strike controls in the [selection panel](selection-panel.md). The game-state readout is the date block in the [top bar](top-bar.md), or the battle header's status line in a battle.
````

Replace it with:

````markdown
Ready, in the console's footer, and the reticle and the air-strike target list in the [selection panel](selection-panel.md). The game-state readout is the date block in the [top bar](top-bar.md), or the battle header's status line in a battle.
````

2. In `doc/ux/console-command-bar.md`, find this text. It occurs exactly once:

````markdown
Ranged and the air-strike controls show in the selection panel, which shows while units are selected.
````

Replace it with:

````markdown
The reticle and the air-strike target list show in the selection panel, which shows while units are selected.
````

3. In `doc/ux/console-command-bar.md`, find these lines. Together they occur exactly once:

````markdown
- The Ranged control, in the selection panel's summary bar, shown whenever the selection panel is. Its label is "Ranged", "Cancel", or "Strike". The air-strike target list and its Cancel button use that same height.
- While the selection cannot use it, the control is greyed out. Its label is "Strike" when the selection has an air unit and "Ranged" otherwise. Its reason is its tip, and also shows in the selection panel's details under the unit rows: "Infantry can't fire on the world map." when a world-map selection includes infantry and no air unit, or "Strike needs a selection of air units only." when air units are selected with other types (`selectionSupportAction` in `src/shared/selectionSupportButtonMode.ts`).
- While Strike targeting is on, a target-type choice: Enemy Units, Production, Airports, or Seaports, and a Cancel button for that targeting.
- Control tips for Ready, Ranged, Strike, the target-type list, and Cancel are in [control-tooltips.md](control-tooltips.md).
````

Replace them with:

````markdown
- The reticle, in the selection panel's summary bar, shown whenever the selection panel is: one square button with a target reticle icon and no text, for both kinds of attack. It aims a ranged attack when every selected unit can fire, and an air strike when every selected unit is air; it never offers both. Its accessible name is "Ranged attack" or "Air strike" (`selectionSupportAction` in `src/shared/selectionSupportButtonMode.ts`, and `updateRangedSidebar`). The air-strike target list uses the same height.
- While an attack is aimed, the reticle reads as pressed (`aria-pressed`), its face in that order's color: the ranged amber or the strike purple, the same color as the selection panel's border.
- While the selection cannot use it, the reticle is greyed out. Its name is "Air strike" when the selection has an air unit and "Ranged attack" otherwise. Its reason is its tip, and also shows in the selection panel's details under the unit rows: "Infantry can't fire on the world map." when a world-map selection includes infantry and no air unit, or "Strike needs a selection of air units only." when air units are selected with other types (`selectionSupportAction` in `src/shared/selectionSupportButtonMode.ts`).
- While Strike targeting is on, a target-type choice beside the pressed reticle: Enemy Units, Production, Airports, or Seaports.
- Control tips for Ready, the reticle, and the target-type list are in [control-tooltips.md](control-tooltips.md).
````

4. In `doc/ux/console-command-bar.md`, find these lines. Together they occur exactly once:

````markdown
- When the player clicks Ranged, ranged targeting turns on and the label becomes Cancel. Clicking Cancel turns it off.
- When the player clicks Strike, strike targeting turns on, the Strike label hides, and the target-type choice and its Cancel button show. That Cancel turns strike targeting off and shows Strike again.
````

Replace them with:

````markdown
- When the player clicks the reticle for a selection that can fire, ranged targeting turns on and the reticle reads as pressed. Clicking the pressed reticle turns it off.
- When the player clicks the reticle for an all-air selection, strike targeting turns on, the reticle reads as pressed, and the target-type choice shows beside it. Clicking the pressed reticle turns strike targeting off and hides the choice.
````

5. In `doc/ux/console-command-bar.md`, find these lines. Together they occur exactly once:

````markdown
- Ranged or Strike greys out when the selection mixes air with other types, or includes a unit that cannot make a direct ranged attack in the current theater. It is not on screen while nothing is selected, because the selection panel is hidden. See [selection-model.md](selection-model.md).
- A failed target double-click shows an error toast and keeps targeting on. The label stays Cancel for Ranged, and the target-type choice and its Cancel stay shown for Strike. See [order-lifecycle.md](order-lifecycle.md).
````

Replace them with:

````markdown
- The reticle greys out when the selection mixes air with other types, or includes a unit that cannot make a direct ranged attack in the current theater. It is not on screen while nothing is selected, because the selection panel is hidden. See [selection-model.md](selection-model.md).
- A failed target double-click shows an error toast and keeps targeting on. The reticle stays pressed, and for a strike the target-type choice stays shown. See [order-lifecycle.md](order-lifecycle.md).
````

6. In `doc/ux/console-command-bar.md`, find these lines. Together they occur exactly once:

````markdown
- Ranged or Strike greyed out: the selection mixes air with other types, or includes a unit that cannot make a direct ranged attack in the current theater. When one of the two sentences applies, it is the control's tip and shows in the selection panel's details.
- Ranged showing "Ranged" or "Cancel": every selected unit can make a direct ranged attack.
- Strike showing: every selected unit is air. Strike targeting replaces that label with the target-type choice and Cancel.
````

Replace them with:

````markdown
- Reticle greyed out: the selection mixes air with other types, or includes a unit that cannot make a direct ranged attack in the current theater. When one of the two sentences applies, it is the control's tip and shows in the selection panel's details.
- Reticle for a ranged attack: every selected unit can make a direct ranged attack. Pressed while ranged targeting is on.
- Reticle for an air strike: every selected unit is air. Pressed while strike targeting is on, with the target-type choice beside it.
````

7. In `doc/ux/console-command-bar.md`, find these lines. Together they occur exactly once:

````markdown
- A world-map selection with infantry never enables Ranged. Tactical infantry can fire.
- A greyed-out control never starts targeting.
````

Replace them with:

````markdown
- A world-map selection with infantry never enables the reticle. Tactical infantry can fire.
- A greyed-out reticle never starts targeting.
- The reticle is pressed exactly while ranged or strike targeting is on.
````

8. In `doc/ux/console-command-bar.md`, find this line. It occurs exactly once:

````markdown
| Ranged | Types that can fire on the strategic map | Types that can fire in a battle, including infantry |
````

Replace it with:

````markdown
| Reticle for a ranged attack | Types that can fire on the strategic map | Types that can fire in a battle, including infantry |
````

9. In `doc/ux/console-command-bar.md`, find this line. It occurs exactly once:

````markdown
- `static/index.html` (`#console-footer`, `#ready-btn`, `#ranged-attack-tip-host`, `#ranged-attack-btn`, `#air-strike-target-type`, `#air-strike-cancel-btn`, `#selection-panel-action-note`)
````

Replace it with:

````markdown
- `static/index.html` (`#console-footer`, `#ready-btn`, `#ranged-attack-tip-host`, `#ranged-attack-btn`, `#air-strike-target-type`, `#selection-panel-action-note`)
````

- [ ] **Step 21: Edit `doc/ux/selection-panel.md`**

The close control is the bar's right end cap, the grip sits over its corner, and the pressed reticle takes the border's color.

1. In `doc/ux/selection-panel.md`, find this line. It occurs exactly once:

````markdown
Show what the player has selected, where it stands, and what it has been told to do, next to the map the player is working on, and hold the Ranged and Strike controls for that selection.
````

Replace it with:

````markdown
Show what the player has selected, where it stands, and what it has been told to do, next to the map the player is working on, and hold the reticle that aims that selection's ranged attack or air strike.
````

2. In `doc/ux/selection-panel.md`, find these lines. Together they occur exactly once:

````markdown
  - A divider, then the Ranged and Strike controls. See [console-command-bar.md](console-command-bar.md).
  - A close control (×).
````

Replace them with:

````markdown
  - A divider, then the reticle, and the air-strike target list beside it while a strike is aimed. See [console-command-bar.md](console-command-bar.md).
  - The close control, an ×, the bar's full height and 32 px wide, with a divider on its left: the expand control's mirror on the right edge.
````

3. In `doc/ux/selection-panel.md`, find these lines. Together they occur exactly once:

````markdown
  - The reason a greyed-out Ranged or Strike cannot be used, when one applies.
  - The sidebar error line, which stays hidden. See [notifications-and-feedback.md](notifications-and-feedback.md).
- While Ranged targeting is on, the panel's border is the ranged amber, and while Strike targeting is on, the strike purple (`--order-ranged` and `--order-strike` in `static/shellChrome.css`).
- A resize grip at the top-right corner, clear of the close control, shown only while the panel is expanded.
- The panel opens 440 px wide, 12 px in from the map's left and bottom edges, and is never wider than the map minus 24 px; both states share that width. Compact, it is the bar's height. Expanded, its height fits the bar and the details, up to half the map's height; past that the unit rows scroll. When the panel is shorter than the bar, the caption, the chips, and one row, the details scroll as a whole. Where it overlaps the terrain legend, the map scale, or the minimap panel, it draws above them.
- Control tips for the expand control, the close control, the grip, and a greyed-out Ranged or Strike are in [control-tooltips.md](control-tooltips.md).
````

Replace them with:

````markdown
  - The reason a greyed-out reticle cannot be used, when one applies.
  - The sidebar error line, which stays hidden. See [notifications-and-feedback.md](notifications-and-feedback.md).
- While Ranged targeting is on, the panel's border is the ranged amber, and while Strike targeting is on, the strike purple (`--order-ranged` and `--order-strike` in `static/shellChrome.css`). The pressed reticle's face takes the same color.
- A resize grip at the top-right corner, shown only while the panel is expanded. It sits over the close control's top-right corner, clear of the ×, so a press there resizes the panel and does not clear the selection.
- The panel opens 440 px wide, 12 px in from the map's left and bottom edges, and is never wider than the map minus 24 px; both states share that width. Compact, it is the bar's height. Expanded, its height fits the bar and the details, up to half the map's height; past that the unit rows scroll. When the panel is shorter than the bar, the caption, the chips, and one row, the details scroll as a whole. Where it overlaps the terrain legend, the map scale, or the minimap panel, it draws above them.
- Control tips for the expand control, the close control, the grip, and the reticle are in [control-tooltips.md](control-tooltips.md).
````

4. In `doc/ux/selection-panel.md`, find this line. It occurs exactly once:

````markdown
- `static/index.html` (`#selection-panel`, `#selection-panel-grip`, `#selection-panel-bar`, `#selection-panel-expand`, `#sidebar-selected-unit`, `#selection-panel-hint`, `#ranged-attack-tip-host`, `#selection-panel-close`, `#selection-panel-details`, `#selection-panel-caption`, `#selection-panel-chips`, `#selection-panel-units`, `#selection-panel-action-note`, `#sidebar-error`)
````

Replace it with:

````markdown
- `static/index.html` (`#selection-panel`, `#selection-panel-grip`, `#selection-panel-bar`, `#selection-panel-expand`, `#sidebar-selected-unit`, `#selection-panel-hint`, `#ranged-attack-tip-host`, `#ranged-attack-btn`, `#selection-panel-close`, `#selection-panel-details`, `#selection-panel-caption`, `#selection-panel-chips`, `#selection-panel-units`, `#selection-panel-action-note`, `#sidebar-error`)
````

- [ ] **Step 22: Edit `doc/ux/selection-model.md`**

Targeting starts and stops with the reticle.

1. In `doc/ux/selection-model.md`, find these lines. Together they occur exactly once:

````markdown
- The support control is greyed out, with its reason, when the selection mixes air with other types, or when any selected unit cannot make a direct ranged attack in the current theater. It is not on screen while the selection is empty, because the selection panel is hidden. See [console-command-bar.md](console-command-bar.md).
- When every selected unit is air, the control offers Strike.
- When every selected unit can make a direct ranged attack and none is air, the control offers Ranged. While that targeting mode is on, the label is Cancel.
- Choosing Ranged or Strike does not change which units are selected. A successful target double-click then clears the selection. A single click while targeting is on does not.
- Leaving the mode by Cancel turns the targeting mode off and keeps the selection. A failed target double-click keeps both the selection and the targeting mode. See [order-lifecycle.md](order-lifecycle.md).
- An empty selection hides the control and turns both targeting modes off.
- Strategic and tactical theaters use the same control. Which unit types count as ranged-capable follows the [combat rules](../combat-rules-v3.md) for the active theater. A world-map selection that includes infantry and no air unit leaves Ranged greyed out, with its reason. Tactical infantry can fire.
````

Replace them with:

````markdown
- The selection panel's reticle is greyed out, with its reason, when the selection mixes air with other types, or when any selected unit cannot make a direct ranged attack in the current theater. It is not on screen while the selection is empty, because the selection panel is hidden. See [console-command-bar.md](console-command-bar.md).
- When every selected unit is air, the reticle aims an air strike (Strike targeting).
- When every selected unit can make a direct ranged attack and none is air, the reticle aims a ranged attack (Ranged targeting). While either targeting mode is on, the reticle reads as pressed.
- Turning Ranged or Strike targeting on does not change which units are selected. A successful target double-click then clears the selection. A single click while targeting is on does not.
- Leaving the mode by clicking the pressed reticle turns the targeting mode off and keeps the selection. A failed target double-click keeps both the selection and the targeting mode. See [order-lifecycle.md](order-lifecycle.md).
- An empty selection hides the reticle and turns both targeting modes off.
- Strategic and tactical theaters use the same reticle. Which unit types count as ranged-capable follows the [combat rules](../combat-rules-v3.md) for the active theater. A world-map selection that includes infantry and no air unit leaves the reticle greyed out, with its reason. Tactical infantry can fire.
````

2. In `doc/ux/selection-model.md`, find this line. It occurs exactly once:

````markdown
- Air mixed with any other type shows Strike greyed out, with its reason, and never starts targeting.
````

Replace it with:

````markdown
- Air mixed with any other type shows the reticle greyed out, with its reason, and never starts targeting.
````

- [ ] **Step 23: Edit `doc/ux/order-lifecycle.md`**

Clicking the pressed reticle, not Cancel, turns targeting off.

1. In `doc/ux/order-lifecycle.md`, find this text. It occurs exactly once:

````markdown
Cancel turns targeting off.
````

Replace it with:

````markdown
Clicking the pressed reticle turns targeting off.
````

2. In `doc/ux/order-lifecycle.md`, find this text. It occurs exactly once:

````markdown
Targeting turns off only on Cancel, a successful target double-click, right-click, the selection panel's close control, a selection that can no longer fire, or entering a battle.
````

Replace it with:

````markdown
Targeting turns off only on a click on the pressed reticle, a successful target double-click, right-click, the selection panel's close control, a selection that can no longer fire, or entering a battle.
````

- [ ] **Step 24: Edit `doc/ux/control-tooltips.md`**

The reticle's tips, the tabs' new sentence, and no collapse-button tip.

1. In `doc/ux/control-tooltips.md`, find these lines. Together they occur exactly once:

````markdown
- Ranged: Turn this on, then double-click the target on the map. The button then reads Cancel.
- Ranged Cancel: Stop aiming a ranged attack. Attacks already in the list stay there.
- Strike: Turn this on to aim an air strike. A target list and a Cancel button replace this button.
- Air-strike target: Choose enemy units, production, airports, or seaports. Your next double-click uses that choice until you cancel.
- Air-strike Cancel: Stop aiming an air strike and show Strike again. Strikes already in the list stay there.
- Ranged or Strike while it is greyed out: its reason, "Infantry can't fire on the world map." or "Strike needs a selection of air units only." (`selectionSupportAction` in `src/shared/selectionSupportButtonMode.ts`). The tip sits on a host around the control (`#ranged-attack-tip-host`), because a disabled control gets no pointer events.
- Orders tab: Show the orders queued for this turn or beat.
- Reports tab: Show the turn reports, opponent messages, and notices from this match, newest first.
- Opponent tab: Show whether the opponent is planning, its model, its tools, and the AI activity log.
- Settings, Help, Load game, How to play, Add another opponent, Build, Forces, Replay, and the Control and Production map modes: "<name> is not available in this version.", for example "Settings is not available in this version."
- Collapse the console: Hide the console to widen the map. Click a tab to show it again.
````

Replace them with:

````markdown
- Reticle, for a selection that can fire: Aim a ranged attack. Turn this on, then double-click the target on the map.
- Reticle, while a ranged attack is aimed: Stop aiming a ranged attack. Attacks already in the list stay there.
- Reticle, for an all-air selection: Aim an air strike. Turn this on, pick a target type in the list beside it, then double-click the target on the map.
- Reticle, while an air strike is aimed: Stop aiming an air strike. Strikes already in the list stay there.
- Air-strike target: Choose enemy units, production, airports, or seaports. Your next double-click uses that choice until you stop aiming.
- The reticle while it is greyed out: its reason, "Infantry can't fire on the world map." or "Strike needs a selection of air units only." (`selectionSupportAction` in `src/shared/selectionSupportButtonMode.ts`). The tip sits on a host around the control (`#ranged-attack-tip-host`), because a disabled control gets no pointer events.
- Orders tab: Show the orders queued for this turn or beat. Click the selected tab to hide the console and widen the map.
- Reports tab: Show the turn reports, opponent messages, and notices from this match, newest first. Click the selected tab to hide the console and widen the map.
- Opponent tab: Show whether the opponent is planning, its model, its tools, and the AI activity log. Click the selected tab to hide the console and widen the map.
- Settings, Help, Load game, How to play, Add another opponent, Build, Forces, Replay, and the Control and Production map modes: "<name> is not available in this version.", for example "Settings is not available in this version."
````

2. In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- Ranged or Strike while it is greyed out and neither reason applies.
````

Replace it with:

````markdown
- The reticle while it is greyed out and neither reason applies.
````

- [ ] **Step 25: Edit `doc/ux-specification.md`**

The selection panel holds the reticle.

In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
- [selection-panel.md](ux/selection-panel.md): the panel at the map's bottom-left that describes the selected units, their hex, and their orders, and holds Ranged and Strike.
````

Replace it with:

````markdown
- [selection-panel.md](ux/selection-panel.md): the panel at the map's bottom-left that describes the selected units, their hex, and their orders, and holds the reticle that aims a ranged attack or an air strike.
````

- [ ] **Step 26: Edit `doc/ui-style-guide.md`**

The selection panel's end caps and the pressed reticle's colors.

1. In `doc/ui-style-guide.md`, find these lines. Together they occur exactly once:

````markdown
| Selection / slower / warning | `#a06020` | Range perimeter (ranged), and the selection panel's border while Ranged is aimed (`--order-ranged`) |
| Air-strike perimeter | `#7a3db5` | Distinct from ground ranged. Also the selection panel's border while Strike is aimed (`--order-strike`) |
````

Replace them with:

````markdown
| Selection / slower / warning | `#a06020` | Range perimeter (ranged), and the selection panel's border and the pressed reticle's face while Ranged is aimed (`--order-ranged`) |
| Air-strike perimeter | `#7a3db5` | Distinct from ground ranged. Also the selection panel's border and the pressed reticle's face while Strike is aimed (`--order-strike`) |
````

2. In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
- **Live app:** The selection panel at the map's bottom-left, 440 px wide by default. It opens compact: a 50 px summary bar with an expand control, the hex code and count, a hint for the next map gesture, Ranged or Strike, and the close control. A click on the expand control slides the bar up, and the hex's caption and chips and one row per unit open under it; the state lasts for the session. While an attack is aimed, the panel's border takes that order's color. See [ux/selection-panel.md](ux/selection-panel.md).
````

Replace it with:

````markdown
- **Live app:** The selection panel at the map's bottom-left, 440 px wide by default. It opens compact: a 50 px summary bar with an expand control, the hex code and count, a hint for the next map gesture, a reticle button that aims a ranged attack or an air strike, and the close control. The expand and close controls take the bar's full height at its two ends, 32 px wide, each with a divider on its inner side. A click on the expand control slides the bar up, and the hex's caption and chips and one row per unit open under it; the state lasts for the session. While an attack is aimed, the panel's border and the pressed reticle's face take that order's color. See [ux/selection-panel.md](ux/selection-panel.md).
````

- [ ] **Step 27: Edit `doc/how-to-play.md`**

Aiming and stopping use the reticle.

1. In `doc/how-to-play.md`, find this line. It occurs exactly once:

````markdown
5. **Ranged attack (armor or naval on strategic; broader types on tactical):** With capable units selected, click **Ranged** in the selection panel, then double-click an enemy hex within range. An all-air selection shows **Strike** instead. When the selection cannot fire, the button is greyed out, and pointing at it says why. Attacks are submitted with Ready. See [Aiming ranged attacks and air strikes](#aiming-ranged-attacks-and-air-strikes).
````

Replace it with:

````markdown
5. **Ranged attack (armor or naval on strategic; broader types on tactical):** With capable units selected, click the reticle in the selection panel, then double-click an enemy hex within range. With an all-air selection, the same reticle aims an air strike. When the selection cannot fire, the reticle is greyed out, and pointing at it says why. Attacks are submitted with Ready. See [Aiming ranged attacks and air strikes](#aiming-ranged-attacks-and-air-strikes).
````

2. In `doc/how-to-play.md`, find these lines. Together they occur exactly once:

````markdown
- **Ranged:** select units that can all fire, then click **Ranged**. The button reads **Cancel** while you aim.
- **Strike:** select only air units, then click **Strike**. Pick a target type from the list that takes the button's place.
- **Greyed button:** mixing air with other types greys out Strike. On the strategic map, infantry with no air unit greys out Ranged. Point at the greyed button to see why. Infantry can fire in a battle.
````

Replace them with:

````markdown
- **Ranged:** select units that can all fire, then click the reticle in the selection panel. It stays pressed, in amber, while you aim.
- **Strike:** select only air units, then click the reticle. It stays pressed, in purple, and a list beside it picks the target type.
- **Greyed reticle:** mixing air with other types, or infantry with no air unit on the strategic map, greys out the reticle. Point at it to see why. Infantry can fire in a battle.
````

3. In `doc/how-to-play.md`, find this line. It occurs exactly once:

````markdown
- **Stopping:** click **Cancel**, click the selection panel's **×**, or right-click the map. Escape doesn't end aiming.
````

Replace it with:

````markdown
- **Stopping:** click the pressed reticle again, click the selection panel's **×**, or right-click the map. Escape doesn't end aiming.
````

## Verify

- [ ] **Step 28: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 29: Full tests**

Run the full tests. Expected: exit 0, test total **896**, failure total **0**.

- [ ] **Step 30: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/shared/selectionSupportButtonMode.ts src/shared/selectionSupportButtonMode.test.ts src/renderer/chrome/controlTooltipText.ts src/renderer/chrome/frameTooltipText.ts src/renderer/gameplay/tacticalOrders.ts src/renderer/map/initCore.ts src/renderer/chrome/consoleFrame.ts src/renderer/renderer.ts src/main/rendererConsolidation.test.ts static/index.html static/frameChrome.css static/selectionChrome.css scripts/ui-smoke/ui-smoke-scenes.cjs scripts/ui-smoke/ui-smoke-checks.cjs scripts/ui-smoke/ui-smoke-console-checks.cjs scripts/ui-smoke/ui-smoke-scenario-checks.cjs scripts/ui-smoke/ui-smoke.cjs doc/ux/console.md doc/ux/console-command-bar.md doc/ux/selection-panel.md doc/ux/selection-model.md doc/ux/order-lifecycle.md doc/ux/control-tooltips.md doc/ux-specification.md doc/ui-style-guide.md doc/how-to-play.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/shared/selectionSupportButtonMode.ts` | `3879f33c0b45a37e` |
| `src/shared/selectionSupportButtonMode.test.ts` | `606eb7b6f6086143` |
| `src/renderer/chrome/controlTooltipText.ts` | `d762cf56d91b015d` |
| `src/renderer/chrome/frameTooltipText.ts` | `2f167e4f70875160` |
| `src/renderer/gameplay/tacticalOrders.ts` | `5f7934eaef7b597b` |
| `src/renderer/map/initCore.ts` | `9177f57ca1961ed8` |
| `src/renderer/chrome/consoleFrame.ts` | `ccf1970b03487870` |
| `src/renderer/renderer.ts` | `573086a9afd75193` |
| `src/main/rendererConsolidation.test.ts` | `823228fd52e6f90c` |
| `static/index.html` | `e262cbef3c779542` |
| `static/frameChrome.css` | `a75d7cf98c79c6c9` |
| `static/selectionChrome.css` | `233ebc27b4a692d5` |
| `scripts/ui-smoke/ui-smoke-scenes.cjs` | `805a6cbc08da8a5c` |
| `scripts/ui-smoke/ui-smoke-checks.cjs` | `759d955e0bd9ff2d` |
| `scripts/ui-smoke/ui-smoke-console-checks.cjs` | `c3d189a07b7bc69e` |
| `scripts/ui-smoke/ui-smoke-scenario-checks.cjs` | `bffec2ac7a6008e5` |
| `scripts/ui-smoke/ui-smoke.cjs` | `80e91ec914b9c1b8` |
| `doc/ux/console.md` | `a3538e1a61e47f40` |
| `doc/ux/console-command-bar.md` | `6777507aabd4144e` |
| `doc/ux/selection-panel.md` | `57afdb82257f5122` |
| `doc/ux/selection-model.md` | `55c91d6753a91dd7` |
| `doc/ux/order-lifecycle.md` | `b6d04844ae28af77` |
| `doc/ux/control-tooltips.md` | `070d121e44124a3f` |
| `doc/ux-specification.md` | `9b614acdb1ecb618` |
| `doc/ui-style-guide.md` | `42cf87cbf9124d83` |
| `doc/how-to-play.md` | `e8b5990f7a930a96` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

- [ ] **Step 31: Smoke run**

```powershell
npm run ui:smoke -- --label console-and-selection-bar
```

Expected summary line:

```text
ui-smoke console-and-selection-bar: 551 passed, 0 failed, 0 page errors, 42 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\console-and-selection-bar
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/console-and-selection-bar/report.json`.

- [ ] **Step 32: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/console-and-selection-bar/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast. The small origin flags beside unit names can also differ from run to run.

- `04-strategic-1280x720.png` against [ui-facelift-toggles-1-expected-strategic.png](ui-facelift-toggles-1-expected-strategic.png): a strategic turn. The console header reads "Orders" and "0 queued for turn 1", with no button at its right end.
- `17-ranged-aiming.png` against [ui-facelift-toggles-1-expected-ranged.png](ui-facelift-toggles-1-expected-ranged.png): the selection bar at the bottom left while a ranged attack is aimed: the hint "Double-click a target in range", the reticle pressed with an amber face, an amber panel border, and the × as a full-height end cap with a divider on its left.
- `20-strike-aiming.png` against [ui-facelift-toggles-1-expected-strike.png](ui-facelift-toggles-1-expected-strike.png): the same bar while an air strike is aimed: the reticle pressed with a purple face, the target list "Enemy Units" beside it, no Cancel button, and a purple border.
- `22-selection-expanded.png` against [ui-facelift-toggles-1-expected-expanded.png](ui-facelift-toggles-1-expected-expanded.png): the panel expanded on a two-unit stack: the reticle greyed out, the reason "Infantry can't fire on the world map." at the bottom, and the resize grip's lines over the ×'s top-right corner.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 29.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 32.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. With `npm start`, start or reopen a match. The console header shows the title and the subtitle, with nothing at its right end. Click the selected Orders tab: the console folds to its rail. Click any tab: it opens on that tab. Rest the pointer on a tab: its tip ends "Click the selected tab to hide the console and widen the map."
2. Select an armor or naval unit. Rest the pointer on the reticle: "Aim a ranged attack. …". Click it: its face turns amber and the panel's border too. Double-click an enemy hex in range: the attack is queued, and aiming stops. Aim again, then click the pressed reticle: aiming stops and the border returns.
3. Select an air unit and click the reticle: its face turns purple, and the target list shows beside it. Change the target type, then click the reticle again: the list hides.
4. Select infantry on the world map: the reticle is greyed out, and its tip gives the reason.
5. Click the × at the bar's right end: the selection clears, and queued orders stay. Expand the panel and drag the grip on the ×'s corner: the panel resizes and the selection stays.
6. With the keyboard, Tab to the reticle and press Space twice: aiming starts, then stops.

## Next

Plan 2 moves the minimap's tabs under the overview, behind a corner toggle.
