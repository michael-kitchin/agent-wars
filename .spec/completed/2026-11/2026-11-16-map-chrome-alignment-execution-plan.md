# Map Chrome Alignment Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** Two small layout changes on the main map. The scale moves to the horizontal center of the map and keeps its vertical position. The chat (message-creating) panel's bottom edge lines up with the selection panel's bottom edge.

**Shape:** Phase 0 records a baseline. Phase 1 changes the placement rule and its test. Phase 2 changes the stylesheet and the layout code. Phase 3 changes the UI smoke checks. Phase 4 updates the docs and runs the final verification.

**Tech:** TypeScript, CSS, `node:test`, `scripts/ui-smoke/`.

**Order:** Run this plan after the replay playback plan. It does not depend on it, but both change files under `src/renderer/` and `static/`, and the full test run rebuilds shared native modules, so the runs must not overlap.

---

## How to Use This Plan

- Run the phases in order. Stop only when a verification fails and the phase's fix steps do not resolve it. Then revert that phase (see Backup and Revert), record the failure in the Defect Inventory, and stop.
- Never commit, push, stash, merge, rebase, or run `git checkout`, `git restore`, `git reset`, or `git clean`. Read-only git commands are fine. The user reviews every change. (A run that the user has told to commit and push does so once, at the end.)
- Find code by the quoted text, not by line number. The code sketches here are sketches: the file wins, and any difference goes in the Completion Log.
- Tests come first. Write the test change, watch it fail, then make the change.
- Make no paid model calls.

### Backup and Revert

Before each phase, copy the phase's **Edit** files to `$env:TEMP\aw-map-chrome-alignment\step-N` with the same relative paths, from the repo root. To revert, copy them back.

---

## Verification Bar

- `npm test`, `npm run build:renderer`, `npm run check:circular` (it must print only the cycles already in the tree, three when this plan was written), and `npm run ui:smoke` at the end of the plan. Between phases, run targeted tests only: `npm run build:main`, then `node dist/shared/mapChromePlacement.test.js`.
- If `ui:smoke` cannot finish for a reason that predates this plan (the beat-limit scene expects the header `Beat 1 · Tactical planning` and the app shows `Beat 1 (29 left) · Tactical planning`), say so in the Completion Log and judge by the scenes that ran.
- Never refresh a baseline file to make a gate pass.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`. Read every rule file once.

- **Orienting comments.** Every new or changed function, constant, and type gets a JSDoc block: a one-line summary, then `Purpose:`, `When to use:`, `Expected outcome:`, and `Exceptions:`. Replace filler text on a declaration you change with specific text.
- **No logging in `src/shared` or `src/renderer`.**
- **Naming** follows `doc/naming-conventions-contract-v1.md`.
- **Docs.** `AGENTS.md` requires `doc/` to change in the same change. Keep plan vocabulary (phase numbers, this file's name) out of `src/`, `static/`, `scripts/`, and `doc/`. Markdown has one title and heading levels in order.
- **Final message.** It names every document you updated.

## Non-Goals

- No change to the scale's content, units, or width (`maxWidth: 120` in `worldLeafletMap.ts`).
- No change to the selection panel's size or position. Its bottom stays 12 px in from the map.
- No change to the chat panel's width, right edge, or history height rule.
- No change to the minimap, the terrain legend, the message band, or the top bar.
- No new overlap handling. On a map too narrow for the selection panel, the scale, and the chat panel side by side, the panels cover the scale, as the higher layers already do. Record in the Completion Log the narrowest map width at which the three sit clear of each other, from the arithmetic in Phase 4.

## Locked Decisions

The user made these.

1. The scale sits at the horizontal center of the map's main area, with the same bottom inset it has today (12 px, `MAP_CHROME_INSET`).
2. The chat panel's bottom edge equals the selection panel's bottom edge. Both are `MAP_CHROME_INSET` in from the map's bottom edge. The chat panel no longer rises to clear the scale, because the scale is no longer under it.

### Decisions this plan makes

Tell the user about these in the final message.

- **Leaflet has no bottom-center corner.** The scale stays in Leaflet's `bottomright` corner. The stylesheet centers that corner's container (`left: 50%`, `right: auto`, a horizontal translate), so the control code is unchanged apart from its comment.
- **The chat panel's rule loses its scale input.** `chatPanelPlacement` stops taking `scaleHeight`, and `placeChatPanel` stops measuring the scale. This removes dead code that could not be right any more.

---

## Phase 0 — Baseline

**Add:** nothing. **Edit:** nothing.

1. Run `git status --short` and record it.
2. Confirm these exist, or stop and tell the user: `chatPanelPlacement` and `MAP_CHROME_INSET` in `src/shared/mapChromePlacement.ts`; `placeChatPanel` in `src/renderer/map/mapChromeLayout.ts`; the rule `#main-map .leaflet-bottom.leaflet-right` in `static/shellChrome.css`; `.chat-panel` and `.selection-panel` with `bottom: 12px` in `static/chatChrome.css` and `static/selectionChrome.css`; the check `scale-and-attribution-bottom-right` and the check `chat-panel-bottom-right` (which asserts the chat panel is above the scale) in `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`. Also confirm that `#main-map` and `#selection-panel` and `#chat-panel` all lie inside `#canvas-container`, and that `#main-map` fills it (`inset: 0` in `static/shellChrome.css`), so the scale's center is the map's center and all three share one bottom edge.
3. Search the whole repo (not `node_modules`, not `static/renderer.js`) for `scaleHeight`, `leaflet-control-scale`, `leaflet-bottom`, and `above the scale`. Record every file. Also search `doc/` for `scale` next to `bottom`, `chat`, or `above`. Expected hits when this plan was written: `mapChromePlacement.ts` and its test, `mapChromeLayout.ts`, `worldLeafletMap.ts` (a comment), `shellChrome.css`, the smoke check file, `doc/ux/map-surface.md`, `doc/ux/chat-panel.md`.
4. Run the targeted test `node dist/shared/mapChromePlacement.test.js` after `npm run build:main` and record that it passes.

