# Tactical AI every-other-beat movement stagger

## Symptom
Opponent marches applied on one Ready, then the next Ready dropped the same draft as `already_at_destination`, leaving the AI idle until a fresh post-beat consult. Movement looked delayed / staggered by turns.

## Root cause
After Ready, `committedOpponentTacticalDraft` echoed the just-applied (sanitized) plan back into `S.tacticalOpponentDraft`. When post-beat consult skipped (`hadOpponentBeatActions`), that recycled draft was sent again.

Strategic mode is unaffected: it clears opponent pending orders on consume (`clearAiPendingOrders` / `resetPrecomputedAiState`).

## Fix
1. `committedOpponentTacticalDraftFieldAfterConsume` always returns `null` when a draft was sent (never echoes applied rows).
2. Ready handler clears `S.tacticalOpponentDraft` on that sentinel before post-beat refill.
3. `attachTacticalOpponentPlanToIpc === false` clears the draft and may prefetch for the next beat.
