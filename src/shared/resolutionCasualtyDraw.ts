/**
 * Which removed units stay on the map during one resolution playback.
 *
 * Purpose: Air-strike, ranged, and melee removals share one rule for both the strategic and tactical draw paths.
 * When to use: From the playback draw, once per frame, and from the playback march filter.
 * Expected outcome: A removed icon disappears when its destruction mark ends, and a march glides only when that unit reached the destination.
 * Exceptions: None.
 */

import type { ResolutionPlaybackPhase } from './resolutionPlaybackPhase';

/**
 * One unit row the casualty draw can place or hide.
 *
 * Purpose: Carries the fields the icon layer needs without depending on a full game-state unit.
 * When to use: Removal snapshots and the icons already chosen for the current frame.
 * Expected outcome: `h3Index` is the hex where that row should be drawn.
 * Exceptions: None.
 */
export interface ResolutionCasualtyUnit {
  /**
   * Stable unit id for this playback.
   *
   * Contract: Matches march `unitId` and removal snapshot `id`.
   * When to use: When deciding whether this row is a removal or a survivor.
   * Expected outcome: One id is drawn at most once.
   * Exceptions: None.
   */
  id: string;
  /**
   * Owning player, copied onto a replaced removal icon.
   *
   * Contract: The removal snapshot wins over a stale row already in the draw list.
   * When to use: When the icon layer colors the marker.
   * Expected outcome: The snapshot's player.
   * Exceptions: None.
   */
  player: string;
  /**
   * Unit type, copied onto a replaced removal icon.
   *
   * Contract: The removal snapshot wins over a stale row already in the draw list.
   * When to use: When the icon layer chooses the glyph.
   * Expected outcome: The snapshot's unit type.
   * Exceptions: None.
   */
  unitType: string;
  /**
   * Hex where this row is drawn.
   *
   * Contract: For a removal, the draw function may replace this with the march origin before melee.
   * When to use: When placing the icon.
   * Expected outcome: The hex for this timing.
   * Exceptions: None.
   */
  h3Index: string;
}

/**
 * Removals for one playback, split by the stage that removed them.
 *
 * Purpose: An id in an earlier list keeps that list's timing even if a later list repeats it.
 * When to use: Built from the animation's air, ranged, and melee removal arrays. Missing arrays are empty.
 * Expected outcome: Each array is the snapshots for that stage.
 * Exceptions: None.
 */
export interface ResolutionCasualtyDrawInput {
  /**
   * Units removed in the air-strike stage.
   *
   * Contract: These ids stay visible only through air casualties.
   * When to use: Strategic air-phase removals, or tactical rows whose ids are air-strike kills.
   * Expected outcome: Empty when this playback removed nobody in that stage.
   * Exceptions: None.
   */
  airRemovedUnits: readonly ResolutionCasualtyUnit[];
  /**
   * Units removed in the ranged stage, including return fire.
   *
   * Contract: An id that is also in `airRemovedUnits` follows the air-strike rule.
   * When to use: The animation's ranged removal list, even when it also contains air-phase rows.
   * Expected outcome: Ids that are only in this list stay visible through ranged casualties.
   * Exceptions: None.
   */
  rangedRemovedUnits: readonly ResolutionCasualtyUnit[];
  /**
   * Units removed in the melee stage.
   *
   * Contract: An id that is also in an earlier list follows the earlier list.
   * When to use: The animation's melee removal list. `h3Index` is the hex where melee removed the unit.
   * Expected outcome: A melee-only id stays visible through melee casualties.
   * Exceptions: None.
   */
  meleeRemovedUnits: readonly ResolutionCasualtyUnit[];
}

/**
 * Where the playback clock is for casualty icons.
 *
 * Purpose: Collapses the playback flags into the windows a removed icon is allowed to occupy.
 * When to use: The result of `resolutionCasualtyTiming`.
 * Expected outcome: One of the six timings below.
 * Exceptions: None.
 */
export type ResolutionCasualtyTiming =
  | 'throughAirCasualties'
  | 'airReturn'
  | 'throughRangedCasualties'
  | 'movement'
  | 'throughMeleeCasualties'
  | 'afterCasualties';

/**
 * One march the playback might glide.
 *
 * Purpose: Gives the march filter the origin and destination it compares to a melee removal hex.
 * When to use: Resolution march rows before they are drawn.
 * Expected outcome: `fromH3Index` is the pre-move hex and `toH3Index` is the recorded destination.
 * Exceptions: None.
 */
