/**
 * The Active Operations section of a strategic briefing.
 *
 * Purpose: The commander sees each operation and how far it has got, without reading the stored row.
 * When to use: When standing orders are on and the consult is not a battle.
 * Expected outcome: An H1 section, or an empty string when the seat has no operation.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from '../gameDb';
import { logTrace } from '../logger';
import { buildPromptTableLines } from '../promptTableHelpers';
import type { Operation, OperationCandidate } from '../../shared/operationTypes';
import { LIFT_OBJECTIVE_CLEAR_RADIUS } from '../operations/liftRules';
import { OPERATION_OPTION_LETTERS } from '../operations/operationRules';
import { SECTION_TITLE_OPERATION_OPTIONS, SECTION_TITLE_OPERATIONS, subHeading, topLevelHeading } from './promptSpec/sectionHeadings';

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
 * One bullet for a stored air operation.
 *
 * Purpose: An air operation has no ships at sea, so its sentence names the infantry and the air unit.
 * When to use: When `operation.method` is `air`.
 * Expected outcome: A markdown list line. Transit says the air unit drops this turn when it is already on the launch airport, and otherwise that it ferries there.
 * Exceptions: None.
 */
function airOperationBullet(state: GameStateSnapshot, operation: Operation, format: (h3Index: string) => string): string {
  const objective = format(operation.objectiveH3);
  const muster = format(operation.musterH3);
  const urban = (state.strategicInfrastructure ?? []).find((row) => row.h3Index === operation.objectiveH3)?.urbanHexCount ?? 0;
  const city = `an enemy city with ${urban} ${noun(urban, 'city cell')}`;
  const infantry = operation.unitIds[0] ?? '';
  const carrierId = operation.carrierIds[0] ?? '';
  if (operation.phase === 'muster') {
    return `- ${operation.id}: by air to ${objective}, ${city}. ${infantry} is marching to ${muster} to board ${carrierId}.`;
  }
  if (operation.phase === 'transit') {
    const carrier = state.units.find((unit) => unit.id === carrierId);
    const landing = operation.landingH3 === null ? 'an unknown landing' : format(operation.landingH3);
    const onLanding = carrier !== undefined && operation.landingH3 !== null && carrier.h3Index === operation.landingH3;
    const step = onLanding ? 'drops it this turn' : `ferries to ${landing} this turn`;
    return `- ${operation.id}: by air to ${objective}, ${city}. ${infantry} is aboard ${carrierId}, which ${step}.`;
  }
  if (operation.phase === 'assault') {
    return `- ${operation.id}: by air to ${objective}. ${infantry} has landed and holds it until control passes to you.`;
  }
  return `- ${operation.id}: by air, turned back from ${objective}.`;
}

/**
 * One bullet for a stored operation.
 *
 * Purpose: Each stage has its own sentence, and every hex goes through the briefing's formatter.
 * When to use: Once per operation, after the operations have been sorted.
 * Expected outcome: A markdown list line. An air operation uses the air sentences. Counts of one use the singular noun.
 * Exceptions: None.
 */
