import { COUNTRY_FLAG_CLASS_NAME } from '../../shared/countryFlags';
import { originFlagAssetPath } from '../../shared/originArea';
import type { GameStateSnapshot } from '../../shared/ipc/gameStateTypes';
import { LOSS_CAUSE_KEYS, type TurnLossSummary } from '../../shared/lossSummary';
import { parseTacticalSubUnitId } from '../../shared/unitIds';
import { formatUnitOriginTooltipHtml, unitOriginsPresentTheSame } from '../../shared/unitOriginTooltipText';
import type { UnitOriginTooltipBonuses } from '../../shared/unitOriginTooltipText';
import type { UnitOrigin } from '../../shared/unitOriginTypes';
import type { TechLevel } from '../../shared/techBonusTypes';
import type { WeatherState } from '../../shared/weatherBonusTypes';
import { rendererSharedState as S } from './state';

/**
 * Birth origins of every unit seen in a snapshot this game, keyed by strategic unit id.
 *
 * Purpose: Lets unit labels show a country flag, including labels for units that have since been destroyed
 *   (loss toasts and tactical casualty rows). Only the flag helpers in this module read or write it.
 * When to use: Through `rememberUnitOrigins`, `resolveUnitOrigin`, and `clearRememberedUnitOrigins` only.
 * Expected outcome: Entries accumulate across snapshots and are never removed when a unit dies; the map is
 *   cleared on new game. Units without recorded origin data have no entry.
 * Exceptions: None.
 */
const unitOriginById = new Map<string, UnitOrigin>();

/**
 * Weather tags last seen for a birth hex.
 *
 * Purpose: A loss toast is built after the unit has left the snapshot, and tags come from the birth hex.
 * When to use: Written by `rememberUnitOrigins` and read when a flag is built for a unit that is already gone.
 * Expected outcome: Cleared with the origin cache on a new game.
 * Exceptions: None.
 */
const weatherTagsByBirthHex = new Map<string, readonly WeatherState[]>();

/**
 * Tech tier last seen for a birth hex.
 *
 * Purpose: A loss toast is built after the unit has left the snapshot, and the tier comes from the birth hex.
 * When to use: Written by `rememberUnitOrigins` and read when a flag is built for a unit that is already gone.
 * Expected outcome: Cleared with the origin cache on a new game. Absent when the match has tech off.
 * Exceptions: None.
 */
const techLevelByBirthHex = new Map<string, TechLevel>();

/**
 * Records the birth origin of every unit in a snapshot that carries one.
 *
 * Purpose: Fills the accumulating origin cache so unit labels can show flags, even after a unit is destroyed.
 * When to use: For every applied game-state snapshot, before unit labels are rendered.
 * Expected outcome: Each unit with `origin` has an entry. Weather tags are remembered by birth hex when the snapshot carries them. Existing entries are overwritten, never deleted.
 * Exceptions: None.
 */
export function rememberUnitOrigins(units: GameStateSnapshot['units']): void {
  for (const unit of units) {
    if (unit.origin) unitOriginById.set(unit.id, unit.origin);
    if (unit.origin?.birthH3Index && unit.weatherTags) {
      weatherTagsByBirthHex.set(unit.origin.birthH3Index, unit.weatherTags);
    }
    if (unit.origin?.birthH3Index && unit.techLevel) {
      techLevelByBirthHex.set(unit.origin.birthH3Index, unit.techLevel);
    }
  }
}

/**
 * Forgets every remembered unit origin.
 *
 * Purpose: Prevents a previous game's origins from attaching to reused unit ids in a new game.
 * When to use: When a new game starts, right before its first snapshot is remembered.
 * Expected outcome: The origin cache and the birth-hex weather-tag cache are empty.
 * Exceptions: None.
 */
export function clearRememberedUnitOrigins(): void {
  unitOriginById.clear();
  weatherTagsByBirthHex.clear();
  techLevelByBirthHex.clear();
}

/**
 * Looks up the birth origin for a strategic unit id or a tactical sub-unit id.
 *
 * Purpose: Tactical sub-units have no origin of their own; they share their parent unit's.
 * When to use: Before rendering a flag for a unit label.
 * Expected outcome: The remembered origin for the id, else the parent's origin for a sub-unit id, else `null`.
 * Exceptions: None.
 */
