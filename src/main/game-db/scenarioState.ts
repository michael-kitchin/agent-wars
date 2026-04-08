import type { DbReadOps, DbWriteOps } from './dbOps';
import { logDebug, logTrace } from '../logger';

export const REGION_VS_REGION_SCENARIO_ID = 'region_vs_region' as const;
export const SCENARIO_ID_KEY = 'scenario_id';
export const HUMAN_HOME_REGION_KEY = 'scenario_region_human';
export const AI_HOME_REGION_KEY = 'scenario_region_ai';

export interface ScenarioStateSnapshot {
  scenarioId: string;
  humanHomeRegion: string;
  aiHomeRegion: string;
}

/**
 * Why this exists:
 *     Provides one typed read path for persisted scenario config keys in `game_config`.
 * When to use:
 *     Any backend flow that needs scenario id or selected home regions.
 * What to expect:
 *     Returns empty strings when keys are missing.
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
 * Why this exists:
 *     Persists normalized region-vs-region scenario config keys consistently in one place.
 * When to use:
 *     New-game reset flow after region selection has been validated.
 * What to expect:
 *     Upserts scenario id and both region keys atomically at caller transaction boundaries.
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
