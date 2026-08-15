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

- `game:notifyResolutionPlaybackComplete` matches the pending kind/id and completes (after push), or
- Notify kind/id mismatches or the payload is invalid (pending is **abandoned**: mutex cleared, `abandoned` consult push, OpenRouter log line), or
- `game:newGame`, `game:endTacticalBattle`, or `clearDeferredPlaybackConsultPending()` runs.

The renderer holds at most one queued playback-complete callback. Enqueue replaces any prior callback. Tactical exit and new-game teardown drop the queue without sending notify, so leftover tactical callbacks should not reach main. If a mismatch still arrives, abandonment unlatches planning and resumes Run prefetch so the session cannot hang.

Abandoned pushes:

- Strategic/melee: `IPC_GAME.postResolutionConsultation` with `{ planningTurnNumber, abandoned: true }`
- Tactical: `IPC_GAME.postTacticalBeatConsultation` with `{ kind: 'tactical', battleId, attachTacticalOpponentPlanToIpc: false, abandoned: true }`
- Player-visible line via `IPC_OPENROUTER.log` (`DEFERRED_PLAYBACK_CONSULT_ABANDONED_LOG`, error-styled)

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
