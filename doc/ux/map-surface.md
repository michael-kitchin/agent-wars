# Map Surface

The world map is the workspace. The player pans, zooms, selects, and points at hexes here. Orders and popups that start from a map gesture are specified in the linked documents.

## Purpose

Show the current theater and accept the pointer and keyboard gestures that plan on it.

## Availability

Shown in Strategic planning, Resolution playback, and Tactical planning. While the tactical battles list is open, the map stays as it was when Ready paused, pointer input is off, and pan keys and T still follow [input-map.md](input-map.md). In New game and Game over, drag and the wheel pan and zoom the preview, with the new-game choices showing or hidden, and a click, double-click, or right-click does not select, order, or change the selection. In Tactical annihilation the map is visible, pointer input is off, and pan keys and T still follow [input-map.md](input-map.md). In New game and Game over the map fills the space under the top bar beside the new-game setup panel, and the full width while the choices are hidden. In the other modes it fills the space under the top bar and beside the right panel.

## Information Displayed

- The strategic world, or the battle area while Tactical planning or a tactical Resolution playback is active. The battle area is the enclosing hex's tactical cells plus three neighboring rings. Cells beyond a regional map's edge are not part of a new battle. A battle already underway keeps the cells it started with.
- Unit glyphs on their hexes: a white type glyph on the player-colored circle. A hex that holds both sides uses the gray circle and draws that glyph dark. The top marker of a hex that holds a selected unit has a gold ring, as in [selection-model.md](selection-model.md). Units that are moving during playback are drawn along the playback, not only at the destination. The glyphs are in the [UI style guide](../ui-style-guide.md).
- The + and − zoom buttons at the map's top-right, and a scale in metric and imperial units beside the map attribution at its bottom-right, each 12 px in from the map's edges. A zoom button is dimmed while the map cannot zoom further that way.
- Terrain fill, unless the inspection view is on: while the player holds T, and on the world map while the Tech view is chosen in the [minimap panel](minimap.md). While the new-game overlay is open, that fill follows [new-game-dialog.md](new-game-dialog.md). See [input-map.md](input-map.md).
- While T is held or the Tech view is chosen on the strategic map, and the view is not at battle-detail zoom, each visible world hex shows its code and a production label. The label is the dollars-per-turn line, or the build marker when that marker is already showing.
- On the strategic map, outside a battle and outside battle-detail zoom, one icon sits on the band above the hex center, whether or not that hex is showing a production label. While the inspection view is off, the icon is that hex's weather, when the weather bonus is on and the hex has weather. Fog of war leaves an unexplored hex without that icon. While T is held or the Tech view is chosen, the weather icon is hidden, and the icon is that hex's tech tier when the tech bonus is on and the hex's original urban count can produce units. Fog of war does not hide the tech icon. A hex that does not qualify shows no icon while that view is on. The two icons are the same size, one and a half times the height of that hex's production text. That height is the shorter production text when the hex shows a build button, an airport or seaport glyph, or a unit, and the plain height otherwise, including a hex that is not showing the text. The icon is centered. The glyphs match the Tech and Weather icons in the [hex tooltip](hex-tooltips.md). These icons have no tooltip of their own. The hex tooltip still appears on hover.
- Overlays from [map-overlays.md](map-overlays.md).

When no match is loaded, the basemap can still be visible beside the new-game setup panel. While that overlay is open, the canvas draws the dialog's map preview instead of the loaded match, as in [new-game-dialog.md](new-game-dialog.md). Units, hex codes, production labels, build markers, battle-entry markers, road and rail lines, and other match chrome stay hidden. The minimap panel, the terrain legend, and the map's + and − zoom control are hidden. Opening the overlay frames the main view. On Global that frame is one zoom level closer than the world fit. Changing a home does not move it. Changing the tab or the regional region does. Fog of war does not hide the preview icons. Holding T draws the global preview's strategic hex grid, hides the weather icons, and does not show hex codes or production labels. Releasing T hides that global grid and leaves the home regions drawn. A regional preview keeps its hex grid. While Tech bonus is Low or High, that hold shows the previewed map's tech icons on every strategic hex that can produce units. Basic and Advanced use that map's Advanced threshold. Off hides them. Battle-detail zoom of that map's strategic hexes hides both icons.

