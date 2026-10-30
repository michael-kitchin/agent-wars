# Map Surface

The world map is the workspace. The player pans, zooms, selects, and points at hexes here. Orders and popups that start from a map gesture are specified in the linked documents.

## Purpose

Show the current theater and accept the pointer and keyboard gestures that plan on it.

## Availability

Shown in Strategic planning, Resolution playback, and Tactical planning. While the tactical battles list is open, the map stays as it was when Ready paused, pointer input is off, and pan keys and T still follow [input-map.md](input-map.md). In New game and Game over, drag and the wheel pan and zoom the preview, and + or − zoom it, with the new-game choices showing or hidden, and a click, double-click, or right-click does not select, order, or change the selection. In Tactical annihilation the map is visible, pointer input is off, and pan keys and T still follow [input-map.md](input-map.md). In New game and Game over the map fills the space under the top bar, and the setup panel floats over it. In the other modes it fills the space under the top bar and beside the console.

## Information Displayed

- The strategic world, or the battle area while Tactical planning or a tactical Resolution playback is active. The battle area is the enclosing hex's tactical cells plus three neighboring rings. Cells beyond a regional map's edge are not part of a new battle. A battle already underway keeps the cells it started with.
- Unit glyphs on their hexes: a white type glyph on the seat-colored circle. Seat 1 is teal and seat 2 is rose; seats 3 and 4 are orange and blue (`SEAT_PALETTES` in `src/shared/seatPalette.ts`). A Neutral token is near-black `#141414` with a `#D9D9D9` ring and glyph. A hex that holds more than one owner uses the gray circle and draws that glyph dark. Each marker of a hex that holds a selected unit has a gold ring in place of its border, including both markers of a stack, as in [selection-model.md](selection-model.md). Units that are moving during playback are drawn along the playback, not only at the destination. The glyphs are infantry, armor, naval, air, missile, and mixed, in the [UI style guide](../ui-style-guide.md). A last-known enemy marker uses the owner stored with that report (`enemyIntel[].player`, from `player_unit_intel.enemy_player`). When the report has no owner, the marker uses the side encoded in the unit id.
- + and − buttons at the main map's bottom-right, 12 px in from the map's right and bottom edges. Their face is `--chrome-bg`, the same dark slate as the expand control, with `--chrome-text` glyphs, `--chrome-bg-raised` on hover, and a `--chrome-border` edge. A button at the zoom limit uses `--chrome-bg-deep` and `--chrome-disabled`. The update toast uses that same corner and covers both buttons while it is open. A toast wider than that control also covers the scale and the attribution ([notifications-and-feedback.md](notifications-and-feedback.md)). The scale, in metric and imperial units, sits on that same bottom line immediately left of the buttons, and the attribution sits immediately left of the scale. Wheel and Shift-drag zoom the map too.
- Terrain fill, unless the player holds T. Tech does not hide the fill. While the new-game overlay is open, that fill follows [new-game-dialog.md](new-game-dialog.md). See [input-map.md](input-map.md). Control, on when the app opens, shows the borders that mark who controls each world hex, in that seat's map color, and the home-region outlines at battle-detail zoom (`drawTerrainHexes` and `drawScenarioHomeRegionOutlines` in `src/renderer/rendering/terrainRendering.ts`). A Neutral-held hex uses the Neutral outline `#1F1F1F`. A hex with no controller keeps the gray outline. The inner dashed home ring uses that home's seat color, or `#222222` when two or more homes share the hex. The selected hex uses the human seat's color. With Control off, every hex keeps the normal grid stroke. Control does not change the new-game preview's home-region rings.
- Production labels on the strategic map, outside battle-detail zoom. The player's own hexes always show one. Holding T, or turning Production on in the [minimap panel](minimap.md), shows one on every world hex: opponent and neutral hexes too, and unexplored hexes as plain `⚒N` (`PRODUCTION_CAPACITY_SYMBOL`). With fog of war off, those labels include every seat's queue timing (`formatProductionQueueAwareLabel` in `src/renderer/gameplay/productionOverlayHelpers.ts`). A queued type that seat has already fielded up to `getMaxUnitsPerType` shows ∞t. A fortification queue shows ∞t when `fortifiableCount` is 0. A label stays in its default place, and moves to the lower band only while T is held or when its hex has infrastructure or units. Production is off when the app opens, and it applies only on the world map: not in a battle and not under the new-game or game-over overlay. Holding T also shows each hex's code. The label is the production-per-turn line, marked with `PRODUCTION_CAPACITY_SYMBOL`, or the build or Hire marker, which carries that figure. A queued type that seat has already fielded up to its cap shows ∞t, a fortification queue shows ∞t when no city cell remains to fortify, and a paused queue shows ∞t when the hex is outside the home and holds none of that seat's units or fortifications. A mercenary token draws a `$` low and centered (`drawMercenaryBadge` in `src/renderer/rendering/mercenaryBadgeDrawing.ts`) when any unit still in that token is a mercenary.
- Fortification ticks on a hex that has at least one fortified cell. Every edge shows the same number of inward ticks, in the controller's color, gray when ownership is unknown, and hidden while T is held. The count is `fortificationTicksPerEdge`: one tick at 1–25% of the intact city, two at 26–50%, three at 51–75%, and four at 76–100%. One tick is centered on the edge. Two sit at one third and two thirds. Three include the center. Four sit at the fifths. An unexplored hex draws none. In a battle each fortified cell shows four ticks on every edge, in its owner's color.
- On the strategic map, outside a battle and outside battle-detail zoom, status icons sit on the band above the hex center, whether or not that hex is showing a production label. The weather icon is that hex's weather, while Weather is on in the [minimap panel](minimap.md), the weather bonus is on, and the hex has weather, in either view. Weather is on when the app opens. Fog of war leaves an unexplored hex without that icon. The tech icon is that hex's tech tier, while T is held or Tech is on, the tech bonus is on, and the hex's original urban count can produce units. Tech is off when the app opens. Tech does not hide terrain fill or show hex codes. Fog of war does not hide the tech icon. One icon is centered on the band. A hex that shows both has them side by side, tech on the left and weather on the right, 2 px apart, centered as a pair (`statusIconCentersX` in `src/shared/inspectionStatusIconLine.ts`). The two icons are the same size, one and a half times the height of that hex's production text. That height is the shorter production text when the hex shows a build button, an airport or seaport glyph, or a unit, and the plain height otherwise, including a hex that is not showing the text. The glyphs match the Tech and Weather icons in the [hex tooltip](hex-tooltips.md). These icons have no tooltip of their own. The hex tooltip still appears on hover.
- Overlays from [map-overlays.md](map-overlays.md).

