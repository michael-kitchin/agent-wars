# Side Code Display Names Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** When the game shows commander-written text to the player, every side code (`h1`, `a1` to `a4`) for a side in the match appears as that side's display name (`sideDisplayName`). Hovering text that was changed shows the original text as a tooltip. This covers messages and Strategy text in the chat panel, the message dialog (the AI strategy toast), and the Reports tab. Stored text, recorded text, and prompts do not change.

**Shape:** Phase 0 records a baseline. Phase 1 adds one shared function with its tests. Phases 2 to 4 use it in one renderer surface each. Phase 5 updates the docs, runs the final verification, and hands the user a manual checklist.

**Tech:** TypeScript (sandboxed renderer bundled with esbuild, shared modules), `node:test`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/check-circular-deps.cjs`.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- The user chose to run the full Verification Bar only in Phase 0 and Phase 5. Every other phase ends with the shorter Phase Check, which is not optional.
- **Stop only when a verification fails** and you cannot fix it within the phase's file lists. Then revert that phase (see Backup and Revert), record the failure in the Defect Inventory, and stop. Tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**. Do not edit other files, except to remove an import that lint reports unused in a listed file. Record every such file in the Completion Log.
- Find code by the quoted text, not by a line number. Line numbers in this plan are approximate.
- **Code blocks are sketches.** Write the real code from the file you just read. When a sketch and the file disagree, the file wins. Record the difference in the Completion Log. Text in a block marked **Exact** is not a sketch: copy it exactly.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Run this from the repo root. Set `$step` to the phase number and `$files` to that phase's **Edit** list.

```powershell
$step = '2'
$files = @('src/renderer/chat/chatPanel.ts')
$backup = Join-Path $env:TEMP "aw-side-code-display\step-$step"
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

### Phase Check

Every phase from 1 to 4 ends with the Phase Check, run from the repo root:

```powershell
npm run build:main
npm run lint
npm run build:renderer
npm run check:renderer-types
npm run check:circular
```

Then run `node dist/shared/sideCodeDisplayText.test.js` once it exists. It must pass.

- The Phase Check is required. Do not skip it.
- `check:circular` must print **exactly** the cycles recorded in Phase 0.
- `npm run build:renderer` rewrites `static/renderer.js`. That is expected.
- Tests under `src/renderer` are not run by any script, so renderer phases are checked by the build, lint, the renderer type check, and the manual checklist in Phase 5. All logic that can be tested lives in the shared function.
- Record each Phase Check result in the Completion Log.

### Verification Bar

The full Verification Bar runs in Phase 0, to record the baseline, and in Phase 5, after all edits:

```powershell
npm test
npm run build:renderer
npm run check:circular
```

- `npm test` runs the native rebuild, `build:main`, `lint`, `naming:check`, `check:renderer-types`, every compiled `dist/main/**/*.test.js` and `dist/shared/**/*.test.js`, and `notices:check`. It takes about 20 minutes.
- When the final Verification Bar fails, find the phase whose change caused the failure, fix it within that phase's file lists, record the defect in the Defect Inventory, and run the full bar again.
- Never refresh `scripts/renderer-typecheck-baseline.json`, `scripts/circular-deps-baseline.json`, or any other baseline file to make a gate pass.
- **Native module lock.** If `npm test` fails in `rebuild:native:node` with `EBUSY` on `better_sqlite3.node`, close any running Electron app, rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`, rerun `npm test`, then delete the `.locked` file.

---

## Non-Goals

- No change to stored, recorded, saved, or exported text. `side_messages`, `match_records`, turn notes, and recordings keep exactly what the model or the player wrote.
- No change to any prompt, and no change in `src/main`.
- No substitution of region names ("SEGAS", "Southern France"), hex codes, unit ids, or uppercase codes such as `A2`. Only lowercase side codes of seats in the match are replaced.
- No new IPC channel and no change to a shared IPC type.
- No change to how a Reports entry is built. An entry is still built once, when it is filed, so it shows the names in use at that moment, like its existing `To {label}` text.
- No new control tooltip. The new tooltip is the native `title` attribute, which the chat panel's pending lines and the message dialog's tabs already use.
- Do not edit anything under `.spec/completed/`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`. Lint enforces some of them.

