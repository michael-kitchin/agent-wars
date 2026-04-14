import type {
  AirStrikeAnimationMove,
  AirStrikeOrder,
  EmbarkOrder,
  FerryAnimationMove,
  FerryOrder,
  MovementOrder,
  RangedAttackOrder,
} from './ordersTypes';
import type { BuildUnitType } from './productionTypes';

export interface GameReadyIpcPayload {
    /**
   * Specifies the contract for the `enabledToolGroups` member (enabledToolGroups?: string[];).

   * Contract: Describes stable behavior for callers of `enabledToolGroups` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
enabledToolGroups?: string[];
    /**
   * Specifies the contract for the `useEventDrivenConsultation` member (useEventDrivenConsultation?: boolean;).

   * Contract: Describes stable behavior for callers of `useEventDrivenConsultation` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
useEventDrivenConsultation?: boolean;
    /**
   * Specifies the contract for the `precomputedAiOrders` member (precomputedAiOrders?: MovementOrder[];).

   * Contract: Describes stable behavior for callers of `precomputedAiOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
precomputedAiOrders?: MovementOrder[];
    /**
   * Specifies the contract for the `precomputedAiRangedOrders` member (precomputedAiRangedOrders?: RangedAttackOrder[];).

   * Contract: Describes stable behavior for callers of `precomputedAiRangedOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
precomputedAiRangedOrders?: RangedAttackOrder[];
    /**
   * Specifies the contract for the `precomputedAiAirStrikeOrders` member (precomputedAiAirStrikeOrders?: AirStrikeOrder[];).

   * Contract: Describes stable behavior for callers of `precomputedAiAirStrikeOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
precomputedAiAirStrikeOrders?: AirStrikeOrder[];
    /**
   * Specifies the contract for the `precomputedAiFerryOrders` member (precomputedAiFerryOrders?: FerryOrder[];).

   * Contract: Describes stable behavior for callers of `precomputedAiFerryOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
precomputedAiFerryOrders?: FerryOrder[];
    /**
   * Specifies the contract for the `precomputedAiEmbarkOrders` member (precomputedAiEmbarkOrders?: EmbarkOrder[];).

   * Contract: Describes stable behavior for callers of `precomputedAiEmbarkOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
precomputedAiEmbarkOrders?: EmbarkOrder[];
    /**
   * Specifies the contract for the `precomputedAiStrategy` member (precomputedAiStrategy?: string;).

   * Contract: Describes stable behavior for callers of `precomputedAiStrategy` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
precomputedAiStrategy?: string;
    /**
   * Specifies the contract for the `aiPlanningRunEnabled` member (aiPlanningRunEnabled?: boolean;).

   * Contract: Describes stable behavior for callers of `aiPlanningRunEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
aiPlanningRunEnabled?: boolean;
}

/**
 * Documents the `RemovedUnitSnapshot` interface as a named contract surface (export interface RemovedUnitSnapshot).

 * Purpose: Supports maintainability by documenting why `RemovedUnitSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface RemovedUnitSnapshot {
    /**
   * Specifies the contract for the `id` member (id: string;).

   * Contract: Describes stable behavior for callers of `id` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
id: string;
    /**
   * Specifies the contract for the `player` member (player: string;).

   * Contract: Describes stable behavior for callers of `player` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
player: string;
    /**
   * Specifies the contract for the `unitType` member (unitType: string;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitType: string;
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
    /**
   * Specifies the contract for the `displayOrder` member (displayOrder?: number;).

   * Contract: Describes stable behavior for callers of `displayOrder` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
displayOrder?: number;
    /**
   * Specifies the contract for the `displayName` member (displayName?: string;).

   * Contract: When present, toast and log formatters must show this exact tactical sub-unit label instead of inferring from `id`.
   * When to use: Main-process tactical casualty rows copied from `TacticalSubUnitSnapshot.displayName` (Roman ordinals and `(NN)` suffix).
   * Expected outcome: Kill lines match in-battle stack labels, including for ids that are not strategic `opponent-*` / `human-*` shapes.
   * Exceptions: Omitted for strategic-only removals where lookup uses `units` roster rules.
   */
displayName?: string;
}

