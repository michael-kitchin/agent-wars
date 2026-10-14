# UI Facelift Console, Plan 5 of 5: Opponent Tab Sections and Status Line

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Rebuild the Opponent tab into four sections shown together: Status (Run and one sentence), Commander (the API key with the match cost, the model with refresh, and the reasoning effort), Tool groups (two columns), and the Activity log, which fills the rest. Remove the Tools/Model sub-tabs. Add a read-only status line above Ready: a dot, "Opponent planning off", "on", or "…", the model's name, and the match cost.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 5 of the five that build the spec's Phase 3; [ui-facelift-console-execution-plan.md](ui-facelift-console-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- `src/shared/opponentPlanningStatus.ts`: the three states, the sentence, the line's labels, and the model name taken from its option label. Unit-tested.
- `renderOpponentStatus` in `src/renderer/openRouter/openRouterUiHelpers.ts`. Ready's state refresh and the cost refresh call it, and so do the model list load and a model change. "Opponent planning…" shows exactly while Ready shows "AI:" and a time.
- The markup keeps every control id. The sub-tab buttons and their tips go, and turning Run on no longer switches tabs. The Opponent tab's subtitle names the opponent's home region.
- The status line hides while the console is collapsed.
- Comments that still name the Model tab or the Tools tab are updated.
- The smoke harness checks the sections, the two columns, and the status line. The status line is also checked in the reopened match, the battle, and the regional match.

**Out of scope:**

- The README's OpenRouter setup steps, which still name the Model tab. The spec's Phase 7 updates them.
- The "woken by" detail and the token counts, which the spec defers.

**How this plan was checked:** every step below was applied to a copy of the repository in the state the previous plan leaves. On the result, the fast loop and the full tests passed, and the smoke run passed against the real app in Electron. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

## Ground Rules

- Follow `AGENTS.md` and every rule in `.cursor/rules/`. These matter most here:
  - **Never commit or push** (rule 11). The reviewer commits after reading your report.
  - **No plan or phase identifiers** (rule 12) in code, comments, tests, `doc/`, or configuration: no plan numbers, no "Phase 3", and no "facelift" outside `.spec/`. Every block in this plan already follows this.
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

- `check:renderer-types` prints `check-renderer-typecheck: ok`.
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

1. [ui-facelift-spec.md](ui-facelift-spec.md): Opponent tab and Footer status line.
2. `doc/ux/right-panel-model-tab.md`, `doc/ux/right-panel-tools-tab.md`, and `doc/ux/ai-activity-log.md`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files. Then:

```powershell
Test-Path src/renderer/chrome/consoleReports.ts
Test-Path src/shared/opponentPlanningStatus.ts
```

Expected: `True`, then `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **866**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/shared/opponentPlanningStatus.ts`
- `src/shared/opponentPlanningStatus.test.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts`
- `src/renderer/openRouter/openRouterControls.ts`
- `src/renderer/chrome/consoleFrame.ts`
- `src/renderer/chrome/controlTooltipText.ts`
- `src/renderer/chrome/frameTooltipText.ts`
- `src/renderer/gameplay/tacticalBattlePromptPreference.ts`
- `src/renderer/openRouter/modelDescriptionTooltip.ts`
- `src/renderer/openRouter/reasoningEffortSelect.ts`
- `src/shared/openRouterModelDisplay.ts`
- `src/shared/openRouterReasoningEffort.ts`
- `src/shared/ipc/gameApiTypes.ts`
- `src/shared/ipc/openRouterTypes.ts`
- `src/main/openRouter/openRouter.ts`
- `src/main/openRouter/buildOpenRouterModelList.ts`
- `src/main/openRouter/buildOpenRouterModelList.test.ts`
- `src/main/ipc/openRouterIpcHandler.ts`
- `static/index.html`
- `static/shellChrome.css`
- `static/frameChrome.css`
- `static/consoleChrome.css`
- `scripts/ui-smoke/ui-smoke-console-checks.cjs`
- `doc/ux/right-panel-model-tab.md`
- `doc/ux/right-panel-tools-tab.md`
- `doc/ux/ai-activity-log.md`
- `doc/ux/right-panel.md`
- `doc/ux/control-tooltips.md`
- `doc/ux-specification.md`
- `doc/how-to-play.md`
- `doc/ai-tools.md`
- `doc/hybrid-ai.md`
- `doc/ai-commander-prompts/variants.md`
- `doc/ui-style-guide.md`

- [ ] **Step 1: Create `src/shared/opponentPlanningStatus.ts`**

What the console says about opponent planning: off, on, or planning; the Opponent tab's sentence; the footer line's label; and the model's name taken from its option label.

Create `src/shared/opponentPlanningStatus.ts` with exactly this content:

```ts
/**
 * Whether opponent planning is off, on and idle, or on and planning now. This module holds what the console says
 * about opponent planning, in the Opponent tab's status sentence and in the footer line; both read the same state.
 *
 * Purpose: Names the three states the footer dot and label show.
 * When to use: Returned by `opponentPlanningStatus`.
 * Expected outcome: `planning` only while Run is on.
 * Exceptions: None.
 */
export type OpponentPlanningStatus = 'off' | 'on' | 'planning';

/**
 * The footer line's label for each state.
 *
 * Purpose: One short phrase per state.
 * When to use: The footer status line.
 * Expected outcome: "Opponent planning off", "Opponent planning on", or "Opponent planning…".
 * Exceptions: None.
 */
export const OPPONENT_STATUS_LINE_LABELS: Readonly<Record<OpponentPlanningStatus, string>> = Object.freeze({
  off: 'Opponent planning off',
  on: 'Opponent planning on',
  planning: 'Opponent planning…',
});

/**
 * The model name the footer shows while no model is chosen.
 *
 * Purpose: The line never shows an empty gap.
 * When to use: When the model list has no selection.
 * Expected outcome: Shown as written.
 * Exceptions: None.
 */
export const NO_MODEL_LABEL = 'No model';

/**
 * Works out the planning state from Run and the wait that Ready already tracks.
 *
 * Purpose: The footer and the Opponent tab agree with Ready's "AI:" timer.
 * When to use: Pass whether Run is on, and whether the opponent's orders are still being planned.
 * Expected outcome: `off` while Run is off, `planning` while Run is on and the opponent is planning, `on` otherwise.
 * Exceptions: None.
 */
export function opponentPlanningStatus(runOn: boolean, planning: boolean): OpponentPlanningStatus {
  if (!runOn) return 'off';
  return planning ? 'planning' : 'on';
}

/**
 * Builds the Opponent tab's status sentence.
 *
 * Purpose: Says in one sentence whether opponent planning is on.
 * When to use: Next to Run on the Opponent tab.
 * Expected outcome: "Opponent planning is off." while off, "Opponent planning is on." otherwise.
 * Exceptions: None.
 */
export function opponentStatusSentence(status: OpponentPlanningStatus): string {
  return status === 'off' ? 'Opponent planning is off.' : 'Opponent planning is on.';
}

/**
 * Takes the model's name from its option label in the model list.
 *
 * Purpose: The footer shows the name without the price and reasoning suffix.
 * When to use: With the selected option's text; pass an empty string when no model is selected.
 * Expected outcome: The text before " [", trimmed, or `NO_MODEL_LABEL` when that is empty.
 * Exceptions: None.
 */
export function modelNameFromOptionLabel(optionLabel: string): string {
  const bracket = optionLabel.indexOf(' [');
  const name = (bracket >= 0 ? optionLabel.slice(0, bracket) : optionLabel).trim();
  return name || NO_MODEL_LABEL;
}
```

- [ ] **Step 2: Create `src/shared/opponentPlanningStatus.test.ts`**

Covers the three states, the wording, and the model name.

Create `src/shared/opponentPlanningStatus.test.ts` with exactly this content:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  modelNameFromOptionLabel,
  NO_MODEL_LABEL,
  OPPONENT_STATUS_LINE_LABELS,
  opponentPlanningStatus,
  opponentStatusSentence,
} from './opponentPlanningStatus';

test('opponentPlanningStatus is off while Run is off, and planning only while Run is on', () => {
  assert.equal(opponentPlanningStatus(false, true), 'off');
  assert.equal(opponentPlanningStatus(true, false), 'on');
  assert.equal(opponentPlanningStatus(true, true), 'planning');
});

test('the status label and sentence name each state', () => {
  assert.equal(OPPONENT_STATUS_LINE_LABELS.planning, 'Opponent planning…');
  assert.equal(opponentStatusSentence('off'), 'Opponent planning is off.');
  assert.equal(opponentStatusSentence('planning'), 'Opponent planning is on.');
});

test('modelNameFromOptionLabel drops the price and reasoning suffix', () => {
  assert.equal(modelNameFromOptionLabel('Google: Gemini 3.5 Flash [$0.70/M, reasoning: Min*/High]'), 'Google: Gemini 3.5 Flash');
  assert.equal(modelNameFromOptionLabel('vendor/model-id'), 'vendor/model-id');
  assert.equal(modelNameFromOptionLabel(''), NO_MODEL_LABEL);
});
```

- [ ] **Step 3: Edit `src/renderer/openRouter/openRouterUiHelpers.ts`**

Adds `renderOpponentStatus`, which writes the sentence and the footer line. Ready's state refresh and the cost refresh call it, so the line follows Run, the opponent's wait, and the match cost.

1. In `src/renderer/openRouter/openRouterUiHelpers.ts`, find this line. It occurs exactly once:

```ts
import { currentConsoleReportTag, recordConsoleReport } from '../chrome/consoleReports';
```

Replace it with:

```ts
import { currentConsoleReportTag, recordConsoleReport } from '../chrome/consoleReports';
import {
  modelNameFromOptionLabel,
  OPPONENT_STATUS_LINE_LABELS,
  opponentPlanningStatus,
  opponentStatusSentence,
} from '../../shared/opponentPlanningStatus';
```

2. In `src/renderer/openRouter/openRouterUiHelpers.ts`, find this line. It occurs exactly once:

```ts
 * label stays "Ready". Log lines, including error lines, never affect the timer.
```

Replace it with:

```ts
 * label stays "Ready". Log lines, including error lines, never affect the timer. The opponent status follows.
```

3. In `src/renderer/openRouter/openRouterUiHelpers.ts`, find these lines. Together they occur exactly once:

```ts
    setReadyButtonLabelReady(readyBtn);
  }
}
```

Replace them with:

```ts
    setReadyButtonLabelReady(readyBtn);
  }
  renderOpponentStatus();
}

