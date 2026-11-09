# Ranged target tooltip

Audience: a lower-quality coding agent. Implement one phase at a time. Stop after each phase and report files touched, test results, and any doc updated. Wait for the human before the next phase. If a phase fails, revert that phase. If a line in this plan disagrees with the code, trust the code, stop, and report the discrepancy.

## Goal

While the player is aiming a legal ranged attack, on the strategic map or in a battle, the existing effects tooltip (`#order-slower-tooltip`) also shows who is on the target and the same two chances the commander briefing calls Odds:

1. One line per opponent seat that has counted units on that target, in `seatOrder`. Each line is the opponent number flag, `sideDisplayName`, then the units. A type with three or fewer units is named, each name preceded by that unit's origin flag. A type with four or more collapses to one token such as `4x Naval`, preceded by that side's type icon and no origin flag. This is the turn-update popup's labeling (`formatLossEntries`, `LOSS_TYPE_NAME_LIST_MAX` in `src/shared/lossSummary.ts`).
2. After those opponent lines, the existing Effects and Cover lines when they apply, then `Kill: N%` and `Loss: N%` as their own lines. The nickname and its colon are bold. `Kill:` and `Loss:` are bold, in the same form as a hex-tooltip label. Unit names stay plain. Each line is separated by `TOOLTIP_SECTION_GAP_HTML`. A section with nothing to show is left out, so an empty target has no opponent lines. Kill is the wipe chance (`probabilityDefenderEliminated`). Loss is the chance the attacker loses at least one unit (`probabilityAttackerLosesUnit`). Round with `Math.round(p * 100)`, the same rounding as `formatBestOptionsOdds` in `src/main/briefing/map/bestOptionsOdds.ts`.

Air strikes and missile launches do not gain a roster or these lines. March and ferry tooltips stay as they are.

## Locked decisions

