# Observer Totals and AI-Only Beat Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task, when those skills are available. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show all-sides Production and Forces totals while observing, rearrange Game Options, and add a Beat limit that ends AI-only tactical battles with a short notice in both observing modes.

**Architecture:** Rules that can be expressed without the DOM live in pure, unit-tested modules under `src/shared/`. The engine records one new AI-only end reason, `beat_limit`, in the place that already records the other four, so the existing post-beat and exit paths carry it. The renderer adds only one new behavior: a three-second notice while the auto-advance checkbox is on.

**Tech Stack:** TypeScript, Electron, better-sqlite3 (`game_config` rows), `node:test`, Playwright (`scripts/ui-smoke/`).

**Spec:** The Requirements section below. Line numbers in this plan are from commit `fe2b1c6`. Treat them as hints and find the code by its symbol.

## Requirements

1. While observing with View as on "All sides, no fog", Production and Forces show the total for all sides still playing.
2. In Game Options, the Sight cues checkbox sits between Fog of war and Auto-start AI.
3. Sight cues' former place holds a "Beat limit" label and dropdown, styled like Turn limit: 20, 30, 40, and 50 beats, default 30, plus Unlimited.
4. Beat limit is enabled when AI-only battles is Balanced, Unbalanced, or Random. It is disabled when AI-only battles is None.
5. Beat limit is the most beats an AI-only tactical battle can run. When the limit is hit, a dialog briefly says so, and the battle then resolves as if Exit Battle had been clicked.
6. Item 5 works with the observe auto-advance checkbox off (the observer presses Ready for each beat) and on (turns advance by themselves).

## Decisions Already Made

Do not reopen these. They were settled with the product owner.

| Topic | Decision |
| --- | --- |
| Checkbox on, limit hit | The dialog shows the message, closes itself after 3 seconds, the battle ends, and the next turn starts. Ok skips the wait. |
| Checkbox off, limit hit | The dialog waits for Ok. Ok returns to the world map and does not press Ready. This is what Exit Battle does today in this mode. |
| Forces cap in All sides | One side's cap multiplied by the number of sides still playing. The per-type tip scales the same way. |
| Which view shows totals | Only "All sides, no fog". A named side in View as keeps showing that side's numbers. |
| Commander prompts | Unchanged. Commanders are not told about the limit. Do not edit `src/main/openRouter/` or `doc/ai-commander-prompts/`. |
| Unlimited position | Last in the list, after 50 beats. |
| While disabled | Beat limit shows one option, Unlimited, like Turn limit under Deathmatch. Re-enabling restores the player's last choice. |
| Saves with no row | Unlimited, so an old save plays as it always has. |
| Counting | Completed beats. The limit is checked after the beat resolves, so beat N of a limit of N plays in full, with its playback. |
| Several endings on one beat | A wiped side, then idle, then commander exit, then the beat limit. The limit is the last check. |
| Dialog text | `The battle reached its maximum of {N} beats.` |

## Global Constraints

- **Never commit or push.** This overrides any commit step a skill asks for (`.cursor/rules/11-no-commit-or-push.mdc`). Leave every change in the working tree for review.
- **Never write plan vocabulary into the repository.** Words such as "Phase 3" or "Task 2" must not appear in code, comments, `doc/`, or test names (`.cursor/rules/12-no-plan-identifiers.mdc`).
- Read every `.cursor/rules/*.mdc` before starting. Most relevant: `02` logging, `03` tests cover happy paths and essential failures only, `04` orienting comments, `09` files 600 lines desirable and 1000 hard, `10` argument limits.
- Every new or changed function, field, and constant gets an orienting comment in the surrounding style: a summary, then `Purpose:`, `When to use:`, `Expected outcome:`, `Exceptions:`. Field comments use `Contract:` in place of `Purpose:`.
- `AGENTS.md` requires `doc/` updates in the same change as the behavior. Each phase below lists its documents. Do not edit `doc/devleopment-plan-v3.4.md`, `doc/poc-analysis.md`, `doc/market-research.md`, or `doc/release-notes/`.
- `static/renderer.js` is tracked and rebuilt by `npm run build`. Do not edit it by hand. It is expected to appear in the diff.
- Do not refactor nearby code, and do not change any behavior this plan does not name.

## Review Focus

Failure modes the tests below do not fully reach. Check these during review.

1. Ok clicked during the 3-second wait must exit once and start the next turn once. Covered by the in-flight flag in Phase 6 Step 6. Canceling the timer is not enough, because Ok can run while the exit is already in flight. The manual list in Phase 8 still checks it.
2. Unticking the checkbox during the wait must leave the dialog open until Ok, with no Ready. Covered by the timer guard in Phase 6 Step 4 and the manual list in Phase 8.
3. A saved match with no `ai_only_beat_limit` row must never end on beats. Covered by a Phase 5 test.
4. Choosing None and then Balanced must restore the earlier Beat limit, including Unlimited. Covered by the Phase 4 smoke check.
5. A knocked-out side must leave both the All sides totals and the cap multiplier. Covered by a Phase 1 test.

## Verification Commands

| Command | Use |
| --- | --- |
| `npm run rebuild:native:node` | Once before running single database tests, and again after any `npm run ui:smoke`. |
| `npm run build:main` then `node dist/<path>.test.js` | One test file. |
| `npm run typecheck:renderer` | Renderer types. |
| `npm test` | Build, lint, naming check, renderer types, all tests, notices. |
| `npm run ui:smoke` | Layout checks. Exits non-zero when a check fails. It writes to `.test/ui-smoke/<label>/`. |

**If any verification fails and two fix attempts do not resolve it, stop and report the exact output.** Do not weaken a test or a smoke check to get past it.

---

### Phase 0: Baseline

- [ ] **Step 1:** Run `git status`. A dirty tree is expected, because this work is not committed. Stop only when `src/`, `doc/`, `static/`, or `scripts/` already have changes this work did not make. The plan file and other `.spec` notes may be dirty.
- [ ] **Step 2:** Run `npm test`. Expected: pass. If it fails before any change, stop and report it.
- [ ] **Step 3:** Run `npm run ui:smoke -- --label baseline`. Expected: every line PASS. Then run `npm run rebuild:native:node`.

---

### Phase 1: All-Sides Totals

Independently verifiable. Touches no other phase's files.

