import {
  originBonusSettingsFromSnapshot,
  originBonusSources,
  strategicOriginBonusPlace,
  tacticalOriginBonusPlace,
} from '../../shared/originBonusRules';
import type { OriginBonusSource } from '../../shared/originBonusTypes';
import type { UnitOrigin } from '../../shared/unitOriginTypes';
import { rendererSharedState as S } from './state';

/**
 * Lists the origin bonuses a live unit has where it stands now.
 *
 * Purpose: The flag tooltip uses the same matcher as combat.
 * When to use: When building a flag for a unit that is still on the map. A missing unit, including one already
 *   removed for a loss toast, returns an empty list.
 * Expected outcome: A battle sub-unit is judged at its cell. A strategic unit is judged at its hex, so terrain never
 *   matches there. Empty when there is no game state or the unit is gone.
 * Exceptions: None.
 */
export function originBonusSourcesForUnit(unitId: string, origin: UnitOrigin): readonly OriginBonusSource[] {
  const state = S.gameState;
  if (!state) return [];
  const settings = originBonusSettingsFromSnapshot(state);
  const battle = S.tacticalBattleSnapshot;
  const subUnit = battle?.subUnits.find((u) => u.id === unitId);
  if (battle && subUnit) {
    return originBonusSources({
      settings,
      theater: 'tactical',
      origin,
      place: tacticalOriginBonusPlace(battle, subUnit.h3Index),
    });
  }
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return [];
  return originBonusSources({
    settings,
    theater: 'strategic',
    origin,
    place: strategicOriginBonusPlace(state, unit.h3Index),
  });
}