- The popup is still `#order-slower-tooltip`. Do not add a second tooltip element or a second timer. It still waits `HEX_DETAILS_TOOLTIP_DELAY_MS` (one second) and still restarts that wait after the pointer travels more than `HEX_DETAILS_TOOLTIP_REST_PX`. `scheduleOrderEffectsTooltip` in `src/renderer/map/orderSlowerHexTooltip.ts` stays the only show path.
- A legal ranged hover shows this tooltip when it has opponent lines, terrain or cover lines, or Kill and Loss. That includes a target where terrain, weather, and cover change nothing, as long as an opponent line or Kill and Loss remains. An empty target with nothing to show stays hidden. An illegal hover still shows the blocked tooltip and does not show the roster or the odds. Shift inspection, playback, and leaving the map keep the hide rules already in `doc/ux/hex-tooltips.md`.
- Order inside the tooltip, top to bottom: the opponent lines, then the existing Effects line and Cover line when `resolveOrderPreviewEffectsTooltipHtml` returns them, then Kill and Loss. Bold the nickname and its colon, and bold `Kill:` and `Loss:`. Separate every line with `TOOLTIP_SECTION_GAP_HTML`, the same gap the hex tooltip uses. Leave out a section that has nothing to show. Do not change the wording of Effects or Cover. Do not put the roster inside `resolveOrderPreviewEffectsTooltipHtml`.
- The target is the cell `refreshHoverRoutePreview` already passes to ranged validation: `S.hoveredHexH3`. During a battle that value is the battle cell (`clientXYToHit` uses `hitTestTacticalHexAtContainerPixel`). It is not `S.hoveredDetailHexH3` and not the parent strategic hex.
- One estimate covers the whole target. Every accepted attacker fires at every counted defender on that cell. Do not estimate once per seat, and do not average seat results. The roster is only how those defenders are labeled.
- A roster line exists only for an opponent seat: `aiIndexForSeatId(seatId)` is non-null. `HUMAN_SEAT_ID` never gets a line. `NEUTRAL_OWNER_ID` never gets a line. Seats follow `seatOrder`. The nickname is `sideDisplayName` from `src/shared/sideNicknames.ts`. The flag is `createSideNumberFlag` from `src/renderer/chrome/toastInlineMarks.ts`. A missing flag still leaves the nickname.
- Neutral units on the target have no line, but they still count in Kill and Loss when the ranged validator accepted the shot. The human's own units never count as defenders.
- Unit names are the base names in `S.unitDisplayNameById` (`buildUnitDisplayNameLookup`). Do not call `formatUnitNameForViewer`. Do not add a side prefix. A tactical name that already contains a parent suffix, such as `IV Fleet (12)`, stays whole. A missing lookup falls back to `fallbackDisplayNameFromUnitId`.
- Compression uses the same split as `formatLossEntries`. Do not copy `LOSS_TYPE_NAME_LIST_MAX`. Do not parse the comma-joined string `formatLossEntries` returns: a display name can contain a comma. Add a helper beside `formatLossEntries` that returns the named units and the collapsed groups, and change `formatLossEntries` to build its string from that helper. Its output must stay the same. Export the existing group order (`naval`, `air`, `armor`, `infantry`, `missile`) from `src/shared/lossSummary.ts` and sort with that one array. Do not restate the array in the roster file.
- Sort each seat's units by that group order, then by display name, before the split, so the names stay stable. Named tokens keep that order. Groups follow, one per collapsed type.
- A named token is preceded by that unit's origin flag. Resolve the origin with `resolveUnitOrigin` in `src/renderer/core/unitOriginFlags.ts` (a tactical id uses its parent). The image uses `originFlagAssetPath` and `COUNTRY_FLAG_CLASS_NAME`. Do not set `data-unit-origin-tooltip`. A unit with no origin still shows its name and no image. A group token is preceded by `createLossTypeToken` for that seat and has no origin flag.
- Escape the nickname and every display name with `escapeHtmlText` from `src/shared/htmlTextFormatting.ts` before they enter HTML. Build flag and type-token markup with the existing element helpers, then take `outerHTML`. Do not concatenate raw names into an HTML string.
- Odds use every selected unit id that `validateGroupRangedTarget` just accepted. That function returns success only when every selected unit can fire, so the accepted set is the selection passed to it. Do not use `representativeMarchPreviewUnitIdsByOriginH3`. Those ids exist to draw one stroke per origin.
- Compute the chances with `executeEstimateCombat` in `src/main/tools/combatEstimation.ts`, `engagementType: 'ranged'`. Pass attacker ids and defender ids explicitly. Do not omit `defenders`. Do not pass an empty `units` array: an empty list falls through to every occupant of the hex in main-process state, including units the player cannot see. When no defender id remains after the filter below, skip the estimate.
- A defender id that `findUnit` rejects, including land cargo embarked at sea, is dropped before the estimate. One rejected id must not fail the whole call. The returned counted ids are the ids that entered the prediction. The roster lists only opponent seats among those ids.
- When the estimate is not `status: 'ok'`, or `assessment` is `uncontested`, or either probability is missing, omit both Kill and Loss. Still show roster lines for the counted opponent defenders. When a legal ranged hover has no Effects or Cover line, no roster line, and no Kill or Loss, pass null to `scheduleOrderEffectsTooltip` so the tooltip stays hidden.
- The renderer chooses defender ids from the snapshot it already draws: `S.gameState.units` on the strategic map, `S.tacticalBattleSnapshot.subUnits` in a battle, limited to units whose `h3Index` is the hovered cell. Do not read `enemyIntel`. Do not send `HUMAN_SEAT_ID`. Do send other seats, including Neutral. Main resolves those ids. It must not add occupants the renderer did not send.
- The estimator state is the main-process match, not the renderer's fog snapshot. On the strategic map that is `getGameState()`. In a battle, `executeEstimateCombat` rejects a target that is not in `state.hexes`, and a live strategic snapshot's hexes are strategic cells. Pass `buildTacticalAiPlanState(getGameState(), battle)` from `src/main/tacticalBattle/buildTacticalAiPlanState.ts`, and pass the battle from `getActiveTacticalBattleSnapshotRef()`. Do not pass a seat id into `buildTacticalAiPlanState`. Attacker and defender ids are still the ones the renderer sent. `briefingOwnSeatId` stays the estimator's internal perspective. Do not filter the passed attackers or defenders by it.
- Build `latLngByH3` and `resolveToH3` with `buildLatLngCoordinateMap` in `src/main/mapData.ts`, from the hex indexes of the state you pass in. That is the same helper `requestOrdersFlow` uses. Do not copy the consult's map, and do not write a second nearest-hex lookup. `buildLatLngCoordinateMap` snaps to the nearest listed cell, so the battle map must be the tactical plan state's cells. A strategic map of parent hexes would pin a battle cell to the wrong hex.
- A missing battle on the main process, while the renderer believes one is open, returns no odds and no counted ids. The preview stroke still publishes.
- An odds failure, a thrown IPC, or a stale hover must not skip the attack-line preview. Check `hoverPreviewStillCurrent` after the odds call. If it is false, publish nothing for that call. If it is true, publish the preview whether or not odds came back.
- Air-strike, missile, march, and ferry hover paths must not call the odds function. Missile launches still show no effects tooltip.
- Do not edit `doc/ai-commander-prompts/`. The briefing Odds cell stays `wipe N%, lose M%`.
- Do not edit pictures under `doc/media/`. Do not edit `static/renderer.js` by hand. `npm run build:renderer` rewrites it.
- Do not commit or push. Do not put phase numbers, this file's name, or words from these headings into code, comments, tests, lint text, or `doc/`.

