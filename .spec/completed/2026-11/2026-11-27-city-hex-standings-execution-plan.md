# City Hex Standings Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** Tell every AI commander where it stands. Today the strategic orders prompt gives each side's city-hex count inside long knockout sentences, and the diplomacy prompt gives none. No prompt ranks the sides, names the leader, or says how many turns are left. In a 157-turn match three commanders renewed their pacts every few turns with no view of who was ahead. The version becomes **3.7.2**.

The change has three parts:

1. **One standings text.** A pure builder ranks the sides still in the match by city hexes held and writes the same table and paragraphs for every prompt that shows them.
2. **Strategic orders prompt.** The Scenario Progress section ends with a Standings subsection.
3. **Strategic diplomacy prompt.** The situation gains a `## Standings` section, and the system text gains one bullet that says what the section is.

The standings are laid out to be read by a person or a model: a heading at the right level, a short table, and two short paragraphs separated by blank lines.

They are printed in every match. A match with a turn limit also says which turn this is, when the match ends, and who would win now. A match without one says that it has no turn limit.

**Shape:**
- Phase 0 records a baseline.
- Phase 1 adds the pure builder and its tests (part 1). No prompt changes.
- Phase 2 adds the lines to the orders prompt (part 2).
- Phase 3 adds the section and the bullet to the diplomacy prompt (part 3).
- Phase 4 updates the docs, the release notes, and the version, runs the final checks, and hands off.

Phase 1 depends on nothing. Phases 2 and 3 each need only Phase 1. Each phase is verified by its own tests.

**Tech:** TypeScript (Electron main and shared modules), `better-sqlite3`, `node:test`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/check-circular-deps.cjs`.

**Shell:** Windows PowerShell. Working directory `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`. Search with `Get-ChildItem -Recurse src -Include *.ts | Select-String -Pattern '<text>' -SimpleMatch`.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Targeted testing only.** Every phase ends with the Phase Check: static checks plus the tests that phase names. Never run `npm test`, `npm run ui:smoke`, or `npm run doc:shots`, and never run test files the phase does not name. The user runs the full test, review, and fix pass afterwards.
- **Stop only when a check fails** and you cannot fix it within the phase's rules. Then:
  1. revert that phase (see Backup and Revert);
  2. record the failure in the Defect Inventory;
  3. stop, and tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, `git mv`, `git rm`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Edits** and the files it **Adds**.
  - Do not edit other files, with two exceptions: removing an import that lint reports unused in a listed file, and fixing a test that fails only because of a change the phase names.
  - Record every such file in the Completion Log.
- Find code by the quoted text or the symbol name, not by a line number.
- Keep each file's line endings as they are. The source files use CRLF.
- **Code blocks are sketches** unless marked **Exact**.
  - Write the real code from the file you just read. When a sketch and the file disagree, the file wins; record the difference in the Completion Log.
  - Text marked **Exact** is copied character for character, including punctuation and spacing.
  - In Exact text, `${name}` means the value of that variable, interpolated in a template literal.
  - Exact text is prompt wording. Write it as a TypeScript string in the quoting style the file already uses.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Set `$step` to the phase number and `$files` to that phase's **Edits** list.

```powershell
$step = '2'
$files = @('src/main/openRouter/scenarioGoals.ts', 'src/main/openRouter/scenarioGoals.test.ts')
$backup = Join-Path $env:TEMP "aw-372-standings\step-$step"
foreach ($f in $files) {
  $dest = Join-Path $backup $f
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Copy-Item $f $dest -Force
}
```

When a phase fixes a test file outside its list, copy that file into the same backup folder before you edit it, and add it to `$files`.

To revert a phase, copy the backups back, then delete every file the phase **added**:

```powershell
foreach ($f in $files) { Copy-Item (Join-Path $backup $f) $f -Force }
```

---

## Verification

### Native module

Tests that open a database load `better-sqlite3` under Node, and `npm install` builds it for Electron. Phase 0 runs `npm run rebuild:native:node`. Phase 4 runs `npm run rebuild:native:electron` last, so the app starts again.

- **Native module lock.** If a rebuild fails with `EBUSY` on `better_sqlite3.node`:
  1. close any running Electron app;
  2. rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`;
  3. run the rebuild again;
  4. delete the `.locked` file.

### Phase Check

Every phase from 1 to 4 ends with the Phase Check, run from the repo root:

```powershell
npm run build:main
npm run lint
npm run check:circular
```

- **New files.** When the phase adds a file under `src`, also run `npm run naming:check`. Phases 1 and 3 need it. A name it rejects is fixed by renaming the new file or symbol, never by editing the naming rules. Record a rename in the Completion Log and use the new name in every later phase.
- **No shared or renderer file changes** in this plan, so `check:renderer-types` and `build:renderer` run only in Phase 0 and in the final pass of Phase 4.
- **Tests.** Then run every test file the phase lists under **Tests to run**, and no others. All must pass. Run a test under `src/main` with `node dist/main/<path>.test.js`.
- `check:circular` must print **no** cycle.
- A static check or a named test that already failed in Phase 0 is not yours to fix. A **new** failure is.
- Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a check pass.
- **No test may call a real model.** Do not start the app.
- Record each Phase Check result in the Completion Log.

---

## Evidence

- **The counts exist, in one prompt only.** `buildScenarioProgressLines` in `src/main/openRouter/scenarioGoals.ts` prints "you hold N city hexes" for the commander and "holds N city hexes" for each other side. It reads `KnockoutStatusForSeat`, which `knockoutStatusForSeat` in `src/main/gameActions/knockoutStatus.ts` builds from true control. The human player already sees the same counts in the top bar (`citiesReadout` in `src/shared/topBarStats.ts`), so they are not hidden by fog of war.
- **Nothing ranks the sides.** No prompt gives a place, a leader, or the turns left.
- **The diplomacy prompt has no counts and no turn limit.** `buildTalkSituationText` prints Sides, agreements, the last plan, the notes, and the messages. `TURN_LIMIT_GOAL_SENTENCE` is used only by the orders system text.
- **The match that showed it.** A four-commander Western Europe match under 3.7.1 ran 157 turns. From turn 70 no hex changed hands. One side held 83 hexes and the others 26 and 19, and all three renewed every pact to the end.
- **The ranking rule already exists.** `rankSeatsByCityHexes` in `src/shared/victoryRules.ts` gives a side the place 1 plus the number of sides with strictly more city hexes, so ties share a place. The end-of-turn check and the top bar use it.

---

## Non-Goals

