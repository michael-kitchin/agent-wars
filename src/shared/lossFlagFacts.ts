/**
 * Birth records copied onto casualties so a loss line can show an origin flag.
 *
 * Purpose: The dialog names a unit from the casualty row. The flag needs the birth record even when
 *   that unit never stood in a hex the player could see.
 * When to use: When building a ready or battle casualty, and when attaching pre-turn records to those rows.
 * Expected outcome: A unit with a birth record keeps it. A unit without one is unchanged.
 * Exceptions: None.
 */

import type { RemovedUnitSnapshot } from './ipc/readyTypes';
import type { TechLevel } from './techBonusTypes';
import type { UnitOrigin } from './unitOriginTypes';
import type { WeatherState } from './weatherBonusTypes';

/**
 * Birth facts a loss line needs in order to draw a flag and its tooltip.
 *
 * Purpose: One value per unit id, captured before the unit row is deleted.
 * When to use: The value type of `buildLossFlagFacts` and the second argument of `withLossFlagFacts`.
 * Expected outcome: `origin` is present. The other fields are present only when they were known.
 * Exceptions: None.
 */
export interface LossFlagFacts {
  /**
   * Birth record used for the flag image and the Bonuses block.
   *
   * Contract: The same origin a live flag would show.
   * When to use: `withLossFlagFacts`.
   * Expected outcome: A `UnitOrigin` with a birth hex.
   * Exceptions: None.
   */
  readonly origin: UnitOrigin;
  /**
   * Strategic turn on which the unit was formed.
   *
   * Contract: Omitted when the source row had no formation turn.
   * When to use: The DOB line of the flag tooltip.
   * Expected outcome: A positive integer, or absent.
   * Exceptions: None.
   */
  readonly formedTurn?: number;
  /**
   * Acclimation tags of the birth hex.
   *
   * Contract: Present only when the weather bonus is on.
   * When to use: The Weather line of the flag tooltip.
   * Expected outcome: Zero to two of snow, rain, and heat.
   * Exceptions: None.
   */
  readonly weatherTags?: readonly WeatherState[];
  /**
   * Tech tier of the birth hex.
   *
   * Contract: Present only when the tech bonus is on.
   * When to use: The Tech line of the flag tooltip.
   * Expected outcome: `advanced` or `basic`.
   * Exceptions: None.
   */
  readonly techLevel?: TechLevel;
}

/**
 * A unit row that may carry a birth record.
 *
 * Purpose: Strategic snapshot units supply this shape. Tactical sub-units use `removedUnitSnapshot` instead.
 * When to use: `buildLossFlagFacts`.
 * Expected outcome: `id` identifies the casualty. `origin` is absent when the row has no birth record.
 * Exceptions: None.
 */
export interface LossFlagSourceUnit {
  /**
   * Unit id the casualty will use.
   *
   * Contract: Compared as a string. A later row with the same id replaces the earlier one.
   * When to use: The map key.
   * Expected outcome: The strategic id, or a tactical sub-unit id.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * Birth record, when this row has one.
   *
   * Contract: Absent means this id is omitted from the map.
   * When to use: Deciding whether a flag can be shown.
   * Expected outcome: The origin stored on the unit.
   * Exceptions: None.
   */
  readonly origin?: UnitOrigin;
  /**
   * Formation turn, when the row has one.
   *
   * Contract: A positive integer, or absent.
   * When to use: Copied onto the facts when `origin` is present.
   * Expected outcome: The strategic formation turn.
   * Exceptions: None.
   */
  readonly formedTurn?: number;
}

/**
 * Which bonus lines to copy, and how to read them from a birth hex.
 *
 * Purpose: Weather and tech are match options. The caller supplies the lookups so this module stays free of the database.
 * When to use: `buildLossFlagFacts`.
 * Expected outcome: A disabled option leaves that field off every record.
 * Exceptions: None.
 */
export interface LossFlagFactOptions {
  /**
   * Whether this match has the weather bonus on.
   *
   * Contract: True only when the persisted setting is exactly true.
   * When to use: Deciding whether to call `weatherTagsFor`.
   * Expected outcome: False omits `weatherTags`.
   * Exceptions: None.
   */
  readonly weatherEnabled: boolean;
  /**
   * Whether this match has the tech bonus on.
   *
   * Contract: True only when the persisted setting is exactly true.
   * When to use: Deciding whether to call `techLevelFor`.
   * Expected outcome: False omits `techLevel`.
   * Exceptions: None.
   */
  readonly techEnabled: boolean;
  /**
   * Reads acclimation tags for a birth hex.
   *
   * Contract: Called only when `weatherEnabled` is true and the unit has an origin.
   * When to use: The weather lookup already used for live snapshots.
   * Expected outcome: The tags for that hex. An empty list is kept.
   * Exceptions: None. The lookup must not throw.
   */
  readonly weatherTagsFor: (birthH3Index: string) => readonly WeatherState[];
  /**
   * Reads the tech tier for a birth hex.
   *
   * Contract: Called only when `techEnabled` is true and the unit has an origin.
   * When to use: The tech lookup already used for live snapshots.
   * Expected outcome: `advanced` or `basic`.
   * Exceptions: None. The lookup must not throw.
   */
  readonly techLevelFor: (birthH3Index: string) => TechLevel;
}

/**
 * Groups birth records by unit id for casualties that will be deleted before the dialog is built.
 *
 * Purpose: A fogged unit is still named when the player was in the fight. The dialog can show its flag only if this map still has the record.
 * When to use: Once, from the pre-combat unit list, before any casualty delete.
 * Expected outcome: One entry per unit that has an origin. Weather tags and tech tier are included only when that bonus is on.
 *   A unit with no origin is omitted. The returned tags are a copy.
 * Exceptions: None.
 */
