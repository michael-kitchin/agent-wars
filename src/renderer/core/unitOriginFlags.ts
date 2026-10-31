import { COUNTRY_FLAG_CLASS_NAME } from '../../shared/countryFlags';
import { originFlagAssetPath } from '../../shared/originArea';
import { indexLossFlagsByOwner } from '../../shared/lossFlagIndex';
import { LOSS_CAUSE_KEYS, type TurnLossSummary } from '../../shared/lossSummary';
import { parseTacticalSubUnitId } from '../../shared/unitIds';
import { formatGameDateForTurn, gameCalendarKindForMap } from '../../shared/gameCalendar';
import { formationTurnForUnit, formatUnitOriginTooltipHtml, unitOriginsPresentTheSame } from '../../shared/unitOriginTooltipText';
import type { UnitOriginTooltipBonuses, UnitOriginTooltipIdentity } from '../../shared/unitOriginTooltipText';
import type { UnitOrigin } from '../../shared/unitOriginTypes';
import type { TechLevel } from '../../shared/techBonusTypes';
import type { WeatherState } from '../../shared/weatherBonusTypes';
import { isHireableUnitType, mercenaryTooltipValue, mercenaryUpkeepFor, neutralUnitOfferedForRehire } from '../../shared/mercenaryRules';
import { findHumanSeat } from '../../shared/seatRoster';
import { abbreviatedSideName } from '../../shared/sideLabels';
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
 * Formation turn last seen for a strategic unit id.
 *
 * Purpose: The DOB line survives after the unit leaves the snapshot, including a loss toast.
 * When to use: Written by `rememberUnitOrigins` and read by `formedLabelFor`.
 * Expected outcome: Cleared with the origin cache on a new game. A tactical id is not stored; the parent id is.
 * Exceptions: None.
 */
const formedTurnById = new Map<string, number>();

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
 * When to use: For every applied game-state snapshot, before unit labels are rendered, and for the casualties of a turn update before its flags are drawn.
 * Expected outcome: Each unit with `origin` has an entry. A numeric `formedTurn` is remembered by unit id. Weather tags and tech tier are remembered by birth hex when the snapshot carries them. Existing entries are overwritten, never deleted. Casualty rows from a ready result are remembered the same way, so a unit the player had not seen still gets a flag.
 * Exceptions: None.
 */
