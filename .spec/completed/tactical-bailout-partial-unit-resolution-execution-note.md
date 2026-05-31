# Tactical Bailout Partial-Unit Resolution Execution Note

## Locked Semantics

- Trigger only on the human voluntary tactical exit flow (`Return to Strategic`).
- Apply threshold evaluation only when both players still have tactical sub-units in the active battle snapshot.
- Per parent strategic unit, destroy when surviving tactical sub-units are strictly less than half of baseline:
  - `survivors * 2 < baseline`.
- Baseline priority order:
  1. `initialPlacedSubUnitCountByParentId` captured at tactical battle start.
  2. Fallback for legacy snapshots: theoretical count by unit type (`infantry=12`, `armor=6`, `air=3`, `naval=2`).

## Expected Outcome

- Strategic units destroyed by this bailout rule no longer appear on the strategic map and are excluded from subsequent automatic strategic combat resolution.

## Non-Goals

- No change to tactical in-beat elimination behavior during air, ranged, movement, ferry, or melee phases.
- No change to non-voluntary tactical teardown paths used for cleanup, annihilation handling, or test fixture resets.
- No change to existing tactical sub-unit multiplication ratios.
