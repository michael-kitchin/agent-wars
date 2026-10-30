/**
 * Hire orders, treasury figures, and the hex hire view shared by the main process and the renderer.
 *
 * Purpose: One contract for IPC, the snapshot economy, and the hire panel.
 * When to use: Any read or mutation of credits and hire orders that crosses the process boundary.
 * Expected outcome: Plain data. Funds are the seat's own treasury, not another seat's.
 * Exceptions: None.
 */

import type { HireableUnitType, HireKind } from '../mercenaryRules';

/**
 * The seat's treasury and what it already owes this turn.
 *
 * Purpose: The top bar, the hire panel, and the AI briefing share one balance.
 * When to use: Whenever a view shows credits against upkeep and hire fees.
 * Expected outcome: Non-negative credits. Upkeep and fees are what the end of the turn will charge if nothing changes.
 * Exceptions: None.
 */
export interface MercenaryFunds {
  /**
   * Credits in the treasury now.
   *
   * Contract: Never negative. 0 when the seat has no treasury row.
   * When to use: The credits readout and hire-fee checks at the end of the turn.
   * Expected outcome: The stored balance, before this turn's production is added.
   * Exceptions: None.
   */
  readonly credits: number;
  /**
   * Upkeep of the mercenaries the seat already has.
   *
   * Contract: Due at the end of this turn, before new hires.
   * When to use: The short-credits warning and payroll.
   * Expected outcome: The sum of current mercenary upkeep.
   * Exceptions: None.
   */
  readonly upkeepPerTurn: number;
  /**
   * Credits already taken for this turn's hire orders.
   *
   * Contract: The sum of `reservedCredits` on the seat's orders. An order stored with 0 still settles by charging only what fills.
   * When to use: The credits tip and the mercenary funds line. Do not add it to upkeep when deciding whether the balance is short.
   * Expected outcome: The amount already removed from `credits`. Removing an order returns its part of this sum.
   * Exceptions: None.
   */
  readonly pendingHireFees: number;
  /**
   * How many mercenaries the seat has now.
   *
   * Contract: Does not include orders that have not filled.
   * When to use: The credits tooltip.
   * Expected outcome: The count of the seat's mercenary units.
   * Exceptions: None.
   */
  readonly mercenaryCount: number;
}

/**
 * Treasury figures for one seat's view of the match.
 *
 * Purpose: The snapshot carries the viewer's own economy and, on the human map, the hexes that can show a Hire marker.
 * When to use: Set only on a single seat's snapshot, never on the observe-all snapshot.
 * Expected outcome: The funds, plus hire hexes when the renderer needs markers.
 * Exceptions: None.
 */
export interface MercenaryEconomySnapshot extends MercenaryFunds {
  /**
   * Hexes where the human may hire now or already has an order.
   *
   * Contract: Set only on the renderer's human view.
   * When to use: Hire markers. Absent on the AI's snapshot and on observe-all.
   * Expected outcome: Sorted unique hex indexes, or absent when markers are not needed.
   * Exceptions: None.
   */
  readonly hireHexes?: readonly string[];
}

/**
 * One unit type the seat can raise on a hex, with its prices.
 *
 * Purpose: The raise select and the AI raise table share one option.
 * When to use: When the type fits the hex's raise capacity.
 * Expected outcome: A hireable type and three positive prices.
 * Exceptions: None.
 */
export interface HireRaiseOption {
  /**
   * The type that would be raised.
   *
   * Contract: Infantry, armor, naval, or air.
   * When to use: The select value and the hire order.
   * Expected outcome: A hireable type the hex can build, excluding missiles.
   * Exceptions: None.
   */
  readonly unitType: HireableUnitType;
  /**
   * Production points one unit counts against the hex's raise capacity.
   *
   * Contract: The active map's price for the type.
   * When to use: Capacity checks. Not the credit fee.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly unitCost: number;
  /**
   * Credits charged per unit when the order fills.
   *
   * Contract: One turn of upkeep.
   * When to use: The option label and the order's total fee.
   * Expected outcome: The raise fee for one unit.
   * Exceptions: None.
   */
  readonly fee: number;
  /**
   * Credits of upkeep per unit on later turns.
   *
   * Contract: The same number as the raise fee.
   * When to use: The option label.
   * Expected outcome: Upkeep for one unit of this type at this hex's tier.
   * Exceptions: None.
   */
  readonly upkeep: number;
}

/**
 * What the seat can still raise on one hex this turn.
 *
 * Purpose: The panel and placement share the capacity that earlier orders have not used.
 * When to use: When raising is allowed.
 * Expected outcome: Options whose unit cost still fits `capacityLeft`.
 * Exceptions: None.
 */