- **No advice.** The standings state counts, places, the turn, and who would win now. They never tell a commander to attack, to break a pact, or that it is losing.
- **No rule change.** How a match ends, how a side is knocked out, and how sides are ranked at the turn limit are unchanged.
- **No change to the battle prompts.** A battle orders prompt and a battle diplomacy prompt gain nothing.
- **No change to the existing Scenario Progress lines.** The own bullets and each enemy's bullets keep their wording. The Standings subsection is added after them.
- **No change to the orders system text.** `buildWinConditionReminderClause` and the coaching bullets already state the win rules.
- **No new screen, control, IPC channel, stored row, or match event.** Nothing under `src/renderer` or `src/shared` is edited.
- **No new count.** The standings use the counts `KnockoutStatusForSeat` already holds. No second reader of control or infrastructure is added.
- **Files not to edit:**

  | File | Lines | Why |
  | --- | --- | --- |
  | `src/main/openRouter/consultPromptParts.ts` | 602 | Over 600; it already passes the snapshot and the status to `buildScenarioProgressLines` |
  | `src/main/openRouter/requestOrdersFlow.ts` | 655 | Over 600; nothing in it changes |
  | `src/main/openRouter/promptSpec/sectionHeadings.ts` | 615 | Over 600; the new heading title is declared beside the builder |
  | `doc/ai-commander-prompts/example-strategic-prompt.md` | 669 | Over 600, so a subsection cannot be added. It is a capture from an earlier build and already lacks later sections |
  | `src/main/gameActions/knockoutStatus.ts` | 222 | The status already has every value needed |
  | `src/shared/victoryRules.ts`, `src/shared/topBarStats.ts` | | The ranking rule and the top bar do not change |
  | `src/main/openRouter/talk/requestTalk.ts` | | It already passes the scope to `buildTalkSystemText` |

- Do not edit anything under `.spec/completed/`, release notes of versions before 3.7.2, or the historical documents named in `AGENTS.md`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`.

- **Orienting comments (rule 04).** Every new or changed declaration has a JSDoc block: a one-line summary; `Purpose:` (or `Contract:` for types and fields); `When to use:`, `Expected outcome:`, and `Exceptions:`. Update every comment whose behavior this plan changes. No generic filler.
- **Logging (rule 02).** A new exported function under `src/main` logs with `logDebug` when called, or `logTrace` when it only reads or formats. A caught exception logs with `logError`.
- **No plan vocabulary (rule 12)** in code, comments, test names, or `doc/`. Do not write "Phase", "part 2", or "standings plan" there.
- **Size limits (rule 09).** Each edited or added source or test file must stay under 600 lines. Record every final line count in the Completion Log. If a test in a file that is already over 600 lines fails because of this plan, delete that one test from the big file, add its corrected version to a new sibling test file with the same test name and the imports it needs, and record the move.
- **Arguments (rule 10).** Every new function takes one parameter object or at most two parameters.
- **Mutability (rule 13).** New fields are `readonly`. New collections are `readonly` arrays.
- **Names (rule 14).** New files and exported functions use camelCase. New types use PascalCase. Use the file and symbol names this plan gives.
- **Seat ids.** Production code never writes a seat id as a string literal. Tests take seat ids from `AI_SEAT_IDS` and `HUMAN_SEAT_ID` in `src/shared/seatIds.ts`.
- **Reuse (rule 06).**
  - `rankSeatsByCityHexes` is the only ranking rule. Do not write another.
  - `playerIdCodeFor` in `src/shared/unitIds.ts` is the only seat-to-code formatter.
  - `knockoutStatusForSeat` is the only reader of the counts.
  - `subHeading`, `shiftMarkdownHeadings`, and the helpers in `src/main/testSupport/promptOutlineHelpers.ts` already exist. Do not write new heading or layout helpers.
  - `buildCityHexStandingsBody` is the only place the standings wording and layout are written. The orders prompt and the diplomacy prompt both call it.
- **Tests (rule 03).** Test contracts, not private helpers. Copy the structure of the test next to the one you add.
- **Docs.** Phase 4 updates `doc/`, `README.md`, and the release notes. Do not edit them earlier.

### Prompt Layout

| Text | Message | Where | Change |
| --- | --- | --- | --- |
| Standings subsection | Situation (strategic orders) | end of Scenario Progress, one heading level below it: `### Standings` with a briefing, `## Standings` without | new, in every region-versus-region match |
| Standings section | Situation (strategic diplomacy) | new `## Standings`, directly after `## Sides` | new |
| standings bullet | System (strategic diplomacy) | last bullet of `Why diplomacy matters:` | new |

No heading is renamed or removed. No battle prompt changes. The orders system text does not change.

### Prompt Formatting

Every text this plan adds to a prompt must be easy to read for a person and for a model.

- **Headings.** Each new heading names what is under it and sits exactly one level below its parent. Heading characters come from `subHeading` or from the level the surrounding builder already uses, never from a guess.
- **Blank lines.** One blank line before a heading and between paragraphs, and never two in a row. A table is followed by a blank line before the next paragraph.
- **Short paragraphs.** One topic per paragraph: where the commander stands, then how the match ends. With side names of ordinary length, no line is longer than 400 characters.
- **A table for the list.** The sides are rows of a table, in the style of the Sides table, not one long sentence.
- **Checked by tests.** Phases 1 to 3 each assert the layout: heading order with `headingOutline` and `assertHeadingsNest`, blank lines with `assertNoTripleBlankLines` (all three from `src/main/testSupport/promptOutlineHelpers.ts`), and line length directly. `assertProseLinesWithinLimit` is not used, because it checks only a fixed list of system-prompt sections and would pass without looking at these.

---

## Locked Decisions

1. **Who is ranked.** The sides still in the match: the commander and every entry of `KnockoutStatusForSeat.enemies`. A side that is out is not listed. The human player's side is listed like any other.
2. **The measure.** City hexes held, which is `cityHexes.length` of each status row. It is the measure the turn limit uses.
3. **Places.** From `rankSeatsByCityHexes`. Sides with the same count share a place.
4. **Order of the list.** Most city hexes first. Sides with the same count keep this order: the commander first, then the others in the order `enemies` gives them.
5. **Every match shows the table and the commander's place.**
   - **Layout.** A heading, a table with one row per side, and two one-line paragraphs, as the Prompt Formatting rules say. Both prompts get the same body; only the heading level differs.
