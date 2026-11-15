# Commander Messages: Chat Panel Execution Plan

**Audience:** A coding agent that runs this plan from start to finish without asking questions.

**Goal:** The player can read what commanders say and write to them. The message dialog lists each commander's messages as bullets. A collapsible chat panel at the map's bottom-right, where the + and − buttons are today, holds an entry line, the player's staged message, and the history. The single-message plumbing left over from the taunt is removed.

**Shape:** Phase 0 records a baseline. Phases 1 through 9 each add one piece that can be verified on its own or with earlier phases. Phase 10 runs the final verification, the doc check, and hands the user a manual checklist.

**Tech:** TypeScript (Electron main, sandboxed preload, esbuild-bundled renderer), Leaflet, plain DOM and CSS, `node:test`, ESLint with the local `orienting-comments` and `seat-id-literals` rules, `scripts/check-circular-deps.cjs`, `scripts/ui-smoke/`.

**Order:** This is the third of three plans. `2026-11-14-dispatches-0-meta-plan.md` explains the order. This plan needs the talk stage plan finished first.

---

## How to Use This Plan

- Run the phases in order, back to back. Do not pause between phases for review.
- **Stop only when a verification fails** and the phase's "If verification fails" steps do not fix it. Then revert that phase (see Backup and Revert), record the failure in the Defect Inventory, and stop. Tell the user which phase failed and why.
- Never commit, push, stash, or run `git checkout`, `git restore`, `git reset`, or `git clean`. The user reviews every change.
- Read the whole phase before you edit anything. Each phase lists the files it **Adds** and **Edits**. Do not edit other files, except to remove an import that lint reports unused in a listed file, or to fix a test that fails only because of a change the phase names (record that file in the Completion Log).
- Find code by the quoted text, not by a line number.
- **Code blocks are sketches.** Write the real code from the file you just read. When a sketch and the file disagree, the file wins. Record the difference in the Completion Log. **User-facing strings in this plan are not sketches.** Copy them exactly.
- **Tests come first.** Tests under `src/renderer` are not run by `npm test`. So every rule that can be wrong lives in a pure function under `src/shared`, with a test, and the renderer files only read the DOM, call those functions, and write the DOM.

### Backup and Revert

Nothing is committed. Before each phase, copy every file the phase **edits** into a backup folder outside the repo. Run this from the repo root. Set `$step` to the phase number and `$files` to that phase's **Edit** list.

```powershell
$step = '1'
$files = @('src/shared/ipc/channels.ts', 'src/main/preload.ts')
$backup = Join-Path $env:TEMP "aw-chat-panel\step-$step"
foreach ($f in $files) {
  $dest = Join-Path $backup $f
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Copy-Item $f $dest -Force
}
```

To revert a phase:

```powershell
foreach ($f in $files) { Copy-Item (Join-Path $backup $f) $f -Force }
# Then delete every file the phase added (its "Add" list).
```

---

## Verification Bar

Every phase ends with all three commands, run from the repo root:

```powershell
npm test
npm run build:renderer
npm run check:circular
```

- `npm test` runs the native rebuild, `build:main`, `lint`, `naming:check`, `check:renderer-types`, every compiled `dist/main/**/*.test.js` and `dist/shared/**/*.test.js`, and `notices:check`. It takes about 20 minutes.
- `npm run check:renderer-types` compares renderer type errors with `scripts/renderer-typecheck-baseline.json`. A **new** error fails. Never refresh that baseline, `scripts/circular-deps-baseline.json`, or any other baseline file to make a gate pass.
- `npm run check:circular` passes when it prints **exactly** the cycles recorded in Phase 0 and no others.
- **Renderer phases (4 through 8) also run `npm run ui:smoke`** when the phase says so. If `ui:smoke` cannot run on this machine, say so in the Completion Log. The user's manual checklist covers it.
- **Source contracts.** Renderer wiring is checked by tests under `src/main` that read renderer source with `readRendererSource` and `assertMatches` from `src/main/testSupport/rendererSourceAssertions.ts`. Read `src/main/rendererStackPopoverContracts.test.ts` for the style before writing one.
- **Native module lock.** If `npm test` fails in `rebuild:native:node` with `EBUSY` on `better_sqlite3.node`, close any running Electron app, rename `node_modules/better-sqlite3/build/Release/better_sqlite3.node` to `better_sqlite3.node.locked`, rerun `npm test`, then delete the `.locked` file.

---

## Non-Goals

- No timeline, chart, or relationship graph. Stances are not shown anywhere.
- No new rule about who may talk to whom, and no change to the talk stage or the orders stage.
- No zoom buttons anywhere else. The wheel, the keys, and the gestures in `doc/ux/input-map.md` still zoom.
- No message from an observer. An observer reads.
- No change to `README.md`.
- Do not edit anything under `.spec/completed/`.
- Do not "improve" code next to a phase's target. Make only the edits listed.

---

## Conventions

These come from `.cursor/rules/` and `AGENTS.md`. Lint enforces some of them.

