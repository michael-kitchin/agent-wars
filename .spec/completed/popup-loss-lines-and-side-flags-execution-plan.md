# Popup loss lines and side flags

Audience: a lower-quality coding agent. Implement one phase at a time. Stop after each phase and report files touched, test results, and any doc updated. Wait for the human before the next phase. If a phase fails, revert that phase. If a line in this plan disagrees with the code, trust the code, stop, and report the discrepancy.

## Goal

Change the updates popup (the lower-right map toast) and the message popup (the opponent tabs):

1. Hex sentences such as "You took 1 hex from E. Europe." move into the Updates section. Nothing remains in an unlabeled block above the sections.
2. Loss lines name the unit only. Drop the short side prefix (`E. Europe · V Armored` becomes `V Armored`). Stack callouts, the selection panel, and hover names keep that prefix. Origin flags stay, including when two sides lost a unit with the same name.
3. On one cause line, a type with more than 3 losses collapses to `4x Infantry`. Three or fewer stay as names. Named units come first, then collapsed groups. A collapsed group has one miniature type icon in the losing side's color, with a white glyph.
4. Dice-chip mini tokens already fill with the owner's map color and draw the white unit glyph. Lock that contract in a shared helper and use it for the new loss icon.
5. An opponent's name is prefixed by a flag filled with that side's map color and the opponent number 1–4 in white. "Your Losses" and "Neutral Losses" get no flag. The flag appears on message tabs, loss headers, side names inside the two hex sentences, and Reports message rows (replacing the color dot).
6. Clicking an enabled message tab restarts the 24 second timer.

## Locked decisions

