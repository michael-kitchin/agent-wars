/**
 * Whether a unit type moves and fights as a land unit.
 *
 * Purpose: Infantry and armor are the only types that march over land, embark on carriers, and occupy hexes as ground forces.
 * When to use: Any check that used to spell out both types.
 * Expected outcome: True for `infantry` and `armor`. The type guard narrows a unit-type union to those two.
 * Exceptions: None. Any other string, including a different capitalization, is false.
 */
export function isLandUnitType(unitType: string): unitType is 'infantry' | 'armor' {
  return unitType === 'infantry' || unitType === 'armor';
}
