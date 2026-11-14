/**
 * The Active Operations section of a strategic briefing.
 *
 * Purpose: The commander sees each sea operation and how far it has got, without reading the stored row.
 * When to use: When standing orders are on and the consult is not a battle.
 * Expected outcome: An H1 section, or an empty string when the seat has no operation.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from '../gameDb';
import { logTrace } from '../logger';
import type { Operation } from '../../shared/operationTypes';
import { SECTION_TITLE_OPERATIONS, topLevelHeading } from './promptSpec/sectionHeadings';

/**
 * The noun for a count, singular at one.
 *
 * Purpose: The briefing says "1 ship" and "2 ships" from the same phrase.
 * When to use: Urban cells, ground units, and ships.
 * Expected outcome: The singular word when `count` is 1, otherwise that word with an s.
 * Exceptions: None. The singular must already be the full phrase, such as `city cell`.
 */
function noun(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

/**
 * Ground units and ships of one operation that currently stand on a hex.
 *
 * Purpose: The muster bullet names how much of the force has arrived.
 * When to use: The muster line only.
 * Expected outcome: How many of the operation's ground units are on the hex, and how many of its ships are.
 * Exceptions: None.
 */
function arrived(state: GameStateSnapshot, operation: Operation, hex: string): { readonly ground: number; readonly ships: number } {
  const units = new Set(operation.unitIds);
  const ships = new Set(operation.carrierIds);
  let ground = 0;
  let shipCount = 0;
  for (const unit of state.units) {
    if (unit.h3Index !== hex) continue;
    if (units.has(unit.id)) ground += 1;
    if (ships.has(unit.id)) shipCount += 1;
  }
  return { ground, ships: shipCount };
}

/**
 * Ground units of one operation that are still aboard one of its ships.
 *
 * Purpose: The transit bullet names the cargo still at sea.
 * When to use: The transit line only.
 * Expected outcome: A count of operation units whose carrier is one of the operation's ships.
 * Exceptions: None.
 */
function cargoAboard(state: GameStateSnapshot, operation: Operation): number {
  const units = new Set(operation.unitIds);
  const ships = new Set(operation.carrierIds);
  return state.units.filter((unit) => {
    const carrierId = unit.embarkedOnCarrierUnitId;
    return units.has(unit.id) && typeof carrierId === 'string' && ships.has(carrierId);
  }).length;
}

/**
 * One bullet for a stored operation.
 *
 * Purpose: Each stage has its own sentence, and every hex goes through the briefing's formatter.
 * When to use: Once per operation, after the operations have been sorted.
 * Expected outcome: A markdown list line. Counts of one use the singular noun.
 * Exceptions: None.
 */
function operationBullet(state: GameStateSnapshot, operation: Operation, format: (h3Index: string) => string): string {
  const objective = format(operation.objectiveH3);
  const muster = format(operation.musterH3);
  const urban = (state.strategicInfrastructure ?? []).find((row) => row.h3Index === operation.objectiveH3)?.urbanHexCount ?? 0;
  const city = `an enemy city with ${urban} ${noun(urban, 'city cell')}`;
  const units = operation.unitIds.join(', ');
  const ships = operation.carrierIds.join(', ');
  if (operation.phase === 'muster') {
    const atPort = arrived(state, operation, operation.musterH3);
    return `- ${operation.id}: by sea to ${objective}, ${city}. Mustering at ${muster}: ${atPort.ground} of ${operation.unitIds.length} ${noun(operation.unitIds.length, 'ground unit')} and ${atPort.ships} of ${operation.carrierIds.length} ${noun(operation.carrierIds.length, 'ship')} are there. Units: ${units}. Ships: ${ships}.`;
  }
  if (operation.phase === 'transit') {
    const landing = operation.landingH3 === null ? 'an unknown landing' : format(operation.landingH3);
    const cargo = cargoAboard(state, operation);
    return `- ${operation.id}: by sea to ${objective}, ${city}. At sea, heading for ${landing}, with ${cargo} ${noun(cargo, 'ground unit')} aboard. Ships: ${ships}.`;
  }
  if (operation.phase === 'assault') {
    return `- ${operation.id}: by sea to ${objective}, ${city}. Landed. ${operation.unitIds.length} ${noun(operation.unitIds.length, 'ground unit')} are marching on it: ${units}.`;
  }
  return `- ${operation.id}: turned back from ${objective}. Returning to ${muster}. Ships: ${ships}.`;
}

/**
 * Writes the Active Operations section.
 *
 * Purpose: The briefing and the no-briefing situation message share one wording.
 * When to use: When `ordersEnabled` is true and the mode is not tactical. Pass the seat's stored operations.
 * Expected outcome: An empty string when there are no operations. Otherwise the H1 heading, a blank line, and one bullet per operation in id order.
 * Exceptions: None.
 */
export function buildOperationsSection(args: {
  readonly state: GameStateSnapshot;
  readonly operations: readonly Operation[];
  readonly format: (h3Index: string) => string;
}): string {
  logTrace('briefingSectionsOperations buildOperationsSection', { operationCount: args.operations.length });
  if (args.operations.length === 0) return '';
  const ordered = [...args.operations].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const bullets = ordered.map((operation) => operationBullet(args.state, operation, args.format));
  return `${topLevelHeading(SECTION_TITLE_OPERATIONS)}\n\n${bullets.join('\n')}`;
}