**Files:**
- Create: `src/shared/topBarSideTotals.ts`
- Modify: `src/shared/topBarStats.ts` (`computeTopBarStats`, field comments)
- Modify: `src/shared/topBarStats.test.ts`
- Modify: `src/renderer/chrome/frameTooltipText.ts`, `src/renderer/chrome/topBar.ts` (`renderTopBarStats`)
- Modify: `static/index.html` (Production readout, near line 36)
- Docs: `doc/ux/top-bar.md`, `doc/ux/control-tooltips.md`

**Interfaces produced** (`src/shared/topBarSideTotals.ts`):

```ts
export function readoutSideIds(
  viewer: string | null,
  seats: ReadonlyArray<{ readonly seatId: string; readonly outTurn: number | null }> | undefined
): readonly string[];
// Pass the viewer `computeTopBarStats` already resolved. `undefined` viewerSeatId is the human seat, not all sides.
// A named viewer, including that human seat, returns [viewer]. Only null returns every seat with outTurn === null.

export function countFieldedForSides(
  units: ReadonlyArray<{ readonly player: string; readonly unitType: string; readonly isMercenary?: boolean }>,
  sideIds: readonly string[]
): Record<BuildUnitType, number>;
// The sum of getPlayerUnitCountsByType over sideIds. That helper already skips isMercenary === true. Do not count units yourself.
// Neutral is not a seat, so it is never counted.

export function scaleCapsForSides(
  caps: Readonly<Record<BuildUnitType, number>>,
  sideCount: number
): Record<BuildUnitType, number>;
// Each cap times Math.max(1, sideCount). An empty roster keeps one side's cap.
```

- [ ] **Step 1: Write the failing tests** in `src/shared/topBarStats.test.ts`. Delete the line `assert.equal(stats.productionPerTurn, 0);` from the test named `computeTopBarStats omits both home readouts for a null viewer and still lists cities`. Add, using the existing `input` fixture and `notNeutral`:

```ts
test('computeTopBarStats totals every active side for a null viewer', () => {
  const units = [...input.units, { player: 'human', unitType: 'infantry', isMercenary: true }];
  const stats = computeTopBarStats({ ...input, units, viewerSeatId: null }, notNeutral);
  assert.equal(stats.productionPerTurn, 152);
  assert.equal(stats.unitsFielded, 5);
  assert.deepEqual(stats.fieldedByType, { infantry: 3, armor: 1, naval: 0, air: 1, missile: 0 });
  assert.equal(stats.unitCap, 72);
  assert.equal(stats.yourHome, null);
});

test('computeTopBarStats leaves a knocked-out side and Neutral out of the all-sides totals', () => {
  const seats = input.seats?.map((seat) => (seat.seatId === 'opponent' ? { ...seat, outTurn: 4 } : seat));
  const units = [...input.units, { player: 'neutral', unitType: 'infantry' }];
  const stats = computeTopBarStats({ ...input, seats, units, viewerSeatId: null }, notNeutral);
  assert.equal(stats.productionPerTurn, 102);
  assert.equal(stats.unitsFielded, 4);
  assert.equal(stats.unitCap, 36);
});

test('computeTopBarStats keeps one side\'s numbers for a named viewer', () => {
  const stats = computeTopBarStats({ ...input, viewerSeatId: 'opponent' }, notNeutral);
  assert.equal(stats.productionPerTurn, 50);
  assert.equal(stats.unitsFielded, 1);
  assert.equal(stats.unitCap, 36);
});

test('computeTopBarStats keeps the human seat when viewerSeatId is omitted', () => {
  const stats = computeTopBarStats(input, notNeutral);
  assert.equal(stats.productionPerTurn, 102);
  assert.equal(stats.unitsFielded, 4);
  assert.equal(stats.unitCap, 36);
});
```

- [ ] **Step 2:** Run `npm run build:main` then `node dist/shared/topBarStats.test.js`. Expected: the two null-viewer tests FAIL. The omitted-viewer test PASSes before the change and still PASSes after it.
- [ ] **Step 3: Implement.** Create `topBarSideTotals.ts` with the three functions. In `computeTopBarStats`, keep the existing line `const viewer = input.viewerSeatId === undefined ? HUMAN_SEAT_ID : input.viewerSeatId`. Pass that resolved `viewer` into `readoutSideIds`. Do not pass `input.viewerSeatId`: `undefined` is the human seat, and only `null` means all sides.
  - `const sides = readoutSideIds(viewer, input.seats);`
  - Build `heldHexes` from control rows whose `controllerPlayerId` is non-null and is in `sides`.
  - `fieldedByType = countFieldedForSides(input.units, sides)`.
  - `capByType = viewer === null ? scaleCapsForSides(caps, sides.length) : caps`.
  - Leave the home, Cities, and credits lines as they are. Update the comments on `viewerSeatId`, `productionPerTurn`, `fieldedByType`, `capByType`, `unitCap`, and `computeTopBarStats`, which now describe a viewer or all sides. The `unitCap` comment currently says 34 for a Small game; the one-side total in the existing test is 36, and all sides multiplies that by the number of sides still playing.
- [ ] **Step 4:** Rerun the test file. Expected: PASS.
- [ ] **Step 5: Tips.** The Production readout is the `div.topbar-stat` that wraps `#topbar-stat-production`. Give that div the id `topbar-stat-production-host`. Leave its static `data-control-tooltip` as the single-side sentence. `renderTopBarStats` overwrites it, the same way `#topbar-stat-forces-host` is overwritten today. In `frameTooltipText.ts` add these two, and change `forcesStatTooltipText` so the lead argument is what it interpolates:

```ts
export const allSidesProductionStatTooltipText =
  "The production every side's cities can add each turn, added together. A city adds its share only while it is building, and a city on the neutral border adds none.";
export const allSidesForcesStatTooltipLead = 'Units every side still playing has fielded, out of the most this game size allows them';

export function forcesStatTooltipText(breakdown: string, lead: string = forcesStatTooltipLead): string {
  return `${lead}: ${breakdown}.`;
}
```

  In `renderTopBarStats`, after `stats` is computed, use the existing `viewer` from `readoutViewerSeatId`: `const allSides = viewer === null`. That value is `null` only for All sides. An empty roster leaves it `undefined`, which is not all sides. Set `data-control-tooltip` on `#topbar-stat-production-host` to `allSides ? allSidesProductionStatTooltipText : productionStatTooltipText`. Pass `allSides ? allSidesForcesStatTooltipLead : forcesStatTooltipLead` as the lead for the Forces tip.
