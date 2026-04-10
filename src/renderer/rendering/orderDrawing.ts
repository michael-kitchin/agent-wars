import type { AirStrikeAnimationMove, AirStrikeOrder, FerryOrder, GameStateSnapshot, RangedAttackOrder } from '../../shared/ipcTypes';
import { ORDER_LINE_COLOR, ORDER_LINE_WIDTH } from '../core/constants';
import { hexCenterPx, hexCenterPxRelativeTo } from '../map/mapUtils';
import type { ResolutionMove, ResolutionPlaybackMove } from '../core/types';

/**
 * Defines the `drawRangedAttackLines` function shape (export function drawRangedAttackLines( ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, ranged: RangedAttackOrder[], uni).

 * Purpose: Supports maintainability by documenting why `drawRangedAttackLines` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function drawRangedAttackLines(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  ranged: RangedAttackOrder[],
  units: GameStateSnapshot['units'],
  hexList: string[] | undefined
): void {
  void canvasWidth;
  void canvasHeight;
  if (ranged.length === 0 || !hexList) return;
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#a06020';
  ctx.lineWidth = ORDER_LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const r of ranged) {
    const unit = units.find((u) => u.id === r.unitId);
    if (!unit) continue;
    const from = hexCenterPx(unit.h3Index);
    const to = hexCenterPxRelativeTo(unit.h3Index, r.targetH3Index);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Defines the `drawAirStrikeLines` function shape (export function drawAirStrikeLines( ctx: CanvasRenderingContext2D, airStrikes: AirStrikeOrder[], units: GameStateSnapshot['units'], hexList: string[).

 * Purpose: Supports maintainability by documenting why `drawAirStrikeLines` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function drawAirStrikeLines(
  ctx: CanvasRenderingContext2D,
  airStrikes: AirStrikeOrder[],
  units: GameStateSnapshot['units'],
  hexList: string[] | undefined
): void {
  if (airStrikes.length === 0 || !hexList) return;
  ctx.save();
  ctx.setLineDash([2, 6]);
  ctx.strokeStyle = '#7a3db5';
  ctx.lineWidth = ORDER_LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const strike of airStrikes) {
    const unit = units.find((u) => u.id === strike.unitId);
    if (!unit) continue;
    const from = hexCenterPx(unit.h3Index);
    const to = hexCenterPxRelativeTo(unit.h3Index, strike.targetH3Index);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Defines the `drawPendingFerryLines` function shape (export function drawPendingFerryLines( ctx: CanvasRenderingContext2D, ferryOrders: FerryOrder[], units: GameStateSnapshot['units'], hexList: string[).

 * Purpose: Supports maintainability by documenting why `drawPendingFerryLines` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function drawPendingFerryLines(
  ctx: CanvasRenderingContext2D,
  ferryOrders: FerryOrder[],
  units: GameStateSnapshot['units'],
  hexList: string[] | undefined,
  drawLineArrow: (
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: string
  ) => void
): void {
  if (ferryOrders.length === 0 || !hexList) return;
  ctx.save();
  for (const ferry of ferryOrders) {
    const unit = units.find((u) => u.id === ferry.unitId);
    if (!unit) continue;
    drawLineArrow(
      ctx,
      hexCenterPx(unit.h3Index),
      hexCenterPxRelativeTo(unit.h3Index, ferry.destinationH3Index),
      ORDER_LINE_COLOR
    );
  }
  ctx.restore();
}

/**
 * Defines the `buildResolutionPlaybackMoves` function shape (export function buildResolutionPlaybackMoves().

 * Purpose: Supports maintainability by documenting why `buildResolutionPlaybackMoves` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildResolutionPlaybackMoves(
  moves: ResolutionMove[],
  units: GameStateSnapshot['units']
): ResolutionPlaybackMove[] {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  return moves
    .map((move) => {
      const unit = byId.get(move.unitId);
      if (!unit) return null;
      return {
        unitId: move.unitId,
        player: unit.player,
        unitType: unit.unitType,
        fromH3Index: move.fromH3Index,
        toH3Index: move.toH3Index,
      };
    })
    .filter((move): move is ResolutionPlaybackMove => move !== null);
}

/**
 * Defines the `buildAirStrikeOutboundPlaybackMoves` function shape (export function buildAirStrikeOutboundPlaybackMoves().

 * Purpose: Supports maintainability by documenting why `buildAirStrikeOutboundPlaybackMoves` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildAirStrikeOutboundPlaybackMoves(
  moves: AirStrikeAnimationMove[] | undefined
): ResolutionPlaybackMove[] {
  if (!moves || moves.length === 0) return [];
  return moves.map((move) => ({
    unitId: move.unitId,
    player: move.player,
    unitType: move.unitType,
    fromH3Index: move.fromH3Index,
    toH3Index: move.targetH3Index,
  }));
}

/**
 * Defines the `buildAirStrikeReturnPlaybackMoves` function shape (export function buildAirStrikeReturnPlaybackMoves().

 * Purpose: Supports maintainability by documenting why `buildAirStrikeReturnPlaybackMoves` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildAirStrikeReturnPlaybackMoves(
  moves: AirStrikeAnimationMove[] | undefined
): ResolutionPlaybackMove[] {
  if (!moves || moves.length === 0) return [];
  return moves
    .filter((move) => move.returnsToBase)
    .map((move) => ({
      unitId: move.unitId,
      player: move.player,
      unitType: move.unitType,
      fromH3Index: move.targetH3Index,
      toH3Index: move.fromH3Index,
    }));
}
