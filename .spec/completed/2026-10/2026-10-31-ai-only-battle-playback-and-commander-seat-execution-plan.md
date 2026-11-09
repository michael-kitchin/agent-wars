# AI-only battle playback and commander seat execution plan

> **For the implementing agent:** Follow this plan from top to bottom, one phase at a time. Each phase is verifiable before the next one starts. When a check fails, stop and report the command, the actual output, and the expected output. Do not make a check pass by weakening a test or a smoke check. Do not commit or push. Do not implement anything this plan does not name. Phase names and numbers in this file stay in this file: never put them in code, comments, tests, `doc/`, or configuration.

**Goal:** Three fixes.

1. The three Victory dropdowns in the Game Options popover are the same width, and as wide as the popover allows.
2. An AI-only tactical battle shows the same beat playback as a human battle: marches, ranged fire, air strikes, melee, dice chips, and the turn-update toast.
3. Fix the serious bugs found in the last run's `debug.log` and prompt captures.
   - The lead AI seat in an AI-only battle is briefed and validated as the other seat, so its orders are always dropped.
   - The lead seat's post-beat consult runs as the other seat.
   - The lead seat's strategic callbacks are never restored after the battle.
   - The last beat of an AI-only battle latches a deferred consult that can never run, which logs an ERROR.

**Architecture:** Thread the consulted seat id through the tactical planning state, briefing, tools, order validation, and post-beat consult, in place of `opposingPartyId`. Make the AI-only beat return the same combat outcome the human beat already returns. Then build the playback from it with helpers extracted from the human commit path, so both paths share one builder. The consult policy attributes beat activity by unit owner on AI-only battles.

**Tech stack:** TypeScript under `src/`, markup in `static/index.html`, chrome CSS, Node `node:test`, and the existing UI smoke.

## Diagnosis summary (for the implementer's context)

- **Victory layout.** `.new-game-victory-field` in [`static/newGameChrome.css`](static/newGameChrome.css) gives every label a fixed `10em` column inside each half of a two-column row. That leaves about 45 px per dropdown.
- **Wrong seat in the lead commander's briefing.**
  - [`briefingSeatForBattle`](src/main/briefing/briefingPerspective.ts) always returns `opposingPartyId`.
  - [`buildTacticalAiPlanState`](src/main/tacticalBattle/buildTacticalAiPlanState.ts) uses it for `playerPerspective`. So do the tactical assessments, `check_distance`, and `estimate_combat`.
  - In the log, the lead seat `opponent` (Western Europe) was told "You command South-Eastern Asia". It was briefed with `a2-*` units and ordered them, and every one of its marches was dropped as `non_opponent`.
  - [`requestOrdersApplyParsed.ts`](src/main/openRouter/requestOrdersApplyParsed.ts) also checks tactical marches with `tacticalComputeMovementOrderOutcome`, which always uses the opposing party. Even with a correct briefing, the lead seat's marches would still be dropped.
- **Wrong seat in the post-beat consult.** [`afterTacticalBeatResolution`](src/main/openRouter/afterResolution.ts) replaces the requested seat with `opposingPartyId`. So does `buildTacticalBeatResolutionReadyParticipants`, in the same file.
- **Empty AI-only playback.**
  - The AI-only branch of [`commitHumanTacticalDraftOrders`](src/main/gameActions/humanTacticalDraftCommit.ts) returns `tacticalResolutionPlayback: { humanMoves: [] }`.
  - [`applyAiOnlyTacticalBeat`](src/main/tacticalBattle/aiOnlyTacticalBeat.ts) throws away the air, ranged, ferry, and melee results.
  - So the renderer has nothing to animate and no toast to show. No tactical loss notes are written, and infrastructure counts are not reconciled.
- **Lost callbacks.**
  - The callback stash holds one seat, the opposing party (`stashOpponentCallbackSubscriptionsForTacticalBattle`).
  - The lead seat's tactical consults replace its strategic subscriptions, and nothing restores them.
- **Stale deferred consult.** The `commitHumanTacticalDraftOrders` IPC handler in [`src/main/main.ts`](src/main/main.ts) latches a post-beat consult even when the beat set `aiOnlyEndReason`. The AI-only exit then clears that consult before the renderer's playback notify arrives. The log shows "handleNotifyResolutionPlaybackComplete: no pending deferred consultation" at the end of both battles.
- **Toast visibility in battles.**
  - [`runTacticalReadyCommit`](src/renderer/gameplay/readyTacticalCommit.ts) classifies battle losses against the strategic `visibleHexes`, which never contain tactical cells.
  - On an AI-only battle viewed as All sides, or as a seat that was not involved, every loss and engagement would be reported as an unknown battle.
  - The UX suite says battles have no fog.

## Locked decisions

- Tactical losses are still missing from the strategic Recent Turn Notes, for human battles too. That is out of scope. Do not change strategic note capture.
- The seat being consulted is the commander. Do not derive it from `opposingPartyId` anywhere on the consult path. On a human battle, the consulted seat is `opposingPartyId`, so human battles keep today's behavior.
- `briefingSeatForBattle` stays, unchanged, for callers that have no seat. After this plan, no consult-path code calls it.
- `buildTacticalAiPlanState(strategic, tactical, seatId?)` gains an optional third argument. When it is omitted, the result is `briefingSeatForBattle(tactical)`, which is today's behavior and is what the existing tests rely on. `requestOrdersFlow` always passes the seat.
- Inside the tactical briefing, assessments, and tools, the own seat is `briefingOwnSeatId(planState)`. `planState` already carries `playerPerspective`.
- In `afterTacticalBeatResolution`, an AI-only battle (`leadPartyId` set) consults `requestedSeatId`. A requested seat that is neither `leadPartyId` nor `opposingPartyId` skips the consult and logs at debug. A human battle keeps the existing override to `opposingPartyId`.
- The AI-only playback puts every AI march and ferry in `opponentMoves`, lead seat first, then the other seat. `humanMoves` is `[]`. Do not relabel AI moves as human. The renderer plays `[...humanMoves, ...opponentMoves]`, so it needs no change to animate them.
- Add one optional playback field, `aiSeatsWithRangedOrAirOrders?: AiSeatId[]`. It lists the AI seats whose sanitized draft had at least one ranged or air-strike row this beat. Only the AI-only path sets it. The AI-only path does not set `humanBeatHadSubmittedRangedOrAirOrders` or `opponentBeatHadSubmittedRangedOrAirOrders`.
- On an AI-only battle, the consult policy attributes moves by owner. Both `seatHadTacticalBeatResolutionActions` and `enemyHadTacticalBeatResolutionActions` read `[...playback.humanMoves, ...(playback.opponentMoves ?? [])]`. The owner is the sub-unit's `player` in the post-beat snapshot, or, for a unit that is gone, `unitIdOwnerFromId` (it already parses sub-unit ids). Looking only at `humanMoves` would hide both commanders' marches, because an AI-only beat puts them all in `opponentMoves`. A seat that marched would then look idle to the other seat, and a beat where both seats acted would consult nobody. Human battles keep today's rules unchanged.
- One shared outcome type, `TacticalBeatOutcome`, describes what a resolved beat produced. Both `applyHumanTacticalDraftBeatInStrategicOrder` and `applyAiOnlyTacticalBeat` return it on success. The human function's fields and values stay exactly as they are.
- Extract the playback helpers from `humanTacticalDraftCommit.ts`. The human path calls them at the same points as today. This is a move, not a rewrite: human playback output must not change.
- The callback stash gains an optional lead seat. A stash row written before this change has no lead seat and restores exactly as it does today.
- An AI-only beat that sets `aiOnlyEndReason` returns without latching a deferred consult. The renderer's existing non-deferred branch is already safe there, because `startCommanderPlanningIfAllowed` returns early when `aiOnlyEndReason` is set.
- In the tactical toast, every cell of the battle counts as visible. This matches "battles have no fog" in [`doc/ux/resolution-playback.md`](doc/ux/resolution-playback.md). The same commit path serves human battles, so a human battle's turn-update toast also stops calling battle losses an unknown battle. Strategic toasts are a different function and stay fog-filtered.
- An AI-only commit does not return `tacticalMarchContinuations`. An AI unit that cannot finish its march this beat is ordered again next beat. That is the current AI-only behavior.
- Victory becomes one four-column grid: label, dropdown, label, dropdown. It is the same pattern `.new-game-rules` uses. Both label columns are `max-content`, and both dropdown columns are `minmax(0, 1fr)`, so all three dropdowns are equally wide. AI-Only Battles is the third pair, so it lands in the left half of the second row, and the right half stays empty. The popover stays 400 px wide. The selects use `min-width: 0`, the same as the Rules selects, so the long Rule option does not set the column width. Do not set a `min-width` greater than 0. The 80 px check below is a measurement, not a CSS floor. A floor would overflow the row or wrap a label.

