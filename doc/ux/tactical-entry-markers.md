# Tactical Entry Markers

The markers on contested hexes that start a tactical battle.

## Purpose

Let the player enter a contested hex's battle from the strategic map.

## Availability

Shown in Strategic planning during the planning phase, once the map is zoomed in far enough, on each explored contested hex. They remain at battle-detail zoom, which is when build markers hide. They stay shown during strategic Resolution playback, because the next turn's planning state is already loaded; a click then starts the battle and cancels the playback. See [resolution-playback.md](resolution-playback.md). Hidden during Tactical planning, during a non-planning strategic phase, and when the map is zoomed out. While the tactical battles list is open, the map is not refreshed, so markers that were already visible stay visible and do not accept clicks. A hover order preview does not hide the markers, but a click is ignored while that preview is active.

## Information Displayed

- One marker per explored contested hex. The marker's tip is "Tactical battle". Its accessible name is "Start tactical battle" plus that hex.

## Inputs and Responses

### Mouse

- When the player clicks a marker, and no hover order preview is active, the build popup closes and a tactical battle starts for that hex. If that hex already has a battle session, the battle resumes. A failure shows an error toast and stays in Strategic planning.
- The click does not also select a unit under the marker.

### Keyboard

- None.

### Other

- Markers are rebuilt when the set of contested explored hexes changes.

## States

- Hidden: no eligible hex, wrong phase, or a battle is already active.
- Shown: one or more markers.

## Invariants

- Markers never appear during Tactical planning.
- Markers never appear on a hex the player has not explored.
- A click never starts a battle while a hover order preview is active.

## Strategic and Tactical Differences

Markers are strategic only. The battle they start is Tactical planning. See [modes-and-transitions.md](modes-and-transitions.md).

## Related Documents

- [map-surface.md](map-surface.md)
- [modes-and-transitions.md](modes-and-transitions.md)
- [tactical-battle-controls.md](tactical-battle-controls.md)
- [tactical-battles-list.md](tactical-battles-list.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#tactical-entry-layer`)
- `src/renderer/map/tacticalEntryLayer.ts`
- `src/renderer/tactical/tacticalEntryFlow.ts`