- **Orienting comments.** Every new function, constant, type, interface, and field needs a JSDoc block with a one-line summary, then `Purpose:` (or `Contract:` for types and interfaces), `When to use:`, `Expected outcome:`, and `Exceptions:`. **Do not copy the generic filler** that many existing blocks contain.
- **Logging.** Main-process exported functions that change state log `logDebug`, and getters log `logTrace`, with ids and counts only. **Never log message text.** No logging in `src/shared` or `src/renderer` (the renderer may use `console.error` in a `catch`, as `commanderPoolClient.ts` does).
- **Names.** camelCase files, directories, and functions, PascalCase types, UPPER_SNAKE constants. Follow `doc/naming-conventions-contract-v1.md`: the only role suffixes are `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, and `Types`, and `Utils`, `Impl`, `Manager`, `Service`, `Processor`, and `Controller` are banned. Use the file names this plan gives. Names from this plan must never appear in code, comments, test names, or `doc/`.
- **Vocabulary.** In code: a side message, the chat panel. On screen: **Messages** for the dialog section and the panel title. `CommanderDispatch` keeps its existing meaning.
- **Seat ids.** Production code uses the constants and guards in `src/shared/seatIds.ts`. Tests may use literals.
- **Size limits.** Files should stay under 600 lines and must stay under 1000. Functions take 6 or fewer named parameters.
- **Style.** Colors, borders, radii, and fonts come from the variables and patterns in `doc/ui-style-guide.md` and `static/selectionChrome.css`. Do not introduce a new color value.
- **Side names and flags.** A side's name on screen is `sideDisplayName` from `src/shared/sideNicknames.ts`. A side's flag is `createSideNumberFlag` (find it by searching `src/renderer` for `export function createSideNumberFlag`). Use both everywhere this plan shows a side.
- **Docs.** `AGENTS.md` requires `doc/` to change in the same change as the code, and the UX suite is normative. Before changing a surface, read its `doc/ux/` document and the cross-cutting documents `doc/ux-specification.md` routes it through. A phase that changes a surface updates its document in the same phase, including Code Entry Points when a file is added. An element document uses the fixed heading set `doc/ux-specification.md` lists: copy the headings of `doc/ux/selection-panel.md` exactly, including Invariants, Strategic and Tactical Differences, Related Documents, Known Deviations, Open Questions, and Code Entry Points. Do not add a Known Deviations entry unless you are recording an accepted bug. Your final message names every document you updated.
- **Database access in the main process** is `gameDbOps` from `src/main/gameDb/dbConnection.ts` for the store functions. `getSeatRoster` comes from the barrel `src/main/gameDb.ts`, as it does for the other IPC handlers and the pool.

---

## Locked Decisions

The user made these. Do not revisit them.

1. **Who sees what follows fog of war.** With fog of war on, a player sees only messages sent to them and messages they sent. With fog of war off, a player sees every message between every side. An observer sees every message. AI commanders are not affected by this: they only ever see their own.
2. **The message dialog** shows, under a **Messages** heading, one bullet per message the selected commander sent in that consult that the viewer may see, in side order 1 to 4. Each bullet is `To <flag> <nickname>: <message>`.
3. **The chat panel replaces the + and − buttons** at the map's bottom-right. It is collapsible like the selection panel. It starts collapsed. Its width follows the same rule as the message dialog.
4. **The entry line is always at the bottom of the panel,** collapsed or expanded: a drop-down that picks the opponent, a text field, and a send button with a right-facing arrow.
5. **Enter or the send button stages the message.** It is not sent yet. The staged message shows directly above the entry line with an edit button and a cancel (×) button, collapsed or expanded. Which staged message shows depends on the opponent picked in the drop-down.
6. **A staged message is sent when the player commits** the turn (Ready) or the beat.
7. **Expanded, the panel shows the history** above the staged message: every message the viewer may see, grouped by turn, oldest at the top, scrollable.
8. **The panel is hidden during a turn update,** and stays hidden until the update toast times out or is closed.

### Decisions this plan makes where the guidance was silent

Tell the user about these in your final message.

- **Edit** moves the staged text back into the text field and removes the staged message. Sending it again stages it again.
- **The history is not filtered by the drop-down.** It shows every visible message. The drop-down only picks who the entry line writes to and which staged message shows.
- **"During a turn update" means:** from the moment resolution playback starts until the map toast is hidden. The panel is also hidden whenever the map toast is showing for any other reason, because both sit at the bottom-right, and during the New game and Game over overlays.
- **The map scale stays** in the bottom-right corner. The panel sits directly above it.
- **An observer's panel has no entry line.** Its bar shows the title and the expand control only.
- **A side that leaves the match** drops out of the drop-down. A staged message to it is discarded the next time the player commits (the talk stage plan's `sendStagedHumanSideMessages` does this).

---

## Design

### What the main process sends

```ts
// src/shared/sideMessageView.ts
export interface SideMessageView {
  readonly messageId: number;
  readonly fromSeatId: string;
  readonly toSeatId: string;
  readonly text: string;
  readonly scope: 'strategic' | 'tactical';
  readonly turnNumber: number;
  readonly beatNumber: number;
}
export interface SideMessageThreadSnapshot {
  readonly viewerSeatId: string | null;                 // null for an observer
  readonly canSend: boolean;                            // false for an observer
  readonly recipientSeatIds: readonly string[];         // AI sides still in the match, in side order
  readonly messages: readonly SideMessageView[];        // sent, visible to the viewer, oldest first
  readonly staged: readonly SideMessageView[];          // the viewer's staged messages
}
```

The main process filters. The renderer never receives a message the viewer may not see.

### IPC

| Channel | Request | Reply |
| --- | --- | --- |
| `game:readSideMessages` | none | `SideMessageThreadSnapshot` |
| `game:stageSideMessage` | `{ toSeatId: string; text: string }` | `{ success: true } \| { success: false; reason: string }` |
| `game:cancelStagedSideMessage` | `{ toSeatId: string }` | `void` |

### The dialog's messages

`CommanderDispatch` (in `src/shared/commanderStatus.ts`) gains `readonly messages: readonly CommanderDispatchMessage[]`, where `CommanderDispatchMessage` is `{ readonly toSeatId: string; readonly text: string }`. The pool fills it from the talk round, filtered for the viewer. The old `message: string | null` field is removed in Phase 9.

### The panel

```
collapsed, player:                         expanded, player:
┌────────────────────────────────────┐     ┌────────────────────────────────────┐
│ staged text…              [✎] [×]  │     │ Turn 11                            │
│ [˄] [W. Turkey ▾] [ type…    ] [→] │     │  You → W. Turkey: …                │
└────────────────────────────────────┘     │ Turn 12                            │
                                           │  W. Turkey → You: …                │
                                           │ staged text…              [✎] [×]  │
                                           │ [˅] [W. Turkey ▾] [ type…    ] [→] │
                                           └────────────────────────────────────┘
```

- The staged row exists only while the picked opponent has a staged message.
- Collapsed, with no staged message, the panel is the entry bar alone.
- The expand control is a chevron like the selection panel's: up while collapsed, down while expanded.

### Module map

| File | Holds |
| --- | --- |
| `src/shared/sideMessageView.ts` | View types, the visibility rule, grouping, labels. Pure, tested |
| `src/shared/chatPanelState.ts` | The panel's visibility rule and staged-row lookup. Pure, tested |
| `src/main/ipc/sideMessageIpcHandler.ts` | The three channels |
| `src/renderer/chat/chatPanelClient.ts` | Calls the three channels and keeps the last snapshot |
| `src/renderer/chat/chatPanel.ts` | Renders and wires the panel |
| `src/renderer/chat/chatPanelVisibility.ts` | Shows and hides the panel |
| `static/chatChrome.css` | The panel's styles |

---

## Phase 0 — Baseline and Prerequisites

**Add:** nothing. **Edit:** nothing.

1. Run `git status --short` and record the output in the Phase 0 Inventory.
2. Run the Verification Bar and `npm run ui:smoke`. Record pass or fail for each, and the exact cycle list `check:circular` prints.
3. **Prerequisite.** Confirm the talk stage exists: `src/main/gameDb/sideMessageStore.ts` exports `listSentSideMessages` and `listStagedSideMessages`; `src/main/sideMessages/humanSideMessages.ts` exports `stageHumanSideMessage` and `cancelStagedHumanSideMessage`; `src/main/openRouter/talk/talkRound.ts` exports `TalkRound` with `sentBy`; `src/main/openRouter/commanderPool.ts` contains `messageToHumanFrom`. **If any is missing, stop.** Tell the user the talk stage plan has to be finished first.
4. Confirm these exist, and record any that do not: `src/shared/commanderStatus.ts` (`CommanderDispatch`), `src/shared/commanderMessageTabs.ts` (`applyCommanderMessage`, `commanderDispatchHasProse`), `src/shared/aiStrategyToastContent.ts` (`buildAiStrategyToastSections`), `src/renderer/openRouter/commanderMessageTabsUi.ts` (`renderCommanderMessageTabs`), `src/renderer/openRouter/openRouterUiHelpers.ts` (`showMapToast`, `hideMapToast`), `src/renderer/map/worldLeafletMap.ts` (the text `leafletRef.control.zoom({ position: 'bottomright' }).addTo(mainMap);`), `src/renderer/map/mapChromeLayout.ts` (`layoutMapChrome`), `src/shared/mapChromePlacement.ts` (`toastBandSpan`, `messageToastBandWidth`), `src/renderer/gameplay/selectionPanelExpand.ts` (`wireSelectionPanelExpand`), `src/shared/observeModeControls.ts` (`activeHumanSeatId`), `src/main/gameDb/fogState.ts` (`isFogOfWarEnabled`), `src/shared/ipc/channels.ts` (`IPC_GAME`), `src/main/preload.ts`, `src/shared/ipc/gameApiTypes.ts`.

**Stop if** the bar fails before any edit.

---

## Phase 1 — The Visibility Rule and View Helpers

Pure functions decide who sees a message and how the history is grouped.

**Add:** `src/shared/sideMessageView.ts`, `src/shared/sideMessageView.test.ts`
**Edit:** nothing.

### Steps

`sideMessageView.ts` (no logging, no DOM):

```ts
export function sideMessageVisibleToViewer(input: {
  readonly viewerSeatId: string | null;     // null: an observer
  readonly fogOfWarEnabled: boolean;
  readonly fromSeatId: string;
  readonly toSeatId: string;
}): boolean
// Observer: true. Fog of war off: true. Otherwise true only when the viewer sent it or it was sent to the viewer.

