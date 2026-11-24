/**
 * Sentences that tell a commander how credits, building, and mercenaries work.
 *
 * Purpose: The production block and the Mercenaries section share one wording, read from the engine.
 * When to use: Those sections, and the envelope sentence that names hire rows.
 * Expected outcome: The same upkeep numbers on every map, because they come from the global reference cost.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';
import { CREDITS_PER_ITEM } from '../../../shared/creditsRules';
import { creditsItemCost } from '../../../shared/gameRules';
import type { MercenaryFunds } from '../../../shared/ipc/mercenaryTypes';
import {
  HIREABLE_UNIT_TYPES,
  mercenaryUpkeepFor,
} from '../../../shared/mercenaryRules';
import { SECTION_TITLE_MERCENARIES } from './sectionHeadings';

/** Column heading for whether a hex is still building. */
export const BUILD_STATUS_COLUMN_HEADER = 'Building';

/** How many rehire or raise rows a briefing shows. */
export const MERCENARY_BRIEFING_MAX_ROWS = 10;

/**
 * Warning when the treasury and this turn's credits income cannot pay mercenary upkeep.
 *
 * Purpose: Tells the commander desertion follows unless more credits come in.
 * When to use: Its own paragraph in the Mercenaries section, when the forecast's cover turns are 0.
 * Expected outcome: One sentence. Seats that can queue production add `MERCENARY_FUNDS_WARNING_ACTION`.
 * Exceptions: None.
 */
export const MERCENARY_FUNDS_WARNING =
  'Warning: unless more credits come in this turn, random mercenaries desert to Neutral at the end of it.';

/**
 * What a seat can do about the funds warning.
 *
 * Purpose: Names the two levers a commander still has, credits queues and hiring.
 * When to use: After `MERCENARY_FUNDS_WARNING`, for a seat with production on.
 * Expected outcome: One sentence.
 * Exceptions: None.
 */
export const MERCENARY_FUNDS_WARNING_ACTION =
  'Queue more credits, and do not raise or rehire mercenaries this turn. Firing a mercenary you can spare also stops its upkeep.';

/** Shown when the seat can see no Neutral unit it may rehire. */
export const NO_REHIRE_CANDIDATES_LINE = 'No Neutral unit you can see can be rehired.';

/** Shown when no explored hex can raise a unit. */
export const NO_RAISE_OPTIONS_LINE = 'No explored cell can raise mercenaries for you now.';

/** Reminds the model that a rehired unit keeps its old id prefix. */
export const MERCENARY_ID_PREFIX_NOTE =
  'A rehired unit keeps the id prefix of the side that first created it. Who owns a unit comes from your roster and the enemy lists, not from its prefix.';

/** Envelope rows that hire, appended when production orders are available. */
export const MERCENARY_ENVELOPE_ROWS_SENTENCE =
  'To hire, add {"action":"raise_mercenaries","hex":"<code>","unitType":"infantry","count":1} or {"action":"rehire_mercenary","unitId":"<id>"} rows to productionOrders. To fire a mercenary, add {"action":"dismiss_mercenary","unitId":"<id>"}.';

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
 * Advice to give a credits row a larger count, unless the treasury is deep.
 *
 * Purpose: A credits row stops when its count runs out, so a count of 1 pays once. The advice is static text, so the Mercenaries section switches it off by saying the credits are more than needed.
 * When to use: The production coaching bullet, built with the active map's item cost.
 * Expected outcome: One line naming what a credits row adds, why to give it a larger count, and the "unless the Mercenaries section says your credits are more than you need" clause. It reads only constants.
 * Exceptions: None.
 */
export function buildCreditsCountGuidance(): string {
  const cost = creditsItemCost();
  return `A credits row adds ${CREDITS_PER_ITEM} credits for each ${cost} production points it spends, and it stops when its count runs out. For steady income, give it a larger count, unless the ${SECTION_TITLE_MERCENARIES} section says your credits are more than you need. A city makes one production point per city cell each turn, so a count of 10 in a city with ${cost} city cells lasts about 10 turns.`;
}

/**
 * Where a queue is allowed to spend.
 *
 * Purpose: The second paragraph says a paused queue loses its points, and names the fix.
 * When to use: The production block, after the income rule.
 * Expected outcome: Two paragraphs separated by a blank line, not one sentence.
 * Exceptions: None.
 */
export function buildBuildabilityRule(): string {
  logTrace('promptSpec buildBuildabilityRule', {});
  return [
    'You can build only in your home region and in cells that hold one of your units or fortifications at the end of the turn.',
    'Elsewhere a queue pauses, and its points are lost at the end of each turn until you end a turn with a unit there or raise a mercenary there.',
  ].join('\n\n');
}

/**
 * The full mercenary rule, including how to hire.
 *
 * Purpose: A seat that can produce is also told how hiring works.
 * When to use: The cached `## Mercenaries` rules subsection when production tools are on.
 * Expected outcome: Five paragraphs. The first ends at the rehire sentence, the second at the unfilled-count sentence, and the third is upkeep through unit caps. The fourth says how to fire a mercenary and what it does, and the fifth says what a fired unit does to a cell and to the knockout rule. Upkeep lists the basic and Advanced figures.
 * Exceptions: None.
 */
export function buildMercenaryRule(): string {
  return [
    'Credits hire mercenaries. Raise new units in an explored cell outside other sides\' home regions that holds no units but yours and no fortifications but yours, up to twice the cell\'s production in unit cost each turn, or rehire a Neutral unit you can see.',
    'Hired units arrive at the end of the turn and take orders the next turn. A raise costs one turn of upkeep and a rehire costs two. That fee is taken when the order is placed, returned when the order is removed, and returned for any count the end of the turn does not fill.',
    `After that each mercenary costs its upkeep every turn: ${upkeepList()} credits per turn. The Advanced figure applies when tech bonuses are on. Credits produced this turn arrive before upkeep is paid. If your treasury cannot pay, random mercenaries desert to Neutral. A rehired unit that shares its cell with other sides' units, Neutral included, fights them at the next resolution, and so does a deserter that shares a cell with your units. Mercenaries do not count toward unit caps.`,
    'To fire a mercenary, add a dismiss_mercenary row to productionOrders. It turns Neutral at once, in its cell, with a defend order. Its upkeep stops, and any order you gave it this turn is dropped. You cannot fire a mercenary aboard a ship, or a ship with units aboard. While you can see a fired unit, you can rehire it for two turns of its upkeep.',
    'A fired unit left alone in a cell takes the cell for Neutral at the end of the turn unless the cell is fortified. One that shares a cell with your units fights them at the next resolution. Neutral-held home hexes count toward your knockout, and a city Neutral takes no longer counts as yours. A fire that would knock you out is refused. When a Firing Risk table appears under Mercenaries in your briefing, it names the home hexes where firing is dangerous.',
  ].join('\n\n');
}

/**
 * Upkeep only, for a seat that cannot produce.
 *
 * Purpose: That seat still pays mercenaries and is not taught how to hire.
 * When to use: The cached `## Mercenaries` rules subsection when production tools are off and the seat has mercenaries.
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
 * When to use: The situation Mercenaries section, when the snapshot has an economy. The hire and upkeep rules are the cached subsection, not this line.
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