export interface ResolutionCasualtyMarch {
  /**
   * Unit that owns this march.
   *
   * Contract: Compared to removal snapshot ids.
   * When to use: When deciding whether this march glides.
   * Expected outcome: The same id the icon layer uses.
   * Exceptions: None.
   */
  unitId: string;
  /**
   * Hex the march starts on.
   *
   * Contract: A melee removal on this hex did not leave it.
   * When to use: When comparing a melee removal hex.
   * Expected outcome: The pre-move hex.
   * Exceptions: None.
   */
  fromH3Index: string;
  /**
   * Hex the march records as its end.
   *
   * Contract: A melee removal on this hex reached it.
   * When to use: When comparing a melee removal hex.
   * Expected outcome: The recorded destination, not a hex invented from a partial path.
   * Exceptions: None.
   */
  toH3Index: string;
}

/**
 * Icons already chosen for this frame, plus the removals and marches that can change them.
 *
 * Purpose: Keeps `unitsDrawnAtCasualtyTiming` on one argument object.
 * When to use: After a playback branch has placed survivors and any strikers.
 * Expected outcome: The function reads every field and does not mutate the arrays.
 * Exceptions: None.
 */
export interface UnitsDrawnAtCasualtyTimingArgs {
  /**
   * Icons the caller has already chosen, in draw order.
   *
   * Contract: A removed id already here keeps this position. A later duplicate of that id is dropped.
   * When to use: Pass the branch's `unitsToDraw`.
   * Expected outcome: Survivors stay in this order.
   * Exceptions: None.
   */
  units: readonly ResolutionCasualtyUnit[];
  /**
   * Playback window for this frame.
   *
   * Contract: A value from `resolutionCasualtyTiming`.
   * When to use: Once the phase flags are known.
   * Expected outcome: Removed icons outside their window are omitted.
   * Exceptions: None.
   */
  timing: ResolutionCasualtyTiming;
  /**
   * Air, ranged, and melee removals for this playback.
   *
   * Contract: The same input passed to `marchPlayedForUnit`.
   * When to use: Built once per frame from the animation.
   * Expected outcome: Missing stages are empty arrays.
   * Exceptions: None.
   */
  input: ResolutionCasualtyDrawInput;
  /**
   * Marches recorded for this playback.
   *
   * Contract: Used only to place a melee arrival back on its origin before the melee window.
   * When to use: Pass `anim.moves`.
   * Expected outcome: The first march for an id supplies `fromH3Index`.
   * Exceptions: None.
   */
  moves: readonly ResolutionCasualtyMarch[];
  /**
   * Hexes where a removed icon must not appear.
   *
   * Contract: Survivors are kept even when their hex is listed.
   * When to use: Pass the animation's unknown casualty hexes.
   * Expected outcome: A removed icon whose placed hex is listed is omitted.
   * Exceptions: None.
   */
  hiddenHexes: readonly string[];
}

/**
 * First snapshot for an id, ignoring later duplicates.
 *
 * Purpose: Air, ranged, and melee lists are scanned the same way.
 * When to use: While classifying one id.
 * Expected outcome: The first matching row, or undefined.
 * Exceptions: None.
 */
function firstRemoval(
  units: readonly ResolutionCasualtyUnit[],
  unitId: string
): ResolutionCasualtyUnit | undefined {
  return units.find((unit) => unit.id === unitId);
}

/**
 * Places one playback clock on a casualty window.
 *
 * Purpose: Later flags must not override an earlier stage when more than one flag is set.
 * When to use: Once per frame from the playback phase.
 * Expected outcome: `'afterCasualties'` when every flag is false, including while dice chips are still fading.
 * Exceptions: None.
 */
export function resolutionCasualtyTiming(
  phase: Pick<
    ResolutionPlaybackPhase,
    | 'inAirStrikeOutbound'
    | 'inAirStrikeLightning'
    | 'inAirStrikeCasualty'
    | 'inAirStrikeReturn'
    | 'inRangedLightning'
    | 'inRangedCasualty'
    | 'inMovement'
    | 'inMeleeLightning'
    | 'inMeleeCasualty'
  >
): ResolutionCasualtyTiming {
  if (phase.inAirStrikeOutbound || phase.inAirStrikeLightning || phase.inAirStrikeCasualty) {
    return 'throughAirCasualties';
  }
  if (phase.inAirStrikeReturn) return 'airReturn';
  if (phase.inRangedLightning || phase.inRangedCasualty) return 'throughRangedCasualties';
  if (phase.inMovement) return 'movement';
  if (phase.inMeleeLightning || phase.inMeleeCasualty) return 'throughMeleeCasualties';
  return 'afterCasualties';
}

/**
 * Reports whether one unit's icon is still on the map at this timing.
 *
 * Purpose: Air-strike removals end first, then ranged removals, then melee removals.
 * When to use: From tests and from `unitsDrawnAtCasualtyTiming`. Do not call it to filter marches.
 * Expected outcome: True when the icon should be drawn. An id in an earlier removal list uses that list only.
 * Exceptions: None.
 */
