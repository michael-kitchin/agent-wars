# Credits and Mercenaries

Audience: a lower-quality coding agent. Implement one phase at a time. Stop after each phase and report:

- the files you touched;
- the test results;
- the line count of every file in the budget table that you edited, before and after;
- the `check:circular` output.

Wait for the human before the next phase. If a phase fails, revert that phase. If a line in this plan disagrees with the code, trust the code, stop, and report the discrepancy. Do not guess. The one exception is a type error the compiler reports for a widened type, covered in Phase 2.

## Prerequisite

The fortification work is finished, including its documentation. Before Phase 1, confirm that `npm test` passes on your tree. The fortification plan is [`.spec/fortifications-execution-plan.md`](fortifications-execution-plan.md), or [`.spec/completed/fortifications-execution-plan.md`](completed/fortifications-execution-plan.md) once it is filed there.

This plan builds on that work:

- the non-unit build-queue path: `BuildQueueItemType`, `ALL_BUILD_QUEUE_ITEM_TYPES`, `buildQueueItemCostFor`, `getAvailableBuildQueueItemTypes`, and the `fortification` branch of the production spend loop;
- `fortifiedCount` on `getStrategicInfrastructureForHex` and on `GameStateSnapshot.strategicInfrastructure`;
- `isHexExploredInSnapshot` in `src/shared/fortificationSnapshotRules.ts`;
- the AI production changes: `BUILD_QUEUE_ITEM_SCHEMA_ENUM`, the `productionOrders` enum, `buildFortificationProductionRulePart`, and the `Fortified` column;
- `fortificationLines` on the turn-update toast, and `fortificationUpdateLinesFor`;
- `EXPECTED_USER_VERSION = 25`.

If any of these is missing, or `npm test` fails before you change anything, stop and report.

## Goal

A power can turn production into credits, hold them in a national treasury, and spend them on mercenaries.

- **Credits.** A new build-queue item, `credits`, costs one infantry's price in production on the active map and adds `CREDITS_PER_ITEM` (20) credits to the treasury on every map.
- **Where you can build.** A side may build only on its home-region hexes and on hexes where it has a unit or a fortification at the end of the turn. Elsewhere its queue pauses and banks points.
- **Hiring.** A side may raise new mercenaries on explored hexes outside other sides' home regions, or rehire a Neutral unit it can see. Hired units arrive at the end of the turn and take orders the next turn.
- **Upkeep.** Each mercenary costs upkeep every turn. When the treasury cannot pay, random mercenaries desert to Neutral.
- **Display.** Mercenary tokens carry a small `$`. The top bar shows credits against upkeep. A Hire popup, or a Hire tab beside Build, places hire orders.
- **AI.** The AI sees the treasury, understands the rules, and can queue credits and hire.

## Background

These facts were read from the branch with the fortification work finished. Re-check each one where a phase uses it.

- **Units.** `units(id, player, unit_type, display_order, h3_index, birth_* …, formed_turn)` in [`src/main/gameDb/schema.ts`](../src/main/gameDb/schema.ts). `player` is a seat id or `'neutral'`. There is no migration code: a schema change edits `getFullDdl` and bumps `EXPECTED_USER_VERSION` in [`src/main/gameDb.ts`](../src/main/gameDb.ts). The one product-code `INSERT INTO units` is `insertUnitRow` in [`src/main/gameDb/unitInsert.ts`](../src/main/gameDb/unitInsert.ts).
- **Unit ids** encode the side that first created the unit (`h1-i3`, `a2-t7`). `playerIdCodeFor` throws for Neutral, so Neutral can never mint an id. A unit keeps its id for life. Several places guess the owner from the id with `unitIdOwnerFromId`; Phase 4 fixes the ones a hired unit would mislead.
- **Creating a unit.** `spawnProducedUnitsForHex` in [`src/main/gameActions/controlAndProduction.ts`](../src/main/gameActions/controlAndProduction.ts) is module-private. Per unit it calls, in this order: `allocateNextUnitIdOrdinal`, `formatStrategicUnitId`, `allocateNextUnitDisplayOrder`, `insertUnitRow` with `resolveUnitBirthOrigin` and `formedTurn: turnNumber + 1`, and `insertMissileHoldOrder` for a missile.
- **Knockout.** `applyKnockout` in [`src/main/gameActions/knockoutConsequences.ts`](../src/main/gameActions/knockoutConsequences.ts) runs in its own `BEGIN`/`COMMIT`. It deletes the seat's private rows (`deleteSeatPrivateRows`), turns its hexes Neutral and clears their queues, runs `UPDATE units SET player = 'neutral' WHERE player = ?`, reads `getGameState()`, and gives each unit a Neutral `defend` standing order (missiles get `insertMissileHoldOrder`). Transport rows survive; next turn `prepareNeutralTransportsForTurn` lands or deletes a loaded Neutral ship.
- **End of turn.** `finalizeReadyTurnAfterMelee` in [`src/main/gameActions/meleeInterceptReadyFinalize.ts`](../src/main/gameActions/meleeInterceptReadyFinalize.ts) is the single tail of both the normal Ready path and the melee-intercept resume. Its order is: melee deletes, transport outcome, fortification reports, control resolution, `destroyAirUnitsWithInvalidBase`, air-strike tallies, `processProductionAfterControlResolution`, `const finalUnits = listUnitsForSnapshot()`, outcome and knockouts, pending-order deletes, the turn increment, the fog refresh, and `saveDatabase()`. Ready cannot run while a tactical battle is active (`failIfTacticalBattleActive`).
- **Production.** `processProductionAfterControlResolution`:
  - skips a hex with an empty queue and Keep building off, without banking;
  - sets `points` to stored points plus `urban_hex_count` (0 on a neutral border hex);
  - spends front to back: the `fortification` branch, then the unit branch, where a capped type pauses the queue with `break`;
  - banks leftovers with `setBuildProgressPointsForHex`;
  - counts units for caps with `SELECT player, unit_type, COUNT(*) … FROM units GROUP BY player, unit_type`.

  `getAvailableBuildQueueItemTypes` also drives queue pruning (`pruneBuildQueueForInfrastructureState`). A rule folded into it would delete rows instead of pausing them, so the new where-you-can-build rule is a separate check.
- **Caps.** Besides that SQL, `getPlayerUnitCountsByType` in [`src/shared/unitCountsByType.ts`](../src/shared/unitCountsByType.ts) counts every unit of a player for the top bar, the production overlay, the AI briefing, and `productionCaps.ts`.
- **Snapshot.** `GameStateSnapshot` is built by `getGameStateSnapshot` in [`src/main/gameDb/fogState.ts`](../src/main/gameDb/fogState.ts) and filtered by `getGameStateForPlayer`. The facade `getGameStateForPlayer` in `src/main/gameDb.ts` is what the renderer and the AI receive. `strategicBuildQueueTotals`, `strategicControl`, and `strategicInfrastructure` are not filtered by fog. Units are filtered to the viewer's own units plus units on visible hexes. A new unit field passes through the filter untouched.
- **Fog.** `isHexExploredForPlayer(ops, seat, h3)` in `fogState.ts` reads `player_hex_intel`. A forced-visible home hex can lack that row until the next refresh. `player_unit_intel` stores no owner, so stale "ghost" markers take their color from the unit id.
- **Tech tier.** `techLevelForBirthHex(h3)` in [`src/main/techBonus/techLevelForBirthHex.ts`](../src/main/techBonus/techLevelForBirthHex.ts) returns `'advanced'` when the hex's generated city-cell count reaches `advancedTechMinUrbanCells()`, else `'basic'`. A unit's tier is the tier of its birth hex. Snapshot units carry `techLevel` only when the tech bonus is on (`readPersistedOriginBonusSettings(ops).techBonusEnabled`).
- **Random draws at end of turn** must not use the combat generator. Use `hashStringToUint32` ([`src/shared/stableHash.ts`](../src/shared/stableHash.ts)) and `createSeededRng` ([`src/main/seededRng.ts`](../src/main/seededRng.ts)), as fortification placement does.
- **Build popup.** It opens only from `.build-entry-btn` markers in `#build-entry-layer`, built by `syncBuildEntryButton` in [`src/renderer/renderer.ts`](../src/renderer/renderer.ts) on explored, human-controlled hexes with production. Both the layer's click handler and the canvas hit-test call `handleBuildEntryClick(h3, x, y, shift)`. `renderBuildQueueIntoMount(mount, h3)` in [`src/renderer/gameplay/buildQueuePopup.ts`](../src/renderer/gameplay/buildQueuePopup.ts) rebuilds the whole mount it is given. Two source-pinning tests read `syncBuildEntryButton` and `drawStrategicProductionOverlays` as text.
- **Refresh.** `refreshGameStateAfterBuildQueueChange` in [`src/renderer/core/stateSnapshot.ts`](../src/renderer/core/stateSnapshot.ts) redraws the map but does not refresh the top bar.
- **Turn report.** `buildOtherTurnUpdatePrimaryLines` in [`src/shared/consolidatedTurnUpdateToast.ts`](../src/shared/consolidatedTurnUpdateToast.ts) builds count-only Updates lines. Lines that name places are built in the renderer and passed in, like `fortificationLines`. `readyHandler.ts` shows the toast only on turns with playback; leave that gate alone. A new `ReadyResult` field must also be added to `pickReadyResolutionIpcMirrorFields` and its field union in [`src/main/ipc/readyIpcResolutionMapping.ts`](../src/main/ipc/readyIpcResolutionMapping.ts), or it never reaches the renderer.
- **AI tools.** `requestOrdersToolLoop.ts` routes a tool by substrings of its name: `order` goes to standing orders, `build` or `production` to production, and anything unmatched to pathfinding. A new tool needs an explicit branch. Tool arguments named `hex` are decoded from briefing codes only for listed tool names (`openRouterToolArgsHex.ts`), and results are re-encoded only for listed tool names (`openRouterToolResultHex.ts`).
- **Import cycles.** `npm run check:circular` already fails with the existing cycles. This work must not change its output.

## Locked decisions

These came from the human. Do not reopen them.

- **Treasury.** One treasury per seat, starting at 0, never negative. It is stored in a new table. Neutral has none. A knocked-out seat's treasury is deleted. Only the seat itself sees its treasury.
- **Credits item.** `credits` is a build-queue item beside the unit types and `fortification`, listed last.
  - One item costs the map's infantry price in production (`1 ×`; 20 on the global map, 60 on Western Europe, 8 on Middle Africa South) and adds `CREDITS_PER_ITEM` (20) credits on every map. A credit is therefore worth the same everywhere, and every credit price below is the same number on every map.
  - It is available wherever the hex has production. It is never capped and never pauses on its own. It may be the Keep-building choice.
  - Credits produced at the end of a turn reach the treasury before that turn's upkeep and hires.
- **Where you can build.** A seat may build on a hex it controls only when, at the end of the turn, the hex is in its own home region, or holds at least one of its units (any type, mercenaries and units aboard ships included), or holds a fortification.
  - Otherwise the queue pauses like a cap: no points are spent, the turn's points bank, and the queue and Keep building stay. There is no tribute.
  - A hex with an empty queue and Keep building off stays idle and banks nothing, as today.
  - Control change still wipes a queue.
- **Mercenary units.**
  - A mercenary is a seat-owned unit flagged `is_mercenary`. Neutral units are never mercenaries. Missiles can never be mercenaries.
  - Mercenaries do not count toward unit caps.
  - Anyone who can see a unit can see that it is a mercenary.
  - A mercenary's token shows a small `$`, low and centered.
  - Control of a mercenary's birth hex never changes who owns the mercenary.
- **Upkeep.** `ceil(reference cost × tech multiplier ÷ 8)` credits per turn.
  - The reference cost is the unit type's global-map price (infantry 20, armor 40, naval 100, air 60), on every map. Regional maps scale their production prices, but credits do not scale, so upkeep in credits must not either. Pricing upkeep from each map's own costs would make whole-credit rounding up to 78% more expensive on the cheapest maps.
  - The tech multiplier is 2 for an Advanced unit when the tech bonus is on, and 1 otherwise.
  - So upkeep is, on every map: infantry 3 (Advanced 5), armor 5 (10), naval 13 (25), air 8 (15).
- **Fees.** Raising a mercenary costs one turn of upkeep. Rehiring a Neutral unit costs two turns of upkeep. The fee is the first turn's upkeep, so a unit hired this turn pays no other upkeep this turn.
- **Raising** creates new units on a hex. All of these must hold:
  - the seat has explored the hex;
  - the hex is not in the home region of another seat that is still in the match;
  - no unit of any other owner, Neutral included, is in the hex;
  - the hex holds no fortification of another owner;
  - the hex's production can pay the unit.

  The unit types are the ones the hex could build, minus missiles. Per turn, the unit cost of all units raised on one hex is at most twice its production (`urban_hex_count`; 0 on a neutral border hex). Capacity is measured in production points against the map's own unit prices, so it scales with each map the way building does. A raised unit belongs to the seat, is a mercenary, and its birth hex is the hex it was raised on.
- **Rehiring** takes over a Neutral unit the seat can see.
  - The unit must not be a missile, must not be in another active seat's home region, must not be in a hex that holds another owner's fortification, must not carry cargo, and must not be aboard a ship. The fortification rule matches raising: control of such a hex cannot change, so a rehired air unit there would lose its base.
  - A rehired unit that shares its hex with Neutral units or another side's units makes that hex contested, so it fights there at the next resolution. The seat sees that before it hires.
  - It keeps its id, birth origin, tech tier, and formation date. It gets a new display number under its new owner and becomes a mercenary.
  - Its Neutral standing order is deleted. The new owner gives it orders next turn.
- **Hire orders** are placed during planning and resolve at the end of the turn.
  - They are stored in a new table and can be removed until Ready. All of them are deleted after the end-of-turn step.
  - Placement does not check funds. An order the treasury cannot pay at the end of the turn is not filled, and costs nothing.
  - The human can place orders only outside tactical battles.
- **End-of-turn step**, after production and before knockouts:
  1. **Upkeep.** Each active seat pays upkeep for every mercenary it already had.
  2. **Desertion.** If the treasury cannot pay, a seeded draw picks deserters until the remaining upkeep fits.
     - Mercenaries that neither carry nor ride are drawn first, in random order.
     - Mercenary ships that carry cargo are drawn only after all of those, in random order. A ship that deserts takes its cargo with it, and the cargo turns Neutral too.
     - Mercenaries aboard any ship are never drawn on their own. Those aboard a ship that is not a mercenary can never desert: they are paid from whatever is left after the draw, and any shortfall on them is forgiven.
     - After the draw, any drawn unit whose upkeep still fits in what is left is kept and paid, latest drawn first, so the treasury pays as many as it can and loaded ships still go last.
     - Deserters become Neutral exactly as a knockout makes them: they keep their hex and get a Neutral `defend` order. They stop being mercenaries. Control does not change this turn.
     - A deserter stays in its hex even when its old side still has units there. That hex then holds two owners, and it fights in melee at the next resolution unless one side leaves, as any hex with two owners does (the human may get the usual melee-intercept prompt). This is intended: unpaid troops turn on whoever they share a hex with.
  3. **Hires.** Every seat's orders are taken together in one seeded random order. Each order is checked again against the board as it now stands, charged, and filled.
     - When two seats want the same unit, the first in that order gets it. The other order is not filled and costs nothing.
     - A raise that runs out of credits or capacity fills as many units as it can.
     - Hired units take orders next turn.
- **Fog.** A seat may rehire only units it sees, and raise only on hexes it has explored. Whether another owner's unit is in the hex is judged on what the seat sees when the order is placed, and on the true board when it resolves.
- **UI.**
  - On a hex where the human may build and may also hire, the build popup has two tabs, Build and Hire.
  - On a hex where the human may only hire, a Hire marker opens a Hire-only popup.
  - The multi-hex build popup stays build-only. Shift on a Hire marker acts as a plain click.
- **Warning.** The top bar and the AI briefing show credits against upkeep and this turn's hire fees, and warn when credits fall short.
- **Turn report** (human, Updates): credits added, mercenaries hired, units that deserted, hire orders not filled, and the hexes where building paused.
- **AI.** The AI sees its treasury, upkeep, warnings, rehire candidates, and raise options near its forces. It may queue `credits` and place hire orders through the envelope or through tools.
- **Database version bump is accepted** (25 → 26).

## Out of scope

- Bidding between seats, distance-based pricing, tribute from paused queues.
- Hiring missiles, or rehiring a loaded ship or a unit aboard one.
- Multi-hex hiring, and hiring inside a tactical battle.
- Turn-report lines for the AI, and loss-section lines for deserters.
- A `$` on tokens that are moving or being removed during resolution playback.
- A paused note in the multi-hex popup or the hex tooltip. The map label's `∞t` shows the pause.
- Turn replay. Saves from earlier versions. Release notes.

## Working rules

- **Rule files.** Read every `.mdc` file in `.cursor/rules/` and [`AGENTS.md`](../AGENTS.md) before the first phase, and follow them. The rules below restate the ones that matter most here. Where they differ, the rule files win.
- **One change.** This whole plan is one change for AGENTS.md's "Keep `doc/` Current" rule. Nothing ships between phases, and Phase 9 updates `doc/` for all of it.
- **Shell.** Windows PowerShell at `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`.
- **Line endings.** Keep each file's existing line endings. New files use CRLF. Check line endings before you save an existing file, and never convert a file.
- **Code blocks** in this plan are the contract. They omit orienting comments and log calls. Add both, in the shape of the file you are editing.
- **Orienting comments.** Put them on every new or changed function, field, constant, module-level variable, interface, and interface member, exported or not: Purpose, When to use, Expected outcome, Exceptions.
  - Interface members describe the contract. Implementations describe the approach.
  - Write sentences that say what the code does and why. Never write filler such as "Supports maintainability".
  - When you change or move an existing declaration whose comment is filler, replace its comment with a real one.
