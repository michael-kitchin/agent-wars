/**
 * Treats a unit whose selection never appeared as one the march search skips.
 *
 * Purpose: After a played turn a label or marker can sit over a lone unit, so its hex click selects nothing and the
 *   selection wait times out. That unit is skipped and the next one tried, while any other error still fails the run.
 * When to use: From `queueLoneUnitMarch` in `ui-smoke-map.cjs`, around each unit's march attempt.
 * Expected outcome: A unit the run cannot select is skipped with a note, and the caller learns how many were.
 * Exceptions: Each helper documents its own.
 */
'use strict';

/**
 * Whether an error is a Playwright wait that ran out of time.
 *
 * Purpose: Playwright names its timeout errors `TimeoutError`, and only those mean the selection did not appear.
 * When to use: Before treating a failed march attempt as a skipped unit.
 * Expected outcome: True for an Error named `TimeoutError`, false for anything else.
 * Exceptions: None.
 */
function isPlaywrightTimeout(err) {
  return err instanceof Error && err.name === 'TimeoutError';
}

/**
 * Runs one unit's march attempt and skips the unit when its selection times out.
 *
 * Purpose: A unit the run cannot select should cost one selection wait, leave a note, and let the next unit try.
 * When to use: With an attempt that resolves true once a march is queued, the unit it is for, and a list that collects
 *   the skipped units for the final error message.
 * Expected outcome: The attempt's result. On a Playwright timeout, false, a console note naming the unit's type and
 *   hex, and the unit's id pushed onto `skipped`.
 * Exceptions: Rethrows every error that is not a Playwright timeout.
 */
async function attemptUnitMarch(attempt, unit, skipped) {
  try {
    return await attempt();
  } catch (err) {
    if (!isPlaywrightTimeout(err)) throw err;
    console.log(`NOTE skipped the ${unit.unitType} at ${unit.h3Index}: its selection did not appear`);
    skipped.push(unit.id);
    return false;
  }
}

module.exports = { attemptUnitMarch, isPlaywrightTimeout };