## Global constraints

- Follow `AGENTS.md` and `.cursor/rules/`. Never commit or push.
- Orienting comments on every new or changed function, type, field, and module-level constant, in the style of the file being edited (Purpose / When to use / Expected outcome / Exceptions).
- Logging:
  - Public main-process functions log at debug on entry.
  - Caught exceptions log at error.
  - Getters that do not change state log at trace.
  - Use the existing logger (`logDebug`, `logTrace`, `logError` from `src/main/logger`, or `tacticalLogQuery` and `tacticalLogMutate` in `src/main/tacticalBattle/`).
- Tests cover the happy path and the essential failure of each new contract. Do not test pass-through wiring, type shapes, or markup.
- Do not edit `static/renderer.js` by hand. Run `npm run build:renderer` after any renderer TypeScript change.
- Shell is Windows PowerShell at `F:\Projects\Personal\agent-wars-public`. Do not chain commands with `&&`. Each PowerShell block below is one command per line.
- `npm run ui:smoke` rebuilds the native SQLite module for Electron. If a later `npx node --test` fails with a `NODE_MODULE_VERSION` error, run `npm run rebuild:native:node` once and retry. `npm test` does that itself.
- Keep each file's existing line endings.
- File sizes: the desired limit is 600 lines and the hard limit is 1000.
  - [`humanTacticalDraftCommit.ts`](src/main/gameActions/humanTacticalDraftCommit.ts) is 617 lines, [`tacticalBattleSession.ts`](src/main/tacticalBattle/tacticalBattleSession.ts) 778, [`afterResolution.ts`](src/main/openRouter/afterResolution.ts) 652, and [`requestOrdersApplyParsed.ts`](src/main/openRouter/requestOrdersApplyParsed.ts) 599.
  - Put new behavior in new files. Each of those four may only shrink, or grow by at most a few lines.
- Argument limits: the desired maximum is 6 and the hard limit is 10. Pass one object when a function would exceed 6.
- Mark symbols for their intended mutability: `const`, and `readonly` on new interface fields.
- Update every current `doc/` page this behavior makes wrong, in the same phase as the code. Leave the historical documents named in `AGENTS.md` alone.

## Files

- Modify: [`static/index.html`](static/index.html), [`static/newGameChrome.css`](static/newGameChrome.css), [`scripts/ui-smoke/ui-smoke-new-game-checks.cjs`](scripts/ui-smoke/ui-smoke-new-game-checks.cjs)
- Modify: [`src/main/tacticalBattle/buildTacticalAiPlanState.ts`](src/main/tacticalBattle/buildTacticalAiPlanState.ts), [`src/main/openRouter/requestOrdersFlow.ts`](src/main/openRouter/requestOrdersFlow.ts), [`src/main/openRouter/tacticalBriefingAssessments.ts`](src/main/openRouter/tacticalBriefingAssessments.ts), [`src/main/openRouter/formatTacticalBriefing.ts`](src/main/openRouter/formatTacticalBriefing.ts), [`src/main/tools/tacticalPathfinding.ts`](src/main/tools/tacticalPathfinding.ts), [`src/main/tools/pathfinding.ts`](src/main/tools/pathfinding.ts), [`src/main/tools/combatEstimation.ts`](src/main/tools/combatEstimation.ts), [`src/main/openRouter/requestOrdersApplyParsed.ts`](src/main/openRouter/requestOrdersApplyParsed.ts)
- Create: `src/main/openRouter/tacticalBeatConsultParticipants.ts`. Modify: [`src/shared/ipc/tacticalPlaybackTypes.ts`](src/shared/ipc/tacticalPlaybackTypes.ts), [`src/main/openRouter/consultationPolicy.ts`](src/main/openRouter/consultationPolicy.ts), [`src/main/openRouter/afterResolution.ts`](src/main/openRouter/afterResolution.ts)
- Modify: [`src/main/tacticalBattle/tacticalCallbackStashPersistence.ts`](src/main/tacticalBattle/tacticalCallbackStashPersistence.ts), [`src/main/openRouter/tacticalCallbackSubscriptionLifecycle.ts`](src/main/openRouter/tacticalCallbackSubscriptionLifecycle.ts), [`src/main/tacticalBattle/tacticalBattleSession.ts`](src/main/tacticalBattle/tacticalBattleSession.ts)
- Create: `src/main/tacticalBattle/tacticalBeatOutcome.ts`. Modify: [`src/main/tacticalBattle/aiOnlyTacticalBeat.ts`](src/main/tacticalBattle/aiOnlyTacticalBeat.ts)
- Create: `src/main/tacticalBattle/testSupport/twoAiBattleFixture.ts`, moving the helpers out of [`aiOnlyTacticalBeat.test.ts`](src/main/tacticalBattle/aiOnlyTacticalBeat.test.ts)
- Create: `src/main/gameActions/tacticalBeatPlayback.ts`, `src/main/gameActions/aiOnlyTacticalCommit.ts`, `src/main/gameActions/aiOnlyTacticalCommit.test.ts`. Modify: [`src/main/gameActions/humanTacticalDraftCommit.ts`](src/main/gameActions/humanTacticalDraftCommit.ts)
- Modify: [`src/main/main.ts`](src/main/main.ts) (the `commitHumanTacticalDraftOrders` IPC handler only)
- Modify: [`src/renderer/gameplay/readyTacticalCommit.ts`](src/renderer/gameplay/readyTacticalCommit.ts)
- Tests extended:
  - [`buildTacticalAiPlanState.test.ts`](src/main/tacticalBattle/buildTacticalAiPlanState.test.ts)
  - [`tacticalBriefingAssessments.test.ts`](src/main/openRouter/tacticalBriefingAssessments.test.ts)
  - [`requestOrdersSeats.test.ts`](src/main/openRouter/requestOrdersSeats.test.ts)
  - [`afterResolutionTacticalBeat.test.ts`](src/main/openRouter/afterResolutionTacticalBeat.test.ts)
  - [`tacticalPromptSectionParity.test.ts`](src/main/openRouter/tacticalPromptSectionParity.test.ts), which holds the callback stash tests
  - [`aiOnlyTacticalBeat.test.ts`](src/main/tacticalBattle/aiOnlyTacticalBeat.test.ts)
