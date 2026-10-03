import { getStrategicRes1HexCode } from './hexLlmCodeAssignment';
import { formatTerrainKindLabel } from './terrainKindLabel';
import type { UnitOrigin } from './unitOriginTypes';

/**
 * Whether two origins would show the same flag and the same tooltip.
 *
 * Purpose: A loss line keyed by display name can name two units. The flag is safe to show when both origins present the same birth place, and unsafe when they do not.
 * When to use: Before attaching one origin to a shared display name.
 * Expected outcome: `true` only when every birth field matches.
 * Exceptions: None.
 */
export function unitOriginsPresentTheSame(left: UnitOrigin, right: UnitOrigin): boolean {
  return (
    left.birthH3Index === right.birthH3Index &&
    left.birthRes4H3Index === right.birthRes4H3Index &&
    left.birthTerrainKind === right.birthTerrainKind &&
    left.birthIsUrban === right.birthIsUrban &&
    left.birthCountryName === right.birthCountryName &&
    left.birthCountryCode === right.birthCountryCode
  );
}

/**
 * Builds the text shown when hovering a unit's country flag.
 *
 * Purpose: Keeps the origin tooltip wording in one tested place, separate from renderer DOM code.
 * When to use: When creating a unit flag element; the result goes into the flag's tooltip data attribute.
 * Expected outcome: `Origin: <country> (<XX>)` and `Terrain: <Terrain>` joined by a newline. The country is
 *   `Unknown` when the origin has none, and the `(<XX>)` part is dropped when the birth hex has no strategic code.
 *   A non-empty `bonusLine` becomes a third line. `birthIsUrban` does not appear.
 * Exceptions: None.
 */
export function formatUnitOriginTooltipText(origin: UnitOrigin, bonusLine?: string | null): string {
  const hexCode = getStrategicRes1HexCode(origin.birthH3Index);
  const codeSuffix = hexCode ? ` (${hexCode})` : '';
  return [
    `Origin: ${origin.birthCountryName ?? 'Unknown'}${codeSuffix}`,
    `Terrain: ${formatTerrainKindLabel(origin.birthTerrainKind)}`,
    ...(bonusLine ? [bonusLine] : []),
  ].join('\n');
}
