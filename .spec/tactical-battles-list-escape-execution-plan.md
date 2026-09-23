# Tactical Battles List Escape Implementation Plan

> **For agentic workers:** Implement this plan phase by phase, in order. Do not start a phase until the previous phase's verification commands pass. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Escape while the tactical battles list is open chooses Ignore and does not close a build popup or stack callout under the dialog.

**Architecture:** The battles list is a `role="dialog"` node with `aria-label="Tactical battles"` appended to `document.body` by `openMeleeInterceptModal`. The window keydown listener in `initCore.ts` is registered first, so it currently closes popups before the dialog's own Escape listener runs. That listener returns immediately when the dialog is open, and the dialog listener still chooses Ignore.

**Tech Stack:** TypeScript, Electron renderer.

## Global Constraints

- Do not commit or push.
- Do not put phase, stage, or plan identifiers into code, comments, tests, configuration, or lint messages.
- Do not rename the dialog's accessible name `Tactical battles`. The early return detects that node. Do not add a second Escape listener.
- New and updated functions need an orienting comment saying why the symbol exists, when to use it, what to expect back, and what it throws.
- Test happy paths and essential failure cases only. A DOM listener registered at app init does not need a new Node test. Verify with `npm run check:renderer-types`.
- Do not change pan, T, or any other key in this plan.

## Locked Behavior

When the key is Escape and `document.querySelector('[role="dialog"][aria-label="Tactical battles"]')` is non-null, the `initCore.ts` window `keydown` listener returns before the build-popup and stack-callout branches. It does not call `preventDefault`, `stopImmediatePropagation`, `hideBuildPopup`, or `hideStackCallout`. The dialog listener was registered later, so it still runs and chooses Ignore. Any other key, including pan and T, keeps today's path.

The dialog's existing `onKey` still calls `finishIgnore` on Escape.

When that dialog is absent, Escape still closes the build popup first, then the stack callout, including a callout that is only scheduled.

## Keyboard Pan and T Under a Modal

This is a documentation change, not a key-handler change.

`doc/ux/map-surface.md` says the map does not accept input while the tactical battles list is open, and that in Tactical annihilation the map does not accept input. `doc/ux-specification.md` defines Disabled as pointer input off. `doc/ux/input-map.md` allows pan and T whenever focus is not in an editable field and no modifier is held.

Recommended resolution, and the one this plan implements: leave the key handler alone. In `doc/ux/map-surface.md` Availability and States, say that those modes turn pointer input off, and that pan keys and T still follow `input-map.md`. Do not add a Known Deviations entry.

## Phase 1: Escape Early Return

**Files:**
- Modify: `src/renderer/map/initCore.ts`
- Modify: `doc/ux/tactical-battles-list.md`
- Modify: `doc/ux/input-map.md`
- Modify: `doc/ux/map-surface.md`
- Modify: `doc/ux-specification.md`

- [ ] **Step 1: Early return**

Inside the existing `e.key === 'Escape'` block, before the build-popup query, if `tacticalBattlesDialogIsOpen()` is true, return. Do not return for other keys. Add an orienting comment on that function explaining that it exists so Escape can reach the dialog's Ignore handler without this listener closing popups first.

- [ ] **Step 2: Docs**

Remove the Escape Known Deviations entry from `doc/ux/tactical-battles-list.md`. In `doc/ux/input-map.md`, delete the sentence that says the current code differs. Apply the map-surface wording in the Keyboard Pan section above. Rebuild the Known Deviations index in `doc/ux-specification.md` by reading the documents. Do not subtract from a remembered total.

- [ ] **Step 3: Verify**

```text
npm run check:renderer-types
npm run build:renderer
```

Expected: both exit 0.

Manual check: open a build popup, press Ready so the tactical battles list appears over it, press Escape. The list closes as Ignore. The build popup is still open. With the list closed, Escape still closes the build popup.
