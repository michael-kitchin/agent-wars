# UI Facelift Console, Plan 4 of 5: Reports Tab and Toast Band

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Add the Reports tab. It keeps every turn report, opponent message, and notice the map toasts showed during the match, newest first, and its rail tab shows how many are unread. Move both map toasts into one band at the top centre of the map. Make "1 unit deployed" and "1 hex lost" singular.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 4 of the five that build the spec's Phase 3; [ui-facelift-console-execution-plan.md](ui-facelift-console-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- `src/shared/consoleReportLog.ts`: the three kinds (Turn report, Message, Notice), the 200-entry limit, and the tag ("T7", or "B2" in a battle). Unit-tested.
- `src/renderer/chrome/consoleReports.ts`: the list. An entry copies the shown toast's text, so its flags and layout match the toast. Error toasts are not filed.
- A turn report is tagged with the turn it covers: Ready reads the tag before the turn resolves. The standing-orders and unknown-battle notices that the same Ready raises take that tag too. Other messages and notices use the current turn or beat.
- Turn reports carry a disabled Replay placeholder. An entry is unread until the Reports tab is shown. A new match clears the list.
- The band, `#map-toast-band`, sits 12 px below the map's top. It is centred in the space from 224 px right of the map's left edge (clear of the minimap) to 12 px short of its right edge, and is at most 560 px wide. The AI strategy toast sits above the map toast.
- The smoke run plays one turn with Ready at the 800 × 600 minimum, then opens the Reports tab. In its second session it plays the battle's first beat, which must file a turn report tagged B1. The Reports tab must not still list a turn report after the app restarts, and a new match must not still list entries from the previous match. A toast shown once the app is up, such as a basemap failure, can file a new Notice. No API key is set, so the opponent uses standing orders and no model is called.

**Out of scope:**

- The Opponent tab (plan 5).
- Replay itself. It stays a placeholder.

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

1. [ui-facelift-spec.md](ui-facelift-spec.md): Reports tab.
2. `doc/ux/notifications-and-feedback.md` and `doc/ux/ai-activity-log.md`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files. Then:

```powershell
Test-Path src/shared/selectionPanelSize.ts
Test-Path src/renderer/chrome/consoleReports.ts
```

Expected: `True`, then `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **862**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/shared/consoleReportLog.ts`
- `src/shared/consoleReportLog.test.ts`
- `src/shared/consolidatedTurnUpdateToast.ts`
- `src/shared/consolidatedTurnUpdateToast.test.ts`
- `src/renderer/chrome/consoleReports.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts`
- `src/renderer/gameplay/readyResolutionAnnouncements.ts`
- `src/renderer/gameplay/readyHandler.ts`
- `src/renderer/gameplay/readyTacticalCommit.ts`
- `src/renderer/gameplay/newGame.ts`
- `src/renderer/chrome/consoleFrame.ts`
- `src/renderer/chrome/frameTooltipText.ts`
- `static/index.html`
- `static/feedbackChrome.css`
- `static/consoleChrome.css`
- `scripts/ui-smoke/ui-smoke-checks.cjs`
- `scripts/ui-smoke/ui-smoke-scenes.cjs`
- `scripts/ui-smoke/ui-smoke-map.cjs`
- `scripts/ui-smoke/ui-smoke-console-checks.cjs`
- `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`
- `scripts/ui-smoke/ui-smoke.cjs`
- `doc/ux/reports-tab.md`
- `doc/ux/notifications-and-feedback.md`
- `doc/ux/right-panel.md`
- `doc/ux/ai-activity-log.md`
- `doc/ux/new-game-dialog.md`
- `doc/ux/control-tooltips.md`
- `doc/ux-specification.md`
- `doc/ui-style-guide.md`
- `doc/how-to-play.md`

- [ ] **Step 1: Create `src/shared/consoleReportLog.ts`**

The Reports tab's fixed parts: the three kinds and their labels, the 200-entry limit, and the tag ("T7", or "B2" in a battle).

Create `src/shared/consoleReportLog.ts` with exactly this content:

```ts
/**
 * The kinds of Reports entry. This module holds the words and tags of the console's Reports tab, so every entry is
 * named the same way everywhere.
 *
 * Purpose: A turn update, the opponent's message, and any other informational toast are filed apart.
 * When to use: When filing a toast.
 * Expected outcome: `turn` for the turn or beat update, `message` for the opponent's message and strategy, and
 *   `notice` for other informational toasts.
 * Exceptions: None.
 */
export type ConsoleReportKind = 'turn' | 'message' | 'notice';

/**
 * The label each kind shows.
 *
 * Purpose: Entries name their kind in the player's words.
 * When to use: Beside an entry's tag.
 * Expected outcome: Turn report, Message, or Notice.
 * Exceptions: None.
 */
export const CONSOLE_REPORT_KIND_LABELS: Readonly<Record<ConsoleReportKind, string>> = Object.freeze({
  turn: 'Turn report',
  message: 'Message',
  notice: 'Notice',
});

/**
 * The most entries the Reports tab keeps.
 *
 * Purpose: A long match must not grow the list without limit.
 * When to use: After filing an entry.
 * Expected outcome: The oldest entries are dropped past this count.
 * Exceptions: None.
 */
export const MAX_CONSOLE_REPORTS = 200;

/**
 * Formats an entry's tag from a turn number or a battle beat.
 *
 * Purpose: Says when an entry happened, the way the top bar counts turns and beats.
 * When to use: Pass the battle's beat during a battle, otherwise null, and the strategic turn number.
 * Expected outcome: `B2` for a beat, `T7` for a turn, or an empty string when neither is known.
 * Exceptions: None.
 */
export function formatConsoleReportTag(turnNumber: number | null, battleBeat: number | null): string {
  if (battleBeat != null) return `B${battleBeat}`;
  if (turnNumber != null) return `T${turnNumber}`;
  return '';
}
```

- [ ] **Step 2: Create `src/shared/consoleReportLog.test.ts`**

Covers the labels and both tag forms.

Create `src/shared/consoleReportLog.test.ts` with exactly this content:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSOLE_REPORT_KIND_LABELS, formatConsoleReportTag } from './consoleReportLog';

test('formatConsoleReportTag names the beat in a battle and the turn otherwise', () => {
  assert.equal(formatConsoleReportTag(7, null), 'T7');
  assert.equal(formatConsoleReportTag(7, 2), 'B2');
  assert.equal(formatConsoleReportTag(null, null), '');
});

test('CONSOLE_REPORT_KIND_LABELS names each kind', () => {
  assert.deepEqual(CONSOLE_REPORT_KIND_LABELS, { turn: 'Turn report', message: 'Message', notice: 'Notice' });
});
```

- [ ] **Step 3: Edit `src/shared/consolidatedTurnUpdateToast.ts`**

Two text fixes that become permanent once reports are kept: "1 unit deployed" and "1 hex lost" are singular.

1. In `src/shared/consolidatedTurnUpdateToast.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: Human-readable counts by type or null when nothing deployed.
```

Replace it with:

```ts
 * Expected outcome: Human-readable counts by type or null when nothing deployed. The noun is "unit" when exactly
 *   one unit deployed in all, and "units" otherwise.
```

2. In `src/shared/consolidatedTurnUpdateToast.ts`, find these lines. Together they occur exactly once:

```ts
  if (parts.length === 1) return `${parts[0]} units deployed`;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]} units deployed`;
  if (parts.length === 3) return `${parts[0]}, ${parts[1]}, and ${parts[2]} units deployed`;
  return `${parts[0]}, ${parts[1]}, ${parts[2]}, and ${parts[3]} units deployed`;
```

Replace them with:

```ts
  const total = (deployed.armor ?? 0) + (deployed.infantry ?? 0) + (deployed.naval ?? 0) + (deployed.air ?? 0);
  const noun = total === 1 ? 'unit' : 'units';
  if (parts.length === 1) return `${parts[0]} ${noun} deployed`;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]} ${noun} deployed`;
  if (parts.length === 3) return `${parts[0]}, ${parts[1]}, and ${parts[2]} ${noun} deployed`;
  return `${parts[0]}, ${parts[1]}, ${parts[2]}, and ${parts[3]} ${noun} deployed`;
```

3. In `src/shared/consolidatedTurnUpdateToast.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: Plain strings without leading bullets.
```

Replace it with:

```ts
 * Expected outcome: Plain strings without leading bullets. A count of one uses the singular noun.
