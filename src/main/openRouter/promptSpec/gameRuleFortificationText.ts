/**
 * Fortification sentences for the combat-rules paragraph and the production cost line.
 *
 * Purpose: Keeps that wording out of the combat-rules module.
 * When to use: `buildCombatRulesParagraph` and `buildProductionCostRulesLine`.
 * Expected outcome: Strategic consultations always hear the combat rule. Tactical consultations hear it only when a cell is fortified. The queue name and cost appear only on the production line.
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
 * Purpose: Strategic play always has the rule. A battle hears it only when a cell in that battle is fortified.
 * When to use: Once per combat-rules paragraph, after the missile sentence.
 * Expected outcome: The strategic paragraph, the tactical paragraph when `hasFortifiedCells` is true, or null.
 * Exceptions: None.
 */
export function buildFortificationRule(gates: GameRuleTextGates): string | null {
  const tactical = gates.coordinateMode === 'tactical';
  logTrace('promptSpec buildFortificationRule', { tactical, hasFortifiedCells: gates.hasFortifiedCells === true });
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