- Docs:
  - [`doc/ux/new-game-dialog.md`](doc/ux/new-game-dialog.md)
  - [`doc/ui-style-guide.md`](doc/ui-style-guide.md)
  - [`doc/ai-commander-prompts/tactical-prompt.md`](doc/ai-commander-prompts/tactical-prompt.md)
  - [`doc/hybrid-ai.md`](doc/hybrid-ai.md)
  - [`doc/ux/resolution-playback.md`](doc/ux/resolution-playback.md)
  - [`doc/combat-rules-v3.md`](doc/combat-rules-v3.md), only if a §12 sentence becomes wrong
  - [`doc/ux/notifications-and-feedback.md`](doc/ux/notifications-and-feedback.md), only if a sentence becomes wrong

---

### Phase 1: Victory dropdown widths

Independent of every other phase.

1. In [`static/index.html`](static/index.html), inside `#new-game-options-popover`, find the Victory section. Replace both `.new-game-victory-line` divs, and the `.new-game-victory-field` divs inside them, with one `<div class="new-game-victory">`. It holds six children in this order:
   - the `Rule` label and `#new-game-victory-select`
   - the `Turn limit` label and `#new-game-turn-limit-select`
   - the `AI-Only Battles` label and `#new-game-ai-only-battles-select`

   Keep every id, `for`, `data-control-tooltip`, and `<option>` exactly as it is.
2. In [`static/newGameChrome.css`](static/newGameChrome.css), delete the `.new-game-victory-line`, `.new-game-victory-line + .new-game-victory-line`, `.new-game-victory-field`, `.new-game-victory-field label`, and `.new-game-victory-field select` rules. Add rules in their place, modelled on the `.new-game-rules` rules in the same file:
   - `.new-game-victory`: `display: grid; grid-template-columns: max-content minmax(0, 1fr) max-content minmax(0, 1fr); align-items: center; gap: 8px 6px;`
   - `.new-game-victory > label`: `white-space: nowrap;`
   - `.new-game-victory > label:nth-of-type(2)`: `padding-left: 10px;` This is Turn limit, which opens the second pair, the same as Tech in Rules.
   - `.new-game-victory > select`: `width: 100%; min-width: 0; box-sizing: border-box;`
   - A short CSS comment above the block, in the style of the Rules comment. Say what the layout guarantees: one grid, label columns as wide as their longest label, three dropdowns of one width that fill the row. Do not mention this plan.
3. Run `rg -n "new-game-victory-line|new-game-victory-field" src static scripts doc`. Expected: no matches other than `static/renderer.js`. If renderer TypeScript or a smoke check uses those classes, stop and report.
4. In [`scripts/ui-smoke/ui-smoke-new-game-checks.cjs`](scripts/ui-smoke/ui-smoke-new-game-checks.cjs), check `new-game-options-popover`. Keep its existing assertions and add these after the AI-Only position check:
   - All three dropdown widths are equal: `near(turnLimit.w, victory.w)` and `near(aiOnly.w, victory.w)`.
   - Each dropdown is at least 80 px wide. Return a message naming the width when one is not. The popover content box is about 378 px at the 1280 px smoke window (`width: 400px` with `box-sizing: border-box` and 10 px padding, from [`static/shellChrome.css`](static/shellChrome.css) and [`static/newGameChrome.css`](static/newGameChrome.css)). Two `1fr` columns beside `AI-Only Battles` and `Turn limit` leave about 90 px each. If a measured width is under 80, stop and report it. Do not lower 80, and do not add a `min-width` greater than 0.
   - Turn limit's right edge (`turnLimit.x + turnLimit.w`) is `near` Weather's right edge (`weather.x + weather.w`). This shows the Victory grid fills the same width as the Rules grid. The right edge alone does not prove the dropdowns are wide: a grid of narrow `1fr` columns still ends at the container edge. The 80 px check is what catches the old 45 px dropdowns.
5. Docs:
   - In [`doc/ux/new-game-dialog.md`](doc/ux/new-game-dialog.md), Victory bullet, say that Rule, Turn limit, and AI-Only Battles are the same width, and that the dropdowns share whatever the row leaves after the labels. Keep "AI-Only Battles sits in the left half ... the right half is empty".
   - In [`doc/ui-style-guide.md`](doc/ui-style-guide.md), in the Game Options sentence "each a label and a dropdown of the same widths", say that all three dropdowns are one width and fill the row, and that each label column is as wide as its longest label.

Verify:

```powershell
npm run ui:smoke -- --label victory-widths
```

Expected: `new-game-options-popover` is `PASS`, and the summary has `0 failed`. Open that check's `new-game-options` screenshot in the run's output folder and confirm the three dropdowns read "Deathmatch", "Unlimited", and "Balanced" without truncation. If the 80 px minimum fails, report the measured width. Do not lower the number.

### Phase 2: Each AI commander is briefed and validated as its own seat

Main process only. No playback change yet.

1. [`buildTacticalAiPlanState.ts`](src/main/tacticalBattle/buildTacticalAiPlanState.ts):
   - Add an optional third parameter `seatId?: AiSeatId`, and set `playerPerspective: seatId ?? briefingSeatForBattle(tactical)`.
   - Log `seatId` in the existing `tacticalLogQuery`.
   - Update the orienting comment: the plan state is from the consulted seat's side, and an omitted seat falls back to the battle's other party.