- **Orienting comments.** Every new or updated declaration needs a JSDoc block, including private functions, constants, types, and every field of a parameter-object type. Each block has a one-line summary, then `Purpose:` (or `Contract:` for types and interfaces), `When to use:`, `Expected outcome:`, and `Exceptions:`. Update the comment of every existing function whose behavior this plan changes. **Do not copy generic filler.**
- **No logging.** `src/shared` and `src/renderer` never import the main-process logger.
- **Names.** camelCase files and functions, PascalCase types, UPPER_SNAKE constants. Follow `doc/naming-conventions-contract-v1.md`. Allowed role suffixes are `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, and `Types`. Use the file names this plan gives. `npm test` runs `naming:check`.
- **No plan vocabulary in version control.** Words such as "phase" or "execution plan" must never appear in code, comments, test names, or `doc/`.
- **Seat ids.** Production code uses `HUMAN_SEAT_ID`, `AI_SEAT_IDS`, and the guards in `src/shared/seatIds.ts`, never string literals. Tests may use literals.
- **Size limits.** Files should stay under 600 lines and must stay under 1000. `src/renderer/chat/chatPanel.ts` is 597 lines. Phase 2 is written so it stays at or under 600.
- **Safe text.** Renderer text is set with `textContent` or text nodes, never `innerHTML`.
- **`readonly`.** Mark parameter arrays and object fields `readonly` where they are not reassigned.
- **Tests.** Test happy paths and essential failures only.
- **Docs.** `AGENTS.md` requires `doc/` to change in the same change as the code, including each UX document's Code Entry Points. Your final message names every document you updated.

---

## Locked Decisions

The user made these. Do not revisit them.

1. **Display only.** The substitution happens when text is drawn. Nothing stored changes.
2. **Messages and Strategy.** Both messages and commanders' Strategy text are covered, on every surface that shows them: the chat panel, the message dialog, and the Reports tab.
3. **Every seat in the match,** including the human seat's `h1`, which shows the human's display name (`Human` by default).
4. **Display name, with the original as a tooltip.** A replaced code shows `sideDisplayName` only. When any code in a piece of text was replaced, hovering that text shows the original text. Text with nothing replaced gets no new tooltip.
5. **Lowercase whole codes only.** A code inside a unit id (`a2-i5`, `a2-i31-s7`), a longer token (`a12`, `ba1`), or uppercase text (`A1`, which can be a hex code) is never replaced.

---

## Design

### The shared rule

```ts
// src/shared/sideCodeDisplayText.ts
export function sideCodesToDisplayNames(text: string, seats: readonly SideDisplaySeat[]): string
```

- Build a map from code to display name: for each seat whose `seatId` passes `isSeatId`, the key is `playerIdCodeFor(seat.seatId)` (`src/shared/unitIds.ts`) and the value is `sideDisplayName(seat)` (`src/shared/sideNicknames.ts`).
- Replace every match of this pattern whose code is in the map. Leave any other match as written.

  **Exact:**

  ```ts
  const SIDE_CODE_PATTERN = /(?<![A-Za-z0-9_-])([ah][1-4])(?![A-Za-z0-9_-])/g;
  ```

  The look-behind and look-ahead stop a match inside a unit id, a sub-unit id, or a longer word, and the lowercase class leaves hex codes alone. Punctuation next to a code still matches: `a3's`, `(a2)`, `a1,`, and `a4.` all match.
- Use a replacer function, not a replacement string, so a display name is never read as a `$` pattern.
- An empty `seats` list, or text with no match, returns the text unchanged.

### Where it is used

| Surface | File | Text | Tooltip |
| --- | --- | --- | --- |
| Chat panel history | `src/renderer/chat/chatPanel.ts` (`appendHistoryRow`) | The message after `: ` | The original message, when changed |
| Chat panel pending line | `src/renderer/chat/chatPanel.ts` (`stagedRow`) | The draft after `: ` | None added. The line already has the full original line as its title |
| Message dialog, Messages | `src/renderer/openRouter/commanderMessageTabsUi.ts` (`renderCommanderMessageTabs`) | The message after `{label}: ` | The original message, when changed |
| Message dialog, Strategy | Same function | The Strategy body | The original Strategy, when changed |
| Reports tab, message line | `src/renderer/chrome/consoleReports.ts` (`messageReportBody`) | The message after `To {label}: ` | The original message, when changed |
| Reports tab, Strategy line | Same function | The text after `Strategy: ` | The original Strategy, when changed |

