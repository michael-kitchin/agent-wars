/**
 * Reads an on/off developer flag from the environment.
 *
 * Purpose: Every main-process `AGENT_WARS_*` flag shares one parser.
 * When to use: Whenever main-process code reads an on/off developer flag. The value is read on every call.
 * Expected outcome: True for 1/true/yes/on, after trim and optional quote strip. False when unset.
 * Exceptions: None.
 */

import { logTrace } from './logger';

/**
 * Interprets common truthy string values of a developer environment flag.
 *
 * Purpose: Shared parsing for `AGENT_WARS_*` on/off flags, tolerating quotes that some shells keep.
 * When to use: Whenever main-process code reads an on/off developer flag; the value is read on every call.
 * Expected outcome: True for 1/true/yes/on (case-insensitive) after trim and optional quote strip; false when unset.
 * Exceptions: None.
 */
export function isEnvFlagEnabled(flagName: string): boolean {
  let value = process.env[flagName]?.trim();
  const quoted =
    value !== undefined &&
    value.length > 1 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
  if (quoted && value !== undefined) value = value.slice(1, -1).trim();
  const normalized = value?.toLowerCase();
  const enabled = normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  logTrace('envFlag isEnvFlagEnabled', { flagName, enabled });
  return enabled;
}
