/**
 * Composes the consultation's coaching bullets from the mode modules and the active gates.
 *
 * Purpose: strategic-prompt.md section 4 and tactical-prompt.md section 4 are membership lists.
 * One function is the only place "all of them are present" can be asserted.
 * When to use: Available Tools guidance, after roster and tool flags are known.
 * Expected outcome: A bullet list for the current mode; gated items are absent when their flag is off.
 * Exceptions: None.
 */

import { logDebug, logTrace } from '../../logger';
import type { CoachingGates } from './coachingGates';
import { buildStrategicCoachingSections, buildStrategicContextCoaching } from './coachingTextStrategic';
import { buildTacticalCoachingSections, buildTacticalContextCoaching } from './coachingTextTactical';
import { SECTION_TITLE_ORDERS_GUIDANCE, subHeading, topLevelHeading } from './sectionHeadings';

export type { CoachingGates } from './coachingGates';

/**
 * One Orders Guidance subsection.
 *
 * Purpose: The composer prints a heading and these bullets, and the flat list concatenates them.
 * When to use: The return of `buildCoachingSections`.
 * Expected outcome: A title and at least one bullet. Empty sections are not returned.
 * Exceptions: None.
 */
export interface CoachingSection {
  /**
   * Subsection title, without hashes.
   *
   * Contract: One of the Orders Guidance titles.
   * When to use: The H2 under `# Orders Guidance`.
   * Expected outcome: A short topic name.
   * Exceptions: None.
   */
  readonly title: string;
  /**
   * Bullets for this topic, including their indented continuation lines.
   *
   * Contract: Each entry already starts with `- `. An empty list means the section was omitted.
   * When to use: Printed one per line under the subsection.
   * Expected outcome: The same sentences the flat list used to contain.
   * Exceptions: None.
   */
  readonly bullets: readonly string[];
}

/**
 * Returns the Orders Guidance sections for this consultation.
 *
 * Purpose: Coaching is grouped by topic. A topic with no bullets is omitted.
 * When to use: `buildOrdersGuidanceSection` and `buildCoachingBullets`.
 * Expected outcome: Strategic or tactical sections, in the order the outline names.
 * Exceptions: None.
 */
export function buildCoachingSections(gates: CoachingGates): readonly CoachingSection[] {
  logDebug('promptSpec buildCoachingSections', { coordinateMode: gates.coordinateMode });
  return gates.coordinateMode === 'tactical'
    ? buildTacticalCoachingSections(gates)
    : buildStrategicCoachingSections(gates);
}

/**
 * Returns the section-4 coaching bullets for this consultation.
 *
 * Purpose: Tests and older callers still read one list. The list is the sections in order.
 * When to use: After constructing `CoachingGates` from the same flags the rest of the prompt used.
 * Expected outcome: Markdown bullets beginning with `- `.
 * Exceptions: None.
 */
export function buildCoachingBullets(gates: CoachingGates): readonly string[] {
  logTrace('promptSpec buildCoachingBullets', { coordinateMode: gates.coordinateMode });
  return buildCoachingSections(gates).flatMap((section) => section.bullets);
}

/**
 * Renders `# Orders Guidance` and its subsections.
 *
 * Purpose: Coaching leaves the tool-usage section, which now holds tool lines only.
 * When to use: After Available Tools and before Response Format.
 * Expected outcome: The heading, then each section as an H2 and its bullets. '' when there are no bullets.
 * Exceptions: None.
 */
export function buildOrdersGuidanceSection(gates: CoachingGates): string {
  const sections = buildCoachingSections(gates);
  logDebug('promptSpec buildOrdersGuidanceSection', { coordinateMode: gates.coordinateMode, sections: sections.length });
  if (sections.length === 0) return '';
  const body = sections
    .map((section) => `${subHeading(section.title)}\n\n${section.bullets.join('\n')}`)
    .join('\n\n');
  return `${topLevelHeading(SECTION_TITLE_ORDERS_GUIDANCE)}\n\n${body}`;
}

/**
 * Returns the goals, strategy, and message lines for the Strategic Context and Battle Context sections.
 *
 * Purpose: Those three bullets are doctrine and player-facing guidance, not computed state.
 * When to use: Under the Strategic Context or Battle Context heading, before the progress lines.
 * Expected outcome: Strategic five-goal list plus shared strategy and message; tactical one-priority list plus the same strategy and message.
 * Exceptions: None.
 */
export function buildContextCoaching(gates: CoachingGates): string {
  logDebug('promptSpec buildContextCoaching', { coordinateMode: gates.coordinateMode });
  return gates.coordinateMode === 'tactical'
    ? buildTacticalContextCoaching(gates)
    : buildStrategicContextCoaching(gates);
}
