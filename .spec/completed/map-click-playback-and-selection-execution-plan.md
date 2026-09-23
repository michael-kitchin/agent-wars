# Map Click Playback and Selection Implementation Plan

> **For agentic workers:** Implement this plan phase by phase, in order. Do not start a phase until the previous phase's verification commands pass. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During resolution playback, map gestures cannot change orders or the unit selection. A rejected ranged or strike target keeps targeting on. A click outside the active battle shows an error toast and changes nothing. A left click on a hex never clears the unit selection.

**Architecture:** Playback blocking and the tactical outside-battle decision are pure functions in `src/shared`, so `node:test` can cover them after `npm run build:main`. The click and double-click listeners in `src/renderer/map/mainMapInteractions.ts` call those functions before they write `selectedHexIndex` or the selection. Build-queue mutations consult the same playback function and return without writing.

**Tech Stack:** TypeScript, Electron renderer, Node `node:test` from `dist/shared` after `npm run build:main`.

## Global Constraints

- Do not commit or push.
- Do not put phase, stage, or plan identifiers into code, comments, tests, configuration, or lint messages.
- Directories and TypeScript files under `src/` use camelCase. Exported functions are camelCase. Exported types are PascalCase.
- Allowed role suffixes are `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, and `Types`. Do not use `Utils` or `Impl`.
- Do not rename frozen string values. The outside-battle toast stays `That hex is outside the active tactical battle.`
- New and updated fields and non-overriding functions need an orienting comment saying why the symbol exists, when to use it, what to expect back, and what it throws.
- Test happy paths and essential failure cases only.
- Renderer and shared UI helpers do not take main-process debug or trace logging. Do not add a new IPC channel.
- Prefer a parameter object once a function would need more than six named arguments.
- Desirable source-file size is 600 lines, hard limit 1000. Do not grow `mainMapInteractions.ts` with a new helper body. Put new decisions in `src/shared`.

## Locked Behavior

`S.resolutionMoveAnimation !== null` means playback is running. While it is running, ignore these gestures: unit clicks, Shift-clicks, stack-callout scheduling, Ranged and Strike target clicks, double-click march and ferry, build marker clicks, and build queue edits. Do not toast for the ignore. Leave the selection, the selected hex, queued orders, and both targeting modes as they were.

These keep working during playback: drag pan, wheel zoom, hex tooltips, right-click clear, tactical entry markers, and the right panel, including Ready. Tactical entry is handled inside the click listener by `tryHandleTacticalEntryAtClientXY`. A playback return placed before that call would block battle entry. During playback, call that handler first. If it returns true, stop. The entry path cancels playback. If it returns false, return without writing the selection, the selected hex, a target, a build edit, or a stack callout. Do not move that call on the non-playback path. Targeting, build markers, and unit selection stay in their current order when playback is not running.

A strategic click that hits no hex may still clear the selection. Do not change that branch. Do not change `getUnitAtHex`.

A click during a battle whose tactical hit test returns null is outside the battle. Show the toast above, and do not change the selection or `selectedHexIndex`.

On a failed Ranged or Strike validation, show the existing error toast, queue nothing, and leave targeting and the selection on.

A left click that resolves to a hex never calls `clearSelection`. Missing the icon on the selected unit's hex, and clicking any other hex, both keep the selection.

## Phase 1: Shared Playback and Footprint Decisions

**Files:**
- Create: `src/shared/mapOrderGestureGate.ts`
- Create: `src/shared/mapOrderGestureGate.test.ts`
- Modify: `src/renderer/tactical/tacticalUiGuards.ts`

- [ ] **Step 1: Add the shared decisions and a failing test**

`mapOrderGestureGate.ts` exports:

```ts
export function resolutionPlaybackBlocksMapOrders(animation: unknown): boolean {
  return animation != null;
}

