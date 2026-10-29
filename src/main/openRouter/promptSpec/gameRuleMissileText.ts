/**
 * Missile sentences for the combat-rules paragraph.
 *
 * Purpose: Keeps the missile wording out of the combat-rules module, which is already near the file-size limit.
 * When to use: `buildCombatRulesParagraph` and `buildCasualtySortRule`.
 * Expected outcome: The employment sentence only when the roster has a missile. The casualty sentence always.
 * Exceptions: None. A type import of the gate type avoids a runtime cycle.
 */

import { logTrace } from '../../logger';
import { missileRangeHexes } from '../../../shared/gameRules';
import type { GameRuleTextGates } from './gameRuleText';

/**
 * Says a missile is removed after every other type.
 *
 * Purpose: Defense 0 would otherwise put a missile first. The engine removes it last.
 * When to use: The end of `buildCasualtySortRule`.
 * Expected outcome: Appended after the type-order sentence.
 * Exceptions: None.
 */
export const MISSILE_CASUALTY_ORDER_SENTENCE = 'Missiles are always hit last.';

/**
 * The missile employment sentence for this consultation, or empty when the roster has none.
 *
 * Purpose: The model must know a missile cannot move, how a launch is ordered, and what it destroys.
 * When to use: Once per combat-rules paragraph, after the air sentence.
 * Expected outcome: Empty unless `gates.hasMissileUnits` is true. Strategic text names the range in hexes and a d20 per flag. Tactical text says sub-units never move or fire.
 * Exceptions: None.
 */
export function buildMissileEmploymentRule(gates: GameRuleTextGates): string {
  logTrace('promptSpec buildMissileEmploymentRule', { hasMissileUnits: gates.hasMissileUnits === true, mode: gates.coordinateMode });
  if (gates.hasMissileUnits !== true) return '';
  if (gates.coordinateMode === 'tactical') return 'Missile sub-units never move or fire.';
  return `A missile never moves and is spent when it launches. Launch it with a missileLaunches entry at any hex you have explored within ${missileRangeHexes()} hexes. Launches resolve before air strikes and always hit: each city, airport, and seaport cell in the target hex is destroyed unless its own d20 roll is a 20, and every air unit based there is destroyed when an airport cell is destroyed. Other units in the hex are unharmed. A missile keeps its hold_fire order and takes no other standing order.`;
}
