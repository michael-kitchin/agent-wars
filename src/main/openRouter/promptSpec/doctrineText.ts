/**
 * Aggressive and Cautious blocks added after the shared strategy list.
 *
 * Purpose: Balanced is that shared list and adds nothing. The other two doctrines add one block.
 * When to use: The strategic and tactical context builders, immediately after `STRATEGY_BLOCK`.
 * Expected outcome: The block text, or an empty string for Balanced. An empty string adds no line.
 * Exceptions: None.
 */

import type { Doctrine } from '../../../shared/seatRoster';
import { logTrace } from '../../logger';

const AGGRESSIVE_BLOCK = `- Your doctrine is aggressive:
    (1) Seize the initiative from the first turn: advance on the nearest enemy home region and engage every enemy force you can reach.
    (2) Accept losses when a trade gains ground, cities, or tempo. Do not hold units back to preserve them.
    (3) Strike enemy cities, airports, and seaports even when you cannot hold them; production you deny is production they lose.
    (4) Keep only enough force at home to stop a raid from taking it.`;

const CAUTIOUS_BLOCK = `- Your doctrine is cautious:
    (1) Secure your home region and the cities next to it before you advance.
    (2) Fight only from cover or with clear superiority. Pull back exposed units rather than lose them.
    (3) Build up production and forces first. Attack an enemy that is already weakened or busy fighting another side.`;

/**
 * The doctrine block for one commander, or an empty string for Balanced.
 *
 * Purpose: Aggressive and Cautious add judgment the shared strategy list does not state. Balanced is that list.
 * When to use: After `STRATEGY_BLOCK` in both context builders. Pass the stored doctrine, not the choice.
 * Expected outcome: The aggressive or cautious block, or `''` for `'balanced'`.
 * Exceptions: None.
 */
export function buildDoctrineBlock(doctrine: Doctrine): string {
  const block = doctrine === 'aggressive' ? AGGRESSIVE_BLOCK : doctrine === 'cautious' ? CAUTIOUS_BLOCK : '';
  logTrace('promptSpec buildDoctrineBlock', { doctrine, included: block.length > 0 });
  return block;
}
