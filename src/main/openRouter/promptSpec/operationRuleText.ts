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
 * Purpose: The model needs to leave an operation alone, and to know that a standing order takes out a unit that is not aboard, or a ship.
 * When to use: After the campaign block when `operationsEnabled` is true, and after the context block when the campaign block is absent.
 * Expected outcome: The heading, then one paragraph per idea: what an operation is, the sea steps, the air steps, where the briefing lists them, the land paragraph when `campaignEnabled` is true, the menu, the launch, the engine's own launch, and the cancel when `commandsEnabled` is true, then the paragraph about leaving an operation alone, including that an order on a unit aboard is refused, and the paragraph that a unit aboard a ship outside an operation takes no standing order.
 * Exceptions: None.
 */
export function buildOperationRuleBlock(commandsEnabled: boolean, campaignEnabled = false): string {
  logTrace('promptSpec buildOperationRuleBlock', { commandsEnabled, campaignEnabled });
  const paragraphs = [
    'The engine runs operations: several turns of orders that carry ground units to an enemy city by sea or by air.',
    'By sea, it musters units and ships at a port, loads them, sails to a landing beside the city, unloads, and marches onto it.',
    'By air, it marches one infantry unit to an air unit\'s airport, loads it, ferries to an airport in range when it must, and drops it onto a city that holds no enemy unit.',
    'The Active Operations section of the briefing lists each one and how far it has got.',
    'Units and ships in an operation already have their orders. Leave them alone and they carry on, including on turns you are not consulted. To take out a unit that is not aboard, or a ship, give it any standing order of your own; it keeps that order and the operation goes on without it. A unit aboard one of an operation\'s ships or air units takes no order of its own: the engine refuses it and says so next turn. A standing order on a loaded ship takes that ship and the units aboard it out together. The operation does not unload those units. An air unit in an operation does not strike; cancel the operation to get it back.',
    'Outside an operation, a unit aboard a ship takes no standing order. An explicit_move or a disembark unloads it where the ship is.',
  ];
  if (campaignEnabled) {
    paragraphs.splice(4, 0, 'Your land campaign is listed there too, as "campaign". It is described under Campaign. Operation Options may list land rows: other cities the campaign could turn to. Launching one gives the campaign that target.');
  }
  if (commandsEnabled) {
    const commandParagraphs = [
      `Operation Options lists up to ${OPERATION_MENU_SIZE} operations you could launch, with what each would gain, what it would tie up, and what stands in its way. A sea or air row is listed only while you have room for another operation by that method.`,
      'Launch one with "operations": [{"action":"launch","option":"<letter>"}]. You may also name a city that is not listed, with "objective" and "method" in place of "option".',
      'On the turn after a sea or air row was offered, the engine launches the first one it counts as clear: an undefended row, or a lightly held one when your posture allows it. It never launches a land row.',
      'Call an operation off with {"action":"cancel","id":"<operation id>"}: one that is still mustering frees its units, and one at sea turns back.',
    ];
    paragraphs.splice(campaignEnabled ? 5 : 4, 0, ...commandParagraphs);
  }
  return `${subHeading(SECTION_TITLE_OPERATION_RULES)}\n\n${paragraphs.join('\n\n')}`;
}
