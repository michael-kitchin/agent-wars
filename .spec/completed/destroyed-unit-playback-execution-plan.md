# Destroyed Unit Playback Implementation Plan

> **For agentic workers:** Implement this plan phase by phase, in order. Do not start a phase until the previous phase's verification commands pass. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the destruction mark for an air strike, ranged attack, or melee kill finishes, that unit's icon is never drawn again in that playback, including movement and the dice-chip tail. A melee victim who actually arrived still glides to the hex where it died, then plays the mark, then stays gone.

**Architecture:** One pure module decides whether a march glides and which icons are drawn at the current playback timing. `getUnitsForDrawWithMovingIds` in `src/renderer/map/drawInteraction.ts` is the only icon filter. Both branches of `drawGameScene` use the same march filter. IPC march lists stay unchanged, so toasts and consultation do not change.

**Tech Stack:** TypeScript, Electron renderer, Node `node:test` on `dist/shared` and `dist/main` after `npm run build:main`.

## Global Constraints

- Do not commit or push.
- Do not put phase, stage, hypothesis, or plan identifiers into code, comments, tests, configuration, or lint messages. The words in this document's headings stay in this document.
- New and updated fields and non-overriding functions need an orienting comment: why it exists, when to use it, what comes back, and what it throws. Do not export test functions.
- Test happy paths and essential failures only. Do not test DTO constructors, accessors, or controller methods that only forward a call.
- Do not log from a function that runs every animation frame. This plan adds no main-process log.
- Use one argument object when a function would otherwise need more than six named arguments.
- Do not grow the policy into `gameScene.ts`, `drawInteraction.ts`, or `wiredEntryCallbacks.ts`. Those files call the shared module.
- File names under `src/` stay camelCase. Exported functions stay camelCase. Exported types stay PascalCase. Do not use a `Utils` suffix.
- Infantry, armor, naval, and air use the same id rules. Do not branch on `unitType`.
- Do not add a ferry stage. Do not change `captureTurnLossNoteFromResolution` or the loss-note air-strike classification in `humanTacticalDraftCommit.ts`.
- Do not remove or rewrite the source anchors in `src/renderer/wiredEntryCallbacks.ts` that `src/main/rendererConsolidation.test.ts` reads: `phase.inAirStrikeLightning || phase.inAirStrikeCasualty`, `h3Index: move.toH3Index`, and `movingIds = new Set((anim.airStrikeReturnMoves ?? []).map((move) => move.unitId));`.
- Do not remove the three `buildResolutionPlaybackState(anim, ...)` calls in `gameScene.ts`, or the strategic `airStrikeOutboundMoves` assignment in `readyHandler.ts`.

## Locked Behavior

Melee always runs after movement, on the hexes movement left behind. Two melee results follow from that:

- The removal hex equals the march destination. The unit reached that hex. Play the march from the origin to that hex, show the icon through the melee destruction mark, then do not draw it again.
- The removal hex equals the march origin. The unit never left. Do not glide it. Leave the icon on that hex until the melee destruction mark ends, then do not draw it again.
- The removal hex is neither the origin nor the destination. Do not glide. Do not invent a shortened path.

Air-strike and ranged removals happen before movement, so those units die on their pre-move hex. Show each icon through the end of its own destruction mark, then never again. An air-strike victim is hidden from the air-return stage onward, including ranged, movement, melee, and the dice-chip tail. A ranged victim, including ranged return fire, stays visible through the air stages and the ranged destruction mark, then is hidden from movement onward. Anti-air and infrastructure counter-fire that remove a unit during the air phase are air-strike removals.

An id in the air-strike removal list uses the air-strike rule even if that same id is also in the ranged removal list. Tactical `rangedRemovedUnits` includes air-phase removals. That overlap is expected.

The air-strike playback list is not the loss-note list. The loss-note filter also treats some human air units as air-strike losses when they were not: return fire, ferry failure, and melee. Using it for drawing would hide those units before the stage that actually destroyed them. Playback air-strike removals are:

- Strategic: `readyResult.airStrikeRemovedUnits`, which is already the air-phase result.
- Tactical: `airStrikePlaybackRemovedUnits`, copied from `removedUnits` after the air flush and before ranged removals are appended. That copy includes strike victims, based aircraft, anti-air, and infrastructure counter-fire. Anti-air is recorded on `killsByReturnFire`, and infrastructure counter-fire can remove the striker with no kill edge, so do not filter this list by `killsByAirStrike`. Do not add the human-air fallback. Later ranged and ferry removals are absent.

Ferry losses that are only in the ranged removal list keep that list's window. They do not glide, and this plan does not give them a new stage.

The destruction mark is the existing red X for that stage. The icon is on the hex while that X plays, except on a hex in `unknownCasualtyHexes`: those hexes keep the unknown-battle marker and do not gain a removed unit's icon. Lightning before the X still shows a visible icon. The icon does not come back when the X ends, including while dice chips finish after the last stage.

Survivors are unchanged: pre-move placement, then the glide, then post-move placement. Do not drop a survivor because its hex is in `unknownCasualtyHexes`.

Do not delete march rows from `humanMoves`, `aiMoves`, or tactical `opponentMoves`. The player-visible filter is at draw time.

On the tactical map, `tacticalMarchPlaybackUnits` merges pre-commit sub-units back in, so a removed unit is often already in the draw list at its origin. Filtering has to replace that hex or remove that id. Appending only when the id is missing leaves the origin icon in place, including a second icon once the melee branch also appends the destination.

## Phase 1: Pure draw rules

**Files:**
- Create: `src/shared/resolutionCasualtyDraw.ts`
- Create: `src/shared/resolutionCasualtyDraw.test.ts`

**Interfaces:**
- Consumes: nothing from later phases.
- Produces: `ResolutionCasualtyDrawInput`, `ResolutionCasualtyTiming`, `resolutionCasualtyTiming`, `unitIconVisibleAtCasualtyTiming`, `marchPlayedForUnit`, `unitsDrawnAtCasualtyTiming`. Later phases import these names and do not reimplement the rules.

- [x] **Step 1: Write the failing test**

`ResolutionCasualtyDrawInput` holds three arrays of `{ id: string; player: string; unitType: string; h3Index: string }`: `airRemovedUnits`, `rangedRemovedUnits`, `meleeRemovedUnits`.

`resolutionCasualtyTiming` reads the boolean flags on `ResolutionPlaybackPhase`: `inAirStrikeOutbound`, `inAirStrikeLightning`, `inAirStrikeCasualty`, `inAirStrikeReturn`, `inRangedLightning`, `inRangedCasualty`, `inMovement`, `inMeleeLightning`, `inMeleeCasualty`. Check them in that order. Return `'throughAirCasualties'` for outbound, air lightning, or air casualties; `'airReturn'` for the return leg; `'throughRangedCasualties'` for ranged lightning or ranged casualties; `'movement'` for movement; `'throughMeleeCasualties'` for melee lightning or melee casualties; `'afterCasualties'` when every flag is false.

`unitIconVisibleAtCasualtyTiming(unitId, timing, input)`:

- An air-removal id is visible only for `'throughAirCasualties'`.
- A ranged-removal id that is not an air-removal id is visible for `'throughAirCasualties'`, `'airReturn'`, and `'throughRangedCasualties'`.
- A melee-removal id that is in neither earlier list is visible for every timing except `'afterCasualties'`.
- An id in no list is visible for every timing.
- An id in both the air list and the ranged list uses the air rule.

`marchPlayedForUnit(move, input)` where `move` is `{ unitId: string; fromH3Index: string; toH3Index: string }`:

- `false` when the id is an air or ranged removal, including when it is also a melee removal.
- `false` when the melee snapshot hex equals `fromH3Index`.
- `false` when the melee snapshot hex is neither `fromH3Index` nor `toH3Index`.
- `true` when the melee snapshot hex equals `toH3Index`.
- `true` when the id is in no removal list.

`unitsDrawnAtCasualtyTiming` takes one object: `units` (the icons chosen so far), `timing`, `input`, `moves` (`{ unitId: string; fromH3Index: string; toH3Index: string }[]`), and `hiddenHexes`. It returns one icon per remaining id, in the incoming order, with missing removed icons appended at the end. For a removed id that stays:

- Air and ranged icons use the snapshot `h3Index` from the air list when the id is in that list, otherwise from the ranged list.
- A melee icon uses `fromH3Index` when `timing` is `'throughAirCasualties'`, `'airReturn'`, `'throughRangedCasualties'`, or `'movement'` and that origin differs from the snapshot hex. Otherwise it uses the snapshot hex.
- Omit a removed icon whose placed hex is in `hiddenHexes`. Do not omit a survivor for that reason.
- One id yields one icon. A removed id already in `units` keeps its list position and takes the placed hex, `player`, and `unitType` from the removal snapshot.

Cover the five march cases, the visibility cases above, `'afterCasualties'` for a melee id (hidden) and a survivor (visible), and these draw cases:

- A ranged id missing from `units` is added at its snapshot hex during `'throughAirCasualties'` and is absent during `'movement'`.
- An air id that is also in the ranged list is present during `'throughAirCasualties'` and absent during `'throughRangedCasualties'`.
- A melee arrival already in `units` at the origin is still at the origin during `'movement'`, and is at the removal hex, once, during `'throughMeleeCasualties'`.
- A melee source death stays at the snapshot hex during `'movement'`.
- A removed id whose placed hex is in `hiddenHexes` is absent, and a survivor on that same hex remains.
- Two input rows with the removed id become one row.

- [x] **Step 2: Run the test to verify it fails**

```text
npm run build:main
node --test dist/shared/resolutionCasualtyDraw.test.js
```

Expected: FAIL because the module does not exist yet.

- [x] **Step 3: Implement the module**

Put the functions in `src/shared/resolutionCasualtyDraw.ts`. No renderer imports. No logging. Orienting comments on the exported type and each exported function.

- [x] **Step 4: Verify**

```text
npm run build:main
node --test dist/shared/resolutionCasualtyDraw.test.js
```

Expected: PASS.

## Phase 2: Carry air-strike removals on the animation

**Files:**
- Modify: `src/shared/ipc/tacticalPlaybackTypes.ts` (`TacticalCommitResolutionPlayback`)
- Modify: `src/renderer/core/resolutionMoveAnimationTypes.ts` (`ResolutionMoveAnimationState`)
- Modify: `src/main/gameActions/humanTacticalDraftCommit.ts` (the `tacticalResolutionPlayback` object)
- Modify: `src/renderer/gameplay/readyHandler.ts` (the tactical commit animation and the strategic Ready animation)

**Interfaces:**
- Consumes: nothing from Phase 1.
- Produces: `airStrikeRemovedUnits?: RemovedUnitSnapshot[]` on the tactical playback payload and on `ResolutionMoveAnimationState`. Phase 3 reads `anim.airStrikeRemovedUnits`.

- [x] **Step 1: Thread the air-phase rows**

`applyTacticalAirStrikeThenRangedPhaseOnBattle` returns `airStrikePlaybackRemovedUnits`: the removal rows present after the air flush and before ranged removals. `applyHumanTacticalDraftBeatInStrategicOrder` passes that array through, and `tacticalResolutionPlayback.airStrikeRemovedUnits` is that array when it is non-empty. Do not rebuild it from `killsByAirStrike`. Do not use the later local `airStrikeRemovedUnits` that feeds `captureTurnLossNoteFromResolution`. Leave that loss-note filter and its call unchanged. Do not remove air-phase rows from `rangedRemovedUnits`.

Add the optional field to `TacticalCommitResolutionPlayback` and to `ResolutionMoveAnimationState`. The comment says the icon layer reads it during the air stages, and it is omitted when this playback removed nobody in the air phase.

In `readyHandler.ts`, set `airStrikeRemovedUnits` on the tactical animation from `playback.airStrikeRemovedUnits`, and on the strategic animation from `readyResult.airStrikeRemovedUnits`. Omit the property when the list is missing or empty. Do not change march arrays.

- [x] **Step 2: Verify**

```text
npm run build:main
npm run check:renderer-types
node --test dist/shared/resolutionCasualtyDraw.test.js
```

Expected: both commands exit 0 and the test passes.

## Phase 3: Apply the rules while drawing

