/**
 * Applies the launch and cancel commands from one reply.
 *
 * Purpose: The commander picks a listed row, names a city, or calls a stored operation off, and the engine writes that once.
 * When to use: Before standing orders for that consult are expanded, with the candidate array the briefing printed.
 * Expected outcome: Stored operations match the commands that could be carried out. A command that cannot is a drop reason.
 * Exceptions: None. A throw while the commands are being resolved writes nothing. The caller receives one drop reason.
 */

import type { GameStateSnapshot } from '../gameDb';
import { dbGetOne, dbRun, listUnitsForSnapshot } from '../gameDb';
import type { KnockoutCoordinates } from '../gameActions/knockoutConsequences';
import {
  nextOperationId,
  readOperationOffer,
  readOperations,
  writeOperationEventTurn,
  writeOperationOffer,
  writeOperationsForSeat,
} from '../gameDb/operationMemory';
import { codeToH3 } from '../briefing/map/hexCodeTranslator';
import { logDebug, logError, logTrace } from '../logger';
import type { OperationCommand } from '../openRouter/operationCommandParsing';
import type { Operation, OperationCandidate, OperationMethod } from '../../shared/operationTypes';
import { applyOperationActions } from './operationActions';
import { operationCandidatesForSeat, operationSlotsForState } from './operationCandidates';
import { OPERATION_OPTION_LETTERS } from './operationRules';
import { listKnownEnemyCities } from './seaOperationCandidates';
import { buildOperationFacts } from './operationTurnFlow';
import { advanceOperation, cancelOperation } from './operationAdvance';
import { type OperationAction, type OperationStep } from './seaOperationAdvance';

/**
 * Database helpers for the operations, offer, and event rows.
 *
 * Purpose: The reply writes the same match database the turn advance uses.
 * When to use: Reading and writing during one apply.
 * Expected outcome: The open match database.
 * Exceptions: None.
 */
const configOps = { getOne: dbGetOne, run: dbRun };

/**
 * The drop reason when the engine throws before it writes.
 *
 * Purpose: A failure must not fail the consult, and it must not leave a half-applied reply.
 * When to use: The catch around resolve and write.
 * Expected outcome: One reason and an applied count of zero.
 * Exceptions: None.
 */
const APPLY_FAILED_REASON = 'operations dropped: the engine could not apply them.';

/**
 * What one reply changes, before anything is written.
 *
 * Purpose: A throw while resolving leaves the match untouched.
 * When to use: The result of resolving every command against the stored list.
 * Expected outcome: The operations to store, the orders to write, and the commands that could not be carried out.
 * Exceptions: None.
 */
interface ResolvedCommands {
  /**
   * Operations to store after every command.
   *
   * Contract: Cancels already replaced or removed their rows. A launch is last.
   * When to use: The single `writeOperationsForSeat` after the actions.
   * Expected outcome: The seat's next list.
   * Exceptions: None.
   */
  readonly operations: readonly Operation[];
  /**
   * Orders from the commands that were accepted, cancel first.
   *
   * Contract: The same action order `cancelOperation` and `advanceOperation` returned.
   * When to use: Once, before the operations are stored.
   * Expected outcome: Zero or more actions.
   * Exceptions: None.
   */
  readonly actions: readonly OperationAction[];
  /**
   * How many commands were carried out.
   *
   * Contract: A dropped command is not counted.
   * When to use: The event row, and the return value.
   * Expected outcome: Zero when every command was dropped.
   * Exceptions: None.
   */
  readonly appliedCount: number;
  /**
   * Why a command was not carried out.
   *
   * Contract: One sentence per dropped command.
   * When to use: Appended to the reply's drop list.
   * Expected outcome: Empty when every command was carried out.
   * Exceptions: None.
   */
  readonly dropReasons: readonly string[];
  /**
   * Whether a launch was stored.
   *
   * Contract: True when the launch step was accepted, including a step that stores nothing.
   * When to use: Clearing `clearOfferTurn` while keeping `announcedTurn`.
   * Expected outcome: False when the reply had no launch or the launch was dropped.
   * Exceptions: None.
   */
  readonly launched: boolean;
}

/**
 * Carries out one reply's operation commands.
 *
 * Purpose: Letters resolve against the briefing's rows, and the writes happen only after every command has been resolved.
 * When to use: Once per consult that included an `operations` array, before standing-order expansion.
 * Expected outcome: `appliedCount` is how many commands were stored. `dropReasons` names the rest. A throw while resolving writes nothing.
 * Exceptions: None. The catch logs the error and returns `appliedCount` 0.
 */
