# Build Queue Seed and Failed Edit Implementation Plan

> **For agentic workers:** Implement this plan phase by phase, in order. Do not start a phase until the previous phase's verification commands pass. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first extra build hex is seeded from the hex that was already open. A failed type or count edit puts the previous queue back on screen.

**Architecture:** Seeding stays in `createBuildQueuePopupHandler` in `src/renderer/gameplay/buildQueuePopup.ts`. The single-hex failure path re-renders from the server snapshot, which was not changed. The multi-hex path copies `S.buildQueueTemplate` before the edit. If the apply wrote nothing, it restores that copy. If the apply wrote some hexes and still failed, it reloads the template from the first selected hex. Silent eligibility skips still return `{ ok: true }` and do not restore.

**Tech Stack:** TypeScript, Electron renderer.

## Global Constraints

- Do not commit or push.
- Do not put phase, stage, or plan identifiers into code, comments, tests, configuration, or lint messages.
- Do not change the toast sentence `Failed to load the build queue template.`
- New and updated functions need an orienting comment saying why the symbol exists, when to use it, what to expect back, and what it throws.
- Test happy paths and essential failure cases only. These paths need `window.gameApi` and the DOM. Verify with `npm run check:renderer-types` and `npm run build:renderer`. Do not add a Node test that mocks the whole popup.
- Do not add a second playback check. If `applyCurrentTemplateToHexes` already returns early while `S.resolutionMoveAnimation` is set, keep that early return and change a boolean `false` into `{ ok: false, anyHexWritten: false }` when you change the result type. Do not leave a boolean return in that function.

## Locked Behavior

When the build selection grows from one hex to two, `getHexBuildQueue` is called with the hex that was already in `S.selectedBuildHexH3s`, not with the hex just clicked. On success, that snapshot becomes `S.buildQueueTemplate` and is applied to the whole selection, including the new hex. On failure, the new hex is removed, the existing error toast is shown, and the popup stays on the original hex.

A later hex, past the second, still receives the current template. That path does not re-seed.

When a single-hex type or count update returns failure from `runBuildQueueMutation`, call `renderBuildQueueIntoMount` for that hex so the select and the count field show the queue still stored on the server. A success path already re-renders. Do not leave the rejected DOM value in place.

When a multi-hex add-row, type change, count change, or row remove edits `S.buildQueueTemplate`, copy it first with `map` so each row is a new object. A later edit must not mutate the saved copy. The next paragraph says which template to render after apply. A successful apply keeps the new template.

`applyCurrentTemplateToHexes` refreshes game state when `result.applied.length > 0` and then returns false on a hard failure. Restoring the pre-edit template in that case shows a queue the server no longer has. Change its result to `{ ok: true } | { ok: false; anyHexWritten: boolean }`. `anyHexWritten` is `result.applied.length > 0`. On `{ ok: false, anyHexWritten: false }`, restore the copy. On `{ ok: false, anyHexWritten: true }`, load `getHexBuildQueue` for the first selected hex and use that snapshot as the template. If that load returns no snapshot, restore the pre-edit copy instead. The server may then differ from the popup until the next successful refresh. Do not leave the rejected template in place. Update the `applyTemplate` type in `buildQueueMultiPopup.ts` to that result. A playback guard that returns before any write uses `{ ok: false, anyHexWritten: false }` and does not toast.

## Phase 1: Seed Hex

**Files:**
- Modify: `src/renderer/gameplay/buildQueuePopup.ts`

- [x] **Step 1: Load the open hex**

In the `priorCount === 1` branch, the code currently calls `getHexBuildQueue({ h3Index })` where `h3Index` is the newly clicked hex. Before appending, read `const seedHex = S.selectedBuildHexH3s[0]`. After the append, call `getHexBuildQueue({ h3Index: seedHex })`. Keep the failure path that removes the new hex and toasts. Keep `applyCurrentTemplateToHexes([...S.selectedBuildHexH3s])` after a successful seed.

- [x] **Step 2: Verify**

```text
npm run check:renderer-types
```

Expected: exit 0.

## Phase 2: Restore a Rejected Edit

**Files:**
- Modify: `src/renderer/gameplay/buildQueuePopup.ts`
- Modify: `src/renderer/gameplay/buildQueueMultiPopup.ts`
- Modify: `doc/ux/build-popup.md`
- Modify: `doc/ux/multi-hex-build-popup.md`

Neither document has a Known Deviations entry for this. Do not add one. The requirement text already matches this behavior. No count change in `doc/ux-specification.md`.

- [x] **Step 1: Single hex**

In the type `change` listener and the count `input` listener inside `renderBuildQueueIntoMount`, the closed-over `entry` still has the unit type and count from the last successful render. On failure, set the type control and the count control back to `entry.unitType` and `entry.count` before any refetch. `renderBuildQueueIntoMount` returns without changing the mount when `getHexBuildQueue` yields no snapshot, so a refetch alone can leave the rejected values on screen. After that reset, call `await renderBuildQueueIntoMount(mount, h3Index)` once. If a snapshot arrives, the server queue replaces the mount. If it does not, the controls are already on the previous values. Do not re-enter the failure path from the render itself.

- [x] **Step 2: Multi hex**

In the add-row `click`, type `change`, count `input`, and remove `click` listeners in `buildQueueMultiPopup.ts`, copy `S.buildQueueTemplate` before replacing it, using a new object per row. The add-row listener is the one that appends `createBuildQueueTemplateRow`. Change `applyTemplate` so a false result says whether any hex was written. If nothing was written, assign the copy back, then render. If some hexes were written, replace the template from `getHexBuildQueue` of the first selected hex, then render. If that load returns no snapshot, restore the pre-edit copy, then render. If it succeeds, render the updated template. A playback guard that returns before any write counts as nothing written, so the copy comes back and no toast is added.

- [x] **Step 3: Verify**

```text
npm run check:renderer-types
npm run build:renderer
```

Expected: both exit 0.

Manual check: open one build hex, Shift-click a second, and confirm the rows match the first hex, not the second. Force a rejected count if a test hook exists; otherwise confirm the failure branch calls the re-render by reading the listener. A legal edit still updates the row.
