import type { ResolutionMoveAnimationState } from '../core/state';
import { buildResolutionPlaybackState } from './resolutionPlayback';
import { drawCasualtyOverlay, drawCombatLightning, drawUnknownBattleMarkers } from './unitDrawing';

/**
 * Draws resolution-phase combat lightning and casualty overlays for the current playback phase.
 *
 * Purpose: Single implementation for tactical and strategic `drawGameScene` so combat/casualty selection cannot drift.
 * When to use: After shot connectors and unit markers; pass the already-computed `elapsed` ms for the animation.
 * Expected outcome: Lightning (and unknown battle markers) then casualty overlays when the phase windows are active.
 * Exceptions: None; no-ops when hex lists are empty for the active phase.
 */
export function drawResolutionCombatAndCasualtyOverlays(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  anim: ResolutionMoveAnimationState,
  hexList: string[],
  elapsed: number
): void {
  const { phase } = buildResolutionPlaybackState(anim, elapsed);
  const meleeCombatHexes = [
    ...(anim.meleeCombatHexes ?? []),
    ...(anim.controlLossLightningHexes ?? []),
  ].filter((h3, idx, arr) => arr.indexOf(h3) === idx);
  const combatHexes = phase.inAirStrikeLightning
    ? anim.airStrikeCombatHexes
    : phase.inRangedLightning
      ? (anim.rangedCombatHexes ?? anim.combatHexes)
      : phase.inMeleeLightning
        ? meleeCombatHexes
        : undefined;
  if (combatHexes?.length) {
    const pulseOpacity = 0.5 + 0.5 * Math.sin(elapsed * 0.008);
    const unknownSet = new Set(anim.unknownCombatHexes ?? []);
    const knownCombatHexes = combatHexes.filter((h3) => !unknownSet.has(h3));
    const unknownCombatHexes = combatHexes.filter((h3) => unknownSet.has(h3));
    drawCombatLightning(ctx, width, height, knownCombatHexes, hexList, pulseOpacity);
    drawUnknownBattleMarkers(ctx, unknownCombatHexes, pulseOpacity);
  }
  const casualtyHexes = phase.inAirStrikeCasualty
    ? anim.airStrikeCasualtyHexes
    : phase.inRangedCasualty
      ? (anim.rangedCasualtyHexes ?? anim.casualtyHexes)
      : phase.inMeleeCasualty
        ? anim.meleeCasualtyHexes
        : undefined;
  if (casualtyHexes?.length) {
    const casualtyElapsed = phase.inAirStrikeCasualty
      ? elapsed - phase.airStrikeCasualtyStart
      : phase.inRangedCasualty
        ? elapsed - phase.rangedCasualtyStart
        : elapsed - phase.meleeCasualtyStart;
    const pulseOpacity = 0.5 + 0.5 * Math.sin(casualtyElapsed * 0.008);
    const unknownSet = new Set(anim.unknownCasualtyHexes ?? []);
    const knownCasualtyHexes = casualtyHexes.filter((h3) => !unknownSet.has(h3));
    const unknownCasualtyHexes = casualtyHexes.filter((h3) => unknownSet.has(h3));
    drawCasualtyOverlay(ctx, width, height, knownCasualtyHexes, hexList, pulseOpacity);
    drawUnknownBattleMarkers(ctx, unknownCasualtyHexes, pulseOpacity);
  }
}
