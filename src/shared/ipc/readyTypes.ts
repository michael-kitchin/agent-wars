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
import type { RangedResolutionShotLine } from '../rangedResolutionShotLines';
import type { KillEdge } from './combatResultTypes';
import type { CombatDicePlaybackFields } from './combatDiceTypes';
import type { MeleeCandidateRow } from './meleeInterceptTypes';

export type { RangedResolutionShotLine };
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
   * Cached opponent message (taunt/threat) from a background `requestAiOrders` to show after Ready.

   * Contract: Optional trimmed string; omit when empty.
   * When to use: Renderer `buildReadyPayload` and main `applyPrecomputedOrdersFromPayload`.
   * Expected outcome: Copied onto `ReadyResult.aiMessage` when precomputed orders are used.
   * Exceptions: None.
   */
precomputedAiMessage?: string;
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
 * Result of one strategic Ready sent from main to the renderer.
 *
 * Purpose: Carries what the turn changed and everything resolution playback needs: moves, combat and casualty hexes,
 *   shot lines, removed units, loss counts, and the AI consult outcome.
 * When to use: Returned by the `ready` IPC and the melee intercept resume path; read by `handleReadyButtonClick`.
 * Expected outcome: `success: false` carries a reason and nothing else to apply. A paused turn sets
 *   `awaitingMeleeDecision` with candidates. Optional playback lists are omitted when empty, including the per-phase
 *   dice rolls from `CombatDicePlaybackFields`.
 * Exceptions: None.
 */
export interface ReadyResult extends CombatDicePlaybackFields {
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
     * Display-order rows for kill toast labels when fog-filtered snapshots omit opponent participants.
     *
     * Contract: Built at resolution from full DB unit rows plus casualty snapshots for every id in kill edges.
     * When to use: Renderer `buildKillToastFormatterBundle` merges this roster before roman/ordinal lookup.
     * Expected outcome: Kill lines show `VIII Armored` instead of raw `opponent-armor-prod-7-308` ids for hidden killers.
     * Exceptions: Omitted when no kills occurred.
     */
killLabelUnits?: Array<{ id: string; unitType: string; displayOrder?: number }>;
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
   * Hex-to-hex ranged connectors for the lightning playback window (direct fire + return-fire attempts).
   *
   * Contract: Deduped `{ fromH3Index, toH3Index }` pairs from every submitted ranged order plus return-fire eligibility edges; omit when empty.
   * When to use: Renderer copies onto `resolutionMoveAnimation` and draws only while `inRangedLightning`.
   * Expected outcome: Includes misses; not limited to kill edges. Same field name as tactical playback.
   * Exceptions: None.
   */
rangedResolutionShotLines?: RangedResolutionShotLine[];
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
   * Specifies the contract for the `kills` member (kills?: KillEdge[];).

   * Contract: Describes stable behavior for callers of `kills` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
kills?: KillEdge[];
    /**
   * Specifies the contract for the `killsByDirectFire` member (killsByDirectFire?: KillEdge[];).

   * Contract: Describes stable behavior for callers of `killsByDirectFire` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
killsByDirectFire?: KillEdge[];
    /**
   * Specifies the contract for the `killsByReturnFire` member (killsByReturnFire?: KillEdge[];).

   * Contract: Describes stable behavior for callers of `killsByReturnFire` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
killsByReturnFire?: KillEdge[];
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
   * Player-facing taunt/threat from the consultation that produced `aiStrategy`.

   * Contract: Optional; omit when empty after trim.
   * When to use: Renderer upper-right toast Message section after Ready.
   * Expected outcome: Independent of `aiStrategy` so message-only consults still display.
   * Exceptions: None.
   */
aiMessage?: string;
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
   * True when at least one opponent unit executed a non–no-op strategic WEGO march this turn (any unit type, including air, which is omitted from control-traversal sets).
   *
   * Contract: Set on completed Ready / melee-intercept finalize paths only; independent of ferry rows (see `resolvedFerryMoves`).
   * When to use: Event-driven post-resolution consultation treats a false together with empty combat/ferry/air-strike signals as “opponent idle this turn” so the LLM still runs once.
   * Expected outcome: Boolean aligned with `readyStrategicResolutionPipeline` movement application for opponent `pending_orders` legs.
   * Exceptions: Omitted on `awaitingMeleeDecision` early returns where finalize has not run yet.
   */
opponentHadStrategicMarchResolution?: boolean;
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

   * Contract: One row per strategic hex where melee would occur if the player chooses Ignore.
   * When to use: Renderer builds the intercept modal from this list.
   * Expected outcome: Summaries omit zero categories; hex popup column uses renderer-side formatting for the same h3.
   * Exceptions: None.
   */
meleeInterceptCandidates?: MeleeCandidateRow[];
    /**
   * Specifies the contract for the `tacticalAutoStartStrategicH3Index` member (tacticalAutoStartStrategicH3Index?: string;).

   * Contract: Present after a successful Fight decision so the renderer can start tactical combat in that strategic hex.
   * When to use: After `resolveMeleeIntercept` returns success with decision fight.
   * Expected outcome: Renderer invokes `startTacticalBattle` with this strategic id when strategic playback completes.
   * Exceptions: None.
   */
tacticalAutoStartH3Index?: string;
    /**
   * True when main deferred event-driven post-resolution LLM work until `notifyResolutionPlaybackComplete`.
   *
   * Contract: Mutually exclusive with inline `aiStrategy`/`toolInvocationCounts` from post-turn consultation on the same
   * IPC result; those arrive via `postResolutionConsultation` push afterward.
   * When to use: Renderer gates Ready prefetch and schedules playback-complete notify using `deferredResolutionPlanningTurnNumber`.
   * Expected outcome: Renderer invokes notify once playback finishes (or immediately when no animation).
   * Exceptions: Omitted when consultation ran inline (non–event-driven or Run off).
   */
postResolutionConsultDeferred?: boolean;
    /**
   * Planning-phase turn number after resolution that pairs with `notifyResolutionPlaybackComplete` `{ kind: 'strategic' | 'melee' }`.
   *
   * Contract: Matches main-process pending mutex key for the deferred consultation batch.
   * When to use: Only when `postResolutionConsultDeferred` is true.
   * Expected outcome: Same value main stored when arming deferred consultation.
   * Exceptions: None.
   */
deferredResolutionPlanningTurnNumber?: number;
}