export function buildLossFlagFacts(
  units: readonly LossFlagSourceUnit[],
  options: LossFlagFactOptions
): ReadonlyMap<string, LossFlagFacts> {
  const byId = new Map<string, LossFlagFacts>();
  for (const unit of units) {
    if (!unit.origin) continue;
    byId.set(unit.id, {
      origin: unit.origin,
      ...(typeof unit.formedTurn === 'number' ? { formedTurn: unit.formedTurn } : {}),
      ...(options.weatherEnabled ? { weatherTags: [...options.weatherTagsFor(unit.origin.birthH3Index)] } : {}),
      ...(options.techEnabled ? { techLevel: options.techLevelFor(unit.origin.birthH3Index) } : {}),
    });
  }
  return byId;
}

/**
 * Copies a birth record onto one casualty row.
 *
 * Purpose: Combat rows carry the id and the hex where the unit was lost, not the birth record.
 * When to use: Each removed unit on a ready result, using the pre-combat map.
 * Expected outcome: The same row when `facts` is missing. Otherwise the row plus origin, and the formation turn, weather tags, and tech tier when those were stored.
 *   Weather tags are a copy.
 * Exceptions: None.
 */
export function withLossFlagFacts<T extends object>(unit: T, facts: LossFlagFacts | undefined): T & Partial<LossFlagFacts> {
  if (!facts?.origin) return unit;
  return {
    ...unit,
    origin: facts.origin,
    ...(typeof facts.formedTurn === 'number' ? { formedTurn: facts.formedTurn } : {}),
    ...(facts.weatherTags ? { weatherTags: [...facts.weatherTags] } : {}),
    ...(facts.techLevel ? { techLevel: facts.techLevel } : {}),
  };
}

/**
 * A casualty row that may already carry the parent's birth record.
 *
 * Purpose: Tactical removals are built from the sub-unit, which already has the parent's origin.
 * When to use: `removedUnitSnapshot`.
 * Expected outcome: The fields a `RemovedUnitSnapshot` needs, plus any birth facts on the sub-unit.
 * Exceptions: None.
 */
export interface RemovedUnitSnapshotSource extends LossFlagSourceUnit {
  /**
   * The side that lost the unit.
   *
   * Contract: A seat id or the neutral owner id.
   * When to use: The casualty's `player`.
   * Expected outcome: Preserved verbatim.
   * Exceptions: None.
   */
  readonly player: string;
  /**
   * Combat type of the lost unit.
   *
   * Contract: A unit type string such as `air`.
   * When to use: The casualty's `unitType`.
   * Expected outcome: Preserved verbatim.
   * Exceptions: None.
   */
  readonly unitType: string;
  /**
   * Hex or cell where the loss is reported.
   *
   * Contract: An H3 index. For an air attacker this is the strike target, not the base.
   * When to use: The casualty's `h3Index`.
   * Expected outcome: Preserved verbatim.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Formation number used to name the unit.
   *
   * Contract: Omitted when the row has none.
   * When to use: Strategic casualties.
   * Expected outcome: Preserved when it is a number.
   * Exceptions: None.
   */
  readonly displayOrder?: number;
  /**
   * Label already chosen for this row.
   *
   * Contract: Omitted when the name is resolved later from the roster.
   * When to use: Tactical sub-unit labels.
   * Expected outcome: Preserved when non-empty.
   * Exceptions: None.
   */
  readonly displayName?: string;
  /**
   * Acclimation tags already on the row.
   *
   * Contract: Present when the source copied them from the parent.
   * When to use: Tactical sub-units. Strategic rows use `buildLossFlagFacts` instead.
   * Expected outcome: Copied when `origin` is present.
   * Exceptions: None.
   */
  readonly weatherTags?: readonly WeatherState[];
  /**
   * Tech tier already on the row.
   *
   * Contract: Present when the source copied it from the parent.
   * When to use: Tactical sub-units.
   * Expected outcome: Copied when `origin` is present.
   * Exceptions: None.
   */
  readonly techLevel?: TechLevel;
}

/**
 * Builds one casualty snapshot, including the birth record when the source has one.
 *
 * Purpose: Tactical loss lines name sub-units. The flag uses the parent origin already stored on that sub-unit.
 * When to use: Every tactical `removedUnits` push.
 * Expected outcome: The id, owner, type, hex, and any display name or order. Origin, weather tags, and tech tier are copied when present.
 *   A source with no origin produces a snapshot without those fields.
 * Exceptions: None.
 */
export function removedUnitSnapshot(row: RemovedUnitSnapshotSource): RemovedUnitSnapshot {
  const snapshot: RemovedUnitSnapshot = {
    id: row.id,
    player: row.player,
    unitType: row.unitType,
    h3Index: row.h3Index,
    ...(typeof row.displayOrder === 'number' ? { displayOrder: row.displayOrder } : {}),
    ...(row.displayName ? { displayName: row.displayName } : {}),
  };
  if (!row.origin) return snapshot;
  return withLossFlagFacts(snapshot, {
    origin: row.origin,
    ...(typeof row.formedTurn === 'number' ? { formedTurn: row.formedTurn } : {}),
    ...(row.weatherTags ? { weatherTags: row.weatherTags } : {}),
    ...(row.techLevel ? { techLevel: row.techLevel } : {}),
  });
}
