# AI-only tactical battles execution plan

> **For the implementing agent:** Follow this plan from top to bottom, one phase at a time. Each phase is verifiable before the next one starts. When a check fails, stop and report the command, the actual output, and the expected output. Do not make a check pass by weakening the test or the smoke check. Do not commit or push. Do not implement anything this plan does not name. Phase names in this file stay in this file.

**Goal:** While no human seat is still playing, a match can fight one AI-versus-AI tactical battle per strategic turn. The Game Options popover chooses Balanced, Unbalanced, Random, or None. A saved match that has no stored choice keeps today's observe behavior.

**Architecture:** The choice is stored with the match. A pure function in `src/shared/` picks the hex from tactical sub-unit counts. The ready pipeline offers that hex only while observing. Both AI commanders are consulted once per beat, and the existing two-slice beat applies both plans. End conditions sit on top of that beat. The observe checkbox decides whether the human confirms Fight and each beat, or the battle runs through on its own.

**Tech stack:** TypeScript under `src/`, markup in `static/index.html`, chrome CSS, Node `node:test`, and the existing new-game UI smoke.

## Locked decisions

- The control lives in the Game Options popover, Victory section, in [`static/index.html`](static/index.html) (`#new-game-options-popover`). It is not the disabled Settings button.
- Visible label: `AI-Only Battles`. Element id: `new-game-ai-only-battles-select`. Stored key: `ai_only_battles`. Values: `balanced`, `unbalanced`, `random`, `none`. Visible options: Balanced, Unbalanced, Random, None.
- A new game defaults to Balanced. [`resetNewGameVictory`](src/renderer/gameplay/newGameVictoryUi.ts) sets the select back to Balanced whenever it resets the Rule control to Deathmatch. Changing the select does not rewrite a match that is already running. The value is sent only when Start game or New game succeeds.
- Two parsers, and they are not the same. `aiOnlyBattlesForRequest` is for a start payload: omitted or unknown stores `balanced`. `aiOnlyBattlesFromStored` is for `game_config`: a missing row or an unknown string is `none`, so an old save does not start fighting.
- The setting is a field on the match snapshot, beside `victory`, named `aiOnlyBattles`. It is not a member of `VictorySettings`. It is not a client-only checkbox like Auto-start AI.
- While any human seat is still active, the setting changes nothing. Offer tactical battles, the tactical battles list, and human-versus-one-other battles stay as they are. The pipeline already computes `observing` as `human == null || !isSeatActive(human)` in [`readyStrategicResolutionPipeline.ts`](src/main/gameActions/readyStrategicResolutionPipeline.ts). Use that boolean. Do not add a second definition.
- While observing, ignore the Offer tactical battles checkbox. None resolves every melee on the world map. Balanced, Unbalanced, and Random may offer one battle.
- A candidate hex has exactly two owners, and both are active AI seats (`isAiSeatId` and `isSeatActive`). A hex that includes a human, Neutral, a knocked-out seat, or three or more sides stays on the world map. Count every parent on the hex with the weight table below. Do not parse the dialog's unit-summary string, and do not start a battle snapshot just to count.
- The engine can place a battle only for exactly two non-neutral owners. Today [`computeTacticalBattleSnapshot`](src/main/tacticalBattle/computeTacticalBattleSnapshot.ts) also requires the human seat. A later phase removes that human requirement. A human plus exactly one other owner still places as it does today.
- `leadPartyId` is set only on an AI-only battle, and it is the AI seat with the lower `seatOrder` (a tie breaks to `localeCompare` on the seat id). `opposingPartyId` on that battle is the other AI seat. On a human battle, leave `opposingPartyId` as the non-human owner and omit `leadPartyId`. Setting `opposingPartyId` from seat order on a human battle would point it at the human when the human's `seatOrder` is higher, and opponent planning would consult the wrong seat.
- Equal means tactical sub-unit counts: infantry 8, armor 4, air 3, naval 4, missile 1, anything else 0. Those are the counts [`tacticalSubUnitCountForStrategicUnitType`](src/main/tacticalBattle/computeTacticalBattleSnapshot.ts) already returns. Move the table into `src/shared/tacticalSubUnitCounts.ts`. The main function stays exported, logs as it does now, and returns the shared count.
- Ratio is the smaller count divided by the larger. A larger count of 0 scores 0. Balanced picks the highest ratio. Unbalanced picks the lowest ratio. A tie breaks to the smaller absolute gap, then the lower hex id (`localeCompare`).
- The scoring function still accepts more than two sides, and tests cover it. For Balanced, compare only the two largest counts (a count tie breaks to the lower owner id). For Unbalanced, compare only the least-equal pair (lowest ratio, then smaller absolute gap, then the owner-id pair). The live caller never passes those hexes.
- Random does not draw from the combat RNG. That draw would move later melee dice. Hash the string `` `${seed >>> 0}|${turnNumber}|${sortedHexIds.join(',')}` `` with the same FNV-1a constants as [`tacticalSubUnitLayoutSeed32`](src/main/tacticalBattle/tacticalMeleeApply.ts) (offset `2166136261`, prime `16777619`). Do not call that function. Index is `(hash >>> 0) % count` into the hex ids sorted by `localeCompare`. The live caller passes [`getGameSeed`](src/main/gameDb.ts), the stored `game_seed` row. It does not pass the derived combat root (`gameSeed + turnNumber * 7919`) and it does not call the combat `next` function.
- One battle per strategic turn. Every other melee hex resolves on the world map. Fight still skips strategic melee on the chosen hex for that turn, which is the existing Fight contract. Do not run strategic melee on that hex again after the battle.
- `exitBattle` is a boolean on the tactical order envelope only when the battle has `leadPartyId`. Strategic envelopes omit it. A human-versus-AI battle omits it. The parser treats missing or non-boolean as false and does not fail the parse. Orders in the same reply still resolve for that beat. Prompt sentence, used as one coaching bullet and in the envelope contract when the gate is on: `Set exitBattle to true when your side has an overwhelming numerical advantage, or when you have no order you can legally give. Set it to false otherwise. Orders in this reply still resolve for this beat.`
- Each AI seat is consulted at most once per beat. `startTacticalPlanning` launches both AI parties when `leadPartyId` is set, and still launches only `opposingPartyId` on a human battle. The post-beat consult also runs for both AI parties on an AI-only battle, and still for `opposingPartyId` alone on a human battle. A seat that already has a stored tactical draft with at least one order for this `battleId` is not launched again. An empty draft may be replaced. That is the same empty-plan prefetch human battles use, extended so the second seat is not left without a plan and the first seat is not called twice.
- After each beat, in this order: a party with no sub-units left ends the battle; then three completed beats in a row where every AI order was missing or dropped; then both AI seats returned `exitBattle: true` on this same beat and at least five beats have been completed. Flags on beat 4 do not end the battle. One seat's flag without the other's does not end it. The idle streak does not wait for five beats. A beat that applies any order for either seat resets the streak. Store `idleBeatStreak` on the snapshot. A missing value loads as 0.
- `tacticalTurnNumber` starts at 1 and the commit increments it at the end of the beat. Five completed beats means the post-commit number is at least 6.
- [`getTacticalAnnihilationOutcome`](src/shared/tacticalAnnihilation.ts) treats every non-human sub-unit as one opponent, so an AI-only roster is already `human_loss`. [`afterTacticalBeatResolution`](src/main/openRouter/afterResolution.ts) would then skip the model, and the dialog would say "You lose." Do not use that helper when `leadPartyId` is set. Add a two-party helper. Leave the human helper and its current results alone.
- Annihilation still deletes a strategic parent when its last sub-unit dies, through the existing `syncStrategicUnitsDbWhenTacticalParentsEliminated` path. Do not add a second deleter. The less-than-half pass does not run when a party is already gone. That is [`doc/combat-rules-v3.md`](doc/combat-rules-v3.md) §12.8.
- The beat writes `aiOnlyEndReason` on the snapshot (`elimination`, `mutual`, `idle`, or `exit`) and leaves the session active. A missing value means the battle continues. Playback of that beat uses the snapshot. [`tacticalMaybeScheduleAnnihilationExit`](src/renderer/tactical/tacticalExitFlow.ts) is the moment a human battle opens its dialog, after playback, once planning has resumed. AI-only exit happens at that same moment. Ending the session inside the beat would drop the snapshot before the last beat can play. The header Exit Battle control does not use `aiOnlyEndReason`. Its sentence is `The battle was left.`
- [`game:endTacticalBattle`](src/main/main.ts) always calls `endTacticalBattleSessionForHumanVoluntaryExitBailout`. That function returns without the less-than-half pass when the roster has no human sub-unit, then still clears the session. An AI-only idle, commander exit, or header Exit Battle would keep every parent that is under half strength. When the active battle has `leadPartyId`, that IPC calls `endTacticalBattleSessionForTwoPartyVoluntaryExit` instead. That function uses the same threshold and the same survivor loop. It runs the pass only when both parties still have a sub-unit, then clears the session. When either party is already gone, it clears the session and skips the pass. When `leadPartyId` is absent, the IPC stays on the human function.
- Leave [`shouldEndTacticalBattleForAnnihilation`](src/shared/tacticalAnnihilation.ts) on `getTacticalAnnihilationOutcome`. Its tests treat a lone non-human sub-unit as terminal. Callers that need an AI-only roster use `getTwoPartyAnnihilationOutcome` and pass the two party ids.
- Idle, `exitBattle`, and the header Exit Battle control are voluntary exits. They use the same strict less-than-half rule as a human Exit Battle (`survivors * 2 < baseline` destroys the parent; exact half survives). Do not change the human function's threshold or its skip when one side is already gone. Human Exit Battle still calls `endTacticalBattleSessionForHumanVoluntaryExitBailout`.
- Do not relabel an AI seat as `human` to reuse the human order path.
- Copy the phase order in [`applyHumanTacticalDraftBeatInStrategicOrder`](src/main/tacticalBattle/tacticalBattleSession.ts). The lower-`seatOrder` seat occupies the human slice's place in that order (embark after movement). The other seat occupies the opponent slice's place (embark before air). That is the phase position only. Every player argument is that seat's real id. Do not pass `HUMAN_SEAT_ID` for an AI unit. Do not reorder the phases.
- An illegal row is dropped and logged. It does not reject the beat. `humanTacticalMarchValidationFailure` rejects the whole beat and rejects non-human units. Do not call it for an AI-only beat. The opponent validators reject the human seat and Neutral, and they accept any other owner, so both AI drafts can use them. Movement projection must still run once per seat with that seat's id, because the outcome helper ignores a unit of the other owner.
- Automatic means the observe checkbox "Start the next turn when every commander is ready" is checked. Semi-automatic means it is unchecked. Watch the rest already checks it.
- Automatic: do not open the tactical battles list. Fight the chosen hex. Commit a beat only when playback is finished, no deferred consult is pending, no commander is planning, a planning start is not still settling, and the snapshot has no AI-only end reason. The first four guards already exist on [`autoAdvanceReady`](src/renderer/gameplay/observeChrome.ts). Add the end-reason guard. Without it, a beat that already decided to end can be committed again when that beat had nothing to animate. Leave the battle without a result dialog. Do not call `runReadyAfterExit`. After the snapshot is cleared, the existing `maybeObserveAutoAdvance` press is the one strategic Ready. Calling both would advance two strategic turns.
- Semi-automatic: open the tactical battles list with the chosen hex selected and scrolled into view. Only that hex can be fought. Fight and Ignore stay. Escape and the backdrop are Ignore. After Fight, the human clicks Ready for each beat. When the battle ends, a dialog names the result and its button reads Ok. Ok returns to the strategic map and does not press Ready. Escape does not close that dialog. The player presses Ok, matching the annihilation dialog.
- Result sentences: one side left, `{full home name} wins the battle.`; both wiped, `All units destroyed.`; both commanders exited, `The commanders left the battle.`; three idle beats, `The battle ended with no orders left to carry out.`; the header Exit Battle control, `The battle was left.` A missing home name uses the seat id.
- Reuse `#tactical-annihilation-overlay`. A human battle still says "You win!", "You lose.", or "All units destroyed." and the button still says Exit Battle. An AI-only battle uses the sentences above and Ok. Keep `TacticalAnnihilationOutcomeKind` as `human_win`, `human_loss`, and `mutual`. Store the AI-only sentence on its own renderer field. The message function's fall-through is "All units destroyed.", so a new member of that kind would show the wrong sentence. Every existing `tacticalAnnihilationOutcomeDialog != null` guard must also treat the AI-only sentence as open: Ready, New game, commander start, and the header Exit Battle control.
- Header Exit Battle stays available. In semi-automatic it opens the Ok dialog, runs the less-than-half pass when both parties still have a sub-unit, and does not press Ready. In automatic it leaves the same way, does not show the dialog, does not clear the checkbox, and lets `maybeObserveAutoAdvance` press the strategic Ready once.
- The force bar in an AI-only battle shows the `leadPartyId` side on the left and `opposingPartyId` on the right, each with its short name and sub-unit count. A human battle keeps [`countBattleForces`](src/shared/battleForceCounts.ts).