The tooltip holds the model's original text only, never the label or the prefix.

### The renderer helper

```ts
// src/renderer/chrome/sideCodeTextHelpers.ts
export function setSideCodeText(element: HTMLElement, args: {
  readonly prefix: string;                      // printed before the text, unchanged, such as ': ' or 'Strategy: '
  readonly rawText: string;                     // the stored text
  readonly seats: readonly SideDisplaySeat[];   // the match's seats
  readonly rawTooltip: boolean;                 // whether a changed text gets the original as its title
}): void
```

It sets `element.textContent` to `prefix` plus `sideCodesToDisplayNames(rawText, seats)`. When `rawTooltip` is true and the converted text differs from `rawText`, it sets `element.title = rawText`. It never sets `innerHTML`. Each call site replaces one existing `textContent` line, so no surface file grows by more than its import line.

---

## Phase 0 — Baseline and Prerequisites

**Add:** nothing. **Edit:** nothing.

1. Run `git status --short` and record the output in the Phase 0 Inventory.
2. Run the Verification Bar. Record pass or fail for each command, and the exact cycle list `check:circular` prints.
3. Record the line counts of `src/renderer/chat/chatPanel.ts`, `src/renderer/openRouter/commanderMessageTabsUi.ts`, and `src/renderer/chrome/consoleReports.ts`.
4. Confirm each of these exists, and record any that do not. **If any is missing, stop and tell the user.**
   - `src/shared/sideNicknames.ts`: `sideDisplayName`, `SideDisplaySeat`.
   - `src/shared/unitIds.ts`: `playerIdCodeFor`. `src/shared/seatIds.ts`: `isSeatId`.
   - `src/renderer/chat/chatPanel.ts`: `rosterSeats`, `appendHistoryRow` with the text ``words.textContent = `: ${row.text}`;``, and `stagedRow` with the same text.
   - `src/renderer/openRouter/commanderMessageTabsUi.ts`: `renderCommanderMessageTabs` with the texts ``words.textContent = `${label}: ${bullet.text}`;`` and `span.textContent = section.body;`.
   - `src/renderer/chrome/consoleReports.ts`: `messageReportBody` with the texts ``words.textContent = `To ${label}: ${text}`;`` and ``strategy.textContent = `Strategy: ${strategyText}`;``.
   - `src/shared/aiStrategyToastContent.ts`: `buildAiStrategyToastSections`, whose Strategy section is the only section with a non-empty `body`.

**Stop if** the bar fails before any edit.

---

## Phase 1 — The Shared Rule

Commander text can be converted for display. Nothing calls it yet.

**Add:** `src/shared/sideCodeDisplayText.ts`, `src/shared/sideCodeDisplayText.test.ts`
**Edit:** nothing.

### Steps

1. Write `sideCodeDisplayText.ts` as the Design section describes. Export `sideCodesToDisplayNames`. Keep `SIDE_CODE_PATTERN` private, with its own orienting comment explaining why each part of the pattern is there. Do not import anything from `src/main`.
2. Because `SIDE_CODE_PATTERN` has the `g` flag, use it only through `String.prototype.replace`, which resets `lastIndex`. Do not call `test` or `exec` on it.

### Tests

`sideCodeDisplayText.test.ts` (copy the structure of `src/shared/sideNicknames.test.ts` if it exists, otherwise of `src/shared/sideMessages.test.ts`). Use seats for `HUMAN_SEAT_ID` with no nickname, and three AI seats with nicknames `Sonnet 5.5`, `DS 4.1 Flash`, and `GPT 6.2 Sol`:
- `Keep the peace with a2 and a3.` gives `Keep the peace with DS 4.1 Flash and GPT 6.2 Sol.`
- `a3's armor hit CI` gives `GPT 6.2 Sol's armor hit CI`. `CI` is unchanged.
- `(a2), a1, a3.` replaces all three codes and keeps the punctuation.
- `h1 is weak` gives `Human is weak`.
- `a1-i3`, `a2-i31-s7`, `a12`, `ba1`, `A1`, and `A2` are each unchanged.
- `a4` is unchanged when no seat has that code.
- An empty seat list returns the text unchanged. Text with no code returns it unchanged.
- A seat whose nickname is the empty string uses its default name, as `sideDisplayName` does.

