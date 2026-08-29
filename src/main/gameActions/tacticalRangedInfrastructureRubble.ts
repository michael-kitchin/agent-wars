/**
 * Persists tactical ranged infrastructure damage: one res4 override row becomes rubble with features cleared.
 *
 * Purpose: Mirrors air-strike infrastructure cleanup (res1 rollup via DB triggers, build queue prune, airport air units)
 * for tactical ranged hits without duplicating patch logic across callers.
 * When to use: After a tactical ranged resolution decides a res4 cell with urban/airport/seaport or strikeable transport should become rubble.
 * Expected outcome: Row at `res4H3Index` under `res1ParentH3Index` is rubble with all facility flags cleared, or a new rubble-only row is inserted for road/rail-only cells; returns whether the DB changed.
 * Exceptions: No-op when no eligible facility row exists and the optional transport insert path does not apply; logs at error level on unexpected failures.
 */

import { logDebug, logError } from '../logger';
import {
  insertRes4FeatureOverrideRubbleRow,
  listRes4FeatureOverridesForGame,
  updateRes4FeatureOverrideRow,
} from '../gameDb';
import { destroyBasedAirUnitsAtHex, pruneBuildQueueForInfrastructureState } from './airStrikeResolution';

/**
 * Optional context for creating a **new** rubble override when the cell had strikeable transport but no existing `res4_feature_overrides` row.
 *
 * Purpose: Keeps INSERT arguments explicit so main callers pass merged terrain kinds from the tactical snapshot rather than re-querying render metadata here.
 * When to use: Tactical ranged apply from `tacticalStrategicOrderPhases` when `tacticalRes4CellHasActiveTransportCorridor` is true for the defender hex.
 * Expected outcome: `insertStrikeableTransportCorridor` true only when masks authorize INSERT-only persistence; `mergedTerrainKindForInsert` must be non-empty when insert is intended.
 * Exceptions: None; ignored unless the facility UPDATE branch does not run and no row exists yet.
 */
export type TacticalRangedRubbleApplyOptions = {
  mergedTerrainKindForInsert: string;
  insertStrikeableTransportCorridor: boolean;
};

/**
 * Converts one tactical res4 cell with urban, airport, seaport, or transport-only strikeable infrastructure into rubble and syncs dependent game state.
 *
 * Purpose: Single DB write path for tactical ranged (and related) infrastructure collapse on one footprint cell, including INSERT for road/rail-only targets.
 * When to use: After ranged kills defenders on an infra hex, or after a successful infra-only ranged strike roll.
 * Expected outcome: `changed` true when a facility row was updated, a non-rubble non-facility row was rubbled, or a transport INSERT succeeded; airport-bearing cells may delete strategic air units at the parent res1.
 * Exceptions: Logs at error level and returns `changed: false` if listing or insert/update throws.
 */
export function applyTacticalRangedRubbleToRes4Cell(
  res4H3Index: string,
  res1ParentH3Index: string,
  opts?: TacticalRangedRubbleApplyOptions
): { changed: boolean; destroyedAirUnitsCount: number } {
  logDebug('tacticalRangedInfrastructureRubble applyTacticalRangedRubbleToRes4Cell', {
    res4H3Index,
    res1ParentH3Index,
    insertTransport: !!opts?.insertStrikeableTransportCorridor,
  });
  try {
    const rows = listRes4FeatureOverridesForGame();
    const rowForCell = rows.find((r) => r.h3Index === res4H3Index && r.parentH3Index === res1ParentH3Index);
    if (
      rowForCell &&
      !rowForCell.isRubble &&
      (rowForCell.isUrban || rowForCell.isAirport || rowForCell.isSeaport)
    ) {
      const hadAirport = rowForCell.isAirport;
      updateRes4FeatureOverrideRow(res4H3Index, {
        isRubble: true,
        isUrban: false,
        isAirport: false,
        isSeaport: false,
      });
      let destroyedAirUnitsCount = 0;
      if (hadAirport) {
        destroyedAirUnitsCount = destroyBasedAirUnitsAtHex(res1ParentH3Index).length;
      }
      pruneBuildQueueForInfrastructureState(res1ParentH3Index);
      logDebug('tacticalRangedInfrastructureRubble applyTacticalRangedRubbleToRes4Cell: facility update complete', {
        res4H3Index,
        destroyedAirUnitsCount,
      });
      return { changed: true, destroyedAirUnitsCount };
    }
    if (rowForCell) {
      if (rowForCell.isRubble) {
        logDebug('tacticalRangedInfrastructureRubble applyTacticalRangedRubbleToRes4Cell: already rubble', {
          res4H3Index,
        });
        return { changed: false, destroyedAirUnitsCount: 0 };
      }
      const hadAirport = rowForCell.isAirport;
      updateRes4FeatureOverrideRow(res4H3Index, {
        isRubble: true,
        isUrban: false,
        isAirport: false,
        isSeaport: false,
      });
      let destroyedAirUnitsCount = 0;
      if (hadAirport) {
        destroyedAirUnitsCount = destroyBasedAirUnitsAtHex(res1ParentH3Index).length;
      }
      pruneBuildQueueForInfrastructureState(res1ParentH3Index);
      logDebug('tacticalRangedInfrastructureRubble applyTacticalRangedRubbleToRes4Cell: non-facility row rubbled', {
        res4H3Index,
        destroyedAirUnitsCount,
      });
      return { changed: true, destroyedAirUnitsCount };
    }
    if (
      opts?.insertStrikeableTransportCorridor &&
      opts.mergedTerrainKindForInsert &&
      opts.mergedTerrainKindForInsert.trim().length > 0
    ) {
      insertRes4FeatureOverrideRubbleRow({
        h3Index: res4H3Index,
        parentH3Index: res1ParentH3Index,
        terrainKind: opts.mergedTerrainKindForInsert.trim(),
      });
      pruneBuildQueueForInfrastructureState(res1ParentH3Index);
      logDebug('tacticalRangedInfrastructureRubble applyTacticalRangedRubbleToRes4Cell: transport insert complete', {
        res4H3Index,
      });
      return { changed: true, destroyedAirUnitsCount: 0 };
    }
    logDebug('tacticalRangedInfrastructureRubble applyTacticalRangedRubbleToRes4Cell: no eligible row or insert path', {
      res4H3Index,
    });
    return { changed: false, destroyedAirUnitsCount: 0 };
  } catch (err) {
    logError('tacticalRangedInfrastructureRubble applyTacticalRangedRubbleToRes4Cell: failed', err);
    return { changed: false, destroyedAirUnitsCount: 0 };
  }
}