When no match is loaded, the basemap can still be visible under the new-game setup panel. While that overlay is open, the canvas draws the dialog's map preview instead of the loaded match, as in [new-game-dialog.md](new-game-dialog.md). Units, hex codes, production labels, build markers, battle-entry markers, road and rail lines, and other match chrome stay hidden. The minimap panel and the terrain legend are hidden. Opening the overlay frames the main view. On Global that frame is one zoom level closer than the world fit. Changing a home does not move it. Changing the tab or the regional region does. Fog of war does not hide the preview icons. Holding T draws the global preview's strategic hex grid, and does not show hex codes or production labels. Releasing T hides that global grid and leaves the home regions drawn. A regional preview keeps its hex grid. While Tech bonus is Default or High, that hold shows the previewed map's tech icons on every strategic hex that can produce units, beside the weather icons as on the world map. Basic and Advanced use that map's Advanced threshold. Off hides them. The preview's weather icons follow the dialog, not the Weather tab, which is hidden with the minimap panel. Battle-detail zoom of that map's strategic hexes hides both icons.

## Inputs and Responses

### Mouse

- When the player drags the map, it pans. Panning stops at the loaded map's bounds. A global match uses the Mercator world. A regional match uses the loaded region's hexes, and zoom out stops at the zoom that fits that region. Keyboard pan uses the same bounds. The minimap shows that extent and does not pan or zoom. Leaving a tactical battle restores the match's bounds.
- When the player uses the wheel, or clicks + or −, the map zooms. One click of + or − moves by `zoomDelta` (half a level). Double-click does not zoom. While the update toast covers those buttons, the click hits the toast. The wheel still zooms, toward the pointer, unless the toast can still scroll in that direction, in which case the wheel scrolls the toast. While the new-game overlay is open, the toast takes no pointer input, so drag, the wheel, and + or − still reach the map under the setup panel, as in [new-game-dialog.md](new-game-dialog.md).
- When the player drags with Shift held, the map draws a box and zooms to fit it. It does not pan or select.
- When the player clicks, the gesture follows [selection-model.md](selection-model.md) and [order-lifecycle.md](order-lifecycle.md).
- When the player clicks outside the battle area during Tactical planning, the map shows an error toast and does not select or order.
- During Resolution playback, clicks and double-clicks do not select, target, or order. Drag, wheel, hex tooltips, and right-click still work. The selection panel's close control still clears the selection.
- When the player right-clicks, selection chrome clears and queued orders stay. See [selection-model.md](selection-model.md).