export function resolveUnitOrigin(unitId: string): UnitOrigin | null {
  const direct = unitOriginById.get(unitId);
  if (direct) return direct;
  const parentUnitId = parseTacticalSubUnitId(unitId)?.parentUnitId;
  return parentUnitId ? (unitOriginById.get(parentUnitId) ?? null) : null;
}

/**
 * Reads which bonus options this match selected.
 *
 * Purpose: The flag tooltip lists a bonus only when the match has that option on. The unit's place does not belong here.
 * When to use: `bonusesForLiveUnit` and `bonusesForAbsentUnit`.
 * Expected outcome: Each flag is true only when the snapshot field is exactly true. A missing game state leaves every option off.
 * Exceptions: None.
 */
function selectedBonusOptions(): Pick<UnitOriginTooltipBonuses, 'originEnabled' | 'terrainEnabled' | 'weatherEnabled' | 'techEnabled'> {
  const state = S.gameState;
  return {
    originEnabled: state?.originBonusEnabled === true,
    terrainEnabled: state?.terrainBonusEnabled === true,
    weatherEnabled: state?.weatherBonusEnabled === true,
    techEnabled: state?.techBonusEnabled === true,
  };
}

/**
 * Builds the Bonus block for a unit that is still on the map.
 *
 * Purpose: Origin and terrain come from the birth record. Weather tags come from the live row, then the birth-hex cache.
 * When to use: Live unit labels.
 * Expected outcome: Each selected option is enabled. The block does not change when the unit moves.
 * Exceptions: None.
 */
function bonusesForLiveUnit(unitId: string, origin: UnitOrigin): UnitOriginTooltipBonuses {
  const options = selectedBonusOptions();
  return {
    ...options,
    weatherTags: options.weatherEnabled ? weatherTagsFor(unitId, origin) : undefined,
    techLevel: techLevelFor(unitId, origin),
  };
}

/**
 * Builds the Bonus block for a flag whose unit is no longer standing anywhere.
 *
 * Purpose: A loss toast still names the bonuses the unit was born with.
 * When to use: Loss-toast flags.
 * Expected outcome: Selected options stay enabled. Weather tags are the ones remembered for the birth hex.
 * Exceptions: None.
 */
function bonusesForAbsentUnit(origin: UnitOrigin): UnitOriginTooltipBonuses {
  const options = selectedBonusOptions();
  return {
    ...options,
    weatherTags: options.weatherEnabled ? weatherTagsByBirthHex.get(origin.birthH3Index) ?? [] : undefined,
    techLevel: techLevelByBirthHex.get(origin.birthH3Index),
  };
}

/**
 * Reads the tech tier for a unit that may be a strategic unit or a battle sub-unit.
 *
 * Purpose: Battle labels use sub-unit ids. The tier follows the birth hex, including after the unit is gone.
 * When to use: From the live and absent bonus builders.
 * Expected outcome: The live row's tier, otherwise the tier remembered for that birth hex, otherwise none. The hex the unit occupies is not read.
 * Exceptions: None.
 */
function techLevelFor(unitId: string, origin: UnitOrigin): TechLevel | undefined {
  const battleUnit = S.tacticalBattleSnapshot?.subUnits.find((unit) => unit.id === unitId);
  if (battleUnit?.techLevel) return battleUnit.techLevel;
  const strategicUnit = S.gameState?.units.find((unit) => unit.id === unitId);
  if (strategicUnit?.techLevel) return strategicUnit.techLevel;
  return techLevelByBirthHex.get(origin.birthH3Index);
}

/**
 * Reads weather tags for a unit that may be a strategic unit or a battle sub-unit.
 *
 * Purpose: Battle labels use sub-unit ids, which are not rows in `state.units`. Both copies are the birth-hex tags.
 * When to use: From `bonusesForLiveUnit`.
 * Expected outcome: The birth-hex tags on the live row, otherwise the tags remembered for that birth hex, otherwise none. The hex the unit occupies is not read.
 * Exceptions: None.
 */
function weatherTagsFor(unitId: string, origin: UnitOrigin): readonly WeatherState[] {
  const battleUnit = S.tacticalBattleSnapshot?.subUnits.find((unit) => unit.id === unitId);
  if (battleUnit?.weatherTags) return battleUnit.weatherTags;
  const strategicUnit = S.gameState?.units.find((unit) => unit.id === unitId);
  if (strategicUnit?.weatherTags) return strategicUnit.weatherTags;
  return weatherTagsByBirthHex.get(origin.birthH3Index) ?? [];
}

