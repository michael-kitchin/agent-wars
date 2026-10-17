# UI Facelift Battle, Plan 3 of 3: Force Bar

> **For agentic workers:** Execute this plan from top to bottom, one step at a time. Steps use checkbox (`- [ ]`) syntax for tracking. When a check does not give the expected result, stop and report the command, the actual output, and the expected output. Do not make a check pass by changing a test, a check, the smoke harness, or this plan.

**Goal:** Fill the middle of the battle header with the force bar: the player's sub-unit count and "yours", the caption "Sub-units in battle", then "enemy" and the opponent's count, over a bar whose teal part is the player's share. Below a 1100 px window the bar narrows to the counts and the bar.

**Spec:** [ui-facelift-spec.md](ui-facelift-spec.md) is the target for the whole milestone. This plan is part 3 of the three that build the spec's Phase 5; [ui-facelift-battle-execution-plan.md](ui-facelift-battle-execution-plan.md) lists them. They run in order, one at a time, and the reviewer commits each plan's result before the next one starts. When this plan and the spec disagree, follow this plan and report the disagreement.

**What this plan changes:**

- `src/shared/battleForceCounts.ts`: counts each side's sub-units, including any carried by a ship, and the player's share. Unit-tested.
- `renderBattleHeader` writes the counts and the teal part's width. While a beat plays back, the snapshot already holds the beat's result, so the bar keeps the counts from before the beat until the playback ends, as the map does.
- The middle block now keeps the bar's width, so the title's caption gives way first in a narrow window. Two new color tokens give the bar brighter forms of the side colors. The bar has a tip.
- The battle checks cover the counts against the bar, and the narrow bar at 800 × 600.
- `doc/` describes the force bar.

**Out of scope:**

- Anything else in the battle header.

**How this plan was checked:** every step below was applied to a copy of the repository in the state the previous plan leaves, and the result matched the verified files exactly. On that result, the fast loop and the full tests passed, and the smoke run passed against the real app in Electron. The numbers in Verify come from those runs, and the Exact-match check compares your files with that result.

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
2. `doc/ux/top-bar.md`.

- [ ] **Check the starting point**

```powershell
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing, or only `.spec/` files. Then check that plan 2 is in and this plan is not:

```powershell
[bool](Select-String -Path static/index.html -Pattern 'tactical-exit-host' -Quiet)
Test-Path src/shared/battleForceCounts.ts
```

Expected: `True`, then `False`. Otherwise stop and report.

- [ ] **Run the full tests once**

Run the full tests from Verification Commands. Expected: exit 0, test total **885**, failure total **0**. Any other result means the starting point is not what this plan expects: stop and report.

## Steps

The steps touch these files, in this order:

- `src/shared/battleForceCounts.ts`
- `src/shared/battleForceCounts.test.ts`
- `src/renderer/chrome/battleHeader.ts`
- `src/renderer/chrome/frameTooltipText.ts`
- `static/index.html`
- `static/shellChrome.css`
- `static/frameChrome.css`
- `scripts/ui-smoke/ui-smoke-battle-checks.cjs`
- `doc/ux/top-bar.md`
- `doc/ux/control-tooltips.md`
- `doc/ui-style-guide.md`
- `doc/how-to-play.md`

- [ ] **Step 1: Create `src/shared/battleForceCounts.ts`**

A new file: each side's sub-units in a battle and the player's share of them. A pure function with no page access.

Create `src/shared/battleForceCounts.ts` with exactly this content:

```ts
/**
 * Counts for the battle header's force bar: each side's sub-units in a battle and the player's share of them.
 */
import type { TacticalSubUnitSnapshot } from './tacticalBattleTypes';

/**
 * Each side's sub-units in a battle, and the player's share of all of them.
 *
 * Purpose: The force bar shows both counts and draws the player's share as the teal part of the bar.
 * When to use: Returned by `countBattleForces`.
 * Expected outcome: Whole counts, and a share from 0 to 1.
 * Exceptions: None.
 */
export type BattleForceCounts = {
  readonly human: number;
  readonly opponent: number;
  readonly humanShare: number;
};

