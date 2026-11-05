import type { HoverRangedTargetOdds } from '../core/types';
import type { TacticalOrderDeps } from './tacticalOrderDeps';

/**
 * Options for `refreshHoverRoutePreview`; only map pointer-hover passes `allowBlockingOrderTooltip`.
 *
 * Purpose: Keeps `#order-block-tooltip` (“Blocked: …”) from appearing when previews refresh due to clicks/selection/mode toggles.
 * When to use: Callers pass `{ allowBlockingOrderTooltip: true }` from `#main-map` `pointermove`, and from Shift release while the pointer is still on a hovered hex.
 * Expected outcome: Blocking tooltip shows solely during active map hover with invalid preview; other refreshes clear or skip it.
 * Exceptions: None.
 */
export interface RefreshHoverRoutePreviewOptions {
  /**
   * Whether this refresh may surface the “Blocked: …” order tooltip when the hover preview is invalid.
   *
   * Contract: When `true`, march/ranged/air hover evaluation may show `#order-block-tooltip`; when omitted or `false`, that tooltip must not appear from this refresh.
   * When to use: Pass `true` for `#main-map` `pointermove`, and for Shift release while the pointer remains on a hovered hex. Omit or pass `false` for clicks, selection changes, or mode toggles.
   * Expected outcome: Blocking tooltips track genuine map hover only; other refresh causes skip or clear them.
   * Exceptions: None.
   */
  allowBlockingOrderTooltip?: boolean;
}

/**
 * Inputs for one ranged, air, or missile hover line.
 *
 * Purpose: The tactical and strategic branches share one publisher.
 * When to use: `publishGroupedSupportTargetingPreview`.
 * Expected outcome: Odds fields are set only by the ranged publisher.
 * Exceptions: None.
 */
export interface GroupedSupportTargetingPreviewArgs {
  /**
   * Redraw and tooltip callbacks for this hover.
   *
   * Contract: The same deps the tactical order flow already holds.
   * When to use: Publishing a support-targeting preview.
   * Expected outcome: Passed to `publishHoverRoutePreview`.
   * Exceptions: None.
   */
  readonly deps: TacticalOrderDeps;
  /**
   * Cell under the pointer.
   *
   * Contract: The h3 the validator just checked.
   * When to use: Publishing a support-targeting preview.
   * Expected outcome: Stored as `hoveredH3Index`.
   * Exceptions: None.
   */
  readonly hoveredH3: string;
  /**
   * Selected unit ids.
   *
   * Contract: The selection the validator accepted or rejected.
   * When to use: Publishing a support-targeting preview.
   * Expected outcome: Grouped by origin before the preview lines are built.
   * Exceptions: None.
   */
  readonly unitIds: readonly string[];
  /**
   * Result of the ranged, air, or missile validator.
   *
   * Contract: `success` false carries `reason` when the validator supplied one.
   * When to use: Publishing a support-targeting preview.
   * Expected outcome: A failure becomes the blocking reason. A success publishes the attack line.
   * Exceptions: None.
   */
  readonly validation: { success: boolean; reason?: string | null };
  /**
   * Which support order this hover is aiming.
   *
   * Contract: `ranged`, `air`, or `missile`.
   * When to use: Publishing a support-targeting preview.
   * Expected outcome: Stored as `renderAsSupportTargeting`, and it picks the reason slot.
   * Exceptions: None.
   */
  readonly supportKind: 'ranged' | 'air' | 'missile';
  /**
   * Origin used to collapse a selection to one line per stack.
   *
   * Contract: Returns the grouping hex for a unit id, or undefined when that unit has none.
   * When to use: Before the preview lines are built.
   * Expected outcome: Units that share an origin draw one line.
   * Exceptions: None.
   */
  readonly originH3ForGrouping: (unitId: string) => string | undefined;
  /**
   * Origin drawn at the start of a preview line.
   *
   * Contract: Returns the preview hex for a unit id, or undefined when that unit has none.
   * When to use: While the preview lines are built.
   * Expected outcome: Passed to `buildGroupedSupportTargetingLinePreview`.
   * Exceptions: None.
   */
  readonly originH3ForPreview: (unitId: string) => string | undefined;
  /**
   * Whether an illegal hover may show the blocked tooltip.
   *
   * Contract: True only for a map pointer hover that is allowed to show that tooltip.
   * When to use: Publishing a support-targeting preview.
   * Expected outcome: Forwarded to `publishHoverRoutePreview`.
   * Exceptions: None.
   */
  readonly allowBlockingOrderTooltip: boolean;
  /**
   * Kill, Hurt, and Loss for a legal ranged target.
   *
   * Contract: Omitted for air and missile hovers, and when the odds call returned nothing.
   * When to use: The ranged publisher, after a successful odds call.
   * Expected outcome: Stored on the hover preview when present.
   * Exceptions: None.
   */
  readonly rangedTargetOdds?: HoverRangedTargetOdds;
  /**
   * Defender ids that entered the ranged estimate.
   *
   * Contract: Omitted when the odds call returned nothing.
   * When to use: Together with `rangedTargetOdds`.
   * Expected outcome: The roster names opponent seats among these ids.
   * Exceptions: None.
   */
  readonly countedDefenderIds?: readonly string[];
}