export function applyOperationCommands(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly commands: readonly OperationCommand[];
  readonly coordinates: KnockoutCoordinates;
  readonly candidates: readonly OperationCandidate[];
}): { readonly appliedCount: number; readonly dropReasons: string[] } {
  logDebug('operationCommands applyOperationCommands', {
    seatId: args.seatId,
    turnNumber: args.state.turnNumber,
    commandCount: args.commands.length,
    candidateCount: args.candidates.length,
  });
  try {
    const resolved = resolveCommands(args);
    if (resolved.appliedCount > 0) {
      applyOperationActions({
        seatId: args.seatId,
        actions: resolved.actions,
        state: args.state,
        coordinates: args.coordinates,
      });
      writeOperationsForSeat(configOps, args.seatId, resolved.operations);
      if (resolved.launched) clearLaunchOffer(args.seatId);
      writeOperationEventTurn(configOps, args.seatId, args.state.turnNumber);
    }
    return { appliedCount: resolved.appliedCount, dropReasons: [...resolved.dropReasons] };
  } catch (err) {
    logError('operationCommands: could not apply operations', { seatId: args.seatId }, err);
    return { appliedCount: 0, dropReasons: [APPLY_FAILED_REASON] };
  }
}

/**
 * Resolves every cancel, then the launch, without writing.
 *
 * Purpose: The stored list and the orders are known before the first write, so a later throw does not leave a cancelled order beside a still-stored operation.
 * When to use: Inside `applyOperationCommands`.
 * Expected outcome: The next list and the actions. A missing land mass drops that command.
 * Exceptions: Propagates a terrain or database error from the facts or the advance.
 */
function resolveCommands(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly commands: readonly OperationCommand[];
  readonly coordinates: KnockoutCoordinates;
  readonly candidates: readonly OperationCandidate[];
}): ResolvedCommands {
  const stored = [...(readOperations(configOps).get(args.seatId) ?? [])];
  const replacements = new Map<string, Operation | null>();
  const actions: OperationAction[] = [];
  const dropReasons: string[] = [];
  let appliedCount = 0;
  for (const command of args.commands) {
    if (command.action !== 'cancel') continue;
    const outcome = resolveCancel({ ...args, command, stored, replacements });
    dropReasons.push(...outcome.dropReasons);
    if (!outcome.applied || outcome.step === undefined) continue;
    replacements.set(command.id, outcome.step.next);
    actions.push(...outcome.step.actions);
    appliedCount += 1;
    logDebug('operationCommands cancelled', { seatId: args.seatId, id: command.id, phase: outcome.phase });
  }
  const operations = mergeOperations(stored, replacements);
  const launch = args.commands.find((command) => command.action === 'launch');
  if (launch === undefined || launch.action !== 'launch') {
    return { operations, actions, appliedCount, dropReasons, launched: false };
  }
  const launched = 'option' in launch
    ? resolveLaunch({ ...args, option: launch.option, operations })
    : resolveNamedLaunch({ ...args, objective: launch.objective, method: launch.method, operations });
  dropReasons.push(...launched.dropReasons);
  if (launched.operation === null || launched.step === undefined) {
    return { operations, actions, appliedCount, dropReasons, launched: false };
  }
  actions.push(...launched.step.actions);
  const next = launched.step.next === null ? operations : [...operations, launched.step.next];
  logDebug('operationCommands launched', {
    seatId: args.seatId,
    id: launched.operation.id,
    option: 'option' in launch ? launch.option : null,
    objectiveH3: launched.operation.objectiveH3,
    method: launched.operation.method,
  });
  return {
    operations: next,
    actions,
    appliedCount: appliedCount + 1,
    dropReasons,
    launched: true,
  };
}

/**
 * Decides one cancel against the operation stored at the start of the reply.
 *
 * Purpose: A cancel names an id from Active Operations. A return is already doing the only thing a cancel would do.
 * When to use: Each cancel, before the launch.
 * Expected outcome: A step to keep, or one drop reason.
 * Exceptions: Propagates from `buildOperationFacts` or `cancelOperation`.
 */
