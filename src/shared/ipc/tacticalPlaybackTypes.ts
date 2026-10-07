import type { AirStrikeAnimationMove } from './ordersTypes';
import type { RangedResolutionShotLine } from '../rangedResolutionShotLines';
import type { KillEdge } from './combatResultTypes';
import type { CombatDicePlaybackFields } from './combatDiceTypes';
import type { InfrastructureDestroyedEvent, RemovedUnitSnapshot } from './readyTypes';

/**
 * One tactical Ready playback march segment for resolution animation (tactical cells).
 *
 * Purpose: Carries optional `pathH3Indexes` so the renderer can glide units along the planned §12.4 path instead of a straight chord.
 * When to use: `TacticalCommitResolutionPlayback.humanMoves` and `opponentMoves` entries from `commitHumanTacticalDraftOrders`.
 * Expected outcome: When `pathH3Indexes` is set, it is ordered `[from, …, to]` inclusive with length at least 2.
 * Exceptions: Ferry-only rows omit `pathH3Indexes`; straight-line fallback when unset.
 */
export type TacticalPlaybackMarchMove = {
  unitId: string;
  fromH3Index: string;
  toH3Index: string;
  pathH3Indexes?: string[];
};


/**
 * Playback payload returned with a successful tactical Ready commit so the renderer can run the same resolution animation pipeline as strategic turns.
 *
 * Purpose: Bridges tactical snapshot-only commits with `S.resolutionMoveAnimation` without duplicating combat simulation in the renderer.
 * When to use: Main-process `commitHumanTacticalDraftOrders` success path after movement and support projection complete.
 * Expected outcome: `humanMoves` lists sub-unit position deltas; ranged fields mirror strategic `ReadyResult` subsets when support orders remove units.
 *   Per-phase dice rolls come from `CombatDicePlaybackFields`, anchored on tactical cells.
 * Exceptions: None; empty `humanMoves` is valid when only non-move effects occur.
 */