- [ ] **Step 6: Docs.**
  - `doc/ux/top-bar.md` Production: replace "While View as is All sides, Production is zero." with "While View as is All sides, Production is the sum for every side still playing."
  - Same file, Forces: replace "While View as is All sides, Forces is zero." with "While View as is All sides, Forces is the sum for every side still playing, and the number after "/" is that most times the number of sides still playing (`scaleCapsForSides`)." Add `src/shared/topBarSideTotals.ts` to Code Entry Points.
  - `doc/ux/control-tooltips.md`, the Production and Forces readout bullets (near lines 82-83): add the All sides wording, naming `allSidesProductionStatTooltipText` and `allSidesForcesStatTooltipLead`.
- [ ] **Step 7:** Run `npm test`. Expected: pass.

---

### Phase 2: Move Sight Cues

Independently verifiable.

**Files:**
- Modify: `static/index.html` (near lines 411 and 443-444), `static/newGameChrome.css` (lines 493-504)
- Modify: `scripts/ui-smoke/ui-smoke-new-game-checks.cjs` (check `new-game-options-popover`)
- Docs: `doc/ux/new-game-dialog.md`, `doc/ui-style-guide.md`

- [ ] **Step 1: Move the markup.** Move the whole `<label>` for `new-game-sight-cues-checkbox` from `.new-game-victory` into `.new-game-checks`, between the Fog of war and Auto-start AI labels. Its `class` becomes just `new-game-check`. Keep the `id`, `checked`, and tooltip. After this move, `.new-game-victory` labels are Rule, Turn limit, and AI-only battles, in that order. Phase 4 adds Beat limit as the fourth label.
- [ ] **Step 2: CSS.** Delete the comment and both `.new-game-victory > .new-game-sight-cues` rules. Leave `.new-game-options-popover` at `width: 400px`. Fog of war, Sight cues, and Auto-start AI must share one row inside that width. If the smoke check says they wrapped, stop. Do not widen the popover, and do not weaken the check.
- [ ] **Step 3: Smoke check.** In `new-game-options-popover`, delete the block that checks Sight cues against the AI-only select. Replace the final `return` with a check that all three checkboxes are shown, share one `y` (`near`), and satisfy `fog.x < sightCues.x < autoStart.x`. Keep `sightCues` declared as `el('#new-game-sight-cues-checkbox')`.
- [ ] **Step 4: Docs.**
  - `doc/ux/new-game-dialog.md`, Victory bullet: remove "and Sight cues ... fills the right half", leaving the rest of the sentence about AI-only battles' position. Move the Sight cues sentences (checked on open, stored as `sight_cues`, reads off when missing, does not rewrite a running match, applies only while observing) to the Rules bullet.
  - Same file, Rules bullet: "Under them, Fog of war, Sight cues, and Auto-start AI on one row, in that order."
  - `doc/ui-style-guide.md`, New game (live) entry: drop "and Sight cues in the right half" and say that Sight cues sits between Fog of war and Auto-start AI.
- [ ] **Step 5:** Run `npm run ui:smoke -- --label sight-cues`, then `npm run rebuild:native:node`. Expected: `new-game-options-popover` PASS, and all others PASS.

---

### Phase 3: Beat Limit Rules and Storage

Independently verifiable through tests. Nothing visible changes yet.

**Files:**
- Create: `src/shared/aiOnlyBeatLimit.ts`, `src/shared/aiOnlyBeatLimit.test.ts`
- Modify: `src/main/gameDb/gameConfigKv.ts`, `src/main/gameDb/resetGame.ts`, `src/shared/ipc/ordersTypes.ts`, `src/main/main.ts`
- Modify: `src/main/gameDb/newMatchSeats.test.ts`
- Docs: `doc/naming-conventions-contract-v1.md`, `doc/save-files.md`

**Interfaces produced** (`src/shared/aiOnlyBeatLimit.ts`, modeled on `src/shared/sightCueSettings.ts`):

```ts
export const AI_ONLY_BEAT_LIMIT_CONFIG_KEY = 'ai_only_beat_limit';
export const AI_ONLY_BEAT_LIMIT_UNLIMITED = 'unlimited'; // The stored row and the option value for Unlimited.
export const AI_ONLY_BEAT_LIMIT_OPTIONS = TURN_LIMIT_OPTIONS; // From victoryRules. The comment says the two lists match by design.
export const DEFAULT_AI_ONLY_BEAT_LIMIT = DEFAULT_TURN_LIMIT;
export type AiOnlyBeatLimit = number | null; // null means Unlimited.

export function aiOnlyBeatLimitForRequest(value: unknown): AiOnlyBeatLimit;
// null -> null. A listed number -> itself. Anything else, including undefined -> DEFAULT_AI_ONLY_BEAT_LIMIT.

export function aiOnlyBeatLimitFromStored(value: unknown): AiOnlyBeatLimit;
// A string naming a listed number -> that number. Anything else, including a missing row or 'unlimited' -> null.

export function aiOnlyBeatLimitToStored(limit: AiOnlyBeatLimit): string;
// null -> AI_ONLY_BEAT_LIMIT_UNLIMITED. A number -> String(number). Also the dropdown's option value.

export function aiOnlyBeatLimitReached(completedBeats: number, limit: AiOnlyBeatLimit): boolean;
// limit !== null && completedBeats >= limit.

export function formatAiOnlyBeatLimitSentence(beats: number): string;
// `The battle reached its maximum of ${beats} beats.`
```

And in `gameConfigKv.ts`:

```ts
export function readAiOnlyBeatLimit(ops: GameConfigKvDbOps): AiOnlyBeatLimit;
// Follows readSightCuesEnabled: logTrace on entry and result. The same hasDb guard returns null when the database is closed.
// selectGameConfigValue reads the row. A missing row is Unlimited, which is null. An omitted new-game field is a different path and stores 30.
```

- [ ] **Step 1: Write the failing tests** in `aiOnlyBeatLimit.test.ts` (one `test` per function):

