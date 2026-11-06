# Main-thread profile comparison

Both recordings are five minutes with debug logging on. Times are milliseconds of CPU samples. Idle samples are omitted. Inclusive time counts a sample when the function is anywhere on the stack. SQLite time is self time of `getOne`, `getAll`, and `run` in `dbConnection.js`. The same measurement was applied to both profiles.

The before profile is the recording that ended at 16:16 local. The after profile ended at 17:54 local, after the turn-row read, the exclusive database lock, the single airport search, the ferry-destination cache, and the resumable face-crossing distance search.

Consults are `openRouter requestOrders` lines that name a model. The before window had 24 consults: 8 strategic (turns 13 and 14) and 16 tactical. The after window had 28 consults: 4 strategic (turn 15) and 24 tactical. The after window did more consults and fewer strategic ones.

| Work | Before | After |
| --- | ---: | ---: |
| Busy main-thread time | 94,420 | 28,575 |
| `getOne` + `getAll` + `run` self time | 27,837 | 1,227 |
| `getGameStateSnapshot` | 17,191 | 1,779 |
| `readTurnNumber` | 3,908 | 2 |
| `findAirportFerryRoute` | 20,221 | 0 |
| `findReachableAirportFerryDestinations` | 0 | 203 |
| `breadthFirstPathCells` | 17,389 | 0 |
| `fallbackDistanceFrom` | 0 | 323 |
| `collectAggregatedPossibleActionRows` | 16,683 | 3,705 |

An earlier cut of the same before profile put the SQLite helpers at 32.1 s. This table uses self time only, which is 27.8 s for that profile. Either figure is the before side of the comparison.

What the after column says:

- SQLite helper self time is 1.2 s, under 10 s.
- Ferry search is 0.2 s, under 2 s. The path search did not appear in the samples. Listing uses `findReachableAirportFerryDestinations`.
- Face-crossing distance search is 0.3 s, under 3 s. `breadthFirstPathCells` did not appear. Distance uses `fallbackDistanceFrom`.
- `readTurnNumber` is 2 ms. It no longer builds a snapshot. `getGameStateSnapshot` remains, at 1.8 s, for the callers that still need the snapshot.
- Busy time is 28.6 s, under half of 94 s, with more consults than the before window. The before window had two strategic turns and this one had one, so part of the drop is a lighter strategic load. The function rows above fell by much more than that difference.

No code was changed to chase these numbers.