### Verification

Run the Phase Check.

---

## Phase 2 — The Chat Panel

The chat history and the pending lines show display names for side codes.

**Add:** `src/renderer/chrome/sideCodeTextHelpers.ts`
**Edit:** `src/renderer/chat/chatPanel.ts`

### Steps

1. Write `sideCodeTextHelpers.ts` as the Design section describes, with full orienting comments on the function and each field of its parameter object.
2. `chatPanel.ts`, `appendHistoryRow`: replace ``words.textContent = `: ${row.text}`;`` with one call: `setSideCodeText(words, { prefix: ': ', rawText: row.text, seats: rosterSeats(), rawTooltip: true });`.
3. `chatPanel.ts`, `stagedRow`: replace the same line with `setSideCodeText(words, { prefix: ': ', rawText: row.text, seats: rosterSeats(), rawTooltip: false });`. Leave `text.title` exactly as it is. It already holds the full original line.
4. Add the import. Update the orienting comments of `appendHistoryRow` and `stagedRow` to say that side codes show as display names, and that a changed history line carries its original text as a tooltip.
5. Count the lines of `chatPanel.ts`. It must be 600 or fewer. If it is more, move `stagedEditMark` (with its comment, unchanged) into a new file `src/renderer/chat/chatPanelStagedMarks.ts`, import it, and record the move in the Completion Log.

The history is rebuilt when a side's name changes (see the comment on `renderHistory`), so a nickname changed during a match is picked up on the next paint.

### Verification

Run the Phase Check.

---

## Phase 3 — The Message Dialog

The message dialog shows display names for side codes in both its Messages lines and its Strategy text.

**Add:** nothing.
**Edit:** `src/renderer/openRouter/commanderMessageTabsUi.ts`

### Steps

1. In `renderCommanderMessageTabs`, replace ``words.textContent = `${label}: ${bullet.text}`;`` with `setSideCodeText(words, { prefix: `${label}: `, rawText: bullet.text, seats, rawTooltip: true });`. `seats` is the local `const seats = S.gameState?.seats ?? [];` already in that function.
2. Replace `span.textContent = section.body;` with `setSideCodeText(span, { prefix: '', rawText: section.body, seats, rawTooltip: true });`. That `else` branch only draws the Strategy section, so only Strategy text is affected. Do not touch the `absence` line. It is game text, not commander text.
3. Add the import, and update the orienting comment of `renderCommanderMessageTabs` to say that side codes show as display names with the original as a tooltip.

Replay draws past dialogs through this same function, so replay is covered.

### Verification

Run the Phase Check.

---

## Phase 4 — The Reports Tab

A Reports message entry shows display names for side codes in its message lines and its Strategy line.

**Add:** nothing.
**Edit:** `src/renderer/chrome/consoleReports.ts`

### Steps

1. In `messageReportBody`, replace ``words.textContent = `To ${label}: ${text}`;`` with `setSideCodeText(words, { prefix: `To ${label}: `, rawText: text, seats, rawTooltip: true });`. `text` is the trimmed message already in that loop, and `seats` is the local already in that function.
2. Replace ``strategy.textContent = `Strategy: ${strategyText}`;`` with `setSideCodeText(strategy, { prefix: 'Strategy: ', rawText: strategyText, seats, rawTooltip: true });`.
3. Add the import, and update the orienting comment of `messageReportBody`.

### Verification

Run the Phase Check.

---

## Phase 5 — Docs, Final Verification, and Hand-Off

**Add:** nothing.
**Edit:** `doc/ux/chat-panel.md`, `doc/ux/notifications-and-feedback.md`, `doc/ux/reports-tab.md`, `doc/commander-messages.md`

