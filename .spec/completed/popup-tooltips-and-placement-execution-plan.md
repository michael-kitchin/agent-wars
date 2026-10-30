# Popup Tips and Placement

Hand-off: when this plan is accepted, save this body to [`.spec/popup-tooltips-and-placement-execution-plan.md`](.spec/popup-tooltips-and-placement-execution-plan.md). That save is not permission to implement the phases.

Audience: a lower-quality coding agent. Implement one phase at a time. Stop after each phase and report the files touched, the test command, and its result. Do not commit. Do not start the next phase until the human says to.

If a line in the plan disagrees with the code, trust the code, stop, and report the discrepancy. Do not invent a sentence, a pixel margin, or a second tooltip system. Do not put phase names, or any other plan label, into code, comments, configuration, or docs. Every new exported function gets an orienting comment in the shape used by [`src/shared/popoverPlacement.ts`](src/shared/popoverPlacement.ts): Purpose, When to use, Expected outcome, Exceptions. These modules are not backend code. Do not add a logger. Shared modules must not import the renderer. Do not change what any button or select does, only its tip and, in Phase 2, where the popup sits. [`src/renderer/gameplay/buildQueuePopup.ts`](src/renderer/gameplay/buildQueuePopup.ts) is already about 776 lines. Add only the calls this plan names. If a file would pass 1000 lines, stop and report.

## Locked decisions

- The unit popup is the stack callout (`#stack-callout` in [`src/renderer/map/stackCallout.ts`](src/renderer/map/stackCallout.ts)). The selection panel is out of scope.
- The multi-hex build editor uses the same `#build-popup` and the same placement rules.
- Dropdown tips stay on the closed native `<select>`, through the existing `data-control-tooltip` attribute and [`src/renderer/chrome/controlTooltip.ts`](src/renderer/chrome/controlTooltip.ts). The tip still hides while the native list is open. Do not build a custom menu.
- When the select's value is empty, the tip is the existing how-to sentence. When it has a value, that sentence is replaced by the item sentence below. Do not append the two. A multi-hex type list almost always has a value, so its tip becomes the item sentence. The "every selected hex" instruction stays on the empty-value sentence and on the add and count tips that already say it.
- Build and hire type lists usually already have a value, so the player usually sees the item sentence. The empty sentence still has to be wired for a blank value.
- Sealift slot lists already have a how-to tip. Do not give them an item sentence. Flags keep the Bonuses tooltip and get no control tip.
- The popup's box is the game window (`window.innerWidth` and `window.innerHeight`), with no extra margin. It may cover the top bar, console, or minimap. It may not cross the window edge unless it is taller or wider than the window, in which case it sits flush with the top and left and the overflow stays clipped.
- Preferred position stays today's click plus `TOOLTIP_OFFSET_PX` (12). Shift only as far as needed. Do not reuse [`placeBelowAnchor`](src/shared/popoverPlacement.ts); that helper flips around a button and keeps an 8 px margin.
- Reposition from the original click stored in `data-x` and `data-y`, never from the popup's current `left` and `top`. Calling place twice with the same anchor and size must yield the same point. A missing or blank attribute is not an anchor. `Number(null)` is `0`, so a missing attribute must no-op rather than slide the popup to the corner.
- While a popup is already open, do not add or remove `hidden`, and do not set `display` or `visibility`, in order to measure or move it. `getBoundingClientRect` forces layout, so call it in the same turn as the DOM write and do not defer it with `requestAnimationFrame`. Do not place from a `finally`. A discarded async render must not place. Do not add a resize listener. Do not place while the popup has class `hidden`: a hidden element measures as 0 by 0.

## Item sentences

Use these characters exactly. `queueItemTooltipText(value: string): string | null` lives in a new [`src/shared/queueItemTooltipText.ts`](src/shared/queueItemTooltipText.ts). Store the sentences in a `Record<BuildQueueItemType, string>` so a new queue item fails the compile until it has a sentence. Return `null` unless `isBuildQueueItemType` from [`src/shared/ipc/productionTypes.ts`](src/shared/ipc/productionTypes.ts) accepts `value`. Do not cast.

