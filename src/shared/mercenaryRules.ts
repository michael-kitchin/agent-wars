/**
 * Mercenary prices, hire limits, and the sentences the player and the hire panel share.
 *
 * Purpose: Upkeep and fees use the global unit prices on every map. Production capacity still uses the active map.
 * When to use: Payroll, hire checks, the top bar, the hire panel, and the turn report.
 * Expected outcome: The same upkeep numbers on every map. Callers pass `techLevel` only when the tech bonus is on.
 * Exceptions: None. `mercenaryReferenceCost` does not throw for a hireable type.
 */

import { GLOBAL_GAME_MAP } from './activeGameMap';
import { CREDITS_PER_ITEM } from './creditsRules';
import { formatCompactHireCost, formatCompactRaiseCost, formatCreditsAmount, formatProductionCapacityAmount } from './economySymbols';
import { unitCostFor } from './gameRules';
import type { TechLevel } from './techBonusTypes';

/** Divisor that turns a global unit price into one turn of upkeep, before rounding up. */
export const MERCENARY_UPKEEP_DIVISOR = 8;

/** Upkeep multiplier for an Advanced unit when the tech bonus is on. */
export const MERCENARY_ADVANCED_TECH_MULTIPLIER = 2;

/** Rehire fee, in turns of upkeep. A raise is one turn. */
export const MERCENARY_REHIRE_FEE_MULTIPLIER = 2;

/** Raise capacity, in multiples of the hex's city-cell count. */
export const MERCENARY_RAISE_CAPACITY_MULTIPLIER = 2;

/** Smallest raise count a hire order may store. */
export const HIRE_COUNT_MIN = 1;

/** Largest raise count a hire order may store. */
export const HIRE_COUNT_MAX = 99;

/** Unit types a seat may raise or rehire. Missiles are excluded. */
export const HIREABLE_UNIT_TYPES = ['infantry', 'armor', 'naval', 'air'] as const;

/** A unit type that may be raised or rehired. */
export type HireableUnitType = (typeof HIREABLE_UNIT_TYPES)[number];

/** Whether a hire order creates new units or takes over a Neutral unit. */
export type HireKind = 'raise' | 'rehire';

/** Build-popup tab label for the existing queue. */
export const BUILD_TAB_LABEL = 'Build';

/** Build-popup tab label for hiring. */
export const HIRE_TAB_LABEL = 'Hire';

/** Button label for a raise or a rehire. */
export const HIRE_BUTTON_LABEL = 'Hire';

/** Hire-panel heading for Neutral units that can be rehired. */
export const REHIRE_SECTION_TITLE = 'Neutral units';

/** Hire-panel heading for orders placed this turn. */
export const PENDING_HIRE_SECTION_TITLE = 'Hire Queue';

/** Label beside the treasury balance in the hire panel. */
export const CREDITS_LINE_LABEL = 'Credits';

/** Label beside remaining raise capacity in the hire panel. */
export const RAISE_CAPACITY_LABEL = 'Production (Hire)';

/** Warning when the treasury cannot cover upkeep plus hire fees. */
export const HIRE_FUNDS_WARNING =
  'Your credits do not cover upkeep plus these hire orders. Credits from this turn\'s production arrive first. Random mercenaries desert only if upkeep cannot be paid, and hire orders the rest cannot pay are not filled.';

/** Shown when the hire view could not be loaded. */
export const HIRE_VIEW_FAILED = 'Hiring information could not be loaded.';

/** Rejection when the seat is no longer in the match. */
export const HIRE_REASON_NOT_ACTIVE = 'Only a side still in the match can hire.';

/** Rejection when the match is not in planning. */
export const HIRE_REASON_NOT_PLANNING = 'Hire orders can only be changed during planning.';

/** Rejection while a tactical battle is active. */
export const HIRE_REASON_TACTICAL = 'Hiring is unavailable during a tactical battle.';

/** Rejection for a hex the seat has not explored. */
export const HIRE_REASON_NOT_EXPLORED = 'You have not explored this hex.';

/** Rejection for another seat's home region. */
export const HIRE_REASON_OTHER_HOME = 'You cannot hire in another side\'s home region.';

/** Rejection when the hex offers neither a raise nor a rehire. */
export const HIRE_REASON_NOTHING_HERE = 'No mercenaries can be hired here.';

/** Rejection when a raise count is outside 1 to 99. */
export const HIRE_REASON_COUNT = 'Count must be a whole number from 1 to 99.';

/** Rejection when a remove names an order the seat does not have. */
export const HIRE_REASON_ORDER_MISSING = 'That hire order no longer exists.';

