import type { ReadyResult, RemovedUnitSnapshot, TacticalCommitResolutionPlayback } from '../../shared/ipcTypes';
import {
  airStrikeAttackerLossUnitIdsFromMoves,
  buildTurnLossSummaryFromReadyShape,
} from '../../shared/lossSummaryFromResolution';
import { tacticalKillEdgesForStrategicStyleTurnUpdate } from '../../shared/tacticalToastKillSlice';
import { collectUnknownBattleContinentNames } from '../../shared/unknownBattleContinentNames';
import { isHumanSeatId, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { readoutViewerSeatId } from '../../shared/observeModeControls';
import { unitIdOwnerFromId } from '../../shared/unitIds';
import { buildUnitOriginByLossDisplayName } from '../core/unitOriginFlags';
import { rendererSharedState as S } from '../core/state';
import {
  dropQueuedResolutionPlaybackCompleteNotifies,
  enqueueResolutionPlaybackCompleteNotify,
  notifyResolutionPlaybackFinished,
} from '../openRouter/resolutionPlaybackDeferral';
import type { ReadyHandlerDeps } from './readyHandlerTypes';
import { buildConsolidatedTurnUpdateToastMessage } from './turnUpdateSummary';

/**
 * Documents the `CombatVisibilityClassification` interface as a named contract surface (interface CombatVisibilityClassification).

 * Purpose: Supports maintainability by documenting why `CombatVisibilityClassification` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface CombatVisibilityClassification {
    /**
   * Specifies the contract for the `unknownCombatHexes` member (unknownCombatHexes: string[];).

   * Contract: Describes stable behavior for callers of `unknownCombatHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unknownCombatHexes: string[];
    /**
   * Specifies the contract for the `unknownCasualtyHexes` member (unknownCasualtyHexes: string[];).

   * Contract: Describes stable behavior for callers of `unknownCasualtyHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unknownCasualtyHexes: string[];
    /**
   * Specifies the contract for the `knownVictimIds` member (knownVictimIds: Set<string>;).

   * Contract: Describes stable behavior for callers of `knownVictimIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
knownVictimIds: Set<string>;
    /**
   * Specifies the contract for the `unknownVictimIds` member (unknownVictimIds: string[];).

   * Contract: Describes stable behavior for callers of `unknownVictimIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unknownVictimIds: string[];
}

/**
 * Defines the `deriveCombatVisibilityClassification` function shape (function deriveCombatVisibilityClassification().

 * Purpose: Supports maintainability by documenting why `deriveCombatVisibilityClassification` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function deriveCombatVisibilityClassification(
  readyResult: ReadyResult,
  visibleHexes: ReadonlySet<string>,
  viewerSeatId: string | null
): CombatVisibilityClassification {
  const allKills = readyResult.kills ?? [];
  const viewerInvolved = (ownerId: string | null | undefined): boolean => viewerSeatId !== null && ownerId === viewerSeatId;
  const viewerIsHuman = viewerSeatId !== null && isHumanSeatId(viewerSeatId);
  const removedById = new Map<string, RemovedUnitSnapshot>((readyResult.removedUnits ?? []).map((u) => [u.id, u] as const));
  const friendlyInvolvedKillVictimIds = new Set<string>(
    allKills
      .filter((k) => {
        const victim = removedById.get(k.victimId);
        const killerIsFriendly = k.killerIds.some((id) => viewerInvolved(unitIdOwnerFromId(id)));
        const victimIsFriendly = viewerInvolved(victim?.player);
        return killerIsFriendly || victimIsFriendly;
      })
      .map((k) => k.victimId)
  );
  const friendlyInvolvedCombatHexes = new Set(
    [...friendlyInvolvedKillVictimIds]
      .map((victimId) => removedById.get(victimId)?.h3Index ?? null)
      .filter((h3): h3 is string => typeof h3 === 'string')
  );
  const friendlyPlannedCombatHexes = new Set<string>(
    viewerIsHuman
      ? [
          ...(readyResult.humanMoves ?? []).flatMap((move) => [move.fromH3Index, move.toH3Index]),
          ...S.pendingRangedAttacks.map((order) => order.targetH3Index),
          ...S.pendingAirStrikes.map((order) => order.targetH3Index),
          ...(readyResult.airStrikeMoves ?? [])
            .filter((move) => viewerInvolved(move.player))
            .flatMap((move) => [move.fromH3Index, move.targetH3Index]),
          ...(readyResult.removedUnits ?? []).filter((unit) => viewerInvolved(unit.player)).map((unit) => unit.h3Index),
        ]
      : []
  );
  for (const h3 of friendlyPlannedCombatHexes) friendlyInvolvedCombatHexes.add(h3);
  const knownHumanAirStrikeTargetHexes = new Set(
    (readyResult.airStrikeMoves ?? []).filter((move) => viewerInvolved(move.player)).map((move) => move.targetH3Index)
  );
  const unknownCombatHexes = [
    ...(readyResult.airStrikeHexes ?? []).filter((h3) => !knownHumanAirStrikeTargetHexes.has(h3)),
    ...(readyResult.rangedCombatHexes ?? []),
    ...(readyResult.meleeCombatHexes ?? []),
    ...(readyResult.combatHexes ?? []),
  ].filter((h3, idx, arr) => arr.indexOf(h3) === idx && !visibleHexes.has(h3) && !friendlyInvolvedCombatHexes.has(h3));
  const unknownCasualtyHexes = [
    ...(readyResult.airStrikeCasualtyHexes ?? []).filter((h3) => !knownHumanAirStrikeTargetHexes.has(h3)),
    ...(readyResult.rangedCasualtyHexes ?? []),
    ...(readyResult.meleeCasualtyHexes ?? []),
    ...(readyResult.casualtyHexes ?? []),
  ].filter((h3, idx, arr) => arr.indexOf(h3) === idx && !visibleHexes.has(h3) && !friendlyInvolvedCombatHexes.has(h3));
  const knownVictimIds = new Set((readyResult.removedUnits ?? []).filter((u) => visibleHexes.has(u.h3Index)).map((u) => u.id));
  for (const removed of readyResult.removedUnits ?? []) {
    if (viewerInvolved(removed.player)) knownVictimIds.add(removed.id);
  }
  for (const victimId of friendlyInvolvedKillVictimIds) knownVictimIds.add(victimId);
  const unknownVictimIds = allKills
    .map((k) => k.victimId)
    .filter((id, idx, arr) => arr.indexOf(id) === idx)
    .filter((id) => {
      const removed = removedById.get(id);
      if (viewerInvolved(removed?.player)) return false;
      return !friendlyInvolvedKillVictimIds.has(id);
    })
    .filter((id) => {
      const removed = removedById.get(id);
      return removed ? !visibleHexes.has(removed.h3Index) : false;
    });
  return { unknownCombatHexes, unknownCasualtyHexes, knownVictimIds, unknownVictimIds };
}

/**
 * Adapts tactical Ready playback into a `ReadyResult`-shaped slice so kill lines and visibility reuse strategic helpers.
 *
 * Purpose: Avoids a second toast pipeline in the renderer while tactical combat remains snapshot-simulated on the main process.
 * When to use: Only after a successful `commitHumanTacticalDraftOrders` when `tacticalResolutionPlayback` is present.
 * Expected outcome: `deriveCombatVisibilityClassification` and `buildConsolidatedTurnUpdateToastMessage` see the same kill and casualty fields they expect from strategic Ready, including `kills` without air-strike edges (air infrastructure stays in the Other section).
 * Exceptions: None; omits optional arrays when empty to match typical `ReadyResult` payloads.
 */
export function buildTacticalCommitReadyResultForToast(playback: TacticalCommitResolutionPlayback): ReadyResult {
  const killsByDirectFire = playback.killsByDirectFire ?? [];
  const killsByAirStrike = playback.killsByAirStrike ?? [];
  const killsByReturnFire = playback.killsByReturnFire ?? [];
  const killsWithoutAirStrike = tacticalKillEdgesForStrategicStyleTurnUpdate(playback);
  const kills = killsWithoutAirStrike.length > 0 ? killsWithoutAirStrike : undefined;
  const removedAll = [...(playback.rangedRemovedUnits ?? []), ...(playback.meleeRemovedUnits ?? [])];
  const airStrikeVictimIds = new Set(killsByAirStrike.map((k) => k.victimId));
  const rangedVictimIds = new Set(killsByDirectFire.map((k) => k.victimId));
  const airStrikeRemovedUnits = removedAll.filter((u) => {
    if (airStrikeVictimIds.has(u.id)) return true;
    if (u.player === HUMAN_SEAT_ID && u.unitType === 'air' && !rangedVictimIds.has(u.id)) return true;
    return false;
  });
  return {
    success: true,
    kills,
    killsByDirectFire: killsByDirectFire.length > 0 ? killsByDirectFire : undefined,
    killsByAirStrike: killsByAirStrike.length > 0 ? killsByAirStrike : undefined,
    killsByReturnFire: killsByReturnFire.length > 0 ? killsByReturnFire : undefined,
    removedUnits: removedAll.length > 0 ? removedAll : undefined,
    humanMoves: playback.humanMoves,
    rangedCombatHexes: playback.rangedCombatHexes,
    rangedCasualtyHexes: playback.rangedCasualtyHexes,
    rangedRemovedUnits: playback.rangedRemovedUnits,
    airStrikeRemovedUnits: airStrikeRemovedUnits.length > 0 ? airStrikeRemovedUnits : undefined,
    infrastructureDestroyedEvents:
      playback.infrastructureDestroyedEvents && playback.infrastructureDestroyedEvents.length > 0
        ? playback.infrastructureDestroyedEvents
        : undefined,
    airStrikeAttemptCount: playback.airStrikeAttemptCount,
    meleeCombatHexes: playback.meleeCombatHexes?.length ? playback.meleeCombatHexes : undefined,
    meleeCasualtyHexes: playback.meleeCasualtyHexes?.length ? playback.meleeCasualtyHexes : undefined,
    meleeRemovedUnits: playback.meleeRemovedUnits?.length ? playback.meleeRemovedUnits : undefined,
  };
}

/**
 * Builds a fog-filtered {@link TurnLossSummary} for map toast display from a Ready-shaped resolution slice.
 *
 * Purpose: Shared popup loss bucketing for strategic Ready and tactical commit playback.
 * When to use: After `deriveCombatVisibilityClassification` yields `knownVictimIds`.
 * Expected outcome: Human losses always included; opponent losses only when visible or friendly-involved.
 * Exceptions: None.
 */
function buildPopupTurnLossSummary(args: {
  readySlice: ReadyResult;
  knownVictimIds: Set<string>;
  formatBaseUnitName: (unitId: string) => string;
  killsByMelee?: readonly { victimId: string }[];
  killsByAirStrike?: readonly { victimId: string }[];
}): ReturnType<typeof buildTurnLossSummaryFromReadyShape> {
  const { readySlice, knownVictimIds, formatBaseUnitName, killsByMelee, killsByAirStrike } = args;
  const removed = readySlice.removedUnits ?? [];
  const metaMap = new Map<string, { player: string; unitType: string }>();
  for (const u of removed) metaMap.set(u.id, { player: u.player, unitType: u.unitType });
  for (const u of readySlice.airStrikeRemovedUnits ?? []) metaMap.set(u.id, { player: u.player, unitType: u.unitType });
  const readyWithAir = readySlice as ReadyResult & { killsByAirStrike?: readonly { victimId: string }[] };
  return buildTurnLossSummaryFromReadyShape({
    kills: readySlice.kills,
    killsByDirectFire: readySlice.killsByDirectFire,
    killsByReturnFire: readySlice.killsByReturnFire,
    killsByMelee,
    killsByAirStrike: killsByAirStrike ?? readyWithAir.killsByAirStrike,
    removedUnits: removed,
    airStrikeRemovedUnits: readySlice.airStrikeRemovedUnits,
    airStrikeAttackerLossUnitIds: airStrikeAttackerLossUnitIdsFromMoves(readySlice.airStrikeMoves),
    resolveDisplayName: (id) => {
      const snap =
        removed.find((u) => u.id === id) ?? readySlice.airStrikeRemovedUnits?.find((u) => u.id === id);
      if (snap?.displayName) return snap.displayName;
      return formatBaseUnitName(id);
    },
    resolveUnitMeta: (id) => metaMap.get(id),
    isVictimVisible: (_id, player) => player === HUMAN_SEAT_ID || knownVictimIds.has(_id),
  });
}

/**
 * Defines the `formatHexCount` function shape (function formatHexCount(label: string, count: number): string).

 * Purpose: Supports maintainability by documenting why `formatHexCount` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatHexCount(label: string, count: number): string {
  return `• ${label} at ${count.toLocaleString()} ${count === 1 ? 'hex' : 'hexes'}.`;
}

type CombatActivityFallbackSource = Pick<
  ReadyResult,
  'rangedCombatHexes' | 'rangedCasualtyHexes' | 'meleeCombatHexes' | 'meleeCasualtyHexes' | 'airStrikeCasualtyHexes'
>;

/**
 * Defines the `buildCombatActivityFallbackBullets` function shape (function buildCombatActivityFallbackBullets(readyResult: ReadyResult): string[]).

 * Purpose: Supports maintainability by documenting why `buildCombatActivityFallbackBullets` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildCombatActivityFallbackBullets(readyResult: CombatActivityFallbackSource): string[] {
  const bullets: string[] = [];
  const rangedHexCount = readyResult.rangedCombatHexes?.length ?? 0;
  if (rangedHexCount > 0) bullets.push(formatHexCount('Ranged engagements', rangedHexCount));
  const meleeHexCount = readyResult.meleeCombatHexes?.length ?? 0;
  if (meleeHexCount > 0) bullets.push(formatHexCount('Melee engagements', meleeHexCount));
  const casualtyHexCount =
    (readyResult.rangedCasualtyHexes?.length ?? 0) +
    (readyResult.meleeCasualtyHexes?.length ?? 0) +
    (readyResult.airStrikeCasualtyHexes?.length ?? 0);
  if (casualtyHexCount > 0) bullets.push(formatHexCount('Casualty outcomes', casualtyHexCount));
  return bullets;
}

/**
 * The seat the turn report calls "you".
 *
 * Purpose: A watch uses View as. All sides has no "you", so loss sections use each side's full name.
 * When to use: Visibility and the turn-report sentences.
 * Expected outcome: The active human seat while one is playing. While watching, the chosen seat, or null for All sides.
 * Exceptions: None.
 */
export function reportViewerSeatId(): string | null {
  const seats = S.gameState?.seats ?? [];
  const viewer = readoutViewerSeatId(seats, S.viewAs);
  return viewer ?? null;
}

/**
 * Shows the consolidated turn-update toast, including an unknown battle as an Updates line.
 *
 * Purpose: Strategic Ready and tactical commit share one loss summary, fallback bullet, and toast.
 * When to use: After the caller has already classified visibility and built its kill-toast formatter. Do not classify visibility here.
 *   Pass `reportTag`, the tag of the turn or beat that just resolved, captured before Ready resolved it.
 * Expected outcome: One update toast and one log line when there is text. An unknown battle is the last Updates line.
 *   The Reports tab files that toast as one turn report under `reportTag`. A name-lookup failure uses the
 *   unidentified-continent sentence and still shows the toast.
 * Exceptions: A rejected continent lookup is logged and becomes the unidentified-continent sentence. It is not rethrown.
 */
export async function announceResolutionTurnUpdate(
  args: {
    readySlice: ReadyResult;
    visibility: CombatVisibilityClassification;
    killToastFormatter: ReturnType<ReadyHandlerDeps['buildKillToastFormatterBundle']>;
    reportTag: string;
    extraKills?: {
      killsByMelee?: readonly { victimId: string; killerIds?: readonly string[] }[];
      killsByAirStrike?: readonly { victimId: string; killerIds?: readonly string[] }[];
    };
  },
  deps: Pick<ReadyHandlerDeps, 'showMapToast' | 'appendOpenRouterLog' | 'formatUnknownBattleAnnouncement'>
): Promise<void> {
  const { readySlice, visibility, killToastFormatter, extraKills, reportTag } = args;
  const { unknownCombatHexes, unknownCasualtyHexes, knownVictimIds, unknownVictimIds } = visibility;
  const turnLossSummary = buildPopupTurnLossSummary({
    readySlice,
    knownVictimIds,
    formatBaseUnitName: killToastFormatter.formatBaseUnitName,
    ...(extraKills !== undefined ? extraKills : {}),
  });
  const combatFallbackBullets = buildCombatActivityFallbackBullets(readySlice);
  const seats = (S.gameState?.seats ?? []).map((seat) => ({
    seatId: seat.seatId,
    seatOrder: seat.seatOrder,
    homeRegion: seat.homeRegion,
  }));
  const viewerSeatId = reportViewerSeatId();
  const hasUnknownBattle =
    unknownCombatHexes.length > 0 || unknownCasualtyHexes.length > 0 || unknownVictimIds.length > 0;
  let unknownBattleLine: string | undefined;
  if (hasUnknownBattle) {
    try {
      const getContinentNames = window.gameApi?.getHexContinentNames;
      const unknownContinentNames = await collectUnknownBattleContinentNames(
        unknownCombatHexes,
        unknownCasualtyHexes,
        getContinentNames ? (h3Index) => getContinentNames({ h3Index }) : undefined
      );
      unknownBattleLine = deps.formatUnknownBattleAnnouncement(unknownContinentNames);
    } catch (err) {
      console.error('unknown battle continent names failed', err);
      unknownBattleLine = deps.formatUnknownBattleAnnouncement([]);
    }
  }
  const updateText = buildConsolidatedTurnUpdateToastMessage({
    readyResult: readySlice,
    turnLossSummary,
    combatFallbackBullets,
    turnReport: {
      viewerSeatId,
      seats,
      transitions: readySlice.controlTransitions ?? [],
    },
    unknownBattleLine,
  });
  if (updateText) {
    const unitOriginByDisplayName = buildUnitOriginByLossDisplayName(turnLossSummary);
    deps.showMapToast(updateText, {
      isError: false,
      unitOriginByDisplayName,
      seats,
      viewerSeatId,
      report: { kind: 'turn', tag: reportTag },
    });
    deps.appendOpenRouterLog(`Update: ${updateText.replace(/\n/g, ' | ')}`);
  }
}

/**
 * Sends a deferred-resolution notify now, or queues it until playback finishes.
 *
 * Purpose: Tactical commit and strategic Ready share the enqueue-or-drop choice.
 * When to use: After the caller has built the notify callback for its own battle or planning turn.
 * Expected outcome: `needsPlayback` queues `send`; otherwise any queued notify is dropped and `send` runs immediately.
 * Exceptions: None.
 */
export function scheduleResolutionPlaybackCompleteNotify(send: () => void, needsPlayback: boolean): void {
  if (needsPlayback) {
    enqueueResolutionPlaybackCompleteNotify(send);
  } else {
    dropQueuedResolutionPlaybackCompleteNotifies();
    send();
    notifyResolutionPlaybackFinished();
  }
}