export interface HireRaiseView {
  /**
   * Production points the hex can raise this turn, before this turn's orders.
   *
   * Contract: Twice the city-cell count, or 0 on a neutral border.
   * When to use: The capacity line.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly capacityPerTurn: number;
  /**
   * Capacity remaining after the seat's raise orders on this hex.
   *
   * Contract: Never increased by removing another seat's orders. Those are invisible.
   * When to use: Which options still fit.
   * Expected outcome: `capacityPerTurn` minus the unit cost of the seat's raise orders here.
   * Exceptions: None.
   */
  readonly capacityLeft: number;
  /**
   * Types for which one unit fits both `capacityLeft` and the present balance.
   *
   * Contract: Each option passes `hireShortageLabel` at a count of one. Empty only when `raise` itself is absent.
   * When to use: The type select.
   * Expected outcome: A subset of the types the hex could raise.
   * Exceptions: None.
   */
  readonly options: readonly HireRaiseOption[];
}

/**
 * A Neutral unit the seat can see and rehire.
 *
 * Purpose: The hire panel lists one row per candidate.
 * When to use: When the unit passes the rehire rules and the seat has no order for it yet.
 * Expected outcome: Identity, fee, and upkeep. No hex index, because this view also reaches the model.
 * Exceptions: None.
 */
export interface HireRehireRow {
  /**
   * The Neutral unit's id.
   *
   * Contract: Stable for the life of the unit. The prefix may name the side that first created it.
   * When to use: The rehire request.
   * Expected outcome: An id present on the seat's snapshot.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * The unit's type.
   *
   * Contract: Hireable. Never a missile.
   * When to use: Pricing and the row label.
   * Expected outcome: The type stored on the unit.
   * Exceptions: None.
   */
  readonly unitType: HireableUnitType;
  /**
   * The unit's display name.
   *
   * Contract: The same label the map uses for that unit.
   * When to use: The rehire row.
   * Expected outcome: A non-empty name.
   * Exceptions: None.
   */
  readonly displayName: string;
  /**
   * Credits charged if the rehire fills.
   *
   * Contract: Two turns of the unit's upkeep.
   * When to use: The row and the funds warning.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly fee: number;
  /**
   * Credits of upkeep per later turn.
   *
   * Contract: Half the rehire fee, rounded as upkeep already was.
   * When to use: The row.
   * Expected outcome: The unit's upkeep.
   * Exceptions: None.
   */
  readonly upkeep: number;
}

/**
 * One hire order the seat has placed on a hex.
 *
 * Purpose: The panel can show the order and remove it before Ready.
 * When to use: Pending orders on the hex being viewed.
 * Expected outcome: The stored order plus its total fee.
 * Exceptions: None.
 */
export interface HireOrderView {
  /**
   * Database id of the order.
   *
   * Contract: Unique in the hire-order table.
   * When to use: The remove request.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly orderId: number;
  /**
   * Raise or rehire.
   *
   * Contract: Matches the stored kind.
   * When to use: Choosing the label.
   * Expected outcome: `'raise'` or `'rehire'`.
   * Exceptions: None.
   */
  readonly kind: HireKind;
  /**
   * Type stored on the order.
   *
   * Contract: For a rehire, the unit's type when the order was placed.
   * When to use: The raise label.
   * Expected outcome: A hireable type.
   * Exceptions: None.
   */
  readonly unitType: HireableUnitType;
  /**
   * How many units the order asks for.
   *
   * Contract: 1 for a rehire. From 1 to 99 for a raise.
   * When to use: The raise label and the capacity already used.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly count: number;
  /**
   * The Neutral unit a rehire names.
   *
   * Contract: Null for a raise.
   * When to use: Removing a duplicate rehire and filling the order.
   * Expected outcome: The unit id, or null.
   * Exceptions: None.
   */
  readonly unitId: string | null;
  /**
   * Display name of a rehire target.
   *
   * Contract: Null for a raise.
   * When to use: The pending-order label.
   * Expected outcome: The unit's name, or null.
   * Exceptions: None.
   */
  readonly displayName: string | null;
  /**
   * Credits the order will cost if it fills in full.
   *
   * Contract: Fee per unit times count for a raise. The rehire fee for a rehire.
   * When to use: The order label and the funds total.
   * Expected outcome: A non-negative integer. 0 only when the target unit is already gone.
   * Exceptions: None.
   */
  readonly fee: number;
}

/**
 * Everything the hire panel needs for one hex.
 *
 * Purpose: One IPC read fills the panel without a second round trip.
 * When to use: Opening or refreshing the Hire tab.
 * Expected outcome: Funds, whether hiring is available, and the lists the panel renders.
 * Exceptions: None. A missing hex is a null result from the caller, not an empty view.
 */