- Updates order, top to bottom: loss sections (unchanged: `Your Losses`, then other seats by `seatOrder`, then `Neutral Losses`), then one `Updates` section. Inside Updates, in this order: hex sentences in their current order, the deployment line, the deployment-cap line, `N hexes lost to opponent`, a combat-activity fallback only when the hex, deployment, cap, and hex-lost lines are all absent and there are no loss sections, then the unknown-battle sentence last. A toast that is only hex sentences is an Updates section, not a bare list. A toast that is only loss sections has no Updates section and no fallback.
- `buildConsolidatedTurnUpdateToastMessage` keeps returning `string | null`. Do not add a second return channel. The activity log stays that plain string. Flags and type icons exist only in the DOM. Reports turn entries clone that DOM, so they inherit them.
- The builder already calls `buildTurnReportLines` with `otherLines: []`. Keep that. Do not start printing `turnReport.otherLines`.
- Loss names are the base display name from `buildUnitDisplayNameLookup` / `fallbackDisplayNameFromUnitId`, or `RemovedUnitSnapshot.displayName` when that field is set. Tactical snapshots already store the base name, such as `IV Fleet (12)`. The short prefix is added only by `formatUnitNameForViewer` in the renderer's loss fallback. Do not change `formatUnitNameForViewer`. Do not strip a prefix by splitting on `·`. Neutral's `Neutral ·` prefix is also absent on loss lines, because that prefix comes from the same function. Stack callouts, the selection panel, and hover names still call `formatUnitNameForViewer`.
- Origin flags are matched per owning side and display name, not by display name across the whole toast. Two sides that both lost `I Infantry` each keep their own flag. Two victims of one side with the same display name and different origins still get no flag for that name, which is the rule already in `buildUnitOriginByLossDisplayName`.
- Popup grouping is per type, not per line. New constant `LOSS_TYPE_NAME_LIST_MAX = 3` in `src/shared/lossSummary.ts`. A type with a count of 3 or fewer lists those units in their original relative order. A type with a count of 4 or more becomes one group. All named units come first, in their original relative order across types. Groups follow: Naval, Air, Armored, Infantry. Omit a type with count 0. A `unitType` outside those four stays a name and is never dropped. Text form is `${count}x ${label}` with a lowercase `x`, no thousands separator, and one space after `x`: `4x Infantry`, `4x Armored`, `4x Air`, `4x Naval`. Labels stay `Naval`, `Air`, `Armored`, `Infantry`. Use `String(count)`, not `toLocaleString()`, so the token cannot contain a comma.
- `LOSS_ENTRY_LIST_MAX` (5) and `formatPlayerLossInline` stay the prompt contract. Six infantry in a prompt line stays `6 Infantry`, not `6x Infantry`. Do not pass popup names or `4x` text to the model. Do not edit `doc/ai-commander-prompts/`.
- Do not add `LOSS_TYPE_NAME_LIST_MAX` to the engine-constants table in `doc/README.md` or to `doc/combat-rules-v3.md`. It is popup copy, not a combat number.
- The opponent number is `aiIndexForSeatId` in `src/shared/seatIds.ts`: `opponent` is 1, `opponent2` is 2, `opponent3` is 3, `opponent4` is 4. It is not seat order and not the tab's alphabetical position. A null index (human, Neutral, unknown) gets no flag. The digit is `#ffffff` even on the blue seat. Do not switch it to `palette.text`.
- Flag fill is `OwnerPalette.map`. Size matches `.country-flag` (1.125em by 0.75em). Place it immediately before the displayed name. Do not insert flags into Message or Strategy prose, deployment lines, cap lines, `N hexes lost to opponent`, or the unknown-battle sentence. A hex taken from Neutral (`You took 1 hex from Neutral.`) gets no flag.
- "Your Losses" and "Neutral Losses" have no flag. An AI header `{full home name} Losses`, or `{seat id} Losses` when the home name is blank, has a flag before that name. Hex sentences flag only the opponent name already produced by `ownerName`: the name in `You took N hex(es) from {name}.` and the name in `{name} took N of your hexes.` `N` is the digits `buildTurnReportLines` writes today, not a locale-grouped number.
- Reports message rows replace `.console-report-dot` with the same numbered flag when the sender has an AI index. Otherwise keep the dot. The sender line stays one flex row.
- A collapsed group shows one icon, not one per unit, and only while the painter is inside a loss section. The icon is a 12px circle (dice `tokenRadius` 6). Fill is the losing side's `map` color, including the human side and Neutral. The glyph is the white SVG from `unitIconPathForUnitType`. The 1px ring is `palette.text`. Mirror the glyph when the owner is not `HUMAN_SEAT_ID`, including Neutral, as `drawUnitTypeGlyph` does. Do not mirror based on the viewer. Do not recolor the glyph to `palette.text`. A named unit keeps its country flag and does not also get a type icon. Outside a loss section, a token that looks like a group stays plain text.
- A known victim display name wins over the group pattern. Only a whole victim token that matches `^(\d+)x (Naval|Air|Armored|Infantry)$` and is not a known display name for that section's owner gets a type icon. The old popup text `3 Infantry` is not a group.
- The section owner comes from the header text plus the roster. `Your Losses` is the viewer seat. `Neutral Losses` is `neutral`. `{name} Losses` is the seat whose trimmed `homeRegion` equals `name`, or whose `seatId` equals `name` when the home is blank. Two seats with the same name: lower `seatOrder`. `Updates` and every other header clear the current owner.
- Clicking an enabled message tab, including the tab already selected, restarts `TOAST_DURATION_MS` (24 seconds). It does not file another Reports entry, does not clear other tabs, and does not change which tab a later message selects. Disabled tabs stay disabled.
- Do not edit pictures under `doc/media/`. Do not edit `static/renderer.js` by hand. `npm run build:renderer` rewrites it.
- Do not commit or push. Do not put phase numbers, this file's name, or words from these headings into code, comments, tests, lint text, or `doc/`.

## Working rules

- Shell is Windows PowerShell at `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`.
- Keep each file's existing line endings. New files use CRLF.
- Orienting comments on every new or changed field and function: Purpose, When to use, Expected outcome, Exceptions. Match the file you are editing.
- Shared modules do not import the logger. Renderer catch blocks use `console.error`. These phases add no main-process functions, so they add no `logDebug` calls.
- Tests cover the happy path and the essential failure named in the phase. No DOM tests, source-scan tests, or constructor tests. `npm test` builds, lints, checks names, and runs `dist/**/*.test.js`. A new `*.test.ts` under `src/shared` or `src/main` is picked up automatically. Do not edit `package.json` to register it.
- When a phase edits `src/renderer` or `static/`, also run `npm run build:renderer`. Leave `static/renderer.js` changed.
- Desirable file size is 600 lines. Hard limit is 1000. `src/renderer/openRouter/openRouterUiHelpers.ts` is about 566 lines. Phase 2 moves the toast-body functions out before later phases add painting. Do not add the flag or type-icon constructors to the helper.
- Named arguments stay at or below 6. Use `readonly` and `const` for values that are not reassigned.
- camelCase files and functions. PascalCase types. No `Utils` or `Impl`. Do not rename IPC channels, DOM ids, or SQL columns.
- Update the living docs named in the phase. A later phase must keep the behavior an earlier phase wrote into the same sentence. Leave `doc/devleopment-plan-v3.4.md`, `doc/poc-analysis.md`, `doc/market-research.md`, `doc/ai-commander-prompts/`, and `.spec/completed/` alone.