- `infantry`: `The cheapest unit. It cannot shoot on the world map, and it can shoot in a battle.`
- `armor`: `Costs more than infantry, shoots one hex on the world map, and cannot enter mountains, wetlands, or arctic.`
- `naval`: `Needs a seaport, shoots two hexes on the world map, and can carry land units.`
- `air`: `Strikes from an airport and does not march. A hex needs an airport to build it.`
- `missile`: `Launches once on the world map and is then gone. It cannot fire in a battle.`
- `fortification`: `Protects one city cell. It is not a unit, and a hit removes it before a unit.`
- `credits`: `Adds 20 credits to the treasury. It is not a unit and does not count toward a unit cap.`

Empty-value sentences stay the constants that already exist:

- single-hex type: `buildTypeTooltipText`
- multi-hex type: `multiBuildTypeTooltipText`
- hire type: `hireTypeTooltipText`

## Other new sentences

Put these in a new [`src/shared/popupControlTooltipText.ts`](src/shared/popupControlTooltipText.ts). Controls that already have a tip keep that sentence.

- Build and hire close, including the hire-failure close and the multi-hex load-failure close: `Close this popup.`
- Single-hex queue remove: `Remove this row from the queue.`
- Multi-hex queue remove: `Remove this row on every selected hex.`
- Build tab: `Show the build queue for this hex.`
- Hire tab: `Show hiring for this hex.`
- Stack close: `Close this list.`
- Stack row toggle, unit not selected: `Select only this unit and close the list. Shift toggles it and leaves the list open.`
- Stack row toggle, unit selected: `Remove this unit from the selection and close the list. Shift toggles it and leaves the list open.`
- `+ All` without Shift: `Select every unit you can select in this hex and close the list.`
- `+ All` with Shift: `Add every unit you can select in this hex. The list stays open.`
- `- All`: `Remove every unit you can select in this hex. The list stays open.`

## Placement contract

New [`src/shared/anchoredPopupPlacement.ts`](src/shared/anchoredPopupPlacement.ts):

```ts
export function placeAnchoredPopup(args: {
  readonly anchorX: number;
  readonly anchorY: number;
  readonly popupWidth: number;
  readonly popupHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly offsetPx: number;
}): { readonly left: number; readonly top: number }
```

`preferredLeft = anchorX + offsetPx`, `preferredTop = anchorY + offsetPx`. Then clamp each axis into `0 .. max(0, viewport - size)`. A popup larger than the window gets `0` on that axis.

Renderer wrapper [`src/renderer/chrome/placeAnchoredPopup.ts`](src/renderer/chrome/placeAnchoredPopup.ts): `placeAnchoredPopupElement(popup, anchorX, anchorY)`. If the popup has class `hidden`, return without writing. Otherwise measure `getBoundingClientRect()`, call the shared function with `TOOLTIP_OFFSET_PX` and `window.innerWidth` / `window.innerHeight`, and set `style.left` and `style.top`. No other style or class changes. `#build-popup` and `#stack-callout` are `position: fixed` inside `#canvas-container`, which has no transform, so those coordinates match the window.

A second function in the same file, `placeOpenPopupFromDataAttributes(popup)`, reads `data-x` and `data-y`. If either attribute is missing, blank, or not a finite number, return without writing.

## Phase 1 — Placement math

Create the shared function and [`src/shared/anchoredPopupPlacement.test.ts`](src/shared/anchoredPopupPlacement.test.ts). Orienting comments match [`src/shared/popoverPlacement.ts`](src/shared/popoverPlacement.ts). No DOM, no logger.

Tests, offset 12:

- Anchor `(100, 80)`, popup `200×150`, window `1200×800` stays at `(112, 92)`.
- Anchor `(1100, 80)`, popup `200×150`, window `1200×800` shifts left to `(1000, 92)`.
- Anchor `(100, 700)`, popup `200×150`, window `1200×800` shifts up to `(112, 650)`.
- Anchor `(1100, 700)`, popup `200×150`, window `1200×800` shifts to `(1000, 650)`.
- Anchor `(100, 80)`, popup `200×900`, window `1200×800`: `left` is `112` and `top` is `0`.
- Anchor `(100, 80)`, popup `1400×150`, window `1200×800`: `left` is `0` and `top` is `92`.
- Anchor `(100, 80)`, popup `1400×900`, window `1200×800`: `left` is `0` and `top` is `0`.
- Anchor `(-20, -20)`, popup `200×150`, window `1200×800`: `left` is `0` and `top` is `0`.
- Calling it twice with the same arguments returns the same `left` and `top`.