/**
 * Playback payload returned with a successful tactical Ready commit so the renderer can run the same resolution animation pipeline as strategic turns.
 *
 * Purpose: Bridges tactical snapshot-only commits with `S.resolutionMoveAnimation` without duplicating combat simulation in the renderer.
 * When to use: Main-process `commitHumanTacticalDraftOrders` success path after movement and support projection complete.
 * Expected outcome: `humanMoves` lists sub-unit position deltas; ranged fields mirror strategic `ReadyResult` subsets when support orders remove units.
 * Exceptions: None; empty `humanMoves` is valid when only non-move effects occur.
 */
/**
 * Normalized opponent tactical orders buffered in the renderer until tactical Ready; mirrors strategic “AI orders held until ready” scheduling.
 *
 * Purpose: Single IPC shape for `tacticalOpponentPlan` on `requestAiOrders` and optional `opponentTacticalDraft` on tactical commit payloads.
 * When to use: Renderer state after a successful tactical AI consultation; echoed back on `commitHumanTacticalDraftOrders` for the combined beat.
 * Expected outcome: Arrays are always present (possibly empty); movement uses tactical sub-unit ids.
 * Exceptions: None.
 */
export type TacticalOpponentPlanPayload = {
  movementOrders: { unitId: string; toH3Index: string }[];
  rangedAttacks: { unitId: string; targetH3Index: string }[];
  airStrikes: AirStrikeOrder[];
  ferryOrders: FerryOrder[];
  embarkOrders: EmbarkOrder[];
};

