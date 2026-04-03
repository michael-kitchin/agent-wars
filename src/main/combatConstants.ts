/**
 * Combat constants per the combat spec: attack, defense, and range by unit type.
 * Single source of truth for resolution and validation. Casualty priority order
 * is infantry → armor → naval → air (lowest defense first, then type order for ties).
 */

/** Unit types that participate in combat. */
export type UnitType = 'infantry' | 'armor' | 'naval' | 'air';

/** Attack value by unit type (hit on d6 when roll ≤ this value). */
const ATTACK: Record<UnitType, number> = {
  infantry: 1,
  armor: 3,
  naval: 2,
  air: 3,
};

/** Defense value by unit type (hit on d6 when roll ≤ this value). */
const DEFENSE: Record<UnitType, number> = {
  infantry: 2,
  armor: 2,
  naval: 2,
  air: 1,
};

/** Ranged attack range in hexes (0 = melee only). */
const RANGE: Record<UnitType, number> = {
  infantry: 0,
  armor: 1,
  naval: 2,
  air: 3,
};

/** Movement budget (hexes per turn). Used for pathfinding and tool responses. */
const MOVEMENT_BUDGET: Record<UnitType, number> = {
  infantry: 1,
  armor: 2,
  naval: 2,
  air: 0,
};

/**
 * Returns the attack value for the given unit type. Used when the unit is attacking (ranged or melee).
 */
export function getAttack(unitType: string): number {
  return ATTACK[unitType as UnitType] ?? 1;
}

/**
 * Returns the defense value for the given unit type. Used when the unit is defending.
 */
export function getDefense(unitType: string): number {
  return DEFENSE[unitType as UnitType] ?? 2;
}

/**
 * Returns the ranged attack range in hexes (0 = melee only). Units with range ≥ 1 may declare ranged attacks.
 */
export function getRange(unitType: string): number {
  return RANGE[unitType as UnitType] ?? 0;
}

/**
 * Returns the movement budget (hexes per turn) for the given unit type. Used by pathfinding and MCP tools.
 */
export function getMovementBudget(unitType: string): number {
  return MOVEMENT_BUDGET[unitType as UnitType] ?? 1;
}

/**
 * Ordered list of unit types for casualty tie-break: remove infantry first, then armor, then naval.
 * Used when assigning hits so that higher-value units survive when possible.
 */
export const CASUALTY_PRIORITY_ORDER: UnitType[] = ['infantry', 'armor', 'naval', 'air'];

/**
 * Returns the index of the unit type in casualty priority order (lower = removed first).
 * Use to sort units when assigning casualties.
 */
export function casualtyPriorityIndex(unitType: string): number {
  const i = CASUALTY_PRIORITY_ORDER.indexOf(unitType as UnitType);
  return i >= 0 ? i : CASUALTY_PRIORITY_ORDER.length;
}
