# Current-hex explicit move

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. Do not commit or push. Do not copy task names into product code, comments, configuration, or `doc/`.

**Goal:** An AI `explicit_move` whose destination is the unit's current hex is dropped as already arrived, in strategic turns and tactical beats, and the prompt says so.

**Architecture:** One predicate decides "this destination is the unit's current hex." The order-apply loop calls it before the strategic and tactical branches, so a grouped `unitIds` entry drops only the units already there. `validateAiOrder` uses the same predicate so a zero-length AI move cannot be stored as a hold. Human move validation is unchanged.

**Tech Stack:** TypeScript, Electron main process, node:test. Prompt copy is built in `src/main/openRouter/promptSpec/`.

**Spec:** This plan is the spec. On execution, save it to [`.spec/current-hex-explicit-move-execution-plan.md`](.spec/current-hex-explicit-move-execution-plan.md) before editing product code. Leave [`.spec/completed/`](.spec/completed/) as it is.

## Global Constraints

- Do not commit or push. PowerShell does not accept `&&`.
- Do not put plan, phase, or workflow names into product code, comments, configuration, lint messages, or `doc/`.
- Orienting comments on every new or updated function, in the Purpose / When to use / Expected outcome / Exceptions shape already used by `dedupeByUnitKeepLast`. Tests cover the happy path and the essential failure only.
- The new predicate is an exported main-process function that does not change state. Log it at trace on every call, with the logger already imported in that file. Include whether the hexes match. Do not log the hex strings. The apply loop's existing `orders applied` debug line already prints `dropReasons`; do not add another log there.
- The drop reason text is the existing words `already arrived`. Do not invent a second sentence.
- Do not change human move validation. [`src/main/gameActions/strategicOrderValidation.ts`](src/main/gameActions/strategicOrderValidation.ts) keeps `dist === 0` as a legal hold. Leave that comment and that function alone.
- Do not drop a ranged attack because its target hex equals the unit's move destination. Ranged fire and movement resolve separately, and both orders stay. Do not edit the "must not be the acting unit's own move destination" sentences, and do not change the `Target out of range` continue in [`src/main/openRouter/requestOrdersApplyParsed.ts`](src/main/openRouter/requestOrdersApplyParsed.ts).
- A same-hex `explicit_move` does not cancel a standing order. It only omits this turn's movement row. The existing `llmMovementUnitIds` filter already suppresses that unit's generated standing step for this turn; leave that filter as it is. The standing-order cancel loop must still run only for reason `Invalid distance`.
- Do not change debark. [`envelopeOrderRows.ts`](src/main/openRouter/envelopeOrderRows.ts) already calls `clearEmbarkAssignmentForLandUnit` for every `explicit_move` before apply runs, including a destination that is the current hex. Leave that call as it is. This plan only omits the movement row.
- Do not change `disembark` or `transport_move`.
- [`src/main/openRouter/requestOrdersFlowSupport.ts`](src/main/openRouter/requestOrdersFlowSupport.ts) is near the desirable file-size limit. Add the predicate there and do not add another helper. Keep its comment to the four standard lines plus the trace call.
- Edit living docs in place. Do not regenerate the example prompt files. Change only the sentences named in Phase 4.
- After main-process edits, `npm run build:main` before `node --test` on a `dist/main/...test.js` file. Do not hand-edit `dist/`. [`requestOrdersFlowSupport.ts`](src/main/openRouter/requestOrdersFlowSupport.ts) does not import `openRouter.ts`, so `openRouter.ts` may import the reason constant from it.

## Decisions already made

- Keep a ranged attack whose target is also the move destination. That pair is not a bug.
- Drop the `explicit_move` and keep every other order in the same envelope. The unit stays where it is.
- Apply that drop in both theaters, with the same reason text.
- Other units listed in the same `unitIds` array still move when their own hex is different. Grouped ids are already expanded into one row per unit before this loop, so the predicate does not need its own grouped test.
- A missing unit row is not "already arrived." Let the existing validator report that the unit was not found.

## What is already true

A march whose destination hex equals the unit hex is not stored. [`assignOrder`](src/main/tools/standingOrdersCore.ts) sets status `arrived` and deletes the row. The strategic prompt says: "A march to the unit's current cell is dropped as already arrived."