/**
 * Writes the opponent's planning status: the Opponent tab's sentence and the footer line above Ready.
 *
 * Purpose: Shows whether opponent planning is on, which model plans, and what this match has cost, from any tab.
 * When to use: After Run, the opponent's wait, the selected model, or the match cost changes. `updateReadyButtonState`
 *   and `updateOpenRouterCostLabel` call it.
 * Expected outcome: `#opponent-status-text` reads "Opponent planning is on." or "... is off." The footer line's
 *   `data-status` is `off`, `on`, or `planning`, with the matching label, the selected model's name (or "No model"),
 *   and the match cost. The wait is the one Ready's "AI:" timer shows.
 * Exceptions: None; missing elements are skipped.
 */
export function renderOpponentStatus(): void {
  const status = opponentPlanningStatus(
    S.runButtonOn,
    isWaitingForPrecomputedAiOrders() || isDeferredResolutionConsultRunning()
  );
  const sentence = document.getElementById('opponent-status-text');
  if (sentence) sentence.textContent = opponentStatusSentence(status);
  document.getElementById('opponent-status-line')?.setAttribute('data-status', status);
  const label = document.getElementById('opponent-status-label');
  if (label) label.textContent = OPPONENT_STATUS_LINE_LABELS[status];
  const modelSelect = document.getElementById('openrouter-model') as HTMLSelectElement | null;
  const selectedOption = modelSelect && modelSelect.value ? modelSelect.selectedOptions[0] : undefined;
  const model = document.getElementById('opponent-status-model');
  if (model) model.textContent = modelNameFromOptionLabel(selectedOption?.textContent ?? '');
  const cost = document.getElementById('opponent-status-cost');
  if (cost) cost.textContent = formatOpenRouterCost(S.openRouterGameCost);
}
```

4. In `src/renderer/openRouter/openRouterUiHelpers.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: Supports maintainability by documenting why `updateOpenRouterCostLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
```

Replace them with:

```ts
 * Purpose: Supports maintainability by documenting why `updateOpenRouterCostLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 *   The footer status line shows the same cost.
 * Exceptions: None.
 */
```

5. In `src/renderer/openRouter/openRouterUiHelpers.ts`, find this line. It occurs exactly once:

```ts
  if (el) el.textContent = formatOpenRouterCost(S.openRouterGameCost);
```

Replace it with:

```ts
  if (el) el.textContent = formatOpenRouterCost(S.openRouterGameCost);
  renderOpponentStatus();
```

- [ ] **Step 4: Edit `src/renderer/openRouter/openRouterControls.ts`**

Removes the Tools/Model sub-tab switching, including Run's jump to Tools. The status follows the model list and the model choice.

1. In `src/renderer/openRouter/openRouterControls.ts`, delete this line, including the line break at the end. It occurs exactly once:

```ts
import { selectTabPanel } from '../chrome/selectTabPanel';
```

2. In `src/renderer/openRouter/openRouterControls.ts`, find this line. It occurs exactly once:

```ts
import { updateOpenRouterCostLabel } from './openRouterUiHelpers';
```

Replace it with:

```ts
import { renderOpponentStatus, updateOpenRouterCostLabel } from './openRouterUiHelpers';
```

3. In `src/renderer/openRouter/openRouterControls.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: One bootstrap for the Tools and Model tabs plus the pushes that release Ready after a deferred consult.
 * When to use: Once during renderer startup.
 * Expected outcome: Tabs, model list, and consultation listeners are registered.
```

Replace them with:

```ts
 * Purpose: One bootstrap for the Opponent tab's controls plus the pushes that release Ready after a deferred consult.
 * When to use: Once during renderer startup.
 * Expected outcome: The Opponent tab's controls, the model list, and the consultation listeners are registered.
```

4. In `src/renderer/openRouter/openRouterControls.ts`, find these lines. Together they occur exactly once:

```ts
  deps.updateOpenRouterCostLabel();

  const tabTools = document.getElementById('openrouter-tab-tools');
  const tabModel = document.getElementById('openrouter-tab-model');

  function setActiveTab(active: 'tools' | 'model'): void {
    selectTabPanel(active === 'model' ? 'openrouter-tab-model' : 'openrouter-tab-tools', [
      { tabId: 'openrouter-tab-tools', panelId: 'openrouter-tools-panel' },
      { tabId: 'openrouter-tab-model', panelId: 'openrouter-model-panel' },
    ]);
  }

  tabTools?.addEventListener('click', () => setActiveTab('tools'));
  tabModel?.addEventListener('click', () => setActiveTab('model'));
  setActiveTab('model');
```

Replace them with:

```ts
  deps.updateOpenRouterCostLabel();
```

5. In `src/renderer/openRouter/openRouterControls.ts`, find these lines. Together they occur exactly once:

```ts
      modelRefreshInFlight = false;
    });
```

Replace them with:

```ts
      modelRefreshInFlight = false;
      renderOpponentStatus();
    });
```

6. In `src/renderer/openRouter/openRouterControls.ts`, find this line. It occurs exactly once:

```ts
      modelSelect.value = modelId;
```

Replace it with:

```ts
      modelSelect.value = modelId;
      renderOpponentStatus();