6. **A match with a turn limit** (`victory.rule` is `most_city_hexes_at_turn_limit` and `victory.turnLimit` is a number) also shows which turn this is, when the match ends, and who would win if it ended now.
7. **Any other match** shows one sentence saying it has no turn limit. A missing `victory` value is read as no turn limit, which is what `readVictorySettings` returns for a match with no stored rule.
8. **Facts only.** No line gives advice or says a side is winning or losing a match that has no turn limit.
9. **Strategic prompts only.** The orders prompt shows the lines wherever Scenario Progress already prints its status lines. The diplomacy prompt shows them on the world map and never in a battle.
10. **A failed read shows nothing.** If the status cannot be read, the diplomacy prompt has no Standings section and no empty heading, and the consult goes on.
11. **Release.** The version becomes 3.7.2. `doc/release-notes/v3.7.2.md` is new. Nothing is committed.

---

## Phase 0 — Baseline

### Steps

1. `npm run rebuild:native:node`
2. Run `npm run build:main`, `npm run lint`, `npm run check:circular`, `npm run naming:check`, and `npm run check:renderer-types`. Record each result.
3. Run each test file named under **Tests to run** in Phases 1 to 3 that already exists. Record any that fail now.
4. Confirm each anchor below appears exactly once in the file named:
   - `export function subHeading(title: string): string {` — `src/main/openRouter/promptSpec/sectionHeadings.ts`
   - `export function assertHeadingsNest(outline: readonly string[]): void {` — `src/main/testSupport/promptOutlineHelpers.ts`
   - `export function assertNoTripleBlankLines(prompt: string): void {` — `src/main/testSupport/promptOutlineHelpers.ts`
   - `return [...ownStatusLines(status.own), ...status.enemies.flatMap((row) => enemyStatusLines(state, row))];` — `src/main/openRouter/scenarioGoals.ts`
   - `if (state.scenarioId !== 'region_vs_region' || !status) return [];` — `src/main/openRouter/scenarioGoals.ts`
   - `function row(name: string, cityHexes: readonly string[], everyHexRule = false, cells = 1): SideKnockoutStatus {` — `src/main/openRouter/scenarioGoals.test.ts`
   - `export function rankSeatsByCityHexes(` — `src/shared/victoryRules.ts`
   - `export function knockoutStatusForSeat(seatId: SeatId): KnockoutStatusForSeat | null {` — `src/main/gameActions/knockoutStatus.ts`
   - `export const DIPLOMACY_PURPOSE_BULLETS = [` — `src/main/openRouter/promptSpec/diplomacyRuleText.ts`
   - `const purpose = DIPLOMACY_PURPOSE_BULLETS.map((line) => ` — `src/main/openRouter/talk/talkPrompt.ts`
   - `if (input.agreements !== null) blocks.push(` — `src/main/openRouter/talk/talkPrompt.ts`
   - `agreements: args.battle ? null : readSideAgreementViews(args.seatId, args.turnNumber),` — `src/main/openRouter/talk/talkPromptInput.ts`
   - `"version": "3.7.1",` — `package.json`
5. Confirm that none of the files this plan **adds** exists yet, and that no file under `src` contains `CityHexStanding`, `STANDINGS_SECTION_TITLE`, or `standingsText`.
6. Record the line count of every file this plan edits.

### Verification

Every result, anchor, and count is recorded in the Phase 0 Inventory. If an anchor is missing or appears more than once, stop and record it.

---

## Phase 1 — The Standings Text

**Adds:**
- `src/main/openRouter/cityHexStandingsText.ts`
- `src/main/openRouter/cityHexStandingsText.test.ts`

No file is edited. No prompt changes.

### Steps

1. **Add `cityHexStandingsText.ts`.** It is pure: it reads no database and no file. It logs with `logTrace`.

   ```ts
   export const STANDINGS_SECTION_TITLE = 'Standings';

   export interface CityHexStandingsArgs {
     readonly status: KnockoutStatusForSeat;
     readonly victory: VictorySettings | null | undefined;
     readonly turnNumber: number;
   }

   export function buildCityHexStandingsBody(args: CityHexStandingsArgs): string;
   ```

   - Imports: the type `KnockoutStatusForSeat` from `../gameActions/knockoutStatus` (use `import type`), `rankSeatsByCityHexes` and the type `VictorySettings` from `../../shared/victoryRules`, `playerIdCodeFor` from `../../shared/unitIds`, and `logTrace`.
   - `STANDINGS_SECTION_TITLE` is the heading text both prompts use. It is declared here, not in `sectionHeadings.ts`, because that file is over 600 lines.
   - Field comments: `status` is the commander's knockout status, whose rows carry the true city-hex counts; `victory` is the match's win rule, and a missing value means no turn limit; `turnNumber` is the strategic turn the prompt is written for.
2. **Build the rows.**
   - The rows are `[args.status.own, ...args.status.enemies]`. The first row is the commander's.
   - Each row's count is `row.cityHexes.length`.
   - Get the places from `rankSeatsByCityHexes(rows.map((row) => row.seatId), countBySeat)`, where `countBySeat` is a `Map` from each row's `seatId` to its count.
   - Sort a copy of the rows by count, largest first. `Array.prototype.sort` is stable, so rows with the same count keep the order above. Do not add a second sort key.
   - A row's code is `playerIdCodeFor(row.seatId)`.
3. **Write the body.** The body is a table, a blank line, a first paragraph, a blank line, and a second paragraph. It contains no heading; each caller adds its own. It does not start or end with a newline, and it never has two blank lines in a row.
   - **The table.** The two header lines are **Exact:**

     ```text
     | Place | Side | Code | City hexes |
     | --- | --- | --- | --- |
     ```

     Then one line per row, in sorted order. `${side}` is `row.name` for another side and `${row.name} (you)` for the commander, the same way the Sides table marks the commander. **Exact:**

     ```text
     | ${place} | ${side} | ${code} | ${count} |
     ```

   - **The first paragraph**, always, on one line. `${place}` is the commander's place and `${n}` is the number of rows. **Exact:**

     ```text
     City hexes are counted by the game. Your place: ${place} of ${n}.
     ```

     When one or more other rows have the commander's place, add one space and this sentence to the same line, where `${k}` is how many other rows share it and `${noun}` is `side` for 1 and `sides` otherwise. **Exact:**

     ```text
     You are tied with ${k} other ${noun}.
     ```

   - **The second paragraph when the match has a turn limit** (Locked Decision 6), on one line: this sentence pair, one space, and one of the three sentences after it. `${limit}` is `victory.turnLimit` and `${turn}` is `args.turnNumber`. **Exact:**

     ```text
     This is turn ${turn} of ${limit}. The match ends after turn ${limit}, and the side holding the most city hexes then wins.
     ```

     When exactly one row has place 1 and it is the commander's. **Exact:**

     ```text
     If the match ended now, you would win.
     ```

     When exactly one row has place 1 and it is another side's, with `${leader}` as `${row.name} (${code})`. **Exact:**

     ```text
     If the match ended now, ${leader} would win.
     ```

     When `${m}` rows, two or more, have place 1. **Exact:**

     ```text
     If the match ended now, no single side would win, because ${m} sides are tied for first place.
     ```

   - **The second paragraph otherwise**, on one line. **Exact:**

     ```text
     This match has no turn limit. It goes on until one side is left.
     ```

   - Join the table lines with `\n`, and join the table and the two paragraphs with `\n\n`.