export interface SideMessageTurnGroup {
  readonly turnNumber: number;
  readonly heading: string;                  // 'Turn 12'
  readonly messages: readonly SideMessageView[];
}
export function groupSideMessagesByTurn(messages: readonly SideMessageView[]): SideMessageTurnGroup[]
// Groups by turnNumber, turns ascending, messages in the order given.

export function sideMessagePartyLabel(seatId: string, viewerSeatId: string | null, nameOf: (seatId: string) => string): string
// 'You' for the viewer's own seat, otherwise nameOf(seatId).

export function dispatchMessagesInSideOrder<T extends { readonly toSeatId: string }>(
  messages: readonly T[],
  seatOrderOf: (seatId: string) => number,
): T[]
// Sorted by the recipient's side order, 1 to 4. Stable.

export const SIDE_MESSAGES_TITLE = 'Messages';
export const SIDE_MESSAGE_BULLET_PREFIX = 'To';
```

Also move the `SideMessageView` and `SideMessageThreadSnapshot` types from the Design section into this file.

### Tests

`sideMessageView.test.ts`:

- Visibility, as a table of eight rows: observer sees an AI-to-AI message with fog on; a player with fog on sees a message to them, a message from them, and not a message between two others; a player with fog off sees a message between two others.
- Grouping: messages from turns 3, 3, 5 give two groups with headings `Turn 3` and `Turn 5`, in that order, and an empty list gives no groups.
- Party label: `You` for the viewer's seat, the name otherwise, and never `You` for an observer.
- Side order: messages to sides 3, 1, 2 come back as 1, 2, 3.

### Verification

Run the Verification Bar.

---

## Phase 2 — Reading, Staging, and Cancelling over IPC

The renderer can ask for the thread and stage or cancel a message. No screen uses it yet.

**Add:** `src/main/ipc/sideMessageIpcHandler.ts`, `src/main/ipc/sideMessageIpcHandler.test.ts`
**Edit:** `src/shared/ipc/channels.ts`, `src/main/preload.ts`, `src/shared/ipc/gameApiTypes.ts`, `src/main/main.ts`

### Steps

1. `channels.ts`: add `readSideMessages: 'game:readSideMessages'`, `stageSideMessage: 'game:stageSideMessage'`, and `cancelStagedSideMessage: 'game:cancelStagedSideMessage'` to `IPC_GAME`.
2. `preload.ts`: add the three channel strings to the preload's own channel list (it keeps a copy: find `readCommanderPool: 'game:readCommanderPool'`), and three methods on the exposed game API, following `readCommanderPool`.
3. `gameApiTypes.ts`: add the three method types.
4. `sideMessageIpcHandler.ts`:
   - `export function buildSideMessageThreadSnapshot(): SideMessageThreadSnapshot`. The viewer is `activeHumanSeatId(getSeatRoster())`. Fog comes from `isFogOfWarEnabled`. `messages` is `listSentSideMessages` mapped to views and filtered with `sideMessageVisibleToViewer`. `staged` is `listStagedSideMessages` for the viewer, or empty for an observer. `recipientSeatIds` is the AI seats with `outTurn == null`, in side order. `canSend` is true when there is a viewer and at least one recipient. When the database is not ready, return an empty snapshot with `viewerSeatId: null` and `canSend: false`.
   - `export function registerSideMessageIpcHandler(ipcMain: IpcMain): void` registers the three channels. `stageSideMessage` validates that the payload is an object with string `toSeatId` and string `text`, and otherwise returns `{ success: false, reason: 'Invalid message.' }`. Then it calls `stageHumanSideMessage`. `cancelStagedSideMessage` validates `toSeatId` and calls `cancelStagedHumanSideMessage`.
5. `main.ts`: call `registerSideMessageIpcHandler(ipcMain)` next to `registerEndMatchIpcHandler` (search for it). One line and one import.

### Tests

- `sideMessageIpcHandler.test.ts`, on a seated temp match, calling `buildSideMessageThreadSnapshot` directly:
  - A human seat with fog on, with one message to the human, one from the human, and one between two AI sides: the snapshot has the first two only.
  - The same match with fog off (write `fog_of_war_enabled` as `'0'`): all three.
  - A match with no human seat: all three, `viewerSeatId` null, `canSend` false, `staged` empty.
  - A staged message from the human appears in `staged` and not in `messages`.
  - A recipient that is out is not in `recipientSeatIds`.
- The existing channel parity tests (`src/main/preloadChannelParity.test.ts`, `src/main/preloadIpcChannelParity.test.ts`) must pass. They fail when one of the three files in steps 1 to 3 misses a channel.

### Verification

Run the Verification Bar.

---

## Phase 3 — The Message Dialog's Bullets

The dialog shows each commander's messages as bullets.

**Add:** nothing.
**Edit:** `src/shared/commanderStatus.ts`, `src/main/openRouter/commanderPool.ts`, `src/main/openRouter/commanderPoolSupport.ts`, `src/main/openRouter/commanderPoolSettle.ts`, `src/shared/commanderMessageTabs.ts`, `src/shared/commanderMessageTabs.test.ts`, `src/shared/aiStrategyToastContent.ts`, `src/renderer/openRouter/commanderMessageTabsUi.ts`, `src/renderer/openRouter/commanderPoolClient.ts`, `src/renderer/openRouter/openRouterControls.ts`, `src/main/openRouter/commanderPool.test.ts`, `doc/ux/notifications-and-feedback.md`, `doc/ux/reports-tab.md`

### Steps

1. `commanderStatus.ts`: add `CommanderDispatchMessage` and `readonly messages: readonly CommanderDispatchMessage[];` to `CommanderDispatch`. Keep `message` for now.
2. Main process:
   - `commanderPoolSupport.ts`: add `readonly sentMessages?: readonly CommanderDispatchMessage[];` to `CommanderConsultOutcome`.
   - `commanderPool.ts`, in `launch`, where the outcome is adjusted before `applyConsultOutcome`: set `sentMessages` from `talkRound?.sentBy(seatId) ?? []`, mapped to `{ toSeatId, text }`.
   - `commanderPoolSettle.ts`: both places that push a dispatch add `messages`. Filter `outcome.sentMessages ?? []` with `sideMessageVisibleToViewer`, using `activeHumanSeatId(getSeatRoster())` as the viewer, `isFogOfWarEnabled`, and the dispatch's seat as `fromSeatId`. In the failed-consult branch, the condition `if (message || strategy)` becomes `if (message || strategy || messages.length > 0)`.
3. `commanderMessageTabs.ts`: a tab holds `messages` beside `message` and `strategy`. `applyCommanderMessage` takes and stores them. `commanderDispatchHasProse` gains a third parameter, the message count, and returns true when it is above zero. Update its callers.
4. `aiStrategyToastContent.ts`:
   - `AI_STRATEGY_TOAST_MESSAGE_TITLE` becomes `SIDE_MESSAGES_TITLE` (`'Messages'`). Import it from `sideMessageView.ts`, or re-export it, so the word exists once.
   - `AiStrategyToastFields` gains `messages?: readonly CommanderDispatchMessage[]`, and `AiStrategyToastSection` gains `bullets?: readonly CommanderDispatchMessage[]`.
   - `buildAiStrategyToastSections` returns a Messages section with `bullets` (and an empty `body`) when `messages` is not empty. It no longer builds a section from the single `message` field.
5. `commanderMessageTabsUi.ts`, `renderCommanderMessageTabs`: for a section with `bullets`, after the header, append a `<ul>` with one `<li>` per bullet in the order `dispatchMessagesInSideOrder` gives (side order from `S.gameState?.seats`). Each `<li>` holds the text `To `, the recipient's flag from `createSideNumberFlag`, the recipient's `sideDisplayName` (or `You` when the recipient is the viewer, via `sideMessagePartyLabel`), `: `, and the message, set with `textContent`. Never use `innerHTML` with message text. Use the bullet indent the map toast uses (`MAP_TOAST_SECTION_BULLET_INDENT` in `mapToastBody.ts`).
6. `commanderPoolClient.ts` and `openRouterControls.ts`: pass `dispatch.messages` wherever `dispatch.message` is passed today (`messageLines`, `showCommanderMessageTabs`, `fileCommanderMessage`). For the Reports entry, `messageText` becomes the bullets as lines, `To {name}: {text}`, joined with `\n`.
7. Docs: in `doc/ux/notifications-and-feedback.md`, the AI strategy toast row and bullet now say the selected tab shows **Messages**, one bullet per message that commander sent in that consult that the viewer may see, in side order, then Strategy. State the fog-of-war rule in one sentence. In `doc/ux/reports-tab.md`, update what a Message entry holds.

### Tests

- `commanderMessageTabs.test.ts`: a dispatch with two messages and no strategy enables the tab; `commanderDispatchHasProse(null, null, 0)` is false and `(null, null, 1)` is true.
- Extend `src/shared/aiStrategyToastContent.test.ts`: messages and a strategy give two sections, Messages first with two bullets; no messages gives the Strategy section alone; the legacy `message` field alone gives no Messages section.
- `commanderPool.test.ts`: with a human seat and fog on, a wave whose talk runner sent one message to the human and one to another AI produces a dispatch with one entry in `messages`. With fog off, two. With no human seat, two.
- A source contract in a new `src/main/rendererMessageDialogContracts.test.ts`: `commanderMessageTabsUi.ts` calls `dispatchMessagesInSideOrder` and `createSideNumberFlag`, and does not contain `innerHTML`.

### Verification

Run the Verification Bar. Then, if you can run the app with a key: start a match with fog of war off and two AI sides, wait for a consult, and confirm the dialog's selected tab shows a Messages heading with `To …:` bullets and flags. Record what you saw.

---

## Phase 4 — The Panel Shell

The + and − buttons are gone. A collapsed panel sits in their place and expands and collapses. It has no content yet beyond a title.

**Add:** `static/chatChrome.css`, `src/renderer/chat/chatPanel.ts`, `src/main/rendererChatPanelContracts.test.ts`, `doc/ux/chat-panel.md`
**Edit:** `static/index.html`, `static/shellChrome.css`, `src/renderer/map/worldLeafletMap.ts`, `src/renderer/map/mapChromeLayout.ts`, `src/renderer/gameplay/selectionPanel.ts`, `src/shared/mapChromePlacement.ts`, `src/shared/mapChromePlacement.test.ts`, `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, `doc/ux/map-surface.md`, `doc/ux/selection-panel.md`, `doc/ux/notifications-and-feedback.md`, `doc/ux-specification.md`, `doc/ui-style-guide.md`