export function rememberUnitOrigins(units: readonly {
  readonly id: string;
  readonly origin?: UnitOrigin;
  readonly formedTurn?: number;
  readonly weatherTags?: readonly WeatherState[];
  readonly techLevel?: TechLevel;
}[]): void {
  for (const unit of units) {
    if (unit.origin) unitOriginById.set(unit.id, unit.origin);
    if (typeof unit.formedTurn === 'number') formedTurnById.set(unit.id, unit.formedTurn);
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
 * Expected outcome: The origin cache, the formation-turn cache, the birth-hex weather-tag cache, and the birth-hex tech cache are empty.
 * Exceptions: None.
 */
export function clearRememberedUnitOrigins(): void {
  unitOriginById.clear();
  formedTurnById.clear();
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
 * Formats the formation date for a unit that may be a tactical sub-unit.
 *
 * Purpose: The DOB line uses the strategic calendar of the loaded map.
 * When to use: Live flags and loss-toast flags.
 * Expected outcome: Null when no formation turn was remembered or no game state is loaded.
 * Exceptions: None.
 */
function formedLabelFor(unitId: string): string | null {
  const formedTurn = formationTurnForUnit(unitId, formedTurnById);
  const state = S.gameState;
  if (formedTurn == null || !state) return null;
  return formatGameDateForTurn(formedTurn, state.startMonth, gameCalendarKindForMap(state.gameMap?.id ?? 'global'));
}

/**
 * Builds the Unit and DOB lines for a unit that is still identified by id.
 *
 * Purpose: The Unit line must be the display name, not a label that also carries a selection count.
 * When to use: Live flags and the one-unit map token.
 * Expected outcome: The lookup name, which may be empty, the formation label, which may be null, and the Mercenary value when this unit has one.
 * Exceptions: None.
 */
function tooltipIdentityFor(unitId: string): UnitOriginTooltipIdentity {
  const mercenaryValue = mercenaryValueForLiveUnit(unitId);
  return {
    displayName: S.unitDisplayNameById.get(unitId) ?? '',
    formedLabel: formedLabelFor(unitId),
    ...(mercenaryValue != null ? { mercenaryValue } : {}),
  };
}

/**
 * The seat the Mercenary line treats as the current player.
 *
 * Purpose: Upkeep is shown only for that seat's mercenaries.
 * When to use: `mercenaryValueForLiveUnit`.
 * Expected outcome: The human seat from `findHumanSeat`. Null when the match has no human seat.
 * Exceptions: None.
 */
function mercenaryTooltipViewerSeatId(): string | null {
  return findHumanSeat(S.gameState?.seats ?? [])?.seatId ?? null;
}

/**
 * Short name of the seat that owns a unit.
 *
 * Purpose: Another side's mercenary tooltip uses the same abbreviation as the top bar.
 * When to use: `mercenaryValueForLiveUnit` when the owner is not the viewer.
 * Expected outcome: `abbreviatedSideName` of that seat. Null when the owner is not a seat.
 * Exceptions: None.
 */
function mercenaryOwnerShortName(ownerId: string): string | null {
  const seat = S.gameState?.seats?.find((row) => row.seatId === ownerId);
  return seat ? abbreviatedSideName(seat) : null;
}

/**
 * Whether another side's fortifications block rehire on this strategic hex.
 *
 * Purpose: The For Hire line follows the Hire tab's fortification rule.
 * When to use: `mercenaryValueForLiveUnit` for a Neutral unit.
 * Expected outcome: True when the hex has fortifications and the viewer does not control it. A match with no human seat treats any fortification as another side's.
 * Exceptions: None.
 */
function hexFortifiedByAnotherSide(h3Index: string, viewerSeatId: string | null): boolean {
  const infra = S.gameState?.strategicInfrastructure?.find((row) => row.h3Index === h3Index);
  if ((infra?.fortifiedCount ?? 0) <= 0) return false;
  if (viewerSeatId == null) return true;
  const controller = S.gameState?.strategicControl?.find((row) => row.h3Index === h3Index)?.controllerPlayerId ?? null;
  return controller !== viewerSeatId;
}

/**
 * Whether a ship still has cargo assigned.
 *
 * Purpose: A loaded Neutral ship is not offered for rehire.
 * When to use: `mercenaryValueForLiveUnit` with the strategic unit id.
 * Expected outcome: True when any live unit lists this id as its carrier.
 * Exceptions: None.
 */
function shipIsCarryingCargo(unitId: string): boolean {
  return (S.gameState?.units ?? []).some((unit) => unit.embarkedOnNavalUnitId === unitId);
}

/**
 * The unit the tooltip describes, and its strategic row when this id is a battle sub-unit.
 *
 * Purpose: Upkeep and ownership come from the unit on screen. Rehire uses the strategic ship, cargo, and hex.
 * When to use: `mercenaryValueForLiveUnit`.
 * Expected outcome: The battle sub-unit when one exists, otherwise the strategic unit. Null when neither snapshot has the id.
 * Exceptions: None.
 */
function tooltipUnitFacts(unitId: string): {
  readonly shown: { readonly player: string; readonly unitType: string; readonly techLevel?: TechLevel; readonly isMercenary?: boolean };
  readonly placed: { readonly id: string; readonly player: string; readonly unitType: string; readonly h3Index: string; readonly embarkedOnNavalUnitId?: string | null } | null;
} | null {
  const battle = S.tacticalBattleSnapshot?.subUnits.find((unit) => unit.id === unitId);
  const strategicId = parseTacticalSubUnitId(unitId)?.parentUnitId ?? unitId;
  const strategic = S.gameState?.units.find((unit) => unit.id === strategicId) ?? null;
  if (battle) return { shown: battle, placed: strategic };
  if (!strategic) return null;
  return { shown: strategic, placed: strategic };
}

/**
 * The Mercenary line for a unit that is still on the map.
 *
 * Purpose: The current player's mercenary keeps its upkeep. Another side's mercenary names that side. A Neutral unit `neutralUnitOfferedForRehire` accepts says it is for hire.
 * When to use: `tooltipIdentityFor`.
 * Expected outcome: The formatted value, or null when this unit has no Mercenary line.
 * Exceptions: None.
 */
function mercenaryValueForLiveUnit(unitId: string): string | null {
  const facts = tooltipUnitFacts(unitId);
  if (!facts) return null;
  const viewerSeatId = mercenaryTooltipViewerSeatId();
  const shown = facts.shown;
  const isMercenary = shown.isMercenary === true && isHireableUnitType(shown.unitType);
  const upkeep = isMercenary ? mercenaryUpkeepFor(shown.unitType, shown.techLevel) : null;
  const placed = facts.placed;
  const forHire = placed != null && neutralUnitOfferedForRehire({
    ownerId: placed.player,
    unitType: placed.unitType,
    embarked: (placed.embarkedOnNavalUnitId ?? '').length > 0,
    carryingCargo: shipIsCarryingCargo(placed.id),
    fortifiedByAnotherSide: hexFortifiedByAnotherSide(placed.h3Index, viewerSeatId),
  });
  return mercenaryTooltipValue({
    ownerId: shown.player,
    viewerSeatId,
    isMercenary,
    forHire,
    upkeep,
    ownerShortName: mercenaryOwnerShortName(shown.player),
  });
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
  readonly identity?: UnitOriginTooltipIdentity;
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
  img.dataset.unitOriginTooltip = formatUnitOriginTooltipHtml({
    origin: input.origin,
    bonuses: input.bonuses,
    ...(input.identity ? { identity: input.identity } : {}),
  });
  return img;
}

/**
 * Birth origin and formation date for one loss-toast victim.
 *
 * Purpose: The toast matches victims by display name, and the flag tooltip needs both facts.
 * When to use: The value type of `buildUnitOriginByLossDisplayName`.
 * Expected outcome: One origin and a formation label that may be null.
 * Exceptions: None.
 */
export interface LossFlagIdentity {
  /**
   * Birth record used for the flag image and the Bonuses block.
   *
   * Contract: The same origin the live flag would show.
   * When to use: `createAbsentUnitOriginFlagImage`.
   * Expected outcome: A remembered `UnitOrigin`.
   * Exceptions: None.
   */
  readonly origin: UnitOrigin;
  /**
   * Formation date of the victim, or of its parent strategic unit.
   *
   * Contract: Null when the formation turn was not remembered.
   * When to use: The DOB line.
   * Expected outcome: A formatted date, or null.
   * Exceptions: None.
   */
  readonly formedLabel: string | null;
}

/**
 * Builds a flag for a unit that is no longer on the map.
 *
 * Purpose: Loss toasts share the live tooltip, including the victim's name and formation date.
 * When to use: When a loss line names a victim whose origin is known.
 * Expected outcome: The victim's birth-country flag. The tooltip names the victim and the formation date when one was remembered.
 * Exceptions: None.
 */
export function createAbsentUnitOriginFlagImage(flag: LossFlagIdentity, displayName: string): HTMLImageElement {
  return createUnitOriginFlagImage({
    origin: flag.origin,
    bonuses: bonusesForAbsentUnit(flag.origin),
    identity: { displayName, formedLabel: flag.formedLabel },
  });
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
  return formatUnitOriginTooltipHtml({
    origin,
    bonuses: bonusesForLiveUnit(unitId, origin),
    identity: tooltipIdentityFor(unitId),
  });
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
      identity: tooltipIdentityFor(unitId),
    }));
  }
  target.appendChild(document.createTextNode(text));
}

