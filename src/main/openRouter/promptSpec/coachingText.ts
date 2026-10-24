/**
 * Composes the consultation's coaching bullets from the mode modules and the active gates.
 *
 * Purpose: strategic-prompt.md section 4 and tactical-prompt.md section 4 are membership lists.
 * One function is the only place "all of them are present" can be asserted.
 * When to use: Available Tools guidance, after roster and tool flags are known.
 * Expected outcome: A bullet list for the current mode; gated items are absent when their flag is off.
 * Exceptions: None.
 */

import { logDebug } from '../../logger';
import type { CoachingGates } from './coachingGates';
import { buildStrategicCoachingBullets, buildStrategicContextCoaching } from './coachingTextStrategic';
import { buildTacticalCoachingBullets, buildTacticalContextCoaching } from './coachingTextTactical';

export type { CoachingGates } from './coachingGates';

/**
 * Returns the section-4 coaching bullets for this consultation.
 *
 * Purpose: Available Tools guidance must list every required item whose gate is on, and none whose gate is off.
 * When to use: After constructing `CoachingGates` from the same flags the rest of the prompt used.
 * Expected outcome: Markdown bullets beginning with `- `.
 * Exceptions: None.
 */
export function buildCoachingBullets(gates: CoachingGates): readonly string[] {
  logDebug('promptSpec buildCoachingBullets', { ...gates });
  return gates.coordinateMode === 'tactical'
    ? buildTacticalCoachingBullets(gates)
    : buildStrategicCoachingBullets(gates);
}

/**
 * Returns the goals, strategy, and message lines for the `Strategic context:` block.
 *
 * Purpose: Those three bullets are doctrine and player-facing guidance, not computed state.
 * When to use: Assembler `Strategic context:` header, before the progress lines.
 * Expected outcome: Strategic five-goal list plus shared strategy and message; tactical one-priority list plus the same strategy and message.
 * Exceptions: None.
 */
export function buildContextCoaching(gates: CoachingGates): string {
  logDebug('promptSpec buildContextCoaching', { coordinateMode: gates.coordinateMode });
  return gates.coordinateMode === 'tactical'
    ? buildTacticalContextCoaching(gates)
    : buildStrategicContextCoaching(gates);
}
