/**
 * Shared strategic infrastructure payloads for tests that pin counts without coupling to production terrain defaults.
 */

/**
 * Zero production footprint on a strategic hex (urban / airport / seaport aggregates cleared).
 *
 * Purpose: Avoid repeating identical `{ urbanHexCount: 0, ... }` literals across DB-backed tests.
 * When to use: Pass to `setStrategicInfrastructureForHex` when tests need “no facilities” baseline counts.
 * Expected outcome: Valid argument object for `setStrategicInfrastructureForHex`; all counts zero.
 * Exceptions: None.
 */
export const ZERO_STRATEGIC_INFRA_COUNTS = {
  urbanHexCount: 0,
  airportCount: 0,
  seaportCount: 0,
} as const;
