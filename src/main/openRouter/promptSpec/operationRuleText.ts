/**
 * System-prompt explanation of sea operations.
 *
 * Purpose: The cached system prompt teaches what an operation is, so the situation message only lists the live ones.
 * When to use: Strategic context coaching when standing orders are on and the consult is not a battle.
 * Expected outcome: An H2 Operations section. Battle prompts never include it.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';
import { SECTION_TITLE_OPERATION_RULES, subHeading } from './sectionHeadings';

/**
 * Writes the operation rules for the system prompt.
 *
 * Purpose: The model needs to leave an operation alone, and to know that its own standing order takes a unit out.
 * When to use: After the campaign block when `operationsEnabled` is true, and after the context block when the campaign block is absent.
 * Expected outcome: The heading plus the three paragraphs below.
 * Exceptions: None.
 */
export function buildOperationRuleBlock(): string {
  logTrace('promptSpec buildOperationRuleBlock');
  const paragraphs = [
    'The engine runs operations: several turns of orders that carry ground units to an enemy city by sea. It musters the units and ships at a port, loads them, sails to a landing beside the city, unloads, and marches onto it. The Active Operations section of the briefing lists each one and how far it has got.',
    'Units and ships in an operation already have their orders. Leave them alone and they carry on, including on turns you are not consulted. To take a unit or a ship out of an operation, give it any standing order of your own; it keeps that order and the operation goes on without it. A standing order on a loaded ship takes that ship and the units aboard it out together. The operation does not unload those units.',
    'A unit aboard a ship takes no order. An explicit_move or a disembark unloads it where the ship is.',
  ];
  return `${subHeading(SECTION_TITLE_OPERATION_RULES)}\n\n${paragraphs.join('\n\n')}`;
}