## Global constraints

- Follow `AGENTS.md` and `.cursor/rules/`. Never commit or push.
- No plan, phase, or workflow identifiers in code, comments, tests, `doc/`, or configuration. The result strings `elimination`, `mutual`, `idle`, and `exit` are match results, and they may appear in code.
- Orienting comments on every new function, type, and module-level constant, in the style of [`src/shared/consoleTabState.ts`](src/shared/consoleTabState.ts).
- Public main-process methods log at debug on entry. Caught exceptions log at error. Getters that do not change state log at trace. Use the existing logger. Shared modules that do not already import it stay free of it, as [`src/shared/victoryRules.ts`](src/shared/victoryRules.ts) does. The main wrapper around the moved sub-unit count keeps its current log.
- Tests cover the happy path and the essential failure of each new contract. Do not test markup constructors or a controller that only forwards a call.
- Do not edit `static/renderer.js` by hand. Regenerate it with `npm run build:renderer` when a phase changes renderer TypeScript.
- Shell is Windows PowerShell at `F:\Projects\Personal\agent-wars-public`. Do not chain commands with `&&`. A PowerShell code block in this plan is one command per line.
- Keep each file's existing line endings.
- `npm test` runs lint, the naming check, renderer typecheck, and the compiled tests. A new `*.test.ts` beside a `src/shared/` module is compiled by `npm run build:main`. Renderer modules are not in that runner. Put unit-tested logic in `src/shared/` or in an existing `src/main/` test.
- Desired file size is 600 lines and the hard limit is 1000. [`computeTacticalBattleSnapshot.ts`](src/main/tacticalBattle/computeTacticalBattleSnapshot.ts) and [`humanTacticalDraftCommit.ts`](src/main/gameActions/humanTacticalDraftCommit.ts) are already large. Put new behavior in a new file and call it.
- Desired argument count is 6 and the hard limit is 10. Pass one object when a function would cross 6.
- Update every current `doc/` page this behavior makes wrong, in the same phase as the code. Leave historical docs alone. Prompt wording follows the builders under `src/main/openRouter/`. Update [`doc/ai-commander-prompts/`](doc/ai-commander-prompts/) when a builder sentence changes.
- `--label` on `npm run ui:smoke` names the output folder. It does not filter the checks. The run still executes every scene.