/** Rejection when another owner's unit is in the hex. */
export const RAISE_REASON_OCCUPIED = 'Mercenaries can be raised only where no other side has units.';

/** Rejection when another owner has fortified the hex. */
export const RAISE_REASON_FORTIFIED = 'Another side\'s fortifications hold this hex.';

/** Rejection when the hex cannot pay for any hireable type. */
export const RAISE_REASON_NO_CAPACITY = 'This hex has too little production to raise a unit.';

/** Rejection when the chosen type is not among the hex's raise options. */
export const RAISE_REASON_TYPE = 'That unit type cannot be raised here.';

/** Rejection when the requested count exceeds remaining raise capacity. */
export const RAISE_REASON_CAPACITY = 'That would raise more than this hex can raise this turn.';

/** Shown when earlier raise orders already use the hex's capacity. */
export const RAISE_REASON_CAPACITY_USED = 'Your orders here already use this turn\'s raise capacity.';

/** Rejection when the unit is not a visible Neutral unit that can be rehired. */
export const REHIRE_REASON_NOT_ELIGIBLE = 'That unit is not a Neutral unit you can see and rehire.';

/** Rejection when the seat already ordered that rehire. */
export const REHIRE_REASON_ALREADY_ORDERED = 'You already have an order to rehire that unit.';

/** Rejection when a hire IPC payload is not a raise or a rehire. */
export const HIRE_ORDER_INVALID_PAYLOAD = 'Invalid hire order.';

/** Toast when a hire IPC call fails without its own reason. */
export const HIRE_ORDER_UPDATE_FAILED = 'Failed to update hire orders.';

/** Unit-tooltip label for the mercenary line. */
export const MERCENARY_TOOLTIP_LABEL = 'Mercenary';

/**
 * Reports whether a value is a unit type that can be hired.
 *
 * Purpose: Hire orders and payroll reject missiles and unknown strings.
 * When to use: Before pricing a type or accepting a raise.
 * Expected outcome: True for infantry, armor, naval, and air.
 * Exceptions: None.
 */
export function isHireableUnitType(value: unknown): value is HireableUnitType {
  return typeof value === 'string' && (HIREABLE_UNIT_TYPES as readonly string[]).includes(value);
}

/**
 * Tech multiplier for one mercenary's upkeep.
 *
 * Purpose: Advanced units cost more only when the caller knows the tech bonus is on.
 * When to use: Pass `'advanced'` only when the bonus is on and the unit's birth hex is Advanced. Otherwise pass `undefined`.
 * Expected outcome: 2 for `'advanced'`, otherwise 1.
 * Exceptions: None.
 */
export function mercenaryTechMultiplier(techLevel: TechLevel | undefined): number {
  return techLevel === 'advanced' ? MERCENARY_ADVANCED_TECH_MULTIPLIER : 1;
}

/**
 * Global-map production price of a hireable type.
 *
 * Purpose: Upkeep must not change when a regional map scales production prices.
 * When to use: Only from `mercenaryUpkeepFor`. Do not pass the result through `activeGameMap()`.
 * Expected outcome: Infantry 20, armor 40, naval 100, air 60.
 * Exceptions: None.
 */
export function mercenaryReferenceCost(unitType: HireableUnitType): number {
  switch (unitType) {
    case 'infantry':
      return GLOBAL_GAME_MAP.rules.infantryCost;
    case 'armor':
      return GLOBAL_GAME_MAP.rules.armorCost;
    case 'naval':
      return GLOBAL_GAME_MAP.rules.navalCost;
    case 'air':
      return GLOBAL_GAME_MAP.rules.airCost;
    default: {
      const unexpected: never = unitType;
      return unexpected;
    }
  }
}

/**
 * Credits of upkeep one mercenary costs each turn.
 *
 * Purpose: One formula for payroll, fees, the top bar, and the hire panel.
 * When to use: After choosing the tech level the way `mercenaryTechMultiplier` describes.
 * Expected outcome: The reference cost times the tech multiplier, divided by 8, rounded up.
 * Exceptions: None.
 */
export function mercenaryUpkeepFor(unitType: HireableUnitType, techLevel: TechLevel | undefined): number {
  return Math.ceil(
    (mercenaryReferenceCost(unitType) * mercenaryTechMultiplier(techLevel)) / MERCENARY_UPKEEP_DIVISOR
  );
}

