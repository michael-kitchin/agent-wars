# Side nicknames execution plan

> **For the implementing agent:** Follow this plan from top to bottom, one phase at a time. Finish each phase's verification before you start the next one. When a check fails, stop and report the command, the actual output, and the expected output. Do not make a check pass by weakening a test or a smoke check. Do not commit or push. Do not build anything this plan does not name. Phase names in this file stay in this file. Never put them in code, comments, tests, `doc/`, or configuration.

**Goal:** A player can name the human side and each AI side. The human name is a field at the top of the Game Options popover, saved on this computer, and applied when the next match starts. Each AI name is a field at the top of that side's commander popover. It starts as that side's short home name, resets when that side's home changes, and can be edited during a match. During a match, every place that currently shows a side's full home name or short home name shows this nickname instead. The new-game home lists and region lists do not.

**Architecture:** Nicknames are display text. The match still stores `home_region`, and the AI prompts still receive that full home name. One shared function, `sideDisplayName`, turns a seat into the text the UI shows. The human's nickname lives in the machine-local `game_config` row `human_nickname` and is copied onto the human seat when a match starts. Each seat of a match stores its own `nickname` column. A missing column, and a null value, keep today's words: "Human" for a human seat, the short home name for an AI seat.

**Tech stack:** TypeScript under `src/`, markup in `static/index.html`, chrome CSS in `static/newGameChrome.css` and `static/frameChrome.css`, Node `node:test`, and the existing UI smoke run.

## Locked decisions

These come from the product owner. Do not change them.

- **Display only.** Nothing under `src/main/openRouter/` that builds a prompt learns the nickname. Commanders keep seeing the full `homeRegion`.
- **Human field.** A text field at the top of the Game Options popover. The default is `Human`. Saving it writes the database immediately. Opening the new-game overlay, switching tabs, changing region, and starting a match do not put the field back to `Human`. A change applies to the human seat of the next match. It does not rename the human in a match that is already running.
- **AI field.** A text field at the top of the commander popover, on the new-game screen and on the Commanders tab during a match. It starts as that row's current short home name. It resets to the new short home name when that row's home changes, when the new-game overlay opens, and when the tab or the regional area changes. During a match it saves the way the model, reasoning, and doctrine already save.
- **Copy.** The new-game copy button copies the nickname together with the model, the reasoning effort, the doctrine, and the key.
- **Duplicates.** Two sides may show the same nickname. A blank field means "use the default", not an error.
- **Out of scope.** Home and region lists in the new-game dialog stay the full names. `sideHomeNameKey` stays a home-matching helper. Do not put the nickname in prompts, tool arguments, or saved order text.

## Implementation calls

The plan's author made these calls. They are locked for this plan, and the product owner reviews them along with it.

- **Length.** `SIDE_NICKNAME_MAX_LENGTH` is 16. Both inputs set `maxLength` to it. Normalization cuts to 16 Unicode code points as well.
- **Allowed characters.** Letters, marks, numbers, spaces, `.`, `-`, `'`, and `’` (U+2019). Anything else is dropped, including `<`, `&`, quotes, commas, and newlines. Every allowed character is one UTF-16 code unit, so the HTML `maxLength` and the code-point cap agree. This is what keeps a nickname out of HTML and out of the turn-update sentence splitter.
- **Reserved results.** After cleaning, a nickname that is `you`, `your`, or `neutral` in any letter case is blank. A nickname that contains ` lost `, ` took `, or ` and ` in any letter case is blank. Those are the words `hexSentenceMarks` and `splitJoinedNames` in [`src/shared/turnReportLines.ts`](../src/shared/turnReportLines.ts) use to find names. A blank result means the default, so the player sees the short name again rather than a name the flag painter would split.
- **Words that are not side names.** Do not replace `You`, `you`, `Your Losses`, `Neutral`, `Neutral Losses`, `yours`, or `Enemy`. Those are fixed sentences. The nickname replaces the home name and the short home name only.
- **Viewer loss header.** The viewer's section stays `Your Losses` even when the human nickname is `Dave`. Another side's header becomes `{nickname} Losses`, so the default AI header changes from the full home name to the short home name.
- **One display function.** `sideDisplayName` is the only function the UI calls for a side's on-screen name. Do not pass its result through `shortSideName`. `shortSideName` remains the AI default, inside `sideDisplayName` only.
- **Column, not a version bump.** Add `seats.nickname` with `ensureSeatNicknameColumn`, on the pattern of `ensureHireOrderReservedCreditsColumn`. Do not change `EXPECTED_USER_VERSION`. A bump would make every current save unloadable. Update the comment on `EXPECTED_USER_VERSION` and [`doc/save-files.md`](../doc/save-files.md) so the next reader knows this column is the second allowed exception.
- **Null means default.** Old matches have a null nickname. A human seat then shows `Human`. An AI seat then shows `shortSideName(homeRegion)`, or the seat id when the home is blank. New matches write a non-null nickname when the player has one, and null when they left the default.
- **Human setting.** `game_config` key `human_nickname`, constant `HUMAN_NICKNAME_CONFIG_KEY`, listed in `MACHINE_LOCAL_CONFIG_KEYS`. A missing row means `Human`. The start payload also carries the field's current text, so a match cannot start from a save that has not finished yet. When the payload omits it, the main process uses the stored row.
- **AI value on the seat input.** `NewGameSeatInput.nickname` is what the roster stores. The commander object carries the same string so the copy-from-last-game snapshot has it. `buildSeatsPayload` sets both from the row. The main process stores `seat.nickname` and does not read `commander.nickname` for the roster.
- **Remembered commanders.** Add `nickname` to the encrypted `openrouter_commander_memory` objects. A missing field reads as `''`. That key is machine-local and is not inside a save, so this is not a save-file JSON change and does not need a version bump. An empty remembered nickname does not wipe the row being copied onto: the copy keeps that row's current nickname.
- **Add side.** A new AI row copies the previous row's model, effort, doctrine, and key. Its nickname is the new home's short name, not the previous row's nickname.
- **Nickname-only save.** Changing a nickname during a match does not cancel that seat's consultation. A model or effort change still does.
- **Omitted mid-match nickname.** If `setSeatCommander` is called without a `nickname` property, the stored nickname stays. The popover always sends one.
- **Logging.** Log the seat id and the nickname length. Do not log the nickname text.
- **Popover title during a match.** `{nickname} commander`. The new-game title stays `Opponent 1 commander` or `Side 1 commander`, because that is the row label, not the side name.
- **Clipping.** The 16-character cap is the limit for `<option>` text and for sentences. Elements that already sit in a narrow box also get `text-overflow: ellipsis` and a `title` with the full nickname. Tooltip bodies are the expanded text. Do not ellipsize them.

## The display rule

Use this in every later phase. `sideDisplayName(seat)` returns:

1. The seat's nickname, after `normalizeSideNickname`, when that is non-empty.
2. Otherwise `Human` when `seat.kind` is the human kind.
3. Otherwise `shortSideName(seat.homeRegion)` when the trimmed home is non-empty.
4. Otherwise `seat.seatId`.

