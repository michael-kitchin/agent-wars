# Terrain Legend

The terrain key, plus the control that picks a map theme.

## Purpose

Name the terrain kinds the map uses, and let the player switch the map theme. The theme sets the water color and recolors the gray land. Standard, Topographic, and Nautical reuse the default hex palette. Night reuses the wargame hex palette. It does not switch tile hosts.

## Availability

Closed until the player clicks Legend in the [minimap panel](minimap.md)'s map-mode tabs, which the toggle on the overview's corner shows, and closed again by the next click on Legend or by hiding those tabs. Whether it is open lasts until the app closes; it is not saved. While open it stays available in Strategic planning and Tactical planning. It is hidden in New game and Game over, and shown again when that overlay closes if it was open. In Tactical annihilation, and while the tactical battles list is open, it stays visible and pointer input on the map container is off, so the theme dropdown cannot be used.

## Information Displayed

- The legend opens 8 px right of the minimap panel, level with the panel's top. When the map is too narrow for it there, with 12 px to spare at the map's right edge, it opens at the map's left inset, 8 px under the panel instead (`legendPopoverPosition` in `src/shared/mapChromePlacement.ts`). It moves when the map changes size.
- A map theme dropdown, left-aligned, with no label beside it. The choices are Standard, Topographic, Nautical, and Night. The key is only as wide as that dropdown and the rows under it. Its tip is in [control-tooltips.md](control-tooltips.md).
- One row per terrain kind, in this order: Water, Coastal, Wetlands, Plains, Forest, Mountain, Desert, Arctic. An Urban row follows them, then a Rubble row, then a Fortified row (`FORTIFIED_LEGEND_LABEL`, from `appendFortifiedLegendRow`). Urban, Rubble, and Fortified are overlays, not one of those kinds. The Urban chip is the opaque form of that theme's hex-palette urban fill, flat, not hatched. The Rubble chip is that same opaque fill with a dark-red crosshatch. The Fortified chip draws the full tick pattern, four ticks on every edge, on that urban fill.
- Each row shows an opaque color chip for that kind under the active theme's hex palette. The chip is in the same family as that palette's map fill and is stronger than the translucent hex paint. Coastal and wetlands use different chips. Mountain follows that palette's hue. The same chip is drawn, at the size of a country flag, before each of these terrain names in the hex tooltip, the unit tooltip, and the blocked and effects order tooltips. The Rubble chip, hatch included, is drawn the same way before the word Rubble in a zoomed-cell or battle-cell hex tooltip, the blocked tooltip, and the effects tooltip. Snow, rain, and heat in those tooltips use a weather icon, as described in [hex-tooltips.md](hex-tooltips.md). An open tooltip keeps the chips it opened with. Hex paint stays the translucent fill.

## Inputs and Responses

### Mouse

- When the player changes Map theme, the water color and the land recolor change to that choice, on the main map and the minimap. On the main map the elevation-tile lines, the coastline, the borders, and the place names take that theme's colors, and Topographic and Nautical use the serif face. The legend redraws so the chips match the theme's hex palette. The tiles stay mounted. The choice starts at Standard, lasts until the app closes, and is not saved. Unknown ids use Standard. The colors are `MAP_THEMES` in `src/shared/mapThemes.ts`. Water is painted on the water pane. Land is an SVG `feComponentTransfer` filter on the tile pane (`mapThemeFilters.ts`), layered on the land images' `contrast(1.4)` from `static/shellChrome.css`. That contrast is not part of the theme filter, so the water and the elevation-tile lines do not receive it. The grid lines are recolored with `setStyle`, not with the land filter.

### Keyboard

- When the dropdown has focus, global map keys do not pan. See [input-map.md](input-map.md).

### Other

- When the player clicks Legend in the minimap panel, the legend opens, or closes if it is open.
- When the player hides the minimap panel's map-mode tabs with the toggle on the overview's corner, the legend closes.

## States

- Closed: the default. Legend in the minimap panel does not read as pressed.
- Interactive: open, the map container accepts pointer input, and the dropdown can change the theme.
- Hidden: New game or Game over.
- Not interactive: Tactical annihilation, or the tactical battles list, has disabled pointer input on the map container. The legend stays visible.

## Invariants

- The legend always lists the same terrain kinds, in the same order, then Urban, then Rubble, then Fortified.
- Changing the map theme never changes the match, the selection, or queued orders.
- Changing the map theme never reloads the hillshade tiles.
- The theme starts at Standard and is not saved.

## Strategic and Tactical Differences

The legend and the theme dropdown behave the same in both theaters.

## Related Documents

- [map-surface.md](map-surface.md)
- [input-map.md](input-map.md)
- [ui style guide](../ui-style-guide.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#terrain-legend`, `#map-legend-toggle`)
- `src/renderer/map/mapModeTabs.ts`
- `src/renderer/map/mapChromeLayout.ts`
- `src/shared/mapChromePlacement.ts`
- `src/renderer/rendering/terrainVisualStyles.ts`
- `src/shared/mapThemes.ts` (`MAP_THEMES`, `mapThemeById`)
- `src/renderer/map/mapThemeApply.ts` (`applyActiveMapTheme`)
- `src/renderer/map/mapThemeFilters.ts`
- `src/renderer/rendering/terrainHexPalettes.ts`
- `src/renderer/map/basemapLayer.ts` (`applyBasemapTheme`)
- `src/renderer/rendering/terrainLegendRow.ts` (shared legend row layout and swatch chrome)
- `src/renderer/rendering/terrainLegendUrban.ts`
- `src/renderer/rendering/terrainLegendRubble.ts`
- `src/renderer/rendering/terrainLegendFortified.ts` (`appendFortifiedLegendRow`)
- `src/shared/fortificationTickGeometry.ts` (`FORTIFICATION_TICKS_PER_EDGE`)
- `src/renderer/map/initCore.ts`
- `src/shared/pipelineTerrain.ts`