2. [`requestOrdersFlow.ts`](src/main/openRouter/requestOrdersFlow.ts): pass `seatId` to `buildTacticalAiPlanState(state, tacticalBattle, seatId)`. The `seatId` variable already exists above that line.
3. [`tacticalBriefingAssessments.ts`](src/main/openRouter/tacticalBriefingAssessments.ts):
   - `buildLightweightTacticalUnitAssessments` and `buildTacticalBriefingNarrative` each gain a trailing optional `ownSeatId?: AiSeatId`. Use `ownSeatId ?? briefingSeatForBattle(tacticalBattle)` in place of the current `briefingSeatForBattle(tacticalBattle)` line.
   - Put the seat argument last, so the existing test calls still compile.
   - In [`formatTacticalBriefing.ts`](src/main/openRouter/formatTacticalBriefing.ts), compute `const ownSeat = briefingOwnSeatId(planState);` once, before the assessments. Pass it to both functions, and reuse it for the Recent Turn Notes and Active Callbacks lines that already call `briefingOwnSeatId(planState)`.
4. [`tacticalPathfinding.ts`](src/main/tools/tacticalPathfinding.ts), `executeTacticalCheckDistance`:
   - Add a required parameter `ownSeatId: AiSeatId` after `battle`, and use it in place of both `briefingSeatForBattle(battle)` calls. Remove the now-unused import.
   - In [`pathfinding.ts`](src/main/tools/pathfinding.ts), the `check_distance` branch passes `briefingOwnSeatId(state)`. `state` is the plan state during a battle: [`requestOrdersToolLoop.ts`](src/main/openRouter/requestOrdersToolLoop.ts) sets `toolState` to `planState` when `tacticalBattle` is set, and passes that into `executePathfinding`.
   - Update the two direct calls in [`tacticalPathfinding.test.ts`](src/main/tools/tacticalPathfinding.test.ts) to pass `AI_SEAT_IDS[0]`. Those fixtures omit `opposingPartyId`, so `briefingSeatForBattle` returns the first AI seat today. The weather test expects the AI armor's tags, not a human armor listed first on the same cell. Passing any other seat fails that test.
5. [`combatEstimation.ts`](src/main/tools/combatEstimation.ts): replace `tacticalBattle ? briefingSeatForBattle(tacticalBattle) : briefingOwnSeatId(state)` with `briefingOwnSeatId(state)`, and drop the unused import. The tool loop passes the same `planState` into `executeCombatEstimation`. `assess_unit` does not use `briefingSeatForBattle`. It judges enemies from the assessed unit's own `player`. Leave it.
6. [`requestOrdersApplyParsed.ts`](src/main/openRouter/requestOrdersApplyParsed.ts), tactical branch. The file is 599 lines. Keep the new checks to a few lines so it stays well under 1000.
   - Replace the `tacticalComputeMovementOrderOutcome({ ... })` call in the movement loop with `tacticalComputeMovementOrderOutcomeForPlayer(seatId, { ... })`, with the same object argument.
   - Replace `projectTacticalSnapshotAfterOpponentMovementOrders(tacticalBattle, validated)` with `projectTacticalSnapshotAfterPlayerMovementOrders(tacticalBattle, validated, seatId)`. That function is in [`tacticalMovementApply.ts`](src/main/tacticalBattle/tacticalMovementApply.ts).
   - Immediately before the existing air-strike, ferry, and embark validators, drop the row when the sub-unit's `player` is not `seatId`. `validateTacticalOpponentAirStrikeOrder`, `validateTacticalOpponentFerryOrder`, and `validateTacticalOpponentEmbarkOrder` accept any AI owner, so without this check the lead seat's reply can store the other seat's orders. Commit-time sanitize drops air and ferry for the wrong owner, but it does not drop the other seat's embark. A dropped row uses the same drop-reason shape as the neighboring rows, and names the unit.
   - Fix the imports. On a human battle `seatId` is the opposing party, so behavior there is unchanged. Ranged validation already receives `seatId`. Leave it.
7. Run `rg -n "briefingSeatForBattle" src/main --glob "!*.test.ts"`. Expected remaining hits: `briefingPerspective.ts`, the fallback in `buildTacticalAiPlanState.ts`, and the two fallbacks in `tacticalBriefingAssessments.ts`. Any other hit on the consult path is a missed seat. Fix it the same way, or stop and report.
8. Tests:
   - [`buildTacticalAiPlanState.test.ts`](src/main/tacticalBattle/buildTacticalAiPlanState.test.ts): copy an existing case's battle and give it `leadPartyId: 'opponent'` and `opposingPartyId: 'opponent2'`. Passing `'opponent'` sets `playerPerspective` to `'opponent'`. Omitting the seat sets it to `'opponent2'`.
   - [`tacticalBriefingAssessments.test.ts`](src/main/openRouter/tacticalBriefingAssessments.test.ts): build a battle with sub-units for `opponent` and `opponent2`, and `opposingPartyId: 'opponent2'`. With `ownSeatId` set to `'opponent'`, every assessment is for an `opponent` sub-unit, and the narrative's own-force count equals the `opponent` sub-unit count.
   - [`requestOrdersSeats.test.ts`](src/main/openRouter/requestOrdersSeats.test.ts) is 603 lines. Add one test, modeled on `a second-seat consultation orders only that seat` and `a tactical consult of only missiles does not call the model`. Stay under 1000 lines. Name it `a tactical consult keeps the consulted seat's march and drops the other seat's`.
     - Install the electron mock before requiring `openRouter`, and delete `require.cache` for `./openRouter` first, as the missile test does.
     - Call `saveKey` and `writeSeatApiKeys` for `opponent`. `readSeatApiKey` uses the legacy key only while no seat-key map exists. Once a map exists, a seat with no entry has no key and the consult stops before orders.
     - Use `withThreeSeatMatch`. Build a battle with `leadPartyId: 'opponent'`, `opposingPartyId: 'opponent2'`, and one infantry sub-unit for each of those seats. Put both start cells and the lead unit's destination in `tacticalChildH3Indexes`. A destination outside that list is `outside_footprint`, not a legal step.
     - Before encoding, call `initTacticalCoordinateRegistry(battle.battleId, battle.enclosingStrategicH3Index)` from [`src/main/briefing/map/hexCoordinates.ts`](src/main/briefing/map/hexCoordinates.ts). Encode with `h3ToCode(cell, { mode: 'tactical', battleId: battle.battleId, tacticalTurnNumber: battle.tacticalTurnNumber })`. `{ mode: 'tactical' }` alone throws, because a tactical code needs the battle registry.
     - Choose the lead unit's destination with `tacticalComputeMovementOrderOutcomeForPlayer` so the step is legal. The other unit's destination must be a cell in that same registry. Skip the test when the pack is missing or no step is legal.
     - Call `requestOrders` with `seatId: 'opponent'` and that battle. The fake reply contains an `explicit_move` for each sub-unit.
     - Expected: `orders` contains only the lead unit's id, and a drop reason contains `non_opponent`. Today's validator uses `opposingPartyId`, so it would keep the other seat's march and drop the lead's. A briefing-only fix fails this test.
