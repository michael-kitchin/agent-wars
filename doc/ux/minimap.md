# Minimap

The loaded-map overview beside the main map.

## Purpose

Show where the main view sits in the loaded map once the player has zoomed in.

## Availability

Shown with the map in every mode where the map container is visible. It does not accept pointer input. In New game, Game over, Tactical annihilation, and while the tactical battles list is open, pointer input on the whole map container is off, which includes the minimap.

## Information Displayed

- An overview of the loaded map, the Mercator world in a global match and the region's hexes in a regional match, using the same basemap family as the main map.
- A rectangle for the main view when the main view covers less of the world than the overview. When the main view is wide enough, the rectangle is removed.

The rectangle tracks pan and zoom of the main map.

## Inputs and Responses

### Mouse

- When the player clicks, drags, or uses the wheel on the minimap, nothing happens. Dragging, wheel zoom, double-click zoom, and keyboard on the minimap are off.

### Keyboard

- None.

### Other

- When the main map moves or zooms, the overview rectangle updates or hides.
- When a match starts, the overview shows that match's extent, including a new match on the same region.

## States

- No rectangle: the main view is not zoomed in enough relative to the overview.
- Rectangle shown: the main view is zoomed in. The rectangle follows the main bounds.

## Invariants

- The minimap never pans or zooms the main map.
- The minimap never zooms itself from the wheel.

## Strategic and Tactical Differences

The minimap keeps the loaded map's extent in both theaters. During a battle the main view is the battle area, so the view rectangle shows where the battle is in that extent.

## Related Documents

- [map-surface.md](map-surface.md)
- [input-map.md](input-map.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#minimap`)
- `src/renderer/map/worldLeafletMap.ts`
- `src/renderer/map/mapExtent.ts`
