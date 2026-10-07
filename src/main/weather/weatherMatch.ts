/**
 * Match-level weather questions: is the flag on, what is this hex this turn, how far can this unit move.
 *
 * Purpose: Validators, destinations, and dice share one reading of the snapshot and the climate pack.
 * When to use: Any main-process check that should slow a unit or cut an attack.
 * Expected outcome: The level off leaves printed movement and dice unchanged.
 * Exceptions: Climate-pack errors propagate from the loader.
 */

import type { BonusLevel } from '../../shared/bonusLevel';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { WeatherState } from '../../shared/weatherBonusTypes';
import {
  parseStartMonth,
  strategicFerryRangeHexes,
  strategicMovementHexesFor,
  weatherAttackPenalty,
  weatherBonusLevelOf,
} from '../../shared/weatherBonusRules';
import type { WeatherAttackKind, WeatherAttackPenalty } from '../../shared/weatherBonusTypes';
import { logTrace } from '../logger';
import { displayWeatherForHex } from './weatherPackLoad';

/**
 * The fields a strategic reach check needs from a unit.
 *
 * Purpose: Destinations and validators do not all carry the same row shape.
 * When to use: `strategicRangeOnState`.
 * Expected outcome: Type, current hex, and any tags already stamped on the snapshot.
 * Exceptions: None.
 */
export interface StrategicWeatherUnit {
  /**
   * Strategic unit type.
   *
   * Contract: Infantry, armor, naval, or air. Unknown types use the printed fallback.
   * When to use: Always.
   * Expected outcome: Selects the printed budget before weather.
   * Exceptions: None.
   */
  readonly unitType: string;
  /**
   * Hex the unit occupies now.
   *
   * Contract: Strategic index. Weather is read here, not at the destination.
   * When to use: Always.
   * Expected outcome: Snow or rain on this hex can shorten armor or naval movement.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Tags already on the snapshot row.
   *
   * Contract: Omitted when the flag is off or the row predates the field.
   * When to use: When the caller has the snapshot unit.
   * Expected outcome: A tag for the current weather cancels the penalty.
   * Exceptions: None.
   */
  readonly weatherTags?: readonly WeatherState[] | null;
}

/**
 * Returns the strategic movement of one unit on a snapshot.
 *
 * Purpose: Validation, destination search, and hover preview must agree, including the destination cache key.
 * When to use: With the snapshot the order is judged against.
 * Expected outcome: Printed hexes when the level is off. Otherwise the weather of the occupied hex, reduced for untagged armor and naval in slowing weather at the match's level.
 * Exceptions: None beyond pack load failures.
 */
export function strategicRangeOnState(
  unit: StrategicWeatherUnit,
  state: Pick<GameStateSnapshot, 'weatherBonusEnabled' | 'weatherBonusLevel' | 'turnNumber' | 'startMonth'>
): number {
  const level = weatherBonusLevelOf(state);
  logTrace('weatherMatch strategicRangeOnState', { unitType: unit.unitType, h3Index: unit.h3Index, level });
  const weather = level !== 'off' ? displayWeatherForHex(unit.h3Index, state.turnNumber, parseStartMonth(state.startMonth)) : null;
  return strategicMovementHexesFor({
    unitType: unit.unitType,
    weather,
    tags: unit.weatherTags,
    level,
  });
}

/**
 * Returns the attack penalty for one roll.
 *
 * Purpose: Ranged fire and air strikes subtract this before the origin bonus; `attackHitThreshold` floors the result at `MIN_ATTACK_HIT_THRESHOLD`.
 * When to use: When building a `CombatUnit` or an air-strike threshold, with the match's weather level.
 * Expected outcome: 0 when off or not penalized, 3 at Low, 5 at High. Melee callers must not use this.
 * Exceptions: None beyond pack load failures when a hex must be read.
 */
export function weatherPenaltyForRoll(input: {
  readonly unitType: string;
  readonly kind: WeatherAttackKind;
  readonly level: BonusLevel;
  readonly turnNumber: number;
  readonly startMonth: number;
  readonly unitH3Index: string;
  readonly targetH3Index?: string | null;
  readonly tags: readonly WeatherState[] | null | undefined;
}): WeatherAttackPenalty {
  logTrace('weatherMatch weatherPenaltyForRoll', { unitType: input.unitType, kind: input.kind, level: input.level });
  if (input.level === 'off') return 0;
  const startMonth = parseStartMonth(input.startMonth);
  return weatherAttackPenalty({
    unitType: input.unitType,
    kind: input.kind,
    level: input.level,
    weatherAtUnit: displayWeatherForHex(input.unitH3Index, input.turnNumber, startMonth),
    weatherAtTarget: input.targetH3Index ? displayWeatherForHex(input.targetH3Index, input.turnNumber, startMonth) : null,
    tags: input.tags,
  });
}

/**
 * Returns the strategic ferry range for one air unit and one destination.
 *
 * Purpose: A snow destination shortens the hop for an air unit that lacks the snow tag.
 * When to use: Ferry validation, resolution, previews, and tempo.
 * Expected outcome: 4 when the flag is off or the destination is not an untagged snow hex. Otherwise 2.
 * Exceptions: None beyond pack load failures.
 */
export function strategicFerryRangeOnState(
  unit: Pick<StrategicWeatherUnit, 'weatherTags'>,
  destinationH3Index: string,
  state: Pick<GameStateSnapshot, 'weatherBonusEnabled' | 'turnNumber' | 'startMonth'>
): number {
  logTrace('weatherMatch strategicFerryRangeOnState', { destinationH3Index, enabled: state.weatherBonusEnabled === true });
  const enabled = state.weatherBonusEnabled === true;
  return strategicFerryRangeHexes({
    weatherAtDestination: enabled ? displayWeatherForHex(destinationH3Index, state.turnNumber, parseStartMonth(state.startMonth)) : null,
    tags: unit.weatherTags,
    enabled,
  });
}
