/**
 * Air unit rule text for the combat-rules paragraph.
 *
 * Purpose: Keeps the air wording out of the combat-rules module, which is over the file-size limit.
 * When to use: `buildRulesSections` and tests that assert the air rule on its own.
 * Expected outcome: Strike, ferry, and carry limits for air units, or an empty string when the roster has none.
 * Exceptions: None. A type import of the gate type avoids a runtime cycle.
 */

import { logTrace } from '../../logger';
import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES } from '../../../shared/tacticalRanges';
import { AIRLIFT_INFANTRY_CAPACITY } from '../../../shared/carrierCargoRules';
import { strategicFerryRangeHexes } from '../../../shared/weatherBonusRules';
import type { GameRuleTextGates } from './gameRuleText';

/**
 * Strike and ferry limits for air units, or empty when the roster has none.
 *
 * Purpose: Strategic radius comes from `AIR_STRIKE_RANGE_HEXES` / `AIR_FERRY_RANGE_HEXES`; a beat strikes anywhere in the footprint.
 * When to use: Combat paragraph when `hasAirUnits` is true; also asserted on its own.
 * Expected outcome: Tactical text never quotes the strategic strike radius.
 * Exceptions: None.
 */
export function buildAirEmploymentRule(gates: GameRuleTextGates): string {
  logTrace('promptSpec buildAirEmploymentRule', { ...gates });
  if (!gates.hasAirUnits) return '';
  if (gates.coordinateMode === 'tactical') {
    return `An air unit strikes and drops anywhere in the battle footprint and ferries one hop between intact airport cells. An air sub-unit carries up to ${AIRLIFT_INFANTRY_CAPACITY} infantry sub-units, and a drop lands all of them. A drop onto a cell fortified by the other side is illegal. A drop onto an enemy cell is fought in melee if both remain.`;
  }
  const snowHop = strategicFerryRangeHexes({ weatherAtDestination: 'snow', tags: [], enabled: true });
  return [
    `An air unit ferries any distance in one turn by hopping controlled intact airports. Each hop is at most ${AIR_FERRY_RANGE_HEXES} hexes, or ${snowHop} into snow when the unit lacks the snow tag.`,
    `It strikes within ${AIR_STRIKE_RANGE_HEXES} hexes of its current airport. It does not strike from the end of a ferry on the same turn.`,
    `It carries up to ${AIRLIFT_INFANTRY_CAPACITY} infantry units. embark with that air unit's id in navalUnitId loads one infantry unit on the same hex; give one embark row per unit. disembark clears the assignment and then marches the infantry by normal land movement. The destination does not have to be a port or a coast. A destination of the current hex unloads and stays. ferryOrders carries the infantry along. While aboard, the infantry cannot fight and is destroyed if the air unit is destroyed.`,
    `airDrops lands every infantry unit aboard on a land hex within ${AIR_STRIKE_RANGE_HEXES} of the current airport, including an enemy hex, and the air unit stays based where it is. Enemy units there may shoot the air unit down; if they do, all of that infantry is lost. A drop and a strike cannot both be ordered. A drop and a ferry cannot both be ordered.`,
    'When infantry cannot reach the fight by land this turn, embark it on air and drop it, or ferry it through airports, when a chain exists. Use a ship when no airport chain reaches.',
  ].join('\n\n');
}