## Working rules

- Shell is Windows PowerShell at `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`.
- Keep each file's existing line endings. New files use CRLF.
- New and updated public main-process functions log at debug on entry. Caught exceptions log at error. Use the existing main logger. It checks the level itself.
- Shared modules and renderer modules must not import `src/main/logger`. A renderer import of that logger breaks the renderer bundle.
- New exported functions and fields get an orienting comment: why it exists, when to use it, what it returns, and what it throws. The new field on `HoverRoutePreviewState` gets a real comment. Do not copy the placeholder comments already on that interface.
- Name files and exports in camelCase. Types are PascalCase. Do not use a `Utils` or `Impl` suffix. Stay within the argument limit by passing one parameter object.
- Tests cover the happy path and the essential failures named in each phase. Do not test a forwarding IPC wrapper beyond the extracted function it calls.

## Phase 1 — Roster lines

In `src/shared/lossSummary.ts`, export the group-order array and add a helper that returns named units and collapsed groups using `LOSS_TYPE_NAME_LIST_MAX` and `formatCollapsedTypeCount`. `formatLossEntries` must call that helper and return the same string it returns today.

Add a pure builder in `src/shared/rangedTargetRoster.ts`. It does not log.

Input is defenders (id, seat id, unit type, base display name) plus seats in `seatOrder`. Output is one entry per opponent seat that has at least one of those units. Each entry carries `seatId`, the nickname, and tokens in display order. A token is either a named unit (`unitId`, `displayName`) or a collapsed group (`unitType`, `count`, text such as `4x Infantry`). Neutral and human defenders produce no entry. They are not an error.

Tests in `src/shared/rangedTargetRoster.test.ts`:

- Three infantry stay three named tokens. Four infantry become one `4x Infantry` group and no names.
- Two opponent seats emit two entries in `seatOrder`. A human unit and a Neutral unit produce no entry.
- A mixed seat lists the named tokens first and the collapsed group after, in naval, air, armor, infantry, missile order.
- An empty defender list returns no entries.

Run: `npx tsx --test src/shared/rangedTargetRoster.test.ts`