## Files

- Create: [`src/shared/aiOnlyBattles.ts`](src/shared/aiOnlyBattles.ts) and [`src/shared/aiOnlyBattles.test.ts`](src/shared/aiOnlyBattles.test.ts)
- Create: [`src/shared/tacticalSubUnitCounts.ts`](src/shared/tacticalSubUnitCounts.ts) and [`src/shared/tacticalSubUnitCounts.test.ts`](src/shared/tacticalSubUnitCounts.test.ts)
- Modify: [`src/shared/tacticalAnnihilation.ts`](src/shared/tacticalAnnihilation.ts). Add the new cases to [`src/main/tacticalBattle/tacticalAnnihilation.test.ts`](src/main/tacticalBattle/tacticalAnnihilation.test.ts). There is no `src/shared/tacticalAnnihilation.test.ts`.
- Create: [`src/shared/battleForceCounts.test.ts`](src/shared/battleForceCounts.test.ts) for the new two-party helper. [`src/shared/battleForceCounts.ts`](src/shared/battleForceCounts.ts) has no test today.
- Modify: [`static/index.html`](static/index.html), [`static/newGameChrome.css`](static/newGameChrome.css), [`src/renderer/gameplay/newGameVictoryUi.ts`](src/renderer/gameplay/newGameVictoryUi.ts), [`src/renderer/chrome/controlTooltipText.ts`](src/renderer/chrome/controlTooltipText.ts)
- Modify: [`src/shared/ipc/ordersTypes.ts`](src/shared/ipc/ordersTypes.ts) (`aiOnlyBattles` beside `victoryRule`), [`src/renderer/gameplay/newGameSidesUi.ts`](src/renderer/gameplay/newGameSidesUi.ts) (`readNewGameSeatsStart`), [`src/renderer/gameplay/newGame.ts`](src/renderer/gameplay/newGame.ts) (the start payload), [`src/main/gameDb/resetGame.ts`](src/main/gameDb/resetGame.ts), [`src/main/gameDb/gameConfigKv.ts`](src/main/gameDb/gameConfigKv.ts), [`src/main/gameDb/fogState.ts`](src/main/gameDb/fogState.ts) (the snapshot object that already sets `victory`), [`src/shared/ipc/gameStateTypes.ts`](src/shared/ipc/gameStateTypes.ts)
- Modify: [`src/main/gameActions/meleeInterceptCandidates.ts`](src/main/gameActions/meleeInterceptCandidates.ts), [`src/main/gameActions/readyStrategicResolutionPipeline.ts`](src/main/gameActions/readyStrategicResolutionPipeline.ts), [`src/shared/ipc/readyTypes.ts`](src/shared/ipc/readyTypes.ts) (`aiOnlyBattleH3Index`), and [`src/main/gameIpcHandlers.ts`](src/main/gameIpcHandlers.ts) (the `awaitingMeleeDecision` return copies that field)
- Modify: [`src/main/tacticalBattle/computeTacticalBattleSnapshot.ts`](src/main/tacticalBattle/computeTacticalBattleSnapshot.ts) and [`src/shared/tacticalBattleTypes.ts`](src/shared/tacticalBattleTypes.ts)
- Modify: [`src/main/openRouter/promptSpec/envelopeContract.ts`](src/main/openRouter/promptSpec/envelopeContract.ts), [`envelopeJsonSchema.ts`](src/main/openRouter/promptSpec/envelopeJsonSchema.ts), [`coachingGates.ts`](src/main/openRouter/promptSpec/coachingGates.ts), [`coachingTextTactical.ts`](src/main/openRouter/promptSpec/coachingTextTactical.ts), [`openRouterBuildSystemPrompt.ts`](src/main/openRouter/openRouterBuildSystemPrompt.ts), [`requestOrdersFlow.ts`](src/main/openRouter/requestOrdersFlow.ts), [`orderResponseParsing.ts`](src/main/openRouter/orderResponseParsing.ts)
- Modify: [`src/main/openRouter/commanderPool.ts`](src/main/openRouter/commanderPool.ts) and [`src/main/ipc/readyIpcResolutionMapping.ts`](src/main/ipc/readyIpcResolutionMapping.ts) (`runEventDrivenAfterTacticalBeatConsultation`)
- Create: [`src/main/tacticalBattle/aiOnlyTacticalBeat.ts`](src/main/tacticalBattle/aiOnlyTacticalBeat.ts) and its test
- Modify: [`src/main/main.ts`](src/main/main.ts) (`game:endTacticalBattle` branches when `leadPartyId` is set)
- Modify: [`src/renderer/gameplay/meleeInterceptModal.ts`](src/renderer/gameplay/meleeInterceptModal.ts), [`readyHandler.ts`](src/renderer/gameplay/readyHandler.ts), [`observeChrome.ts`](src/renderer/gameplay/observeChrome.ts), [`tacticalAnnihilationDialog.ts`](src/renderer/tactical/tacticalAnnihilationDialog.ts), [`tacticalExitFlow.ts`](src/renderer/tactical/tacticalExitFlow.ts), [`battleHeader.ts`](src/renderer/chrome/battleHeader.ts)
- Docs, in the phase that changes the behavior: [`doc/ux/new-game-dialog.md`](doc/ux/new-game-dialog.md), [`doc/ux/control-tooltips.md`](doc/ux/control-tooltips.md), [`doc/ux/modes-and-transitions.md`](doc/ux/modes-and-transitions.md), [`doc/ux/tactical-battles-list.md`](doc/ux/tactical-battles-list.md), [`doc/ux/tactical-battle-controls.md`](doc/ux/tactical-battle-controls.md), [`doc/ux/game-menu.md`](doc/ux/game-menu.md), [`doc/ux/top-bar.md`](doc/ux/top-bar.md), [`doc/ux/console.md`](doc/ux/console.md), [`doc/ux/input-map.md`](doc/ux/input-map.md), [`doc/ui-style-guide.md`](doc/ui-style-guide.md), [`doc/how-to-play.md`](doc/how-to-play.md), [`doc/combat-rules-v3.md`](doc/combat-rules-v3.md) §12.8 and §12.10, and the tactical pages named in [`doc/ai-commander-prompts/README.md`](doc/ai-commander-prompts/README.md)

