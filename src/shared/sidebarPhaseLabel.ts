/**
 * Player-facing sidebar phase sentence for strategic play and an active battle.
 *
 * Purpose: Keeps the tactical sentences in one place so the sidebar does not invent them from the strategic phase id.
 * When to use: From the sidebar refresh after reading whether a match, a battle, and beat playback are active.
 * Expected outcome: An em dash with no match, a tactical sentence while a battle is active, otherwise `Phase: ` plus the strategic label.
 * Exceptions: None.
 */

/**
 * Chooses the sidebar phase line from match, battle, and beat-playback flags.
 *
 * Purpose: The right panel must say tactical planning or tactical resolution during a battle, and the strategic label otherwise.
 * When to use: Whenever the phase line is refreshed. Pass the already-formatted strategic label; this function does not capitalize it.
 * Expected outcome: `—` when `hasGameState` is false; `Phase: Tactical resolution` when a battle and beat playback are both active; `Phase: Tactical planning` when a battle is active and playback is not; otherwise `Phase: ` plus `strategicPhaseLabel`.
 * Exceptions: None.
 */
export function formatSidebarPhaseText(args: {
  hasGameState: boolean;
  strategicPhaseLabel: string;
  battleActive: boolean;
  beatPlaybackActive: boolean;
}): string {
  if (!args.hasGameState) return '—';
  if (args.battleActive && args.beatPlaybackActive) return 'Phase: Tactical resolution';
  if (args.battleActive) return 'Phase: Tactical planning';
  return `Phase: ${args.strategicPhaseLabel}`;
}