4. **Comments.** The file comment says: the one place the standings wording and layout are written, used by the strategic orders prompt and the strategic diplomacy prompt. The function comment says: ranks the sides still in the match by city hexes held, with the rule the turn limit uses; returns a table and two short paragraphs with no heading; states facts and gives no advice; never throws.

### Tests

**Add `cityHexStandingsText.test.ts`.** It uses `node:test`. Build status rows with a small local helper that takes a seat id, a name, and a count, and fills `homeLoss` and `viewerHeldHomeUrbanCells` the way the `row` helper in `src/main/openRouter/scenarioGoals.test.ts` does. Give every row a different seat id from `AI_SEAT_IDS` and `HUMAN_SEAT_ID`. Split the body on `\n\n` to get the table and the two paragraphs. Tests:

- three sides with counts 19 (own), 83, and 26, no turn limit: the body has exactly three parts; the table has the two header lines and three rows whose places are 1, 2, 3 in the order 83, 26, 19; the own row's Side cell ends with ` (you)`; the first paragraph is `City hexes are counted by the game. Your place: 3 of 3.`; the second is the no-turn-limit sentence;
- the same sides with `victory` `{ rule: 'most_city_hexes_at_turn_limit', turnLimit: 40 }` and turn 31: the second paragraph starts `This is turn 31 of 40. The match ends after turn 40, and the side holding the most city hexes then wins.` and ends with the sentence naming the side with 83 and its code;
- the commander alone in first place with a turn limit: the second paragraph ends `If the match ended now, you would win.`;
- two sides tied for first with a turn limit, the commander third: both tied rows have place 1, the commander's row has place 3, and the second paragraph says `2 sides are tied for first place`;
- the commander tied with one other side for second: the first paragraph ends `Your place: 2 of 3. You are tied with 1 other side.`, and the commander's row comes before the other tied row;
- the commander tied with two others: the first paragraph says `2 other sides`;
- `victory` `undefined`, `null`, and `{ rule: 'last_side_standing', turnLimit: null }` all give the no-turn-limit paragraph;
- a side with no city hexes is listed with the count 0;
- the commander with no enemies: the table has one row and the first paragraph ends `Your place: 1 of 1.`;
- **layout:** every table line starts and ends with `|` and has the same number of `|` characters; the body contains no line that starts with `#`; it does not start or end with a newline; it does not contain `\n\n\n`; `assertNoTripleBlankLines(body)` from `src/main/testSupport/promptOutlineHelpers.ts` passes; and with the short names these tests use, no line is longer than 400 characters.

### Tests to run

- `node dist/main/openRouter/cityHexStandingsText.test.js`

### Verification

- The Phase Check passes, with `naming:check`. `check:circular` prints no cycle.
- `buildCityHexStandingsBody` is not called outside its test, so no prompt has changed.

---

## Phase 2 — The Orders Prompt

**Edits:**
- `src/main/openRouter/scenarioGoals.ts`
- `src/main/openRouter/scenarioGoals.test.ts`

### How the heading level works

`consultPromptParts.ts` writes the section as `topLevelHeading('Scenario Progress')`, a blank line, and the progress lines joined with `\n`. It then passes the whole block through `shiftMarkdownHeadings` when a briefing is attached. So a heading inside the progress lines must be written one level below the section's own heading, with `subHeading`. It comes out as `## Standings` under `# Scenario Progress` without a briefing, and as `### Standings` under `## Scenario Progress` with one. Do not write the `#` characters by hand.

### Steps

1. **`scenarioGoals.ts`.** Import `buildCityHexStandingsBody` and `STANDINGS_SECTION_TITLE` from `./cityHexStandingsText`, and `subHeading` beside the existing import of `topLevelHeading`. In `buildScenarioProgressLines`, replace the `return` anchor line with:

   ```ts
   const standings = buildCityHexStandingsBody({ status, victory: state.victory, turnNumber: state.turnNumber });
   return [
     ...ownStatusLines(status.own),
     ...status.enemies.flatMap((row) => enemyStatusLines(state, row)),
     '',
     subHeading(STANDINGS_SECTION_TITLE),
     '',
     standings,
   ];
   ```

   - The two empty strings become the blank line before the heading and the blank line after it, because the caller joins the lines with `\n`.
   - The early `return []` above it does not change, so a match that is not region-versus-region and a missing status still give no lines.
   - Do not change `ownStatusLines`, `enemyStatusLines`, or any sentence they write.
2. Update the function's orienting comment: after each side's bullets comes a Standings subsection from `buildCityHexStandingsBody`, written one heading level below the section; it ranks the sides by city hexes and, in a match with a turn limit, says when it ends and who would win now.

### Tests

**`scenarioGoals.test.ts`.**

- The `row` helper gives every row the human's seat id. Add an optional last parameter `seatId` that defaults to the value it uses now, so existing calls do not change.
- Existing tests that compare the whole result of `buildScenarioProgressLines` now get four extra elements at the end. Update each such test to compare only the bullets it was written for: the elements before the empty string that precedes `## Standings`. Change no expected sentence.
- Add tests, with rows that have different seat ids and a `stateWith` result extended with `turnNumber` and `victory`:
  - the last four elements are `''`, `'## Standings'`, `''`, and the body from `buildCityHexStandingsBody` for the same inputs;
  - with no `victory` on the state, the body ends with the no-turn-limit paragraph; with a turn limit of 30 on turn 12, it contains `This is turn 12 of 30.`;
  - the own bullets and the enemy bullets still come first, in the same order as before;
  - a state whose `scenarioId` is not `region_vs_region`, and a `null` status, still return `[]`;
  - **layout, without a briefing:** build the section text the way the caller does, `` `${topLevelHeading('Scenario Progress')}\n\n${lines.join('\n')}` ``. Assert that `headingOutline(text)` is exactly `# Scenario Progress` then `## Standings`, that `assertHeadingsNest(headingOutline(text))` passes, that `assertNoTripleBlankLines(text)` passes, that the line before `## Standings` and the line after it are both empty, and that the line before the table's header line is empty.
  - **layout, with a briefing:** for `shiftMarkdownHeadings(text, 1)`, assert that `headingOutline` is exactly `## Scenario Progress` then `### Standings`, and that `assertNoTripleBlankLines` passes. Do not call `assertHeadingsNest` on this text: that helper requires the first heading to be level one, and here the section is a fragment of a larger prompt.