/**
 * Kill, Hurt, Loss, and the defenders that were counted.
 *
 * Purpose: The hover stores these percents and the defenders that were counted.
 * When to use: The return of `requestLegalRangedTargetOdds`.
 * Expected outcome: All three percents, and the ids that entered the estimate. A null percent on any of them means the odds line is omitted.
 * Exceptions: None.
 */
export interface LegalRangedTargetOdds {
  /**
   * Chance the shot wipes the counted defenders, as a whole percent.
   *
   * Contract: `Math.round(probabilityDefenderEliminated * 100)`, or null when any of the three chances is missing.
   * When to use: Copied from the odds result into the tooltip.
   * Expected outcome: A number from 0 through 100, or null.
   * Exceptions: None.
   */
  readonly killPercent: number | null;
  /**
   * Chance the attackers score at least one hit, as a whole percent.
   *
   * Contract: `Math.round(probabilityAtLeastOneHit * 100)`, or null when any of the three chances is missing.
   * When to use: Copied from the odds result into the tooltip.
   * Expected outcome: A number from 0 through 100, or null.
   * Exceptions: None.
   */
  readonly hurtPercent: number | null;
  /**
   * Chance the attackers lose at least one unit, as a whole percent.
   *
   * Contract: `Math.round(probabilityAttackerLosesUnit * 100)`, or null when any of the three chances is missing.
   * When to use: Copied from the odds result into the tooltip.
   * Expected outcome: A number from 0 through 100, or null.
   * Exceptions: None.
   */
  readonly lossPercent: number | null;
  /**
   * Defender ids that entered the estimate.
   *
   * Contract: Rejected ids are already removed.
   * When to use: Building the opponent lines for this hover.
   * Expected outcome: The ids the estimate counted, in the request's order.
   * Exceptions: None.
   */
  readonly countedDefenderIds: readonly string[];
}

/**
 * The cells and units for one ranged-odds request.
 *
 * Purpose: One odds request for the attackers the validator accepted and the defenders the player can see.
 * When to use: `requestLegalRangedTargetOdds`.
 * Expected outcome: Those ids, the hovered cell, and whether that cell is a battle cell.
 * Exceptions: None.
 */