/**
 * Counts each side's sub-units in a battle and works out the player's share.
 *
 * Purpose: The player sees at a glance how the two sides compare in the fight.
 * When to use: With the battle snapshot's `subUnits`. A battle has no fog of war, so the snapshot lists every enemy
 *   sub-unit.
 * Expected outcome: Every sub-unit is counted for its side, including one carried by a ship. `humanShare` is the
 *   player's count over both counts, or 0.5 when neither side has any.
 * Exceptions: None.
 */
export function countBattleForces(subUnits: readonly Pick<TacticalSubUnitSnapshot, 'player'>[]): BattleForceCounts {
  const human = subUnits.filter((sub) => sub.player === 'human').length;
  const opponent = subUnits.length - human;
  const total = human + opponent;
  return { human, opponent, humanShare: total > 0 ? human / total : 0.5 };
}
```

- [ ] **Step 2: Create `src/shared/battleForceCounts.test.ts`**

Covers both sides, a sub-unit carried by a ship, a side that is alone, and an empty battle.

Create `src/shared/battleForceCounts.test.ts` with exactly this content:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countBattleForces } from './battleForceCounts';
import type { TacticalSubUnitSnapshot } from './tacticalBattleTypes';

test('countBattleForces counts each side and the player share', () => {
  const subUnits = [{ player: 'human' as const }, { player: 'human' as const }, { player: 'opponent' as const }, { player: 'opponent' as const }];
  assert.deepEqual(countBattleForces(subUnits), { human: 2, opponent: 2, humanShare: 0.5 });
});

test('countBattleForces counts a sub-unit carried by a ship', () => {
  const subUnits: Pick<TacticalSubUnitSnapshot, 'player' | 'embarkedOnSubUnitId'>[] = [
    { player: 'human', embarkedOnSubUnitId: null },
    { player: 'human', embarkedOnSubUnitId: 'ship-1' },
    { player: 'opponent', embarkedOnSubUnitId: null },
  ];
  assert.deepEqual(countBattleForces(subUnits), { human: 2, opponent: 1, humanShare: 2 / 3 });
});

test('countBattleForces gives the whole bar to a side that is alone', () => {
  assert.deepEqual(countBattleForces([{ player: 'human' }, { player: 'human' }, { player: 'human' }]), { human: 3, opponent: 0, humanShare: 1 });
});

test('countBattleForces splits an empty battle evenly', () => {
  assert.deepEqual(countBattleForces([]), { human: 0, opponent: 0, humanShare: 0.5 });
});
```

- [ ] **Step 3: Edit `src/renderer/chrome/battleHeader.ts`**

Writes the force bar's counts and the width of its teal part. While a beat plays back, the bar keeps the counts from before the beat until the playback ends.

1. In `src/renderer/chrome/battleHeader.ts`, find these lines. Together they occur exactly once:

```ts
 * The battle header: while a battle is open, the top bar names the battle and its beat in place of the match status.
 */
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
```

Replace them with:

```ts
 * The battle header: while a battle is open, the top bar names the battle and its beat, and shows the force bar, in
 * place of the match status.
 */
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { countBattleForces } from '../../shared/battleForceCounts';
```

2. In `src/renderer/chrome/battleHeader.ts`, find these lines. Together they occur exactly once:

```ts
/**
 * Shows the battle header while a battle is open, and the match status otherwise.
```

Replace them with:

```ts
/**
 * Writes the force bar: each side's sub-unit count and the player's share of the bar.
 *
 * Purpose: The player sees at a glance how the two sides compare in the fight.
 * When to use: From `renderBattleHeader` while a battle is open.
 * Expected outcome: The counts and the teal part of the bar follow `countBattleForces` for the battle's sub-units. While
 *   a beat plays back, the snapshot already holds the beat's result, so the bar keeps the counts it showed before the
 *   beat and catches up when the playback ends, as the map does.
 * Exceptions: None; missing elements are skipped.
 */
function renderBattleForceBar(battle: TacticalBattleSnapshot): void {
  const bar = document.getElementById('battle-force-bar');
  if (!bar) return;
  if (S.resolutionMoveAnimation != null && bar.dataset.battleId === battle.battleId) return;
  bar.dataset.battleId = battle.battleId;
  const counts = countBattleForces(battle.subUnits);
  const humanCount = document.getElementById('battle-force-human-count');
  if (humanCount) humanCount.textContent = counts.human.toLocaleString('en-US');
  const opponentCount = document.getElementById('battle-force-opponent-count');
  if (opponentCount) opponentCount.textContent = counts.opponent.toLocaleString('en-US');
  const fill = document.getElementById('battle-force-human-fill');
  if (fill) fill.style.width = `${(counts.humanShare * 100).toFixed(1)}%`;
}

/**
 * Shows the battle header while a battle is open, and the match status otherwise.
```

