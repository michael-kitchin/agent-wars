# Input Map

Global mouse and keyboard bindings. Element documents own the response once an input is delivered to that element.

## Purpose

Tell an agent which input does what, and which binding wins when two surfaces could handle the same key.

## Mouse

| Input | Context | Result | Details In |
| --- | --- | --- | --- |
| Drag | Main map | Pans the map. | [map-surface.md](map-surface.md) |
| Wheel | Main map | Zooms the map. | [map-surface.md](map-surface.md) |
| Click | Main map | Selects, targets, or opens a popup, depending on what is under the pointer. | [selection-model.md](selection-model.md) |
| Double-click | Main map | Plans a march or ferry, or clears the selection. Map zoom-on-double-click is off. | [order-lifecycle.md](order-lifecycle.md) |
| Right-click | Main map | Clears selection chrome and does not open the browser menu. Queued orders stay. | [selection-model.md](selection-model.md) |
| Click, drag, wheel, double-click | Minimap | No pan, zoom, or click-to-recenter. The minimap only shows the current view. | [minimap.md](minimap.md) |
| Click | Tactical battles list backdrop | Chooses Ignore. | [tactical-battles-list.md](tactical-battles-list.md) |
| Click | Toast dismiss | Hides that toast. | [notifications-and-feedback.md](notifications-and-feedback.md) |

## Keyboard

| Input | Context | Result | Details In |
| --- | --- | --- | --- |
| W, A, S, D, and the arrow keys | Not typing in a field, and no Shift, Control, Alt, or Meta | Pans the map. Holding a key keeps panning. Opposite keys cancel. W and Up are the same direction and can be held together. | [map-surface.md](map-surface.md) |
| T | Same as pan | Hides terrain fill while held, then restores it on release. | [map-surface.md](map-surface.md) |
| Shift | Key down or up | Closes modifier-driven popovers. Shift-click on the map toggles selection. | [selection-model.md](selection-model.md) |
| Escape | Build popup open | Closes the build popup and does not also close the stack callout. | [build-popup.md](build-popup.md) |
| Escape | Stack callout open, build popup closed | Closes the stack callout, including one that is scheduled but not open yet. | [stack-callout.md](stack-callout.md) |
| Escape | Tactical battles list open | Chooses Ignore and does nothing else. | [tactical-battles-list.md](tactical-battles-list.md) |

Keys other than these do not pan, toggle terrain, or close popups.

## Precedence and Focus

- When the key target is a text field, a text area, a dropdown, or other editable content, T and the pan keys do nothing, and pressing Shift does not refresh an open stack callout. Escape is handled before that check, so it still closes the build popup or the stack callout, and it still chooses Ignore on the tactical battles list. That includes Escape pressed inside the build popup's count field.
- Focusing an editable field stops keyboard pan immediately. Releasing a pan key still stops that key even if focus moved into a field after the key went down.
- Window blur stops keyboard pan, clears the held-Shift flag, and restores terrain fill if T was held.
- Hiding the window stops keyboard pan.
- Holding Shift, Control, Alt, or Meta stops keyboard pan and does not start a new pan.
- Key repeat does not start another pan or another terrain hold.
- Escape closes the build popup before the stack callout. While the tactical battles list is open, Escape only chooses Ignore. A build popup or stack callout under the dialog stays as it is. The current code differs; see Known Deviations in [tactical-battles-list.md](tactical-battles-list.md).
- Holding T to hide terrain fill is a deliberate inspection gesture. It is hold-to-hide, not a toggle.
- The map's own keyboard handling is off, so the pan keys above are the only keyboard pan.

## Strategic and Tactical Differences

Pan, zoom, T, and Escape use the same bindings in both theaters. In Tactical planning, a map click outside the battle area shows an error toast and does not select or order. See [modes-and-transitions.md](modes-and-transitions.md).

## Invariants

- Control, Alt, and Meta never pan the map and never toggle unit selection.
- Right-click on the map never opens the browser context menu.
- Double-click on the map never zooms.
- Keyboard pan never continues after blur, after the window is hidden, or after focus enters an editable field.

## Open Questions

None.

## Code Entry Points

- `src/renderer/map/initCore.ts`
- `src/renderer/map/mapKeyboardPan.ts`
- `src/renderer/map/mapHelpers.ts`
- `src/renderer/map/mainMapInteractions.ts`
- `src/renderer/map/worldLeafletMap.ts`
- `src/shared/mapKeyboardPanLogic.ts`
- `src/renderer/gameplay/meleeInterceptModal.ts`
- `src/renderer/openRouter/openRouterControls.ts`
