# Match statistics

What the main process records about every side at each strategic turn, how the player's charts read it, and who is allowed to see it.

The engine is the authority. The symbols named below are the ones to check when this page and the code disagree.

## What is recorded

`recordTurnStatistics` (`src/main/matchStatistics/statisticsRecording.ts`) writes one `side_statistics` event directly after each strategic frame, including the forced final frame at match end. The recorder calls it from `insertFrame` in `src/main/recorder/matchRecorder.ts`. A tactical step writes nothing. A turn with a battle has a second strategic frame after the battle and so a second event. Readers use the last event for each turn (`readStatisticsHistory`). The event is engine-only, format version 1. Its row layout and visibility are in [match-recording.md](match-recording.md).

The payload is `TurnStatistics` (`src/shared/matchStatistics.ts`): the turn number, one `SideStatistics` per seat in side order, every stored stance row as a `RelationshipReport`, and `hexesTaken`. Statistics are strategic. Tactical sub-units are not counted.

A match that began in an earlier build has no statistics before the turn it was loaded on.

## What each number is

| Field | What it is | Computed by |
| --- | --- | --- |
| `builtUnits` | Units the seat owns that are not mercenaries, keyed by `STATISTIC_UNIT_TYPES` (infantry, armor, naval, air, missile). Every key is present | `readSideStatistics`, a count of `units` by `unit_type` and `is_mercenary` |
| `mercenaryUnits` | Mercenaries the seat owns, keyed by `STATISTIC_MERCENARY_TYPES` (infantry, armor, naval, air) | `readSideStatistics` |
| `hexes` | Strategic hexes the seat controls | A count of `res_s_control` rows |
| `productionPerTurn` | City cells in the controlled hexes, leaving out neutral-border hexes. This is production capacity, the figure the top bar shows as Production per turn (`computeTopBarStats`). A controlled city with no build queue still counts | The sum of `res_s_infrastructure.urban_hex_count`, skipping `hexes.map_role` of `neutral_border` |
| `storedPoints` | Unspent production points in the controlled hexes | The sum of `res_s_build_progress.stored_points` |
| `treasury` | The seat's credits | `readMercenaryFunds` (`src/main/gameDb/mercenaryEconomyRead.ts`) |
| `upkeepPerTurn` | Credits owed for mercenaries each turn | `readMercenaryFunds`, the same function the top bar's credits readout uses |
| `unitsLost` | Units the seat had last turn and no longer has | `unitsLostBySeat` (`src/main/matchStatistics/turnDifferences.ts`) |
| `costUsd` | Model cost so far, 0 for the human seat | The seat record's `costUsd` |
| `out` | Whether the seat has left the match | The seat record's `outTurn` |

A side's production per turn is the sum of the city cells in the hexes it controls, so there is no separate city-cells-held number.

## When a value is null

`unitsLost` and `hexesTaken` are differences from the previous turn. The previous turn's ownership is kept in memory (`rememberTurnOwnership`), not in the save, so both are null for the first turn after a load, after a new match, and after a gap of more than one turn. A value a commander never reported (trust or threat) is null, and each reported value carries the turn it was reported (`reportedTurn`).

`unitsLost` is an ownership difference. A unit that disappeared or changed owner counts as lost by its old owner, so a deserting mercenary counts. Who destroyed each unit is a different record: the `losses_attributed` event described in [match-recording.md](match-recording.md). The two numbers can differ, and both are kept.

## Relationship metrics

Each `RelationshipReport` is one commander's private view of one other side. There are four metrics:

- **Stance.** One of the five `SIDE_STANCES`.
- **Trust.** A whole number from 0 to `RELATIONSHIP_SCALE_MAX` (4), how far the commander believes what that side tells it.
- **Threat.** A whole number from 0 to `RELATIONSHIP_SCALE_MAX`, how dangerous the commander finds that side.
- **Hexes taken.** How many of the subject's hexes the reporting side captured in the last `HEXES_TAKEN_WINDOW_TURNS` (5) turns. The engine computes it. Each event holds only the current turn's captures (`HexesTaken`), and a reader sums the window.

The first three come from the talk reply and are stored in `side_stances`. See [commander-messages.md](commander-messages.md). The human player reports nothing.

## Who may see it

The charts are for the human player only, and the player sees every value whatever fog of war is set to. `game:readMatchCharts` (`src/main/ipc/matchChartsIpcHandler.ts`) applies no fog filter and returns a `MatchChartsSnapshot`: the seats in side order with their `sideDisplayName` names, the recorded turns in turn order, and the current turn. With no match open it returns empty lists and turn 1.

Commanders are told nothing new. No prompt contains another side's statistics or another commander's stance, trust, or threat, with fog of war on or off. A commander sees only its own stance, trust, and threat, in the Sides table of the talk prompt and the stance list of the orders prompt. Nothing under `src/main/openRouter/` calls the charts channel or reads the statistics event.

## Where it is drawn

The charts dialog on the C key draws this snapshot. Its rules for series, tooltips, zoom, and the relationship rows and strip are in `src/shared/matchChartSeries.ts`, and the dialog is described in [ux/charts-dialog.md](ux/charts-dialog.md).