/**
 * Credits charged when a hire order fills.
 *
 * Purpose: The fee is the first turn's upkeep, once for a raise and twice for a rehire.
 * When to use: With the upkeep of one unit. Multiply a raise by the unit count at the call site.
 * Expected outcome: `upkeep` for a raise, or twice that for a rehire.
 * Exceptions: None.
 */
export function mercenaryHireFee(kind: HireKind, upkeep: number): number {
  return kind === 'rehire' ? upkeep * MERCENARY_REHIRE_FEE_MULTIPLIER : upkeep;
}

/**
 * Production points of units one hex may raise this turn.
 *
 * Purpose: Capacity scales with the active map because it is measured in that map's unit prices.
 * When to use: With the hex's city-cell count, and true when the hex is a neutral border.
 * Expected outcome: 0 on a neutral border. Otherwise twice the truncated city-cell count, and never negative.
 * Exceptions: None.
 */
export function raiseCapacityForHex(urbanHexCount: number, neutralBorder: boolean): number {
  if (neutralBorder) return 0;
  return Math.max(0, Math.trunc(urbanHexCount)) * MERCENARY_RAISE_CAPACITY_MULTIPLIER;
}

/**
 * Formats the Updates line for mercenaries hired this turn.
 *
 * Purpose: The turn report names how many units the human hire orders filled.
 * When to use: When that count is above 0.
 * Expected outcome: `1 mercenary hired.` or `N mercenaries hired.`
 * Exceptions: None.
 */
export function formatMercenariesHiredLine(count: number): string {
  return count === 1 ? '1 mercenary hired.' : `${count} mercenaries hired.`;
}

/**
 * Formats the Updates line for units that deserted.
 *
 * Purpose: The turn report names unpaid mercenaries, including cargo that left with a deserting ship.
 * When to use: When that count is above 0.
 * Expected outcome: `1 unit deserted for lack of pay.` or `N units deserted for lack of pay.`
 * Exceptions: None.
 */
export function formatUnitsDesertedLine(count: number): string {
  return count === 1 ? '1 unit deserted for lack of pay.' : `${count} units deserted for lack of pay.`;
}

/**
 * Formats the Updates line for hire orders that were not filled.
 *
 * Purpose: The player sees that an unfilled order cost nothing.
 * When to use: When that count is above 0. A raise that filled at least one unit is not in this count.
 * Expected outcome: One sentence, singular or plural.
 * Exceptions: None.
 */
export function formatHireOrdersUnfilledLine(count: number): string {
  return count === 1
    ? '1 hire order could not be filled, so it was not charged.'
    : `${count} hire orders could not be filled, so they were not charged.`;
}

/**
 * Suffix for the top-bar credits readout.
 *
 * Purpose: The readout shows upkeep beside the balance when the seat has mercenaries to pay.
 * When to use: The credits stat. Pass 0 when upkeep is 0.
 * Expected outcome: An empty string, or a minus sign, the credits symbol, the upkeep, and `/turn`.
 * Exceptions: None.
 */
export function formatCreditsUpkeepSuffix(upkeep: number): string {
  return upkeep === 0 ? '' : `\u2212${formatCreditsAmount(String(upkeep))}/turn`;
}

/**
 * Tooltip for the top-bar credits readout.
 *
 * Purpose: Explains the balance, upkeep, this turn's fees, and what happens when credits run short.
 * When to use: When the human view has a mercenary economy.
 * Expected outcome: One paragraph ending with how a credits item is priced.
 * Exceptions: None.
 */
export function formatCreditsTooltip(funds: {
  readonly credits: number;
  readonly upkeepPerTurn: number;
  readonly pendingHireFees: number;
  readonly mercenaryCount: number;
}): string {
  const mercenaryWord = funds.mercenaryCount === 1 ? 'mercenary' : 'mercenaries';
  const balance = formatCreditsAmount(String(funds.credits));
  const upkeep = formatCreditsAmount(String(funds.upkeepPerTurn));
  const hireOrders = formatCreditsAmount(String(funds.pendingHireFees));
  return `Credits pay for mercenaries. You hold ${balance}. Upkeep for your ${funds.mercenaryCount} ${mercenaryWord} is ${upkeep} per turn, and this turn's hire orders cost ${hireOrders}. Credits from this turn's production arrive before upkeep is paid. If credits run short, random mercenaries desert. A Credits build item turns one infantry's price in production into ${CREDITS_PER_ITEM} credits.`;
}

/**
 * Label on a Hire marker.
 *
 * Purpose: The marker replaces the canvas production label, so it carries that figure and no hire suffix.
 * When to use: With the hex's production text, which already includes the production symbol.
 * Expected outcome: That text unchanged. The marker module does not format the figure itself.
 * Exceptions: None.
 */