### Steps

1. `doc/ux/chat-panel.md`: where it describes a history line and a pending line, add that a side code (`h1`, `a1` to `a4`) of a side in the match shows as that side's `sideDisplayName`, and that a history line whose text changed carries the original text as its tooltip. A pending line keeps its existing title, the full original line. Add `src/shared/sideCodeDisplayText.ts` (`sideCodesToDisplayNames`) and `src/renderer/chrome/sideCodeTextHelpers.ts` (`setSideCodeText`) to Code Entry Points.
2. `doc/ux/notifications-and-feedback.md`: in the AI strategy toast description, add the same rule for Messages lines and the Strategy text, with the original as the tooltip. Add the same two entries to Code Entry Points.
3. `doc/ux/reports-tab.md`: add the same rule for a message entry's `To {label}: {text}` lines and its `Strategy:` line. Say that an entry uses the names in use when it was filed. Add the same two entries to Code Entry Points.
4. `doc/commander-messages.md`: add one short paragraph saying the stored and recorded text is exactly what the commander or player wrote, and that the screens show side codes as display names, with the original text as a tooltip.
5. Search the whole diff for plan vocabulary: `git diff -- src doc | Select-String -Pattern 'Phase \d|side-code-display-names|execution plan|locked decision' -CaseSensitive:$false`. Nothing under `src/` or `doc/` may match.
6. Confirm nothing under `src/main` changed: `git diff --stat -- src/main` prints nothing for this plan's work.
7. Run the full Verification Bar.
8. Fill in the Completion Log, with the final line counts of the three renderer files.
9. In your final message, name every document you updated, as `AGENTS.md` requires.

### Manual checklist for the user

Give the user this list in your final message:

1. Load a save from the current match, with nicknames set, where commanders wrote codes. The last save of the four-AI Western Europe match is a good one.
2. Open the chat panel history. A line such as "a3 is the common enemy" reads "GPT 6.2 Sol is the common enemy". Hovering it shows the original line. A line with no code has no tooltip.
3. Open a message dialog during play or replay. Messages lines and the Strategy text show nicknames. A unit id such as `a3-t2` and a hex code such as `CI` are unchanged.
4. Open the Reports tab. A message entry's `To …:` lines and its `Strategy:` line show nicknames, with the original as a tooltip.
5. Change a side's nickname in Game Options. The chat history shows the new name on its next paint. Reports entries filed earlier keep the old name.
6. In a match with a human player, a message naming `h1` shows your nickname, or `Human`.

---

## Reliability Checklist

- [ ] Each phase's files were backed up before the first edit.
- [ ] The Phase Check ran and passed at the end of every phase from 1 to 4.
- [ ] Nothing under `src/main` changed, and no stored or recorded text changed.
- [ ] No text is set with `innerHTML`.
- [ ] `chatPanel.ts` is at or under 600 lines.
- [ ] Every new function, type, field, and constant has a full orienting comment that is not generic filler.
- [ ] `npm run check:circular` shows only the Phase 0 cycles.
- [ ] No baseline file was edited.
- [ ] No commit, push, stash, checkout, restore, reset, or clean was run.
- [ ] No plan vocabulary appears in `src/` or `doc/`.

## Success Definition

- Every surface in the Design table shows `sideDisplayName` in place of a lowercase side code of a seat in the match, and shows the original text as a tooltip where text changed, except the chat panel's pending line, which keeps its existing full-line title.
- Unit ids, sub-unit ids, longer tokens, uppercase codes, and codes of seats not in the match are unchanged.
- Stored, recorded, and prompt text are unchanged.
- The Verification Bar passes.

---

## Phase 0 Inventory

| Item | Value |
|------|-------|
| `git status --short` | |
| `npm test` | |
| `npm run build:renderer` | |
| `check:circular` cycle list | |
| Line counts (chat panel, message dialog, reports) | |
| Missing symbols | |

## Defect Inventory

| Phase | Command | First error | Action taken |
|-------|---------|-------------|--------------|

## Completion Log

| Phase | Result | Sketch differences | Files changed outside the Add/Edit lists | Docs updated |
|-------|--------|--------------------|------------------------------------------|--------------|
