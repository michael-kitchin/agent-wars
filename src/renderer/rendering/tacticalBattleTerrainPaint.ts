/**
 * Canvas paint for the playable battle footprint, including the three margin rings.
 *
 * Purpose: Keeps battle-cell drawing out of the strategic terrain pass so a margin cell can paint while its geometric parent is off screen.
 * When to use: From `drawTacticalTerrainHexes` while a battle snapshot is set.
 * Expected outcome: Each on-screen footprint cell uses the kind captured on the battle, then a live tactical row, then a loaded geometric parent's kind, then the enclosing hex's kind.
 * Exceptions: None. Does not write `tacticalChildrenByParent`.
 */

import { battleCellTerrainKind, tacticalBattleTerrainKindByCell } from '../../shared/tacticalBattleFootprint';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { rendererSharedState as S } from '../core/state';
import { projectHexBoundaryToContainerPoints, shouldDrawTacticalChildHexInViewport } from '../map/terrainView';
import { drawTerrainInfrastructureGlyphs, TACTICAL_TERRAIN_INFRA_GLYPH_AREA_SCALE } from './terrainInfrastructureOverlay';
import { drawFortifiedCellTicks, fortificationTickColor } from './fortificationTickDrawing';
import { drawClosedPolygonPath } from './polygonOutline';
import { fillHexTerrain } from './terrainVisualStyles';

/**
 * Paints the playable battle cells, including the margin.
 *
 * Purpose: The strategic parent polygon can be off screen while a margin cell is on screen, so this path does not use the parent viewport test.
 * When to use: `drawTacticalTerrainHexes` while a battle snapshot is set.
 * Expected outcome: Each on-screen footprint cell is filled and stroked from the kind the battle captured. A cell the battle did not record uses the live tactical row. Inspection mode strokes only.
 * Exceptions: None. Does not write `tacticalChildrenByParent`.
 */
export function paintBattleFootprintTerrain(
  ctx: CanvasRenderingContext2D,
  deps: { isMapInspectionModeHeld: () => boolean },
  tactical: TacticalBattleSnapshot,
  map: { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } },
  leaflet: { latLng: (lat: number, lng: number) => unknown },
  viewportWidth: number,
  viewportHeight: number,
  stroke: { color: string; width: number }
): void {
  const tacticalKindByH3 = new Map<string, string>();
  for (const cell of tactical.tacticalChildH3Indexes) {
    const kind = battleCellTerrainKind({
      frozenKind: tactical.tacticalTerrainKindByH3?.[cell],
      liveKind: S.tacticalTerrainOverridesByH3.get(cell)?.terrainKind,
      cellHasFeatureOverride: false,
    });
    if (kind) tacticalKindByH3.set(cell, kind);
  }
  const loadedStrategicKindByH3 = new Map<string, string>();
  for (const hex of S.gameState?.hexes ?? []) {
    if (hex.terrainKind && hex.terrainKind.trim().length > 0) loadedStrategicKindByH3.set(hex.h3Index, hex.terrainKind);
  }
  const enclosing = S.gameState?.hexes.find((hex) => hex.h3Index === tactical.enclosingStrategicH3Index);
  const enclosingKind = enclosing?.terrainKind?.trim() || tactical.strategicHexTerrainKind || 'plains';
  const kinds = tacticalBattleTerrainKindByCell({
    cells: tactical.tacticalChildH3Indexes,
    tacticalKindByH3,
    enclosingKind,
    loadedStrategicKindByH3,
  });
  for (const child of tactical.tacticalChildH3Indexes) {
    const override = S.tacticalTerrainOverridesByH3.get(child);
    const terrainKind = kinds[child] ?? enclosingKind;
    const pts = projectHexBoundaryToContainerPoints(child, map, leaflet);
    if (!shouldDrawTacticalChildHexInViewport(pts, viewportWidth, viewportHeight)) continue;
    const drawClosedPath = (): void => {
      drawClosedPolygonPath(ctx, pts);
    };
    if (!deps.isMapInspectionModeHeld()) {
      fillHexTerrain(ctx, terrainKind, drawClosedPath, {
        fillAndHatchAlphaScale: S.hoveredDetailHexH3 === child ? 2 : 1,
        landHoverFill: S.hoveredDetailHexH3 === child && terrainKind === 'plains',
        isUrban: override?.isUrban ?? false,
        isRubble: override?.isRubble ?? false,
      });
    }
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = Math.max(0.28, stroke.width * 0.62);
    drawClosedPath();
    ctx.stroke();
    const fortOwner = tactical.tacticalFortificationOwnerByH3?.[child];
    if (fortOwner && !deps.isMapInspectionModeHeld()) {
      drawFortifiedCellTicks(ctx, pts, child, fortificationTickColor(fortOwner, true));
    }
  }
}

/**
 * Draws airport and seaport glyphs for core cells of the active battle.
 *
 * Purpose: Snapshot facility flags cover only the enclosing hex's children, so a neighbor airport in the margin is not drawn.
 * When to use: `drawTerrainInfrastructureOverlays` while a battle snapshot is set.
 * Expected outcome: Glyphs appear on on-screen core cells that the snapshot marks as an airport or seaport.
 * Exceptions: None.
 */
export function drawBattleFootprintInfrastructureGlyphs(
  ctx: CanvasRenderingContext2D,
  tactical: TacticalBattleSnapshot,
  map: { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } },
  leaflet: { latLng: (lat: number, lng: number) => unknown },
  viewportWidth: number,
  viewportHeight: number,
  outlineScreenPx: number
): void {
  for (const child of tactical.tacticalChildH3Indexes) {
    const ap = tactical.tacticalIsAirportByH3?.[child] === true;
    const pt = tactical.tacticalIsSeaportByH3?.[child] === true;
    if (!ap && !pt) continue;
    const pts = projectHexBoundaryToContainerPoints(child, map, leaflet);
    if (!shouldDrawTacticalChildHexInViewport(pts, viewportWidth, viewportHeight)) continue;
    drawTerrainInfrastructureGlyphs(ctx, pts, {
      showAirport: ap,
      showSeaport: pt,
      outlineScreenPx,
      glyphAreaScale: TACTICAL_TERRAIN_INFRA_GLYPH_AREA_SCALE,
    });
  }
}