A `SeatSnapshot` is a valid input once `nickname` is on `SeatRecord`. Narrow seat types that are built by hand must gain `kind` and `nickname`, or the call is not allowed to guess.

## Global constraints

- Follow `AGENTS.md` and every file in `.cursor/rules/`. Never commit or push.
- No plan, phase, or workflow identifiers in code, comments, tests, `doc/`, or configuration.
- Every new or changed function, type, interface member, and module-level constant gets an orienting comment: Purpose, When to use, Expected outcome, Exceptions. Match the comments in [`src/shared/shortSideName.ts`](../src/shared/shortSideName.ts).
- **Logging, main process only.** Public functions that change state log at debug on entry. Caught exceptions log at error with the error object. Getters that do not change state log at trace. Use `logDebug`, `logTrace`, and `logError` from [`src/main/logger.ts`](../src/main/logger.ts). Shared modules and renderer modules have no logger.
- **Tests.** Cover the happy path and the essential failures of each new contract, and nothing more. Do not test markup, CSS, or a function that only forwards a call.
- **Where tests run.** `npm run build:main` compiles `src/main` and `src/shared`, including tests. `scripts/run-main-node-tests.cjs` runs every `*.test.js` under `dist/main` and `dist/shared`. Renderer modules have no test runner. Logic that needs a test goes in `src/shared/` or `src/main/`.
- **Generated bundle.** Do not edit `static/renderer.js` by hand. Run `npm run build:renderer` after renderer changes.
- **Shell.** Windows PowerShell at `F:\Projects\Personal\agent-wars-public`. Run one command per line. Do not chain with `&&`.
- **Line endings.** Keep each file's existing line endings.
- **File size.** The desirable limit is 600 lines and the hard limit is 1000. [`src/main/main.ts`](../src/main/main.ts) is already past 600. Phase 6 moves the commander handler out of it before adding nickname behavior. Other files this plan names can take the small edits described. If an edit you did not expect would push a file past 1000, stop and report.
- **Arguments.** At most 6 named arguments. Use one parameter object when you would need more.
- **Immutability.** Use `const` and `readonly` wherever a value does not change.
- **Naming.** Follow [`doc/naming-conventions-contract-v1.md`](../doc/naming-conventions-contract-v1.md). New files under `src/` are camelCase. Do not use `Utils` or `Impl`.
- **Docs.** Update the `doc/` files each phase names, in that phase. Take numbers and names from the code, and name the symbol they come from. Do not edit [`doc/devleopment-plan-v3.4.md`](../doc/devleopment-plan-v3.4.md) or the release notes.
- **Secrets.** A nickname is not a secret, but it is player-chosen text. Keep it out of log messages. Do not store it in `openrouter_seat_api_keys`, `openrouter_api_key`, or any other encrypted key row.

## Phase 1: Shared nickname rules

**Outcome:** `normalizeSideNickname`, the defaults, and `sideDisplayName` exist and are tested. No caller uses them yet. The screen is unchanged.

### Files

- Create `src/shared/sideNicknames.ts` and `src/shared/sideNicknames.test.ts`.

### Steps

1. Create `src/shared/sideNicknames.ts`. It may import `shortSideName` from `./shortSideName` and `HUMAN_SEAT_KIND` plus `SeatKind` from `./seatRoster`. It must not import a logger, the database, or a renderer module. `seatRoster.ts` already re-exports `shortSideName` and imports other shared modules. Do not import `sideNicknames.ts` from `seatRoster.ts`, or the two files will import each other.

2. Export these, each with an orienting comment.

   - `SIDE_NICKNAME_MAX_LENGTH = 16`.
   - `HUMAN_NICKNAME_DEFAULT = 'Human'`.
   - `HUMAN_NICKNAME_CONFIG_KEY = 'human_nickname'`.
   - `normalizeSideNickname(value: unknown): string`. A non-string returns `''`. Otherwise: drop every character outside letters, marks, numbers, space, `.`, `-`, `'`, and U+2019; collapse whitespace to one space; trim; keep the first 16 code points (`Array.from`, not `String.slice`); then return `''` when the lowercased result is `you`, `your`, or `neutral`, or when it contains ` lost `, ` took `, or ` and `.
   - `defaultAiNickname(homeRegion: string, seatId: string): string`. The short home name when the trimmed home is non-empty, otherwise `seatId`.
   - `sideDisplayName(seat)` where `seat` is `{ readonly nickname: string | null; readonly homeRegion: string; readonly seatId: string; readonly kind: SeatKind }`. Follow the display rule above. The human fallback is `HUMAN_NICKNAME_DEFAULT`, not `defaultAiNickname`.

3. Create `src/shared/sideNicknames.test.ts`. Use `node:test` and `node:assert/strict`. Cover:

   - A normal name is trimmed and returned. A name longer than 16 code points is cut to 16.
   - Characters outside the allowed set are removed, including `<`, `&`, `"`, commas, and newlines. The surrounding letters stay, so `A<b` becomes `Ab`.
   - `you`, `YOUR`, `Neutral`, `we lost 1`, `they took 2`, and `A and B` become `''`. `Andes` and `W. Turkey` stay.
   - A non-string becomes `''`.
   - `sideDisplayName` uses a cleaned nickname when present.
   - A null nickname on a human seat is `Human`. A null nickname on an AI seat is the short home name (`Western Turkey` becomes `W. Turkey`). A null nickname and a blank home return the seat id.
   - A nickname that normalizes to blank falls through to that same default.

### Verification

```powershell
npm run build:main
node dist/shared/sideNicknames.test.js
npm run lint
```

All of these must pass.

## Phase 2: Store a nickname on each seat

**Outcome:** A match can store a nickname per seat, including the human seat. Old match files gain a null column on open and still load. Nothing displays the nickname yet. Starting a match still writes null, so the screen cannot change until later phases.

### Files

- Modify [`src/main/gameDb/schema.ts`](../src/main/gameDb/schema.ts) (`CREATE TABLE seats`).
- Modify [`src/main/gameDb/seatRosterStore.ts`](../src/main/gameDb/seatRosterStore.ts). Add `ensureSeatNicknameColumn` here.
- Modify [`src/main/gameDb.ts`](../src/main/gameDb.ts) at the three `ensureHireOrderReservedCreditsColumn(gameDbOps)` call sites, and the comment on `EXPECTED_USER_VERSION`.
- Modify [`src/shared/seatRoster.ts`](../src/shared/seatRoster.ts) (`SeatRecord` only).
- Modify [`src/main/gameDb/seatRosterStore.test.ts`](../src/main/gameDb/seatRosterStore.test.ts).
- Modify [`doc/save-files.md`](../doc/save-files.md).

### Steps

1. In `getFullDdl`, add `nickname TEXT` to `CREATE TABLE seats`, after `home_region`. Nullable. No default, so a rebuilt file still stores null until a later phase writes one.