Then run the existing loss-summary tests: `npx tsx --test src/main/lossSummary.test.ts`

The loss-summary output must be unchanged.

## Phase 2 — Odds

Add `previewRangedTargetOdds` in `src/main/tools/rangedTargetOdds.ts`. Arguments are one object: attacker ids, defender ids, target h3, the game snapshot, the coordinate map, and an optional battle. An optional `estimate` function defaults to `executeEstimateCombat`, so tests can see whether it was called.

Behavior:

- Drop defender ids the theater would reject, including embarked land units. Do not fail the call because one id was rejected.
- If no defender id remains, return null and do not call the estimator.
- Otherwise call `executeEstimateCombat` with `engagementType: 'ranged'`, those attacker ids, and `defenders: { units: remainingIds }`.
- On `status: 'ok'` with both probabilities and an assessment other than `uncontested`, return `{ killPercent, lossPercent, countedDefenderIds }`.
- Otherwise return `{ killPercent: null, lossPercent: null, countedDefenderIds }` for the ids that were passed in, or null when none were.
- On a throw, log the error and return null.

The production caller, not this function, loads `getGameState()`, the active battle, `buildTacticalAiPlanState`, and `buildLatLngCoordinateMap`. This function stays free of the database so the tests can pass a fixture.

Log attacker count, defender count, and target h3 at debug on entry.

Tests in `src/main/tools/rangedTargetOdds.test.ts`, using the snapshot style in `src/main/tools/combatEstimation.test.ts` and `buildTacticalToolFixture` from `src/main/tacticalBattle/testSupport/tacticalToolFixtures.ts`:

- One armor firing at one infantry on an open strategic hex returns the two rounded percents from that same `executeEstimateCombat` result, and `countedDefenderIds` contains the infantry. Assert the wrapper's numbers, not a hand-rolled die formula. The snapshot's `playerPerspective` is omitted, so the firing side is not `briefingOwnSeatId`.
- One battle ranged shot, with `buildTacticalAiPlanState` and `buildLatLngCoordinateMap` on that plan state, returns `status` success through the wrapper. A coordinate map built only from the parent strategic hex is not used.
- An empty defender list returns null and the injected estimate is not called.
- A defender list whose only unit is land cargo embarked at sea returns null and the injected estimate is not called. Pair that cargo with a real defender and the estimate is called with the real defender only.
- A thrown estimate returns null.

Run: `npx tsx --test src/main/tools/rangedTargetOdds.test.ts`

## Phase 3 — Call the odds from the ranged hover

In `src/renderer/gameplay/hoverRoutePreviewRefresh.ts`, after ranged group validation succeeds and `hoverPreviewStillCurrent` is still true, request the odds, check `hoverPreviewStillCurrent` again, then publish the preview. Do this on both the tactical ranged branch and the strategic ranged branch. Air, missile, march, and ferry branches do not request it.

Send the accepted `unitIds` as attackers. Send defender ids from the renderer snapshot for that hovered cell, excluding `HUMAN_SEAT_ID`. Store the returned percents and counted ids on the hover preview. Add those fields to `HoverRoutePreviewState` in `src/renderer/core/types.ts`. Other preview kinds leave them unset.

Add one IPC method that forwards to `previewRangedTargetOdds`. Follow the existing `validateGroupRangedTarget` wiring in `src/shared/ipc/channels.ts`, `src/shared/ipc/gameApiTypes.ts`, `src/main/preload.ts`, and `src/main/main.ts`. Keep the channel string stable once added. The handler in main loads the match, the active battle, and the coordinate map as the locked decisions describe. It logs at debug and returns null when the arguments are not two string arrays and a target string.

If the odds call throws, catch it, log it, and publish the preview with no odds. If the hover sequence changed while the call was in flight, do not publish that result.

There is no separate test harness for the IPC channel. The next phase locks the wiring.

## Phase 4 — Tooltip body

