/**
 * Doctrine blocks added after the shared strategy list.
 *
 * Purpose: Balanced, Aggressive, and Cautious each add one block. The campaign flag chooses the city those lines name.
 * When to use: The strategic and tactical context builders, immediately after `buildStrategyBlock`.
 * Expected outcome: One block. With the campaign on, the lines name the campaign target or staging hex. Otherwise they name the nearest enemy home region.
 * Exceptions: None.
 */

import type { Doctrine } from '../../../shared/seatRoster';
import { logTrace } from '../../logger';

/**
 * The doctrine block for one commander.
 *
 * Purpose: Taking the named city is the judgment the strategy list does not state. Balanced states the trade. Aggressive and Cautious state how far to push.
 * When to use: After `buildStrategyBlock` in both context builders. Pass the stored doctrine, not the choice, and whether this consult has a campaign.
 * Expected outcome: The block for that doctrine. `{objective}` is the campaign target or the nearest enemy home region. Cautious sends the spare force to the staging hex or toward that home region.
 * Exceptions: None.
 */
export function buildDoctrineBlock(doctrine: Doctrine, campaignEnabled: boolean): string {
  const objective = campaignEnabled ? 'the campaign target' : 'the nearest enemy home region';
  const gather = campaignEnabled ? 'to the campaign staging hex' : 'toward the nearest enemy home region';
  const block =
    doctrine === 'aggressive'
      ? `- Your doctrine is aggressive:
    (1) Advance on ${objective} from the first turn, and engage every enemy force you can reach on the way.
    (2) Accept losses when a trade gains ground, cities, or tempo. At your unit caps, a lost unit is usually rebuilt within a turn or two.
    (3) Strike enemy cities, airports, and seaports even when you cannot hold them; production you deny is production they lose.
    (4) Keep only enough force at home to stop a raid from taking it.`
      : doctrine === 'cautious'
        ? `- Your doctrine is cautious:
    (1) Hold your home region and the cities next to it, and send the rest ${gather}.
    (2) Attack only from cover or with your full massed force. Pull back exposed units rather than lose them.
    (3) Prefer a target an enemy is already fighting a third side for.`
        : `- Your doctrine is balanced:
    (1) Advance on ${objective} while your home cities are safe.
    (2) Trade a unit for a city when the odds favor you. At your unit caps, a lost unit is usually rebuilt within a turn or two, and a lost city is not.`;
  logTrace('promptSpec buildDoctrineBlock', { doctrine, campaignEnabled, included: block.length > 0 });
  return block;
}

/**
 * Doctrine block for a strategic consult, including production denial.
 *
 * Purpose: Balanced and cautious must name production denial without changing the block the tactical prompt prints.
 * When to use: `buildStrategicContextCoaching` only. Tactical consultations keep `buildDoctrineBlock`.
 * Expected outcome: The shared doctrine block, plus one denial line for balanced and one for cautious. Aggressive is unchanged.
 * Exceptions: None.
 */
export function buildStrategicDoctrineBlock(doctrine: Doctrine, campaignEnabled: boolean): string {
  const block = buildDoctrineBlock(doctrine, campaignEnabled);
  const extra =
    doctrine === 'cautious'
      ? '\n    (4) Strike enemy cities, airports, and seaports from range before you commit ground units.'
      : doctrine === 'aggressive'
        ? ''
        : '\n    (3) Strike the cities, airports, and seaports your ground units cannot reach. Production the enemy loses is force it cannot bring.';
  const result = `${block}${extra}`;
  logTrace('promptSpec buildStrategicDoctrineBlock', { doctrine, campaignEnabled, included: result.length > 0 });
  return result;
}