Read first: `static/selectionChrome.css`, `src/renderer/gameplay/selectionPanelExpand.ts`, `src/renderer/chrome/panelSlideHelpers.ts`, and the `#selection-panel` markup in `static/index.html`. The chat panel copies their structure and look.

### Steps

1. **Remove the zoom buttons.**
   - `worldLeafletMap.ts`: delete the line `leafletRef.control.zoom({ position: 'bottomright' }).addTo(mainMap);`. Both maps already pass `zoomControl: false`.
   - `shellChrome.css`: delete the four `#main-map .leaflet-control-zoom…` rules and their comment. In the comment above `#main-map .leaflet-bottom.leaflet-right`, drop the sentence about the zoom buttons.
   - `ui-smoke-map-chrome-checks.cjs`: remove the `zoom-buttons-bottom-right` check and the `LEAFLET.zoom` entry. Rewrite the scale check so it expects the scale's right edge 12 px in from the map's right edge. Leave `minimapHasZoom` in `ui-smoke-checks.cjs` alone. It asserts the minimap has none.
2. **Markup.** In `static/index.html`, add a stylesheet link for `chatChrome.css` after `selectionChrome.css`, and this section directly after the `#selection-panel` section closes:

   ```html
   <section id="chat-panel" class="chat-panel" aria-label="Messages" data-state="compact" hidden>
     <div id="chat-panel-history" class="chat-panel-history" role="log" aria-live="polite"></div>
     <div id="chat-panel-staged" class="chat-panel-staged" hidden>
       <p id="chat-panel-staged-text" class="chat-panel-staged-text"></p>
       <button type="button" id="chat-panel-staged-edit" class="chat-panel-icon-btn" aria-label="Edit this message" data-control-tooltip="Put this message back in the text field to change it."></button>
       <button type="button" id="chat-panel-staged-cancel" class="chat-panel-icon-btn" aria-label="Cancel this message" data-control-tooltip="Discard this message. It has not been sent.">×</button>
     </div>
     <div id="chat-panel-bar" class="chat-panel-bar">
       <button type="button" id="chat-panel-expand" class="chat-panel-expand" aria-expanded="false" aria-controls="chat-panel-history" aria-label="Show the message history" data-control-tooltip="Show the messages sent and received this match."></button>
       <p id="chat-panel-title" class="chat-panel-title">Messages</p>
       <select id="chat-panel-recipient" class="chat-panel-recipient" aria-label="Send to" data-control-tooltip="Choose the side this message goes to."></select>
       <input type="text" id="chat-panel-input" class="chat-panel-input" maxlength="280" autocomplete="off" spellcheck="true" placeholder="Write a message" aria-label="Message" data-control-tooltip="Write to that side's commander. Press Enter to stage the message. It is sent when you press Ready." />
       <button type="button" id="chat-panel-send" class="chat-panel-icon-btn" aria-label="Stage this message" data-control-tooltip="Stage this message. It is sent when you press Ready."></button>
     </div>
   </section>
   ```

   Give the expand, edit, and send buttons inline SVG icons in the style of the selection panel's (`class="chrome-icon"`): a chevron, a pencil, and a right-facing arrow.

