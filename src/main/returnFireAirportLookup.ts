/**
 * Fail-closed intact-airport checks for ranged-phase air return fire.
 *
 * Purpose: Keeps Ready, tactical ranged, and Tool 3 aligned on strike-planning airport gates without aborting combat when infra reads fail.
 * When to use: As `hasIntactAirportAtAirBase` on `ReturnFireEligibilityContext`.
 * Expected outcome: True only when airport count is positive; false on missing data or thrown errors.
 * Exceptions: Catches DB/infra errors, logs at error, returns false (deny return fire).
 */

import { cellToParent } from 'h3-js';
import { getRes1InfrastructureForHex } from './gameDb';
import { logDebug, logError } from './logger';

/**
 * Returns whether a strategic air unit’s base hex has an intact airport.
 *
 * Purpose: Strategic Ready and Tool 3 return-fire airport gate.
 * When to use: Pass as `hasIntactAirportAtAirBase` when `theater === 'strategic'`.
 * Expected outcome: `airportCount > 0` for the unit’s res1 hex; false on failure.
 * Exceptions: Logs and returns false when infrastructure lookup throws.
 */
export function hasIntactAirportAtStrategicAirBase(unitH3: string): boolean {
  logDebug('hasIntactAirportAtStrategicAirBase', { unitH3 });
  try {
    return getRes1InfrastructureForHex(unitH3).airportCount > 0;
  } catch (err) {
    logError('hasIntactAirportAtStrategicAirBase failed; denying air return fire', { unitH3, err });
    return false;
  }
}

/**
 * Returns whether a tactical air sub-unit’s parent res1 hex has an intact airport.
 *
 * Purpose: Tactical ranged-phase return-fire airport gate (matches tactical strike validation).
 * When to use: Pass as `hasIntactAirportAtAirBase` when `theater === 'tactical'`.
 * Expected outcome: `airportCount > 0` on `cellToParent(unitH3, 1)`; false on failure.
 * Exceptions: Logs and returns false when parent or infrastructure lookup throws.
 */
export function hasIntactAirportAtTacticalAirBase(unitH3: string): boolean {
  logDebug('hasIntactAirportAtTacticalAirBase', { unitH3 });
  try {
    return getRes1InfrastructureForHex(cellToParent(unitH3, 1)).airportCount > 0;
  } catch (err) {
    logError('hasIntactAirportAtTacticalAirBase failed; denying air return fire', { unitH3, err });
    return false;
  }
}