2. Add `ensureSeatNicknameColumn(ops)` next to the roster store, copying the shape of `ensureHireOrderReservedCreditsColumn` in [`src/main/gameDb/mercenaryState.ts`](../src/main/gameDb/mercenaryState.ts): log at debug, `PRAGMA table_info(seats)`, return when `nickname` exists, otherwise `ALTER TABLE seats ADD COLUMN nickname TEXT`. Call it immediately after each of the three `ensureHireOrderReservedCreditsColumn(gameDbOps)` calls in `gameDb.ts`.

3. On `EXPECTED_USER_VERSION`, extend the comment so it names both `ensureHireOrderReservedCreditsColumn` and `ensureSeatNicknameColumn` as the `getFullDdl` changes that must not bump the version. Leave the value at 26.

4. Add `readonly nickname: string | null` to `SeatRecord`, with an orienting comment: null means the UI uses the default from `sideDisplayName`. The human seat can have one. It is not a prompt field. Do not put it on `SeatCommander`. `toSeatSnapshot` already copies the seat with a spread, so the snapshot gains it with no further change. Check that spread still compiles.

5. Thread the column through `seatRosterStore.ts`:

   - Add `nickname: string | null` to `SeatRow`.
   - Add `nickname` to the `SELECT` in `readSeatRoster` and to the object `seatFromRow` returns.
   - Add `nickname` to the `INSERT` column list and the value list in `replaceSeatRoster`. Write `seat.nickname`.
   - `updateSeatCommander` updates model, effort, and doctrine only. Its returned seat is `{ ...seat, commander: nextCommander }`, which keeps `nickname`. Do not add nickname handling to that function.

6. `assignSeatIdentity` in [`src/main/gameDb/seatResolution.ts`](../src/main/gameDb/seatResolution.ts) builds each new seat as an object literal. Add `nickname: null` there. Do not compute a name in this phase. `npm run build:main` will also fail on other `SeatRecord` literals that have no `nickname`. Add `nickname: null` to each one the compiler names, and change nothing else on those objects. Likely files include `src/main/gameDb/seatRosterStore.test.ts`, `src/shared/seatRoster.test.ts`, and tests that build a roster row by hand. Fix only what the compiler reports.

7. In `seatRosterStore.test.ts`, extend the round trip: write one human seat with `nickname: 'Scout'` and one AI seat with `nickname: null`, read the roster back, and assert those two values. On the AI seat the existing `updateSeatCommander` test already updates, set `nickname: 'Scout'` before the update and assert it is still `Scout` afterward. Do not call `updateSeatCommander` on the human seat. That call throws.

8. In `doc/save-files.md`, in the Version section, add `seats.nickname` beside `res_s_hire_orders.reserved_credits` as a column added on open (`ensureSeatNicknameColumn`) that does not change `EXPECTED_USER_VERSION`. Say a null nickname is the pre-nickname match, and the screen treats it as the default. Do not change the version number in that file.

### Verification

```powershell
npm run build:main
node dist/main/gameDb/seatRosterStore.test.js
node dist/shared/seatRoster.test.js
npm run lint
```

All of these must pass. If `build:main` names another test file, add `nickname: null` there and rerun that file's compiled test. Do not update assertion text in this phase. The screen still uses home names.

## Phase 3: Show the stored nickname during a match

**Outcome:** Every in-match surface that showed a full home name or a short home name shows `sideDisplayName` instead. With this phase's null nicknames, a human seat shows `Human` and an AI seat shows the short home name. Custom text cannot be entered yet. Prompts are unchanged. New-game home and region lists are unchanged.

### Files

Shared formatters:

- [`src/shared/sideLabels.ts`](../src/shared/sideLabels.ts). Delete `abbreviatedSideName` after its callers move. Add `kind` and `nickname` to `SideLabelSeat`.
- [`src/shared/topBarSides.ts`](../src/shared/topBarSides.ts) (`chipFor`, and the lead label in `buildTopBarSideChips`).
- [`src/shared/topBarStats.ts`](../src/shared/topBarStats.ts) (`citiesReadout`).
- [`src/shared/turnReportLines.ts`](../src/shared/turnReportLines.ts) (`hexLabelForSeat`, `hexNameForSeat`, `headerNameForSeat`).
- [`src/shared/turnLossSections.ts`](../src/shared/turnLossSections.ts) (`lossSectionTitle`, `lossSectionOwnerId`).
- [`src/shared/standings.ts`](../src/shared/standings.ts) and [`src/shared/knockoutNotice.ts`](../src/shared/knockoutNotice.ts) and [`src/shared/knockoutDialogCopy.ts`](../src/shared/knockoutDialogCopy.ts), wherever they interpolate a home name.

Renderer painters, which should call `sideDisplayName` rather than `shortSideName(seat.homeRegion)` or `seat.homeRegion`:

- [`src/renderer/chrome/battleHeader.ts`](../src/renderer/chrome/battleHeader.ts)
- [`src/renderer/gameplay/meleeInterceptModal.ts`](../src/renderer/gameplay/meleeInterceptModal.ts) (`partyName`)
- [`src/renderer/gameplay/observeChrome.ts`](../src/renderer/gameplay/observeChrome.ts)
- [`src/renderer/core/unitOriginFlags.ts`](../src/renderer/core/unitOriginFlags.ts) (`mercenaryOwnerShortName`)
- [`src/renderer/openRouter/openRouterUiHelpers.ts`](../src/renderer/openRouter/openRouterUiHelpers.ts) (`activitySeatPrefix`)
- [`src/renderer/openRouter/commanderCardsUi.ts`](../src/renderer/openRouter/commanderCardsUi.ts) (card name, log filter, popover title)
- [`src/renderer/openRouter/commanderMessageTabsUi.ts`](../src/renderer/openRouter/commanderMessageTabsUi.ts)
- [`src/shared/commanderMessageTabs.ts`](../src/shared/commanderMessageTabs.ts)
- [`src/renderer/chrome/consoleReports.ts`](../src/renderer/chrome/consoleReports.ts) (message body and the sender filter)
- [`src/renderer/tactical/tacticalExitFlow.ts`](../src/renderer/tactical/tacticalExitFlow.ts) (`aiOnlyResultSentence`)
- [`src/renderer/gameplay/knockoutNotices.ts`](../src/renderer/gameplay/knockoutNotices.ts) and [`src/renderer/gameplay/knockoutDialog.ts`](../src/renderer/gameplay/knockoutDialog.ts), where they copy `homeRegion` into `victimName` or `outByName`
- [`src/renderer/gameplay/readyResolutionAnnouncements.ts`](../src/renderer/gameplay/readyResolutionAnnouncements.ts) (`launchTurnSeats`)
- [`src/renderer/gameplay/gameOverStandings.ts`](../src/renderer/gameplay/gameOverStandings.ts) (`seatInput`)

Tests and docs are listed in the steps.

### Steps

