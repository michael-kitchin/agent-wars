/**
 * The landings a seat could start, and the campaign cities it could turn to.
 *
 * Purpose: The turn advance and the briefing share one search, including units this tick has already released.
 * When to use: When a slot of either method may still be free, or when the briefing asks for land rows. The caller keeps its own early return when the land mass is missing.
 * Expected outcome: Sea rows first, then air rows, within the menu size. Land rows come first when the caller asked for them. Empty when every open method has no candidate and land was not asked for, the land mass is missing, or the search throws.
 * Exceptions: A thrown search is logged and returns an empty list.
 */

import type { GameStateSnapshot } from '../gameDb';
import { listUnitsForSnapshot } from '../gameDb';
import { logDebug, logError, logTrace } from '../logger';
import { CAMPAIGN_CONTACT_RADIUS } from '../openRouter/campaignRules';
import { campaignPlanForState, loadCampaignLandMass } from '../openRouter/campaignObjectiveFlow';
import { GAME_SIZE_MULTIPLIER, parseGameSize } from '../../shared/gameSize';
import type { Operation, OperationCandidate, OperationChoiceMethod, OperationMethod } from '../../shared/operationTypes';
import { listAirOperationCandidates } from './airOperationCandidates';
import { listLandOperationCandidates } from './landOperationCandidates';
import { buildLiftTerrain } from './liftTerrain';
import {
  OPERATION_MAX_AIR_PER_SIZE,
  OPERATION_MAX_SEA_PER_SIZE,
  OPERATION_MENU_AIR_ROWS,
  OPERATION_MENU_LAND_ROWS,
  OPERATION_MENU_SIZE,
} from './operationRules';
import { listSeaOperationCandidates } from './seaOperationCandidates';

/**
 * How many operations of one method this match allows one seat.
 *
 * Purpose: The launch and the menu stop at the same count for that method.
 * When to use: Before searching, and when the stored operations of that method already fill the match.
 * Expected outcome: The method's per-size cap times the match's size multiplier. An unknown size uses the small multiplier.
 * Exceptions: None.
 */
export function operationSlotsForState(state: GameStateSnapshot, method: OperationMethod): number {
  const perSize = method === 'air' ? OPERATION_MAX_AIR_PER_SIZE : OPERATION_MAX_SEA_PER_SIZE;
  const slots = perSize * GAME_SIZE_MULTIPLIER[parseGameSize(state.gameSize)];
  logTrace('operationCandidates operationSlotsForState', { gameSize: state.gameSize ?? null, method, slots });
  return slots;
}

/**
 * Land rows, then sea rows, with room left for the air rows that exist.
 *
 * Purpose: The menu stays within `OPERATION_MENU_SIZE`. An omitted land list keeps the sea-then-air cut.
 * When to use: After the searches, when the caller did not name one objective.
 * Expected outcome: Land candidates, then sea candidates cut to the places that remain, then the air candidates.
 * Exceptions: None.
 */
export function operationMenuRows(args: {
  readonly sea: readonly OperationCandidate[];
  readonly air: readonly OperationCandidate[];
  readonly land?: readonly OperationCandidate[];
}): OperationCandidate[] {
  const land = (args.land ?? []).slice(0, OPERATION_MENU_LAND_ROWS);
  const reserved = Math.min(OPERATION_MENU_AIR_ROWS, args.air.length);
  const sea = args.sea.slice(0, Math.max(0, OPERATION_MENU_SIZE - land.length - reserved));
  const rows = [...land, ...sea, ...args.air];
  logTrace('operationCandidates operationMenuRows', { land: land.length, sea: sea.length, air: args.air.length });
  return rows;
}

/**
 * Whether this method still has a free slot.
 *
 * Purpose: A full sea slot must not skip the air search, and a full air slot must not skip the sea search.
 * When to use: Before each method's search.
 * Expected outcome: True when the stored operations of that method are fewer than its slots.
 * Exceptions: None.
 */
function methodHasRoom(state: GameStateSnapshot, active: readonly Operation[], method: OperationMethod): boolean {
  const running = active.filter((operation) => operation.method === method).length;
  return running < operationSlotsForState(state, method);
}

