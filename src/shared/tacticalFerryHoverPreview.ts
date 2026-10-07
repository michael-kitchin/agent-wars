/**
 * Pure construction of air ferry hover preview payloads for tactical battles.
 *
 * Purpose: Mirrors strategic air ferry preview geometry without calling strategic IPC march preview.
 * When to use: Renderer `refreshHoverRoutePreview` when all selected human sub-units are air and ranged/strike modes are off.
 * Expected outcome: `HumanOrderGroupPreviewResult` with straight turn-1 segments per origin stack, or invalid envelopes with blocking copy.
 * Exceptions: None; returns empty previews when inputs are incomplete.
 */

import { cellToLatLng } from 'h3-js';
import {
  buildHumanOrderGroupPreviewEnvelope,
  representativeMarchPreviewUnitIdsByOriginH3,
  uniqueTacticalMarchPreviewUnitIds,
} from './humanMarchPreviewGroupAssembly';
import type { TacticalBattleSnapshot } from './tacticalBattleTypes';
import type {
  HumanOrderGroupPreviewResult,
  HumanOrderGroupPreviewUnitResult,
  HumanOrderPreviewResult,
} from './ipc/humanOrderPreviewTypes';

/** User-facing copy when air and non-air units are selected together for movement-style planning. */
export const MIXED_AIR_NON_AIR_MOVEMENT_MESSAGE = 'Cannot issue grouped movement for mixed air and non-air units.';

/**
 * Builds a single-unit invalid ferry preview row with optional invalid-marker display.
 *
 * Purpose: Shared invalid envelope construction for tactical ferry hover and mixed-selection paths.
 * When to use: Internally when ferry validation fails or mixed air/ground selection is detected.
 * Expected outcome: `valid: false` preview with `invalidReason` and empty segments.
 * Exceptions: None.
 */
function invalidPreview(reason: string, showMarker = true): HumanOrderPreviewResult {
  return {
    valid: false,
    showInvalidMarker: showMarker,
    invalidReason: reason,
    segments: [],
  };
}

/**
 * Builds a valid straight-segment ferry preview between two tactical cell origins and destinations.
 *
 * Purpose: Mirrors strategic air ferry preview geometry for tactical hover line drawing.
 * When to use: After successful tactical ferry validation when origin and destination differ.
 * Expected outcome: Turn-1 two-point segment with optional `arrowLatLng` at destination; empty segments when origin equals destination.
 * Exceptions: None.
 */
function straightFerryPreview(originH3: string, destinationH3: string): HumanOrderPreviewResult {
  if (originH3 === destinationH3) {
    return { valid: true, showInvalidMarker: false, segments: [] };
  }
  const [originLat, originLng] = cellToLatLng(originH3);
  const [destLat, destLng] = cellToLatLng(destinationH3);
  return {
    valid: true,
    showInvalidMarker: false,
    arrowLatLng: [destLat, destLng],
    segments: [
      {
        turn: 1,
        hexes: [
          [originLat, originLng],
          [destLat, destLng],
        ],
      },
    ],
  };
}

/**
 * Builds an invalid grouped envelope when the tactical selection mixes air and non-air human sub-units.
 *
 * Purpose: Matches double-click ferry/march rejection so hover planning does not call the march planner for mixed stacks.
 * When to use: Tactical hover refresh when selection includes both air and non-air human units outside ranged/strike modes.
 * Expected outcome: `validForAll: false` with `showInvalidMarker` and the mixed-selection movement message.
 * Exceptions: None.
 */
export function buildTacticalMixedAirNonAirHoverEnvelope(unitIds: readonly string[]): HumanOrderGroupPreviewResult {
  const uniqueIds = uniqueTacticalMarchPreviewUnitIds(unitIds);
  const previews: HumanOrderGroupPreviewUnitResult[] = uniqueIds.map((unitId) => ({
    unitId,
    preview: invalidPreview(MIXED_AIR_NON_AIR_MOVEMENT_MESSAGE),
  }));
  return buildHumanOrderGroupPreviewEnvelope({ previews, slowestMovementRange: 0 });
}

/**
 * Builds a grouped air ferry hover preview for selected tactical air sub-units toward a hovered tactical cell.
 *
 * Purpose: Supplies march-branch hover drawing with straight origin→destination segments after main-process ferry validation.
 * When to use: Tactical `refreshHoverRoutePreview` when every selected human sub-unit is air and ferry validation has completed.
 * Expected outcome: One preview per distinct origin; invalid targets show blocking copy via `invalidReason` and invalid marker policy.
 * Exceptions: None; returns an empty envelope when `hoveredH3Index` is null or no human air units are selected.
 */
export function buildTacticalFerryHoverPreview(
  battle: TacticalBattleSnapshot,
  unitIds: readonly string[],
  hoveredH3Index: string | null,
  ferryValidation: { success: boolean; reason?: string }
): HumanOrderGroupPreviewResult {
  const uniqueIds = uniqueTacticalMarchPreviewUnitIds(unitIds);
  const selectedAir = uniqueIds
    .map((id) => battle.subUnits.find((u) => u.id === id && u.player === 'human' && u.unitType === 'air'))
    .filter((u): u is NonNullable<typeof u> => !!u);
  if (!hoveredH3Index || selectedAir.length === 0) {
    return {
      validForAll: false,
      showInvalidMarker: false,
      slowestMovementRange: 0,
      previews: [],
    };
  }
  const previewUnitIds = representativeMarchPreviewUnitIdsByOriginH3(
    selectedAir.map((u) => ({ unitId: u.id, originH3: u.h3Index }))
  );
  const previews: HumanOrderGroupPreviewUnitResult[] = previewUnitIds.map((unitId) => {
    const sub = battle.subUnits.find((u) => u.id === unitId);
    const originH3 = sub?.h3Index ?? '';
    if (!ferryValidation.success) {
      return {
        unitId,
        originH3Index: originH3,
        preview: invalidPreview(ferryValidation.reason ?? 'Invalid ferry destination'),
      };
    }
    return {
      unitId,
      originH3Index: originH3,
      preview: straightFerryPreview(originH3, hoveredH3Index),
    };
  });
  return buildHumanOrderGroupPreviewEnvelope({ previews, slowestMovementRange: 1 });
}
