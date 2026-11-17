/**
 * Glyph paths for unit types.
 *
 * Purpose: A leaf module with no imports, so page chrome and the map token drawing can share glyph URLs without importing each other.
 * When to use: Any code that needs the `units/<file>.svg` path of a unit type.
 * Expected outcome: The names below behave exactly as they did in `unitDrawing`, which re-exports `unitIconPathForUnitType`.
 * Exceptions: None.
 */

/**
 * The unit kinds that have a glyph file.
 *
 * Purpose: Keys `UNIT_ICON_FILE_BY_TYPE`; `mixed` is the glyph for stacks and unknown types.
 * When to use: Typing a glyph lookup.
 * Expected outcome: One of the six literal names.
 * Exceptions: None.
 */
export type UnitIconType = 'infantry' | 'armor' | 'naval' | 'air' | 'missile' | 'mixed';
/**
 * The glyph file name for each unit kind.
 *
 * Purpose: One table maps a unit kind to its `units/<file>.svg` glyph.
 * When to use: `iconPathForType` and the known-type check in `unitIconPathForUnitType`.
 * Expected outcome: A file name for every `UnitIconType`.
 * Exceptions: None.
 */
export const UNIT_ICON_FILE_BY_TYPE: Record<UnitIconType, string> = {
    /**
   * Documents the object literal property `infantry` (infantry: 'infantry.svg').

   * Purpose: Supports maintainability by documenting why `infantry` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
infantry: 'infantry.svg',
    /**
   * Documents the object literal property `armor` (armor: 'armor.svg').

   * Purpose: Supports maintainability by documenting why `armor` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
armor: 'armor.svg',
    /**
   * Documents the object literal property `naval` (naval: 'naval.svg').

   * Purpose: Supports maintainability by documenting why `naval` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
naval: 'naval.svg',
    /**
   * Documents the object literal property `air` (air: 'air.svg').

   * Purpose: Supports maintainability by documenting why `air` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
air: 'air.svg',
  missile: 'missile.svg',
    /**
   * Documents the object literal property `mixed` (mixed: 'mixed.svg').

   * Purpose: Supports maintainability by documenting why `mixed` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
mixed: 'mixed.svg',
};

/**
 * Path of the glyph for one unit type.
 *
 * Purpose: The map token and the image loader share one URL.
 * When to use: When starting an icon load.
 * Expected outcome: `units/<file>.svg`, resolved from `static/index.html`, the same way weather icons resolve.
 * Exceptions: None.
 */
export function iconPathForType(unitType: UnitIconType): string {
  return `units/${UNIT_ICON_FILE_BY_TYPE[unitType]}`;
}

/**
 * Path of the glyph for a unit type, for page elements that show a unit's type.
 *
 * Purpose: A list row and the map token use the same glyph.
 * When to use: As an `<img>` source in panel markup.
 * Expected outcome: `units/<type>.svg`; a type with no glyph of its own uses the mixed glyph.
 * Exceptions: None.
 */
export function unitIconPathForUnitType(unitType: string): string {
  const known = Object.prototype.hasOwnProperty.call(UNIT_ICON_FILE_BY_TYPE, unitType);
  return iconPathForType(known ? (unitType as UnitIconType) : 'mixed');
}
