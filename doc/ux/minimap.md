# Minimap

The minimap panel at the map's top-left: the loaded-map overview, and under it a row of map-mode tabs that a toggle on the overview's corner shows and hides.

## Purpose

Show where the main view sits in the loaded map once the player has zoomed in, and let the player turn the weather icons, the tech icons, the control borders, and production on every hex on and off, and open the terrain legend.

## Availability

Shown with the map in every mode where the map container is visible, except New game and Game over, where the whole panel is hidden. It shows again when that overlay closes. After a successful start it shows the new match. The overview does not accept pointer input. In Tactical annihilation, and while the tactical battles list is open, the panel stays visible and pointer input on the whole map container is off, which includes the panel, its toggle, and its tabs.

## Information Displayed

- The panel sits 12 px in from the map's top-left corner, in the navy chrome, and is 280 px wide inside its border (`--minimap-width`). The 280 × 200 px overview fills its top. A row of five map-mode tabs runs under the overview while the toggle shows it. The row is hidden when the app opens.
- A toggle on the overview's lower-left corner: a 32 px square in the selection panel's expand-control style, with dividers on its top and right edges and a chevron that points down while the tabs are hidden and up while they show.
- Each tab is 56 × 58 px, the same size as a tab on the console's rail (`--chrome-tab-height`): an 18 px icon above a 9 px label (`--chrome-tab-label-size`), in the rail's colors. A label never wraps.
- An overview of the loaded map, the Mercator world in a global match and the region's hexes in a regional match, using the same basemap family as the main map. In a global match it shows the whole width of the world; its height cuts the world off at about 80° north and south.
- A 2 px border in the expand control's background (`--chrome-bg`) on the overview's inside edge, over the map and the tabs toggle. It does not take the pointer (`.minimap-overview::after` in `static/shellChrome.css`).
- A rectangle for the main view when the main view covers less of the world than the overview: a 2 px opaque line in `--chrome-border` (`#5a7090` when that token cannot be read), the lighter slate the overview frame used before it moved to `--chrome-bg`. `syncMinimapViewportRect` reads the token. When the main view is wide enough, the rectangle is removed.
- The map-mode tabs, left to right:
  - Weather: shows or hides each hex's weather icon on the world map, in either view, as described in [map-surface.md](map-surface.md). On when the app opens.
  - Tech: shows or hides each hex's tech tier icon on the world map while the tech bonus is Low or High, as described in [map-surface.md](map-surface.md). Off when the app opens. It does not hide terrain fill or show hex codes or production. A battle and the new-game or game-over overlay keep their normal view; Tech applies again when they close.
  - Control: shows or hides the borders that mark who controls each world hex, and the home-region outlines at battle-detail zoom (`drawTerrainHexes` and `drawScenarioHomeRegionOutlines` in `src/renderer/rendering/terrainRendering.ts`). On when the app opens. With it off, every hex keeps the normal grid stroke. It does not change the new-game preview's home-region rings.
  - Production: shows or hides production labels on every world hex, the way holding T does. Off when the app opens. On, opponent and neutral hexes show labels too, unexplored hexes as plain `$N`, and, with fog of war off, every seat's queue timing. A queued type that seat has already fielded up to its deployment cap shows ∞t. A label stays in its default place, and moves to the lower band only while T is held or when its hex has infrastructure or units. Production applies only on the world map.
  - Legend: opens or closes the [terrain legend](terrain-legend.md).
- Weather while its icons are on, Tech while its view is on, and Legend while the legend is open, read as pressed: a lighter tab with a teal mark on its top edge, next to the overview.

The rectangle tracks pan and zoom of the main map.

## Inputs and Responses

### Mouse