export function unitIconVisibleAtCasualtyTiming(
  unitId: string,
  timing: ResolutionCasualtyTiming,
  input: ResolutionCasualtyDrawInput
): boolean {
  if (firstRemoval(input.airRemovedUnits, unitId)) return timing === 'throughAirCasualties';
  if (firstRemoval(input.rangedRemovedUnits, unitId)) {
    return timing === 'throughAirCasualties' || timing === 'airReturn' || timing === 'throughRangedCasualties';
  }
  if (firstRemoval(input.meleeRemovedUnits, unitId)) return timing !== 'afterCasualties';
  return true;
}

/**
 * Reports whether one march should glide.
 *
 * Purpose: A unit removed before movement never walks, and a melee victim walks only to the hex where it died.
 * When to use: After `buildResolutionPlaybackMoves`, before drawing march lines or moving icons.
 * Expected outcome: False for air and ranged removals, for a melee death on the origin, and when the removal hex is off the march. True for a survivor and for a melee death on the destination.
 * Exceptions: None.
 */
export function marchPlayedForUnit(move: ResolutionCasualtyMarch, input: ResolutionCasualtyDrawInput): boolean {
  if (firstRemoval(input.airRemovedUnits, move.unitId) || firstRemoval(input.rangedRemovedUnits, move.unitId)) {
    return false;
  }
  const melee = firstRemoval(input.meleeRemovedUnits, move.unitId);
  if (!melee) return true;
  if (melee.h3Index === move.fromH3Index) return false;
  return melee.h3Index === move.toH3Index;
}

/**
 * Hex, player, and type for a removed icon that is still visible.
 *
 * Purpose: Replaces a stale origin row and supplies an icon the post-resolution snapshot no longer has.
 * When to use: For each removed id while building the draw list.
 * Expected outcome: Undefined when the icon is hidden or its placed hex is in `hiddenHexes`.
 * Exceptions: None.
 */
function placedRemoval(
  unitId: string,
  timing: ResolutionCasualtyTiming,
  input: ResolutionCasualtyDrawInput,
  moves: readonly ResolutionCasualtyMarch[],
  hiddenHexes: ReadonlySet<string>
): ResolutionCasualtyUnit | undefined {
  if (!unitIconVisibleAtCasualtyTiming(unitId, timing, input)) return undefined;
  const air = firstRemoval(input.airRemovedUnits, unitId);
  const ranged = firstRemoval(input.rangedRemovedUnits, unitId);
  const melee = firstRemoval(input.meleeRemovedUnits, unitId);
  const source = air ?? ranged ?? melee;
  if (!source) return undefined;
  let h3Index = source.h3Index;
  if (!air && !ranged && melee) {
    const move = moves.find((candidate) => candidate.unitId === unitId);
    const beforeMelee =
      timing === 'throughAirCasualties' ||
      timing === 'airReturn' ||
      timing === 'throughRangedCasualties' ||
      timing === 'movement';
    if (beforeMelee && move && move.fromH3Index !== melee.h3Index) h3Index = move.fromH3Index;
  }
  if (hiddenHexes.has(h3Index)) return undefined;
  return { id: source.id, player: source.player, unitType: source.unitType, h3Index };
}

/**
 * Applies removal visibility and placement to one frame's icons.
 *
 * Purpose: One pass serves the strategic and tactical draw paths, including a pre-commit row left on its origin.
 * When to use: At the end of `getUnitsForDrawWithMovingIds` while a playback is running.
 * Expected outcome: Survivors keep their order. A removed id appears once, at the hex for this timing, or not at all. Missing removed icons are appended.
 * Exceptions: None.
 */
export function unitsDrawnAtCasualtyTiming(args: UnitsDrawnAtCasualtyTimingArgs): ResolutionCasualtyUnit[] {
  const hiddenHexes = new Set(args.hiddenHexes);
  const removedIds = new Set<string>([
    ...args.input.airRemovedUnits.map((unit) => unit.id),
    ...args.input.rangedRemovedUnits.map((unit) => unit.id),
    ...args.input.meleeRemovedUnits.map((unit) => unit.id),
  ]);
  const seen = new Set<string>();
  const drawn: ResolutionCasualtyUnit[] = [];
  for (const unit of args.units) {
    if (seen.has(unit.id)) continue;
    seen.add(unit.id);
    if (!removedIds.has(unit.id)) {
      drawn.push(unit);
      continue;
    }
    const placed = placedRemoval(unit.id, args.timing, args.input, args.moves, hiddenHexes);
    if (placed) drawn.push(placed);
  }
  const removedInOrder = [
    ...args.input.airRemovedUnits,
    ...args.input.rangedRemovedUnits,
    ...args.input.meleeRemovedUnits,
  ];
  for (const unit of removedInOrder) {
    if (seen.has(unit.id)) continue;
    seen.add(unit.id);
    const placed = placedRemoval(unit.id, args.timing, args.input, args.moves, hiddenHexes);
    if (placed) drawn.push(placed);
  }
  return drawn;
}
