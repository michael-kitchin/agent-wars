import {
  getResolutionPlaybackPhase,
  type ResolutionPlaybackPhase,
} from '../../shared/resolutionPlaybackPhase';

/**
 * Re-exports the playback timeline snapshot so existing renderer imports keep their path.
 *
 * Purpose: `renderer.ts` imports this type from the playback module. The timeline math lives in shared code so tests can run it without the renderer.
 * When to use: Import `ResolutionPlaybackPhase` from this module when already importing playback helpers.
 * Expected outcome: The same type `getResolutionPlaybackPhase` returns.
 * Exceptions: None.
 */
export type { ResolutionPlaybackPhase };

/**
 * Documents the module-scope binding `RESOLUTION_FADE_MS` (RESOLUTION_FADE_MS).

 * Purpose: Supports maintainability by documenting why `RESOLUTION_FADE_MS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const RESOLUTION_FADE_MS = 1000;
/**
 * Documents the module-scope binding `LIGHTNING_DURATION_MS` (LIGHTNING_DURATION_MS).

 * Purpose: Supports maintainability by documenting why `LIGHTNING_DURATION_MS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const LIGHTNING_DURATION_MS = 1000;


/**
 * Documents the `ResolutionAnimationInput` interface as a named contract surface (export interface ResolutionAnimationInput).

 * Purpose: Supports maintainability by documenting why `ResolutionAnimationInput` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ResolutionAnimationInput {
    /**
   * Specifies the contract for the `airStrikeOutboundMoves` member (airStrikeOutboundMoves?: unknown[];).

   * Contract: Describes stable behavior for callers of `airStrikeOutboundMoves` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeOutboundMoves?: unknown[];
    /**
   * Specifies the contract for the `airStrikeCombatHexes` member (airStrikeCombatHexes?: unknown[];).

   * Contract: Describes stable behavior for callers of `airStrikeCombatHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeCombatHexes?: unknown[];
    /**
   * Specifies the contract for the `airStrikeCasualtyHexes` member (airStrikeCasualtyHexes?: unknown[];).

   * Contract: Describes stable behavior for callers of `airStrikeCasualtyHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeCasualtyHexes?: unknown[];
    /**
   * Specifies the contract for the `airStrikeReturnMoves` member (airStrikeReturnMoves?: unknown[];).

   * Contract: Describes stable behavior for callers of `airStrikeReturnMoves` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeReturnMoves?: unknown[];
    /**
   * Specifies the contract for the `rangedCombatHexes` member (rangedCombatHexes?: unknown[];).

   * Contract: Describes stable behavior for callers of `rangedCombatHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rangedCombatHexes?: unknown[];
    /**
   * Specifies the contract for the `combatHexes` member (combatHexes?: unknown[];).

   * Contract: Describes stable behavior for callers of `combatHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
combatHexes?: unknown[];
    /**
   * Specifies the contract for the `rangedCasualtyHexes` member (rangedCasualtyHexes?: unknown[];).

   * Contract: Describes stable behavior for callers of `rangedCasualtyHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rangedCasualtyHexes?: unknown[];
    /**
   * Specifies the contract for the `casualtyHexes` member (casualtyHexes?: unknown[];).

   * Contract: Describes stable behavior for callers of `casualtyHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
casualtyHexes?: unknown[];
  /**
   * March segments for this resolution. Their length decides whether the movement stage has duration.
   *
   * Contract: Optional. Missing or empty means the movement stage lasts 0 ms.
   * When to use: When the animation object includes the marches that playback may show.
   * Expected outcome: A non-empty list makes the movement stage last one fade interval.
   * Exceptions: None.
   */
  moves?: unknown[];
    /**
   * Specifies the contract for the `meleeCombatHexes` member (meleeCombatHexes?: unknown[];).

   * Contract: Describes stable behavior for callers of `meleeCombatHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
meleeCombatHexes?: unknown[];
    /**
   * Specifies the contract for the `controlLossLightningHexes` member (controlLossLightningHexes?: unknown[];).

   * Contract: Describes stable behavior for callers of `controlLossLightningHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
controlLossLightningHexes?: unknown[];
    /**
   * Specifies the contract for the `meleeCasualtyHexes` member (meleeCasualtyHexes?: unknown[];).

   * Contract: Describes stable behavior for callers of `meleeCasualtyHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
meleeCasualtyHexes?: unknown[];
}

/**
 * Documents the `ResolutionPlaybackState` interface as a named contract surface (export interface ResolutionPlaybackState).

 * Purpose: Supports maintainability by documenting why `ResolutionPlaybackState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ResolutionPlaybackState {
    /**
   * Specifies the contract for the `hasAirStrikeOutbound` member (hasAirStrikeOutbound: boolean;).

   * Contract: Describes stable behavior for callers of `hasAirStrikeOutbound` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hasAirStrikeOutbound: boolean;
    /**
   * Specifies the contract for the `hasAirStrikeCombat` member (hasAirStrikeCombat: boolean;).

   * Contract: Describes stable behavior for callers of `hasAirStrikeCombat` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hasAirStrikeCombat: boolean;
    /**
   * Specifies the contract for the `hasAirStrikeCasualties` member (hasAirStrikeCasualties: boolean;).

   * Contract: Describes stable behavior for callers of `hasAirStrikeCasualties` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hasAirStrikeCasualties: boolean;
    /**
   * Specifies the contract for the `hasAirStrikeReturn` member (hasAirStrikeReturn: boolean;).

   * Contract: Describes stable behavior for callers of `hasAirStrikeReturn` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hasAirStrikeReturn: boolean;
    /**
   * Specifies the contract for the `hasRangedCombat` member (hasRangedCombat: boolean;).

   * Contract: Describes stable behavior for callers of `hasRangedCombat` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hasRangedCombat: boolean;
    /**
   * Specifies the contract for the `hasRangedCasualties` member (hasRangedCasualties: boolean;).

   * Contract: Describes stable behavior for callers of `hasRangedCasualties` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hasRangedCasualties: boolean;
    /**
   * Specifies the contract for the `hasMeleeCombat` member (hasMeleeCombat: boolean;).

   * Contract: Describes stable behavior for callers of `hasMeleeCombat` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hasMeleeCombat: boolean;
    /**
   * Specifies the contract for the `hasMeleeCasualties` member (hasMeleeCasualties: boolean;).

   * Contract: Describes stable behavior for callers of `hasMeleeCasualties` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hasMeleeCasualties: boolean;
    /**
   * Specifies the contract for the `phase` member (phase: ResolutionPlaybackPhase;).

   * Contract: Describes stable behavior for callers of `phase` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
phase: ResolutionPlaybackPhase;
}

/**
 * Milliseconds elapsed on the resolution playback timeline for the active animation object.
 *
 * Purpose: Tactical Ready arms `S.resolutionMoveAnimation` before awaiting IPC; without deferring, rAF would advance
 * `Date.now() - startTime` during those awaits and consume most of the movement segment before the first visible frame.
 * When to use: Any call site that previously used `Date.now() - anim.startTime` with `buildResolutionPlaybackState`.
 * Expected outcome: Returns 0 while `tacticalDeferResolutionClock` is true; otherwise `Date.now() - anim.startTime`.
 * Exceptions: None.
 */