```

7. In `src/renderer/openRouter/openRouterControls.ts`, find this line. It occurs exactly once:

```ts
    modelSelect.addEventListener('change', () => {
```

Replace it with:

```ts
    modelSelect.addEventListener('change', () => {
      renderOpponentStatus();
```

8. In `src/renderer/openRouter/openRouterControls.ts`, delete this line, including the line break at the end. It occurs exactly once:

```ts
        document.getElementById('openrouter-tab-tools')?.click();
```

- [ ] **Step 5: Edit `src/renderer/chrome/consoleFrame.ts`**

The Opponent tab's subtitle names the opponent's home region.

In `src/renderer/chrome/consoleFrame.ts`, find this line. It occurs exactly once:

```ts
    subtitle: () => '',
```

Replace it with:

```ts
    subtitle: () => S.gameState?.aiHomeRegion ?? '',
```

- [ ] **Step 6: Edit `src/renderer/chrome/controlTooltipText.ts`**

Removes the two sub-tab tips and rewords Run's tip, which no longer opens Tools.

1. In `src/renderer/chrome/controlTooltipText.ts`, delete these lines, including the line break at the end. Together they occur exactly once:

```ts
 * Purpose: Says the tab is where tool groups are turned on or off.
 * When to use: `#openrouter-tab-tools`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const toolsTabTooltipText = 'Show the tools the opponent can use, and turn each group on or off.';

/**
 * Purpose: Says which opponent controls the tab shows.
 * When to use: `#openrouter-tab-model`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const modelTabTooltipText = 'Show the API key, model, reasoning effort, and the Run control for opponent planning.';

/**
```

2. In `src/renderer/chrome/controlTooltipText.ts`, find this line. It occurs exactly once:

```ts
 * Purpose: Says what turning Run on and off does to the Tools tab and to Ready.
```

Replace it with:

```ts
 * Run's tip while it can be clicked.
 *
 * Purpose: Says what turning Run on and off does to Ready.
```

3. In `src/renderer/chrome/controlTooltipText.ts`, find this line. It occurs exactly once:

```ts
  'Turn opponent planning on or off. On opens the Tools tab and can hold Ready until a plan exists; off cancels a plan that is still running.';
```

Replace it with:

```ts
  'Turn opponent planning on or off. On can hold Ready until a plan exists; off cancels a plan that is still running.';
```

4. In `src/renderer/chrome/controlTooltipText.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: New group ids must not invent a tip. Known ids keep one sentence each.
 * When to use: While building each Tools-tab cell.
```

Replace them with:

```ts
 * Returns a tool group's tip.
 *
 * Purpose: New group ids must not invent a tip. Known ids keep one sentence each.
 * When to use: While building each tool-group cell.
```

- [ ] **Step 7: Edit `src/renderer/chrome/frameTooltipText.ts`**

Rewords the Opponent tab's tip.

1. In `src/renderer/chrome/frameTooltipText.ts`, find these lines. Together they occur exactly once:

```ts
/**
 * Purpose: Says what the Opponent tab shows.
```

Replace them with:

```ts
/**
 * The Opponent tab's tip.
 *
 * Purpose: Says what the Opponent tab shows.
```

2. In `src/renderer/chrome/frameTooltipText.ts`, find this line. It occurs exactly once:

```ts
export const opponentTabTooltipText = "Show the opponent's model, its tools, and the AI activity log.";
```

Replace it with:

```ts
export const opponentTabTooltipText = "Show whether the opponent is planning, its model, its tools, and the AI activity log.";
```

- [ ] **Step 8: Edit `src/renderer/gameplay/tacticalBattlePromptPreference.ts`**

Comment fixes: the checkbox lives in the game menu.

1. In `src/renderer/gameplay/tacticalBattlePromptPreference.ts`, find this line. It occurs exactly once:

```ts
 * Purpose: Mirrors the Model tab checkbox default (on) while allowing a persistent opt-out for faster strategic play.
```

Replace it with:

```ts
 * Purpose: Mirrors the game menu's Offer tactical battles checkbox default (on) while allowing a persistent opt-out for faster strategic play.
```

2. In `src/renderer/gameplay/tacticalBattlePromptPreference.ts`, find this line. It occurs exactly once:

```ts
 * Persists the Model tab "Tactical battles" checkbox state.
```

Replace it with:

```ts
 * Persists the game menu's "Offer tactical battles" checkbox state.
```

- [ ] **Step 9: Edit `src/renderer/openRouter/modelDescriptionTooltip.ts`**

Comment fixes: there is no Model tab any more.

1. In `src/renderer/openRouter/modelDescriptionTooltip.ts`, find this line. It occurs exactly once:

```ts
 * When to use: Construct once when the Model tab select is available.
```

Replace it with:

```ts
 * When to use: Construct once when the Opponent tab's model dropdown is available.
```

2. In `src/renderer/openRouter/modelDescriptionTooltip.ts`, find this line. It occurs exactly once:

```ts
   * The Model-tab `<select>` that owns the hover dwell behavior.
```

Replace it with:

```ts
   * The Opponent-tab `<select>` that owns the hover dwell behavior.
```

3. In `src/renderer/openRouter/modelDescriptionTooltip.ts`, find this line. It occurs exactly once:

```ts
 * When to use: From OpenRouter Model-tab control wiring.
```

Replace it with:

```ts
 * When to use: From OpenRouter Opponent-tab control wiring.
```

4. In `src/renderer/openRouter/modelDescriptionTooltip.ts`, find this line. It occurs exactly once:

```ts
 * When to use: Once during Model-tab control initialization.
```

Replace it with:

```ts
 * When to use: Once during Opponent-tab control initialization.
```

- [ ] **Step 10: Edit `src/renderer/openRouter/reasoningEffortSelect.ts`**

Comment fixes.

1. In `src/renderer/openRouter/reasoningEffortSelect.ts`, find this line. It occurs exactly once:

```ts
 * Handle for refreshing the Model-tab reasoning dropdown.
```

Replace it with:

```ts
 * Handle for refreshing the Opponent-tab reasoning dropdown.
```

2. In `src/renderer/openRouter/reasoningEffortSelect.ts`, find this line. It occurs exactly once:

```ts
 * When to use: Once during Model-tab setup, when `#openrouter-reasoning-effort` exists.
```

Replace it with:

```ts
 * When to use: Once during Opponent-tab setup, when `#openrouter-reasoning-effort` exists.
```

- [ ] **Step 11: Edit `src/shared/openRouterModelDisplay.ts`**

Comment fixes.

1. In `src/shared/openRouterModelDisplay.ts`, find this line. It occurs exactly once:

```ts
 * Purpose: Shows which reasoning levels the model offers, so the player can compare models in the Model-tab dropdown.
```

Replace it with:

```ts
 * Purpose: Shows which reasoning levels the model offers, so the player can compare models in the Opponent-tab dropdown.
```

2. In `src/shared/openRouterModelDisplay.ts`, find this line. It occurs exactly once:

```ts
 * Purpose: Encodes optional cost and optional reasoning status into Model-tab list lines.
```

Replace it with:

```ts
 * Purpose: Encodes optional cost and optional reasoning status into Opponent-tab list lines.
```

3. In `src/shared/openRouterModelDisplay.ts`, find this line. It occurs exactly once:

```ts
 * Builds the full Model-tab option label for one OpenRouter model.
```

Replace it with:

```ts
 * Builds the full Opponent-tab option label for one OpenRouter model.
```

- [ ] **Step 12: Edit `src/shared/openRouterReasoningEffort.ts`**

Comment fixes.

1. In `src/shared/openRouterReasoningEffort.ts`, find this line. It occurs exactly once:

```ts
 * Purpose: Vendor effort ids arrive in lowercase; the Model tab shows them as names.
```

Replace it with:

```ts
 * Purpose: Vendor effort ids arrive in lowercase; the Opponent tab shows them as names.
```

2. In `src/shared/openRouterReasoningEffort.ts`, find this line. It occurs exactly once:

```ts
 * Purpose: One rule for the Model-tab dropdown and for main-process request validation.
```

Replace it with:

```ts
 * Purpose: One rule for the Opponent-tab dropdown and for main-process request validation.
```

- [ ] **Step 13: Edit `src/shared/ipc/gameApiTypes.ts`**

A comment fix.

In `src/shared/ipc/gameApiTypes.ts`, find this line. It occurs exactly once:

```ts
     * When to use: Model-tab startup, to restore the reasoning dropdown.
```

Replace it with:

```ts
     * When to use: Opponent-tab startup, to restore the reasoning dropdown.
```

- [ ] **Step 14: Edit `src/shared/ipc/openRouterTypes.ts`**

Comment fixes.

1. In `src/shared/ipc/openRouterTypes.ts`, find this line. It occurs exactly once:

```ts
   * Optional model blurb from OpenRouter for the Model-tab description tooltip.
```

Replace it with:

```ts
   * Optional model blurb from OpenRouter for the Opponent-tab description tooltip.
```

2. In `src/shared/ipc/openRouterTypes.ts`, find this line. It occurs exactly once:

```ts
   * When to use: `formatModelOptionSuffix` when building Model-tab option labels.
```

Replace it with:

```ts
   * When to use: `formatModelOptionSuffix` when building Opponent-tab option labels.
```

3. In `src/shared/ipc/openRouterTypes.ts`, find these lines. Together they occur exactly once:

```ts
   * Optional reasoning metadata used for the Model-tab reasoning suffix and the reasoning dropdown.

   * Contract: `default_effort` is a trimmed string when set; `default_enabled` / `mandatory` are booleans when set.
   * When to use: `formatModelOptionSuffix` for Model-tab option labels, and the reasoning-effort helpers.
```

Replace them with:

```ts
   * Optional reasoning metadata used for the Opponent-tab reasoning suffix and the reasoning dropdown.

   * Contract: `default_effort` is a trimmed string when set; `default_enabled` / `mandatory` are booleans when set.
   * When to use: `formatModelOptionSuffix` for Opponent-tab option labels, and the reasoning-effort helpers.
```

- [ ] **Step 15: Edit `src/main/openRouter/openRouter.ts`**

Comment fixes.

1. In `src/main/openRouter/openRouter.ts`, find this line. It occurs exactly once:

```ts
 * Purpose: Persists the Model-tab reasoning choice with the model choice.
```

Replace it with:

```ts
 * Purpose: Persists the Opponent-tab reasoning choice with the model choice.
```

2. In `src/main/openRouter/openRouter.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: Keeps the Model-tab selection across restarts; a different model starts on its own default effort.
 * When to use: When the player picks a model in the Model tab (via IPC).
```

Replace them with:

```ts
 * Purpose: Keeps the Opponent tab's model selection across restarts; a different model starts on its own default effort.
 * When to use: When the player picks a model on the Opponent tab (via IPC).
```

3. In `src/main/openRouter/openRouter.ts`, find this line. It occurs exactly once:

```ts
 * Purpose: Restores the Model-tab reasoning dropdown and sizes consultation requests.
```

Replace it with:

```ts
 * Purpose: Restores the Opponent-tab reasoning dropdown and sizes consultation requests.
```

- [ ] **Step 16: Edit `src/main/openRouter/buildOpenRouterModelList.ts`**

A comment fix.

In `src/main/openRouter/buildOpenRouterModelList.ts`, find this line. It occurs exactly once:

```ts
 * Turns raw OpenRouter `/models` `data` rows into the sorted list shown in the Model tab.
```

Replace it with:

```ts
 * Turns raw OpenRouter `/models` `data` rows into the sorted list shown in the Opponent tab's model dropdown.
```

- [ ] **Step 17: Edit `src/main/openRouter/buildOpenRouterModelList.test.ts`**

A comment fix.

In `src/main/openRouter/buildOpenRouterModelList.test.ts`, find this line. It occurs exactly once:

```ts
 * Purpose: Happy path for the list shown in the Model tab.
```

Replace it with:

```ts
 * Purpose: Happy path for the list shown in the Opponent tab's model dropdown.
```

- [ ] **Step 18: Edit `src/main/ipc/openRouterIpcHandler.ts`**

A comment fix.

In `src/main/ipc/openRouterIpcHandler.ts`, find this line. It occurs exactly once:

```ts
 * Registers the Model-tab OpenRouter settings handlers: key, model list, model choice, reasoning effort, tool groups.
```

Replace it with:

```ts
 * Registers the Opponent-tab OpenRouter settings handlers: key, model list, model choice, reasoning effort, tool groups.
```

- [ ] **Step 19: Checkpoint: build, types, and lint**

Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
```

Each exits 0, and `check:renderer-types` prints `check-renderer-typecheck: ok`. An error here comes from the steps above: open the file the error names, compare it with its step, fix your copying mistake, and run the three again. If the steps as written cannot compile, stop and report.

- [ ] **Step 20: Edit `static/index.html`**

Rebuilds the Opponent tab as four sections (Status, Commander, Tool groups, Activity log) with the same control ids, rewords the Opponent tab's tip, and adds the status line above Ready.

1. In `static/index.html`, find these lines. Together they occur exactly once:

```html
        <div class="openrouter-tab-bar" role="tablist" aria-label="AI panel">
          <button type="button" id="openrouter-tab-tools" role="tab" aria-selected="false" aria-controls="openrouter-tools-panel" data-control-tooltip="Show the tools the opponent can use, and turn each group on or off.">Tools</button>
          <button type="button" id="openrouter-tab-model" role="tab" aria-selected="true" aria-controls="openrouter-model-panel" data-control-tooltip="Show the API key, model, reasoning effort, and the Run control for opponent planning.">Model</button>
        </div>
        <div id="openrouter-tools-panel" class="openrouter-tab-panel" role="tabpanel" aria-labelledby="openrouter-tab-tools" hidden>
          <div id="openrouter-tools-list" class="openrouter-tools-list"></div>
        </div>
        <div id="openrouter-model-panel" class="openrouter-tab-panel active" role="tabpanel" aria-labelledby="openrouter-tab-model">
          <div class="openrouter-row">
```

Replace them with:

```html
        <div class="opponent-section opponent-status">
          <span class="control-tooltip-host" data-control-tooltip="Turn opponent planning on or off. Enter an API key and choose a model first."><button type="button" id="openrouter-run-btn" class="openrouter-tool-toggle" aria-pressed="false" disabled>Run</button></span>
          <p id="opponent-status-text" class="opponent-status-text">Opponent planning is off.</p>
        </div>
        <section id="openrouter-model-panel" class="opponent-section" aria-labelledby="opponent-commander-heading">
          <h3 id="opponent-commander-heading" class="console-group-heading">Commander</h3>
          <div class="opponent-field">
```

2. In `static/index.html`, find these lines. Together they occur exactly once:

```html
          <div class="openrouter-row">
            <label for="openrouter-model">Model</label>
            <div class="openrouter-model-grid">
```

Replace them with:

```html
          <div class="opponent-field">
            <label for="openrouter-model">Model</label>
            <div class="opponent-model-row">
```

3. In `static/index.html`, find these lines. Together they occur exactly once:

```html
              <span class="control-tooltip-host" data-control-tooltip="Turn opponent planning on or off. Enter an API key and choose a model first."><button type="button" id="openrouter-run-btn" class="openrouter-tool-toggle" aria-pressed="false" disabled>Run</button></span>
              <span class="control-tooltip-host" data-control-tooltip="Choose how much reasoning this model uses. You only see levels this model offers, its default is marked, and the list stays unavailable when it has fewer than two."><select id="openrouter-reasoning-effort" aria-label="Reasoning effort" disabled>
                <option value="">Model default</option>
              </select></span>
            </div>
          </div>
        </div>
        <div class="openrouter-row openrouter-status-row">
          <div id="openrouter-log" class="openrouter-log" aria-label="AI interactions and errors"></div>
        </div>
```

Replace them with:

```html
            </div>
          </div>
          <div class="opponent-field">
            <label for="openrouter-reasoning-effort">Reasoning</label>
            <span class="control-tooltip-host" data-control-tooltip="Choose how much reasoning this model uses. You only see levels this model offers, its default is marked, and the list stays unavailable when it has fewer than two."><select id="openrouter-reasoning-effort" aria-label="Reasoning effort" disabled>
              <option value="">Model default</option>
            </select></span>
          </div>
        </section>
        <section id="openrouter-tools-panel" class="opponent-section" aria-labelledby="opponent-tools-heading">
          <div class="opponent-section-head">
            <h3 id="opponent-tools-heading" class="console-group-heading">Tool groups</h3>
            <span class="opponent-section-note">uses since last Ready</span>
          </div>
          <div id="openrouter-tools-list" class="openrouter-tools-list"></div>
        </section>
        <section class="opponent-section opponent-log-section" aria-labelledby="opponent-log-heading">
          <h3 id="opponent-log-heading" class="console-group-heading">Activity log</h3>
          <div id="openrouter-log" class="openrouter-log" aria-label="AI interactions and errors"></div>
        </section>
```

4. In `static/index.html`, find this line. It occurs exactly once:

```html
      <button type="button" id="console-tab-opponent" class="console-tab" role="tab" aria-selected="false" aria-controls="console-panel-opponent" data-control-tooltip="Show the opponent's model, its tools, and the AI activity log."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1"></rect><path d="M6 1.5V4M10 1.5V4M6 12v2.5M10 12v2.5M1.5 6H4M1.5 10H4M12 6h2.5M12 10h2.5"></path></svg><span>Opponent</span></button>
```

Replace it with:

```html
      <button type="button" id="console-tab-opponent" class="console-tab" role="tab" aria-selected="false" aria-controls="console-panel-opponent" data-control-tooltip="Show whether the opponent is planning, its model, its tools, and the AI activity log."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1"></rect><path d="M6 1.5V4M10 1.5V4M6 12v2.5M10 12v2.5M1.5 6H4M1.5 10H4M12 6h2.5M12 10h2.5"></path></svg><span>Opponent</span></button>
```

5. In `static/index.html`, find this line. It occurs exactly once:

```html
    <div id="console-footer" class="console-footer">
```

Replace it with:

```html
    <div id="console-footer" class="console-footer">
      <p id="opponent-status-line" class="opponent-status-line" data-status="off">
        <span class="opponent-status-dot" aria-hidden="true"></span>
        <span id="opponent-status-label" class="opponent-status-label">Opponent planning off</span>
        <span id="opponent-status-model" class="opponent-status-model">No model</span>
        <span id="opponent-status-cost" class="opponent-status-cost">$0.00</span>
      </p>
```

- [ ] **Step 21: Edit `static/shellChrome.css`**

Removes the rules for the old Opponent rows and the model grid.

1. In `static/shellChrome.css`, delete these lines, including the line break at the end. Together they occur exactly once:

```css
.openrouter-status-row {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--chrome-border);
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* Both tabs: no rule line above the shared output log (status row follows both panels in DOM). */
#openrouter-tools-panel.active ~ .openrouter-status-row,
#openrouter-model-panel.active ~ .openrouter-status-row {
  border-top: none;
  margin-top: 0;
  padding-top: 0;
}
#openrouter-model-panel.active > .openrouter-row:last-child {
  margin-bottom: 0;
}
.openrouter-row {
  margin-bottom: 0.6rem;
}
.openrouter-row label {
  display: block;
  font-size: 0.85rem;
  color: var(--chrome-muted);
  margin-bottom: 0.2rem;
}
```

2. In `static/shellChrome.css`, delete these lines, including the line break at the end. Together they occur exactly once:

```css
}
.openrouter-row input[type="password"],
.openrouter-row select {
  width: 100%;
  padding: 0.3rem 0.4rem;
  font-size: 12px;
  box-sizing: border-box;
}
.openrouter-model-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 0.4rem;
  align-items: center;
}
.openrouter-model-grid select {
  min-width: 0;
}
/* The model dropdown sets this row's height. Refresh and Run stretch to that border box. */
.openrouter-model-grid > button {
  align-self: stretch;
  height: auto;
  box-sizing: border-box;
  padding-block: 0;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.openrouter-model-grid > .control-tooltip-host {
  display: flex;
  align-self: stretch;
  min-width: 0;
}
.openrouter-model-grid > .control-tooltip-host > button {
  align-self: stretch;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding-block: 0;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.openrouter-model-grid > .control-tooltip-host > select {
  width: 100%;
  min-width: 0;
  align-self: center;
  height: auto;
```

- [ ] **Step 22: Edit `static/frameChrome.css`**

The footer stacks the status line over Ready, and hides the line while collapsed.

1. In `static/frameChrome.css`, find this line. It occurs exactly once:

```css
  grid-area: footer;
```

Replace it with:

```css
  grid-area: footer;
  display: flex;
  flex-direction: column;
  gap: 8px;
```

2. In `static/frameChrome.css`, find these lines. Together they occur exactly once:

```css
}
/* The "AI:" label and its timer are separate flex items, so wrapping puts them on two lines. */
```

Replace them with:

```css
}
/* The rail is too narrow for the opponent status line; Ready stays. */
#sidebar.console[data-collapsed="true"] .opponent-status-line {
  display: none;
}
/* The "AI:" label and its timer are separate flex items, so wrapping puts them on two lines. */
```

- [ ] **Step 23: Edit `static/consoleChrome.css`**

Styles for the Opponent sections and the status line.

In `static/consoleChrome.css`, find these lines. Together they occur exactly once:

```css
  line-height: 1.45;
}
```

Replace them with:

```css
  line-height: 1.45;
}

