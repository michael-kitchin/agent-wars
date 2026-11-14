/**
 * System-prompt explanation of sea and air operations.
 *
 * Purpose: The cached system prompt teaches what an operation is, so the situation message only lists the live ones.
 * When to use: Strategic context coaching when standing orders are on and the consult is not a battle.
 * Expected outcome: An H2 Operations section. Battle prompts never include it.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';
import { OPERATION_MENU_SIZE } from '../../operations/operationRules';
import { SECTION_TITLE_OPERATION_RULES, subHeading } from './sectionHeadings';

/**
 * Writes the operation rules for the system prompt.
 *
 * Purpose: The model needs to leave an operation alone, and to know that its own standing order takes a unit out.
 * When to use: After the campaign block when `operationsEnabled` is true, and after the context block when the campaign block is absent.
 * Expected outcome: The heading, the operation paragraph, the land paragraph when `campaignEnabled` is true, the command paragraph when `commandsEnabled` is true, then the two paragraphs about leaving an operation alone.
 * Exceptions: None.
 */
export function buildOperationRuleBlock(commandsEnabled: boolean, campaignEnabled = false): string {
  logTrace('promptSpec buildOperationRuleBlock', { commandsEnabled, campaignEnabled });
  const paragraphs = [
    'The engine runs operations: several turns of orders that carry ground units to an enemy city by sea or by air. By sea, it musters units and ships at a port, loads them, sails to a landing beside the city, unloads, and marches onto it. By air, it marches one infantry unit to an air unit\'s airport, loads it, ferries to an airport in range when it must, and drops it onto a city that holds no enemy unit. The Active Operations section of the briefing lists each one and how far it has got.',
    'Units and ships in an operation already have their orders. Leave them alone and they carry on, including on turns you are not consulted. To take a unit or a ship out of an operation, give it any standing order of your own; it keeps that order and the operation goes on without it. A standing order on a loaded ship takes that ship and the units aboard it out together. The operation does not unload those units. An air unit in an operation does not strike; cancel the operation to get it back.',
    'A unit aboard a ship takes no order. An explicit_move or a disembark unloads it where the ship is.',
  ];
  if (campaignEnabled) {
    paragraphs.splice(1, 0, 'Your land campaign is listed there too, as "campaign". It is described under Campaign. Operation Options may list land rows: other cities the campaign could turn to. Launching one gives the campaign that target.');
  }
  if (commandsEnabled) {
    paragraphs.splice(campaignEnabled ? 2 : 1, 0, `When you have room for another operation, Operation Options lists up to ${OPERATION_MENU_SIZE} you could launch, with what each would gain, what it would tie up, and what stands in its way. Launch one with "operations": [{"action":"launch","option":"<letter>"}]. You may also name a city that is not listed, with "objective" and "method" in place of "option". The engine launches the first undefended sea or air row on the turn after that row was offered. It never launches a land row, and it never launches a defended row. Call an operation off with {"action":"cancel","id":"<operation id>"}: one that is still mustering frees its units, and one at sea turns back.`);
  }
  return `${subHeading(SECTION_TITLE_OPERATION_RULES)}\n\n${paragraphs.join('\n\n')}`;
}