## Inputs and Responses

### Mouse

- When the player drags the map, it pans. Panning stops at the loaded map's bounds. A global match uses the Mercator world. A regional match uses the loaded region's hexes, and zoom out stops at the zoom that fits that region. Keyboard pan uses the same bounds. The minimap shows that extent and does not pan or zoom. Leaving a tactical battle restores the match's bounds.
- When the player uses the wheel, or clicks + or −, the map zooms. Double-click does not zoom. While the new-game overlay is open, drag and the wheel still reach the map beside the setup panel, as in [new-game-dialog.md](new-game-dialog.md).
- When the player drags with Shift held, the map draws a box and zooms to fit it. It does not pan or select.
- When the player clicks, the gesture follows [selection-model.md](selection-model.md) and [order-lifecycle.md](order-lifecycle.md).
- When the player clicks outside the battle area during Tactical planning, the map shows an error toast and does not select or order.
- During Resolution playback, clicks and double-clicks do not select, target, or order. Drag, wheel, hex tooltips, and right-click still work. The selection panel's close control still clears the selection.
- When the player right-clicks, selection chrome clears and queued orders stay. See [selection-model.md](selection-model.md).

### Keyboard

- When the player holds W, A, S, D, or an arrow key, under the rules in [input-map.md](input-map.md), the map pans. Opposite directions cancel.
- When the player holds T, terrain fill hides until release or blur. On the strategic map, outside battle-detail zoom, the hex codes stay up for that same hold, and the weather icon is hidden. The tech icon is shown where the information list says it applies. Release or blur restores the fill, removes the codes, and restores the weather icon, except on the world map while the Tech view is chosen: that view stays. While the new-game overlay is open, that hold draws the global preview's hex grid, and it does not show hex codes or production labels. A regional preview keeps its hex grid.

### Other

- When a match starts, the right panel is already on screen. The view frames that match's bounds in the map beside the panel, then zooms one level toward the player's infantry and armor. If the player has neither, that zoom uses any of the player's units. If the player has no units, the view stays on the framed bounds. A global match frames the Mercator world. A regional match frames that region's hexes. Starting a match on the same region as the previous match frames it again. A later turn does not move the view back to that frame while the match's hex footprint is unchanged.
- When a tactical battle starts, the view moves to the battle area and pan limits follow that area until the battle ends.
- When the battle ends, pan limits return to the match's bounds. The view returns to the frame saved when that match opened. When no frame was saved, the view fits those bounds.
- When some basemap tiles fail to load, a map toast says the game remains playable. That toast is shown once per session and hides like other map toasts. The Reports tab keeps it. See [notifications-and-feedback.md](notifications-and-feedback.md) and [reports-tab.md](reports-tab.md).

## States

- Strategic view: the loaded match's bounds, strategic units, entry markers when the zoom allows them.
- Tactical view: battle bounds, battle units, Exit Battle available according to [tactical-battle-controls.md](tactical-battle-controls.md).
- Input disabled: New game, Game over, Tactical annihilation, or while the tactical battles list is open. Pointer input is off, except while the new-game overlay is open: drag and the wheel then pan and zoom that preview, and a click, double-click, or right-click still does not select, order, or change the selection. While the new-game overlay is open, the canvas shows that dialog's map preview. While the tactical battles list is open, and in Tactical annihilation, pan keys and T still follow [input-map.md](input-map.md).
- Orders blocked: Resolution playback. The map pans, zooms, and shows tooltips, but does not select, target, or order.
- Terrain fill hidden: T is held, or the Tech view is chosen and the player is on the world map. On the strategic map, outside battle-detail zoom, hex codes are shown, the weather icon is hidden, and the tech icon is shown where it applies. While the new-game overlay is open, hex codes stay hidden, and holding T draws the global preview's strategic hex grid. A regional preview keeps its hex grid.

