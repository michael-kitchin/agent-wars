import type { GameStateSnapshot } from '../../shared/ipcTypes';
import {
  UNIT_ICON_HIT_PAD_PX,
  UNIT_RADIUS,
  STACK_OFFSET_X,
  STACK_OFFSET_Y,
  BUILD_ENTRY_HIT_PAD_PX,
  TACTICAL_ENTRY_HIT_PAD_PX,
} from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import {
  resolutionAnimationElapsedMs,
  type ResolutionPlaybackState,
} from '../rendering/resolutionPlayback';
import { hexCenterPx, hitTestHexAtContainerPixel, hitTestTacticalRes4HexAtContainerPixel } from './mapUtils';
import { getMainLeafletMap } from './worldLeafletMap';

/**
 * Documents the `DrawInteractionDeps` interface as a named contract surface (interface DrawInteractionDeps).

 * Purpose: Supports maintainability by documenting why `DrawInteractionDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface DrawInteractionDeps {
    /**
   * Specifies the contract for the `backgroundColor` member (backgroundColor: string;).

   * Contract: Describes stable behavior for callers of `backgroundColor` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
backgroundColor: string;
    /**
   * Specifies the contract for the `buildResolutionPlaybackState` member (buildResolutionPlaybackState: (anim: NonNullable<typeof S.resolutionMoveAnimation>, elapsed: number) => ResolutionPlaybackState;).

   * Contract: Describes stable behavior for callers of `buildResolutionPlaybackState` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
buildResolutionPlaybackState: (
    anim: NonNullable<typeof S.resolutionMoveAnimation>,
    elapsed: number
  ) => ResolutionPlaybackState;
    /**
   * Specifies the contract for the `hideBuildPopup` member (hideBuildPopup: () => void;).

   * Contract: Describes stable behavior for callers of `hideBuildPopup` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hideBuildPopup: () => void;
    /**
   * Specifies the contract for the `showBuildPopup` member (showBuildPopup: (h3Index: string, clientX: number, clientY: number) => void;).

   * Contract: Describes stable behavior for callers of `showBuildPopup` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
showBuildPopup: (h3Index: string, clientX: number, clientY: number) => void;
}

/**
 * Defines the `drawLoadingScene` function shape (export function drawLoadingScene(ctx: CanvasRenderingContext2D, width: number, height: number, deps: DrawInteractionDeps): void).

 * Purpose: Supports maintainability by documenting why `drawLoadingScene` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function drawLoadingScene(ctx: CanvasRenderingContext2D, width: number, height: number, deps: DrawInteractionDeps): void {
  ctx.fillStyle = deps.backgroundColor;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#666';
  ctx.font = '14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Loading...', width / 2, height / 2);
}

/**
 * Defines the `getUnitsForDrawWithMovingIds` function shape (export function getUnitsForDrawWithMovingIds( state: GameStateSnapshot, deps: DrawInteractionDeps ): { unitsToDraw: GameStateSnapshot['units']; movingIds).

 * Purpose: Supports maintainability by documenting why `getUnitsForDrawWithMovingIds` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getUnitsForDrawWithMovingIds(
  state: GameStateSnapshot,
  deps: DrawInteractionDeps
): { unitsToDraw: GameStateSnapshot['units']; movingIds: Set<string> | undefined } {
  let unitsToDraw: GameStateSnapshot['units'] = state.units;
  let movingIds: Set<string> | undefined;
  const anim = S.resolutionMoveAnimation;
  if (anim) {
    const elapsed = resolutionAnimationElapsedMs(anim);
    const { phase } = deps.buildResolutionPlaybackState(anim, elapsed);
    const moveProgress = phase.moveProgress;
    const rangedRemovedIds = new Set((anim.rangedRemovedUnits ?? []).map((u) => u.id));
    if (phase.inAirStrikeOutbound) {
      unitsToDraw = state.units;
      movingIds = new Set((anim.airStrikeOutboundMoves ?? []).map((move) => move.unitId));
    } else if (phase.inAirStrikeLightning || phase.inAirStrikeCasualty) {
      const strikeMoves = anim.airStrikeOutboundMoves ?? [];
      const strikeMoveById = new Map(strikeMoves.map((move) => [move.unitId, move]));
      const staticUnits = state.units.filter((unit) => !strikeMoveById.has(unit.id));
      const strikeUnitsAtTarget = strikeMoves.map((move) => {
        const existing = state.units.find((unit) => unit.id === move.unitId);
        if (existing) {
          return { ...existing, h3Index: move.toH3Index };
        }
        return {
          id: move.unitId,
          player: move.player,
          unitType: move.unitType,
          h3Index: move.toH3Index,
        };
      });
      unitsToDraw = [...staticUnits, ...strikeUnitsAtTarget];
      movingIds = undefined;
    } else if (phase.inAirStrikeReturn) {
      unitsToDraw = state.units;
      movingIds = new Set((anim.airStrikeReturnMoves ?? []).map((move) => move.unitId));
    } else if (phase.inRangedLightning || phase.inRangedCasualty) {
      const preMoveSurvivors = state.units
        .filter((u) => !rangedRemovedIds.has(u.id))
        .map((u) => {
          const move = anim.moves.find((m) => m.unitId === u.id);
          return move ? { ...u, h3Index: move.fromH3Index } : u;
        });
      unitsToDraw = [...preMoveSurvivors, ...(anim.rangedRemovedUnits ?? [])];
      movingIds = undefined;
    } else if (phase.inMovement) {
      unitsToDraw = state.units;
      movingIds = moveProgress < 1 ? new Set(anim.moves.map((m) => m.unitId)) : undefined;
    } else if (anim.moves.length > 0 && moveProgress < 1) {
      // Snapshot already lists march destinations during pre-move phases; draw movers at playback origins until movement anim hides them.
      const moveById = new Map(anim.moves.map((m) => [m.unitId, m] as const));
      unitsToDraw = state.units.map((u) => {
        const m = moveById.get(u.id);
        return m ? { ...u, h3Index: m.fromH3Index } : u;
      });
      movingIds = undefined;
    } else if (phase.inMeleeLightning || phase.inMeleeCasualty) {
      unitsToDraw = [...state.units, ...(anim.meleeRemovedUnits ?? [])];
      movingIds = undefined;
    }
  } else {
    movingIds = undefined;
  }
  return { unitsToDraw, movingIds };
}

/**
 * Defines the `containerPixelHitsDrawnUnitIcon` function shape (export function containerPixelHitsDrawnUnitIcon(px: number, py: number, h3Index: string, unitCount: number): boolean).

 * Purpose: Supports maintainability by documenting why `containerPixelHitsDrawnUnitIcon` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function containerPixelHitsDrawnUnitIcon(px: number, py: number, h3Index: string, unitCount: number): boolean {
  const { x, y } = hexCenterPx(h3Index);
  const r = UNIT_RADIUS + UNIT_ICON_HIT_PAD_PX;
  const within = (cx: number, cy: number): boolean => {
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy <= r * r;
  };
  if (unitCount <= 1) return within(x, y);
  return within(x, y) || within(x + STACK_OFFSET_X, y + STACK_OFFSET_Y);
}

/**
 * Defines the `pointInExpandedClientRect` function shape (export function pointInExpandedClientRect().

 * Purpose: Supports maintainability by documenting why `pointInExpandedClientRect` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function pointInExpandedClientRect(
  clientX: number,
  clientY: number,
  rect: DOMRectReadOnly,
  padPx: number
): boolean {
  return (
    clientX >= rect.left - padPx &&
    clientX <= rect.right + padPx &&
    clientY >= rect.top - padPx &&
    clientY <= rect.bottom + padPx
  );
}

/**
 * Defines the `tryHandleBuildEntryAtClientXY` function shape (export function tryHandleBuildEntryAtClientXY(clientX: number, clientY: number, deps: DrawInteractionDeps): boolean).

 * Purpose: Supports maintainability by documenting why `tryHandleBuildEntryAtClientXY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function tryHandleBuildEntryAtClientXY(clientX: number, clientY: number, deps: DrawInteractionDeps): boolean {
  const layer = document.getElementById('build-entry-layer');
  if (!layer || layer.classList.contains('hidden')) return false;
  const buttons = Array.from(layer.querySelectorAll<HTMLButtonElement>('.build-entry-btn'));
  for (const btn of buttons) {
    const r = btn.getBoundingClientRect();
    if (!pointInExpandedClientRect(clientX, clientY, r, BUILD_ENTRY_HIT_PAD_PX)) continue;
    const h3 = btn.dataset.h3Index;
    if (!h3) continue;
    S.selectedHexIndex = h3;
    const popup = document.getElementById('build-popup');
    if (popup && !popup.classList.contains('hidden') && S.buildPopupHexH3 === h3) {
      deps.hideBuildPopup();
    } else {
      deps.showBuildPopup(h3, clientX, clientY);
    }
    return true;
  }
  return false;
}

/**
 * Defines the `updateMapInteractionCursor` function shape (export function updateMapInteractionCursor(clientX: number, clientY: number, deps: DrawInteractionDeps): void).

 * Purpose: Supports maintainability by documenting why `updateMapInteractionCursor` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function updateMapInteractionCursor(clientX: number, clientY: number, deps: DrawInteractionDeps): void {
  const map = getMainLeafletMap() as { getContainer: () => HTMLElement } | null;
  if (!map) return;
  const container = map.getContainer();
  if (container.classList.contains('leaflet-dragging')) {
    if (S.lastAppliedMapInteractionCursor !== '') {
      S.lastAppliedMapInteractionCursor = '';
      container.style.removeProperty('cursor');
    }
    return;
  }
  const rect = container.getBoundingClientRect();
  const inside =
    clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  if (!inside) {
    if (S.lastAppliedMapInteractionCursor !== '') {
      S.lastAppliedMapInteractionCursor = '';
      container.style.removeProperty('cursor');
    }
    return;
  }
  let want = '';
  const layer = document.getElementById('build-entry-layer');
  if (layer && !layer.classList.contains('hidden')) {
    const buttons = Array.from(layer.querySelectorAll<HTMLButtonElement>('.build-entry-btn'));
    for (const btn of buttons) {
      const br = btn.getBoundingClientRect();
      if (pointInExpandedClientRect(clientX, clientY, br, BUILD_ENTRY_HIT_PAD_PX)) {
        want = 'default';
        break;
      }
    }
  }
  const tacticalLayer = document.getElementById('tactical-entry-layer');
  if (want === '' && tacticalLayer && !tacticalLayer.classList.contains('hidden')) {
    const tacticalBtns = Array.from(tacticalLayer.querySelectorAll<HTMLButtonElement>('.tactical-entry-btn'));
    for (const btn of tacticalBtns) {
      const br = btn.getBoundingClientRect();
      if (pointInExpandedClientRect(clientX, clientY, br, TACTICAL_ENTRY_HIT_PAD_PX)) {
        want = 'default';
        break;
      }
    }
  }
  if (want === '' && S.gameState) {
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const hexSet = new Set(S.gameState.hexes.map((h) => h.h3Index));
    const tb = S.tacticalBattleSnapshot;
    const hit = tb ? hitTestTacticalRes4HexAtContainerPixel(px, py, tb) : hitTestHexAtContainerPixel(px, py, hexSet);
    if (hit) {
      const { unitsToDraw, movingIds } = getUnitsForDrawWithMovingIds(S.gameState, deps);
      const drawnAtHit = unitsToDraw.filter((u) => u.h3Index === hit && !movingIds?.has(u.id));
      if (drawnAtHit.length > 0 && containerPixelHitsDrawnUnitIcon(px, py, hit, drawnAtHit.length)) {
        want = 'default';
      }
    }
  }
  if (want !== S.lastAppliedMapInteractionCursor) {
    S.lastAppliedMapInteractionCursor = want;
    if (want === '') container.style.removeProperty('cursor');
    else container.style.cursor = want;
  }
}
