# Map Toast, Playback Skip, and Tooltip Implementation Plan

> **For agentic workers:** Implement this plan phase by phase, in order. Do not start a phase until the previous phase's verification commands pass. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The basemap failure toast hides on the same timer as other map toasts. Resolution playback skips the movement stage when the resolution has no moves. The hex tooltip documents match the combat rules: a world hex has no terrain-effects line, and a battle hex has no control line.

**Architecture:** `showBasemapErrorToast` in `src/renderer/map/worldLeafletMap.ts` writes `#map-toast` directly. It should call `showMapToast`, which already starts `S.toastHideTimer`. The movement slot is a duration inside `getResolutionPlaybackPhase`. That function moves to `src/shared` so a Node test can see a zero-length movement stage without dividing by zero. The tooltip items are documentation. `doc/combat-rules-v3.md` says strategic movement is a flat hex budget and terrain does not modify it, and strategic range is by unit type. `computeTerrainEffectsLineHtml` is the res4 tactical matrix. Calling it for a world hex would show tactical effects on the strategic map.

**Tech Stack:** TypeScript, Electron renderer, Node `node:test` from `dist/shared` after `npm run build:main`.

## Global Constraints

- Do not commit or push.
- Do not put phase, stage, or plan identifiers into code, comments, tests, configuration, or lint messages.
- The basemap sentence stays `Some map tiles failed to load (network or provider). The game remains playable; try again later.`
- `RESOLUTION_FADE_MS` stays 1000 and `LIGHTNING_DURATION_MS` stays 1000. Pass them into the shared phase function. Do not duplicate the numbers in the test except as the expected duration.
- New and updated fields and non-overriding functions need an orienting comment saying why the symbol exists, when to use it, what to expect back, and what it throws.
- Test happy paths and essential failure cases only: movement present, and movement absent while some other stage is present.
- Do not add an Effects line or a Control line in `terrainTooltipRes1State.ts`.
- `getResolutionPlaybackPhase` already has nine positional parameters. Do not add a tenth. Take one args object.
- Prefer a parameter object once a function would need more than six named arguments.

## Locked Behavior

Basemap failure calls `showMapToast` once per app session (`basemapErrorShown` stays). `isError: false` so the toast uses the info style and `TOAST_DURATION_MS`. A later map toast still replaces it and restarts the timer, because `showMapToast` already does that.

Playback stages keep their order: air outbound, air combat, air casualties, air return, ranged combat, ranged casualties, movement, melee combat, melee casualties. A stage whose flag is false has duration 0, including movement. Movement duration is `fadeMs` only when `hasMoves` is true. `hasMoves` is `(anim.moves?.length ?? 0) > 0`. Add optional `moves?: unknown[]` to `ResolutionAnimationInput`. When movement duration is 0, movement progress is 0 before `movementStart` and 1 at and after it, and `inMovement` is false. Do not divide by zero.

Playback still does not start when there is nothing to animate. That guard is outside this function. Do not change it.

Tooltip documents:

- In `doc/ux/hex-tooltips.md`, change both the Information Displayed bullet and the strategic Effects cell. A world hex has no effects line, because strategic terrain does not change movement or range. The tactical Effects cell stays "Tactical terrain effects". The res4 branch in `formatTerrainTooltipHtml` stays.
- The Control bullet applies to a world hex. The tactical column says a battle hex does not show a control line. The resolution-1 check in `formatTerrainTooltipHtml` stays.
- Do not add a Known Deviations entry for either. This is the recommended reading of the combat rules over adding a line the mechanics do not define.

## Phase 1: Basemap Toast Timer

**Files:**
- Modify: `src/renderer/map/worldLeafletMap.ts`
- Modify: `doc/ux/notifications-and-feedback.md`
- Modify: `doc/ux-specification.md`

- [x] **Step 1: Use the shared toast**

Replace the body of `showBasemapErrorToast` that writes `#map-toast` and `#map-toast-text`. Keep the `basemapErrorShown` guard. Call `showMapToast` from `src/renderer/openRouter/openRouterUiHelpers.ts` with the frozen sentence and `{ isError: false }`. `worldLeafletMap.ts` does not import that module today, and that module does not import `worldLeafletMap.ts`, so the import is safe.

- [x] **Step 2: Docs**

Remove the basemap-toast Known Deviations entry from `doc/ux/notifications-and-feedback.md`. Rebuild the Known Deviations index in `doc/ux-specification.md` by reading the documents. Do not subtract from a remembered total.

- [x] **Step 3: Verify**

```text
npm run check:renderer-types
npm run build:renderer
```

Expected: both exit 0.

## Phase 2: Skip an Empty Movement Stage

**Files:**
- Create: `src/shared/resolutionPlaybackPhase.ts`
- Create: `src/shared/resolutionPlaybackPhase.test.ts`
- Modify: `src/renderer/rendering/resolutionPlayback.ts`

- [x] **Step 1: Move the phase function and add a failing test**

Move `getResolutionPlaybackPhase` and `ResolutionPlaybackPhase` into `src/shared/resolutionPlaybackPhase.ts`. The function takes:

```ts
export function getResolutionPlaybackPhase(args: {
  elapsed: number;
  fadeMs: number;
  lightningMs: number;
  hasAirStrikeOutbound: boolean;
  hasAirStrikeCombat: boolean;
  hasAirStrikeCasualties: boolean;
  hasAirStrikeReturn: boolean;
  hasRangedCombat: boolean;
  hasRangedCasualties: boolean;
  hasMoves: boolean;
  hasMeleeCombat: boolean;
  hasMeleeCasualties: boolean;
}): ResolutionPlaybackPhase
```

`buildResolutionPlaybackState` imports it and passes `fadeMs: RESOLUTION_FADE_MS`, `lightningMs: LIGHTNING_DURATION_MS`, and `hasMoves: (anim.moves?.length ?? 0) > 0`. Movement duration is `hasMoves ? args.fadeMs : 0`. Fix `moveProgress` so a zero duration does not divide by zero. `src/renderer/renderer.ts` imports `ResolutionPlaybackPhase` from `./rendering/resolutionPlayback`. Re-export the moved type from that module so the import stays. Do not change the renderer file for this move.

The test uses `fadeMs` 1000 and `lightningMs` 1000. The returned phase has `movementStart` and `meleeCombatStart`. It does not have `movementEnd`. With only `hasRangedCombat` true, `meleeCombatStart === movementStart`. With only `hasMoves` true, `meleeCombatStart === movementStart + 1000`. Do not add `movementEnd` to the returned type.

- [x] **Step 2: Verify**

```text
npm run build:main
node --test dist/shared/resolutionPlaybackPhase.test.js
npm run check:renderer-types
npm run build:renderer
```

Expected: PASS, then both builds exit 0.

## Phase 3: Tooltip Wording

**Files:**
- Modify: `doc/ux/hex-tooltips.md`

- [x] **Step 1: Update the requirement text**

Apply the two tooltip sentences in Locked Behavior. Do not edit `src/renderer/map/terrainTooltipRes1State.ts`.

- [x] **Step 2: Verify**

No command. Read the strategic and tactical rows in `doc/ux/hex-tooltips.md` and confirm the Effects and Control cells match Locked Behavior.
