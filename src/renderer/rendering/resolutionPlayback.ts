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
 * Documents the `ResolutionPlaybackPhase` interface as a named contract surface (export interface ResolutionPlaybackPhase).

 * Purpose: Supports maintainability by documenting why `ResolutionPlaybackPhase` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ResolutionPlaybackPhase {
    /**
   * Specifies the contract for the `airStrikeOutboundStart` member (airStrikeOutboundStart: number;).

   * Contract: Describes stable behavior for callers of `airStrikeOutboundStart` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeOutboundStart: number;
    /**
   * Specifies the contract for the `airStrikeCombatStart` member (airStrikeCombatStart: number;).

   * Contract: Describes stable behavior for callers of `airStrikeCombatStart` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeCombatStart: number;
    /**
   * Specifies the contract for the `airStrikeCasualtyStart` member (airStrikeCasualtyStart: number;).

   * Contract: Describes stable behavior for callers of `airStrikeCasualtyStart` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeCasualtyStart: number;
    /**
   * Specifies the contract for the `airStrikeReturnStart` member (airStrikeReturnStart: number;).

   * Contract: Describes stable behavior for callers of `airStrikeReturnStart` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeReturnStart: number;
    /**
   * Specifies the contract for the `rangedCombatStart` member (rangedCombatStart: number;).

   * Contract: Describes stable behavior for callers of `rangedCombatStart` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rangedCombatStart: number;
    /**
   * Specifies the contract for the `rangedCasualtyStart` member (rangedCasualtyStart: number;).

   * Contract: Describes stable behavior for callers of `rangedCasualtyStart` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rangedCasualtyStart: number;
    /**
   * Specifies the contract for the `movementStart` member (movementStart: number;).

   * Contract: Describes stable behavior for callers of `movementStart` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
movementStart: number;
    /**
   * Specifies the contract for the `meleeCombatStart` member (meleeCombatStart: number;).

   * Contract: Describes stable behavior for callers of `meleeCombatStart` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
meleeCombatStart: number;
    /**
   * Specifies the contract for the `meleeCasualtyStart` member (meleeCasualtyStart: number;).

   * Contract: Describes stable behavior for callers of `meleeCasualtyStart` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
meleeCasualtyStart: number;
    /**
   * Specifies the contract for the `totalMs` member (totalMs: number;).

   * Contract: Describes stable behavior for callers of `totalMs` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
totalMs: number;
    /**
   * Specifies the contract for the `airStrikeOutboundProgress` member (airStrikeOutboundProgress: number;).

   * Contract: Describes stable behavior for callers of `airStrikeOutboundProgress` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeOutboundProgress: number;
    /**
   * Specifies the contract for the `airStrikeReturnProgress` member (airStrikeReturnProgress: number;).

   * Contract: Describes stable behavior for callers of `airStrikeReturnProgress` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeReturnProgress: number;
    /**
   * Specifies the contract for the `moveProgress` member (moveProgress: number;).

   * Contract: Describes stable behavior for callers of `moveProgress` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
moveProgress: number;
    /**
   * Specifies the contract for the `inAirStrikeOutbound` member (inAirStrikeOutbound: boolean;).

   * Contract: Describes stable behavior for callers of `inAirStrikeOutbound` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
inAirStrikeOutbound: boolean;
    /**
   * Specifies the contract for the `inAirStrikeLightning` member (inAirStrikeLightning: boolean;).

   * Contract: Describes stable behavior for callers of `inAirStrikeLightning` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
inAirStrikeLightning: boolean;
    /**
   * Specifies the contract for the `inAirStrikeCasualty` member (inAirStrikeCasualty: boolean;).

   * Contract: Describes stable behavior for callers of `inAirStrikeCasualty` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
inAirStrikeCasualty: boolean;
    /**
   * Specifies the contract for the `inAirStrikeReturn` member (inAirStrikeReturn: boolean;).

   * Contract: Describes stable behavior for callers of `inAirStrikeReturn` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
inAirStrikeReturn: boolean;
    /**
   * Specifies the contract for the `inRangedLightning` member (inRangedLightning: boolean;).

   * Contract: Describes stable behavior for callers of `inRangedLightning` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
inRangedLightning: boolean;
    /**
   * Specifies the contract for the `inRangedCasualty` member (inRangedCasualty: boolean;).

   * Contract: Describes stable behavior for callers of `inRangedCasualty` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
inRangedCasualty: boolean;
    /**
   * Specifies the contract for the `inMovement` member (inMovement: boolean;).

   * Contract: Describes stable behavior for callers of `inMovement` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
inMovement: boolean;
    /**
   * Specifies the contract for the `inMeleeLightning` member (inMeleeLightning: boolean;).

   * Contract: Describes stable behavior for callers of `inMeleeLightning` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
inMeleeLightning: boolean;
    /**
   * Specifies the contract for the `inMeleeCasualty` member (inMeleeCasualty: boolean;).

   * Contract: Describes stable behavior for callers of `inMeleeCasualty` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
inMeleeCasualty: boolean;
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
 * Defines the `getResolutionPlaybackPhase` function shape (export function getResolutionPlaybackPhase( elapsed: number, hasAirStrikeOutbound: boolean, hasAirStrikeCombat: boolean, hasAirStrikeCasualties: boo).

 * Purpose: Supports maintainability by documenting why `getResolutionPlaybackPhase` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getResolutionPlaybackPhase(
  elapsed: number,
  hasAirStrikeOutbound: boolean,
  hasAirStrikeCombat: boolean,
  hasAirStrikeCasualties: boolean,
  hasAirStrikeReturn: boolean,
  hasRangedCombat: boolean,
  hasRangedCasualties: boolean,
  hasMeleeCombat: boolean,
  hasMeleeCasualties: boolean
): ResolutionPlaybackPhase {
  const L = LIGHTNING_DURATION_MS;
  const M = RESOLUTION_FADE_MS;
  const airStrikeOutboundStart = 0;
  const airStrikeOutboundEnd = airStrikeOutboundStart + (hasAirStrikeOutbound ? M : 0);
  const airStrikeCombatStart = airStrikeOutboundEnd;
  const airStrikeCombatEnd = airStrikeCombatStart + (hasAirStrikeCombat ? L : 0);
  const airStrikeCasualtyStart = airStrikeCombatEnd;
  const airStrikeCasualtyEnd = airStrikeCasualtyStart + (hasAirStrikeCasualties ? L : 0);
  const airStrikeReturnStart = airStrikeCasualtyEnd;
  const airStrikeReturnEnd = airStrikeReturnStart + (hasAirStrikeReturn ? M : 0);
  const rangedCombatStart = airStrikeReturnEnd;
  const rangedLightningEnd = rangedCombatStart + (hasRangedCombat ? L : 0);
  const rangedCasualtyStart = rangedLightningEnd;
  const rangedCasualtyEnd = rangedCasualtyStart + (hasRangedCasualties ? L : 0);
  const movementStart = rangedCasualtyEnd;
  const movementEnd = movementStart + M;
  const meleeCombatStart = movementEnd;
  const meleeLightningEnd = meleeCombatStart + (hasMeleeCombat ? L : 0);
  const meleeCasualtyStart = meleeLightningEnd;
  const meleeCasualtyEnd = meleeCasualtyStart + (hasMeleeCasualties ? L : 0);
  const totalMs = meleeCasualtyEnd;
  const airStrikeOutboundProgress =
    !hasAirStrikeOutbound || elapsed < airStrikeOutboundStart
      ? 0
      : elapsed >= airStrikeOutboundEnd
        ? 1
        : (elapsed - airStrikeOutboundStart) / M;
  const airStrikeReturnProgress =
    !hasAirStrikeReturn || elapsed < airStrikeReturnStart
      ? 0
      : elapsed >= airStrikeReturnEnd
        ? 1
        : (elapsed - airStrikeReturnStart) / M;
  const moveProgress = elapsed < movementStart ? 0 : elapsed >= movementEnd ? 1 : (elapsed - movementStart) / M;
  return {
    airStrikeOutboundStart,
    airStrikeCombatStart,
    airStrikeCasualtyStart,
    airStrikeReturnStart,
    rangedCombatStart,
    rangedCasualtyStart,
    movementStart,
    meleeCombatStart,
    meleeCasualtyStart,
    totalMs,
    airStrikeOutboundProgress,
    airStrikeReturnProgress,
    moveProgress,
    inAirStrikeOutbound: hasAirStrikeOutbound && elapsed >= airStrikeOutboundStart && elapsed < airStrikeOutboundEnd,
    inAirStrikeLightning: hasAirStrikeCombat && elapsed >= airStrikeCombatStart && elapsed < airStrikeCombatEnd,
    inAirStrikeCasualty: hasAirStrikeCasualties && elapsed >= airStrikeCasualtyStart && elapsed < airStrikeCasualtyEnd,
    inAirStrikeReturn: hasAirStrikeReturn && elapsed >= airStrikeReturnStart && elapsed < airStrikeReturnEnd,
    inRangedLightning: hasRangedCombat && elapsed >= rangedCombatStart && elapsed < rangedLightningEnd,
    inRangedCasualty: hasRangedCasualties && elapsed >= rangedCasualtyStart && elapsed < rangedCasualtyEnd,
    inMovement: elapsed >= movementStart && elapsed < movementEnd,
    inMeleeLightning: hasMeleeCombat && elapsed >= meleeCombatStart && elapsed < meleeLightningEnd,
    inMeleeCasualty: hasMeleeCasualties && elapsed >= meleeCasualtyStart && elapsed < meleeCasualtyEnd,
  };
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
 * Defines the `buildResolutionPlaybackState` function shape (export function buildResolutionPlaybackState().

 * Purpose: Supports maintainability by documenting why `buildResolutionPlaybackState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
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
    phase: getResolutionPlaybackPhase(
      elapsed,
      hasAirStrikeOutbound,
      hasAirStrikeCombat,
      hasAirStrikeCasualties,
      hasAirStrikeReturn,
      hasRangedCombat,
      hasRangedCasualties,
      hasMeleeCombat,
      hasMeleeCasualties
    ),
  };
}