---

### Phase 1: Game Options control and stored setting

Independent of battles. Verified by the parse tests and the new-game smoke check.

In Victory, put Rule and Turn limit on one row. Each half is a label plus a select. The two labels are the same width. The two selects are the same width. The label column is wide enough for `AI-Only Battles`, which is longer than `Turn limit`. Under that row, `AI-Only Battles` and its select match the Rule label and the Rule select, and the right half of that row stays empty. Deathmatch still disables Turn limit and shows Unlimited. The closed Rule select may truncate `Most city hexes at turn limit`. The open list shows the full label. Keep the popover at 400 px.

Tooltip, copied into the markup, [`controlTooltipText.ts`](src/renderer/chrome/controlTooltipText.ts), and [`doc/ux/control-tooltips.md`](doc/ux/control-tooltips.md): `Balanced fights the battle where the two sides are closest in numbers. Unbalanced fights the least equal battle. Random picks one battle. None keeps those battles on the world map. This applies only while you are observing.`

Add `aiOnlyBattles` beside `victoryRule` on the new-game IPC type. [`readNewGameSeatsStart`](src/renderer/gameplay/newGameSidesUi.ts) reads the select. [`newGame.ts`](src/renderer/gameplay/newGame.ts) sends it. [`resetGame`](src/main/gameDb/resetGame.ts) writes `ai_only_battles` through `aiOnlyBattlesForRequest`. [`readVictorySettings`](src/main/gameDb/gameConfigKv.ts) gains a neighbor `readAiOnlyBattles` that uses `aiOnlyBattlesFromStored` and logs at trace. Put the value on the snapshot next to `victory`.