## Phase 1: Hex sentences move under Updates

**Goal.** The toast string has no lines before the first `##` header. Hex sentences are the first bullets of Updates.

**Read first.** `buildConsolidatedTurnUpdateToastMessage` in `src/shared/consolidatedTurnUpdateToast.ts`, `buildTurnReportLines` in `src/shared/turnReportLines.ts`, and `src/main/turnUpdateSummary.test.ts`.

**Behavior.** Keep `buildTurnReportLines({ ...turnReport, otherLines: [] })`. Stop pushing `reportLines` ahead of `buildTurnLossSections`. Build the Updates body in one array:

1. Start with `reportLines`.
2. Append `buildOtherTurnUpdatePrimaryLines`.
3. If that array is still empty and `lossSections` is empty, replace it with the stripped combat fallback.
4. Append the trimmed unknown-battle line when it is non-empty.
5. If the array is non-empty, append the `## Updates` header and those lines after the loss sections.

A hex sentence therefore suppresses the fallback. Loss sections also suppress it. The unknown-battle line still follows a fallback when both exist and nothing else does. Return type stays `string | null`.

**Tests.** Update `testSectionOrderAndEmptySuppression` in `src/main/turnUpdateSummary.test.ts`.

- Hex sentence plus a deployment: `## Updates` comes before `You took 1 hex from E. Turkey.`, and that sentence comes before `2 infantry units deployed`.
- Same toast plus a loss: `byOwner[HUMAN_SEAT_ID].ranged` is one infantry named `1st Infantry`, and `viewerSeatId` is `HUMAN_SEAT_ID`. The text starts with `## Your Losses`, then `Ranged attack: 1st Infantry`, then `## Updates`, then the hex sentence. Copy the summary shape from `src/shared/turnLossSections.test.ts`.
- Hex sentence, no deployment, no losses, and a fallback bullet `Casualty outcomes at 2 hexes.`: the text is the Updates header plus the hex sentence, and it does not contain `Casualty`.
- Losses only, with that same fallback and no hex sentence: the text has `## Your Losses` and does not contain `## Updates` or `Casualty`.
- Empty input is still null. The existing unknown-battle-only string and the fallback-plus-unknown-battle string stay as they are.

**Doc.** In `doc/ux/notifications-and-feedback.md`, `doc/ux/reports-tab.md`, and the "Reading the turn report" bullet in `doc/how-to-play.md`, say loss sections come first and hex sentences are the first lines of Updates. Keep the unknown-battle sentence as the last Updates line.

**Verify:** `npm test`. No renderer build.

## Phase 2: Base loss names, and origin flags per side

**Goal.** A victim on a loss line is `V Armored`, not `E. Europe · V Armored`. Two sides with the same unit name each keep an origin flag. Other surfaces still use `formatUnitNameForViewer`.

**Read first.** `formatUnitNameForViewer` in `src/shared/sideLabels.ts`. `buildKillToastFormatterBundle` in `src/renderer/gameplay/sidebarSupport.ts` (the `baseName` lookup just before `formatUnitNameForViewer`). `buildPopupTurnLossSummary` in `src/renderer/gameplay/readyResolutionAnnouncements.ts`. `buildUnitOriginByLossDisplayName` in `src/renderer/core/unitOriginFlags.ts`. `appendMapToastBulletLine` and `appendMapToastMessageBody` in `src/renderer/openRouter/openRouterUiHelpers.ts`. `lossSectionTitle` in `src/shared/turnLossSections.ts`.

