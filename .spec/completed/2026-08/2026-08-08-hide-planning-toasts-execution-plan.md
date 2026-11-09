# Hide Map Toasts on Planning Initiation — Execution Plan

This document defines a phased, reliability-first implementation for dismissing the upper-right and lower-right map toasts when the player starts common planning interactions.

**Audience:** Coding agent or developer implementing the feature end-to-end.  
**Primary objective:** Maximum reliability, clarity, and independently verifiable increments.  
**Do not** put this document’s internal section or checklist labels into product code, comments, configuration, or other version-controlled artifacts.

---

## 1. Goal, scope, and done criteria

### 1.1 Goal

1. When the player initiates a listed planning operation, immediately hide `#map-toast` (lower-right) and `#ai-strategy-toast` (upper-right).
2. Behavior is **hide only**: do not suppress, mute, queue, or restore toast content. Later `showMapToast` / `showAiStrategyToast` calls still work.
3. One shared helper owns the dual hide so call sites stay consistent.

### 1.2 Explicitly out of scope

1. Stack callout, melee intercept modal, annihilation dialog.
2. A global toast suppress / mute flag or queue.
3. Restoring previously visible toast text after planning ends.
4. Changing toast auto-hide duration or basemap-error special casing beyond using existing `hideMapToast`.
5. README copy updates.

### 1.3 Definition of done

1. Locked behaviors in Section 2 are implemented.
2. All listed call sites use the shared helper; no duplicate ad-hoc hide pairs.
3. Manual verification checklists for each increment pass.
4. New/updated non-override methods have orienting comments.
5. Touched source files stay within project size guidance.
6. No suppress semantics regress Ready / AI strategy toasts after planning.

---

## 2. Locked behavior contract

| Rule | Behavior |
|------|----------|
| Hide vs suppress | Call existing `hideMapToast` and `hideAiStrategyToast` only. Do not block later shows. |
| Unit selection | Hide when `replaceSelection` finishes with a **non-empty** selection whose ID set **differs** from the pre-call set (after reconcile). Includes grow, replace, and shrink-while-non-empty. Clear / empty result does not hide. Same-set no-op does not hide. |
| Build popup | Hide when the build popup successfully opens (after early-return guards). |
| Ranged / air | Hide when mode transitions **off → on**. Cancel / toggle off does not hide. |
| Tactical zoom-in | **One-shot** hide on successful `enterTacticalMapView` path (after validation, before/as camera zoom). No ongoing suppress in battle. |
| Exit / close | Hiding the build popup, clearing selection, exiting tactical, or cancelling targeting does **not** restore dismissed toasts. |

### 2.1 Call sites

| Initiation | Module | Hook |
|------------|--------|------|
| Unit selection | `src/renderer/core/selection.ts` | End of `replaceSelection` when non-empty and set changed |
| Build popup | `src/renderer/gameplay/buildQueuePopup.ts` | `showBuildPopup` success path |
| Ranged / air | `src/renderer/map/initCore.ts` | When setting `rangedModeActive` or `airStrikeModeActive` to `true` |
| Tactical zoom-in | `src/renderer/map/tacticalMapView.ts` | Successful `enterTacticalMapView` path |

### 2.2 Shared helper

`hidePlanningChromeToasts()` in `src/renderer/openRouter/openRouterUiHelpers.ts` delegates to `hideMapToast()` then `hideAiStrategyToast()`.

---

## 3. Implementation increments

### Increment A — Spec + helper

1. This document.
2. Export `hidePlanningChromeToasts` with orienting comment; no product call sites required yet.

**Verify:** Typecheck/build passes. Manual: show both toasts, invoke helper → both elements have `.hidden`.

### Increment B — Unit selection

1. Snapshot prior IDs in `replaceSelection`; after reconcile, if non-empty and sets differ, call helper.
2. Rely on `addUnitsToSelection` / `toggleUnitSelection` / map+sidebar paths that already use `replaceSelection`.

**Verify:** Toast visible → select human unit → both hide. Clear selection does not hide a newly shown toast. Changing selection set while non-empty hides again.

### Increment C — Build popup

1. Call helper in `showBuildPopup` after guards, once the popup is opened.
2. Do not call from `hideBuildPopup` or `refreshBuildPopupIfOpen`.

**Verify:** Toast visible → open build → both hide. Early-return open (hover planning / res4) does not hide.

### Increment D — Ranged / air

1. Call helper only on branches that arm ranged or air mode.

**Verify:** Toast visible → arm mode → both hide. Cancel does not restore.

### Increment E — Tactical zoom-in

1. Call helper on success path of `enterTacticalMapView` only.

**Verify:** Toast visible → enter tactical → both hide once. A subsequent `showMapToast` still appears (proves no suppress).

### Increment F — Reliability

1. Orienting comments on new/updated members.
2. Match neighbor toast helpers for logging (stay quiet if they are quiet).
3. Optional pure unit-id set inequality helper + happy-path test.
4. Smoke all four initiations; confirm Ready turn-update toasts still show after planning.

---

## 4. Constraints

1. Reuse CSS `.hidden` via existing hide helpers (clears auto-hide timers).
2. Do not invent a planning UI state machine.
3. Do not edit bundled `static/renderer.js` as source of truth when the project builds from `src/`.
4. Never commit or push from the implementing agent unless the owner asks.
