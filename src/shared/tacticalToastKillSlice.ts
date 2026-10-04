import type { KillEdge } from './ipc/combatResultTypes';
import type { TacticalCommitResolutionPlayback } from './ipc/tacticalPlaybackTypes';

/**
 * Returns kill edges that belong in `ReadyResult.kills` for tactical commit toasts, matching strategic Ready semantics.
 *
 * Purpose: Strategic `kills` combines ranged and melee edges only; air strike casualties are summarized separately via
 * `airStrikeRemovedUnits`, infrastructure events, and the air strike summary line — not as `• Direct fire` / pseudo-melee lines.
 * When to use: Only when adapting `TacticalCommitResolutionPlayback` into a `ReadyResult`-shaped tactical toast slice.
 * Expected outcome: Direct-fire, return-fire, and melee victims; air strike victim ids are omitted here even when present in playback.
 * Exceptions: None.
 */
export function tacticalKillEdgesForStrategicStyleTurnUpdate(
  playback: Pick<TacticalCommitResolutionPlayback, 'killsByDirectFire' | 'killsByReturnFire' | 'killsByMelee'>
): KillEdge[] {
  return [
    ...(playback.killsByDirectFire ?? []),
    ...(playback.killsByReturnFire ?? []),
    ...(playback.killsByMelee ?? []),
  ];
}