An AI `explicit_move` to that same hex is stored. [`validateAiOrder`](src/main/openRouter/openRouter.ts) treats distance 0 as a hold. Turn 7 stored `a1-t2` → `DA` while `a1-t2` was already on `DA`, inside `movement: 13`, with `dropped: 0`.

Tactical apply already skips a move whose applied hex is the sub-unit's current hex, and it records a reason only when the requested destination was some other hex (`out_of_range (no_progress)`). A destination that is the current hex is skipped with no reason. The tactical branch never calls `validateAiOrder`, so a check that lives only inside `validateAiOrder` does not cover a beat.

[`doc/ai-commander-prompts/strategic-prompt.md`](doc/ai-commander-prompts/strategic-prompt.md) section 3.2 already says an `explicit_move` "must not be the unit's current cell." The builder does not say that, so the model is not told the parser will drop it.

`requestOrders` returns kept moves on `result.orders`, not on a field named `movement`. The test `a second-seat consultation orders only that seat` in [`requestOrdersSeats.test.ts`](src/main/openRouter/requestOrdersSeats.test.ts) stacks the owning infantry onto a hex and then `explicit_move`s it to that same hex, and expects that row to be kept. After this change that row is dropped, so that test must be updated in Phase 2 or `node --test` on that file fails.

## Files

- [`src/main/openRouter/requestOrdersFlowSupport.ts`](src/main/openRouter/requestOrdersFlowSupport.ts) — the predicate.
- [`src/main/openRouter/requestOrdersFlowSupport.test.ts`](src/main/openRouter/requestOrdersFlowSupport.test.ts) — predicate tests. This file already exists. Add tests to it. Do not rewrite its header.
- [`src/main/openRouter/requestOrdersApplyParsed.ts`](src/main/openRouter/requestOrdersApplyParsed.ts) — call the predicate once, before the theater branch.
- [`src/main/openRouter/openRouter.ts`](src/main/openRouter/openRouter.ts) — `validateAiOrder` returns the same reason. Replace the distance-0 hold comment there only.
- [`src/main/openRouter/requestOrdersSeats.test.ts`](src/main/openRouter/requestOrdersSeats.test.ts) — update the second-seat test, and add one consult that drops the same-hex move and keeps a different unit's move.
- [`src/main/openRouter/promptSpec/envelopeContract.ts`](src/main/openRouter/promptSpec/envelopeContract.ts) — invalid-output sentences.
- [`src/main/openRouter/promptSpec/coachingTextStrategic.ts`](src/main/openRouter/promptSpec/coachingTextStrategic.ts) — one added sentence in the orderless-units bullet.
- [`src/main/openRouter/promptSpec/envelopeContract.test.ts`](src/main/openRouter/promptSpec/envelopeContract.test.ts) and [`src/main/openRouter/promptContracts.test.ts`](src/main/openRouter/promptContracts.test.ts) — assertions on those sentences.
- [`doc/ai-commander-prompts/strategic-prompt.md`](doc/ai-commander-prompts/strategic-prompt.md), [`doc/ai-commander-prompts/tactical-prompt.md`](doc/ai-commander-prompts/tactical-prompt.md), and the two example prompt files — the sentences named in Phase 4 only.

## Review focus

- The predicate must run before `if (tacticalBattle)`, not only in the strategic `else`, and not only inside `validateAiOrder`.
- A grouped entry must drop only the units whose destination equals their own hex.
- Human `validateMoveOrder` must still allow distance 0.
- The ranged-target-equals-move-destination path must be untouched.
- The second-seat test must keep a move to a different hex. Its current fixture is a same-hex move.
- Debark in `envelopeOrderRows.ts` must stay unconditional for `explicit_move`.

## Phase 1 — Predicate

**Produces:** A pure function and its tests. No apply-path or prompt change yet.

- [x] Add this to [`src/main/openRouter/requestOrdersFlowSupport.ts`](src/main/openRouter/requestOrdersFlowSupport.ts). The trace call is required. The four-line comment goes above the constant and the function; do not document the constant with a second comment.