**Move the toast body first.** Move `MAP_TOAST_SECTION_BULLET_INDENT`, `appendMapToastBulletLine`, `appendMapToastSectionHeader`, and `appendMapToastMessageBody` into a new file `src/renderer/openRouter/mapToastBody.ts`. Re-export the constant and the two exported functions from `openRouterUiHelpers.ts` so `commanderMessageTabsUi.ts` can keep its import. No behavior change in this move. `showMapToast` still calls `appendMapToastMessageBody`.

**Base names.** Add `formatBaseUnitName` on the kill-toast bundle. It returns the `baseName` that function already computes and does not call `formatUnitNameForViewer`. `formatUnitName` stays prefixed for its current callers. `buildPopupTurnLossSummary` takes `formatBaseUnitName` and uses it only when `snap.displayName` is missing. When `snap.displayName` is set, keep it. It is already the tactical base name.

**Section owner.** Add `lossSectionOwnerId(headerTitle, viewerSeatId, seats)` in `src/shared/turnLossSections.ts`. `headerTitle` has no `## ` and no trailing colon. Return the viewer seat for `Your Losses` (null when the viewer is null). Return `NEUTRAL_OWNER_ID` for `Neutral Losses`. Return the matching seat id for `{name} Losses` using the locked name rule. Return null for `Updates` and every other title. While `appendMapToastMessageBody` walks lines, set the current owner from this function on a `## ` line, and pass that owner into the bullet painter. A null owner means no loss flag.

**Flags per side.** Add `indexLossFlagsByOwner` in a new file `src/shared/lossFlagIndex.ts`. Arguments: rows of `{ ownerId, name, value }` where `value` may be null, and `same(a, b)`. Skip null values. Within one `ownerId`, one `name` keeps its value when every non-null value for that pair is `same`. If two values for that pair are not `same`, omit that name for that owner only. A different owner is a different map. `buildUnitOriginByLossDisplayName` walks `summary.byOwner`, resolves the origin by `unitId` as it does now, and calls this function. Its return type becomes `ReadonlyMap<string, ReadonlyMap<string, LossFlagIdentity>>` (owner id, then display name). Update the one caller in `announceResolutionTurnUpdate` and the `unitOriginByDisplayName` option so the bullet painter looks up `flags.get(ownerId)?.get(displayName)`. Do not look up by display name alone.

**Tests.**

- `src/shared/sideLabels.test.ts` stays as it is. Third-side names outside loss lines still have the short prefix. The viewer's own units do not.
- In `src/shared/turnLossSections.test.ts`, assert `lossSectionOwnerId`: `Your Losses` with viewer `human` returns `human`; `Your Losses` with a null viewer returns null; `Neutral Losses` returns `neutral`; `Eastern Turkey Losses` returns that seat; `Updates` returns null; two seats named `Eastern Turkey` return the lower `seatOrder`.
- New `src/shared/lossFlagIndex.test.ts`. One owner and one name keeps the value. The same owner and name with two values that fail `same` omits that name. A second owner with that same name keeps its own value. A null value is skipped.

**Doc.** In the loss-line sentence of `doc/ux/notifications-and-feedback.md`, say a named victim is the unit name with its origin flag, without the short side prefix, and that the same display name on two sides still gets each side's flag. The section header still names the side. Keep the hex-sentence order from phase 1.

**Verify:** `npm test` and `npm run build:renderer`.

## Phase 3: Collapse each type past three

**Goal.** Popup cause lines use the per-type rule. Prompt lines do not.

**Read first.** `formatLossEntries`, `formatLossEntriesForPrompt`, and `formatGroupedTypeTotals` in `src/shared/lossSummary.ts`. `src/main/lossSummary.test.ts`.

**Behavior.** Add `LOSS_TYPE_NAME_LIST_MAX = 3`. Change `formatLossEntries` only. Count each known `LostUnitType`. Emit named units whose type is unknown or whose type count is 3 or fewer, preserving their order in the input. Then emit groups for known types with counts greater than 3, in `naval`, `air`, `armor`, `infantry` order. Join parts with `, `. `formatLossEntriesForPrompt` and `formatGroupedTypeTotals` keep today's prompt text (`6 Infantry`, `1 Armored, 1 Infantry`). Update the comment on `formatLossEntries` so it no longer says the prompt uses it.

Examples the tests must lock:

- Three infantry: `Unit1, Unit2, Unit3`.
- Four infantry: `4x Infantry`.
- Input order armor `A`, naval `B`, armor `C`, armor `D`, armor `E`, naval `F`: `B, F, 4x Armored`.
- Four naval and four armor: `4x Naval, 4x Armored`.
- Three infantry and three armor, interleaved: all six display names in input order, no `x`.
- Four units whose `unitType` is not one of the four: their display names in input order, not an empty string.
- `formatPlayerLossInline` of six infantry with no ids stays `Ranged attack: 6 Infantry`. The id form `Ranged attack: human-inf-1; Melee attack: human-armor-1` stays.

**Doc.** In `doc/ux/notifications-and-feedback.md` and `doc/how-to-play.md`, replace the "more than five, then every type is grouped" wording with this per-type rule and the `4x Infantry` spelling. Say the commander's prompt is unchanged. Keep the phase 1 order and the phase 2 name rule.

**Verify:** `npm test`. No renderer build. Icons are not part of this phase. The toast shows the new text with no type icon.

## Phase 4: One color contract for mini tokens

**Goal.** Dice chips and the later loss icon share one statement of fill, glyph, and ring.

**Read first.** `paintMiniToken` in `src/renderer/rendering/combatDiceChipDrawing.ts`. `paletteForOwner`, `SEAT_PALETTES`, and `NEUTRAL_PALETTE` in `src/shared/seatPalette.ts`. The dice-chip row in `doc/ui-style-guide.md`. The "who rolled" bullet in `doc/ux/resolution-playback.md`.

**Behavior.** Add `miniTokenColors(palette: OwnerPalette): { fill: string; glyph: string; ring: string }` next to `paletteForOwner`. `fill` is `palette.map`. `glyph` is `#ffffff`. `ring` is `palette.text`. `paintMiniToken` uses `fill` and `ring`. Leave the glyph draw as `drawUnitTypeGlyph`. Those SVG paths are already `#ffffff`. Do not tint that image to `palette.text`. The letter fallback stays `#f4f6f8` (`CHIP_COLORS.text`). A missing palette keeps today's `#333` fill and does not call `miniTokenColors`.

**Tests.** In `src/shared/seatPalette.test.ts`, assert seat order 1 and Neutral: fill equals that palette's `map`, glyph is `#ffffff`, ring equals `text`.

**Doc.** In the style-guide dice row and the resolution-playback "who rolled" bullet, say the token fill is the owner's map color, the glyph is white, and the ring is the owner's text color.

**Verify:** `npm test` and `npm run build:renderer`. Do not play a battle for this phase. The test locks the colors.

## Phase 5: Type icon on a collapsed loss group

**Goal.** A `4x Infantry` token inside a loss section is preceded by one circle in the losing side's color. Named units still get origin flags only.

**Read first.** `splitLossCauseLineForUnitFlags` in `src/shared/lossToastUnitSegments.ts` and its test. The bullet painter now in `src/renderer/openRouter/mapToastBody.ts`. `unitIconPathForUnitType` in `src/renderer/rendering/unitDrawing.ts`. `lossSectionOwnerId` from phase 2. `miniTokenColors` from phase 4. `.country-flag` in `static/overlayChrome.css`.

**Behavior.** Do not search the whole toast for group text. Extend the splitter. Each victim token stays its own segment. A segment whose text is in `knownDisplayNames` stays a unit segment, even when the text is `4x Infantry`. A segment that matches `^(\d+)x (Naval|Air|Armored|Infantry)$` and is not a known name gets an optional `group` field `{ unitType, count }` and `unitDisplayName: null`. Omit `group` on every other segment so the existing deep-equal tests still pass. `3 Infantry` and `2 Armored` stay unmarked. A line that is not a cause line stays one plain segment.

Add `createLossTypeToken(unitType, ownerId, seats)` in a new file `src/renderer/chrome/toastInlineMarks.ts`. It returns a 12px circle, class `loss-type-token`. Fill and ring come from `miniTokenColors(paletteForOwner(...))`. The image source is `unitIconPathForUnitType`, with `alt=""` and `aria-hidden="true"`. `scaleX(-1)` on the image when `ownerId !== HUMAN_SEAT_ID`. A null palette uses fill `#333` and ring `#f4f6f8`, and does not mirror. The bullet painter, only when the current loss owner is non-null, inserts that element before the group token's text. No country flag on that segment. When the current owner is null, paint the group token as text only.

