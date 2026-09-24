# Order Lifecycle

How a player drafts, previews, commits, and cancels an order.

## Purpose

Separate queued orders from the selection and from resolution playback, so a change to one does not silently drop the others.

## Order Kinds

### March

When the player double-clicks a destination with a non-air selection, and targeting is off, the selection plans a grouped march. If every selected unit is already on that hex and the click missed unit icons, the selection clears instead. A mixed air and non-air selection is rejected and shows an error toast.

### Ferry

When the player double-clicks with an all-air selection, the game checks whether a ferry is legal. A legal ferry is queued. An illegal ferry on empty ground clears the selection. An illegal ferry on a unit icon shows an error toast and keeps the selection. Legality is in the [combat rules](../combat-rules-v3.md).

### Ranged attack

When Ranged targeting is on, a click on a hex validates the target for every selected unit. Success queues one ranged attack per selected unit, turns targeting off, and clears the selection. Failure shows an error toast, queues nothing, and leaves targeting on so the player can pick another hex. Cancel turns targeting off.

### Air strike

When Strike targeting is on, a click validates the target and the chosen target type: Enemy Units, Production, Airports, or Seaports. Success queues the strikes, turns targeting off, and clears the selection. Failure shows an error toast, queues nothing, and leaves strike targeting on, the same as a failed ranged click.

### Sealift

Sealift embark and debark are not draft orders. They apply immediately from the stack callout in both theaters, never appear in a pending list, and do not wait on Ready. See [stack-callout.md](stack-callout.md).

### Build

Build orders are queue rows on a hex, not map double-clicks. See [build-popup.md](build-popup.md).

## Lifecycle

- Draft: the order sits in a pending list on the right panel. Movement orders, ranged attacks, and air strikes are separate lists. Ferries are listed with movement orders in both theaters, with the same select and cancel controls.
- Hover preview: while units are selected and the pointer is over a legal destination, the map draws a preview of the route or shot. The preview is dropped when the selection changes, when targeting turns off, when Ready finishes, and when a newer pointer position supersedes it. A preview that started before targeting turned off must not appear after the button has changed.
- Commit: Ready submits pending ranged attacks, air strikes, and ferries, then resolves the turn. A tactical Ready submits marches, ranged attacks, air strikes, and ferries for the current beat. A successful grouped march or ferry commit clears the draft selection immediately, before Ready.
- Pending list: each row can select its unit and cancel that order. Cancel removes that order only.
- Resolution: after a successful Ready, queued drafts that were submitted are cleared. Tactical march continuations can come back as pending movement for the next beat. Playback then animates the resolved turn. See [resolution-playback.md](resolution-playback.md) and [modes-and-transitions.md](modes-and-transitions.md).

## Rejected Orders

- An illegal target or an illegal double-click shows a map toast marked as an error. The toast text is the validation reason when one is returned.
- A failed Ready or a failed tactical commit shows an error toast and leaves the drafts in place.
- Errors reported to the sidebar, such as a failed Ready or a failed tactical commit, use the map toast only. The sidebar error line stays hidden. See [notifications-and-feedback.md](notifications-and-feedback.md).

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Movement draft | Standing movement orders, plus double-click march | Pending marches for the current beat, including continuations after Ready |
| Sealift | Applied immediately from the stack callout | Applied immediately from the stack callout |
| Ferry list | Shown with movement orders | Shown with movement orders |
| Stash | Drafts are stashed when a battle starts and restored afterward, minus dead units | Drafts are cleared on exit |
| Ranged types | Infantry does not offer Ranged | Infantry does offer Ranged |
| Ready | Resolves the strategic turn and may open the tactical battles list | Commits one battle beat |

## Invariants

- A rejected order never replaces a queued order of the same kind for that unit unless the player successfully commits a new one.
- Right-click never cancels queued orders.
- Entering a tactical battle never deletes strategic drafts. It hides them until the battle ends.
- Starting a new match clears drafts and discards the stash.
- A rejected Ranged or Strike target click never turns targeting off. Targeting turns off only on Cancel, a successful target, right-click, a selection that can no longer fire, or entering a battle.
- Every queued order that Ready will submit is visible in a pending list.
- Sealift assignment is never a pending order.

## Open Questions

None.

## Code Entry Points

- `src/renderer/gameplay/tacticalOrders.ts`
- `src/renderer/gameplay/gameApiHumanOrderPreview.ts`
- `src/renderer/gameplay/hoverRoutePreviewRefresh.ts`
- `src/renderer/gameplay/hoverRoutePreviewStale.ts`
- `src/renderer/gameplay/hoverRoutePreviewGroupedTargeting.ts`
- `src/renderer/gameplay/formatTargetingValidationReason.ts`
- `src/renderer/gameplay/orderLabelFormatting.ts`
- `src/renderer/map/mainMapInteractions.ts`
- `src/renderer/map/mapDoubleClickHandler.ts`
- `src/renderer/tactical/tacticalPendingMarchPath.ts`
- `src/renderer/tactical/tacticalDraftMarchOverlay.ts`
- `src/renderer/tactical/tacticalEmbarkSealiftMerge.ts`
- `src/shared/mapPlanningGesture.ts`