export interface LegalRangedTargetOddsRequest {
  /**
   * Unit ids the ranged validator accepted.
   *
   * Contract: The selection that just validated.
   * When to use: `requestLegalRangedTargetOdds`.
   * Expected outcome: Sent as `attackerIds`.
   * Exceptions: None.
   */
  readonly attackerIds: readonly string[];
  /**
   * Defender ids the player can see on the hovered cell.
   *
   * Contract: Includes Neutral. The human seat is already omitted.
   * When to use: `requestLegalRangedTargetOdds`.
   * Expected outcome: Sent as `defenderIds`.
   * Exceptions: None.
   */
  readonly defenderIds: readonly string[];
  /**
   * Hovered cell the shot is aimed at.
   *
   * Contract: The same h3 the ranged validator used. A battle target is the battle cell.
   * When to use: `requestLegalRangedTargetOdds`.
   * Expected outcome: Sent as `targetH3`.
   * Exceptions: None.
   */
  readonly targetH3: string;
  /**
   * Whether the hovered cell is a battle cell.
   *
   * Contract: True only while the renderer is aiming inside a battle.
   * When to use: `requestLegalRangedTargetOdds`.
   * Expected outcome: Sent as `inBattle`.
   * Exceptions: None.
   */
  readonly inBattle: boolean;
}

/**
 * Inputs for publishing one ranged hover.
 *
 * Purpose: The tactical and strategic ranged branches share one publish.
 * When to use: After ranged validation returns.
 * Expected outcome: The hover identity, the validation, and the two origin lookups.
 * Exceptions: None.
 */
export interface ValidatedRangedHoverArgs {
  /**
   * Redraw and tooltip callbacks for this hover.
   *
   * Contract: The same deps the tactical order flow already holds.
   * When to use: `publishValidatedRangedHover`.
   * Expected outcome: Passed through to the support-targeting publisher.
   * Exceptions: None.
   */
  readonly deps: TacticalOrderDeps;
  /**
   * Hover sequence captured when this request started.
   *
   * Contract: Compared with the sequence still on screen after the odds call.
   * When to use: `publishValidatedRangedHover`.
   * Expected outcome: A mismatch publishes nothing.
   * Exceptions: None.
   */
  readonly seq: number;
  /**
   * Cell under the pointer when validation ran.
   *
   * Contract: The h3 the ranged validator checked.
   * When to use: `publishValidatedRangedHover`.
   * Expected outcome: A cell change publishes nothing.
   * Exceptions: None.
   */
  readonly hoveredH3: string;
  /**
   * Selected unit ids when validation ran.
   *
   * Contract: The selection the validator accepted or rejected.
   * When to use: `publishValidatedRangedHover`.
   * Expected outcome: A selection change publishes nothing. A legal shot sends these as attackers.
   * Exceptions: None.
   */
  readonly unitIds: readonly string[];
  /**
   * Result of the ranged validator.
   *
   * Contract: `success` false carries `reason` when the validator supplied one.
   * When to use: `publishValidatedRangedHover`.
   * Expected outcome: A failure publishes the blocking reason and does not request odds.
   * Exceptions: None.
   */
  readonly validation: { success: boolean; reason?: string | null };
  /**
   * Whether this aim is inside a battle.
   *
   * Contract: True only while the renderer is aiming at a battle cell.
   * When to use: `publishValidatedRangedHover`.
   * Expected outcome: Sent as `inBattle` on the odds request.
   * Exceptions: None.
   */
  readonly inBattle: boolean;
  /**
   * Origin used to collapse a selection to one line per stack.
   *
   * Contract: Returns the grouping hex for a unit id, or undefined when that unit has none.
   * When to use: `publishValidatedRangedHover`.
   * Expected outcome: Passed to the support-targeting publisher.
   * Exceptions: None.
   */
  readonly originH3ForGrouping: (unitId: string) => string | undefined;
  /**
   * Origin drawn at the start of a preview line.
   *
   * Contract: Returns the preview hex for a unit id, or undefined when that unit has none.
   * When to use: `publishValidatedRangedHover`.
   * Expected outcome: Passed to the support-targeting publisher.
   * Exceptions: None.
   */
  readonly originH3ForPreview: (unitId: string) => string | undefined;
  /**
   * Whether an illegal hover may show the blocked tooltip.
   *
   * Contract: True only for a map pointer hover that is allowed to show that tooltip.
   * When to use: `publishValidatedRangedHover`.
   * Expected outcome: Forwarded to the support-targeting publisher.
   * Exceptions: None.
   */
  readonly allowBlockingOrderTooltip: boolean;
}
