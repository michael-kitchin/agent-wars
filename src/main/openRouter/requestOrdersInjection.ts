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
import { logDebug } from '../logger';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { getInjectionText } from '../tools/memory';
import { getInjectionText as getStandingOrderInjectionText } from '../tools/standingOrders';
import { buildProductionBriefingBlock } from './briefingSections';

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
}

/**
 * Memory, standing-order, and production strings for this consultation.
 *
 * Purpose: Named result so callers can attach their own separators (`\\n\\n` vs briefing slots).
 * When to use: Return type of `buildStatusInjectionTexts`.
 * Expected outcome: Empty strings, never undefined, when the matching flag is off.
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
}

/**
 * Builds the three status injection strings from one flag-and-snapshot object.
 *
 * Purpose: The assembler (no briefing) and `formatBriefing` (with briefing) must not compute these independently.
 * When to use: Once per consultation before assembling the system prompt or briefing override.
 * Expected outcome: Each string is empty iff its tool group is off.
 * Exceptions: None.
 */
export function buildStatusInjectionTexts(args: StatusInjectionArgs): StatusInjectionTexts {
  logDebug('requestOrdersInjection buildStatusInjectionTexts', {
    memoryEnabled: args.memoryEnabled,
    ordersEnabled: args.ordersEnabled,
    productionEnabled: args.productionEnabled,
    turnNumber: args.state.turnNumber,
    mode: args.coordinateContext.mode,
  });
  const memoryText = args.memoryEnabled ? getInjectionText('opponent', args.state.turnNumber) : '';
  const standingOrderText = args.ordersEnabled
    ? getStandingOrderInjectionText('opponent', args.state, args.coordinateContext)
    : '';
  const productionText = args.productionEnabled
    ? buildProductionBriefingBlock({
        productionEnabled: true,
        state: args.state,
        latLngByH3: args.latLngByH3,
        resolveToH3: args.resolveToH3,
        formatHexLabel: args.formatHexLabel,
      })
    : '';
  return { memoryText, standingOrderText, productionText };
}
