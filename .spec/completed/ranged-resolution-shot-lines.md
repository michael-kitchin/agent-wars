# Ranged resolution shot lines

## Goal
During the existing 1s ranged lightning resolution phase, draw hex-to-hex connector lines for direct-fire orders and return-fire attempts (including misses), matching planned ranged-attack line style. Same look in strategic and tactical. Lines disappear when the lightning phase ends.

## Locked decisions

| Topic | Choice |
|--------|--------|
| Direct-fire lines | Every submitted ranged order that beat (human + opponent), including dice misses and empty-target shots when the attacker still has a known fire-time hex |
| Return-fire lines | Every engagement where return fire was **rolled** (eligible defender), including misses—not only `killsByReturnFire` |
| Timing | Only while `inRangedLightning` is true. No new animation phases. Static style (no pulse) |
| Style | Same as planned lines: `rangePerimeterStaticLineStyle('ranged')` + `RANGE_PERIMETER_ALPHA` |
| Geometry | Hex center → hex center |
| Fog (strategic) | Draw a line only when **both** endpoints are in the visible hex set |
| Scope | Strategic Ready + tactical commit playback |

## Edge rules

- Type: `RangedResolutionShotLine = { fromH3Index: string; toH3Index: string }`
- Field name (IPC / anim): `rangedResolutionShotLines`
- Direct: one pair per submitted order `{ fromH3Index: attacker.h3Index, toH3Index: order.targetH3Index }` when attacker is found
- Return fire: for each engagement with return fire enabled, for each defender with `getRange >= 1` and at least one in-range attacker hex, emit `{ fromH3Index: defenderHex, toH3Index: attackerHex }` for each in-range attacker hex (skip same-hex pairs)
- Deduplicate pairs

## Non-goals

- No new resolution timeline phases or durations
- No pulsing/animated dash on shot lines
- No air-strike or melee connector lines
- No change to planned-order UX outside resolution
- No requirement to unify strategic vs tactical `rangedCombatHexes` lightning hex sets

## Accepted limitations

- **Strategic empty-target / no-engagement beats:** `runRangedPhase` only attaches `rangedResolutionShotLines` when combat hexes are non-empty (same gate as lightning). Orders into empty hexes therefore produce no resolution connectors.
- **Tactical empty / infra targets:** lightning hexes come from submitted target cells, so connectors still show during that window even without dice engagements.
- **Same-hex stacks:** payload may include `from === to` direct pairs; the drawer skips those strokes (return-fire builders already omit same-hex pairs).

## Call sites

| Layer | Path |
|--------|------|
| Builders | [`src/shared/rangedResolutionShotLines.ts`](../src/shared/rangedResolutionShotLines.ts) |
| Emit | `runRangedPhase` in [`src/main/combatResolution.ts`](../src/main/combatResolution.ts) |
| Strategic IPC | `ReadyResult.rangedResolutionShotLines` via [`meleeInterceptReadyFinalize.ts`](../src/main/game-actions/meleeInterceptReadyFinalize.ts) + [`pickReadyResolutionIpcMirrorFields`](../src/main/ipc/readyIpcResolutionMapping.ts) |
| Tactical emit | [`tacticalStrategicOrderPhases.ts`](../src/main/tacticalBattle/tacticalStrategicOrderPhases.ts) → [`tacticalBattleSession.ts`](../src/main/tacticalBattle/tacticalBattleSession.ts) → [`gameActionsCore.ts`](../src/main/game-actions/gameActionsCore.ts) playback |
| Anim | `ResolutionMoveAnimationState` armed in [`readyHandler.ts`](../src/renderer/gameplay/readyHandler.ts) |
| Draw | `drawRangedResolutionShotLines` in [`orderDrawing.ts`](../src/renderer/rendering/orderDrawing.ts); called from [`renderer.ts`](../src/renderer/renderer.ts) `drawGameScene` (tactical: no fog filter; strategic: `getVisibleHexSet`) when `inRangedLightning` |
| Tests | [`src/main/rangedResolutionShotLines.test.ts`](../src/main/rangedResolutionShotLines.test.ts), assertions in [`combatResolution.test.ts`](../src/main/combatResolution.test.ts) |

## Smoke checklist

- [ ] Strategic: visible mutual ranged fire → dashed orange lines + lightning; after ~1s lines gone
- [ ] Strategic fog: one endpoint fogged → no line; `?` markers unchanged
- [ ] Tactical: human + AI ranged same beat → same style during lightning
- [ ] Pending planned lines still work in planning
- [ ] No lines when no ranged combat phase