9. Docs:
   - In [`doc/ai-commander-prompts/tactical-prompt.md`](doc/ai-commander-prompts/tactical-prompt.md), §2.1 "Role and clock line", add one sentence: the role line names the consulted commander's side, and in an AI-only battle each commander is briefed as its own side, with its own sub-units as "yours".
   - Search `doc/` for any sentence saying the tactical briefing is written for `opposingPartyId`, and fix it.

Verify:

```powershell
npm run build:main
npx node --test dist/main/tacticalBattle/buildTacticalAiPlanState.test.js dist/main/openRouter/tacticalBriefingAssessments.test.js dist/main/tools/tacticalPathfinding.test.js dist/main/openRouter/tacticalPromptSectionParity.test.js dist/main/openRouter/possibleUnitActions.test.js dist/main/openRouter/requestOrdersSeats.test.js
npm run lint
```

Expected: every listed test passes, and lint reports no errors.

### Phase 3: Post-beat consult runs as the requested seat, with owner-aware activity

Main process only. Tests drive the policy with hand-built playback, so this phase does not depend on the playback builder.

1. [`tacticalPlaybackTypes.ts`](src/shared/ipc/tacticalPlaybackTypes.ts): add the optional field `aiSeatsWithRangedOrAirOrders?: AiSeatId[]` to `TacticalCommitResolutionPlayback`, beside the two existing `...BeatHadSubmittedRangedOrAirOrders` flags.
   - Orienting comment: set only on an AI-only beat, it lists each AI seat whose sanitized draft had at least one ranged or air-strike row, and the consult policy reads it as that seat's activity, because ranged fire adds no march playback.
   - Import `AiSeatId` as a type from `../seatIds`.
2. [`consultationPolicy.ts`](src/main/openRouter/consultationPolicy.ts):
   - Add a private helper `tacticalPlaybackUnitOwner(unitId, tacticalBattle)`. It returns the `player` of the sub-unit with that id in `tacticalBattle.subUnits`, otherwise `unitIdOwnerFromId(unitId)`. Log at trace.
   - In `seatHadTacticalBeatResolutionActions`, when `tacticalBattle.leadPartyId != null`, return true if any of these holds:
     - a move in `[...playback.humanMoves, ...(playback.opponentMoves ?? [])]` whose owner is `seatId` (any move counts, matching how opponent moves count today);
     - `playback.aiSeatsWithRangedOrAirOrders` includes `seatId`;
     - the existing kill-credit check.

     Otherwise keep today's code exactly.
   - In `enemyHadTacticalBeatResolutionActions`, when `leadPartyId != null`, return true if any of these holds:
     - `hasNonNoopMarchMoves` of the moves in `[...playback.humanMoves, ...(playback.opponentMoves ?? [])]` whose owner is another seat (`owner !== seatId && isSeatId(owner)`). Use that combined list. `humanMoves` is empty on an AI-only beat, so filtering it alone never sees the other commander.
     - `aiSeatsWithRangedOrAirOrders` contains a seat other than `seatId`;
     - the existing enemy kill-credit check.

     Otherwise keep today's code exactly.
   - Update both orienting comments.
3. [`afterResolution.ts`](src/main/openRouter/afterResolution.ts):
   - Move `buildTacticalBeatResolutionReadyParticipants` into a new `src/main/openRouter/tacticalBeatConsultParticipants.ts`. The only caller is `afterTacticalBeatResolution`. Do not re-export it. [`afterResolution.ts`](src/main/openRouter/afterResolution.ts) is 652 lines, and this move is what keeps it from growing.
   - The moved function gains `seatId: AiSeatId`. Replace `const party = tacticalBattle.opposingPartyId;` with that parameter. Drop the `party ?` guards that only existed because the party could be undefined. Its move scan already reads `playback.opponentMoves`, which is where an AI-only beat puts both seats. Update the comment.
   - In `afterTacticalBeatResolution`, replace the `const seatId = ...` expression:
     - When `tacticalBattle.leadPartyId != null`, the seat is `requestedSeatId`. If `requestedSeatId` is neither `leadPartyId` nor `opposingPartyId`, log at debug with `reason: 'skip_seat_not_in_battle'` and return `{ consulted: false, attachTacticalOpponentPlanToIpc: false }`.
     - Otherwise keep the existing human-battle expression.
   - Pass `seatId` to `buildTacticalBeatResolutionReadyParticipants`.
4. Tests in [`afterResolutionTacticalBeat.test.ts`](src/main/openRouter/afterResolutionTacticalBeat.test.ts). Copy the setup of the first test in that file. Use a battle with `leadPartyId: 'opponent'`, `opposingPartyId: 'opponent2'`, two `opponent` sub-units and two `opponent2` sub-units on two different tactical cells. `firstRingCellDistinctFrom` from `tacticalHexFixtures` gives a second cell. Capture `options.seatId` in the fake `requestOrders`.
   - Keep every marching sub-unit on the post-beat snapshot. The owner lookup reads `subUnits` first, and these fixture ids are not compact unit ids, so `unitIdOwnerFromId` would not find them.
   - "an AI-only post-beat consult asks the requested seat": playback `{ humanMoves: [] }`, requested `'opponent'`. Expected: one call, with `seatId === 'opponent'`.
   - "on an AI-only beat, the seat that marched alone is not consulted and the idle seat is": playback `{ humanMoves: [], opponentMoves: [one move of an opponent sub-unit from cell A to cell B] }`. Requested `'opponent'`: no call, `consulted === false`. Requested `'opponent2'`: one call, with `seatId === 'opponent2'`.
   - "on an AI-only beat, both seats are consulted when both marched": playback `{ humanMoves: [], opponentMoves: [one opponent move, one opponent2 move] }`. Request each seat. Expected: one call each, and each call's `seatId` is the seat that was requested. This fails if enemy activity reads only `humanMoves`. `computePostResolutionConsultTriggers` consults when `enemyObservable` is true even if that seat was not idle.
   - Every existing test in that file must still pass unchanged.
5. Docs: in [`doc/hybrid-ai.md`](doc/hybrid-ai.md), event-driven tactical bullet, add one sentence. On an AI-only battle, each seat's consult is for that seat, and whether it was idle or saw enemy activity comes from the owner of each sub-unit that marched, fired, or scored a kill.

Verify:

```powershell
npm run build:main
npx node --test dist/main/openRouter/afterResolutionTacticalBeat.test.js dist/main/ipc/readyIpcResolutionMapping.test.js
```

Expected: all pass, including the three new tests.

### Phase 4: The callback stash keeps both seats of an AI-only battle

Main process only.

