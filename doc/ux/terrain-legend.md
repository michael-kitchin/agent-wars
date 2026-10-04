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
- Each row shows an opaque color chip for that kind under the active style. The chip is in the same family as that style's map fill and is stronger than the translucent hex paint. Coastal and wetlands use different chips. Mountain follows that style's hue. The same chip is drawn, at the size of a country flag, before each of these terrain names in the hex tooltip, the unit tooltip, and the blocked and effects order tooltips. Snow, rain, and heat in those tooltips use a weather icon, as described in [hex-tooltips.md](hex-tooltips.md). An open tooltip keeps the chips it opened with. Hex paint stays the translucent fill.

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
