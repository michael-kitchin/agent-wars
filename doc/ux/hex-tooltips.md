# Hex Tooltips

The information tooltip that follows a hovered hex, plus the short order-feedback tooltips that replace it.

## Purpose

Tell the player what a hex contains, and why a hovered order is blocked or slower, without opening a panel.

## Availability

The hex tooltip can appear in Strategic planning, Tactical planning, and Resolution playback while the pointer rests on a hex. It does not appear when the stack callout or the build popup is open, or while a blocking or slower order tooltip is showing. The blocked tooltip appears during hover preview of a march, ranged attack, or air strike. The slower tooltip appears only during hover preview of a legal battle march in Tactical planning.

## Information Displayed

### Hex tooltip

- A hex name line, including the hex code, when the lookup succeeds. If the lookup fails, that line is omitted.
- Terrain kind. On the strategic map this can include the mix of terrain inside the hex.
- Terrain effects that change movement or range. The rules are in the [combat rules](../combat-rules-v3.md).
- Control or home-region ownership when the player is allowed to see it. Fog of war hides ownership the player has not earned. See the fog section of the [combat rules](../combat-rules-v3.md).
- Infrastructure the hex has, such as a seaport, road, rail, urban area, or rubble, when that information is known.

### Blocked tooltip

- A blocked notice and the reason the hovered march, ranged attack, or air strike is illegal. It replaces the hex tooltip while it is showing, then hides itself.

### Slower tooltip

- A notice that the hovered battle march is slower because of terrain, or that it uses road or rail, when the march is legal. It follows the same show-and-hide timing as the blocked tooltip.

## Inputs and Responses

### Mouse

- When the pointer rests on a hex, the hex tooltip appears after a short dwell and follows the pointer.
- When the pointer leaves the map, the hex tooltip hides.
- When the pointer moves to a hex whose hovered order is blocked or slower, that order tooltip shows immediately and the hex tooltip hides.
- When the order tooltip's time runs out, or the preview becomes legal, the order tooltip hides.

### Keyboard

- None.

### Other

- Opening the stack callout or the build popup hides the hex tooltip.

## States

- Hidden: no dwell has elapsed, the pointer left, or another surface took over.
- Hex tooltip visible: dwell elapsed and no order tooltip is showing.
- Order tooltip visible: a blocked or slower preview is active. It hides on its own.

## Invariants

- A blocked or slower tooltip never shows at the same time as the hex tooltip.
- Fog never reveals ownership the player is not allowed to see.
- A failed name lookup never invents a name.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Hex | World hex, including a terrain mix | Battle hex |
| Effects | Strategic terrain effects | Tactical terrain effects |
| Blocked tooltip | Strategic march, ranged, and strike previews | Battle march, ranged, and strike previews |
| Slower tooltip | Not shown | Legal battle march previews only |

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
- `src/renderer/map/terrainTooltipTypes.ts`
- `src/renderer/map/orderBlockHexTooltip.ts`
- `src/renderer/map/orderSlowerHexTooltip.ts`
- `src/renderer/map/createTransientPointerTooltip.ts`
- `src/renderer/map/transientPointerTooltipTtl.ts`
- `src/renderer/gameplay/meleeInterceptHexTooltip.ts`
- `src/shared/terrainEffectsForTooltip.ts`
