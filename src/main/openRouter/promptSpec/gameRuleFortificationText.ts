/**
 * Fortification sentences for the combat-rules paragraph and the production cost line.
 *
 * Purpose: Keeps that wording out of the combat-rules module.
 * When to use: `buildRulesSections` and `buildProductionCostRulesLine`.
 * Expected outcome: The combat rule is omitted when `includeFortificationRule` is false. When that flag is true, a battle hears the cell sentence and a strategic consult hears the hex sentence. When the flag is omitted, a strategic consult still hears the hex sentence and a battle hears the cell sentence only when a cell is fortified. The queue name and cost appear only on the production line.
 * Exceptions: None. A type import of the gate type avoids a runtime cycle.
 */

import type { GameRuleTextGates } from './gameRuleText';
import { fortificationCostPerCell } from '../../../shared/gameRules';
import { logTrace } from '../../logger';

const STRATEGIC_FORTIFICATION_RULE =
  'Fortifications: a hex\'s controller may fortify its intact city cells through production, one cell per item. Every hit that would destroy one of the controller\'s units in a fortified hex destroys one fortification instead, until none remain. Control of a fortified hex cannot change while any fortification remains. Units alone in an enemy fortified hex roll their attack against the fortifications each turn. A ranged_attack may target an explored enemy fortified hex that holds no units. This is the one ranged target you may order without a Best Options row. Air strikes and missiles remove a cell\'s fortification before they can destroy the cell.';

const TACTICAL_FORTIFICATION_RULE =
  'Fortified cells (F for yours, f for the enemy\'s) belong to the controller of their hex, and enemy units cannot enter them. Inside the battle hex, each fortified cell absorbs one hit aimed at its owner\'s units on that cell, and fire at it removes the fortification first.';

/**
 * The fortification combat rule for this consultation, or null when this mode should not hear it.
 *
 * Purpose: A consultation that cannot fortify, and a battle with no fortified cell, do not hear the rule.
 * When to use: Once per combat-rules paragraph, after the missile sentence. `rules` passes the flag true.
 * Expected outcome: Null when `includeFortificationRule` is false. The strategic paragraph or the tactical paragraph when the flag is true. When the flag is omitted, the strategic paragraph, or the tactical paragraph only when `hasFortifiedCells` is true.
 * Exceptions: None.
 */
export function buildFortificationRule(gates: GameRuleTextGates): string | null {
  const tactical = gates.coordinateMode === 'tactical';
  logTrace('promptSpec buildFortificationRule', {
    tactical,
    hasFortifiedCells: gates.hasFortifiedCells === true,
    includeFortificationRule: gates.includeFortificationRule !== false,
  });
  if (gates.includeFortificationRule === false) return null;
  if (gates.includeFortificationRule === true) {
    return tactical ? TACTICAL_FORTIFICATION_RULE : STRATEGIC_FORTIFICATION_RULE;
  }
  if (!tactical) return STRATEGIC_FORTIFICATION_RULE;
  return gates.hasFortifiedCells === true ? TACTICAL_FORTIFICATION_RULE : null;
}

/**
 * The production-cost fragment for one fortified city cell.
 *
 * Purpose: The queue item and its cost stay on the production line, so a consultation without production tools is not told to queue one.
 * When to use: The end of `buildProductionCostRulesLine`.
 * Expected outcome: The cost from `fortificationCostPerCell` and the queue name `fortification`.
 * Exceptions: None.
 */
export function buildFortificationProductionRulePart(): string {
  const cost = fortificationCostPerCell();
  logTrace('promptSpec buildFortificationProductionRulePart', { cost });
  return `fortification cost ${cost} per city cell (queue unitType "fortification", one cell per item)`;
}
