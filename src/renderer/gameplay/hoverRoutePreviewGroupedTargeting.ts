import { cellToLatLng } from 'h3-js';
import { buildHumanOrderGroupPreviewEnvelope } from '../../shared/humanMarchPreviewGroupAssembly';
import type { HumanOrderGroupPreviewResult } from '../../shared/ipc/humanOrderPreviewTypes';

/**
 * Builds a grouped line preview for ranged or air-strike hover from validation result and per-unit origin hexes.
 *
 * Purpose: Single implementation shared by tactical battle and strategic map hover paths that previously duplicated four nearly identical blocks.
 * When to use: After `validateGroupRangedTarget` or `validateGroupAirStrikeTarget` resolves in `refreshHoverRoutePreview`.
 * Expected outcome: Envelope suitable for `publishHoverRoutePreview` with `renderAsSupportTargeting` `'ranged'` or `'air'`.
 * Exceptions: None.
 */
export function buildGroupedSupportTargetingLinePreview(
  previewUnitIds: readonly string[],
  hoveredH3: string,
  valid: boolean,
  validationReason: string | null,
  resolveHumanOriginH3: (unitId: string) => string | undefined
): HumanOrderGroupPreviewResult {
  const previews = previewUnitIds.map((unitId) => {
    const originH3 = resolveHumanOriginH3(unitId);
    if (!originH3) {
      return {
        unitId,
        preview: {
          valid: false,
          showInvalidMarker: true,
          invalidReason: 'Unknown unit',
          segments: [],
        },
      };
    }
    const [lat1, lng1] = cellToLatLng(originH3);
    const [lat2, lng2] = cellToLatLng(hoveredH3);
    return {
      unitId,
      originH3Index: originH3,
      preview: {
        valid,
        showInvalidMarker: !valid,
        invalidReason: valid ? '' : (validationReason ?? 'Invalid target'),
        segments: [{ turn: 1, hexes: [[lat1, lng1], [lat2, lng2]] as [number, number][] }],
        arrowLatLng: [lat2, lng2] as [number, number],
      },
    };
  });
  return buildHumanOrderGroupPreviewEnvelope({ previews, slowestMovementRange: 99 });
}