3. In `src/renderer/chrome/battleHeader.ts`, find these lines. Together they occur exactly once:

```ts
 *   battle's weather when it has one. Otherwise the bar shows the match status, and the next battle's caption is
 *   requested again.
```

Replace them with:

```ts
 *   battle's weather when it has one, and the force bar from `renderBattleForceBar`. Otherwise the bar shows the match
 *   status, and the next battle's caption and counts are written afresh.
```

4. In `src/renderer/chrome/battleHeader.ts`, find this line. It occurs exactly once:

```ts
    if (captionEl) delete captionEl.dataset.battleId;
```

Replace it with:

```ts
    if (captionEl) delete captionEl.dataset.battleId;
    const bar = document.getElementById('battle-force-bar');
    if (bar) delete bar.dataset.battleId;
```

5. In `src/renderer/chrome/battleHeader.ts`, find this line. It occurs exactly once:

```ts
  renderBattleHeaderCaption(battle);
```

Replace it with:

```ts
  renderBattleHeaderCaption(battle);
  renderBattleForceBar(battle);
```

- [ ] **Step 4: Edit `src/renderer/chrome/frameTooltipText.ts`**

Adds the force bar's tip.

In `src/renderer/chrome/frameTooltipText.ts`, find this line. It occurs exactly once:

```ts
export const mapLegendToggleTooltipText = 'Show or hide the terrain legend and its style choice.';
```

Replace it with:

```ts
export const mapLegendToggleTooltipText = 'Show or hide the terrain legend and its style choice.';

/**
 * The battle header's force bar tip.
 *
 * Purpose: Says what the two counts include, and that the enemy count is not limited by fog of war.
 * When to use: `#battle-force-bar`.
 * Expected outcome: The control tip shows this sentence.
 * Exceptions: None.
 */
export const battleForceBarTooltipText =
  'Sub-units each side has in this battle, counting any carried by a ship. A battle has no fog of war, so both counts are exact.';
```

- [ ] **Step 5: Checkpoint: build, types, and lint**

Run these one at a time:

```powershell
npm run build:main
npm run check:renderer-types
npm run lint
```

Each exits 0, and `check:renderer-types` prints `check-renderer-typecheck: ok`. An error here comes from the steps above: open the file the error names, compare it with its step, fix your copying mistake, and run the three again. If the steps as written cannot compile, stop and report.

- [ ] **Step 6: Edit `static/index.html`**

Adds the force bar to the battle header's middle block.

In `static/index.html`, find this line. It occurs exactly once:

```html
    <div id="battle-header-center" class="battle-header-center battle-header-only"></div>
```

Replace it with:

```html
    <div id="battle-header-center" class="battle-header-center battle-header-only">
      <div id="battle-force-bar" class="battle-force-bar" data-control-tooltip="Sub-units each side has in this battle, counting any carried by a ship. A battle has no fog of war, so both counts are exact.">
        <div class="battle-force-labels">
          <span class="battle-force-side"><span id="battle-force-human-count" class="battle-force-count">—</span><span class="battle-force-word">yours</span></span>
          <span class="battle-force-caption">Sub-units in battle</span>
          <span class="battle-force-side"><span class="battle-force-word">enemy</span><span id="battle-force-opponent-count" class="battle-force-count">—</span></span>
        </div>
        <div class="battle-force-track" aria-hidden="true"><div id="battle-force-human-fill" class="battle-force-fill"></div></div>
      </div>
    </div>
```

- [ ] **Step 7: Edit `static/shellChrome.css`**

Adds the force bar's two colors.

In `static/shellChrome.css`, find this line. It occurs exactly once:

```css
  --battle-header-border: #4a3247;
