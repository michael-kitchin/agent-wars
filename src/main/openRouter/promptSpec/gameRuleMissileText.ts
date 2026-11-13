/**
 * Missile sentences for the combat-rules paragraph.
 *
 * Purpose: Keeps the missile wording out of the combat-rules module, which is already near the file-size limit.
 * When to use: `buildRulesSections` and `buildCasualtySortRule`.
 * Expected outcome: The employment sentence when the seat owns a missile or, outside battle, can build one. The hit-last sentence is appended only when `buildCasualtySortRule` is told a missile is present or the roster is unknown.
 * Exceptions: None. A type import of the gate type avoids a runtime cycle.
 */

import { getAttack } from '../../combatConstants';
import { logTrace } from '../../logger';
import { buildMinimumUrbanCells, missileRangeHexes } from '../../../shared/gameRules';
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
 * Expected outcome: Empty when the seat neither owns nor can build a missile. Tactical text is the sub-unit sentence only when the roster has a missile. An owned strategic missile keeps the launch sentence. A seat that can build one and owns none gets the build sentence, with no `missileLaunches` instruction.
 * Exceptions: None.
 */
export function buildMissileEmploymentRule(gates: GameRuleTextGates): string {
  const hasMissileUnits = gates.hasMissileUnits === true;
  const canBuildMissile = gates.canBuildMissile === true;
  logTrace('promptSpec buildMissileEmploymentRule', { hasMissileUnits, canBuildMissile, mode: gates.coordinateMode });
  if (!hasMissileUnits && !canBuildMissile) return '';
  if (gates.coordinateMode === 'tactical') return hasMissileUnits ? 'Missile sub-units never move or fire.' : '';
  if (hasMissileUnits) {
    return `A missile never moves and is spent when it launches. Launch it with a missileLaunches entry at any hex you have explored within ${missileRangeHexes()} hexes. Launches resolve before air strikes and always hit: each city, airport, and seaport cell in the target hex is destroyed when its own d20 roll is at or below the air unit's attack of ${getAttack('air')}, and every air unit based there is destroyed when an airport cell is destroyed. Other units in the hex are unharmed. A missile keeps its hold_fire order and takes no other standing order.`;
  }
  return `A missile is built in a city with at least ${buildMinimumUrbanCells('missile')} urban cells. It never moves and is spent when it launches. It reaches any explored hex within ${missileRangeHexes()} hexes of the hex where it was built. A launch always hits: each city, airport, and seaport cell in the target hex is destroyed when its own d20 roll is at or below the air unit's attack of ${getAttack('air')}, and every air unit based there is destroyed when an airport cell is destroyed. Other units in the hex are unharmed.`;
}
