/**
 * Commits one beat of a battle between two AI seats and returns playback for it.
 *
 * Purpose: The renderer plays marches, fire, melee, and dice for an AI-only beat the same way it plays a human beat.
 * When to use: `commitHumanTacticalDraftOrders` when the active battle's lead and opposing parties are both AI seats.
 * Expected outcome: A success result whose playback lists both seats' marches under `opponentMoves`, lead first, and whose loss note is stored. No march continuations.
 */

import type { AiSeatId } from '../../shared/seatIds';
import { isAiSeatId } from '../../shared/seatIds';
import { committedOpponentTacticalDraftFieldAfterConsume } from '../../shared/ipc/tacticalOpponentPlanMerge';
import type { TacticalCommitResolutionPlayback, TacticalOpponentPlanPayload } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { logDebug, logError } from '../logger';
import { applyAiOnlyTacticalBeat } from '../tacticalBattle/aiOnlyTacticalBeat';
import type { TacticalBeatOutcome } from '../tacticalBattle/tacticalBeatOutcome';
import type { SubmitOrdersResult } from './gameActionsTypes';
import {
  buildSeatPlaybackMoves,
  buildTacticalCombatPlaybackFields,
  captureTacticalBeatLossNote,
  reconcileInfrastructureAfterTacticalBeat,
  tacticalTerrainBattleView,
} from './tacticalBeatPlayback';

/**
 * Playback for one AI-only beat: both commanders' marches, then the shared combat fields.
 *
 * Purpose: The renderer already plays `opponentMoves` and the combat fields. An AI-only beat has no human marches, so every march goes in `opponentMoves`, lead seat first.
 * When to use: After `applyAiOnlyTacticalBeat` succeeds. `preBattle` is the snapshot from before that apply.
 * Expected outcome: `humanMoves` is empty. `aiSeatsWithRangedOrAirOrders` lists seats whose draft had a ranged or air-strike row, and is omitted when neither did.
 * Exceptions: None.
 */
export function buildAiOnlyTacticalBeatPlayback(args: {
  readonly preBattle: TacticalBattleSnapshot;
  readonly leadDraft: TacticalOpponentPlanPayload | undefined;
  readonly opposingDraft: TacticalOpponentPlanPayload | undefined;
  readonly outcome: TacticalBeatOutcome;
}): TacticalCommitResolutionPlayback {
  const leadPartyId = args.preBattle.leadPartyId;
  const opposingPartyId = args.preBattle.opposingPartyId;
  logDebug('buildAiOnlyTacticalBeatPlayback', {
    battleId: args.preBattle.battleId,
    leadPartyId: leadPartyId ?? null,
    opposingPartyId: opposingPartyId ?? null,
  });
  const leadDraft = draftOrEmpty(args.leadDraft);
  const opposingDraft = draftOrEmpty(args.opposingDraft);
  const terrainBattle = tacticalTerrainBattleView(args.preBattle);
  const postMovementBattle = args.outcome.battleAfterMovementBeforeFerry;
  const leadMoves = isAiSeatId(leadPartyId ?? '')
    ? buildSeatPlaybackMoves({
      preBattle: args.preBattle,
      postMovementBattle,
      terrainBattle,
      movementOrders: leadDraft.movementOrders,
      ferryOrders: leadDraft.ferryOrders,
      isMover: (player) => player === leadPartyId,
    })
    : [];
  const opposingMoves = isAiSeatId(opposingPartyId ?? '')
    ? buildSeatPlaybackMoves({
      preBattle: args.preBattle,
      postMovementBattle,
      terrainBattle,
      movementOrders: opposingDraft.movementOrders,
      ferryOrders: opposingDraft.ferryOrders,
      isMover: (player) => player === opposingPartyId,
    })
    : [];
  const opponentMoves = [...leadMoves, ...opposingMoves];
  const aiSeatsWithRangedOrAirOrders = [leadPartyId, opposingPartyId].filter(
    (seatId): seatId is AiSeatId => isAiSeatId(seatId ?? '') && seatHadRangedOrAir(
      seatId === leadPartyId ? leadDraft : opposingDraft
    )
  );
  const rangedTargetHexes = [
    ...leadDraft.rangedAttacks.map((row) => row.targetH3Index),
    ...opposingDraft.rangedAttacks.map((row) => row.targetH3Index),
  ];
  return {
    humanMoves: [],
    ...(opponentMoves.length > 0 ? { opponentMoves } : {}),
    ...(aiSeatsWithRangedOrAirOrders.length > 0 ? { aiSeatsWithRangedOrAirOrders } : {}),
    ...buildTacticalCombatPlaybackFields(args.outcome, rangedTargetHexes),
  };
}

/**
 * Resolves one AI-only beat and returns playback, after reconciling infrastructure and storing the loss note.
 *
 * Purpose: The tactical Ready path for two AI seats. The caller has already sanitized each draft.
 * When to use: From `commitHumanTacticalDraftOrders` when `leadPartyId` and `opposingPartyId` are AI seats.
 * Expected outcome: Success carries the stored battle and playback. Failure carries the beat's reason, or the thrown error as text.
 * Exceptions: A thrown error is logged and returned as `{ success: false, reason }`. No march continuations are returned.
 */
export function commitAiOnlyTacticalBeat(args: {
  readonly preBattle: TacticalBattleSnapshot;
  readonly leadDraft: TacticalOpponentPlanPayload | undefined;
  readonly opposingDraft: TacticalOpponentPlanPayload | undefined;
}): SubmitOrdersResult {
  logDebug('commitAiOnlyTacticalBeat', {
    battleId: args.preBattle.battleId,
    leadPartyId: args.preBattle.leadPartyId ?? null,
    opposingPartyId: args.preBattle.opposingPartyId ?? null,
  });
  try {
    const outcome = applyAiOnlyTacticalBeat({ leadDraft: args.leadDraft, opposingDraft: args.opposingDraft });
    if (!outcome.success) return outcome;
    reconcileInfrastructureAfterTacticalBeat(
      outcome,
      'commitAiOnlyTacticalBeat reconciled res1 infrastructure after tactical strikes'
    );
    const tacticalResolutionPlayback = buildAiOnlyTacticalBeatPlayback({ ...args, outcome });
    captureTacticalBeatLossNote(outcome);
    return {
      success: true,
      tacticalBattle: outcome.battle,
      tacticalResolutionPlayback,
      ...committedOpponentTacticalDraftFieldAfterConsume(false),
    };
  } catch (err) {
    logError('commitAiOnlyTacticalBeat', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Whether a sanitized draft still has a ranged or air-strike row.
 *
 * Purpose: Ranged fire does not appear in march playback, so the consult policy needs the seat listed separately.
 * When to use: While building `aiSeatsWithRangedOrAirOrders`.
 * Expected outcome: True when either list is non-empty.
 * Exceptions: None.
 */
function seatHadRangedOrAir(draft: TacticalOpponentPlanPayload): boolean {
  return draft.rangedAttacks.length > 0 || draft.airStrikes.length > 0;
}

/**
 * A draft with every order list empty.
 *
 * Purpose: A seat that stored nothing still occupies its place in playback, which then contributes no rows.
 * When to use: When sanitize dropped the whole draft.
 * Expected outcome: Every list is empty and `exitBattle` is absent.
 * Exceptions: None.
 */
function draftOrEmpty(draft: TacticalOpponentPlanPayload | undefined): TacticalOpponentPlanPayload {
  return draft ?? {
    movementOrders: [],
    rangedAttacks: [],
    airStrikes: [],
    ferryOrders: [],
    embarkOrders: [],
  };
}