```

4. In `src/shared/consolidatedTurnUpdateToast.ts`, find these lines. Together they occur exactly once:

```ts
  if ((readyResult.humanHexesLostCount ?? 0) > 0) {
    lines.push(`${readyResult.humanHexesLostCount!.toLocaleString()} hexes lost to opponent`);
```

Replace them with:

```ts
  const hexesLost = readyResult.humanHexesLostCount ?? 0;
  if (hexesLost > 0) {
    lines.push(`${hexesLost.toLocaleString()} ${hexesLost === 1 ? 'hex' : 'hexes'} lost to opponent`);
```

- [ ] **Step 4: Create `src/shared/consolidatedTurnUpdateToast.test.ts`**

Covers the singular and plural forms.

Create `src/shared/consolidatedTurnUpdateToast.test.ts` with exactly this content:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOtherTurnUpdatePrimaryLines } from './consolidatedTurnUpdateToast';

test('buildOtherTurnUpdatePrimaryLines uses the singular for one unit and one hex', () => {
  assert.deepEqual(
    buildOtherTurnUpdatePrimaryLines({ success: true, deployedUnitsByType: { infantry: 1 }, humanHexesLostCount: 1 }),
    ['1 infantry unit deployed', '1 hex lost to opponent']
  );
});

test('buildOtherTurnUpdatePrimaryLines uses the plural for more than one', () => {
  assert.deepEqual(
    buildOtherTurnUpdatePrimaryLines({ success: true, deployedUnitsByType: { armor: 1, infantry: 1 }, humanHexesLostCount: 3 }),
    ['1 armor and 1 infantry units deployed', '3 hexes lost to opponent']
  );
  assert.deepEqual(buildOtherTurnUpdatePrimaryLines({ success: true, deployedUnitsByType: { naval: 2 } }), ['2 naval units deployed']);
});
```

- [ ] **Step 5: Create `src/renderer/chrome/consoleReports.ts`**

Keeps the reports: it copies a shown toast's text into a new entry at the top, counts entries not yet seen, and clears the list for a new match.

Create `src/renderer/chrome/consoleReports.ts` with exactly this content:

```ts
/**
 * The console's Reports tab: a list of what the two map toasts showed during this match, newest first.
 *
 * Toasts file themselves here when they show. Errors are not filed. The list is not saved, and it clears when a new
 * match starts.
 */
import {
  CONSOLE_REPORT_KIND_LABELS,
  formatConsoleReportTag,
  MAX_CONSOLE_REPORTS,
  type ConsoleReportKind,
} from '../../shared/consoleReportLog';
import { rendererSharedState as S } from '../core/state';
import { unavailableTooltipText } from './frameTooltipText';

/**
 * Entries filed while the Reports tab was not on screen.
 *
 * Purpose: The rail badge shows this number.
 * When to use: Changed only inside this module.
 * Expected outcome: Zero while the tab is shown.
 * Exceptions: None.
 */
let unreadCount = 0;

/**
 * Whether the Reports tab is on screen: selected, with the console expanded.
 *
 * Purpose: Entries filed while the player is looking are not unread.
 * When to use: Set by `setConsoleReportsVisible`.
 * Expected outcome: Starts false; the console opens on Orders.
 * Exceptions: None.
 */
let reportsVisible = false;

/**
 * Callbacks run after the entries or the unread count change.
 *
 * Purpose: The console header redraws the rail badge.
 * When to use: Added by `onConsoleReportsChanged`.
 * Expected outcome: Each runs once per change.
 * Exceptions: None.
 */
const listeners: Array<() => void> = [];

/**
 * Runs every listener.
 *
 * Purpose: One place that announces a change.
 * When to use: After any change to the entries or the unread count.
 * Expected outcome: Each listener runs once.
 * Exceptions: A listener that throws stops the later listeners.
 */
function notifyReportsChanged(): void {
  for (const listener of listeners) listener();
}

/**
 * Shows the empty-list sentence only while the list has no entries.
 *
 * Purpose: An empty Reports tab says so instead of showing a blank panel.
 * When to use: After entries are added or cleared.
 * Expected outcome: `#reports-empty` is hidden exactly when `#reports-list` has an entry.
 * Exceptions: None.
 */
function syncReportsEmptyState(list: HTMLElement): void {
  document.getElementById('reports-empty')?.toggleAttribute('hidden', list.childElementCount > 0);
}

/**
 * Builds the disabled Replay placeholder on a turn report.
 *
 * Purpose: Marks where replaying a turn will live, without offering it in this version.
 * When to use: Once per turn report entry.
 * Expected outcome: A disabled button inside a tip host that says Replay is not available.
 * Exceptions: None.
 */
function createReplayPlaceholder(): HTMLElement {
  const host = document.createElement('span');
  host.className = 'control-tooltip-host console-report-replay-host';
  host.setAttribute('data-control-tooltip', unavailableTooltipText('Replay'));
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'console-report-replay';
  button.disabled = true;
  button.textContent = 'Replay';
  host.append(button);
  return host;
}

/**
 * Returns the tag for an entry filed now: the current beat during a battle, otherwise the current turn.
 *
 * Purpose: Messages and notices are tagged with when they arrived.
 * When to use: When a toast is filed without a tag of its own.
 * Expected outcome: For example `T7` or `B2`; empty before a match is loaded.
 * Exceptions: None.
 */
export function currentConsoleReportTag(): string {
  const battle = S.tacticalBattleSnapshot;
  return formatConsoleReportTag(S.gameState?.turnNumber ?? null, battle ? battle.tacticalTurnNumber : null);
}

/**
 * Files one toast's content at the top of the Reports tab.
 *
 * Purpose: Keeps what a toast showed after the toast hides.
 * When to use: Right after a map toast or the AI strategy toast is filled. `body` is the toast's text element;
 *   it is copied, not moved.
 * Expected outcome: A new first entry with the tag, the kind, and a copy of the toast's text. A turn report also
 *   gets a disabled Replay placeholder. The entry is marked new until the player next leaves the Reports tab, and
 *   counts as unread unless the tab is on screen. Past `MAX_CONSOLE_REPORTS` the oldest entry is dropped.
 * Exceptions: None; a missing list files nothing.
 */
export function recordConsoleReport(kind: ConsoleReportKind, tag: string, body: HTMLElement): void {
  const list = document.getElementById('reports-list');
  if (!list) return;
  const entry = document.createElement('li');
  entry.className = `console-report console-report-${kind}`;
  entry.dataset.fresh = 'true';
  const head = document.createElement('div');
  head.className = 'console-report-head';
  if (tag) {
    const tagEl = document.createElement('span');
    tagEl.className = 'console-report-tag';
    tagEl.textContent = tag;
    head.append(tagEl);
  }
  const kindEl = document.createElement('span');
  kindEl.className = 'console-report-kind';
  kindEl.textContent = CONSOLE_REPORT_KIND_LABELS[kind];
  head.append(kindEl);
  if (kind === 'turn') head.append(createReplayPlaceholder());
  const content = document.createElement('div');
  content.className = 'console-report-body';
  content.append(...Array.from(body.cloneNode(true).childNodes));
  entry.append(head, content);
  list.prepend(entry);
  while (list.childElementCount > MAX_CONSOLE_REPORTS) list.lastElementChild?.remove();
  syncReportsEmptyState(list);
  // An entry dropped past the limit no longer counts, so the badge never exceeds the entries listed.
  if (!reportsVisible) unreadCount = Math.min(unreadCount + 1, list.childElementCount);
  notifyReportsChanged();
}

/**
 * Counts entries filed since the Reports tab was last on screen.
 *
 * Purpose: The Reports rail badge shows this number.
 * When to use: When the console header is drawn.
 * Expected outcome: Zero while the tab is shown.
 * Exceptions: None.
 */
export function unreadConsoleReportCount(): number {
  return unreadCount;
}

/**
 * Records whether the Reports tab is on screen.
 *
 * Purpose: Showing the tab reads every entry; leaving it clears the new-entry marks.
 * When to use: From the console each time its tab or collapsed state changes.
 * Expected outcome: Becoming visible sets the unread count to zero. Becoming hidden removes the new-entry marks, so
 *   the next visit marks only entries filed after this one. No change does nothing.
 * Exceptions: None.
 */
export function setConsoleReportsVisible(visible: boolean): void {
  if (visible === reportsVisible) return;
  reportsVisible = visible;
  if (visible) unreadCount = 0;
  else document.querySelectorAll('#reports-list [data-fresh]').forEach((entry) => entry.removeAttribute('data-fresh'));
  notifyReportsChanged();
}

/**
 * Empties the Reports tab for a new match.
 *
 * Purpose: Reports belong to one match, as the AI activity log does.
 * When to use: After a new match starts successfully, next to clearing the AI activity log.
 * Expected outcome: No entries, the empty-list sentence, and no unread count.
 * Exceptions: None.
 */
export function clearConsoleReports(): void {
  const list = document.getElementById('reports-list');
  list?.replaceChildren();
  if (list) syncReportsEmptyState(list);
  unreadCount = 0;
  notifyReportsChanged();
}

/**
 * Adds a callback that runs whenever the entries or the unread count change.
 *
 * Purpose: Keeps the rail badge in step without this module knowing the console.
 * When to use: Once, during renderer startup.
 * Expected outcome: The callback runs after every later change.
 * Exceptions: None.
 */
export function onConsoleReportsChanged(listener: () => void): void {
  listeners.push(listener);
}
```

- [ ] **Step 6: Edit `src/renderer/openRouter/openRouterUiHelpers.ts`**

An informational map toast is filed as a turn report or a notice, and every shown AI strategy toast is filed as a message. Error toasts are not filed.

1. In `src/renderer/openRouter/openRouterUiHelpers.ts`, find this line. It occurs exactly once:

```ts
import { resolveToolInvocationCountsAfterReady } from '../../shared/openRouterToolInvocationCounts';
```

Replace it with:

```ts
import { resolveToolInvocationCountsAfterReady } from '../../shared/openRouterToolInvocationCounts';
import { currentConsoleReportTag, recordConsoleReport } from '../chrome/consoleReports';
```

2. In `src/renderer/openRouter/openRouterUiHelpers.ts`, find this line. It occurs exactly once:

```ts
  readonly unitOriginByDisplayName?: ReadonlyMap<string, LossFlagIdentity>;
```

Replace it with:

```ts
  readonly unitOriginByDisplayName?: ReadonlyMap<string, LossFlagIdentity>;
  /**
   * How the Reports tab files this toast.
   *
   * Contract: Read only when `isError` is false; error toasts are never filed.
   * When to use: Pass `{ kind: 'turn', tag }` for a turn or beat update, with the tag of the turn or beat it reports
   *   on. Pass a notice with a tag to file a notice under a turn other than the current one.
   * Expected outcome: Omitted, an informational toast is filed as a Notice tagged with the current turn or beat.
   * Exceptions: None.
   */
  readonly report?: { readonly kind: 'turn' | 'notice'; readonly tag: string };
```

3. In `src/renderer/openRouter/openRouterUiHelpers.ts`, find this line. It occurs exactly once:

```ts
 * Shows the lower-right map toast with a sectioned, bulleted message, replacing any toast already shown.
```

Replace it with:

```ts
 * Shows the map toast with a sectioned, bulleted message, replacing any toast already shown.
```

4. In `src/renderer/openRouter/openRouterUiHelpers.ts`, find this line. It occurs exactly once:

```ts
 *   duration. `options.unitOriginByDisplayName` adds flags before named loss victims.
```

Replace it with:

```ts
 *   duration. `options.unitOriginByDisplayName` adds flags before named loss victims. An informational toast
 *   (`isError: false`) is also filed on the Reports tab, as `options.report` says.
```

5. In `src/renderer/openRouter/openRouterUiHelpers.ts`, find these lines. Together they occur exactly once:

```ts
      options?.isError === false
    );
  }