### Tests to run

- `node dist/main/openRouter/scenarioGoals.test.js`
- `node dist/main/openRouter/cityHexStandingsText.test.js`
- `node dist/main/openRouter/promptOutline.test.js`
- `node dist/main/openRouter/promptSeats.test.js`
- `node dist/main/openRouter/requestOrdersSeats.test.js`
- `node dist/main/openRouter/systemPromptStability.test.js`
- `node dist/main/openRouter/promptHexExclusiveAudit.test.js`
- `node dist/main/openRouter/promptSpec/sectionHeadings.test.js`

A test in this list that fails only because it pins the lines or the heading outline of Scenario Progress is fixed by updating the expected value. `promptOutline.test.js` checks heading nesting and blank lines on a whole strategic prompt; it must pass without being edited.

### Verification

- The Phase Check passes. `check:circular` prints no cycle.
- `consultPromptParts.ts` and `sectionHeadings.ts` were not edited.
- The sentences `ownStatusLines` and `enemyStatusLines` write are unchanged.
- No `#` character for the new heading is written by hand in `scenarioGoals.ts`.

---

## Phase 3 — The Diplomacy Prompt

**Edits:**
- `src/main/openRouter/promptSpec/diplomacyRuleText.ts`
- `src/main/openRouter/promptSpec/diplomacyRuleText.test.ts`
- `src/main/openRouter/talk/talkPrompt.ts`
- `src/main/openRouter/talk/talkPrompt.test.ts`
- `src/main/openRouter/talk/talkPromptInput.ts`

**Adds:**
- `src/main/openRouter/talk/talkPromptStandings.test.ts`

### Steps

1. **`diplomacyRuleText.ts`: the bullet.** Add one exported constant, `STANDINGS_TALK_BULLET`, without the leading hyphen, directly after `DIPLOMACY_PURPOSE_BULLETS`. Do not add it to that array, because a battle prompt uses the array too. **Exact:**

   ```text
   The Standings section ranks every side by the city hexes it holds, counted by the game. When the match has a turn limit, that section says when the match ends, and the side in first place then wins.
   ```

   Its comment: tells the strategic diplomacy step what the Standings section is; used only by the strategic talk system text; one bullet; states no advice.
2. **`talkPrompt.ts`: the system text.** In `buildTalkSystemText`, change the `purpose` anchor line so the strategic scope ends with the new bullet:

   ```ts
   const purposeBullets = strategic ? [...DIPLOMACY_PURPOSE_BULLETS, STANDINGS_TALK_BULLET] : DIPLOMACY_PURPOSE_BULLETS;
   const purpose = purposeBullets.map((line) => `- ${line}`).join('\n');
   ```

   `strategic` is declared above that line already. The tactical system text must stay byte-for-byte what it is now.
3. **`talkPrompt.ts`: the input and the situation.**
   - Add to `TalkPromptInput`, after `agreements`: `readonly standingsText?: string | null;`. Its comment: the body from `buildCityHexStandingsBody`, a table and two paragraphs with no heading; null or absent in a battle and when the status could not be read.
   - In `buildTalkSituationText`, directly **before** the anchor line that pushes `## Your agreements`, add:

     ```ts
     if (input.standingsText) blocks.push(`## ${STANDINGS_SECTION_TITLE}\n${input.standingsText}`);
     ```

     This puts the section directly after `## Sides`. It follows the layout the function already uses for every section: a level-two heading under the level-one `# Diplomacy` heading, the content on the next line, and one blank line between sections from the final `join`.
   - Import `STANDINGS_SECTION_TITLE` from `../cityHexStandingsText`.
   - Update the orienting comments of both functions.
4. **`talkPromptInput.ts`: the reader.** Add one exported function near `readHoldAutomaticFireAgainstText`.

   ```ts
   export function readCityHexStandingsText(
     args: { readonly seatId: AiSeatId; readonly turnNumber: number },
     read: {
       readonly status: (seatId: AiSeatId) => KnockoutStatusForSeat | null;
       readonly victory: () => VictorySettings;
     } = { status: knockoutStatusForSeat, victory: () => readVictorySettings(gameDbOps) },
   ): string | null;
   ```

   - It wraps its whole body in `try`/`catch`. On a throw it logs with `logError` and returns `null`.
   - When `read.status(args.seatId)` is `null`, it returns `null`.
   - Otherwise it returns `buildCityHexStandingsBody({ status, victory: read.victory(), turnNumber: args.turnNumber })`.
   - It logs with `logTrace`: the seat, the turn, and whether text was produced.
   - The second parameter exists so a test can pass its own readers. Production code passes only `args`.
   - Imports: `knockoutStatusForSeat` and the type `KnockoutStatusForSeat` from `../../gameActions/knockoutStatus`, `readVictorySettings` from `../../gameDb/gameConfigKv`, the type `VictorySettings` from `../../../shared/victoryRules`, `buildCityHexStandingsBody` from `../cityHexStandingsText`, and `logError` beside `logTrace`. `readVictorySettings` takes database operations; if `gameDbOps` does not fit its parameter type, pass `{ getOne: gameDbOps.getOne, run: gameDbOps.run }`.
5. **`talkPromptInput.ts`: the input.** In `readTalkPromptInput`, add one property to the returned `input`, directly after the `agreements:` anchor line:

   ```ts
   standingsText: args.battle ? null : readCityHexStandingsText({ seatId: args.seatId, turnNumber: args.turnNumber }),
   ```

6. Build, then run `npm run check:circular`. If the new import of `knockoutStatus` into `talkPromptInput.ts` creates a cycle, do not move code to break it: revert the phase, record the cycle in the Defect Inventory, and stop.

### Tests