`resetNewGameVictory` selects Balanced. Update the new-game dialog, the style-guide Game Options sentence, and the how-to-play sentence that lists the victory controls.

In [`scripts/ui-smoke/ui-smoke-new-game-checks.cjs`](scripts/ui-smoke/ui-smoke-new-game-checks.cjs), extend `new-game-options-popover` so Rule and Turn limit share a y, the AI-Only select is below them, and its left and width match the Rule select. Add `#new-game-ai-only-battles-select` and `#new-game-turn-limit-select` to that check's `needs`.

Tests in `aiOnlyBattles.test.ts`: a start request with no value, or an unknown value, is `balanced`. A missing stored row, or an unknown stored string, is `none`.

Verify:

```powershell
npm run build:main
npx node --test dist/shared/aiOnlyBattles.test.js
npm run build:renderer
npm run ui:smoke -- --label ai-only-options
```

Expected: the parse tests pass, `new-game-options-popover` is `PASS`, and the smoke summary has `0 failed`. The smoke command runs every scene. Do not click in the smoke windows.

### Phase 2: Counts and battle selection

No Ready wiring yet.

Move the weight table into [`src/shared/tacticalSubUnitCounts.ts`](src/shared/tacticalSubUnitCounts.ts). [`tacticalSubUnitCountForStrategicUnitType`](src/main/tacticalBattle/computeTacticalBattleSnapshot.ts) delegates to it and keeps its log and its export, so [`computeTacticalBattleSnapshot.test.ts`](src/main/tacticalBattle/computeTacticalBattleSnapshot.test.ts) still imports it from that module. Add `tacticalSubUnitCountForOwner(units, ownerId)` in the shared module. It sums the weight of each parent whose `player` is that owner.

In the same `aiOnlyBattles.ts` file, `selectAiOnlyBattle` takes one object: the mode, the match seed, the turn number, and rows of `{ h3Index, sides: { ownerId, subUnitCount }[] }`. None returns null. An empty list returns null. Balanced, Unbalanced, and Random follow the locked rules.

Tests: 8 versus 8 beats 8 versus 16 on Balanced. 100 versus 102 beats 3 versus 5 on Balanced, because the ratio is closer to 1. Unbalanced picks 3 versus 5 over 100 versus 102. Equal ratios break on the absolute gap, then the hex id. Three synthetic sides use only the two largest, or only the least-equal pair. Random is stable for the same seed and changes when the seed changes. The weight helper returns 8 for one infantry and 0 for an unknown type.

Verify:

```powershell
npm run build:main
npx node --test dist/shared/aiOnlyBattles.test.js dist/shared/tacticalSubUnitCounts.test.js dist/main/tacticalBattle/computeTacticalBattleSnapshot.test.js
```

Expected: PASS. Add `tacticalSubUnitCounts.test.ts` only for the owner sum. The existing type-to-count tests stay where they are.

### Phase 3: Two-party end and force counts

Pure helpers and tests. Do not wire them into the ready path or the dialog yet. A snapshot cannot be an AI-only battle until the next phase, so a call site here would have nothing to read.

Add `getTwoPartyAnnihilationOutcome(subUnits, partyA, partyB)`. Null while both parties still have a sub-unit. One party left names that owner. Both at zero is mutual. A sub-unit of any other owner does not count. Keep `getTacticalAnnihilationOutcome` for a human battle.

Add `countTwoPartyForces(subUnits, leftOwnerId, rightOwnerId)` returning both counts and the left share. Do not change `countBattleForces`.

Tests, added to [`tacticalAnnihilation.test.ts`](src/main/tacticalBattle/tacticalAnnihilation.test.ts) and the new force-count test: two AI owners with units is not terminal; wiping one names that winner; wiping both is mutual; a human-versus-opponent roster still returns `human_win`, `human_loss`, and `mutual` from the old helper.

Verify:

```powershell
npm run build:main
npx node --test dist/main/tacticalBattle/tacticalAnnihilation.test.js dist/shared/battleForceCounts.test.js
```

Expected: PASS.

### Phase 4: Place a two-AI battle

Depends on Phase 3. Do not offer the battle from Ready yet.

On [`TacticalBattleSnapshot`](src/shared/tacticalBattleTypes.ts), add optional `leadPartyId` and optional `idleBeatStreak`. A loaded snapshot that lacks them is a human battle with streak 0. The persistence writer stores the snapshot object. Do not add a whitelist that drops the new fields. Search the loader and keep a snapshot that lacks them.

In [`computeTacticalBattleSnapshot`](src/main/tacticalBattle/computeTacticalBattleSnapshot.ts), accept exactly two owners when neither is Neutral. Reject every other count with the existing reason `Hex is not contested by exactly two sides.` A human plus exactly one other owner still succeeds, `opposingPartyId` stays the non-human owner, and `leadPartyId` is omitted. For two AI owners, `placingSide` is the parent's own owner. The defender is the hex controller when that controller is one of the two owners. Set `leadPartyId` and `opposingPartyId` from seat order, as in the locked decisions. `idleBeatStreak` starts at 0.

Wire `getTwoPartyAnnihilationOutcome` into the annihilation skip in [`afterTacticalBeatResolution`](src/main/openRouter/afterResolution.ts) only when `leadPartyId` is set. A human battle still uses `getTacticalAnnihilationOutcome`. This skip is what stops an AI-only roster from skipping the model. Do not change [`tacticalMaybeScheduleAnnihilationExit`](src/renderer/tactical/tacticalExitFlow.ts) in this phase. That function takes `TacticalAnnihilationOutcomeKind` and opens the human dialog. Phase 7 branches it. Ready does not start these battles yet.