```ts
/**
 * Reason when an AI explicit_move names the hex the unit already occupies.
 *
 * Purpose: A zero-length AI move is not a hold. The apply loop and validateAiOrder share this so both theaters drop it.
 * When to use: After the unit's current hex and the order destination are both H3 indexes.
 * Expected outcome: `already arrived` when the indexes are equal, otherwise null. Trace log names whether they match.
 * Exceptions: None.
 */
export const EXPLICIT_MOVE_ALREADY_ARRIVED_REASON = 'already arrived';

export function explicitMoveAlreadyArrivedReason(
  unitH3Index: string,
  destinationH3Index: string
): string | null {
  const sameHex = unitH3Index === destinationH3Index;
  logTrace('requestOrdersFlowSupport explicitMoveAlreadyArrivedReason', { sameHex });
  return sameHex ? EXPLICIT_MOVE_ALREADY_ARRIVED_REASON : null;
}
```

- [x] In the existing [`src/main/openRouter/requestOrdersFlowSupport.test.ts`](src/main/openRouter/requestOrdersFlowSupport.test.ts), import the function and assert two cases: equal hexes return `already arrived`; two different hexes return `null`.
- [x] `npm run build:main`, then `node --test dist/main/openRouter/requestOrdersFlowSupport.test.js`. The new assertions pass, and the filename tests in that file still pass. Apply behavior is still unchanged.

## Phase 2 — Drop the order in both theaters

**Produces:** The apply loop and `validateAiOrder` refuse a same-hex AI move. The old second-seat test still proves a cross-seat drop. A new consult proves a same-hex move is dropped and a sibling move is kept.

- [x] In the movement loop of [`src/main/openRouter/requestOrdersApplyParsed.ts`](src/main/openRouter/requestOrdersApplyParsed.ts), after the duplicate-unit `continue` and before `if (tacticalBattle)`, insert this. Import `explicitMoveAlreadyArrivedReason` from `./requestOrdersFlowSupport` next to the existing import from that file.

```ts
    const unitH3Index = tacticalBattle
      ? tacticalBattle.subUnits.find((unit) => unit.id === order.unitId)?.h3Index
      : planState.units.find((unit) => unit.id === order.unitId)?.h3Index;
    const alreadyArrived = unitH3Index
      ? explicitMoveAlreadyArrivedReason(unitH3Index, order.toH3Index)
      : null;
    if (alreadyArrived) {
      dropReasons.push(`${aiOrderUnitLabel(order.unitId)} -> ${order.toH3Index}: ${alreadyArrived}`);
      seenUnits.add(order.unitId);
      continue;
    }
```

  Leave the later tactical block alone, including the `no_progress` reason used when the requested destination is some other hex but the clamped step is the current cell.

- [x] In [`validateAiOrder`](src/main/openRouter/openRouter.ts), after the unit is found and the seat check passes, and before the distance check, call `explicitMoveAlreadyArrivedReason(unit.h3Index, order.toH3Index)`. When it returns a reason, return `{ valid: false, reason }`. Delete the comment that distance 0 is a valid hold. Import the function from `./requestOrdersFlowSupport`. Leave [`strategicOrderValidation.ts`](src/main/gameActions/strategicOrderValidation.ts) unchanged, including its distance-0 comment.

- [x] Update `a second-seat consultation orders only that seat` in [`src/main/openRouter/requestOrdersSeats.test.ts`](src/main/openRouter/requestOrdersSeats.test.ts). Today it moves the owning infantry onto another seat's hex and orders it to that hex, which is distance 0, and expects `result.orders` to be `[second.id]`. Keep the cross-seat assertion. Change the owning unit's destination to a different hex: call `getValidDestinations` from [`src/main/oneStepMoveDestinations.ts`](src/main/oneStepMoveDestinations.ts) with `{ id: second.id, h3Index: second.h3Index, unitType: 'infantry' }` and `getGameState()`, then take the first hex that is not `second.h3Index`. Convert it with `h3ToCode(..., { mode: 'strategic' })`. If that list has no other hex, `t.skip`. The other seat's order may still name the stacked hex. Assert `result.orders` unit ids are still `[second.id]` and that row's `toH3Index` is the chosen neighbor.

