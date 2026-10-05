/**
 * `assess_unit` field for a unit's tech tier.
 *
 * Purpose: The tool reports the tier without adding a function to the assessment module.
 * When to use: Spread into a unit block. A missing tier means the option is off.
 * Expected outcome: `{ techLevel }` for `basic` or `advanced`, otherwise `{}`.
 * Exceptions: None.
 */

import { logTrace } from '../logger';
import type { TechLevel } from '../../shared/techBonusTypes';

/**
 * Returns the tech field for one unit block.
 *
 * Purpose: Basic and Advanced are both reported when the match stamped a tier. Off matches stamp nothing.
 * When to use: Strategic and tactical `assess_unit` results, and the briefing assessments those results feed.
 * Expected outcome: An empty object when `techLevel` is missing or not a tier.
 * Exceptions: None.
 */
export function techLevelAssessmentField(techLevel: string | null | undefined): { readonly techLevel?: TechLevel } {
  logTrace('techBonus techLevelAssessmentField', { techLevel: techLevel ?? null });
  if (techLevel === 'basic' || techLevel === 'advanced') return { techLevel };
  return {};
}