```ts
assert.equal(aiOnlyBeatLimitForRequest(null), null);
assert.equal(aiOnlyBeatLimitForRequest(40), 40);
assert.equal(aiOnlyBeatLimitForRequest(undefined), 30);
assert.equal(aiOnlyBeatLimitForRequest(7), 30);

assert.equal(aiOnlyBeatLimitFromStored('20'), 20);
assert.equal(aiOnlyBeatLimitFromStored('unlimited'), null);
assert.equal(aiOnlyBeatLimitFromStored(undefined), null);
assert.equal(aiOnlyBeatLimitFromStored('7'), null);

assert.equal(aiOnlyBeatLimitToStored(null), 'unlimited');
assert.equal(aiOnlyBeatLimitToStored(50), '50');

assert.equal(aiOnlyBeatLimitReached(19, 20), false);
assert.equal(aiOnlyBeatLimitReached(20, 20), true);
assert.equal(aiOnlyBeatLimitReached(9999, null), false);

assert.equal(formatAiOnlyBeatLimitSentence(30), 'The battle reached its maximum of 30 beats.');
```

  In `newMatchSeats.test.ts`, add one test that always runs. Seed a global two-seat match in the shape of `aw-victory-global-`, not the regional test that can skip. Use `withSeatedTempGameDb` three times, and read with `readAiOnlyBeatLimit({ getOne: dbGetOne, run: dbRun })`:
  - `aiOnlyBeatLimit: 40` reads 40.
  - `aiOnlyBeatLimit: null` reads null. Name this case so it is the stored Unlimited value, not a missing row.
  - The field omitted from the start options reads 30. A save that never received the row stays Unlimited, and that case is the Phase 5 test with no row.

- [ ] **Step 2:** Run `npm run rebuild:native:node`, `npm run build:main`. Expected: the build fails because the module does not exist.
- [ ] **Step 3: Implement** the module and `readAiOnlyBeatLimit`.
- [ ] **Step 4: Plumb the request.**
  - `ordersTypes.ts`: add `aiOnlyBeatLimit?: number | null;` after `aiOnlyBattles`. Comment: null means Unlimited, omitted or unlisted stores 30, stored as `ai_only_beat_limit`, does not rewrite a running match.
  - `resetGame.ts`: add the same field to the options after `aiOnlyBattles`. Compute `const aiOnlyBeatLimit = aiOnlyBeatLimitForRequest(options?.aiOnlyBeatLimit);` beside `aiOnlyBattles`, add it to the `logDebug`, and after the `ai_only_battles` upsert add `upsertGameConfigValue({ run }, AI_ONLY_BEAT_LIMIT_CONFIG_KEY, aiOnlyBeatLimitToStored(aiOnlyBeatLimit));`.
  - `main.ts`: in the `game:newGame` handler, add `aiOnlyBeatLimit` to both the `logDebug` (`payload?.aiOnlyBeatLimit ?? null`) and the `resetGameForNewMatch` call (`payload?.aiOnlyBeatLimit`, with no `??`, so null and undefined stay distinct).
- [ ] **Step 5: Docs.**
  - `doc/naming-conventions-contract-v1.md`: add `'ai_only_beat_limit'` to the `game_config` keys row.
  - `doc/save-files.md`, after the `ai_only_battles` sentence: "The match row `ai_only_beat_limit` stays in the file too. A missing row reads as Unlimited (`aiOnlyBeatLimitFromStored`)."
- [ ] **Step 6:** Run `npm test`. Expected: pass, including both new test groups.

---

### Phase 4: Beat Limit Control

Verifiable with Phase 3. After this phase the choice is stored but has no effect in battle.

**Files:**
- Create: `src/renderer/gameplay/newGameBeatLimitUi.ts`
- Create: `scripts/ui-smoke/ui-smoke-beat-limit.cjs`
- Modify: `src/renderer/gameplay/newGameVictoryUi.ts`, `src/renderer/gameplay/newGameSidesUi.ts` (`readNewGameSeatsStart`), `src/renderer/gameplay/newGame.ts`
- Modify: `static/index.html`, `static/newGameChrome.css`
- Modify: `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`, `scripts/ui-smoke/ui-smoke-multi.cjs`
- Docs: `doc/ux/new-game-dialog.md`, `doc/ux/control-tooltips.md`, `doc/ui-style-guide.md`, `doc/how-to-play.md`

**Interfaces produced** (`newGameBeatLimitUi.ts`):

```ts
export function bindNewGameBeatLimit(): void;   // Adds one change listener to the AI-only select. The listener calls renderNewGameBeatLimit. A second call does nothing. Uses a module-level boolean.
export function renderNewGameBeatLimit(): void; // Paints the select for the current AI-only choice.
export function resetNewGameBeatLimit(): void;  // Sets the memory to 30 and the select value to '' so the next paint does not copy the previous choice. Does not rebuild the options.
export function readNewGameAiOnlyBeatLimit(): AiOnlyBeatLimit; // What Start sends.
```

**Exact behavior of `renderNewGameBeatLimit`**, for `#new-game-beat-limit-select`:

1. A missing element returns.
2. If the select is not disabled and its value is not `''`, set `rememberedBeatLimit = aiOnlyBeatLimitFromStored(select.value)`. The `disabled` guard is essential: while disabled the select holds Unlimited, and reading that would erase the player's choice.
3. If `#new-game-ai-only-battles-select` has the value `none`: replace the options with one option (value `AI_ONLY_BEAT_LIMIT_UNLIMITED`, text `UNLIMITED_TURN_LIMIT_LABEL`), set `disabled = true`, return.
4. Otherwise: replace the options with `{n} beats` (value `String(n)`) for each of `AI_ONLY_BEAT_LIMIT_OPTIONS`, then Unlimited. Set `select.value = aiOnlyBeatLimitToStored(rememberedBeatLimit)`, `disabled = false`.

`rememberedBeatLimit` is a module-level `AiOnlyBeatLimit`, starting at `DEFAULT_AI_ONLY_BEAT_LIMIT`.

`readNewGameAiOnlyBeatLimit`: a missing select or an empty value returns `DEFAULT_AI_ONLY_BEAT_LIMIT`. Otherwise it returns `aiOnlyBeatLimitFromStored(select.value)`.

- [ ] **Step 1: Markup.** In `.new-game-victory`, directly after the AI-only `</select>`:

```html
<label for="new-game-beat-limit-select">Beat limit</label>
<select id="new-game-beat-limit-select" data-control-tooltip="The most beats an AI-only battle can run. When it reaches them, the battle ends as if Exit Battle had been pressed. This applies only while you are observing. Choosing None under AI-only battles turns this off."></select>
```

  Also change the `#new-game-options-btn` tooltip to the text in `doc/ux/control-tooltips.md`, with beat limit added: "Nickname, victory rule, turn limit, AI-only battles, beat limit, Sight cues, bonuses, fog of war, and Auto-start AI."
