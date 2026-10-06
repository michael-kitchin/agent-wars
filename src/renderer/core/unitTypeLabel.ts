import { unitTypeFromUnitId } from '../../shared/unitIds';
import { UNIT_TYPE_LABELS } from './constants';

/**
 * Maps a unit id to the one-letter glyph used for stale-intel markers.
 *
 * Purpose: Fog tracking draws type letters when the live roster row is gone.
 * When to use: `drawStaleEnemyIntel` via the existing call site in `drawGameScene`.
 * Expected outcome: Compact and legacy ids resolve through `UNIT_TYPE_LABELS`; unknown ids yield `?`.
 * Exceptions: None.
 */
export function inferUnitTypeLabelFromId(unitId: string): string {
  const unitType = unitTypeFromUnitId(unitId);
  return unitType ? UNIT_TYPE_LABELS[unitType] ?? '?' : '?';
}