`announceResolutionTurnUpdate` already has the viewer and the roster. Pass them on the toast options if phase 2 did not already pass them for `lossSectionOwnerId`. Do not change the toast string.

Add `.loss-type-token` beside `.country-flag` in `static/overlayChrome.css`. Circle, 12px, inline-block, the same vertical alignment and right margin as `.country-flag`. The image fills the circle.

**Tests.** In `src/shared/lossToastUnitSegments.test.ts`:

- `• Ranged attack: 1st Armor, 4x Infantry` with `1st Armor` known: plain prefix, unit segment `1st Armor`, group segment `4x Infantry` with type `infantry` and count 4. Joined text equals the line.
- The same line with `4x Infantry` also in the known set: that token is a unit segment and has no `group`.
- The existing `3 Infantry, 2 Armored` test still has no unit names and no `group`.
- `• 1st Infantry captured a hex` stays one plain segment.

**Doc.** In `doc/ux/notifications-and-feedback.md`, say a collapsed group has one type icon in the losing side's map color and a white glyph, and no origin flag. Named victims keep the phase 2 flag rule. Keep the order, the `4x` spelling, and the prompt sentence.

**Verify:** `npm test` and `npm run build:renderer`.

## Phase 6: Opponent number flags

**Goal.** Opponent names in the two popups, in the two hex sentences, and on Reports message rows show the numbered flag. "Your Losses" and "Neutral Losses" do not.

**Read first.** `hexLines` and `ownerName` in `src/shared/turnReportLines.ts`. `lossSectionTitle` in `src/shared/turnLossSections.ts`. `renderCommanderMessageTabs` in `src/renderer/openRouter/commanderMessageTabsUi.ts`. `messageReportBody` in `src/renderer/chrome/consoleReports.ts`. The header and bullet painters in `src/renderer/openRouter/mapToastBody.ts`. `aiIndexForSeatId` in `src/shared/seatIds.ts`. `.console-report-dot` in `static/consoleChrome.css`.

**Marks.** Add `sideNameMarksForLine(line, seats)` in `src/shared/turnReportLines.ts`. Seats have `seatId`, `seatOrder`, and `homeRegion`. Return `{ seatId, start, end }[]` with at most one mark. `start` and `end` are indexes into `line` as passed, and `end` is exclusive. If `line` starts with `• `, ignore that prefix while matching and add its length to the indexes. If `line` starts with `## `, ignore that prefix the same way. Return none unless `aiIndexForSeatId(seatId)` is a number.

Match only these bodies, after stripping one bullet prefix and one `## ` prefix:

- `You took 1 hex from E. Turkey.` and `You took 2 hexes from E. Turkey.`. The counted word is `hex` or `hexes`. The name is the exact remainder before the final period. It must equal `shortSideName(homeRegion)` of an AI seat, or that seat's `seatId` when the trimmed home is empty.
- `E. Turkey took 1 of your hexes.` and the plural `hexes`. The name is the exact text before ` took `.
- `{name} Losses`, where `name` equals an AI seat's trimmed `homeRegion`, or its `seatId` when the home is blank. Do not mark a body that is exactly `Your Losses` or `Neutral Losses`.

Any other body returns no mark, including `You took 1 hex from Neutral.`, `Unknown battle observed in Europe.`, `2 infantry units deployed`, and `Message`. Two AI seats with the same displayed name: lower `seatOrder`.

**Painting.** Give `appendMapToastSectionHeader` an optional leading element. When it is passed, the header is that element plus the title text. When it is omitted, the header stays one text node. Message and Strategy do not pass it, and the helper does not call `sideNameMarksForLine`.

The updates walker strips a leading `## ` and calls `sideNameMarksForLine` on that title, so `start` and `end` refer to the visible title. It builds the flag, splits the title around the mark, and passes the flag as the leading element. For a bullet, it calls `sideNameMarksForLine` on the raw message line, which has no bullet yet, then adds the length of the `• ` it prepends to `start` and `end`. The function also accepts a line that already starts with `• ` or `## `, ignores that prefix while matching, and adds its length to the indexes. Tests cover that. The walker does not rely on it for headers, because it strips `## ` first and would otherwise count the prefix twice.

