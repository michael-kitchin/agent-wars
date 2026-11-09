# UI Facelift Battle, Plan 1 of 3: Battle Header

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** While a battle is open, turn the top bar into the battle header. It gets a darker, warmer face, hides the sides, the readouts, and the date block, and shows "Battle at (E8)" with the hex's caption and flags, and under it "Beat 2 · Tactical planning · April, Year 1" with the battle's weather. Outside a battle the bar is unchanged.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 1 of the three that build the spec's Phase 5; [ui-facelift-battle-execution-plan.md](ui-facelift-battle-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- `src/shared/battleHeaderText.ts`: the title and the status line, as pure, unit-tested functions. The beat wording moves here from `src/shared/topBarDateBlock.ts`, so the date block always shows the world-map turn.
- `src/renderer/chrome/battleHeader.ts`: `renderBattleHeader` puts the `topbar-battle` class on `#app-topbar` while a battle is open and writes the title, the caption, and the status line. `renderTopBarStatus` calls it, so the header refreshes everywhere the top bar already did.
- Markup and styles: the title block after the game menu button and an empty middle block before Settings, both shown only in a battle. One CSS rule hides the match status in a battle and the battle header outside one. Two new color tokens give the battle header its face.
- The smoke run's new-game steps move, unchanged, to `scripts/ui-smoke/ui-smoke-new-game.cjs`, because `ui-smoke.cjs` had reached the 600-line limit. The run records the battle at the 800 × 600 minimum, and a new file of battle checks covers the header. Waits that read the beat now read the battle header.
- `doc/` describes the battle header.

**Out of scope:**

- Exit Battle stays at the bottom of the map until plan 2 moves it into the header.
- The force bar (plan 3). The middle block stays empty until then.

**How this plan was checked:** every step below was applied to a copy of the repository at commit `2e3ec02`, and the result matched the verified files exactly. On that result, the fast loop and the smoke run passed against the real app in Electron. The full tests ran once, after the last plan, and the test total below follows from the tests this plan adds and removes. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

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

1. `AGENTS.md` and each file in `.cursor/rules/`.
2. [ui-facelift-spec.md](ui-facelift-spec.md): How to Read This Document, Frame, Top Bar, and Tactical Battles.
3. `doc/ux/top-bar.md` and `doc/ux/modes-and-transitions.md` (Tactical planning).
4. `scripts/ui-smoke/ui-smoke.cjs` and `scripts/ui-smoke/ui-smoke-checks.cjs`, to see how scenes and checks fit together.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected:

- `git status --short` prints nothing, or only `.spec/` files.
- The last commit is `2e3ec02 Doc moves.`, or a later commit of yours that changes only `.spec/`. If it is anything else, stop and report: every block in this plan was checked against `2e3ec02`.

Then check that the spec's Phase 4 is in and this plan is not:

```powershell
Test-Path src/shared/mapViewMode.ts
Test-Path src/shared/battleHeaderText.ts
```

Expected: `True`, then `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **882**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/shared/battleHeaderText.ts`
- `src/shared/battleHeaderText.test.ts`
- `src/shared/topBarDateBlock.ts`
- `src/shared/topBarDateBlock.test.ts`
- `src/renderer/chrome/battleHeader.ts`
- `src/renderer/chrome/topBar.ts`
- `static/index.html`
- `static/shellChrome.css`
- `static/frameChrome.css`
- `scripts/ui-smoke/ui-smoke-scenes.cjs`
- `scripts/ui-smoke/ui-smoke-new-game.cjs`
- `scripts/ui-smoke/ui-smoke.cjs`
- `scripts/ui-smoke/ui-smoke-map.cjs`
- `scripts/ui-smoke/ui-smoke-battle-checks.cjs`
- `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`
- `scripts/ui-smoke/ui-smoke-checks.cjs`
- `doc/ux/top-bar.md`
- `doc/ux/modes-and-transitions.md`
- `doc/ux/map-surface.md`
- `doc/ux/right-panel-command-bar.md`
- `doc/ux-specification.md`
- `doc/ui-style-guide.md`
- `doc/how-to-play.md`

- [ ] **Step 1: Create `src/shared/battleHeaderText.ts`**

A new file: the battle header's two lines of text. The title names the battle's world hex, and the status line gives the beat, whether it is being planned or resolved, and the match date. Pure functions with no page access.

Create `src/shared/battleHeaderText.ts` with exactly this content:

```ts
/**
 * The text of the battle header, which replaces the top bar's match status while a battle is open.
 */
/**
 * Names the battle by its world hex.
 *
 * Purpose: The header's first words say where the player is fighting, with the same code the map and the order rows
 *   use.
 * When to use: For the header's title, with the world hex's code from `orderTargetHexCode`.
 * Expected outcome: "Battle at (E8)", or "Battle" when the code is unknown.
 * Exceptions: None.
 */
export function formatBattleHeaderTitle(hexCode: string | null): string {
  return hexCode ? `Battle at (${hexCode})` : 'Battle';
}

/**
 * Names a battle's beat and whether it is being planned or resolved.
 *
 * Purpose: Keeps the beat wording in one place for the header's status line.
 * When to use: Only by `formatBattleHeaderStatus`.
 * Expected outcome: "Beat N · Tactical planning", or "Beat N · Tactical resolution" while the beat resolves or plays
 *   back.
 * Exceptions: None.
 */
function formatBattleBeatLine(beat: number, beatPlaybackActive: boolean): string {
  return `Beat ${beat} · ${beatPlaybackActive ? 'Tactical resolution' : 'Tactical planning'}`;
}

/**
 * Builds the header's second line: the beat, its phase, and the match date.
 *
 * Purpose: The player reads which beat this is, whether it is being planned or resolved, and when, in one line.
 * When to use: For the header's status line. `beat` is the battle's beat number, `beatPlaybackActive` is true while
 *   the beat resolves or plays back, and `dateLabel` is the match date from the game state.
 * Expected outcome: "Beat 2 · Tactical planning · April, Year 1". An empty date leaves the date out.
 * Exceptions: None.
 */
export function formatBattleHeaderStatus(input: {
  readonly beat: number;
  readonly beatPlaybackActive: boolean;
  readonly dateLabel: string;
}): string {
  const beatLine = formatBattleBeatLine(input.beat, input.beatPlaybackActive);
  return input.dateLabel.length > 0 ? `${beatLine} · ${input.dateLabel}` : beatLine;
}
```

- [ ] **Step 2: Create `src/shared/battleHeaderText.test.ts`**

Covers the title with and without a hex code, the status line while planning and while a beat resolves, and a missing date.

Create `src/shared/battleHeaderText.test.ts` with exactly this content:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatBattleHeaderStatus, formatBattleHeaderTitle } from './battleHeaderText';

test('formatBattleHeaderTitle names the world hex', () => {
  assert.equal(formatBattleHeaderTitle('E8'), 'Battle at (E8)');
});

test('formatBattleHeaderTitle falls back to "Battle" without a code', () => {
  assert.equal(formatBattleHeaderTitle(null), 'Battle');
});

test('formatBattleHeaderStatus shows the beat, tactical planning, and the date', () => {
  assert.equal(
    formatBattleHeaderStatus({ beat: 2, beatPlaybackActive: false, dateLabel: 'April, Year 1' }),
    'Beat 2 · Tactical planning · April, Year 1'
  );
});

test('formatBattleHeaderStatus names tactical resolution while the beat plays back', () => {
  assert.equal(
    formatBattleHeaderStatus({ beat: 2, beatPlaybackActive: true, dateLabel: 'April, Year 1' }),
    'Beat 2 · Tactical resolution · April, Year 1'
  );
});

test('formatBattleHeaderStatus leaves out a missing date', () => {
  assert.equal(formatBattleHeaderStatus({ beat: 1, beatPlaybackActive: false, dateLabel: '' }), 'Beat 1 · Tactical planning');
});
```

- [ ] **Step 3: Edit `src/shared/topBarDateBlock.ts`**

The date block now always shows the world-map turn. In a battle it is hidden and the battle header shows the beat, so the date block's battle wording moves to `battleHeaderText.ts`.

1. In `src/shared/topBarDateBlock.ts`, find this line. It occurs exactly once:

```ts
 * When to use: Built by the renderer from the latest snapshot and the battle state before each top-bar refresh.
```

Replace it with:

```ts
 * When to use: Built by the renderer from the latest snapshot before each top-bar refresh.
```

2. In `src/shared/topBarDateBlock.ts`, find these lines. Together they occur exactly once:

```ts
   *
   * Contract: Used only outside a battle.
   * When to use: Pass `state.turnNumber`.
```

Replace them with:

```ts
   *
   * Contract: A positive whole number once a match is loaded.
   * When to use: Pass `state.turnNumber`.
```

3. In `src/shared/topBarDateBlock.ts`, find this line. It occurs exactly once:

```ts
   * Contract: Used only outside a battle.
```

Replace it with:

```ts
   * Contract: One word, already title-cased.
```

4. In `src/shared/topBarDateBlock.ts`, delete these lines, including the line break at the end. Together they occur exactly once:

```ts
  /**
   * The tactical beat number while a battle is active, otherwise null.
   *
   * Contract: Non-null exactly while a tactical battle snapshot is set.
   * When to use: Pass the battle snapshot's beat number, or null.
   * Expected outcome: A number switches the second line to the battle wording.
   * Exceptions: None.
   */
  readonly battleBeat: number | null;
  /**
   * Whether a beat is resolving or playing back.
   *
   * Contract: Only read while `battleBeat` is not null.
   * When to use: Pass true while beat playback runs.
   * Expected outcome: True shows "Tactical resolution"; false shows "Tactical planning".
   * Exceptions: None.
   */
  readonly beatPlaybackActive: boolean;
