# Multi-commander games, stage 3: commanders

Audience: a **lower-quality coding agent**. Read [multi-commander-execution-plan.md](multi-commander-execution-plan.md) first. Its working rules, verification bar, decisions ([D5 to D7](multi-commander-execution-plan.md#setup), [D10](multi-commander-execution-plan.md#play)), engineering decisions ([E5 to E12](multi-commander-execution-plan.md#engineering-decisions-frozen-unless-the-owner-overrides)), and glossary apply here. Stages 1 and 2 must be complete.

Goal of this stage: every AI seat is its own commander. Each one keeps its own memory, standing orders, callbacks, and turn notes; sees the board through its own fog; is told about every enemy and about Neutral; follows its own doctrine; uses its own model and reasoning effort; and consults at the same time as the others. The main process owns every consultation and every commander's status. The renderer only starts and stops planning, presses Ready, and shows what main reports.

## Phases

| Phase | Title | Prompt text changes? | Verifies with |
| --- | --- | --- | --- |
| 3.1 | AI stores keyed by seat | No | Existing suite; new per-seat store tests |
| 3.2 | Briefing data for a given seat | No | Existing prompt tests unchanged; new three-seat briefing tests |
| 3.3 | One consultation, any seat | No | Existing flow tests; new seat tests with a fake model |
| 3.4 | Commander settings per seat | No | IPC and request-profile tests |
| 3.5 | Prompts for several enemies and Neutral | **Yes** | Updated prompt tests; `doc/ai-commander-prompts/` |
| 3.6 | Doctrine | Only for Aggressive and Cautious | Prompt and draw tests |
| 3.7 | The commander pool | No | Pool tests with a fake model |
| 3.8 | Ready and post-resolution consults through the pool | No | Ready gather tests with a fake model |
| 3.9 | Renderer switch to the pool | No | Manual two-sided game with "No model" |

Phases 3.1 to 3.4 must not change a single character of any prompt in a two-sided match. The existing prompt tests (`openRouterMatrix.test.ts`, `variantConformance.test.ts`, `scenarioGoals.test.ts`, `promptText.test.ts`, the `promptSpec/*.test.ts` files) are the guard. If one of them fails in those phases, you changed behavior: revert and find out why.

---

## Phase 3.1: AI stores keyed by seat

**Goal.** Everything the AI pipeline stores is written and read for an explicit seat id. Today several stores hard-code `'opponent'`.

**Read first.** `src/main/gameDb/aiState.ts`, `src/main/gameDb/aiStateAccess.ts`, `src/main/gameDb/turnNotesHistory.ts`, `src/main/gameActions/captureTurnLossNote.ts`, `src/main/tools/standingOrders.ts` (`AI_PLAYER_ID`), `src/main/tools/productionTools.ts` (`AI_PLAYER_ID`), `src/main/tools/memory.ts` (`AI_PLAYER_ID`), `src/main/openRouter/applyParsedOpponentCallbacks.ts`, `src/main/callbackSubscriptions.ts` (or wherever `getSubscriptions` lives).

**Change.**

1. `aiState.ts` / `aiStateAccess.ts`:
   - Delete `OPPONENT_ID`. `get/add/clearOpponentCombatSinceConsultation` take `seatId: AiSeatId` and are renamed `get/add/clearCombatSinceConsultation`.
   - `ai_last_consultation_turn` and `ai_tool_limit_exceeded_last_turn` become per-seat keys: `ai_last_consultation_turn_<seatId>` and `ai_tool_limit_exceeded_last_turn_<seatId>`. Their getters and setters take the seat id. Reset deletes every `ai_last_consultation_turn_%` and `ai_tool_limit_exceeded_last_turn_%` key.
   - Every function that already takes `playerId: string` keeps doing so, but its parameter type becomes `AiSeatId`.
2. Tool entry points that hard-code `AI_PLAYER_ID = 'opponent'` (`standingOrders.ts`, `productionTools.ts`, `memory.ts`): delete the constant. `executeStandingOrders`, `executeProductionTools`, and `executeMemory` take the seat id as a parameter (add it as the first parameter, or inside an existing options object if the function has one). The human-only entry points (`assignHumanMarchStandingOrder`, `queryHumanStandingOrders`, `cancelHumanStandingOrder`) use `HUMAN_SEAT_ID`.
3. Callbacks: `applyParsedOpponentCallbackSubscriptions` takes the seat id and is renamed `applyParsedCallbackSubscriptions`.
4. Turn notes per seat. Change `turn_notes_history`:

   ```sql
   CREATE TABLE IF NOT EXISTS turn_notes_history (
     seat_id TEXT NOT NULL,
     scope TEXT NOT NULL CHECK(scope IN ('strategic', 'tactical')),
     battle_id TEXT NOT NULL DEFAULT '',
     turn_number INTEGER NOT NULL,
     strategy_text TEXT,
     message_text TEXT,
     own_loss_json TEXT,
     enemy_loss_json TEXT,
     PRIMARY KEY (seat_id, scope, battle_id, turn_number)
   );
   ```

   Bump `EXPECTED_USER_VERSION`. The bump discards the old match file, so this `CREATE TABLE` is enough. Do not write an `ALTER` migration. Every read and write in `turnNotesHistory.ts` takes the seat id. The old columns are `human_loss_json` and `ai_loss_json`; the new table uses `own_loss_json` and `enemy_loss_json`. Loss capture runs once per active AI seat: `own_loss_json` holds that seat's losses, `enemy_loss_json` every other owner's losses, both filtered by what that seat could see (today's visibility filter, applied from that seat's view instead of the human's). For the `'opponent'` seat in a two-sided match, `own` is today's `ai_loss_json` and `enemy` is today's `human_loss_json`.
5. The Recent Turn Notes prompt section keeps printing "- Human Losses:" from `enemy_loss_json` and "- AI Losses:" from `own_loss_json` in this phase. Phase 3.5 changes the labels.
6. Every caller in the AI pipeline that now needs a seat id passes `'opponent'` for now, through a constant named `LEGACY_SINGLE_AI_SEAT_ID` exported from `src/shared/seatIds.ts` (new export) and documented as "the one AI seat of a match started by the two-sided setup; removed when every caller takes a seat". Phases 3.3 and 3.8 remove every use of it; stage 5 deletes it.

**Tests.**

- `src/main/gameDb/aiStateSeats.test.ts` (new), three seats: pending orders, combat-since-consultation, loss events, last-consultation turn, and tool-limit flag written for `'opponent2'` are invisible to `'opponent'` and vice versa.
- `src/main/gameDb/turnNotesHistorySeats.test.ts` (new): notes for two seats on the same turn do not overwrite each other; a tactical-battle delete removes only tactical rows.
- Existing tests that call the renamed functions: update the calls only (pass `'opponent'`). Name each file in your report.

**Done when.** `npm test` passes with no prompt test changed, and this search has no output:

```powershell
Get-ChildItem -Path src/main -Recurse -Filter *.ts | Select-String -Pattern 'AI_PLAYER_ID|\bOPPONENT_ID\b'
```

---

## Phase 3.2: Briefing data for a given seat

**Goal.** Everything the briefing and the assessment tools compute is computed for a given seat: "own" means that seat, "enemy" means every other owner (other seats and Neutral). The prompt text stays the same in a two-sided match, because there "every other owner" is exactly the human.

**Read first.** `src/main/briefingFormatter.ts` (`formatBriefing`), `src/main/briefing/map/briefingMapSection.ts`, `src/main/openRouter/briefingSections.ts`, `briefingSectionsAirOps.ts`, `briefingSectionsSealift.ts`, `possibleUnitActionsTableAssembly.ts` (`ENEMY_PLAYER`, `FRIENDLY_PLAYER`), `possibleUnitActions.ts`, `possibleUnitActionsBestOptionsInterest.ts`, `possibleUnitActionsIndexedState.ts`, `src/main/precomputation.ts`, `src/main/tools/assessment.ts`, `src/main/tools/combatEstimationSides.ts`, `src/main/tools/assessUnitProximity.ts`, `src/main/tools/pathfindingDistanceHelpers.ts`, `src/main/tools/pathfindingSessionCache.ts`, `tacticalBriefingAssessments.ts`, `formatTacticalBriefing.ts`, `buildTacticalAiPlanState.ts`.

**Change.**

1. Every function in those files that today decides "own" with `=== 'opponent'` and "enemy" with `=== 'human'` takes the seat id (directly, or from `state.playerPerspective`, which `getGameStateForPlayer(seatId)` already sets) and uses:
   - own: `u.player === seatId`
   - enemy: `u.player !== seatId` (this includes Neutral)
   - controlled by me: `controller === seatId`
   - controlled by an enemy: `controller !== null && controller !== seatId` (Neutral land counts; never-owned land does not)
2. Delete `ENEMY_PLAYER` and `FRIENDLY_PLAYER`. The enemy-homeland bucket in `possibleUnitActions.ts` becomes the union of every other active seat's home hexes from `state.homeRegionHexesBySeat`.
3. `pathfindingSessionCache.ts`: any seat id is an eligible perspective, not just two.
4. `assessment.ts` `shouldIncludeStaleEnemyIntel`: keep today's rule for the human (`playerPerspective === HUMAN_SEAT_ID` includes stale intel) and exclude it for every AI seat.
5. Do not change any string the prompt prints. Where a function builds a sentence such as "currently observed human units", keep the sentence and change only how the count is computed.

**Tests.** `src/main/openRouter/briefingSeats.test.ts` (new), three seats with fog off on `western_asia_north`:

- `formatBriefing` for `'opponent2'`: the map section marks `'opponent2'` units with `*` and both other seats' units with `!`; the Best Options rows list attacks on units of both other seats.
- The same for `'opponent'` lists `'opponent2'` units as enemies.
- After `applyKnockout('opponent3')` in a four-seat match, neutral units appear as `!` for every seat.

Existing prompt tests pass unchanged.

**Done when.** `npm test` passes and this search lists only lines you can justify in your report (for example, a human-only tool):

```powershell
Get-ChildItem -Path src/main/openRouter, src/main/briefing, src/main/tools, src/main/briefingFormatter.ts, src/main/precomputation.ts -Recurse -Filter *.ts | Where-Object { $_.Name -notlike '*.test.ts' } | Select-String -SimpleMatch -Pattern "=== 'human'", "=== 'opponent'", "!== 'human'", "!== 'opponent'"
```

---

## Phase 3.3: One consultation, any seat

**Goal.** A consultation runs for an explicit seat from start to finish: its state, its briefing, its validation, its stored results, its post-resolution triggers. A tactical consultation runs for the battle's opposing seat. Still one AI seat is consulted at a time in the app; phase 3.7 adds concurrency.

**Read first.** `RequestOrdersOptions` (`src/main/openRouter/requestOrdersFlowTypes.ts`), `requestOrdersFlow`, `requestOrdersApplyParsed.ts` (`applyParsedRequestOrders`), `validateAiOrder` and `validateAiRangedOrder` in `src/main/openRouter/openRouter.ts`, `src/main/openRouter/afterResolution.ts`, `src/main/openRouter/consultationPolicy.ts`, `src/main/callbackEvaluation.ts`, `src/main/openRouter/tacticalCallbackSubscriptionLifecycle.ts`, `handleRequestAiOrders` and `buildUnconsultedOpponentOrders` in `src/main/gameIpcHandlers.ts`, `src/main/tools/tempoRuleAttacks.ts`, `src/main/openRouter/modelCallControl.ts`.

**Change.**

1. `RequestOrdersOptions` gains a required `readonly seatId: AiSeatId`. `requestOrdersFlow` filters own units with it, passes it to every store and tool from phase 3.1, and to every briefing function from phase 3.2.
2. Validation: "Only opponent units can receive AI orders" becomes "A commander can order only its own side's units", checking `unit.player === seatId`. Tactical ranged validation uses `tacticalAttackerPlayer: seatId`.
3. `applyParsedRequestOrders` generates standing orders and ferries for `seatId`.
4. `mergeOpponentAttackOrders` (`tempoRuleAttacks.ts`) takes `seatId` and is renamed `mergeCommanderAttackOrders`; its sweep uses `seatId` and `holdFireUnitIdsForPlayer(seatId)`. Update the module comment that says the sweep is only ever for the opponent.
5. `buildUnconsultedOpponentOrders` takes `seatId` and is renamed `buildUnconsultedCommanderOrders`; it returns an `OwnerTurnOrders`.
6. `afterResolution` and `afterTacticalBeatResolution` take `seatId`:
   - `consumeFogNewContactsForPlayer(seatId)`, `getSubscriptions(seatId)`, `setAiPendingOrders(seatId, …)`, `clearAiPendingOrders(seatId)`.
   - The tactical skip and failure paths stop clearing **strategic** pending orders (today `clearAiPendingOrders('opponent')` on those paths). They clear nothing. This is a deliberate fix: report it.
7. `consultationPolicy.ts`:
   - `opponentIdle` and `opponentHadStrategicResolutionUnitActions` become "this seat had actions" for `seatId`.
   - `humanObservable` and `humanHadStrategicResolutionObservableActions` become `enemyObservable`: observable actions by any **other seat** (not Neutral; Neutral fires every turn and would trigger a consult every turn). Killer-id checks use `unitIdOwnerFromId(killerId) !== seatId` and that the killer's owner is a seat.
   - Rename the types and fields that say opponent or human to say seat or enemy.
8. `callbackEvaluation.ts`:
   - `evaluateMandatoryOverrides(seatId, …)` and `evaluateSubscriptionEvents(seatId, …)`.
   - `lastAttackMixSnapshot` becomes a `Map<AiSeatId, AttackMixSnapshot>`; clear it on new game.
   - The `unit_destroyed` callback's `'own'` side means a unit of `seatId`; `'enemy'` means any other owner.
9. Tactical: the battle's opposing party plans the opponent's beat. Where `handleRequestAiOrders`, `afterTacticalBeatResolution`, and the tactical callback stash use `'opponent'`, use `battle.opposingPartyId` when it is an AI seat. When it is Neutral, skip the consult entirely (no draft; the sweep from phase 2.6 covers it).
10. `ReadyResult` fields `opponentCombatParticipantUnitIds`, `removedOpponentUnitIds`, and `opponentHadStrategicMarchResolution` become per-seat maps: `combatParticipantUnitIdsBySeat`, `removedUnitIdsBySeat`, `hadStrategicMarchResolutionBySeat` (`Readonly<Record<string, …>>`). `opponentDeploymentCapReachedUnitTypes` becomes `deploymentCapReachedUnitTypesBySeat`. Update `pickReadyResolutionIpcMirrorFields` and every reader.
11. `modelCallControl.ts`: `beginModelCall(label, theater, seatId)`; `cancelModelCalls(reason, theater, seatId | 'all')` cancels only that seat's calls. Keep the epoch logic per seat (`Map<AiSeatId, number>`), so cancelling one seat does not make another seat's in-flight call look cancelled.
12. Every remaining caller in `src/main/gameIpcHandlers.ts`, `src/main/main.ts`, and `src/main/ipc/` passes `LEGACY_SINGLE_AI_SEAT_ID` until phase 3.8.

**Tests.**

- `src/main/openRouter/requestOrdersSeats.test.ts` (new): with a fake `requestOrders` dependency (the existing flow tests show how they stub the HTTP layer; reuse that stub), a consult for `'opponent2'` in a three-seat match validates only `'opponent2'` units, drops an order for an `'opponent'` unit, and stores pending orders under `'opponent2'` only.
- `src/main/openRouter/afterResolutionSeats.test.ts` (new): a turn in which only `'opponent'` units fought triggers `opponentIdle`'s replacement for `'opponent'` and not for `'opponent2'`; a neutral unit's fire on an `'opponent2'` unit does not by itself set `enemyObservable` for `'opponent2'`.
- `src/main/openRouter/modelCallControl.test.ts`: add a case: cancelling `'opponent'` leaves an `'opponent2'` call uncancelled.
- Existing tests that construct `RequestOrdersOptions` or call the renamed functions: add `seatId: 'opponent'` and update names only. Name each file in your report.

**Done when.** `npm test` passes with no prompt test changed.

---

## Phase 3.4: Commander settings per seat

**Goal.** Each AI seat's model and reasoning effort come from its row in `seats`, not from the single app-wide setting. The app-wide setting stays as the default the new-game screen offers and the value the old two-sided setup copies into the `'opponent'` seat.

**Read first.** `getSelectedModel`, `setSelectedModel`, `resolveSelectedModelOrdersRequestProfile` in `src/main/openRouter/openRouter.ts`; `src/main/ipc/openRouterIpcHandler.ts`; `IPC_OPENROUTER` in `src/shared/ipc/channels.ts`; `executeAbortableConsult` and `readLiveModelId` in `src/main/ipc/modelConsultAttempt.ts`; `seatRosterStore.ts`.

**Change.**

1. `seatRosterStore.ts`: add `updateSeatCommander(ops, seatId, commander: Pick<SeatCommander, 'modelId' | 'reasoningEffort' | 'doctrineChoice'>)`. It refuses a human seat and a knocked-out seat with an error. Changing `doctrineChoice` mid-match is allowed. When the new choice is `'aggressive'`, `'balanced'`, or `'cautious'`, set `doctrine` to that same value. When the new choice is `'random'`, keep the stored `doctrine` if it is already one of those three; otherwise leave `'balanced'`. The game-start draw is phase 3.6. This function does not draw again.
2. New IPC on `IPC_GAME` (follow the pattern of the existing channels, preload, and `gameApiTypes.ts`): `game:setSeatCommander(seatId, commander)` returns the updated `SeatSnapshot`. It cancels that seat's in-flight consults with reason `'model_changed'` when the model or effort changed.
3. The request profile: replace `resolveSelectedModelOrdersRequestProfile` with `resolveSeatOrdersRequestProfile(seat: SeatRecord)`, which uses `seat.commander.modelId` and `seat.commander.reasoningEffort` (keep the existing rule that an effort the model does not support is dropped). `readLiveModelId` reads the seat's current model from the roster, so a retry after `'model_changed'` uses the new model.
4. A seat whose `modelId` is null is a "No model" commander: every path that today checks "no model selected" checks the seat instead.
5. Two-sided compatibility: in the `IPC_GAME.newGame` handler in `src/main/main.ts`, when the payload has no `seats`, set the `'opponent'` seat's commander to the app-wide `getSelectedModel()` and saved reasoning effort after the reset. And when the app-wide model or effort changes during a match (today's Opponent tab), apply the same change to the `'opponent'` seat through `updateSeatCommander`. Both exist only until the interface stage replaces the Opponent tab; stage 5 deletes them.

**Tests.**

- `src/main/gameDb/seatRosterStore.test.ts`: `updateSeatCommander` round-trips; refuses `'human'`; refuses a seat with `out_turn` set.
- `src/main/openRouter/ordersRequestProfile.test.ts` (existing): adapt to `resolveSeatOrdersRequestProfile`; add a case where two seats with different models get different profiles.

**Done when.** `npm test` passes with no prompt test changed. In a two-sided match started from today's screen, the AI uses the model chosen on the Opponent tab (check with a debug log line or a unit test of the newGame handler path, not with a paid call).

---

## Phase 3.5: Prompts for several enemies and Neutral

**Goal.** The prompt tells each commander who every side is, which ones are its enemies (all of them, plus Neutral), and how the match is won. This is the first phase that changes prompt text. After it, a two-sided prompt reads slightly differently, and the prompt tests and `doc/ai-commander-prompts/` change in the same change set.

**Read first.** `doc/ai-commander-prompts/README.md` and every file it lists; `src/main/openRouter/openRouterBuildSystemPrompt.ts`; `src/main/openRouter/scenarioGoals.ts`; `src/main/openRouter/promptSpec/coachingTextStrategic.ts`; `coachingTextTactical.ts`; `src/main/openRouter/promptContracts.ts`; `src/main/openRouter/promptText.ts` (`buildHumanUnitsPromptLine`); `recentTurnNotesSection.ts`; `briefingFormatter.ts` narrative; `tacticalBriefingAssessments.ts` narrative; `briefingMapSection.ts` legend.

**Change.** Make exactly these wording changes. `{…}` marks a value. "Enemy sides" means the other active seats in seat order. Use each side's full home display name in the prompt (not the short name). That name is `seat.homeRegion`.

1. **New "Sides" block** in the system prompt, placed immediately before the Scenario Objective block. It is a Markdown table:

   ```text
   ## Sides

   | Side | Unit id prefix | Home region | Status |
   | --- | --- | --- | --- |
   | {own name} (you) | {a1} | {own home} | Active |
   | {enemy name} | {h1} | {enemy home} | Active |
   | {knocked-out name} | {a3} | {its home} | Out since turn {N}; its units are now neutral |
   | Neutral | (keeps the prefix of the side it came from) | none | Garrisons hold their hexes and fire on any unit in range. A loaded ship sails to a landing, unloads, and then holds. |
   ```

   The Neutral row appears only when a neutral unit exists. Build the table in a new function `buildSidesPromptBlock` in a new file `src/main/openRouter/promptSpec/sidesBlock.ts`; the prefix comes from `playerIdCodeFor`.

2. **Identity sentence** (`openRouterBuildSystemPrompt.ts`): "You are the enemy commander in a WEGO (simultaneous movement) hex wargame." becomes "You command {own name} in a WEGO (simultaneous movement) hex wargame with {N} sides. Every other side is your enemy, and so are neutral garrisons."
3. **No-contact sentence**: "No human units are currently observed. Enemy forces may be out of view." becomes "No enemy units are currently observed. Enemy forces may be out of view."
4. **Unit roster line** (`buildHumanUnitsPromptLine`, renamed `buildEnemyUnitsPromptLine`): "Human units (currently observed): …" becomes "Enemy units (currently observed): …", listing the same unit summaries grouped by side in seat order, then Neutral, each group introduced by the side's name and a colon. The "none" variant becomes "Enemy units (currently observed): none. Enemy units may be out of view; actively scout to reacquire contact."
5. **Home-region lines**:
   - "- Your home region hexes are:" stays.
   - "- Your enemy's home region hexes are:" becomes one line per enemy side: "- {enemy name} home region hexes are: …".
   - "- These hexes are in both home regions:" becomes "- These hexes are in more than one home region:".
   - "Your control of the enemy's home region: …" becomes one line per enemy side: "Your control of {enemy name}'s home region: …", same numbers and wording otherwise.
6. **Scenario goals** (`scenarioGoals.ts`):
   - The strategic goal sentence becomes, for `last_side_standing`: "Your goal is to be the last side standing. A side is knocked out when one other side controls its home region (see the share below), when its home region has no cities left, or when it holds no city hexes anywhere. A knocked-out side's units become neutral garrisons and its land becomes neutral." For `most_city_hexes_at_turn_limit`, append: "The match ends after turn {L}. If more than one side is left then, the side holding the most city hexes wins." Both variants also append: "If every side would be knocked out on the same turn, none is knocked out and the match ends. The side holding the most city hexes wins. If several sides hold that many, no single side wins." Leave the Aggressive, Balanced, and Cautious doctrine blocks as written.
   - "- Enemy home region: {name}" becomes "- Enemy home regions: {name}, {name}, …".
   - The progress lines become one per enemy side: "{enemy name} home urban cells in hexes you control: …" and, for each enemy side that controls any of your home's urban cells, "Your home urban cells in hexes {enemy name} controls: … (they need {N})".
   - "Both home-region outlines are always visible on the map." becomes "Every home-region outline is always visible on the map."
   - The tactical goal sentence does not change.
   - `getRegionHomeControlProgressForPrompt` is replaced by a per-pair helper next to `evaluateEndOfTurnOutcome` that returns progress for (seat, each enemy) and (each enemy, seat).
7. **Coaching** (`coachingTextStrategic.ts`):
   - Goal (5) "Degrade or eliminate the enemy home region's urban production capacity" becomes "Degrade or eliminate enemy home regions' urban production capacity".
   - `WIN_PATHS_BULLET` becomes "- Win by being the last side standing: knock out each enemy by controlling its home region, or by destroying or taking all of its cities. Those are the cells that matter." For a turn-limit match add: " If the turn limit arrives first, the most city hexes wins."
   - Add a new bullet after it, `FREE_FOR_ALL_BULLET`, only when the match has three or more seats: "- Every other side is your enemy, and they are enemies of each other. A side busy fighting a third side is exposed; a side about to knock out another may become the strongest. Neutral garrisons hold their hexes and fire on anything in range. A loaded ship sails to a landing, unloads, and then holds."
   - `SHARED_HOME_BULLET`: "both home regions" becomes "more than one home region".
   - `MESSAGE_BLOCK`: "Address the human player in character as their enemy commander." becomes "Address your enemies in character, as their enemy commander." Keep the rest.
8. **Envelope header** (`promptContracts.ts`): "a one-line in-character taunt or threat addressed to the human player" becomes "a one-line in-character taunt or threat addressed to your enemies".
9. **Briefing narrative** (`briefingFormatter.ts`): "currently observed human units: {N}" becomes "currently observed enemy units: {N}". Tactical (`tacticalBriefingAssessments.ts`): "human sub-units in this battle" becomes "enemy sub-units in this battle".
10. **Recent Turn Notes** (`recentTurnNotesSection.ts`): "- Human Losses:" becomes "- Enemy Losses:" and "- AI Losses:" becomes "- Your Losses:".
11. **Map legend** (`briefingMapSection.ts`): "! = enemy units" becomes "! = enemy units, including neutral garrisons".
12. Any other prompt sentence that names "the human" or "the human player" when it means "the enemy": change it to "the enemy" or "your enemies" and list it in your report. Do not change sentences about the human's own interface (there should be none in a prompt).

**Tests.**

- Update the assertions in `openRouterMatrix.test.ts`, `variantConformance.test.ts`, `scenarioGoals.test.ts`, `promptText.test.ts`, `promptContracts.test.ts`, `recentTurnNotesSection.test.ts`, `briefingMapSection.test.ts`, `coachingText.test.ts` to the new wording. Change only expected strings; keep every case. Name each file in your report.
- `src/main/openRouter/promptSpec/sidesBlock.test.ts` (new): two seats give two rows; four seats with one knocked out give the "Out since turn" row and the Neutral row; prefixes match `playerIdCodeFor`.
- `src/main/openRouter/promptSeats.test.ts` (new): a three-seat system prompt for `'opponent2'` names both enemies' home regions, includes the free-for-all bullet, and does not contain the words "human player".

**Docs.** Update every file under `doc/ai-commander-prompts/` that quotes a changed sentence (`strategic-prompt.md`, `tactical-prompt.md`, `variants.md`, the example prompts and responses), and `README.md` there if it lists sections. The builders are the authority ([AGENTS.md](../AGENTS.md)); regenerate the example prompts from a two-sided and a three-sided test fixture rather than hand-editing them, and say which fixture you used.

**Done when.** `npm test` passes and the docs match the builders.

---

## Phase 3.6: Doctrine

**Goal.** Each commander's prompt carries its doctrine. Random draws one at game start from the match seed and keeps it hidden until game over ([D5](multi-commander-execution-plan.md#setup)).

**Doctrine text.** The owner approved drafting these with this plan; they are part of the plan the owner reviews. Use them exactly. The short descriptions appear in the interface (stage 4); the prompt blocks go in the prompt.

For reference, today's `STRATEGY_BLOCK`, which every commander keeps:

```text
- Your strategy is:
    (1) Use speed, surprise, and initiative to break the enemy's cohesion and morale
    (2) Attack the enemy's weaknesses (gaps) and avoid their strengths (surfaces)
    (3) Create maximum disruption with minimum force
```

| Doctrine | Interface description |
| --- | --- |
| Aggressive | Attacks early, accepts losses, and strikes cities it does not plan to hold. |
| Balanced | Uses speed and surprise, attacks weak points, and avoids the enemy's strengths. |
| Cautious | Guards its home, fights only at an advantage, and grows its forces before attacking. |
| Random | Draws Aggressive, Balanced, or Cautious when the game starts. The draw is revealed when the game ends. |

Balanced has **no** prompt block ([E10](multi-commander-execution-plan.md#engineering-decisions-frozen-unless-the-owner-overrides)): today's `STRATEGY_BLOCK` is the balanced doctrine, and its interface description above paraphrases it. Aggressive and Cautious each add one block, placed immediately after `STRATEGY_BLOCK` in both the strategic and the tactical context:

```text
- Your doctrine is aggressive:
    (1) Seize the initiative from the first turn: advance on the nearest enemy home region and engage every enemy force you can reach.
    (2) Accept losses when a trade gains ground, cities, or tempo. Do not hold units back to preserve them.
    (3) Strike enemy cities, airports, and seaports even when you cannot hold them; production you deny is production they lose.
    (4) Keep only enough force at home to stop a raid from taking it.
```

```text
- Your doctrine is cautious:
    (1) Secure your home region and the cities next to it before you advance.
    (2) Fight only from cover or with clear superiority. Pull back exposed units rather than lose them.
    (3) Build up production and forces first. Attack an enemy that is already weakened or busy fighting another side.
```

**Change.**

1. Create `src/main/openRouter/promptSpec/doctrineText.ts` (new) exporting `buildDoctrineBlock(doctrine: Doctrine): string`, which returns the aggressive or cautious block above and the empty string for `'balanced'`. Create `src/shared/doctrineDescriptions.ts` (new) exporting `DOCTRINE_CHOICE_LABELS` ("Aggressive", "Balanced", "Cautious", "Random") and `DOCTRINE_CHOICE_DESCRIPTIONS` (the table above).
2. Insert `buildDoctrineBlock(...)` after `STRATEGY_BLOCK` in the strategic context builder and in `coachingTextTactical.ts`, from the consulting seat's `commander.doctrine`. An empty block adds no line and no blank line. Thread the doctrine through the coaching gates the way other per-consult values are threaded; do not read the roster inside the text builders.
3. Random draw: in `resetGameForNewMatch`, after the game seed is created, for each AI seat whose `doctrineChoice === 'random'`, draw `DOCTRINES[Math.floor(rng() * 3)]` with `createSeededRng((gameSeed + seatOrder * 104729) >>> 0)` (`src/main/seededRng.ts`) and store it as `doctrine`. The same seed always draws the same doctrine.
4. Never put the drawn doctrine of a `'random'` seat into any IPC payload before game over: `toSeatSnapshot(seat, revealDoctrine)` already hides it; check that no other path (logs shown in the AI activity log, toasts) prints it. The commander's own prompt does contain it; that is intended.

**Tests.**

- `src/main/openRouter/promptSpec/doctrineText.test.ts` (new): the aggressive and cautious blocks appear right after the strategy block in a strategic prompt and in a tactical prompt; a balanced prompt is identical to the prompt this phase started from.
- `src/main/gameDb/newMatchSeats.test.ts`: a seat with `doctrineChoice: 'random'` gets one of the three doctrines; two resets with the same stored seed draw the same one; the snapshot's `commander.doctrine` is null for that seat until `game_over` is set.
- The existing prompt tests do not change: a two-sided match defaults to Balanced, which adds nothing ([E10](multi-commander-execution-plan.md#engineering-decisions-frozen-unless-the-owner-overrides)). If one changes, stop and report.

**Docs.** `doc/ai-commander-prompts/strategic-prompt.md` and `tactical-prompt.md`: the two doctrine blocks, and that Balanced is the shared strategy block alone. `doc/hybrid-ai.md`: one paragraph on doctrine and the random draw.

**Done when.** `npm test` passes.

---

## Phase 3.7: The commander pool

**Goal.** The main process runs every AI seat's consultations, concurrently, and owns each commander's status ([E7](multi-commander-execution-plan.md#engineering-decisions-frozen-unless-the-owner-overrides), [E12](multi-commander-execution-plan.md#engineering-decisions-frozen-unless-the-owner-overrides)). This phase adds the pool and its IPC alongside the existing flow. Nothing calls it yet except tests; phase 3.8 routes Ready through it and phase 3.9 switches the renderer.

**Read first.** `handleRequestAiOrders` and `handleGameReady` in `src/main/gameIpcHandlers.ts` (how a consult is started, raced, and applied today), `requestOrdersWithLog` in `src/main/main.ts`, `executeAbortableConsult`, `AI_CONSULTATION_WALL_CLOCK_MS` and `AI_CONSULTATION_WAIT_TIMEOUT_MS` in `src/shared/aiConsultationLimits.ts`, `doc/hybrid-ai.md`.

**Change.**

1. Create `src/shared/commanderStatus.ts` (new):

   ```ts
   export type CommanderStatusKind = 'idle' | 'planning' | 'ready' | 'timed_out' | 'no_model' | 'out';
   export interface CommanderStatus {
     readonly seatId: string;
     readonly kind: CommanderStatusKind;
     /** Milliseconds since planning started, while planning; otherwise null. */
     readonly planningElapsedMs: number | null;
     /** The turn on which the last timeout happened, or null. */
     readonly timedOutTurn: number | null;
   }
   export interface CommanderDispatch {
     readonly seatId: string;
     readonly turnNumber: number;
     readonly message: string;
     readonly strategy: string;
     readonly modelLabel: string;
   }
   export interface CommanderPoolSnapshot {
     readonly statuses: readonly CommanderStatus[];   // seat order, AI seats only
     readonly undeliveredDispatches: readonly CommanderDispatch[];
   }
   ```

2. Create `src/main/openRouter/commanderPool.ts` (new). Keep it under 600 lines; put helpers in `commanderPoolSupport.ts` (new) if needed. Module state: one entry per AI seat with its status, its `AbortController`, its in-flight promise, and its planning start time; one queue of undelivered dispatches.

   ```ts
   export function resetCommanderPool(roster: readonly SeatRecord[]): void;           // new match: aborts everything, idles every seat
   export function startStrategicPlanning(args: StartPlanningArgs): void;             // fire and forget; one consult per eligible seat, concurrently
   export function stopAllPlanning(reason: ModelCallCancelReason): void;
   export function cancelSeatPlanning(seatId: AiSeatId, reason: ModelCallCancelReason): void;
   export function waitForSeatsSettled(seatIds: readonly AiSeatId[], timeoutMs: number): Promise<void>;
   export function readCommanderPoolSnapshot(drainDispatches: boolean): CommanderPoolSnapshot;
   /** During a tactical battle against an AI seat: plan that seat's next beat. */
   export function startTacticalPlanning(args: StartTacticalPlanningArgs): void;
   /** The opposing seat's planned beat, removed from the pool; null when it has none. */
   export function takeTacticalDraft(seatId: AiSeatId, battleId: string): TacticalOpponentPlan | null;
   ```

   `startTacticalPlanning` runs the tactical branch `handleRequestAiOrders` runs today (with `tacticalAiBattle`) for `battle.opposingPartyId`, in theater `'tactical'`, and keeps the returned plan in the pool keyed by seat and battle id instead of sending it to the renderer. Use the type the tactical branch returns today for `TacticalOpponentPlan`; do not invent a new shape.

   Rules:
   - Eligible seats: active AI seats. A seat with no model gets status `'no_model'` and is never consulted. A knocked-out seat gets `'out'`.
   - Start every eligible seat before awaiting any of them, so the model waits overlap ([E12](multi-commander-execution-plan.md#engineering-decisions-frozen-unless-the-owner-overrides)). Serialize the sections that run tools or write the database. Do not hold a SQLite transaction across an `await`, and do not wrap the whole consult in that lock. Each consult keeps its own pathfinding session. `ai_pending_orders.strategy_text` stores the JSON extra orders, not the prose strategy. Put the prose only on the dispatch.
   - `startStrategicPlanning` starts, for each eligible seat that is not already planning, the same consult `handleRequestAiOrders` runs today (state from `getGameStateForPlayer(seatId, { maskUnexploredTerrain: false })`, `requestOrdersWithLog`, `beginModelCall(label, 'strategic', seatId)`), wrapped in `executeAbortableConsult` with the seat's own controller and `AI_CONSULTATION_WAIT_TIMEOUT_MS`. Set the status to `'planning'` with the start time.
   - On success: store the plan with `setAiPendingOrders(seatId, …)` (all five order kinds, [E8](multi-commander-execution-plan.md#engineering-decisions-frozen-unless-the-owner-overrides)), add a dispatch (message, strategy, the model's display label from `formatModelOptionLabel`) to the queue, add the consult's cost to the seat's `cost_usd` and 1 to its `consultation_count` with a new `recordSeatConsultation(ops, seatId, costUsd)` in `seatRosterStore.ts`, and set status `'ready'`.
   - When the consult did not finish within `AI_CONSULTATION_WALL_CLOCK_MS` of its start (measure from the planning start, not from the race), or the race timed out: abort it, clear the seat's pending orders, set `'timed_out'` with `timedOutTurn` = the current turn. Its standing orders run at Ready (phase 3.8).
   - On any other failure: log it, set `'ready'` with no stored plan (standing orders run), and add no dispatch.
   - Cost is added even when the consult failed after spending (use the cost the flow reports).
   - `readCommanderPoolSnapshot(true)` returns the statuses and drains the queue; `false` peeks.
3. New IPC on `IPC_GAME` (channel, preload, `gameApiTypes.ts`): `game:startCommanderPlanning` (calls `startTacticalPlanning` when a tactical battle is active, `startStrategicPlanning` otherwise), `game:stopCommanderPlanning`, `game:readCommanderPool` (drains). Wire them in a new handler file `src/main/ipc/commanderPoolIpcHandler.ts` (new). `gameIpcHandlers.ts` is 624 lines and `main.ts` is 594; do not add this handler to either file.
4. `resetCommanderPool` runs in the `newGame` handler after the reset.

**Tests.** `src/main/openRouter/commanderPool.test.ts` (new). Inject a fake consult function (add a test seam: `commanderPool.ts` takes its consult runner from a `setCommanderConsultRunnerForTests` function or from a deps object; follow how `afterResolution.ts` takes `AfterResolutionDeps`):

- Three AI seats with models: all three start at once. The fake records its start time before its first await, and those three times are in before any fake resolves. A database lock that wrapped the whole consult would fail this. Each stores pending orders under its own seat; statuses go `planning` → `ready`; three dispatches are queued; each seat's `consultation_count` is 1 and its cost is what the fake reported. The stored `strategy_text` is still the extra-orders JSON, and the prose is only on the dispatch.
- A seat with `modelId: null` is `'no_model'` and the fake is never called for it.
- A fake that never resolves: after the wall clock (inject a short clock or fake timers), the seat is `'timed_out'`, its pending orders are cleared, and the other seats are unaffected.
- `cancelSeatPlanning('opponent2', 'model_changed')` aborts only that seat.
- `readCommanderPoolSnapshot(true)` drains; a second call returns no dispatches.

**Docs.** `doc/hybrid-ai.md`: a section on the commander pool: one consult per AI seat, concurrent, status per seat, timeout behavior (standing orders run, status "Timed out"), cost and consultation counts per seat.

**Done when.** `npm test` passes. Nothing in the app calls the new IPC yet.

---

## Phase 3.8: Ready and post-resolution consults through the pool

**Goal.** At Ready, main gathers one order set per active AI seat. After resolution, each AI seat's post-resolution consult runs through the pool. The deferred-until-playback behavior stays.

**Read first.** `handleGameReady` (whole function), `deferredResolutionPlaybackConsult.ts` (whole file), `runEventDrivenAfterResolutionConsultation` and `runEventDrivenAfterTacticalBeatConsultation` (`src/main/ipc/readyIpcResolutionMapping.ts`), `doc/hybrid-ai.md` sections on every-turn and event-driven modes.

**Change.**

1. Create `src/main/openRouter/commanderReadyGather.ts` (new):

   ```ts
   /** One order set per active AI seat for this Ready. Waits for seats still planning, up to the timeout. */
   export async function gatherCommanderOrdersForReady(args: { readonly useEventDriven: boolean; readonly turnNumber: number }): Promise<TurnOrdersByOwner>;
   ```

   For each active AI seat, in seat order:
   - If the seat is planning, wait for it with `waitForSeatsSettled` until it leaves `'planning'` (ready, timed out, or failed). Each seat's own consult, started under `AI_CONSULTATION_WAIT_TIMEOUT_MS`, is what marks the timeout. The gather waits for the latest of those already-running deadlines. Do not start a second, shorter race at Ready: a shorter race is what `AI_CONSULTATION_WAIT_TIMEOUT_MS` exists to avoid.
   - If the seat has stored pending orders: use them and clear them.
   - Otherwise: `buildUnconsultedCommanderOrders(seatId)` (standing orders plus the sweep).
   - Every-turn mode with no stored plan and a model: today Ready runs an inline consult. Keep that, through the pool (`startStrategicPlanning` for that seat, then wait), so it gets the same status and timeout handling.
2. `handleGameReady`: replace the single-opponent branches with `gatherCommanderOrdersForReady`, then `deps.ready(ordersByOwner)`. Delete the precomputed-orders branches; the renderer stops sending them in phase 3.9. Keep the payload fields in the type until phase 3.9 deletes them, and ignore them here.
3. Post-resolution (event-driven mode): `afterResolution` runs once per active AI seat, concurrently, through the pool's status handling (`'planning'` while it runs, `'ready'` after). The deferred slot keeps its single-slot design: one pending entry covers "run every seat's post-resolution consult when playback completes". Inline mode (Run off or not deferred) awaits all of them.
4. Tactical beats: the opposing seat's post-beat consult goes through the pool for that one seat. `commitHumanTacticalDraftOrders` takes the opposing seat's draft from `takeTacticalDraft` when the payload carries none. (Phase 3.9 removes the payload field; until then, a draft in the payload wins.) A Neutral opposing party has neither a draft nor a consult.
5. Remove every use of `LEGACY_SINGLE_AI_SEAT_ID` under `src/main`. The two-sided setup's `'opponent'` seat is now just the only AI seat in the roster. The renderer may still say opponent until stage 4. Stage 5 deletes the constant.

**Tests.**

- `src/main/openRouter/commanderReadyGather.test.ts` (new), fake consult runner, three AI seats: one with stored pending orders, one still planning that resolves within the wait, one with no model. The gathered map has three entries: the stored plan, the plan that arrived during the wait, and standing orders for the third.
- `src/main/gameIpcHandlers.test.ts`: the precomputed-payload tests (`testGameReadyPrecomputedWithOrders`, `testGameReadyForwardsAiAirStrikeFerryAndEmbarkOrders`) become pool-based: store pending orders for `'opponent'` and check that `deps.ready` receives them, including air strikes and ferries. This is a named, expected test change.
- `src/main/ipc/deferredResolutionPlaybackConsult.test.ts`: add a case where the deferred entry runs consults for two seats and both finish.

**Docs.** `doc/hybrid-ai.md`: rewrite the every-turn and event-driven paragraphs for seats: who consults when, how Ready gathers, what runs on timeout.

**Done when.** `npm test` passes and this search has no output:

```powershell
Get-ChildItem -Path src/main -Recurse -Filter *.ts | Select-String -SimpleMatch -Pattern 'LEGACY_SINGLE_AI_SEAT_ID'
```

---

## Phase 3.9: Renderer switch to the pool

**Goal.** The renderer stops running and buffering AI consultations. It starts and stops planning through the pool, polls the pool for statuses and dispatches, and presses Ready. A two-sided match looks and behaves as before, with one change: the AI's air strikes and ferries planned in the background now reach the turn (the bug fix from [E8](multi-commander-execution-plan.md#engineering-decisions-frozen-unless-the-owner-overrides)).

**Read first.** `src/renderer/openRouter/openRouterRuntime.ts` (`startBackgroundRequestIfAllowed`, `stopOpponentPlanning`), `src/renderer/openRouter/precomputedAiState.ts`, `src/renderer/openRouter/aiPlanningState.ts`, `src/renderer/gameplay/readyHandler.ts` (`buildReadyPayload`, `handleReadyButtonClick`), `src/renderer/openRouter/openRouterUiHelpers.ts` (`renderOpponentStatus`, `setReadyButtonLabelAiWait`), `src/renderer/core/state.ts` (the `precomputedAi*`, `backgroundRequestInFlight`, `openRouterGameCost`, `eventDrivenInitialConsultationDone`, `tacticalOpponentDraft` fields).

**Change.**

1. Run on: call `gameApi.startCommanderPlanning()`. Run off, New game, model change: `gameApi.stopCommanderPlanning()` (the model change path now goes through `setSeatCommander` for the `'opponent'` seat, phase 3.4).
2. Poll `gameApi.readCommanderPool()` once a second while the match is in planning and Run is on, and once after every Ready returns. For each drained dispatch, call the existing `showAiStrategyToast({ message, strategy })` (the interface stage changes how messages are shown).
3. Ready: while any status is `'planning'`, keep today's waiting behavior (the "AI: MM:SS" label from `setReadyButtonLabelAiWait`, measured from the longest `planningElapsedMs`). Then call `gameApi.ready(...)` without any precomputed fields.
4. The footer status (`renderOpponentStatus`) derives "planning off", "planning on", and "planning…" from the pool statuses: planning if any AI seat is `'planning'`.
5. Cost: the footer and the Opponent tab show the sum of `cost_usd` over the snapshot's seats. Delete `S.openRouterGameCost` and its accumulations.
6. Delete `S.precomputedAiOrders`, `precomputedAiRangedOrders`, `precomputedAiEmbarkOrders`, `precomputedAiStrategy`, `precomputedAiMessage`, `backgroundRequestInFlight`, `eventDrivenInitialConsultationDone`, `tacticalOpponentDraft` and every function that only served them (`applySuccessfulPrecomputedAiResult`, `startBackgroundRequestIfAllowed`, `isWaitingForPrecomputedAiOrders`, and their helpers). The tactical opponent draft is now produced and held in main by the pool; `commitHumanTacticalDraftOrders` reads it from there instead of from the renderer's payload.
7. Delete the precomputed fields from `GameReadyIpcPayload` and the `requestAiOrders` IPC channel with its handler, now that nothing calls them.

**Tests.** No renderer unit tests exist. `npm test` (renderer type check) and `npm run build:renderer` must pass. Keep `src/shared/opponentPlanningStatus.test.ts` passing; if you move status-derivation logic into `src/shared/`, test it there.

**Manual check.** Ask the human to run `npm start` and:

1. Start a two-sided regional match from today's screen with "No model". Play three turns. The footer shows the commander as having no model; turns resolve; standing orders (none at first) and the sweep run.
2. Turn Run on and off; start a new match while on. No errors in the AI activity log or the developer console.
3. Optional, only if the human chooses to spend: one turn with a cheap model to confirm a message toast appears and the cost goes up.

**UI smoke.** Run it and report any FAIL.

**Stage exit.** Report the output of:

```powershell
Get-ChildItem -Path src -Recurse -Filter *.ts | Where-Object { $_.Name -notlike '*.test.ts' -and $_.Name -ne 'seatIds.ts' } | Select-String -SimpleMatch -Pattern "'opponent'"
```

Every remaining hit should be in the renderer's interface code (stage 4) or in the two-sided setup translation (stage 5). Explain each one.

**Done when.** `npm test` and `npm run build:renderer` pass and the human confirms the manual check.
