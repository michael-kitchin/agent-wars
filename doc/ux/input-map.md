# Input Map

Global mouse and keyboard bindings. Element documents own the response once an input is delivered to that element.

## Purpose

Tell an agent which input does what, and which binding wins when two surfaces could handle the same key.

## Mouse

| Input | Context | Result | Details In |
| --- | --- | --- | --- |
| Drag | Main map | Pans the map. | [map-surface.md](map-surface.md) |
| Shift-drag | Main map | Draws a box and zooms the map to fit it. It does not pan or select. | [map-surface.md](map-surface.md) |
| Wheel | Main map | Zooms the map. While the pointer is over the update toast, the wheel still zooms unless that toast can still scroll in that direction, in which case the wheel scrolls the toast. | [map-surface.md](map-surface.md) |
| Click | + or − at the main map's bottom-right | Zooms the main map by `zoomDelta` (half a level). It does not select or order. While the update toast covers those buttons, the click hits the toast. While the new-game overlay is open, the toast takes no pointer input, so the click still zooms. | [map-surface.md](map-surface.md) |
| Click | Main map | Selects and opens map popups. A plain click on one stationary selectable human unit's icon sole-selects that unit and starts movement planning, and does not open the unit list. Hovering that icon shows the Bonuses tooltip and does not open the list. A stack, an enemy-only token, and an embarked-only token open the list from a click. While Ranged, Strike, or Launch targeting is on, a click does not place the attack and does not change the selection. | [selection-model.md](selection-model.md) |
| Double-click | Main map | Plans a march or ferry, or clears the selection, when targeting is off. While Ranged, Strike, or Launch targeting is on, places that attack and does not plan a move. Map zoom-on-double-click is off. | [order-lifecycle.md](order-lifecycle.md) |
| Right-click | Main map | Clears selection chrome and does not open the browser menu. Queued orders stay. | [selection-model.md](selection-model.md) |
| Click, drag, wheel, double-click | Minimap | No pan, zoom, or click-to-recenter. The minimap only shows the current view. | [minimap.md](minimap.md) |
| Click | Toggle on the minimap overview's lower-left corner | Shows or hides the map-mode tabs under the overview. Hiding them also closes the terrain legend. | [minimap.md](minimap.md) |
| Click | Map-mode tabs under the minimap | Weather turns the weather icons on or off. Tech turns the tech icons on or off. Control turns the control borders and home-region outlines on or off. Production turns production labels on every hex on or off. Legend opens or closes the terrain legend. | [minimap.md](minimap.md) |
| Click | Tactical battles list backdrop | Chooses Ignore. | [tactical-battles-list.md](tactical-battles-list.md) |
| Click | Toast dismiss | Hides that toast. | [notifications-and-feedback.md](notifications-and-feedback.md) |

## Keyboard

| Input | Context | Result | Details In |
| --- | --- | --- | --- |
| W, A, S, D, and the arrow keys | Not typing in a field, and no Shift, Control, Alt, or Meta | Pans the map. Holding a key keeps panning. Opposite keys cancel. W and Up are the same direction and can be held together. | [map-surface.md](map-surface.md) |
| T | Same as pan | Hides terrain fill and fortification ticks while held. On the strategic map, outside battle-detail zoom, also shows hex codes and the tech icon where [map-surface.md](map-surface.md) says it applies, beside the weather icon while Weather is on. Restores the fill and removes the codes, the labels Production did not choose, and the tech icons Tech did not choose on release. Holding T still hides the fill and shows the codes while Tech or Production is on. While the new-game overlay is open, the hold draws the global preview's strategic hex grid, and it does not show hex codes or production labels. A regional preview keeps its hex grid. Weather and tech follow [new-game-dialog.md](new-game-dialog.md). | [map-surface.md](map-surface.md) |
| Shift | Key down or up | Key down refreshes an open stack callout. Key up closes it, including one that is scheduled but not open yet. Shift-click on a unit icon whose hex has one selectable human unit toggles that unit and does not open the callout. Shift-click on an icon with two or more selectable human units, or with none, schedules the callout when a plain click would, and does not toggle a unit. | [selection-model.md](selection-model.md) |
| Escape | "Load a saved game?" open | Chooses Cancel. The key does not reach the map or the game menu. | [save-and-load.md](save-and-load.md) |
| Escape | Game menu open | Closes the game menu and moves focus to its button. Does nothing else. | [game-menu.md](game-menu.md) |
| Escape | Build popup open | Closes the build popup and does not also close the stack callout. | [build-popup.md](build-popup.md) |
| Escape | Stack callout open, build popup closed | Closes the stack callout, including one that is scheduled but not open yet. | [stack-callout.md](stack-callout.md) |
| Escape | Tactical battles list open | Chooses Ignore and does nothing else. | [tactical-battles-list.md](tactical-battles-list.md) |