/* ---------- Opponent tab ---------- */
/* Status, Commander, Tool groups, and the activity log, which takes the height that is left. */
.opponent-section {
  padding: 12px 0;
  border-bottom: 1px solid var(--chrome-divider);
}
.opponent-section:first-child {
  padding-top: 0;
}
.opponent-status {
  display: flex;
  align-items: center;
  gap: 10px;
}
.opponent-status-text {
  margin: 0;
  font-size: 13px;
}
.opponent-field {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.opponent-field label {
  color: var(--chrome-muted);
  font-size: 12px;
}
.opponent-field input[type="password"],
.opponent-field select {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 0.3rem 0.4rem;
  font-size: 12px;
}
.opponent-field > .control-tooltip-host {
  display: flex;
  min-width: 0;
}
.opponent-model-row {
  display: flex;
  align-items: stretch;
  gap: 6px;
  min-width: 0;
}
.opponent-model-row > select {
  flex: 1 1 auto;
}
/* Refresh stretches to the dropdown's height and centres its icon. */
.opponent-model-row > button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding-block: 0;
  line-height: 1;
}
.opponent-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.opponent-section-note {
  color: var(--chrome-muted);
  font-size: 11px;
}
.opponent-log-section {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-bottom: 0;
  border-bottom: 0;
}

