/**
 * Keeps strategic infrastructure counts equal to the tactical override rows.
 *
 * Purpose: Triggers and the drift repair share one count query, including fortification counts.
 * When to use: New Game installs the triggers. Opening a database runs the repair.
 * Expected outcome: `res_s_infrastructure` matches the tactical sums for every parent hex.
 * Exceptions: Propagates SQLite errors from the caller-supplied operations.
 */

import { logDebug } from '../logger';
import type { BasicDbOps } from './dbOps';

/**
 * Trigger names that copy tactical feature rows onto strategic counts.
 *
 * Purpose: Seeding drops these names before a bulk insert, then this module creates them again.
 * When to use: Only while creating the three sync triggers.
 * Expected outcome: The same three names the seeder drops.
 * Exceptions: None.
 */
const TACTICAL_TO_STRATEGIC_SYNC_TRIGGER_NAMES = {
  afterInsert: 'res_t_sync_res_s_after_insert',
  afterDelete: 'res_t_sync_res_s_after_delete',
  afterUpdate: 'res_t_sync_res_s_after_update',
} as const;

/**
 * One grouped sum of tactical flags per strategic hex.
 *
 * Purpose: The mismatch check and the reconcile update count the same way.
 * When to use: Inside the reconcile statements. Triggers use `buildStrategicRollupUpdateSql` instead.
 * Expected outcome: Aliases `urbanHexCount`, `airportCount`, `seaportCount`, `fortifiedCount`, and `fortifiableCount`.
 * Exceptions: None.
 */
const TACTICAL_INFRASTRUCTURE_COUNTS_SUBQUERY_SQL = `SELECT parent_h3_index AS h3Index,
              SUM(CASE WHEN is_urban = 1 THEN 1 ELSE 0 END) AS urbanHexCount,
              SUM(CASE WHEN is_airport = 1 THEN 1 ELSE 0 END) AS airportCount,
              SUM(CASE WHEN is_seaport = 1 THEN 1 ELSE 0 END) AS seaportCount,
              SUM(CASE WHEN is_fortified = 1 THEN 1 ELSE 0 END) AS fortifiedCount,
              SUM(CASE WHEN is_urban = 1 AND is_rubble = 0 AND is_fortified = 0 THEN 1 ELSE 0 END) AS fortifiableCount
       FROM res_t_feature_overrides
       GROUP BY parent_h3_index`;

/**
 * SQL predicate that is true when a strategic row disagrees with its tactical sums.
 *
 * Purpose: The reconcile skips the write when every count already matches.
 * When to use: The reconcile SELECT and nowhere else.
 * Expected outcome: A boolean SQL expression over the five counts.
 * Exceptions: None.
 */
function buildStrategicCountsMismatchPredicateSql(strategicTableAlias: string, countsAlias: string): string {
  return `${strategicTableAlias}.urban_hex_count != COALESCE(${countsAlias}.urbanHexCount, 0)
       OR ${strategicTableAlias}.airport_count != COALESCE(${countsAlias}.airportCount, 0)
       OR ${strategicTableAlias}.seaport_count != COALESCE(${countsAlias}.seaportCount, 0)
       OR ${strategicTableAlias}.fortified_count != COALESCE(${countsAlias}.fortifiedCount, 0)
       OR ${strategicTableAlias}.fortifiable_count != COALESCE(${countsAlias}.fortifiableCount, 0)`;
}

/**
 * SQL that rewrites one strategic hex's counts from its tactical children.
 *
 * Purpose: Each trigger body updates the parent named by `NEW` or `OLD`.
 * When to use: Inside the three sync triggers.
 * Expected outcome: One UPDATE statement, including the trailing semicolon.
 * Exceptions: None.
 */
function buildStrategicRollupUpdateSql(parentH3Expression: string): string {
  return `UPDATE res_s_infrastructure
          SET urban_hex_count = COALESCE(
                (SELECT SUM(CASE WHEN is_urban = 1 THEN 1 ELSE 0 END)
                 FROM res_t_feature_overrides
                 WHERE parent_h3_index = ${parentH3Expression}),
                0
              ),
              airport_count = COALESCE(
                (SELECT SUM(CASE WHEN is_airport = 1 THEN 1 ELSE 0 END)
                 FROM res_t_feature_overrides
                 WHERE parent_h3_index = ${parentH3Expression}),
                0
              ),
              seaport_count = COALESCE(
                (SELECT SUM(CASE WHEN is_seaport = 1 THEN 1 ELSE 0 END)
                 FROM res_t_feature_overrides
                 WHERE parent_h3_index = ${parentH3Expression}),
                0
              ),
              fortified_count = COALESCE(
                (SELECT SUM(CASE WHEN is_fortified = 1 THEN 1 ELSE 0 END)
                 FROM res_t_feature_overrides
                 WHERE parent_h3_index = ${parentH3Expression}),
                0
              ),
              fortifiable_count = COALESCE(
                (SELECT SUM(CASE WHEN is_urban = 1 AND is_rubble = 0 AND is_fortified = 0 THEN 1 ELSE 0 END)
                 FROM res_t_feature_overrides
                 WHERE parent_h3_index = ${parentH3Expression}),
                0
              )
          WHERE h3_index = ${parentH3Expression};`;
}