- **Logging:** `logDebug` at the start of each new or changed public main-process function, `logError` on every caught exception, `logTrace` on getters that do not change state. Log ids, hex indexes, counts, credits, and turn numbers. Never log a secret or an API key, and never put one in a table this plan adds.
- **Errors:** every caught error either becomes a message in a result object or is logged and rethrown. A catch that turns an error into a result also logs it with `logError`. Never swallow an error silently.
- **Player-facing and model-facing text** is full sentences ending with a period. Exceptions follow the existing style there: tooltip label/value pairs, select-option labels, tab and button labels, table headers, and marker labels. Each string is a named exported constant, or a named function for a string with values in it, listed in the text table below. Tests and docs point at those names.
- **Immutability:** `const` for bindings that are not reassigned, `readonly` on interface members and array types that are not mutated, `ReadonlyMap` and `ReadonlySet` where callers must not mutate. Where a `readonly` array meets an existing mutable field, copy it with `[...array]`.
- **File size:** desirable 600 lines, hard limit 1000. New logic goes in the new files this plan names. When you replace a filler comment on a declaration you touch in a budgeted file, keep the new comment no longer than the old one. The files below are already past 600, or close to it, and may change only as stated. Before Phase 1, measure each one and put the numbers in your first report. The "Lines now" column was measured on the finished fortification tree; if yours differ, report it. Report every file that crosses 600.

  | File | Lines now | Allowed change, summed over all phases |
  | --- | --- | --- |
  | `src/main/gameActionsProduction.test.ts` | 1018 | none, unless Phase 3 needs it; then net zero lines |
  | `src/renderer/entryCallbacks.ts` | 934 | none |
  | `src/renderer/core/state.ts` | 924 | at most 1 line |
  | `src/shared/ipc/readyTypes.ts` | 840 | at most 70 lines |
  | `src/main/gameDb.ts` | 831 | at most 20 lines |
  | `src/renderer/rendering/gameScene.ts` | 812 | at most 2 lines |
  | `src/renderer/renderer.ts` | 770 | at most 22 lines |
  | `src/main/preload.ts` | 767 | at most 36 lines |
  | `src/renderer/gameplay/buildQueuePopup.ts` | 765 | at most 16 lines |
  | `src/main/openRouter/orderResponseParsing.ts` | 736 | must end below its starting count (Phase 8 moves code out) |
  | `src/main/gameActions/gameActionsCore.ts` (724), `src/main/gameActions/airStrikeResolution.ts` (699), `src/renderer/map/initCore.ts` (662) | — | none |
  | `src/shared/ipc/gameApiTypes.ts` | 681 | at most 45 lines |
  | `src/main/gameActions/buildQueue.ts` | 666 | at most 20 lines |
  | `static/frameChrome.css` | 657 | at most 6 lines |
  | `src/main/tacticalBattle/computeTacticalBattleSnapshot.ts` | 691 | at most 1 line |
  | `src/main/ipc/readyIpcResolutionMapping.ts` | 628 | at most 14 lines |
  | `src/main/openRouter/promptSpec/gameRuleText.ts` | 632 | at most 3 lines |
  | `src/main/main.ts` | 611 | at most 2 lines |
  | `src/main/openRouter/requestOrdersToolLoop.ts` | 606 | at most 3 lines |
  | `controlAndProduction.ts` (587), `fogState.ts` (586), `requestOrdersFlow.ts` (571), `promptText.ts` (558), `controlTooltipText.ts` (563), `wiredEntryCallbacks.ts` (544) | — | must stay at or under 600 |

- **Arguments:** at most 6 per function. Use an options object above that.
- **Imports:**
  - `src/shared/` imports nothing from `src/main/` or `src/renderer/`.
  - No non-test module under `src/main/gameDb/` imports from `src/main/openRouter/` or `src/main/gameActions/`, or from the `src/main/gameDb.ts` facade.
  - `src/main/mercenaryHireRules.ts` and `src/main/mercenaryPayroll.ts` import no database code.
  - A type-only import uses `import type`.
- **Naming:** follow [`doc/naming-conventions-contract-v1.md`](../doc/naming-conventions-contract-v1.md). The file names in this plan already pass `npm run naming:check`.
- **Tests:**
  - Cover happy paths and essential failure contracts only, not implementation details. Do not test constants, text, or IPC registration.
  - `npm test` is the gate. A new `*.test.ts` under `src/main` or `src/shared` is picked up automatically.
  - Where this plan names an existing test that changes, change only what it says.
  - Tests that touch a database use the helpers in [`src/main/testSupport/`](../src/main/testSupport/) and temp directories removed in `finally`, in the setup pattern of `src/main/missileProduction.test.ts`.
- **Circular imports.**
  - Before the first phase, run `node scripts/check-circular-deps.cjs` once and keep its full output as the reference. Include it in the first report.
  - When a phase adds a module, also run `npm run check:circular`. It passes when its output is identical to the reference. If it differs in any way, stop and report it.
  - Do not refresh `scripts/circular-deps-baseline.json` or grow `scripts/renderer-typecheck-baseline.json`.
- **Renderer build.** When a phase edits `src/renderer`, `src/shared`, or `static/`, also run `npm run build:renderer`. Leave `static/renderer.js` changed.
- **No hiring, no change.** Apart from two deliberate changes, a match where nobody queues credits or places a hire order must resolve exactly as before: the same dice, the same placements, and the same turn-report text. The two changes are the where-you-can-build rule (Phase 3), and, after a knockout, Neutral units no longer counting as their old side when the AI decides whether to consult, when the turn report decides whether a kill involved the viewer, or when stale markers are colored (Phase 4). The end-of-turn step returns before opening a transaction or drawing a random number when no mercenary and no hire order exist. The build menus, the top bar, the map markers, and the AI's prompts do change by design.
- **Never commit or push.** Do not put phase numbers, or words from this plan's headings, into code, comments, tests, configuration, or `doc/`.
- **Docs timing.** `doc/` is updated only in Phase 9. Every other phase ends with no `doc/` edits.

## Names and constants

Spell these exactly. Later phases refer to them.

**Rules** (new [`src/shared/mercenaryRules.ts`](../src/shared/mercenaryRules.ts) unless the row says otherwise)

| Name | Value |
| --- | --- |
| `CREDITS_QUEUE_ITEM` (in new `src/shared/creditsRules.ts`) | `'credits'` (as const) |
| `CREDITS_ITEM_INFANTRY_MULTIPLIER` (same file) | `1` |
| `CREDITS_PER_ITEM` (same file) | `GLOBAL_GAME_MAP.rules.infantryCost * CREDITS_ITEM_INFANTRY_MULTIPLIER` (20), the credits one item adds on every map |
| `MERCENARY_UPKEEP_DIVISOR` | `8` |
| `MERCENARY_ADVANCED_TECH_MULTIPLIER` | `2` |
| `MERCENARY_REHIRE_FEE_MULTIPLIER` | `2` |
| `MERCENARY_RAISE_CAPACITY_MULTIPLIER` | `2` |
| `HIRE_COUNT_MIN`, `HIRE_COUNT_MAX` | `1`, `99` |
| `HIREABLE_UNIT_TYPES` | `['infantry', 'armor', 'naval', 'air'] as const` |
| `HireableUnitType` | `(typeof HIREABLE_UNIT_TYPES)[number]` |
| `isHireableUnitType(value: unknown): value is HireableUnitType` | type guard |
| `HireKind` | `'raise' \| 'rehire'` |
| `mercenaryTechMultiplier(techLevel: TechLevel \| undefined): number` | `MERCENARY_ADVANCED_TECH_MULTIPLIER` for `'advanced'`, otherwise `1` |
| `mercenaryReferenceCost(unitType: HireableUnitType): number` | the type's price in `GLOBAL_GAME_MAP.rules` (`infantryCost`, `armorCost`, `navalCost`, `airCost`). Always the global profile. Never `activeGameMap()`. |
| `mercenaryUpkeepFor(unitType: HireableUnitType, techLevel: TechLevel \| undefined): number` | `Math.ceil(mercenaryReferenceCost(unitType) * mercenaryTechMultiplier(techLevel) / MERCENARY_UPKEEP_DIVISOR)` |
| `mercenaryHireFee(kind: HireKind, upkeep: number): number` | `upkeep` for `'raise'`, `upkeep * MERCENARY_REHIRE_FEE_MULTIPLIER` for `'rehire'` |
| `raiseCapacityForHex(urbanHexCount: number, neutralBorder: boolean): number` | `0` on a neutral border, otherwise `max(0, trunc(urbanHexCount)) * MERCENARY_RAISE_CAPACITY_MULTIPLIER` |
| `creditsItemCost(): number` (in `src/shared/gameRules.ts`) | `activeGameMap().rules.infantryCost * CREDITS_ITEM_INFANTRY_MULTIPLIER`, the production points one item costs on the active map |

Callers pass `techLevel` only when the tech bonus is on. With the bonus off they pass `undefined`, so every unit uses multiplier 1.

**Storage**

| Name | Value | Lives in |
| --- | --- | --- |
| unit column | `units.is_mercenary INTEGER NOT NULL DEFAULT 0` | `schema.ts` |
| unit constraint | `CHECK (is_mercenary IN (0, 1) AND (is_mercenary = 0 OR (player <> 'neutral' AND unit_type <> 'missile')))` | same |
| intel column | `player_unit_intel.enemy_player TEXT` (nullable) | same |
| treasury table | `res_s_treasury` | same |
| hire order table | `res_s_hire_orders` | same |
| `EXPECTED_USER_VERSION` | `26` | `src/main/gameDb.ts` |

```sql
CREATE TABLE IF NOT EXISTS res_s_treasury (
  player_id TEXT PRIMARY KEY,
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0)
);

CREATE TABLE IF NOT EXISTS res_s_hire_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('raise', 'rehire')),
  h3_index TEXT NOT NULL,
  unit_type TEXT NOT NULL CHECK (unit_type IN ('infantry', 'armor', 'naval', 'air')),
  unit_count INTEGER NOT NULL CHECK (unit_count BETWEEN 1 AND 99),
  neutral_unit_id TEXT,
  created_turn INTEGER NOT NULL,
  CHECK (
    (kind = 'raise' AND neutral_unit_id IS NULL)
    OR (kind = 'rehire' AND neutral_unit_id IS NOT NULL AND unit_count = 1)
  )
);
```

For a rehire order, `h3_index` and `unit_type` are the unit's hex and type when the order was placed.

**Snapshot and result fields**

| Name | Value | Lives in |
| --- | --- | --- |
| unit field | `GameStateSnapshot.units[].isMercenary?: boolean`, present and `true` only for a mercenary | `gameStateTypes.ts` |
| intel field | `GameStateSnapshot.enemyIntel[].player?: string` | same |
| queue totals field | `strategicBuildQueueTotals[].buildPaused?: boolean`, present and `true` only for a paused hex | same |
| economy field | `GameStateSnapshot.mercenaryEconomy?: MercenaryEconomySnapshot`, set only for one seat's view | same |
| queue view field | `HexBuildQueueSnapshot.buildPaused?: boolean` and `HexBuildQueueView.buildPaused?: boolean` | `productionTypes.ts`, `buildQueue.ts` |
| battle field | `TacticalSubUnitSnapshot.isMercenary?: boolean` | `tacticalBattleTypes.ts` |
| move field | `ReadyResult.aiMoves[].player?: string` | `readyTypes.ts` |
| `ReadyResult` fields | `humanCreditsAdded?: number`, `humanBuildPausedHexes?: readonly string[]`, `humanMercenariesHired?: number`, `humanUnitsDeserted?: number`, `humanHireOrdersUnfilled?: number` | same |

**IPC**

| Name | Value |
| --- | --- |
| `IPC_GAME.getHexHireView` | `'game:getHexHireView'` |
| `IPC_GAME.placeHireOrder` | `'game:placeHireOrder'` |
| `IPC_GAME.removeHireOrder` | `'game:removeHireOrder'` |

**Display constants**

| Name | Value | Lives in |
| --- | --- | --- |
| `MERCENARY_BADGE_TEXT` | `'$'` | new `src/renderer/rendering/mercenaryBadgeDrawing.ts` |
| `MERCENARY_BADGE_FONT` | `'bold 11px system-ui, sans-serif'` | same |
| `MERCENARY_BADGE_Y_OFFSET_RATIO` | `0.6` (times `UNIT_RADIUS`, below the token center) | same |
| CSS class | `hire-entry-btn` (added beside `build-entry-btn` on a Hire marker; a hook only, with no rule) | — |
| `HIRE_ENTRY_VIEW_MARGIN_PX` | `40` | new `src/renderer/gameplay/hireEntryMarkers.ts` |
| CSS class | `build-popup-wide` (on `#build-popup` while the Hire panel shows) | `static/overlayChrome.css` |
| CSS class | `build-popup-tab-bar` | `static/overlayChrome.css` |
| CSS class | `hire-funds-warning` | `static/overlayChrome.css` |
| CSS class | `is-short` (on `#topbar-stat-credits-host`) | `static/frameChrome.css` |

**AI names**

| Name | Value | Lives in |
| --- | --- | --- |
| `AI_BUILD_QUEUE_ITEM_TYPES`, `isAiBuildQueueItemType` | every queue item except `credits`; added in Phase 2, deleted in Phase 7 | `src/main/productionRules.ts` |
| `SECTION_TITLE_MERCENARIES` | `'Mercenaries'` | `src/main/openRouter/promptSpec/sectionHeadings.ts` |
| `BUILD_STATUS_COLUMN_HEADER` | `'Building'`, valued `yes` or `paused` | `gameRuleMercenaryText.ts` |
| `MERCENARY_BRIEFING_MAX_ROWS` | `10` | same |
| `MERCENARY_TOOL_NAMES` | `['query_mercenaries', 'hire_mercenaries'] as const` | new `src/main/tools/mercenaryTools.ts` |
| production order actions | `'set_build_queue'`, `'raise_mercenaries'`, `'rehire_mercenary'` | `productionOrders.ts`, `envelopeJsonSchema.ts` |

## Player-facing and model-facing text

All of these live in new [`src/shared/mercenaryRules.ts`](../src/shared/mercenaryRules.ts) unless the row says otherwise. `list` below means a serial-comma join (`A and B`, `A, B, and C`): `productionBuildability.ts` imports `joinWithSerialComma` from `./consolidatedTurnUpdateToast`, which does not import it back.