1. [`tacticalCallbackStashPersistence.ts`](src/main/tacticalBattle/tacticalCallbackStashPersistence.ts):
   - Add an exported interface `TacticalCallbackSeatStash { readonly seatId: AiSeatId; readonly subscriptions: readonly CallbackSubscription[] }`, with orienting comments on the type and its fields.
   - Add an optional field `readonly leadSeat?: TacticalCallbackSeatStash` to `TacticalCallbackStash`. Comment: set only for an AI-only battle, it is the lead seat's pre-battle rows, and restore puts them back too.
   - Writer: when `stash.seatId !== null` and `stash.leadSeat` is present, add `leadSeat: { seatId, subscriptions: copyCallbackSubscriptions(...) }` to the JSON payload. The `noAiParty` payload never has a lead seat.
   - Reader: move the existing subscription-row loop into a private helper `parseStashedSubscriptionRows(rows: readonly unknown[]): CallbackSubscription[]`, and use it for both seats.
     - When `parsed.leadSeat` is present, it must be an object whose `seatId` passes `isAiSeatId` and whose `subscriptions` is an array. Otherwise throw, the same as an invalid `seatId`, so the existing catch logs and clears the key.
     - A row without `leadSeat` reads as today.
   - Update the key's comment so it names the optional `leadSeat`.
2. [`tacticalCallbackSubscriptionLifecycle.ts`](src/main/openRouter/tacticalCallbackSubscriptionLifecycle.ts):
   - `stashOpponentCallbackSubscriptionsForTacticalBattle(seatId = AI_SEAT_IDS[0], leadSeatId: AiSeatId | null = null)`. When both are non-null and different, the stash includes `leadSeat` with a copy of `getSubscriptions(leadSeatId)`. Log `leadSeatId` and the lead count.
   - `hydrateOpponentCallbackStashFromGameConfig` copies `leadSeat` too.
   - Restore: move the existing "clear the seat, then replace with the stashed rows" lines into a private helper `restoreSeatSubscriptions(seatId, subscriptions)`. Call it for `snapshot.seatId`, then for `snapshot.leadSeat` when present, then clear the stash key once. Log `leadSeatId` and its count in the `full_restore` debug line.
   - Leave the missing-stash path and the `noAiParty` path unchanged.
3. [`tacticalBattleSession.ts`](src/main/tacticalBattle/tacticalBattleSession.ts), where a battle starts: pass `snapshot.leadPartyId` as the second argument when it is an AI seat, and `null` otherwise. That is one added argument and no other change.
4. Test in [`tacticalPromptSectionParity.test.ts`](src/main/openRouter/tacticalPromptSectionParity.test.ts), next to "callback stash restores the battle AI seat and leaves other seats alone", using the same `withTempDb` wrapper:
   - "an AI-only stash restores both seats, including after a restart".
   - Give `opponent` and `opponent2` one distinct strategic `turns` subscription each.
   - Call `stashOpponentCallbackSubscriptionsForTacticalBattle('opponent2', 'opponent')`.
   - Replace both seats' subscriptions with a tactical-looking row, such as `unit_engaged` with a sub-unit id.
   - Call `resetTacticalCallbackSubscriptionStashForTests()`, which forces the restore to read `game_config`.
   - Call `restoreOpponentCallbackSubscriptionsAfterTacticalBattle()`.
   - Expected: each seat has exactly its original row, and `tacticalCallbackStashConfigExists()` is false.

Verify:

```powershell
npm run build:main
npx node --test dist/main/openRouter/tacticalPromptSectionParity.test.js
```

Expected: all pass, including the existing stash tests and the new one.

### Phase 5: The AI-only beat returns its full combat outcome

Main process only. The commit still returns empty playback after this phase. The next phase uses these results.

1. Create `src/main/tacticalBattle/tacticalBeatOutcome.ts` with an exported interface `TacticalBeatOutcome`. Its fields are exactly the success fields of `applyHumanTacticalDraftBeatInStrategicOrder` in [`tacticalBattleSession.ts`](src/main/tacticalBattle/tacticalBattleSession.ts), with the same names and the same element types:
   - `battle`, `battleAfterMovementBeforeFerry`
   - `killsByDirectFire`, `killsByAirStrike`, `killsByReturnFire`
   - `removedUnits`, `infrastructureDestroyedEvents`, `airStrikeAttemptCount`
   - `airStrikePlaybackMoves`, `airStrikePlaybackStrikeHexes`, `airStrikePlaybackCasualtyHexes`, `airStrikePlaybackRemovedUnits`
   - `rangedResolutionShotLines`, `airStrikeDiceRolls`, `rangedDiceRolls`
   - `meleePack`

   Mark each property `readonly`, but keep the array types as they are today. Copy the type imports from `tacticalBattleSession.ts`. `meleePack` may use `ReturnType<typeof applyTacticalMeleeAfterSupportOrders>`. Give each field an orienting comment. The module comment says this is what one resolved beat produced, shared by the human beat and the AI-only beat so playback and loss notes are built once. This file must not import [`tacticalBattleSession.ts`](src/main/tacticalBattle/tacticalBattleSession.ts) or [`aiOnlyTacticalBeat.ts`](src/main/tacticalBattle/aiOnlyTacticalBeat.ts). Those files import it. [`tacticalMeleeApply.ts`](src/main/tacticalBattle/tacticalMeleeApply.ts) does not import the session, so using its return type does not cycle.
2. In `tacticalBattleSession.ts`, change only the return type of `applyHumanTacticalDraftBeatInStrategicOrder` to `({ success: true } & TacticalBeatOutcome) | { success: false; reason: string }`. The body does not change.
3. [`aiOnlyTacticalBeat.ts`](src/main/tacticalBattle/aiOnlyTacticalBeat.ts):
   - Export the type `AiOnlyTacticalBeatResult = ({ readonly success: true } & TacticalBeatOutcome) | { readonly success: false; readonly reason: string }`, and make `applyAiOnlyTacticalBeat` return it.
   - On success, return the fields the same way the human function does. Map from the local names:
     - `battle`: the stored `battle`.
     - `battleAfterMovementBeforeFerry`: `afterOpposingMove`.
     - Kills, infrastructure, air playback, shot lines, and air and ranged dice: from `airAndRanged`.
     - `removedUnits`: `[...airAndRanged.removedUnits, ...afterLeadFerry.removedUnits, ...afterOpposingFerry.removedUnits]`.
     - `meleePack`: `{ ...melee, battle }`.
   - Update the function's orienting comment. Nothing else in the beat changes: phase order, RNG seed, idle streak, and end reasons stay as they are.
4. Move the helpers `emptyPlan`, `withTwoAiBattle`, `legalStep`, and `storedUnit` from [`aiOnlyTacticalBeat.test.ts`](src/main/tacticalBattle/aiOnlyTacticalBeat.test.ts) into `src/main/tacticalBattle/testSupport/twoAiBattleFixture.ts`.
   - Export them, keeping their comments.
   - The fixture module must not call `tacticalDbFixtureRegisterDefaultAfterEach`. Each test file keeps that call itself.
   - Import the helpers back into the test file. The existing tests must not change otherwise.
