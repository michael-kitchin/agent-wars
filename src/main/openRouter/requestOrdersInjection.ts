/**
 * Memory, standing-order, and production injection text for both briefing paths.
 *
 * Purpose: The no-briefing assembler and the `formatBriefing` path used to compute the same three
 * strings independently and could drift. One helper is the only source.
 * When to use: `buildSystemPromptForTools` (standalone sections) and `requestOrdersFlow` (briefing override).
 * Expected outcome: Empty string for each block whose tool group is off; otherwise the live injection/section.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from '../gameDb';
import { logDebug, logTrace } from '../logger';
import { briefingOwnSeatId } from '../briefing/briefingPerspective';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import type { AiSeatId } from '../../shared/seatIds';
import { getInjectionText } from '../tools/memory';
import { getInjectionText as getStandingOrderInjectionText } from '../tools/standingOrders';
import { buildProductionBriefing } from './briefingSections';
import { buildCampaignObjectiveSection } from './briefingSectionsCampaign';
import { buildCampaignOrderRows } from '../tools/standingOrdersInjectionText';
import { formatProductionAttentionBullet } from './productionAttention';
import { formatPausedProductionPointer } from './pausedProductionAttention';
import { formatMissileLaunchAttention } from './briefingSectionsMissiles';
import { formatMercenaryRaiseAttention } from './mercenaryRaiseAttention';
import type { CampaignPlan } from './campaignRules';

/**
 * Gates and snapshot needed to build the three status injection strings.
 *
 * Purpose: One object so the two call sites cannot pass different flag combinations for the same consultation.
 * When to use: Built from `getToolFlags` plus the maps already in hand.
 * Expected outcome: `productionEnabled` false yields an empty production string.
 * Exceptions: None.
 */
export interface StatusInjectionArgs {
  /**
   * Whether memory tools are enabled.
   *
   * Contract: False yields empty `memoryText`.
   * When to use: From `flags.memoryEnabled`.
   * Expected outcome: Matches the memory tool-group flag for this consultation.
   * Exceptions: None.
   */
  readonly memoryEnabled: boolean;
  /**
   * Whether standing-order tools are enabled.
   *
   * Contract: False yields empty `standingOrderText`.
   * When to use: From `flags.ordersEnabled`.
   * Expected outcome: Tactical callers typically pass false because standing orders are inert in battle.
   * Exceptions: None.
   */
  readonly ordersEnabled: boolean;
  /**
   * Whether production tools are enabled.
   *
   * Contract: False yields empty `productionText`.
   * When to use: From `flags.productionEnabled`.
   * Expected outcome: True still returns the section's empty form when no queues exist.
   * Exceptions: None.
   */
  readonly productionEnabled: boolean;
  /**
   * Snapshot used for standing-order and production queries.
   *
   * Contract: The same state the rest of the consultation used.
   * When to use: Plan state in battle, world state on a strategic turn.
   * Expected outcome: Injection matches the units and control in this snapshot.
   * Exceptions: None.
   */
  readonly state: GameStateSnapshot;
  /**
   * Hex centers used by production queue serialization.
   *
   * Contract: Must include every hex the production tool might name.
   * When to use: The `latLngByH3` already built for this request.
   * Expected outcome: Production rows use the same coordinates as the map.
   * Exceptions: None.
   */
  readonly latLngByH3: Map<string, [number, number]>;
  /**
   * Lat/lng to H3 resolver used by production.
   *
   * Contract: Same function the rest of the request uses.
   * When to use: Passed through to `buildProductionBriefingBlock`.
   * Expected outcome: Queue hexes round-trip to the same cells.
   * Exceptions: None.
   */
  readonly resolveToH3: (lat: number, lng: number) => string | undefined;
  /**
   * Formats a lat/lng as a briefing hex label for production rows.
   *
   * Contract: Should match the operational map's cell codes.
   * When to use: Production table Hex column.
   * Expected outcome: Two-character codes when the point is on the map.
   * Exceptions: None.
   */
  readonly formatHexLabel: (ll: [number, number]) => string;
  /**
   * Coordinate mode for standing-order injection.
   *
   * Contract: Tactical context yields empty standing-order injection today.
   * When to use: `{ mode: 'strategic' }` on the briefing path; the assembler's live context on the no-briefing path.
   * Expected outcome: Matches `getStandingOrderInjectionText` for this mode.
   * Exceptions: None.
   */
  readonly coordinateContext: CoordinateContext;
  /**
   * Commander whose memory and standing orders are injected.
   *
   * Contract: An AI seat. Omitted uses the snapshot perspective, then the first AI seat.
   * When to use: The consultation passes its seat. The prompt assembler can omit it when the snapshot already carries that perspective.
   * Expected outcome: Notes and standing orders belong to this commander.
   * Exceptions: None.
   */
  readonly seatId?: AiSeatId;
  /**
   * The consult's campaign plan.
   *
   * Contract: Omitted or null keeps today's standing-order suggestions.
   * When to use: Strategic consults that resolved a campaign.
   * Expected outcome: Passed to the standing-order injection. Memory and production ignore it.
   * Exceptions: None.
   */
  readonly campaignPlan?: CampaignPlan | null;
}