| Name | Text |
| --- | --- |
| `CREDITS_QUEUE_ITEM_LABEL` (in `src/shared/creditsRules.ts`) | `Credits` |
| `CREDITS_NOT_AVAILABLE_REASON` (same file) | `This hex has no production to turn into credits.` |
| `formatCreditsAddedLine(n)` (same file) | `1 credit added to the treasury.` or ``${n} credits added to the treasury.`` |
| `formatMercenariesHiredLine(n)` | `1 mercenary hired.` or ``${n} mercenaries hired.`` |
| `formatUnitsDesertedLine(n)` | `1 unit deserted for lack of pay.` or ``${n} units deserted for lack of pay.`` |
| `formatHireOrdersUnfilledLine(n)` | `1 hire order could not be filled, so it was not charged.` or ``${n} hire orders could not be filled, so they were not charged.`` |
| `BUILD_PAUSED_NOTE` (in `src/shared/productionBuildability.ts`) | `Building is paused here: this hex is outside your home region and holds none of your units or fortifications. Its points still bank. Have a unit here at the end of a turn to build again.` |
| `formatBuildPausedLine(placeNames)` (same file) | One name: ``Building is paused at ${name}, which holds none of your units or fortifications.``<br>Several: ``Building is paused at ${list}, which hold none of your units or fortifications.`` |
| `formatCreditsUpkeepSuffix(upkeep)` | `''` when `upkeep` is 0, otherwise ``\u2212${upkeep}/turn`` |
| `formatCreditsTooltip({ credits, upkeepPerTurn, pendingHireFees, mercenaryCount })` | ``Credits pay for mercenaries. You hold ${credits}. Upkeep for your ${mercenaryCount} ${mercenaryWord} is ${upkeepPerTurn} per turn, and this turn's hire orders cost ${pendingHireFees}. Credits from this turn's production arrive before upkeep is paid. If credits run short, random mercenaries desert. A Credits build item turns one infantry's price in production into ${CREDITS_PER_ITEM} credits.``<br>`mercenaryWord`: `mercenary` for 1, otherwise `mercenaries`. |
| `BUILD_TAB_LABEL` | `Build` |
| `HIRE_TAB_LABEL` | `Hire` |
| `formatHireEntryLabel(productionText)` | ``${productionText} · Hire`` (marker label; `productionText` is the hex's `$N`) |
| `HIRE_BUTTON_LABEL` | `Hire` |
| `RAISE_SECTION_TITLE` | `Raise` |
| `REHIRE_SECTION_TITLE` | `Neutral units` |
| `PENDING_HIRE_SECTION_TITLE` | `Orders this turn` |
| `CREDITS_LINE_LABEL`, `UPKEEP_LINE_LABEL`, `HIRE_FEES_LINE_LABEL` | `Credits`, `Upkeep`, `Hire orders` (label/value pairs; values ``${n}``, ``${n} / turn``, ``${n}``) |
| `RAISE_CAPACITY_LABEL` and `formatRaiseCapacityValue(left, perTurn)` | `Capacity`, and ``$${left} of $${perTurn} this turn`` (a label/value pair; production points, written with `$` as the build popup writes them) |
| `formatHireOptionLabel({ unitType, unitCost, fee, upkeep })` | ``${Capitalized type} (capacity $${unitCost}, fee ${fee}, upkeep ${upkeep})`` |
| `formatHireOrderLabel(order)` | Raise: ``Raise ${count} ${Capitalized type} (fee ${fee})``. Rehire: ``Rehire ${displayName} (fee ${fee})``. |
| `HIRE_FUNDS_WARNING` | `Your credits do not cover upkeep plus these hire orders. Credits from this turn's production arrive first. Random mercenaries desert only if upkeep cannot be paid, and hire orders the rest cannot pay are not filled.` |
| `HIRE_ARRIVAL_NOTE` | `Hired units arrive at the end of this turn and take orders next turn. Upkeep is due every turn after that.` |
| `HIRE_VIEW_FAILED` | `Hiring information could not be loaded.` |
| `HIRE_REASON_NOT_ACTIVE` | `Only a side still in the match can hire.` |
| `HIRE_REASON_NOT_PLANNING` | `Hire orders can only be changed during planning.` |
| `HIRE_REASON_TACTICAL` | `Hiring is unavailable during a tactical battle.` |
| `HIRE_REASON_NOT_EXPLORED` | `You have not explored this hex.` |
| `HIRE_REASON_OTHER_HOME` | `You cannot hire in another side's home region.` |
| `HIRE_REASON_NOTHING_HERE` | `No mercenaries can be hired here.` |
| `HIRE_REASON_COUNT` | `Count must be a whole number from 1 to 99.` |
| `HIRE_REASON_ORDER_MISSING` | `That hire order no longer exists.` |
| `RAISE_REASON_OCCUPIED` | `Mercenaries can be raised only where no other side has units.` |
| `RAISE_REASON_FORTIFIED` | `Another side's fortifications hold this hex.` |
| `RAISE_REASON_NO_CAPACITY` | `This hex has too little production to raise a unit.` |
| `RAISE_REASON_TYPE` | `That unit type cannot be raised here.` |
| `RAISE_REASON_CAPACITY` | `That would raise more than this hex can raise this turn.` |
| `RAISE_REASON_CAPACITY_USED` | `Your orders here already use this turn's raise capacity.` |
| `REHIRE_REASON_NOT_ELIGIBLE` | `That unit is not a Neutral unit you can see and rehire.` |
| `REHIRE_REASON_ALREADY_ORDERED` | `You already have an order to rehire that unit.` |
| `HIRE_ORDER_INVALID_PAYLOAD` | `Invalid hire order.` |
| `HIRE_ORDER_UPDATE_FAILED` | `Failed to update hire orders.` |
| `formatHireEntryAriaLabel(h3Index)` | ``Open hiring for ${h3Index}`` |
| `MERCENARY_TOOLTIP_LABEL` | `Mercenary` |
| `forcesStatTooltipLead` (in `src/renderer/chrome/frameTooltipText.ts`) | `Units you have fielded that count toward caps, out of the most this game size allows` (the existing tip's lead, before its breakdown) |
| `formatMercenaryTooltipValue(upkeep)` | ``upkeep ${upkeep} credits per turn`` |
| hire control tips (new `src/renderer/chrome/hireTooltipText.ts`) | `hireEntryTooltipText`: `Hire mercenaries in this hex.`<br>`hireTypeTooltipText`: `The kind of unit to raise, with its fee and upkeep.`<br>`hireCountTooltipText`: `How many units to raise.`<br>`hireRaiseButtonTooltipText`: `Order these mercenaries raised at the end of this turn.`<br>`hireRehireButtonTooltipText`: `Order this Neutral unit rehired at the end of this turn.`<br>`hireRemoveOrderTooltipText`: `Remove this hire order.` |
| AI text (new `src/main/openRouter/promptSpec/gameRuleMercenaryText.ts`) | see Phase 7 and Phase 8 |

## Shared types

[`src/shared/ipc/mercenaryTypes.ts`](../src/shared/ipc/mercenaryTypes.ts) is created in Phase 1 with every type below and exported from [`src/shared/ipc/index.ts`](../src/shared/ipc/index.ts). It imports `HireKind` and `HireableUnitType` with `import type` from `../mercenaryRules`.

```ts
export interface MercenaryFunds {
  readonly credits: number;            // the seat's treasury now
  readonly upkeepPerTurn: number;      // upkeep of the seat's current mercenaries, due at the end of this turn
  readonly pendingHireFees: number;    // fees of the seat's hire orders placed this turn
  readonly mercenaryCount: number;     // the seat's current mercenaries
}

export interface MercenaryEconomySnapshot extends MercenaryFunds {
  readonly hireHexes?: readonly string[]; // hexes where the human may hire now or has an order; set only on the renderer's human view, from Phase 5
}

export interface HireRaiseOption {
  readonly unitType: HireableUnitType;
  readonly unitCost: number;           // counts against the hex's raise capacity
  readonly fee: number;                // charged per unit when the order fills
  readonly upkeep: number;             // per unit, every later turn
}

export interface HireRaiseView {
  readonly capacityPerTurn: number;
  readonly capacityLeft: number;       // capacity minus the unit cost of the requester's raise orders on this hex
  readonly options: readonly HireRaiseOption[];
}

export interface HireRehireRow {
  readonly unitId: string;
  readonly unitType: HireableUnitType;
  readonly displayName: string;
  readonly fee: number;
  readonly upkeep: number;
}

export interface HireOrderView {
  readonly orderId: number;
  readonly kind: HireKind;
  readonly unitType: HireableUnitType;
  readonly count: number;
  readonly unitId: string | null;      // set for a rehire
  readonly displayName: string | null; // set for a rehire
  readonly fee: number;                // total for the order
}

export interface HexHireView {
  readonly h3Index: string;
  readonly funds: MercenaryFunds;
  readonly hireAvailable: boolean;            // the requester may place an order here, or has one here
  readonly unavailableReason: string | null;  // why not, when hireAvailable is false
  readonly raise: HireRaiseView | null;       // null when raising is blocked
  readonly raiseBlockedReason: string | null; // why raising is blocked, when it is
  readonly rehireUnits: readonly HireRehireRow[];
  readonly pendingOrders: readonly HireOrderView[]; // the requester's orders on this hex
}

export type HireOrderRequest =
  | { readonly kind: 'raise'; readonly h3Index: string; readonly unitType: HireableUnitType; readonly count: number }
  | { readonly kind: 'rehire'; readonly unitId: string };

export interface HireMutationResult {
  readonly success: boolean;
  readonly reason?: string;   // set when success is false
  readonly orderId?: number;  // set when an order was placed
}
```

## Phase 1: Store mercenaries, the treasury, and hire orders

**Goal.** The database, the shared rules, and the snapshot can hold mercenaries, treasuries, and hire orders. Mercenaries no longer count toward caps. Nothing creates any of them yet, so play is unchanged.

**Create [`src/shared/creditsRules.ts`](../src/shared/creditsRules.ts)** in the shape of `fortificationRules.ts`. It imports only `GLOBAL_GAME_MAP` from `./activeGameMap`, which imports nothing but a type, and holds `CREDITS_QUEUE_ITEM`, `CREDITS_ITEM_INFANTRY_MULTIPLIER`, `CREDITS_PER_ITEM`, `CREDITS_QUEUE_ITEM_LABEL`, `CREDITS_NOT_AVAILABLE_REASON`, and `formatCreditsAddedLine`. `gameRules.ts` already imports from the leaf `fortificationRules.ts` in the same way. A credits constant kept in `mercenaryRules.ts` would make `gameRules.ts` and `mercenaryRules.ts` import each other.

**Create [`src/shared/mercenaryRules.ts`](../src/shared/mercenaryRules.ts)** with every other constant, guard, and function in the rules table, and every string and formatter in the text table that lives in this file. It imports `GLOBAL_GAME_MAP` from `./activeGameMap`, `CREDITS_PER_ITEM` from `./creditsRules`, and `TechLevel` (type) from `./techBonusTypes`, and nothing from `src/main` or `src/renderer`. Upkeep never reads the active map; that is the point of `mercenaryReferenceCost`. It must not import `./ipc/mercenaryTypes`, which imports it; give `formatCreditsTooltip`, `formatHireOptionLabel`, and `formatHireOrderLabel` inline parameter types.

Add `creditsItemCost()` to `src/shared/gameRules.ts`, importing `CREDITS_ITEM_INFANTRY_MULTIPLIER` (and, in Phase 2, `CREDITS_QUEUE_ITEM`) from `./creditsRules` only.

**Create [`src/shared/ipc/mercenaryTypes.ts`](../src/shared/ipc/mercenaryTypes.ts)** as shown in Shared types, and export it from `src/shared/ipc/index.ts`.

**Schema** (`src/main/gameDb/schema.ts`):

- `units` gains `is_mercenary INTEGER NOT NULL DEFAULT 0,` right after `formed_turn`, then the unit constraint on its own line, and keeps the `FOREIGN KEY` line last. SQLite rejects a column that follows a table constraint. Column-list `INSERT INTO units` statements that omit `is_mercenary` keep working because of that default.
- `player_unit_intel` gains `enemy_player TEXT`.
- Add `res_s_treasury` and `res_s_hire_orders` after `res_s_build_progress`.
- The `res_s_build_queue.unit_type` and `res_s_build_progress.keep_building_unit_type` CHECK lists gain `'credits'`.
- `EXPECTED_USER_VERSION` in `src/main/gameDb.ts` becomes `26`.

**Table lists:**

- `GAME_DB_REQUIRED_TABLES` (`src/main/gameDb/databaseValidation.ts`) gains `'res_s_treasury'` and `'res_s_hire_orders'`.
- `resetGameForNewMatch` (`src/main/gameDb/resetGame.ts`) runs `DELETE FROM res_s_treasury` and `DELETE FROM res_s_hire_orders` right after `DELETE FROM res_s_build_progress`.
- `deleteSeatPrivateRows` (`knockoutConsequences.ts`) adds both tables to its list.
- In `applyKnockout`, the conversion becomes `UPDATE units SET player = ?, is_mercenary = 0 WHERE player = ?`. Without this, the new constraint would make a knockout throw once mercenaries exist.

**Units:**

- `NewUnitRow` (`unitInsert.ts`) gains `readonly isMercenary?: boolean`. `insertUnitRow` writes `is_mercenary` as `row.isMercenary === true ? 1 : 0`.
- `listUnitsForSnapshotWithGetAll` (`src/main/gameDb/unitSnapshotRead.ts`) selects `u.is_mercenary`. `DbUnitSnapshotRow` gains it. `mapDbUnitSnapshotRow` adds `isMercenary: true` only when the column is 1, the way it adds `formedTurn`, so snapshots of ordinary units are unchanged.
- `GameStateSnapshot.units[]` (`src/shared/ipc/gameStateTypes.ts`) gains `isMercenary?: boolean`.

**Caps:**

- The unit-count SQL in `processProductionAfterControlResolution` gains `WHERE is_mercenary = 0` before `GROUP BY`.
- `getPlayerUnitCountsByType` skips a unit whose `isMercenary` is `true`. Its parameter element type gains `isMercenary?: boolean`.

**Mercenary state.** Create [`src/main/gameDb/mercenaryState.ts`](../src/main/gameDb/mercenaryState.ts), following the `(ops, …)` pattern of `fortificationState.ts`:

```ts
export interface HireOrderRow {
  readonly id: number;
  readonly playerId: SeatId;
  readonly kind: HireKind;
  readonly h3Index: string;
  readonly unitType: HireableUnitType;
  readonly unitCount: number;
  readonly neutralUnitId: string | null;
  readonly createdTurn: number;
}
export interface MercenaryUnitRow {
  readonly id: string;
  readonly unitType: string;
  readonly h3Index: string;
  readonly birthH3Index: string | null;
}
export function getTreasuryCredits(ops: BasicDbOps, seatId: SeatId): number
export function setTreasuryCredits(ops: BasicDbOps, seatId: SeatId, credits: number): void
export function addTreasuryCredits(ops: BasicDbOps, seatId: SeatId, amount: number): number
export function listHireOrdersForSeat(ops: BasicDbOps, seatId: SeatId): HireOrderRow[]
export function listAllHireOrders(ops: BasicDbOps): HireOrderRow[]
export function insertHireOrder(ops: BasicDbOps, row: Omit<HireOrderRow, 'id'>): number
export function deleteHireOrder(ops: BasicDbOps, seatId: SeatId, orderId: number): boolean
export function deleteAllHireOrders(ops: BasicDbOps): void
export function listMercenaryUnitsForSeat(ops: BasicDbOps, seatId: SeatId): MercenaryUnitRow[]
```

- `getTreasuryCredits` returns 0 when the seat has no row.
- `setTreasuryCredits` throws when `credits` is not a non-negative integer. Otherwise it upserts with `INSERT INTO res_s_treasury (player_id, credits) VALUES (?, ?) ON CONFLICT(player_id) DO UPDATE SET credits = excluded.credits`.
- `addTreasuryCredits` throws when `amount` is not a non-negative integer, and returns the new total.
- Both list functions order by `id`. A row whose `player_id`, `kind`, or `unit_type` fails its guard (`isSeatId`, the kind check, `isHireableUnitType`) is logged with `logError` and skipped.
- `insertHireOrder` returns the new id from `SELECT last_insert_rowid() AS id`.
- `deleteHireOrder` deletes only a row of that seat, then returns whether `SELECT changes() AS n` is above 0. `run` returns nothing.
- `listMercenaryUnitsForSeat` selects `id, unit_type, h3_index, birth_h3_index` where `player = ? AND is_mercenary = 1`, ordered by `id`.
- Reads (`getTreasuryCredits`, both hire-order lists, `listMercenaryUnitsForSeat`) use `logTrace`. Writes (`setTreasuryCredits`, `addTreasuryCredits`, `insertHireOrder`, `deleteHireOrder`, `deleteAllHireOrders`) use `logDebug`. A skipped bad row uses `logError`.

Add thin wrappers that pass `gameDbOps` in [`src/main/gameDb/mercenaryStateAccess.ts`](../src/main/gameDb/mercenaryStateAccess.ts), as `fortificationStateAccess.ts` does. Re-export the wrappers from `src/main/gameDb.ts` beside the fortification exports.

**Tests.**

- [`src/main/mercenarySchema.test.ts`](../src/main/mercenarySchema.test.ts), on a fresh temp match:
  - a unit inserted with `isMercenary: true` reads back with `isMercenary === true` in `getGameState().units`, and an ordinary unit has no `isMercenary` key;
  - inserting a mercenary missile throws, and so does `UPDATE units SET player = 'neutral'` on a mercenary;
  - `setTreasuryCredits(seat, -1)` throws; `addTreasuryCredits` adds; a seat without a row reads 0;
  - a raise order with a `neutral_unit_id`, and a rehire order without one, are both rejected by the table;
  - `insertHireOrder`, `listHireOrdersForSeat`, and `deleteHireOrder` round-trip, and `deleteHireOrder` refuses another seat's order;
  - the `res_s_build_queue` table accepts a `credits` row;
  - **caps:** delete the human's ordinary infantry, insert only mercenary infantry up to the infantry cap, and queue `infantry ×1` on a home hex with enough stored points. `processProductionAfterControlResolution()` still spawns one infantry. Do not also fill the cap with ordinary infantry; that would block the spawn this case exists to prove.
- [`src/shared/mercenaryRules.test.ts`](../src/shared/mercenaryRules.test.ts): `mercenaryUpkeepFor` gives infantry 3, Advanced infantry 5, naval 13, Advanced naval 25, on the global map and again inside `withGameMap` with a profile whose infantry price is 60; `mercenaryHireFee('rehire', 5)` is 10; `raiseCapacityForHex(12, false)` is 24, and with `true` it is 0.
- `getPlayerUnitCountsByType` ignores a unit with `isMercenary: true` (add the case to its existing test, or to the shared rules test if it has none).

**Verify:**

1. `npm test`.
2. `npm run check:circular`.
3. `npm run build:renderer`.
4. `npm start`. The "Database problem" box appears once because of the version bump; accept it. Play two turns of a global match and confirm nothing has changed.

No `doc/` edits.

## Phase 2: Credits and the treasury

**Goal.** The human can queue `Credits` anywhere it can build. Production adds the credits to the seat's treasury, and the top bar shows them. The AI does not see the new item until Phase 7.

**Item type.**

- `ALL_BUILD_QUEUE_ITEM_TYPES` (`src/shared/ipc/productionTypes.ts`) becomes `[...ALL_BUILD_UNIT_TYPES, 'fortification', 'credits'] as const`. Rewrite its comment and the comments of `BuildQueueItemType` and `isBuildQueueItemType` to name both non-unit items.
- `buildQueueItemCostFor` returns `creditsItemCost()` for `CREDITS_QUEUE_ITEM`.
- `getAvailableBuildQueueItemTypes` (`src/main/productionRules.ts`) appends `CREDITS_QUEUE_ITEM` after `fortification` when `urbanHexCount > 0`. Callers that build menus or spend points pass 0 for a neutral border hex. Pruning (`pruneBuildQueueForInfrastructureState`) does not, which only makes it keep a row it would keep anyway.
- `unavailableQueueItemReason` (`buildQueue.ts`) returns `CREDITS_NOT_AVAILABLE_REASON` for `credits`.

**Every place a non-unit item flows.** Search `src/` for `FORTIFICATION_QUEUE_ITEM` and `'fortification'`. At each hit, decide whether `credits` needs the same treatment, and list every hit and your decision in the report. The known answers:

| Site | Credits |
| --- | --- |
| spend loop, `controlAndProduction.ts` | its own branch (below) |
| `buildQueueItemCostFor` | its own branch (above) |
| `getAvailableBuildQueueItemTypes` | appended (above) |
| `unavailableQueueItemReason` | its own text (above) |
| option labels in `buildQueuePopup.ts` and `buildQueueMultiSelect.ts` | the shared label helper (below) |
| `formatProductionQueueAwareLabel` | nothing: credits never show `∞t` |
| `applyProduction` and `estimateTurnsToNextSpawn` in `productionConfig.ts` | nothing: once `buildQueueItemCostFor` prices `credits`, the simulator already spends it and spawns nothing, because it pushes a spawn only for `isBuildUnitType`. Do not add a credits branch there |
| the two schema CHECK lists | already done in Phase 1 |

If the compiler reports a site where a queue item reaches a unit-only path, treat `credits` exactly as `fortification` is treated there, and list it. Never widen the cap types: `MAX_UNITS_PER_TYPE`, `DEPLOYMENT_CAP_TYPE_ORDER`, `capReachedByPlayer`, and `DeployedUnitsByType`.

**Labels.** Create [`src/shared/buildQueueItemLabels.ts`](../src/shared/buildQueueItemLabels.ts):

```ts
export function formatBuildQueueItemLabel(item: BuildQueueItemType): string
```

It returns `FORTIFICATION_QUEUE_ITEM_LABEL` for a fortification, `CREDITS_QUEUE_ITEM_LABEL` for credits, and the capitalized type for a unit. Replace the inline label choice in `buildQueuePopup.ts` (the type select) and in `formatBuildUnitTypeOptionLabel` (`buildQueueMultiSelect.ts`) with it. `formatBuildUnitTypeOptionLabel` keeps its eligibility suffix.

**Move unit creation out of `controlAndProduction.ts`,** which has no room for the new branch. Create [`src/main/gameActions/strategicUnitSpawn.ts`](../src/main/gameActions/strategicUnitSpawn.ts):

```ts
export function createStrategicUnit(args: {
  readonly owner: SeatId;
  readonly unitType: BuildUnitType;
  readonly h3Index: string;
  readonly turnNumber: number;   // the turn being resolved
  readonly isMercenary: boolean;
}): string
export function spawnProducedUnitsForHex(args: {
  readonly h3Index: string;
  readonly controllerPlayerId: string;
  readonly unitTypes: readonly BuildUnitType[];
  readonly unitCountsByPlayerType: Map<string, number>;
  readonly capReachedByPlayer: Map<SeatId, BuildUnitType[]>;
  readonly maxUnitsPerType: Readonly<Record<BuildUnitType, number>>;
  readonly turnNumber: number;
}): BuildUnitType[]
```

- `createStrategicUnit` throws when `isMercenary` is true and the type is a missile. Otherwise it runs the existing per-unit steps of `spawnProducedUnitsForHex`, in the same order: `allocateNextUnitIdOrdinal`, `formatStrategicUnitId`, `allocateNextUnitDisplayOrder`, `insertUnitRow` (with `resolveUnitBirthOrigin`, `formedTurn: turnNumber + 1`, and `isMercenary`), then `insertMissileHoldOrder` with `createdTurn: turnNumber` for a missile. It returns the new id. The order matters: id and display counters must advance exactly as before.
- `spawnProducedUnitsForHex` is the existing function moved, with its arguments in one object and `turnNumber` passed in instead of read. It calls `createStrategicUnit` with `isMercenary: false`. Its cap logic and log lines are unchanged.
- `createStrategicUnit` passes `gameDbOps` from `../gameDb/dbConnection` to `resolveUnitBirthOrigin`, as `missileValidation.ts` imports it.
- `controlAndProduction.ts` imports it, passes `turnNumber: currentPlanningTurnNumber()`, and drops the moved code, the `GAME_DB_OPS` constant if nothing else uses it, and any import that becomes unused.

**Credits spend.** Create [`src/main/gameActions/creditsProduction.ts`](../src/main/gameActions/creditsProduction.ts):

```ts
export function creditsSpendStep(args: { readonly remainingCount: number; readonly points: number; readonly cost: number }): number
```

It returns how many items to build: 0 when `cost` is not a positive integer, otherwise `max(0, min(remainingCount, floor(points / cost)))`.

In `processProductionAfterControlResolution`:

- Before the per-hex loop, create `creditsAddedByPlayer = new Map<SeatId, number>()`.
- Per hex, keep `let creditsToAdd = 0`.
- Right after the fortification branch, before the unit cost line, add:
  ```ts
  if (unitType === CREDITS_QUEUE_ITEM) {
    const cost = buildQueueItemCostFor(unitType);
    const built = creditsSpendStep({ remainingCount: entry.remainingCount, points, cost });
    if (built <= 0) break;
    entry.remainingCount -= built;
    points -= built * cost;
    creditsToAdd += built * CREDITS_PER_ITEM;
    if (entry.remainingCount <= 0) {
      lastDepletedUnitType = unitType;
      queueWorking.shift();
    }
    continue;
  }
  ```
- After the fortification writes, when `creditsToAdd > 0`, call `addTreasuryCredits(controllerPlayerId, creditsToAdd)` and add the amount to the controller's entry in `creditsAddedByPlayer`. The points spent are `built × cost` on the active map; the credits added are `built × CREDITS_PER_ITEM` on every map.
- The return type and value gain `creditsAddedByPlayer: ReadonlyMap<SeatId, number>`.

Keep building with credits works through `computeKeepBuildingRefillCount('credits', points)`. The file must end at or under 600 lines.

**Keep the AI unaware for now.** After the fortification work, several AI sites accept or list every queue item, so they would offer `credits` before the AI knows what it is for. In `src/main/productionRules.ts` add:

```ts
export const AI_BUILD_QUEUE_ITEM_TYPES = ALL_BUILD_QUEUE_ITEM_TYPES.filter((item) => item !== CREDITS_QUEUE_ITEM);
export function isAiBuildQueueItemType(value: unknown): value is BuildQueueItemType
```

Use them in place of `ALL_BUILD_QUEUE_ITEM_TYPES` and `isBuildQueueItemType` at these sites:

- `BUILD_QUEUE_ITEM_SCHEMA_ENUM` (`openRouterToolCatalog.ts`);
- the `productionOrders` `unitType` enum (`envelopeJsonSchema.ts`);
- `normalizeProductionOrders` (`productionOrders.ts`);
- `setBuildQueue`'s type check and its error text, and the list of available types in its "not available for this hex" message (filter that list with `isAiBuildQueueItemType`) (`productionTools.ts`);
- `buildProductionSubmitClause` (`promptText.ts`).

Then run `rg "ALL_BUILD_QUEUE_ITEM_TYPES|isBuildQueueItemType" src/main/openRouter src/main/tools src/main/productionOrders.ts`. Any other hit that offers items to the model or accepts them from it gets the same change; list it. `summarizeQueue` and the production table's available-types cell already list unit types plus `fortification` only, so they need no change.

**Economy on the snapshot.** Create [`src/main/gameDb/mercenaryEconomyRead.ts`](../src/main/gameDb/mercenaryEconomyRead.ts):

```ts
export function mercenaryUpkeepForUnit(ops: BasicDbOps, unit: { readonly unitType: string; readonly birthH3Index: string | null }): number
export function hireOrderFee(ops: BasicDbOps, order: HireOrderRow): number
export function readMercenaryFunds(ops: BasicDbOps, seatId: SeatId): MercenaryFunds
export function withMercenaryEconomy(ops: GuardedDbOps, state: GameStateSnapshot, seatId: SeatId): GameStateSnapshot
```

- **Tier.** Both fee functions take the tier from `techLevelForBirthHex` only when `readPersistedOriginBonusSettings(ops).techBonusEnabled === true`, and pass `undefined` otherwise.
- **`mercenaryUpkeepForUnit`** returns `mercenaryUpkeepFor(unitType, tier of birthH3Index)`. For a type that is not hireable it logs with `logError` and returns 0.
- **`hireOrderFee`:**
  - For a raise, it is `mercenaryHireFee('raise', mercenaryUpkeepFor(order.unitType, tier of order.h3Index)) * order.unitCount`.
  - For a rehire, it reads `unit_type, birth_h3_index` of `order.neutralUnitId` and returns `mercenaryHireFee('rehire', mercenaryUpkeepForUnit(...))`. A missing unit gives 0, logged.
- **`readMercenaryFunds`** sums the seat's mercenary upkeep from `listMercenaryUnitsForSeat`, sums `hireOrderFee` over `listHireOrdersForSeat`, and reads the treasury.
- **`withMercenaryEconomy`** returns `state` unchanged when `!ops.hasDb()`. Otherwise it returns `{ ...state, mercenaryEconomy: readMercenaryFunds(ops, seatId) }`. `readMercenaryFunds`, `mercenaryUpkeepForUnit`, and `hireOrderFee` are reads and use `logTrace`.
- `GameStateSnapshot` (`gameStateTypes.ts`) gains `mercenaryEconomy?: MercenaryEconomySnapshot`, imported with `import type` from `./mercenaryTypes`.

In the facade `getGameStateForPlayer` (`src/main/gameDb.ts`), apply `withMercenaryEconomy(gameDbOps, base, playerId)` after the human melee-candidate merge and before the tactical-session merge. The observe-all snapshot (`omniscientSnapshot`) gets no economy.

**Turn result.**

- `finalizeReadyTurnAfterMelee` sets `ReadyResult.humanCreditsAdded` from `productionSummary.creditsAddedByPlayer.get(HUMAN_SEAT_ID)`, omitted when 0, beside `humanFortificationsBuilt`.
- Add the field to `readyTypes.ts`, and to `pickReadyResolutionIpcMirrorFields` with its field union.
- `buildOtherTurnUpdatePrimaryLines` adds `formatCreditsAddedLine(n)` after the fortifications-built line, when the field is above 0.

**Top bar.**

- **Markup.** In `static/index.html`, after the Production readout, add:
  ```html
  <div id="topbar-stat-credits-host" class="topbar-stat" hidden>
    <span class="topbar-stat-caption">Credits</span>
    <span class="topbar-stat-value"><span id="topbar-stat-credits">—</span><span id="topbar-stat-credits-suffix" class="topbar-stat-suffix"></span></span>
  </div>
  ```
- **Stats** (`src/shared/topBarStats.ts`):
  - `TopBarStatsInput` gains `mercenaryEconomy?: MercenaryEconomySnapshot`.
  - `TopBarStats` gains `credits: (MercenaryFunds & { readonly short: boolean }) | null`. It is null when the input has no economy. Otherwise `short` is `credits < upkeepPerTurn + pendingHireFees`.
  - `TopBarStatParts` gains `credits` (`formatCount(credits)`, or `''` when null) and `creditsSuffix` (`formatCreditsUpkeepSuffix(upkeepPerTurn)`, or `''`).
- **Render** (`renderTopBarStats` in `src/renderer/chrome/topBar.ts`):
  - Set both texts.
  - Hide the host when `stats.credits` is null, and in the null-state branch.
  - Toggle `is-short` on the host from `short`.
  - Set the host's `data-control-tooltip` to `formatCreditsTooltip(stats.credits)`.
- **Forces tip.** Forces now leaves mercenaries out, because Phase 1 removed them from the cap counts. Add `forcesStatTooltipLead` to `frameTooltipText.ts` (camelCase, like the file's other tooltip constants). `forcesStatTooltipText` uses it (``${forcesStatTooltipLead}: ${breakdown}.``), and its comment's Expected outcome example is updated. The static `data-control-tooltip` on `#topbar-stat-forces-host` in `static/index.html` gets the same sentence with a final period.
- **CSS.** In `static/frameChrome.css`, after `.topbar-stat-suffix`, add `.topbar-stat.is-short .topbar-stat-value { color: var(--chrome-error); }`.
- **Refresh.** `refreshGameStateAfterBuildQueueChange` (`stateSnapshot.ts`) sets `updateGameStateSidebarUi: true`, so a queue edit or a hire order refreshes the top bar. Update its comment.

**Tests.**

- [`src/main/gameActions/creditsProduction.test.ts`](../src/main/gameActions/creditsProduction.test.ts): `creditsSpendStep` builds `min(remaining, affordable)` and returns 0 for a zero cost.
- [`src/main/creditsProductionFlow.test.ts`](../src/main/creditsProductionFlow.test.ts), on a temp match, on a human home city hex, with the queue set by `replaceBuildQueueForHex` and points by `setBuildProgressPointsForHex`. First run `DELETE FROM units WHERE player = 'human' AND unit_type = 'infantry'`, as `gameActionsProduction.test.ts` does, so the infantry cap cannot block:
  - `credits ×2` with `2 × creditsItemCost()` stored points empties the queue and adds `2 × CREDITS_PER_ITEM` to the treasury and to `creditsAddedByPlayer`;
  - `credits ×1` then `infantry ×1`, with points for both, does both;
  - `getGameStateForPlayer(HUMAN_SEAT_ID).mercenaryEconomy?.credits` equals the treasury;
  - inside `withGameMap` with a copy of `GLOBAL_GAME_MAP` whose `rules.infantryCost` is 60, `credits ×1` with 60 stored points adds `CREDITS_PER_ITEM` (20) to the treasury, not 60.
- New [`src/shared/creditsRules.test.ts`](../src/shared/creditsRules.test.ts): inside `withGameMap` with a copy of `GLOBAL_GAME_MAP` whose `rules.infantryCost` is 60 (the pattern of `h3Resolutions.test.ts`), `buildQueueItemCostFor('credits')` is 60.
- `src/main/productionRules.test.ts`: replace the existing assertion that `(1, 0, 0, 1)` ends with `'fortification'` with one that it ends with `'fortification', 'credits'`. Add: `(1, 0, 0, 0)` ends with `'credits'`. Keep the existing check that `(0, 0, 0, 0)` is empty.
- `src/shared/consolidatedTurnUpdateToast.test.ts`: `humanCreditsAdded: 20` gives `20 credits added to the treasury.`
- `src/shared/topBarStats.test.ts`: credits 5, upkeep 3, fees 4 is short; without an economy `credits` is null. Where an existing test compares a whole `TopBarStats` or `TopBarStatParts` object, add `credits: null` or the two empty parts to its expectation.

**Verify:**

1. `npm test`.
2. `npm run check:circular`.
3. `npm run build:renderer`.
4. `npm start`, in a global match:
   1. The build popup's type list ends with Fortification, Credits.
   2. Queue one Credits item on a home city hex, and end turns until it completes. On that turn the top bar's Credits readout shows 20, and, if the turn has playback, Updates says `20 credits added to the treasury.`
   3. Hold the pointer on the readout and read its tip.

No `doc/` edits.

## Phase 3: Build only where you stand

**Goal.** A seat builds only in its home region and where it has a unit or a fortification. Elsewhere its queue pauses and banks points. The map, the build popup, and the turn report show the pause.

**Shared rule.** Create [`src/shared/productionBuildability.ts`](../src/shared/productionBuildability.ts):

```ts
export function isHexBuildableForSeat(args: {
  readonly h3Index: string;
  readonly homeHexes: ReadonlySet<string>;     // the seat's own home region
  readonly seatUnitHexes: ReadonlySet<string>; // hexes holding at least one unit the seat owns
  readonly fortifiedCount: number;             // fortifications in the hex, which belong to its controller
}): boolean
export function withBuildPausedFlags(state: GameStateSnapshot, viewerSeatId: string | null): GameStateSnapshot
```

- `isHexBuildableForSeat` is true when the hex is in `homeHexes`, or in `seatUnitHexes`, or `fortifiedCount > 0`. Callers ask only for the hex's controller, so a fortification there is that seat's.
- `withBuildPausedFlags` returns `state` unchanged when it has no `strategicBuildQueueTotals`. Otherwise:
  - It builds, once, each seat's home set from `state.homeRegionHexesBySeat`, each owner's unit hexes from `state.units`, the controller of each hex from `state.strategicControl`, and `fortifiedCount ?? 0` from `state.strategicInfrastructure`.
  - It returns a copy whose totals rows carry `buildPaused: true` where the hex is not buildable for its controller, and the controller is `viewerSeatId`, or is any seat (`isSeatId`) when `viewerSeatId` is null. Other rows are unchanged.

  Marking only the viewer's own rows keeps fog intact: a flag on another side's hex would tell the viewer whether that side has units there. The viewer's own units are always in its snapshot, so its own flags are exact.

Add `BUILD_PAUSED_NOTE` and `formatBuildPausedLine` to this file.

**Main rule.** Create [`src/main/gameActions/productionBuildability.ts`](../src/main/gameActions/productionBuildability.ts):

```ts
export interface BuildabilityContext {
  readonly isBuildable: (seatId: SeatId, h3Index: string, fortifiedCount: number) => boolean;
}
export function readBuildabilityContext(): BuildabilityContext
export function isHexBuildableNow(seatId: SeatId, h3Index: string, fortifiedCount: number): boolean
```

- **`readBuildabilityContext`** reads once:
  - every roster seat's home set, with `new Set(getScenarioHomeRegionHexes(seat.homeRegion))`;
  - every owner's unit hexes, with `SELECT DISTINCT player, h3_index AS h3Index FROM units`.

  It answers with `isHexBuildableForSeat`. A seat missing from the roster has an empty home set.
- **`isHexBuildableNow`** answers for one hex with the same rule. It reads the seat's home region and `SELECT 1 FROM units WHERE player = ? AND h3_index = ? LIMIT 1`.

**Spend loop** (`processProductionAfterControlResolution`):

- Before the per-hex loop, call `readBuildabilityContext()` once and create `buildPausedHexesByPlayer = new Map<SeatId, string[]>()`.
- Immediately after the line that declares `let points`, add the pause:
  ```ts
  if (!buildability.isBuildable(controllerPlayerId, control.h3Index, fortifiedCount)) {
    setBuildProgressPointsForHex(control.h3Index, points);
    const paused = buildPausedHexesByPlayer.get(controllerPlayerId) ?? [];
    paused.push(control.h3Index);
    buildPausedHexesByPlayer.set(controllerPlayerId, paused);
    continue;
  }
  ```
  An idle hex has already been skipped above, so it still banks nothing. The queue and Keep building are not touched.
- The return gains `buildPausedHexesByPlayer: ReadonlyMap<SeatId, readonly string[]>`.

**Planning views.**

- `HexBuildQueueSnapshot` (`productionTypes.ts`) and `HexBuildQueueView` (`buildQueue.ts`) gain `buildPaused?: boolean`. In `buildQueueViewForRequester`, bind `const infra = getStrategicInfrastructureForHex(h3Index)`, pass it where the row is passed inline today, and set `buildPaused: true` only when `controlledByRequester && isSeatId(requestingPlayerId) && !isHexBuildableNow(requestingPlayerId, h3Index, infra.fortifiedCount)`. Omit the field otherwise. Setting `false` would change snapshots that compare the whole view. Edits stay allowed on a paused hex.
- `strategicBuildQueueTotals` rows (`gameStateTypes.ts`) gain `buildPaused?: boolean`. The facade `getGameStateForPlayer` (`src/main/gameDb.ts`) applies `withBuildPausedFlags(base, base.fogOfWarEnabled === false ? null : playerId)` beside `withMercenaryEconomy`. `omniscientSnapshot` (`src/main/ipc/matchViewSnapshot.ts`) returns `withBuildPausedFlags({ …its current object… }, null)`, so the observe-all view shows every side's pauses. `fogState.ts` does not change for this.

**Map and popup.**

- `formatProductionQueueAwareLabel` (`productionOverlayHelpers.ts`): right after the `queuedUnits <= 0` return, return ``${capacityText} / ∞t`` when the hex's totals row has `buildPaused === true`.
- `buildQueuePopupFormatting.ts` gains `createBuildPausedNote(): HTMLDivElement`, a `div.build-no-urban` holding `BUILD_PAUSED_NOTE`. In `renderBuildQueueIntoMount`, right after the queue summary line's spacer, append it to `section` when `snapshot.controlledByRequester && snapshot.buildPaused === true`.

**Turn result.**

- `ReadyResult.humanBuildPausedHexes`, omitted when empty, from `productionSummary.buildPausedHexesByPlayer`. Add it to the IPC mirror and its union.
- **Paused line.** Create [`src/renderer/gameplay/productionPauseUpdateLines.ts`](../src/renderer/gameplay/productionPauseUpdateLines.ts):
  ```ts
  export async function productionPauseUpdateLinesFor(readySlice: ReadyResult): Promise<string[]>
  ```
  It returns one `formatBuildPausedLine(names)` line when any hex paused. Do not copy the name lookup: extract the caption loop of `fortificationUpdateLinesFor` (`fortificationUpdateLines.ts`) into an exported `placeNamesForHexes(hexes: readonly string[]): Promise<string[]>` in that file, which falls back to `FORTIFICATION_UNNAMED_PLACE` as it does today. Call it from `fortificationUpdateLinesFor` and from `productionPauseUpdateLinesFor`; leave `fortificationReportLinesFor` as it is. In the helper, log `'place name lookup failed'`, and widen the module's header comment to cover the other Updates lines it now serves.
- **Toast argument.** `ConsolidatedTurnUpdateToastArgs` gains `productionPauseLines?: readonly string[]`. They are trimmed, blank ones dropped, and appended right after `fortificationLines`. `announceResolutionTurnUpdate` awaits the new function and passes them.

**Existing tests.** A production test that queues on a seat-controlled hex outside that seat's home region, with none of its units there, now sees a pause. A fresh match's controlled hexes are that seat's home region, so most production tests keep building.

- For each test that fails for that reason only, change its setup, not the rule: pick a hex in the seat's home region, or put one of the seat's units on the hex with `insertUnitRow`. Do not weaken the pause.
- Keep `gameActionsProduction.test.ts` at or under its starting line count; change a hex choice in place there.
- List every test you changed.

**Tests.**

- [`src/shared/productionBuildability.test.ts`](../src/shared/productionBuildability.test.ts):
  - `isHexBuildableForSeat` is true for a home hex, for a hex with a seat unit, and for a fortified hex, and false otherwise;
  - `withBuildPausedFlags(state, 'human')` marks only the human's non-buildable row of a literal snapshot, and leaves another seat's non-buildable row and a Neutral row alone; with `null` it marks both seats' rows;
  - `formatBuildPausedLine` for one name and for three.
- [`src/main/productionBuildabilityFlow.test.ts`](../src/main/productionBuildabilityFlow.test.ts), on a temp match. Pick a city hex outside every seat's home region, make the human its controller with `setHexController`, and remove any human unit there. Queue `infantry ×1` with enough stored points.
  - `processProductionAfterControlResolution()` spawns nothing there, keeps the queue, banks stored plus urban points, and lists the hex in `buildPausedHexesByPlayer`.
  - With a human unit inserted on the hex, the same call builds the infantry.
  - With a fortified cell instead (`setTacticalCellFortified`), the same call builds the infantry.
  - `getHexBuildQueue(hex, HUMAN_SEAT_ID).buildPaused` is true before the unit is inserted.
- `src/shared/consolidatedTurnUpdateToast.test.ts`: `productionPauseLines` appear in Updates after `fortificationLines`.

**Verify:**

1. `npm test`.
2. `npm run check:circular`.
3. `npm run build:renderer`.
4. `npm start`, in a global match:
   1. Capture a city hex outside your home region and leave it empty.
   2. Queue a unit there. The map label shows `∞t`, and the build popup shows the paused note.
   3. End a turn with movement. Updates names the hex in the paused line.
   4. Move a unit back in and end the turn. The hex builds again.

No `doc/` edits.

## Phase 4: Change unit owners safely

**Goal.** Shared helpers move units to and from Neutral. Code that guessed a unit's owner from its id now reads the real owner. Knockout is the only caller outside tests. A match where nobody is knocked out plays as before. After a knockout, Neutral units no longer count as their old side when the AI decides whether to consult, when the turn report decides whether a kill involved the viewer, or when stale markers are colored. That is the second deliberate change named in Working rules.

**Ownership helpers.** Create [`src/main/gameActions/unitOwnershipTransfer.ts`](../src/main/gameActions/unitOwnershipTransfer.ts):

```ts
export function listCargoUnitIdsForShip(shipId: string): string[]
export function convertUnitsToNeutral(unitIds: readonly string[], coordinates: KnockoutCoordinates): number
export function transferNeutralUnitToSeat(unitId: string, seatId: SeatId): void
```

None of them opens a transaction. Callers wrap them, as `applyKnockout` already does.

Move the `KnockoutCoordinates` interface from `knockoutConsequences.ts` into this file, and re-export it there with `export type { KnockoutCoordinates } from './unitOwnershipTransfer';`, so every existing importer keeps working and the two files do not import each other. `knockoutConsequences.ts` also needs `import type { KnockoutCoordinates } from './unitOwnershipTransfer';`, because a re-export does not bring the name into scope for `applyKnockout`'s own signature.

- **`listCargoUnitIdsForShip`** returns `SELECT land_unit_id … FROM unit_transport_assignments WHERE naval_unit_id = ?`, ordered.
- **`convertUnitsToNeutral`** returns 0 for an empty list. Otherwise:
  1. Read `id, h3_index, unit_type` of the listed units that exist.
  2. Delete their `standing_orders` and `ai_combat_since_consultation` rows, for any `player_id`.
  3. Run `UPDATE units SET player = 'neutral', is_mercenary = 0 WHERE id IN (...)`.
  4. Read `getGameState()`. Give each unit a Neutral missile hold or `defend` order, with the exact code now in `applyKnockout`, logging failures and continuing.
  5. Return how many units it converted.

  Transport rows are left as they are, as in a knockout.
- **`transferNeutralUnitToSeat`:**
  1. Read the unit. It throws when the unit is missing, is not Neutral, is a missile, or appears in `unit_transport_assignments` as either id. Callers check these first.
  2. Delete its `standing_orders` rows, and the seat's `player_unit_intel` row for it.
  3. Run `UPDATE units SET player = ?, is_mercenary = 1, display_order = ? WHERE id = ? AND player = 'neutral'`, with the display order from `allocateNextUnitDisplayOrder(unitType, seatId)`.

**Knockout.** `applyKnockout` keeps `deleteSeatPrivateRows` and the hex loop. It then reads the seat's unit ids and calls `convertUnitsToNeutral(ids, coordinates)` in place of its own `UPDATE` and per-unit loop. Its result counts and its existing tests must not change. The only product `UPDATE` that sets `player` to Neutral is this one. Replacing it is enough. Do not search for a second conversion.

**Owners in the AI consult check.**

- `ReadyResult.aiMoves` rows gain `player?: string`. So do the two inline copies of that row type: the `aiMoves` field of `FinalizeReadyAfterMeleeArgs` (`meleeInterceptReadyFinalize.ts`) and the one in `meleeInterceptPendingState.ts`. `executeReadyStrategicTurn` (`readyStrategicResolutionPipeline.ts`) fills it from the unit it already finds when building `aiMoves`.
- In `enemyHadStrategicResolutionObservableActions` (`consultationPolicy.ts`):
  - an AI move's owner is `move.player ?? unitIdOwnerFromId(move.unitId)`;
  - a killer's owner comes from a map of `state.units` ids to `player`, falling back to `unitIdOwnerFromId`. The seat's own units are always in its snapshot, so a seat's own hired unit is never taken for an enemy.

**Owners in the turn report.** In `deriveCombatVisibilityClassification` (`readyResolutionAnnouncements.ts`), a killer's owner is, in order: the `player` of its removed-unit row, the `player` of its row in `S.gameState.units`, then `unitIdOwnerFromId`.

**Owners of stale intel.**

- `refreshFogOfWarIntelForPlayer` (`fogState.ts`) writes `enemy_player` from the enemy unit's `player` on the one `INSERT INTO player_unit_intel ... ON CONFLICT DO UPDATE`. Add the column to the insert list, the `VALUES`, and the `DO UPDATE` set. There is no second statement for current intel. The later `UPDATE ... SET intel_state = 'stale'` leaves `enemy_player` as last written.
- `GameStateSnapshot.enemyIntel[]` (`gameStateTypes.ts`) gains `player?: string`. `getGameStateForPlayer` reads the column into it. The fog-off branch sets `player: u.player`.
- In the renderer:
  - the `clientStaleEnemyIntelByUnitId` entry type (`core/state.ts`) gains `player?: string; // owner when known; the id prefix can be stale`, on one line, which is all that file's budget allows;
  - `updateClientStaleEnemyIntel` (`stateSnapshot.ts`) sets it from `enemy.player`;
  - `drawStaleEnemyIntel` (`unitDrawing.ts`) carries `player` through both intel lists, and takes each row's owner as `row.player ?? unitIdOwnerFromId(row.unitId)`;
  - both `drawStaleEnemyIntel` and `updateClientStaleEnemyIntel` skip, and delete from the client map, any id that is now in `state.units` with `player === viewer`. Otherwise a unit the viewer just rehired could leave a faded ghost of itself where it was last seen as Neutral.

  A unit that changed owners is then drawn in its owner's color, not its id's.

**Tests.**

- [`src/main/gameActions/unitOwnershipTransfer.test.ts`](../src/main/gameActions/unitOwnershipTransfer.test.ts), on a temp match, inside `BEGIN`/`COMMIT`:
  - `convertUnitsToNeutral` makes a mercenary Neutral and not a mercenary, gives it a Neutral `defend` order, and leaves another unit alone;
  - `transferNeutralUnitToSeat` makes a Neutral unit the seat's mercenary, deletes its Neutral order and the seat's intel row, and gives it a display order not already used by that seat;
  - `transferNeutralUnitToSeat` throws for a seat-owned unit.
- `src/main/openRouter/afterResolutionConsultationGates.test.ts`: an AI move row with `player` equal to the seat and an id prefix of another seat does not count as enemy activity.
- The existing knockout tests pass unchanged.

**Verify:**

1. `npm test`.
2. `npm run check:circular`.
3. `npm run build:renderer`.
4. `npm start`. Play three turns with no knockout and confirm nothing has changed. A knockout may change those three owner reads. That is intended.

No `doc/` edits.

## Phase 5: Hire orders and the end-of-turn payroll

**Goal.** Seats can place hire orders through a game action. At the end of each turn, mercenaries are paid, unpaid ones desert, and orders are filled. Nothing in the UI places orders yet, so tests drive this phase.

**Hire rules.** Create [`src/main/mercenaryHireRules.ts`](../src/main/mercenaryHireRules.ts), pure over a snapshot:

```ts
export interface HireContext { /* the state, the seat, and lookup maps built once */ }
export interface RehireCandidate extends HireRehireRow { readonly h3Index: string }
export interface HexHireEvaluation {
  readonly h3Index: string;
  readonly blockedReason: string | null;      // blocks every hire on this hex
  readonly raiseBlockedReason: string | null; // blocks raising only
  readonly raiseCapacityPerTurn: number;
  readonly raiseOptions: readonly HireRaiseOption[];
  readonly rehireCandidates: readonly RehireCandidate[];
}
export function buildHireContext(state: GameStateSnapshot, seatId: SeatId): HireContext
export function evaluateHexHire(context: HireContext, h3Index: string): HexHireEvaluation
export function listHireEntryHexes(context: HireContext): string[]
```

- **`buildHireContext`** builds, once:
  - units by hex;
  - each ship's cargo, from `embarkedOnNavalUnitId`;
  - the controller, infrastructure row, and `fortifiedCount ?? 0` of each hex;
  - the home sets of the other seats that are still active. A seat is active when its `state.seats` entry has `outTurn === null`. A missing `state.seats` counts every seat in `homeRegionHexesBySeat` as active.
  - whether the requesting seat is active.

  The tech flag is `state.techBonusEnabled === true`.
- **`evaluateHexHire`:**
  - **Blocked** (`blockedReason`), checked in this order:
    - the seat is not active: `HIRE_REASON_NOT_ACTIVE`;
    - `!isHexExploredInSnapshot(state, h3Index)`: `HIRE_REASON_NOT_EXPLORED`;
    - the hex is in another active seat's home set: `HIRE_REASON_OTHER_HOME`.

    When blocked, the options and candidates are empty.
  - **Capacity.** `raiseCapacityPerTurn` is `raiseCapacityForHex(urbanHexCount, isNeutralBorderHex(h3Index))`.
  - **Raising** is blocked, in this order:
    - by `RAISE_REASON_OCCUPIED` when any unit in the hex has a `player` other than the seat;
    - by `RAISE_REASON_FORTIFIED` when `fortifiedCount > 0` and the controller is not the seat;
    - by `RAISE_REASON_NO_CAPACITY` when no option remains.

    The options are `getAvailableBuildUnitTypes(neutralBorder ? 0 : urban, seaports, airports)`, filtered by `isHireableUnitType`, and kept when `unitCostFor(type) <= raiseCapacityPerTurn`. The tier is `techLevelForBirthHex(h3Index)` when the tech flag is on, else `undefined`. The fee is `mercenaryHireFee('raise', upkeep)`.

    Whenever `raiseBlockedReason` is set, `raiseOptions` is `[]`.
  - **Rehire candidates** are the hex's units with `player` Neutral that pass all of these:
    - `isHireableUnitType(unitType)`;
    - no `embarkedOnNavalUnitId`;
    - no cargo;
    - the hex does not hold another owner's fortification (`fortifiedCount > 0` with a controller other than the seat), as for raising.

    Upkeep uses the unit's `techLevel`, and the fee is `mercenaryHireFee('rehire', upkeep)`. `displayName` comes from `buildStrategicUnitDisplayLabelResolver(state.units)`, built once in the context. Units the seat cannot see are not in its snapshot, so they are never candidates.
- **`listHireEntryHexes`** returns, sorted, every hex of `state.exploredHexes` (every hex of `state.hexes` when that is absent) whose `blockedReason` is null and that has at least one raise option or candidate.

**Payroll.** Create [`src/main/mercenaryPayroll.ts`](../src/main/mercenaryPayroll.ts), pure:

```ts
export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[]
export interface PayrollMercenary {
  readonly id: string;
  readonly upkeep: number;
  readonly carriedByShipId: string | null; // set when the mercenary is aboard any ship
  readonly cargoIds: readonly string[];    // units this mercenary ship carries, mercenary or not
}
export interface PayrollResult {
  readonly deserterIds: readonly string[]; // mercenaries and the cargo that leaves with them
  readonly creditsAfter: number;
}
export function settleMercenaryPayroll(args: {
  readonly mercenaries: readonly PayrollMercenary[];
  readonly credits: number;
  readonly seed: number;
}): PayrollResult
```

- **`shuffleWithSeed`** copies the list, then runs Fisher-Yates from `i = length - 1` down to `1`: `j = Math.floor(rng() * (i + 1))` and swap `i` with `j`. `rng` is `createSeededRng(seed)`, which returns a number in `[0, 1)`.
- **`settleMercenaryPayroll`:**
  1. `total` is the sum of upkeep. When `total <= credits`, it returns no deserters and `credits - total`.
  2. Otherwise, sort the mercenaries into three kinds:
     - **walkers** (pool A): no `carriedByShipId` and no cargo. A walker's group upkeep is its own.
     - **loaded ships** (pool B): no `carriedByShipId` and some cargo. A ship's group upkeep is its own plus that of each cargo id that is in the mercenary list.
     - **riders**: a `carriedByShipId` that is not a mercenary in the list. They are aboard a ship that is not a mercenary, so they can never desert. `riderUpkeep` is the sum of their upkeep.

     A mercenary aboard a mercenary ship is part of that ship's group, not a kind of its own. Each pool is sorted by id and then shuffled: pool A with `shuffleWithSeed(poolA, seed)`, pool B with `shuffleWithSeed(poolB, (seed + 1) >>> 0)`.
  3. `remaining` starts as the sum of the walkers' and ships' group upkeep. A group whose upkeep is not a positive integer is not drawn: a `0` upkeep would never reduce `remaining`, and the walk would not end. Walk pool A, then pool B, while `remaining > credits`. Each one walked is drawn: subtract its group upkeep.
  4. Walk the drawn ones again in reverse draw order. Keep, and pay, each one whose group upkeep still fits in `credits - remaining`: add it back to `remaining`. The others desert, each ship with all of its `cargoIds`.
     - Walkers are drawn before loaded ships. The reverse keep-pass considers the last drawn group first, so a cheap loaded ship is kept ahead of a walker when both were drawn and only one fits. Do not invert either pass.
     - The second walk is what makes the rule "pay as many as you can afford": a cheap unit drawn early is not lost because an expensive one was drawn later.
     - A deserting ship's `cargoIds` all turn Neutral, including a cargo unit that is not a mercenary. Do not filter that list down to mercenaries.
  5. Riders are paid from what is left, and any shortfall on them is forgiven: `creditsAfter` is `max(0, credits - remaining - riderUpkeep)`.

  Riders are judged last because they cannot desert: a walker deserting would save nothing that a rider's forgiven upkeep does not already cover.

**Hire actions.** Create [`src/main/gameActions/hireOrders.ts`](../src/main/gameActions/hireOrders.ts):

```ts
export function readHexHireView(h3Index: string, seatId: SeatId): HexHireView | null
export function executePlaceHireOrder(seatId: SeatId, request: HireOrderRequest): HireMutationResult
export function executeRemoveHireOrder(seatId: SeatId, orderId: number): HireMutationResult
```

`readHexHireView` is a read and uses `logTrace`. The two execute functions are writes and use `logDebug`.

Inside the module, one private helper serves the view and placement, so the view and the checks cannot drift:

```ts
function evaluateHexForSeat(h3Index: string, seatId: SeatId): {
  readonly state: GameStateSnapshot;           // getGameStateForPlayer(seatId, { maskUnexploredTerrain: false })
  readonly evaluation: HexHireEvaluation;
  readonly ordersHere: readonly HireOrderRow[]; // the seat's orders whose h3_index is this hex
  readonly capacityLeft: number;               // raiseCapacityPerTurn minus unitCostFor(type) × count over ordersHere's raises
} | null                                       // null for a hex that is not on the map
```

- **`readHexHireView`** returns null when the helper does. Otherwise:
  1. `pendingOrders` are `ordersHere`, each with `hireOrderFee` and, for a rehire, the unit's display name.
  2. `raise` lists only the options whose unit cost fits `capacityLeft`. It is null when raising is blocked or nothing fits.
  3. `raiseBlockedReason` is the evaluation's reason. When raising is allowed but nothing fits `capacityLeft`, it is `RAISE_REASON_CAPACITY_USED`.
  4. `rehireUnits` are the candidates, minus units the seat already has a rehire order for, each mapped to `{ unitId, unitType, displayName, fee, upkeep }`. Drop `h3Index`: this view also reaches the model through `query_mercenaries`, and the result encoder turns only lat/lng pairs into briefing codes, never raw H3 ids.
  5. `hireAvailable` is true when the hex is not blocked and `raise` or `rehireUnits` is non-empty, or when `pendingOrders` is non-empty.
  6. `unavailableReason`, when `hireAvailable` is false, is `blockedReason ?? raiseBlockedReason ?? HIRE_REASON_NOTHING_HERE`.
  7. `funds` is `readMercenaryFunds(gameDbOps, seatId)`.
- **`executePlaceHireOrder`** rejects with a reason, in this order:
  1. `turn_state.phase` is not `planning`: `HIRE_REASON_NOT_PLANNING`.
  2. A human request while `isTacticalBattleActive()`: `HIRE_REASON_TACTICAL`.
  3. The seat is not active in the roster: `HIRE_REASON_NOT_ACTIVE`.
  4. **Raise.** Evaluate `request.h3Index`. Reject with:
     - `HIRE_REASON_COUNT` when the count is not an integer from `HIRE_COUNT_MIN` to `HIRE_COUNT_MAX`;
     - `HIRE_REASON_NOTHING_HERE` when the hex is not on the map;
     - the evaluation's `blockedReason`, then its `raiseBlockedReason`;
     - `RAISE_REASON_TYPE` when the type is not among the evaluation's options;
     - `RAISE_REASON_CAPACITY` when `unitCost × count` exceeds `capacityLeft`.
  5. **Rehire.** Find the unit among the seat's snapshot units with `player` Neutral. Reject with `REHIRE_REASON_NOT_ELIGIBLE` when there is none. Otherwise evaluate the unit's hex, and reject with:
     - the evaluation's `blockedReason`;
     - `REHIRE_REASON_NOT_ELIGIBLE` when the unit is not among its candidates;
     - `REHIRE_REASON_ALREADY_ORDERED` when the seat already has a rehire order for it.

  Then it inserts the row, with `created_turn` from `turn_state`, and returns `{ success: true, orderId }`. A rehire row stores the unit's hex and type. It never checks funds.
- **`executeRemoveHireOrder`** applies the same phase and battle checks, deletes the seat's order, and returns `HIRE_REASON_ORDER_MISSING` when there was none.

**Hire hexes for the renderer.** Add to `mercenaryEconomyRead.ts`:

```ts
export function withHireHexes(ops: GuardedDbOps, state: GameStateSnapshot, seatId: SeatId): GameStateSnapshot
```

It returns `state` unchanged when `state.mercenaryEconomy` is absent. Otherwise it sets `mercenaryEconomy.hireHexes` to the sorted, de-duplicated union of `listHireEntryHexes(buildHireContext(state, seatId))` and the `h3_index` of every hire order of the seat.

Call it only in `readMatchSnapshot` (`src/main/ipc/matchViewSnapshot.ts`), on the snapshot it returns for `HUMAN_SEAT_ID`. Do not call it from the `getGameStateForPlayer` facade: that facade also serves march previews, order validation, and resolution, which must not pay for a scan of every explored hex.

**End-of-turn step.** Create [`src/main/gameActions/mercenaryTurnStep.ts`](../src/main/gameActions/mercenaryTurnStep.ts):

```ts
export interface MercenaryTurnSummary {
  readonly hiredBySeat: ReadonlyMap<SeatId, number>;
  readonly desertedBySeat: ReadonlyMap<SeatId, number>;  // every unit that deserted, cargo included
  readonly unfilledOrdersBySeat: ReadonlyMap<SeatId, number>;
}
export function resolveMercenariesAtEndOfTurn(args: {
  readonly turnNumber: number;
  readonly coordinates: KnockoutCoordinates;
}): MercenaryTurnSummary
```

1. **Early return.** When no unit has `is_mercenary = 1` and no hire order exists, return empty maps. Open no transaction and draw no number.
2. **Transaction.** Run the rest in `BEGIN`/`COMMIT`. On error, `logError`, `ROLLBACK`, and rethrow, as `applyKnockout` does.
3. **Payroll.** For each seat in `getSeatRoster()` order whose `outTurn` is null and that has mercenaries:
   - Build `PayrollMercenary` rows from `listMercenaryUnitsForSeat`. Read `unit_transport_assignments` once. `carriedByShipId` and `cargoIds` both come from that read, so a mercenary aboard a mercenary ship is always in that ship's `cargoIds` and cannot fall out of every pool. `upkeep` comes from `mercenaryUpkeepForUnit`.
   - Seed with `hashStringToUint32(`${getGameSeed()}|${turnNumber}|desert|${seatId}`)`, settle, call `convertUnitsToNeutral(deserterIds, coordinates)`, and `setTreasuryCredits(seatId, creditsAfter)`.
4. **Hires.** Read `listAllHireOrders()`. Drop and log any row whose seat is not active.
   - Shuffle the rest with `shuffleWithSeed(orders, hashStringToUint32(`${getGameSeed()}|${turnNumber}|hire`))`.
   - Read `let state = getGameState()`, after the payroll, and keep a context per seat built from it. After every order that hires at least one unit, read `getGameState()` again and drop the cached contexts, so later orders see the new units.
   - Keep `raiseCostUsedByHex: Map<string, number>`, and each seat's credits read once with `getTreasuryCredits`.
   - **Raise order.** Not filled when any of these holds:
     - the hex is neither explored by the seat nor in the seat's own home region. Read exploration with `isHexExploredForPlayer(gameDbOps, seat, h3)`, importing both as `missileValidation.ts` does. A forced-visible home hex can lack its intel row, which is why the home region counts too;
     - the evaluation is blocked;
     - raising is blocked;
     - the type is not an option.

     Otherwise `n = min(count, floor((capacity - used) / unitCost), floor(credits / fee))`. When `n` is 0 the order is not filled. Otherwise call `createStrategicUnit({ owner, unitType, h3Index, turnNumber, isMercenary: true })` `n` times, subtract `n × fee` from the seat's credits, and add `n × unitCost` to the hex's used capacity.

     The omniscient snapshot has no `exploredHexes`, so the evaluation treats every hex as explored. That is why the step checks exploration itself.
   - **Rehire order.** Find the unit in `state.units`. Not filled when any of these holds:
     - the unit is gone;
     - its hex's evaluation is blocked;
     - it is not a candidate there;
     - its fee exceeds the seat's credits.

     Otherwise call `transferNeutralUnitToSeat` and subtract the fee.
   - Count hired units and unfilled orders per seat, and write each seat's credits with `setTreasuryCredits`. A raise with `n > 0` counts as `n` hired and is not an unfilled order. Only `n === 0`, a blocked order, or a rehire that is not filled increments the unfilled count. Orders dropped because the seat is inactive are logged and counted in neither map.
5. **Clean up.** `deleteAllHireOrders()`, then `COMMIT`.

**Wire it in.**

- In `finalizeReadyTurnAfterMelee`, immediately after `processProductionAfterControlResolution()` and before `listUnitsForSnapshot()`, call `resolveMercenariesAtEndOfTurn({ turnNumber, coordinates: args.knockoutCoordinates })`. `evaluateEndOfTurnOutcome` does not look at units, so the new units do not change victory. Do not place the call after `recordEndOfTurnOutcome`: that function sets `outTurn` before `applyKnockout`, and this step's active-seat check would then skip a seat that still owns mercenaries.
- Set three `ReadyResult` fields for the human seat, each omitted when 0, and add them to the IPC mirror and its union:
  - `humanMercenariesHired` from `hiredBySeat`;
  - `humanUnitsDeserted` from `desertedBySeat`;
  - `humanHireOrdersUnfilled` from `unfilledOrdersBySeat`.
- `buildOtherTurnUpdatePrimaryLines` adds, after the credits line and before the cap line, in this order: `formatMercenariesHiredLine`, `formatUnitsDesertedLine`, `formatHireOrdersUnfilledLine`, each when its count is above 0.

**Tests.**

- [`src/main/mercenaryPayroll.test.ts`](../src/main/mercenaryPayroll.test.ts):
  - enough credits: no deserters;
  - short: deserters come from pool A first, and stop as soon as the rest fits;
  - credits 10 with walkers at 25, 3, and 3 deserts only the 25, for several seeds;
  - credits 10, a walker at 6, and loaded ships at 6 and 20: the walker and the 20-upkeep ship desert, and the 6-upkeep ship stays, for several seeds;
  - credits 10, a walker at 3, and riders at 13: the walker stays, and `creditsAfter` is 0;
  - a loaded ship deserts only after pool A, and its cargo deserts with it;
  - a rider is never listed as a deserter, and its unpaid upkeep is forgiven;
  - a mercenary aboard a mercenary ship deserts only with that ship;
  - the same seed gives the same deserters.
- [`src/main/mercenaryHireRules.test.ts`](../src/main/mercenaryHireRules.test.ts), with snapshot literals:
  - raising is blocked, with no options, by another owner's unit, by another owner's fortification, and by another active seat's home region, and a hex with another owner's unit is not in `listHireEntryHexes`;
  - raising is allowed in a knocked-out seat's former home, and on the seat's own hex with its own units;
  - an unexplored hex is blocked;
  - capacity drops an option whose cost exceeds twice the production;
  - a Neutral missile, a unit aboard a ship, a loaded ship, and a Neutral unit in a Neutral-fortified hex are not candidates.
- [`src/main/mercenaryTurnFlow.test.ts`](../src/main/mercenaryTurnFlow.test.ts), on a temp match.
  - **Setup.** Give seats credits with `setTreasuryCredits`. Store orders with `insertHireOrder`, so the step's own checks are what is tested. Make a Neutral unit by creating an AI-seat unit with `createStrategicUnit` and converting it with `convertUnitsToNeutral` inside `BEGIN`/`COMMIT`. Call `resolveMercenariesAtEndOfTurn` directly, with coordinates from `buildLatLngCoordinateMap(getOrderedHexList())`, as the knockout tests do.
  - **Raise.** A raise order on an empty explored city hex that can raise infantry (`urban_hex_count × MERCENARY_RAISE_CAPACITY_MULTIPLIER >= unitCostFor('infantry')`, so 10 or more city cells on the global map) creates human mercenaries there, with birth hex and formed turn set. It charges their fee, and deletes the order.
  - **Rehire.** A rehire of a Neutral unit makes it a human mercenary and charges twice its upkeep.
  - **Two seats, one unit.** Rehire orders by the human and an AI seat for the same Neutral unit: exactly one seat owns it afterwards, and the other seat's treasury is unchanged.
  - **Desertion.** Mercenaries whose upkeep exceeds the treasury desert until the rest fits. Deserters are Neutral, not mercenaries, and have a Neutral `defend` order.
  - **No change.** With no mercenary and no order, the treasury and every unit are unchanged.
  - **Actions.** `executePlaceHireOrder` accepts a raise on an empty explored city hex with 10 or more city cells, chosen as in the Raise bullet, rejects a raise on a hex with a visible AI unit, and rejects any order outside planning. `readHexHireView` lists the accepted order with its fee.
- `src/shared/consolidatedTurnUpdateToast.test.ts`: the three new lines in order.

**Verify:**

1. `npm test`.
2. `npm run check:circular`.
3. `npm run build:renderer`.
4. `npm start`. Play three turns and confirm nothing has changed.

No `doc/` edits.

## Phase 6: Hire from the map

**Goal.** The human hires through a Hire marker or a Hire tab. Mercenary tokens show `$`, and their tooltip shows their upkeep.

**IPC.**

- **Channels.** Add the three channel constants to `src/shared/ipc/channels.ts`, and the same three to the copied `IPC_GAME` map in `src/main/preload.ts`. The parity tests compare them.
- **API type.** `GameApi` (`gameApiTypes.ts`) gains:
  ```ts
  getHexHireView(payload: { h3Index: string }): Promise<HexHireView | null>;
  placeHireOrder(payload: HireOrderRequest): Promise<HireMutationResult>;
  removeHireOrder(payload: { orderId: number }): Promise<HireMutationResult>;
  ```
  Add the matching `ipcRenderer.invoke` methods to `preload.ts`.
- **Payload guards** (`src/main/ipcPayloadGuards.ts`):
  - `parseHireOrderPayload(payload: unknown): HireOrderRequest | null` accepts a raise with a string `h3Index`, a hireable `unitType`, and an integer `count`, or a rehire with a string `unitId`.
  - `parseHireOrderRemovalPayload(payload: unknown): { orderId: number } | null` accepts a positive integer.
  - Parse `{ h3Index }` the way the `getHexBuildQueue` handler does.
- **Handler.** Create [`src/main/ipc/mercenaryIpcHandler.ts`](../src/main/ipc/mercenaryIpcHandler.ts), shaped like `missileLaunchIpcHandler.ts`. It registers the three handlers and calls `readHexHireView`, `executePlaceHireOrder`, and `executeRemoveHireOrder` with `HUMAN_SEAT_ID`. A rejected payload returns `{ success: false, reason: HIRE_ORDER_INVALID_PAYLOAD }`, or null for the view. Register it in `registerIpcHandlers` in `src/main/main.ts`.

**Which hexes get a Hire marker.** Create [`src/shared/hireEntryHexes.ts`](../src/shared/hireEntryHexes.ts):

```ts
export function hireEntryHexesForHuman(state: GameStateSnapshot): ReadonlySet<string>
```

It returns an empty set unless all of these hold:

- `state.playerPerspective === HUMAN_SEAT_ID`;
- the human seat in `state.seats` is active, or `state.seats` is absent;
- `state.mercenaryEconomy?.hireHexes` exists.

Otherwise it returns those hexes. Observing, or viewing as an AI seat, shows no Hire markers.

**Markers.** `renderer.ts` may gain at most 22 lines in this whole plan, and this phase is that allowance. Put the hire-row fields and the hire-button HTML in new [`src/renderer/gameplay/hireEntryMarkers.ts`](../src/renderer/gameplay/hireEntryMarkers.ts). `syncBuildEntryButton` only branches and calls it.

- **Rows.** Compute the hire set once before the loop with `hireEntryHexesForHuman(S.gameState)`. Each hex row gets a kind:
  - `'build'` when `isStrategicHexHumanUrbanProduction(S.gameState, hx)`, as now;
  - otherwise `'hire'` when the hire set has the hex and the helper says the center is in view;
  - otherwise skip it.

  Keep these source strings verbatim. [`rendererProductionAirConsolidation.test.ts`](../src/main/rendererProductionAirConsolidation.test.ts) reads them: `if (!explored) continue;`, `isStrategicHexHumanUrbanProduction(S.gameState, hx)`, `const hasClickableBuildEntryForHex =`, and `if (hasClickableBuildEntryForHex) {`.
- **Only markers in view.** With fog off, or late in a match, the hire set can hold hundreds of hexes, and this layer rebuilds its HTML on every pan frame. `hireEntryMarkers.ts` exports `HIRE_ENTRY_VIEW_MARGIN_PX` (40) and `isPointInMapView(point, size, margin)`. Skip a hire row whose center lies more than that margin outside the map's size. Read the size with Leaflet's `map.getSize()`, adding `getSize: () => { x: number; y: number }` to the local cast type in `renderer.ts`. Build rows are not culled.
- **Hire rows.** The helper's label is `formatHireEntryLabel(capacityText)`. `capacityText` is ``$${getUrbanProductionCapacityForHex(h3).toLocaleString()}``, the same production figure the build-marker loop uses, without the queue suffix the canvas label adds. It is not raise capacity and not `urban_hex_count`. The marker hides that canvas label, so it must carry the figure. `hasCapacity` is false, and `selected` is false.
- **Markup.** The helper returns a hire button with the extra class `hire-entry-btn`, `data-control-tooltip` set to `hireEntryTooltipText`, and the aria label `formatHireEntryAriaLabel(h3)`. The kind joins the layer key. That key change and the helper call are part of the 22-line allowance.
- **Canvas labels.** In `drawStrategicProductionOverlays`, compute the hire set once. Keep `const hasClickableBuildEntryForHex` and `if (hasClickableBuildEntryForHex) {` exactly. After that `if`, add a second `continue` when `explored && hireSet.has(hx.h3Index) && shouldShowBuildEntryZoom()`. Do not fold the hire skip into the existing condition. Otherwise the canvas label would sit under the marker.

**Popup.**

- **Build hex test.** Add to `productionOverlayHelpers.ts`:
  ```ts
  export function isHumanBuildEntryHexIndex(state: GameStateSnapshot | null, h3Index: string): boolean
  ```
  It finds the hex in `state.hexes` and returns `isStrategicHexHumanUrbanProduction(state, hex)`, or false when the state or the hex is missing. Do not change `isStrategicHexHumanUrbanProduction`.
- **Shift.** In `processBuildEntryClick` (`buildQueuePopup.ts`), honor Shift only when the clicked hex and every already selected hex pass `isHumanBuildEntryHexIndex`. Bind `const multiSelect = shiftKey && …` after the existing playback and hover-planning returns, and use it in place of `shiftKey` below that line. `mapGestureWiring.test.ts` requires the playback return to stay the function's first statement, and must pass unchanged. A Hire marker never joins a multi-hex selection, and Shift on a build marker while a Hire popup is open acts as a plain click.
- **Add button.** Only the success handler inside `renderBuildQueueIntoMount` that calls `getElementById('build-popup-body')` and then `renderBuildQueueIntoMount` switches to its `mount` argument. They are the same element today; in a tabbed popup the mount is the Build panel. `showBuildPopup` and `refreshBuildPopupIfOpen` still pass the popup body into the wrapper below. Do not retarget those two.
- **Wrapper.** Create [`src/renderer/gameplay/buildHirePopup.ts`](../src/renderer/gameplay/buildHirePopup.ts):
  ```ts
  export interface BuildHirePopupDeps {
    readonly renderBuildPanel: (mount: HTMLElement, h3Index: string) => Promise<void>;
    readonly hideBuildPopup: () => void;
    readonly refreshGameStateAfterBuildQueueChange: () => Promise<void>;
    readonly showMapToast: (message: string, options?: { isError?: boolean }) => void;
  }
  export async function renderBuildOrHirePopupIntoMount(mount: HTMLElement, h3Index: string, deps: BuildHirePopupDeps): Promise<void>
  ```
  1. With two or more selected hexes, remove `build-popup-wide` from `#build-popup` and call `deps.renderBuildPanel(mount, h3Index)`. That is the multi-hex popup, unchanged.
  2. Fetch the hire data with `fetchHirePanelData(h3Index)` (below). Then return unless `S.buildPopupHexH3 === h3Index` and a module-level request counter, bumped before the fetch, still matches. This is the same guard `renderBuildQueueIntoMount` keeps with its own counter.
  3. On a build hex (`isHumanBuildEntryHexIndex`) whose view is null or has `hireAvailable` false, remove `build-popup-wide` and call `deps.renderBuildPanel(mount, h3Index)`. The popup is then exactly today's.
  4. On a hex that is not a build hex, clear the mount, add `build-popup-wide`, append a `div.hire-panel`, and render the Hire panel into that div. A null view shows a close row and `HIRE_VIEW_FAILED` in a `div.build-no-urban`.
  5. Otherwise, build the tabbed popup:
     - clear the mount and add `build-popup-wide`;
     - append a `div.build-popup-tab-bar[role=tablist]` with two `button[role=tab]` (`BUILD_TAB_LABEL`, `HIRE_TAB_LABEL`), then two `div[role=tabpanel]` panels, the second with class `hire-panel`;
     - render the Hire panel into its div, then await `deps.renderBuildPanel(buildPanel, h3Index)`.

     A click selects its tab: set `aria-selected`, and `hidden` on the other panel. Remember the selected tab with the hex in module state. The popup reopens on Build for a different hex.

  The Hire panel is always a child `div.hire-panel` of the mount, never the mount itself.
- **Callers.** In `buildQueuePopup.ts`, `showBuildPopup` and `refreshBuildPopupIfOpen` call `renderBuildOrHirePopupIntoMount(body, h3, popupDeps)` in place of `renderBuildQueueIntoMount(body, h3)`. Build `popupDeps` once inside the controller: `{ renderBuildPanel: renderBuildQueueIntoMount, hideBuildPopup, refreshGameStateAfterBuildQueueChange: deps.refreshGameStateAfterBuildQueueChange, showMapToast: deps.showMapToast }`.
- **Hire panel.** Create [`src/renderer/gameplay/hirePanel.ts`](../src/renderer/gameplay/hirePanel.ts). It imports `BuildHirePopupDeps` with `import type`, and `sanitizeBuildCountInputText` and `escapeBuildPopupHtml` from `./buildQueuePopupFormatting`. It never imports `./buildQueuePopup`, which would close an import cycle.
  ```ts
  export interface HirePanelData {
    readonly view: HexHireView | null;
    readonly caption: HexNamingCaption | null;
  }
  export async function fetchHirePanelData(h3Index: string): Promise<HirePanelData>
  export function renderHirePanel(panel: HTMLElement, h3Index: string, data: HirePanelData, deps: BuildHirePopupDeps): void
  ```
  - **`fetchHirePanelData`** awaits `getHexHireView` and `getHexNamingTooltipLine({ h3Index, resolution: 1 })`. It logs a failure and uses null for that part.
  - **`renderHirePanel`** is synchronous. It clears `panel` and appends, in order:
    1. A close row like the build popup's, calling `deps.hideBuildPopup`.
    2. The hex code and naming caption, as `renderBuildQueueIntoMount` builds them.
    3. When `data.view` is null, a `div.build-no-urban` with `HIRE_VIEW_FAILED`, and nothing more.
    4. The funds lines, using the named constants, not new string literals:
       - `<strong>${CREDITS_LINE_LABEL}:</strong> n`;
       - `<strong>${UPKEEP_LINE_LABEL}:</strong> n / turn`;
       - `<strong>${HIRE_FEES_LINE_LABEL}:</strong> n`, when the fees are above 0;
       - a `div.hire-funds-warning` with `HIRE_FUNDS_WARNING` when `credits < upkeepPerTurn + pendingHireFees`.
    5. When `hireAvailable` is false, a `div.build-no-urban` with `view.unavailableReason`.
    6. When `view.raise` is set:
       - a `RAISE_SECTION_TITLE` head;
       - `<strong>${RAISE_CAPACITY_LABEL}:</strong> ${formatRaiseCapacityValue(capacityLeft, capacityPerTurn)}`;
       - a row with a type `select` (labels from `formatHireOptionLabel`), a count input built like the build popup's (the same digit filter and `sanitizeBuildCountInputText`), and a `HIRE_BUTTON_LABEL` button.

       When `view.raise` is null and `raiseBlockedReason` is set, show that reason in a `div.build-no-urban`.
    7. When `rehireUnits` is non-empty: a `REHIRE_SECTION_TITLE` head, and one row per unit. Each row has a `span.unit-label` filled with `setUnitNameContent(label, unitId, displayName)` from `../core/unitOriginFlags`, the fee, and a `HIRE_BUTTON_LABEL` button. If that import changes the `check:circular` output, set `label.textContent = displayName` instead, and report it.
    8. When `pendingOrders` is non-empty: a `PENDING_HIRE_SECTION_TITLE` head, and one row per order with `formatHireOrderLabel(order)` and an `x` remove button.
    9. A `div.build-no-urban` with `HIRE_ARRIVAL_NOTE`.

    Each control gets its tip from `src/renderer/chrome/hireTooltipText.ts` (new). Reuse the build popup's classes (`build-queue-section`, `build-queue-head`, `build-queue-title`, `build-queue-row`, `build-count-input`, `unit-select`) so the panel looks like the Build panel.
- **Mutations.** Every button:
  1. returns at once while `resolutionPlaybackBlocksMapOrders(S.resolutionMoveAnimation)` is true;
  2. calls the IPC;
  3. on failure, shows `result.reason ?? HIRE_ORDER_UPDATE_FAILED` with `deps.showMapToast(…, { isError: true })`;
  4. on success, awaits `deps.refreshGameStateAfterBuildQueueChange()`, then `fetchHirePanelData(h3Index)`, and re-renders only its own panel with `renderHirePanel`.

  After every await in a mutation, return unless `S.buildPopupHexH3 === h3Index` and `panel.isConnected`. Otherwise a slow reply for one hex could paint into another hex's popup, or into a closed one. The wrapper's own guard is the one in its step 2.

**CSS** (`static/overlayChrome.css`):

- `.build-popup.build-popup-wide { max-width: 280px; }`
- `.build-popup-tab-bar` and its buttons. Copy the declarations of `#ai-strategy-toast .ai-strategy-tab-bar` and its button rules in `static/feedbackChrome.css`, under the new selectors.
- `.hire-funds-warning { color: var(--chrome-error); font-size: 11px; }`

**Tokens.** Create [`src/renderer/rendering/mercenaryBadgeDrawing.ts`](../src/renderer/rendering/mercenaryBadgeDrawing.ts):

```ts
export function drawMercenaryBadge(ctx: CanvasRenderingContext2D, x: number, y: number): void
```

It draws `MERCENARY_BADGE_TEXT` centered at `(x, y + UNIT_RADIUS * MERCENARY_BADGE_Y_OFFSET_RATIO)`, in `MERCENARY_BADGE_FONT`, with a 2 px white stroke and black fill, inside `save`/`restore`, like the count badge.

- **Strategic tokens.** In `drawUnits` (`unitDrawing.ts`), after the count-badge loop, call it once at that token's `top` when any unit still in that token's list has `isMercenary === true`. `drawUnits` already drops ids in `movingUnitIds`, which is what keeps a moving token from gaining a `$`. Do not badge every marker in the hex, and do not badge a token whose only mercenaries were excluded as moving. Do not add a parameter to `drawOneUnitMarker`.
- **Battle tokens:**
  - `TacticalSubUnitSnapshot` gains `isMercenary?: boolean`. `computeTacticalBattleSnapshot` copies it from the parent, only when true, beside `techLevel`.
  - The three projections of sub-units into drawable units copy it: in `gameScene.ts`, and the two in `wiredEntryCallbacks.ts`.

**Tooltip.**

- `UnitOriginTooltipIdentity` (`unitOriginTooltipText.ts`) gains `mercenaryUpkeep?: number`. `identityLines` adds `<strong>${MERCENARY_TOOLTIP_LABEL}:</strong> ${formatMercenaryTooltipValue(n)}` after the DOB line when it is set.
- `tooltipIdentityFor` (`unitOriginFlags.ts`) fills it from the live battle sub-unit or strategic unit when `isMercenary === true` and the type is hireable, with `mercenaryUpkeepFor(unitType, techLevel)`.

**Tests.**

- [`src/shared/hireEntryHexes.test.ts`](../src/shared/hireEntryHexes.test.ts): the human perspective returns the hexes, and an AI perspective or a knocked-out human seat returns none.
- `src/shared/unitOriginTooltipText.test.ts` (or its existing test file): a mercenary identity adds the Mercenary line.
- The source-pinning tests (`rendererProductionAirConsolidation.test.ts`, `buildQueuePopupSourceContracts.test.ts`, `mapGestureWiring.test.ts`) pass unchanged.

**Verify:**

1. `npm test`.
2. `npm run check:circular`.
3. `npm run build:renderer`.
4. `npm start`, in a global match:
   1. Queue two Credits items and end turns until you hold 40 credits, then zoom in near your border. Explored Neutral city hexes with 10 or more city cells show Hire markers, labeled with their production and `Hire`.
   2. Click one. The Hire popup shows credits, upkeep, and the raise options. Raise one infantry. The top bar's tip shows the hire fee.
   3. End the turn. A token with `$` appears there, and, if the turn has playback, Updates says `1 mercenary hired.`
   4. Hover the token. Its tip shows the Mercenary line.
   5. On one of your build hexes with 10 or more city cells, the popup has Build and Hire tabs.
   6. Stop queuing credits. Raise mercenaries one per hex, on separate hexes, until their upkeep exceeds your credits. Keep one of your other units in sight of them. End turns until one deserts. That token turns Neutral, and, if the turn has playback, Updates says so. A deserter that shares a hex with your units fights them at the next resolution; that is intended.
   7. Pick a deserter that is alone in its hex, and open that hex: its Hire marker, or the Hire tab if you still control a city there. The deserter is listed under Neutral units. Rehire it, end the turn, and confirm it is yours again with a `$`.
   8. Start a new match with fog of war off (if the new-game options offer it), queue credits until you hold some, and pan across the map at build zoom. Hire markers appear only near the view, and panning stays smooth.

No `doc/` edits.

## Phase 7: AI commander sees the economy

**Goal.** The AI knows the rules, sees its treasury and its options, and may queue credits.

**Undo the Phase 2 filter.** Delete `AI_BUILD_QUEUE_ITEM_TYPES` and `isAiBuildQueueItemType`. At every site the compiler then reports, use `ALL_BUILD_QUEUE_ITEM_TYPES` or `isBuildQueueItemType` again. Then:

- **`summarizeQueue`** (`productionTools.ts`):
  - `availableUnitTypes` becomes the unit-only list, plus each non-unit item (`fortification`, `credits`) that the full list contains, in `ALL_BUILD_QUEUE_ITEM_TYPES` order;
  - when `queue.controlledByRequester` is true, it also returns `buildPaused: queue.buildPaused === true`.
- **Caps.** `credits` is never capped, and for every cap rule and cap message it is not "another type": the cap check and the all-at-cap note look at unit types only, as they already do for `fortification`.

**Rule text.** Create [`src/main/openRouter/promptSpec/gameRuleMercenaryText.ts`](../src/main/openRouter/promptSpec/gameRuleMercenaryText.ts):

```ts
export function buildCreditsProductionRulePart(): string
export function buildBuildabilityRule(): string
export function buildMercenaryRule(): string
export function buildMercenaryUpkeepRule(): string
export function formatMercenaryFundsLine(funds: MercenaryFunds): string
export const MERCENARY_FUNDS_WARNING: string
export const NO_REHIRE_CANDIDATES_LINE: string
export const NO_RAISE_OPTIONS_LINE: string
export const MERCENARY_ID_PREFIX_NOTE: string
export const BUILD_STATUS_COLUMN_HEADER = 'Building';
export const MERCENARY_BRIEFING_MAX_ROWS = 10;
```

- **`buildCreditsProductionRulePart()`:** ``a credits item costs ${creditsItemCost()} production points and adds ${CREDITS_PER_ITEM} credits to your treasury (queue unitType "credits")``
- **`buildBuildabilityRule()`:** `You can build only in your home region and in cells that hold one of your units or fortifications at the end of the turn. Elsewhere a queue pauses and keeps banking its points.`
- **`buildMercenaryRule()`:** ``Credits hire mercenaries. Raise new units in an explored cell outside other sides' home regions that holds no units but yours and no fortifications but yours, up to twice the cell's production in unit cost each turn, or rehire a Neutral unit you can see. Hired units arrive at the end of the turn and take orders the next turn. A raise costs one turn of upkeep and a rehire costs two. After that each mercenary costs its upkeep every turn: ${upkeepList} credits per turn. The Advanced figure applies when tech bonuses are on. Credits produced this turn arrive before upkeep is paid. If your treasury cannot pay, random mercenaries desert to Neutral. A rehired unit that shares its cell with other sides' units, Neutral included, fights them at the next resolution, and so does a deserter that shares a cell with your units. Mercenaries do not count toward unit caps.``
  `upkeepList` is built over `HIREABLE_UNIT_TYPES` from `mercenaryUpkeepFor(type, undefined)` and `mercenaryUpkeepFor(type, 'advanced')`, as `infantry 3 (Advanced 5), armor 5 (10), naval 13 (25), air 8 (15)`. The tech multiplier is applied before rounding up, so Advanced is not simply double.
- **`buildMercenaryUpkeepRule()`:** the upkeep-only rule for a seat whose production tools are off: ``Your mercenaries cost upkeep every turn: ${upkeepList} credits per turn. The Advanced figure applies when tech bonuses are on. Credits produced this turn arrive before upkeep is paid. If your treasury cannot pay, random mercenaries desert to Neutral. A deserter that shares a cell with your units fights them at the next resolution.``
- **`formatMercenaryFundsLine(funds)`:** ``Treasury: ${credits} credits. Mercenary upkeep: ${upkeepPerTurn} credits per turn for ${mercenaryCount} ${word}. Hire orders this turn: ${pendingHireFees} credits.`` `word` is `mercenary` for 1, otherwise `mercenaries`.
- **`MERCENARY_FUNDS_WARNING`:** `Warning: your treasury does not cover upkeep plus this turn's hire orders. Credits produced this turn arrive first. Random mercenaries desert only if upkeep cannot be paid, and hire orders the rest cannot pay are not filled.`
- **`NO_REHIRE_CANDIDATES_LINE`:** `No Neutral unit you can see can be rehired.`
- **`NO_RAISE_OPTIONS_LINE`:** `No explored cell can raise mercenaries for you now.`
- **`MERCENARY_ID_PREFIX_NOTE`:** `A rehired unit keeps the id prefix of the side that first created it. Who owns a unit comes from your roster and the enemy lists, not from its prefix.`

**Wire it in.**

- **Cost line.** `buildProductionCostRulesLine` returns ``Rules: ${parts.join(', ')}. ${buildFortificationProductionRulePart()}. ${buildCreditsProductionRulePart()}.``
- **Production block.** `buildProductionBriefingBlock` (`briefingSections.ts`) pushes `buildBuildabilityRule()` right after `buildProductionIncomeRule()`.
- **Production table:**
  - it gains a last column, `BUILD_STATUS_COLUMN_HEADER`, valued `paused` when the row's `buildPaused` is true and `yes` otherwise;
  - `ControlledHexQueueSnapshot` and `NormalizedControlledHexQueueRow` gain `buildPaused`, filled where the rows are built;
  - the empty-row placeholder array gains one more `'—'`.
- **Submit clause.** `buildProductionSubmitClause` lists `ALL_BUILD_QUEUE_ITEM_TYPES` again.

**Mercenaries section.** Add `SECTION_TITLE_MERCENARIES = 'Mercenaries'` to `sectionHeadings.ts`. Do not change `sectionHeadings.test.ts`. Create [`src/main/openRouter/briefingSectionsMercenaries.ts`](../src/main/openRouter/briefingSectionsMercenaries.ts):

```ts
export function buildMercenariesBriefingBlock(
  state: GameStateSnapshot,
  format: (h3Index: string) => string,
  mode: 'strategic' | 'tactical',
  options: { readonly productionEnabled: boolean }
): string
```

It returns `''` in tactical mode, when `state.mercenaryEconomy` is absent, or when production is off and the seat has no mercenary. Without production it builds only items 1–3, with `buildMercenaryUpkeepRule()` in place of item 1: a seat whose production tools are off still pays upkeep, so it still gets the warning, but it cannot hire, so it is not taught how. Otherwise it builds all five, with the heading made the way `buildMissileForcesBriefingBlock` makes its own:

1. `buildMercenaryRule()`.
2. `formatMercenaryFundsLine(economy)`, then `MERCENARY_FUNDS_WARNING` when `credits < upkeepPerTurn + pendingHireFees`.
3. **Your mercenaries**, when the seat has any: a `Unit ID | Type | Hex | Upkeep` table, sorted by id. Upkeep uses `mercenaryUpkeepFor(type, unit.techLevel)`. Show at most `2 × MERCENARY_BRIEFING_MAX_ROWS` rows, then ``…and ${n} more.``
4. **Rehire candidates**: build `buildHireContext(state, ownSeat)` and gather the candidates of every hex that holds a Neutral unit. Leave out units the seat already has a rehire order for (`listHireOrdersForSeat`).
   - Sort by grid distance to the nearest unit the seat owns (`computeGridDistanceWithPathFallbackPure`; null counts as farthest), then by id.
   - Keep `MERCENARY_BRIEFING_MAX_ROWS`, in a `Unit ID | Type | Hex | Fee | Upkeep` table.
   - With none, write `NO_REHIRE_CANDIDATES_LINE`.
5. **Raise options**: evaluate each hex of `listHireEntryHexes(context)` and keep those with raise options.
   - Sort the same way, by the hex's distance, then by hex.
   - Keep `MERCENARY_BRIEFING_MAX_ROWS`, in a `Hex | Capacity | Options` table. Capacity is what is left after the seat's raise orders on that hex: subtract `unitCostFor(type) × count` over its `listHireOrdersForSeat` raise rows there. Do not call `readHexHireView` here; each call rebuilds the whole snapshot. Options that no longer fit are left out. Options read like `infantry (fee 3, upkeep 3); armor (fee 5, upkeep 5)`.
   - With none, write `NO_RAISE_OPTIONS_LINE`.

In `openRouterBuildSystemPrompt.ts`:

- build `const mercenaryRaw = buildMercenariesBriefingBlock(state, format, coordinateContext.mode, { productionEnabled: flags.productionEnabled });` and a block string the way `missileBlock` is built;
- insert it right after `${missileBlock}` in both `mainBlock` templates.

**Sides note.** `buildSidesPromptBlock` gains `readonly includeMercenaryNote?: boolean` (omitted means false), and appends `MERCENARY_ID_PREFIX_NOTE` as a final line when it is true. The caller passes `state.units.some((unit) => unit.isMercenary === true)`.

**Tests.**

- [`src/main/openRouter/promptSpec/gameRuleMercenaryText.test.ts`](../src/main/openRouter/promptSpec/gameRuleMercenaryText.test.ts): the credits part contains `costs 20 production points and adds 20 credits` on the global map, and the mercenary rule contains `infantry 3 (Advanced 5), armor 5 (10), naval 13 (25), air 8 (15)`.
- [`src/main/openRouter/briefingSectionsMercenaries.test.ts`](../src/main/openRouter/briefingSectionsMercenaries.test.ts), on a temp match. Give an AI seat credits and one mercenary, and read its view with `getGameStateForPlayer`.
  - The block has the heading, the funds line, and the mercenary's row.
  - In tactical mode it is empty.
  - With `productionEnabled: false`, it still shows the funds line and the mercenary's row, and no rehire or raise table.
- `src/main/productionOrders.test.ts`: a `credits` order is accepted.
- `src/main/tools/productionTools.test.ts`: `query_production` on a paused AI hex reports `buildPaused: true`.
- If a prompt-contract test pins text this phase changes on purpose (the cost line, the production table, the submit clause), update its expected text to the builder's new output, and list each test.

**Verify:**

1. `npm test`.
2. `npm run check:circular`.
3. `npm start` with a model key. Run an Observe-only global match for about 15 turns. In the consult log, check that:
   - the production table has the Building column;
   - the cost line names credits;
   - the Mercenaries section appears.

   Report whether any AI queued credits. If none did, say so. Do not change prompts to force it.

No `doc/` edits.

## Phase 8: AI commander hires

**Goal.** The AI can place and remove hire orders, through tools or through the envelope.

**Tools.** Create [`src/main/tools/mercenaryTools.ts`](../src/main/tools/mercenaryTools.ts):

```ts
export const MERCENARY_TOOL_NAMES = ['query_mercenaries', 'hire_mercenaries'] as const;
export function isMercenaryToolName(toolName: string): boolean
export function executeMercenaryTools(
  seatId: AiSeatId,
  toolName: string,
  args: unknown,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown>
```

- **Hex arguments.** Move `resolveHexArgument` from `productionTools.ts` into new [`src/main/tools/toolHexArgument.ts`](../src/main/tools/toolHexArgument.ts), which imports nothing but types and the logger. `productionTools.ts` and `mercenaryTools.ts` import it from there. `mercenaryTools.ts` must not import `productionTools.ts`: that file is already on a reported import cycle, and a second path into it adds a new one.
- **Hex results.** A result names a hex under the key `position`, as `[lat, lng]` from `latLngByH3`, so the result encoder turns it into a briefing code.
- **`query_mercenaries`:**
  - Without `hex`, it returns `{ status: 'ok', credits, upkeepPerTurn, pendingHireFees, mercenaryCount, orders }`. Each order is `{ orderId, kind, position, unitType, count, unitId, fee }`.
  - With `hex`, it returns `{ status: 'ok', ...view, position }` without `h3Index`, where `view` is `readHexHireView(h3, seatId)`. When the view is null it returns `{ status: 'error', error: HIRE_REASON_NOTHING_HERE }`. The result encoder only encodes results whose `status` is `'ok'`.
  - Both tools read funds and orders when called (`readMercenaryFunds(gameDbOps, seatId)`, `listHireOrdersForSeat(seatId)`), not from the `state` the tool loop passes in, which was read when the consult started.
- **`hire_mercenaries`:**
  - `action` is `'raise'` (`hex`, `unitType`, `count`), `'rehire'` (`unitId`), or `'cancel'` (`orderId`).
  - It calls `executePlaceHireOrder` or `executeRemoveHireOrder`.
  - It returns `{ status: 'ok', orderId?, credits, pendingHireFees }`, or `{ status: 'error', error: reason }`.
- **Errors.** Catch, log, and return `{ status: 'error', error }`, as `executeProductionTools` does.

**Register the tools.**

- **Catalog** (`openRouterToolCatalog.ts`): add both, modeled on `query_production` and `set_build_queue`.
  - `hex` uses the same `pattern`. `unitType` enumerates `HIREABLE_UNIT_TYPES`, and `action` enumerates its three values.
  - `query_mercenaries` prompt line: `query_mercenaries(hex?) - Read your treasury, upkeep, and hire orders, or what you can hire in one cell.`
  - `hire_mercenaries` prompt line: `hire_mercenaries(action, hex?, unitType?, count?, unitId?, orderId?) - Raise mercenaries in a cell, rehire a Neutral unit, or cancel a hire order. Orders fill at the end of the turn.`
- **Group.** The `production` group's `toolNames` becomes `[...PRODUCTION_TOOL_NAMES, ...MERCENARY_TOOL_NAMES]`. The tools are then enabled with production and excluded in battles.
- **Dispatch.** `requestOrdersToolLoop.ts` is already over 600 lines and may gain at most 3. One import, and one leading arm on the existing ternary: `isMercenaryToolName(toolName) ? executeMercenaryTools(actingSeatId, toolName, execArgs, toolState, latLngByH3, resolveToH3) :` the current `toolName.includes('order')` arm. Do not add a helper in this file. `hire_mercenaries` does not contain the substring `order`. The explicit arm is what keeps it out of pathfinding.
- **Arguments.** `decodeOpenRouterToolArgsForExecution` decodes `hex` for both tools, beside `set_build_queue`.
- **Results.** `encodeOpenRouterToolResultForLlm` sends both tools through `deepRedactGeoCoordinateFields`, beside `assess_unit`.

**Envelope.**

- **Order type** (`productionOrders.ts`). `ProductionOrder` becomes:
  ```ts
  export type ProductionOrder =
    | { readonly action: 'set_build_queue'; readonly hex: string; readonly unitType: BuildQueueItemType; readonly count: number }
    | { readonly action: 'raise_mercenaries'; readonly hex: string; readonly unitType: HireableUnitType; readonly count: number }
    | { readonly action: 'rehire_mercenary'; readonly unitId: string };
  ```
- **Action type.** `ProductionOrderAction` becomes `ProductionOrder['action']`.
- **Normalizer.** `normalizeProductionOrders` accepts the three actions:
  - a raise checks its hex code like `set_build_queue`, its type with `isHireableUnitType`, and its count from 1 to 99;
  - a rehire needs a non-empty string `unitId`.

  Bad rows are dropped with a reason, as today.
- **Schema** (`envelopeJsonSchema.ts`):
  - `PRODUCTION_ORDER_ACTIONS` lists all three;
  - the `productionOrders` row becomes `{ anyOf: [...] }` of three closed rows, built by mapping `PRODUCTION_ORDER_ACTIONS`: each row has its own `action` as a one-value enum and all of its fields required. Mapping the constant keeps it in use, so lint passes.

  The existing test that checks the `productionOrders` enum for `fortification` reads the node as text, and should pass unchanged.
- **Apply.** Move `processProductionOrdersArray` from `orderResponseParsing.ts` into new [`src/main/openRouter/productionOrdersApply.ts`](../src/main/openRouter/productionOrdersApply.ts), as `applyProductionOrdersFromEnvelope`. It takes the same five arguments plus a sixth, `executeProduction: typeof executeProductionTools`, typed with `import type { executeProductionTools } from '../tools/productionTools'`. `orderResponseParsing.ts` keeps its `executeProductionTools` import and passes it in. `productionOrdersApply.ts` must not import `productionTools.ts` at runtime, for the same cycle reason.
  - `set_build_queue` works as today.
  - `raise_mercenaries` translates its hex code the same way and calls `executeMercenaryTools(seat, 'hire_mercenaries', { action: 'raise', hex, unitType, count }, …)`.
  - `rehire_mercenary` calls it with `{ action: 'rehire', unitId }`. Its drop reasons name the unit (``production rehire_mercenary @ ${unitId}: …``), since it has no hex.
  - Each success counts in `appliedCount`.

  `parseOrdersResponse` imports the moved function.
- **Prompt.** Add `MERCENARY_ENVELOPE_ROWS_SENTENCE` to `gameRuleMercenaryText.ts`: `To hire, add {"action":"raise_mercenaries","hex":"<code>","unitType":"infantry","count":1} or {"action":"rehire_mercenary","unitId":"<id>"} rows to productionOrders.`
  - `buildProductionSubmitClause` (`promptText.ts`) appends it after the queue text.
  - `buildMercenariesBriefingBlock` adds it after the rule when `options.productionEnabled` is true. Without production tools the seat has no `productionOrders` field, so the sentence would point at nothing.

  `promptText.ts` must stay at or under 600 lines.

**Tests.**

- `src/main/productionOrders.test.ts`: a raise row and a rehire row are accepted, and a raise row without `count` is dropped. The existing fortification test reads `parsed.validOrders[0]?.unitType`, which no longer compiles against the union. Narrow it first: `const order = parsed.validOrders[0]; assert.ok(order?.action === 'set_build_queue'); assert.strictEqual(order.unitType, 'fortification');`.
- `src/main/openRouter/promptSpec/envelopeJsonSchema.test.ts`: the `productionOrders` items are an `anyOf` with three rows.
- [`src/main/tools/mercenaryTools.test.ts`](../src/main/tools/mercenaryTools.test.ts), on a temp match. Placement judges occupancy on what the AI seat sees, so set up its view first. For an AI seat:
  - `hire_mercenaries` raise on one of its home city hexes with no units and 10 or more city cells returns `ok` and stores an order;
  - `cancel` removes it;
  - put an AI unit next to a hex holding a human unit, call `refreshFogOfWarIntelFromCurrentState()`, and a raise on the human unit's hex returns `error`;
  - `query_mercenaries` with a hex returns `status: 'ok'` and a `position`.
- `src/main/openRouter/openRouterToolGroups.test.ts`: the production group contains both tools.
- Update pinned prompt text as in Phase 7, and list each test.

**Verify:**

1. `npm test`.
2. `npm run check:circular`.
3. `npm start` with a model key. Run an Observe-only global match for about 20 turns.

   Report:
   - whether any AI hired, and how;
   - any hire-related drop reasons in the consult log.

   Do not change prompts to force hiring.

No `doc/` edits.

## Phase 9: Documentation

**Goal.** `doc/` describes what shipped. Follow [`AGENTS.md`](../AGENTS.md) "Keep `doc/` Current":

- Read each document before editing it, and match its voice, headings, and table layout.
- Take numbers and names from the code, and name the symbol.
- Keep this plan's phase names and numbers out of every document.
- No document here is generated. Edit only what changed, and make quoted prompt text match the builders' output exactly.

**Where each price comes from.** Every document that states a credit or mercenary price must say it this way, and must never write "build cost × tier ÷ 8" from a regional map's costs:

- a Credits item costs `creditsItemCost()` production points, the active map's infantry price;
- it adds `CREDITS_PER_ITEM` (20) credits on every map;
- fees and upkeep come from the global prices (`mercenaryReferenceCost`), so they are the same numbers on every map: infantry 3 (Advanced 5), armor 5 (10), naval 13 (25), air 8 (15);
- raise capacity is production points, twice the hex's city cells, measured against the active map's unit prices (`unitCostFor`).

**Update in place:**

- **[`doc/combat-rules-v3.md`](../doc/combat-rules-v3.md):**
  - §2: the credits item; where a side may build, and the pause.
  - **A new `### 2.1 Credits and mercenaries`** at the end of §2: the treasury; the price sources above; raising and rehiring with every condition; capacity; fees; upkeep; the desertion order, the second pass, and forgiveness for riders; and the seeded order of hires.
  - §5, flow: production, then payroll and hires, then knockouts.
  - §6, edge cases:
    - two seats hiring the same unit;
    - a loaded mercenary ship deserting with its cargo;
    - mercenaries aboard a regular ship;
    - a raise that meets hidden units;
    - a deserter sharing a hex with its former side's units, and a unit rehired into a hex with other owners' units: the hex has two owners and fights in melee at the next resolution.
  - §14.1, knockout and Neutral: a knocked-out seat's treasury and orders are deleted, and its mercenaries become ordinary Neutral units.
  - The caps text: mercenaries do not count.
- **[`doc/how-to-play.md`](../doc/how-to-play.md):**
  - "Building units": where you can build; the "Build markers" bullet gains Hire markers; "Several hexes" gains the rule that a Hire marker, or a build marker while a Hire popup is open, acts as a plain click with Shift; and the queue table gains a Credits row.
  - A new section on credits and mercenaries, with the price sources above.
  - "How a turn resolves".
  - "Things that may surprise you": paused queues, desertion, unfilled orders, and a deserter or rehired unit fighting the units it shares a hex with. Its "Reading the turn report" bullet gains the new Updates lines.
  - "Where messages appear".
- **[`doc/README.md`](../doc/README.md):** engine constants rows for `CREDITS_ITEM_INFANTRY_MULTIPLIER` (naming `creditsItemCost`), `CREDITS_PER_ITEM`, `MERCENARY_UPKEEP_DIVISOR` (naming `mercenaryReferenceCost`), `MERCENARY_ADVANCED_TECH_MULTIPLIER`, `MERCENARY_REHIRE_FEE_MULTIPLIER`, and `MERCENARY_RAISE_CAPACITY_MULTIPLIER`, in the shape of the existing `fortificationCostPerCell` row.
- **[`doc/save-files.md`](../doc/save-files.md):** `EXPECTED_USER_VERSION` is 26, and the two new tables are saved with the match.
- **[`README.md`](../README.md):** "How the Economy Works" and the opponent's tools, only where they are now wrong, and the test count in "Guardrails" if it is stated (run `npm test` and use its count).
- **`doc/ux/`:**
  - `build-popup.md`: the Credits item; the paused note; the Build and Hire tabs; the Hire-only popup and every part of the Hire panel; the Hire marker; Code Entry Points.
  - `multi-hex-build-popup.md`: it stays build-only; Shift on a Hire marker, or on a build marker while a Hire popup is open, acts as a plain click.
  - `top-bar.md`: the Credits readout, its tip, its short state, and when it is hidden; and that Forces counts only units that count toward caps, so mercenaries appear in the Credits tip instead.
  - `map-surface.md`: Hire markers; the production-label sentence becomes "…or the build or Hire marker, which carries that figure"; the `$` on mercenary tokens; `∞t` also when building is paused.
  - `minimap.md`: `∞t` also when building is paused, if it describes the label.
  - The document that describes the token tooltip (`stack-callout.md` or `hex-tooltips.md`): the Mercenary line.
  - `control-tooltips.md`: the new tips, the changed Forces tip, and Source Anchors.
  - `notifications-and-feedback.md` and `reports-tab.md`: the new Updates lines; in `notifications-and-feedback.md`, the Bonuses tooltip row also gains the Mercenary line.
  - `input-map.md` and `selection-model.md`: Hire markers and the multi-hex selection.
- **[`doc/ux-specification.md`](../doc/ux-specification.md):** glossary entries for credits, treasury, mercenary, raise, rehire, upkeep, and desertion, and a routing row for the Hire panel if the build-popup row does not cover it.
- **[`doc/ui-style-guide.md`](../doc/ui-style-guide.md):**
  - §2.2 Units and Symbols: the `$` badge;
  - §2.3 Top Bar: the Credits readout and its short color;
  - §2.9 Production / Build UI: the tabs, the Hire marker, and the warning color.
- **[`doc/ai-tools.md`](../doc/ai-tools.md):** "Production": the credits item, the Building status, and the two hire tools; and the "Groups shown to the model" table's production row gains both hire tools.
- **`doc/ai-commander-prompts/`:**
  - `strategic-prompt.md` and `example-strategic-prompt.md`;
  - `source-inventory.md`, `information-decision-model.md`, `crosswalk.md`, `assembly-contract.md`, and `variants.md`.

  Update them wherever they mirror a builder this plan changed: the cost line, the buildability rule, the production table, the Mercenaries section (and its upkeep-only form without production), the sides note, the `productionOrders` actions and schema, the submit clause, and the tool catalog. In `variants.md`, the production-off row now says all four production and hire tools are absent, and the Mercenaries section stays, in its upkeep-only form, when the seat has mercenaries.
- **`doc/region-summary-1.md`:** Table 2's note: a Credits item costs that row's infantry price and yields 20 credits on every map, so mercenary fees and upkeep are the same on every map; raise capacity uses the row's prices.
- **`doc/region-vs-region.md`:** the end-of-turn order, and the statement that a side can still build after losing ground.
- **`doc/game-size-unit-caps.md`:** mercenaries do not count toward caps.
- **`doc/hybrid-ai.md`:** the tools table gains the two hire tools, and the sentence that production "also exposes `set_build_queue` as a tool" also names `hire_mercenaries`, which writes too.
- **`doc/ux/order-lifecycle.md`:** hire orders as an order kind: placed in planning, removable until Ready, filled or dropped at the end of the turn.

**Search** `doc/` and `README.md` for `build queue`, `Keep building`, `unitType`, `availableUnitTypes`, `cap`, `Neutral`, `knock`, `top bar`, `Updates`, `productionOrders`, `set_build_queue`, `user_version`, `EXPECTED_USER_VERSION`, and `∞t`. Fix every maintained document that is now wrong. Also check [`doc/project-instructions.md`](../doc/project-instructions.md) and [`doc/coding-prompts-1.md`](../doc/coding-prompts-1.md) for any fact this work made wrong, and change only that fact.

**Leave alone:**

- [`doc/devleopment-plan-v3.4.md`](../doc/devleopment-plan-v3.4.md)
- [`doc/poc-analysis.md`](../doc/poc-analysis.md)
- [`doc/market-research.md`](../doc/market-research.md)
- `doc/release-notes/`

**Verify:** `npm test`. Report every document you edited, and any disagreement between `doc/` and the code that you could not settle.

## Risks to watch

- **Knockout with mercenaries.** The unit constraint makes a Neutral mercenary impossible. Every path that makes a unit Neutral must clear `is_mercenary` in the same `UPDATE`. A constraint error at knockout means one was missed.
- **Counter drift.** `createStrategicUnit` must advance the id counter before the display counter, as the old code did. A changed unit id or label in an existing test means the order changed.
- **RNG drift.** Payroll and hires use their own seeds. A dice change in a match without mercenaries means the step drew a number or opened a transaction when it should have returned early.
- **Stale board during hires.** The step re-reads the board after each order that hires. Without that, two seats could raise on the same hex in one turn, or a seat could be refused on a hex where it just rehired a unit.
- **Pruning instead of pausing.** The where-you-can-build rule must stay out of `getAvailableBuildQueueItemTypes`, which also prunes queues. Folded in, it would delete queue rows.
- **Hidden units.** A raise placed on an explored hex can meet units the seat cannot see. It is then not filled and costs nothing, by design.
- **Home hexes not yet in intel.** A forced-visible home hex can lack an intel row. The step treats the seat's own home region as explored for that reason.
- **Owner from id.** A rehired unit keeps an id from another side. If a hired unit is drawn, counted, or reported as another side's, look for `unitIdOwnerFromId` first.
- **Multi-hex selection.** A Hire hex may be selected alone by a plain click, but must never be part of a selection of two or more. If the multi-hex popup shows a hire hex, the Shift check in `processBuildEntryClick` was missed.
- **Tabs on most build hexes.** A side may raise mercenaries on its own hexes, so nearly every human city hex with 10 or more city cells shows the Build and Hire tabs, not only capped ones. The human chose this.
- **Marker clutter.** Hire markers appear on every eligible explored hex at build zoom, even with an empty treasury; the human chose this. Only markers near the view are built, so panning stays smooth. If the map still reads as too busy, report it rather than hiding markers.
- **Quiet turns.** The Updates toast shows only on turns with playback, so a desertion on a quiet turn shows only on the map and in the top bar. This is the existing gate, left alone.
- **AI view of credits.** Until Phase 7, the AI must not be offered `credits`. If an AI queues credits before then, a site missed the Phase 2 filter.
- **Hiring before a battle.** On a melee-intercept Fight, the end-of-turn step runs before the battle starts, as knockout already does. Mercenaries in that hex can desert, or Neutral units there be rehired, just before the battle. This is accepted.
- **Air mercenaries.** A raised air unit sits on an airport hex its owner may not control yet. Control resolution, which runs before `destroyAirUnitsWithInvalidBase`, gives a hex to its only occupant of any type, so the unit keeps its base. If air mercenaries vanish the turn after they are raised, check that order first. Rehiring is refused in a hex another owner has fortified for the same reason: its control could not change, and a rehired air unit would lose its base.
- **Split stacks.** A deserter, or a unit rehired into a hex with other owners' units, leaves that hex with two owners, and it fights at the next resolution. That is intended. A tester may report it as a bug; point them at the Locked decisions.
- **Old saves.** The version bump makes every earlier save unloadable. That is accepted. Do not add a migration.
