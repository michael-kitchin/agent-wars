/**
 * The air-strike target values the schema, the guards, and the database check share.
 *
 * Purpose: One list is the prompt schema enum and the value set every guard accepts.
 * When to use: When accepting or emitting an air-strike target type.
 * Expected outcome: `units`, `urban`, `airport`, then `seaport`. The SQL `CHECK` in `src/main/gameDb/schema.ts` lists the same values.
 * Exceptions: None.
 */

import type { AirStrikeTargetType } from './ipc/ordersTypes';

/**
 * Air-strike target categories, in schema order.
 *
 * Purpose: The prompt schema enum is emitted in this order, and every guard accepts this set.
 * When to use: Building the schema enum, or testing a value with `isAirStrikeTargetType`.
 * Expected outcome: `units`, `urban`, `airport`, `seaport`.
 * Exceptions: None. The SQL `CHECK` in `src/main/gameDb/schema.ts` must list the same values.
 */
export const AIR_STRIKE_TARGET_TYPES: readonly AirStrikeTargetType[] = ['units', 'urban', 'airport', 'seaport'];

/**
 * Whether a value is one of the air-strike target categories.
 *
 * Purpose: Callers share one membership test with the schema enum.
 * When to use: After reading an untrusted target type.
 * Expected outcome: True only for the four categories. The type guard narrows to `AirStrikeTargetType`.
 * Exceptions: None. A different spelling, including different case, is false.
 */
export function isAirStrikeTargetType(value: unknown): value is AirStrikeTargetType {
  return (AIR_STRIKE_TARGET_TYPES as readonly unknown[]).includes(value);
}
