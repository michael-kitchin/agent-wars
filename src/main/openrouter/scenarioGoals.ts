import type { GameStateSnapshot } from '../gameDb';
import { logDebug } from '../logger';

/**
 * Why this exists:
 *     Centralizes scenario win-condition text for AI prompts so objectives stay consistent and can evolve per scenario later.
 * When to use:
 *     When assembling the opponent system prompt opening line and any scenario-specific objective blocks.
 * What to expect:
 *     Returns concise, scenario-appropriate goal prose (wording may change; semantics stay stable).
 */
export function buildPrimaryScenarioGoalOpeningClause(): string {
  logDebug('scenarioGoals buildPrimaryScenarioGoalOpeningClause', {});
  return (
    'Your primary goal is to defeat the enemy by destroying all of their units and, where the rules allow, eliminating their urban areas through strikes.'
  );
}

/**
 * Why this exists:
 *     Builds the region-vs-region objective block with optional homeland names omitted when unknown.
 * When to use:
 *     Only when `state.scenarioId === 'region_vs_region'` during prompt assembly.
 * What to expect:
 *     Multi-line markdown block or empty string when not applicable.
 */
export function buildRegionVsRegionScenarioObjectiveBlock(state: GameStateSnapshot): string {
  logDebug('scenarioGoals buildRegionVsRegionScenarioObjectiveBlock', { scenarioId: state.scenarioId });
  if (state.scenarioId !== 'region_vs_region') return '';
  const lines: string[] = [
    '=== SCENARIO OBJECTIVE (REQUIRED) ===',
    'Scenario: region_vs_region',
  ];
  const aiName = typeof state.aiHomeRegion === 'string' ? state.aiHomeRegion.trim() : '';
  const humanName = typeof state.humanHomeRegion === 'string' ? state.humanHomeRegion.trim() : '';
  if (aiName.length > 0) {
    lines.push(`Your home region: ${aiName}`);
  }
  if (humanName.length > 0) {
    lines.push(`Opponent home region: ${humanName}`);
  }
  lines.push('Win at end of turn by either:');
  lines.push('1) Controlling all hexes intersecting the opponent home region, OR');
  lines.push('2) Destroying all opponent units.');
  lines.push('Both home-region outlines are always visible on the map.');
  return lines.join('\n');
}
