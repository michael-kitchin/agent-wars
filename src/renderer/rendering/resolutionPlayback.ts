export const RESOLUTION_FADE_MS = 1000;
export const LIGHTNING_DURATION_MS = 1000;

export interface ResolutionAnimationInput {
  airStrikeOutboundMoves?: unknown[];
  airStrikeCombatHexes?: unknown[];
  airStrikeCasualtyHexes?: unknown[];
  airStrikeReturnMoves?: unknown[];
  rangedCombatHexes?: unknown[];
  combatHexes?: unknown[];
  rangedCasualtyHexes?: unknown[];
  casualtyHexes?: unknown[];
  meleeCombatHexes?: unknown[];
  controlLossLightningHexes?: unknown[];
  meleeCasualtyHexes?: unknown[];
}

export interface ResolutionPlaybackPhase {
  airStrikeOutboundStart: number;
  airStrikeCombatStart: number;
  airStrikeCasualtyStart: number;
  airStrikeReturnStart: number;
  rangedCombatStart: number;
  rangedCasualtyStart: number;
  movementStart: number;
  meleeCombatStart: number;
  meleeCasualtyStart: number;
  totalMs: number;
  airStrikeOutboundProgress: number;
  airStrikeReturnProgress: number;
  moveProgress: number;
  inAirStrikeOutbound: boolean;
  inAirStrikeLightning: boolean;
  inAirStrikeCasualty: boolean;
  inAirStrikeReturn: boolean;
  inRangedLightning: boolean;
  inRangedCasualty: boolean;
  inMovement: boolean;
  inMeleeLightning: boolean;
  inMeleeCasualty: boolean;
}

export interface ResolutionPlaybackState {
  hasAirStrikeOutbound: boolean;
  hasAirStrikeCombat: boolean;
  hasAirStrikeCasualties: boolean;
  hasAirStrikeReturn: boolean;
  hasRangedCombat: boolean;
  hasRangedCasualties: boolean;
  hasMeleeCombat: boolean;
  hasMeleeCasualties: boolean;
  phase: ResolutionPlaybackPhase;
}

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