function operationBullet(state: GameStateSnapshot, operation: Operation, format: (h3Index: string) => string): string {
  if (operation.method === 'air') return airOperationBullet(state, operation, format);
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
 * A count out of the seat's total, singular only when both are one.
 *
 * Purpose: The cost column says "1 ground unit" or "1 of 4 ground units" from the same numbers.
 * When to use: Ground units and ships in an option row.
 * Expected outcome: `1 ${singular}` when both counts are 1. Otherwise `${count} of ${total}` plus the noun for the total.
 * Exceptions: None.
 */
function ofTotal(count: number, total: number, singular: string): string {
  if (count === 1 && total === 1) return `1 ${singular}`;
  return `${count} of ${total} ${noun(total, singular)}`;
}

/**
 * The plan and cost cells of one air option.
 *
 * Purpose: An air row names one infantry unit and one air unit, and says whether that air unit must ferry first.
 * When to use: When `candidate.method` is `air`.
 * Expected outcome: The plan says the air unit carries the infantry when the launch airport is the muster hex, and otherwise that it ferries to the launch airport. The cost counts one air unit out of the seat's air units.
 * Exceptions: None.
 */
function airPlanAndCost(args: {
  readonly candidate: OperationCandidate;
  readonly groundTotal: number;
  readonly airTotal: number;
  readonly format: (h3Index: string) => string;
}): { readonly plan: string; readonly cost: string } {
  const { candidate, groundTotal, airTotal, format } = args;
  const carrier = candidate.carrierIds[0] ?? '';
  const carries = candidate.landingH3 === candidate.musterH3
    ? 'carries it'
    : `ferries it to ${format(candidate.landingH3)}`;
  const plan = `1 infantry unit musters at ${format(candidate.musterH3)}; ${carrier} ${carries}; drops on ${format(candidate.objectiveH3)}`;
  const cost = `${ofTotal(candidate.unitIds.length, groundTotal, 'ground unit')}, ${ofTotal(candidate.carrierIds.length, airTotal, 'air unit')}, about ${candidate.etaTurns} ${noun(candidate.etaTurns, 'turn')}`;
  return { plan, cost };
}

/**
 * One Operation Options row.
 *
 * Purpose: The letter, the route, and the three numbers come from the candidate the engine would launch.
 * When to use: Once per candidate that has a letter.
 * Expected outcome: Seven cells. A sea row keeps its sail sentence. An air row names the air unit. A count of 1 uses the singular noun.
 * Exceptions: None.
 */
function optionRow(args: {
  readonly candidate: OperationCandidate;
  readonly letter: string;
  readonly groundTotal: number;
  readonly navalTotal: number;
  readonly airTotal: number;
  readonly format: (h3Index: string) => string;
}): string[] {
  const { candidate, letter, groundTotal, navalTotal, airTotal, format } = args;
  const units = candidate.unitIds.length;
  const ships = candidate.carrierIds.length;
  const air = candidate.method === 'air'
    ? airPlanAndCost({ candidate, groundTotal, airTotal, format })
    : null;
  const plan = air?.plan ?? `${units} ${noun(units, 'ground unit')} muster at ${format(candidate.musterH3)}; ${ships} ${noun(ships, 'ship')} sail to ${format(candidate.landingH3)}; assault ${format(candidate.objectiveH3)}`;
  const impact = `${candidate.urbanHexCount} ${noun(candidate.urbanHexCount, 'city cell')}${candidate.inEnemyHome ? ', in an enemy home region' : ''}`;
  const cost = air?.cost ?? `${ofTotal(units, groundTotal, 'ground unit')}, ${ofTotal(ships, navalTotal, 'ship')}, about ${candidate.etaTurns} ${noun(candidate.etaTurns, 'turn')}`;
  const risk = `${candidate.defenders} ${noun(candidate.defenders, 'enemy unit')} within ${LIFT_OBJECTIVE_CLEAR_RADIUS} hexes; ${candidate.reinforcers} more can reach it in ${candidate.etaTurns} ${noun(candidate.etaTurns, 'turn')}`;
  const fortified = candidate.knownFortifiedCount > 0
    ? `; ${candidate.knownFortifiedCount} ${noun(candidate.knownFortifiedCount, 'fortified cell')}`
    : '';
  return [letter, format(candidate.objectiveH3), candidate.method, plan, impact, cost, `${risk}${fortified}`];
}

/**
 * Writes the Operation Options table.
 *
 * Purpose: The commander sees a short list of landings, each with what it gains, what it ties up, and what stands in the way.
 * When to use: When the seat has a free slot and at least one candidate. Pass the same array the reply will launch from.
 * Expected outcome: An empty string when there is no candidate. Otherwise an H2, a blank line, and a table of at most `OPERATION_OPTION_LETTERS` rows.
 * Exceptions: None.
 */
export function buildOperationOptionsSection(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly candidates: readonly OperationCandidate[];
  readonly format: (h3Index: string) => string;
}): string {
  const listed = args.candidates.slice(0, OPERATION_OPTION_LETTERS.length);
  logTrace('briefingSectionsOperations buildOperationOptionsSection', { seatId: args.seatId, candidateCount: listed.length });
  if (listed.length === 0) return '';
  const own = args.state.units.filter((unit) => unit.player === args.seatId);
  const groundTotal = own.filter((unit) => unit.unitType === 'infantry' || unit.unitType === 'armor').length;
  const navalTotal = own.filter((unit) => unit.unitType === 'naval').length;
  const airTotal = own.filter((unit) => unit.unitType === 'air').length;
  const rows = listed.map((candidate, index) => optionRow({
    candidate,
    letter: OPERATION_OPTION_LETTERS[index] ?? '',
    groundTotal,
    navalTotal,
    airTotal,
    format: args.format,
  }));
  return `${subHeading(SECTION_TITLE_OPERATION_OPTIONS)}\n\n${buildPromptTableLines(['Option', 'Objective', 'Method', 'Plan', 'Impact', 'Cost', 'Risk'], rows).join('\n')}`;
}

/**
 * Writes the Active Operations section.
 *
 * Purpose: The briefing and the no-briefing situation message share one wording.
 * When to use: When `ordersEnabled` is true and the mode is not tactical. Pass the seat's stored operations and, when a menu was built, its table.
 * Expected outcome: An empty string when there is no operation, no options, and no note. Otherwise the H1 heading, the previous turn's note when it is non-empty, the bullets when there are any, and the options table when it is non-empty.
 * Exceptions: None.
 */
export function buildOperationsSection(args: {
  readonly state: GameStateSnapshot;
  readonly operations: readonly Operation[];
  readonly format: (h3Index: string) => string;
  readonly options?: string;
  readonly note?: string;
}): string {
  const options = args.options ?? '';
  const note = args.note ?? '';
  logTrace('briefingSectionsOperations buildOperationsSection', {
    operationCount: args.operations.length,
    hasOptions: options.length > 0,
    hasNote: note.length > 0,
  });
  if (args.operations.length === 0 && options.length === 0 && note.length === 0) return '';
  const ordered = [...args.operations].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const bullets = ordered.map((operation) => operationBullet(args.state, operation, args.format));
  let text = topLevelHeading(SECTION_TITLE_OPERATIONS);
  if (note.length > 0) text += `\n\n- Last turn: ${note}`;
  if (bullets.length > 0) text += `\n\n${bullets.join('\n')}`;
  if (options.length > 0) text += `\n\n${options}`;
  return text;
}
