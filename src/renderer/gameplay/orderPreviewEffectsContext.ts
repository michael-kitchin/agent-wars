/**
 * Builds the pure effects-tooltip input from the hover the player is aiming.
 *
 * Purpose: The formatter does not read renderer state. This module does, from data the client already has.
 * When to use: `publishHoverRoutePreview`, after the blocked message is known.
 * Expected outcome: A kind, the selected units' origin weather and tags, and the tactical ranged-cap slice when the order is a battle shot.
 * Exceptions: None.
 */

import type { OrderPreviewEffectsKind, OrderPreviewEffectsTooltipInput, OrderPreviewEffectsUnit } from '../../shared/orderPreviewEffectsTooltip';
import type { WeatherState } from '../../shared/weatherBonusTypes';
import { weatherBonusLevelOf } from '../../shared/weatherBonusRules';
import { rendererSharedState as S } from '../core/state';
import type { HoverRoutePreviewState } from '../core/types';

/**
 * Arguments for `buildOrderPreviewEffectsTooltipInput`.
 *
 * Purpose: The publisher already resolved the preview and whether it is blocked.
 * When to use: Only from `publishHoverRoutePreview`.
 * Expected outcome: The builder does not re-validate the order.
 * Exceptions: None.
 */
export type OrderPreviewEffectsContextArgs = {
  readonly preview: HoverRoutePreviewState;
  readonly hasBlockedMessage: boolean;
};

/**
 * Returns the effects-tooltip input for the current selection and hover preview.
 *
 * Purpose: Classifies march, ferry, air strike, and ranged attack the same way the preview was built.
 * When to use: When deciding whether `#order-slower-tooltip` has anything to say.
 * Expected outcome: Tactical ferry is still passed through; the formatter returns null for it. Strategic terrain is not consulted.
 * Exceptions: None.
 */
export function buildOrderPreviewEffectsTooltipInput(
  args: OrderPreviewEffectsContextArgs
): OrderPreviewEffectsTooltipInput {
  const kind = effectsKind(args.preview);
  const battle = S.tacticalBattleSnapshot;
  const levelSource = battle ?? S.gameState;
  return {
    kind,
    hasBlockedMessage: args.hasBlockedMessage,
    validForAll: args.preview.data.validForAll,
    level: weatherBonusLevelOf(levelSource ?? {}),
    units: effectsUnits(kind),
    destinationWeather: weatherAtHex(args.preview.hoveredH3Index),
    targetWeather: battle ? (battle.weather ?? null) : weatherAtHex(args.preview.hoveredH3Index),
    marchImpact: args.preview.data.orderPreviewTerrainImpact ?? null,
    rangedBattle: kind === 'ranged' ? battle : null,
    rangedPreviewUnitIds: args.preview.data.previews.map((row) => row.unitId),
  };
}

/**
 * Classifies the hover as the preview path already did.
 *
 * Purpose: Air strike and ranged modes win over march and ferry. All-air selections ferry. Everything else marches.
 * When to use: From `buildOrderPreviewEffectsTooltipInput`.
 * Expected outcome: A mixed air-and-ground selection is a march, not a ferry.
 * Exceptions: None.
 */
function effectsKind(preview: HoverRoutePreviewState): OrderPreviewEffectsKind {
  if (preview.renderAsSupportTargeting === 'ranged') return 'ranged';
  if (preview.renderAsSupportTargeting === 'air') return 'airStrike';
  const battle = S.tacticalBattleSnapshot;
  if (battle) {
    const selected = battle.subUnits.filter(
      (unit) => unit.player === 'human' && S.selectedUnitIds.includes(unit.id)
    );
    if (selected.length > 0 && selected.every((unit) => unit.unitType === 'air')) return 'tacticalFerry';
    return 'tacticalMarch';
  }
  const selected = strategicSelection();
  if (selected.length > 0 && selected.every((unit) => unit.unitType === 'air')) return 'strategicFerry';
  return 'strategicMarch';
}

/**
 * Lists the selected units with the weather where each one stands.
 *
 * Purpose: A strategic march uses the unit's current hex. A battle uses the battle's weather for every unit.
 * When to use: From `buildOrderPreviewEffectsTooltipInput`.
 * Expected outcome: Human units in the current selection only.
 * Exceptions: None.
 */
function effectsUnits(kind: OrderPreviewEffectsKind): OrderPreviewEffectsUnit[] {
  const battle = S.tacticalBattleSnapshot;
  if (battle && kind !== 'strategicMarch' && kind !== 'strategicFerry') {
    return battle.subUnits
      .filter((unit) => unit.player === 'human' && S.selectedUnitIds.includes(unit.id))
      .map((unit) => ({
        unitType: unit.unitType,
        originWeather: battle.weather ?? null,
        weatherTags: unit.weatherTags ?? [],
      }));
  }
  return strategicSelection().map((unit) => ({
    unitType: unit.unitType,
    originWeather: weatherAtHex(unit.h3Index),
    weatherTags: unit.weatherTags ?? [],
  }));
}

/**
 * Returns the human strategic units in the current selection.
 *
 * Purpose: Ferry detection and strategic weather both read this roster.
 * When to use: From `effectsKind` and `effectsUnits`.
 * Expected outcome: Empty when no game is loaded or nothing human is selected.
 * Exceptions: None.
 */
function strategicSelection(): { unitType: string; h3Index: string; weatherTags?: readonly WeatherState[] }[] {
  const ids = new Set(S.selectedUnitIds);
  return (S.gameState?.units ?? []).filter((unit) => unit.player === 'human' && ids.has(unit.id));
}

/**
 * Returns the explored weather stored on a world hex, if the snapshot has it.
 *
 * Purpose: Strategic ferry and air-strike targets use the hovered hex. Strategic marches use each unit's own hex.
 * When to use: From `effectsUnits` and the destination and target fields.
 * Expected outcome: Null when the hex is missing or has no weather.
 * Exceptions: None.
 */
function weatherAtHex(h3Index: string): WeatherState | null {
  return S.gameState?.hexes.find((hex) => hex.h3Index === h3Index)?.weather ?? null;
}