3. **Styles.** `chatChrome.css`: the panel is `position: absolute`, anchored to the map container's bottom-right. Its face, border, radius, bar height (50 px), and control sizes (32 px wide, full bar height) match `.selection-panel`. `data-state="compact"` hides `.chat-panel-history`. `data-state="expanded"` shows it with `overflow-y: auto`. The history's maximum height is set from script. The staged row is one line with the text ending in an ellipsis and the two buttons keeping their size. `.chat-panel-title` shows only when the entry controls are hidden (`#chat-panel[data-can-send="false"]`), and the select, input, and send button hide in that state. Where the panel and the selection panel overlap, the selection panel is on top: give the chat panel the lower `z-index`.

4. **Width and place.** `mapChromePlacement.ts`: add

   ```ts
   export function chatPanelPlacement(input: {
     readonly mapWidth: number;
     readonly mapHeight: number;
     readonly bandWidth: number;        // the width layoutMapChrome computed for the message toast band
     readonly scaleHeight: number;      // 0 when the scale is not shown
   }): { readonly width: number; readonly right: number; readonly bottom: number; readonly maxHistoryHeight: number }
   ```

   `width` is `bandWidth`, so the panel follows the message dialog's rule exactly. `right` is `MAP_CHROME_INSET`. `bottom` is `MAP_CHROME_INSET + scaleHeight + (scaleHeight > 0 ? MAP_CHROME_GAP : 0)`. `maxHistoryHeight` is half of `mapHeight`, rounded down.

   `mapChromeLayout.ts`, `layoutMapChrome`: after the band's width is final, measure the scale (`#main-map .leaflet-control-scale`, height 0 when missing), call `chatPanelPlacement`, and set the panel's `width`, `right`, `bottom`, and the history's `max-height`. The band width must be computed whether or not the toast is showing. Read the function: it already computes it every time.

5. **Behavior.** `chatPanel.ts`: `export function wireChatPanel(): void` binds the expand button. A click toggles `data-state` between `compact` and `expanded`, sets `aria-expanded`, swaps the button's `aria-label` between `Show the message history` and `Hide the message history`, slides the height with `startPanelHeightSlide` the way `toggleSelectionPanel` does (and not at all when `reducedMotionRequested()`), and calls `layoutMapChrome()`. The state starts compact and lasts until the app closes. It is not saved. Call `wireChatPanel()` directly after the `wireSelectionPanelExpand();` call in `src/renderer/gameplay/selectionPanel.ts`. In this phase, also remove the `hidden` attribute there so the shell can be seen: Phase 7 replaces that line with the real rule.

6. **Docs.** Write `doc/ux/chat-panel.md` with the fixed heading set (see Conventions), covering what exists after this phase. Later phases extend it. Give it a row in the routing table of `doc/ux-specification.md`, with the cross-cutting documents to read with it (`modes-and-transitions.md`, `notifications-and-feedback.md`, `input-map.md`), and an entry in that file's list of element documents. In `doc/ui-style-guide.md`, update the implementation-status note and the map-view section so they no longer describe + and − buttons and do mention the chat panel. Update `doc/ux/map-surface.md` (the + and − bullet is replaced by one sentence that the wheel and the documented keys zoom, and that the chat panel sits at the bottom-right), `doc/ux/selection-panel.md` and `doc/ux/notifications-and-feedback.md` (every mention of the zoom buttons or the + and − buttons becomes the chat panel), and the index and "where to look" table in `doc/ux-specification.md`. Search `doc/` for `zoom button`, `+ and −`, and `leaflet-control-zoom` and fix every hit.

### Tests

- `mapChromePlacement.test.ts`: `chatPanelPlacement` returns the band width; `bottom` is 12 with no scale and `12 + scaleHeight + 8` with one; `maxHistoryHeight` is half the map height.
- `rendererChatPanelContracts.test.ts`: `static/index.html` contains each id above exactly once and links `chatChrome.css`; `worldLeafletMap.ts` does not contain `control.zoom(`; `shellChrome.css` does not contain `leaflet-control-zoom`; `chatPanel.ts` calls `startPanelHeightSlide` and `layoutMapChrome`. Read static files with `fs` from the repo root the way the existing contract tests locate renderer source.

### Verification

Run the Verification Bar and `npm run ui:smoke`. Then run the app: the + and − buttons are gone, the wheel still zooms, the panel's bar is at the bottom-right above the scale, the same width as the message dialog's band, and the chevron expands and collapses an empty area.

### If verification fails

- `ui:smoke` fails on a check that names the zoom buttons: that check was missed in step 1. Remove or rewrite it. Do not weaken any other check.
- The panel covers the scale: `scaleHeight` was read before Leaflet added the scale. Call `layoutMapChrome()` again where the map finishes loading. Search for its existing callers and use the same event.

---

## Phase 5 — Writing and Staging

The player picks a side, types, and stages a message. The staged message shows above the entry line with edit and cancel.

**Add:** `src/renderer/chat/chatPanelClient.ts`, `src/shared/chatPanelState.ts`, `src/shared/chatPanelState.test.ts`
**Edit:** `src/renderer/chat/chatPanel.ts`, `src/renderer/gameplay/newGame.ts`, `src/main/rendererChatPanelContracts.test.ts`, `doc/ux/chat-panel.md`, `doc/ux/control-tooltips.md`, `doc/ux/input-map.md`

### Steps

