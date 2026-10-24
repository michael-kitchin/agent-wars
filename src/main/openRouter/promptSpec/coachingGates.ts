/**
 * Gate object that selects which coaching items a consultation may teach.
 *
 * Purpose: A leaf type so the composer and the mode modules can share one gate object without importing each other.
 * When to use: Built once in the assembler and passed to `buildCoachingBullets`.
 * Expected outcome: Tactical consultations never receive production, memory, or standing-order items.
 * Exceptions: None.
 */

import type { Doctrine } from '../../../shared/seatRoster';
import type { PromptCoordinateMode } from './promptCoordinateMode';

/**
 * Gates that select which coaching items this consultation may teach.
 *
 * Purpose: Conditional items must disappear together with their section, envelope tail, and tools.
 * When to use: Built once in the assembler and passed to `buildCoachingBullets`.
 * Expected outcome: Tactical consultations never receive production, memory, or standing-order items.
 * Exceptions: None.
 */
export interface CoachingGates {
  /**
   * Strategic turn versus tactical beat.
   *
   * Contract: Selects which mode module supplies the bullets.
   * When to use: Set from `coordinateContext.mode`.
   * Expected outcome: `'strategic'` or `'tactical'`.
   * Exceptions: None.
   */
  readonly coordinateMode: PromptCoordinateMode;
  /**
   * Whether the routing and distance tools are enabled.
   *
   * Contract: Copy-from-options may name `plan_route` only when that tool exists.
   * When to use: Set from `getToolFlags().planningEnabled`.
   * Expected outcome: False omits routing-tool instructions.
   * Exceptions: None.
   */
  readonly planningEnabled: boolean;
  /**
   * Whether standing-order tools are enabled.
   *
   * Contract: Hold-fire, orderless, and leave-mission items are issuable only through standing orders.
   * When to use: Set from `getToolFlags().ordersEnabled`. Ignored in tactical mode.
   * Expected outcome: False omits those items.
   * Exceptions: None.
   */
  readonly ordersEnabled: boolean;
  /**
   * Whether the memory tool group is enabled.
   *
   * Contract: Persist-intent coaching is meaningless when memory writes are ignored.
   * When to use: Set from `getToolFlags().memoryEnabled`. Ignored in tactical mode.
   * Expected outcome: False omits memory-write coaching.
   * Exceptions: None.
   */
  readonly memoryEnabled: boolean;
  /**
   * Whether the production tool group is enabled.
   *
   * Contract: Queue coaching is meaningless when production writes are ignored.
   * When to use: Set from `getToolFlags().productionEnabled`. Ignored in tactical mode.
   * Expected outcome: False omits production-queue coaching.
   * Exceptions: None.
   */
  readonly productionEnabled: boolean;
  /**
   * Whether the opponent roster includes an air unit.
   *
   * Contract: Idle-air and strike-anywhere items apply only when an air unit exists.
   * When to use: Set from the opponent roster.
   * Expected outcome: False omits air coaching, including ferry advice.
   * Exceptions: None.
   */
  readonly hasAirUnits: boolean;
  /**
   * Whether the opponent roster includes a naval unit.
   *
   * Contract: Naval-routing and sealift items apply only when a naval unit exists.
   * When to use: Set from the opponent roster.
   * Expected outcome: False omits naval and sealift coaching.
   * Exceptions: None.
   */
  readonly hasNavalUnits: boolean;
  /**
   * Whether this consultation's briefing includes a Best Options table with rows to copy.
   *
   * Contract: Copy-the-row coaching must not point at an absent table; the replacement names the routing tool.
   * When to use: True when a precomputed briefing with option rows is attached.
   * Expected outcome: False replaces copy-row coaching with the no-options instruction.
   * Exceptions: None.
   */
  readonly hasBestOptionsTable: boolean;
  /**
   * Whether the two home regions share any cells.
   *
   * Contract: Shared-cell coaching is only true when an intersection exists.
   * When to use: Set from `computeHomeRegionHexPartitionsForPrompting`. Always false in tactical mode.
   * Expected outcome: False omits the shared-home-cells item.
   * Exceptions: None.
   */
  readonly homeRegionsOverlap: boolean;
  /**
   * Whether any enemy unit is currently observed.
   *
   * Contract: Scouting coaching applies only when the observed roster is empty.
   * When to use: Set from the filtered human roster. Always treated as true in tactical mode.
   * Expected outcome: True omits the scouting item.
   * Exceptions: None.
   */
  readonly hasObservedEnemy: boolean;
  /**
   * Whether this consultation uses the region-versus-region win paths.
   *
   * Contract: True only for `scenarioId === 'region_vs_region'` outside battle. Absent or unrecognised ids must not reuse home-region sentences.
   * When to use: Set from `state.scenarioId` in the assembler. Always false in tactical mode.
   * Expected outcome: False omits the win-path coaching item and home-region goals (4) and (5).
   * Exceptions: None.
   */
  readonly includeScenarioWinPaths: boolean;
  /**
   * Urban share the control win is using, when this consultation is regional.
   *
   * Contract: A number selects the urban-share coaching bullet. Null or absent keeps the every-hex bullet.
   * When to use: Set from the same effective share the winner used. Do not read the active map here.
   * Expected outcome: Absent on the global map and in tactical mode.
   * Exceptions: None.
   */
  readonly controlWinMinUrbanShare?: number | null;
  /**
   * How many sides the match has, including knocked-out seats.
   *
   * Contract: Three or more selects the free-for-all bullet. Absent means a two-sided match.
   * When to use: Set from the roster length while building strategic coaching.
   * Expected outcome: The free-for-all bullet is present only when this is at least 3.
   * Exceptions: None.
   */
  readonly seatCount?: number;
  /**
   * Whether the match ends on a turn limit by most city hexes.
   *
   * Contract: True appends the turn-limit sentence to the win-path bullet.
   * When to use: Set from `victory.rule`. Absent on a regional match.
   * Expected outcome: The extra sentence is absent when this is false or omitted.
   * Exceptions: None.
   */
  readonly turnLimitVictory?: boolean;
  /**
   * Stored doctrine of the commander being briefed.
   *
   * Contract: `'balanced'` and absent add no block. `'aggressive'` and `'cautious'` add theirs after the strategy list.
   * When to use: Set from the seat's stored doctrine. A hidden random draw is read from the roster, not from the snapshot.
   * Expected outcome: The context block matches a prompt with no doctrine field when this is balanced or omitted.
   * Exceptions: None.
   */
  readonly doctrine?: Doctrine;
}
