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
 * Documents the `ScenarioStateSnapshot` interface as a named contract surface (export interface ScenarioStateSnapshot).

 * Purpose: The stored scenario id. Home names live on the roster, not on this snapshot.
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
}

/**
 * Defines the `loadScenarioState` function shape (export function loadScenarioState(ops: Pick<DbReadOps, 'getOne'>): ScenarioStateSnapshot).

 * Purpose: Reads the scenario id from config.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function loadScenarioState(ops: Pick<DbReadOps, 'getOne'>): ScenarioStateSnapshot {
  logTrace('gameDb loadScenarioState');
  const scenarioId =
    ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [SCENARIO_ID_KEY])?.value ?? '';
  return { scenarioId };
}

/**
 * Writes the region-versus-region scenario id.
 *
 * Purpose: Homes now live on the roster. This write only marks which scenario is active.
 * When to use: At the start of a new match, before the roster is stored.
 * Expected outcome: `scenario_id` is `region_vs_region`. Home keys are not written.
 * Exceptions: Propagates SQLite errors.
 */
export function persistRegionVsRegionScenarioId(ops: Pick<DbWriteOps, 'run'>): void {
  logDebug('gameDb persistRegionVsRegionScenarioId');
  ops.run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [
    SCENARIO_ID_KEY,
    REGION_VS_REGION_SCENARIO_ID,
  ]);
}
