# Map Surface

The world map is the workspace. The player pans, zooms, selects, and points at hexes here. Orders and popups that start from a map gesture are specified in the linked documents.

## Purpose

Show the current theater and accept the pointer and keyboard gestures that plan on it.

## Availability

Shown in Strategic planning, Resolution playback, and Tactical planning. While the tactical battles list is open, the map stays as it was when Ready paused, pointer input is off, and pan keys and T still follow [input-map.md](input-map.md). In New game and Game over, pointer input on the map is off. In Tactical annihilation the map is visible, pointer input is off, and pan keys and T still follow [input-map.md](input-map.md).

## Information Displayed

- The strategic world, or the battle area while Tactical planning or a tactical Resolution playback is active.
- Unit glyphs on their hexes: a white type glyph on the player-colored circle. A hex that holds both sides uses the gray circle and draws that glyph dark. Units that are moving during playback are drawn along the playback, not only at the destination. The glyphs are in the [UI style guide](../ui-style-guide.md).
- A scale in metric and imperial units.
- Terrain fill, unless the player is holding T. See [input-map.md](input-map.md).
- While T is held on the strategic map, and the view is not at battle-detail zoom, each visible world hex shows its code and a production label. The label is the dollars-per-turn line, or the build marker when that marker is already showing. A hex showing that label also shows a line above the code: a tech icon when the hex tooltip would show Tech, and a weather icon when the hex tooltip would show Weather. See [hex-tooltips.md](hex-tooltips.md). A slash with a space on each side separates the two icons. One icon is shown alone. The line is left out when neither icon applies. The icons have no tooltip of their own. The hex tooltip still appears on hover.
- Overlays from [map-overlays.md](map-overlays.md).

When no match is loaded, the basemap can still be visible under the new-game overlay.

## Inputs and Responses

### Mouse

- When the player drags the map, it pans. Panning stops at the map bounds.
- When the player uses the wheel, the map zooms. Double-click does not zoom.
- When the player clicks, the gesture follows [selection-model.md](selection-model.md) and [order-lifecycle.md](order-lifecycle.md).
- When the player clicks outside the battle area during Tactical planning, the map shows an error toast and does not select or order.
- During Resolution playback, clicks and double-clicks do not select, target, or order. Drag, wheel, hex tooltips, and right-click still work.
- When the player right-clicks, selection chrome clears and queued orders stay. See [selection-model.md](selection-model.md).

### Keyboard

- When the player holds W, A, S, D, or an arrow key, under the rules in [input-map.md](input-map.md), the map pans. Opposite directions cancel.
- When the player holds T, terrain fill hides until release or blur. On the strategic map, outside battle-detail zoom, the hex codes and the tech and weather line stay up for that same hold, and they leave on release or blur.

### Other

- When a tactical battle starts, the view moves to the battle area and pan limits follow that area until the battle ends.
- When the battle ends, the view returns to the world bounds.
- When some basemap tiles fail to load, a map toast says the game remains playable. That toast is shown once per session and hides like other map toasts. See [notifications-and-feedback.md](notifications-and-feedback.md).

## States

- Strategic view: world bounds, strategic units, entry markers when the zoom allows them.
- Tactical view: battle bounds, battle units, Exit Battle available according to [tactical-battle-controls.md](tactical-battle-controls.md).
- Input disabled: New game, Game over, Tactical annihilation, or while the tactical battles list is open. Pointer input is off. While the tactical battles list is open, and in Tactical annihilation, pan keys and T still follow [input-map.md](input-map.md).
- Orders blocked: Resolution playback. The map pans, zooms, and shows tooltips, but does not select, target, or order.
- Terrain fill hidden: T is held. On the strategic map, outside battle-detail zoom, hex codes are shown, and the tech and weather line is shown on hexes that are showing a production label.

## Invariants

- A click outside the battle area never issues a strategic order.
- A map gesture during Resolution playback never queues or changes an order.
- Double-click never zooms the map.
- Keyboard pan is the app pan, not the map library's own keyboard pan.
- The tech and weather line above a hex code appears only while T is held, only on the strategic map, only outside battle-detail zoom, and only on a hex that is showing a production label.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Area | World map | The battle's hexes, with pan limited to that area |
| Units | Strategic units | Battle sub-units |
| Clicks outside the area | Not applicable | Error toast, no order |
| Turn shown on the panel | Strategic turn | Tactical turn |
| Held T | Hides terrain fill. Outside battle-detail zoom, shows hex codes and the tech and weather line on hexes with a production label | Hides terrain fill |

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [selection-model.md](selection-model.md)
- [input-map.md](input-map.md)
- [order-lifecycle.md](order-lifecycle.md)
- [notifications-and-feedback.md](notifications-and-feedback.md)
- [resolution-playback.md](resolution-playback.md)
- [hex-tooltips.md](hex-tooltips.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#canvas-container`, `#main-map`, `#map-overlay`)
- `src/renderer/map/worldLeafletMap.ts`
- `src/renderer/map/mainMapInteractions.ts`
- `src/renderer/map/mapDoubleClickHandler.ts`
- `src/renderer/map/mapClickSelectionPolicy.ts`
- `src/renderer/map/mapKeyboardPan.ts`
- `src/renderer/map/drawInteraction.ts`
- `src/renderer/map/hexGrid.ts`
- `src/renderer/map/terrainView.ts`
- `src/renderer/map/tacticalMapView.ts`
- `src/renderer/map/leafletMainMapProjection.ts`
- `src/renderer/rendering/unitDrawing.ts`
- `src/renderer/rendering/res4CityOverlays.ts` (`drawStrategicRes1InspectionHexCodes`)
- `src/renderer/rendering/inspectionStatusIcons.ts`
- `src/shared/inspectionStatusIconLine.ts`