5. Add a test to `aiOnlyTacticalBeat.test.ts`: "a contested cell returns melee results and dice".
   - With `withTwoAiBattle`, take one infantry or armor sub-unit of each seat. Use `setActiveTacticalBattleSnapshotRef` to put the opposing unit on the lead unit's cell.
   - Call `applyAiOnlyTacticalBeat` with two `emptyPlan()` drafts.
   - Expected: success, `meleePack.meleeCombatHexes` contains that cell, and `meleePack.meleeDiceRolls.length > 0`.
   - If no melee resolves on that cell, stop and report. Do not change the assertion.

Verify:

```powershell
npm run build:main
npx node --test dist/main/tacticalBattle/aiOnlyTacticalBeat.test.js dist/main/tacticalBattle/tacticalPartiesSeats.test.js dist/main/tacticalBattle/tacticalMeleeApply.test.js
```

Expected: all pass. Then run `npm run check:renderer-types` and `npm run lint` to confirm the shared type compiles everywhere.

### Phase 6: AI-only commits return full playback, loss notes, and infrastructure counts

Main process only. Phase 3's policy now receives real playback.

1. Create `src/main/gameActions/tacticalBeatPlayback.ts`. Move code out of [`humanTacticalDraftCommit.ts`](src/main/gameActions/humanTacticalDraftCommit.ts) into exported helpers, keeping the logic identical:
   - `tacticalTerrainBattleView(preBattle)`: the `terrainBattle` object literal from `commitHumanTacticalDraftOrders`. For the return type, use the parameter type that `effectiveTacticalMovementPointBudgetForMarchLeg` and `tacticalMarchFirstStopAlongPath` accept. Read their signatures. If a named type exists, use it. Otherwise declare one exported type in this file. Do not create a second structural copy elsewhere.
   - `buildSeatPlaybackMoves(args)`: the `opponentMoves` builder, both the march loop with its path clipping and the ferry loop. It takes one object `{ preBattle, postMovementBattle, terrainBattle, movementOrders, ferryOrders, isMover }`. `isMover(player: OwnerId): boolean` replaces the two `player === HUMAN_SEAT_ID` skips. It returns the move array.
   - `buildTacticalCombatPlaybackFields(outcome: TacticalBeatOutcome, rangedTargetHexes: readonly string[])`: the ranged combat and casualty hex computation plus every non-move field in today's `tacticalResolutionPlayback` literal. Those are the ranged fields, shot lines, the three kill lists, infrastructure, air strike fields, melee fields, and `combatDicePlaybackFields(...)`. Keep the same omit-when-empty rule for each field. It returns a `Partial<TacticalCommitResolutionPlayback>`, or a named `Omit<...>` type.
   - `reconcileInfrastructureAfterTacticalBeat(outcome, logLabel)`: the `reconcileStrategicInfrastructureCountsFromTacticalOverrides` block, which runs only when infrastructure events exist.
   - `captureTacticalBeatLossNote(outcome)`: the `tacticalRemovedById` / `airStrikeRemovedUnits` / `captureTurnLossNoteFromResolution({ scope: 'tactical', ... })` block, using `outcome.battle` for the battle id and the beat number.
   - Every exported helper gets an orienting comment and a debug or trace log, following the global logging rule.
2. In `commitHumanTacticalDraftOrders`, replace the moved blocks with calls to these helpers at the same points in the same order:
   - The reconcile call stays before the playback is built.
   - The loss-note call stays after the embark persistence.
   - Human moves keep their own loop, because it reuses `humanMarchPlanByUnitId`.
   - Opponent moves call `buildSeatPlaybackMoves` with `isMover: (player) => player !== HUMAN_SEAT_ID` and the sanitized opponent draft's movement and ferry orders. With no draft, `opponentMoves` stays empty.
   - The human playback must be field-for-field what it was. Remove the imports that become unused.
3. Create `src/main/gameActions/aiOnlyTacticalCommit.ts` with two exported functions:
   - `buildAiOnlyTacticalBeatPlayback({ preBattle, leadDraft, opposingDraft, outcome })`. It is pure apart from logging, and returns a `TacticalCommitResolutionPlayback`:
     - `humanMoves: []`.
     - `opponentMoves`: lead-seat moves (`isMover: player === leadPartyId`), then other-seat moves (`player === opposingPartyId`), or `undefined` when there are none. Use `outcome.battleAfterMovementBeforeFerry` as the post-movement battle.
     - `aiSeatsWithRangedOrAirOrders`: the seats whose draft has a ranged or air-strike row, or omitted when there are none.
     - The combat fields: spread `buildTacticalCombatPlaybackFields(outcome, <both drafts' ranged target hexes>)`.
   - `commitAiOnlyTacticalBeat({ preBattle, leadDraft, opposingDraft }): SubmitOrdersResult`. It logs at debug, then:
     - calls `applyAiOnlyTacticalBeat({ leadDraft, opposingDraft })`, and returns its failure as is;
     - calls `reconcileInfrastructureAfterTacticalBeat`;
     - builds the playback;
     - calls `captureTacticalBeatLossNote`;
     - returns `{ success: true, tacticalBattle: outcome.battle, tacticalResolutionPlayback, ...committedOpponentTacticalDraftFieldAfterConsume(false) }`;
     - catches, logs at error, and returns `{ success: false, reason: String(err) }`.
   - This module must not import from `humanTacticalDraftCommit.ts`, to avoid an import cycle.
4. In `commitHumanTacticalDraftOrders`, the AI-only branch keeps sanitizing both drafts with `sanitizedAiSeatDraft`, then returns `commitAiOnlyTacticalBeat({ preBattle, leadDraft, opposingDraft })`.
5. `humanTacticalDraftCommit.ts` must end under 600 lines. Check with `(Get-Content src/main/gameActions/humanTacticalDraftCommit.ts).Count`.
6. Tests in `src/main/gameActions/aiOnlyTacticalCommit.test.ts`. Call `tacticalDbFixtureRegisterDefaultAfterEach()` at the top, and use `twoAiBattleFixture`:
   - "an AI-only beat plays both seats' marches as opponent moves, lead first":
     - Copy the battle before the beat: `{ ...battle, subUnits: battle.subUnits.map((unit) => ({ ...unit })) }`. Pass that copy as `preBattle`. The beat's phases copy sub-units today, and the copy keeps this test honest if a later phase mutates the active snapshot.
     - With `legalStep` for each seat, call `applyAiOnlyTacticalBeat`, then `buildAiOnlyTacticalBeatPlayback` with that copy and the same drafts.
     - Expected: `humanMoves` is empty, and `opponentMoves` maps to `[leadStep.unitId, opposingStep.unitId]` in that order.
     - Each move's `fromH3Index` is the copied pre-beat cell, and each move's `toH3Index` equals that unit's stored cell. Those two cells differ.
   - "an AI-only commit returns melee playback, dice, and a tactical loss note for a contested cell":
     - Set up the contested cell as in the previous phase, then call `commitAiOnlyTacticalBeat` with two `emptyPlan()` drafts.
     - Expected: success, `tacticalResolutionPlayback.meleeCombatHexes` contains the cell, and `tacticalResolutionPlayback.meleeDiceRolls` is non-empty.
     - `getRecentTurnNotes` from [`src/main/gameDb/aiStateAccess.ts`](src/main/gameDb/aiStateAccess.ts), called for the lead seat and for the other AI seat with scope `'tactical'`, this battle id, and `beforeTurnNumber` 2, returns one row each. The beat stores the note at turn 1 because the snapshot's `tacticalTurnNumber` is now 2. `captureTurnLossNoteFromResolution` writes one row per active AI seat, including a beat with no removals.