1. `chatPanelState.ts` (pure):

   ```ts
   export function stagedMessageFor(staged: readonly SideMessageView[], recipientSeatId: string | null): SideMessageView | null
   export function nextRecipientSeatId(current: string | null, recipientSeatIds: readonly string[]): string | null
   // Keeps `current` when it is still in the list, else the first entry, else null.
   export function canStageText(text: string): boolean
   // True when the text has a character that is not whitespace.
   ```

2. `chatPanelClient.ts`: keeps the last `SideMessageThreadSnapshot` and the picked recipient in module state.
   - `refreshChatThread(): Promise<void>` calls `window.gameApi.readSideMessages()`, drops the reply when the match changed while waiting (use `currentRendererMatchEpoch()` the way `commanderPoolClient.ts` does), stores it, applies `nextRecipientSeatId`, and calls the listeners.
   - `stageChatMessage(text): Promise<string | null>` calls `stageSideMessage` for the picked recipient, then `refreshChatThread()`. It returns the failure sentence, or null on success.
   - `cancelStagedChatMessage(): Promise<void>` calls `cancelStagedSideMessage` for the picked recipient, then refreshes.
   - `setChatRecipient(seatId)`, `chatSnapshot()`, `chatRecipientSeatId()`, and `subscribeChatThread(listener)`.
   - A missing `window.gameApi` method returns quietly. Errors go to `console.error`.

3. `chatPanel.ts`: add `renderChatPanel()`, called by a `subscribeChatThread` listener, and wire the controls in `wireChatPanel()`:
   - **Recipient drop-down:** one `<option>` per `recipientSeatIds`, with the side's `sideDisplayName` as its text and the seat id as its value. Rebuild it only when the id list changes, so an open drop-down is not reset. A change calls `setChatRecipient` and re-renders the staged row.
   - **Send:** the send button's click, and **Enter** in the text field (not Shift+Enter, and not while an input-method composition is active: check `event.isComposing`), call a private `stageFromInput()`. It does nothing when `canStageText` is false. Otherwise it awaits `stageChatMessage(input.value)`. On success it clears the field and keeps focus in it. On failure it shows the sentence with `showMapToast(sentence)` and leaves the text in the field.
   - **Staged row:** shown when `stagedMessageFor(snapshot.staged, recipient)` is not null, with that text in `#chat-panel-staged-text` (`textContent`) and the full text as the element's `title`. Hidden otherwise.
   - **Edit:** puts the staged text into the text field, awaits `cancelStagedChatMessage()`, and focuses the field with the caret at the end.
   - **Cancel (×):** awaits `cancelStagedChatMessage()`.
   - **`data-can-send`** on `#chat-panel` is `"true"` or `"false"` from `snapshot.canSend`. The send button is disabled while the field has no stageable text.
   - **Keys must not reach the map.** `shouldIgnoreGlobalKeydown` and `isEditableKeyboardTarget` in `src/renderer/map/mapHelpers.ts` already return true for `input`, `textarea`, and `select`. Confirm that the map's key handlers call one of them, so typing W, A, S, D, or T in the field does not pan the map or toggle a map mode. If a handler does not, add the check there and record it. Do not add `stopPropagation` to the field.
4. Call `refreshChatThread()` when a match is shown. There are two places:
   - At the end of `wireChatPanel()`. The window loads once at start and reloads after a save is loaded, so this covers both.
   - In `src/renderer/gameplay/newGame.ts`, directly after the line `S.gameState = state;` in the new-match path.
5. Docs: extend `doc/ux/chat-panel.md` with the entry line, staging, edit, and cancel. Add the six new control tips (expand, drop-down, text field, send, edit, cancel) to `doc/ux/control-tooltips.md` in that document's form, including its Source Anchors. Add Enter in the message field to `doc/ux/input-map.md`, with the fact that map keys do not act while the field has focus.

### Tests

- `chatPanelState.test.ts`: `stagedMessageFor` finds the row for the picked recipient and returns null for another; `nextRecipientSeatId` keeps a valid pick, falls back to the first, and returns null for an empty list; `canStageText` is false for `''` and `'   '` and true for `' a '`.
- `rendererChatPanelContracts.test.ts`: `chatPanel.ts` checks `isComposing`, sets staged text with `textContent`, and does not contain `innerHTML` or `stopPropagation`; `chatPanelClient.ts` calls `currentRendererMatchEpoch`.

### Verification

Run the Verification Bar and `npm run ui:smoke`. Then run the app as a player with two AI sides: type a message and press Enter, and the staged row appears with the text; switch the drop-down, and the row disappears; switch back, and it returns; Edit moves the text into the field and removes the row; × removes it; typing `wasd` in the field does not move the map. Save, load, and confirm a staged message is still there.

---

## Phase 6 — The History

Expanded, the panel shows every visible message by turn, and it stays current.

**Add:** nothing.
**Edit:** `src/renderer/chat/chatPanel.ts`, `src/renderer/chat/chatPanelClient.ts`, `src/renderer/openRouter/commanderPoolClient.ts`, `src/renderer/gameplay/readyHandler.ts`, `src/renderer/gameplay/readyTacticalCommit.ts`, `static/chatChrome.css`, `src/main/rendererChatPanelContracts.test.ts`, `doc/ux/chat-panel.md`

### Steps

1. `chatPanel.ts`, in `renderChatPanel()`: rebuild `#chat-panel-history` from `groupSideMessagesByTurn(snapshot.messages)`.
   - Each group is a heading element with the group's `heading`, then one row per message.
   - A row is: the sender's flag and `sideMessagePartyLabel`, an arrow `→`, the recipient's flag and label, `: `, and the text. A tactical message adds ` (battle)` after the recipient. Set every piece with `textContent`. `You` has no flag.
   - With no messages, the history holds one line: `No messages yet.`
   - **Scrolling:** before rebuilding, note whether the history was scrolled to within 8 px of its bottom. After rebuilding, scroll to the bottom when it was, or when the panel has just been expanded. Otherwise keep the scroll position, so reading older messages is not interrupted.
   - Rebuild only when the list of message ids changed.
2. **Keep it current.** Call `refreshChatThread()`:
   - In `commanderPoolClient.ts`, `readCommanderPoolAndApply`: inside the existing `if (drain && (next.dispatches.length > 0 || consultFinished))` block. This is when commanders have just spoken.
   - In `readyHandler.ts`, after a Ready result is applied successfully. This is when the player's staged messages have been sent.
   - In `readyTacticalCommit.ts`, after a successful beat commit, for the same reason.

   Each is one line. Do not add a timer or a poll.
3. `chatChrome.css`: history rows wrap, the group heading uses the muted text color the selection panel's caption uses, and a message row from the viewer is visually distinct by weight or alignment only, not by a new color.
4. Docs: extend `doc/ux/chat-panel.md` with the history, the grouping, the scroll rule, the fog-of-war rule, and when it refreshes.

### Tests