- [ ] **Step 2: CSS.** Change `.new-game-victory > label:nth-of-type(2)` to `.new-game-victory > label:nth-of-type(2n)`. After Sight cues has left this grid, the labels are Rule, Turn limit, AI-only battles, and Beat limit, so `2n` is Turn limit and Beat limit. Update its comment: Turn limit and Beat limit each open the second pair on their row.
- [ ] **Step 3: Implement** the module. `resetNewGameBeatLimit` sets `rememberedBeatLimit` to `DEFAULT_AI_ONLY_BEAT_LIMIT` and, when the select exists, sets its value to `''`. It does not rebuild the options. The next `renderNewGameBeatLimit` then skips step 2 of the render rules and paints 30. Then in `newGameVictoryUi.ts`:
  - `bindNewGameVictory`: call `bindNewGameBeatLimit()` first.
  - `renderNewGameVictory`: call `renderNewGameBeatLimit()` as its first line, before the early return.
  - `resetNewGameVictory`: call `resetNewGameBeatLimit()` before the existing `renderNewGameVictory()` call, and after the AI-only select has been set back to Balanced.
  - Update those functions' comments.
- [ ] **Step 4: Send it.** Add `aiOnlyBeatLimit: ReturnType<typeof readNewGameAiOnlyBeatLimit>` to `readNewGameSeatsStart`'s return type and object. In `newGame.ts` add `aiOnlyBeatLimit: seatsStart.aiOnlyBeatLimit,` beside `aiOnlyBattles`. Run `npm run typecheck:renderer`. Expected: pass.
- [ ] **Step 5: Layout check.** In `new-game-options-popover`: add `#new-game-beat-limit-select` to `needs`. Read `const beatLimit = el('#new-game-beat-limit-select');`. Return a failure unless `near(beatLimit.y, aiOnly.y)`, `near(beatLimit.x, turnLimit.x)`, `near(beatLimit.w, turnLimit.w)`.
- [ ] **Step 6: Behavior check.** Create `ui-smoke-beat-limit.cjs` exporting `async function checkBeatLimitControl(page)`. It throws an `Error` naming the mismatch. Steps, reading `disabled`, `value`, and option texts through `page.evaluate`:

  1. Click `#new-game-options-btn`.
  2. `selectOption` AI-only `balanced`. Expect enabled, value `30`, texts exactly `20 beats, 30 beats, 40 beats, 50 beats, Unlimited`.
  3. Select `none`. Expect disabled, value `unlimited`, one option.
  4. Select `random`. Expect enabled, value `30`.
  5. Select Beat limit `unlimited`, AI-only `none`, AI-only `unbalanced`. Expect value `unlimited`.
  6. Select Beat limit `50`, AI-only `none`, AI-only `balanced`. Expect value `50`.
  7. Select Beat limit `30`. Click `#new-game-options-btn` to close.

  Call it in `ui-smoke-multi.cjs` immediately before the second `await startObservedMatch(page, 120000);`, the one following `addSidesUntil(page, 4)`.
- [ ] **Step 7: Docs.**
  - `doc/ux/new-game-dialog.md`, Victory bullet: "Under that row, AI-only battles sits in the left half and Beat limit (`#new-game-beat-limit-select`) in the right half. Beat limit lists 20, 30, 40, and 50 beats and Unlimited, with 30 selected until the player picks another. Under None it is disabled and shows Unlimited, and choosing another mode restores the player's choice. Start stores it as `ai_only_beat_limit` (`aiOnlyBeatLimitToStored`). A match with no row reads as Unlimited. Changing it does not rewrite a match that is already running." Rule, Turn limit, AI-only battles, and Beat limit are the same width. Opening the overlay resets it. Add the id and `newGameBeatLimitUi.ts` to Code Entry Points.
  - `doc/ux/control-tooltips.md`: a Beat limit bullet after AI-only battles, with the tooltip text from Step 1. Update the "Game Options" bullet.
  - `doc/ui-style-guide.md`, New game (live): Beat limit in the right half of the AI-only row. Four dropdowns are one width.
  - `doc/how-to-play.md` line 101: after the None sentence add "Beat limit, 30 by default, is the most beats one of those battles can run. Unlimited removes it. None turns it off."
- [ ] **Step 8:** Run `npm test`, then `npm run ui:smoke -- --label beat-limit-control`, then `npm run rebuild:native:node`. Expected: all pass, and the run did not throw from `checkBeatLimitControl`.

---

### Phase 5: End the Battle at the Limit

Verifiable with Phase 3. After this phase the limit is fully correct with the checkbox off. With it on, the battle still leaves without the dialog until Phase 6.

**Files:**
- Modify: `src/shared/tacticalBattleTypes.ts`, `src/main/tacticalBattle/aiOnlyTacticalBeat.ts`, `src/main/tacticalBattle/aiOnlyTacticalBeat.test.ts`, `src/renderer/tactical/tacticalExitFlow.ts`
- Docs: `doc/combat-rules-v3.md`, `doc/ux/tactical-battle-controls.md`, `doc/ux/modes-and-transitions.md`

**Why this is small:** `aiOnlyEndReason` already stops further consults and blocks auto-advance presses through `!= null` checks. The leave calls `endTacticalBattleSessionForTwoPartyVoluntaryExit` in `src/main/main.ts` line 546, the same call as the Exit Battle button, and it reads `leadPartyId`, not the reason. Before Step 3, search for `aiOnlyEndReason` across `src/`, ignoring `*.test.ts`. `!= null` and `== null` are expected in `main.ts`, `tacticalMapView.ts`, `unitFrameCamera.ts`, and `observeChrome.ts`. Leave those as they are: any non-null reason, including `beat_limit`, means the battle has ended. Stop only if a file other than `aiOnlyResultSentence` compares the field to a specific reason string.

- [ ] **Step 1: Write the failing tests** in `aiOnlyTacticalBeat.test.ts`. Add `import { dbRun } from '../gameDb';` and a local helper:

```ts
function storeBeatLimit(value: string): void {
  dbRun("INSERT OR REPLACE INTO game_config (key, value) VALUES ('ai_only_beat_limit', ?)", [value]);
}
```

  Each test uses `withTwoAiBattle` with a distinct label. Call `storeBeatLimit` inside the callback: each callback gets a new temp database. Spread the battle the way `both exit flags on completed beat 5` does: `setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber, idleBeatStreak })`. Then call `applyAiOnlyTacticalBeat`. Check `current.tacticalTurnNumber`, not `nextTurn`. The exit flag uses `nextTurn >= 6` because five completed beats store 6. Using `nextTurn` for this limit would end beat N one beat early.

  | Test | Row | Snapshot | Drafts | Expected |
  | --- | --- | --- | --- | --- |
  | one beat before the limit continues | `'20'` | `tacticalTurnNumber: 19, idleBeatStreak: 0` | `emptyPlan()` both | `aiOnlyEndReason` undefined, `tacticalTurnNumber` 20 |
  | the limit ends the battle after that beat | `'20'` | `tacticalTurnNumber: 20, idleBeatStreak: 0` | `emptyPlan()` both | `'beat_limit'`, `tacticalTurnNumber` 21, `isTacticalBattleActive()` true |
  | Unlimited never ends on beats | `'unlimited'` | `tacticalTurnNumber: 500, idleBeatStreak: 0` | `emptyPlan()` both | undefined |
  | a save with no row never ends on beats | none | `tacticalTurnNumber: 500, idleBeatStreak: 0` | `emptyPlan()` both | undefined |
  | idle wins on the limit beat | `'20'` | `tacticalTurnNumber: 20, idleBeatStreak: 2` | `emptyPlan()` both | `'idle'` |
  | commander exit wins on the limit beat | `'20'` | `tacticalTurnNumber: 20, idleBeatStreak: 0` | `emptyPlan(true)` both | `'exit'` |
  | a wipe wins on the limit beat | `'20'` | `tacticalTurnNumber: 20`, `subUnits` filtered to the lead (as the existing wipe test does) | `emptyPlan()` both | `'elimination'` |

- [ ] **Step 2:** Run `npm run rebuild:native:node`, `npm run build:main`, `node dist/main/tacticalBattle/aiOnlyTacticalBeat.test.js`. Expected: the `'beat_limit'` test FAILS and the others PASS.
- [ ] **Step 3: Implement.**
  - `tacticalBattleTypes.ts`: add `| 'beat_limit'` to `aiOnlyEndReason`. Update its comment: five reasons; `beat_limit` is the match's stored limit reached.
  - `aiOnlyTacticalBeat.ts`: import `dbGetOne, dbRun` from `'../gameDb'`, `readAiOnlyBeatLimit` from `'../gameDb/gameConfigKv'`, and `aiOnlyBeatLimitReached`. Add a last branch to the `aiOnlyEndReason` chain:

    ```ts
    else if (aiOnlyBeatLimitReached(current.tacticalTurnNumber, readAiOnlyBeatLimit({ getOne: dbGetOne, run: dbRun }))) {
      aiOnlyEndReason = 'beat_limit';
    }
    ```

    Check `current.tacticalTurnNumber`, the beat being completed, not `nextTurn`. The number starts at 1 and is incremented into `nextTurn` after this check, so `current.tacticalTurnNumber` is the count of beats completed including this one. Say so in a short comment. Update the `applyAiOnlyTacticalBeat` comment's `Purpose:` list.
  - `tacticalExitFlow.ts`, `aiOnlyResultSentence`: after the `idle` line add

    ```ts
    if (snap.aiOnlyEndReason === 'beat_limit') return formatAiOnlyBeatLimitSentence(snap.tacticalTurnNumber - 1);
    ```

    Without this line the reason falls through and shows "All units destroyed."
- [ ] **Step 4:** Rerun the test file. Expected: PASS.
- [ ] **Step 5: Docs.**
  - `doc/combat-rules-v3.md` §12.8: add list item 6: "**Beat limit:** In an AI-only battle, the battle ends after the beat that completes the match's limit (`ai_only_beat_limit`, `aiOnlyBeatLimitReached`). The check uses the beat number before the increment, so a limit of N ends on the beat that stores N+1, after that beat's orders resolve. Unlimited never ends a battle this way, and a save with no row reads as Unlimited. Both sides map back with the §12.9 rule." Change the "checks these in order" sentence to end "then the flags, then the beat limit."
  - Same file §12.9: add the beat-limit ending to "It covers the header control, the idle ending, and the commander-exit ending."
  - `doc/ux/tactical-battle-controls.md`, Information Displayed: add "The battle reached its maximum of {N} beats." to the list of AI-only sentences.
  - `doc/ux/modes-and-transitions.md`: "Tactical planning -> Tactical annihilation" add "and a beat limit" after "a commander exit".
- [ ] **Step 6:** Run `npm test`. Expected: pass.

---

### Phase 6: The Timed Notice While Auto-Advancing

Depends on Phases 3 and 5. The decision rules are unit tested. The timer is exercised in Phase 7.

**Why the existing path is not enough:** with the checkbox on, `tacticalMaybeScheduleAnnihilationExit` leaves with no dialog. `performTacticalBattleExit` also computes `autoAdvance` as `S.aiOnlyBattleResultSentence == null && S.autoAdvance`, so leaving from any open dialog never starts the next turn. Both must change, for `beat_limit` only. Every other ending must behave exactly as it does today.

**Files:**
- Create: `src/renderer/tactical/aiOnlyResultAutoClose.ts`
- Modify: `src/shared/aiOnlyBeatLimit.ts`, `src/shared/aiOnlyBeatLimit.test.ts`
- Modify: `src/renderer/tactical/tacticalExitFlow.ts`, `src/renderer/tactical/tacticalAnnihilationDialog.ts`, `src/renderer/renderer.ts`, `src/renderer/chrome/controlTooltipText.ts`
- Docs: `doc/ux/tactical-battle-controls.md`, `doc/ux/modes-and-transitions.md`, `doc/ux/control-tooltips.md`

**Interfaces produced.** In `src/shared/aiOnlyBeatLimit.ts`:

```ts
export const AI_ONLY_BEAT_LIMIT_NOTICE_MS = 3000;
export type AiOnlyBattleEndPresentation = 'leave_now' | 'dialog_until_ok' | 'timed_dialog';

export function aiOnlyBattleEndPresentation(
  reason: NonNullable<TacticalBattleSnapshot['aiOnlyEndReason']>,
  autoAdvance: boolean
): AiOnlyBattleEndPresentation;
// Checkbox off -> 'dialog_until_ok'. Checkbox on and 'beat_limit' -> 'timed_dialog'. Checkbox on and any other reason -> 'leave_now'.

export function aiOnlyLeaveStartsNextTurn(args: {
  readonly resultDialogOpen: boolean;
  readonly endReason: TacticalBattleSnapshot['aiOnlyEndReason'];
  readonly autoAdvance: boolean;
}): boolean;
// autoAdvance && (!resultDialogOpen || endReason === 'beat_limit').

export function aiOnlyTimedNoticeStillCloses(sentence: string | null, autoAdvance: boolean): boolean;
// sentence != null && autoAdvance. The timer uses this so an untick during the wait leaves the dialog up.
```