```

Replace them with:

```ts
      options?.isError === false
    );
    if (options?.isError === false) {
      recordConsoleReport(options.report?.kind ?? 'notice', options.report?.tag ?? currentConsoleReportTag(), textEl);
    }
  }
```

6. In `src/renderer/openRouter/openRouterUiHelpers.ts`, find these lines. Together they occur exactly once:

```ts
 * Shows the upper-right toast with Message then Strategy sections, or hides it when both are empty.
 *
 * Purpose: Surfaces the opponent's taunt/threat and plan summary after consultation.
 * When to use: After Ready, tactical commit, deferred consult push, or tactical prefetch.
 * Expected outcome: Bold section titles matching the lower-right toast; plain (non-bulleted) body text; empty sections omitted; both empty hides a stale toast.
```

Replace them with:

```ts
 * Shows the AI strategy toast with Message then Strategy sections, or hides it when both are empty.
 *
 * Purpose: Surfaces the opponent's taunt/threat and plan summary after consultation.
 * When to use: After Ready, tactical commit, deferred consult push, or tactical prefetch.
 * Expected outcome: Bold section titles matching the map toast; plain (non-bulleted) body text; empty sections
 *   omitted; both empty hides a stale toast. A shown toast is also filed on the Reports tab as a Message tagged with
 *   the current turn or beat.
```

7. In `src/renderer/openRouter/openRouterUiHelpers.ts`, find these lines. Together they occur exactly once:

```ts
      true
    );
  }
  S.aiStrategyToastHideTimer = setTimeout(() => {
```

Replace them with:

```ts
      true
    );
    recordConsoleReport('message', currentConsoleReportTag(), textEl);
  }
  S.aiStrategyToastHideTimer = setTimeout(() => {
```

8. In `src/renderer/openRouter/openRouterUiHelpers.ts`, find this line. It occurs exactly once:

```ts
 * Dismisses the lower-right map toast and upper-right AI strategy toast together.
```

Replace it with:

```ts
 * Dismisses the map toast and the AI strategy toast together.
```

- [ ] **Step 7: Edit `src/renderer/gameplay/readyResolutionAnnouncements.ts`**

Passes the turn report's tag through.

1. In `src/renderer/gameplay/readyResolutionAnnouncements.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: One update toast and log line when there is text, then an unknown-battle toast when any unknown hex or victim remains.
```

Replace it with:

```ts
 *   Pass `reportTag`, the tag of the turn or beat that just resolved, captured before Ready resolved it.
 * Expected outcome: One update toast and log line when there is text, then an unknown-battle toast when any unknown
 *   hex or victim remains. The Reports tab files them as a Turn report and a Notice under `reportTag`.
```

2. In `src/renderer/gameplay/readyResolutionAnnouncements.ts`, find this line. It occurs exactly once:

```ts
    killToastFormatter: ReturnType<ReadyHandlerDeps['buildKillToastFormatterBundle']>;
```

Replace it with:

```ts
    killToastFormatter: ReturnType<ReadyHandlerDeps['buildKillToastFormatterBundle']>;
    reportTag: string;
```

3. In `src/renderer/gameplay/readyResolutionAnnouncements.ts`, find this line. It occurs exactly once:

```ts
  const { readySlice, visibility, killToastFormatter, extraKills } = args;
```

Replace it with:

```ts
  const { readySlice, visibility, killToastFormatter, extraKills, reportTag } = args;
```

4. In `src/renderer/gameplay/readyResolutionAnnouncements.ts`, find this line. It occurs exactly once:

```ts
    deps.showMapToast(updateText, { isError: false, unitOriginByDisplayName });
```

Replace it with:

```ts
    deps.showMapToast(updateText, { isError: false, unitOriginByDisplayName, report: { kind: 'turn', tag: reportTag } });
```

5. In `src/renderer/gameplay/readyResolutionAnnouncements.ts`, find this line. It occurs exactly once:

```ts
    deps.showMapToast(deps.formatUnknownBattleAnnouncement(unknownContinentNames), { isError: false });
```

Replace it with:

```ts
    deps.showMapToast(deps.formatUnknownBattleAnnouncement(unknownContinentNames), {
      isError: false,
      report: { kind: 'notice', tag: reportTag },
    });
```

- [ ] **Step 8: Edit `src/renderer/gameplay/readyHandler.ts`**

Reads the tag before the turn resolves, so a turn report names the turn it covers, not the next one.

1. In `src/renderer/gameplay/readyHandler.ts`, find this line. It occurs exactly once:

```ts
import type { GameReadyIpcPayload, GameStateSnapshot } from '../../shared/ipcTypes';
```

Replace it with:

```ts
import type { GameReadyIpcPayload, GameStateSnapshot } from '../../shared/ipcTypes';
import { currentConsoleReportTag } from '../chrome/consoleReports';
```

2. In `src/renderer/gameplay/readyHandler.ts`, find these lines. Together they occur exactly once:

```ts
    })) return;
    const hasPendingDraftOrders =
```

Replace them with:

```ts
    })) return;
    // The turn this Ready resolves; its reports are filed under it after the snapshot moves on to the next turn.
    const turnReportTag = currentConsoleReportTag();
    const hasPendingDraftOrders =
```

3. In `src/renderer/gameplay/readyHandler.ts`, find this line. It occurs exactly once:

```ts
      deps.showMapToast('AI: standing orders only (no consultation).', { isError: false });
```

Replace it with:

```ts
      deps.showMapToast('AI: standing orders only (no consultation).', {
        isError: false,
        report: { kind: 'notice', tag: turnReportTag },
      });
```

4. In `src/renderer/gameplay/readyHandler.ts`, find this line. It occurs exactly once:

```ts
          killToastFormatter,
```

Replace it with:

```ts
          killToastFormatter,
          reportTag: turnReportTag,
```

- [ ] **Step 9: Edit `src/renderer/gameplay/readyTacticalCommit.ts`**

The same for a battle beat.

1. In `src/renderer/gameplay/readyTacticalCommit.ts`, find this line. It occurs exactly once:

```ts
import type { CommitHumanTacticalDraftOrdersIpcResult, GameStateSnapshot } from '../../shared/ipcTypes';
```

Replace it with:

```ts
import type { CommitHumanTacticalDraftOrdersIpcResult, GameStateSnapshot } from '../../shared/ipcTypes';
import { currentConsoleReportTag } from '../chrome/consoleReports';
```

2. In `src/renderer/gameplay/readyTacticalCommit.ts`, find this line. It occurs exactly once:

```ts
  if (!window.gameApi) return true;
```

Replace it with:

```ts
  if (!window.gameApi) return true;
  // The beat this commit resolves; its reports are filed under it after the battle moves on to the next beat.
  const beatReportTag = currentConsoleReportTag();
```

3. In `src/renderer/gameplay/readyTacticalCommit.ts`, find this line. It occurs exactly once:

```ts
        killToastFormatter,
```

Replace it with:

```ts
        killToastFormatter,
        reportTag: beatReportTag,
```

- [ ] **Step 10: Edit `src/renderer/gameplay/newGame.ts`**

A new match clears the reports.

1. In `src/renderer/gameplay/newGame.ts`, find this line. It occurs exactly once:

```ts
import { clearOpenRouterLog } from '../openRouter/openRouterUiHelpers';
```

Replace it with:

```ts
import { clearOpenRouterLog } from '../openRouter/openRouterUiHelpers';
import { clearConsoleReports } from '../chrome/consoleReports';
```

2. In `src/renderer/gameplay/newGame.ts`, find this line. It occurs exactly once:

```ts
      clearOpenRouterLog();
```

Replace it with:

```ts
      clearOpenRouterLog();
      clearConsoleReports();
```

- [ ] **Step 11: Edit `src/renderer/chrome/consoleFrame.ts`**

Adds the Reports tab, its subtitle "this match", and its unread badge.

1. In `src/renderer/chrome/consoleFrame.ts`, find this line. It occurs exactly once:

```ts
import { scrollOpenRouterLogToEnd } from '../openRouter/openRouterUiHelpers';
```

Replace it with:

```ts
import { scrollOpenRouterLogToEnd } from '../openRouter/openRouterUiHelpers';
import { onConsoleReportsChanged, setConsoleReportsVisible, unreadConsoleReportCount } from './consoleReports';
```

2. In `src/renderer/chrome/consoleFrame.ts`, find this line. It occurs exactly once:

```ts
  { tabId: 'console-tab-orders', panelId: 'console-panel-orders', title: 'Orders', subtitle: ordersSubtitle },
```

Replace it with:

```ts
  { tabId: 'console-tab-orders', panelId: 'console-panel-orders', title: 'Orders', subtitle: ordersSubtitle },
  { tabId: 'console-tab-reports', panelId: 'console-panel-reports', title: 'Reports', subtitle: () => 'this match' },
```

3. In `src/renderer/chrome/consoleFrame.ts`, find these lines. Together they occur exactly once:

```ts
 * Expected outcome: `#console-subtitle` shows the active tab's subtitle, and the Orders badge shows the number of
 *   queued orders.
```

Replace them with:

```ts
 * Expected outcome: `#console-subtitle` shows the active tab's subtitle. The Orders badge shows the number of
 *   queued orders, and the Reports badge the number of unread reports.
