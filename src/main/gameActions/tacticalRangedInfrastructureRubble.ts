/**
 * Persists tactical ranged infrastructure damage: one tactical override row becomes rubble with features cleared.
 *
 * Purpose: Mirrors air-strike infrastructure cleanup (strategic rollup via DB triggers, build queue prune, airport air units)
 * for tactical ranged hits without duplicating patch logic across callers.
 * When to use: After a tactical ranged resolution decides a tactical cell with urban/airport/seaport or strikeable transport should become rubble.
 * Expected outcome: Row at `tacticalH3Index` under `strategicParentH3Index` is rubble with all facility flags cleared, or a new rubble-only row is inserted for road/rail-only cells; returns whether the DB changed.
 * Exceptions: No-op when no eligible facility row exists and the optional transport insert path does not apply; logs at error level on unexpected failures.
 */

import { strategicParentOf } from '../../shared/h3Resolutions';
import { logDebug, logError } from '../logger';
import {
  insertTacticalFeatureOverrideRubbleRow,
  listTacticalFeatureOverridesForGame,
  updateTacticalFeatureOverrideRow,
} from '../gameDb';
import { destroyBasedAirUnitsAtHex, pruneBuildQueueForInfrastructureState } from './airStrikeResolution';

/**
 * Optional context for creating a **new** rubble override when the cell had strikeable transport but no existing `res_t_feature_overrides` row.
 *
 * Purpose: Keeps INSERT arguments explicit so main callers pass merged terrain kinds from the tactical snapshot rather than re-querying render metadata here.
 * When to use: Tactical ranged apply from `tacticalStrategicOrderPhases` when `tacticalCellHasActiveTransportCorridor` is true for the defender hex.
 * Expected outcome: `insertStrikeableTransportCorridor` true only when masks authorize INSERT-only persistence; `mergedTerrainKindForInsert` must be non-empty when insert is intended.
 * Exceptions: None; ignored unless the facility UPDATE branch does not run and no row exists yet.
 */
export type TacticalRangedRubbleApplyOptions = {
  mergedTerrainKindForInsert: string;
  insertStrikeableTransportCorridor: boolean;
};

/**
 * Converts one tactical cell with urban, airport, seaport, or transport-only strikeable infrastructure into rubble and syncs dependent game state.
 *
 * Purpose: Single DB write path for tactical ranged (and related) infrastructure collapse on one footprint cell, including INSERT for road/rail-only targets.
 * When to use: After ranged kills defenders on an infra hex, or after a successful infra-only ranged strike roll.
 * Expected outcome: A fortified cell loses only its fortification and returns `changed: false`, because the city cell and its terrain are unchanged. Otherwise `changed` is true when a facility row was updated, a non-rubble non-facility row was rubbled, or a transport INSERT succeeded; airport-bearing cells may delete strategic air units at the parent strategic.
 * Exceptions: Logs at error level and returns `changed: false` if listing or insert/update throws.
 */
export function applyTacticalRangedRubbleToCell(
  tacticalH3Index: string,
  strategicParentH3Index: string,
  opts?: TacticalRangedRubbleApplyOptions
): { changed: boolean; destroyedAirUnitsCount: number } {
  logDebug('tacticalRangedInfrastructureRubble applyTacticalRangedRubbleToRes4Cell', {
    tacticalH3Index,
    strategicParentH3Index,
    insertTransport: !!opts?.insertStrikeableTransportCorridor,
  });
  try {
    if (strategicParentOf(tacticalH3Index) !== strategicParentH3Index) {
      logDebug('tacticalRangedInfrastructureRubble applyTacticalRangedRubbleToRes4Cell: cell is outside the enclosing hex', {
        tacticalH3Index,
        strategicParentH3Index,
      });
      return { changed: false, destroyedAirUnitsCount: 0 };
    }
    const rows = listTacticalFeatureOverridesForGame();
    const rowForCell = rows.find((r) => r.h3Index === tacticalH3Index && r.parentH3Index === strategicParentH3Index);
    if (rowForCell?.isFortified) {
      updateTacticalFeatureOverrideRow(tacticalH3Index, { isFortified: false });
      logDebug('tacticalRangedInfrastructureRubble applyTacticalRangedRubbleToRes4Cell: stripped fortification', {
        tacticalH3Index,
      });
      return { changed: false, destroyedAirUnitsCount: 0 };
    }
    if (
      rowForCell &&
      !rowForCell.isRubble &&
      (rowForCell.isUrban || rowForCell.isAirport || rowForCell.isSeaport)
    ) {
      const hadAirport = rowForCell.isAirport;
      updateTacticalFeatureOverrideRow(tacticalH3Index, {
        isRubble: true,
        isUrban: false,
        isAirport: false,
        isSeaport: false,
      });
      let destroyedAirUnitsCount = 0;
      if (hadAirport) {
        destroyedAirUnitsCount = destroyBasedAirUnitsAtHex(strategicParentH3Index).length;
      }
      pruneBuildQueueForInfrastructureState(strategicParentH3Index);
      logDebug('tacticalRangedInfrastructureRubble applyTacticalRangedRubbleToRes4Cell: facility update complete', {
        tacticalH3Index,
        destroyedAirUnitsCount,
      });
      return { changed: true, destroyedAirUnitsCount };
    }
    if (rowForCell) {
      if (rowForCell.isRubble) {
        logDebug('tacticalRangedInfrastructureRubble applyTacticalRangedRubbleToRes4Cell: already rubble', {
          tacticalH3Index,
        });
        return { changed: false, destroyedAirUnitsCount: 0 };
      }
      const hadAirport = rowForCell.isAirport;
      updateTacticalFeatureOverrideRow(tacticalH3Index, {
        isRubble: true,
        isUrban: false,
        isAirport: false,
        isSeaport: false,
      });
      let destroyedAirUnitsCount = 0;
      if (hadAirport) {
        destroyedAirUnitsCount = destroyBasedAirUnitsAtHex(strategicParentH3Index).length;
      }
      pruneBuildQueueForInfrastructureState(strategicParentH3Index);
      logDebug('tacticalRangedInfrastructureRubble applyTacticalRangedRubbleToRes4Cell: non-facility row rubbled', {
        tacticalH3Index,
        destroyedAirUnitsCount,
      });
      return { changed: true, destroyedAirUnitsCount };
    }
    if (
      opts?.insertStrikeableTransportCorridor &&
      opts.mergedTerrainKindForInsert &&
      opts.mergedTerrainKindForInsert.trim().length > 0
    ) {
      insertTacticalFeatureOverrideRubbleRow({
        h3Index: tacticalH3Index,
        parentH3Index: strategicParentH3Index,
        terrainKind: opts.mergedTerrainKindForInsert.trim(),
      });
      pruneBuildQueueForInfrastructureState(strategicParentH3Index);
      logDebug('tacticalRangedInfrastructureRubble applyTacticalRangedRubbleToRes4Cell: transport insert complete', {
        tacticalH3Index,
      });
      return { changed: true, destroyedAirUnitsCount: 0 };
    }
    logDebug('tacticalRangedInfrastructureRubble applyTacticalRangedRubbleToRes4Cell: no eligible row or insert path', {
      tacticalH3Index,
    });
    return { changed: false, destroyedAirUnitsCount: 0 };
  } catch (err) {
    logError('tacticalRangedInfrastructureRubble applyTacticalRangedRubbleToRes4Cell: failed', err);
    return { changed: false, destroyedAirUnitsCount: 0 };
  }
}