/**
 * Memory, standing-order, and production strings for this consultation.
 *
 * Purpose: Named result so callers can attach their own separators (`\\n\\n` vs briefing slots).
 * When to use: Return type of `buildStatusInjectionTexts`.
 * Expected outcome: Text fields are empty strings, never undefined, when the matching flag is off. `productionAttention` is null unless production is on and a hex is idle.
 * Exceptions: None.
 */
export interface StatusInjectionTexts {
  /**
   * Memory injection body, or empty when memory tools are off.
   *
   * Contract: Empty string when `memoryEnabled` is false; otherwise `getInjectionText` for the opponent.
   * When to use: Briefing memory slot or standalone memory block.
   * Expected outcome: May still be empty if there are no saved notes.
   * Exceptions: None.
   */
  readonly memoryText: string;
  /**
   * Standing-order status body, or empty when standing-order tools are off.
   *
   * Contract: Empty string when `ordersEnabled` is false.
   * When to use: Briefing standing-order slot or standalone standing-order block.
   * Expected outcome: Tactical context typically yields empty even when the flag is true.
   * Exceptions: None.
   */
  readonly standingOrderText: string;
  /**
   * Production status section, or empty when production tools are off.
   *
   * Contract: Empty string when `productionEnabled` is false; otherwise a full Production Status section including the empty-queue form.
   * When to use: Briefing production slot or standalone production block.
   * Expected outcome: Non-empty whenever production tools are on.
   * Exceptions: None.
   */
  readonly productionText: string;
  /**
   * Production attention bullet, without a leading list marker.
   *
   * Contract: Null when production tools are off or no controlled hex is idle. Otherwise the sentence from `formatProductionAttentionBullet`.
   * When to use: `formatBriefing` appends it after the unit attention bullets. The opening message only needs to know whether it is present.
   * Expected outcome: Names up to `PRODUCTION_ATTENTION_LISTED_HEXES` idle hexes.
   * Exceptions: None.
   */
  readonly productionAttention: string | null;
  /**
   * One-line pointer to the paused-queue subsection, without a leading list marker.
   *
   * Contract: Null when production tools are off or no queue is paused for occupation or a full city.
   * When to use: `formatBriefing` appends it after the production bullet. The subsection itself is already in `productionText`.
   * Expected outcome: Null unless production is on and a queue is paused for occupation or a full city. The sentence is the pointer, not the subsection.
   * Exceptions: None.
   */
  readonly pausedProductionAttention: string | null;
  /**
   * The Campaign Objective section, or empty when there is no plan.
   *
   * Contract: Empty when orders are off, the mode is tactical, or no campaign plan was passed.
   * When to use: The no-briefing situation message, and `formatBriefing`.
   * Expected outcome: An H1 section naming the target, staging hex, and phase.
   * Exceptions: None.
   */
  readonly campaignText: string;
  /**
   * The campaign attention bullet, or null when no campaign unit needs a new order.
   *
   * Contract: Null when the Campaign Orders table would be empty.
   * When to use: The last attention bullet, and the opening-message gate.
   * Expected outcome: The sentence that tells the model to copy each Campaign Orders row.
   * Exceptions: None.
   */
  readonly campaignAttention: string | null;
  /**
   * Launch and raise bullets that are not part of the five-flag cap.
   *
   * Contract: The missile sentence when a target exists, then the mercenary sentence when production is on and a raise is affordable. Empty in a battle.
   * When to use: `formatBriefing` appends each one after the production and campaign bullets. Tactical injection leaves the list empty.
   * Expected outcome: Neither bullet counts against the five unit-flag cap.
   * Exceptions: None.
   */
  readonly additionalAttention: readonly string[];
}

