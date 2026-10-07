/**
 * Memoizes merged tactical terrain override rows for the renderer on a cheap DB aggregate signature.
 *
 * Purpose: Avoid rebuilding ~45k-row renderer merges when `res_t_feature_overrides` is unchanged between Ready refreshes.
 * When to use: Only from `getTacticalTerrainOverridesForRendererFromGame` in `controlInfrastructure.ts`.
 * Expected outcome: Identical row arrays for identical DB flag aggregates; invalidates on INSERT/UPDATE that moves any SUM or COUNT.
 * Exceptions: If `terrain_kind` ever becomes UPDATEable in-match, extend the signature query (today it is INSERT-only).
 */

import { logDebug, logTrace } from '../logger';
import type { BasicDbOps } from './dbOps';

/** Row shape returned to renderer IPC callers. */
export type TacticalRendererOverrideRow = {
  h3Index: string;
  terrainKind: string;
  isUrban: boolean;
  isAirport?: boolean;
  isSeaport?: boolean;
  isRubble?: boolean;
};

/**
 * Cached merge result keyed by a cheap aggregate signature over mutable override columns.
 *
 * Purpose: Holds the last built row list when the signature matches the live DB state.
 * When to use: Module-private; cleared in tests via `clearTacticalRendererOverrideCacheForTests`.
 * Expected outcome: Null when no cache entry exists yet.
 * Exceptions: None.
 */
let rendererOverrideCache: { signature: string; rows: TacticalRendererOverrideRow[] } | null = null;

/**
 * Computes a signature that changes on every in-match mutation of `res_t_feature_overrides` flag columns or row count.
 *
 * Purpose: Single cheap scan replaces trigger-based JS invalidation.
 * When to use: Before returning cached renderer override rows.
 * Expected outcome: Stable string for unchanged tables; different string after flag flips or INSERT (COUNT change).
 * Exceptions: Propagates SQLite errors from `ops.getOne`.
 */
function computeTacticalFeatureOverrideSignature(ops: BasicDbOps): string {
  logTrace('res4RendererOverrideCache computeRes4FeatureOverrideSignature');
  const row = ops.getOne<{
    c: number;
    u: number;
    a: number;
    s: number;
    r: number;
  }>(
    `SELECT COUNT(*) AS c,
            COALESCE(SUM(is_urban), 0) AS u,
            COALESCE(SUM(is_airport), 0) AS a,
            COALESCE(SUM(is_seaport), 0) AS s,
            COALESCE(SUM(is_rubble), 0) AS r
     FROM res_t_feature_overrides`
  );
  return `${row?.c ?? 0}|${row?.u ?? 0}|${row?.a ?? 0}|${row?.s ?? 0}|${row?.r ?? 0}`;
}

/**
 * Returns renderer override rows, reusing the cached merge when the DB signature is unchanged.
 *
 * Purpose: Public entry for `controlInfrastructure.getTacticalTerrainOverridesForRendererFromGame`.
 * When to use: Every renderer/tactical refresh that needs merged tactical terrain overrides.
 * Expected outcome: Deep-equal rows to an uncached rebuild for the same DB state. Cache hits log at TRACE; rebuilds log at DEBUG.
 * Exceptions: Propagates errors from `buildRows`.
 */
export function getTacticalRendererOverrideRowsCached(
  ops: BasicDbOps,
  buildRows: () => TacticalRendererOverrideRow[]
): TacticalRendererOverrideRow[] {
  const signature = computeTacticalFeatureOverrideSignature(ops);
  if (rendererOverrideCache?.signature === signature) {
    logTrace('res4RendererOverrideCache getRes4RendererOverrideRowsCached: cache hit', { signature });
    return rendererOverrideCache.rows;
  }
  const rows = buildRows();
  rendererOverrideCache = { signature, rows };
  logDebug('res4RendererOverrideCache getRes4RendererOverrideRowsCached: rebuilt', {
    signature,
    rowCount: rows.length,
  });
  return rows;
}

/**
 * Clears the renderer override cache for unit tests that mutate `res_t_feature_overrides` between assertions.
 *
 * Purpose: Test hook only; production invalidation relies on the signature query.
 * When to use: Start of tests that assert cache contract behavior.
 * Expected outcome: Next fetch rebuilds rows from the DB.
 * Exceptions: None.
 */
export function clearTacticalRendererOverrideCacheForTests(): void {
  logTrace('res4RendererOverrideCache clearRes4RendererOverrideCacheForTests');
  rendererOverrideCache = null;
}