export interface HexHireView {
  /**
   * The hex this view describes.
   *
   * Contract: A strategic hex index on the map.
   * When to use: Confirming the panel is still showing the hex the player opened.
   * Expected outcome: The requested hex.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * The seat's treasury figures.
   *
   * Contract: The same shape as the top bar.
   * When to use: The production line and the shortage label.
   * Expected outcome: Current credits, upkeep, fees, and mercenary count.
   * Exceptions: None.
   */
  readonly funds: MercenaryFunds;
  /**
   * Whether the Hire tab should remain for this hex.
   *
   * Contract: True when `raise` is set, `raiseShortage` is set, a rehire remains, or a pending order remains, unless the hex itself is blocked and no pending order remains. A build hex drops the Hire tab when this is false, so a shortage keeps it true.
   * When to use: Choosing a Hire marker, a Hire tab, or a blocked message.
   * Expected outcome: False only when there is nothing to show and nothing to remove.
   * Exceptions: None.
   */
  readonly hireAvailable: boolean;
  /**
   * Why hiring is unavailable.
   *
   * Contract: Null when `hireAvailable` is true.
   * When to use: The blocked message.
   * Expected outcome: A player-facing sentence, or null.
   * Exceptions: None.
   */
  readonly unavailableReason: string | null;
  /**
   * What can still be raised here.
   *
   * Contract: Null when raising is blocked, or when `raiseShortage` names why no type fits one unit.
   * When to use: The raise section.
   * Expected outcome: A view, or null.
   * Exceptions: None.
   */
  readonly raise: HireRaiseView | null;
  /**
   * Why raising is blocked.
   *
   * Contract: Null when `raise` is set, and null when `raiseShortage` already explains the hidden row. Set for an occupied hex, a fortified hex, or a hex with no base capacity.
   * When to use: The raise section's blocked message.
   * Expected outcome: A player-facing sentence, or null.
   * Exceptions: None.
   */
  readonly raiseBlockedReason: string | null;
  /**
   * Why no raise type fits one unit.
   *
   * Contract: `HIRE_ALLOCATED_CREDITS`, `HIRE_ALLOCATED_PRODUCTION`, or `HIRE_ALLOCATED_BOTH` when the hex has raise options, raising is not otherwise blocked, and `oneUnitRaiseShortage` is non-null. Otherwise null. A Hire click uses the shortage sentences instead.
   * When to use: The Hire tab when the raise row is hidden.
   * Expected outcome: The sentence to show with no raise controls, or null.
   * Exceptions: None.
   */
  readonly raiseShortage: string | null;
  /**
   * Neutral units here that the seat can still order.
   *
   * Contract: Omits units the seat already has a rehire order for.
   * When to use: The Neutral units section.
   * Expected outcome: Zero or more rows.
   * Exceptions: None.
   */
  readonly rehireUnits: readonly HireRehireRow[];
  /**
   * The seat's hire orders on this hex.
   *
   * Contract: Only this seat's orders.
   * When to use: The orders section.
   * Expected outcome: Zero or more orders.
   * Exceptions: None.
   */
  readonly pendingOrders: readonly HireOrderView[];
}

/**
 * A request to place one hire order.
 *
 * Purpose: The renderer and the AI submit the same payload.
 * When to use: `placeHireOrder`. Placement takes the fee from the treasury when the order is stored.
 * Expected outcome: A raise names a hex, a type, and a count. A rehire names a unit id.
 * Exceptions: None. The handler rejects a payload that matches neither shape.
 */
export type HireOrderRequest =
  | {
      readonly kind: 'raise';
      readonly h3Index: string;
      readonly unitType: HireableUnitType;
      readonly count: number;
    }
  | { readonly kind: 'rehire'; readonly unitId: string };

/**
 * Result of placing or removing a hire order.
 *
 * Purpose: The panel shows the rejection sentence or refreshes after success.
 * When to use: The place and remove IPC results.
 * Expected outcome: `success` false carries `reason`. A placed order carries `orderId`.
 * Exceptions: None.
 */
export interface HireMutationResult {
  /**
   * Whether the order was stored or removed.
   *
   * Contract: False when a check rejected the request.
   * When to use: Choosing a toast or a refresh.
   * Expected outcome: True only when the table changed.
   * Exceptions: None.
   */
  readonly success: boolean;
  /**
   * Why the request was rejected.
   *
   * Contract: Set when `success` is false.
   * When to use: The error toast.
   * Expected outcome: A player-facing sentence, or absent on success.
   * Exceptions: None.
   */
  readonly reason?: string;
  /**
   * Id of an order that was just placed.
   *
   * Contract: Set when an insert succeeded. Absent on a remove.
   * When to use: Tests and a caller that needs the new id.
   * Expected outcome: A positive integer, or absent.
   * Exceptions: None.
   */
  readonly orderId?: number;
}