- **`diplomacyRuleText.test.ts`.** Add: `STANDINGS_TALK_BULLET` does not start with a hyphen, is one line, and is not an element of `DIPLOMACY_PURPOSE_BULLETS`.
- **`talkPrompt.test.ts`.** Add:
  - `buildTalkSystemText` for `'strategic'` contains `STANDINGS_TALK_BULLET` as a bullet directly after the last `DIPLOMACY_PURPOSE_BULLETS` bullet, with one newline between them and a blank line after it;
  - `buildTalkSystemText` for `'tactical'` does not contain it;
  - `buildTalkSituationText` with `standingsText` set to a body from `buildCityHexStandingsBody` contains `## Standings` after `## Sides` and before `## Your agreements`;
  - with `standingsText` `null` or absent, the output is byte-for-byte what it is without the field;
  - **layout:** for the situation text with `standingsText` set, `assertHeadingsNest(headingOutline(text))` and `assertNoTripleBlankLines(text)` pass, `## Standings` appears exactly once in `headingOutline(text)`, the line before `## Standings` is empty, and the line after it is the table's header line, as the line after `## Sides` is that table's header line.
- **Add `talkPromptStandings.test.ts`.** It tests `readCityHexStandingsText` with readers passed as the second argument, so it needs no database:
  - a status with three rows and a turn-limit `victory` returns exactly what `buildCityHexStandingsBody` returns for the same inputs;
  - a `status` reader that returns `null` gives `null`;
  - a `status` reader that throws gives `null`;
  - a `victory` reader that throws gives `null`.

### Tests to run

- `node dist/main/openRouter/talk/talkPromptStandings.test.js`
- `node dist/main/openRouter/talk/talkPrompt.test.js`
- `node dist/main/openRouter/talk/ordersMessagesBlock.test.js`
- `node dist/main/openRouter/talk/requestTalk.test.js`
- `node dist/main/openRouter/talk/talkRound.test.js`
- `node dist/main/openRouter/promptSpec/diplomacyRuleText.test.js`
- `node dist/main/openRouter/promptSpec/coachingText.test.js`
- `node dist/main/sideAgreements/sideAgreementDecisionApply.test.js`
- `node dist/main/openRouter/cityHexStandingsText.test.js`

A test in this list that fails only because it pins the strategic talk system text or the order of the situation sections is fixed by updating the expected text.

### Verification

- The Phase Check passes, with `naming:check`. `check:circular` prints no cycle.
- The tactical talk system text and a battle's situation text are unchanged.
- `STANDINGS_TALK_BULLET` is used in exactly one production file other than the one that declares it.

---

## Phase 4 — Docs, Release Notes, Version, Final Checks, and Hand-Off

**Edits:**
- `doc/ai-commander-prompts/strategic-prompt.md`
- `doc/ai-commander-prompts/talk-prompt.md`
- `doc/ai-commander-prompts/source-inventory.md`
- `doc/ai-commander-prompts/assembly-contract.md`
- `doc/commander-messages.md`
- `doc/README.md`
- `README.md`
- `package.json`
- `package-lock.json`
- `.github/ISSUE_TEMPLATE/bug_report.yml`

**Adds:**
- `doc/release-notes/v3.7.2.md`

Match the voice and layout of each document. Name the symbol behind every rule. Use no plan vocabulary.

### Steps

1. **`strategic-prompt.md`.** In the paragraph that begins `Explored land progress, controlled land progress, and the home-control bullets are`, add: the section ends with a Standings subsection from `buildCityHexStandingsBody` (`src/main/openRouter/cityHexStandingsText.ts`), one heading level below Scenario Progress; its table and two paragraphs rank the sides still in the match by city hexes with `rankSeatsByCityHexes`, give the commander's place, and, in a match with a turn limit, the turn, the limit, and who would win now; a match with no turn limit gets one sentence saying so.
2. **`talk-prompt.md`.**
   - Where the `Why diplomacy matters:` block is described, add that the strategic scope ends that block with `STANDINGS_TALK_BULLET`, and a battle prompt does not.
   - Where the situation sections are listed, add `## Standings` directly after `## Sides`, on the world map only, filled by `readCityHexStandingsText` from `buildCityHexStandingsBody`, and left out when the status cannot be read.
3. **`source-inventory.md`.** In the `# Scenario Progress` row, add `buildCityHexStandingsBody`. Where the talk prompt's sources are listed, add `readCityHexStandingsText` and `STANDINGS_TALK_BULLET`. If the document has no talk row, add the two names to the row that mentions `buildTalkSituationText`, or skip this item and record that.
4. **`assembly-contract.md`.** In the table row for `# Scenario Progress`, add that the section ends with a `Standings` subsection one level below it. If the document lists every heading of the strategic prompt in a table, add a row for it. Change nothing else.
5. **The example prompt is not edited.** In `strategic-prompt.md`, where the example is linked or where step 1 added its sentence, add one clause: the example file was captured before the Standings subsection existed. If the document does not mention the example, skip this and record that.
6. **`doc/commander-messages.md`.** Add one short paragraph near the description of the Sides table or the stances: the strategic diplomacy prompt has a Standings section that ranks the sides by city hexes held; it states facts and gives no advice; the battle prompt has none.
7. **Stale-text search.** Search `doc/` and `README.md` for `Standings` and for `city hex`. Any maintained sentence that says a commander is not told the other sides' city-hex counts, or that the diplomacy prompt does not mention the turn limit, is corrected. Leave `doc/release-notes/` files before 3.7.2 and the historical documents in `AGENTS.md` as they are.
8. **`doc/README.md`, the engine constants section.** Beside the entry that names `rankSeatsByCityHexes` or the turn limit, or at the end of the paragraph that begins `The campaign objective uses` if there is none, add one sentence: the standings a commander is shown are `buildCityHexStandingsBody` in `src/main/openRouter/cityHexStandingsText.ts`.
9. **Version.**
   - `package.json`: `"version": "3.7.2"`.
   - `package-lock.json`: the two `"version": "3.7.1"` entries that belong to this package, at the top of the file and in the `""` package entry, become `3.7.2`. Change no other line.
   - `.github/ISSUE_TEMPLATE/bug_report.yml`: the placeholder becomes `3.7.2`.
   - `README.md`: the two `Agent Wars v3.7.1` file names and the `**Version:** 3.7.1` line become 3.7.2. Add a `- **3.7.2** ...` line above the `- **3.7.1** ...` line, one sentence in the same style, from the bullets in step 10.
   - `doc/README.md`: `Shipping version as of this writing: **3.7.2**`. Add a `Release **3.7.2** ...` sentence above the `Release **3.7.1** ...` sentence, in the same style.
   - Change no other "3.7.1" mention that describes that release.