## Invariants

- A click outside the battle area never issues a strategic order.
- A map gesture during Resolution playback never queues or changes an order.
- Double-click never zooms the map.
- Starting a match frames that match's bounds in the map beside the right panel before the player can act. A later turn does not return the view to that frame while the match's hex footprint is unchanged.
- Keyboard pan is the app pan, not the map library's own keyboard pan.
- The weather icon appears on the strategic map outside a battle and outside battle-detail zoom, while the inspection view is off, on each world hex that has weather while the weather bonus is on, including a hex with no production label. An unexplored hex has none. While T is held or the Tech view is chosen, the weather icon is hidden. The tech icon is shown on that same band on each world hex whose original urban count can produce units, while the tech bonus is on, including an unexplored hex. A hex with no tech icon shows no status icon while that view is on. Neither icon appears in a battle or at battle-detail zoom. While the new-game overlay is open, weather and tech follow that dialog on every strategic hex of that preview, including on hexes the loaded match has not explored.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Area | World map | The enclosing hex's tactical cells plus three neighboring rings. A new battle leaves out cells beyond a regional map's edge. A battle already underway keeps the cells it started with. Pan stays inside that area |
| Units | Strategic units | Battle sub-units |
| Clicks outside the area | Not applicable | Error toast, no order |
| Turn shown | Top bar, strategic turn | Battle header, tactical beat |
| Held T | Hides terrain fill. Outside battle-detail zoom, shows hex codes, hides the weather icon, and shows the tech icon where it applies | Hides terrain fill |
| Tech view | The same as held T, until the player chooses Weather. No effect while the new-game or game-over overlay is open; Tech applies again when it closes | No effect; the battle keeps its normal view, and Tech applies again after the battle |

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [top-bar.md](top-bar.md)
- [selection-model.md](selection-model.md)
- [input-map.md](input-map.md)
- [order-lifecycle.md](order-lifecycle.md)
- [notifications-and-feedback.md](notifications-and-feedback.md)
- [reports-tab.md](reports-tab.md)
- [resolution-playback.md](resolution-playback.md)
- [hex-tooltips.md](hex-tooltips.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#canvas-container`, `#main-map`, `#map-overlay`)
- `src/renderer/map/worldLeafletMap.ts`
- `static/shellChrome.css` (`#main-map .leaflet-control-zoom`)
- `src/renderer/map/mapExtent.ts`
- `src/shared/mapExtent.ts`
- `src/renderer/map/mainMapInteractions.ts`
- `src/renderer/map/mapDoubleClickHandler.ts`
- `src/renderer/map/mapClickSelectionPolicy.ts`
- `src/renderer/map/mapKeyboardPan.ts`
- `src/renderer/map/drawInteraction.ts`
- `src/renderer/rendering/gameScene.ts`
- `src/renderer/map/newGameMapPreviewRendering.ts`
- `src/renderer/map/hexGrid.ts`
- `src/renderer/map/terrainView.ts`
- `src/renderer/map/tacticalMapView.ts`
- `src/renderer/map/leafletMainMapProjection.ts`
- `src/renderer/rendering/unitDrawing.ts`
- `src/renderer/rendering/tacticalCityOverlays.ts` (`drawStrategicInspectionHexCodes`)
- `src/renderer/rendering/inspectionStatusIcons.ts`
- `src/shared/inspectionStatusIconLine.ts`
- `src/renderer/gameplay/productionOverlayHelpers.ts` (`isMapInspectionModeHeld`)
- `src/shared/mapViewMode.ts` (`isTerrainInspectionShown`)