/**
 * Installs the triggers that copy tactical feature changes onto strategic counts.
 *
 * Purpose: A new match and a reseed both need the triggers after bulk inserts.
 * When to use: After the schema exists and after seeding drops the old triggers.
 * Expected outcome: Three triggers. An existing trigger is left in place.
 * Exceptions: Propagates SQLite errors.
 */
export function ensureStrategicInfrastructureSyncTriggers(ops: BasicDbOps): void {
  logDebug('gameDb ensureRes1InfrastructureSyncTriggers');
  ops.run(
    `CREATE TRIGGER IF NOT EXISTS ${TACTICAL_TO_STRATEGIC_SYNC_TRIGGER_NAMES.afterInsert}
     AFTER INSERT ON res_t_feature_overrides
     BEGIN
       ${buildStrategicRollupUpdateSql('NEW.parent_h3_index')}
     END;`
  );
  ops.run(
    `CREATE TRIGGER IF NOT EXISTS ${TACTICAL_TO_STRATEGIC_SYNC_TRIGGER_NAMES.afterDelete}
     AFTER DELETE ON res_t_feature_overrides
     BEGIN
       ${buildStrategicRollupUpdateSql('OLD.parent_h3_index')}
     END;`
  );
  ops.run(
    `CREATE TRIGGER IF NOT EXISTS ${TACTICAL_TO_STRATEGIC_SYNC_TRIGGER_NAMES.afterUpdate}
     AFTER UPDATE ON res_t_feature_overrides
     BEGIN
       ${buildStrategicRollupUpdateSql('OLD.parent_h3_index')}
       ${buildStrategicRollupUpdateSql('NEW.parent_h3_index')}
     END;`
  );
}

/**
 * Rewrites strategic counts that disagree with the tactical rows.
 *
 * Purpose: A database saved mid-edit, or a bulk seed, can leave the rollup stale until this runs.
 * When to use: Once when a database opens, and once after seeding.
 * Expected outcome: `{ changedHexCount }` is the number of strategic rows that disagreed before the write.
 * Exceptions: Propagates SQLite errors.
 */
export function reconcileStrategicInfrastructureCountsFromTacticalOverrides(ops: BasicDbOps): { changedHexCount: number } {
  logDebug('gameDb reconcileRes1InfrastructureCountsFromRes4Overrides');
  const mismatch = ops.getOne<{ mismatchCount: number }>(
    `SELECT COUNT(*) AS mismatchCount
     FROM res_s_infrastructure ri
     LEFT JOIN (${TACTICAL_INFRASTRUCTURE_COUNTS_SUBQUERY_SQL}) counts ON counts.h3Index = ri.h3_index
     WHERE ${buildStrategicCountsMismatchPredicateSql('ri', 'counts')}`
  )?.mismatchCount ?? 0;
  if (mismatch <= 0) {
    logDebug('gameDb reconcileRes1InfrastructureCountsFromRes4Overrides: no-op');
    return { changedHexCount: 0 };
  }
  ops.run(
    `WITH counts AS (${TACTICAL_INFRASTRUCTURE_COUNTS_SUBQUERY_SQL})
     UPDATE res_s_infrastructure
     SET urban_hex_count = COALESCE((SELECT urbanHexCount FROM counts WHERE counts.h3Index = res_s_infrastructure.h3_index), 0),
         airport_count = COALESCE((SELECT airportCount FROM counts WHERE counts.h3Index = res_s_infrastructure.h3_index), 0),
         seaport_count = COALESCE((SELECT seaportCount FROM counts WHERE counts.h3Index = res_s_infrastructure.h3_index), 0),
         fortified_count = COALESCE((SELECT fortifiedCount FROM counts WHERE counts.h3Index = res_s_infrastructure.h3_index), 0),
         fortifiable_count = COALESCE((SELECT fortifiableCount FROM counts WHERE counts.h3Index = res_s_infrastructure.h3_index), 0)
     WHERE urban_hex_count != COALESCE((SELECT urbanHexCount FROM counts WHERE counts.h3Index = res_s_infrastructure.h3_index), 0)
        OR airport_count != COALESCE((SELECT airportCount FROM counts WHERE counts.h3Index = res_s_infrastructure.h3_index), 0)
        OR seaport_count != COALESCE((SELECT seaportCount FROM counts WHERE counts.h3Index = res_s_infrastructure.h3_index), 0)
        OR fortified_count != COALESCE((SELECT fortifiedCount FROM counts WHERE counts.h3Index = res_s_infrastructure.h3_index), 0)
        OR fortifiable_count != COALESCE((SELECT fortifiableCount FROM counts WHERE counts.h3Index = res_s_infrastructure.h3_index), 0)`
  );
  logDebug('gameDb reconcileRes1InfrastructureCountsFromRes4Overrides: applied', { changedHexCount: mismatch });
  return { changedHexCount: mismatch };
}