10. **Add `doc/release-notes/v3.7.2.md`.** Copy `doc/release-notes/v3.7.1.md`, then:
    - replace `3.7.1` with `3.7.2` in the Downloads table, the run instructions, and the heading `## What's in 3.7.1`;
    - in the Saves bullet, raise the upper end of the range of saves that still open to 3.7.1, and the version a too-old save will not load in to 3.7.2;
    - replace the bullets under `## What's in 3.7.2` with the bullets below;
    - under `## Earlier 3.x releases`, add a new `<details>` block for **3.7.1** above the **3.7.0** block, in the same shape, holding the bullets that were under "What's in 3.7.1".

    The bullets, to be written in the file's voice:
    - **Commanders see the standings.** Every strategic orders prompt and diplomacy prompt now ranks the sides still in the match by the city hexes they hold, and gives the commander its place.
    - **A turn limit is in view.** In a match with a turn limit, the standings say which turn it is, when the match ends, and who would win if it ended now. Until now the diplomacy step was not told about the limit at all.
    - **No advice.** The standings state what the game counts. What a commander does about its place is its own decision.
11. Run `node scripts/check-doc-links.cjs` on every document this phase edited or added. Fix any broken link you added.
12. Run the full Phase Check with `naming:check`, `check:renderer-types`, and `build:renderer`, then every test any phase named, once more.
13. `npm run rebuild:native:electron`

### Manual checklist for the user

Run `npm test` and `npm run ui:smoke`, then in the app:

1. Start a four-commander Western Europe match with a turn limit of 40, the observe checkbox on, and the talk stage on.
2. In `debug.log` or the Commander tab, open a strategic orders prompt. Scenario Progress ends with a `### Standings` heading, a four-column table with one row per side, and two short paragraphs. The second begins "This is turn N of 40.".
3. Open a strategic diplomacy prompt of the same turn. It has a `## Standings` section directly after `## Sides` with the same table and paragraphs.
4. Read both sections as plain text. Each heading has a blank line before it, the paragraphs are separated by a blank line, and nothing runs together. Then compare the counts with the Cities readout in the top bar. They match.
5. Open a battle orders prompt and a battle diplomacy prompt. Neither has standings.
6. Start a Deathmatch. The standings end with "This match has no turn limit. It ends when one side is left, or when every side would be knocked out on the same turn." and have no "If the match ended now" line.
7. Watch whether the sides that are behind keep renewing every pact as the limit nears. This is the behavior the change is meant to inform; the plan does not force it.

### Verification

- Every Phase Check and named test passes.
- No file under `src/renderer`, `src/shared`, or `scripts/` was edited.
- `package.json`, `package-lock.json`, `README.md`, `doc/README.md`, and the new release notes all say 3.7.2.

---

## Reliability Checklist

Before the hand-off, confirm each line and record it in the Completion Log.

- [x] No file this plan edited or added is over 600 lines.
- [x] Every new heading nests one level below its parent in both the briefing and no-briefing forms, and every layout assertion named in Phases 1 to 3 passes.
- [x] Every new or changed declaration has a full orienting comment.
- [x] No seat id is written as a string literal in production code.
- [x] No plan vocabulary appears in `src`, `doc`, `README.md`, or a test name.
- [x] The standings wording and layout are written in one file only, `cityHexStandingsText.ts`.
- [x] Places come from `rankSeatsByCityHexes` and from nothing else.
- [x] The existing Scenario Progress sentences are unchanged.
- [x] No battle prompt and no orders system text changed.
- [x] `readCityHexStandingsText` cannot throw.
- [x] No sentence of the standings gives advice.
- [x] `check:circular` prints no cycle, and `naming:check` passes.
- [x] Nothing was committed.

---

## Success Definition

- Every strategic orders prompt and every strategic diplomacy prompt lists the sides still in the match in order of city hexes held, with places, and states the commander's place.
- In a match with a turn limit, both prompts state the turn, the limit, and who would win now. In any other match, both state that there is no turn limit.
- Both prompts show the same table and paragraphs for the same turn, under a heading at the correct level, with blank lines between the parts.
- A battle prompt is unchanged.
- A read failure removes the section and never fails a consult.

---

## Phase 0 Inventory

Recorded 2026-11-27 on `feature/v3.7.2-city-hex-standings`, branched from `1b4a269` before any edit.

- **Static checks:** `build:main`, `lint`, `check:circular` (no cycle), `naming:check`, and `check:renderer-types` all passed.
- **Named tests that already existed:** all 14 passed when run from the repo root. `sectionHeadings.test.js` fails when run with `dist/main` as the working directory, because it reads source files by relative path.
- **Anchors:** each of the 13 appeared exactly once.
- **Files to add:** none existed, and no file under `src` contained `CityHexStanding`, `STANDINGS_SECTION_TITLE`, or `standingsText`.
- **Line counts:**

  | File | Lines |
  | --- | --- |
  | `src/main/openRouter/scenarioGoals.ts` | 326 |
  | `src/main/openRouter/scenarioGoals.test.ts` | 171 |
  | `src/main/openRouter/promptSpec/diplomacyRuleText.ts` | 133 |
  | `src/main/openRouter/promptSpec/diplomacyRuleText.test.ts` | 51 |
  | `src/main/openRouter/talk/talkPrompt.ts` | 468 |
  | `src/main/openRouter/talk/talkPrompt.test.ts` | 203 |
  | `src/main/openRouter/talk/talkPromptInput.ts` | 320 |
  | `doc/ai-commander-prompts/strategic-prompt.md` | 501 |
  | `doc/ai-commander-prompts/talk-prompt.md` | 43 |
  | `doc/ai-commander-prompts/source-inventory.md` | 308 |
  | `doc/ai-commander-prompts/assembly-contract.md` | 241 |
  | `doc/commander-messages.md` | 85 |
  | `doc/README.md` | 153 |
  | `README.md` | 348 |
  | `package.json` | 114 |
  | `package-lock.json` | 7459 |
  | `.github/ISSUE_TEMPLATE/bug_report.yml` | 135 |

---

## Defect Inventory

No check failed in a way the phase rules could not fix, and no phase was reverted.

- Phase 3: the script that added the new tests wrote line breaks inside string literals. The build reported it, and the literals were fixed before the tests were watched to fail.

---

## Completion Log

### Decisions made with the user before Phase 0