function resolveCancel(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly command: Extract<OperationCommand, { action: 'cancel' }>;
  readonly coordinates: KnockoutCoordinates;
  readonly stored: readonly Operation[];
  readonly replacements: ReadonlyMap<string, Operation | null>;
}): { readonly applied: boolean; readonly phase?: string; readonly step?: OperationStep; readonly dropReasons: readonly string[] } {
  const operation = args.stored.find((row) => row.id === args.command.id);
  if (operation === undefined || args.replacements.has(operation.id)) {
    return { applied: false, dropReasons: [`operations cancel dropped: ${args.command.id} is not one of your operations.`] };
  }
  if (operation.phase === 'return') {
    return { applied: false, dropReasons: [`operations cancel dropped: ${args.command.id} is already returning.`] };
  }
  const facts = buildOperationFacts({
    state: args.state,
    seatId: args.seatId,
    operation,
    coordinates: args.coordinates,
  });
  if (facts === null) {
    return { applied: false, dropReasons: [`operations cancel dropped: ${args.command.id} could not be read.`] };
  }
  return { applied: true, phase: operation.phase, step: cancelOperation(operation, facts), dropReasons: [] };
}

/**
 * Decides the one launch against the briefing's rows and the operations still stored.
 *
 * Purpose: The letter is an index into the array the table printed. A later search could list a different row.
 * When to use: After every cancel has been resolved.
 * Expected outcome: An operation and its first step, or one drop reason.
 * Exceptions: Propagates from `buildOperationFacts` or `advanceOperation`.
 */
function resolveLaunch(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly option: string;
  readonly coordinates: KnockoutCoordinates;
  readonly candidates: readonly OperationCandidate[];
  readonly operations: readonly Operation[];
}): { readonly operation: Operation | null; readonly step?: OperationStep; readonly dropReasons: readonly string[] } {
  const index = (OPERATION_OPTION_LETTERS as readonly string[]).indexOf(args.option);
  const candidate = index < 0 ? undefined : args.candidates[index];
  if (candidate === undefined) {
    return { operation: null, dropReasons: [`operations launch dropped: option ${args.option} is not listed this turn.`] };
  }
  return acceptCandidate({
    ...args,
    candidate,
    unavailableReason: `operations launch dropped: option ${args.option} is no longer available.`,
    unreadReason: `operations launch dropped: option ${args.option} could not be read.`,
  });
}

/**
 * Decides a launch that names a city instead of a letter.
 *
 * Purpose: The commander can start an operation the menu did not list, when the free units can reach that city.
 * When to use: A launch command that carries `objective` and `method`.
 * Expected outcome: The same first step a letter launch would store for the candidate the search returns, or one drop reason.
 * Exceptions: `codeToH3` throws on an unknown code and logs that throw. This function catches it and returns a drop reason.
 */
function resolveNamedLaunch(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly objective: string;
  readonly method: OperationMethod;
  readonly coordinates: KnockoutCoordinates;
  readonly operations: readonly Operation[];
}): { readonly operation: Operation | null; readonly step?: OperationStep; readonly dropReasons: readonly string[] } {
  let objectiveH3: string;
  try {
    objectiveH3 = codeToH3(args.objective, { mode: 'strategic' });
  } catch {
    logDebug('operationCommands resolveNamedLaunch: code rejected', { seatId: args.seatId, objective: args.objective });
    return { operation: null, dropReasons: [`operations launch dropped: ${args.objective} is not a hex code on this map.`] };
  }
  const city = listKnownEnemyCities(args.state, args.seatId).find((row) => row.h3Index === objectiveH3);
  if (city === undefined) {
    return { operation: null, dropReasons: [`operations launch dropped: ${args.objective} is not a known enemy city.`] };
  }
  const running = args.operations.filter((operation) => operation.method === args.method).length;
  if (running >= operationSlotsForState(args.state, args.method)) {
    return { operation: null, dropReasons: [`operations launch dropped: you already have as many ${args.method} operations as you can run.`] };
  }
  if (args.method === 'air' && airObjectiveBlocked(args.state, args.seatId, objectiveH3, city.knownFortifiedCount)) {
    return {
      operation: null,
      dropReasons: [`operations launch dropped: ${args.objective} is defended, and an air drop needs an empty, unfortified city.`],
    };
  }
  const candidates = operationCandidatesForSeat({
    state: args.state,
    seatId: args.seatId,
    active: args.operations,
    only: { objectiveH3, method: args.method },
  });
  const candidate = candidates[0];
  if (candidate === undefined) {
    return {
      operation: null,
      dropReasons: [`operations launch dropped: ${args.objective} cannot be reached by ${args.method} with the units you have free.`],
    };
  }
  return acceptCandidate({
    state: args.state,
    seatId: args.seatId,
    coordinates: args.coordinates,
    operations: args.operations,
    candidate,
    unavailableReason: `operations launch dropped: ${args.objective} cannot be reached by ${args.method} with the units you have free.`,
    unreadReason: `operations launch dropped: ${args.objective} could not be read.`,
  });
}

