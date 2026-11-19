/**
 * The one switch that says whether an orders consult uses agreements.
 *
 * Purpose: The message rules, the Messages section, the orders contract text, and the orders schema all follow this switch, so they cannot disagree.
 * When to use: Building a strategic or tactical orders prompt or schema.
 * Expected outcome: Agreements are used on the world map while the talk stage is enabled, and never in a battle.
 * Exceptions: None.
 */

import { logTrace } from '../logger';
import { isTalkStageEnabled } from './commanderPoolRounds';

/**
 * Tells whether an orders consult for a mode uses agreements.
 *
 * Purpose: Agreements are made in strategic talk and decided in strategic orders, so a battle and a run with talk off ignore them.
 * When to use: Every place that adds agreement text or an agreement field to an orders consult.
 * Expected outcome: True only when `mode` is `strategic` and `isTalkStageEnabled()` is true.
 * Exceptions: None.
 */
export function sideAgreementsEnabled(mode: 'strategic' | 'tactical'): boolean {
  const enabled = mode === 'strategic' && isTalkStageEnabled();
  logTrace('sideAgreementGate sideAgreementsEnabled', { mode, enabled });
  return enabled;
}