export function formatHireEntryLabel(productionText: string): string {
  return productionText;
}

/**
 * Accessible name for a Hire marker.
 *
 * Purpose: The marker is a button that opens hiring for one hex.
 * When to use: The button's `aria-label`.
 * Expected outcome: `Open hiring for` and the hex index.
 * Exceptions: None.
 */
export function formatHireEntryAriaLabel(h3Index: string): string {
  return `Open hiring for ${h3Index}`;
}

/**
 * Value beside the raise-capacity label.
 *
 * Purpose: The hire panel shows production points still available this turn.
 * When to use: With capacity left and the hex's capacity for the turn.
 * Expected outcome: The production symbol, the amount left, ` of `, the symbol again, and `N this turn`.
 * Exceptions: None.
 */
export function formatRaiseCapacityValue(left: number, perTurn: number): string {
  const leftText = formatProductionCapacityAmount(String(left));
  const perTurnText = formatProductionCapacityAmount(String(perTurn));
  return `${leftText} of ${perTurnText} this turn`;
}

/**
 * Value beside the Credits label in the hire panel.
 *
 * Purpose: The balance and this turn's mercenary upkeep share one line.
 * When to use: With the seat's credits and `upkeepPerTurn`, including when upkeep is 0.
 * Expected outcome: The credits symbol, the balance, ` + `, the symbol, the upkeep, and ` / turn`. No thousands separators.
 * Exceptions: None.
 */
export function formatHireCreditsValue(credits: number, upkeepPerTurn: number): string {
  return `${formatCreditsAmount(String(credits))} + ${formatCreditsAmount(String(upkeepPerTurn))} / turn`;
}

/**
 * Label for one raise option.
 *
 * Purpose: The type select shows the production cost and the credit price.
 * When to use: One option in the raise select.
 * Expected outcome: `Infantry (⚒20 + ¤3 / turn)` when the fee equals upkeep. An extra one-time amount appears only when the fee is higher.
 * Exceptions: None.
 */
export function formatHireOptionLabel(option: {
  readonly unitType: HireableUnitType;
  readonly unitCost: number;
  readonly fee: number;
  readonly upkeep: number;
}): string {
  const price = formatCompactRaiseCost(option.unitCost, option.fee, option.upkeep);
  return `${capitalizeUnitType(option.unitType)} (${price})`;
}

/**
 * Label for one pending hire order.
 *
 * Purpose: The hire panel lists what will be filled at the end of the turn.
 * When to use: One row per order on this hex.
 * Expected outcome: A raise names the count, the type, and the compact price. A rehire names the unit and the compact price. Neither row starts with Raise or Rehire. The one-time credit amount is only the extra above one turn.
 * Exceptions: None. A count below 1 still uses integer division and does not throw.
 */
export function formatHireOrderLabel(order: {
  readonly kind: HireKind;
  readonly unitType: HireableUnitType;
  readonly count: number;
  readonly displayName: string | null;
  readonly fee: number;
}): string {
  if (order.kind === 'rehire') {
    const name = order.displayName ?? capitalizeUnitType(order.unitType);
    const upkeep = Math.trunc(order.fee / MERCENARY_REHIRE_FEE_MULTIPLIER);
    return `${name} (${formatCompactHireCost(order.fee, upkeep)})`;
  }
  const perUnitFee = Math.trunc(order.fee / order.count);
  const price = formatCompactRaiseCost(unitCostFor(order.unitType), perUnitFee, perUnitFee);
  return `${order.count} ${capitalizeUnitType(order.unitType)} (${price})`;
}

/**
 * Value for the Mercenary tooltip line.
 *
 * Purpose: Anyone who can see the unit can see what it costs to keep.
 * When to use: After the date-of-birth line, when the unit is a mercenary.
 * Expected outcome: `upkeep`, the credits symbol, the amount, and `per turn`.
 * Exceptions: None.
 */
export function formatMercenaryTooltipValue(upkeep: number): string {
  return `upkeep ${formatCreditsAmount(String(upkeep))} per turn`;
}

/**
 * Title-cases a hireable unit type for a label.
 *
 * Purpose: Select options and order rows use `Infantry`, not `infantry`.
 * When to use: Only from the hire label formatters.
 * Expected outcome: The type with an uppercase first letter.
 * Exceptions: None.
 */
function capitalizeUnitType(unitType: HireableUnitType): string {
  return unitType.charAt(0).toUpperCase() + unitType.slice(1);
}