- Work on a new branch, `feature/v3.7.2-city-hex-standings`. Nothing is committed.
- Run the named tests only. No full suite and no UI smoke test.
- A fresh Opus reviewer reads the diff after Phase 4. Its critical and important findings are fixed.
- `STANDINGS_TALK_BULLET` replaces the plan's Exact text with: "The Standings section ranks the sides still in the match by the city hexes each holds, counted by the game. When the match has a turn limit, that section says when the match ends and who would win if it ended now." The Exact text said "every side", although only sides still in the match are ranked, and said the side in first place wins, although a tie has no winner.

### Applies to every phase

- Commands ran in Git Bash. Backups are in the session scratch folder under `aw-372`, not in `$env:TEMP\aw-372-standings`.
- Each phase's tests were written first and seen to fail (a missing module, missing exports, or failing assertions) before the code was written.

### Phase 1

- **Phase Check:** `build:main`, `lint`, `check:circular`, `naming:check` passed.
- **Tests:** `cityHexStandingsText` 10 of 10.
- **Added:** `src/main/openRouter/cityHexStandingsText.ts` (203), `src/main/openRouter/cityHexStandingsText.test.ts` (185).
- **Sketch and file:** the builder is split into the private helpers `rankSides`, `placeParagraph`, and `endingParagraph`. Its comment says it never throws for a status from `knockoutStatusForSeat`, because `playerIdCodeFor` throws for a seat with no code.

### Phase 2

- **Phase Check:** `build:main`, `lint`, `check:circular` passed.
- **Tests:** all eight named files passed (`scenarioGoals` 13 of 13).
- **Edited:** `scenarioGoals.ts` (335), `scenarioGoals.test.ts` (254).
- **Sketch and file:** they agreed. The existing cases that count or index bullets read them through a `bulletsOf` helper. No expected sentence changed.

### Phase 3

- **Phase Check:** `build:main`, `lint`, `check:circular` (no cycle), `naming:check` passed.
- **Tests:** all nine named files passed.
- **Edited:** `diplomacyRuleText.ts` (144), `diplomacyRuleText.test.ts` (62), `talkPrompt.ts` (481), `talkPrompt.test.ts` (273), `talkPromptInput.ts` (388).
- **Added:** `talk/talkPromptStandings.test.ts` (85).
- **Sketch and file:** `readVictorySettings(gameDbOps)` fitted its parameter type. The caught value is logged as `err`, as the neighbouring talk modules do.

### Phase 4

- **Phase Check:** `build:main`, `lint`, `check:circular`, `naming:check`, `check:renderer-types`, `build:renderer` passed. All 16 named test files passed. `check-doc-links` passed on every edited and added document. `rebuild:native:electron` ran last.
- **Edited:** `strategic-prompt.md` (501), `talk-prompt.md` (44), `source-inventory.md` (308), `assembly-contract.md` (242), `commander-messages.md` (87), `doc/README.md` (155), `README.md` (349), `package.json` (114), `package-lock.json` (7459), `bug_report.yml` (135).
- **Added:** `doc/release-notes/v3.7.2.md` (332).
- **Skipped:** `source-inventory.md` has no talk row and none that mentions `buildTalkSituationText`, so the two talk names were not added there.
- **Wording:** the first release-note bullet says "On the world map, every orders prompt and diplomacy prompt", in the file's voice. The engine-constants sentence in `doc/README.md` is at the end of the "Win rules, knockout, and places" row.
- **Outside the list:** `build:renderer` rewrote `static/renderer.js` with different line endings. They were restored, and the file is unchanged.

### Extra check

- A scratch script outside the repo seeded a temporary three-commander match with a turn limit of 30, captured a real orders request without calling a model, and built a real diplomacy prompt. Both showed the same table and paragraphs under `### Standings` and `## Standings`.

### Review

An Opus reviewer found no critical or important issue and five minor ones.

| Finding | Result |
| --- | --- |
| `variants.md` did not name the Standings subsection | Fixed, because the repo rules require it. `variants.md` (333) is outside the plan's list |
| A missing final period in the `doc/README.md` row | Fixed |
| `information-decision-model.md` has no item for the standings, and `crosswalk.md` follows it | Left for the user. The knockout status lines have no item there either |
| "It goes on until one side is left" leaves out a mutual wipe and a match the player ends | Left as the plan's Exact text. The orders system text states the mutual-wipe rule |
| No test builds the whole orders prompt or the whole talk input with standings | Left. The extra check above covered both once |

Set aside by the reviewer and left as they are: the system bullet stays when a failed read drops the section, because the system text is static for caching; a `|` in a region name would break this table as it would the Sides table; one more status read per talk call; prompts name sides by home region; a save with no `region_vs_region` scenario shows no standings in either prompt.

### Reliability checklist

All 13 lines were confirmed. One exception to the size line: `package-lock.json` is generated, was already over 600 lines, and changed only its two version values.

### Follow-up review

A second pass over the whole change, at the user's request, with targeted tests only and no subagent reviewer.

**User decisions, which replace the plan where they differ:**

- The no-limit paragraph is now "This match has no turn limit. It ends when one side is left, or when every side would be knocked out on the same turn." This replaces the plan's Exact text and the "Left as the plan's Exact text" row above. Manual check 6 quotes the new sentence.
- The item catalog now has `CITY_HEX_STANDINGS`: `information-decision-model.md` (the 3.9 table, job 1, and the visibility contract), `crosswalk.md`, the carrier table in `assembly-contract.md`, and the Items line in `strategic-prompt.md`. This replaces the "Left for the user" row above.
- The player guide, `doc/how-to-play.md`, says commanders are shown the standings.
- No whole-prompt test.

**Fixed from the review:**

- Three tests each built the same status rows. They now share `src/main/testSupport/knockoutStatusFixtures.ts`.
- Missing comments on new test constants, `Purpose` labels on two interfaces, and read-only types on new lists.
- `region-vs-region.md` described Scenario Progress without the Standings subsection.
- `talk-prompt.md` named only a failed read as the reason the section is absent.
- The Standings text in `strategic-prompt.md` is its own paragraph.

**Checks:** the new sentence's tests failed before the code changed and passed after. All 44 affected test files passed (245 `node:test` cases, none skipped): the plan's 16 and every other test file that loads a changed module. `build:main`, `lint`, `naming:check`, `check:circular`, `check:renderer-types`, and `build:renderer` passed, and `static/renderer.js` has its line endings back. `check-doc-links` passed on the edited documents. Real prompts rendered from a seeded match, with and without a turn limit, showed the same standings in the orders and diplomacy steps. No model was called. `rebuild:native:electron` ran last.

### Not done

`npm test`, `npm run ui:smoke`, and the manual checklist are the user's.