/* ---------- Footer status line ---------- */
.opponent-status-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin: 0;
  color: var(--chrome-muted);
  font-size: 12px;
}
.opponent-status-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--chrome-disabled);
}
.opponent-status-line[data-status="on"] .opponent-status-dot {
  background: var(--chrome-accent-edge);
}
.opponent-status-line[data-status="planning"] .opponent-status-dot {
  background: var(--chrome-opponent-edge);
}
.opponent-status-label {
  flex: none;
  color: var(--chrome-text);
}
.opponent-status-model {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.opponent-status-model::before {
  content: "· ";
}
.opponent-status-cost {
  flex: none;
  color: var(--chrome-text);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 24: Edit `scripts/ui-smoke/ui-smoke-console-checks.cjs`**

Adds the Opponent sections check, the two-column tool groups check, and the status line checks, which also run in the reopened match, the battle, and the regional match.

1. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find this line. It occurs exactly once:

```js
const TOAST_BAND_MAX_WIDTH = 560;
```

Replace it with:

```js
const TOAST_BAND_MAX_WIDTH = 560;

/**
 * What the footer status line reads in a fresh match: Run is off and there is no API key, so no model loads.
 *
 * Purpose: The smoke run uses an empty user-data folder, so these values never depend on the network.
 * When to use: The status line check.
 * Expected outcome: The label, the model name, and the match cost, in that order.
 * Exceptions: None.
 */
const FRESH_STATUS_LINE = Object.freeze(['Opponent planning off', 'No model', '$0.00']);

/**
 * The Opponent tab's parts, top to bottom.
 *
 * Purpose: The four sections show together, in this order, with no sub-tabs.
 * When to use: The Opponent sections check.
 * Expected outcome: Run (Status), Commander, Tool groups, the log's heading, and the log.
 * Exceptions: None.
 */
const OPPONENT_SECTION_ORDER = Object.freeze([
  '#openrouter-run-btn',
  '#openrouter-model-panel',
  '#openrouter-tools-panel',
  '#opponent-log-heading',
  '#openrouter-log',
]);
```

2. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
  {
    name: 'selection-cleared-rows',
```

Replace them with:

```js
  {
    name: 'opponent-sections',
    scenes: [SCENES.opponentTab],
    needs: ['#console-subtitle', '#opponent-status-text', ...OPPONENT_SECTION_ORDER],
    run: (p, el) => {
      const subtitle = el('#console-subtitle').text;
      if (subtitle !== 'Northern Africa') return `the Opponent subtitle reads "${subtitle}", expected "Northern Africa"`;
      const sentence = el('#opponent-status-text').text;
      if (sentence !== 'Opponent planning is off.') return `the status sentence reads "${sentence}", expected "Opponent planning is off."`;
      const hidden = OPPONENT_SECTION_ORDER.filter((selector) => !el(selector).shown);
      if (hidden.length > 0) return `not shown together: ${hidden.join(', ')}`;
      const misplaced = OPPONENT_SECTION_ORDER.slice(1).filter((selector, i) => el(selector).y <= el(OPPONENT_SECTION_ORDER[i]).y);
      return misplaced.length === 0 ? null : `not below the part before it: ${misplaced.join(', ')}`;
    },
  },
  {
    name: 'opponent-tool-groups-two-columns',
    scenes: [SCENES.opponentTab],
    needs: ['#openrouter-tools-list', '#openrouter-tools-list .openrouter-tool-cell'],
    run: (p, el) => {
      const list = el('#openrouter-tools-list');
      const cell = el('#openrouter-tools-list .openrouter-tool-cell');
      if (cell.allTexts.length < 2) return `${cell.allTexts.length} tool groups are listed`;
      return cell.w <= list.w / 2 + 1 ? null : `a tool group is ${Math.round(cell.w)} wide in a ${Math.round(list.w)}-wide list, expected two columns`;
    },
  },
  {
    name: 'console-status-line',
    scenes: [SCENES.strategic, SCENES.opponentTab, SCENES.matchReopened, SCENES.battleStart, SCENES.regionalStart],
    needs: ['#opponent-status-line', '#opponent-status-label', '#opponent-status-model', '#opponent-status-cost', '#ready-btn'],
    run: (p, el) => {
      const line = el('#opponent-status-line');
      const ready = el('#ready-btn');
      if (!line.shown || !line.ancestorIds.includes('console-footer')) return 'the status line is not shown in the console footer';
      if (line.y + line.h > ready.y + 1) return `the status line ${fmt(line)} is not above Ready ${fmt(ready)}`;
      if (line.h > 24) return `the status line is ${Math.round(line.h)} tall, so it wraps`;
      const parts = ['#opponent-status-label', '#opponent-status-model', '#opponent-status-cost'].map((selector) => el(selector).text);
      return parts.every((text, i) => text === FRESH_STATUS_LINE[i])
        ? null
        : `the status line reads ${JSON.stringify(parts)}, expected ${JSON.stringify(FRESH_STATUS_LINE)}`;
    },
  },
  {
    name: 'console-status-line-hidden-collapsed',
    scenes: [SCENES.consoleCollapsed],
    needs: ['#opponent-status-line'],
    run: (p, el) => (el('#opponent-status-line').shown ? 'the status line shows in the collapsed rail' : null),
  },
  {
    name: 'selection-cleared-rows',
```

- [ ] **Step 25: Edit `doc/ux/right-panel-model-tab.md`**

Now describes the Status and Commander sections.

1. In `doc/ux/right-panel-model-tab.md`, find these lines. Together they occur exactly once:

````markdown
# Right Panel Model Tab

The API key, model choice, reasoning effort, and Run, on the right panel's Opponent tab. New game and Offer tactical battles are in the [game menu](game-menu.md).
````

Replace them with:

````markdown
# Opponent Tab Status and Commander

The first two sections of the console's Opponent tab: Status, with Run and a sentence saying whether opponent planning is on, then Commander, with the API key, model choice, and reasoning effort. New game and Offer tactical battles are in the [game menu](game-menu.md).
````

2. In `doc/ux/right-panel-model-tab.md`, find these lines. Together they occur exactly once:

````markdown
Shown while the right panel's Opponent tab and its Model sub-tab are selected and the panel is expanded. The Opponent tab starts on this sub-tab. The model description tooltip can appear while this tab's model dropdown is in use. While the tactical battles list is open, the tab stays visible while the panel is expanded and does not receive pointer input. In New game and Game over the panel is absent, so this tab is absent with it.

## Information Displayed

- An API key field. The placeholder is "Set key and blur to save" until a key is saved, then "Saved API key". The field does not show the saved key as visible text after it is stored; it is a password field.
- A cost readout for the current match, as a currency amount. A new match resets it to zero.
- A model dropdown. It starts as "— Select model —" until models load. Each option shows the model name, then in brackets the combined prompt and completion price per million tokens and the model's reasoning levels, lowest first, abbreviated and separated by slashes, with the default level marked by an asterisk, for example `reasoning: None/Low/Med*/High`. Levels are abbreviated None, Min, Low, Med, High, Xhigh, and Max. A model that reports reasoning without listing levels shows `reasoning: <default level>` or `reasoning: default`.
- A refresh control labeled "Refresh model list". It and Run are the same height as the model dropdown beside them.
- A Run button. It stays unavailable until both a key and a model are set.
- A reasoning effort dropdown on the row directly below the model dropdown, at the same width. It lists only the selected model's reasoning levels, as "High" and so on, and marks the model's default level "(default)". When the model has no default level, or no levels at all, an extra first option reads "Model default". The dropdown is disabled when the model offers fewer than two levels, and before models load.
- Control tips for this tab's fields, buttons, and dropdowns are in [control-tooltips.md](control-tooltips.md). The model dropdown keeps the model description tooltip and does not use those tips.
````

Replace them with:

````markdown
Shown while the console's Opponent tab is selected and the console is expanded. The [Tool groups](right-panel-tools-tab.md) section and the [AI activity log](ai-activity-log.md) show below these sections at the same time; the tab has no sub-tabs. The model description tooltip can appear while the model dropdown is in use. While the tactical battles list is open, these sections stay visible while the console is expanded and do not receive pointer input. In New game and Game over the console is absent, so these sections are absent with it.

## Information Displayed

- The Status section: Run, then one sentence. It reads "Opponent planning is on." while Run is pressed and "Opponent planning is off." otherwise (`opponentStatusSentence` in `src/shared/opponentPlanningStatus.ts`).
- The Commander section, under a "Commander" heading, with the labels API key, Model, and Reasoning in a column on the left.
- An API key field. The placeholder is "Set key and blur to save" until a key is saved, then "Saved API key". The field does not show the saved key as visible text after it is stored; it is a password field.
- A cost readout for the current match, as a currency amount, beside the key field. A new match resets it to zero.
- A model dropdown. It starts as "— Select model —" until models load. Each option shows the model name, then in brackets the combined prompt and completion price per million tokens and the model's reasoning levels, lowest first, abbreviated and separated by slashes, with the default level marked by an asterisk, for example `reasoning: None/Low/Med*/High`. Levels are abbreviated None, Min, Low, Med, High, Xhigh, and Max. A model that reports reasoning without listing levels shows `reasoning: <default level>` or `reasoning: default`.
- A refresh control labeled "Refresh model list", the same height as the model dropdown beside it.
- A Run button in the Status section. It stays unavailable until both a key and a model are set.
- A reasoning effort dropdown on the row below the model dropdown. It lists only the selected model's reasoning levels, as "High" and so on, and marks the model's default level "(default)". When the model has no default level, or no levels at all, an extra first option reads "Model default". The dropdown is disabled when the model offers fewer than two levels, and before models load.
- The console footer's status line repeats whether planning is on, the selected model's name, and the match cost. See [right-panel.md](right-panel.md).
- Control tips for these sections' fields, buttons, and dropdowns are in [control-tooltips.md](control-tooltips.md). The model dropdown keeps the model description tooltip and does not use those tips.
````

3. In `doc/ux/right-panel-model-tab.md`, find this line. It occurs exactly once:

````markdown
- When the player clicks Run and it is enabled, Run toggles. Pressed means opponent planning runs. Turning it on selects the Tools tab, clears any precomputed opponent plan, and may disable Ready until a plan is ready. Turning it off stops every running or pending opponent model call, in both theaters, and clears the precomputed plan. The turn or beat still resolves. A cancelled call stores no model orders.
````

Replace it with:

````markdown
- When the player clicks Run and it is enabled, Run toggles. Pressed means opponent planning runs, and the status sentence and the footer status line follow. Turning it on clears any precomputed opponent plan and may disable Ready until a plan is ready. It does not change the selected tab. Turning it off stops every running or pending opponent model call, in both theaters, and clears the precomputed plan. The turn or beat still resolves. A cancelled call stores no model orders.
````

4. In `doc/ux/right-panel-model-tab.md`, find these lines. Together they occur exactly once:

````markdown
- When the selected model does not support tool calls, its consultations run without tools, whatever the Tools tab says. See [right-panel-tools-tab.md](right-panel-tools-tab.md).

## States

- Run disabled: no key or no model.
- Run off: enabled, not pressed. Ready does not wait on precomputed orders.
- Run on: pressed. Ready may show the AI wait label. See [modes-and-transitions.md](modes-and-transitions.md).
````

Replace them with:

````markdown
- When the selected model does not support tool calls, its consultations run without tools, whatever the Tool groups section says. See [right-panel-tools-tab.md](right-panel-tools-tab.md).

## States

- Run disabled: no key or no model. The sentence reads "Opponent planning is off."
- Run off: enabled, not pressed. The sentence reads "Opponent planning is off." Ready does not wait on precomputed orders.
- Run on: pressed. The sentence reads "Opponent planning is on." Ready may show the AI wait label. See [modes-and-transitions.md](modes-and-transitions.md).
````

5. In `doc/ux/right-panel-model-tab.md`, find this line. It occurs exactly once:

````markdown
- The API key value is never written into this document or into the activity log by the key field itself.
````

Replace it with:

````markdown
- The API key value is never written into this document or into the activity log by the key field itself.
- The status sentence always matches Run's pressed state.
````

6. In `doc/ux/right-panel-model-tab.md`, find this line. It occurs exactly once:

````markdown
- `static/index.html` (`#openrouter-model-panel`, `#openrouter-key`, `#openrouter-cost`, `#openrouter-model`, `#openrouter-refresh-models`, `#openrouter-run-btn`, `#openrouter-reasoning-effort`, `#model-description-tooltip`)
````

Replace it with:

````markdown
- `static/index.html` (`#openrouter-run-btn`, `#opponent-status-text`, `#openrouter-model-panel`, `#openrouter-key`, `#openrouter-cost`, `#openrouter-model`, `#openrouter-refresh-models`, `#openrouter-reasoning-effort`, `#model-description-tooltip`)
- `static/consoleChrome.css`
- `src/shared/opponentPlanningStatus.ts`
````

- [ ] **Step 26: Edit `doc/ux/right-panel-tools-tab.md`**

Now describes the Tool groups section.

1. In `doc/ux/right-panel-tools-tab.md`, find these lines. Together they occur exactly once:

````markdown
# Right Panel Tools Tab

The list of tool groups the opponent's model may use.
````

Replace them with:

````markdown
# Opponent Tab Tool Groups

The Tool groups section of the console's Opponent tab: the tool groups the opponent's model may use.
````

2. In `doc/ux/right-panel-tools-tab.md`, find these lines. Together they occur exactly once:

````markdown
Shown while the right panel's Opponent tab and its Tools sub-tab are selected and the panel is expanded. The Opponent tab starts on the Model sub-tab. Turning Run on selects this tab. While the tactical battles list is open, the tab stays visible while the panel is expanded and does not receive pointer input. See [right-panel.md](right-panel.md) and [right-panel-model-tab.md](right-panel-model-tab.md). In New game and Game over the panel is absent, so this tab is absent with it.

## Information Displayed

- One row per tool group. The row shows the group's label and a count of uses since the counters were reset.
- The group list comes from the app. If that list has no Events group, Events is added.
- What the groups do is described in [AI tools](../ai-tools.md).
- Control tips for these rows are in [control-tooltips.md](control-tooltips.md).
````

Replace them with:

````markdown
Shown while the console's Opponent tab is selected and the console is expanded, below the [Status and Commander](right-panel-model-tab.md) sections and above the [AI activity log](ai-activity-log.md). While the tactical battles list is open, the section stays visible while the console is expanded and does not receive pointer input. See [right-panel.md](right-panel.md). In New game and Game over the console is absent, so this section is absent with it.

## Information Displayed

- A "Tool groups" heading, with "uses since last Ready" beside it.
- One cell per tool group, in two columns. A cell shows a count of uses since the counters were reset, then the group's label.
- The group list comes from the app. If that list has no Events group, Events is added.
- What the groups do is described in [AI tools](../ai-tools.md).
- Control tips for these cells are in [control-tooltips.md](control-tooltips.md).
````

3. In `doc/ux/right-panel-tools-tab.md`, find this line. It occurs exactly once:

````markdown
- When the player clicks a row's count control, that group toggles on or off. The control shows as pressed while the group is on.
````

Replace it with:

````markdown
- When the player clicks a cell's count control, that group toggles on or off. The control shows as pressed while the group is on.
````

4. In `doc/ux/right-panel-tools-tab.md`, find this line. It occurs exactly once:

````markdown
- When the selected model does not support tool calls, consultations run as if every group of model-callable tools were off. Events still follows its row, because it decides when consultations happen rather than offering the model a tool. The rows keep their pressed state, and the groups apply again once a model with tool support is selected. The AI activity log says so once per app session for each such model. See [ai-activity-log.md](ai-activity-log.md).
````

Replace it with:

````markdown
- When the selected model does not support tool calls, consultations run as if every group of model-callable tools were off. Events still follows its cell, because it decides when consultations happen rather than offering the model a tool. The cells keep their pressed state, and the groups apply again once a model with tool support is selected. The AI activity log says so once per app session for each such model. See [ai-activity-log.md](ai-activity-log.md).
````

5. In `doc/ux/right-panel-tools-tab.md`, find these lines. Together they occur exactly once:

````markdown
- Tab hidden: the Model tab is selected.

## Invariants

- The count on a row is the use count, not an on/off label. On and off are the pressed state.
- Turning a group off never clears queued player orders.
- The model choice never changes a row's pressed state.

## Strategic and Tactical Differences

The same tab is used in both theaters. Counts reset on both strategic Ready and tactical Ready.
````

Replace them with:

````markdown
- Section hidden: another console tab is selected, or the console is collapsed.

## Invariants

- The count in a cell is the use count, not an on/off label. On and off are the pressed state.
- Turning a group off never clears queued player orders.
- The model choice never changes a cell's pressed state.

## Strategic and Tactical Differences

The same section is used in both theaters. Counts reset on both strategic Ready and tactical Ready.
````

6. In `doc/ux/right-panel-tools-tab.md`, find this line. It occurs exactly once:

````markdown
- `static/index.html` (`#openrouter-tab-tools`, `#openrouter-tools-panel`, `#openrouter-tools-list`)
````

Replace it with:

````markdown
- `static/index.html` (`#openrouter-tools-panel`, `#openrouter-tools-list`)
- `static/shellChrome.css`
````

- [ ] **Step 27: Edit `doc/ux/ai-activity-log.md`**

The log sits at the bottom of the Opponent tab.

1. In `doc/ux/ai-activity-log.md`, find this line. It occurs exactly once:

````markdown
Shown on the right panel's Opponent tab, under the Tools and Model sub-tabs, whichever sub-tab is selected, in every mode where the panel is visible and expanded. While the tactical battles list is open, the log stays visible while the panel is expanded and does not receive pointer input. The log itself has no mode of its own. The log is absent in New game and Game over because the panel is absent.
````

Replace it with:

````markdown
Shown at the bottom of the console's Opponent tab, under an "Activity log" heading below the [Tool groups](right-panel-tools-tab.md) section, filling the height that is left, in every mode where the panel is visible and expanded. While the tactical battles list is open, the log stays visible while the panel is expanded and does not receive pointer input. The log itself has no mode of its own. The log is absent in New game and Game over because the panel is absent.
````

2. In `doc/ux/ai-activity-log.md`, find this line. It occurs exactly once:

````markdown
- When a new match starts, from startup, New game, or game over, the log clears, together with the cost readout reset on the Model tab and the [Reports tab](reports-tab.md).
````

Replace it with:

````markdown
- When a new match starts, from startup, New game, or game over, the log clears, together with the cost readout reset in the [Commander](right-panel-model-tab.md) section and on the footer status line, and the [Reports tab](reports-tab.md).
````

- [ ] **Step 28: Edit `doc/ux/right-panel.md`**

Describes the Opponent sections, its subtitle, and the footer status line.

1. In `doc/ux/right-panel.md`, find this line. It occurs exactly once:

````markdown
The console docked on the right of the map. It holds the Orders tab, the Reports tab, the Opponent tab, a tab rail, and a footer with Ready.
````

Replace it with:

````markdown
The console docked on the right of the map. It holds the Orders tab, the Reports tab, the Opponent tab, a tab rail, and a footer with the opponent status line and Ready.
````

2. In `doc/ux/right-panel.md`, find this line. It occurs exactly once:

````markdown
- A header with the selected tab's name, a subtitle, and a button that collapses the panel. On the Orders tab the subtitle reads "N queued for turn T", or "N queued for beat B" in a battle, where N counts every row of the three order groups (`formatQueuedOrdersSubtitle` in `src/shared/orderRowDetail.ts`). On the Reports tab it reads "this match". The Opponent tab has no subtitle.
````

Replace it with:

````markdown
- A header with the selected tab's name, a subtitle, and a button that collapses the panel. On the Orders tab the subtitle reads "N queued for turn T", or "N queued for beat B" in a battle, where N counts every row of the three order groups (`formatQueuedOrdersSubtitle` in `src/shared/orderRowDetail.ts`). On the Reports tab it reads "this match". On the Opponent tab it names the opponent's home region, as the top bar does.
````

3. In `doc/ux/right-panel.md`, find these lines. Together they occur exactly once:

````markdown
- The Opponent tab: the Tools tab and the Model tab, one shown at a time, with the AI activity log under them. See [right-panel-tools-tab.md](right-panel-tools-tab.md), [right-panel-model-tab.md](right-panel-model-tab.md), and [ai-activity-log.md](ai-activity-log.md).
- A footer with Ready, under the tab content. See [right-panel-command-bar.md](right-panel-command-bar.md).
- While collapsed, only the tab rail and a smaller Ready show. While Ready reads "AI:" and a time, that label takes two lines.
````

Replace them with:

````markdown
- The Opponent tab: four sections shown together, with no sub-tabs. Status holds Run and a sentence saying whether opponent planning is on. Commander holds the API key with the match cost, the model with refresh, and the reasoning effort. Tool groups holds the tool toggles in two columns. The AI activity log fills the height that is left. See [right-panel-model-tab.md](right-panel-model-tab.md), [right-panel-tools-tab.md](right-panel-tools-tab.md), and [ai-activity-log.md](ai-activity-log.md).
- A footer under the tab content, with the opponent status line above Ready. For Ready, see [right-panel-command-bar.md](right-panel-command-bar.md).
- The opponent status line, read-only and with no tip:
  - A dot: grey while planning is off, teal while it is on, and rose while the opponent plans.
  - A label: "Opponent planning off" while Run is off, "Opponent planning…" while Ready shows "AI:" and a time, and "Opponent planning on" otherwise.
  - The selected model's name: the model option's text before " [", or "No model". A long name is cut short with an ellipsis.
  - The match cost, the same amount as the Commander section's cost readout.
  - The labels come from `src/shared/opponentPlanningStatus.ts`.
- While collapsed, only the tab rail and a smaller Ready show. The opponent status line is hidden. While Ready reads "AI:" and a time, that label takes two lines.
````

4. In `doc/ux/right-panel.md`, find this line. It occurs exactly once:

````markdown
- Inside the Opponent tab, clicking Tools or Model shows that sub-tab. Turning Run on also selects the Tools sub-tab. See [right-panel-model-tab.md](right-panel-model-tab.md).
````

Replace it with:

````markdown
- Turning Run on or off does not change the selected tab. See [right-panel-model-tab.md](right-panel-model-tab.md).
````

5. In `doc/ux/right-panel.md`, find this line. It occurs exactly once:

````markdown
- The panel starts expanded on the Orders tab. Inside the Opponent tab, the Model sub-tab is selected first.
````

Replace it with:

````markdown
- The panel starts expanded on the Orders tab.
- The opponent status line updates whenever Run, the opponent's wait, the selected model, or the match cost changes.
````

6. In `doc/ux/right-panel.md`, find this line. It occurs exactly once:

````markdown
- Ready is on screen whenever the panel is, expanded or collapsed.
````

Replace it with:

````markdown
- Ready is on screen whenever the panel is, expanded or collapsed.
- The opponent status line's label always agrees with Run and with Ready's "AI:" label.
````

7. In `doc/ux/right-panel.md`, find this line. It occurs exactly once:

````markdown
- `static/index.html` (`#sidebar`, `#console-main`, `#console-title`, `#console-subtitle`, `#console-tab-orders-badge`, `#console-collapse-btn`, `#console-panel-orders`, `#console-panel-reports`, `#console-panel-opponent`, `#console-rail`, `#console-tab-orders`, `#console-tab-reports`, `#console-tab-reports-badge`, `#console-tab-opponent`, `#console-tab-build`, `#console-tab-forces`, `#console-footer`, `#openrouter-tab-tools`, `#openrouter-tab-model`)
````

Replace it with:

````markdown
- `static/index.html` (`#sidebar`, `#console-main`, `#console-title`, `#console-subtitle`, `#console-tab-orders-badge`, `#console-collapse-btn`, `#console-panel-orders`, `#console-panel-reports`, `#console-panel-opponent`, `#console-rail`, `#console-tab-orders`, `#console-tab-reports`, `#console-tab-reports-badge`, `#console-tab-opponent`, `#console-tab-build`, `#console-tab-forces`, `#console-footer`, `#opponent-status-line`, `#opponent-status-label`, `#opponent-status-model`, `#opponent-status-cost`)
````

8. In `doc/ux/right-panel.md`, find this line. It occurs exactly once:

````markdown
- `src/shared/consoleTabState.ts`
````

Replace it with:

````markdown
- `src/shared/consoleTabState.ts`
- `src/shared/opponentPlanningStatus.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts` (`renderOpponentStatus`)
````

- [ ] **Step 29: Edit `doc/ux/control-tooltips.md`**

Removes the sub-tab tips and updates the Opponent and Run tips.

1. In `doc/ux/control-tooltips.md`, find these lines. Together they occur exactly once:

````markdown
- Tools tab: Show the tools the opponent can use, and turn each group on or off.
- Model tab: Show the API key, model, reasoning effort, and the Run control for opponent planning.
- Orders tab: Show the orders queued for this turn or beat.
- Reports tab: Show the turn reports, opponent messages, and notices from this match, newest first.
- Opponent tab: Show the opponent's model, its tools, and the AI activity log.
````

Replace them with:

````markdown
- Orders tab: Show the orders queued for this turn or beat.
- Reports tab: Show the turn reports, opponent messages, and notices from this match, newest first.
- Opponent tab: Show whether the opponent is planning, its model, its tools, and the AI activity log.
````

2. In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- Run, while it can be clicked: Turn opponent planning on or off. On opens the Tools tab and can hold Ready until a plan exists; off cancels a plan that is still running.
````

Replace it with:

````markdown
- Run, while it can be clicked: Turn opponent planning on or off. On can hold Ready until a plan exists; off cancels a plan that is still running.
````

- [ ] **Step 30: Edit `doc/ux-specification.md`**

Renames the routing rows, the element list entries, and the matrix rows.

1. In `doc/ux-specification.md`, find these lines. Together they occur exactly once:

````markdown
| The right panel as a whole, its tabs, or collapsing it | [modes-and-transitions.md](ux/modes-and-transitions.md) | [right-panel.md](ux/right-panel.md) |
| Ready, Ranged, or Strike | [selection-model.md](ux/selection-model.md), [order-lifecycle.md](ux/order-lifecycle.md), [modes-and-transitions.md](ux/modes-and-transitions.md) | [right-panel-command-bar.md](ux/right-panel-command-bar.md) |
| Order lists on the Orders tab | [order-lifecycle.md](ux/order-lifecycle.md), [selection-model.md](ux/selection-model.md) | [right-panel-selection-and-orders.md](ux/right-panel-selection-and-orders.md) |
| The selection panel | [selection-model.md](ux/selection-model.md), [order-lifecycle.md](ux/order-lifecycle.md) | [selection-panel.md](ux/selection-panel.md) |
| The Tools tab | [modes-and-transitions.md](ux/modes-and-transitions.md) | [right-panel-tools-tab.md](ux/right-panel-tools-tab.md) |
| API key, model, reasoning effort, or Run | [modes-and-transitions.md](ux/modes-and-transitions.md), [notifications-and-feedback.md](ux/notifications-and-feedback.md) | [right-panel-model-tab.md](ux/right-panel-model-tab.md) |
````

Replace them with:

````markdown
| The right panel as a whole, its tabs, its footer status line, or collapsing it | [modes-and-transitions.md](ux/modes-and-transitions.md) | [right-panel.md](ux/right-panel.md) |
| Ready, Ranged, or Strike | [selection-model.md](ux/selection-model.md), [order-lifecycle.md](ux/order-lifecycle.md), [modes-and-transitions.md](ux/modes-and-transitions.md) | [right-panel-command-bar.md](ux/right-panel-command-bar.md) |
| Order lists on the Orders tab | [order-lifecycle.md](ux/order-lifecycle.md), [selection-model.md](ux/selection-model.md) | [right-panel-selection-and-orders.md](ux/right-panel-selection-and-orders.md) |
| The selection panel | [selection-model.md](ux/selection-model.md), [order-lifecycle.md](ux/order-lifecycle.md) | [selection-panel.md](ux/selection-panel.md) |
| The Opponent tab's tool groups | [modes-and-transitions.md](ux/modes-and-transitions.md) | [right-panel-tools-tab.md](ux/right-panel-tools-tab.md) |
| Run, its status sentence, API key, model, or reasoning effort | [modes-and-transitions.md](ux/modes-and-transitions.md), [notifications-and-feedback.md](ux/notifications-and-feedback.md) | [right-panel-model-tab.md](ux/right-panel-model-tab.md) |
````

2. In `doc/ux-specification.md`, find these lines. Together they occur exactly once:

````markdown
- [right-panel.md](ux/right-panel.md): the console docked on the right: its tab rail, collapsing it, and the footer that holds Ready.
- [right-panel-command-bar.md](ux/right-panel-command-bar.md): Ready, and the Ranged and air strike controls in the selection panel.
- [right-panel-selection-and-orders.md](ux/right-panel-selection-and-orders.md): the Movement, Ranged attacks, and Air strikes groups on the Orders tab.
- [selection-panel.md](ux/selection-panel.md): the panel at the map's bottom-left that describes the selected units, their hex, and their orders, and holds Ranged and Strike.
- [right-panel-tools-tab.md](ux/right-panel-tools-tab.md): the Tools tab and its tool list.
- [right-panel-model-tab.md](ux/right-panel-model-tab.md): API key, model, reasoning effort, Run, and the model description tooltip.
````

Replace them with:

````markdown
- [right-panel.md](ux/right-panel.md): the console docked on the right: its tab rail, collapsing it, and the footer that holds the opponent status line and Ready.
- [right-panel-command-bar.md](ux/right-panel-command-bar.md): Ready, and the Ranged and air strike controls in the selection panel.
- [right-panel-selection-and-orders.md](ux/right-panel-selection-and-orders.md): the Movement, Ranged attacks, and Air strikes groups on the Orders tab.
- [selection-panel.md](ux/selection-panel.md): the panel at the map's bottom-left that describes the selected units, their hex, and their orders, and holds Ranged and Strike.
- [right-panel-tools-tab.md](ux/right-panel-tools-tab.md): the Opponent tab's Tool groups section.
- [right-panel-model-tab.md](ux/right-panel-model-tab.md): the Opponent tab's Status and Commander sections: Run and its sentence, API key, model, reasoning effort, and the model description tooltip.
````

3. In `doc/ux-specification.md`, find these lines. Together they occur exactly once:

````markdown
| Tools tab | Hidden | Shown | Disabled | Shown | Shown | Disabled | Hidden |
| Model tab | Hidden | Shown | Disabled | Shown | Changed | Disabled | Hidden |
````

Replace them with:

````markdown
| Opponent tool groups | Hidden | Shown | Disabled | Shown | Shown | Disabled | Hidden |
| Opponent status and commander | Hidden | Shown | Disabled | Shown | Changed | Disabled | Hidden |
````

- [ ] **Step 31: Edit `doc/how-to-play.md`**

Uses the new section names and mentions the status line.

1. In `doc/how-to-play.md`, find these lines. Together they occur exactly once:

````markdown
- **Reasoning costs more:** a higher reasoning level on the Model tab makes each consult slower and dearer.
- **Waiting on the AI:** while the model plans, Ready shows **AI:** and a timer. You can keep giving orders during the wait. Turn **Run** off to stop that plan. If the turn has not resolved yet, Ready can resolve it without those orders. If the turn already played back, Ready unlocks and the next turn does not use that plan. Changing the model stops the current plan. If Run is still on and Ready is still waiting, planning starts again with the new model.
- **Not every turn:** with **Events** on (the default) on the Tools tab, the model is called when an event it's watching or a mandatory trigger fires, and at least every five turns. Otherwise its standing orders run.
````

Replace them with:

````markdown
- **Reasoning costs more:** a higher reasoning level in the Opponent tab's Commander section makes each consult slower and dearer.
- **Waiting on the AI:** while the model plans, Ready shows **AI:** and a timer, and the line above it reads **Opponent planning…**. You can keep giving orders during the wait. Turn **Run** off to stop that plan. If the turn has not resolved yet, Ready can resolve it without those orders. If the turn already played back, Ready unlocks and the next turn does not use that plan. Changing the model stops the current plan. If Run is still on and Ready is still waiting, planning starts again with the new model.
- **Not every turn:** with **Events** on (the default) in the Opponent tab's Tool groups, the model is called when an event it's watching or a mandatory trigger fires, and at least every five turns. Otherwise its standing orders run.
````

2. In `doc/how-to-play.md`, find this line. It occurs exactly once:

````markdown
- **Right panel, Opponent tab, below the Tools and Model tabs (AI activity log):** AI interaction lines and errors, including a retry, a line when opponent planning stops, and a one-line copy of each turn update. Starting a new match clears it.
````

Replace it with:

````markdown
- **Right panel, Opponent tab, at the bottom (AI activity log):** AI interaction lines and errors, including a retry, a line when opponent planning stops, and a one-line copy of each turn update. Starting a new match clears it.
````

- [ ] **Step 32: Edit `doc/ai-tools.md`**

Names the Opponent tab's tool groups instead of the Tools tab.

In `doc/ai-tools.md`, find this line. It occurs exactly once:

````markdown
Disabled groups drop those tools from the numbered list and omit the matching briefing/envelope tails (see [variants.md](ai-commander-prompts/variants.md) in the prompt package). A model whose OpenRouter listing does not include `tools` is consulted with every model-callable group off, whatever the Tools tab says; the strategic briefing is still attached, and the Tools tab's Events group still applies ([variants.md](ai-commander-prompts/variants.md) section 2.6).
````

Replace it with:

````markdown
Disabled groups drop those tools from the numbered list and omit the matching briefing/envelope tails (see [variants.md](ai-commander-prompts/variants.md) in the prompt package). A model whose OpenRouter listing does not include `tools` is consulted with every model-callable group off, whatever the Opponent tab's tool groups say; the strategic briefing is still attached, and the Events group still applies ([variants.md](ai-commander-prompts/variants.md) section 2.6).
````

- [ ] **Step 33: Edit `doc/hybrid-ai.md`**

The same.

In `doc/hybrid-ai.md`, find this line. It occurs exactly once:

````markdown
- At most `REQUEST_ORDERS_MAX_TOOL_ROUNDS` (**50**) tool rounds. While the consultation offers at least one tool, every round before the model's first tool call sends `tool_choice: required` and no envelope schema, and every later round sends `tool_choice: auto` with the schema, so the model can submit the envelope or call more tools. A provider that rejects `required` (Amazon Bedrock's Claude endpoint does) is retried once with `auto`, and that model stays on `auto` for the rest of the session; its rounds before the first tool call still carry no schema. A model whose `supported_parameters` lists `tools` but not `tool_choice` gets the tools with no `tool_choice`. A model that does not list `tools` is consulted as if every group of model-callable tools were off, so it cannot submit production orders, memory updates, or standing-order actions; the strategic briefing is still attached, and event-driven consultation still follows the Tools tab's Events group. A consultation with no tools sends neither `tools` nor `tool_choice`, and carries the schema on every round. The repair call still refuses tools.
````

Replace it with:

````markdown
- At most `REQUEST_ORDERS_MAX_TOOL_ROUNDS` (**50**) tool rounds. While the consultation offers at least one tool, every round before the model's first tool call sends `tool_choice: required` and no envelope schema, and every later round sends `tool_choice: auto` with the schema, so the model can submit the envelope or call more tools. A provider that rejects `required` (Amazon Bedrock's Claude endpoint does) is retried once with `auto`, and that model stays on `auto` for the rest of the session; its rounds before the first tool call still carry no schema. A model whose `supported_parameters` lists `tools` but not `tool_choice` gets the tools with no `tool_choice`. A model that does not list `tools` is consulted as if every group of model-callable tools were off, so it cannot submit production orders, memory updates, or standing-order actions; the strategic briefing is still attached, and event-driven consultation still follows the Opponent tab's Events group. A consultation with no tools sends neither `tools` nor `tool_choice`, and carries the schema on every round. The repair call still refuses tools.
````

- [ ] **Step 34: Edit `doc/ai-commander-prompts/variants.md`**

The same.

In `doc/ai-commander-prompts/variants.md`, find this line. It occurs exactly once:

````markdown
When the selected model's OpenRouter listing reports `supported_parameters` without `tools`, the enabled tool-name set is emptied before any surface is built, whatever the Tools tab says. The prompt therefore follows rows 2.1 through 2.4 together, the tool list is empty, and the requests carry neither `tools` nor `tool_choice`. The strategic Commander briefing is still attached, as it is for every strategic consultation, and the consultation policy in section 6 is unchanged. A model missing from the cached list, or listed without `supported_parameters`, is treated as supporting tools.
````

Replace it with:

````markdown
When the selected model's OpenRouter listing reports `supported_parameters` without `tools`, the enabled tool-name set is emptied before any surface is built, whatever the Opponent tab's tool groups say. The prompt therefore follows rows 2.1 through 2.4 together, the tool list is empty, and the requests carry neither `tools` nor `tool_choice`. The strategic Commander briefing is still attached, as it is for every strategic consultation, and the consultation policy in section 6 is unchanged. A model missing from the cached list, or listed without `supported_parameters`, is treated as supporting tools.
````

- [ ] **Step 35: Edit `doc/ui-style-guide.md`**

Names the status dot's colors and fixes two Tools/Run references.

1. In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
**Implemented palette (2.5.0). Map colors live in `src/renderer/core/constants.ts`, except the combat bolt and the casualty mark, which take their colors from the SVGs named below. Panel chrome tokens, and the shared button and field rules, are the `:root` variables in `static/shellChrome.css`. The top bar, the right panel's frame and tab rail, and the game menu are in `static/frameChrome.css`. The right panel's contents, such as the order groups and the rail counts, are in `static/consoleChrome.css`. The selection panel is in `static/selectionChrome.css`. `--selection-mark` (`#f2c14e`) marks what the player has selected. Map overlays and popups are in `static/overlayChrome.css`. Toasts and the new-game box are in `static/feedbackChrome.css`. The dual-theme rows below are a reference. Chrome is already the navy in the live table; those terrain rows are not a second map theme:**
````

Replace it with:

````markdown
**Implemented palette (2.5.0). Map colors live in `src/renderer/core/constants.ts`, except the combat bolt and the casualty mark, which take their colors from the SVGs named below. Panel chrome tokens, and the shared button and field rules, are the `:root` variables in `static/shellChrome.css`. The top bar, the right panel's frame and tab rail, and the game menu are in `static/frameChrome.css`. The right panel's contents, such as the order groups, the rail counts, the Opponent tab's sections, and the footer status line, are in `static/consoleChrome.css`. The selection panel is in `static/selectionChrome.css`. `--selection-mark` (`#f2c14e`) marks what the player has selected. The footer status line's dot uses `--chrome-disabled` while opponent planning is off, `--chrome-accent-edge` while it is on, and `--chrome-opponent-edge` while the opponent plans. Map overlays and popups are in `static/overlayChrome.css`. Toasts and the new-game box are in `static/feedbackChrome.css`. The dual-theme rows below are a reference. Chrome is already the navy in the live table; those terrain rows are not a second map theme:**
````

2. In `doc/ui-style-guide.md`, find these lines. Together they occur exactly once:

````markdown
| Button face / border / hover | `#115e59` / `#7dcec8` / `#3a6a8f` | Every button, styled like Ready, with white text. The Randomize AI home region button keeps the opponent rose. The home-region and starting-month randomize buttons match their dropdowns' height. The model-list refresh button matches the Run button beside it |
| Button off / disabled | `#3b5654` / `#6b8a87` border | Dimmed teal with `#b5c9c7` text for disabled buttons, toggles that are off, and unselected tabs. A disabled Tools-tab toggle also fades |
````

Replace them with:

````markdown
| Button face / border / hover | `#115e59` / `#7dcec8` / `#3a6a8f` | Every button, styled like Ready, with white text. The Randomize AI home region button keeps the opponent rose. The home-region and starting-month randomize buttons match their dropdowns' height. The model-list refresh button matches the model dropdown beside it |
| Button off / disabled | `#3b5654` / `#6b8a87` border | Dimmed teal with `#b5c9c7` text for disabled buttons, toggles that are off, and unselected tabs. A disabled tool-group toggle, or a disabled Run, also fades |
````

## Verify

- [ ] **Step 36: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 37: Full tests**

Run the full tests. Expected: exit 0, test total **869**, failure total **0**.

- [ ] **Step 38: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/shared/opponentPlanningStatus.ts src/shared/opponentPlanningStatus.test.ts src/renderer/openRouter/openRouterUiHelpers.ts src/renderer/openRouter/openRouterControls.ts src/renderer/chrome/consoleFrame.ts src/renderer/chrome/controlTooltipText.ts src/renderer/chrome/frameTooltipText.ts src/renderer/gameplay/tacticalBattlePromptPreference.ts src/renderer/openRouter/modelDescriptionTooltip.ts src/renderer/openRouter/reasoningEffortSelect.ts src/shared/openRouterModelDisplay.ts src/shared/openRouterReasoningEffort.ts src/shared/ipc/gameApiTypes.ts src/shared/ipc/openRouterTypes.ts src/main/openRouter/openRouter.ts src/main/openRouter/buildOpenRouterModelList.ts src/main/openRouter/buildOpenRouterModelList.test.ts src/main/ipc/openRouterIpcHandler.ts static/index.html static/shellChrome.css static/frameChrome.css static/consoleChrome.css scripts/ui-smoke/ui-smoke-console-checks.cjs doc/ux/right-panel-model-tab.md doc/ux/right-panel-tools-tab.md doc/ux/ai-activity-log.md doc/ux/right-panel.md doc/ux/control-tooltips.md doc/ux-specification.md doc/how-to-play.md doc/ai-tools.md doc/hybrid-ai.md doc/ai-commander-prompts/variants.md doc/ui-style-guide.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/shared/opponentPlanningStatus.ts` | `08c7721fc88bfc4f` |
| `src/shared/opponentPlanningStatus.test.ts` | `fd9c2d66f6134f32` |
| `src/renderer/openRouter/openRouterUiHelpers.ts` | `3009e8005651b2e4` |
| `src/renderer/openRouter/openRouterControls.ts` | `e1e4e0b0589d8602` |
| `src/renderer/chrome/consoleFrame.ts` | `e1577a0a6dbd867f` |
| `src/renderer/chrome/controlTooltipText.ts` | `5a81331d3cbdec73` |
| `src/renderer/chrome/frameTooltipText.ts` | `1071c21f80461cce` |
| `src/renderer/gameplay/tacticalBattlePromptPreference.ts` | `2137b0bdfc03a70c` |
| `src/renderer/openRouter/modelDescriptionTooltip.ts` | `41f2473e86557a4e` |
| `src/renderer/openRouter/reasoningEffortSelect.ts` | `721c4ac5ac35fbfc` |
| `src/shared/openRouterModelDisplay.ts` | `8968c7c7956f653c` |
| `src/shared/openRouterReasoningEffort.ts` | `92eb213fcfc13854` |
| `src/shared/ipc/gameApiTypes.ts` | `5b9207fe0f827670` |
| `src/shared/ipc/openRouterTypes.ts` | `3bdd947f035bc3ca` |
| `src/main/openRouter/openRouter.ts` | `e08352ab419f4e82` |
| `src/main/openRouter/buildOpenRouterModelList.ts` | `1e96dcb6ea0cd2fe` |
| `src/main/openRouter/buildOpenRouterModelList.test.ts` | `00bec44eafc0863b` |
| `src/main/ipc/openRouterIpcHandler.ts` | `eb7433c190e02a04` |
| `static/index.html` | `1cc15aad30d0275c` |
| `static/shellChrome.css` | `bc89de0d4bba2f3c` |
| `static/frameChrome.css` | `07e3a520809a28e7` |
| `static/consoleChrome.css` | `b6613272ec3b426c` |
| `scripts/ui-smoke/ui-smoke-console-checks.cjs` | `d3395b8f1fdddd8e` |
| `doc/ux/right-panel-model-tab.md` | `de229204985cac21` |
| `doc/ux/right-panel-tools-tab.md` | `334835df873c54e4` |
| `doc/ux/ai-activity-log.md` | `dcefe04692cedf02` |
| `doc/ux/right-panel.md` | `19049aae5b38dec3` |
| `doc/ux/control-tooltips.md` | `1a502612922f0508` |
| `doc/ux-specification.md` | `51f865ec180a293a` |
| `doc/how-to-play.md` | `d882b8f149be2ec0` |
| `doc/ai-tools.md` | `7e8c7b0c30e12a08` |
| `doc/hybrid-ai.md` | `afcf4fb8ed5fe0e7` |
| `doc/ai-commander-prompts/variants.md` | `c87783905b6b9c96` |
| `doc/ui-style-guide.md` | `10fd9b4760755939` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.


- [ ] **Step 39: Smoke run**

```powershell
npm run ui:smoke -- --label opponent-tab
```

Expected summary line:

```text
ui-smoke opponent-tab: 296 passed, 0 failed, 0 page errors, 29 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\opponent-tab
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/opponent-tab/report.json`.

- [ ] **Step 40: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/opponent-tab/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Three differences are expected: the expected images were made without map tiles, so their basemap is plain grey; they can show a "map tiles failed to load" toast; and that toast is filed as a Notice, so the Reports rail badge can include it. The small origin flags beside unit names can also differ from run to run. Combat is also rolled, so scenes after the played turn can differ in their losses and readouts, and the battle's units are placed when it opens, so the battle screenshot can differ in where they stand. The first three images named below come before that turn.

- `05-opponent-tab.png` against [ui-facelift-console-5-expected-opponent.png](ui-facelift-console-5-expected-opponent.png): The header reads "Opponent" and "Northern Africa". Then a dimmed Run and "Opponent planning is off."; COMMANDER with the API key field and $0.00, the model list with the refresh button, and Reasoning; TOOL GROUPS with "uses since last Ready" and eight groups in two columns; and ACTIVITY LOG filling the rest. Above Ready: a grey dot, "Opponent planning off · No model", and $0.00 at the right.
- `02-strategic-1280x720.png` against [ui-facelift-console-5-expected-strategic.png](ui-facelift-console-5-expected-strategic.png): The Orders tab, with the same status line above Ready.
- `07-console-collapsed.png` against [ui-facelift-console-5-expected-collapsed.png](ui-facelift-console-5-expected-collapsed.png): The collapsed console: only the rail and the small Ready show. The status line is hidden.
- `22-battle-start.png` against [ui-facelift-console-5-expected-battle.png](ui-facelift-console-5-expected-battle.png): The battle, after the app restarts: the date block reads "Beat 1 · Tactical planning", and the same status line sits above Ready: a grey dot, "Opponent planning off · No model", and $0.00.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 37.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 40.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. Enter your API key and choose a model: the status line shows the model's name without its price, and Run becomes available.
2. Turn Run on: the Opponent tab stays shown, and the sentence reads "Opponent planning is on." While Ready reads "AI:", the line reads "Opponent planning…" with a rose dot. When the plan arrives, it reads "Opponent planning on" with a teal dot.
3. Switch to Orders while the opponent plans: the status line still shows the state. After the consultation, the cost on the line and in Commander match.
4. Turn Run off: "Opponent planning off" with a grey dot.
5. Turn a tool group off and on: it toggles as before, and the counts update after Ready.
6. At the 800 × 600 minimum window, the status line stays on one line, and a long model name ends in "…".
7. Choose New game… and start a match: the cost on the line and in Commander reset to $0.00.

## Next

This completes the spec's Phase 3. Keep the `.test/ui-smoke/opponent-tab/` screenshots: the plan for the next phase compares against them.