Run: `node --test src/shared/anchoredPopupPlacement.test.ts`. Expected: all pass. Stop.

## Phase 2 — Move the open popups

Add the renderer wrapper. Look up `#build-popup` for the build and hire paths. Look up `#stack-callout` for the stack paths. Call `placeOpenPopupFromDataAttributes` only after this invocation has changed that popup's DOM, and before the next `await`.

`renderBuildQueueIntoMount` in [`src/renderer/gameplay/buildQueuePopup.ts`](src/renderer/gameplay/buildQueuePopup.ts):

- The multi-hex branch only awaits `renderMultiBuildQueueIntoMount`. Do not place after that await. The multi function places itself.
- Do not place on the missing-API return or on the stale, missing-snapshot, or wrong-hex return. Those returns happen before `mount.innerHTML = ''`.
- Do place immediately after the not-controlled paint, after the cannot-build paint, and after the normal queue paint. Each of those appends `section` and then returns or ends.

`renderMultiBuildQueueIntoMount` in [`src/renderer/gameplay/buildQueueMultiPopup.ts`](src/renderer/gameplay/buildQueueMultiPopup.ts): place after the load-failure paint and after the successful paint. Do not place on a return that happens before `deps.mount.innerHTML = ''`.

`renderHirePanel` in [`src/renderer/gameplay/hirePanel.ts`](src/renderer/gameplay/hirePanel.ts): place only when `panel.hidden` is false. A hidden hire panel must not place while the Build tab is still empty during the build fetch. That empty shell is what would jump and then jump again.

`show` in [`src/renderer/gameplay/buildHirePopup.ts`](src/renderer/gameplay/buildHirePopup.ts) does not place. The opening call runs just after `mount.innerHTML = ''`, while the panels are still empty, and a place there would jump the shell and then jump it again when the queue arrives. The Build and Hire click listeners call place after `show`, because both panels already have content and hiding one of them changes the height. Do not place anywhere in `renderBuildOrHirePopupIntoMount` before `await deps.renderBuildPanel`. The build-only and multi-hex returns are painted by `renderBuildQueueIntoMount`.

`showStackCallout` in [`src/renderer/map/stackCallout.ts`](src/renderer/map/stackCallout.ts): the list is already in the DOM. Remove `hidden`, then place. Keep the existing `left` and `top` assignment so the first paint is near the click. The later call corrects it. Do not hide the element between those writes.

`renderSealiftSection` in [`src/renderer/map/stackCalloutSealift.ts`](src/renderer/map/stackCalloutSealift.ts): place after each `removeSealiftSection` that actually runs (no hex, no API, and `showSealiftSection` false), and after `appendChild(section)`. Do not place on a generation, hidden, or wrong-hex return that leaves the DOM alone. The append happens after the first place in `showStackCallout`, so this second place is what keeps a tall sealift section inside the window.

Do not insert an `await` between clearing a mount and appending its new children. Leave the stored `data-x` and `data-y` as the click point.

Document the window rule in [`doc/ux/build-popup.md`](doc/ux/build-popup.md), [`doc/ux/multi-hex-build-popup.md`](doc/ux/multi-hex-build-popup.md), and [`doc/ux/stack-callout.md`](doc/ux/stack-callout.md), and name `placeAnchoredPopup` in each Code Entry Points section. The popup opens `TOOLTIP_OFFSET_PX` below and to the right of the click, then shifts so it stays inside the window. A popup larger than the window stays at the top-left and may still be clipped. Growing the queue, switching Build and Hire, or appending or removing sealift moves it again without hiding it.

Run the Phase 1 test again. Then search the repo for `placeOpenPopupFromDataAttributes` and confirm the call sites above are the ones that exist. Stop.

## Phase 3 — Dropdown sentences