```

Replace it with:

```css
  --battle-header-border: #4a3247;
  /* The battle header's force bar: brighter forms of the side colors, so both parts read on the dark face. */
  --force-bar-human: #1b8a82;
  --force-bar-opponent: #b02a62;
```

- [ ] **Step 8: Edit `static/frameChrome.css`**

Styles the force bar and lets the middle block keep the bar's width, so the caption gives way first. Below a 1100 px window the bar narrows and its words and caption hide.

In `static/frameChrome.css`, find these lines. Together they occur exactly once:

```css
/* The middle of the header; it fills the space between the title and the controls on the right. */
.battle-header-center {
  flex: 1 1 auto;
  min-width: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-left: 1px solid var(--chrome-divider);
```

Replace them with:

```css
/* The middle of the header, holding the force bar. It fills the space between the title and the controls on the right,
   and never narrows past the bar, so the title's caption gives way first. */
.battle-header-center {
  flex: 1 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border-left: 1px solid var(--chrome-divider);
}
/* The force bar: each side's sub-unit count, and the player's share drawn in teal against the opponent's rose. */
.battle-force-bar {
  flex: none;
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.battle-force-labels {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  line-height: 1;
}
.battle-force-side {
  display: flex;
  align-items: baseline;
  gap: 5px;
}
.battle-force-count {
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.battle-force-word {
  color: var(--chrome-muted);
}
.battle-force-caption {
  color: var(--chrome-muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.battle-force-track {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--force-bar-opponent);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12);
}
/* battleHeader.ts sets the width to the player's share. The light right edge marks where the two sides meet. */
.battle-force-fill {
  flex: none;
  height: 100%;
  background: var(--force-bar-human);
  border-right: 2px solid var(--chrome-text);
}
/* Narrow windows keep the two counts and the bar. The words and the caption give way; the bar's tip still explains it. */
@media (max-width: 1099px) {
  .battle-force-bar {
    width: 160px;
  }
  .battle-force-word,
  .battle-force-caption {
    display: none;
  }
```

- [ ] **Step 9: Edit `scripts/ui-smoke/ui-smoke-battle-checks.cjs`**

Adds the checks that the teal part matches the counts, and that the bar narrows below 1100 px.

1. In `scripts/ui-smoke/ui-smoke-battle-checks.cjs`, find this line. It occurs exactly once:

```js
 * in place of the match status, and holds Exit Battle.
```

Replace it with:

```js
 * in place of the match status, shows the force bar, and holds Exit Battle.
```

2. In `scripts/ui-smoke/ui-smoke-battle-checks.cjs`, find this line. It occurs exactly once:

```js
const { SCENES, BATTLE_SCENES, MATCH_SCENES } = require('./ui-smoke-scenes.cjs');
```

Replace it with:

```js
const { SCENES, BATTLE_SCENES, MATCH_SCENES, near } = require('./ui-smoke-scenes.cjs');
```

3. In `scripts/ui-smoke/ui-smoke-battle-checks.cjs`, find this line. It occurs exactly once:

```js
const BATTLE_STATUS = /^Beat \d+ · Tactical planning · \S/;
```

Replace it with:

```js
const BATTLE_STATUS = /^Beat \d+ · Tactical planning · \S/;

/**
 * The force bar's width, in CSS pixels, at most window widths and below 1100 px.
 *
 * Purpose: The bar narrows in a narrow window so the header still fits.
 * When to use: The force bar width check.
 * Expected outcome: Matches `.battle-force-bar` in `static/frameChrome.css`.
 * Exceptions: None.
 */
const FORCE_BAR = Object.freeze({ width: 320, narrowWidth: 160, narrowBelow: 1100 });
```

4. In `scripts/ui-smoke/ui-smoke-battle-checks.cjs`, find these lines. Together they occur exactly once:

```js
  {
    name: 'exit-battle-in-header',
```

Replace them with:

```js
  {
    name: 'force-bar-counts',
    scenes: BATTLE_SCENES,
    needs: ['#battle-force-bar', '#battle-force-human-count', '#battle-force-opponent-count', '#battle-force-bar .battle-force-track', '#battle-force-human-fill'],
    run: (p, el) => {
      if (!el('#battle-force-bar').shown) return 'the force bar is not shown';
      const human = Number(el('#battle-force-human-count').text);
      const opponent = Number(el('#battle-force-opponent-count').text);
      if (!Number.isInteger(human) || !Number.isInteger(opponent)) {
        return `the counts read "${el('#battle-force-human-count').text}" and "${el('#battle-force-opponent-count').text}"`;
      }
      const share = human + opponent > 0 ? human / (human + opponent) : 0.5;
      const track = el('#battle-force-bar .battle-force-track');
      const fill = el('#battle-force-human-fill');
      return Math.abs(fill.w - share * track.w) <= 2
        ? null
        : `the teal part is ${Math.round(fill.w)} of ${Math.round(track.w)} px, expected ${Math.round(share * track.w)} for ${human} against ${opponent}`;
    },
  },
  {
    name: 'force-bar-width',
    scenes: BATTLE_SCENES,
    needs: ['#battle-force-bar', '#battle-force-bar .battle-force-caption'],
    run: (p, el) => {
      const narrow = p.viewport.w < FORCE_BAR.narrowBelow;
      const width = narrow ? FORCE_BAR.narrowWidth : FORCE_BAR.width;
      const bar = el('#battle-force-bar');
      if (!near(bar.w, width)) return `the force bar is ${Math.round(bar.w)} px wide in the ${p.viewport.w} px window, expected ${width}`;
      const captionShown = el('#battle-force-bar .battle-force-caption').shown;
      return captionShown === !narrow ? null : `the caption is ${captionShown ? 'shown' : 'hidden'} in the ${p.viewport.w} px window`;
    },
  },
  {
    name: 'exit-battle-in-header',
```

- [ ] **Step 10: Edit `doc/ux/top-bar.md`**

Describes the force bar.

1. In `doc/ux/top-bar.md`, find this line. It occurs exactly once:

````markdown
- Under the title, the status line: "Beat N · Tactical planning" while the player drafts, or "Beat N · Tactical resolution" while a beat resolves or plays back, then the match date, then the battle's weather icon and word when the battle has weather (`formatBattleHeaderStatus` in `src/shared/battleHeaderText.ts`).
````

Replace it with:

````markdown
- Under the title, the status line: "Beat N · Tactical planning" while the player drafts, or "Beat N · Tactical resolution" while a beat resolves or plays back, then the match date, then the battle's weather icon and word when the battle has weather (`formatBattleHeaderStatus` in `src/shared/battleHeaderText.ts`).
- The force bar, centred in the space between the title and Exit Battle: the player's sub-unit count and "yours", the caption "Sub-units in battle", then "enemy" and the opponent's count, over a bar whose teal part is the player's share of both counts (`countBattleForces` in `src/shared/battleForceCounts.ts`). Every sub-unit counts, including one carried by a ship. A battle has no fog of war, so the enemy count is exact. While a beat plays back, the bar keeps the counts from before the beat and catches up when the playback ends. Below a 1100 px window the bar narrows and the words and the caption hide; the counts and the bar stay.
````

2. In `doc/ux/top-bar.md`, find this line. It occurs exactly once:

````markdown
| What the bar shows | The match status: sides, readouts, and the date block | The battle header: the title, the hex caption, and the status line |
````

Replace it with:

````markdown
| What the bar shows | The match status: sides, readouts, and the date block | The battle header: the title, the hex caption, the status line, the force bar, and Exit Battle |
````

3. In `doc/ux/top-bar.md`, find this line. It occurs exactly once:

````markdown
- `static/index.html` (`#app-topbar`, `#game-menu-btn`, `#topbar-human-side`, `#topbar-opponent-side`, `#topbar-stat-production`, `#topbar-stat-production-suffix`, `#topbar-stat-forces-host`, `#topbar-stat-forces`, `#topbar-stat-forces-cap`, `#topbar-stat-human-home`, `#topbar-stat-human-home-total`, `#topbar-stat-opponent-home`, `#topbar-stat-opponent-home-total`, `#topbar-date`, `#topbar-turn-phase`, `#topbar-settings-btn`, `#topbar-help-btn`, `#battle-header-place`, `#battle-header-title`, `#battle-header-caption`, `#battle-header-status`, `#battle-header-center`, `#tactical-exit-host`, `#tactical-exit-btn`)
````

Replace it with:

````markdown
- `static/index.html` (`#app-topbar`, `#game-menu-btn`, `#topbar-human-side`, `#topbar-opponent-side`, `#topbar-stat-production`, `#topbar-stat-production-suffix`, `#topbar-stat-forces-host`, `#topbar-stat-forces`, `#topbar-stat-forces-cap`, `#topbar-stat-human-home`, `#topbar-stat-human-home-total`, `#topbar-stat-opponent-home`, `#topbar-stat-opponent-home-total`, `#topbar-date`, `#topbar-turn-phase`, `#topbar-settings-btn`, `#topbar-help-btn`, `#battle-header-place`, `#battle-header-title`, `#battle-header-caption`, `#battle-header-status`, `#battle-header-center`, `#battle-force-bar`, `#battle-force-human-count`, `#battle-force-opponent-count`, `#battle-force-human-fill`, `#tactical-exit-host`, `#tactical-exit-btn`)
````

4. In `doc/ux/top-bar.md`, find this line. It occurs exactly once:

````markdown
- `src/shared/battleHeaderText.ts`
````

Replace it with:

````markdown
- `src/shared/battleHeaderText.ts`
- `src/shared/battleForceCounts.ts`
````

- [ ] **Step 11: Edit `doc/ux/control-tooltips.md`**

Adds the force bar's tip.

In `doc/ux/control-tooltips.md`, find this line. It occurs exactly once:

````markdown
- Legend: Show or hide the terrain legend and its style choice.
````

Replace it with:

````markdown
- Legend: Show or hide the terrain legend and its style choice.
- Force bar in the battle header: Sub-units each side has in this battle, counting any carried by a ship. A battle has no fog of war, so both counts are exact.
````

- [ ] **Step 12: Edit `doc/ui-style-guide.md`**

Adds the force bar's colors.

In `doc/ui-style-guide.md`, find this line. It occurs exactly once:

````markdown
| Battle header bg / bottom edge | `#17141f` / `#4a3247` | `--battle-header-bg` / `--battle-header-border`. The top bar's face while a battle is open, so the theater reads at a glance |
````

Replace it with:

````markdown
| Battle header bg / bottom edge | `#17141f` / `#4a3247` | `--battle-header-bg` / `--battle-header-border`. The top bar's face while a battle is open, so the theater reads at a glance |
| Force bar, human / opponent | `#1b8a82` / `#b02a62` | `--force-bar-human` / `--force-bar-opponent`. Brighter forms of the side colors, so both parts of the battle header's force bar read on its dark face |
````

- [ ] **Step 13: Edit `doc/how-to-play.md`**

Mentions the force bar.

In `doc/how-to-play.md`, find this line. It occurs exactly once:

````markdown
- **Beats:** each Ready in a battle resolves one beat: air strikes, ranged fire, movement, then melee. The top bar becomes the battle header, which names the battle's hex and the beat.
````

Replace it with:

````markdown
- **Beats:** each Ready in a battle resolves one beat: air strikes, ranged fire, movement, then melee. The top bar becomes the battle header, which names the battle's hex and the beat, and compares each side's sub-units in a bar.
````

## Verify

- [ ] **Step 14: Fast loop**

Run the fast loop. Everything passes as described in Verification Commands.

- [ ] **Step 15: Full tests**

Run the full tests. Expected: exit 0, test total **889**, failure total **0**.

- [ ] **Step 16: Exact match**

This proves that every file this plan creates or edits matches the verified result character for character. It ignores line endings.

```powershell
node -e "const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(t).digest('hex').slice(0,16)+'  '+f)}" src/shared/battleForceCounts.ts src/shared/battleForceCounts.test.ts src/renderer/chrome/battleHeader.ts src/renderer/chrome/frameTooltipText.ts static/index.html static/shellChrome.css static/frameChrome.css scripts/ui-smoke/ui-smoke-battle-checks.cjs doc/ux/top-bar.md doc/ux/control-tooltips.md doc/ui-style-guide.md doc/how-to-play.md
```

Expected, one line per file:

| File | Hash |
| --- | --- |
| `src/shared/battleForceCounts.ts` | `ab9f347b746ae82d` |
| `src/shared/battleForceCounts.test.ts` | `05dc8e353ee993c6` |
| `src/renderer/chrome/battleHeader.ts` | `3d9c955f4bc854b5` |
| `src/renderer/chrome/frameTooltipText.ts` | `a09ca1eaf4166795` |
| `static/index.html` | `e67f8b79ad10fd22` |
| `static/shellChrome.css` | `4eca9a78e720ab42` |
| `static/frameChrome.css` | `56d1e5d833f1586a` |
| `scripts/ui-smoke/ui-smoke-battle-checks.cjs` | `3a0ad06806fa0c41` |
| `doc/ux/top-bar.md` | `d522723638b5110d` |
| `doc/ux/control-tooltips.md` | `397d0a773114a046` |
| `doc/ui-style-guide.md` | `aecf1e0e6d469c1e` |
| `doc/how-to-play.md` | `17cfae3525b46e6a` |

When a hash differs, run `git diff -- <file>` and compare it with this plan's steps for that file. If the difference is your own copying mistake, fix it and run the check again. If the steps cannot produce the expected text, stop and report.

- [ ] **Step 17: Smoke run**

```powershell
npm run ui:smoke -- --label force-bar
```

Expected summary line:

```text
ui-smoke force-bar: 416 passed, 0 failed, 0 page errors, 34 screenshots in F:\Projects\Personal\agent-wars-public\.test\ui-smoke\force-bar
```

Any `FAIL` line, any `PAGE-ERROR` line, or a `NOTE run stopped` line: stop and report the full output and `.test/ui-smoke/force-bar/report.json`.

- [ ] **Step 18: Look at the screenshots**

Open each screenshot in `.test/ui-smoke/force-bar/` named below and compare it with the expected image in `.spec/`. The layout, the text, and the controls must match. Two differences are expected: the expected images were made without map tiles, so their basemap is plain grey, and they can show a "map tiles failed to load" toast. The small origin flags beside unit names can also differ from run to run. The battle's units are placed when it opens, and the world-map turn before it depends on the dice, so the counts differ from run to run.

- `26-battle-selection.png` against [ui-facelift-battle-3-expected-force-bar.png](ui-facelift-battle-3-expected-force-bar.png): a battle with one of your units selected. The force bar is centred in the header: your count and "yours", the caption, "enemy" and the enemy count, and under them the bar, teal for your share and rose for the rest.
- `28-battle-small-window.png` against [ui-facelift-battle-3-expected-small-window.png](ui-facelift-battle-3-expected-small-window.png): the same battle at 800 × 600. The hex caption beside the title ends in an ellipsis when it does not fit, and the bar is narrower, with only the two counts above it.

Describe what you see in your report. If an arrangement differs, stop and report.

## Report

Report, in this order:

1. The final `git status --short`.
2. The test total and failure total from Step 15.
3. The output of the Exact-match check.
4. The smoke summary line, and any `FAIL`, `NOTE`, or `PAGE-ERROR` lines.
5. What you saw in each screenshot from Step 18.
6. Anything you think is wrong in this plan, without having changed it.
7. The `doc/` files you changed. This plan changes exactly the `doc/` files listed under Steps.

Do not commit.

## For the Reviewer

These checks need a person at the app with real data. Run `npm start` after the report is in.

1. With your own match, enter a battle: the force bar shows each side's count, and the teal part of the bar matches your share. Count the sub-units on the map, including stacks and any carried by a ship: the numbers agree.
2. Point at the bar: its tip says what the counts include.
3. Press Ready in a beat with losses: the counts stay while the beat plays back, and change when the playback ends.
4. Make the window narrower than 1100 px: the bar narrows and its words and caption hide; the counts stay. At the 800 × 600 minimum the title's caption gives way first.
5. Play a battle to the end: the losing side's count reads 0 and the bar is all one color.

## Next

This completes the spec's Phase 5. Phase 6 builds the new-game and game-over screens.
