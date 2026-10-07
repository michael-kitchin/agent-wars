# Hex Tooltips

The information tooltip that follows a hovered hex, plus the short order-feedback tooltips that replace it.

## Purpose

Tell the player what a hex contains, and why a hovered order is blocked or changed by terrain, weather, or target cover, without opening a panel.

## Availability

The hex tooltip can appear in Strategic planning, Tactical planning, and Resolution playback while the pointer rests on a hex. It does not appear while a unit is selected and the player is aiming a march, ferry, air strike, or ranged attack, with Shift up and resolution playback not running. It also does not appear when the stack callout or the build popup is open, while a blocked or effects tooltip is showing, or while a control tip is showing. Shift inspection and resolution playback still show the hex tooltip. The blocked tooltip appears during hover preview of a march, ranged attack, or air strike. The effects tooltip appears during that same aiming when terrain, weather, or target cover changes the order.

## Information Displayed

### Hex tooltip

- A hex name line, including the hex code, when the lookup succeeds. If the lookup fails, that line is omitted. The hex code stays, the first line that still applies shares that line, and the rest follow.
- In the hex name line, a small country flag comes before each country name. A country with no ISO code or no flag file shows a gray placeholder flag. These flags have no tooltip of their own. Continent, state, city, and water names have no flag, and neither does the "Unknown Country" fallback heading.
- Under the name, a world hex uses this order: Control, Production, Tech, Features, Terrain, Weather, Effects. A zoomed cell or a battle cell uses Features, Terrain, Weather, Effects. A line that does not apply is left out, and the next line moves up. The tactical battles list uses the world-hex order.
- Control or home-region ownership on a world hex, when the player is allowed to see it. Fog of war hides ownership the player has not earned. See the fog section of the [combat rules](../combat-rules-v3.md). A zoomed cell and a battle cell omit it.
- Production on a world hex: dollars per turn from the hex's current urban count, or none when that count is zero or the hex is a neutral border. A zoomed cell and a battle cell omit it.
- Tech on a world hex, when the tech bonus is on and that hex's original urban count can produce units. A small icon and the word Basic or Advanced name the tier of units that hex produces. A hex whose cities have been reduced to rubble still shows that original tier. A zoomed cell and a battle cell omit it. The line is omitted when the tech bonus is off or the hex produces no units. Fog of war does not hide it. The rules are in [combat rules §4.9](../combat-rules-v3.md).
- Features: infrastructure the hex has, such as a seaport, road, or rail, when that information is known. On a zoomed cell, Road and Rail are preceded by their icons. Airport and Seaport stay plain text. Urban and Rubble are not features.
- Terrain kind. On the strategic map this can include the mix of terrain inside the hex. Each map-key kind (water, coastal, wetlands, plains, forest, mountain, desert, arctic) is preceded by that kind's chip from the [terrain legend](terrain-legend.md), at the size of a country flag. Urban uses the flat Urban chip. Rubble uses the hatched chip. Other has no swatch. A world hex, and the tactical battles list, name that mix and do not add Urban or Rubble. A zoomed cell and a battle cell name Rubble after the cell's kind when that cell is rubble, and Urban when that cell is intact urban. The chip is the legend color for the style selected when the tooltip opens. Changing style leaves an open tooltip as it is.
- Weather, when the weather bonus is on and the hex is explored: a small icon and the word Mild, Rain, Snow, or Heat. Unexplored hexes omit it. A zoomed cell shows the world hex's weather. In a battle every cell shows the enclosing hex's weather. The rules are in [combat rules §4.9](../combat-rules-v3.md).
- Effects. Movement and range clauses, then cover clauses, on one line. A single up icon is a road or rail bonus, a single down icon is a slowdown, and a single blocked icon is a block. A clause with more than one of those symbols shows the icons in blocked, down, up order, separated by a pipe with no spaces, and without parentheses. A clause with one symbol shows that icon alone. Cover of 1 is one up icon and cover of 2 or more is a double up icon. The words are `Ground & Naval Cover` and `Air Cover`, surface first. A world hex that is rugged, arctic, or city leads with the blocked icon and `Armored Movement`. It shows cover from its main terrain kind, raised by city cover (2 ground and naval, 1 air) and rugged cover (2 ground and naval) when those flags are set. A zoomed cell and a battle cell show tactical movement and range when the cell has any, then cover from that cell's kind plus its urban and rubble flags, and they do not gain `Armored Movement` from the strategic stop. Weather stays on the Weather line. The line is omitted when every clause is empty. The values are in [combat rules §4.9](../combat-rules-v3.md), "Terrain cover".