/**
 * Builds the flag image placed before a unit's name.
 *
 * Purpose: One element shape for every unit-name surface, carrying the tooltip for the origin hover.
 * When to use: For DOM-built labels; the delegated origin tooltip reads `data-unit-origin-tooltip` on hover.
 * Expected outcome: A decorative, non-draggable `<img>` hidden from assistive tech, with the shared flag class
 *   and the placeholder flag when the origin has no country code with a vendored flag.
 * Exceptions: None.
 */
export function createUnitOriginFlagImage(input: {
  readonly origin: UnitOrigin;
  readonly bonuses: UnitOriginTooltipBonuses;
}): HTMLImageElement {
  const img = document.createElement('img');
  img.className = COUNTRY_FLAG_CLASS_NAME;
  img.src = originFlagAssetPath({
    subdivisionCode: input.origin.birthSubdivisionCode ?? null,
    countryCode: input.origin.birthCountryCode,
  });
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.draggable = false;
  img.dataset.unitOriginTooltip = formatUnitOriginTooltipHtml(input);
  return img;
}

/**
 * Builds a flag for a unit that is no longer on the map.
 *
 * Purpose: Loss toasts share the live tooltip, without an origin or terrain bonus for a unit that has nowhere to stand.
 * When to use: When a loss line names a victim whose origin is known.
 * Expected outcome: The victim's birth-country flag, with a tooltip of any remembered weather tags.
 * Exceptions: None.
 */
export function createAbsentUnitOriginFlagImage(origin: UnitOrigin): HTMLImageElement {
  return createUnitOriginFlagImage({ origin, bonuses: bonusesForAbsentUnit(origin) });
}

/**
 * Builds the Bonuses tooltip for a unit that is still on the map.
 *
 * Purpose: The map token has no flag element, so the hover uses the same HTML the flag stores.
 * When to use: When the pointer has rested on a single-unit token.
 * Expected outcome: The flag tooltip HTML, or null when the unit has no remembered origin.
 * Exceptions: None.
 */
export function formatLiveUnitOriginTooltipHtml(unitId: string): string | null {
  const origin = resolveUnitOrigin(unitId);
  if (!origin) return null;
  return formatUnitOriginTooltipHtml({ origin, bonuses: bonusesForLiveUnit(unitId, origin) });
}

/**
 * Replaces an element's content with a unit label, prefixed by the unit's flag when its origin is known.
 *
 * Purpose: The single helper every unit-name surface uses in place of assigning `textContent`.
 * When to use: For labels that start with a unit's full display name; `text` is the full existing label text.
 * Expected outcome: `target` holds an optional flag followed by one text node; units without a remembered
 *   origin render exactly as plain text did before. A selection count or an order target in `text` stays on the label.
 * Exceptions: None.
 */
export function setUnitNameContent(target: HTMLElement, unitId: string, text: string): void {
  target.replaceChildren();
  const origin = resolveUnitOrigin(unitId);
  if (origin) {
    target.appendChild(createUnitOriginFlagImage({
      origin,
      bonuses: bonusesForLiveUnit(unitId, origin),
    }));
  }
  target.appendChild(document.createTextNode(text));
}

/**
 * Maps each named victim of a turn's losses to its birth origin, for flags in the loss toast.
 *
 * Purpose: The toast is plain text built from display names, so its flags are matched by name.
 * When to use: Right before showing a map toast built from `summary`.
 * Expected outcome: One entry per victim display name whose unit id has a remembered origin. A name shared by
 *   victims whose origins would not show the same flag and tooltip is left out, so no flag is shown rather than a wrong one.
 * Exceptions: None.
 */
export function buildUnitOriginByLossDisplayName(summary: TurnLossSummary): ReadonlyMap<string, UnitOrigin> {
  const originByName = new Map<string, UnitOrigin>();
  const ambiguousNames = new Set<string>();
  const victims = [summary.human, summary.ai].flatMap((player) => LOSS_CAUSE_KEYS.flatMap((key) => player[key]));
  for (const victim of victims) {
    const origin = victim.unitId ? resolveUnitOrigin(victim.unitId) : null;
    if (!origin) continue;
    const existing = originByName.get(victim.displayName);
    if (existing && !unitOriginsPresentTheSame(existing, origin)) ambiguousNames.add(victim.displayName);
    else originByName.set(victim.displayName, origin);
  }
  for (const name of ambiguousNames) originByName.delete(name);
  return originByName;
}
