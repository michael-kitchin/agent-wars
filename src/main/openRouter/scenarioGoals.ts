import type { GameStateSnapshot } from '../gameDb';
import { logDebug } from '../logger';
import { SECTION_TITLE_SCENARIO_OBJECTIVE, topLevelHeading } from './promptSpec/sectionHeadings';

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
 * The generic objective used when the snapshot has no recognised scenario id.
 *
 * Purpose: A prompt without `region_vs_region` must still name a goal, and must not reuse home-region wording.
 * When to use: `buildWinConditionReminderClause` for an absent or unrecognised id.
 * Expected outcome: Destroy-the-force or take-territory language with no home-region or urban-production clause.
 * Exceptions: None.
 */
export const GENERIC_OBJECTIVE_SENTENCE =
  'Your goal is to destroy the enemy force or take enemy territory.';

/**
 * Builds the early win-condition paragraph for the strategic system prompt.
 *
 * Purpose: States how this consultation is won, matching the scenario the snapshot actually carries.
 * When to use: Strategic `buildSystemPromptForTools` after the opening line.
 * Expected outcome: Home-region wording only for `region_vs_region`; otherwise the generic objective with no reused home-region sentences.
 * Exceptions: None.
 */
export function buildWinConditionReminderClause(args: { readonly scenarioId?: string | null }): string {
  logDebug('scenarioGoals buildWinConditionReminderClause', { scenarioId: args.scenarioId });
  if (args.scenarioId === 'region_vs_region') {
    return `${WIN_CONDITION_REMINDER_FIRST_SENTENCE} ${WIN_CONDITION_REMINDER_SECOND_SENTENCE}`;
  }
  return `${GENERIC_OBJECTIVE_SENTENCE}`;
}

/**
 * Battle-local goal sentence for tactical system prompts (no regional win-condition text).
 *
 * Purpose: Keeps tactical beats focused on engaging forces inside the footprint without restating strategic home-region victory.
 * When to use: `buildSystemPromptForTools` when `coordinateContext.mode === 'tactical'`.
 * Expected outcome: Short engage-and-defeat reminder plus pointer to combat/order rules below.
 * Exceptions: None.
 */
export function buildTacticalBattleGoalClause(): string {
  logDebug('scenarioGoals buildTacticalBattleGoalClause', {});
  return 'Your goal is to engage and defeat enemy forces in this battle. Review the rules, below, for how to order this.';
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
    topLevelHeading(SECTION_TITLE_SCENARIO_OBJECTIVE),
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