Build the flag with `createSideNumberFlag(seatId, seats)` in `src/renderer/chrome/toastInlineMarks.ts`: a span, class `side-number-flag`, background `palette.map`, text the opponent number, color `#ffffff`, `aria-hidden="true"`. A null palette or a null AI index returns null, and the painter skips it. Add `.side-number-flag` beside `.country-flag` with the same box, a centered digit, and the same drop shadow.

Tab buttons in `renderCommanderMessageTabs` prepend the flag to every AI tab, including disabled tabs, then the existing label text. The label string is unchanged.

`messageReportBody` uses the flag instead of the dot when `createSideNumberFlag` returns an element. Otherwise keep the dot. Leave the sender row as `display: flex`.

**Tests.** In `src/shared/turnReportLines.test.ts`, with opponent seat id `opponent`, seat order 2, and home `Eastern Turkey`:

- `You took 1 hex from E. Turkey.` marks `opponent` over `E. Turkey` only. Assert `start` and `end` against that string.
- `• You took 1 hex from E. Turkey.` marks the same name, with `start` two greater than the unbulleted line.
- `E. Turkey took 2 of your hexes.` marks the leading name.
- `## Eastern Turkey Losses` marks `Eastern Turkey`. `start` is 3, so the mark excludes the `## ` prefix and excludes ` Losses`.
- `Your Losses`, `Neutral Losses`, `You took 1 hex from Neutral.`, and `Unknown battle observed in Europe.` return no mark.
- A seat id `opponent2` with a blank home on `opponent2 Losses` marks that id.
- Two AI seats whose short name is `E. Turkey`: the lower `seatOrder` is the mark.

Assert `seatId` and indexes, not the digit. The digit is `aiIndexForSeatId` at paint time.

**Doc.** Update `doc/ux/notifications-and-feedback.md`, `doc/ux/reports-tab.md`, `doc/how-to-play.md`, and `doc/ui-style-guide.md`. Say the flag is the opponent index 1–4 on the side's map color, the digit is white, and the human and Neutral headers have none. Hex sentences flag the opponent short name. The Reports message row uses that flag where the color dot was. Keep the Updates order, the base unit names, the `4x` rule, and the type icon.

**Verify:** `npm test` and `npm run build:renderer`.

## Phase 7: A tab click restarts the 24 second timer

**Goal.** An enabled tab click gives another 24 seconds. A new message still restarts the timer as it does today.

**Read first.** The click handler in `src/renderer/openRouter/commanderMessageTabsUi.ts`. `showFilledAiStrategyToast` and `S.aiStrategyToastHideTimer` in `src/renderer/openRouter/openRouterUiHelpers.ts`. `TOAST_DURATION_MS` in `src/renderer/core/constants.ts`.

**Behavior.** Extract the `setTimeout` that hides the strategy toast into one function used by both `showFilledAiStrategyToast` and a new `restartAiStrategyToastTimer()`. The restart function returns immediately when `#ai-strategy-toast` is missing or has the `hidden` class. Otherwise it clears `S.aiStrategyToastHideTimer` and schedules the same hide callback and `TOAST_DURATION_MS`. It does not call `recordConsoleReport` and it does not rebuild the tabs. The tab click updates `selectedSeatId`, calls `restartAiStrategyToastTimer`, then `renderCommanderMessageTabs`. Do this for a click on the already selected tab too. Do not call `showFilledAiStrategyToast` from the click. Update the comment on `renderCommanderMessageTabs` that says a click does not restart the timer.

**Doc.** In `doc/ux/notifications-and-feedback.md` and the AI strategy toast row of `doc/how-to-play.md`, replace the sentence that a tab click does not restart the timer. A click on an enabled tab restarts the 24 second timer. A new message still restarts it and selects that tab. Keep the flag sentence from phase 6.

**Verify:** `npm run build:renderer`, then `npm test`. There is no renderer unit-test harness. Read the click handler and confirm it calls the restart and does not call `recordConsoleReport` or `showFilledAiStrategyToast`.

## Done

After phase 7, the unlabeled block is gone, loss names have no side prefix, the same unit name on two sides still has two origin flags, groups over three use `4x` plus one side-colored icon, opponent names in the listed places have the numbered flag, dice tokens use the shared white-on-map-color contract, and a message-tab click restarts the timer. Prompt loss text is unchanged.
