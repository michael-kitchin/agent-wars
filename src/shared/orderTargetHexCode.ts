/**
 * The hex code an order or a selection names: `E5` on the world map, `E8.K3` for a cell inside a battle.
 *
 * The codes are the ones the hex tooltip shows in parentheses, so a player can match a row to a hex.
 */
import { getStrategicHexCode } from './hexLlmCodeAssignment';
import { tacticalBattleHexCode } from './tacticalBattleFootprint';

/**
 * The part of a battle snapshot that a cell's code depends on.
 *
 * Purpose: Callers pass the live battle snapshot; tests pass only this field.
 * When to use: While a battle is active.
 * Expected outcome: The enclosing world hex of the battle.
 * Exceptions: None.
 */
export interface OrderHexCodeBattle {
  /**
   * The world hex the battle is fought in.
   *
   * Contract: A strategic H3 index.
   * When to use: Always.
   * Expected outcome: Its code is the part before the dot.
   * Exceptions: None.
   */
  readonly enclosingStrategicH3Index: string;
}

/**
 * Returns the code for the hex an order targets, or for the hex a selected unit stands in.
 *
 * Purpose: Order rows and the selection panel name hexes the way the hex tooltip does.
 * When to use: Pass the active battle during a battle, otherwise null.
 * Expected outcome: The world hex's two-character code, or `XX.YY` for a battle cell. Null when the index is
 *   missing or is not a hex of the current map or battle.
 * Exceptions: None. An invalid index returns null.
 */
export function orderTargetHexCode(h3Index: string | null, battle: OrderHexCodeBattle | null): string | null {
  if (!h3Index) return null;
  try {
    if (!battle) return getStrategicHexCode(h3Index) ?? null;
    const parentCode = getStrategicHexCode(battle.enclosingStrategicH3Index);
    const cellCode = tacticalBattleHexCode(battle.enclosingStrategicH3Index, h3Index);
    return parentCode && cellCode ? `${parentCode}.${cellCode}` : null;
  } catch {
    return null;
  }
}
