import {
  formatOriginBonusTooltipLine,
  originBonusSettingsFromSnapshot,
  originBonusSources,
  strategicOriginBonusPlace,
  tacticalOriginBonusPlace,
} from '../../shared/originBonusRules';
import type { UnitOrigin } from '../../shared/unitOriginTypes';
import { rendererSharedState as S } from './state';

/**
 * Builds the `Bonus: +1 (...)` tooltip line for a unit where it stands now.
 *
 * Purpose: The flag tooltip tells the player when a unit rolls with the origin bonus, using the same matcher as
 * combat.
 * When to use: When building a flag for a live unit label. Loss toasts do not call this; dead units roll nothing.
 * Expected outcome: A battle sub-unit is judged at its cell (country and terrain); otherwise a strategic unit is
 * judged at its hex (country only). Null when there is no game state, the id is not a live unit, or nothing applies.
 * `origin` is the caller's already resolved origin; for sub-units it matches the copy combat reads from the battle.
 * Exceptions: None.
 */
export function originBonusTooltipLineForUnit(unitId: string, origin: UnitOrigin): string | null {
  const state = S.gameState;
  if (!state) return null;
  const settings = originBonusSettingsFromSnapshot(state);
  if (!settings.countryBonusEnabled && !settings.terrainBonusEnabled) return null;
  const battle = S.tacticalBattleSnapshot;
  const subUnit = battle?.subUnits.find((u) => u.id === unitId);
  if (battle && subUnit) {
    return formatOriginBonusTooltipLine(
      originBonusSources({
        settings,
        theater: 'tactical',
        origin,
        place: tacticalOriginBonusPlace(battle, subUnit.h3Index),
      })
    );
  }
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return null;
  return formatOriginBonusTooltipLine(
    originBonusSources({
      settings,
      theater: 'strategic',
      origin,
      place: strategicOriginBonusPlace(state, unit.h3Index),
    })
  );
}