- `rendererChatPanelContracts.test.ts`: `chatPanel.ts` calls `groupSideMessagesByTurn` and `sideMessagePartyLabel`; `commanderPoolClient.ts`, `readyHandler.ts`, and `readyTacticalCommit.ts` each call `refreshChatThread`.

### Verification

Run the Verification Bar and `npm run ui:smoke`. Then run the app with a key, fog of war off, two AI sides: stage a message, press Ready, and after the turn the history shows your message under that turn; after the commanders consult, their messages appear without clicking anything; expand, scroll up, wait for a new message, and the view does not jump.

---

## Phase 7 — When the Panel Shows

The panel hides during a turn update and the overlays, and an observer gets a read-only panel.

**Add:** `src/renderer/chat/chatPanelVisibility.ts`
**Edit:** `src/shared/chatPanelState.ts`, `src/shared/chatPanelState.test.ts`, `src/renderer/chat/chatPanel.ts`, `src/renderer/gameplay/selectionPanel.ts`, `src/renderer/openRouter/openRouterUiHelpers.ts`, the renderer files that assign `S.resolutionMoveAnimation`, `static/chatChrome.css`, `src/main/rendererChatPanelContracts.test.ts`, `doc/ux/chat-panel.md`, `doc/ux/modes-and-transitions.md`, `doc/ux/resolution-playback.md`

### Steps

1. **The overlay is handled in CSS.** New game and Game over are one element, `#game-over-overlay`. `static/selectionChrome.css` already hides the selection panel with `body:has(#game-over-overlay:not(.hidden)) #selection-panel`. Add the same rule for `#chat-panel` in `chatChrome.css`. Script handles the other causes.

2. `chatPanelState.ts`:

   ```ts
   export function chatPanelShouldShow(input: {
     readonly matchLoaded: boolean;
     readonly playbackRunning: boolean;
     readonly mapToastShowing: boolean;
   }): boolean
   // True only when a match is loaded and the other two are false.
   ```

   `chatPanelVisibility.ts`: `export function syncChatPanelVisibility(): void` reads the three inputs and sets the panel's `hidden` attribute.
   - `matchLoaded`: `S.gameState` has seats.
   - `playbackRunning`: `S.resolutionMoveAnimation != null`.
   - `mapToastShowing`: `#map-toast` does not have the class `hidden`.
   - When the panel becomes hidden while the text field has focus, blur the field. Text in the field and the staged message are kept.
   - After changing `hidden`, call `layoutMapChrome()`.
3. Call `syncChatPanelVisibility()`:
   - In `openRouterUiHelpers.ts`: at the end of `showMapToast` and at the end of `hideMapToast`. This covers "until the update dialog either times out or is closed", because both paths end in `hideMapToast`.
   - Where `S.resolutionMoveAnimation` is assigned (search `src/renderer` for `resolutionMoveAnimation = `; there were five sites when this plan was written): after each assignment. Record the sites in the Completion Log.
   - At the end of `renderChatPanel()`.
   - Replace the temporary line from Phase 4 that removed `hidden`.

   If any of these files would import `chatPanelVisibility.ts` in a way that `check:circular` reports, register the function as a callback instead, the way `setAiStrategyToastHiddenListener` works.
4. **Observer.** `data-can-send="false"` already hides the entry controls and shows the title (Phase 4 CSS). Confirm that in that state the staged row is never shown, and that the bar still has the expand control.
5. Docs: finish `doc/ux/chat-panel.md` (Availability and States). Add the panel to the tables in `doc/ux/modes-and-transitions.md` and to `doc/ux/resolution-playback.md` (hidden while playback runs and while the turn-update toast shows).

### Tests

- `chatPanelState.test.ts`: `chatPanelShouldShow` is true for the one all-clear case and false for each of the three single-cause cases.
- `rendererChatPanelContracts.test.ts`: `static/chatChrome.css` contains `body:has(#game-over-overlay:not(.hidden)) #chat-panel`.
- `rendererChatPanelContracts.test.ts`: `openRouterUiHelpers.ts` calls `syncChatPanelVisibility` (or its registered callback) inside both `showMapToast` and `hideMapToast`. Use `getFunctionSource` to check each function body.

### Verification

Run the Verification Bar and `npm run ui:smoke`. Then run the app: press Ready, and the panel disappears when playback starts and returns only after the turn-update toast is dismissed or times out; an error toast hides it while it shows; it is hidden on the New game and Game over overlays; in an Observe match the bar shows `Messages` and the chevron only, and expanding shows every side's messages.

---

## Phase 8 — Polish Pass

One pass over the things that are easy to get slightly wrong.

**Add:** nothing.
**Edit:** `static/chatChrome.css`, `src/renderer/chat/chatPanel.ts`, `scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`, `doc/ux/chat-panel.md`

### Steps

1. **Narrow maps.** With the console open on a small window, the panel must stay inside the map, the text field must keep at least 80 px, and the drop-down must shrink with an ellipsis before the field does. Fix with CSS `min-width` and `flex` values only.
2. **Long names.** A long nickname in the drop-down or a history row ends in an ellipsis or wraps. It never widens the panel.
3. **Focus order.** Tab moves expand → drop-down → field → send, then edit and cancel when the staged row shows. Every button has a visible focus ring matching the selection panel's.
4. **Pointer.** A click, a wheel turn, or a drag that starts on the panel does not reach the map. Read how the selection panel stops map gestures (search `src/renderer` for `selection-panel` beside `pointerdown` or `wheel`) and do the same for `#chat-panel`. The wheel scrolls the history when it can scroll.
5. **Hex tooltips.** The selection panel hides hex tooltips when the pointer enters it (see `doc/ux/hex-tooltips.md`). Do the same for the chat panel, in the same place.
6. **Smoke check.** Add one check to `ui-smoke-map-chrome-checks.cjs`, in the style of its neighbors, named `chat-panel-bottom-right`: when `#chat-panel` is not hidden, its right edge is 12 px in from the map's right edge and its bottom edge is above the scale.
7. Record each fix in `doc/ux/chat-panel.md` where it is a rule a reader needs.

### Verification

Run the Verification Bar and `npm run ui:smoke`. Then run the app and try each of the six items.

---

## Phase 9 — Remove the Single-Message Plumbing

The `message` fields that carried the taunt are deleted from end to end. This phase changes no behavior. If it fails, revert it. Everything before it still works.

**Add:** nothing.
**Edit:** every file the compiler names. The starting points are listed below.

### Steps

Work from the source outward, building after each step (`npm run build:main`, then `npm run check:renderer-types`).