```

4. In `src/renderer/chrome/consoleFrame.ts`, find this line. It occurs exactly once:

```ts
  setRailBadge('console-tab-orders-badge', queuedOrderCount());
```

Replace it with:

```ts
  setRailBadge('console-tab-orders-badge', queuedOrderCount());
  setRailBadge('console-tab-reports-badge', unreadConsoleReportCount());
```

5. In `src/renderer/chrome/consoleFrame.ts`, find these lines. Together they occur exactly once:

```ts
 *   `data-collapsed="true"` or `"false"`. While expanded, the active tab's `onShow` runs. The map resizes on its
 *   own through its resize observer.
```

Replace them with:

```ts
 *   `data-collapsed="true"` or `"false"`. The Reports tab learns whether it is on screen. While expanded, the active
 *   tab's `onShow` runs. The map resizes on its own through its resize observer.
```

6. In `src/renderer/chrome/consoleFrame.ts`, find this line. It occurs exactly once:

```ts
  document.getElementById('console-collapse-btn')?.setAttribute('aria-expanded', consoleState.collapsed ? 'false' : 'true');
```

Replace it with:

```ts
  document.getElementById('console-collapse-btn')?.setAttribute('aria-expanded', consoleState.collapsed ? 'false' : 'true');
  setConsoleReportsVisible(!consoleState.collapsed && consoleState.activeTabId === 'console-tab-reports');
```

7. In `src/renderer/chrome/consoleFrame.ts`, find this line. It occurs exactly once:

```ts
 *   and badges follow every change to the queued orders. The console starts expanded on Orders.
```

Replace it with:

```ts
 *   and badges follow every change to the queued orders and the reports. The console starts expanded on Orders.
```

8. In `src/renderer/chrome/consoleFrame.ts`, find this line. It occurs exactly once:

```ts
  onQueuedOrdersChanged(refreshConsoleHeader);
```

Replace it with:

```ts
  onQueuedOrdersChanged(refreshConsoleHeader);
  onConsoleReportsChanged(refreshConsoleHeader);
```

- [ ] **Step 12: Edit `src/renderer/chrome/frameTooltipText.ts`**

Adds the Reports tab's tip.

In `src/renderer/chrome/frameTooltipText.ts`, find this line. It occurs exactly once:

```ts
export const selectionPanelGripTooltipText = 'Drag to resize this panel. The size lasts until the app closes.';
```

Replace it with:

```ts
export const selectionPanelGripTooltipText = 'Drag to resize this panel. The size lasts until the app closes.';

/**
 * The Reports tab's tip.
 *
 * Purpose: Says what the Reports tab lists.
 * When to use: `#console-tab-reports`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const reportsTabTooltipText = 'Show the turn reports, opponent messages, and notices from this match, newest first.';
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

Adds the Reports tab and its panel, and wraps the two map toasts in one band at the top centre of the map.

1. In `static/index.html`, find these lines. Together they occur exactly once:

```html
    <div id="map-toast" class="map-toast hidden" aria-live="polite">
      <p id="map-toast-text"></p>
      <button type="button" id="map-toast-dismiss" aria-label="Dismiss">×</button>
    </div>
    <div id="ai-strategy-toast" class="map-toast ai-strategy-toast hidden" aria-live="polite">
      <p id="ai-strategy-toast-text"></p>
      <button type="button" id="ai-strategy-toast-dismiss" aria-label="Dismiss">×</button>
```

Replace them with:

```html
    <div id="map-toast-band" class="map-toast-band">
      <div id="ai-strategy-toast" class="map-toast ai-strategy-toast hidden" aria-live="polite">
        <p id="ai-strategy-toast-text"></p>
        <button type="button" id="ai-strategy-toast-dismiss" aria-label="Dismiss">×</button>
      </div>
      <div id="map-toast" class="map-toast hidden" aria-live="polite">
        <p id="map-toast-text"></p>
        <button type="button" id="map-toast-dismiss" aria-label="Dismiss">×</button>
      </div>
```

2. In `static/index.html`, find these lines. Together they occur exactly once:

```html
      </section>
      <section id="console-panel-opponent" class="console-panel" role="tabpanel" aria-labelledby="console-tab-opponent" hidden>
```

Replace them with:

```html
      </section>
      <section id="console-panel-reports" class="console-panel" role="tabpanel" aria-labelledby="console-tab-reports" hidden>
        <p id="reports-empty" class="chrome-muted">No reports yet this match.</p>
        <ol id="reports-list" class="console-report-list"></ol>
      </section>
      <section id="console-panel-opponent" class="console-panel" role="tabpanel" aria-labelledby="console-tab-opponent" hidden>
```

3. In `static/index.html`, find this line. It occurs exactly once:

```html
      <button type="button" id="console-tab-orders" class="console-tab" role="tab" aria-selected="true" aria-controls="console-panel-orders" data-control-tooltip="Show the orders queued for this turn or beat."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 4h9M5 8h9M5 12h9M2 4h.1M2 8h.1M2 12h.1"></path></svg><span>Orders</span><span id="console-tab-orders-badge" class="console-tab-badge" hidden></span></button>
```

Replace it with:

```html
      <button type="button" id="console-tab-orders" class="console-tab" role="tab" aria-selected="true" aria-controls="console-panel-orders" data-control-tooltip="Show the orders queued for this turn or beat."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 4h9M5 8h9M5 12h9M2 4h.1M2 8h.1M2 12h.1"></path></svg><span>Orders</span><span id="console-tab-orders-badge" class="console-tab-badge" hidden></span></button>
      <button type="button" id="console-tab-reports" class="console-tab" role="tab" aria-selected="false" aria-controls="console-panel-reports" data-control-tooltip="Show the turn reports, opponent messages, and notices from this match, newest first."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 9.5l2-6h9l2 6v4h-13zM1.5 9.5h4l1 1.5h3l1-1.5h4"></path></svg><span>Reports</span><span id="console-tab-reports-badge" class="console-tab-badge" hidden></span></button>
```

- [ ] **Step 15: Edit `static/feedbackChrome.css`**

Places the toast band, and removes the old corner positions.

1. In `static/feedbackChrome.css`, find these lines. Together they occur exactly once:

```css
.map-toast {
  position: absolute;
  bottom: 12px;
  right: 12px;
  left: auto;
  max-width: 360px;
```

Replace them with:

```css
/* The two toasts stack in one band at the top centre of the map, right of the minimap's 200 px and its 12 px insets. The band is only as wide as its widest toast, so it does not block the map beside them. */
.map-toast-band {
  position: absolute;
  top: 12px;
  left: 224px;
  right: 12px;
  z-index: 7000;
  width: fit-content;
  max-width: 560px;
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.map-toast {
```

2. In `static/feedbackChrome.css`, find these lines. Together they occur exactly once:

```css
  gap: 0.5rem;
  z-index: 7000;
```

Replace them with:

```css
  gap: 0.5rem;
```

3. In `static/feedbackChrome.css`, delete these lines, including the line break at the end. Together they occur exactly once:

```css
.ai-strategy-toast {
  top: 12px;
  right: 12px;
  left: auto;
  bottom: auto;
  max-width: min(360px, calc(100% - 240px));
  opacity: 1;
}
```

- [ ] **Step 16: Edit `static/consoleChrome.css`**

Styles for the report entries.

In `static/consoleChrome.css`, find these lines. Together they occur exactly once:

```css
  background: var(--chrome-bg-raised);
}
```

Replace them with:

```css
  background: var(--chrome-bg-raised);
}

