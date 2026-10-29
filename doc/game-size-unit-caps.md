# Game size and unit caps

Matches can be Small, Medium, or Large. The only gameplay difference among these sizes is per-side unit caps. Map, starting armies, unit costs, fog, and tactical sub-unit counts do not change with size.

Live values come from `MAX_UNITS_PER_TYPE` (Small) and `GAME_SIZE_MULTIPLIER` in `src/shared/gameSize.ts`. Combat and production rules: [combat-rules-v3.md](combat-rules-v3.md) §2.

## Caps

Caps are per side and per type. Small is the current baseline. Medium is twice Small. Large is three times Small.

- Small: infantry 12, armor 8, naval 8, air 6, missile 2
- Medium: infantry 24, armor 16, naval 16, air 12, missile 4
- Large: infantry 36, armor 24, naval 24, air 18, missile 6

A fortification is not one of these types. It has no cap (`FORTIFICATION_QUEUE_ITEM`).

## Selection

The player chooses size on the new-game dialog from a **Game size** dropdown (Small / Medium / Large), in the Forces section, between the Map section's home or side choices and the Rules section's bonuses. The dropdown sits on the same line as its label, to the right of that label, and is only as wide as its longest item. Under it, one row of the five unit types shows each type's map glyph drawn dark on a gray disk, the selected size's cap in bold, and that map's price. The layout is in [new-game-dialog.md](ux/new-game-dialog.md).

The dropdown keeps its last value for the session. A process restart returns to Small.

## Persistence

Size is stored with the match. Existing saves that have no stored size behave as Small. A new match always records a size, including Small, so it does not inherit the previous match.
