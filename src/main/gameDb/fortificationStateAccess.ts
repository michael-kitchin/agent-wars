/**
 * Live-database wrappers for fortification cell reads and writes.
 *
 * Purpose: Callers outside `gameDb` pass no connection bundle.
 * When to use: Production, combat, and tests. The module functions emit the logs.
 * Expected outcome: The same results as `fortificationState`, using the open match database.
 * Exceptions: The same throws as the module functions.
 */

import { gameDbOps } from './dbConnection';
import {
  isTacticalCellFortified as isTacticalCellFortifiedFromModule,
  listFortifiableCellsForHex as listFortifiableCellsForHexFromModule,
  listFortifiedCellsForHex as listFortifiedCellsForHexFromModule,
  setTacticalCellFortified as setTacticalCellFortifiedFromModule,
} from './fortificationState';

/**
 * Lists fortified cells in one strategic hex on the open match database.
 *
 * Purpose: Combat and tests pick a fortified cell without holding `BasicDbOps`.
 * When to use: When the match database is already open.
 * Expected outcome: Sorted cell indexes. Empty when none are fortified.
 * Exceptions: Propagates SQLite errors.
 */
export function listFortifiedCellsForHex(h3Index: string): string[] {
  return listFortifiedCellsForHexFromModule(gameDbOps, h3Index);
}

/**
 * Lists intact unfortified city cells in one strategic hex.
 *
 * Purpose: Production chooses cells on the open match database.
 * When to use: When the match database is already open.
 * Expected outcome: Sorted cell indexes.
 * Exceptions: Propagates SQLite errors.
 */
export function listFortifiableCellsForHex(h3Index: string): string[] {
  return listFortifiableCellsForHexFromModule(gameDbOps, h3Index);
}

/**
 * Reports whether one tactical cell is fortified.
 *
 * Purpose: Battle soak checks a cell on the open match database.
 * When to use: When the match database is already open.
 * Expected outcome: True only when that cell's row is fortified.
 * Exceptions: Propagates SQLite errors.
 */
export function isTacticalCellFortified(cellH3Index: string): boolean {
  return isTacticalCellFortifiedFromModule(gameDbOps, cellH3Index);
}

/**
 * Sets or clears one cell's fortification flag.
 *
 * Purpose: Production and combat write the flag on the open match database.
 * When to use: After choosing a cell, or after a hit strips one.
 * Expected outcome: The row updates, or the call throws when the row is missing or the check rejects it.
 * Exceptions: Throws when the cell has no override row. SQLite throws when the check rejects the write.
 */
export function setTacticalCellFortified(cellH3Index: string, fortified: boolean): void {
  setTacticalCellFortifiedFromModule(gameDbOps, cellH3Index, fortified);
}
