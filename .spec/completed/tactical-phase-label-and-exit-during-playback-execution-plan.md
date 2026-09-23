# Tactical Phase Label and Exit During Playback Implementation Plan

> **For agentic workers:** Implement this plan phase by phase, in order. Do not start a phase until the previous phase's verification commands pass. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While a battle is active, the phase line reads "Phase: Tactical planning" or "Phase: Tactical resolution", and Exit Battle is disabled from the tactical Ready commit until that beat's playback ends.

**Architecture:** A pure label function in `src/shared` chooses the phase sentence. The sidebar and the exit button read `S.tacticalBattleSnapshot` and `S.resolutionMoveAnimation`. They do not write `S.tacticalPhasePlanning`. That flag stays the gate for tactical Ready, opponent planning, and the exit and advance assertions.

**Tech Stack:** TypeScript, Electron renderer, Node `node:test` from `dist/shared` after `npm run build:main`.

## Global Constraints

- Do not commit or push.
- Do not put phase, stage, or plan identifiers into code, comments, tests, configuration, or lint messages.
- Directories and TypeScript files under `src/` use camelCase. Exported functions are camelCase. Exported types are PascalCase.
- Allowed role suffixes are `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, and `Types`. Do not use `Utils` or `Impl`.
- The player-facing sentences are frozen: `Phase: Tactical planning` and `Phase: Tactical resolution`.
- New and updated fields and non-overriding functions need an orienting comment saying why the symbol exists, when to use it, what to expect back, and what it throws.
- Test happy paths and essential failure cases only.
- Do not add a new IPC channel. Do not set `S.tacticalPhasePlanning` to false to disable Exit Battle or to change the label.
- Prefer a parameter object once a function would need more than six named arguments.

## Locked Behavior

When `S.tacticalBattleSnapshot` is null, the phase line stays `Phase: ` plus the strategic label from `formatStrategicPhaseLabelForSidebar`, or `—` when there is no game state.

When a battle snapshot is set and `S.resolutionMoveAnimation` is null, the phase line is `Phase: Tactical planning`.

When a battle snapshot is set and `S.resolutionMoveAnimation` is non-null, the phase line is `Phase: Tactical resolution`.

Exit Battle is disabled when there is no battle, when `S.tacticalPhasePlanning` is false, when the annihilation dialog is open (already implemented), or when a battle snapshot is set and `S.resolutionMoveAnimation` is non-null. It is enabled again when that animation is cleared and the battle is still in planning.

`readyHandler.ts`, `openRouterRuntime.ts`, and `tacticalStateAssertions.ts` keep reading `tacticalPhasePlanning` with their current meaning.

## Phase 1: Label Function

**Files:**
- Create: `src/shared/sidebarPhaseLabel.ts`
- Create: `src/shared/sidebarPhaseLabel.test.ts`

- [x] **Step 1: Add the function and tests**

```ts
export function formatSidebarPhaseText(args: {
  hasGameState: boolean;
  strategicPhaseLabel: string;
  battleActive: boolean;
  beatPlaybackActive: boolean;
}): string
```

Returns `—` when `hasGameState` is false. Returns `Phase: Tactical resolution` when `battleActive` and `beatPlaybackActive`. Returns `Phase: Tactical planning` when `battleActive` and not `beatPlaybackActive`. Otherwise returns `Phase: ` plus `strategicPhaseLabel`.

Tests cover those four results. Do not test the strategic capitalization helper.

- [x] **Step 2: Verify**

```text
npm run build:main
node --test dist/shared/sidebarPhaseLabel.test.js
```

Expected: PASS.

## Phase 2: Sidebar and Exit Button

**Files:**
- Modify: `src/renderer/core/uiState.ts`
- Modify: `src/renderer/tactical/tacticalExitButtonDom.ts`
- Modify: `src/renderer/tactical/tacticalUiOrchestration.ts` (the comment on `tacticalUpdateExitButtonVisibility` only)
- Modify: `src/renderer/renderer.ts` (`tickResolutionMoveAnimation` only)
- Modify: `doc/ux/right-panel-command-bar.md`
- Modify: `doc/ux/tactical-battle-controls.md`
- Modify: `doc/ux/modes-and-transitions.md`
- Modify: `doc/ux-specification.md`

- [x] **Step 1: Phase line**

In `updateGameStateSidebar`, replace the phase assignment with `formatSidebarPhaseText`. `battleActive` is `S.tacticalBattleSnapshot != null`. `beatPlaybackActive` is `S.resolutionMoveAnimation != null`. `strategicPhaseLabel` is the existing `formatStrategicPhaseLabelForSidebar(state.phase)` when `state` is non-null, otherwise `''`. `hasGameState` is `state != null`. The turn line is unchanged.

- [x] **Step 2: Exit Battle**

The function is `syncTacticalExitButtonElementVisibility`. Add `S.tacticalBattleSnapshot != null && S.resolutionMoveAnimation != null` to the disabled condition, alongside the existing `!active || !S.tacticalPhasePlanning` check. Do not assign `S.tacticalPhasePlanning` anywhere in this change. Update the comments on `syncTacticalExitButtonElementVisibility` and `tacticalUpdateExitButtonVisibility`. They currently say the button reads only the snapshot and `tacticalPhasePlanning`. Mention playback as well. Every `redraw()` already calls `tacticalUpdateExitButtonVisibility`, including the redraw at the end of playback, so the button does not need a second call.

`updateGameStateSidebar` runs when tactical Ready starts playback, which is enough for the resolution sentence. `tickResolutionMoveAnimation` in `src/renderer/renderer.ts` clears `S.resolutionMoveAnimation` and redraws, and it does not refresh the phase line. After that assignment to null, and before the final `redraw()`, call `updateGameStateSidebar(S.gameState)` so the line returns to `Phase: Tactical planning`. Clearing the animation first matters. A sidebar update while the animation is still set would leave the resolution sentence on screen.

- [x] **Step 3: Docs**

Remove the phase-line Known Deviations entry from `doc/ux/right-panel-command-bar.md`. Remove the Exit Battle Known Deviations entry from `doc/ux/tactical-battle-controls.md`. In `doc/ux/modes-and-transitions.md`, delete the sentence that says the current code differs on those two points. Rebuild the Known Deviations index in `doc/ux-specification.md` by reading the documents. Do not subtract from a remembered total.

- [x] **Step 4: Verify**

```text
npm run check:renderer-types
npm run build:renderer
```

Expected: both exit 0.

Manual check: enter a battle and confirm the phase line says `Phase: Tactical planning` and Exit Battle is enabled. Press Ready on a beat that animates and confirm the line says `Phase: Tactical resolution` and Exit Battle is disabled until the animation ends, then enabled again. Ready and opponent planning still run.