Keys other than these do not pan, toggle terrain, or close popups.

## Precedence and Focus

- When the key target is a text field, a text area, a dropdown, or other editable content, T and the pan keys do nothing, and pressing Shift does not refresh an open stack callout. Escape is handled before that check, so it still closes the build popup or the stack callout, and it still chooses Ignore on the tactical battles list. That includes Escape pressed inside the build popup's count field. While "Load a saved game?" is open, Escape chooses Cancel and does not reach the map or the game menu.
- While the new-game overlay is open, drag and the wheel pan and zoom the preview under the setup panel, and + or − zoom it, with the choices showing or hidden. Click, double-click, and right-click do not select, order, or change the selection. Hover does not open a hex tooltip or an order preview, and the pointer does not show a unit cursor. See [new-game-dialog.md](new-game-dialog.md).
- While no human seat is active, a click selects the hex and does not select a unit. Double-click does not queue an order. The Orders tab is disabled. See [modes-and-transitions.md](modes-and-transitions.md).
- Focusing an editable field stops keyboard pan immediately. Releasing a pan key still stops that key even if focus moved into a field after the key went down.
- Window blur stops keyboard pan, clears the held-Shift flag, and, if T was held, restores terrain fill and removes the hex codes, the labels Production did not choose, and the tech icons Tech did not choose. While the new-game overlay is open, that same clear hides the global preview's hex grid and leaves the home regions drawn. A regional preview keeps its hex grid.
- Hiding the window stops keyboard pan.
- Holding Shift, Control, Alt, or Meta stops keyboard pan and does not start a new pan.
- Key repeat does not start another pan or another terrain hold.
- Escape closes the game menu first, then the build popup, then the stack callout. While the tactical battles list is open, Escape only chooses Ignore. A build popup or stack callout under the dialog stays as it is.
- Holding T is a deliberate inspection gesture. Tech and Production do not replace it: while the key is down, terrain fill stays hidden, and on the strategic map, outside battle-detail zoom, the hex codes stay up, production labels show on every hex and move to the lower band, and the tech icon is shown when [map-surface.md](map-surface.md) says it applies, beside the weather icon while Weather is on. Releasing the key restores the fill and removes the codes, the labels Production did not choose, and the tech icons Tech did not choose. The tech icons stay while Tech is on, and the production labels on other hexes stay while Production is on. `isMapInspectionModeHeld` is true only while T is held. In a battle, or while the new-game or game-over overlay is open, Tech and Production have no effect and T works as below. Window blur releases the key and does the same as release. While the new-game overlay is open, that hold follows [new-game-dialog.md](new-game-dialog.md): it draws the global preview's hex grid, and it does not show hex codes or production labels. A regional preview keeps its hex grid.
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
- `src/renderer/map/mapDoubleClickHandler.ts`
- `src/shared/observeModeControls.ts` (`observeModeControls`)
- `src/renderer/map/worldLeafletMap.ts`
- `src/shared/mapKeyboardPanLogic.ts`
- `src/renderer/gameplay/meleeInterceptModal.ts`
- `src/renderer/openRouter/openRouterControls.ts`
