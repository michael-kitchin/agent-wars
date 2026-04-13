/**
 * Shared canvas stages for human order overlays (pending support orders) shared by strategic and tactical map draws.
 *
 * Purpose: Prevents tactical/strategic drift where one mode forgets to draw ranged/air/ferry pending lines.
 * When to use: `drawGameScene` after terrain and before units for both tactical and strategic branches.
 * Expected outcome: Identical support-order line rendering whenever `S.pending*` arrays are populated.
 * Exceptions: Returns early when `hexList` is empty or `state.units` is empty.
 */

import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { rendererSharedState as S } from '../core/state';
import { drawAirStrikeLines, drawPendingFerryLines, drawRangedAttackLines } from './orderDrawing';
import { drawLineArrow } from './pathDrawing';

/**
 * Draws pending ranged, air strike, and ferry overlay lines for the current renderer draft state.
 *
 * Purpose: Single call site for support-order overlays used in both tactical and strategic `drawGameScene` paths.
 * When to use: After march preview / committed line stages and before unit markers.
 * Expected outcome: No-op when there is nothing pending; otherwise strokes the same styles as strategic-only historically did.
 * Exceptions: None.
 */
export function drawPendingSupportOrderOverlays(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: GameStateSnapshot,
  hexList: string[]
): void {
  const unitsForOrderLines =
    S.tacticalBattleSnapshot?.subUnits.map((u) => ({ id: u.id, h3Index: u.h3Index })) ?? state.units;
  if (S.pendingRangedAttacks.length > 0 && unitsForOrderLines.length > 0 && hexList.length > 0) {
    drawRangedAttackLines(ctx, width, height, S.pendingRangedAttacks, unitsForOrderLines, hexList);
  }
  if (S.pendingAirStrikes.length > 0 && unitsForOrderLines.length > 0 && hexList.length > 0) {
    drawAirStrikeLines(ctx, S.pendingAirStrikes, unitsForOrderLines, hexList);
  }
  if (S.pendingFerryOrders.length > 0 && unitsForOrderLines.length > 0 && hexList.length > 0) {
    drawPendingFerryLines(ctx, S.pendingFerryOrders, unitsForOrderLines, hexList, drawLineArrow);
  }
}

/**
 * Invokes march hover preview drawing when selection + hover policy allows it and no resolution animation is active.
 *
 * Purpose: Matches strategic `if (shouldDrawPathPreview && !anim) drawHoverRoutePreview(ctx)` gating for tactical parity.
 * When to use: Both tactical and strategic branches of `drawGameScene` after other line overlays that should sit beneath hover.
 * Expected outcome: Preview draws only when `shouldDraw` is true and `animationActive` is false.
 * Exceptions: None; delegates to the injected `drawPreview` function.
 */
export function drawMarchHoverPreviewStageIfEnabled(
  ctx: CanvasRenderingContext2D,
  options: { shouldDraw: boolean; animationActive: boolean; drawPreview: (c: CanvasRenderingContext2D) => void }
): void {
  if (options.shouldDraw && !options.animationActive) {
    options.drawPreview(ctx);
  }
}

/**
 * Runs the canonical overlay stack: optional tactical pending march lines, then march hover preview, then pending support orders.
 *
 * Purpose: Single policy path for strategic vs tactical `drawGameScene` so overlay ordering cannot drift between branches.
 * When to use: After terrain (and strategic-only standing-order lines) and before unit markers / production overlays.
 * Expected outcome: Tactical callers supply `drawTacticalPendingMarchesFirst` to mirror the historical tactical-only stage.
 * Exceptions: None; delegates drawing to the existing stage helpers.
 */
export function drawPendingMarchesHoverAndSupportOrderStack(options: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  state: GameStateSnapshot;
  hexList: string[];
  drawTacticalPendingMarchesFirst?: () => void;
  shouldDrawMarchHoverPreview: boolean;
  resolutionAnimationBlocksMarchHoverPreview: boolean;
  drawMarchHoverPreview: (c: CanvasRenderingContext2D) => void;
}): void {
  options.drawTacticalPendingMarchesFirst?.();
  drawMarchHoverPreviewStageIfEnabled(options.ctx, {
    shouldDraw: options.shouldDrawMarchHoverPreview,
    animationActive: options.resolutionAnimationBlocksMarchHoverPreview,
    drawPreview: options.drawMarchHoverPreview,
  });
  drawPendingSupportOrderOverlays(
    options.ctx,
    options.width,
    options.height,
    options.state,
    options.hexList
  );
}
