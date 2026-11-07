# Terrain Legend

The terrain key, plus the control that picks a terrain style.

## Purpose

Name the terrain kinds the map uses, and let the player switch the terrain style. The style changes the filter on the same hillshade tiles, including the water drawn under them. It does not switch tile hosts.

## Availability

Closed until the player clicks Legend in the [minimap panel](minimap.md)'s map-mode tabs, which the toggle on the overview's corner shows, and closed again by the next click on Legend or by hiding those tabs. Whether it is open lasts until the app closes; it is not saved. While open it stays available in Strategic planning and Tactical planning. It is hidden in New game and Game over, and shown again when that overlay closes if it was open. In Tactical annihilation, and while the tactical battles list is open, it stays visible and pointer input on the map container is off, so the style dropdown cannot be used.

## Information Displayed

- The legend opens 8 px right of the minimap panel, level with the panel's top. When the map is too narrow for it there, with 12 px to spare at the map's right edge, it opens at the map's left inset, 8 px under the panel instead (`legendPopoverPosition` in `src/shared/mapChromePlacement.ts`). It moves when the map changes size.
- A terrain style dropdown, left-aligned, with no label beside it. The choices are Default, Atlas, Wargame, and Scientific. The key is only as wide as that dropdown and the rows under it. Its tip is in [control-tooltips.md](control-tooltips.md).
- One row per terrain kind, in this order: Water, Coastal, Wetlands, Plains, Forest, Mountain, Desert, Arctic. An Urban row follows them, then a Rubble row, then a Fortified row (`FORTIFIED_LEGEND_LABEL`, from `appendFortifiedLegendRow`). Urban, Rubble, and Fortified are overlays, not one of those kinds. The Urban chip is the opaque form of that style's urban fill, flat, not hatched. The Rubble chip is that same opaque fill with a dark-red crosshatch. The Fortified chip draws the full tick pattern, four ticks on every edge, on that urban fill.
- Each row shows an opaque color chip for that kind under the active style. The chip is in the same family as that style's map fill and is stronger than the translucent hex paint. Coastal and wetlands use different chips. Mountain follows that style's hue. The same chip is drawn, at the size of a country flag, before each of these terrain names in the hex tooltip, the unit tooltip, and the blocked and effects order tooltips. The Rubble chip, hatch included, is drawn the same way before the word Rubble in a zoomed-cell or battle-cell hex tooltip, the blocked tooltip, and the effects tooltip. Snow, rain, and heat in those tooltips use a weather icon, as described in [hex-tooltips.md](hex-tooltips.md). An open tooltip keeps the chips it opened with. Hex paint stays the translucent fill.

## Inputs and Responses

### Mouse

- When the player changes Terrain style, the filter on the hillshade and on the water under it changes to that choice, on the main map and the minimap, and the same filter changes on the main map's elevation-tile lines, and the legend redraws to match. The tiles stay mounted. Default applies an empty filter. Atlas applies `ATLAS_BASEMAP_CSS_FILTER` (`saturate(0.78) contrast(1.2) brightness(1.03)`). Scientific applies `SCIENTIFIC_BASEMAP_CSS_FILTER` (`grayscale(1) contrast(1.18) brightness(1.08)`). Wargame applies `WARGAME_BASEMAP_CSS_FILTER` (`invert(1) hue-rotate(180deg)`). Unknown ids use the empty filter. All four are `basemapCssFilterForStyle` in `src/shared/basemapStyleLogic.ts`. Land tile images also use `contrast(1.4)` from `static/shellChrome.css` on the main map and the minimap. That contrast is not part of the terrain-style filter, so the water and the elevation-tile lines do not receive it.

### Keyboard

- When the dropdown has focus, global map keys do not pan. See [input-map.md](input-map.md).

### Other

- When the player clicks Legend in the minimap panel, the legend opens, or closes if it is open.
- When the player hides the minimap panel's map-mode tabs with the toggle on the overview's corner, the legend closes.

## States

- Closed: the default. Legend in the minimap panel does not read as pressed.
- Interactive: open, the map container accepts pointer input, and the dropdown can change style.
- Hidden: New game or Game over.
- Not interactive: Tactical annihilation, or the tactical battles list, has disabled pointer input on the map container. The legend stays visible.

## Invariants

- The legend always lists the same terrain kinds, in the same order, then Urban, then Rubble, then Fortified.
- Changing style never changes the match, the selection, or queued orders.
- Changing style never reloads the hillshade tiles.

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

- `static/index.html` (`#terrain-legend`, `#map-legend-toggle`)
- `src/renderer/map/mapModeTabs.ts`
- `src/renderer/map/mapChromeLayout.ts`
- `src/shared/mapChromePlacement.ts`
- `src/renderer/rendering/terrainVisualStyles.ts`
- `src/shared/basemapStyleLogic.ts` (`basemapCssFilterForStyle`)
- `src/renderer/map/basemapLayer.ts` (`filterOfflineBasemapPanes`)
- `src/renderer/rendering/terrainLegendRow.ts` (shared legend row layout and swatch chrome)
- `src/renderer/rendering/terrainLegendUrban.ts`
- `src/renderer/rendering/terrainLegendRubble.ts`
- `src/renderer/rendering/terrainLegendFortified.ts` (`appendFortifiedLegendRow`)
- `src/shared/fortificationTickGeometry.ts` (`FORTIFICATION_TICKS_PER_EDGE`)
- `src/renderer/map/initCore.ts`
- `src/shared/pipelineTerrain.ts`