1. `src/shared/commanderStatus.ts`: remove `message` from `CommanderDispatch`.
2. `src/main/openRouter/commanderPoolSupport.ts`: remove `message` from `CommanderConsultOutcome`. In `commanderPool.ts`, delete `messageToHumanFrom` and its use.
3. Remove `message` from `RequestAiOrdersResult` (`src/shared/ipc/openRouterTypes.ts` or wherever it is defined), `AfterResolutionResult`, `AfterTacticalBeatResolutionResult`, and the request-orders flow types.
4. Remove `aiMessage`, and `message` where it means the commander's message, from the IPC result and push types: `src/shared/ipc/readyTypes.ts`, `src/shared/ipc/consultationPushTypes.ts`, `src/shared/ipc/gameApiTypes.ts`, `src/main/gameActions/gameActionsTypes.ts`. Then the helpers that pass them along: `optionalConsultToastFields` and `strategicConsultFields` in `readyIpcResolutionMapping.ts`, `handleGameReady` in `gameIpcHandlers.ts`, `meleeInterceptResolveIpc.ts`, and `deferredResolutionPlaybackConsult.ts`.
5. Renderer: `AiStrategyToastFields.message` in `src/shared/aiStrategyToastContent.ts`, the tab's `message` in `src/shared/commanderMessageTabs.ts`, the first parameter of `commanderDispatchHasProse`, and every reader the type check names.
6. **Be careful with the word.** Many things are legitimately called `message`: error messages, toast messages, chat-completion messages, log messages. Remove a field only when its comment or its source says it is the commander's message to the player, or the taunt. When unsure, leave it and list it in the Completion Log.
7. **Search gate.** `rg -n -i "taunt|aiMessage" src` must return nothing. `rg -n "messageToHumanFrom" src` must return nothing.
8. Update the tests that fail because a field is gone. Do not delete a test that still checks something else.

### Verification

Run the Verification Bar and `npm run ui:smoke`. `check:renderer-types` must show no new error. Then run the app once and confirm the message dialog still shows Messages bullets and Strategy.

### If verification fails

- The renderer type check shows errors in files you did not touch: a shared type lost a field that something unrelated reads. Restore that one field and list it.
- More than thirty files change: stop and re-read step 6. A legitimate `message` was probably removed.

---

## Phase 10 — Docs, Final Verification, and Hand-Off

**Add:** nothing.
**Edit:** `doc/commander-messages.md`, `doc/how-to-play.md`, `doc/ux-specification.md`, `doc/ux/input-map.md`

### Steps

1. `doc/commander-messages.md`: add a section on what the player sees and can do: the dialog's bullets, the chat panel, staging and when a staged message is sent, and the fog-of-war rule with its consequence stated plainly (with fog of war off, the player reads the commanders' messages to each other, and the commanders cannot read the player's messages to others).
2. `doc/how-to-play.md`: add a short section on messages for a player, in that document's voice, and remove any mention of the + and − buttons.
3. `doc/ux/input-map.md`: confirm it lists Enter in the chat field, and that it no longer mentions the + and − buttons.
4. `doc/ux-specification.md`: confirm `chat-panel.md` is in the index and in the table that tells a reader where to look.
5. Run `node scripts/check-doc-links.cjs` if the repo uses it, and fix links in the files this plan touched.
6. If the repo's documentation screenshots show the bottom-right of the map, tell the user that `npm run doc:shots` should be rerun. Do not run it yourself unless Phase 0 showed it works on this machine.
7. Search the whole diff for plan vocabulary and remove it: `git diff | Select-String -Pattern 'Phase \d|dispatches-3|execution plan|locked decision' -CaseSensitive:$false`. Nothing under `src/`, `static/`, or `doc/` may match.
8. Run the Verification Bar and `npm run ui:smoke` one last time.
9. Fill in the Completion Log.
10. In your final message, name every document you updated, as `AGENTS.md` requires.

### Manual checklist for the user

Give the user this list in your final message, along with the six decisions listed under "Decisions this plan makes where the guidance was silent".

1. **Fog on, playing.** Start a match with fog of war on and three AI sides. Write to one side and press Ready. Expect your message in the history under that turn, and replies only from sides that wrote to you. Expect the dialog's Messages bullets to list only `To You: …`.
2. **Fog off, playing.** The same match with fog of war off. Expect the history and the bullets to include messages between the AI sides.
3. **Observe.** Expect no entry line, and every message in the history.
4. **Staging.** Stage a message to two different sides. Switch the drop-down and expect the staged row to follow it. Edit one and cancel the other. Save, load, and expect the remaining staged message to still be there.
5. **Turn update.** Press Ready. Expect the panel to disappear and to return only when the turn-update toast is gone.
6. **Battle.** Stage a message during a tactical battle and commit the beat. Expect it under the current turn with `(battle)`.
7. **Keys.** Type `wasdt` in the field. Expect the map not to move.
8. **Zoom.** Expect no + and − buttons, and the wheel to zoom as before.
9. **A reply arrives.** Write to a side that the game would not otherwise consult this turn. Expect that side to be consulted (its status shows planning) and, a turn or so later, a reply.

---

## Reliability Checklist

Check each item before you mark a phase complete:

- [ ] The phase's files were backed up before the first edit.
- [ ] Every rule that can be wrong is a pure function under `src/shared` with a test.
- [ ] Message text reaches the DOM only through `textContent`. No `innerHTML` anywhere in `src/renderer/chat/` or in the dialog's bullet code.
- [ ] The renderer never receives a message the viewer may not see. The filter is in the main process.
- [ ] No timer or poll was added for the chat panel.
- [ ] Every surface changed has its `doc/ux/` document updated in the same phase.
- [ ] Every new function, type, interface, field, and constant has a full orienting comment that describes behavior and is not generic filler.
- [ ] `npm run check:renderer-types` shows no new error, and no baseline file was edited.
- [ ] `npm run check:circular` shows only the baseline cycles.
- [ ] No commit, push, stash, checkout, restore, reset, or clean was run.
- [ ] No plan vocabulary appears in `src/`, `static/`, or `doc/`.

## Success Definition

- The message dialog shows a Messages section with one `To <flag> <nickname>: <message>` bullet per visible message, in side order.
- The + and − buttons are gone, and the chat panel sits at the map's bottom-right, collapsed at start, the same width as the message dialog.
- A player can pick a side, stage a message with Enter or the send button, edit it, cancel it, and see it sent after Ready or a beat commit.
- Expanded, the panel shows every visible message by turn, and it updates when commanders speak and when the player's messages are sent.
- Visibility follows fog of war for a player, and an observer sees everything and cannot write.
- The panel is hidden during resolution playback, while the map toast shows, and on the New game and Game over overlays.
- No `message` or `aiMessage` field that carried the taunt remains.
- The Verification Bar and `ui:smoke` pass.

---

## Phase 0 Inventory

| Item | Value |
|------|-------|
| `git status --short` | |
| `npm test` | |
| `npm run build:renderer` | |
| `npm run ui:smoke` | |
| `check:circular` cycle list | |
| Talk stage prerequisite | |
| Missing symbols | |

## Defect Inventory

| Phase | Command | First error | Action taken |
|-------|---------|-------------|--------------|

## Completion Log

| Phase | Result | Sketch differences | Files changed outside the Add/Edit lists | Docs updated | What you saw in the running app |
|-------|--------|--------------------|-------------------------------------------|--------------|---------------------------------|