1. Change `SideLabelSeat` to `Pick<SeatSnapshot, 'seatId' | 'seatOrder' | 'homeRegion' | 'outTurn' | 'kind' | 'nickname'>`. Callers that pass `gameState.seats` already satisfy this once phase 2 compiled. `abbreviatedSideName` becomes a call to `sideDisplayName`, then delete `abbreviatedSideName` and update `formatHexControlLabel`, `formatUnitNameForViewer`, and `formatHomeChip` to call `sideDisplayName`. Keep the two-seat unit-name rule: a unit prefix still appears only for another seat when the match has three or more seats.

2. Apply the same replacement at every site in the file list. The lead top-bar chip uses `sideDisplayName(viewer)`, not `viewer.homeRegion`. `citiesReadout` uses `sideDisplayName` for each seat. `headerNameForSeat` and `hexNameForSeat` both use `sideDisplayName`, so a loss header and a hex sentence name a seat with the same characters and `sideNameMarksForLine` still finds them. `lossSectionTitle` and the name comparison inside `lossSectionOwnerId` use `sideDisplayName` too. Keep the existing seat-order tie-break: when two seats display the same nickname, the lower `seatOrder` wins. Do not remove that sort.

3. Hand-built seat objects must carry `kind` and `nickname`. Update the builders, not the formatters:

   - `launchTurnSeats` copies `kind` and `nickname` onto `TurnReportSeat`. `TurnReportSeat`, `SideNameMarkSeat`, and `TurnLossSectionSeat` gain those two fields. They are the same shape; keep them as one shared pick if that is a smaller edit, but do not invent a third name if the existing names can share a type alias from `sideNicknames.ts`.
   - `seatInput` in `gameOverStandings.ts` copies them onto `StandingsSeatInput`.
   - `TopBarSideSeat` and `TopBarSeatRow` gain them. Their callers pass full snapshots.
   - `showCommanderMessageTabs` passes `sideDisplayName(seat)` as the label. `initialCommanderMessageTabs` stops calling `shortSideName`. It stores the label it is given. Update its comment, which currently promises to shorten.

4. Knockout copy is given names by the renderer. Pass `sideDisplayName(seat)` into `victimName` and `outByName`. Leave the `You are out of the match.` branch as it is.

5. Leave these alone, and do not "fix" them if a test mentions them:

   - `You`, `you`, `Your Losses`, `Neutral`, `Neutral Losses`, `yours`, `Enemy`.
   - Home `<option>` text and region `<option>` text in the new-game dialog.
   - Every file under `src/main/openRouter/` that builds prompt text. `homeRegion` there stays.
   - `sideHomeNameKey` and its callers in `gameDb.ts` and `regionScenario.ts`.

6. HTML. Search the files you touched for `innerHTML` and for template strings that wrap a side name in HTML. The hex tooltip already passes the control line through `escapeHtmlText` in [`src/renderer/map/terrainTooltipHtml.ts`](../src/renderer/map/terrainTooltipHtml.ts). The selection chip already escapes in [`src/shared/selectionPanelSummary.ts`](../src/shared/selectionPanelSummary.ts). Keep it that way. If you find a side name concatenated into HTML, pass it through `escapeHtmlText` from [`src/shared/htmlTextFormatting.ts`](../src/shared/htmlTextFormatting.ts). `textContent` does not need that.

7. Tests. A null nickname now displays `Human` for a human seat and the short name for an AI seat. Update assertions that expected the full home name on screen. Do not change assertions about prompt text.

   - [`src/shared/sideLabels.test.ts`](../src/shared/sideLabels.test.ts). Add `kind` and `nickname: null` to the seats. Existing short-name expectations stay. Add one case with `nickname: 'Grok'` on the controller and expect `Grok` in the control line, the unit prefix, and the home chip.
   - [`src/shared/topBarSides.test.ts`](../src/shared/topBarSides.test.ts). The lead chip expectation changes from `Western Turkey` to `Human` when that seat is human and its nickname is null. Give one chip `nickname: 'Grok'` and expect that label.
   - [`src/shared/topBarStats.test.ts`](../src/shared/topBarStats.test.ts). The Cities tooltip lists nicknames. A human with a null nickname contributes `Human (you)`.
   - [`src/shared/turnLossSections.test.ts`](../src/shared/turnLossSections.test.ts), [`src/shared/turnReportLines.test.ts`](../src/shared/turnReportLines.test.ts), [`src/shared/consolidatedTurnUpdateToast.test.ts`](../src/shared/consolidatedTurnUpdateToast.test.ts), and [`src/main/turnUpdateSummary.test.ts`](../src/main/turnUpdateSummary.test.ts). AI loss headers become the short name (`## E. Turkey Losses`, not `## Eastern Turkey Losses`) unless the seat has a nickname. Hex sentences were already short names. `Your Losses` stays. Add one header and one hex sentence that use `nickname: 'Grok'`, and assert `sideNameMarksForLine` marks `Grok` in both.
   - [`src/shared/standings.test.ts`](../src/shared/standings.test.ts) and [`src/shared/knockoutNotice.test.ts`](../src/shared/knockoutNotice.test.ts). Full home names in results, rows, `Knocked out by`, the observe-mode winner line, and knockout sentences become the short name, or `Human` for a human seat with a null nickname. `You placed` and `You are out of the match.` stay. Add one `Grok` case to standings and one to the knockout notice.
   - [`src/shared/commanderMessageTabs.test.ts`](../src/shared/commanderMessageTabs.test.ts). Labels are stored as given. Adjust the fixture so the expected tab text is still `N. America` and the others, by passing those strings in, and add one case that `Grok` is kept character for character.
   - [`src/shared/selectionPanelSummary.test.ts`](../src/shared/selectionPanelSummary.test.ts) only if it builds seats itself. It mostly renders a string it was given.

   When `build:main` reports a fixture missing `kind` or `nickname`, add them. When a prompt test fails, you changed a prompt path. Revert that path. Do not edit the prompt to satisfy the test.