Create `queueItemTooltipText` and [`src/shared/queueItemTooltipText.test.ts`](src/shared/queueItemTooltipText.test.ts). Assert every sentence above. Assert `null` for `''` and for `'not-a-type'`.

Add `syncQueueItemSelectTooltip(select, emptyText)` in [`src/renderer/chrome/syncQueueItemSelectTooltip.ts`](src/renderer/chrome/syncQueueItemSelectTooltip.ts). It sets `data-control-tooltip` to `queueItemTooltipText(select.value) ?? emptyText`.

Call it after the value is assigned, and at the start of each type-select `change` listener, in:

- the single-hex type select in `buildQueuePopup.ts` (`buildTypeTooltipText`)
- the multi-hex type select in `buildQueueMultiPopup.ts` (`multiBuildTypeTooltipText`)
- the hire type select in `hirePanel.ts` (`hireTypeTooltipText`)

Also call it from `restoreRejectedBuildQueueControls` when that function puts the previous type back.

In [`doc/ux/control-tooltips.md`](doc/ux/control-tooltips.md), replace the Single-hex type, Multi-hex type, and Hire type sentences with the empty-versus-selected rule, and name `queueItemTooltipText` in Source Anchors. The Hire type row in that file currently points at `hireTypeTooltipText` only. Say that constant is the empty-value sentence.

Run: `node --test src/shared/queueItemTooltipText.test.ts`. Expected: pass. Stop.

## Phase 4 — Remaining controls

Create `popupControlTooltipText.ts` with the button sentences above. A test file asserts those exact strings.

Set `data-control-tooltip` from those constants, not from a copied string, on:

- The single-hex close button in `renderBuildQueueIntoMount`. It is created once, before the not-controlled and cannot-build returns, so those paints already include it.
- Both multi-hex close buttons in `renderMultiBuildQueueIntoMount`: the load-failure one and the success one.
- The hire close button in `closeRow` in `hirePanel.ts`.
- The hire-failure close button in `renderHireFailure` in `buildHirePopup.ts`.
- The single-hex remove button and the multi-hex remove button.
- Both tab buttons. `tabButton` must choose the sentence by comparing the label with `BUILD_TAB_LABEL` and `HIRE_TAB_LABEL`. Do not introduce a second copy of those words.
- The stack close button, the no-Shift `+ All` button, and the Shift `+ All` and `- All` buttons in `showStackCallout`.
- The per-unit toggle, both where `showStackCallout` creates it and inside `applyStackCalloutSelectionButtonVisibility` in [`src/renderer/map/stackCalloutSelectionToggles.ts`](src/renderer/map/stackCalloutSelectionToggles.ts). Choose the sentence from whether that unit is selected, the same condition that chooses the glyph.

Do not add a tip to a unit flag, a sealift control, or any control that already has one. A toggle with `visibility: hidden` can keep the attribute. It does not receive the pointer.

`onStackSingleUnitToggleClick` closes the list on a plain click whether or not the unit was selected. The selected-row sentence says that. In [`doc/ux/stack-callout.md`](doc/ux/stack-callout.md), the Inputs sentence must say a plain click on a selected row removes that unit and closes the list. Do not change the click handler.

Update [`doc/ux/control-tooltips.md`](doc/ux/control-tooltips.md): add the new sentences, delete the build-popup close, queue remove, stack close, and stack selection controls from "Controls with no tip", and fix the invariant that says those controls never show a tip. Name `popupControlTooltipText.ts` in Source Anchors. Point the stack-callout and both build-popup docs at the new sentences.

Run: `node --test src/shared/popupControlTooltipText.test.ts` and `node --test src/shared/anchoredPopupPlacement.test.ts src/shared/queueItemTooltipText.test.ts`. Expected: pass. Stop.

## Out of scope

- Custom dropdown menus, option-hover tips, and changes to when a tip hides.
- The selection panel, map markers, and sealift sentence text.
- Changing click, selection, queue, or hire behavior. The selected-row doc edit records what the handler already does.
- Following window resize while a popup is open.
- Rewriting [`doc/how-to-play.md`](doc/how-to-play.md). The tooltip and placement requirements live in the UX docs named above.
- Commits.
