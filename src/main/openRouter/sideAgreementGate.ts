/**
 * The switches that say how the game uses agreements.
 *
 * Purpose: The message rules, the Messages section, the orders contract text, the orders schema, and the engine's pact partner read all follow these switches, so they cannot disagree.
 * When to use: Building a strategic or tactical orders prompt or schema, and reading the pacts that steer engine choices.
 * Expected outcome: Agreements are made and decided on the world map while the talk stage is enabled. A battle makes and decides none, and shows them read-only while the talk stage is enabled.
 * Exceptions: None.
 */

import { logTrace } from '../logger';
import { isTalkStageEnabled } from './commanderPoolRounds';

/**
 * Tells whether an orders consult for a mode makes and decides agreements.
 *
 * Purpose: Agreements are made in strategic talk and decided in strategic orders, so a battle makes and decides none and a run with talk off ignores them.
 * When to use: Every place that adds agreement rules or an agreement field to an orders consult, and `readActivePactPartnerSeatIds` with `strategic`. A battle's read-only view follows `sideAgreementsShownInBattle`.
 * Expected outcome: True only when `mode` is `strategic` and `isTalkStageEnabled()` is true.
 * Exceptions: None.
 */
export function sideAgreementsEnabled(mode: 'strategic' | 'tactical'): boolean {
  const enabled = mode === 'strategic' && isTalkStageEnabled();
  logTrace('sideAgreementGate sideAgreementsEnabled', { mode, enabled });
  return enabled;
}

/**
 * Tells whether a battle prompt shows the commander's agreements.
 *
 * Purpose: A battle prompt shows the commander's agreements with the side it is fighting, read-only. This does not add the agreement decisions field, which `sideAgreementsEnabled` still gates.
 * When to use: Adding the truce rules or the truce text to a prompt of a battle between two AI commanders.
 * Expected outcome: True only when `isTalkStageEnabled()` is true.
 * Exceptions: None.
 */
export function sideAgreementsShownInBattle(): boolean {
  const shown = isTalkStageEnabled();
  logTrace('sideAgreementGate sideAgreementsShownInBattle', { shown });
  return shown;
}