export type TacticalCommitResolutionPlayback = {
  humanMoves: Array<{ unitId: string; fromH3Index: string; toH3Index: string }>;
  /**
   * Opponent sub-unit march deltas applied on the same Ready beat after human marches (strategic `allOrders` orders human rows before AI).
   *
   * Purpose: Lets `S.resolutionMoveAnimation.moves` include AI tactical marches without re-fetching the snapshot mid-playback.
   * When to use: Populated when `opponentTacticalDraft.movementOrders` committed non-noop opponent legs this beat.
   * Expected outcome: Same `{ unitId, fromH3Index, toH3Index }` shape as `humanMoves`.
   * Exceptions: Omitted when empty.
   */
  opponentMoves?: Array<{ unitId: string; fromH3Index: string; toH3Index: string }>;
  rangedCombatHexes?: string[];
  rangedCasualtyHexes?: string[];
  rangedRemovedUnits?: RemovedUnitSnapshot[];
  /**
   * Kill edges from human tactical **ranged** orders only (mirrors `ReadyResult.killsByDirectFire`).
   *
   * Purpose: Keeps ranged casualties on the “Direct fire” toast line separate from air-strike casualties.
   * When to use: Populated by `commitHumanTacticalDraftOrders` when ranged projection removes enemy sub-units.
   * Expected outcome: One entry per removed sub-unit id with the firing ranged attacker id in `killerIds`.
   * Exceptions: Omitted when no ranged kills occurred.
   */
  killsByDirectFire?: { victimId: string; killerIds: string[] }[];
  /**
   * Kill edges from human tactical **air vs units** (and air-strike follow-on sub-unit losses), not ranged fire.
   *
   * Purpose: Lets `buildTacticalCommitReadyResultForToast` populate `airStrikeRemovedUnits` / air-strike summary without mislabeling strikes as direct fire.
   * When to use: Populated alongside `killsByDirectFire` when air sub-units remove enemies or infrastructure strikes remove based aircraft sub-rows.
   * Expected outcome: Same `{ victimId, killerIds }` shape as strategic air strike kill metadata.
   * Exceptions: Omitted when empty.
   */
  killsByAirStrike?: { victimId: string; killerIds: string[] }[];
  /**
   * Res1 infrastructure damage events from tactical human air strikes against urban/airport/seaport targets.
   *
   * Purpose: Surfaces “Air strikes: … destroyed N airports” in the same toast field as strategic Ready.
   * When to use: After `applyInfrastructureDestructionEffects` runs for non-`units` tactical strike orders.
   * Expected outcome: Same contract as `ReadyResult.infrastructureDestroyedEvents` with `h3Index` on the parent res1 cell.
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
   * Kill edges from tactical **melee** resolution after movement and support on the same commit (mirrors melee slice of `ReadyResult.kills`).
   *
   * Purpose: Lets `buildTacticalCommitReadyResultForToast` classify melee lines separately from ranged and air-strike summaries.
   * When to use: Populated by `commitHumanTacticalDraftOrders` after `applyTacticalMeleeAfterSupportOrders` removes co-located enemies.
   * Expected outcome: Same `{ victimId, killerIds }` shape as strategic melee kill metadata; omitted when no res4 hex had opposing survivors after support.
   * Exceptions: None.
   */
  killsByMelee?: { victimId: string; killerIds: string[] }[];
  /**
   * Res4 hexes where tactical melee combat was adjudicated this commit.
   *
   * Purpose: Drives resolution playback overlays for melee flashes on the tactical map.
   * When to use: After tactical melee phase runs on the post-support snapshot.
   * Expected outcome: Subset of `res4ChildH3Indexes` where at least two players had sub-units before melee rolls.
   * Exceptions: None.
   */
  meleeCombatHexes?: string[];
  /**
   * Res4 hexes that lost at least one sub-unit to tactical melee this commit.
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
  killsByReturnFire?: { victimId: string; killerIds: string[] }[];
};

/**
 * Documents the `InfrastructureDestroyedEvent` interface as a named contract surface (export interface InfrastructureDestroyedEvent).

 * Purpose: Supports maintainability by documenting why `InfrastructureDestroyedEvent` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface InfrastructureDestroyedEvent {
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
    /**
   * Specifies the contract for the `targetType` member (targetType: 'urban' | 'airport' | 'seaport';).

   * Contract: Describes stable behavior for callers of `targetType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
targetType: 'urban' | 'airport' | 'seaport';
    /**
   * Specifies the contract for the `changedRubbleCount` member (changedRubbleCount: number;).

   * Contract: Describes stable behavior for callers of `changedRubbleCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
changedRubbleCount: number;
    /**
   * Specifies the contract for the `destroyedAirUnitsCount` member (destroyedAirUnitsCount: number;).

   * Contract: Describes stable behavior for callers of `destroyedAirUnitsCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
destroyedAirUnitsCount: number;
}

/**
 * Documents the `ReadyResult` interface as a named contract surface (export interface ReadyResult).

 * Purpose: Supports maintainability by documenting why `ReadyResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ReadyResult {
    /**
   * Specifies the contract for the `success` member (success: boolean;).

   * Contract: Describes stable behavior for callers of `success` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
success: boolean;
    /**
   * Specifies the contract for the `reason` member (reason?: string;).

   * Contract: Describes stable behavior for callers of `reason` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
reason?: string;
    /**
   * Specifies the contract for the `aiSkipped` member (aiSkipped?: boolean;).

   * Contract: Describes stable behavior for callers of `aiSkipped` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
aiSkipped?: boolean;
    /**
   * Specifies the contract for the `aiSkipReason` member (aiSkipReason?: string;).

   * Contract: Describes stable behavior for callers of `aiSkipReason` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
aiSkipReason?: string;
    /**
   * Specifies the contract for the `aiOrderCount` member (aiOrderCount?: number;).

   * Contract: Describes stable behavior for callers of `aiOrderCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
aiOrderCount?: number;
    /**
   * Specifies the contract for the `aiRangedByType` member (aiRangedByType?: { armor?: number; naval?: number; air?: number };).

   * Contract: Describes stable behavior for callers of `aiRangedByType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
aiRangedByType?: { armor?: number; naval?: number; air?: number };
    /**
   * Specifies the contract for the `aiDropped` member (aiDropped?: number;).

   * Contract: Describes stable behavior for callers of `aiDropped` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
aiDropped?: number;
    /**
   * Specifies the contract for the `aiDropReasons` member (aiDropReasons?: string[];).

   * Contract: Describes stable behavior for callers of `aiDropReasons` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
aiDropReasons?: string[];
    /**
   * Specifies the contract for the `aiMovesLog` member (aiMovesLog?: string[];).

   * Contract: Describes stable behavior for callers of `aiMovesLog` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
aiMovesLog?: string[];
    /**
   * Specifies the contract for the `aiMoves` member (aiMoves?: { unitId: string; fromH3Index: string; toH3Index: string }[];).

   * Contract: Describes stable behavior for callers of `aiMoves` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
aiMoves?: { unitId: string; fromH3Index: string; toH3Index: string }[];
    /**
   * Specifies the contract for the `humanMoves` member (humanMoves?: { unitId: string; fromH3Index: string; toH3Index: string }[];).

   * Contract: Describes stable behavior for callers of `humanMoves` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
humanMoves?: { unitId: string; fromH3Index: string; toH3Index: string }[];
    /**
   * Specifies the contract for the `combatHexes` member (combatHexes?: string[];).

   * Contract: Describes stable behavior for callers of `combatHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
combatHexes?: string[];
    /**
   * Specifies the contract for the `removedUnitIds` member (removedUnitIds?: string[];).

   * Contract: Describes stable behavior for callers of `removedUnitIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
removedUnitIds?: string[];
    /**
   * Specifies the contract for the `removedUnits` member (removedUnits?: RemovedUnitSnapshot[];).

   * Contract: Describes stable behavior for callers of `removedUnits` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
removedUnits?: RemovedUnitSnapshot[];
    /**
   * Specifies the contract for the `casualtyHexes` member (casualtyHexes?: string[];).

   * Contract: Describes stable behavior for callers of `casualtyHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
casualtyHexes?: string[];
    /**
   * Specifies the contract for the `rangedCombatHexes` member (rangedCombatHexes?: string[];).

   * Contract: Describes stable behavior for callers of `rangedCombatHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rangedCombatHexes?: string[];
    /**
   * Specifies the contract for the `rangedCasualtyHexes` member (rangedCasualtyHexes?: string[];).

   * Contract: Describes stable behavior for callers of `rangedCasualtyHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rangedCasualtyHexes?: string[];
    /**
   * Specifies the contract for the `rangedRemovedUnits` member (rangedRemovedUnits?: RemovedUnitSnapshot[];).

   * Contract: Describes stable behavior for callers of `rangedRemovedUnits` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rangedRemovedUnits?: RemovedUnitSnapshot[];
    /**
   * Specifies the contract for the `airStrikeHexes` member (airStrikeHexes?: string[];).

   * Contract: Describes stable behavior for callers of `airStrikeHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeHexes?: string[];
    /**
   * Specifies the contract for the `airStrikeCasualtyHexes` member (airStrikeCasualtyHexes?: string[];).

   * Contract: Describes stable behavior for callers of `airStrikeCasualtyHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeCasualtyHexes?: string[];
    /**
   * Specifies the contract for the `airStrikeRemovedUnits` member (airStrikeRemovedUnits?: RemovedUnitSnapshot[];).

   * Contract: Describes stable behavior for callers of `airStrikeRemovedUnits` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeRemovedUnits?: RemovedUnitSnapshot[];
    /**
   * Specifies the contract for the `airStrikeMoves` member (airStrikeMoves?: AirStrikeAnimationMove[];).

   * Contract: Describes stable behavior for callers of `airStrikeMoves` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeMoves?: AirStrikeAnimationMove[];
    /**
   * Specifies the contract for the `airStrikeAttemptCount` member (airStrikeAttemptCount?: number;).

   * Contract: Describes stable behavior for callers of `airStrikeAttemptCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeAttemptCount?: number;
    /**
   * Specifies the contract for the `airStrikeSuccessfulCount` member (airStrikeSuccessfulCount?: number;).

   * Contract: Describes stable behavior for callers of `airStrikeSuccessfulCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeSuccessfulCount?: number;
    /**
   * Specifies the contract for the `airStrikeFailedCount` member (airStrikeFailedCount?: number;).

   * Contract: Describes stable behavior for callers of `airStrikeFailedCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeFailedCount?: number;
    /**
   * Specifies the contract for the `airStrikeAttackerLossCount` member (airStrikeAttackerLossCount?: number;).

   * Contract: Describes stable behavior for callers of `airStrikeAttackerLossCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeAttackerLossCount?: number;
    /**
   * Specifies the contract for the `baseInvalidAirLossCount` member (baseInvalidAirLossCount?: number;).

   * Contract: Describes stable behavior for callers of `baseInvalidAirLossCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
baseInvalidAirLossCount?: number;
    /**
   * Specifies the contract for the `infrastructureDestroyedEvents` member (infrastructureDestroyedEvents?: InfrastructureDestroyedEvent[];).

   * Contract: Describes stable behavior for callers of `infrastructureDestroyedEvents` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
infrastructureDestroyedEvents?: InfrastructureDestroyedEvent[];
    /**
   * Specifies the contract for the `resolvedFerryMoves` member (resolvedFerryMoves?: FerryAnimationMove[];).

   * Contract: Describes stable behavior for callers of `resolvedFerryMoves` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
resolvedFerryMoves?: FerryAnimationMove[];
    /**
   * Specifies the contract for the `meleeCombatHexes` member (meleeCombatHexes?: string[];).

   * Contract: Describes stable behavior for callers of `meleeCombatHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
meleeCombatHexes?: string[];
    /**
   * Specifies the contract for the `meleeCasualtyHexes` member (meleeCasualtyHexes?: string[];).

   * Contract: Describes stable behavior for callers of `meleeCasualtyHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
meleeCasualtyHexes?: string[];
    /**
   * Specifies the contract for the `meleeRemovedUnits` member (meleeRemovedUnits?: RemovedUnitSnapshot[];).

   * Contract: Describes stable behavior for callers of `meleeRemovedUnits` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
meleeRemovedUnits?: RemovedUnitSnapshot[];
    /**
   * Specifies the contract for the `unknownCombatHexes` member (unknownCombatHexes?: string[];).

   * Contract: Describes stable behavior for callers of `unknownCombatHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unknownCombatHexes?: string[];
    /**
   * Specifies the contract for the `unknownCasualtyHexes` member (unknownCasualtyHexes?: string[];).

   * Contract: Describes stable behavior for callers of `unknownCasualtyHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unknownCasualtyHexes?: string[];
    /**
   * Specifies the contract for the `unknownBattleAnnouncement` member (unknownBattleAnnouncement?: string;).

   * Contract: Describes stable behavior for callers of `unknownBattleAnnouncement` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unknownBattleAnnouncement?: string;
    /**
   * Specifies the contract for the `kills` member (kills?: { victimId: string; killerIds: string[] }[];).

   * Contract: Describes stable behavior for callers of `kills` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
kills?: { victimId: string; killerIds: string[] }[];
    /**
   * Specifies the contract for the `killsByDirectFire` member (killsByDirectFire?: { victimId: string; killerIds: string[] }[];).

   * Contract: Describes stable behavior for callers of `killsByDirectFire` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
killsByDirectFire?: { victimId: string; killerIds: string[] }[];
    /**
   * Specifies the contract for the `killsByReturnFire` member (killsByReturnFire?: { victimId: string; killerIds: string[] }[];).

   * Contract: Describes stable behavior for callers of `killsByReturnFire` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
killsByReturnFire?: { victimId: string; killerIds: string[] }[];
    /**
   * Specifies the contract for the `deployedUnitsByType` member (deployedUnitsByType?: { armor?: number; infantry?: number; naval?: number; air?: number };).

   * Contract: Describes stable behavior for callers of `deployedUnitsByType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
deployedUnitsByType?: { armor?: number; infantry?: number; naval?: number; air?: number };
    /**
   * Specifies the contract for the `humanDeploymentCapReachedUnitTypes` member (humanDeploymentCapReachedUnitTypes?: BuildUnitType[];).

   * Contract: Describes stable behavior for callers of `humanDeploymentCapReachedUnitTypes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
humanDeploymentCapReachedUnitTypes?: BuildUnitType[];
    /**
   * Specifies the contract for the `opponentDeploymentCapReachedUnitTypes` member (opponentDeploymentCapReachedUnitTypes?: BuildUnitType[];).

   * Contract: Describes stable behavior for callers of `opponentDeploymentCapReachedUnitTypes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
opponentDeploymentCapReachedUnitTypes?: BuildUnitType[];
    /**
   * Specifies the contract for the `humanHexesLostCount` member (humanHexesLostCount?: number;).

   * Contract: Describes stable behavior for callers of `humanHexesLostCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
humanHexesLostCount?: number;
    /**
   * Specifies the contract for the `controlLossLightningHexes` member (controlLossLightningHexes?: string[];).

   * Contract: Describes stable behavior for callers of `controlLossLightningHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
controlLossLightningHexes?: string[];
    /**
   * Specifies the contract for the `aiStrategy` member (aiStrategy?: string;).

   * Contract: Describes stable behavior for callers of `aiStrategy` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
aiStrategy?: string;
    /**
   * Specifies the contract for the `toolInvocationCounts` member (toolInvocationCounts?: Record<string, number>;).

   * Contract: Describes stable behavior for callers of `toolInvocationCounts` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
toolInvocationCounts?: Record<string, number>;
    /**
   * Specifies the contract for the `cost` member (cost?: number;).

   * Contract: Describes stable behavior for callers of `cost` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
cost?: number;
    /**
   * Specifies the contract for the `wallClockMs` member (wallClockMs?: number;).

   * Contract: Describes stable behavior for callers of `wallClockMs` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
wallClockMs?: number;
    /**
   * Specifies the contract for the `inputTokens` member (inputTokens?: number;).

   * Contract: Describes stable behavior for callers of `inputTokens` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
inputTokens?: number;
    /**
   * Specifies the contract for the `outputTokens` member (outputTokens?: number;).

   * Contract: Describes stable behavior for callers of `outputTokens` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
outputTokens?: number;
    /**
   * Specifies the contract for the `opponentCombatParticipantUnitIds` member (opponentCombatParticipantUnitIds?: string[];).

   * Contract: Describes stable behavior for callers of `opponentCombatParticipantUnitIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
opponentCombatParticipantUnitIds?: string[];
    /**
   * Specifies the contract for the `removedOpponentUnitIds` member (removedOpponentUnitIds?: string[];).

   * Contract: Describes stable behavior for callers of `removedOpponentUnitIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
removedOpponentUnitIds?: string[];
    /**
   * Specifies the contract for the `aiConsulted` member (aiConsulted?: boolean;).

   * Contract: Describes stable behavior for callers of `aiConsulted` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
aiConsulted?: boolean;
    /**
   * Specifies the contract for the `awaitingMeleeDecision` member (awaitingMeleeDecision?: boolean;).

   * Contract: True when strategic movement and pre-melee phases finished but melee is paused for human intercept choice.
   * When to use: Renderer branches before applying full turn resolution playback.
   * Expected outcome: When true, `meleeDecisionToken` and `meleeInterceptCandidates` are populated.
   * Exceptions: None.
   */
awaitingMeleeDecision?: boolean;
    /**
   * Specifies the contract for the `meleeDecisionToken` member (meleeDecisionToken?: string;).

   * Contract: Opaque id that must be echoed to `resolveMeleeIntercept` to prevent stale or duplicate submissions.
   * When to use: Only when `awaitingMeleeDecision` is true.
   * Expected outcome: Matches the in-main pending snapshot for the current paused turn.
   * Exceptions: None.
   */
meleeDecisionToken?: string;
    /**
   * Specifies the contract for the `meleeInterceptCandidates` member (meleeInterceptCandidates?: MeleeCandidateRow[];).

   * Contract: One row per res1 hex where melee would occur if the player chooses Ignore.
   * When to use: Renderer builds the intercept modal from this list.
   * Expected outcome: Summaries omit zero categories; hex popup column uses renderer-side formatting for the same h3.
   * Exceptions: None.
   */
meleeInterceptCandidates?: MeleeCandidateRow[];
    /**
   * Specifies the contract for the `tacticalAutoStartRes1H3Index` member (tacticalAutoStartRes1H3Index?: string;).

   * Contract: Present after a successful Fight decision so the renderer can start tactical combat in that res1 hex.
   * When to use: After `resolveMeleeIntercept` returns success with decision fight.
   * Expected outcome: Renderer invokes `startTacticalBattle` with this res1 id when strategic playback completes.
   * Exceptions: None.
   */
tacticalAutoStartRes1H3Index?: string;
}

