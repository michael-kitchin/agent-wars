# Minimap

The minimap panel at the map's top-left: a row of map-mode tabs, and the loaded-map overview under it.

## Purpose

Show where the main view sits in the loaded map once the player has zoomed in, and let the player choose the map's view and open the terrain legend.

## Availability

Shown with the map in every mode where the map container is visible, except New game and Game over, where the whole panel is hidden. It shows again when that overlay closes. After a successful start it shows the new match. The overview does not accept pointer input. In Tactical annihilation, and while the tactical battles list is open, the panel stays visible and pointer input on the whole map container is off, which includes the panel and its tabs.

## Information Displayed

- The panel sits 12 px in from the map's top-left corner, in the navy chrome, and is 280 px wide inside its border (`--minimap-width`). A row of five map-mode tabs runs across its top, and the 280 × 200 px overview sits under them.
- Each tab is 56 × 58 px, the same size as a tab on the console's rail (`--chrome-tab-height`): an 18 px icon above a 9 px label (`--chrome-tab-label-size`), in the rail's colors. A label never wraps.
- An overview of the loaded map, the Mercator world in a global match and the region's hexes in a regional match, using the same basemap family as the main map. In a global match it shows the whole width of the world; its height cuts the world off at about 80° north and south.
- A rectangle for the main view when the main view covers less of the world than the overview. When the main view is wide enough, the rectangle is removed.
- The map-mode tabs, left to right:
  - Weather: the map's normal view. Chosen when the app opens.
  - Tech: the view that holding T shows, kept on. On the world map, terrain fill is hidden, and each hex shows its code and its tech icon where one applies, as described in [map-surface.md](map-surface.md). A battle, the new-game preview, and the game-over screen keep their normal view; Tech applies again when they close.
  - Control and Production: disabled placeholders with the tip "<name> is not available in this version."
  - Legend: opens or closes the [terrain legend](terrain-legend.md).
- The chosen view, Weather or Tech, and Legend while the legend is open, read as pressed: a lighter tab with a teal mark on its bottom edge, next to the overview.

The rectangle tracks pan and zoom of the main map.

## Inputs and Responses

### Mouse

- When the player clicks, drags, or uses the wheel on the overview, nothing happens. Dragging, wheel zoom, double-click zoom, and keyboard on the overview are off.
- When the player clicks Weather or Tech, the map switches to that view and the tab reads as pressed. Clicking the view already chosen does nothing.
- When the player clicks Legend, the terrain legend opens, or closes if it is open.

### Keyboard

- Holding T shows the Tech view while the key is down, as described in [input-map.md](input-map.md). It does not change the chosen view.

### Other

- When the main map moves or zooms, the overview rectangle updates or hides.
- When a match starts, the overview shows that match's extent, including a new match on the same region.
- While the new-game overlay is open, this overview is hidden. Changing a home, the tab, or the regional region does not show it.

## States

- No rectangle: the main view is not zoomed in enough relative to the overview.
- Rectangle shown: the main view is zoomed in. The rectangle follows the main bounds.
- Weather view or Tech view: chosen with the map-mode tabs. The choice lasts until the app closes, across turns, battles, and new matches. It is not saved.

## Invariants

- The minimap never pans or zooms the main map.
- The minimap never zooms itself from the wheel.
- Exactly one of Weather and Tech reads as pressed.
- Choosing a view never changes the match, the selection, or queued orders.

## Strategic and Tactical Differences

In Strategic planning and Tactical planning the overview is the loaded map. During a battle the main view is the battle area, so the view rectangle shows where the battle is in that extent. The Tech view applies only on the world map, including its Resolution playback. In a battle, including a beat's playback, the map-mode tabs still work, and the map keeps its normal view until the player leaves the battle. In New game and Game over the panel is hidden.

## Related Documents

- [map-surface.md](map-surface.md)
- [input-map.md](input-map.md)
- [terrain-legend.md](terrain-legend.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#minimap-panel`, `#map-mode-tabs`, `#minimap`)
- `static/shellChrome.css` (`--minimap-width`, `--chrome-tab-height`, `--chrome-tab-label-size`, `.minimap-panel`, `.map-mode-tabs`, `.map-mode-btn`)
- `src/renderer/map/worldLeafletMap.ts`
- `src/renderer/map/mapExtent.ts`
- `src/renderer/map/mapModeTabs.ts`
- `src/renderer/map/mapViewModeState.ts`
- `src/shared/mapViewMode.ts` (`isTerrainInspectionShown`)
- `src/renderer/gameplay/productionOverlayHelpers.ts` (`isMapInspectionModeHeld`)
