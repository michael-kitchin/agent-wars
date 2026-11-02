/**
 * Example rows shared by the final-JSON example and the repair schema.
 *
 * Purpose: The two prompt builders embed the same missile, callback, memory, and production rows.
 * When to use: When either builder fills those envelope fields.
 * Expected outcome: `JSON.stringify` keeps the property order written here, so both prompts stay byte-identical on these rows.
 * Exceptions: None.
 */

/**
 * One illustrative missile launch.
 *
 * Purpose: Both example builders teach the same launch shape.
 * When to use: The `missileLaunches` field.
 * Expected outcome: One row for unit `a1-m1` and hex code `CK`.
 * Exceptions: None.
 */
export const EXAMPLE_MISSILE_LAUNCHES = [{ unitId: 'a1-m1', targetHexCode: 'CK' }] as const;

/**
 * One illustrative callback subscription.
 *
 * Purpose: Both example builders teach the same event and parameters.
 * When to use: The `callbacks` field.
 * Expected outcome: One `infrastructure_destroyed` row for an airport at hex code `CD`.
 * Exceptions: None.
 */
export const EXAMPLE_CALLBACKS = [
  { event: 'infrastructure_destroyed', params: { targetType: 'airport', hex: 'CD' } },
] as const;

/**
 * One illustrative memory write.
 *
 * Purpose: Both example builders teach the same persistent objective.
 * When to use: The `memoryUpdates` field.
 * Expected outcome: One write of `turn_objectives`.
 * Exceptions: None.
 */
export const EXAMPLE_MEMORY_UPDATES = [
  {
    action: 'write',
    key: 'turn_objectives',
    tier: 'persistent',
    content: 'Close with observed enemies; keep air and naval production moving.',
  },
] as const;

/**
 * One illustrative production order.
 *
 * Purpose: Both example builders teach the same queue write.
 * When to use: The `productionOrders` field.
 * Expected outcome: One air unit queued at hex code `CF`.
 * Exceptions: None.
 */
export const EXAMPLE_PRODUCTION_ORDERS = [{ action: 'set_build_queue', hex: 'CF', unitType: 'air', count: 1 }] as const;