### Blocked tooltip

- A blocked notice and the reason the hovered march, ranged attack, or air strike is illegal. A map-key terrain name in that notice has the same swatch as the hex tooltip, including the flat Urban chip and the hatched Rubble chip. It replaces the hex tooltip while it is showing. Once open, it follows the pointer and hides itself a short time after the pointer stops.

### Effects tooltip

- Shown from `#order-slower-tooltip` while the player is aiming a march, ferry, air strike, or ranged attack. It lists only the terrain and weather that change that order, plus the target's cover described below. A map-key terrain name has the same swatch as the hex tooltip. Snow, Rain, and Heat use the weather icon, not a swatch. Urban uses the flat Urban chip. Rubble uses the hatched chip. A battle march that uses a road or a rail shows that icon on the Using line. An older payload that only says a line was used shows both icons. The line is omitted when nothing changes the order. A strategic march, ferry, ranged attack, or air strike can name weather. A legal strategic armor march onto a rugged, arctic, or city hex adds an Effects line with the blocked icon and `Armored Movement`, and keeps `Slower:` when weather also applies. When rugged or city is why a cover column is above the other sources, the Cover line leads with the same up or double-up icon and the word Rugged or City. A battle march can name terrain, weather, and road or rail. A battle ranged attack can name forest, urban, or rubble on the attacker's own cell when that shortens the shot, and weather when the shot loses attack. A battle ferry shows nothing here. When a ranged attack or air strike is aimed at a cell or hex holding a visible enemy unit and that target has cover against the shot, a second line, `Cover:`, names the cover source (Forest, Mountain, Wetlands, Urban, or Rubble) with the same swatch rules; ground and naval fire uses the ground column and air strikes the air column, so a mountain target shows no Cover line for an air strike. A ranged attack made only by air units shows no Cover line. Snow, Rain, or Heat is named when that weather, and not a tag the unit has, changes the order. A battle march names the weather for its budget only when the weather cap is lower than the budget the start cell's terrain already allows. For example, armor starting on a forest cell names Forest alone in snow at Low, and both Forest and Snow in snow at High. Heat cuts a battle march budget only at High, and it cuts armor ranged attack at both levels. It appears one second after the pointer rests on that cell, once the effect is known, then stays while the pointer remains on that cell. Moving farther than 6 pixels on that cell before the tooltip opens starts the one-second wait again. Movement of 6 pixels or less does not. Moving onto another world hex, zoomed cell, or battle cell hides it and starts that wait again. The rules are in [combat rules §4.9](../combat-rules-v3.md).

## Inputs and Responses

### Mouse

- When the pointer rests on a hex and the player is not aiming an order, the hex tooltip appears one second after the pointer rests, then follows the pointer. Holding Shift to inspect starts that wait when the pointer is already on the hex. Moving farther than 6 pixels on that hex before the tooltip opens starts the one-second wait again. Movement of 6 pixels or less does not. Moving onto a different world hex, zoomed cell, or battle cell hides it and starts that wait again. Resting on the token of a hex that holds one stationary unit with a recorded origin shows that unit's Bonuses tooltip instead, after the same second. A token with no recorded origin keeps this tooltip. Leaving the token for the rest of the hex starts the hex tooltip dwell again. A stack token does not. See [stack-callout.md](stack-callout.md).
- When the pointer leaves the map, the hex tooltip, the effects tooltip, and the blocked tooltip hide. A blocked notice that has not opened yet is cancelled.
- While the player is aiming a march, ferry, air strike, or ranged attack, the hex tooltip does not appear. The effects tooltip appears one second after the pointer rests when terrain, weather, or target cover changes the order, then stays while the pointer remains on that cell. Stopping the aim hides it, including a notice that has not opened yet. Moving farther than 6 pixels before it opens starts that wait again. Movement of 6 pixels or less does not.
- When the hovered order is illegal, the blocked tooltip appears one second after the pointer rests, replaces the effects tooltip, and follows the pointer. It hides itself a short time after the pointer stops. Moving farther than 6 pixels before it opens starts that wait again. Movement of 6 pixels or less does not. Moving onto another world hex, zoomed cell, or battle cell hides it and starts that wait again. When the preview becomes legal, or the player stops aiming, it hides, including a notice that has not opened yet. A press hides it and leaves the effects tooltip up.

### Keyboard