Add a pure composer in `src/shared/rangedTargetTooltip.ts`. It does not log. It joins optional roster HTML, effects HTML, and the Kill and Loss lines, in that order. It returns null when every part is absent. Each line is `<strong>Kill:</strong> N%` and `<strong>Loss:</strong> N%`, separated by `TOOLTIP_SECTION_GAP_HTML`. Both lines appear together, or neither does. A null percent on either side omits both. An empty roster or effects string is absent.

The renderer builds the roster HTML from the roster entries, using only counted defender ids that belong to opponent seats:

- `createSideNumberFlag`, then `<strong>` around the escaped nickname and its colon, then the units.
- Before each named token, the origin image described above, then the escaped name.
- Before each group token, the element from `createLossTypeToken`, then the group text.
- Tokens separated by `, `.

Join that HTML with the composer. In `publishHoverRoutePreview`, when the preview is ranged and legal, schedule the composed string. When the composer returns null, schedule null. March, ferry, air-strike, and missile previews still schedule `resolveOrderPreviewEffectsTooltipHtml` alone. A missile preview still schedules null from that function.

Tests in `src/shared/rangedTargetTooltip.test.ts`:

- A roster plus effects HTML plus both odds lines, in that order, with `TOOLTIP_SECTION_GAP_HTML` between the lines that are present.
- No effects HTML still returns the roster and the odds lines.
- An empty roster still returns the effects HTML and the odds lines.
- A null Kill or a null Loss omits both odds lines and still returns the roster.
- A zero percent is kept.
- All parts missing returns null.
- A nickname or unit name that contains `<` is escaped in the roster HTML the renderer builds. Cover that escape with a small test of the roster HTML helper if it lives in shared. If it stays in the renderer, escape in the composer by passing already-escaped text and test the composer with that text. Do not leave a raw `<` path.

Extend the source contract in `src/main/rendererStackPopoverContracts.test.ts` so the ranged hover path composes this tooltip and requests odds, and the air-strike path does not request odds.

Update `doc/ux/hex-tooltips.md` in two places:

- The Effects tooltip paragraph under Information Displayed. A legal ranged aim lists the opponent lines, then the terrain and cover lines, then bold `Kill:` and `Loss:`, even when nothing slows the shot. A section with nothing to show is left out. Air strikes do not add them. Missile launches still do not show this tooltip.
- The mouse bullet that says the effects tooltip appears one second after the pointer rests when terrain, weather, or target cover changes the order. Add the legal ranged case. Leave the blocked-tooltip sentences alone.

Run: `npx tsx --test src/shared/rangedTargetTooltip.test.ts src/main/rendererStackPopoverContracts.test.ts src/main/orderPreviewEffectsTooltip.test.ts`

The existing effects-tooltip tests must still pass. A ranged hover with no weather and no cover still returns null from `resolveOrderPreviewEffectsTooltipHtml`. The new body is added around that result, not inside it.

## Phase 5 — Check

Run the Phase 1, Phase 2, and Phase 4 commands again.

Then run `npm run build:renderer`.

Manual check, strategic and tactical, for the human: select a unit that can fire, arm ranged targeting, and rest the pointer on an enemy-occupied target for one second. The attack line appears even if the odds call is slow or fails. The tooltip uses the navy effects-tooltip chrome. It names each opponent on that target with the number flag, origin flags on named units, and a type icon on a collapsed group. Kill and Loss are present, with the nickname and those labels bold, and the lines spaced like the hex tooltip. Opponent lines come first, then terrain effects, then Kill and Loss. A second opponent on the same target gets a second line, and Kill and Loss are still one pair for the whole target. An empty target omits the opponent lines. An illegal target shows the blocked tooltip instead. An air strike and a missile aim do not show the roster or these lines. A march whose terrain does not change still shows no tooltip. Moving to another cell hides it and waits one second again.

Do not start `npm run ui:smoke` unless the human asks. It rebuilds the app and plays three full sessions.