- When the player clicks, drags, or uses the wheel on the overview, nothing happens. Dragging, wheel zoom, double-click zoom, and keyboard on the overview are off.
- When the player clicks the toggle on the overview's corner, the tabs show under the overview, or hide if they show. Hiding them also closes the terrain legend, because its tab is hidden with them. The legend and the toast band are placed again for the panel's new height.
- When the player clicks Weather, Tech, Control, or Production, that layer turns off, or on if it is off, and the tab follows. None of them changes the others.
- When the player clicks Legend, the terrain legend opens, or closes if it is open.

### Keyboard

- Holding T hides terrain fill and shows hex codes, the tech icons, and every production label while the key is down, and moves labels to the lower band, as described in [input-map.md](input-map.md). Releasing it removes what T added. The tech icons stay while Tech is on, and the production labels on other hexes stay while Production is on. It does not change Weather, Tech, Control, or Production. `isMapInspectionModeHeld` is true only while T is held.

### Other

- When the main map moves or zooms, the overview rectangle updates or hides.
- When a match starts, the overview shows that match's extent, including a new match on the same region.
- While the new-game overlay is open, this overview is hidden. Changing a home, the tab, or the regional region does not show it.

## States

- No rectangle: the main view is not zoomed in enough relative to the overview.
- Rectangle shown: the main view is zoomed in. The rectangle follows the main bounds.
- Weather, Tech, Control, and Production each on or off: each set with its own tab. All last until the app closes, across turns, battles, and new matches. None is saved. Weather and Control are on when the app opens; Tech and Production are off.
- Tabs hidden: the start state. The panel is the overview and its toggle.
- Tabs shown: the row of map-mode tabs sits under the overview. Whether the tabs show lasts until the app closes, including while the panel is hidden for New game and Game over. It is not saved.

## Invariants

- The minimap never pans or zooms the main map.
- The minimap never zooms itself from the wheel.
- Weather reads as pressed exactly while its icons are on, Tech exactly while its icons are chosen, Control exactly while the control borders are on, and Production exactly while production on every hex is chosen. Any combination can be pressed.
- Turning Weather, Tech, Control, or Production on or off never changes the match, the selection, or queued orders.
- Hiding the tabs never changes Weather, Tech, Control, or Production.
- The terrain legend is never open while the tabs are hidden.

## Strategic and Tactical Differences

In Strategic planning and Tactical planning the overview is the loaded map. During a battle the main view is the battle area, so the view rectangle shows where the battle is in that extent. Tech and Production apply only on the world map, including its Resolution playback (`isMapLayerShown` in `src/shared/mapViewMode.ts`, through `areTechIconsShown` and `isProductionDetailShown` in `src/renderer/gameplay/productionOverlayHelpers.ts`). In a battle, including a beat's playback, those two have no effect, and the map keeps its normal view until the player leaves the battle. Control and Weather work the same in every view where their layer is drawn. In New game and Game over the panel is hidden.

## Related Documents

- [map-surface.md](map-surface.md)
- [input-map.md](input-map.md)
- [terrain-legend.md](terrain-legend.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#minimap-panel`, `#minimap`, `#map-mode-tabs-toggle`, `#map-mode-tabs`)
- `static/shellChrome.css` (`--chrome-bg`, `--chrome-border`, `--minimap-width`, `--chrome-tab-height`, `--chrome-tab-label-size`, `.minimap-panel`, `.minimap-overview` and its `::after` border, `.minimap-tabs-toggle`, `.map-mode-tabs`, `.map-mode-btn`)
- `src/renderer/map/worldLeafletMap.ts` (`syncMinimapViewportRect`, which reads `--chrome-border`)
- `src/renderer/map/mapExtent.ts`
- `src/renderer/map/mapModeTabs.ts`
- `src/renderer/map/mapViewModeState.ts`
- `src/shared/mapViewMode.ts` (`isMapLayerShown`)
- `src/renderer/gameplay/productionOverlayHelpers.ts` (`isMapInspectionModeHeld`, `areTechIconsShown`, `isProductionDetailShown`)
- `src/renderer/rendering/terrainRendering.ts` (`drawTerrainHexes`, `drawScenarioHomeRegionOutlines`)