7. Docs:
   - In [`doc/ux/resolution-playback.md`](doc/ux/resolution-playback.md), add a requirement. A beat of an AI-only battle plays back the same way as a human beat: both commanders' marches, fire, air strikes, melee, dice chips, and the turn-update toast. Name `commitAiOnlyTacticalBeat` in Code Entry Points, beside `readyTacticalCommit.ts`.
   - Read [`doc/combat-rules-v3.md`](doc/combat-rules-v3.md) §12.10, and [`doc/ai-commander-prompts/tactical-prompt.md`](doc/ai-commander-prompts/tactical-prompt.md) Recent Turn Notes. Fix any sentence that says or implies AI-only beats record no losses. If none does, change nothing.

Verify:

```powershell
npm run build:main
npx node --test dist/main/gameActions/aiOnlyTacticalCommit.test.js dist/main/tacticalBattle/aiOnlyTacticalBeat.test.js dist/main/tacticalBattle/tacticalPartiesSeats.test.js dist/main/openRouter/afterResolutionTacticalBeat.test.js dist/main/ipc/readyIpcResolutionMapping.test.js
```

Expected: all pass. Then run the full main suite to catch any human-path regression from the extraction:

```powershell
node scripts/run-main-node-tests.cjs
```

Expected: no failures.

### Phase 7: No deferred consult after the last AI-only beat

1. In [`src/main/main.ts`](src/main/main.ts), `ipcMain.handle(IPC_GAME.commitHumanTacticalDraftOrders, ...)`, leave the existing early return as it is. After it, and before `setPendingTacticalBeatConsult`, add a second return:

   ```ts
   if (result.tacticalBattle.aiOnlyEndReason != null) {
     logDebug('main commitHumanTacticalDraftOrders: no deferred consult after an ended AI-only beat', {
       battleId: result.tacticalBattle.battleId,
       aiOnlyEndReason: result.tacticalBattle.aiOnlyEndReason,
     });
     return result;
   }
   ```

   The first return has already required `result.tacticalBattle`, so this read is safe. Do not fold the end reason into that first condition. A failure, a missing playback, or a consult that is switched off would then log this message too. The returned result has no `tacticalPostBeatConsultDeferred`. The renderer already handles that, and `startCommanderPlanningIfAllowed` returns before starting a consult when `aiOnlyEndReason` is set.
   - No unit test. The handler is IPC wiring, and the downstream skips already have tests. The live check is in Phase 9.

Verify:

```powershell
npm run build:main
npm run lint
```

Expected: build and lint succeed.

### Phase 8: Battle cells count as visible in the tactical toast

Renderer only.

1. In [`readyTacticalCommit.ts`](src/renderer/gameplay/readyTacticalCommit.ts), `runTacticalReadyCommit`, inside the `if (playback && S.gameState && needsResolutionPlayback)` block, build the visible set as:

   ```ts
   const visibleHexes = new Set([
     ...deps.getVisibleHexSet(S.gameState),
     ...(S.tacticalBattleSnapshot?.tacticalChildH3Indexes ?? []),
   ]);
   ```

   The snapshot is already assigned from `commitResult.tacticalBattle` above this block. Add a one-line comment above the set saying that a battle has no fog, so every battle cell is visible to the turn report. This changes human battles as well as AI-only battles. Leave the strategic toast path alone.
2. Docs:
   - In [`doc/ux/resolution-playback.md`](doc/ux/resolution-playback.md), Strategic and Tactical Differences table, add a row for the turn-update toast. Strategic: units and hexes outside vision are reported as an unknown battle. Tactical: every battle cell counts as visible, so battle losses and engagements are never reported as an unknown battle.
   - Check [`doc/ux/notifications-and-feedback.md`](doc/ux/notifications-and-feedback.md) for a sentence this contradicts, and fix it if there is one.

Verify:

```powershell
npm run build:renderer
npm run check:renderer-types
npm run lint
```

Expected: all succeed.

### Phase 9: Full suite and live check

1. Run the full suite and the UI smoke:

```powershell
npm test
npm run ui:smoke -- --label ai-only-playback
```

Expected: `npm test` passes, and the smoke summary has `0 failed`.

2. Live check, for the user or the agent if it can drive the app:
   - Run `npm start`. Start an observe-only match with two AI sides on a regional map, and leave AI-Only Battles on Balanced. Check "Start the next turn when every commander is ready" and turn Run on. Play until an AI-only battle starts.
   - Every beat that has movement or combat shows marches, shot lines or air strikes, melee, dice chips, and a turn-update toast.
   - After the battle, check `debug.log` in the repo root:
     - No `non_opponent` march drops for the lead seat's own units.
     - `debug-last-tactical-prompt-1.txt` (the lead seat) begins with "You command" followed by the lead seat's own side, and its Unit Status table lists that seat's sub-units.
     - No `handleNotifyResolutionPlaybackComplete: no pending deferred consultation` ERROR.
     - The `restoreOpponentCallbackSubscriptionsAfterTacticalBattle` line shows `mode: "full_restore"` with a `leadSeatId`.
     - `applyAiOnlyTacticalBeat dropped march` lines name only units of the wrong owner or illegal cells.
   - Report anything that differs. Do not edit `debug.log` or the capture files.

## Regressions to leave intact

- Human battles:
  - Same playback fields and values.
  - Same consult seat (`opposingPartyId`).
  - Same consult policy.
  - Same callback stash and restore for one seat.
  - The tactical turn-update toast counts battle cells as visible. That applies to a human battle too. Do not special-case it back to strategic fog.
- A stash row saved before this change, with no `leadSeat`, restores its one seat.
- An AI-only beat keeps its phase order, RNG seed, idle streak, and end reasons.
- The Rules grid, Fog of war, and Auto-start AI rows in Game Options keep their layout. Deathmatch still disables Turn limit and shows Unlimited.
- `briefingSeatForBattle` keeps its signature and behavior for callers without a seat.

## Out of scope

- Writing tactical battle losses into strategic Recent Turn Notes.
- The ERROR lines from `keepOrdersOfOwnedUnits` for strategic orders that name units killed in a battle.
- Log label wording in `endTacticalBattleSessionCore`.
- The `HUMAN_SEAT_ID` air-loss heuristic in `buildTacticalCommitReadyResultForToast`.
- `projectTacticalSnapshotAfterValidatedOpponentOrders` and `applyValidatedOpponentTacticalOrders`, which no production code calls.