/**
 * Documents the `MeleeCandidateRow` interface as a named contract surface (export interface MeleeCandidateRow).

 * Purpose: Carries per-hex melee intercept metadata from main to renderer without duplicating terrain HTML (built client-side).
 * When to use: Populating `ReadyResult.meleeInterceptCandidates` while `awaitingMeleeDecision` is true.
 * Expected outcome: Renderer shows radio row per `h3Index` with summaries and tooltip-equivalent terrain column.
 * Exceptions: None.
 */
export interface MeleeCandidateRow {
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Res1 cell id where melee would resolve.
   * When to use: Row key and tactical auto-start target after Fight.
   * Expected outcome: Valid res1 index present in the strategic map.
   * Exceptions: None.
   */
h3Index: string;
    /**
   * Specifies the contract for the `humanUnitSummary` member (humanUnitSummary: string;).

   * Contract: Non-empty categories only, stable order air → armor → infantry → naval (e.g. "2 infantry, 1 armor").
   * When to use: Human column in the intercept modal.
   * Expected outcome: Plain text suitable for table cell display.
   * Exceptions: None.
   */
humanUnitSummary: string;
    /**
   * Specifies the contract for the `aiUnitSummary` member (aiUnitSummary: string;).

   * Contract: Same formatting rules as `humanUnitSummary` for opponent units in the hex.
   * When to use: AI column in the intercept modal.
   * Expected outcome: Plain text suitable for table cell display.
   * Exceptions: None.
   */
aiUnitSummary: string;
}

