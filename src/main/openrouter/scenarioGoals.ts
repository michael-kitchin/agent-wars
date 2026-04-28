import type { GameStateSnapshot } from '../gameDb';
import { logDebug } from '../logger';

/** First sentence of the strategic/tactical win reminder (single source for prompts and matrix tests). */
export const WIN_CONDITION_REMINDER_FIRST_SENTENCE =
  'Your goal is to win the game, and to achieve this you must control all enemy home region hexes or destroy all enemy home region production capacity.';

const WIN_CONDITION_REMINDER_SECOND_SENTENCE =
  'Enemy units can be destroyed through ranged and melee combat, and production capacity can be destroyed through air strikes. Review the rules, below, for how to order this.';

/** Substring matched by matrix tests for the control-based branch of the scenario objective. */
export const REGION_VS_REGION_SCENARIO_WIN_CONTROL_SNIPPET =
  'Controlling all hexes intersecting the enemy home region';

/** Substring matched by matrix tests for the urban-elimination branch of the scenario objective. */
export const REGION_VS_REGION_SCENARIO_WIN_URBAN_SNIPPET =
  'Eliminating all urban production (res4 urban hexes) in the enemy home region';

const REGION_VS_REGION_SCENARIO_WIN_BLOCK =
  '- Win at end of turn by either:\n' +
  `    (1) ${REGION_VS_REGION_SCENARIO_WIN_CONTROL_SNIPPET}, OR\n` +
  `    (2) ${REGION_VS_REGION_SCENARIO_WIN_URBAN_SNIPPET}.`;

/**
 * Defines the `buildWinConditionReminderClause` function shape (export function buildWinConditionReminderClause(): string).

 * Purpose: Early paragraph in the system prompt after turn/phase; states win conditions consistent with `region_vs_region` rules and how combat vs strikes apply.
 * When to use: Always appended in `buildSystemPromptForTools` after the opening line so the model sees objectives alongside combat coaching.
 * Expected outcome: Plain-language reminder referencing enemy-home hex control or destruction of enemy-home production capacity; unchanged when scenario rules evolve (update here and Scenario Objective in tandem).
 * Exceptions: None.
 */
export function buildWinConditionReminderClause(): string {
  logDebug('scenarioGoals buildWinConditionReminderClause', {});
  return `${WIN_CONDITION_REMINDER_FIRST_SENTENCE} ${WIN_CONDITION_REMINDER_SECOND_SENTENCE}`;
}

/**
 * Builds the Markdown “Scenario Objective” section for `region_vs_region`, or an empty string for other scenarios.
 *
 * Contract: When `state.scenarioId === 'region_vs_region'`, returns a fixed heading plus home-region labels (when present) and win paths aligned with `evaluateRegionControlWinnerAtEndOfTurn`; otherwise returns ''.
 * When to use: Strategic system prompt assembly only (`buildSystemPromptForTools`), not tactical-only prompts unless explicitly wired.
 * Expected outcome: Multi-line string listing scenario id, optional “Your home region” / “Enemy home region” lines from state, win bullets for full enemy-home control or enemy-home urban elimination, and visibility note.
 * Exceptions: None.
 */
export function buildRegionVsRegionScenarioObjectiveBlock(state: GameStateSnapshot): string {
  logDebug('scenarioGoals buildRegionVsRegionScenarioObjectiveBlock', { scenarioId: state.scenarioId });
  if (state.scenarioId !== 'region_vs_region') return '';
  const lines: string[] = [
    '# Scenario Objective (Required)',
    '',
    '- Scenario: region_vs_region',
  ];
  const aiName = typeof state.aiHomeRegion === 'string' ? state.aiHomeRegion.trim() : '';
  const humanName = typeof state.humanHomeRegion === 'string' ? state.humanHomeRegion.trim() : '';
  if (aiName.length > 0) {
    lines.push(`- Your home region: ${aiName}`);
  }
  if (humanName.length > 0) {
    lines.push(`- Enemy home region: ${humanName}`);
  }
  lines.push(REGION_VS_REGION_SCENARIO_WIN_BLOCK);
  lines.push('- Both home-region outlines are always visible on the map.');
  return lines.join('\n');
}
