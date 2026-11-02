/**
 * Production rows the commander must put in the final JSON envelope.
 *
 * Purpose: The opening message only points at the Production attention flag. This clause still states the required write.
 * When to use: `buildSystemPromptForTools` when production tools are on.
 * Expected outcome: An empty string when production is off. Otherwise three paragraphs: the required form, the first cap sentence, and the replacement sentence.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';
import { PRODUCTION_CAP_QUEUE_GUIDANCE } from '../../productionCaps';
import { ALL_BUILD_QUEUE_ITEM_TYPES } from '../../productionRules';
import { MERCENARY_ENVELOPE_ROWS_SENTENCE } from './gameRuleMercenaryText';

/**
 * Condition under which the submit clause requires at least one `set_build_queue`.
 *
 * Purpose: Empty queues were the only mandated write, so cells queued with a capped type never became a required work item.
 * When to use: `buildProductionSubmitClause` when production tools are enabled.
 * Expected outcome: One sentence fragment covering empty queues and replaceable blocked-at-cap queues.
 * Exceptions: None. One replacement this turn is enough; every blocked hex need not be listed.
 */
const PRODUCTION_REQUIREMENT_BASE =
  'when at least one controlled hex has availableUnitTypes and an empty queue, or a queue blocked at cap while another type can still be built';

/**
 * Production rows for the final JSON contract.
 *
 * Purpose: Tells the model the exact `set_build_queue` shape, when a row is required, and that a row replaces the hex queue.
 * When to use: The response-format section when production tools are enabled.
 * Expected outcome: Empty when production is off. Otherwise the requirement paragraph, the first cap sentence, and the replacement paragraph, separated by blank lines. The argument is only `productionEnabled`, so this file does not import the full tool-flag set.
 * Exceptions: None.
 */
export function buildProductionSubmitClause(flags: { readonly productionEnabled: boolean }): string {
  logTrace('productionSubmitText buildProductionSubmitClause', { productionEnabled: flags.productionEnabled });
  if (!flags.productionEnabled) return '';
  const capBreak = '. A hex whose available types';
  const capAt = PRODUCTION_CAP_QUEUE_GUIDANCE.indexOf(capBreak);
  const capFirst = capAt < 0 ? PRODUCTION_CAP_QUEUE_GUIDANCE : PRODUCTION_CAP_QUEUE_GUIDANCE.slice(0, capAt + 1);
  const capSecond = capAt < 0 ? '' : PRODUCTION_CAP_QUEUE_GUIDANCE.slice(capAt + 2);
  const replacement = capSecond.length > 0
    ? `${capSecond} Each set_build_queue item fully replaces the chosen hex queue with one unit type/count. ${MERCENARY_ENVELOPE_ROWS_SENTENCE}`
    : `Each set_build_queue item fully replaces the chosen hex queue with one unit type/count. ${MERCENARY_ENVELOPE_ROWS_SENTENCE}`;
  return [
    `"productionOrders" entries MUST include "action" on every item. Required forms: {"action":"set_build_queue","hex":"<two-char code>","unitType":"${ALL_BUILD_QUEUE_ITEM_TYPES.join('|')}","count":1..99}. Any productionOrders item missing "action" or required fields is dropped. ${PRODUCTION_REQUIREMENT_BASE}, include at least one set_build_queue this turn.`,
    capFirst,
    replacement,
  ].join('\n\n');
}