/**
 * Maps each named victim of a turn's losses to its birth origin, for flags in the loss toast.
 *
 * Purpose: The toast is plain text built from display names, so its flags are matched by the side that lost the unit and that name.
 * When to use: Right before showing a map toast built from `summary`.
 * Expected outcome: One inner map per owner. A name is kept when every remembered origin for that owner and name would show the same flag.
 *   A disagreement omits that name for that owner only. A victim with no remembered origin is skipped.
 * Exceptions: None.
 */
export function buildUnitOriginByLossDisplayName(
  summary: TurnLossSummary
): ReadonlyMap<string, ReadonlyMap<string, LossFlagIdentity>> {
  const rows = Object.entries(summary.byOwner).flatMap(([ownerId, player]) =>
    LOSS_CAUSE_KEYS.flatMap((key) => player[key]).map((victim) => {
      const origin = victim.unitId ? resolveUnitOrigin(victim.unitId) : null;
      const value = origin && victim.unitId ? { origin, formedLabel: formedLabelFor(victim.unitId) } : null;
      return { ownerId, name: victim.displayName, value };
    })
  );
  return indexLossFlagsByOwner(rows, (left, right) =>
    unitOriginsPresentTheSame(left.origin, right.origin) && left.formedLabel === right.formedLabel
  );
}
