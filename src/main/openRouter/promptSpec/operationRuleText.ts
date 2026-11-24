/**
 * System-prompt explanation of sea and air operations.
 *
 * Purpose: The cached system prompt teaches what an operation is, so the situation message only lists the live ones.
 * When to use: Strategic context coaching when standing orders are on and the consult is not a battle.
 * Expected outcome: An H2 Operations section. Battle prompts never include it.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';
import {
  OPERATION_MENU_SIZE,
  OPERATION_MUSTER_TIMEOUT_TURNS,
  SEA_RAID_TIMEOUT_MIN_SHARE,
} from '../../operations/operationRules';
import { AIRLIFT_INFANTRY_CAPACITY } from '../../../shared/carrierCargoRules';
import { CAMPAIGN_LIFT_CANCEL_COOLDOWN_TURNS } from '../campaignSeaConstants';
import { SECTION_TITLE_OPERATION_RULES, subHeading } from './sectionHeadings';

/**
 * The paragraph that explains a campaign lift among the operations.
 *
 * Purpose: A campaign lift appears in the operations list, and the model should know it has its own slot, should be left alone, and that a cancel holds off the next lift for `CAMPAIGN_LIFT_CANCEL_COOLDOWN_TURNS` turns.
 * When to use: As the last paragraph of the operation rules, when the campaign is on.
 * Expected outcome: One paragraph of plain text.
 * Exceptions: None.
 */
const CAMPAIGN_LIFT_PARAGRAPH =
  `A campaign lift is the campaign's own sea operation. It is listed with your operations and can be cancelled like one, but it uses a slot of its own and does not count against your sea operations. Give its units and ships no orders unless you mean to take them out. After you cancel one, the engine launches no new campaign lift for ${CAMPAIGN_LIFT_CANCEL_COOLDOWN_TURNS} turns.`;

/**
 * Writes the operation rules for the system prompt.
 *
 * Purpose: The model needs to leave an operation alone, and to know that a standing order takes out a unit that is not aboard, or a ship.
 * When to use: After the campaign block when `operationsEnabled` is true, and after the context block when the campaign block is absent.
 * Expected outcome: The heading, then one paragraph per idea: what an operation is, the sea steps, the air steps, where the briefing lists them, the land paragraph when `campaignEnabled` is true, the menu, the launch, the engine's own launch, and the cancel when `commandsEnabled` is true, then the paragraph about leaving an operation alone, including that an order on a unit aboard is refused, and the paragraph that, outside an operation, a standing order does not move a unit while it is aboard a ship. When `campaignEnabled` is true, the paragraph on the campaign lift comes last.
 * Exceptions: None.
 */
export function buildOperationRuleBlock(commandsEnabled: boolean, campaignEnabled = false): string {
  logTrace('promptSpec buildOperationRuleBlock', { commandsEnabled, campaignEnabled });
  const paragraphs = [
    'The engine runs operations: several turns of orders that carry ground units to an enemy city by sea or by air.',
    `By sea, it musters units and ships at a port, loads them, sails to a landing beside the city, unloads, and marches onto it. If the force has not gathered after ${OPERATION_MUSTER_TIMEOUT_TURNS} turns, it sails only when the ships at the port can carry at least ${Math.round(SEA_RAID_TIMEOUT_MIN_SHARE * 100)}% of its ground units, and is called off otherwise, so keep its ships with it. A campaign lift needs only its own minimum.`,
    `By air, it marches up to ${AIRLIFT_INFANTRY_CAPACITY} infantry units to an air unit's airport, loads them, ferries to an airport in range when it must, and drops them onto a city that holds no enemy unit.`,
    'The Active Operations section of the briefing lists each one and how far it has got.',
    'Units and ships in an operation already have their orders. Leave them alone and they carry on, including on turns you are not consulted. To take out a unit that is not aboard, or a ship, give it any standing order of your own; it keeps that order and the operation goes on without it. A unit aboard one of an operation\'s ships or air units takes no order of its own: the engine refuses it and says so next turn. A standing order on a loaded ship takes that ship and the units aboard it out together. The operation does not unload those units. An air unit in an operation does not strike; cancel the operation to get it back.',
    'Outside an operation, a standing order does not move a unit while it is aboard a ship. An explicit_move or a disembark unloads it where the ship is.',
  ];
  if (campaignEnabled) {
    paragraphs.splice(4, 0, 'Your land campaign is listed there too, as "campaign". It is described under Campaign. Operation Options may list land rows: other cities the campaign could turn to. Launching one gives the campaign that target.');
  }
  if (campaignEnabled) {
    paragraphs.push(CAMPAIGN_LIFT_PARAGRAPH);
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
