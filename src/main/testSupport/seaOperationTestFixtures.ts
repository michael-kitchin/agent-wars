import type { Operation } from '../../shared/operationTypes';
import type { OperationAction, OperationFacts } from '../operations/operationStepTypes';

export const PORT = 'port';
export const CITY = 'city';
export const BEACH = 'beach';

/**
 * One stored operation with the fields a test does not care about filled in.
 *
 * Purpose: Each case names only the phase, the force, and the hexes that differ.
 * When to use: At the start of a case.
 * Expected outcome: A sea operation launched on turn 1.
 * Exceptions: None.
 */
export function operation(patch: Partial<Operation> & Pick<Operation, 'phase' | 'unitIds' | 'carrierIds'>): Operation {
  return {
    id: 'seat-op1',
    method: 'sea',
    objectiveH3: CITY,
    musterH3: PORT,
    landingH3: null,
    source: 'engine',
    launchedTurn: 1,
    phaseTurn: 1,
    ...patch,
  };
}

/**
 * Facts for one operation, with empty maps and a landing the muster can use.
 *
 * Purpose: A case overrides only the maps and flags it needs.
 * When to use: Beside `operation`.
 * Expected outcome: Turn 1, the objective still an enemy city, and choosers that return a beach and the same port.
 * Exceptions: None.
 */
export function facts(patch: Partial<OperationFacts> = {}): OperationFacts {
  return {
    turnNumber: 1,
    unitHexById: new Map(),
    unitTypeById: new Map(),
    carrierByCargoId: new Map(),
    storedOrderById: new Map(),
    objectiveIsEnemyCity: true,
    objectiveIsOwn: false,
    objectiveHasEnemyUnit: false,
    chooseLanding: () => BEACH,
    chooseReturnPort: () => PORT,
    ...patch,
  };
}

/**
 * Hexes and infantry types for the named units.
 *
 * Purpose: Muster loading reads both maps, and a missing hex means the unit is gone.
 * When to use: When every listed unit is on the same hex.
 * Expected outcome: One entry per id. Ground units are infantry.
 * Exceptions: None.
 */
export function placed(ids: readonly string[], hex: string, ships: readonly string[] = []): { readonly unitHexById: Map<string, string>; readonly unitTypeById: Map<string, string> } {
  const unitHexById = new Map<string, string>();
  const unitTypeById = new Map<string, string>();
  for (const id of [...ids, ...ships]) unitHexById.set(id, hex);
  for (const id of ids) unitTypeById.set(id, 'infantry');
  return { unitHexById, unitTypeById };
}

/**
 * True when no action names the unit.
 *
 * Purpose: A release must not also march, unload, or cancel that unit.
 * When to use: Release cases.
 * Expected outcome: True when the id is absent from the action list.
 * Exceptions: None.
 */
export function spares(actions: readonly OperationAction[], unitId: string): boolean {
  return actions.every((action) => action.unitId !== unitId);
}
