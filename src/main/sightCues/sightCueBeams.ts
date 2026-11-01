import type { SightCueBeam } from '../../shared/ipc/sightCueTypes';
import { MISSILE_UNIT_TYPE } from '../../shared/missileRules';
import type { SeatId } from '../../shared/seatIds';
import { logDebug } from '../logger';
import { visibleHexesFromUnit } from '../visibility';

/**
 * A unit row sight cues can read without the rest of the snapshot.
 *
 * Contract: Planning-time vision only needs the owner, the type, and the hex.
 * When to use: The ready stage, passing the rows taken before resolution moves units.
 * Expected outcome: One row per live unit.
 * Exceptions: None.
 */
export interface SightCueUnit {
  /**
   * Stable unit id.
   *
   * Contract: The same id is what the seen-unit memory stores.
   * When to use: Marking a beam new or ongoing.
   * Expected outcome: A non-empty unit id.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * Owner id of the unit.
   *
   * Contract: Compared with the spotter seat. Any other owner is a target.
   * When to use: Choosing spotters and targets.
   * Expected outcome: A seat id or the Neutral owner id.
   * Exceptions: None.
   */
  readonly player: string;
  /**
   * Unit type name.
   *
   * Contract: Missiles do not spot. Any other known type uses that type's vision radius.
   * When to use: Filtering spotters.
   * Expected outcome: A unit type string such as `infantry` or `missile`.
   * Exceptions: None.
   */
  readonly unitType: string;
  /**
   * Hex the unit stands on at planning time.
   *
   * Contract: An air unit's hex is its base airport.
   * When to use: Grouping spotters and targets.
   * Expected outcome: A strategic hex index.
   * Exceptions: None.
   */
  readonly h3Index: string;
}

/**
 * The units, seats, map, and previous memory for one planning.
 *
 * Contract: Keeps `computeSightCueBeams` to one argument.
 * When to use: Once per strategic Ready, before transports unload.
 * Expected outcome: Spotter seats are the active AI seats, in seat order.
 * Exceptions: None.
 */
export interface SightCueBeamsInput {
  /**
   * Live units at planning time.
   *
   * Contract: Positions are before resolution moves them.
   * When to use: The ready stage's planning snapshot.
   * Expected outcome: One row per unit still on the map.
   * Exceptions: None.
   */
  readonly units: readonly SightCueUnit[];
  /**
   * Active AI seats, in seat order.
   *
   * Contract: Only these seats draw beams. Neutral is not included.
   * When to use: After `activeAiSeatIds`.
   * Expected outcome: Seat ids in roster order.
   * Exceptions: None.
   */
  readonly spotterSeatIds: readonly SeatId[];
  /**
   * Hexes that belong to the current map.
   *
   * Contract: Vision outside this set is dropped.
   * When to use: Pass the ordered hex list as a set.
   * Expected outcome: Every strategic hex index on the map.
   * Exceptions: None.
   */
  readonly mapHexSet: ReadonlySet<string>;
  /**
   * Unit ids each seat saw at the previous planning.
   *
   * Contract: A missing seat means every beam for that seat is new.
   * When to use: The stored `sight_cue_seen_units` row.
   * Expected outcome: Seat id to sorted unit ids.
   * Exceptions: None.
   */
  readonly previousSeenUnitIdsBySeat: Readonly<Record<string, readonly string[]>>;
}

/**
 * The lines to draw and the memory to store for the next turn.
 *
 * Contract: Beams are what the renderer plays. The memory is what makes the next turn's new contacts.
 * When to use: The ready stage after `computeSightCueBeams`.
 * Expected outcome: Beams are sorted by seat, then origin, then target. Seen ids are sorted per seat.
 * Exceptions: None.
 */
export interface SightCueBeamsResult {
  /**
   * Lines to draw, in seat order, then origin, then target.
   *
   * Contract: No beam starts and ends on the same hex.
   * When to use: Playback, after the viewer filter.
   * Expected outcome: Empty when nothing was seen in another hex.
   * Exceptions: None.
   */
  readonly beams: readonly SightCueBeam[];
  /**
   * Other owners' unit ids inside each seat's vision, including its own hex.
   *
   * Contract: Ids are sorted. A seat with no sightings maps to an empty list.
   * When to use: Writing the memory row.
   * Expected outcome: One list per spotter seat.
   * Exceptions: None.
   */
  readonly seenUnitIdsBySeat: Readonly<Record<string, readonly string[]>>;
}

/**
 * Groups units by the hex they stand on.
 *
 * Purpose: Targets and spotters in one hex share one lookup.
 * When to use: Once per call, before walking seats.
 * Expected outcome: Each hex maps to the units standing there, in input order.
 * Exceptions: None.
 */