export function tacticalHitIsInsideBattle(hasBattle: boolean, hit: string | null, footprintSaysInside: boolean): boolean {
  if (!hasBattle) return true;
  if (hit == null) return false;
  return footprintSaysInside;
}
```

The test asserts: a non-null animation blocks; null does not; no battle accepts a null hit; a battle rejects a null hit; a battle accepts a hit the footprint marks inside and rejects one it marks outside.

`tacticalRendererHitInsideBattleFootprint` must call `tacticalHitIsInsideBattle`. Compute the existing footprint match only when `hit` is a string, and pass that boolean as `footprintSaysInside`. Do not keep a second copy of the null-hit rule in the guard. Today the guard returns true when `hit` is null. After the call, a null hit during a battle returns false, and a null battle still returns true. Update the guard's orienting comment.

- [ ] **Step 2: Verify**

```text
npm run build:main
node --test dist/shared/mapOrderGestureGate.test.js
```

Expected: PASS.

## Phase 2: Click and Double-Click Wiring

**Files:**
- Modify: `src/renderer/map/mainMapInteractions.ts`
- Modify: `src/renderer/gameplay/buildQueuePopup.ts`

- [ ] **Step 1: Gate playback before any click write**

Do not assign `S.selectedHexIndex` before the playback decision. In the `#main-map` `click` listener, when `resolutionPlaybackBlocksMapOrders(S.resolutionMoveAnimation)` is true, call `tryHandleTacticalEntryAtClientXY` first. If it returns true, keep today's follow-up sidebar and redraw calls and return. If it returns false, return immediately. Do not run targeting, build markers, stack callouts, or selection changes. At the start of `handleMainMapDoubleClick`, if playback blocks, return before it plans or clears. Double-click is not a tactical entry.

Do not add this return to the right-click listener, the pan handlers, or the tooltip dwell.

- [ ] **Step 2: Outside-battle click**

After the playback return, compute `hit`, then if `S.tacticalBattleSnapshot` is set and `tacticalRendererHitInsideBattleFootprint(hit, S.tacticalBattleSnapshot)` is false:

- call `deps.showMapToast('That hex is outside the active tactical battle.', { isError: true })`
- return
- do not assign `S.selectedHexIndex`
- do not call `clearSelection`

Assign `S.selectedHexIndex = hit` only after that guard passes.

- [ ] **Step 3: Rejected target keeps targeting**

In the air-strike failure branch and the ranged failure branch, delete the assignments that set `S.airStrikeModeActive` or `S.rangedModeActive` to false. Delete the assignments that set `S.hoverRoutePreview = null` and that increment `S.hoverPreviewRequestSeq` on that failure path only. Keep the error toast, `updateRangedSidebar`, `redraw`, and `return`. The success path still turns targeting off and clears the selection.

- [ ] **Step 4: Left click on a hex does not clear**

In the click listener's final `if (hit)` / `else` split, the `else` (`hit` is null) may still call `deps.clearSelection()`. Inside `if (hit)`, remove the `deps.clearSelection()` call and the `S.hoverRoutePreview = null` that sits in that same else-of-else. Leave the branches that select a human icon, that skip a missed icon on a human unit, and that only cancel the deferred single-select timer.

- [ ] **Step 5: Build edits during playback**

At the start of `runBuildQueueMutation`, if `resolutionPlaybackBlocksMapOrders` is true for `S.resolutionMoveAnimation`, return `false` and do not toast. That function stays `Promise<boolean>`. At the start of `applyCurrentTemplateToHexes`, if playback blocks, return without a toast and without a server write. If that function still returns `Promise<boolean>`, return `false`. If it already returns `{ ok: true } | { ok: false; anyHexWritten: boolean }`, return `{ ok: false, anyHexWritten: false }`. Marker clicks are already covered by the click return in Step 1.

- [ ] **Step 6: Docs**

Remove the playback-orders entry from `doc/ux/resolution-playback.md` Known Deviations. Remove the failed-target entry from `doc/ux/right-panel-command-bar.md` Known Deviations. `doc/ux/map-surface.md` and `doc/ux/modes-and-transitions.md` have no Known Deviations entry for the outside-battle toast. Do not add one. Rebuild the Known Deviations index in `doc/ux-specification.md` by reading the documents. Do not subtract from a remembered total. Remove the sentences in `doc/ux/order-lifecycle.md` and `doc/ux/modes-and-transitions.md` that say the current code turns targeting off on failure, leaving the requirement text.

- [ ] **Step 7: Verify**

```text
npm run check:renderer-types
npm run build:renderer
```

Expected: both exit 0.

Manual check, if a match is running: start a turn that animates, and during the animation click a unit, Shift-click, double-click a destination, and click a build marker. The selection and the queues do not change. Right-click still clears. After playback, a bad strike hex toasts and Strike stays armed. In a battle, a click outside the footprint toasts and does not clear a selected unit. On the strategic map, a click on another hex does not clear the selection, and a click that hits no hex still does.
