# Model Tab Match Lifecycle Implementation Plan

> **For agentic workers:** Implement this plan phase by phase, in order. Do not start a phase until the previous phase's verification commands pass. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Starting a match clears the AI activity log. An empty API key field clears a saved key and restores the unsaved placeholder. Consultation cost from a deferred strategic consult and from a tactical post-beat consult is added to the match cost readout. New does not open the new-game overlay during a battle or during resolution playback.

**Architecture:** Log clearing is one DOM helper called from the successful new-game path that already resets `S.openRouterGameCost`. The key field tracks whether an empty input stands for a hidden saved key. Cost is an optional number already returned by `requestOrders` and dropped before the renderer sees it. An inline consult adds that number to the Ready result the renderer already totals. A deferred consult puts it on the existing push, and the renderer adds it when that push arrives. The same consult must not be added in both places. The New click returns before `openNewGameOverlayFromModelTab` does any work when a battle or playback is active.

**Tech Stack:** TypeScript, Electron, Node `node:test` from `dist/main` and `dist/shared` after `npm run build:main`.

## Global Constraints

- Do not commit or push.
- Do not put phase, stage, or plan identifiers into code, comments, tests, configuration, or lint messages.
- Do not rename IPC channel names. Adding an optional `cost` field to existing payload types is allowed. Do not log the API key.
- New and updated fields and non-overriding functions need an orienting comment saying why the symbol exists, when to use it, what to expect back, and what it throws.
- Test happy paths and essential failure cases only. Extend `src/main/ipc/readyIpcResolutionMapping.test.ts` for the cost mapping. Do not add a renderer DOM test for the key field.
- Renderer UI helpers do not take main-process debug or trace logging. Main-process functions that already log keep doing so. A new public main function is not required. If you touch a public main function's behavior, keep its existing debug log and add the cost only when a debug log is already built for that call.
- Prefer a parameter object once a function would need more than six named arguments.
- Do not create a second cost counter. Use `S.openRouterGameCost`.

## Locked Behavior

On a successful `newGame` in `src/renderer/gameplay/newGame.ts`, after `S.openRouterGameCost = 0`, clear `#openrouter-log` so it has no child nodes, then refresh the cost label as today. A failed new game does not clear the log. App startup needs no extra clear. The game-over button uses this same handler.

API key:

- Placeholder is `Set key and blur to save` until a key is saved, then `Saved API key`.
- Blur, change, or Enter saves when the text changed.
- An empty value calls `setKey('')`, sets the placeholder back to `Set key and blur to save`, and clears the "a saved key is hidden in this empty field" flag.
- After load, if `getKey()` reports `hasKey` and the input is empty, the placeholder is `Saved API key` and a later empty blur still clears the key. Today that blur returns early because `lastPersistedApiKeyValue` is `''`.

Cost:

- `afterResolution` and `afterTacticalBeatResolution`, on `result.success === true` and `typeof result.cost === 'number'` and `Number.isFinite(result.cost)`, put that cost on their return value.
- `runEventDrivenAfterResolutionConsultation` and `runEventDrivenAfterTacticalBeatConsultation` copy that finite `cost` onto the objects they return. They do not spread `cost: undefined`.
- `TacticalPostBeatConsultMergeSource`, `TacticalPostBeatConsultFields`, and `PostResolutionConsultationPushPayload` in `src/shared/ipc/readyTypes.ts` gain optional `cost?: number`.
- `toTacticalPostBeatConsultFields` copies `cost` only when it is a finite number.
- The strategic push is built in `src/main/ipc/deferredResolutionPlaybackConsult.ts` from the object `runEventDrivenAfterResolutionConsultation` returns. Add `cost` only when it is a finite number. `src/main/ipc/deferredResolutionPlaybackConsult.test.ts` expects a payload of `{ planningTurnNumber: 42 }` when there is no cost. That assertion must keep passing.
- Inline consults never send that push. In `handleGameReady` and `handleResolveMeleeIntercept` in `src/main/gameIpcHandlers.ts`, add a finite `postConsult.cost` onto the cost already returned to the renderer. `handleGameReady` already puts the pre-resolution consult in `turnCost`. Add the post-resolution cost to that number. Do not replace it. `handleResolveMeleeIntercept` leaves `turnCost` unset today, so its returned `cost` becomes the inline consult cost. The renderer already adds `readyResult.cost` once. Do not add that same number again in the push listener.
- Deferred consults are the other branch. The renderer adds a finite `payload.cost` once, in `initDeferredResolutionPlaybackPushListeners` for the strategic push and in `applyTacticalPostBeatConsultSideEffects` for the tactical payload, then calls `updateOpenRouterCostLabel` from `src/renderer/openRouter/openRouterUiHelpers.ts`. Import that helper. Do not add a new field to `TacticalPostBeatConsultSideEffectDeps`. Tactical Ready calls `applyTacticalPostBeatConsultSideEffects` only when the consult was not deferred, and the push listener calls it only for the deferred payload. One beat must not take both paths. Do not add cost on the prefetch path in `openRouterRuntime.ts`. That path already adds `result.cost`.
- A missing or non-finite cost adds nothing. Do not treat a missing field as zero.

New:

- `openNewGameOverlayFromModelTab` returns immediately when `S.tacticalBattleSnapshot != null` or `S.resolutionMoveAnimation != null`. It does not cancel AI planning, does not show the overlay, and does not disable the map.
- `doc/ux/right-panel-model-tab.md` gains one sentence: New opens the overlay only during strategic planning. During a battle or resolution playback the click does nothing.
- This is the recommended reading of the mode matrix (dialog Hidden in those modes) over the Model tab sentence that named no exception.

## Phase 1: Clear the Log

**Files:**
- Modify: `src/renderer/openRouter/openRouterUiHelpers.ts`
- Modify: `src/renderer/gameplay/newGame.ts`
- Modify: `doc/ux/ai-activity-log.md`
- Modify: `doc/ux-specification.md`

- [ ] **Step 1: Helper and call**

Add `clearOpenRouterLog()` next to `appendOpenRouterLog`. It sets `#openrouter-log` `textContent` to `''` when the node exists. Call it from the successful new-game path immediately after `S.openRouterGameCost = 0` and before `deps.updateOpenRouterCostLabel()`.

- [ ] **Step 2: Docs**

Remove the log Known Deviations entry from `doc/ux/ai-activity-log.md`. Rebuild the Known Deviations index in `doc/ux-specification.md` by reading the documents. Do not subtract from a remembered total.

- [ ] **Step 3: Verify**

```text
npm run check:renderer-types
```

Expected: exit 0.

## Phase 2: API Key Clear

**Files:**
- Modify: `src/renderer/openRouter/openRouterControls.ts`

- [ ] **Step 1: Hidden-saved-key flag**

In the key-input setup, add a boolean `savedKeyHiddenInEmptyField`, initially false. Set it true only in the `getKey()` load path, when `hasKey` is true and the input is empty. Keep the placeholder `Saved API key`. Do not set the flag when the field still holds a key the player just typed.

In `persistApiKey`, if the trimmed value is `''` and `savedKeyHiddenInEmptyField` is true, set the flag false and set `lastPersistedApiKeyValue` to `''` before calling `api.setKey('')`. Inside the existing `setKey` `.then()`, set the placeholder to `Set key and blur to save`, hide the map toast, and call `deps.syncOpenRouterRunToggleInteractable()`. Do not do that work before `setKey` resolves.

If the trimmed value is `''` and the flag is false, keep the equality check against `lastPersistedApiKeyValue`. When that path does call `setKey('')`, the same `.then()` sets the placeholder to `Set key and blur to save`, not `''`.

Do not clear the input from code. The password field may still hold the text the player just typed. A later delete-and-blur uses the flag-false path because `lastPersistedApiKeyValue` is the saved text, not `''`.

- [ ] **Step 2: Verify**

```text
npm run check:renderer-types
npm run build:renderer
```

Expected: both exit 0.

Manual check: save a key, reload so the field is empty and the placeholder is `Saved API key`, clear focus from the empty field, and confirm a later model refresh treats the key as gone and the placeholder is `Set key and blur to save`.

## Phase 3: Consultation Cost

**Files:**
- Modify: `src/main/openRouter/afterResolution.ts`
- Modify: `src/main/ipc/readyIpcResolutionMapping.ts`
- Modify: `src/shared/ipc/readyTypes.ts`
- Modify: `src/main/ipc/readyIpcResolutionMapping.test.ts`
- Modify: `src/main/ipc/deferredResolutionPlaybackConsult.ts`
- Modify: `src/main/gameIpcHandlers.ts` (`handleGameReady` and `handleResolveMeleeIntercept` cost totals only)
- Modify: `src/renderer/openRouter/openRouterControls.ts`
- Modify: `src/renderer/tactical/applyTacticalPostBeatConsultSideEffects.ts`
- Modify: `doc/ux/right-panel-model-tab.md` only if a Known Deviations line was added for cost. Do not add one. The requirement already says the readout works in both theaters.

- [ ] **Step 1: Failing mapping test**

Extend `readyIpcResolutionMapping.test.ts` so `toTacticalPostBeatConsultFields` copies `cost: 0.25` onto the IPC fields, and omits `cost` when the merge source has no cost. Run it and confirm it fails before the type and mapper include `cost`.

- [ ] **Step 2: Thread cost**

Implement the Cost bullets in Locked Behavior, including `handleGameReady` and `handleResolveMeleeIntercept`. Copy `cost` only when it is a finite number. Do not use `result.cost !== undefined` as the check. `NaN` is not a finite number and must not be stored or added.

- [ ] **Step 3: Verify**

```text
npm run build:main
node --test dist/main/ipc/readyIpcResolutionMapping.test.js
npm run check:renderer-types
```

Expected: PASS, then exit 0.

## Phase 4: New During a Battle or Playback

**Files:**
- Modify: `src/renderer/gameplay/newGame.ts`
- Modify: `doc/ux/right-panel-model-tab.md`

- [ ] **Step 1: Guard**

The first lines of `openNewGameOverlayFromModelTab` return when `S.tacticalBattleSnapshot != null` or `S.resolutionMoveAnimation != null`.

- [ ] **Step 2: Docs**

Add the sentence from Locked Behavior to the New click bullet in `doc/ux/right-panel-model-tab.md`. Do not add a Known Deviations entry.

- [ ] **Step 3: Verify**

```text
npm run check:renderer-types
npm run build:renderer
```

Expected: both exit 0.

Manual check: during a battle, and during playback, New does not show the overlay and does not cancel planning. During strategic planning, New still opens it.