8. Docs. In each of these, replace the description of the on-screen full or short side name with the nickname, and name `sideDisplayName` in [`src/shared/sideNicknames.ts`](../src/shared/sideNicknames.ts). Say a null nickname shows `Human` for the human seat and the short home name for an AI seat.

   - [`doc/ux/top-bar.md`](../doc/ux/top-bar.md) (chips, the lead chip, View as, the battle force bar, the Cities tooltip).
   - [`doc/ux/hex-tooltips.md`](../doc/ux/hex-tooltips.md) (the Control line).
   - [`doc/ux/selection-panel.md`](../doc/ux/selection-panel.md) and [`doc/ux/stack-callout.md`](../doc/ux/stack-callout.md) (home chip and the three-seat unit prefix).
   - [`doc/ux/notifications-and-feedback.md`](../doc/ux/notifications-and-feedback.md) (update-popup headers, hex sentences, strategy-tab labels).
   - [`doc/ux/reports-tab.md`](../doc/ux/reports-tab.md) (it copies the toast, plus the sender filter and the quoted message).
   - [`doc/ux/modes-and-transitions.md`](../doc/ux/modes-and-transitions.md) (View as).
   - [`doc/ux/ai-activity-log.md`](../doc/ux/ai-activity-log.md) (the seat prefix and the log filter).
   - [`doc/ux/opponent-tab-commander.md`](../doc/ux/opponent-tab-commander.md) (the card's name, and the popover title during a match).
   - [`doc/how-to-play.md`](../doc/how-to-play.md) only where it describes a name the player sees during a match.

### Verification

```powershell
npm run build:main
node dist/shared/sideLabels.test.js
node dist/shared/topBarSides.test.js
node dist/shared/topBarStats.test.js
node dist/shared/turnReportLines.test.js
node dist/shared/turnLossSections.test.js
node dist/shared/consolidatedTurnUpdateToast.test.js
node dist/main/turnUpdateSummary.test.js
node dist/shared/standings.test.js
node dist/shared/knockoutNotice.test.js
node dist/shared/commanderMessageTabs.test.js
npm run typecheck:renderer
npm run lint
npm run build:renderer
```

All of these must pass. Then search:

```powershell
rg -n "sideDisplayName|sideNicknames" src/main/openRouter
rg -n "abbreviatedSideName" src
```

The first search must print nothing. The second must print nothing in `src/`. Prompt tests are part of `npm test` in phase 7. Do not start phase 4 until this phase's commands pass.

## Phase 4: The human nickname field

**Outcome:** Game Options has a Nickname field at the top. It loads the saved name, saves on each edit, and survives a restarted app. The next match's human seat stores that name. A match already running does not change. There is still no AI field.

### Files

- Create `src/main/humanNickname.ts` and `src/main/humanNickname.test.ts`.
- Modify [`src/main/gameDb/machineLocalConfigKeys.ts`](../src/main/gameDb/machineLocalConfigKeys.ts).
- Modify [`src/shared/ipc/channels.ts`](../src/shared/ipc/channels.ts) and the matching channel object in [`src/main/preload.ts`](../src/main/preload.ts) (preload keeps its own copy and does not import `channels.ts`).
- Modify [`src/shared/ipc/gameApiTypes.ts`](../src/shared/ipc/gameApiTypes.ts) and the `gameApi` object in `preload.ts`.
- Modify [`src/main/main.ts`](../src/main/main.ts) only to register the handler and to pass the nickname into `resetGameForNewMatch`. If `main.ts` would grow by more than a few lines, put the two IPC handlers in a new `src/main/ipc/humanNicknameIpcHandler.ts` and call it from `registerIpcHandlers`.
- Modify [`src/shared/ipc/ordersTypes.ts`](../src/shared/ipc/ordersTypes.ts) (`NewGameIpcPayload`).
- Modify [`src/main/gameDb/resetGame.ts`](../src/main/gameDb/resetGame.ts) and [`src/main/gameDb/seatResolution.ts`](../src/main/gameDb/seatResolution.ts).
- Modify [`static/index.html`](../static/index.html) and [`static/newGameChrome.css`](../static/newGameChrome.css).
- Create `src/renderer/gameplay/humanNicknameField.ts`.
- Modify [`src/renderer/gameplay/newGame.ts`](../src/renderer/gameplay/newGame.ts) and [`src/renderer/gameplay/newGameSidesUi.ts`](../src/renderer/gameplay/newGameSidesUi.ts) (`buildSeatsPayload`'s caller, not the home lists).
- Modify [`src/shared/newGameSides.ts`](../src/shared/newGameSides.ts) (`buildSeatsPayload` only).
- Modify [`scripts/ui-smoke/ui-smoke-new-game-checks.cjs`](../scripts/ui-smoke/ui-smoke-new-game-checks.cjs).
- Docs listed in the steps.

### Steps

1. Add `HUMAN_NICKNAME_CONFIG_KEY` to `MACHINE_LOCAL_CONFIG_KEYS`. The constant already lives in `sideNicknames.ts`. Import it. Do not make a second string. Update the module comment that says the list has six keys: it now has seven. `src/main/saveGame/saveFileWrite.test.ts` and `loadStaging.test.ts` loop over the list, so they cover the new key without new assertions. Run them in verification.

2. Create `src/main/humanNickname.ts`. `getHumanNickname` reads the row through `selectGameConfigValue` and `dbGetOne`, then returns `normalizeSideNickname(stored)` when that is non-empty, otherwise `HUMAN_NICKNAME_DEFAULT`. Log at trace with the resulting length, not the text. `setHumanNickname(value: unknown)` normalizes. When the result is `''` or `HUMAN_NICKNAME_DEFAULT`, delete the row with `deleteGameConfigRow`. Otherwise upsert the result. Log at debug with the length. A thrown database error propagates. Do not catch it here.

3. `humanNickname.test.ts` uses `withTempGameDb` from [`src/main/testSupport/withTempGameDb.ts`](../src/main/testSupport/withTempGameDb.ts). Assert: a fresh database reads `Human`; setting `Scout` then reads `Scout`; setting `  you  ` reads `Human` and leaves no custom row; setting a 20-character name reads the first 16; setting `Human` reads `Human`.

4. IPC. Add `getHumanNickname: 'game:getHumanNickname'` and `setHumanNickname: 'game:setHumanNickname'` to both channel objects. The handler for get returns `getHumanNickname()`. The handler for set calls `setHumanNickname` and returns nothing. A non-string is passed through; normalization already rejects it. Preload methods:

   - `getHumanNickname: (): Promise<string> => ipcRenderer.invoke(IPC_GAME.getHumanNickname)`
   - `setHumanNickname: (nickname: string): Promise<void> => ipcRenderer.invoke(IPC_GAME.setHumanNickname, nickname)`

   Use the preload channel constant, not a third copy of the string. Add the same two methods to the `GameApi` interface, with orienting comments. The get comment says a missing row returns `Human`. The set comment says a blank or rejected value restores `Human`.

5. Start payload. Add optional `humanNickname?: string` to `NewGameIpcPayload`, with an orienting comment: the Game Options field's current text. Missing means the stored row. In the `game:newGame` handler, compute one value:

   ```ts
   const humanNickname = payload?.humanNickname === undefined
     ? getHumanNickname()
     : normalizeSideNickname(payload.humanNickname) || HUMAN_NICKNAME_DEFAULT;
   ```

   Pass it on `resetGameForNewMatch`. Also call `setHumanNickname(humanNickname)` when the payload included the property, so the field and the match cannot disagree. Do not call it when the property is absent, or a test that starts a match would write the default row.

6. `ResetGameForNewMatchOptions` gains `humanNickname?: string`. `resolveNewMatchSeats` gains it too. In `assignSeatIdentity`, the human seat's `nickname` is `normalizeSideNickname(humanNickname) || HUMAN_NICKNAME_DEFAULT`. An AI seat's `nickname` stays null in this phase. `seatRecordFromResolved` already copies the resolved fields through the spread. Check that `nickname` is on `ResolvedNewMatchSeat` because that type extends `SeatRecord`. A start with no `seats` array uses `defaultTwoSeatInputs`; that human seat must also get the nickname. Thread the same argument through that path rather than special-casing it.

7. `buildSeatsPayload` does not grow a nickname in this phase. The human name is not a property of a side row. `readNewGameSeatsStart` stays as it is. The Start click in `newGame.ts` adds `humanNickname: readHumanNicknameField()` to the `newGame` payload. That reader is exported from `humanNicknameField.ts` and returns the input's current value, or `HUMAN_NICKNAME_DEFAULT` when the input is missing. Add `humanNicknameLength` to the existing `main game:newGame` debug log. Log the length, not the text.

8. Markup. Inside `#new-game-options-popover`, after the header and before the Victory section, add:

   ```html
   <div class="new-game-human-nickname">
     <label for="new-game-human-nickname">Nickname</label>
     <input id="new-game-human-nickname" type="text" maxlength="16" autocomplete="off" spellcheck="false" />
   </div>
   ```

   Set `maxlength` from the constant in the wiring module (`input.maxLength = SIDE_NICKNAME_MAX_LENGTH`) so the HTML and the constant cannot drift. The HTML `maxlength="16"` may stay as the initial value. CSS: one row, label and field, field `height: 30px`, `min-width: 0`, matching `.commander-popover-key-model > input`. Do not put this row inside `.new-game-victory`. That grid is four columns and would squash it.

9. Create `src/renderer/gameplay/humanNicknameField.ts`. Export `wireHumanNicknameField` and `readHumanNicknameField`. `wireHumanNicknameField` runs once from `registerNewGameButton`, next to `wireNewGameOptionsPopover`. It loads `getHumanNickname()` into the input. On `input` and on `blur`, it writes `setHumanNickname` with the input's value. Ignore a rejected write except `console.error` with the error, and do not clear the field. `readHumanNicknameField` reads the input synchronously and does not call IPC. Map pan already ignores `input` elements (`shouldIgnoreGlobalKeydown` in [`src/renderer/map/mapHelpers.ts`](../src/renderer/map/mapHelpers.ts)). Do not add a keyboard exception.

   Add a control tooltip constant in [`src/renderer/chrome/controlTooltipText.ts`](../src/renderer/chrome/controlTooltipText.ts): "The name shown for you during a match. Saved on this computer, and used the next time a game starts." Set it as `data-control-tooltip` on the input. Also set the `title` attribute to the same sentence so a clipped value is not the only tooltip. The field itself shows the whole 16-character value.

10. Smoke. Add `#new-game-human-nickname` to the `needs` array of the `new-game-options-popover` check in `ui-smoke-new-game-checks.cjs`. Do not add a new check.

11. Docs.

    - [`doc/ux/new-game-dialog.md`](../doc/ux/new-game-dialog.md): the Game Options popover opens with a Nickname field above Victory. Describe the default, the immediate save, and that Start copies it onto the human seat. Name `HUMAN_NICKNAME_CONFIG_KEY` and `getHumanNickname`.
    - [`doc/ux/control-tooltips.md`](../doc/ux/control-tooltips.md): add the sentence and a Source Anchors bullet for the new constant.
    - [`doc/save-files.md`](../doc/save-files.md): the machine-local table gains the row, and the "six" count becomes seven. Say the key is not part of a save, and a load keeps this computer's value.
    - [`doc/naming-conventions-contract-v1.md`](../doc/naming-conventions-contract-v1.md): add `'human_nickname'` to the `game_config` keys row.
    - [`doc/ux/opponent-tab-commander.md`](../doc/ux/opponent-tab-commander.md) does not change in this phase.

12. Tests that start a match through `resetGameForNewMatch` without `humanNickname` get a null human nickname until you pass the option. Phase 3's display rule then shows `Human`, which is the same text. Do not assert on the column in those tests. Add one assertion to [`src/main/gameDb/newMatchSeats.test.ts`](../src/main/gameDb/newMatchSeats.test.ts) or [`src/main/gameDb/resetGameSeats.test.ts`](../src/main/gameDb/resetGameSeats.test.ts): starting with `humanNickname: 'Scout'` stores `Scout` on the human seat and null on the AI seats. Starting with `humanNickname: 'you'` stores `Human`.

### Verification

```powershell
npm run build:main
node dist/main/humanNickname.test.js
node dist/main/gameDb/newMatchSeats.test.js
node dist/main/gameDb/resetGameSeats.test.js
node dist/main/saveGame/saveFileWrite.test.js
node dist/main/saveGame/loadStaging.test.js
npm run typecheck:renderer
npm run lint
npm run build:renderer
```

All of these must pass.

Manual check, in a running app. Open Game Options. The field reads Human. Change it to Scout, close the overlay, and open it again. It still reads Scout. Start a match and look at the human chip on the top bar. It reads Scout. The other chips still read short home names. Quit and relaunch. Game Options still reads Scout.

## Phase 5: The AI nickname on the new-game screen

**Outcome:** Each AI row has a nickname. The commander popover edits it. Changing that row's home, the tab, or the region puts the new short name back. Copy includes it. Start stores it on that AI seat. The human field from phase 4 still works.

### Files

- Modify [`src/shared/ipc/ordersTypes.ts`](../src/shared/ipc/ordersTypes.ts) (`NewGameCommanderInput`, and the comment on `NewGameSeatInput`).
- Modify [`src/shared/newGameSides.ts`](../src/shared/newGameSides.ts) and [`src/shared/newGameSides.test.ts`](../src/shared/newGameSides.test.ts).
- Modify [`src/shared/commanderSetupCopy.ts`](../src/shared/commanderSetupCopy.ts) (`RememberedCommander`).
- Modify [`src/renderer/openRouter/commanderPopover.ts`](../src/renderer/openRouter/commanderPopover.ts) and [`src/renderer/openRouter/commanderPopoverLabels.ts`](../src/renderer/openRouter/commanderPopoverLabels.ts).
- Modify [`src/renderer/gameplay/newGameSidesUi.ts`](../src/renderer/gameplay/newGameSidesUi.ts).
- Modify [`src/main/gameDb/seatResolution.ts`](../src/main/gameDb/seatResolution.ts) so an AI seat stores its input nickname.
- Modify [`src/main/openRouter/commanderKeyMemory.ts`](../src/main/openRouter/commanderKeyMemory.ts) and its test.
- Modify [`src/renderer/chrome/controlTooltipText.ts`](../src/renderer/chrome/controlTooltipText.ts) (`newGameCommanderTooltipText`).
- Docs listed in the steps.

### Steps

1. Add `readonly nickname: string` to `NewGameCommanderInput`. Comment: the name shown for this AI side. Empty means the short home name. It is not sent to the model. Add optional `readonly nickname?: string` to `NewGameSeatInput`. Comment: the AI seat's nickname. Ignored on a human seat. Empty or missing means the short home name, computed after the home is resolved.

2. In `newGameSides.ts`, a small helper `nicknameForHome(homeKey, homes)` returns `defaultAiNickname(label, '')` using the `HomeOption` whose `key` matches, and `''` when the home is missing. Use the option's `label`, never the regional key. Call it from:

   - `initialSidesState`. Each AI row's commander includes that home's nickname. `defaultCommander` from the caller may have its own nickname; overwrite it with the home's.
   - `setRowHome`. Add `homes: readonly HomeOption[]` as a fourth argument. When `homeKey` is unchanged, return the same state, including the nickname. When it changes and the row is AI and has a commander, set `nickname` to the new home's short name. A human row only changes `homeKey`.
   - `randomizeRowHome` already calls `setRowHome`. Pass `homes` through. A redraw of the same home must not reset a nickname the player edited. That is why `setRowHome` compares keys.
   - `addSideRow`. Copy `modelId`, `reasoningEffort`, `doctrineChoice`, and `apiKey` as it does now. Set `nickname` from the new home, not from `copied.nickname`.
   - `setObserveOnly`. When the first row becomes AI, set `nickname` from that row's current home. Add `homes` as an argument. When the first row becomes human, `commander` stays null. Later rows stay as they are, including nicknames.
   - `buildSeatsPayload`. For an AI row, set `nickname: row.commander?.nickname ?? ''` on the seat and keep `nickname` inside `commander` too.

   Update every caller the compiler names. In `newGameSidesUi.ts` that is `refreshNewGameSides`, the Observe handler, the add button, `renderRow`'s home select, and `renderRow`'s randomize button. `refreshNewGameSides` already calls `initialSidesState` and then `randomizeRowHome` for every row, which covers overlay open, tab change, and region change. Do not add a second reset.

3. `newGameSides.test.ts`. Extend the fixtures with `nickname`. Assert: a new AI row's nickname is the short name of its home label; `setRowHome` to a different home replaces it; `setRowHome` to the same home keeps `Grok`; `addSideRow` uses the new home's short name even when the previous commander was `Grok`; `setObserveOnly(true)` gives the first row the short name of the home it already has; `buildSeatsPayload` puts that string on both `seat.nickname` and `commander.nickname`. A human seat payload has no nickname property.

4. Commander popover. [`src/renderer/openRouter/commanderPopover.ts`](../src/renderer/openRouter/commanderPopover.ts) is about 520 lines. This field belongs in `popoverFields`. Crossing the desirable 600 is acceptable here. Stop only if the file would pass 1000. Add `nickname: 'commander-popover-nickname'` to `POPOVER_CONTROL_IDS`. Extend `CommanderPopoverRequest` with `readonly defaultNickname: string`. The field is the first row of `.commander-popover-key-model`, label `Nickname`, before the API key. `type="text"`, `maxLength = SIDE_NICKNAME_MAX_LENGTH`, `autocomplete="off"`, `spellcheck="false"`, `aria-label="Nickname"`. Tooltip constant: "The name shown for this side during a match. It starts as the short home name and resets when this side's home changes."

   `current()` includes `nickname: normalizeSideNickname(nicknameInput.value) || request.defaultNickname`. On blur and Enter, if the normalized value changed, write the default back into the input when the player cleared it, then `onChange`. A model, reasoning, or doctrine change already calls `current()`, so a nickname typed just before that change is included. `applyOpenDraft` and the initial value use `normalizeSideNickname(commander.nickname) || request.defaultNickname`.

   `CommanderDraft` is a mutable copy of `NewGameCommanderInput`, so it gains `nickname` from the type. Set it in `openCommanderPopover` and in `applyOpenDraft`.

5. New-game open. `openRowCommander` passes `defaultNickname: nicknameForHome(...)`. Export that helper, or compute the same label in the UI module. One implementation only; do not copy the short-name call into the renderer a second way. `onChange` already stores the commander through `setRowCommander`.

   `commanderFromLastGame` copies `nickname`. When that nickname normalizes to blank, `copyCommanderFrom` keeps the target row's current nickname. `commanderFromPreviousRow` already spreads the commander, so the nickname comes along. `defaultCommander()` in the UI module includes `nickname: ''`. The row builders overwrite it.

6. Remembered snapshot. Add `readonly nickname: string` to `RememberedCommander`. `emptyRememberedCommander` uses `''`. `rememberedFromUnknown` uses `normalizeSideNickname(record.nickname)`, so an older snapshot without the field becomes `''` and a dirty value is cleaned. `storeNewMatchCommanderKeys` copies `seat.commander?.nickname` through that normalizer. `updateRememberedCommander` keeps the field it is given, normalized. Do not log it.

   In [`src/main/openRouter/commanderKeyMemory.test.ts`](../src/main/openRouter/commanderKeyMemory.test.ts), assert a round trip keeps `Grok`, and an object parsed without `nickname` reads as `''`. The test file header already says its keys are for testing. A nickname fixture is not a secret. Use `Grok`, not a person's name.

7. Main process, AI seats. In `assignSeatIdentity`, an AI seat's `nickname` is `normalizeSideNickname(seat.nickname) || defaultAiNickname(resolvedHome, seatId)`. `resolvedHome` is `homeRegions[sourceIndex]`, the display name, after regional ids have been turned into names. Do not use `sideGroupId` as the short-name source. A human seat keeps phase 4's value and ignores `seat.nickname`.

   Extend the phase 4 match-start test: an AI payload nickname `Grok` is stored; a missing nickname stores null... no. This step stores the short name, not null, so a new match is self-contained. Assert the stored AI nickname equals `defaultAiNickname` of the resolved home when the payload omits it, and equals `Grok` when the payload sends `Grok`. Update the phase 4 assertion that said AI nicknames are null. That was only true before this phase.

8. Docs.

   - [`doc/ux/new-game-dialog.md`](../doc/ux/new-game-dialog.md): the commander popover's first field is Nickname. Describe the default, the reset on home change, tab change, region change, and overlay open, and that copy includes it. The 380 px width is unchanged.
   - [`doc/ux/control-tooltips.md`](../doc/ux/control-tooltips.md): the commander button sentence gains the nickname. Update `newGameCommanderTooltipText` to "Change this side's nickname, API key, model, reasoning, and doctrine." and update the doc sentence to the same words.
   - [`doc/ux/opponent-tab-commander.md`](../doc/ux/opponent-tab-commander.md): the shared popover description gains the Nickname field. Say a match can edit it and a new game resets it when the home changes. Phase 6 makes the match save true; write it here so the doc is not wrong when this phase lands, and phase 6 only adds the mid-match sentence if you did not already.

### Verification

```powershell
npm run build:main
node dist/shared/newGameSides.test.js
node dist/shared/commanderSetupCopy.test.js
node dist/main/openRouter/commanderKeyMemory.test.js
node dist/main/gameDb/newMatchSeats.test.js
npm run typecheck:renderer
npm run lint
npm run build:renderer
```

All of these must pass.

Manual check. Open a new game. Opponent 1's popover Nickname reads the short name of that row's home, such as `W. Turkey`. Change it to `Grok`. Change that row's home. Reopen the popover. It reads the new short name, not `Grok`. Set `Grok` again and start. The top bar shows `Grok` for that side and the human field's name for the human. The home dropdown still shows the full home name.

## Phase 6: Edit an AI nickname during a match

**Outcome:** The Commanders tab popover saves a nickname onto that seat, the top bar and the other surfaces update, and a model call is not cancelled when only the nickname changed.

### Files

- Create `src/main/ipc/seatCommanderIpcHandler.ts`.
- Modify [`src/main/main.ts`](../src/main/main.ts) to register it and to delete the inlined handler.
- Modify [`src/main/gameDb/seatRosterStore.ts`](../src/main/gameDb/seatRosterStore.ts). Add `updateSeatNickname`.
- Modify [`src/renderer/openRouter/commanderCardsUi.ts`](../src/renderer/openRouter/commanderCardsUi.ts) (`openSeatCommander`).
- Modify [`src/main/preload.ts`](../src/main/preload.ts) and [`src/shared/ipc/gameApiTypes.ts`](../src/shared/ipc/gameApiTypes.ts) so the commander argument may include `nickname?: string`.

### Steps

1. Move the `ipcMain.handle(IPC_GAME.setSeatCommander, ...)` callback from `main.ts` into `registerSeatCommanderIpcHandler` in the new file, before changing its behavior. Copy the checks and the writes as they are. `main.ts` calls the register function from `registerIpcHandlers` and drops the inline handler. Run `npm run build:main` here, before the nickname edit, if the move was large. A behavior change does not belong in the move.

2. Add `updateSeatNickname(ops, seatId, nickname: string | null): SeatRecord`. It uses the same guards as `updateSeatCommander`: missing seat, human seat, or knocked-out seat throws `Cannot update a commander for ...`. It runs `UPDATE seats SET nickname = ? WHERE seat_id = ?` and returns the seat with that nickname. Log at debug with `seatId` and `nicknameLength` (`nickname?.length ?? 0`). Do not log the text.

3. In the handler, extend the patch type with `nickname?: unknown`. When the property is absent, do not call `updateSeatNickname`. When it is present and not a string, throw `Invalid commander nickname`. When it is a string, store `normalizeSideNickname(patch.nickname) || null`. Call `updateSeatNickname` after `updateSeatCommander`, and snapshot the seat it returns. Include the normalized nickname, or `''` when null, on the object passed to `updateRememberedCommander`.

   Compare model and effort exactly as the handler does now. A nickname change by itself must not call `cancelModelCalls`.

   The handler log stays one debug line. Add `nicknameChanged: boolean`. Still do not log the text.

4. Preload and `GameApi`: the commander argument gains optional `nickname?: string`. Update both comments so they mention it. An omitted nickname leaves the stored one.

5. `openSeatCommander` sets `nickname: sideDisplayName(seat)` on the commander it passes in, and `defaultNickname: defaultAiNickname(seat.homeRegion, seat.seatId)`. The title is `` `${sideDisplayName(seat)} commander` ``. The `onChange` branches that omit `apiKey` must still send `nickname`. Both branches already spread the commander fields they list; add `nickname` to each object they build.

6. There is no renderer test runner. Add a main-process test only if `updateSeatNickname` is reachable without IPC. It is, through `seatRosterStore.test.ts`. Assert: a nickname `Grok` is stored and read back; `''` or `'you'` stores null; a human seat throws; a knocked-out AI seat throws; `updateSeatCommander` still does not change `nickname`.

7. In [`doc/ux/opponent-tab-commander.md`](../doc/ux/opponent-tab-commander.md), the mid-match paragraph says a nickname edit is saved with `setSeatCommander` and does not cancel planning. The card name and the popover title follow `sideDisplayName`.

### Verification

```powershell
npm run build:main
node dist/main/gameDb/seatRosterStore.test.js
npm run typecheck:renderer
npm run lint
npm run build:renderer
```

All of these must pass.

Manual check. Start a match, open the Commanders tab, and set one side to `Grok`. The card, the top bar, View as, and a hex that side controls all show `Grok` without a reload. The planning chip does not restart if that side was ready. Clear the field and leave it. The short home name comes back. Knock that side out, if you can do it quickly, and confirm its summary button stays disabled.

## Phase 7: Clipping and a full pass

**Outcome:** A 16-character nickname cannot overflow its box. The whole suite passes. The docs agree with the code.

### Files

- [`static/frameChrome.css`](../static/frameChrome.css), [`static/consoleChrome.css`](../static/consoleChrome.css), and [`static/newGameChrome.css`](../static/newGameChrome.css), only where a step below names a missing property.
- The painters from phase 3, only to add a `title` attribute.

### Steps

1. For each element that shows a nickname as its own text, set `title` to that nickname: the top-bar side name (`.topbar-side-name`, which already has ellipsis and `max-width: 220px`), the battle force-bar names, the commander card name, the message-tab label, and the melee-intercept column header. Where the CSS for that element has no `min-width: 0`, `overflow: hidden`, and `text-overflow: ellipsis`, add those three. Do not add a max-width that changes the layout at short names. 16 characters fit the current chips. The ellipsis is for a narrow window.

2. Do not ellipsize the hex tooltip, the update popup, standings, or knockout text. Those are the full sentence. The 16-character cap is their limit.

3. `<option>` text needs no CSS. View as, the log filter, and the Reports sender filter are covered by the cap.

4. Docs sweep. Search `doc/` for `abbreviatedSideName`, `full home name`, and `short name`. Update a hit that describes a name the player sees during a match. Leave a hit that describes `shortSideName` as the default, a home list, or a prompt. Leave release notes and `doc/devleopment-plan-v3.4.md` alone.

5. Code sweep.

   ```powershell
   rg -n "sideDisplayName|from './sideNicknames'|from '../shared/sideNicknames'" src/main/openRouter
   rg -n "abbreviatedSideName" src
   rg -n "seat\.homeRegion" src/renderer src/shared
   ```

   The first two print nothing. The third may print builders that copy `homeRegion` onto a seat object. It must not print a painter that assigns `homeRegion` to `textContent`. For each remaining hit, confirm it is home identity (payloads, lookups, prompts) and not a label. Fix labels. Do not "clean up" home identity.

### Verification

```powershell
npm test
```

`npm test` rebuilds, lints, typechecks the renderer, runs the main and shared tests, and checks third-party notices. It must pass.

Then:

```powershell
npm run ui:smoke
```

The new-game options check must find `#new-game-human-nickname`. If smoke cannot run because this machine has no display, say that in the phase report and do not claim it passed.

Manual check. Set the human nickname to `WWWWWWWWWWWWWWWW` and one AI nickname to the same. Look at the top bar, a hex tooltip, the update popup after a turn, the Commanders card, and Game Options. Each shows the full 16 `W`s or clips with an ellipsis and a tooltip of the full name. No box overlaps its neighbor. The new-game home list still shows full home names.

## Done

The work is done when phase 7's `npm test` passes, the smoke result is reported honestly, and the manual check shows a custom human name, a custom AI name, a reset AI name after a home change, and no nickname in a prompt. Report the docs you updated. Do not commit.