export type TacticalCommitResolutionPlayback = CombatDicePlaybackFields & {
  humanMoves: TacticalPlaybackMarchMove[];
  /**
   * Opponent sub-unit march deltas applied on the same Ready beat after human marches (strategic `allOrders` orders human rows before AI).
   *
   * Purpose: Lets `S.resolutionMoveAnimation.moves` include AI tactical marches without re-fetching the snapshot mid-playback.
   * When to use: Populated when `opponentTacticalDraft.movementOrders` committed non-noop opponent legs this beat.
   * Expected outcome: Same shape as `humanMoves`, including optional `pathH3Indexes` for bent tactical paths.
   * Exceptions: Omitted when empty.
   */
  opponentMoves?: TacticalPlaybackMarchMove[];
  /**
   * True when the human commit payload included at least one ranged or air-strike order this beat (before resolution drops).
   *
   * Purpose: Lets `consultationPolicy` treat human ranged/air attempts as observable beat activity even when no kills or noop marches appear in playback.
   * When to use: Set by `commitHumanTacticalDraftOrders` alongside other playback fields.
   * Expected outcome: Omitted when both human lists were empty.
   * Exceptions: None.
   */
  humanBeatHadSubmittedRangedOrAirOrders?: boolean;
  /**
   * True when the committed opponent draft included at least one ranged or air-strike order this beat.
   *
   * Purpose: Lets `consultationPolicy` treat opponent ranged/air as beat activity when `opponentMoves` is empty (ranged does not populate march playback).
   * When to use: Set by `commitHumanTacticalDraftOrders` when `opponentTacticalDraft` was present.
   * Expected outcome: Omitted when opponent draft had no ranged or air rows.
   * Exceptions: None.
   */
  opponentBeatHadSubmittedRangedOrAirOrders?: boolean;
  rangedCombatHexes?: string[];
  rangedCasualtyHexes?: string[];
  rangedRemovedUnits?: RemovedUnitSnapshot[];
  /**
   * Hex-to-hex ranged connectors for the lightning playback window (direct fire + return-fire attempts).
   *
   * Purpose: Lets strategic and tactical resolution draw planned-style shot lines without reconstructing from kills.
   * When to use: Set by `commitHumanTacticalDraftOrders` from combat resolution / order merge; copied onto anim state.
   * Expected outcome: Deduped pairs; omitted when empty.
   * Exceptions: None.
   */
  rangedResolutionShotLines?: RangedResolutionShotLine[];
  /**
   * Kill edges from human tactical **ranged** orders only (mirrors `ReadyResult.killsByDirectFire`).
   *
   * Purpose: Keeps ranged casualties on the “Direct fire” toast line separate from air-strike casualties.
   * When to use: Populated by `commitHumanTacticalDraftOrders` when ranged projection removes enemy sub-units.
   * Expected outcome: One entry per removed sub-unit id with the firing ranged attacker id in `killerIds`.
   * Exceptions: Omitted when no ranged kills occurred.
   */
  killsByDirectFire?: KillEdge[];
  /**
   * Kill edges from human tactical **air vs units** (and air-strike follow-on sub-unit losses), not ranged fire.
   *
   * Purpose: Lets `buildTacticalCommitReadyResultForToast` populate `airStrikeRemovedUnits` / air-strike summary without mislabeling strikes as direct fire.
   * When to use: Populated alongside `killsByDirectFire` when air sub-units remove enemies or infrastructure strikes remove based aircraft sub-rows.
   * Expected outcome: Same `{ victimId, killerIds }` shape as strategic air strike kill metadata.
   * Exceptions: Omitted when empty.
   */
  killsByAirStrike?: KillEdge[];
  /**
   * Strategic infrastructure damage events from tactical human air strikes against urban/airport/seaport targets.
   *
   * Purpose: Surfaces “Air strikes: … destroyed N airports” in the same toast field as strategic Ready.
   * When to use: After `applyInfrastructureDestructionEffects` runs for non-`units` tactical strike orders.
   * Expected outcome: Same contract as `ReadyResult.infrastructureDestroyedEvents` with `h3Index` on the parent strategic cell.
   * Exceptions: Omitted when empty.
   */
  infrastructureDestroyedEvents?: InfrastructureDestroyedEvent[];
  /**
   * Count of tactical human air strike **orders** that entered resolution (including infrastructure strikes).
   *
   * Purpose: Drives `formatAirStrikeOutcomeLine` attempt counts after tactical Ready.
   * When to use: Set to the number of validated `airStrikes` rows processed on the commit path.
   * Expected outcome: Non-negative; zero when `airStrikes` was empty or all rows skipped.
   * Exceptions: None.
   */
  airStrikeAttemptCount?: number;
  /**
   * Per–air-strike animation rows for tactical Ready, aligned with `ReadyResult.airStrikeMoves` / strategic `resolveAirStrikePhase`.
   *
   * Purpose: Lets the renderer call `buildAirStrikeOutboundPlaybackMoves` / `buildAirStrikeReturnPlaybackMoves` so air phases precede ranged movement on the shared timeline.
   * When to use: Populated by `applyTacticalAirStrikeThenRangedPhaseOnBattle` for each processed strike (pre-strike `fromH3Index`, post-strike `returnsToBase`).
   * Expected outcome: Omitted when no air orders entered resolution; length matches attempted strikes that recorded playback.
   * Exceptions: None.
   */
  airStrikeMoves?: AirStrikeAnimationMove[];
  /**
   * Tactical hexes where tactical air combat lightning should flash (targets), mirroring `ReadyResult.airStrikeHexes`.
   *
   * Purpose: Feeds `resolutionMoveAnimation.airStrikeCombatHexes` for `phase.inAirStrikeLightning`; must not duplicate ranged-only combat hexes.
   * When to use: Set alongside `airStrikeMoves` from the same air pass.
   * Expected outcome: Unique target cells for strikes that ran in the air phase.
   * Exceptions: Omitted when empty.
   */
  airStrikeHexes?: string[];
  /**
   * Tactical hexes where air-strike casualties occurred this beat, mirroring `ReadyResult.airStrikeCasualtyHexes`.
   *
   * Purpose: Feeds `resolutionMoveAnimation.airStrikeCasualtyHexes` for the air casualty pulse segment.
   * When to use: Populated from removals and outcomes during the tactical air phase (ground AA, destroyed aircraft, etc.).
   * Expected outcome: Subset of cells tied to `killsByAirStrike` / air-phase `removedUnits`.
   * Exceptions: Omitted when empty.
   */
  airStrikeCasualtyHexes?: string[];
  /**
   * Kill edges from tactical **melee** resolution after movement and support on the same commit (mirrors melee slice of `ReadyResult.kills`).
   *
   * Purpose: Lets `buildTacticalCommitReadyResultForToast` classify melee lines separately from ranged and air-strike summaries.
   * When to use: Populated by `commitHumanTacticalDraftOrders` after `applyTacticalMeleeAfterSupportOrders` removes co-located enemies.
   * Expected outcome: Same `{ victimId, killerIds }` shape as strategic melee kill metadata; omitted when no tactical hex had opposing survivors after support.
   * Exceptions: None.
   */
  killsByMelee?: KillEdge[];
  /**
   * Tactical hexes where tactical melee combat was adjudicated this commit.
   *
   * Purpose: Drives resolution playback overlays for melee flashes on the tactical map.
   * When to use: After tactical melee phase runs on the post-support snapshot.
   * Expected outcome: Subset of `tacticalChildH3Indexes` where at least two players had sub-units before melee rolls.
   * Exceptions: None.
   */
  meleeCombatHexes?: string[];
  /**
   * Tactical hexes that lost at least one sub-unit to tactical melee this commit.
   *
   * Purpose: Aligns tactical casualty highlighting with strategic `meleeCasualtyHexes` semantics.
   * When to use: Populated alongside `meleeRemovedUnits` from the same melee pass.
   * Expected outcome: Each entry appears in `meleeCombatHexes` when casualties occurred there.
   * Exceptions: None.
   */
  meleeCasualtyHexes?: string[];
  /**
   * Sub-unit rows removed by tactical melee this commit (display names preserved for toasts).
   *
   * Purpose: Extends `rangedRemovedUnits` with the same `RemovedUnitSnapshot` contract for merged casualty tables.
   * When to use: Renderer kill formatters and `buildTacticalCommitReadyResultForToast` merge this with ranged/air removals.
   * Expected outcome: One row per removed tactical id; stable ordering is not required.
   * Exceptions: None.
   */
  meleeRemovedUnits?: RemovedUnitSnapshot[];
  /**
   * Kill edges from human tactical **ranged return fire** when `runRangedPhase` resolves defensive shots (mirrors strategic `killsByReturnFire`).
   *
   * Purpose: Keeps the playback shape aligned with `ReadyResult` for shared toast helpers.
   * When to use: Populated by `commitHumanTacticalDraftOrders` when tactical ranged combat produces return-fire casualties.
   * Expected outcome: Same `{ victimId, killerIds }` shape as strategic return-fire metadata; omitted when empty.
   * Exceptions: None.
   */
  killsByReturnFire?: KillEdge[];
};