/**
 * Documents the `ResolveMeleeInterceptIpcPayload` interface as a named contract surface (export interface ResolveMeleeInterceptIpcPayload).

 * Purpose: IPC body for resuming a paused ready after the player chooses Fight or Ignore on the melee intercept modal.
 * When to use: Renderer calls `game:resolveMeleeIntercept` after `awaitingMeleeDecision` from ready.
 * Expected outcome: Main completes melee and remainder of the turn, returning a normal `ReadyResult` completion payload.
 * Exceptions: Invalid token or phase yields `success: false` with reason.
 */
export interface ResolveMeleeInterceptIpcPayload {
    /**
   * Specifies the contract for the `meleeDecisionToken` member (meleeDecisionToken: string;).

   * Contract: Must match the token issued with `awaitingMeleeDecision`.
   * When to use: Every resolve call.
   * Expected outcome: Rejects stale decisions when token mismatches pending snapshot.
   * Exceptions: None.
   */
meleeDecisionToken: string;
    /**
   * Specifies the contract for the `decision` member (decision: 'fight' | 'ignore';).

   * Contract: Fight skips melee in exactly one selected hex for this turn; Ignore runs stock melee everywhere.
   * When to use: User modal choice.
   * Expected outcome: Fight requires `selectedH3Index` present in the candidate list from the paired ready pause.
   * Exceptions: None.
   */
decision: 'fight' | 'ignore';
    /**
   * Specifies the contract for the `selectedH3Index` member (selectedH3Index?: string;).

   * Contract: Required when `decision` is fight; must be one of the candidate res1 hex ids.
   * When to use: Fight path only.
   * Expected outcome: That hex is excluded from strategic melee resolution for this turn.
   * Exceptions: None.
   */
selectedH3Index?: string;
    /**
   * Specifies the contract for the `useEventDrivenConsultation` member (useEventDrivenConsultation?: boolean;).

   * Contract: When true, runs the same post-resolution AI consultation path as `game:ready`.
   * When to use: Renderer mirrors the flags from the prior ready click.
   * Expected outcome: Optional; defaults to false when omitted.
   * Exceptions: None.
   */
useEventDrivenConsultation?: boolean;
    /**
   * Specifies the contract for the `aiPlanningRunEnabled` member (aiPlanningRunEnabled?: boolean;).

   * Contract: Gates whether after-resolution consultation may call the model.
   * When to use: Renderer mirrors the ready panel toggle.
   * Expected outcome: Optional; defaults to false when omitted.
   * Exceptions: None.
   */
aiPlanningRunEnabled?: boolean;
    /**
   * Specifies the contract for the `enabledToolGroups` member (enabledToolGroups?: string[];).

   * Contract: Tool group ids forwarded into after-resolution consultation.
   * When to use: Renderer mirrors enabled tool groups from the prior ready click.
   * Expected outcome: Optional; IPC handler falls back to defaults when absent.
   * Exceptions: None.
   */
enabledToolGroups?: string[];
}
