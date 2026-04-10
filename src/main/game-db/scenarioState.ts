import type { DbReadOps, DbWriteOps } from './dbOps';
import { logDebug, logTrace } from '../logger';

/**
 * Documents the module-scope binding `REGION_VS_REGION_SCENARIO_ID` (REGION_VS_REGION_SCENARIO_ID).

 * Purpose: Supports maintainability by documenting why `REGION_VS_REGION_SCENARIO_ID` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const REGION_VS_REGION_SCENARIO_ID = 'region_vs_region' as const;
/**
 * Documents the module-scope binding `SCENARIO_ID_KEY` (SCENARIO_ID_KEY).

 * Purpose: Supports maintainability by documenting why `SCENARIO_ID_KEY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const SCENARIO_ID_KEY = 'scenario_id';
/**
 * Documents the module-scope binding `HUMAN_HOME_REGION_KEY` (HUMAN_HOME_REGION_KEY).

 * Purpose: Supports maintainability by documenting why `HUMAN_HOME_REGION_KEY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const HUMAN_HOME_REGION_KEY = 'scenario_region_human';
/**
 * Documents the module-scope binding `AI_HOME_REGION_KEY` (AI_HOME_REGION_KEY).

 * Purpose: Supports maintainability by documenting why `AI_HOME_REGION_KEY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const AI_HOME_REGION_KEY = 'scenario_region_ai';

/**
 * Documents the `ScenarioStateSnapshot` interface as a named contract surface (export interface ScenarioStateSnapshot).

 * Purpose: Supports maintainability by documenting why `ScenarioStateSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ScenarioStateSnapshot {
    /**
   * Specifies the contract for the `scenarioId` member (scenarioId: string;).

   * Contract: Describes stable behavior for callers of `scenarioId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
scenarioId: string;
    /**
   * Specifies the contract for the `humanHomeRegion` member (humanHomeRegion: string;).

   * Contract: Describes stable behavior for callers of `humanHomeRegion` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
humanHomeRegion: string;
    /**
   * Specifies the contract for the `aiHomeRegion` member (aiHomeRegion: string;).

   * Contract: Describes stable behavior for callers of `aiHomeRegion` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
aiHomeRegion: string;
}

/**
 * Defines the `loadScenarioState` function shape (export function loadScenarioState(ops: Pick<DbReadOps, 'getOne'>): ScenarioStateSnapshot).

 * Purpose: Supports maintainability by documenting why `loadScenarioState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function loadScenarioState(ops: Pick<DbReadOps, 'getOne'>): ScenarioStateSnapshot {
  logTrace('gameDb loadScenarioState');
  const scenarioId =
    ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [SCENARIO_ID_KEY])?.value ?? '';
  const humanHomeRegion =
    ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [HUMAN_HOME_REGION_KEY])?.value ??
    '';
  const aiHomeRegion =
    ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [AI_HOME_REGION_KEY])?.value ?? '';
  return { scenarioId, humanHomeRegion, aiHomeRegion };
}

/**
 * Defines the `persistRegionVsRegionScenarioState` function shape (export function persistRegionVsRegionScenarioState().

 * Purpose: Supports maintainability by documenting why `persistRegionVsRegionScenarioState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function persistRegionVsRegionScenarioState(
  ops: Pick<DbWriteOps, 'run'>,
  selection: { humanHomeRegion: string; aiHomeRegion: string }
): void {
  logDebug('gameDb persistRegionVsRegionScenarioState', selection);
  ops.run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [
    SCENARIO_ID_KEY,
    REGION_VS_REGION_SCENARIO_ID,
  ]);
  ops.run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [HUMAN_HOME_REGION_KEY, selection.humanHomeRegion]);
  ops.run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [AI_HOME_REGION_KEY, selection.aiHomeRegion]);
}