In `src/renderer/tactical/aiOnlyResultAutoClose.ts`:

```ts
export function scheduleAiOnlyResultAutoClose(onElapsed: () => void): void;
export function cancelAiOnlyResultAutoClose(): void; // Safe when nothing is scheduled.
```

- [ ] **Step 1: Write the failing tests** in `aiOnlyBeatLimit.test.ts`:

```ts
assert.equal(aiOnlyBattleEndPresentation('beat_limit', false), 'dialog_until_ok');
assert.equal(aiOnlyBattleEndPresentation('beat_limit', true), 'timed_dialog');
assert.equal(aiOnlyBattleEndPresentation('idle', false), 'dialog_until_ok');
assert.equal(aiOnlyBattleEndPresentation('idle', true), 'leave_now');
assert.equal(aiOnlyBattleEndPresentation('elimination', true), 'leave_now');

const leave = aiOnlyLeaveStartsNextTurn;
assert.equal(leave({ resultDialogOpen: false, endReason: undefined, autoAdvance: true }), true);
assert.equal(leave({ resultDialogOpen: true, endReason: 'beat_limit', autoAdvance: true }), true);
assert.equal(leave({ resultDialogOpen: true, endReason: 'beat_limit', autoAdvance: false }), false);
assert.equal(leave({ resultDialogOpen: true, endReason: 'idle', autoAdvance: true }), false);
assert.equal(leave({ resultDialogOpen: true, endReason: undefined, autoAdvance: true }), false);

assert.equal(aiOnlyTimedNoticeStillCloses('The battle reached its maximum of 30 beats.', true), true);
assert.equal(aiOnlyTimedNoticeStillCloses('The battle reached its maximum of 30 beats.', false), false);
assert.equal(aiOnlyTimedNoticeStillCloses(null, true), false);
```

- [ ] **Step 2:** Run `npm run build:main`. Expected: the build fails on the missing exports.
- [ ] **Step 3:** Implement the three shared functions and the constant. Run `node dist/shared/aiOnlyBeatLimit.test.js`. Expected: PASS.
- [ ] **Step 4: Timer module.** One module-level handle. `scheduleAiOnlyResultAutoClose` cancels any earlier timer, then starts one for `AI_ONLY_BEAT_LIMIT_NOTICE_MS`. When it fires: clear the handle; if `aiOnlyTimedNoticeStillCloses(S.aiOnlyBattleResultSentence, S.autoAdvance)` is false, return; otherwise call `onElapsed()`. A false result is what leaves the dialog waiting for Ok when the observer unticks the box during the wait.
- [ ] **Step 5: Tip and dialog.**
  - `controlTooltipText.ts`: add

    ```ts
    export const aiOnlyTimedResultOkTooltipText =
      'Close this result now and return to the world map. The next turn starts then if "Start the next turn when every commander is ready" is checked.';
    ```

  - `tacticalAnnihilationDialog.ts`: `openAiOnlyBattleResultDialog(sentence: string, okTooltip: string = aiOnlyResultOkTooltipText)`, and use `okTooltip` in the `setAttribute`. In `closeTacticalAnnihilationOutcomeDialog`, call `cancelAiOnlyResultAutoClose()` first. That covers a successful exit, a new match, and a reconcile.
- [ ] **Step 6: Exit flow.**
  - `TacticalBattleExitIo` in `tacticalExitFlow.ts`: add an optional field `finishTimedAiOnlyResult?: () => void` with a full orienting comment.
  - `tacticalMaybeScheduleAnnihilationExit`: after `sentence` is known, switch on `aiOnlyBattleEndPresentation(snap.aiOnlyEndReason, S.autoAdvance)`:
    - `leave_now`: the existing `aiOnlyExitStarted` block, unchanged.
    - `dialog_until_ok`: the existing `openAiOnlyBattleResultDialog(sentence)` and `io.redraw()`.
    - `timed_dialog`: `openAiOnlyBattleResultDialog(sentence, aiOnlyTimedResultOkTooltipText)`, then `if (io.finishTimedAiOnlyResult) scheduleAiOnlyResultAutoClose(io.finishTimedAiOnlyResult);`, then `io.redraw()`.
  - `renderer.ts`, `maybeScheduleTacticalAnnihilationExit`: add `finishTimedAiOnlyResult: () => { void performTacticalBattleExit(); },` to the io object.
  - `renderer.ts`, `performTacticalBattleExit`: keep a module-level `tacticalAiOnlyExitInFlight` boolean. On the branch that only opens "The battle was left.", do not set it. On the path that calls `leaveAiOnlyBattle`, set the flag synchronously before the first await, after `cancelAiOnlyResultAutoClose()`. If the flag is already set, return. Clear it when the leave finishes and the snapshot is still present, so a failed exit can be tried again. A second call from Ok during the wait returns immediately. Canceling the timer is not enough, because Ok can run while `endTacticalBattle` is in flight. Replace the final argument of `leaveAiOnlyBattle` with:

    ```ts
    aiOnlyLeaveStartsNextTurn({
      resultDialogOpen: S.aiOnlyBattleResultSentence != null,
      endReason: S.tacticalBattleSnapshot.aiOnlyEndReason,
      autoAdvance: S.autoAdvance,
    })
    ```

    Compute it into a `const` before the call, because the snapshot is cleared during the leave.
