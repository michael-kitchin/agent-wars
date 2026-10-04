# Hex Tooltips

The information tooltip that follows a hovered hex, plus the short order-feedback tooltips that replace it.

## Purpose

Tell the player what a hex contains, and why a hovered order is blocked or changed by terrain or weather, without opening a panel.

## Availability

The hex tooltip can appear in Strategic planning, Tactical planning, and Resolution playback while the pointer rests on a hex. It does not appear while a unit is selected and the player is aiming a march, ferry, air strike, or ranged attack, with Shift up and resolution playback not running. It also does not appear when the stack callout or the build popup is open, or while a blocked or effects tooltip is showing. Shift inspection and resolution playback still show the hex tooltip. The blocked tooltip appears during hover preview of a march, ranged attack, or air strike. The effects tooltip appears during that same aiming when terrain or weather changes the order.

## Information Displayed

### Hex tooltip

- A hex name line, including the hex code, when the lookup succeeds. If the lookup fails, that line is omitted.
- In the hex name line, a small country flag comes before each country name. A country with no ISO code or no flag file shows a gray placeholder flag. These flags have no tooltip of their own. Continent, state, city, and water names have no flag, and neither does the "Unknown Country" fallback heading.
- Terrain kind. On the strategic map this can include the mix of terrain inside the hex. Each map-key kind (water, coastal, wetlands, plains, forest, mountain, desert, arctic) is preceded by that kind's chip from the [terrain legend](terrain-legend.md), at the size of a country flag. Urban, rubble, and Other have no swatch. The chip is the legend color for the style selected when the tooltip opens. Changing style leaves an open tooltip as it is.
- Weather, when the weather bonus is on and the hex is explored: a small icon and the word Mild, Rain, Snow, or Heat. Unexplored hexes omit it. A zoomed cell shows the world hex's weather. In a battle every cell shows the enclosing hex's weather. The rules are in [combat rules §4.9](../combat-rules-v3.md).
- Effects. A world hex has no terrain effects, because strategic terrain does not change movement or range, so the line is omitted. A zoomed cell and a battle cell show tactical terrain effects when that cell has any, and omit the line when it has none. Weather is not repeated here. The rules are in the [combat rules](../combat-rules-v3.md).
- Control or home-region ownership on a world hex, when the player is allowed to see it. Fog of war hides ownership the player has not earned. See the fog section of the [combat rules](../combat-rules-v3.md).
- Infrastructure the hex has, such as a seaport, road, rail, urban area, or rubble, when that information is known.

### Blocked tooltip

- A blocked notice and the reason the hovered march, ranged attack, or air strike is illegal. A map-key terrain name in that notice has the same swatch as the hex tooltip. It replaces the hex tooltip while it is showing, then hides itself.

### Effects tooltip

- Shown from `#order-slower-tooltip` while the player is aiming a march, ferry, air strike, or ranged attack. It lists only the terrain and weather that change that order. A map-key terrain name has the same swatch as the hex tooltip. Snow, Rain, and Heat use the weather icon, not a swatch. Urban and Rubble have no swatch. The line is omitted when nothing changes the order. A strategic march, ferry, ranged attack, or air strike can name weather. A battle march can name terrain, weather, and road or rail. A battle ranged attack can name forest, urban, or rubble on the attacker's own cell when that shortens the shot, and weather when the shot loses attack. A battle ferry shows nothing here. Snow, Rain, or Heat is named when that weather, and not a tag the unit has, changes the order. Heat cuts a battle march budget only at High, and it cuts armor ranged attack at both levels. It appears after the same dwell as the hex tooltip, then stays while the pointer remains on that cell, including while the pointer rests. Moving onto another world hex, zoomed cell, or battle cell hides it and starts that dwell again. The rules are in [combat rules §4.9](../combat-rules-v3.md).

## Inputs and Responses

### Mouse

- When the pointer rests on a hex and the player is not aiming an order, the hex tooltip appears after a short dwell and follows the pointer. Moving onto a different world hex, zoomed cell, or battle cell hides it and starts that dwell again.
- When the pointer leaves the map, the hex tooltip and the effects tooltip hide.
- While the player is aiming a march, ferry, air strike, or ranged attack, the hex tooltip does not appear. The effects tooltip appears after the same dwell when terrain or weather changes the order, then stays while the pointer remains on that cell.
- When the hovered order is illegal, the blocked tooltip shows immediately, replaces the effects tooltip, and then hides itself. When the preview becomes legal, the blocked tooltip hides.

### Keyboard

- None.

### Other

- Opening the stack callout or the build popup hides the hex tooltip.

## States

- Hidden: no dwell has elapsed, the pointer left, or another surface took over.
- Hex tooltip visible: dwell elapsed, the player is not aiming an order, and no order tooltip is showing.
- Effects tooltip visible: the dwell elapsed, the order is legal, and terrain or weather changes it. It stays until the cell changes or the pointer leaves.
- Blocked tooltip visible: an illegal preview. It hides on its own.

## Invariants

- A blocked tooltip and an effects tooltip never show at the same time as the hex tooltip, or at the same time as each other.
- Fog never reveals ownership the player is not allowed to see.
- A failed name lookup never invents a name.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Hex | World hex, including a terrain mix | Battle hex |
| Effects | None on a world hex. A zoomed cell shows that cell's tactical terrain effects, and omits the line when it has none | Tactical terrain effects, omitted when the cell has none |
| Control | Control or home-region ownership when the player is allowed to see it | A battle hex does not show a control line |
| Blocked tooltip | Strategic march, ranged, and strike previews | Battle march, ranged, and strike previews |
| Effects tooltip | Weather, when it changes a strategic march, ferry, ranged attack, or air strike | Battle march terrain, weather, and road or rail. A battle ranged attack names the attacker's forest, urban, or rubble cap, and weather when the shot loses attack. A battle ferry shows nothing |

## Related Documents

- [map-surface.md](map-surface.md)
- [order-lifecycle.md](order-lifecycle.md)
- [notifications-and-feedback.md](notifications-and-feedback.md)
- [combat rules](../combat-rules-v3.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#hex-tooltip`, `#order-block-tooltip`, `#order-slower-tooltip`)
- `src/renderer/map/terrainTooltipRes1State.ts`
- `src/renderer/map/terrainTooltipHtml.ts`
- `src/renderer/map/terrainTooltipTypes.ts`
- `src/renderer/map/orderBlockHexTooltip.ts`
- `src/renderer/map/orderSlowerHexTooltip.ts`
- `src/renderer/map/mainMapInteractions.ts`
- `src/renderer/gameplay/hoverRoutePreviewRefresh.ts`
- `src/renderer/gameplay/orderPreviewEffectsContext.ts`
- `src/shared/orderPreviewEffectsTooltip.ts`
- `src/shared/mapOrderGestureGate.ts`
- `src/renderer/map/createTransientPointerTooltip.ts`
- `src/renderer/map/transientPointerTooltipTtl.ts`
- `src/renderer/gameplay/meleeInterceptHexTooltip.ts`
- `src/shared/terrainEffectsForTooltip.ts`
- `src/shared/weatherIcons.ts`
- `src/shared/hexNamingCaption.ts`
- `src/shared/countryFlags.ts`
- `src/shared/terrainSwatchHtml.ts`
