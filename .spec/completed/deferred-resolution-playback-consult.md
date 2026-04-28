# Deferred resolution playback consultation (IPC ordering)

## Goal

Mechanical turn resolution returns from `game:ready`, `game:resolveMeleeIntercept`, and `game:commitHumanTacticalDraftOrders` **before** event-driven LLM consultation runs, so the renderer can finish resolution canvas animations without competing with main-thread consultation work.

Consultation still writes opponent pending orders / tactical plans in the DB; therefore **at most one** deferred batch may be outstanding per session transition.

## Mutex

`hasDeferredPlaybackConsultPending()` is true while `pendingPlaybackConsult` exists in `src/main/ipc/deferredResolutionPlaybackConsult.ts`.

While pending:

- `game:ready` returns `{ success: false, reason: 'Resolution playback consultation is still in progress.' }`.
- `game:commitHumanTacticalDraftOrders` returns the same shape before running simulation.
- Duplicate notifies are rejected once pending clears.

Pending is cleared when:

- `game:notifyResolutionPlaybackComplete` completes successfully (after push), or
- Payload validation fails critically (logged; mutex cleared to avoid deadlock), or
- `game:newGame`, `game:endTacticalBattle`, or `clearDeferredPlaybackConsultPending()` runs.

## Renderer sequence

1. IPC returns mechanical resolution; optional `postResolutionConsultDeferred` / `tacticalPostBeatConsultDeferred` flags arm renderer latches (`pendingDeferredStrategicPostResolutionConsult`, `pendingDeferredTacticalPostBeatConsult`).
2. Renderer runs `tickResolutionMoveAnimation` until done; if no animation was needed, it invokes notify immediately.
3. Main runs `runEventDrivenAfterResolutionConsultation` or `runEventDrivenAfterTacticalBeatConsultation`, then `webContents.send`:
   - `IPC_GAME.postResolutionConsultation` (`PostResolutionConsultationPushPayload`)
   - `IPC_GAME.postTacticalBeatConsultation` (`TacticalPostBeatConsultFields`)

## Notify payloads

| Kind         | Body                                      |
| ------------ | ----------------------------------------- |
| `strategic`  | `{ kind: 'strategic', planningTurnNumber }` |
| `melee`      | `{ kind: 'melee', planningTurnNumber }`     |
| `tactical`   | `{ kind: 'tactical', battleId }`           |

`planningTurnNumber` matches `GameStateSnapshot.turnNumber` on main immediately after resolution simulation for that beat.