[`battleHeader.ts`](src/renderer/chrome/battleHeader.ts) uses `countTwoPartyForces` when `leadPartyId` is set. Update the force-bar sentence in [`doc/ux/top-bar.md`](doc/ux/top-bar.md).

Extend [`computeTacticalBattleSnapshotDb.test.ts`](src/main/tacticalBattle/computeTacticalBattleSnapshotDb.test.ts) with one success case for two AI owners and one failure for three owners. The existing human-plus-one case must still pass. Assert `leadPartyId` is absent on that human case.

Verify:

```powershell
npm run build:main
npx node --test dist/main/tacticalBattle/computeTacticalBattleSnapshotDb.test.js dist/main/tacticalBattle/tacticalAnnihilation.test.js
```

Expected: PASS, including the previous human case.

### Phase 5: exitBattle on the AI-only tactical envelope

Depends on Phase 4, because the gate is `leadPartyId != null`. The flag is parsed and stored. It does not end a battle yet.

Add `includeExitBattle` to `EnvelopeGates` and the same boolean to `CoachingGates`. Set both from `tacticalBattle.leadPartyId != null` in [`requestOrdersFlow.ts`](src/main/openRouter/requestOrdersFlow.ts) and [`openRouterBuildSystemPrompt.ts`](src/main/openRouter/openRouterBuildSystemPrompt.ts). If the system-prompt builder cannot see the battle, pass the boolean in from the caller that has the battle. Do not default it to true.

[`envelopeFieldsForGates`](src/main/openRouter/promptSpec/envelopeContract.ts) includes `exitBattle` after `orders` and before `airStrikes` when the gate is on. The filter's final `return false` would drop a new field that has no branch, so add the branch. [`envelopeFieldSchema`](src/main/openRouter/promptSpec/envelopeJsonSchema.ts) throws on an unknown field, so add a boolean case. [`buildOrdersEnvelopeResponseFormat`](src/main/openRouter/promptSpec/envelopeJsonSchema.ts) hardcodes `required` as `message`, `strategy`, and `orders`. Add `exitBattle` to that array only when the gate is on. The repair example in `buildRepairSchemaText` has no branch for a new field, so add `exitBattle: false` there under the same gate. Strategic and human-versus-AI tactical schemas omit the key. [`orderResponseParsing.ts`](src/main/openRouter/orderResponseParsing.ts) reads a boolean `true` as true and everything else as false. Put optional `exitBattle?: boolean` on [`TacticalOpponentPlanPayload`](src/shared/ipc/consultationPushTypes.ts). Readers treat a missing value as false, so existing plan literals and saved plans keep compiling. Gate object literals that construct the full `EnvelopeGates` or `CoachingGates` value must set `includeExitBattle` to false, except the AI-only test.

Add the prompt sentence as one tactical coaching bullet only when the coaching gate is on. A human tactical prompt does not gain the bullet, and a test that asserts the human bullet list keeps that list. Update [`doc/ai-commander-prompts/tactical-prompt.md`](doc/ai-commander-prompts/tactical-prompt.md), [`variants.md`](doc/ai-commander-prompts/variants.md), and [`assembly-contract.md`](doc/ai-commander-prompts/assembly-contract.md) so the envelope list matches the builder. If [`consultationText.ts`](src/main/openRouter/promptSpec/consultationText.ts) lists fields by hand, add the key there under the same gate. If it prints `envelopeFieldsForGates`, leave it.

Schema tests in [`envelopeJsonSchema.test.ts`](src/main/openRouter/promptSpec/envelopeJsonSchema.test.ts) and [`envelopeContract.test.ts`](src/main/openRouter/promptSpec/envelopeContract.test.ts): the key is present and required for the AI-only tactical gate, and absent for strategic and for a human tactical gate. A coaching test asserts the sentence is present only when the gate is on. When a test fails because it lists the old field order, update that assertion in this phase.

Verify:

```powershell
npm run build:main
npx node --test dist/main/openRouter/promptSpec/envelopeJsonSchema.test.js dist/main/openRouter/promptSpec/envelopeContract.test.js dist/main/openRouter/promptContracts.test.js
```

Expected: PASS.

### Phase 6: Both commanders plan, one beat applies both, then the battle can end

Depends on Phases 3, 4, and 5. Leave the human Ready beat's results unchanged.

[`startTacticalPlanning`](src/main/openRouter/commanderPool.ts) launches `leadPartyId` and `opposingPartyId` when `leadPartyId` is set, and skips a seat that already has a non-empty draft for this battle. A human battle still launches only the opposing AI, with today's launch rules. [`runEventDrivenAfterTacticalBeatConsultation`](src/main/ipc/readyIpcResolutionMapping.ts) consults both AI seats when `leadPartyId` is set, and still consults only `opposingPartyId` on a human battle. [`takeTacticalDraft`](src/main/openRouter/commanderPool.ts) already stores one plan per seat and battle. The new beat takes each AI seat once. The commit does not take them again. The single `tacticalOpponentPlan` field on the human commit result stays the opposing seat's plan.

Add [`aiOnlyTacticalBeat.ts`](src/main/tacticalBattle/aiOnlyTacticalBeat.ts). Follow the locked phase order. Where a public helper hardcodes `HUMAN_SEAT_ID` and a private helper already takes a player, add a player-parameterized export and keep the human export as a one-line delegate. That includes movement projection beside [`projectTacticalSnapshotAfterHumanMovementOrders`](src/main/tacticalBattle/tacticalMovementApply.ts). Merged air and ranged use scope `mergedHumanThenOpponent`, with both drafts in the merged arrays. Melee stays [`applyTacticalMeleeAfterSupportOrders`](src/main/tacticalBattle/tacticalMeleeApply.ts). If that melee path ignores a side that is not the human seat, stop and report the function. Do not edit the human beat so that it accepts AI unit ids.