- [x] Add one test in that same file, using the same electron mock, `withThreeSeatMatch`, empty `enabledToolNames`, and single JSON content response as the second-seat test. Consult `AI_SEAT_IDS[0]`. Select two of that seat's land units (`infantry` or `armor`). If fewer than two exist, `t.skip`. Order the first to `h3ToCode` of its own hex. Order the second to the first `getValidDestinations` hex that is not its own hex, or `t.skip` when there is none. Assert `result.success`, `result.orders` unit ids equal `[second.id]`, and some `dropReasons` entry includes `already arrived`. Do not assert a field named `movement`.

- [x] `npm run build:main`, then `node --test dist/main/openRouter/requestOrdersSeats.test.js`. The updated test and the new test pass. The missile-launch test still passes.

- [x] Read the inserted block and confirm it sits before `if (tacticalBattle)`. A same-hex tactical destination therefore never reaches `tacticalComputeMovementOrderOutcome`. The farther-destination `no_progress` branch stays. Do not add a tactical battle fixture; the strategic consult does not execute that branch.

## Phase 3 — Tell the model

**Produces:** Strategic and tactical invalid-output text, plus the strategic coaching sentence. Contract tests pass without another apply-path change.

- [x] In [`buildInvalidOutputRulesClause`](src/main/openRouter/promptSpec/envelopeContract.ts), change the strategic sentence to: `A march or explicit_move to the unit's current cell is dropped as already arrived.` Add this sentence to the tactical array only: `An explicit_move to the sub-unit's current cell is dropped as already arrived.`
- [x] In the orderless-units bullet in [`src/main/openRouter/promptSpec/coachingTextStrategic.ts`](src/main/openRouter/promptSpec/coachingTextStrategic.ts), leave the march sentence. Immediately after `Never march to the unit's current Hex; that order is dropped as already arrived and the unit stays idle.` add: `An explicit_move to the unit's current Hex is dropped as already arrived and the unit stays idle.`
- [x] Extend [`testStrategicPromptDoesNotMarchToCurrentHex`](src/main/openRouter/promptContracts.test.ts) so the guidance also matches `/explicit_move to the unit's current Hex is dropped as already arrived/i`. In [`envelopeContract.test.ts`](src/main/openRouter/promptSpec/envelopeContract.test.ts), assert the strategic clause includes `explicit_move` and `already arrived`, and the tactical clause includes `sub-unit's current cell` and `already arrived`.
- [x] `npm run build:main`, then `node --test dist/main/openRouter/promptSpec/envelopeContract.test.js dist/main/openRouter/promptContracts.test.js`.

## Phase 4 — Docs that name the same rule

**Produces:** The prompt contract and the two reading copies say what Phase 3 emits. No code change.

- [x] In [`doc/ai-commander-prompts/strategic-prompt.md`](doc/ai-commander-prompts/strategic-prompt.md) section 3.4 item 4, replace `A march to the unit's current cell is dropped as already arrived.` with the Phase 3 strategic sentence. In section 3.2's `explicit_move` legality cell, keep "It must not be the unit's current cell." and add that the parser drops it as already arrived. In coaching item 8, immediately after `Never march a unit to its own cell.` add the Phase 3 coaching sentence.
- [x] In [`doc/ai-commander-prompts/tactical-prompt.md`](doc/ai-commander-prompts/tactical-prompt.md), append the Phase 3 tactical sentence to the `explicit_move` legality cell. Add it as invalid-output item 9. Do not renumber items 1–8, and do not edit item 7.
- [x] In [`doc/ai-commander-prompts/example-strategic-prompt.md`](doc/ai-commander-prompts/example-strategic-prompt.md), replace only `A march to the unit's current cell is dropped as already arrived.` with the Phase 3 strategic sentence. Immediately after `Never march to the unit's current Hex; that order is dropped as already arrived and the unit stays idle.` add the Phase 3 coaching sentence.
- [x] In [`doc/ai-commander-prompts/example-tactical-prompt.md`](doc/ai-commander-prompts/example-tactical-prompt.md), the invalid-output paragraph has no march sentence. After `Friendly stacking is legal; a cell holding an enemy is legal as move/melee contact.` add the Phase 3 tactical sentence. Do not add the strategic "march or explicit_move" wording to that file.
- [x] Read those edits against the builder strings from Phase 3. They match. Run `npm test` once. Do not commit.
