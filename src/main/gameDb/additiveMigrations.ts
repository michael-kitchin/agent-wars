/**
 * Additive schema migrations that run whenever a game database opens.
 *
 * Purpose: A save made before a column or table existed gains it on open, and the same list runs for a fresh database and for tests, so the three open paths cannot drift.
 * When to use: Add every new on-open migration here and nowhere else. `gameDb.ts` calls `applyAdditiveSchemaMigrations` from each open path.
 * Expected outcome: After the call, every table and column those migrations add is present.
 * Exceptions: None.
 */

import type { BasicDbOps } from './dbOps';
import { ensureHireOrderReservedCreditsColumn } from './mercenaryState';
import { ensureMatchRecordsTable } from './matchRecordsTable';
import { ensurePendingAirDropOrdersTable } from './pendingAirDropOrders';
import { ensureSeatAddedColumns } from './seatRosterStore';
import { ensureSideAgreementTable } from './sideAgreementTable';
import { ensureSideMessageTables, ensureSideStanceScoreColumns } from './sideMessageTables';

/**
 * Runs every additive migration against an open database, in a fixed order.
 *
 * Purpose: Replaces three copies of the same six calls in `gameDb.ts`.
 * When to use: Right after the database handle is set, in `createFreshGameDatabaseAt`, `openGameDatabaseAtPathForTests`, and `openExistingGameDatabaseAt`.
 * Expected outcome: Each migration checks for its column or table first, so a database that already has them is left unchanged. The order matches the order these calls had when they were inline.
 * Exceptions: Propagates SQLite errors.
 *
 * @param ops The open database's operations.
 */
export function applyAdditiveSchemaMigrations(ops: BasicDbOps): void {
  ensureHireOrderReservedCreditsColumn(ops);
  ensureSeatAddedColumns(ops);
  ensurePendingAirDropOrdersTable((sql) => ops.run(sql));
  ensureMatchRecordsTable((sql) => ops.run(sql));
  ensureSideMessageTables((sql) => ops.run(sql));
  ensureSideStanceScoreColumns(ops);
  ensureSideAgreementTable((sql) => ops.run(sql));
}