```

5. In `src/shared/topBarDateBlock.ts`, find these lines. Together they occur exactly once:

```ts
   * The second line: turn and phase, or beat and battle phase.
   *
   * Contract: Plain text, never HTML.
   * When to use: Write with `textContent`.
   * Expected outcome: For example "Turn 7 · Planning" or "Beat 2 · Tactical planning".
```

Replace them with:

```ts
   * The second line: the strategic turn and phase.
   *
   * Contract: Plain text, never HTML.
   * When to use: Write with `textContent`.
   * Expected outcome: For example "Turn 7 · Planning".
```

6. In `src/shared/topBarDateBlock.ts`, find these lines. Together they occur exactly once:

```ts
 * Purpose: The player reads the date first and the turn and phase second, in both theaters.
 * When to use: Every top-bar refresh.
 * Expected outcome: Em dashes with no snapshot. Outside a battle, the date and "Turn N · Phase". In a battle, the
 *   date and "Beat N · Tactical planning" or "Beat N · Tactical resolution".
```

Replace them with:

```ts
 * Purpose: The player reads the date first and the turn and phase second.
 * When to use: Every top-bar refresh. In a battle the block is hidden and the battle header shows the beat; see
 *   `formatBattleHeaderStatus`.
 * Expected outcome: Em dashes with no snapshot. Otherwise the date and "Turn N · Phase".
```

7. In `src/shared/topBarDateBlock.ts`, delete these lines, including the line break at the end. Together they occur exactly once:

```ts
  if (args.battleBeat !== null) {
    const battlePhase = args.beatPlaybackActive ? 'Tactical resolution' : 'Tactical planning';
    return { date, turnPhase: `Beat ${args.battleBeat} · ${battlePhase}` };
  }
```

- [ ] **Step 4: Edit `src/shared/topBarDateBlock.test.ts`**

Drops the two battle cases, which `battleHeaderText.test.ts` now covers.

1. In `src/shared/topBarDateBlock.test.ts`, delete these lines, including the line break at the end. Together they occur exactly once:

```ts
  battleBeat: null,
  beatPlaybackActive: false,
```

2. In `src/shared/topBarDateBlock.test.ts`, find these lines. Together they occur exactly once:

```ts
test('formatTopBarDateBlock shows the date and the strategic turn outside a battle', () => {
  assert.deepEqual(formatTopBarDateBlock(strategicArgs), { date: 'March, Year 1', turnPhase: 'Turn 7 · Planning' });
});

test('formatTopBarDateBlock names the beat and tactical planning in a battle', () => {
  assert.deepEqual(formatTopBarDateBlock({ ...strategicArgs, battleBeat: 2 }), {
    date: 'March, Year 1',
    turnPhase: 'Beat 2 · Tactical planning',
  });
});

test('formatTopBarDateBlock names tactical resolution while a beat plays back', () => {
  assert.equal(formatTopBarDateBlock({ ...strategicArgs, battleBeat: 2, beatPlaybackActive: true }).turnPhase, 'Beat 2 · Tactical resolution');
});