- Holding Shift while a unit is selected stops aiming. The blocked notice and the effects notice hide, including a notice that has not opened. The hex tooltip wait starts when the pointer is already on the hex. Releasing Shift resumes aiming on that hex.

### Other

- Opening the stack callout or the build popup hides the hex tooltip.
- When a control tip appears, the hex tooltip hides. A blocked tooltip or an effects tooltip stays up, and the control tip does not appear with it. See [control-tooltips.md](control-tooltips.md).

## States

- Hidden: the pointer has not rested for one second, the pointer left, or another surface took over.
- Hex tooltip visible: the pointer rested for one second, the player is not aiming an order, and no order tooltip is showing.
- Effects tooltip visible: the pointer rested for one second, the order is legal, and terrain, weather, or target cover changes it. It stays while the pointer remains on that cell, until the player stops aiming, the cell changes, or the pointer leaves.
- Blocked tooltip visible: the pointer rested for one second on an illegal preview. It hides on its own a short time after the pointer stops, and also when the player stops aiming, changes cell, leaves the map, or presses.

## Invariants

- A blocked tooltip and an effects tooltip never show at the same time as the hex tooltip, or at the same time as each other. A control tip does not show together with any of those three.
- Fog never reveals ownership the player is not allowed to see.
- A failed name lookup never invents a name.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Hex | World hex, including a terrain mix | Battle hex |
| Effects | The blocked icon and `Armored Movement` when the hex is rugged, arctic, or city, then cover clauses. Cover uses the main terrain kind, raised by rugged and city when those flags are set. A zoomed cell puts that cell's tactical movement and range before the cover clauses and does not add `Armored Movement`. Omitted when nothing applies | Tactical movement and range, then the cell's cover clauses. Omitted when the cell has neither |
| Cover | Not its own line. Appended to Effects. A world hex uses its main terrain kind, raised by rugged and city cover when those flags are set. A zoomed cell uses the cell's terrain kind plus urban and rubble | Not its own line. Appended to Effects. The cell's terrain, urban, or rubble cover |
| Control | Control or home-region ownership when the player is allowed to see it | A battle hex does not show a control line |
| Tech | In the world-hex order above, when the tech bonus is on and the hex can produce units. The icon and Basic or Advanced follow the original urban count, including after the cities are ruined. A zoomed cell omits it | A battle hex does not show it |
| Blocked tooltip | Strategic march, ranged, and strike previews | Battle march, ranged, and strike previews |
| Effects tooltip | Weather, when it changes a strategic march, ferry, ranged attack, or air strike. A legal armor march onto a rugged, arctic, or city hex adds the blocked `Armored Movement` clause. A Cover line names the target hex's cover when it protects enemy units there | Battle march terrain, weather, and road or rail. A battle ranged attack names the attacker's forest, urban, or rubble cap, and weather when the shot loses attack. A Cover line names the target cell's cover source. A battle ferry shows nothing |

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
- `src/renderer/map/terrainTooltipStrategicState.ts`
- `src/renderer/map/terrainTooltipHtml.ts`
- `src/renderer/map/terrainTooltipTypes.ts`
- `src/renderer/map/orderBlockHexTooltip.ts`
- `src/renderer/map/orderSlowerHexTooltip.ts`
- `src/renderer/map/mainMapInteractions.ts`
- `src/renderer/entryCallbacks.ts` (`showTerrainTooltip`, `restoreTerrainTooltipAfterPopoverClose`, `scheduleTerrainTooltipRestoreAfterPopoverClose`)
- `src/renderer/core/constants.ts` (`HEX_DETAILS_TOOLTIP_DELAY_MS`, one second; `HEX_DETAILS_TOOLTIP_REST_PX`, 6 pixels)
- `src/renderer/gameplay/hoverRoutePreviewRefresh.ts`
- `src/renderer/gameplay/orderPreviewEffectsContext.ts`
- `src/shared/orderPreviewEffectsTooltip.ts`
- `src/shared/mapOrderGestureGate.ts`
- `src/renderer/map/createTransientPointerTooltip.ts`
- `src/renderer/map/transientPointerTooltipTtl.ts`
- `src/renderer/gameplay/meleeInterceptHexTooltip.ts`
- `src/shared/terrainEffectsForTooltip.ts`
- `src/shared/statusIconHtml.ts`
- `src/shared/terrainCoverRules.ts`
- `src/shared/weatherIcons.ts`
- `src/shared/hexNamingCaption.ts`
- `src/shared/countryFlags.ts`
- `src/shared/terrainSwatchHtml.ts`
- `src/shared/featureIconHtml.ts`