/* ---------- Reports tab ---------- */
.console-report-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.console-report {
  position: relative;
  padding: 10px 8px;
  border-bottom: 1px solid var(--chrome-divider);
  font-size: 12px;
}
.console-report-message {
  background: color-mix(in srgb, var(--player-opponent) 14%, transparent);
}
/* A gold dot marks entries filed since the player last left this tab. */
.console-report[data-fresh]::after {
  content: "";
  position: absolute;
  top: 14px;
  right: 8px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--selection-mark);
}
.console-report-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  padding-right: 14px;
}
.console-report-tag {
  padding: 1px 5px;
  border: 1px solid var(--chrome-border);
  border-radius: 3px;
  color: var(--chrome-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.console-report-kind {
  font-size: 13px;
  font-weight: 600;
}
.console-report-replay-host {
  margin-left: auto;
}
.console-report-replay {
  padding: 2px 8px;
  font-size: 11px;
}
.console-report-body {
  white-space: pre-line;
  line-height: 1.45;
}
```

- [ ] **Step 17: Edit `scripts/ui-smoke/ui-smoke-checks.cjs`**

The probe also returns the text of every match, for list checks.

1. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
 *   null when the selector matches nothing, otherwise the first match's box, text, and the attributes the checks use.
```

Replace it with:

```js
 *   null when the selector matches nothing, otherwise the first match's box, text, and the attributes the checks use,
 *   plus the text of every match in `allTexts`.
```

2. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find these lines. Together they occur exactly once:

```js
   * Expected outcome: The element's box, whether it is shown, its trimmed text, and selected attributes,
   *   or null when the selector matches nothing.
```

Replace them with:

```js
   * Expected outcome: The first match's box, whether it is shown, its trimmed text, and selected attributes, and the
   *   trimmed text of every match, or null when the selector matches nothing.
```

3. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
      text: (el.textContent || '').trim(),
```

Replace it with:

```js
      text: (el.textContent || '').trim(),
      allTexts: Array.from(document.querySelectorAll(selector), (match) => (match.textContent || '').trim()),
```

- [ ] **Step 18: Edit `scripts/ui-smoke/ui-smoke-scenes.cjs`**

Adds the turn-resolved, Reports, and battle-beat scenes.

1. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find this line. It occurs exactly once:

```js
  smallWindow: 'small-window',
```

Replace it with:

```js
  smallWindow: 'small-window',
  turnResolved: 'turn-resolved',
  reportsTab: 'reports-tab',
```

2. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find this line. It occurs exactly once:

```js
  battleOrders: 'battle-orders',
```

Replace it with:

```js
  battleOrders: 'battle-orders',
  battleBeat: 'battle-beat',
```

- [ ] **Step 19: Edit `scripts/ui-smoke/ui-smoke-map.cjs`**

Two comment updates: the march helper also runs after a played turn, and the battle edit puts every enemy land unit in the hex so the first beat has fighting to report.

1. In `scripts/ui-smoke/ui-smoke-map.cjs`, find this line. It occurs exactly once:

```js
 * Purpose: Gives the Orders tab one movement row to show.
```

Replace it with:

```js
 * Purpose: Gives the Orders tab one movement row to show, at the start of the match or after a played turn.
```

2. In `scripts/ui-smoke/ui-smoke-map.cjs`, find this line. It occurs exactly once:

```js
 *   into the hex where the player has the most land units.
```

Replace it with:

```js
 *   into the hex where the player has the most land units, so the battle's first beat almost always has fighting to
 *   report.
```

- [ ] **Step 20: Edit `scripts/ui-smoke/ui-smoke-console-checks.cjs`**

Adds the toast band, unread badge, Reports panel, and standing-orders notice checks. The toast band must stay right of the minimap.

1. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find this line. It occurs exactly once:

```js
const SELECTION_PANEL_LIMITS = Object.freeze({ minWidth: 320, maxWidth: 640, minHeight: 140, mapMargin: 24 });
```

Replace it with:

```js
const SELECTION_PANEL_LIMITS = Object.freeze({ minWidth: 320, maxWidth: 640, minHeight: 140, mapMargin: 24 });

/**
 * The left edge of the toast band, measured from the map's left edge, in CSS pixels.
 *
 * Purpose: The band starts right of the minimap so a toast never covers it.
 * When to use: The toast band check.
 * Expected outcome: Matches `.map-toast-band` in `static/feedbackChrome.css`.
 * Exceptions: None.
 */
const TOAST_BAND_LEFT = 224;

/**
 * The widest the toast band can be, in CSS pixels.
 *
 * Purpose: Toasts stay readable lines, not banners across the map.
 * When to use: The toast band check.
 * Expected outcome: Matches `.map-toast-band` in `static/feedbackChrome.css`.
 * Exceptions: None.
 */
const TOAST_BAND_MAX_WIDTH = 560;
```

2. In `scripts/ui-smoke/ui-smoke-console-checks.cjs`, find these lines. Together they occur exactly once:

```js
  {
    name: 'selection-cleared-rows',
```

Replace them with:

```js
  {
    name: 'toast-band-top-centre',
    scenes: [SCENES.turnResolved],
    needs: ['#canvas-container', '#map-toast-band', '#map-toast'],
    run: (p, el) => {
      const c = el('#canvas-container');
      const band = el('#map-toast-band');
      const toast = el('#map-toast');
      if (!toast.shown || !toast.ancestorIds.includes('map-toast-band')) return 'the map toast is not shown in the toast band';
      if (!near(band.y, c.y + MAP_OVERLAY_INSET)) return `the toast band is at ${fmt(band)}, expected its top ${MAP_OVERLAY_INSET} px below the map's top`;
      if (band.w > TOAST_BAND_MAX_WIDTH + 1) return `the toast band is ${Math.round(band.w)} wide, more than ${TOAST_BAND_MAX_WIDTH}`;
      if (band.x < c.x + TOAST_BAND_LEFT - 1 || band.x + band.w > c.x + c.w - MAP_OVERLAY_INSET + 1) {
        return `the toast band is at ${fmt(band)}, outside the space right of the minimap on the map ${fmt(c)}`;
      }
      const centre = c.x + (TOAST_BAND_LEFT + c.w - MAP_OVERLAY_INSET) / 2;
      return near(band.x + band.w / 2, centre) ? null : `the toast band is at ${fmt(band)}, expected it centred at x=${Math.round(centre)}`;
    },
  },
  {
    name: 'reports-badge-unread',
    scenes: [SCENES.turnResolved],
    needs: ['#console-tab-reports-badge', '#console-panel-reports'],
    run: (p, el) => {
      const badge = el('#console-tab-reports-badge');
      if (el('#console-panel-reports').shown) return 'the Reports panel is shown before its tab was clicked';
      return badge.shown && /^[1-9]\d*$/.test(badge.text) ? null : `the Reports badge reads "${badge.text}"${badge.shown ? '' : ' and is hidden'}`;
    },
  },
  {
    name: 'reports-tab-shows-panel',
    scenes: [SCENES.reportsTab],
    needs: ['#console-panel-reports', '#console-panel-orders', '#console-title', '#console-subtitle', '#reports-empty', '#console-tab-reports-badge'],
    run: (p, el) => {
      if (!el('#console-panel-reports').shown || el('#console-panel-orders').shown) return 'the Reports panel is not the only panel shown';
      const title = `${el('#console-title').text} / ${el('#console-subtitle').text}`;
      if (title !== 'Reports / this match') return `the header reads "${title}", expected "Reports / this match"`;
      if (el('#reports-empty').shown) return 'the empty-list sentence shows next to entries';
      return el('#console-tab-reports-badge').shown ? 'the Reports badge still shows after the tab was opened' : null;
    },
  },
  {
    name: 'reports-standing-orders-notice',
    scenes: [SCENES.reportsTab],
    needs: ['#reports-list .console-report-notice'],
    run: (p, el) => {
      const notices = el('#reports-list .console-report-notice').allTexts;
      return notices.some((text) => text.startsWith('T1Notice') && text.includes('standing orders only'))
        ? null
        : `no Notice tagged T1 says "standing orders only": ${JSON.stringify(notices)}`;
    },
  },
  {
    name: 'selection-cleared-rows',
```

- [ ] **Step 21: Edit `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`**

Adds the Reports checks of the later scenes: no entry survives a restart, the battle's first beat files a turn report tagged B1, and a new match starts with an empty list.

In `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`, find these lines. Together they occur exactly once:

```js
    },
  },
]);

module.exports = { SCENARIO_CHECKS };
```

Replace them with:

```js
    },
  },
  {
    name: 'reports-after-reopen',
    scenes: [SCENES.matchReopened],
    needs: ['#reports-list'],
    run: (p, el) => (el('#reports-list').text.includes('Turn report') ? 'a turn report from before the app closed is still listed' : null),
  },
  {
    name: 'reports-battle-beat',
    scenes: [SCENES.battleBeat],
    needs: ['#reports-list .console-report-turn'],
    run: (p, el) => {
      const turns = el('#reports-list .console-report-turn').allTexts;
      return turns.some((text) => text.startsWith('B1Turn report')) ? null : `no turn report is tagged B1: ${JSON.stringify(turns)}`;
    },
  },
  {
    name: 'reports-new-match',
    scenes: [SCENES.regionalStart],
    needs: ['#reports-list'],
    run: (p, el) => {
      const text = el('#reports-list').text;
      return text.includes('Turn report') || text.includes('B1') ? 'entries from the previous match are still listed' : null;
    },
  },
]);

module.exports = { SCENARIO_CHECKS };
```

- [ ] **Step 22: Edit `scripts/ui-smoke/ui-smoke.cjs`**

Plays turn 1 with Ready in the small window, then opens the Reports tab and queues a march again for the reopened match. In the second session, plays the battle's first beat. When a turn offers the tactical battles list, the run chooses Ignore.

1. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
 * that folder: the first plays a new global match, the second reopens it with a hex both sides hold, queues an order
 * in a battle there, and starts a regional match, and the third reopens that match after the run marks it as lost.
```

Replace them with:

```js
 * that folder: the first plays a new global match, the second reopens it with a hex both sides hold, plays the first
 * beat of a battle there, and starts a regional match, and the third reopens that match after the run marks it as lost.
```

2. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
 * Purpose: The console's contents and the selection panel must still fit there.
 * When to use: The small-window scene.
```

Replace them with:

```js
 * Purpose: The console's contents, the selection panel, and the toast band must still fit there.
 * When to use: The small-window scene and the turn played after it.
```

3. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
 * Expected outcome: Fixed waits; the checks do not depend on map tiles having loaded.
 * Exceptions: None.
 */
const SETTLE_MS = Object.freeze({ resize: 1500, click: 500, overlay: 2500, start: 2500, tip: 1500 });
```

Replace them with:

```js
 *   `turn` is the longest a played turn or battle beat may take before the run gives up.
 * Expected outcome: Fixed waits; the checks do not depend on map tiles having loaded.
 * Exceptions: None.
 */
const SETTLE_MS = Object.freeze({ resize: 1500, click: 500, overlay: 2500, start: 2500, tip: 1500, turn: 120000 });
```

4. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
/**
 * Chooses the fixed regional scenario on the open new-game overlay and starts the match.
```

Replace them with:

```js
/**
 * Waits until world-map planning is open again after a turn plays, skipping any offered battle.
 *
 * Purpose: A played turn can offer the tactical battles list; the run never fights from it, so it chooses Ignore,
 *   which resolves the fight as a player's Ignore does.
 * When to use: After Ready on the world map, and after leaving a battle.
 * Expected outcome: The top bar reads "Turn N · Planning" and Ready can be clicked.
 * Exceptions: Throws a Playwright timeout when planning does not return within `SETTLE_MS.turn`.
 */
async function waitForWorldPlanning(page) {
  const battlesList = '[role="dialog"][aria-label="Tactical battles"]';
  const deadline = Date.now() + SETTLE_MS.turn;
  while (Date.now() < deadline) {
    const planning = await page.evaluate(() => /^Turn \d+ · Planning$/.test(document.getElementById('topbar-turn-phase')?.textContent || '')
      && document.getElementById('ready-btn')?.disabled === false);
    if (planning) return;
    if (await page.isVisible(battlesList)) await page.click(`${battlesList} button:has-text("Ignore")`);
    await page.waitForTimeout(SETTLE_MS.click);
  }
  throw new Error('world-map planning did not return after the turn');
}

