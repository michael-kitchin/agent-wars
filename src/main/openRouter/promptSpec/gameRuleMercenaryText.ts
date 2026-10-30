/**
 * Sentences that tell a commander how credits, building, and mercenaries work.
 *
 * Purpose: The production block and the Mercenaries section share one wording, read from the engine.
 * When to use: Those sections, and the envelope sentence that names hire rows.
 * Expected outcome: The same upkeep numbers on every map, because they come from the global reference cost.
 * Exceptions: None.
 */

import { CREDITS_PER_ITEM } from '../../../shared/creditsRules';
import { creditsItemCost } from '../../../shared/gameRules';
import type { MercenaryFunds } from '../../../shared/ipc/mercenaryTypes';
import {
  HIREABLE_UNIT_TYPES,
  mercenaryUpkeepFor,
} from '../../../shared/mercenaryRules';

/** Column heading for whether a hex is still building. */
export const BUILD_STATUS_COLUMN_HEADER = 'Building';

/** How many rehire or raise rows a briefing shows. */
export const MERCENARY_BRIEFING_MAX_ROWS = 10;

/** Warning when credits do not cover mercenary upkeep. */
export const MERCENARY_FUNDS_WARNING =
  'Warning: your treasury does not cover this turn\'s mercenary upkeep. Credits produced this turn arrive before upkeep is paid. Random mercenaries desert only if upkeep cannot be paid. Hire-order fees have already been taken from the balance.';

/** Shown when the seat can see no Neutral unit it may rehire. */
export const NO_REHIRE_CANDIDATES_LINE = 'No Neutral unit you can see can be rehired.';

/** Shown when no explored hex can raise a unit. */
export const NO_RAISE_OPTIONS_LINE = 'No explored cell can raise mercenaries for you now.';

/** Reminds the model that a rehired unit keeps its old id prefix. */
export const MERCENARY_ID_PREFIX_NOTE =
  'A rehired unit keeps the id prefix of the side that first created it. Who owns a unit comes from your roster and the enemy lists, not from its prefix.';

/** Envelope rows that hire, appended when production orders are available. */
export const MERCENARY_ENVELOPE_ROWS_SENTENCE =
  'To hire, add {"action":"raise_mercenaries","hex":"<code>","unitType":"infantry","count":1} or {"action":"rehire_mercenary","unitId":"<id>"} rows to productionOrders.';

/**
 * How a Credits queue item is priced and what it adds.
 *
 * Purpose: The cost line names credits beside fortifications.
 * When to use: The end of `buildProductionCostRulesLine`.
 * Expected outcome: The active map's infantry price, and 20 credits on every map.
 * Exceptions: None.
 */
export function buildCreditsProductionRulePart(): string {
  return `a credits item costs ${creditsItemCost()} production points and adds ${CREDITS_PER_ITEM} credits to your treasury (queue unitType "credits")`;
}

/**
 * Where a queue is allowed to spend.
 *
 * Purpose: A queue outside the seat's home, units, and fortifications pauses.
 * When to use: The production block, after the income rule.
 * Expected outcome: One sentence.
 * Exceptions: None.
 */
export function buildBuildabilityRule(): string {
  return 'You can build only in your home region and in cells that hold one of your units or fortifications at the end of the turn. Elsewhere a queue pauses and keeps banking its points.';
}

/**
 * The full mercenary rule, including how to hire.
 *
 * Purpose: A seat that can produce is also told how hiring works.
 * When to use: The Mercenaries section when production tools are on.
 * Expected outcome: One paragraph. Upkeep lists the basic and Advanced figures.
 * Exceptions: None.
 */
export function buildMercenaryRule(): string {
  return `Credits hire mercenaries. Raise new units in an explored cell outside other sides' home regions that holds no units but yours and no fortifications but yours, up to twice the cell's production in unit cost each turn, or rehire a Neutral unit you can see. Hired units arrive at the end of the turn and take orders the next turn. A raise costs one turn of upkeep and a rehire costs two. That fee is taken when the order is placed, returned when the order is removed, and returned for any count the end of the turn does not fill. After that each mercenary costs its upkeep every turn: ${upkeepList()} credits per turn. The Advanced figure applies when tech bonuses are on. Credits produced this turn arrive before upkeep is paid. If your treasury cannot pay, random mercenaries desert to Neutral. A rehired unit that shares its cell with other sides' units, Neutral included, fights them at the next resolution, and so does a deserter that shares a cell with your units. Mercenaries do not count toward unit caps.`;
}

/**
 * Upkeep only, for a seat that cannot produce.
 *
 * Purpose: That seat still pays mercenaries and is not taught how to hire.
 * When to use: The Mercenaries section when production tools are off and the seat has mercenaries.
 * Expected outcome: One paragraph without raise or rehire instructions.
 * Exceptions: None.
 */
export function buildMercenaryUpkeepRule(): string {
  return `Your mercenaries cost upkeep every turn: ${upkeepList()} credits per turn. The Advanced figure applies when tech bonuses are on. Credits produced this turn arrive before upkeep is paid. If your treasury cannot pay, random mercenaries desert to Neutral. A deserter that shares a cell with your units fights them at the next resolution.`;
}

/**
 * The treasury line in the Mercenaries section.
 *
 * Purpose: The model sees the same figures the top bar shows its seat.
 * When to use: After the rule, when the snapshot has an economy.
 * Expected outcome: Credits, upkeep, the mercenary count, and the hire amount already taken from the treasury.
 * Exceptions: None.
 */
export function formatMercenaryFundsLine(funds: MercenaryFunds): string {
  const word = funds.mercenaryCount === 1 ? 'mercenary' : 'mercenaries';
  return `Treasury: ${funds.credits} credits. Mercenary upkeep: ${funds.upkeepPerTurn} credits per turn for ${funds.mercenaryCount} ${word}. Hire orders already taken from the treasury this turn: ${funds.pendingHireFees} credits.`;
}

/**
 * Basic and Advanced upkeep for each hireable type.
 *
 * Purpose: The rule must not double the basic figure and call it Advanced. Rounding happens after the multiplier.
 * When to use: Both mercenary rule paragraphs.
 * Expected outcome: `infantry 3 (Advanced 5), armor 5 (10), naval 13 (25), air 8 (15)` on every map.
 * Exceptions: None.
 */
function upkeepList(): string {
  return HIREABLE_UNIT_TYPES.map((unitType) => {
    const basic = mercenaryUpkeepFor(unitType, undefined);
    const advanced = mercenaryUpkeepFor(unitType, 'advanced');
    return unitType === 'infantry' ? `${unitType} ${basic} (Advanced ${advanced})` : `${unitType} ${basic} (${advanced})`;
  }).join(', ');
}