/**
 * Lists the landings this seat could add.
 *
 * Purpose: One list feeds the engine's window and the commander's table.
 * When to use: Pass the operations still running and the units released earlier in this tick. Omit `withheldIds` when none were released. Pass `only` to test one named city. Pass `includeLand` for the commander's menu.
 * Expected outcome: The menu rows, or the named method's rows. A named land city is that one campaign row. Empty when the requested method's slots are full and land was not asked for, the land mass is missing, or the search throws.
 * Exceptions: None. A thrown error is logged and returns an empty list.
 */
export function operationCandidatesForSeat(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly active: readonly Operation[];
  readonly withheldIds?: ReadonlySet<string>;
  readonly includeLand?: boolean;
  readonly only?: { readonly objectiveH3: string; readonly method: OperationChoiceMethod };
}): OperationCandidate[] {
  logTrace('operationCandidates operationCandidatesForSeat', {
    seatId: args.seatId,
    active: args.active.length,
    withheld: args.withheldIds?.size ?? 0,
    includeLand: args.includeLand === true,
    only: args.only?.method ?? null,
  });
  try {
    const onlyLand = args.only?.method === 'land';
    const includeLand = args.includeLand === true && args.only === undefined;
    const seaOpen = methodHasRoom(args.state, args.active, 'sea');
    const airOpen = methodHasRoom(args.state, args.active, 'air');
    const searchSea = args.only === undefined ? seaOpen : args.only.method === 'sea' && seaOpen;
    const searchAir = args.only === undefined ? airOpen : args.only.method === 'air' && airOpen;
    if (!searchSea && !searchAir && !includeLand && !onlyLand) {
      logDebug('operationCandidates operationCandidatesForSeat', { seatId: args.seatId, skipped: 'slots' });
      return [];
    }
    const units = searchSea || searchAir ? listUnitsForSnapshot() : args.state.units;
    if (!searchSea && !includeLand && !onlyLand && !units.some((unit) => unit.player === args.seatId && unit.unitType === 'air')) {
      logDebug('operationCandidates operationCandidatesForSeat', { seatId: args.seatId, skipped: 'units' });
      return [];
    }
    const landMass = loadCampaignLandMass(args.seatId);
    if (landMass === null) {
      logDebug('operationCandidates operationCandidatesForSeat', { seatId: args.seatId, skipped: 'terrain' });
      return [];
    }
    const seen: GameStateSnapshot = { ...args.state, units };
    const terrain = buildLiftTerrain({ state: searchSea || searchAir ? seen : args.state, seatId: args.seatId, landMass });
    const landTerrain = includeLand || onlyLand
      ? buildLiftTerrain({ state: args.state, seatId: args.seatId, landMass })
      : terrain;
    const plan = campaignPlanForState(args.state);
    const protectedUnitIds = new Set<string>([...(plan?.defenderUnitIds ?? []), ...(args.withheldIds ?? [])]);
    for (const unit of seen.units) {
      if (unit.player !== args.seatId) continue;
      if (unit.unitType !== 'infantry' && unit.unitType !== 'armor') continue;
      if (terrain.enemyUnitsWithin(unit.h3Index, CAMPAIGN_CONTACT_RADIUS) > 0) protectedUnitIds.add(unit.id);
    }
    const onlyObjectiveH3 = args.only?.objectiveH3;
    const land = includeLand || onlyLand
      ? listLandOperationCandidates({
          state: args.state,
          seatId: args.seatId,
          landMass,
          terrain: landTerrain,
          onlyObjectiveH3: onlyLand ? onlyObjectiveH3 : undefined,
        })
      : [];
    if (onlyLand) return land;
    const sea = searchSea
      ? listSeaOperationCandidates({
          state: seen,
          seatId: args.seatId,
          landMass,
          terrain,
          active: args.active,
          protectedUnitIds,
          hasCampaignPlan: plan !== null,
          onlyObjectiveH3: args.only?.method === 'sea' ? onlyObjectiveH3 : undefined,
        })
      : [];
    const air = searchAir
      ? listAirOperationCandidates({
          state: seen,
          seatId: args.seatId,
          landMass,
          terrain,
          active: args.active,
          protectedUnitIds,
          onlyObjectiveH3: args.only?.method === 'air' ? onlyObjectiveH3 : undefined,
        })
      : [];
    if (args.only !== undefined) return args.only.method === 'air' ? air : sea;
    return operationMenuRows({ land: includeLand ? land : [], sea, air });
  } catch (err) {
    logError('operationCandidates operationCandidatesForSeat failed', { seatId: args.seatId }, err);
    return [];
  }
}