### Keyboard

- When the player holds W, A, S, D, or an arrow key, under the rules in [input-map.md](input-map.md), the map pans. Opposite directions cancel.
- When the player holds T, terrain fill hides until release or blur. On the strategic map, outside battle-detail zoom, the hex codes stay up for that same hold, production labels show on every hex and move to the lower band, and the tech icon is shown where the information list says it applies, beside the weather icon while Weather is on. Release or blur restores the fill and removes the codes, the labels Production did not choose, and the tech icons Tech did not choose. While the new-game overlay is open, that hold draws the global preview's hex grid, and it does not show hex codes or production labels. A regional preview keeps its hex grid.

### Other

- When a match starts, the console is already on screen. The view frames that match's bounds in the map beside the console, then zooms one level toward the player's infantry and armor. If the player has neither, that zoom uses any of the player's units. If the player has no units, the view stays on the framed bounds. A global match frames the Mercator world. A regional match frames that region's hexes. Starting a match on the same region as the previous match frames it again. A later turn does not move the view back to that frame while the match's hex footprint is unchanged.
- When a tactical battle starts, the view moves to the battle area and pan limits follow that area until the battle ends.
- When the battle ends, pan limits return to the match's bounds. The view returns to the frame saved when that match opened. When no frame was saved, the view fits those bounds.
- When some basemap tiles fail to load, a map toast says the game remains playable. That toast is shown once per session and hides like other map toasts. The Reports tab keeps it. See [notifications-and-feedback.md](notifications-and-feedback.md) and [reports-tab.md](reports-tab.md).

## States

- Strategic view: the loaded match's bounds, strategic units, entry markers when the zoom allows them.
- Tactical view: battle bounds, battle units, Exit Battle available according to [tactical-battle-controls.md](tactical-battle-controls.md).
- Input disabled: New game, Game over, Tactical annihilation, or while the tactical battles list is open. Pointer input is off, except while the new-game overlay is open: drag and the wheel then pan and zoom that preview, and a click, double-click, or right-click still does not select, order, or change the selection. While the new-game overlay is open, the canvas shows that dialog's map preview. While the tactical battles list is open, and in Tactical annihilation, pan keys and T still follow [input-map.md](input-map.md).
- Orders blocked: Resolution playback. The map pans, zooms, and shows tooltips, but does not select, target, or order.
- Terrain fill hidden: T is held. On the strategic map, outside battle-detail zoom, hex codes are shown, and the tech icon is shown where it applies, beside the weather icon while Weather is on. Tech on shows those tech icons on the world map without hiding the fill or showing the codes. While the new-game overlay is open, hex codes stay hidden, and holding T draws the global preview's strategic hex grid. A regional preview keeps its hex grid.

## Invariants