[`commitHumanTacticalDraftOrders`](src/main/gameActions/humanTacticalDraftCommit.ts) takes one draft, from `opposingPartyId` only, and then calls `validateHumanTacticalMarchOrders`, which rejects a non-human unit. When `leadPartyId` is set, branch before that validation and before that single `takeTacticalDraft`. Take each AI seat's draft once, sanitize each the same way the human commit sanitizes its one opponent draft, and call the new beat. Do not call `applyHumanTacticalDraftBeatInStrategicOrder`. When `leadPartyId` is absent, that function stays as it is, including the one take. The branch in the commit file is a short call. The two-draft work stays in the new beat file. That commit file is already past the desired size.

The new beat spreads the previous snapshot when it builds the next one, then sets `idleBeatStreak`, `aiOnlyEndReason`, and `tacticalTurnNumber: previous + 1`, then `commitActiveTacticalBattle`. A fresh object that copies only some fields would drop `leadPartyId`, and the next beat would take the human path. Add optional `aiOnlyEndReason` on `TacticalBattleSnapshot` in this phase. Persistence writes the snapshot as one JSON object, so a new field survives without a column list. Count applied orders after drops. Apply the end checks in the locked order. Write the reason and leave the session up. Skip the post-beat model call when that reason is set, including idle and exit, where both parties still have sub-units. Do not call `endTacticalBattleSession` or `endTacticalBattleSessionForTwoPartyVoluntaryExit` from the beat. The renderer exits after playback, in Phase 7, through `game:endTacticalBattle`.

Ferry application in [`tacticalStrategicOrderPhases.ts`](src/main/tacticalBattle/tacticalStrategicOrderPhases.ts) skips a non-human air unit unless `tacticalGuardOpponentAirSubUnitForFerry` accepts that unit for the player argument. Pass the seat's real id. [`applyMovementOrdersToPlanState`](src/main/tacticalBattle/tacticalPlanStateMovement.ts) already treats every non-human unit as the opponent debark case, and both AI seats are non-human, so leave it. [`tacticalSealiftStackState.ts`](src/main/tacticalBattle/tacticalSealiftStackState.ts) filters the human seat for the human sealift UI. Do not retarget it. The tactical briefing already takes the consulted seat. Do not rebuild it as the one non-human party.

Tests beside the beat file: both drafts move their own sub-units in one beat; an illegal row is dropped and the other seat's order still applies; three idle beats set `idle` and the session is still active; both flags on completed beat 4 do not set a reason; one flag on beat 5 does not set a reason; both flags on completed beat 5 set `exit`; a wiped side sets `elimination` even when the flags are also true. In [`tacticalBattleSession.test.ts`](src/main/tacticalBattle/tacticalBattleSession.test.ts), the human less-than-half cases still pass, and the human function still skips a roster with no human sub-unit. Add one `endTacticalBattleSessionForTwoPartyVoluntaryExit` case: two AI parties remain, one parent is under half, and that parent is removed. Add one case: one AI party is already gone, and the pass removes nothing more.

Verify:

```powershell
npm run build:main
npx node --test dist/main/tacticalBattle/aiOnlyTacticalBeat.test.js dist/main/tacticalBattle/tacticalBattleSession.test.js
```

Expected: PASS.

### Phase 7: Offer, play, and leave the battle while observing

Depends on Phases 2, 4, and 6. This is the player-visible loop.

In [`readyStrategicResolutionPipeline.ts`](src/main/gameActions/readyStrategicResolutionPipeline.ts), observing today sets `seenHexes` to `[]` and never pauses, then falls through into strategic melee. When `readAiOnlyBattles` is not `none` and `observing` is true, build rows from `rawMeleeHexes`. Use every contested hex, not the View-as seat's fog. Leave [`buildMeleeInterceptCandidateRows`](src/main/gameActions/meleeInterceptCandidates.ts) as it is. Its `tacticalEligible` flag stays true only for the human seat plus exactly one other owner, and the existing test still expects a two-AI hex to be false. After that builder, while observing, mark a row eligible only when it has exactly two active AI seats and [`filterMeleeCandidateHexesWithTacticalEntry`](src/main/gameActions/meleeInterceptCandidates.ts) can place it. Build each side's `subUnitCount` with `tacticalSubUnitCountForOwner`. Run `selectAiOnlyBattle` with `getGameSeed()` and the turn number. Only the chosen hex stays `tacticalEligible`. Other rows stay in the world-map section. Pause with the same `setMeleeInterceptPendingSnapshot` the human pause writes. [`resolveMeleeIntercept`](src/main/gameActions/meleeInterceptStrategicResolve.ts) rejects Fight unless `pending.candidateHexes` contains the hex, so that array is the one chosen hex. Put the same hex on `ReadyResult.aiOnlyBattleH3Index`. [`handleGameReady`](src/main/gameIpcHandlers.ts) returns a fresh object on that pause and would drop a field it does not copy, so copy `aiOnlyBattleH3Index` there. Log the mode and the hex at debug. When no hex is chosen, do not pause and do not write a pending snapshot. None, or a human seat still active, keeps the current branch, including the `if (!observing && candidateHexes.length > 0)` pause.

In [`readyHandler.ts`](src/renderer/gameplay/readyHandler.ts), when the pause includes `aiOnlyBattleH3Index` and `S.autoAdvance` is true, resolve Fight for that hex and do not open the modal. When the observe checkbox is off, open [`meleeInterceptModal.ts`](src/renderer/gameplay/meleeInterceptModal.ts), check the chosen radio, call `scrollIntoView({ block: 'nearest' })` on its row, and enable Fight. Ignore still resolves melee on the world map. A row with no human party currently puts an em dash under Yours and only the first non-human party under Enemy. For that row, both cells use the named-party cell (dot, short name, and summary), lead seat then the other, and the two headers are those short names. A row that includes the human seat keeps Yours and Enemy. Update [`doc/ux/tactical-battles-list.md`](doc/ux/tactical-battles-list.md) with that observe row.