function unitsByHex(units: readonly SightCueUnit[]): Map<string, SightCueUnit[]> {
  const grouped = new Map<string, SightCueUnit[]>();
  for (const unit of units) {
    const atHex = grouped.get(unit.h3Index);
    if (atHex) atHex.push(unit);
    else grouped.set(unit.h3Index, [unit]);
  }
  return grouped;
}

/**
 * Unions one seat's non-missile vision by the hex the spotter stands on.
 *
 * Purpose: Two spotters in one hex produce one set, and therefore one beam per target hex.
 * When to use: For each spotter seat.
 * Expected outcome: Each origin hex maps to the hexes any of its spotters can see.
 * Exceptions: Throws when a spotter's unit type is unknown to vision.
 */
function visibleHexesByOrigin(
  spotters: readonly SightCueUnit[],
  mapHexSet: ReadonlySet<string>
): Map<string, Set<string>> {
  const visibleByOrigin = new Map<string, Set<string>>();
  for (const spotter of spotters) {
    const visible = visibleByOrigin.get(spotter.h3Index) ?? new Set<string>();
    for (const hex of visibleHexesFromUnit(spotter, mapHexSet)) visible.add(hex);
    visibleByOrigin.set(spotter.h3Index, visible);
  }
  return visibleByOrigin;
}

/**
 * One seat's beams and the unit ids it saw.
 *
 * Purpose: A beam exists only between two different hexes, and only when the target hex holds another owner.
 * When to use: Once per spotter seat, in seat order.
 * Expected outcome: Beams sorted by origin, then target. Seen ids sorted. Same-hex enemies are remembered and draw nothing.
 * Exceptions: Throws when a spotter's unit type is unknown to vision.
 */
function beamsForSeat(
  seat: SeatId,
  byHex: ReadonlyMap<string, readonly SightCueUnit[]>,
  input: SightCueBeamsInput
): { readonly beams: SightCueBeam[]; readonly seen: readonly string[] } {
  const spotters = input.units.filter((unit) => unit.player === seat && unit.unitType !== MISSILE_UNIT_TYPE);
  const visibleByOrigin = visibleHexesByOrigin(spotters, input.mapHexSet);
  const previous = new Set(input.previousSeenUnitIdsBySeat[seat] ?? []);
  const seen = new Set<string>();
  const beams: SightCueBeam[] = [];
  const targetsAt = (hex: string): readonly SightCueUnit[] =>
    (byHex.get(hex) ?? []).filter((unit) => unit.player !== seat);
  for (const [origin, hexes] of visibleByOrigin) {
    for (const hex of hexes) {
      for (const target of targetsAt(hex)) seen.add(target.id);
      if (hex === origin) continue;
      const targets = targetsAt(hex);
      if (targets.length === 0) continue;
      beams.push({
        seatId: seat,
        fromH3Index: origin,
        toH3Index: hex,
        isNewContact: targets.some((target) => !previous.has(target.id)),
      });
    }
  }
  beams.sort((left, right) => left.fromH3Index.localeCompare(right.fromH3Index) || left.toH3Index.localeCompare(right.toH3Index));
  return { beams, seen: [...seen].sort() };
}

/**
 * The sight lines active AI seats would draw from this planning snapshot.
 *
 * Purpose: One beam per spotter hex and target hex, marked new when any target unit was unseen last turn.
 * When to use: At the start of strategic Ready, before resolution moves units.
 * Expected outcome: Beams in seat order, then origin, then target. `seenUnitIdsBySeat` holds every other owner's unit inside vision, including the spotter's own hex.
 * Exceptions: Throws when a spotter's unit type is unknown to vision. The ready stage catches that.
 */
export function computeSightCueBeams(input: SightCueBeamsInput): SightCueBeamsResult {
  logDebug('computeSightCueBeams', { unitCount: input.units.length, seatCount: input.spotterSeatIds.length });
  const byHex = unitsByHex(input.units);
  const beams: SightCueBeam[] = [];
  const seenUnitIdsBySeat: Record<string, readonly string[]> = {};
  for (const seat of input.spotterSeatIds) {
    const seatResult = beamsForSeat(seat, byHex, input);
    beams.push(...seatResult.beams);
    seenUnitIdsBySeat[seat] = seatResult.seen;
  }
  const newContactCount = beams.filter((beam) => beam.isNewContact).length;
  logDebug('computeSightCueBeams result', { beamCount: beams.length, newContactCount });
  return { beams, seenUnitIdsBySeat };
}