---

## Phase 1 — The Chat Panel's Bottom

**Add:** nothing.
**Edit:** `src/shared/mapChromePlacement.ts`, `src/shared/mapChromePlacement.test.ts`, `src/renderer/map/mapChromeLayout.ts`

### Steps

1. Update the test first. In `mapChromePlacement.test.ts`, the test `chatPanelPlacement uses the band width and sits above the scale` becomes `chatPanelPlacement uses the band width and sits at the map inset`. Remove `scaleHeight` from every call. Assert that `bottom` equals `MAP_CHROME_INSET` for two different map sizes, that `width` equals `bandWidth`, that `right` equals `MAP_CHROME_INSET`, and that `maxHistoryHeight` is `Math.floor(mapHeight / 2)`. Run it and watch it fail on the type error or the old value.
2. `chatPanelPlacement` in `mapChromePlacement.ts`: remove `scaleHeight` from the input type and the body, and return `bottom: MAP_CHROME_INSET`. Rewrite its comment and the file's top comment (it says the chat panel is "at the bottom-right" and sits above the scale): the panel's bottom edge is the same inset as the selection panel's. If `MAP_CHROME_GAP` is now used only by the legend, leave it.
3. `mapChromeLayout.ts`, `placeChatPanel`: delete the scale query and `scaleHeight`, drop `scaleHeight` from the call, and fix its comment (it says the panel "sits above the scale" and "a missing scale counts as height 0"). Keep the `width`, `right`, `bottom`, and `max-height` assignments.
4. Search `layoutMapChrome` and the code that calls it for any trigger that existed only to re-measure the scale (for example a listener on the scale's size). Remove it if so, and say in the Completion Log what you removed. Remove nothing else.

### Verification

`npm run build:main`, then `node dist/shared/mapChromePlacement.test.js`. Then `npm run check:renderer-types`.

---

## Phase 2 — The Scale at the Center

**Add:** nothing.
**Edit:** `static/shellChrome.css`, `src/renderer/map/worldLeafletMap.ts`, `static/chatChrome.css` (comment only)

### Steps

1. `shellChrome.css`: replace the rule for `#main-map .leaflet-bottom.leaflet-right` and its comment ("Leaflet's bottom-right corner keeps the map's 12px inset. The scale is the only control there."). The new rule centers the corner container:

   ```css
   /* Leaflet has no bottom-center corner. The scale sits in the bottom-right corner, and this centers that corner's container. It keeps the map's 12px bottom inset. The scale is the only control there. */
   #main-map .leaflet-bottom.leaflet-right {
     bottom: 12px;
     right: auto;
     left: 50%;
     transform: translateX(-50%);
     display: flex;
     justify-content: center;
     align-items: flex-end;
   }
   ```

   Keep the existing `#main-map .leaflet-right .leaflet-control` rule (margin 0, no float), since it still removes Leaflet's default control margin. Drop only the declarations that no longer apply (`flex-direction: row-reverse`, `gap`) if nothing else is in that corner. Check the corner for other controls first.
2. `worldLeafletMap.ts`: the comment `Show real-world distance on the scale, below the chat panel.` becomes `Show real-world distance on the scale. Leaflet places it in the bottom-right corner, and shellChrome.css centers that corner.` The options do not change.
3. `chatChrome.css`: the top comment says `The chat panel at the map's bottom-right`. Keep that, and add that its bottom edge matches the selection panel's. No rule changes: `.chat-panel` already has `bottom: 12px`, and `layoutMapChrome` now also sets 12.
4. Leaflet resizes the scale as the zoom changes. The translate keeps it centered whatever its width, so no script re-centers it. Do not add one.
5. Search `static/*.css` and `src/renderer` for another rule that positions `.leaflet-control-scale` or reserves room for it (for example a `margin-bottom` on the chat panel or the toast band). Remove only what existed to keep clear of the scale, and record it.

### Verification

`npm run build:renderer`. Run `npm run ui:smoke` only in Phase 3, after the checks match the new layout.

---

## Phase 3 — UI Smoke Checks

**Add:** nothing.
**Edit:** `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`

### Steps

1. Read the helper functions the file already uses (`el`, `near`, `fmt`, the `PANEL.inset` constant, and how the map's box `c` is read) and how `needs` and `shown` work in `scripts/ui-smoke/ui-smoke-checks.cjs`: every selector a row reads must be in its `needs`, and `el(selector).shown` says whether it is visible. Use them. Add no new helper unless two checks need it.
2. Rename the check `scale-and-attribution-bottom-right` to `scale-bottom-center`. It keeps its `needs` and `scenes`. Replace the right-edge assertion with a center assertion. It fails, with a message that names the boxes, when: the scale is not shown; its bottom is not `PANEL.inset` px in from the map's bottom (keep the existing bottom assertion as it is); or its horizontal center, `scale.x + scale.w / 2`, differs from the map's, `c.x + c.w / 2`, by more than 1 px. The old check made no assertion about an attribution control. Add none.
3. Rename the check `chat-panel-bottom-right` to `chat-panel-bottom-aligned`. Add `'#selection-panel'` to its `needs` and remove `LEAFLET.scale` from them. Keep the right-edge assertion as it is. Replace the `above the scale` assertion with: the chat panel's bottom is `PANEL.inset` px in from the map's bottom; and when `#selection-panel` is shown, its bottom equals the chat panel's bottom within 1 px, with a message naming both boxes. The check still returns null when the chat panel is not shown. The selection panel may be hidden in some scenes, so the shared-edge assertion is conditional.
4. Update the file's header comment if it describes the old scale position, and search `scripts/ui-smoke/` and `doc/` for the old check names and update each mention.

### Verification

`npm run build:renderer`, then `npm run ui:smoke`. Both new checks pass, and no other check that passed before fails.

---

## Phase 4 — Docs and Final Verification

**Add:** nothing.
**Edit:** `doc/ux/map-surface.md`, `doc/ux/chat-panel.md`, `doc/ux/selection-panel.md`, and any other document the search in step 1 finds

### Steps

1. Search `doc/` for statements about where the scale sits and where the chat panel sits relative to it. Update each:
   - `doc/ux/map-surface.md`: the line that says the chat panel sits at the bottom-right, above the scale. The scale is at the horizontal center of the map's bottom edge, 12 px in from it. The chat panel sits at the bottom-right.
   - `doc/ux/chat-panel.md`: the bottom edge is 12 px in from the map's bottom edge, the same as the selection panel's. Name `chatPanelPlacement` and `MAP_CHROME_INSET`. Remove the part about the scale.
   - `doc/ux/selection-panel.md`: add that its bottom edge matches the chat panel's.
2. Compute and record, for the Completion Log, the narrowest map width at which the selection panel (440 px plus its 12 px inset), the scale (measure its width in the running smoke scene, about 120 px at most) and the chat panel (its width from `chatPanelPlacement`, at least `TOAST_BAND_MIN_WIDTH`, plus its 12 px inset) do not overlap. The selection panel is 440 px wide in both its states. Say in the docs that on a narrower map the panels cover the scale.
3. Run `node scripts/check-doc-links.cjs` if it exists, and search the diff for plan vocabulary.
4. Run the full Verification Bar once: `npm test`, `npm run build:renderer`, `npm run check:circular`, `npm run ui:smoke`.
5. Fill in the Completion Log.

### Manual checklist for the user

1. Open the app on the map. The scale sits in the middle of the bottom edge, at the height it had at the corner.
2. Open the chat panel. Its bottom edge lines up with the selection panel's bottom edge when a unit is selected.
3. Resize the window narrow. The panels cover the scale instead of pushing it.

---

## Reliability Checklist

- [ ] Each phase's files were backed up first.
- [ ] `chatPanelPlacement` has no `scaleHeight`, and `placeChatPanel` does not read the scale.
- [ ] The only CSS change to the scale is the one rule in `shellChrome.css`.
- [ ] The smoke checks assert the center, the inset, and the shared bottom edge.
- [ ] Every changed declaration has a specific orienting comment.
- [ ] No baseline file was edited. `check:circular` prints only the cycles already in the tree.
- [ ] No plan vocabulary appears in `src/`, `static/`, `scripts/`, or `doc/`.

## Success Definition

- The scale is horizontally centered at the map's bottom, 12 px up from the edge.
- The chat panel's bottom edge equals the selection panel's bottom edge, with or without the scale showing.
- The full Verification Bar passes, and the two new smoke checks pass.

---

## Phase 0 Inventory

| Item | Value |
|------|-------|
| `git status --short` | Modified: the meta-plan, doc/match-video.md, doc/release-notes/v2.20.0 to v3.0.0, scripts/match_video/__init__.py, static/renderer.js. Untracked: this plan, scripts/compose_match_comparison.py, and the user's scripts/match_video comparison files, tests, and title overlays. All the user's own work. |
| Files that mention the scale or `scaleHeight` | `src/shared/mapChromePlacement.ts` and its test, `src/renderer/map/mapChromeLayout.ts`, `src/renderer/map/worldLeafletMap.ts`, `static/shellChrome.css`, `static/chatChrome.css`, `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, `doc/ux/map-surface.md`, `doc/ux/chat-panel.md`, `doc/ui-style-guide.md`. |
| Baseline targeted test | `node dist/shared/mapChromePlacement.test.js`: 11 pass, 0 fail. |

## Defect Inventory

| Phase | Command | First error | Action taken |
|-------|---------|-------------|--------------|

## Completion Log

| Phase | Result | Sketch differences | Files changed outside the Add/Edit lists | Docs updated | Notes |
|-------|--------|--------------------|-------------------------------------------|--------------|-------|
| 0 | Done | None | None | None | All named symbols, rules, and checks exist. `#main-map`, `#selection-panel`, and `#chat-panel` lie inside `#canvas-container`. |
| 1 | Done | None | None | None | Test failed on the type error first, then passed (11 pass). `chatPanelPlacement` has no `scaleHeight`, `placeChatPanel` no longer reads the scale. No scale-only re-measure trigger existed, so none was removed. `MAP_CHROME_GAP` stays, the legend uses it. `check:renderer-types` ok. |
| 2 | Done | The corner rule also drops `flex-direction` and `gap`, as the plan allowed (the scale is the only control there). | None | None | No other rule positioned or reserved room for the scale. `build:renderer` ok. |
| 3 | Done | The center check uses a 1 px tolerance; the shared-edge check runs only when `#selection-panel` is shown. | None | None | `ui:smoke` ran 798 checks, 0 failed, 0 page errors, then stopped at the known beat-limit scene (it timed out waiting for the Tactical battles dialog). Both `scale-bottom-center` and `chat-panel-bottom-aligned` ran in six scenes each and passed. |
| 4 | Done | The narrowest clear width is 1024 px; see below. | `doc/ui-style-guide.md` (two statements about the scale and chat panel) | `doc/ux/map-surface.md`, `doc/ux/chat-panel.md`, `doc/ux/selection-panel.md`, `doc/ui-style-guide.md` | Narrowest map width where the three sit clear: the selection panel ends at 452 px (12 + 440), and the scale (at most 120 px) must start at or right of that, so the map is at least 2 x (452 + 60) = 1024 px. At that width the chat panel (band at least 280 px, one third of the map, about 341 px) starts at about 671 px and the scale ends at 572 px, so the chat panel binds only below about 704 px at its 280 px minimum. Final bar: `npm test` exit 0, `build:renderer` ok, `check:circular` printed the three existing cycles, `check-doc-links` printed nothing. `ui:smoke` ran once, after the last code change (798 passed, 0 failed, then the known beat-limit stop); only docs changed afterward. |
