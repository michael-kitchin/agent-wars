# Map Overlays

Drawings on the map that report range, routes, queued orders, and combat playback. They are not separate controls.

## Purpose

Show the consequence of the current selection, drafts, and resolution without making the player open a panel.

## Availability

Drawn on the map surface whenever their condition is true, in Strategic planning, Tactical planning, and Resolution playback. They are not interactive. New game, Game over, and the tactical battles list are not overlay modes. While the new-game overlay is open, these match overlays are not drawn. The map shows that dialog's preview instead. See [new-game-dialog.md](new-game-dialog.md). While the tactical battles list is open, the map is not refreshed, so overlays stay as they were when Ready paused.

## Information Displayed

- A range perimeter while ranged or strike targeting is on and the selection has a perimeter to draw.
- A hover route or shot preview while the pointer is over a candidate destination for the current selection. A route is solid for the part each origin stack covers this turn or beat, and dashed beyond it. An air route is solid all the way.
- Lines for queued ranged attacks, air strikes, and ferries.
- Shot lines during resolution playback for ranged combat that is being replayed.
- A draft march path during Tactical planning.
- City, transport, and infrastructure marks on hexes that have them, when that overlay is enabled for the current zoom.
- Combat marks during Resolution playback: the hexes where combat and casualties are being shown.
- Dice chips during Resolution playback: the dice each stack rolled in the phase being shown, drawn above every other playback overlay. See [resolution-playback.md](resolution-playback.md).

Empty means the overlay is not drawn. Overlays do not show a placeholder.

## Inputs and Responses

### Mouse

- None. The map surface receives the pointer. See [map-surface.md](map-surface.md).

### Keyboard

- None.

### Other

- When targeting turns off, or the selection can no longer support a perimeter, the range perimeter stops.
- When the hover preview is cleared, its line stops. See [order-lifecycle.md](order-lifecycle.md).
- When playback ends, combat marks, dice chips, and playback shot lines stop.

## States

- Hidden: the condition for that overlay is false.
- Shown: the condition is true. A newer preview replaces the previous preview line.

## Invariants

- Overlays never accept clicks of their own.
- A range perimeter is never shown while targeting is off.
- Playback combat marks and dice chips are never shown after playback ends.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Range perimeter | Strategic reach for the selection | Tactical reach for the selection |
| March preview | Strategic route preview | Battle march preview, including a draft march drawing |
| Solid part of a hover route | The movement of the slowest selected unit in that hex, after the weather of the hex it stands in | The shortest first-beat reach the march planner gives any selected unit on that cell, so forest, rubble, or weather that make a cell cost 2 shorten it |
| Playback | Strategic turn animation | Battle beat animation |

## Related Documents

- [map-surface.md](map-surface.md)
- [order-lifecycle.md](order-lifecycle.md)
- [modes-and-transitions.md](modes-and-transitions.md)
- [combat rules](../combat-rules-v3.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `src/renderer/rendering/gameScene.ts`
- `src/renderer/rendering/rangePerimeterOverlay.ts`
- `src/renderer/rendering/pathDrawing.ts`
- `src/renderer/rendering/orderDrawing.ts`
- `src/renderer/rendering/orderOverlayStages.ts`
- `src/renderer/rendering/hoverPreview.ts`
- `src/renderer/rendering/canvasPreviewPolicy.ts`
- `src/renderer/rendering/tacticalCityOverlays.ts`
- `src/renderer/map/tacticalTransportVectorLayer.ts`
- `src/renderer/rendering/terrainInfrastructureOverlay.ts`
- `src/renderer/rendering/infrastructureOverlayState.ts`
- `src/renderer/rendering/resolutionCombatOverlays.ts`
- `src/renderer/rendering/combatDiceChipDrawing.ts`
- `src/renderer/tactical/tacticalDraftMarchOverlay.ts`
