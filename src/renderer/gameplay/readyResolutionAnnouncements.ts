import { type MissileStrikeToastLine } from '../../shared/consolidatedTurnUpdateToast';
import { buildMissileStrikeToastLines } from '../../shared/missileStrikeReport';
import { orderTargetHexCode, type OrderHexCodeBattle } from '../../shared/orderTargetHexCode';
import type { MissileLaunchRecord } from '../../shared/ipc/missileTypes';
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
import { buildUnitOriginByLossDisplayName, mergeDestroyedBattleParentFlags, rememberUnitOrigins } from '../core/unitOriginFlags';
import type { DestroyedBattleParent } from '../../shared/destroyedBattleParent';
import { destroyedInBattleLinesByOwner, visibleDestroyedParents } from '../../shared/destroyedInBattleLine';
import type { TurnReportSeat } from '../../shared/turnReportLines';
import {
  stashHeldBattleTurnUpdate,
  takeHeldBattleTurnUpdate,
  takePendingDestroyedBattleParents,
} from './heldBattleTurnUpdate';
import { getExploredHexSet } from '../core/selection';
import { rendererSharedState as S } from '../core/state';
import {
  dropQueuedResolutionPlaybackCompleteNotifies,
  enqueueResolutionPlaybackCompleteNotify,
  notifyResolutionPlaybackFinished,
} from '../openRouter/resolutionPlaybackDeferral';
import type { ReadyHandlerDeps } from './readyHandlerTypes';
import { fortificationReportLinesFor } from './fortificationUpdateLines';
import { queuePauseUpdateLinesFor } from './queuePauseUpdateLines';
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
  const killerOwner = (id: string): string | null => {
    const removedPlayer = removedById.get(id)?.player;
    if (removedPlayer) return removedPlayer;
    return S.gameState?.units.find((unit) => unit.id === id)?.player ?? unitIdOwnerFromId(id);
  };
  const friendlyInvolvedKillVictimIds = new Set<string>(
    allKills
      .filter((k) => {
        const victim = removedById.get(k.victimId);
        const killerIsFriendly = k.killerIds.some((id) => viewerInvolved(killerOwner(id)));
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
  for (const launch of readyResult.missileLaunches ?? []) {
    if (launch.player !== viewerSeatId) continue;
    for (const victimId of launch.destroyedAirUnitIds) knownVictimIds.add(victimId);
  }
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
    fortificationReports: playback.fortificationReports?.length ? playback.fortificationReports : undefined,
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
  for (const u of readySlice.missileStrikeRemovedUnits ?? []) metaMap.set(u.id, { player: u.player, unitType: u.unitType });
  const readyWithAir = readySlice as ReadyResult & { killsByAirStrike?: readonly { victimId: string }[] };
  return buildTurnLossSummaryFromReadyShape({
    kills: readySlice.kills,
    killsByDirectFire: readySlice.killsByDirectFire,
    killsByReturnFire: readySlice.killsByReturnFire,
    killsByMelee,
    killsByAirStrike: killsByAirStrike ?? readyWithAir.killsByAirStrike,
    removedUnits: removed,
    airStrikeRemovedUnits: readySlice.airStrikeRemovedUnits,
    missileStrikeRemovedUnits: readySlice.missileStrikeRemovedUnits,
    airStrikeAttackerLossUnitIds: airStrikeAttackerLossUnitIdsFromMoves(readySlice.airStrikeMoves),
    resolveDisplayName: (id) => {
      const snap =
        removed.find((u) => u.id === id) ??
        readySlice.airStrikeRemovedUnits?.find((u) => u.id === id) ??
        readySlice.missileStrikeRemovedUnits?.find((u) => u.id === id);
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
 * Copies the roster rows a turn report uses for names.
 *
 * Purpose: A held popup has to name sides the way the launch turn did.
 * When to use: When that popup is stashed, and when a toast is built without a stored roster.
 * Expected outcome: One row per seat, with id, order, home, kind, and nickname. An empty roster is an empty list.
 * Exceptions: None.
 */
function launchTurnSeats(): TurnReportSeat[] {
  return (S.gameState?.seats ?? []).map((seat) => ({
    seatId: seat.seatId,
    seatOrder: seat.seatOrder,
    homeRegion: seat.homeRegion,
    kind: seat.kind,
    nickname: seat.nickname,
  }));
}

/**
 * Shows the consolidated turn-update toast, including an unknown battle as an Updates line.
 *
 * Purpose: Strategic Ready and tactical commit share one loss summary, fallback bullet, and toast.
 * When to use: After the caller has already classified visibility and built its kill-toast formatter. Do not classify visibility here.
 *   Pass `reportTag`, the tag of the turn or beat that just resolved, captured before Ready resolved it.
 * Expected outcome: One update toast and one log line when there is text. An unknown battle is the last Updates line.
 *   The Reports tab files that toast as one turn report under `reportTag`. A name-lookup failure uses the
 *   unidentified-continent sentence and still shows the toast. When `holdForBattle` is set, nothing is shown and
 *   `showHeldBattleTurnUpdate` shows this turn later. A strategic call with `usePendingBattleParents` includes
 *   units a map-opened battle destroyed, once.
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
    missileLaunches?: readonly MissileLaunchRecord[];
    /**
     * Strategic units a battle removed.
     *
     * Contract: Omitted when this announce should take the pending list instead, or when there are none.
     * When to use: Replaying a held update. A strategic announce that is not a replay uses the pending list.
     * Expected outcome: Filtered by `visibleHexes` and the viewer before the sentence is built.
     * Exceptions: None.
     */
    destroyedParents?: readonly DestroyedBattleParent[];
    /**
     * Hexes the viewer could see for this resolution.
     *
     * Contract: Empty or omitted hides enemy units that are not the viewer's.
     * When to use: Strategic Ready, and a replay of that Ready.
     * Expected outcome: Combined with the owner check in `visibleDestroyedParents`.
     * Exceptions: None.
     */
    visibleHexes?: ReadonlySet<string>;
    /**
     * True when this turn opens a battle and the popup must wait.
     *
     * Contract: The world-map animation is unaffected. The popup is not shown.
     * When to use: Strategic Ready when `tacticalAutoStartH3Index` is set.
     * Expected outcome: The inputs are stashed. A later `showHeldBattleTurnUpdate` shows them.
     * Exceptions: None.
     */
    holdForBattle?: boolean;
    /**
     * True when this is the strategic announce that should consume map-opened battle losses.
     *
     * Contract: A tactical beat announce leaves the pending list alone. A replay of a hold leaves it alone.
     * When to use: Strategic Ready only.
     * Expected outcome: The pending list is taken once and included. A later announce does not see it.
     * Exceptions: None.
     */
    usePendingBattleParents?: boolean;
    /**
     * The seat the launch turn called "you".
     *
     * Contract: Omitted means the view that is current now. Null is All sides. A string is that seat.
     * When to use: A replay of a held update. The hold stores the view from the turn that opened the battle.
     * Expected outcome: Loss headers and the battle line use this viewer. A later View as change does not rewrite them.
     * Exceptions: None.
     */
    viewerSeatId?: string | null;
    /**
     * The roster the launch turn used for side names.
     *
     * Contract: Omitted means the roster that is current now.
     * When to use: A replay of a held update.
     * Expected outcome: Headers and hex sentences use these homes and this seat order.
     * Exceptions: None.
     */
    seats?: readonly TurnReportSeat[];
    /**
     * Hexes the launch turn had explored.
     *
     * Contract: Omitted means the explored set that is current now.
     * When to use: A replay of a held update. The hold stores the set from the turn that opened the battle.
     * Expected outcome: Fortification sentences use this set. Exploration on a later turn does not reveal or hide that turn's lines.
     * Exceptions: None.
     */
    exploredHexes?: ReadonlySet<string>;
    /**
     * The battle whose cells the report's hex codes name.
     *
     * Contract: Omitted or null names world-map hexes.
     * When to use: A battle beat report. Strategic Ready omits it.
     * Expected outcome: Fortification sentences use the battle's cell codes. Missile sentences stay on world-map codes.
     * Exceptions: None.
     */
    hexCodeBattle?: OrderHexCodeBattle | null;
  },
  deps: Pick<ReadyHandlerDeps, 'showMapToast' | 'appendOpenRouterLog' | 'formatUnknownBattleAnnouncement'>
): Promise<void> {
  const parents = args.destroyedParents
    ?? (args.usePendingBattleParents ? takePendingDestroyedBattleParents() : []);
  if (args.holdForBattle) {
    console.debug('[agent-wars] announceResolutionTurnUpdate holding for battle', {
      parentCount: parents.length,
      reportTag: args.reportTag,
    });
    stashHeldBattleTurnUpdate(
      {
        ...args,
        holdForBattle: false,
        usePendingBattleParents: false,
        viewerSeatId: reportViewerSeatId(),
        seats: launchTurnSeats(),
        exploredHexes: getExploredHexSet(S.gameState),
      },
      deps,
      parents
    );
    return;
  }
  const { readySlice, visibility, killToastFormatter, extraKills, reportTag, missileLaunches } = args;
  const { unknownCombatHexes, unknownCasualtyHexes, knownVictimIds, unknownVictimIds } = visibility;
  const turnLossSummary = buildPopupTurnLossSummary({
    readySlice,
    knownVictimIds,
    formatBaseUnitName: killToastFormatter.formatBaseUnitName,
    ...(extraKills !== undefined ? extraKills : {}),
  });
  const combatFallbackBullets = buildCombatActivityFallbackBullets(readySlice);
  const seats = args.seats ? [...args.seats] : launchTurnSeats();
  const viewerSeatId = args.viewerSeatId !== undefined ? args.viewerSeatId : reportViewerSeatId();
  const visibleParents = visibleDestroyedParents(parents, viewerSeatId, args.visibleHexes ?? new Set());
  const battleLinesByOwner = destroyedInBattleLinesByOwner(visibleParents);
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
  const missileStrikeLines = missileStrikeLinesFor(missileLaunches);
  const queuePauseLines = queuePauseUpdateLinesFor(readySlice);
  const fortificationReportLines = fortificationReportLinesFor(
    readySlice,
    {
      viewerSeatId,
      exploredHexes: args.exploredHexes ?? getExploredHexSet(S.gameState),
    },
    args.hexCodeBattle ?? null
  );
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
    missileStrikeLines,
    queuePauseLines,
    fortificationReportLines,
    battleLinesByOwner,
  });
  if (updateText) {
    // Casualties carry birth records for units that never appeared in a fog-filtered snapshot.
    rememberUnitOrigins([
      ...(readySlice.removedUnits ?? []),
      ...(readySlice.airStrikeRemovedUnits ?? []),
      ...(readySlice.missileStrikeRemovedUnits ?? []),
      ...(readySlice.rangedRemovedUnits ?? []),
      ...(readySlice.meleeRemovedUnits ?? []),
      ...visibleParents,
    ]);
    const unitOriginByDisplayName = mergeDestroyedBattleParentFlags(
      buildUnitOriginByLossDisplayName(turnLossSummary),
      visibleParents
    );
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
 * Shows the strategic update that was waiting for a battle, then clears that wait.
 *
 * Purpose: The launch turn's popup is the one left on the map after the following Ready returns.
 * When to use: After that Ready returns, and only for the update that was already waiting before that Ready. Pass false to omit units already attached. A battle that failed to start passes true: it attached nothing, and units from an earlier battle stay listed.
 * Expected outcome: The held message is shown when it has text, filed under the launch turn's report tag. The hold is cleared either way. A second waiting update stays held. Nothing is shown when no update was waiting.
 * Exceptions: A name lookup failure is logged by `announceResolutionTurnUpdate` and still shows the toast.
 */
export async function showHeldBattleTurnUpdate(includeBattleLines = true): Promise<void> {
  const held = takeHeldBattleTurnUpdate();
  console.debug('[agent-wars] showHeldBattleTurnUpdate', {
    found: held != null,
    includeBattleLines,
    parentCount: held?.destroyedParents.length ?? 0,
  });
  if (!held) return;
  await announceResolutionTurnUpdate(
    {
      ...held.inputs,
      destroyedParents: includeBattleLines ? held.destroyedParents : [],
      holdForBattle: false,
      usePendingBattleParents: false,
    },
    held.deps
  );
}

/**
 * Builds the strike lines for launches the caller already decided the viewer may see.
 *
 * Purpose: Each line names the target hex the way the hex tooltip does, totaled by controller.
 * When to use: From `announceResolutionTurnUpdate` only. Missiles exist only on the world map.
 * Expected outcome: One line per controller from `buildMissileStrikeToastLines`. A missing code uses the unidentified-hex words.
 * Exceptions: None.
 */
function missileStrikeLinesFor(launches: readonly MissileLaunchRecord[] | undefined): MissileStrikeToastLine[] {
  const entries = (launches ?? []).map((record) => ({
    record,
    hexCode: orderTargetHexCode(record.targetH3Index, null),
  }));
  return buildMissileStrikeToastLines(entries);
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