- A click outside the battle area never issues a strategic order.
- A map gesture during Resolution playback never queues or changes an order.
- Double-click never zooms the map.
- Starting a match frames that match's bounds in the map beside the console before the player can act. A later turn does not return the view to that frame while the match's hex footprint is unchanged.
- Keyboard pan is the app pan, not the map library's own keyboard pan.
- The weather icon appears on the strategic map outside a battle and outside battle-detail zoom, while Weather is on, on each world hex that has weather while the weather bonus is on, including a hex with no production label, in either view. An unexplored hex has none. The tech icon is shown on that same band while T is held or Tech is on, on each world hex whose original urban count can produce units, while the tech bonus is on, including an unexplored hex. Tech applies only on the world map. A hex with both shows the pair, tech on the left. Neither icon appears in a battle or at battle-detail zoom. While the new-game overlay is open, weather and tech follow that dialog on every strategic hex of that preview, including on hexes the loaded match has not explored.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Area | World map | The enclosing hex's tactical cells plus three neighboring rings. A new battle leaves out cells beyond a regional map's edge. A battle already underway keeps the cells it started with. Pan stays inside that area |
| Units | Strategic units | Battle sub-units |
| Clicks outside the area | Not applicable | Error toast, no order |
| Turn shown | Top bar, strategic turn | Battle header, tactical beat |
| Held T | Hides terrain fill. Outside battle-detail zoom, shows hex codes and the tech icon where it applies | Hides terrain fill |
| Tech | Shows or hides each hex's tech tier icon on the world map while the tech bonus is on. Off when the app opens. It does not hide terrain fill or show hex codes. No effect while the new-game or game-over overlay is open; Tech applies again when it closes | No effect; the battle keeps its normal view, and Tech applies again after the battle |
| Production | Shows production labels on every world hex, the way holding T does. Off when the app opens. A label moves to the lower band only while T is held or when its hex has infrastructure or units. No effect while the new-game or game-over overlay is open | No effect |
| Control | Shows or hides the borders that mark who controls each hex, and the home-region outlines. On when the app opens. With it off, every hex keeps the normal grid stroke | The home-region outlines at battle-detail zoom follow Control |
| Weather | Shows or hides the weather icons, in either view | No effect; a battle shows no weather icons |

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
- `static/shellChrome.css` (`#main-map .leaflet-bottom.leaflet-right`, `#main-map .leaflet-control-zoom`)
- `src/renderer/map/mapExtent.ts`
- `src/shared/mapExtent.ts`
- `src/renderer/map/mainMapInteractions.ts`
- `src/renderer/map/mapDoubleClickHandler.ts`
- `src/renderer/map/mapClickSelectionPolicy.ts`
- `src/renderer/map/mapKeyboardPan.ts`
- `src/renderer/map/drawInteraction.ts`
- `src/renderer/rendering/gameScene.ts`
- `src/renderer/rendering/fortificationTickDrawing.ts` (`drawStrategicFortificationTicks`)
- `src/shared/fortificationTickGeometry.ts` (`fortificationTicksPerEdge`)
- `src/renderer/map/newGameMapPreviewRendering.ts`
- `src/renderer/map/hexGrid.ts`
- `src/renderer/map/terrainView.ts`
- `src/renderer/map/tacticalMapView.ts`
- `src/renderer/map/leafletMainMapProjection.ts`
- `src/renderer/rendering/unitDrawing.ts`
- `src/renderer/rendering/tacticalCityOverlays.ts` (`drawStrategicInspectionHexCodes`)
- `src/renderer/rendering/inspectionStatusIcons.ts`
- `src/shared/inspectionStatusIconLine.ts`
- `src/renderer/gameplay/productionOverlayHelpers.ts` (`isMapInspectionModeHeld`, `areTechIconsShown`, `isProductionDetailShown`)
- `src/shared/economySymbols.ts` (`PRODUCTION_CAPACITY_SYMBOL`)
- `src/shared/mapViewMode.ts` (`isMapLayerShown`)
- `src/renderer/rendering/terrainRendering.ts` (`drawTerrainHexes`, `drawScenarioHomeRegionOutlines`)