/**
 * The attention sentence for units whose standing order Campaign Orders changes.
 *
 * Purpose: Attention Flags names the count. The table itself lists the rows.
 * When to use: After `buildCampaignOrderRows`, when standing orders are on.
 * Expected outcome: Null for zero. Otherwise the Campaign sentence with `1 unit needs` or `N units need`.
 * Exceptions: None.
 */
export function formatCampaignAttentionBullet(count: number): string | null {
  logTrace('requestOrdersInjection formatCampaignAttentionBullet', { count });
  if (count <= 0) return null;
  const subject = count === 1 ? '1 unit needs' : `${count} units need`;
  return `Campaign: ${subject} a new standing order. Copy each Campaign Orders row into an assign_order entry.`;
}

/**
 * Builds the three status injection strings from one flag-and-snapshot object.
 *
 * Purpose: The assembler (no briefing) and `formatBriefing` (with briefing) must not compute these independently.
 * When to use: Once, from `requestOrdersFlow`, before the briefing. The prompt assembler calls it only when it has no briefing and no supplied attention sentence.
 * Expected outcome: Each string is empty iff its tool group is off.
 * Exceptions: None.
 */
export function buildStatusInjectionTexts(args: StatusInjectionArgs): StatusInjectionTexts {
  const seatId = args.seatId ?? briefingOwnSeatId(args.state);
  logDebug('requestOrdersInjection buildStatusInjectionTexts', {
    memoryEnabled: args.memoryEnabled,
    ordersEnabled: args.ordersEnabled,
    productionEnabled: args.productionEnabled,
    seatId,
    turnNumber: args.state.turnNumber,
    mode: args.coordinateContext.mode,
  });
  const memoryText = args.memoryEnabled ? getInjectionText(seatId, args.state.turnNumber) : '';
  const standingOrderText = args.ordersEnabled
    ? getStandingOrderInjectionText(seatId, args.state, args.coordinateContext, args.campaignPlan ?? null)
    : '';
  const campaignPlan = args.campaignPlan ?? null;
  const formatCampaignHex = (h3: string): string => {
    const ll = args.latLngByH3.get(h3);
    return ll ? args.formatHexLabel(ll) : h3;
  };
  const campaignText =
    args.ordersEnabled && args.coordinateContext.mode !== 'tactical' && campaignPlan
      ? buildCampaignObjectiveSection({ state: args.state, plan: campaignPlan, format: formatCampaignHex })
      : '';
  const campaignAttention =
    args.ordersEnabled && args.coordinateContext.mode !== 'tactical' && campaignPlan
      ? formatCampaignAttentionBullet(
          buildCampaignOrderRows({
            playerId: seatId,
            state: args.state,
            plan: campaignPlan,
            coordinateContext: { mode: 'strategic' },
          }).length
        )
      : null;
  const production = args.productionEnabled
    ? buildProductionBriefing({
        productionEnabled: true,
        state: args.state,
        latLngByH3: args.latLngByH3,
        resolveToH3: args.resolveToH3,
        formatHexLabel: args.formatHexLabel,
      })
    : { text: '', idleHexes: [], pausedHexes: [] };
  return {
    memoryText,
    standingOrderText,
    productionText: production.text,
    productionAttention: args.productionEnabled ? formatProductionAttentionBullet(production.idleHexes) : null,
    pausedProductionAttention: args.productionEnabled ? formatPausedProductionPointer(production.pausedHexes) : null,
    campaignText,
    campaignAttention,
    additionalAttention:
      args.coordinateContext.mode === 'tactical'
        ? []
        : [
            formatMissileLaunchAttention(args.state, formatCampaignHex),
            args.productionEnabled
              ? formatMercenaryRaiseAttention({
                  state: args.state,
                  ownSeat: seatId,
                  format: formatCampaignHex,
                  campaignTargetH3: campaignPlan?.objective.targetH3 ?? null,
                })
              : null,
          ].filter((bullet): bullet is string => bullet != null),
  };
}