test('formatTopBarDateBlock shows an em dash for a missing date', () => {
```

Replace them with:

```ts
test('formatTopBarDateBlock shows the date and the strategic turn', () => {
  assert.deepEqual(formatTopBarDateBlock(strategicArgs), { date: 'March, Year 1', turnPhase: 'Turn 7 · Planning' });
});

test('formatTopBarDateBlock shows an em dash for a missing date', () => {
```

- [ ] **Step 5: Create `src/renderer/chrome/battleHeader.ts`**

A new file: switches the top bar to the battle header while a battle is open, and writes its title, the world hex's caption, and the status line.

Create `src/renderer/chrome/battleHeader.ts` with exactly this content:

```ts
/**
 * The battle header: while a battle is open, the top bar names the battle and its beat in place of the match status.
 */
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { formatBattleHeaderStatus, formatBattleHeaderTitle } from '../../shared/battleHeaderText';
import { formatHexNamingCaptionHtml } from '../../shared/hexNamingCaption';
import { orderTargetHexCode } from '../../shared/orderTargetHexCode';
import { formatWeatherIconHtml } from '../../shared/weatherIcons';
import { rendererSharedState as S } from '../core/state';
import { getCachedNamingLineForTarget } from '../map/terrainTooltipStrategicState';

/**
 * The class on `#app-topbar` that switches it to the battle header.
 *
 * Purpose: One switch for the styles that hide the match status and show the battle's parts.
 * When to use: Set and cleared only by `renderBattleHeader`; `static/frameChrome.css` keys on it.
 * Expected outcome: `topbar-battle`.
 * Exceptions: None.
 */
const TOPBAR_BATTLE_CLASS = 'topbar-battle';

/**
 * Counts caption requests, so a reply for an earlier battle cannot overwrite a newer one.
 *
 * Purpose: The caption arrives from the main process after the header is drawn.
 * When to use: Only by `renderBattleHeaderCaption`.
 * Expected outcome: Grows by one with each request.
 * Exceptions: None.
 */
let captionRequestSeq = 0;

/**
 * Switches the top bar between the match status and the battle header.
 *
 * Purpose: The bar keeps its place and height; only what it shows changes with the theater.
 * When to use: From `renderBattleHeader` on every refresh.
 * Expected outcome: `#app-topbar` has `TOPBAR_BATTLE_CLASS` and reads "Battle status" to assistive technology while a
 *   battle is open, and reads "Match status" otherwise.
 * Exceptions: None; a missing bar is skipped.
 */
function switchTopBarToBattle(inBattle: boolean): void {
  const bar = document.getElementById('app-topbar');
  if (!bar) return;
  bar.classList.toggle(TOPBAR_BATTLE_CLASS, inBattle);
  bar.setAttribute('aria-label', inBattle ? 'Battle status' : 'Match status');
}

/**
 * Writes the world hex's caption beside the title, once per battle.
 *
 * Purpose: Names the countries in the battle's hex the way the hex tooltip does, with their flags.
 * When to use: From `renderBattleHeader` while a battle is open.
 * Expected outcome: `#battle-header-caption` is emptied when a new battle opens, then filled when the caption arrives.
 *   Later refreshes of the same battle leave it alone.
 * Exceptions: None; a failed lookup leaves the caption empty.
 */
function renderBattleHeaderCaption(battle: TacticalBattleSnapshot): void {
  const captionEl = document.getElementById('battle-header-caption');
  if (!captionEl || captionEl.dataset.battleId === battle.battleId) return;
  captionEl.dataset.battleId = battle.battleId;
  captionEl.innerHTML = '';
  const requestSeq = ++captionRequestSeq;
  void getCachedNamingLineForTarget({ h3Index: battle.enclosingStrategicH3Index, resolution: 1 }).then((caption) => {
    if (requestSeq !== captionRequestSeq) return;
    captionEl.innerHTML = caption && caption.text.trim() !== '' ? formatHexNamingCaptionHtml(caption) : '';
  });
}

/**
 * Shows the battle header while a battle is open, and the match status otherwise.
 *
 * Purpose: In a battle the player needs where the fight is and which beat it is, not the world-map readouts.
 * When to use: From `renderTopBarStatus`, with the latest game state and `S.tacticalBattleSnapshot`.
 * Expected outcome: With a game state and a battle, the bar switches to the battle header: the title, such as "Battle at
 *   (E8)", the hex caption, and the status line, such as "Beat 2 · Tactical planning · April, Year 1", ending with the
 *   battle's weather when it has one. Otherwise the bar shows the match status, and the next battle's caption is
 *   requested again.
 * Exceptions: None; missing elements are skipped.
 */
export function renderBattleHeader(state: GameStateSnapshot | null, battle: TacticalBattleSnapshot | null): void {
  const inBattle = state != null && battle != null;
  switchTopBarToBattle(inBattle);
  if (!state || !battle) {
    const captionEl = document.getElementById('battle-header-caption');
    if (captionEl) delete captionEl.dataset.battleId;
    return;
  }
  const titleEl = document.getElementById('battle-header-title');
  if (titleEl) titleEl.textContent = formatBattleHeaderTitle(orderTargetHexCode(battle.enclosingStrategicH3Index, null));
  const statusEl = document.getElementById('battle-header-status');
  if (statusEl) {
    statusEl.textContent = formatBattleHeaderStatus({
      beat: battle.tacticalTurnNumber,
      beatPlaybackActive: S.resolutionMoveAnimation != null,
      dateLabel: state.currentDateLabel ?? '',
    });
    if (battle.weather) statusEl.insertAdjacentHTML('beforeend', ` · ${formatWeatherIconHtml(battle.weather)}`);
  }
  renderBattleHeaderCaption(battle);
}
```

- [ ] **Step 6: Edit `src/renderer/chrome/topBar.ts`**

`renderTopBarStatus` also refreshes the battle header. The date block no longer writes the beat or the weather; the battle header does.

1. In `src/renderer/chrome/topBar.ts`, find this line. It occurs exactly once:

```ts
 * The top bar's match status: the two sides, the four readouts, and the date block.
```

Replace it with:

```ts
 * The top bar's match status: the two sides, the four readouts, and the date block. In a battle the bar shows the
 * battle header instead; see `battleHeader.ts`.
```

2. In `src/renderer/chrome/topBar.ts`, find these lines. Together they occur exactly once:

```ts
import { formatWeatherIconHtml } from '../../shared/weatherIcons';
import { rendererSharedState as S } from '../core/state';
```

Replace them with:

```ts
import { rendererSharedState as S } from '../core/state';
import { renderBattleHeader } from './battleHeader';
```

3. In `src/renderer/chrome/topBar.ts`, find these lines. Together they occur exactly once:

```ts
 * Writes the date block, adding the battle's weather to the date line during a battle.
 *
 * Purpose: The player reads the date, and the turn or the beat, at a glance.
 * When to use: From `renderTopBarStatus`.
 * Expected outcome: See `formatTopBarDateBlock`. During a battle with weather, the date line ends with the weather icon and word.
 * Exceptions: None.
 */
function renderTopBarDateBlock(state: GameStateSnapshot | null): void {
  const battle = S.tacticalBattleSnapshot;
```

Replace them with:

```ts
 * Writes the date block.
 *
 * Purpose: The player reads the date, and the turn and its phase, at a glance.
 * When to use: From `renderTopBarStatus`.
 * Expected outcome: See `formatTopBarDateBlock`. In a battle the block is hidden and the battle header shows the beat.
 * Exceptions: None.
 */
function renderTopBarDateBlock(state: GameStateSnapshot | null): void {
```

4. In `src/renderer/chrome/topBar.ts`, find these lines. Together they occur exactly once:

```ts
    battleBeat: battle ? battle.tacticalTurnNumber : null,
    beatPlaybackActive: S.resolutionMoveAnimation != null,
  });
  const dateEl = document.getElementById('topbar-date');
  if (dateEl) {
    dateEl.textContent = text.date;
    if (state && battle?.weather) dateEl.insertAdjacentHTML('beforeend', ` · ${formatWeatherIconHtml(battle.weather)}`);
  }
```

Replace them with:

```ts
  });
  setText('topbar-date', text.date);
```

5. In `src/renderer/chrome/topBar.ts`, find this line. It occurs exactly once:

```ts
 * Refreshes everything the top bar shows about the match.
```

Replace it with:

```ts
 * Refreshes everything the top bar shows about the match, or about the battle while one is open.
```

6. In `src/renderer/chrome/topBar.ts`, find this line. It occurs exactly once:

```ts
 * Expected outcome: Sides, readouts, and the date block match `state` and the current battle. Null shows em dashes.
```

Replace it with:

```ts
 * Expected outcome: Sides, readouts, and the date block match `state` and the current battle. Null shows em dashes.
 *   While a battle is open the bar shows the battle header instead, from `renderBattleHeader`.
```

7. In `src/renderer/chrome/topBar.ts`, find this line. It occurs exactly once:

```ts
  renderTopBarDateBlock(state);
```

Replace it with:

```ts
  renderTopBarDateBlock(state);
  renderBattleHeader(state, S.tacticalBattleSnapshot);
```

- [ ] **Step 7: Checkpoint: build, types, and lint**

Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
```

Each exits 0, and `check:renderer-types` prints `check-renderer-typecheck: ok`. An error here comes from the steps above: open the file the error names, compare it with its step, fix your copying mistake, and run the three again. If the steps as written cannot compile, stop and report.

- [ ] **Step 8: Edit `static/index.html`**

Adds the battle header's title block after the game menu button, and an empty middle block before Settings. Both show only in a battle.

1. In `static/index.html`, find this line. It occurs exactly once:

```html
    <button type="button" id="game-menu-btn" class="topbar-icon-btn topbar-menu-btn" aria-label="Game menu" aria-haspopup="true" aria-expanded="false" aria-controls="game-menu" data-control-tooltip="Open the game menu to start a new game, choose whether Ready offers tactical battles, or quit."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12"></path></svg></button>
```

Replace it with:

```html
    <button type="button" id="game-menu-btn" class="topbar-icon-btn topbar-menu-btn" aria-label="Game menu" aria-haspopup="true" aria-expanded="false" aria-controls="game-menu" data-control-tooltip="Open the game menu to start a new game, choose whether Ready offers tactical battles, or quit."><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12"></path></svg></button>
    <div id="battle-header-place" class="battle-header-place battle-header-only">
      <span class="battle-header-title-line"><span id="battle-header-title" class="battle-header-title">—</span><span id="battle-header-caption" class="battle-header-caption"></span></span>
      <span id="battle-header-status" class="battle-header-status">—</span>
    </div>
```

2. In `static/index.html`, find these lines. Together they occur exactly once:

```html
    </div>
    <span class="control-tooltip-host" data-control-tooltip="Settings is not available in this version."><button type="button" id="topbar-settings-btn" class="topbar-icon-btn" aria-label="Settings" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h6.5M12.5 4H14M2 8h1.5M7.5 8H14M2 12h8.5"></path><circle cx="10.5" cy="4" r="1.8"></circle><circle cx="5.5" cy="8" r="1.8"></circle><circle cx="12.3" cy="12" r="1.8"></circle></svg></button></span>
```

Replace them with:

```html
    </div>
    <div id="battle-header-center" class="battle-header-center battle-header-only"></div>
    <span class="control-tooltip-host" data-control-tooltip="Settings is not available in this version."><button type="button" id="topbar-settings-btn" class="topbar-icon-btn" aria-label="Settings" disabled><svg class="chrome-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h6.5M12.5 4H14M2 8h1.5M7.5 8H14M2 12h8.5"></path><circle cx="10.5" cy="4" r="1.8"></circle><circle cx="5.5" cy="8" r="1.8"></circle><circle cx="12.3" cy="12" r="1.8"></circle></svg></button></span>
```

- [ ] **Step 9: Edit `static/shellChrome.css`**

Adds the battle header's face and edge colors.

In `static/shellChrome.css`, find this line. It occurs exactly once:

```css
  --console-rail-width: 56px;
```

Replace it with:

```css
  --console-rail-width: 56px;
  /* The battle header: the top bar's darker, warmer face while a battle is open, so the theater reads at a glance. */
  --battle-header-bg: #17141f;
  --battle-header-border: #4a3247;
```

- [ ] **Step 10: Edit `static/frameChrome.css`**

Styles the battle header: the bar's darker face in a battle, the title block whose caption gives way first, and the middle block. One rule hides the match status in a battle and the battle header outside one.

In `static/frameChrome.css`, find these lines. Together they occur exactly once:

```css
    max-width: 120px;
  }
}
```

Replace them with:

```css
    max-width: 120px;
  }
}

/* ---------- Battle header ---------- */
/* While a battle is open, battleHeader.ts puts .topbar-battle on the bar: the match status hides, and the battle's title, beat, and controls show in its place. */
#app-topbar:not(.topbar-battle) .battle-header-only,
#app-topbar.topbar-battle .topbar-sides,
#app-topbar.topbar-battle .topbar-stat,
#app-topbar.topbar-battle .topbar-spacer,
#app-topbar.topbar-battle .topbar-date-block {
  display: none;
}
#app-topbar.topbar-battle {
  background: var(--battle-header-bg);
  border-bottom-color: var(--battle-header-border);
}
/* The title and the status line. The title keeps its width; the caption beside it gives way first. */
.battle-header-place {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 430px;
  padding: 0 14px;
}
.battle-header-title-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.battle-header-title {
  flex: none;
  font-size: 13.5px;
  font-weight: 700;
  line-height: 1.1;
}
.battle-header-caption,
.battle-header-status {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--chrome-muted);
  font-size: 11.5px;
  line-height: 1.1;
}
/* The middle of the header; it fills the space between the title and the controls on the right. */
.battle-header-center {
  flex: 1 1 auto;
  min-width: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-left: 1px solid var(--chrome-divider);
}
```

- [ ] **Step 11: Edit `scripts/ui-smoke/ui-smoke-scenes.cjs`**

Moves the settle times here from `ui-smoke.cjs`, so the new-game steps can share them, and adds the battle at 800 × 600 scene and the list of battle scenes.

1. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find these lines. Together they occur exactly once:

```js
 * Scene names, sizes, and small helpers shared by the UI smoke checks and the runner.
 *
 * Purpose: The frame checks, the console checks, the scenario checks, the map chrome checks, and the runner name scenes
 *   and compare boxes the same way.
 * When to use: Required by `ui-smoke-checks.cjs`, `ui-smoke-console-checks.cjs`, `ui-smoke-scenario-checks.cjs`,
 *   `ui-smoke-map-chrome-checks.cjs`, and `ui-smoke.cjs`.
```

Replace them with:

```js
 * Scene names, sizes, settle times, and small helpers shared by the UI smoke checks and the runner.
 *
 * Purpose: The frame checks, the console checks, the scenario checks, the map chrome checks, the battle checks, and the
 *   runner name scenes, wait, and compare boxes the same way.
 * When to use: Required by `ui-smoke-checks.cjs`, `ui-smoke-console-checks.cjs`, `ui-smoke-scenario-checks.cjs`,
 *   `ui-smoke-map-chrome-checks.cjs`, `ui-smoke-battle-checks.cjs`, `ui-smoke-new-game.cjs`, and `ui-smoke.cjs`.
```

2. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find this line. It occurs exactly once:

```js
  battleOrders: 'battle-orders',
```

Replace it with:

```js
  battleOrders: 'battle-orders',
  battleSmallWindow: 'battle-small-window',
```

3. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find these lines. Together they occur exactly once:

```js
/**
 * Scenes that show a match: every scene that is not a new-game scene.
```

Replace them with:

```js
/**
 * Scenes that show a battle.
 *
 * Purpose: In a battle the top bar shows the battle header, so these scenes get their own checks.
 * When to use: The `scenes` list of a check that applies only while a battle is open.
 * Expected outcome: The battle's first scene, the selection and the queued march in it, the battle at the 800 x 600
 *   minimum, and the beat after Ready. The beat can end the battle; its checks allow for that.
 * Exceptions: None.
 */
const BATTLE_SCENES = Object.freeze([
  SCENES.battleStart,
  SCENES.battleSelection,
  SCENES.battleOrders,
  SCENES.battleSmallWindow,
  SCENES.battleBeat,
]);

/**
 * Scenes that show a match: every scene that is not a new-game scene.
```

4. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find this line. It occurs exactly once:

```js
const MATCH_SCENES = Object.freeze(Object.values(SCENES).filter((scene) => !NEW_GAME_SCENES.includes(scene)));
```

Replace it with:

```js
const MATCH_SCENES = Object.freeze(Object.values(SCENES).filter((scene) => !NEW_GAME_SCENES.includes(scene)));

/**
 * How long to let the page settle, in milliseconds.
 *
 * Purpose: Map tiles, canvas redraws, and the new-game overlay's own start-up work finish before a probe.
 * When to use: After a size change (`resize`), a click (`click`), the overlay opening (`overlay`), a match start
 *   (`start`), and while the pointer rests on a control until its tip shows (`tip`, longer than the one-second dwell).
 *   `turn` is the longest a played turn or battle beat may take before the run gives up.
 * Expected outcome: Fixed waits; the checks do not depend on map tiles having loaded.
 * Exceptions: None.
 */
const SETTLE_MS = Object.freeze({ resize: 1500, click: 500, overlay: 2500, start: 2500, tip: 1500, turn: 120000 });
```

5. In `scripts/ui-smoke/ui-smoke-scenes.cjs`, find this line. It occurs exactly once:

```js
  MATCH_SCENES,
```

Replace it with:

```js
  BATTLE_SCENES,
  MATCH_SCENES,
  SETTLE_MS,
```

- [ ] **Step 12: Create `scripts/ui-smoke/ui-smoke-new-game.cjs`**

A new file: the new-game steps moved out of `ui-smoke.cjs`, which had reached the 600-line limit. The code is unchanged.

Create `scripts/ui-smoke/ui-smoke-new-game.cjs` with exactly this content:

```js
/**
 * The UI smoke run's new-game steps: waiting for the overlay, opening it from a match, and starting the fixed global
 * and regional scenarios.
 *
 * Purpose: Keeps the overlay's choices and their checks together, apart from the scene order in `ui-smoke.cjs`.
 * When to use: Required by `ui-smoke.cjs`.
 * Expected outcome: Async helpers that drive the overlay the way a player would; nothing runs on load.
 * Exceptions: None.
 */
'use strict';

const { SETTLE_MS } = require('./ui-smoke-scenes.cjs');

/**
 * The fixed scenario, as option values in the new-game overlay.
 *
 * Purpose: Every run shows the same match, so checks can compare known values.
 * When to use: Only by `startScenarioMatch`.
 * Expected outcome: Southern Europe against Northern Africa, a small game, starting in September.
 * Exceptions: None.
 */
const SCENARIO = Object.freeze({
  humanRegion: 'Southern Europe',
  aiRegion: 'Northern Africa',
  startMonth: '9',
  gameSize: 'small',
});

/**
 * The fixed regional scenario, as option values on the new-game overlay's Regional tab.
 *
 * Purpose: The regional scenes always show the same region and sides, so their checks can compare known values.
 * When to use: Only by `startRegionalMatch`.
 * Expected outcome: Southern Mexico and the isthmus against NE Mexico and the Bajio in Central America, a small game,
 *   starting in April.
 * Exceptions: None.
 */
const REGIONAL_SCENARIO = Object.freeze({
  region: 'central_america',
  humanSide: 'southern_mexico_isthmus',
  aiSide: 'ne_mexico_bajio',
  startMonth: '4',
  gameSize: 'small',
});

/**
 * Waits for the new-game overlay to be open.
 *
 * Purpose: Both the first start and a new game opened from the match end on this overlay.
 * When to use: After launch, and after opening the overlay from the match.
 * Expected outcome: Resolves once `#game-over-overlay` is in the page without the `hidden` class.
 * Exceptions: Throws a Playwright timeout after 60 seconds.
 */
async function waitForNewGameOverlay(page) {
  await page.waitForFunction(() => {
    const overlay = document.getElementById('game-over-overlay');
    return overlay !== null && !overlay.classList.contains('hidden');
  }, null, { timeout: 60000 });
}

/**
 * Chooses the fixed scenario on the new-game overlay and starts the match.
 *
 * Purpose: Every run must show the same match so checks can compare known values.
 * When to use: Once, while the startup overlay is open.
 * Expected outcome: The overlay closes with Southern Europe against Northern Africa, a small game, starting in September.
 * Exceptions: Throws when a choice does not hold or the match does not start within 60 seconds.
 */
async function startScenarioMatch(page) {
  await page.waitForFunction((region) => {
    const select = document.getElementById('new-game-human-region-select');
    return select !== null && Array.from(select.options).some((o) => o.value === region || o.textContent.trim() === region);
  }, SCENARIO.humanRegion, { timeout: 60000 });
  // The overlay draws random homes and a random month after its lists load; let that finish first.
  await page.waitForTimeout(SETTLE_MS.overlay);
  await page.click('#new-game-tab-global');
  await page.selectOption('#new-game-human-region-select', SCENARIO.humanRegion);
  await page.selectOption('#new-game-ai-region-select', SCENARIO.aiRegion);
  await page.selectOption('#new-game-start-month', SCENARIO.startMonth);
  await page.selectOption('#new-game-size-select', SCENARIO.gameSize);
  await page.waitForTimeout(SETTLE_MS.click);
  const chosen = await page.evaluate(() => ({
    human: document.getElementById('new-game-human-region-select').value,
    ai: document.getElementById('new-game-ai-region-select').value,
    month: document.getElementById('new-game-start-month').value,
    size: document.getElementById('new-game-size-select').value,
  }));
  if (chosen.month !== SCENARIO.startMonth || chosen.size !== SCENARIO.gameSize
    || !chosen.human.includes(SCENARIO.humanRegion) || !chosen.ai.includes(SCENARIO.aiRegion)) {
    throw new Error(`scenario choices did not hold: ${JSON.stringify(chosen)}`);
  }
  await page.click('#new-game-btn');
  await page.waitForFunction(() => document.getElementById('game-over-overlay').classList.contains('hidden'), null, { timeout: 60000 });
  await page.waitForTimeout(SETTLE_MS.start);
}

/**
 * Opens the new-game overlay from the running match, the way a player would.
 *
 * Purpose: One scene checks the overlay opened from a match, not only at startup, and the regional match starts from it.
 * When to use: In the second session, before the regional match.
 * Expected outcome: The game menu is opened, New game is clicked, and the overlay is open.
 * Exceptions: Throws a Playwright timeout when a control is missing or the overlay does not open.
 */
async function openNewGameOverlay(page) {
  await page.click('#game-menu-btn');
  await page.click('#openrouter-new-btn');
  await waitForNewGameOverlay(page);
  await page.waitForTimeout(SETTLE_MS.click);
}

/**
 * Chooses the fixed regional scenario on the open new-game overlay and starts the match.
 *
 * Purpose: The regional scenes check the console on a map other than the world map.
 * When to use: While the new-game overlay is open.
 * Expected outcome: The overlay closes with `REGIONAL_SCENARIO`'s region and sides.
 * Exceptions: Throws when a choice does not hold or the match does not start within 90 seconds.
 */
async function startRegionalMatch(page) {
  await page.click('#new-game-tab-regional');
  await page.waitForTimeout(SETTLE_MS.click);
  await page.selectOption('#new-game-region-select', REGIONAL_SCENARIO.region);
  await page.waitForTimeout(SETTLE_MS.click);
  await page.selectOption('#new-game-human-side-select', REGIONAL_SCENARIO.humanSide);
  await page.selectOption('#new-game-ai-side-select', REGIONAL_SCENARIO.aiSide);
  await page.selectOption('#new-game-start-month', REGIONAL_SCENARIO.startMonth);
  await page.selectOption('#new-game-size-select', REGIONAL_SCENARIO.gameSize);
  await page.waitForTimeout(SETTLE_MS.click);
  const chosen = await page.evaluate(() => ({
    region: document.getElementById('new-game-region-select').value,
    human: document.getElementById('new-game-human-side-select').value,
    ai: document.getElementById('new-game-ai-side-select').value,
  }));
  if (chosen.region !== REGIONAL_SCENARIO.region || chosen.human !== REGIONAL_SCENARIO.humanSide || chosen.ai !== REGIONAL_SCENARIO.aiSide) {
    throw new Error(`regional choices did not hold: ${JSON.stringify(chosen)}`);
  }
  await page.click('#new-game-btn');
  await page.waitForFunction(() => document.getElementById('game-over-overlay').classList.contains('hidden'), null, { timeout: 90000 });
  await page.waitForTimeout(SETTLE_MS.start);
}

module.exports = { openNewGameOverlay, startRegionalMatch, startScenarioMatch, waitForNewGameOverlay };
```

- [ ] **Step 13: Edit `scripts/ui-smoke/ui-smoke.cjs`**

Uses the moved new-game steps and settle times. Parks the pointer on the battle header's title in a battle, where the spacer is hidden; waits for the beat on the battle header; makes sure the battle has closed before treating the world map as back; and records the battle at the 800 × 600 minimum.

1. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
const { SCENES, probePage, probeSelectors, runChecks } = require('./ui-smoke-checks.cjs');
```

Replace it with:

```js
const { SCENES, probePage, probeSelectors, runChecks } = require('./ui-smoke-checks.cjs');
const { SETTLE_MS } = require('./ui-smoke-scenes.cjs');
const { openNewGameOverlay, startRegionalMatch, startScenarioMatch, waitForNewGameOverlay } = require('./ui-smoke-new-game.cjs');
```

2. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
/**
 * The fixed scenario, as option values in the new-game overlay.
 *
 * Purpose: Every run shows the same match, so checks can compare known values.
 * When to use: Only by `startScenarioMatch`.
 * Expected outcome: Southern Europe against Northern Africa, a small game, starting in September.
 * Exceptions: None.
 */
const SCENARIO = Object.freeze({
  humanRegion: 'Southern Europe',
  aiRegion: 'Northern Africa',
  startMonth: '9',
  gameSize: 'small',
});

/**
 * The fixed regional scenario, as option values on the new-game overlay's Regional tab.
 *
 * Purpose: The regional scenes always show the same region and sides, so their checks can compare known values.
 * When to use: Only by `startRegionalMatch`.
 * Expected outcome: Southern Mexico and the isthmus against NE Mexico and the Bajio in Central America, a small game,
 *   starting in April.
 * Exceptions: None.
 */
const REGIONAL_SCENARIO = Object.freeze({
  region: 'central_america',
  humanSide: 'southern_mexico_isthmus',
  aiSide: 'ne_mexico_bajio',
  startMonth: '4',
  gameSize: 'small',
});

/**
```

Replace them with:

```js
/**
```

3. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
/**
 * How long to let the page settle, in milliseconds.
 *
 * Purpose: Map tiles, canvas redraws, and the new-game overlay's own start-up work finish before a probe.
 * When to use: After a size change (`resize`), a click (`click`), the overlay opening (`overlay`), a match start
 *   (`start`), and while the pointer rests on a control until its tip shows (`tip`, longer than the one-second dwell).
 *   `turn` is the longest a played turn or battle beat may take before the run gives up.
 * Expected outcome: Fixed waits; the checks do not depend on map tiles having loaded.
 * Exceptions: None.
 */
const SETTLE_MS = Object.freeze({ resize: 1500, click: 500, overlay: 2500, start: 2500, tip: 1500, turn: 120000 });

/**
```

Replace them with:

```js
/**
```

4. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
/**
 * Waits for the new-game overlay to be open.
 *
 * Purpose: Both the first start and a new game opened from the match end on this overlay.
 * When to use: After launch, and after opening the overlay from the match.
 * Expected outcome: Resolves once `#game-over-overlay` is in the page without the `hidden` class.
 * Exceptions: Throws a Playwright timeout after 60 seconds.
 */
async function waitForNewGameOverlay(page) {
  await page.waitForFunction(() => {
    const overlay = document.getElementById('game-over-overlay');
    return overlay !== null && !overlay.classList.contains('hidden');
  }, null, { timeout: 60000 });
}

/**
 * Chooses the fixed scenario on the new-game overlay and starts the match.
 *
 * Purpose: Every run must show the same match so checks can compare known values.
 * When to use: Once, while the startup overlay is open.
 * Expected outcome: The overlay closes with Southern Europe against Northern Africa, a small game, starting in September.
 * Exceptions: Throws when a choice does not hold or the match does not start within 60 seconds.
 */
async function startScenarioMatch(page) {
  await page.waitForFunction((region) => {
    const select = document.getElementById('new-game-human-region-select');
    return select !== null && Array.from(select.options).some((o) => o.value === region || o.textContent.trim() === region);
  }, SCENARIO.humanRegion, { timeout: 60000 });
  // The overlay draws random homes and a random month after its lists load; let that finish first.
  await page.waitForTimeout(SETTLE_MS.overlay);
  await page.click('#new-game-tab-global');
  await page.selectOption('#new-game-human-region-select', SCENARIO.humanRegion);
  await page.selectOption('#new-game-ai-region-select', SCENARIO.aiRegion);
  await page.selectOption('#new-game-start-month', SCENARIO.startMonth);
  await page.selectOption('#new-game-size-select', SCENARIO.gameSize);
  await page.waitForTimeout(SETTLE_MS.click);
  const chosen = await page.evaluate(() => ({
    human: document.getElementById('new-game-human-region-select').value,
    ai: document.getElementById('new-game-ai-region-select').value,
    month: document.getElementById('new-game-start-month').value,
    size: document.getElementById('new-game-size-select').value,
  }));
  if (chosen.month !== SCENARIO.startMonth || chosen.size !== SCENARIO.gameSize
    || !chosen.human.includes(SCENARIO.humanRegion) || !chosen.ai.includes(SCENARIO.aiRegion)) {
    throw new Error(`scenario choices did not hold: ${JSON.stringify(chosen)}`);
  }
  await page.click('#new-game-btn');
  await page.waitForFunction(() => document.getElementById('game-over-overlay').classList.contains('hidden'), null, { timeout: 60000 });
  await page.waitForTimeout(SETTLE_MS.start);
}

/**
 * Opens the new-game overlay from the running match, the way a player would.
 *
 * Purpose: One scene checks the overlay opened from a match, not only at startup, and the regional match starts from it.
 * When to use: In the second session, before the regional match.
 * Expected outcome: The game menu is opened, New game is clicked, and the overlay is open.
 * Exceptions: Throws a Playwright timeout when a control is missing or the overlay does not open.
 */
async function openNewGameOverlay(page) {
  await page.click('#game-menu-btn');
  await page.click('#openrouter-new-btn');
  await waitForNewGameOverlay(page);
  await page.waitForTimeout(SETTLE_MS.click);
}

/**
```

Replace them with:

```js
/**
```

5. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
 * Expected outcome: The pointer is over the top bar's spacer, which has no tip and no click action.
 * Exceptions: Throws when the top bar has no spacer.
 */
async function parkPointer(page) {
  const box = await page.locator('#app-topbar .topbar-spacer').boundingBox();
  if (!box) throw new Error('the top bar spacer is not on screen');
```

Replace them with:

```js
 * Expected outcome: The pointer is over the top bar's spacer, or over the battle header's title while a battle is open.
 *   Neither has a tip or a click action.
 * Exceptions: Throws when neither is on screen.
 */
async function parkPointer(page) {
  const spacer = await page.locator('#app-topbar .topbar-spacer').boundingBox();
  const box = spacer ?? (await page.locator('#battle-header-place').boundingBox());
  if (!box) throw new Error('neither the top bar spacer nor the battle header title is on screen');
```

6. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
 * Expected outcome: The top bar reads "Turn N · Planning" and Ready can be clicked.
```

Replace it with:

```js
 * Expected outcome: The battle header is gone, the top bar reads "Turn N · Planning", and Ready can be clicked.
```

7. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
    const planning = await page.evaluate(() => /^Turn \d+ · Planning$/.test(document.getElementById('topbar-turn-phase')?.textContent || '')
```

Replace it with:

```js
    // In a battle the date block is hidden but still names the world-map turn, so the battle header must be gone too.
    const planning = await page.evaluate(() => !document.getElementById('app-topbar')?.classList.contains('topbar-battle')
      && /^Turn \d+ · Planning$/.test(document.getElementById('topbar-turn-phase')?.textContent || '')
```

8. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
/**
 * Chooses the fixed regional scenario on the open new-game overlay and starts the match.
 *
 * Purpose: The regional scenes check the console on a map other than the world map.
 * When to use: While the new-game overlay is open.
 * Expected outcome: The overlay closes with `REGIONAL_SCENARIO`'s region and sides.
 * Exceptions: Throws when a choice does not hold or the match does not start within 90 seconds.
 */
async function startRegionalMatch(page) {
  await page.click('#new-game-tab-regional');
  await page.waitForTimeout(SETTLE_MS.click);
  await page.selectOption('#new-game-region-select', REGIONAL_SCENARIO.region);
  await page.waitForTimeout(SETTLE_MS.click);
  await page.selectOption('#new-game-human-side-select', REGIONAL_SCENARIO.humanSide);
  await page.selectOption('#new-game-ai-side-select', REGIONAL_SCENARIO.aiSide);
  await page.selectOption('#new-game-start-month', REGIONAL_SCENARIO.startMonth);
  await page.selectOption('#new-game-size-select', REGIONAL_SCENARIO.gameSize);
  await page.waitForTimeout(SETTLE_MS.click);
  const chosen = await page.evaluate(() => ({
    region: document.getElementById('new-game-region-select').value,
    human: document.getElementById('new-game-human-side-select').value,
    ai: document.getElementById('new-game-ai-side-select').value,
  }));
  if (chosen.region !== REGIONAL_SCENARIO.region || chosen.human !== REGIONAL_SCENARIO.humanSide || chosen.ai !== REGIONAL_SCENARIO.aiSide) {
    throw new Error(`regional choices did not hold: ${JSON.stringify(chosen)}`);
  }
  await page.click('#new-game-btn');
  await page.waitForFunction(() => document.getElementById('game-over-overlay').classList.contains('hidden'), null, { timeout: 90000 });
  await page.waitForTimeout(SETTLE_MS.start);
}

/**
```

Replace them with:

```js
/**
```

9. In `scripts/ui-smoke/ui-smoke.cjs`, find these lines. Together they occur exactly once:

```js
  await recordScene(page, report, outDir, SCENES.battleOrders);

  // Play beat 1. If one side is wiped out, close the result; the world-map turn then plays.
```

Replace them with:

```js
  await recordScene(page, report, outDir, SCENES.battleOrders);

  // The battle header at the 800 x 600 minimum, then back to the first size for the beat.
  await setViewport(app, page, SMALL_WINDOW);
  await page.waitForTimeout(SETTLE_MS.resize);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.battleSmallWindow);
  await setViewport(app, page, VIEWPORTS[0]);
  await page.waitForTimeout(SETTLE_MS.resize);

  // Play beat 1. If one side is wiped out, close the result; the world-map turn then plays.
```

10. In `scripts/ui-smoke/ui-smoke.cjs`, find this line. It occurs exactly once:

```js
    || (document.getElementById('topbar-turn-phase')?.textContent === 'Beat 2 · Tactical planning'
```

Replace it with:

```js
    || ((document.getElementById('battle-header-status')?.textContent || '').startsWith('Beat 2 · Tactical planning')
```

- [ ] **Step 14: Edit `scripts/ui-smoke/ui-smoke-map.cjs`**

Waits for the battle to open by its status line in the battle header.

1. In `scripts/ui-smoke/ui-smoke-map.cjs`, find this line. It occurs exactly once:

```js
 * Expected outcome: The top bar reads "Beat 1 · Tactical planning".
```

Replace it with:

```js
 * Expected outcome: The battle header's status line starts with "Beat 1 · Tactical planning".
```

2. In `scripts/ui-smoke/ui-smoke-map.cjs`, find this line. It occurs exactly once:

```js
  await page.waitForFunction(() => document.getElementById('topbar-turn-phase')?.textContent === 'Beat 1 · Tactical planning', null, { timeout: MAP_WAIT_MS.battle });
```

Replace it with:

```js
  await page.waitForFunction(() => (document.getElementById('battle-header-status')?.textContent || '').startsWith('Beat 1 · Tactical planning'), null, { timeout: MAP_WAIT_MS.battle });
```

- [ ] **Step 15: Create `scripts/ui-smoke/ui-smoke-battle-checks.cjs`**

A new file: the checks of the battle header. It shows in every battle scene with its title and status line, it stays hidden on the world map, and at 800 × 600 the title keeps its width and Help stays at the right end.

Create `scripts/ui-smoke/ui-smoke-battle-checks.cjs` with exactly this content:

```js
/**
 * Checks of the battle header for the UI smoke run: while a battle is open the top bar names the battle and its beat
 * in place of the match status.
 *
 * Purpose: Keeps the battle header's checks apart from the frame, console, scenario, and map chrome checks.
 * When to use: Required by `ui-smoke-checks.cjs`, which runs these rows after the map chrome checks.
 * Expected outcome: Rows in the same shape as the frame checks: `{ name, scenes, needs, run(p, el) }`.
 * Exceptions: None.
 */
'use strict';

const { SCENES, BATTLE_SCENES, MATCH_SCENES } = require('./ui-smoke-scenes.cjs');

/**
 * The parts of the top bar that show the match status and hide in a battle.
 *
 * Purpose: One list for the two checks that show and hide them.
 * When to use: The battle header checks.
 * Expected outcome: The human side's name, the Production readout, and the date.
 * Exceptions: None.
 */
const MATCH_STATUS_PARTS = Object.freeze(['#topbar-human-side', '#topbar-stat-production', '#topbar-date']);

/**
 * The battle header's title: the battle's world hex code in parentheses.
 *
 * Purpose: The title names where the fight is, such as "Battle at (E8)".
 * When to use: The battle header check.
 * Expected outcome: Matches "Battle at (" and a two-character hex code and ")".
 * Exceptions: None.
 */
const BATTLE_TITLE = /^Battle at \([0-9A-Z]{2}\)$/;

/**
 * The battle header's status line while the player plans a beat: the beat, the phase, and the match date.
 *
 * Purpose: The status line reads like "Beat 2 · Tactical planning · April, Year 1", with the weather after it when the
 *   battle has weather.
 * When to use: The battle header check.
 * Expected outcome: Matches the beat and phase, then " · " and the start of a date.
 * Exceptions: None.
 */
const BATTLE_STATUS = /^Beat \d+ · Tactical planning · \S/;

/**
 * Scenes on the world map, where the top bar shows the match status.
 *
 * Purpose: The battle header must stay out of the way outside a battle.
 * When to use: The match status check.
 * Expected outcome: Every match scene that is not a battle scene.
 * Exceptions: None.
 */
const WORLD_MAP_SCENES = Object.freeze(MATCH_SCENES.filter((scene) => !BATTLE_SCENES.includes(scene)));

/**
 * The battle header checks, one row each.
 *
 * Purpose: One table that a reviewer can read top to bottom.
 * When to use: Add a row when a battle header rule needs a machine check.
 * Expected outcome: Each row is independent of the others.
 * Exceptions: None.
 */
const BATTLE_CHECKS = Object.freeze([
  {
    name: 'battle-header-shown',
    scenes: BATTLE_SCENES,
    needs: ['#battle-header-place', '#battle-header-title', '#battle-header-status', ...MATCH_STATUS_PARTS],
    run: (p, el) => {
      if (!el('#battle-header-place').shown) return 'the battle header is not shown';
      const title = el('#battle-header-title').text;
      if (!BATTLE_TITLE.test(title)) return `the title reads "${title}", expected one like "Battle at (E8)"`;
      const status = el('#battle-header-status').text;
      if (!BATTLE_STATUS.test(status)) return `the status line reads "${status}", expected one like "Beat 2 · Tactical planning · April, Year 1"`;
      const shown = MATCH_STATUS_PARTS.filter((selector) => el(selector).shown);
      return shown.length === 0 ? null : `the match status still shows in a battle: ${shown.join(', ')}`;
    },
  },
  {
    name: 'battle-header-hidden-on-world-map',
    scenes: WORLD_MAP_SCENES,
    needs: ['#battle-header-place', '#battle-header-center', ...MATCH_STATUS_PARTS],
    run: (p, el) => {
      const shown = ['#battle-header-place', '#battle-header-center'].filter((selector) => el(selector).shown);
      if (shown.length > 0) return `the battle header shows outside a battle: ${shown.join(', ')}`;
      const hidden = MATCH_STATUS_PARTS.filter((selector) => !el(selector).shown);
      return hidden.length === 0 ? null : `the match status is hidden outside a battle: ${hidden.join(', ')}`;
    },
  },
  {
    name: 'battle-header-small-window',
    scenes: [SCENES.battleSmallWindow],
    needs: ['#battle-header-title', '#battle-header-place', '#topbar-help-btn'],
    run: (p, el) => {
      const title = el('#battle-header-title');
      const place = el('#battle-header-place');
      if (title.x + title.w > place.x + place.w + 1) return `the title ${title.x + title.w} runs past its block ${place.x + place.w}`;
      const help = el('#topbar-help-btn');
      return help.shown && Math.abs(help.x + help.w - p.viewport.w) <= 1
        ? null
        : `Help is not at the right end of the header in the ${p.viewport.w} px window`;
    },
  },
]);

module.exports = { BATTLE_CHECKS };
```

- [ ] **Step 16: Edit `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`**

The battle-start check reads the beat from the battle header.

In `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`, find these lines. Together they occur exactly once:

```js
    needs: ['#topbar-turn-phase', '#console-subtitle'],
    run: (p, el) => {
      const line = `${el('#topbar-turn-phase').text} / ${el('#console-subtitle').text}`;
      return line === 'Beat 1 · Tactical planning / 0 queued for beat 1'
        ? null
        : `the top bar and the Orders subtitle read "${line}", expected "Beat 1 · Tactical planning / 0 queued for beat 1"`;
```

Replace them with:

```js
    needs: ['#battle-header-status', '#console-subtitle'],
    run: (p, el) => {
      const status = el('#battle-header-status').text;
      if (!status.startsWith('Beat 1 · Tactical planning')) return `the battle header reads "${status}", expected beat 1 planning`;
      const subtitle = el('#console-subtitle').text;
      return subtitle === '0 queued for beat 1' ? null : `the Orders subtitle reads "${subtitle}", expected "0 queued for beat 1"`;
```

- [ ] **Step 17: Edit `scripts/ui-smoke/ui-smoke-checks.cjs`**

Adds the battle header checks to the run.

1. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
const { MAP_CHROME_CHECKS } = require('./ui-smoke-map-chrome-checks.cjs');
```

Replace it with:

```js
const { MAP_CHROME_CHECKS } = require('./ui-smoke-map-chrome-checks.cjs');
const { BATTLE_CHECKS } = require('./ui-smoke-battle-checks.cjs');
```

2. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
 *   `ui-smoke-scenario-checks.cjs`, and checks of the chrome on the map in `ui-smoke-map-chrome-checks.cjs`.
```

Replace it with:

```js
 *   `ui-smoke-scenario-checks.cjs`, checks of the chrome on the map in `ui-smoke-map-chrome-checks.cjs`, and checks of
 *   the battle header in `ui-smoke-battle-checks.cjs`.
```

3. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
 * Every check the run applies: the frame's, then the console's, then the later scenarios', then the map chrome's.
```

Replace it with:

```js
 * Every check the run applies: the frame's, then the console's, then the later scenarios', then the map chrome's, then
 * the battle header's.
```

4. In `scripts/ui-smoke/ui-smoke-checks.cjs`, find this line. It occurs exactly once:

```js
const CHECKS = Object.freeze([...FRAME_CHECKS, ...CONSOLE_CHECKS, ...SCENARIO_CHECKS, ...MAP_CHROME_CHECKS]);
```

Replace it with:

```js
const CHECKS = Object.freeze([...FRAME_CHECKS, ...CONSOLE_CHECKS, ...SCENARIO_CHECKS, ...MAP_CHROME_CHECKS, ...BATTLE_CHECKS]);
```

- [ ] **Step 18: Edit `doc/ux/top-bar.md`**

Describes the battle header and how the bar switches to it.

1. In `doc/ux/top-bar.md`, find these lines. Together they occur exactly once:

````markdown
The bar across the top of the window. It holds the game menu button, the two sides, four match readouts, the date block, and the Settings and Help buttons.

## Purpose

Show the match's standing and its date at a glance, without opening a panel, and give one place to reach the game menu.
````

Replace them with:

````markdown
The bar across the top of the window. It holds the game menu button, the two sides, four match readouts, the date block, and the Settings and Help buttons. In a battle it becomes the battle header.

## Purpose

Show the match's standing and its date at a glance, without opening a panel, and give one place to reach the game menu. In a battle, show where the fight is and which beat it is.
````

2. In `doc/ux/top-bar.md`, find these lines. Together they occur exactly once:

````markdown
- The date block, on two lines. The first line is the match date, such as "March, Year 1" on the global map or "March 8th, Year 1" on a regional map. The second line is "Turn N · Planning" outside a battle. In a battle it is "Beat N · Tactical planning" while the player drafts and "Beat N · Tactical resolution" while a beat resolves or plays back, and the first line ends with the battle's weather icon and word when the weather bonus is on. With no match loaded, both lines are an em dash.
- Settings and Help. Both are disabled in this version.
- Below a 1360 px window, the captions Production, Forces, Your home, and Enemy home hide and the numbers stay. Below 1100 px, each side's name is shortened sooner.
- Control tips for the readouts and the buttons are in [control-tooltips.md](control-tooltips.md). The Forces tip lists each unit type against its cap.
````

Replace them with:

````markdown
- The date block, on two lines. The first line is the match date, such as "March, Year 1" on the global map or "March 8th, Year 1" on a regional map. The second line is "Turn N · Planning", with the strategic phase. With no match loaded, both lines are an em dash.
- Settings and Help. Both are disabled in this version.
- Below a 1360 px window, the captions Production, Forces, Your home, and Enemy home hide and the numbers stay. Below 1100 px, each side's name is shortened sooner.
- Control tips for the readouts and the buttons are in [control-tooltips.md](control-tooltips.md). The Forces tip lists each unit type against its cap.

While a battle is open, the bar is the battle header. Its face is darker and warmer (`--battle-header-bg`, with a `--battle-header-border` edge), and the sides, the readouts, and the date block are hidden. From left to right:

- The game menu button.
- The title, "Battle at (E8)", naming the battle's world hex by its code (`orderTargetHexCode`), then that hex's caption as the hex tooltip shows it, with flags. The caption ends in an ellipsis when the header is narrow; the title keeps its width.
- Under the title, the status line: "Beat N · Tactical planning" while the player drafts, or "Beat N · Tactical resolution" while a beat resolves or plays back, then the match date, then the battle's weather icon and word when the battle has weather (`formatBattleHeaderStatus` in `src/shared/battleHeaderText.ts`).
- Settings and Help.
````

3. In `doc/ux/top-bar.md`, find this line. It occurs exactly once:

````markdown
- The sides, the readouts, and the date block refresh with each game-state snapshot, on tactical entry and exit, after a tactical Ready commit, and when beat playback ends.
````

Replace it with:

````markdown
- The sides, the readouts, the date block, and the battle header refresh with each game-state snapshot, on tactical entry and exit, after a tactical Ready commit, and when beat playback ends.
````

4. In `doc/ux/top-bar.md`, find this line. It occurs exactly once:

````markdown
- Match loaded: names, readouts, and the date block show the match.
````

Replace it with:

````markdown
- Match loaded: names, readouts, and the date block show the match.
- Battle: the battle header shows in place of the names, readouts, and date block.
````

5. In `doc/ux/top-bar.md`, find this line. It occurs exactly once:

````markdown
- During a battle, the two date-block lines never describe different theaters.
````

Replace it with:

````markdown
- The match status and the battle header never show together. The date block always describes the world-map turn.
````

6. In `doc/ux/top-bar.md`, find these lines. Together they occur exactly once:

````markdown
| Second date-block line | Strategic turn and phase | Battle beat and tactical phase |
| First date-block line | Match date | Match date, then the battle's weather when the weather bonus is on |
| Readouts | Strategic snapshot | The same strategic snapshot; a battle does not change them |
````

Replace them with:

````markdown
| What the bar shows | The match status: sides, readouts, and the date block | The battle header: the title, the hex caption, and the status line |
| Turn line | "Turn N · Planning" in the date block | "Beat N · Tactical planning" in the status line, then the match date and the battle's weather |
| Face | `--chrome-bg-deep` | `--battle-header-bg` |
| Readouts | Strategic snapshot | Hidden; a battle does not change them |
````

7. In `doc/ux/top-bar.md`, find these lines. Together they occur exactly once:

````markdown
- `static/index.html` (`#app-topbar`, `#game-menu-btn`, `#topbar-human-side`, `#topbar-opponent-side`, `#topbar-stat-production`, `#topbar-stat-production-suffix`, `#topbar-stat-forces-host`, `#topbar-stat-forces`, `#topbar-stat-forces-cap`, `#topbar-stat-human-home`, `#topbar-stat-human-home-total`, `#topbar-stat-opponent-home`, `#topbar-stat-opponent-home-total`, `#topbar-date`, `#topbar-turn-phase`, `#topbar-settings-btn`, `#topbar-help-btn`)
- `static/frameChrome.css`
- `src/renderer/chrome/topBar.ts`
- `src/renderer/core/uiState.ts` (`updateGameStateSidebar`, `setMainUIControlsEnabled`)
- `src/shared/topBarStats.ts`
- `src/shared/topBarDateBlock.ts`
````

Replace them with:

````markdown
- `static/index.html` (`#app-topbar`, `#game-menu-btn`, `#topbar-human-side`, `#topbar-opponent-side`, `#topbar-stat-production`, `#topbar-stat-production-suffix`, `#topbar-stat-forces-host`, `#topbar-stat-forces`, `#topbar-stat-forces-cap`, `#topbar-stat-human-home`, `#topbar-stat-human-home-total`, `#topbar-stat-opponent-home`, `#topbar-stat-opponent-home-total`, `#topbar-date`, `#topbar-turn-phase`, `#topbar-settings-btn`, `#topbar-help-btn`, `#battle-header-place`, `#battle-header-title`, `#battle-header-caption`, `#battle-header-status`, `#battle-header-center`)
- `static/frameChrome.css`
- `src/renderer/chrome/topBar.ts`
- `src/renderer/chrome/battleHeader.ts` (`renderBattleHeader`)
- `src/renderer/core/uiState.ts` (`updateGameStateSidebar`, `setMainUIControlsEnabled`)
- `src/shared/topBarStats.ts`
- `src/shared/topBarDateBlock.ts`
- `src/shared/battleHeaderText.ts`
````

- [ ] **Step 19: Edit `doc/ux/modes-and-transitions.md`**

Tactical planning shows the battle header.

1. In `doc/ux/modes-and-transitions.md`, find this line. It occurs exactly once:

````markdown
The player sees the battle map for one contested hex, the Exit Battle control, the top bar, and the same right panel. The top bar's date block shows the beat. The player drafts tactical orders and presses Ready to commit a beat. Exit Battle is enabled while the player drafts. It is disabled from the tactical Ready commit until that beat's playback ends, and hidden while the annihilation dialog is open. Its second line reads "Beat N · Tactical planning" while drafting and "Beat N · Tactical resolution" while a beat resolves.
````

Replace it with:

````markdown
The player sees the battle map for one contested hex, the Exit Battle control, the top bar as the battle header, and the same right panel. The battle header names the battle and shows the beat. The player drafts tactical orders and presses Ready to commit a beat. Exit Battle is enabled while the player drafts. It is disabled from the tactical Ready commit until that beat's playback ends, and hidden while the annihilation dialog is open. The header's status line reads "Beat N · Tactical planning" while drafting and "Beat N · Tactical resolution" while a beat resolves.
````

2. In `doc/ux/modes-and-transitions.md`, find this text. It occurs exactly once:

````markdown
The top bar and the right panel stay visible in both theaters; the top bar's date block and the panel's order groups follow the active theater.
````

Replace it with:

````markdown
The top bar and the right panel stay visible in both theaters. In a battle the top bar shows the battle header, and the panel's order groups follow the active theater.
````

- [ ] **Step 20: Edit `doc/ux/map-surface.md`**

The battle header shows the beat.

In `doc/ux/map-surface.md`, find this line. It occurs exactly once:

````markdown
| Turn shown | Top bar, strategic turn | Top bar, tactical beat |
````

Replace it with:

````markdown
| Turn shown | Top bar, strategic turn | Battle header, tactical beat |
````

- [ ] **Step 21: Edit `doc/ux/right-panel-command-bar.md`**

Points to the battle header's status line in a battle.

In `doc/ux/right-panel-command-bar.md`, find this line. It occurs exactly once:

````markdown
Ready, in the right panel's footer, and the Ranged and air-strike controls in the [selection panel](selection-panel.md). The game-state readout is the date block in the [top bar](top-bar.md).
````

Replace it with:

````markdown
Ready, in the right panel's footer, and the Ranged and air-strike controls in the [selection panel](selection-panel.md). The game-state readout is the date block in the [top bar](top-bar.md), or the battle header's status line in a battle.
````

- [ ] **Step 22: Edit `doc/ux-specification.md`**

Adds the battle header to the top bar's routing row and description, and names the new smoke files.

1. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
`npm run ui:smoke` checks the layout after a change. It builds the app and starts it in Electron with a throwaway user-data folder (the `AGENT_WARS_USER_DATA_DIR` environment variable), three times over that folder. The first session starts one fixed global match and records its scenes, one of them at the 800 × 600 minimum window. The second reopens that match, opens a battle in it, and then starts a new regional match. The third reopens the regional match as a finished one. Between sessions the run changes only its throwaway copy of the match: before the second it moves the enemy's land units into the hex where the player has the most, so a battle can start there, and before the third it marks the match as lost (`scripts/ui-smoke/ui-smoke-session.cjs`, which runs `scripts/ui-smoke/ui-smoke-db-edit.cjs` under Electron's own Node). The run writes numbered screenshots and `report.json` to `.test/ui-smoke/<label>/`. Pass `-- --label <name>` to name that folder. It prints one PASS or FAIL line per check and exits with an error when any check fails. The frame's checks are in `scripts/ui-smoke/ui-smoke-checks.cjs`, the console's are in `scripts/ui-smoke/ui-smoke-console-checks.cjs`, the checks for the later scenarios (the small window, the reopened match, the battle, the regional match, and the finished match) are in `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`, and the checks of the minimap panel, the legend, and Leaflet's controls are in `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`; add one to the matching file when a layout rule needs a machine check. Scenes that click units find them through the game state and the main map (`scripts/ui-smoke/ui-smoke-map.cjs`).
````

Replace it with:

````markdown
`npm run ui:smoke` checks the layout after a change. It builds the app and starts it in Electron with a throwaway user-data folder (the `AGENT_WARS_USER_DATA_DIR` environment variable), three times over that folder. The first session starts one fixed global match and records its scenes, one of them at the 800 × 600 minimum window. The second reopens that match, opens a battle in it, shows that battle at the 800 × 600 minimum too, and then starts a new regional match. The third reopens the regional match as a finished one. Between sessions the run changes only its throwaway copy of the match: before the second it moves the enemy's land units into the hex where the player has the most, so a battle can start there, and before the third it marks the match as lost (`scripts/ui-smoke/ui-smoke-session.cjs`, which runs `scripts/ui-smoke/ui-smoke-db-edit.cjs` under Electron's own Node). The run writes numbered screenshots and `report.json` to `.test/ui-smoke/<label>/`. Pass `-- --label <name>` to name that folder. It prints one PASS or FAIL line per check and exits with an error when any check fails. The frame's checks are in `scripts/ui-smoke/ui-smoke-checks.cjs`, the console's are in `scripts/ui-smoke/ui-smoke-console-checks.cjs`, the checks for the later scenarios (the small window, the reopened match, the battle, the regional match, and the finished match) are in `scripts/ui-smoke/ui-smoke-scenario-checks.cjs`, the checks of the minimap panel, the legend, and Leaflet's controls are in `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, and the checks of the battle header are in `scripts/ui-smoke/ui-smoke-battle-checks.cjs`; add one to the matching file when a layout rule needs a machine check. Scenes that click units find them through the game state and the main map (`scripts/ui-smoke/ui-smoke-map.cjs`), and the steps on the new-game overlay are in `scripts/ui-smoke/ui-smoke-new-game.cjs`.
````

2. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
| The top bar, its readouts, or its date block | [modes-and-transitions.md](ux/modes-and-transitions.md) | [top-bar.md](ux/top-bar.md) |
````

Replace it with:

````markdown
| The top bar, its readouts, its date block, or the battle header | [modes-and-transitions.md](ux/modes-and-transitions.md) | [top-bar.md](ux/top-bar.md) |
````

3. In `doc/ux-specification.md`, find this line. It occurs exactly once:

````markdown
- [top-bar.md](ux/top-bar.md): the bar across the top: the two sides, the Production, Forces, and home readouts, and the date block.
````

Replace it with:

````markdown
- [top-bar.md](ux/top-bar.md): the bar across the top: the two sides, the Production, Forces, and home readouts, and the date block, and the battle header it becomes in a battle.
````

- [ ] **Step 23: Edit `doc/ui-style-guide.md`**

Adds the battle header's colors.

In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
| Dividers inside the top bar and the rail | `#243246` | `--chrome-divider` |
````

Replace it with:

````markdown
| Dividers inside the top bar and the rail | `#243246` | `--chrome-divider` |
| Battle header bg / bottom edge | `#17141f` / `#4a3247` | `--battle-header-bg` / `--battle-header-border`. The top bar's face while a battle is open, so the theater reads at a glance |
````

- [ ] **Step 24: Edit `doc/how-to-play.md`**

Mentions the battle header.

In `doc/how-to-play.md`, find this line. It occurs exactly once:

````markdown
- **Beats:** each Ready in a battle resolves one beat: air strikes, ranged fire, movement, then melee.
````

Replace it with:

````markdown
- **Beats:** each Ready in a battle resolves one beat: air strikes, ranged fire, movement, then melee. The top bar becomes the battle header, which names the battle's hex and the beat.
````

## Verify

- [ ] **Step 25: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 26: Full tests**

Run the full tests. Expected: exit 0, test total **885**, failure total **0**.

- [ ] **Step 27: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/shared/battleHeaderText.ts src/shared/battleHeaderText.test.ts src/shared/topBarDateBlock.ts src/shared/topBarDateBlock.test.ts src/renderer/chrome/battleHeader.ts src/renderer/chrome/topBar.ts static/index.html static/shellChrome.css static/frameChrome.css scripts/ui-smoke/ui-smoke-scenes.cjs scripts/ui-smoke/ui-smoke-new-game.cjs scripts/ui-smoke/ui-smoke.cjs scripts/ui-smoke/ui-smoke-map.cjs scripts/ui-smoke/ui-smoke-battle-checks.cjs scripts/ui-smoke/ui-smoke-scenario-checks.cjs scripts/ui-smoke/ui-smoke-checks.cjs doc/ux/top-bar.md doc/ux/modes-and-transitions.md doc/ux/map-surface.md doc/ux/right-panel-command-bar.md doc/ux-specification.md doc/ui-style-guide.md doc/how-to-play.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/shared/battleHeaderText.ts` | `9dfd3fd83cbc9a21` |
| `src/shared/battleHeaderText.test.ts` | `79fbd1baefd96857` |
| `src/shared/topBarDateBlock.ts` | `b77fff754397e2a9` |
| `src/shared/topBarDateBlock.test.ts` | `b49f712ecd0757c6` |
| `src/renderer/chrome/battleHeader.ts` | `eb9897bd51ff5920` |
| `src/renderer/chrome/topBar.ts` | `b62bad9fc177a2c1` |
| `static/index.html` | `e1735751930b9a90` |
| `static/shellChrome.css` | `70e66edfaf60f66f` |
| `static/frameChrome.css` | `ee7f10d27ff3c952` |
| `scripts/ui-smoke/ui-smoke-scenes.cjs` | `34a63b4d8cd403d1` |
| `scripts/ui-smoke/ui-smoke-new-game.cjs` | `6f1455985ee0d272` |
| `scripts/ui-smoke/ui-smoke.cjs` | `7c28a0cddd59192e` |
| `scripts/ui-smoke/ui-smoke-map.cjs` | `37eb151122849609` |
| `scripts/ui-smoke/ui-smoke-battle-checks.cjs` | `55d6b51f8a5b32ca` |
| `scripts/ui-smoke/ui-smoke-scenario-checks.cjs` | `616125aaf9a7a51d` |
| `scripts/ui-smoke/ui-smoke-checks.cjs` | `b87e3c147fdb7534` |
| `doc/ux/top-bar.md` | `49ed32a9bb41ddc4` |
| `doc/ux/modes-and-transitions.md` | `d6a84b34e98f9430` |
| `doc/ux/map-surface.md` | `0a6a43c6d0993ef6` |
| `doc/ux/right-panel-command-bar.md` | `8040cdb133f53352` |
| `doc/ux-specification.md` | `75e862acad7e691b` |
| `doc/ui-style-guide.md` | `edc8547d41d54b19` |
| `doc/how-to-play.md` | `5c2a837e65e106d6` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

- [ ] **Step 28: Smoke run**

```powershell
npm run ui:smoke -- --label battle-header
```

Expected summary line:

```text
ui-smoke battle-header: 391 passed, 0 failed, 0 page errors, 33 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\battle-header
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/battle-header/report.json`.

- [ ] **Step 29: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/battle-header/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast. The small origin flags beside unit names can also differ from run to run. The battle's units are placed when it opens, so the battle screenshots can differ in where the units stand.

- `25-battle-start.png` against [ui-facelift-battle-1-expected-header.png](ui-facelift-battle-1-expected-header.png): the battle header on its darker face: "Battle at (E8)" or another hex code, the hex's caption with flags, and under it "Beat 1 · Tactical planning", the date, and the weather. The sides, the readouts, and the date block are gone, and Settings and Help sit at the right. Exit Battle is still at the bottom of the map.
- `28-battle-small-window.png` against [ui-facelift-battle-1-expected-small-window.png](ui-facelift-battle-1-expected-small-window.png): the same battle at 800 × 600. The title and the status line fit, and Settings and Help stay at the right end.

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

1. With your own match, enter a battle from a tactical entry marker: the top bar turns darker, the sides, readouts, and date block disappear, and the bar reads "Battle at (code)", the hex's caption with flags, and "Beat 1 · Tactical planning", the date, and the weather.
2. Queue an order and press Ready: while the beat plays back the status line reads "Beat 1 · Tactical resolution"; afterwards "Beat 2 · Tactical planning".
3. Open the game menu during the battle: it opens and closes as on the world map.
4. Leave the battle with Exit Battle at the bottom of the map: the bar shows the sides, the readouts, and "Turn N · Planning" again.
5. Shrink the window to its 800 × 600 minimum during a battle: the title stays whole, and the caption ends in an ellipsis if it does not fit.

## Next

Plan 2 moves Exit Battle into the battle header.
