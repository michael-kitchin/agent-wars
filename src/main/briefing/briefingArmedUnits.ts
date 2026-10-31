/**
 * Armed-units attention bullet for strategic and tactical briefings.
 */

import { logTrace } from '../logger';
import type { UnitAssessmentResult } from '../precomputation';

/**
 * True when a strategic armor or naval unit's only in-range fight is same-hex contact.
 *
 * Purpose: Those units stay on the armed-units bullet, and a ranged_attack order is not their listed fight.
 * When to use: Partitioning the ids already chosen for the armed-units bullet.
 * Expected outcome: True only for strategic armor or naval whose every non-none attack row is melee. False when the assessment is missing, the mode is tactical, the unit is another type, or any in-range row is not melee.
 * Exceptions: None.
 */
export function isSameHexContactOnly(
  assessment: UnitAssessmentResult | undefined,
  coordinateMode: 'strategic' | 'tactical'
): boolean {
  const unitType = assessment?.result.unit?.type;
  const sameHex =
    !!assessment &&
    coordinateMode === 'strategic' &&
    (unitType === 'armor' || unitType === 'naval') &&
    sameHexMeleeOnly(assessment);
  logTrace('briefingArmedUnits isSameHexContactOnly', { coordinateMode, unitType: unitType ?? null, sameHex });
  return sameHex;
}

/**
 * True when every listed attack on the assessment is melee.
 *
 * Purpose: Same-hex contact is melee-only. A mixed row list is a shot the model can copy.
 * When to use: From `isSameHexContactOnly` after the type and mode checks.
 * Expected outcome: True when at least one attack row exists and none of them is a non-melee attack.
 * Exceptions: None.
 */
function sameHexMeleeOnly(assessment: UnitAssessmentResult): boolean {
  const rows = (assessment.result.canAttackThisTurn ?? []) as Array<{ attackType?: unknown }>;
  const attacks = rows.filter((row) => typeof row.attackType === 'string' && row.attackType !== 'none');
  return attacks.length > 0 && attacks.every((row) => row.attackType === 'melee');
}

/**
 * Writes the single armed-units bullet.
 *
 * Purpose: Same-hex armor and naval stay on the list, and the sentence must not tell them to order a ranged_attack.
 * When to use: After the armed-unit ids are sliced to `ATTENTION_ARMED_UNITS_LISTED`.
 * Expected outcome: One sentence. The shot clause tells the model to copy a listed Best Options row and not invent a target. The contact clause names strategic armor and naval whose only in-range row is melee and tells the model to stay for that melee. The overflow suffix counts the combined remainder.
 * Exceptions: None.
 */
export function armedUnitsBulletText(args: {
  listedIds: readonly string[];
  overflow: number;
  assessmentsById: ReadonlyMap<string, UnitAssessmentResult>;
  coordinateMode: 'strategic' | 'tactical';
  period: 'beat' | 'turn';
  hasAirShooter: boolean;
}): string {
  logTrace('briefingArmedUnits armedUnitsBulletText', {
    listedCount: args.listedIds.length,
    overflow: args.overflow,
    coordinateMode: args.coordinateMode,
    hasAirShooter: args.hasAirShooter,
  });
  const shotIds: string[] = [];
  const contactIds: string[] = [];
  for (const id of args.listedIds) {
    if (isSameHexContactOnly(args.assessmentsById.get(id), args.coordinateMode)) {
      contactIds.push(id);
    } else {
      shotIds.push(id);
    }
  }
  const count = args.listedIds.length + args.overflow;
  const overflowText = args.overflow > 0 ? `, and ${args.overflow} more marked Action needed = yes` : '';
  const attackKinds = args.hasAirShooter ? 'a Best Options ranged or air-strike row' : 'a Best Options ranged row';
  const clauses: string[] = [];
  if (shotIds.length > 0) {
    clauses.push(`copy ${attackKinds} for each and do not invent a target: ${shotIds.join(', ')}`);
  }
  if (contactIds.length > 0) {
    clauses.push(
      `do not order a ranged_attack for ${contactIds.join(', ')}, they are already in contact, and melee resolves if they stay`
    );
  }
  return `${count} unit(s) have a legal attack this ${args.period} — ${clauses.join('; ')}${overflowText}.`;
}