export function resolutionAnimationElapsedMs(anim: {
  startTime: number;
  tacticalDeferResolutionClock?: boolean;
}): number {
  if (anim.tacticalDeferResolutionClock) return 0;
  return Date.now() - anim.startTime;
}

/**
 * Builds the stage flags and timeline snapshot for one resolution animation frame.
 *
 * Purpose: The renderer draws from one object that says which stages exist and where the clock is.
 * When to use: Once per animation frame, with elapsed milliseconds from `resolutionAnimationElapsedMs`.
 * Expected outcome: Stage flags follow the animation lists. The movement stage has duration only when `moves` is non-empty.
 * Exceptions: None.
 */
export function buildResolutionPlaybackState(
  anim: ResolutionAnimationInput,
  elapsed: number
): ResolutionPlaybackState {
  const hasAirStrikeOutbound = (anim.airStrikeOutboundMoves?.length ?? 0) > 0;
  const hasAirStrikeCombat = (anim.airStrikeCombatHexes?.length ?? 0) > 0;
  const hasAirStrikeCasualties = (anim.airStrikeCasualtyHexes?.length ?? 0) > 0;
  const hasAirStrikeReturn = (anim.airStrikeReturnMoves?.length ?? 0) > 0;
  const hasRangedCombat = (anim.rangedCombatHexes?.length ?? 0) > 0 || (anim.combatHexes?.length ?? 0) > 0;
  const hasRangedCasualties = (anim.rangedCasualtyHexes?.length ?? 0) > 0 || (anim.casualtyHexes?.length ?? 0) > 0;
  const hasMeleeCombat = (anim.meleeCombatHexes?.length ?? 0) > 0 || (anim.controlLossLightningHexes?.length ?? 0) > 0;
  const hasMeleeCasualties = (anim.meleeCasualtyHexes?.length ?? 0) > 0;
  return {
    hasAirStrikeOutbound,
    hasAirStrikeCombat,
    hasAirStrikeCasualties,
    hasAirStrikeReturn,
    hasRangedCombat,
    hasRangedCasualties,
    hasMeleeCombat,
    hasMeleeCasualties,
    phase: getResolutionPlaybackPhase({
      elapsed,
      fadeMs: RESOLUTION_FADE_MS,
      lightningMs: LIGHTNING_DURATION_MS,
      hasAirStrikeOutbound,
      hasAirStrikeCombat,
      hasAirStrikeCasualties,
      hasAirStrikeReturn,
      hasRangedCombat,
      hasRangedCasualties,
      hasMoves: (anim.moves?.length ?? 0) > 0,
      hasMeleeCombat,
      hasMeleeCasualties,
    }),
  };
}