**Files:**
- Modify: `src/renderer/map/drawInteraction.ts` (`getUnitsForDrawWithMovingIds`)
- Modify: `src/renderer/rendering/gameScene.ts` (tactical branch and strategic branch)
- Modify: `src/renderer/core/resolutionMoveAnimationTypes.ts` (the `tacticalMarchPlaybackUnits` comment only)

**Interfaces:**
- Consumes: `resolutionCasualtyTiming`, `marchPlayedForUnit`, `unitsDrawnAtCasualtyTiming`, and `anim.airStrikeRemovedUnits`.
- Produces: player-visible behavior. No new export is required.

`wiredEntryCallbacks.ts` already merges tactical pre-commit rows and then calls `getUnitsForDrawWithMovingIds`. Hit testing uses that same function. Do not add a second filter in the wrapper or in `gameScene.ts`.

- [x] **Step 1: Filter marches in both draw branches**

In each `drawGameScene` branch, build `ResolutionCasualtyDrawInput` from `anim.airStrikeRemovedUnits`, `anim.rangedRemovedUnits`, and `anim.meleeRemovedUnits`. Missing lists are empty. Build playback moves with the existing `buildResolutionPlaybackMoves`, then keep a move only when `marchPlayedForUnit` is true.

Pass that filtered list to `drawResolutionMoveLines` and `drawMovingUnits`. The tactical lookup set stays the merged pre-commit set, because that set is what still carries `player` and `unitType` for a melee arrival. The strategic lookup set is `state.units` plus `anim.meleeRemovedUnits` mapped to `{ id, player, unitType, h3Index }`. Do not add air or ranged removals to the strategic lookup set. The tactical merged set does include those removals; the march filter is what keeps them from gliding.

`effectiveMovingIds` during movement is the filtered march ids when that list is non-empty. When the filtered list is empty and `anim.moves` is not, leave `effectiveMovingIds` undefined so a melee source death stays on the static layer. Do not point it back at `anim.moves`.

- [x] **Step 2: Filter icons once**

At the end of `getUnitsForDrawWithMovingIds`, only when `S.resolutionMoveAnimation` is set, replace `unitsToDraw` with `unitsDrawnAtCasualtyTiming`. Pass the icons the existing branches already chose, `resolutionCasualtyTiming(phase)`, the same removal input, `anim.moves`, and `anim.unknownCasualtyHexes ?? []`.

In the movement branch, set `movingIds` from `anim.moves` filtered by `marchPlayedForUnit`, and only while `moveProgress < 1`. Do not put an unfiltered `anim.moves` id into `movingIds`. Leave the air-outbound and air-return moving sets as they are.

Replace the `tacticalMarchPlaybackUnits` comment that says units removed by ranged or melee keep their march glides. Say the pre-commit rows exist so a melee arrival can still resolve `player` and `unitType`, and that air and ranged removals do not glide.

- [x] **Step 3: Verify**

```text
npm run build:main
node --test dist/shared/resolutionCasualtyDraw.test.js
node --test dist/main/rendererConsolidation.test.js
npm run check:renderer-types
npm run build:renderer
```

Expected: both tests pass and both builds exit 0.

## Phase 4: Document the playback rule

**Files:**
- Modify: `doc/ux/resolution-playback.md`
- Modify: `doc/combat-rules-v3.md` (section 13 only)

- [x] **Step 1: Record the rule where playback is already specified**

In `doc/ux/resolution-playback.md`, add one Invariant: a unit removed by an air strike, ranged fire, or melee stays on the map through that stage's destruction mark and is not drawn again in that playback. A melee victim is drawn moving only when the removal hex is the march destination. A removed icon is not drawn on an unknown casualty hex. Dice chips can continue after the icon is gone. Add `src/shared/resolutionCasualtyDraw.ts` and `src/renderer/map/drawInteraction.ts` to Code Entry Points. Leave Known Deviations as None.

In `doc/combat-rules-v3.md` section 13.1, after the numbered strategic list, add the same rule in prose. In section 13.2, add one sentence that tactical playback uses it. Do not change combat resolution order and do not renumber the list.

- [x] **Step 2: Verify**

No command. Read the new invariant and the section 13 sentences and confirm they match Locked Behavior. Confirm the loss-note filter in `humanTacticalDraftCommit.ts` is still passed to `captureTurnLossNoteFromResolution`, and that no march payload field was removed.
