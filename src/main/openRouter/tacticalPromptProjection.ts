/**
 * Builds a compact tactical-only context block for future tactical AI prompts.
 * Strategic production, standing orders, and AI-memory sections must be omitted from tactical prompts; this module supplies the allowed tactical slice.
 */

import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { tacticalLogQuery } from '../tacticalBattle/tacticalLogging';

/**
 * Substrings that must not appear in a tactical-only AI context block (strategic tool / JSON tails).
 *
 * Contract: Lowercased comparison in `tacticalAiContextBlockOmitsStrategicToolMarkers`.
 * When to use: Contract tests and future prompt assembly guards before sending tactical prompts to the model.
 * Expected outcome: Each entry is a stable marker tied to strategic-only JSON or briefing sections.
 * Exceptions: None.
 */
export const TACTICAL_AI_PROMPT_STRATEGIC_SECTION_MARKERS = [
  'memoryupdates',
  'productionorders',
  'query_production',
  'enemyintel',
  'set_build_queue',
] as const;

/**
 * Serializes the active tactical battle into a plain-text block suitable for appending to a tactical system prompt.
 *
 * Contract: Includes only tactical geometry, turn counters, and sub-unit rows; never includes strategic tool JSON keys listed in `TACTICAL_AI_PROMPT_STRATEGIC_SECTION_MARKERS`.
 * When to use: Once `requestOrders` gains a tactical mode, prepend or append this block instead of strategic briefing sections.
 * Expected outcome: Deterministic line-oriented text the model can ground on for tactical-scoped orders.
 * Exceptions: None.
 */
export function buildTacticalAiOrdersContextBlock(snapshot: TacticalBattleSnapshot): string {
  tacticalLogQuery('buildTacticalAiOrdersContextBlock', {
    battleId: snapshot.battleId,
    subUnitCount: snapshot.subUnits.length,
    tacticalCount: snapshot.tacticalChildH3Indexes.length,
  });
  const lines = [
    '=== Tactical battle (resolution-4) context ===',
    `battle_id: ${snapshot.battleId}`,
    `enclosing_strategic: ${snapshot.enclosingStrategicH3Index}`,
    `strategic_turn_number: ${snapshot.strategicTurnNumber}`,
    `tactical_turn_number: ${snapshot.tacticalTurnNumber}`,
    'tactical_cells:',
    ...snapshot.tacticalChildH3Indexes.map((h) => `  - ${h}`),
    'tactical_sub_units:',
    ...snapshot.subUnits.map(
      (u) =>
        `  - id=${u.id} parent=${u.parentUnitId} player=${u.player} type=${u.unitType} tactical=${u.h3Index} display_name=${JSON.stringify(u.displayName)}`
    ),
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * Returns true when the tactical context block contains none of the forbidden strategic markers.
 *
 * Contract: Case-insensitive substring scan for each entry in `TACTICAL_AI_PROMPT_STRATEGIC_SECTION_MARKERS`.
 * When to use: Automated tests validating tactical prompt slices stay free of strategic-only tool vocabulary.
 * Expected outcome: True for blocks produced solely by `buildTacticalAiOrdersContextBlock` with benign display names.
 * Exceptions: None.
 */
export function tacticalAiContextBlockOmitsStrategicToolMarkers(block: string): boolean {
  tacticalLogQuery('tacticalAiContextBlockOmitsStrategicToolMarkers', { chars: block.length });
  const lower = block.toLowerCase();
  for (const m of TACTICAL_AI_PROMPT_STRATEGIC_SECTION_MARKERS) {
    if (lower.includes(m)) return false;
  }
  return true;
}
