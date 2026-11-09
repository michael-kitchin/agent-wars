# Multi-commander games, stage 5: finish

Audience: a **lower-quality coding agent**. Read [multi-commander-execution-plan.md](multi-commander-execution-plan.md) first. Its working rules and verification bar apply here. Stages 1 to 4 must be complete.

Goal of this stage: leave one way to do each thing. Remove the two-player leftovers the earlier stages kept on purpose, bring every document in line with the code, and hand the owner a play-test checklist for the first paid games.

## Phases

| Phase | Title | Verifies with |
| --- | --- | --- |
| 5.1 | Remove the two-player leftovers | `npm test`; search audits |
| 5.2 | Documentation sweep | Doc audit list in your report |
| 5.3 | Owner play test | The owner's games |

---

## Phase 5.1: Remove the two-player leftovers

**Goal.** No code path still describes the match as "the human and the AI". Seat ids remain as data; the literals `'human'` and `'opponent'` stop appearing in logic.

**Change.**

1. **New-game translation.** Delete the two-seat translation of the old payload fields in `resetGameForNewMatch` (stage 1, phase 1.4, step 3) and the old fields themselves from `ResetGameForNewMatchOptions`. `resetGameForNewMatch()` with no `seats` builds a default two-seat match: a human seat and one AI seat on the first two homes `resolveNewMatchSeats` would pick. `withTempGameDb` and every test that calls `resetGameForNewMatch()` with no options must keep passing unchanged. Tests that passed `humanHomeRegion` / `aiHomeRegion` / `humanSideGroupId` / `aiSideGroupId` switch to `seats`; name each file in your report.
2. **Snapshot.** Delete `humanHomeRegion`, `aiHomeRegion`, `humanHomeRegionHexes`, and `aiHomeRegionHexes` from `GameStateSnapshot`, and the two-seat view in `loadScenarioState` (delete `loadScenarioState`'s home fields; keep `scenarioId` if anything reads it). Move every remaining consumer to `seats` and `homeRegionHexesBySeat`. Find them with `Get-ChildItem -Path src -Recurse -Filter *.ts | Select-String -SimpleMatch -Pattern 'humanHomeRegion', 'aiHomeRegion'`.
3. **Constants.** Delete `LEGACY_SINGLE_AI_SEAT_ID` from `src/shared/seatIds.ts`.
4. **Naming.** Rename what still says opponent or AI when it means "a seat": for example `TopBarStats.opponentHome`, `opponentPlanningStatus.ts` and its labels, `#opponent-status-line` and the `opponent-*` element ids, `applyParsedOpponentCallbacks.ts`. For each rename, update the UX docs' Code Entry Points and `doc/ux/control-tooltips.md` Source Anchors. Keep the user-facing words as stages 3 and 4 set them.
5. **A lint rule that keeps it this way.** Add `eslint-rules/seat-id-literals-plugin.cjs` (new), in the style of the existing plugins in `eslint-rules/`, with one rule, `no-seat-id-literals`: report any string literal in value position (not in a type annotation) that equals `'opponent'`, `'opponent2'`, `'opponent3'`, `'opponent4'`, or `'neutral'`. The message says to use the constants and predicates in `src/shared/seatIds.ts`. Register it in `eslint.config.js` for `src/**/*.ts`, excluding `src/shared/seatIds.ts`, `**/*.test.ts`, and `**/testSupport/**`. Leave `'human'` out of the rule: it is also the `SeatKind` value, and the audit below covers it. `npm test` runs the linter, so the rule takes effect at once; fix every report it gives.
6. **Dead code.** `src/main/gameDb/seeding/seedUnits.ts` has a legacy world seeding path that the reset never reaches (the reset always writes the region-versus-region scenario). Confirm with `Get-ChildItem -Path src/main -Recurse -Filter *.ts | Select-String -SimpleMatch -Pattern 'scenario_id', 'REGION_VS_REGION_SCENARIO_ID'` that no other scenario id is ever written. If so, delete the legacy path and its helpers. If not, stop and report.

**Audits for your report.** Run each and paste the output:

```powershell
Get-ChildItem -Path src -Recurse -Filter *.ts | Where-Object { $_.Name -notlike '*.test.ts' -and $_.Name -ne 'seatIds.ts' } | Select-String -SimpleMatch -Pattern "'opponent'", '"opponent"'
```

```powershell
Get-ChildItem -Path src -Recurse -Filter *.ts | Where-Object { $_.Name -notlike '*.test.ts' -and $_.Name -ne 'seatIds.ts' } | Select-String -SimpleMatch -Pattern "'human'", '"human"'
```

```powershell
Get-ChildItem -Path src -Recurse -Filter *.ts | Select-String -SimpleMatch -Pattern "'human' | 'opponent'", "Record<'human'"
```

```powershell
Get-ChildItem -Path src -Recurse -Filter *.ts | Select-String -SimpleMatch -Pattern 'humanHomeRegion', 'aiHomeRegion', 'LEGACY_SINGLE_AI_SEAT_ID'
```

The first, third, and fourth must be empty. Every hit of the second must be a legitimate non-seat use (for example a CSS class or a log message); justify each, or replace it with `HUMAN_SEAT_ID` / `isHumanSeatId`.

**Done when.** `npm test` and `npm run build:renderer` pass, `npm run ui:smoke -- --label leftovers` passes, and the audits are clean.

---

## Phase 5.2: Documentation sweep

**Goal.** Every maintained document describes the code as it now is. Follow [AGENTS.md](../AGENTS.md) and leave the historical documents alone.

**Change.** Read each document below in full and fix every statement that still describes two fixed players, one AI opponent, the Opponent tab, "You win!" / "You lose.", human-versus-AI colors, or the old new-game rows. Take numbers and names from the code and name the symbol.

- `doc/README.md`: the index roles and statuses; the engine constants table (the rows stages 1 and 2 added must name symbols that still exist); the shipping-version paragraph (do not bump the version; say what is built).
- `doc/how-to-play.md`: setup with several sides and Observe mode; commanders and doctrine; knockout and Neutral; both win rules; reading the Commanders tab and Reports.
- `doc/hybrid-ai.md`: the commander pool, per-seat consults, timeouts, cost, doctrine.
- `doc/combat-rules-v3.md`: a final read for consistency between §4 (resolution), §5 (flow), §9 (sealift), §12 (tactical), §14 (win conditions), and the Knockout and Neutral section.
- `doc/ai-commander-prompts/`: a final read against the builders.
- `doc/ux-specification.md`: the routing table and element matrix list every new or renamed UX document (commander popover, Commanders tab, Observe mode).
- Every `doc/ux/*.md` file stage 4 touched: Code Entry Points name existing symbols; Known Deviations lists only real, accepted bugs.
- `doc/ui-style-guide.md`: the implementation-status note (multi-commander games are built; save/load, diplomacy, and networked multiplayer are not).
- The root `README.md`: any feature list or description that says one AI opponent.
- `doc/project-instructions.md` and `doc/coding-prompts-1.md`: only facts the work made wrong (paths, script names). Leave persona and prompt wording as written.

**Report.** For each document: "updated" with a one-line summary, or "checked, no change".

**Done when.** `npm test` passes (it checks notices and names) and the report covers every document listed.

---

## Phase 5.3: Owner play test

**Goal.** The owner plays the first real games. The agent prepares, the owner plays, and the agent fixes only what the owner asks for, one finding per change set.

**Prepare** (and then stop): a short checklist in your report, with these games and what to watch.

1. **One human, three AI commanders**, regional Western Asia North, the cheapest tool-capable models the owner picks, three different doctrines, fog on. Play until one side is knocked out. Watch:
   - All three commanders plan at the same time; the footer counts them; Ready waits for them.
   - Each commander's cost and consultation count rise only when it consults.
   - Messages arrive with the right sender; strategies stay hidden.
   - The knocked-out side's land turns neutral, its tokens turn black, its garrisons fire on units in range, and its loaded ships (if any) sail to land.
   - The tactical battles list offers only two-party battles.
2. **Observe mode**, four AI commanders, ten turns with auto-advance. Watch: View as with fog on and off; nothing waits on the human; standings at the end if it ends.
3. **Global, three sides, turn limit 20.** Play to the limit. Watch: the Cities readout and its tooltip; "Turn n of 20"; standings by city hexes. If a turn would knock out every side still playing, the match ends that turn instead: those sides are not marked Out, and the standings rank them by city hexes. A tie names every side that shares first.
4. **Two-sided regression**: one regional match as before, against one cheap model.

For each game, ask the owner to keep the AI activity log (copy from the Commanders tab) and the developer-console errors, if any.

**Done when.** The owner says the play test is complete. Findings become new phases or new plans, at the owner's direction; do not start them on your own.
