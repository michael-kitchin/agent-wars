import type { GameStateSnapshot } from '../gameDb';
import { logDebug } from '../logger';

/**
 * Defines the `buildPrimaryScenarioGoalOpeningClause` function shape (export function buildPrimaryScenarioGoalOpeningClause(): string).

 * Purpose: Supports maintainability by documenting why `buildPrimaryScenarioGoalOpeningClause` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildPrimaryScenarioGoalOpeningClause(): string {
  logDebug('scenarioGoals buildPrimaryScenarioGoalOpeningClause', {});
  return (
    'Your primary goal is to defeat the enemy by destroying all of their units and, where the rules allow, eliminating their urban areas through strikes.'
  );
}

/**
 * Defines the `buildRegionVsRegionScenarioObjectiveBlock` function shape (export function buildRegionVsRegionScenarioObjectiveBlock(state: GameStateSnapshot): string).

 * Purpose: Supports maintainability by documenting why `buildRegionVsRegionScenarioObjectiveBlock` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