- [ ] **Step 7:** Run `npm run typecheck:renderer`. Expected: pass. `autoAdvanceReady` in `observeChrome.ts` already returns false while `#tactical-annihilation-overlay` is visible, so do not change that file.
- [ ] **Step 8: Docs.**
  - `doc/ux/tactical-battle-controls.md`, Information Displayed and Other: "While the observe checkbox is on, a battle that reached its beat limit still opens this overlay. It closes itself after 3 seconds (`AI_ONLY_BEAT_LIMIT_NOTICE_MS`), then the battle ends and the next strategic turn starts. Ok skips the wait. If the checkbox is unticked before the 3 seconds pass, the overlay waits for Ok, and Ok does not press Ready." Change the Invariant "The annihilation dialog never closes itself" to name this one exception. Add `src/renderer/tactical/aiOnlyResultAutoClose.ts` and `src/shared/aiOnlyBeatLimit.ts` to Code Entry Points.
  - `doc/ux/modes-and-transitions.md`, the "Tactical planning -> Strategic planning" transition and the "While the observe checkbox is on, leaving an ended AI-only battle" invariant: add the beat-limit notice.
  - `doc/ux/control-tooltips.md`, beside "Ok on an AI-only result": add the timed tip text and name `aiOnlyTimedResultOkTooltipText`.
- [ ] **Step 9:** Run `npm test`. Expected: pass.

---

### Phase 7: End-to-End Scene

Depends on all earlier phases. This is the only automated check of the timer, the dialog, and the real exit. It needs no model and no API key.

**Stop rule:** this scene relies on driving an observed match into a battle, which no existing smoke scene does. If the battle cannot be reached after two focused attempts, delete the scene code, keep `checkBeatLimitControl`, and report what blocked it. Phase 8's manual list then becomes required. Do not change product code to make the scene easier.

**Files:**
- Modify: `scripts/ui-smoke/ui-smoke-beat-limit.cjs`, `scripts/ui-smoke/ui-smoke-multi.cjs`

**Interface:** `async function runBeatLimitBattleScenes(args)`, with `args` being `{ app, page, reopen, report }`, returning `{ app, page }`. `reopen(app, statements)` wraps the existing `reopenEditedMatch(ctx, app, statements)` in `ui-smoke-multi.cjs`, passed in to avoid a circular import.

Call it in `ui-smoke-multi.cjs` after `recordScene(... SCENES.matchObserve)`, assigning the result back to `{ app, page }` so `finally` closes the right app. That match is observed, has four AI sides, and has AI-only battles at Balanced with Beat limit 30.

The snapshot value is `JSON.stringify` of the battle, so `json_set` applies. The Fight button has no id. It is the button named Fight inside the dialog whose accessible name is `Tactical battles`. The chosen row is preselected, so Fight is enabled. Auto-advance starts off, so Ready opens that list. Do not click a map magnifier. `enterBattleAt` is the wrong entry, because magnifiers stay hidden while observing. The SQL may change only `$.tacticalTurnNumber` and may remove `$.aiOnlyEndReason`. Do not edit `turn_state` or parent units. Restore rejects the battle when `strategicTurnNumber` disagrees with `turn_state.turn_number`, a parent unit is missing, or the phase is not planning. Bootstrap already turns a stranded `resolution` phase back into `planning`.

- [ ] **Step 1: Contest a hex.** With `readGameState`, take two active seats. Build statements like `contestedHexEdit` in `ui-smoke-map.cjs` that move the second seat's land units onto the hex of the first seat's first land unit. `reopen`. Wait for "Observing". Throw if either seat has no land unit.
- [ ] **Step 2: Enter the battle.** Click `#ready-btn`. Wait up to 120 s for the dialog named Tactical battles. Click the button named Fight. Wait until `#battle-header-status` starts with `Beat 1 · Tactical planning`.
- [ ] **Step 3: Checkbox off.** `reopen` with:

  ```json
  { "sql": "UPDATE game_config SET value = json_set(value, '$.tacticalTurnNumber', 30) WHERE key = 'tactical_battle_snapshot_json_v1'", "params": [] }
  ```

  Wait until the status starts with `Beat 30`. Click `#ready-btn`. Wait for `#tactical-annihilation-overlay` to lose `hidden`, up to 60 s. Throw unless `#tactical-annihilation-message` is exactly `The battle reached its maximum of 30 beats.` and `#tactical-annihilation-exit-btn` reads `Ok`. Wait 4 s and throw if the overlay has closed, because this mode must wait for Ok.
- [ ] **Step 4: Checkbox on.** `reopen` with the same battle restored to a playable state:

  ```json
  { "sql": "UPDATE game_config SET value = json_set(json_remove(value, '$.aiOnlyEndReason'), '$.tacticalTurnNumber', 30) WHERE key = 'tactical_battle_snapshot_json_v1'", "params": [] }
  ```

  Read the current `turnNumber` as `T`. Click `#observe-auto-advance-input`. Wait for the overlay to show, up to 60 s, and note that time. The 2.5 to 6 second measurement starts when the overlay becomes visible, not when the checkbox is clicked. Check the same message. Wait for the overlay to be hidden. Throw unless it stayed open for 2.5 to 6 seconds. Wait until `#tactical-exit-btn` is hidden. Wait until `readGameState(page).turnNumber > T`, up to 120 s. Click the checkbox again to stop the run. Add one `report.notes` line with the observed duration.
- [ ] **Step 5:** Run `npm run ui:smoke -- --label beat-limit-battle`, then `npm run rebuild:native:node`. Expected: every check PASS, no thrown error, and the note is in `report.json`.

---

### Phase 8: Final Audit

- [ ] **Step 1: Stale text.** Search `doc/`, excluding `doc/release-notes/` and the three historical documents, for: `is zero`, `right half`, `four reasons`, `new-game-sight-cues` (as a class), `never closes itself`, `34 for a Small game`. Also search the changed smoke script for a magnifier click or an unqualified "click Fight". Fix anything this work made wrong.
- [ ] **Step 2: Plan vocabulary.** Search the changed files for `Phase ` and `Task `. Expected: no occurrence introduced by this work.
- [ ] **Step 3:** Run `npm test`, then `npm run ui:smoke -- --label final`, then `npm run rebuild:native:node`. Expected: all pass.
- [ ] **Step 4: Manual checks for the reviewer.** List these in the final report as not automated. The implementer cannot perform them without a person watching the app:
  1. Auto on, limit hit: click Ok during the 3 seconds. The battle ends once, and exactly one next turn starts.
  2. Auto on, limit hit: untick the checkbox during the 3 seconds. The dialog stays. Ok returns to the world map, and no next turn starts.
  3. Auto off, limit hit: Ok returns to the world map, and Ready stays manual.
  4. View as: All sides shows totals and the tips say so. A named side shows that side's numbers.
- [ ] **Step 5: Report.** Name the documents updated, any stop rule that fired, and confirm that nothing was committed. Release notes are not part of this work. Mention that to the reviewer in case they want a `doc/release-notes/` entry.
