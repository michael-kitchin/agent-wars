# Tactical Ready fails after unit loss (`unknown_unit`)

## Symptom
After losing a unit in a tactical battle, the next Ready shows:
`One or more selected units are not part of this tactical battle.`

Log: `humanTacticalMarchValidationFailure {"reason":"unknown_unit",…}` then
`commitHumanTacticalDraftOrders rejected marches`.

## Root cause
`tacticalMarchContinuations` were computed from pre-combat march legs. The same beat’s melee/ranged could remove a continuing marcher, but the dead id was still returned to the renderer and re-queued in `S.tacticalPendingMarches`. The next Ready validated that id against the live roster and failed all-or-nothing.

## Fix
1. After the beat, filter continuations with `filterTacticalMarchContinuationsToPresentSubUnits` against `finalBattle.subUnits` before IPC return.
2. Renderer builder skips continuations for absent sub-units; Ready prunes stale pending marches before commit; post-commit calls `reconcileSelectionToCurrentState`.