/**
 * Chooses the fixed regional scenario on the open new-game overlay and starts the match.
```

5. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
 * Runs the first session: a new match, the frame scenes, the console scenes, and the small window.
 *
 * Purpose: The scene order is part of the contract with the checks. The match starts after the first scene. Scenes
 *   that select units or queue orders come after the frame scenes, so the frame screenshots show an untouched match.
 *   The session ends with the Orders scene's march still queued, which the reopened match must still show.
```

Replace them with:

```js
 * Runs the first session: a new match, the frame scenes, the console scenes, the small window, and one played turn.
 *
 * Purpose: The scene order is part of the contract with the checks. The match starts after the first scene. Scenes
 *   that select units or queue orders come after the frame scenes, so the frame screenshots show an untouched match.
 *   The session ends with one march queued, which the reopened match must still show.
```

6. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
  await recordScene(page, report, outDir, SCENES.smallWindow);

  await setViewport(app, page, first);
  await page.waitForTimeout(SETTLE_MS.resize);
```

Replace them with:

```js
  await recordScene(page, report, outDir, SCENES.smallWindow);
  // Shrink the panel again, so it cannot cover the units that the march after the turn clicks.
  await dragSelectionPanelGrip(page, -380, 480);

  // Play turn 1 in the small window. With no model, the opponent runs its standing orders and says so in a notice.
  await page.click('#ready-btn');
  await waitForWorldPlanning(page);
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.tip);
  await recordScene(page, report, outDir, SCENES.turnResolved);
  await setViewport(app, page, first);
  await page.waitForTimeout(SETTLE_MS.resize);
  await page.click('#console-tab-reports');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.reportsTab);
  await page.click('#console-tab-orders');

  // Leave one march queued; the reopened match must still list it.
  await queueLoneUnitMarch(page);
```

7. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
  await recordScene(page, report, outDir, SCENES.battleOrders);
```

Replace it with:

```js
  await recordScene(page, report, outDir, SCENES.battleOrders);

  // Play beat 1. If one side is wiped out, close the result; the world-map turn then plays.
  await page.click('#ready-btn');
  const annihilation = '#tactical-annihilation-overlay:not(.hidden)';
  await page.waitForFunction((selector) => document.querySelector(selector) !== null
    || (document.getElementById('topbar-turn-phase')?.textContent === 'Beat 2 · Tactical planning'
      && document.getElementById('ready-btn')?.disabled === false), annihilation, { timeout: SETTLE_MS.turn });
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.tip);
  await recordScene(page, report, outDir, SCENES.battleBeat);
  if (await page.isVisible(annihilation)) {
    await page.click('#tactical-annihilation-exit-btn');
    await waitForWorldPlanning(page);
  }
```

- [ ] **Step 23: Create `doc/ux/reports-tab.md`**

The new element document for the Reports tab.

Create `doc/ux/reports-tab.md` with exactly this content:

````markdown
# Reports Tab

The console tab that keeps what the map toasts showed during the current match.

## Purpose

Let the player read a turn update, an opponent message, or a notice again after its toast has hidden.

## Availability

Shown while the right panel's Reports tab is selected and the panel is expanded, in every mode where the panel is visible. While the tactical battles list is open, the tab stays visible while the panel is expanded and does not receive pointer input. In New game and Game over the panel is absent, so this tab is absent with it. Entries are filed whether or not the tab is shown.

## Information Displayed

- One entry per filed toast, newest first. Each entry shows a tag, a kind, and a copy of the toast's text, including the flags a turn update shows.
- The tag says when: "T7" for a strategic turn, or "B2" for a battle beat (`formatConsoleReportTag` in `src/shared/consoleReportLog.ts`). A turn report is tagged with the turn or beat it reports on, which is the one Ready just resolved. The unknown-battle notice and the standing-orders notice that a Ready raises take that same tag. Every other entry is tagged with the current turn or beat when it arrived. An entry filed before a match is loaded has no tag.
- The kind is "Turn report" for a turn or beat update, "Message" for the opponent's message and strategy, and "Notice" for any other informational map toast.
- A turn report carries a disabled Replay button.
- Entries filed since the player last left this tab are marked with a gold dot.
- With no entries, the tab reads "No reports yet this match."
- The header's subtitle reads "this match". The Reports tab in the rail shows the number of unread entries, and hides it at zero. See [right-panel.md](right-panel.md).
- Control tips for the tab and the Replay placeholder are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- None. Replay is disabled in this version.

### Keyboard

- None.

### Other

- Every informational map toast and every shown AI strategy toast is filed when it appears. Error toasts are not filed. See [notifications-and-feedback.md](notifications-and-feedback.md).
- An entry is unread until the Reports tab is shown. Showing the tab marks every entry read. Entries filed while the tab is shown are never unread.
- The list keeps the newest 200 entries (`MAX_CONSOLE_REPORTS`).
- Starting a new match clears the list, as it clears the AI activity log. The list is not saved. After the app restarts it starts empty, and a toast shown once the app is up, such as a basemap failure, can file a new entry.

## States

- Empty: "No reports yet this match."
- Entries present: newest first.
- Unread: the rail shows a count.

## Invariants

- An error toast never becomes an entry.
- Each entry's text is the text its toast showed.
- The rail count never counts an entry filed while the tab was shown.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Tag | Turn, such as "T7" | Beat, such as "B2" |
| Turn report | After a turn resolves | After a beat resolves |

## Related Documents

- [right-panel.md](right-panel.md)
- [notifications-and-feedback.md](notifications-and-feedback.md)
- [ai-activity-log.md](ai-activity-log.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#console-tab-reports`, `#console-tab-reports-badge`, `#console-panel-reports`, `#reports-empty`, `#reports-list`)
- `static/consoleChrome.css`
- `src/renderer/chrome/consoleReports.ts`
- `src/shared/consoleReportLog.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts` (`showMapToast`, `showAiStrategyToast`)
- `src/renderer/gameplay/readyResolutionAnnouncements.ts` (`announceResolutionTurnUpdate`)
````

- [ ] **Step 24: Edit `doc/ux/notifications-and-feedback.md`**

The toasts move to the top centre band, and the Reports tab keeps copies.

1. In `doc/ux/notifications-and-feedback.md`, find this line. It occurs exactly once:

````markdown
| Map toast | Errors, rejected orders, turn-loss summaries, unknown-battle announcements, and basemap load failure | Until dismiss, or until a fixed interval elapses. A new map toast replaces the old one and restarts the interval. The basemap failure uses the same interval. | This document |
````

Replace it with:

````markdown
| Map toast | Errors, rejected orders, turn-loss summaries, unknown-battle announcements, and basemap load failure | Until dismiss, or until a fixed interval elapses. A new map toast replaces the old one and restarts the interval. The basemap failure uses the same interval. | This document |
| Reports tab | A copy of every informational map toast and every shown AI strategy toast | Accumulates during a match. Starting a new match clears it. | [reports-tab.md](reports-tab.md) |
````

2. In `doc/ux/notifications-and-feedback.md`, find this line. It occurs exactly once:

````markdown
- The map toast shows one message at the lower right. The AI strategy toast shows at the upper right. Both use the navy chrome in the [UI style guide](../ui-style-guide.md). An error has a light-red border. An informational message, including a turn update, an unknown-battle announcement, a basemap failure, and the AI strategy toast, has the steel border. The body is the message text, not a fixed sentence list.
````

Replace it with:

````markdown
- Both toasts show in one band at the top centre of the map, right of the minimap and 12 px below the map's top edge, at most 560 px wide. The AI strategy toast sits above the map toast when both show. Both use the navy chrome in the [UI style guide](../ui-style-guide.md). An error has a light-red border. An informational message, including a turn update, an unknown-battle announcement, a basemap failure, and the AI strategy toast, has the steel border. The body is the message text, not a fixed sentence list.
````

3. In `doc/ux/notifications-and-feedback.md`, find this line. It occurs exactly once:

````markdown
- When a new map toast is shown, it replaces the previous map toast.
````

Replace it with:

````markdown
- When a new map toast is shown, it replaces the previous map toast.
- When an informational map toast or an AI strategy toast is shown, the [Reports tab](reports-tab.md) files a copy. An error toast is not filed.
````

4. In `doc/ux/notifications-and-feedback.md`, find this line. It occurs exactly once:

````markdown
- Showing one toast does not hide the other toast.
````

Replace it with:

````markdown
- Showing one toast does not hide the other toast.
- Every informational toast is filed on the Reports tab. An error toast never is.
````

5. In `doc/ux/notifications-and-feedback.md`, find this line. It occurs exactly once:

````markdown
- [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md)
````

Replace it with:

````markdown
- [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md)
- [reports-tab.md](reports-tab.md)
````

- [ ] **Step 25: Edit `doc/ux/right-panel.md`**

Adds the Reports tab.

1. In `doc/ux/right-panel.md`, find this line. It occurs exactly once:

````markdown
The console docked on the right of the map. It holds the Orders tab, the Opponent tab, a tab rail, and a footer with Ready.
````

Replace it with:

````markdown
The console docked on the right of the map. It holds the Orders tab, the Reports tab, the Opponent tab, a tab rail, and a footer with Ready.
````

2. In `doc/ux/right-panel.md`, find these lines. Together they occur exactly once:

````markdown
- A tab rail on the panel's outer edge, with Orders, Opponent, Build, and Forces. Build and Forces are disabled in this version. The selected tab is marked while the panel is expanded, and the mark is cleared while the panel is collapsed.
- A header with the selected tab's name, a subtitle, and a button that collapses the panel. On the Orders tab the subtitle reads "N queued for turn T", or "N queued for beat B" in a battle, where N counts every row of the three order groups (`formatQueuedOrdersSubtitle` in `src/shared/orderRowDetail.ts`). The Opponent tab has no subtitle.
- A count on the Orders tab in the rail: the number of queued orders, the same N. It is hidden while nothing is queued.
- The Orders tab: the order groups. See [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md). The selected units, and the Ranged and Strike controls, are in the [selection panel](selection-panel.md) on the map.
````

Replace them with:

````markdown
- A tab rail on the panel's outer edge, with Orders, Reports, Opponent, Build, and Forces. Build and Forces are disabled in this version. The selected tab is marked while the panel is expanded, and the mark is cleared while the panel is collapsed.
- A header with the selected tab's name, a subtitle, and a button that collapses the panel. On the Orders tab the subtitle reads "N queued for turn T", or "N queued for beat B" in a battle, where N counts every row of the three order groups (`formatQueuedOrdersSubtitle` in `src/shared/orderRowDetail.ts`). On the Reports tab it reads "this match". The Opponent tab has no subtitle.
- A count on the Orders tab in the rail: the number of queued orders, the same N. It is hidden while nothing is queued.
- A count on the Reports tab in the rail: the number of unread reports. It is hidden at zero. See [reports-tab.md](reports-tab.md).
- The Orders tab: the order groups. See [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md). The selected units, and the Ranged and Strike controls, are in the [selection panel](selection-panel.md) on the map.
- The Reports tab: what the map toasts showed during this match. See [reports-tab.md](reports-tab.md).
````

3. In `doc/ux/right-panel.md`, find this line. It occurs exactly once:

````markdown
- Expanded on Orders: the start state.
````

Replace it with:

````markdown
- Expanded on Orders: the start state.
- Expanded on Reports.
````

4. In `doc/ux/right-panel.md`, find this line. It occurs exactly once:

````markdown
- [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md)
````

Replace it with:

````markdown
- [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md)
- [reports-tab.md](reports-tab.md)
````

5. In `doc/ux/right-panel.md`, find this line. It occurs exactly once:

````markdown
- `static/index.html` (`#sidebar`, `#console-main`, `#console-title`, `#console-subtitle`, `#console-tab-orders-badge`, `#console-collapse-btn`, `#console-panel-orders`, `#console-panel-opponent`, `#console-rail`, `#console-tab-orders`, `#console-tab-opponent`, `#console-tab-build`, `#console-tab-forces`, `#console-footer`, `#openrouter-tab-tools`, `#openrouter-tab-model`)
````

Replace it with:

````markdown
- `static/index.html` (`#sidebar`, `#console-main`, `#console-title`, `#console-subtitle`, `#console-tab-orders-badge`, `#console-collapse-btn`, `#console-panel-orders`, `#console-panel-reports`, `#console-panel-opponent`, `#console-rail`, `#console-tab-orders`, `#console-tab-reports`, `#console-tab-reports-badge`, `#console-tab-opponent`, `#console-tab-build`, `#console-tab-forces`, `#console-footer`, `#openrouter-tab-tools`, `#openrouter-tab-model`)
````

- [ ] **Step 26: Edit `doc/ux/ai-activity-log.md`**

A new match also clears the Reports tab.

In `doc/ux/ai-activity-log.md`, find this line. It occurs exactly once:

````markdown
- When a new match starts, from startup, New game, or game over, the log clears, together with the cost readout reset on the Model tab.
````

Replace it with:

````markdown
- When a new match starts, from startup, New game, or game over, the log clears, together with the cost readout reset on the Model tab and the [Reports tab](reports-tab.md).
````

- [ ] **Step 27: Edit `doc/ux/new-game-dialog.md`**

The same, from the new-game side.

In `doc/ux/new-game-dialog.md`, find this line. It occurs exactly once:

````markdown
- When the player clicks Start game or New game, the match starts, drafts and the selection clear, the AI cost readout and the AI activity log clear, and the overlay closes on success. The top bar and the right panel are on screen, and the view then frames the new match in the map beside the panel, as in [map-surface.md](map-surface.md). A failure leaves the overlay open.
````

Replace it with:

````markdown
- When the player clicks Start game or New game, the match starts, drafts and the selection clear, the AI cost readout, the AI activity log, and the Reports tab clear, and the overlay closes on success. The top bar and the right panel are on screen, and the view then frames the new match in the map beside the panel, as in [map-surface.md](map-surface.md). A failure leaves the overlay open.
````

- [ ] **Step 28: Edit `doc/ux/control-tooltips.md`**

Adds the Reports tab's tip and lists Replay among the placeholders.

1. In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
The tip can appear whenever the control can receive the pointer or keyboard focus. A control inside a surface that has pointer input turned off cannot show it. A disabled control still shows its tip when the pointer can rest on it. That includes Ready while its label reads "AI:", Run before a key and model are set, a reasoning list with fewer than two levels, a sealift slot that cannot be changed, Fight before a row is chosen, Keep building when it cannot be turned on, and Exit Battle while a battle turn is resolving or playing back. It also includes every disabled placeholder: Settings and Help in the top bar, Save game, Load game, and How to play in the game menu, and the Build and Forces tabs. The top bar's four readouts show a tip the same way, though they are not controls.
````

Replace it with:

````markdown
The tip can appear whenever the control can receive the pointer or keyboard focus. A control inside a surface that has pointer input turned off cannot show it. A disabled control still shows its tip when the pointer can rest on it. That includes Ready while its label reads "AI:", Run before a key and model are set, a reasoning list with fewer than two levels, a sealift slot that cannot be changed, Fight before a row is chosen, Keep building when it cannot be turned on, and Exit Battle while a battle turn is resolving or playing back. It also includes every disabled placeholder: Settings and Help in the top bar, Save game, Load game, and How to play in the game menu, the Build and Forces tabs, and Replay on a turn report. The top bar's four readouts show a tip the same way, though they are not controls.
````

2. In `doc/ux/control-tooltips.md`, find these lines. Together they occur exactly once:

````markdown
- Opponent tab: Show the opponent's model, its tools, and the AI activity log.
- Settings, Help, Load game, How to play, Build, and Forces: "<name> is not available in this version.", for example "Settings is not available in this version."
````

Replace them with:

````markdown
- Reports tab: Show the turn reports, opponent messages, and notices from this match, newest first.
- Opponent tab: Show the opponent's model, its tools, and the AI activity log.
- Settings, Help, Load game, How to play, Build, Forces, and Replay: "<name> is not available in this version.", for example "Settings is not available in this version."
````

- [ ] **Step 29: Edit `doc/ux-specification.md`**

Adds the Reports tab to the routing table, the element list, and the mode matrix.

1. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
| The AI activity log | [notifications-and-feedback.md](ux/notifications-and-feedback.md) | [ai-activity-log.md](ux/ai-activity-log.md) |
````

Replace it with:

````markdown
| The AI activity log | [notifications-and-feedback.md](ux/notifications-and-feedback.md) | [ai-activity-log.md](ux/ai-activity-log.md) |
| The Reports tab, or where the map toasts show | [notifications-and-feedback.md](ux/notifications-and-feedback.md) | [reports-tab.md](ux/reports-tab.md) |
````

2. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
- [ai-activity-log.md](ux/ai-activity-log.md): the log of AI interactions and errors.
````

Replace it with:

````markdown
- [ai-activity-log.md](ux/ai-activity-log.md): the log of AI interactions and errors.
- [reports-tab.md](ux/reports-tab.md): the console tab that keeps what the map toasts showed during the match.
````

3. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
| AI activity log | Hidden | Shown | Disabled | Shown | Shown | Disabled | Hidden |
````

Replace it with:

````markdown
| AI activity log | Hidden | Shown | Disabled | Shown | Shown | Disabled | Hidden |
| Reports tab | Hidden | Shown | Disabled | Shown | Shown | Disabled | Hidden |
````

- [ ] **Step 30: Edit `doc/ui-style-guide.md`**

The toasts are at the top centre.

1. In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
**Implementation status (2.5.0):** The live app is a map-first Electron window: Leaflet world map + canvas overlay, minimap, hex tooltips, control tips, stack callout, build-queue popup, OpenRouter side panel, a lower-right update toast and an upper-right message toast, WASD/arrow pan, wheel zoom, NATO-inspired SVG unit glyphs, and tactical-entry magnifiers on contested hexes. The map stays the light cartographic theme (no dark-mode switch). Panels, popups, tooltips, and the message and update toasts use navy chrome `#1b2838` with off-white text so flags and weather icons separate from the pale terrain. Every button, including the map buttons, uses the Ready button's teal; text fields and dropdowns use a lighter teal so they read as editable. Player colors are teal human `#115e59` and rose opponent `#9d174d` on map background `#e0dcd4`. Unbuilt in this guide: save/load UI, replay strip, async turn-file exchange, diplomacy panel, in-app reference manual, and a documented full keyboard-shortcut overlay.
````

Replace it with:

````markdown
**Implementation status (2.5.0):** The live app is a map-first Electron window: Leaflet world map + canvas overlay, minimap, hex tooltips, control tips, stack callout, build-queue popup, OpenRouter side panel, an update toast and a message toast at the top centre of the map, WASD/arrow pan, wheel zoom, NATO-inspired SVG unit glyphs, and tactical-entry magnifiers on contested hexes. The map stays the light cartographic theme (no dark-mode switch). Panels, popups, tooltips, and the message and update toasts use navy chrome `#1b2838` with off-white text so flags and weather icons separate from the pale terrain. Every button, including the map buttons, uses the Ready button's teal; text fields and dropdowns use a lighter teal so they read as editable. Player colors are teal human `#115e59` and rose opponent `#9d174d` on map background `#e0dcd4`. Unbuilt in this guide: save/load UI, replay strip, async turn-file exchange, diplomacy panel, in-app reference manual, and a documented full keyboard-shortcut overlay.
````

2. In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
| Panel, popup, tooltip, and toast bg | `#1b2838` | Right panel, game menu, legend, hex tooltip, control tips, stack callout, build popup, new-game box, tactical-battles dialog, lower-right update toast, and upper-right message toast |
````

Replace it with:

````markdown
| Panel, popup, tooltip, and toast bg | `#1b2838` | Right panel, game menu, legend, hex tooltip, control tips, stack callout, build popup, new-game box, tactical-battles dialog, update toast, message toast, and Reports tab |
````

- [ ] **Step 31: Edit `doc/how-to-play.md`**

The captions and the message list say the toasts are at the top centre, and that the Reports tab keeps them.

In `doc/how-to-play.md`, find these lines. Together they occur exactly once:

````markdown
| *LLM-supplied taunts (in this case, Claude Opus) and strategy messages appear in the upper-right.*                                                                 | *End-of-turn updates appear in the lower-right.*                                                |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| ![LLM-supplied taunts (in this case, Claude Opus) and strategy messages appear in the upper-right](media/message-popup.png) | ![End-of-turn updates appear in the lower-right](media/status-popup.png) |

- **Lower right of the map (map toast):** Errors, rejected orders, turn-loss summaries, and unknown-battle announcements. Use the × to dismiss; it also hides after a fixed interval, and a newer message replaces it.
- **Upper right of the map (AI strategy toast):** The opponent's Message and Strategy after a consultation. It dismisses and times out the same way.
````

Replace them with:

````markdown
| *LLM-supplied taunts (in this case, Claude Opus) and strategy messages appear at the top centre of the map, and stay on the Reports tab.*                                                                 | *End-of-turn updates appear at the top centre of the map, and stay on the Reports tab.*                                                |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| ![LLM-supplied taunts (in this case, Claude Opus) and strategy messages appear at the top centre of the map](media/message-popup.png) | ![End-of-turn updates appear at the top centre of the map](media/status-popup.png) |

- **Top centre of the map (map toast):** Errors, rejected orders, turn-loss summaries, and unknown-battle announcements. Use the × to dismiss; it also hides after a fixed interval, and a newer message replaces it. The Reports tab keeps every one except errors.
- **Top centre of the map, above the map toast (AI strategy toast):** The opponent's Message and Strategy after a consultation. It dismisses and times out the same way, and the Reports tab keeps it.
````

## Verify

- [ ] **Step 32: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 33: Full tests**

Run the full tests. Expected: exit 0, test total **866**, failure total **0**.

- [ ] **Step 34: Exact match**

This proves that every file this plan creates or edits, except `doc/ux/reports-tab.md`, matches the verified result character for character. It ignores line endings. The note after the table says why that file has no hash.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/shared/consoleReportLog.ts src/shared/consoleReportLog.test.ts src/shared/consolidatedTurnUpdateToast.ts src/shared/consolidatedTurnUpdateToast.test.ts src/renderer/chrome/consoleReports.ts src/renderer/openRouter/openRouterUiHelpers.ts src/renderer/gameplay/readyResolutionAnnouncements.ts src/renderer/gameplay/readyHandler.ts src/renderer/gameplay/readyTacticalCommit.ts src/renderer/gameplay/newGame.ts src/renderer/chrome/consoleFrame.ts src/renderer/chrome/frameTooltipText.ts static/index.html static/feedbackChrome.css static/consoleChrome.css scripts/ui-smoke/ui-smoke-checks.cjs scripts/ui-smoke/ui-smoke-scenes.cjs scripts/ui-smoke/ui-smoke-map.cjs scripts/ui-smoke/ui-smoke-console-checks.cjs scripts/ui-smoke/ui-smoke-scenario-checks.cjs scripts/ui-smoke/ui-smoke.cjs doc/ux/notifications-and-feedback.md doc/ux/right-panel.md doc/ux/ai-activity-log.md doc/ux/new-game-dialog.md doc/ux/control-tooltips.md doc/ux-specification.md doc/ui-style-guide.md doc/how-to-play.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/shared/consoleReportLog.ts` | `5d513e3b08a0ae56` |
| `src/shared/consoleReportLog.test.ts` | `004e63d31cb6ba1a` |
| `src/shared/consolidatedTurnUpdateToast.ts` | `9463c43f1811268b` |
| `src/shared/consolidatedTurnUpdateToast.test.ts` | `7762bfb5a5a3a9df` |
| `src/renderer/chrome/consoleReports.ts` | `7829109a3a1259e5` |
| `src/renderer/openRouter/openRouterUiHelpers.ts` | `c2b1bfbfb2e92799` |
| `src/renderer/gameplay/readyResolutionAnnouncements.ts` | `70a8c86b1fba5a36` |
| `src/renderer/gameplay/readyHandler.ts` | `520ec709eb954cb7` |
| `src/renderer/gameplay/readyTacticalCommit.ts` | `6550c4fc96a2b036` |
| `src/renderer/gameplay/newGame.ts` | `3b52291e1955f467` |
| `src/renderer/chrome/consoleFrame.ts` | `28a564ae9b2a7187` |
| `src/renderer/chrome/frameTooltipText.ts` | `4b0424893ee9a63c` |
| `static/index.html` | `386a67ac970038e0` |
| `static/feedbackChrome.css` | `5161d04ab52d2e08` |
| `static/consoleChrome.css` | `3462a702b5b213b0` |
| `scripts/ui-smoke/ui-smoke-checks.cjs` | `dcd8d27328bff212` |
| `scripts/ui-smoke/ui-smoke-scenes.cjs` | `512b51defdd66c3c` |
| `scripts/ui-smoke/ui-smoke-map.cjs` | `09728f247f73e6bf` |
| `scripts/ui-smoke/ui-smoke-console-checks.cjs` | `96a53da7db4c28a6` |
| `scripts/ui-smoke/ui-smoke-scenario-checks.cjs` | `db97cf13d8a77d77` |
| `scripts/ui-smoke/ui-smoke.cjs` | `c90d49189d48fff2` |
| `doc/ux/notifications-and-feedback.md` | `7c6743c8edcbe423` |
| `doc/ux/right-panel.md` | `0269f807bec0b6fd` |
| `doc/ux/ai-activity-log.md` | `655c02c2b33eebd5` |
| `doc/ux/new-game-dialog.md` | `1afdfca1f2f17570` |
| `doc/ux/control-tooltips.md` | `df9b9435d7cd05c9` |
| `doc/ux-specification.md` | `3d5b78cf5773b03e` |
| `doc/ui-style-guide.md` | `ace29f9b49cc642c` |
| `doc/how-to-play.md` | `a79940ef6e23adf4` |

`doc/ux/reports-tab.md` is left out of this check. Its restart sentence now says a toast shown once the app is up, such as a basemap failure, can file a new entry. The recorded hash was taken before that sentence. Write the file as this plan shows. Do not stop because it has no hash.

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.


- [ ] **Step 35: Smoke run**

```powershell
npm run ui:smoke -- --label reports
```

Expected summary line:

```text
ui-smoke reports: 286 passed, 0 failed, 0 page errors, 29 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\reports
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/reports/report.json`.

- [ ] **Step 36: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/reports/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Three differences are expected: the expected images were made without map tiles, so their basemap is plain grey; they can show a "map tiles failed to load" toast; and that toast is filed as a Notice, so the Reports list and its rail badge can include it. The small origin flags beside unit names can also differ from run to run. From this plan on, combat is also rolled, so the reports' text, the losses on the map, and the readouts after the turn can differ from the images, and a turn with nothing to report files no turn report. The battle's units are placed when it opens, so the battle screenshots can differ in where the units stand and the codes. The new-game overlay draws its region, sides, and month at random.

- `19-turn-resolved.png` against [ui-facelift-console-4-expected-turn-resolved.png](ui-facelift-console-4-expected-turn-resolved.png): Turn 2, played at the 800 × 600 minimum: the date block reads "October, Year 1" and "Turn 2 · Planning", and the Orders subtitle reads "0 queued for turn 2". The turn's last toast sits in the band at the top of the map, right of the minimap and clear of the console. The Reports rail tab counts the entries filed: the standing-orders notice, and the turn report when the turn had something to report. The selection panel still shows at the map's bottom-left.
- `20-reports-tab.png` against [ui-facelift-console-4-expected-reports.png](ui-facelift-console-4-expected-reports.png): Back at 1280 × 720, with the Reports tab open: the header reads "Reports" and "this match". The entries are tagged "T1", newest first: a "Turn report" with a dimmed Replay and the same text as its toast, when the turn had one, then a "Notice" reading "AI: standing orders only (no consultation)." Each entry has a yellow dot. The rail badge is gone.
- `25-battle-beat.png` against [ui-facelift-console-4-expected-battle-beat.png](ui-facelift-console-4-expected-battle-beat.png): After the battle's first beat: the date block reads "Beat 2 · Tactical planning", the Orders subtitle reads "0 queued for beat 2", and the beat's report shows in the band at the top centre of the map. The Reports rail tab counts the new entries.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 33.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 36.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. With your API key and a model set and Run on, play two turns. The opponent's message and strategy toast, and the turn report, both show in the band, with the strategy toast above. Both are filed in Reports, tagged with the turn they belong to.
2. Cause an error toast: select an air unit, Shift-click a land unit to add it, then double-click an empty hex that neither unit stands in. "Cannot issue grouped movement for mixed air and non-air units." shows in the band and is not filed.
3. If your match has a tactical entry marker, enter the battle and play a beat: its report is tagged B1.
4. Point at a turn report's Replay: "Replay is not available in this version."
5. Choose New game… and start a match: the Reports tab reads "No reports yet this match.", and its badge is gone.
6. Restart the app on a match that has reports: the Reports tab is empty, because reports are not saved.

## Next

Plan 5 rebuilds the Opponent tab into four sections and adds the status line above Ready.
