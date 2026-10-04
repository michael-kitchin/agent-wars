import { dbGetAll, dbGetOne, isDbReady } from '../gameDb';
import { logTrace } from '../logger';

/**
 * Strategic unit columns shared by march, ranged, strike, and ferry checks.
 *
 * Purpose: Names the row `loadOwnedStrategicUnit` returns so callers do not repeat the SQL shape.
 * When to use: Only as the success payload of `loadOwnedStrategicUnit`.
 * Expected outcome: `player`, `unit_type`, and `h3_index` match the `units` table columns.
 * Exceptions: None.
 */
export type OwnedStrategicUnitRow = {
  player: string;
  unit_type: string;
  h3_index: string;
};

/**
 * Options for `loadOwnedStrategicUnit`.
 *
 * Purpose: Keeps the owner check and the missing-unit label on one argument object.
 * When to use: Pass `wrongOwnerReason` only when the caller must keep a reason other than the default owner sentence.
 * Expected outcome: `displayLabelForUnit` is used only in the not-found reason.
 * Exceptions: None.
 */
export type LoadOwnedStrategicUnitOptions = {
  allowedPlayer: string;
  displayLabelForUnit: (id: string) => string;
  wrongOwnerReason?: string;
};

/**
 * Loads one strategic unit and rejects a closed database, a missing id, or the wrong owner.
 *
 * Purpose: One lookup for march, ranged, strike, and ferry validators so those reason strings cannot drift.
 * When to use: After the caller's own log line, and before range or hex checks.
 * Expected outcome: `{ ok: true, unit }` or `{ ok: false, failure }` whose reason is `Database not initialized`, `Unit not found: …`, or the owner sentence.
 * Exceptions: None. A closed database returns the failure object instead of throwing.
 */
export function loadOwnedStrategicUnit(
  unitId: string,
  options: LoadOwnedStrategicUnitOptions
): { ok: true; unit: OwnedStrategicUnitRow } | { ok: false; failure: { valid: false; reason: string } } {
  logTrace('ownedUnitGuards loadOwnedStrategicUnit', { unitId, allowedPlayer: options.allowedPlayer });
  if (!isDbReady()) return { ok: false, failure: { valid: false, reason: 'Database not initialized' } };
  const unit = dbGetOne<OwnedStrategicUnitRow>(
    'SELECT player, unit_type, h3_index FROM units WHERE id = ?',
    [unitId]
  );
  if (!unit) {
    return {
      ok: false,
      failure: { valid: false, reason: `Unit not found: ${options.displayLabelForUnit(unitId)}` },
    };
  }
  if (unit.player !== options.allowedPlayer) {
    const reason = options.wrongOwnerReason ?? `Unit must belong to ${options.allowedPlayer}`;
    return { ok: false, failure: { valid: false, reason } };
  }
  return { ok: true, unit };
}

/**
 * Reports whether any unit at a hex belongs to a player other than `ownPlayer`.
 *
 * Purpose: Shared enemy-presence check for ranged attacks and unit-targeted air strikes.
 * When to use: After the attacker row is loaded and the target hex is known to be on the map.
 * Expected outcome: True when at least one other player's unit occupies the hex.
 * Exceptions: None.
 */
export function hasEnemyUnitsAtHex(h3Index: string, ownPlayer: string): boolean {
  logTrace('ownedUnitGuards hasEnemyUnitsAtHex', { h3Index, ownPlayer });
  const enemiesAtTarget = dbGetAll<{ player: string }>(
    'SELECT player FROM units WHERE h3_index = ? AND player != ?',
    [h3Index, ownPlayer]
  );
  return enemiesAtTarget.length > 0;
}