/**
 * Whether an air drop on this city is blocked before the search.
 *
 * Purpose: An occupied or fortified city is never an air objective, even when a sea landing could use it.
 * When to use: A named air launch, after the city is known and before the candidate search.
 * Expected outcome: True when an unmasked enemy unit stands on the hex or the known fortified count is above zero.
 * Exceptions: None.
 */
function airObjectiveBlocked(state: GameStateSnapshot, seatId: string, objectiveH3: string, knownFortifiedCount: number): boolean {
  if (knownFortifiedCount > 0) return true;
  const occupied = listUnitsForSnapshot().some((unit) => unit.player !== seatId && unit.h3Index === objectiveH3);
  logTrace('operationCommands airObjectiveBlocked', { seatId, objectiveH3, occupied });
  return occupied;
}

/**
 * Stores one candidate the way a letter launch does.
 *
 * Purpose: A named city and a menu letter build the same operation, including the air launch airport.
 * When to use: After the candidate has been chosen.
 * Expected outcome: An operation whose method is the candidate's method. An air operation keeps `landingH3`. A sea operation stores it as null. Or one drop reason.
 * Exceptions: Propagates from `buildOperationFacts` or `advanceOperation`.
 */
function acceptCandidate(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly coordinates: KnockoutCoordinates;
  readonly operations: readonly Operation[];
  readonly candidate: OperationCandidate;
  readonly unavailableReason: string;
  readonly unreadReason: string;
}): { readonly operation: Operation | null; readonly step?: OperationStep; readonly dropReasons: readonly string[] } {
  const busy = new Set(args.operations.flatMap((operation) => [...operation.unitIds, ...operation.carrierIds]));
  const taken = [...args.candidate.unitIds, ...args.candidate.carrierIds].some((unitId) => busy.has(unitId));
  if (taken) return { operation: null, dropReasons: [args.unavailableReason] };
  const operation: Operation = {
    id: nextOperationId(args.seatId, args.operations, args.state.turnNumber),
    method: args.candidate.method,
    objectiveH3: args.candidate.objectiveH3,
    musterH3: args.candidate.musterH3,
    landingH3: args.candidate.method === 'air' ? args.candidate.landingH3 : null,
    unitIds: [...args.candidate.unitIds],
    carrierIds: [...args.candidate.carrierIds],
    phase: 'muster',
    source: 'commander',
    launchedTurn: args.state.turnNumber,
    phaseTurn: args.state.turnNumber,
  };
  const facts = buildOperationFacts({
    state: args.state,
    seatId: args.seatId,
    operation,
    coordinates: args.coordinates,
  });
  if (facts === null) return { operation: null, dropReasons: [args.unreadReason] };
  return { operation, step: advanceOperation(operation, facts), dropReasons: [] };
}

/**
 * Applies cancel replacements to the stored list, keeping the original order.
 *
 * Purpose: A cancel removes its row or replaces it with the return. Everything else stays.
 * When to use: After the cancels and before the launch is appended.
 * Expected outcome: Rows whose replacement is null are gone. An untouched row is copied through.
 * Exceptions: None.
 */
function mergeOperations(stored: readonly Operation[], replacements: ReadonlyMap<string, Operation | null>): Operation[] {
  const operations: Operation[] = [];
  for (const operation of stored) {
    if (!replacements.has(operation.id)) {
      operations.push(operation);
      continue;
    }
    const next = replacements.get(operation.id);
    if (next != null) operations.push(next);
  }
  return operations;
}

/**
 * Clears the undefended-row clock after the commander launches.
 *
 * Purpose: The engine must not launch a second row on the next tick just because the window had already opened.
 * When to use: After a launch was stored.
 * Expected outcome: `clearOfferTurn` is null. `announcedTurn` is the value already stored, including null.
 * Exceptions: None.
 */
function clearLaunchOffer(seatId: string): void {
  const offer = readOperationOffer(configOps, seatId);
  writeOperationOffer(configOps, seatId, { announcedTurn: offer.announcedTurn, clearOfferTurn: null });
  logDebug('operationCommands clearLaunchOffer', { seatId, announcedTurn: offer.announcedTurn });
}
