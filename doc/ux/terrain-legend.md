# Terrain Legend

The terrain key, plus the control that picks a terrain style.

## Purpose

Name the terrain kinds the map uses, and let the player switch the terrain style and matching basemap.

## Availability

Shown with the map. It stays available in Strategic planning and Tactical planning. In New game, Game over, Tactical annihilation, and while the tactical battles list is open, pointer input on the map container is off, so the style dropdown cannot be used.

## Information Displayed

- The title "Terrain".
- One row per terrain kind, in this order: water, coastal, wetlands, plains, forest, mountain, desert, arctic.
- A Terrain style dropdown. The choices are Default, Atlas, Wargame, and Scientific.

## Inputs and Responses

### Mouse

- When the player changes Terrain style, the active style and the main basemap switch to that choice, and the legend redraws to match.

### Keyboard

- When the dropdown has focus, global map keys do not pan. See [input-map.md](input-map.md).

### Other

- None.

## States

- Interactive: the map container accepts pointer input, and the dropdown can change style.
- Not interactive: New game, Game over, Tactical annihilation, or the tactical battles list has disabled pointer input on the map container.

## Invariants

- The legend always lists the same terrain kinds, in the same order.
- Changing style never changes the match, the selection, or queued orders.

## Strategic and Tactical Differences

The legend and the style dropdown behave the same in both theaters.

## Related Documents

- [map-surface.md](map-surface.md)
- [input-map.md](input-map.md)
- [ui style guide](../ui-style-guide.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#terrain-legend`)
- `src/renderer/rendering/terrainVisualStyles.ts`
- `src/renderer/map/initCore.ts`
- `src/shared/pipelineTerrain.ts`