[`autoAdvanceReady`](src/renderer/gameplay/observeChrome.ts) today returns false while `S.tacticalBattleSnapshot` is set. While the checkbox is on and `leadPartyId` is set, allow the press during tactical planning, after playback, after deferred consult, and after commanders have settled. The result dialog and the knockout dialog still block it. A human battle stays blocked because the checkbox exists only while observing, and the `leadPartyId` check is the extra guard. The `setTimeout` at the end of Ready already calls `maybeObserveAutoAdvance`. Do not add a second strategic Ready on the AI-only exit path.

[`tacticalMaybeScheduleAnnihilationExit`](src/renderer/tactical/tacticalExitFlow.ts) still calls `getTacticalAnnihilationOutcome` for a human battle. When `leadPartyId` is set, ignore that helper. Read `aiOnlyEndReason` after playback. Map `elimination` to `{full home name} wins the battle.`, `mutual` to `All units destroyed.`, `exit` to `The commanders left the battle.`, and `idle` to `The battle ended with no orders left to carry out.` Store that sentence on the new renderer field. Do not add a member to `TacticalAnnihilationOutcomeKind`, and do not assign `S.tacticalAnnihilationOutcomeDialog` for an AI-only result. Semi-automatic opens the overlay with Ok and waits for that click before exit. Automatic does not open the overlay and exits at that same moment. Do not call [`tacticalPerformBattleExit`](src/renderer/tactical/tacticalExitFlow.ts) for an AI-only exit. That function always awaits `runReadyAfterExit` after the IPC, which would start the next strategic turn and then let auto-advance start another. Repeat its teardown instead: the end IPC, clear the renderer snapshot, clear the AI-only sentence, restore the strategic map and drafts, and refresh the strategic snapshot. The IPC is `endTacticalBattleSessionForTwoPartyVoluntaryExit` when `leadPartyId` is set. The playback-finished callback can run while `aiOnlyEndReason` is still set, and the new guard makes that press a no-op. After the exit IPC resolves and the snapshot is cleared, automatic play calls `maybeObserveAutoAdvance` once. Semi-automatic Ok does not.

The header Exit Battle control, on an AI-only battle, uses the same teardown as a beat ending. It does not call `tacticalPerformBattleExit`. It does not call `endTacticalBattle` at the click when the checkbox is off. It stores `The battle was left.` and opens the same Ok dialog. Ok calls `game:endTacticalBattle` and does not press Ready. When the checkbox is on, the header control calls `game:endTacticalBattle` immediately, shows no dialog, and does not call `runReadyAfterExit`. After that IPC resolves, it calls `maybeObserveAutoAdvance` once. The Ok button's tip is `Close this result and return to the world map. The next turn does not start until you press Ready.` Put that sentence in [`controlTooltipText.ts`](src/renderer/chrome/controlTooltipText.ts) and [`doc/ux/control-tooltips.md`](doc/ux/control-tooltips.md). The annihilation Exit Battle tip stays the human sentence.

Update the docs listed for this phase. [`doc/ux/game-menu.md`](doc/ux/game-menu.md) keeps "unchecking Offer tactical battles never opens the list" for a human who is still playing, and says an observed match uses AI-Only Battles instead. [`doc/ux/modes-and-transitions.md`](doc/ux/modes-and-transitions.md) changes the observe invariant from "Ready never offers a tactical battle" to "Ready offers one only when AI-Only Battles is not None". [`doc/ux/console.md`](doc/ux/console.md) says the observe checkbox, while an AI-only battle is in progress, starts the next battle beat, and after that battle ends starts the next strategic turn. The Ok dialog is the same overlay as Tactical annihilation, so the console's pointer-input rule for that overlay covers it. [`doc/combat-rules-v3.md`](doc/combat-rules-v3.md) §12.8 gains the idle streak and the commander exit, both using the §12.9 mapping, and §12.10 says each commander in an AI-only battle is consulted at most once per beat. [`doc/ux/input-map.md`](doc/ux/input-map.md) says Escape does not close the Ok dialog. Magnifiers stay hidden while observing. Do not show them for an AI-only battle.

Verify:

```powershell
npm run build:renderer
npm test
```

Expected: `npm test` exits 0. There is no smoke scene that plays an AI-only battle. After `npm test`, say that the Fight, Ignore, Ok, and auto-advance clicks were not exercised in a live window.

## Regressions to leave intact

- A human who is still playing still gets the tactical battles list only when Offer tactical battles is checked, and only for a hex with that human and exactly one other owner. `buildMeleeInterceptCandidateRows` still marks a two-AI hex ineligible. The test named for a three-party hex and an unseen fight still expects that.
- A human tactical beat still applies the human draft plus one opponent draft, and it still rejects a non-human unit on the human march path.
- Annihilation for a human battle still says "You win!", "You lose.", or "All units destroyed.", and Exit Battle still runs Ready afterward.
- An AI-only terminal beat still has a snapshot until playback finishes. The less-than-half pass runs from `game:endTacticalBattle` when both AI parties remain, and it does not run when a party is already gone.
- Observe with None, or an old save with no `ai_only_battles` row, never pauses for a melee choice.
- Combat dice do not move because battle selection did not draw from the combat RNG.
- Human voluntary exit still destroys a parent only when `survivors * 2 < baseline`, and it still skips that pass when one side is already gone.

## Out of scope

- Fighting a hex that has three or more sides, Neutral, or a human who is still playing.
- Changing Offer tactical battles for a human who is still playing.
- A second tactical resolution engine, or moving an AI seat onto the human id.
- Letting the observer pick a different hex than the one the setting chose.
- Reordering embark, air, ranged, movement, and ferry.
