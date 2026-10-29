/**
 * Missile Forces briefing block.
 *
 * Purpose: Tells the commander which missiles it has and which explored enemy hexes they can reach.
 * When to use: `buildSystemPromptForTools`, immediately after the air-operations block.
 * Expected outcome: Empty in a battle and when the commander has no missile. Otherwise a heading, the range sentence, the missile table, and up to eight targets.
 * Exceptions: None.
 */

import { briefingOwnSeatId } from '../briefing/briefingPerspective';
import { missileReachSet } from '../gameActions/missileReach';
import type { GameStateSnapshot } from '../gameDb';
import { logDebug } from '../logger';
import { buildPromptTableLines } from '../promptTableHelpers';
import { missileRangeHexes } from '../../shared/gameRules';
import { isMissileUnitType } from '../../shared/missileRules';
import { isSeatId } from '../../shared/seatIds';
import { SECTION_TITLE_MISSILE_FORCES, topLevelHeading } from './promptSpec/sectionHeadings';

/**
 * How many target rows the block may list.
 *
 * Purpose: The completion budget cannot carry every hex in range.
 * When to use: After the target sort.
 * Expected outcome: At most this many rows.
 * Exceptions: None.
 */
const MISSILE_BRIEFING_TARGET_LIMIT = 8;

/**
 * Range sentence above the missile table.
 *
 * Purpose: The model needs the range in hexes and the one-launch rule beside the unit ids.
 * When to use: Whenever the block is shown.
 * Expected outcome: A sentence that names `rangeHexes`.
 * Exceptions: None.
 */
export function missileForcesRulesLine(rangeHexes: number): string {
  return `Missile rules: launch range ${rangeHexes} hexes from the missile's hex; one launch per missile, then it is gone.`;
}

/**
 * Introduces the target table.
 *
 * Purpose: The table is a short list, not every hex the missile could reach.
 * When to use: When at least one target row exists.
 * Expected outcome: The fixed sentence.
 * Exceptions: None.
 */
export const MISSILE_TARGETS_TABLE_INTRO =
  'Best missile targets are explored enemy hexes that at least one of your missiles can reach.';

/**
 * Shown when no infrastructure hex qualifies.
 *
 * Purpose: An empty table would invite a launch at a hex the parser will drop.
 * When to use: When the missile table is present and the target list is empty.
 * Expected outcome: The fixed sentence, and no target table.
 * Exceptions: None.
 */
export const NO_MISSILE_TARGETS_LINE = 'No explored enemy hex with infrastructure is in range of your missiles.';

/**
 * One missile and the hexes it can reach.
 *
 * Purpose: The target filter asks the same disk more than once.
 * When to use: While building the block.
 * Expected outcome: `reach` includes the missile's own hex.
 * Exceptions: None.
 */
interface MissileReachRow {
  /**
   * The missile's unit id.
   *
   * Contract: The id stored on the unit.
   * When to use: The unit table and the In Range Of cell.
   * Expected outcome: Stable across the two tables.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * The hex the missile occupies.
   *
   * Contract: A strategic H3 index.
   * When to use: The unit table and the reach disk.
   * Expected outcome: The origin of `reach`.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Hexes this missile can hit, including its own.
   *
   * Contract: The memoized disk for `h3Index`.
   * When to use: Filtering target rows.
   * Expected outcome: Contains every hex within the map's missile range.
   * Exceptions: None.
   */
  readonly reach: ReadonlySet<string>;
}

/**
 * Builds the Missile Forces section, or returns empty when it should not appear.
 *
 * Purpose: The commander sees its missiles and a short list of enemy infrastructure it can hit.
 * When to use: Strategic system prompts. Tactical prompts call it and get an empty string.
 * Expected outcome: Markdown with the heading, rules, missile table, and either the target table or the empty-target sentence.
 * Exceptions: None.
 */
export function buildMissileForcesBriefingBlock(
  state: GameStateSnapshot,
  format: (h3Index: string) => string,
  mode: 'strategic' | 'tactical'
): string {
  const ownSeat = briefingOwnSeatId(state);
  const missiles = (mode === 'tactical' ? [] : state.units.filter((unit) => unit.player === ownSeat && isMissileUnitType(unit.unitType)))
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  logDebug('briefingSectionsMissiles buildMissileForcesBriefingBlock', { mode, ownSeat, missileCount: missiles.length });
  if (missiles.length === 0) return '';
  const reaches: MissileReachRow[] = missiles.map((missile) => ({
    id: missile.id,
    h3Index: missile.h3Index,
    reach: missileReachSet(missile.h3Index),
  }));
  const missileTable = buildPromptTableLines(
    ['Unit ID', 'Hex'],
    reaches.map((row) => [row.id, format(row.h3Index)])
  );
  const targetRows = missileTargetRows(state, ownSeat, reaches, format);
  const targetBlock = targetRows.length > 0
    ? `${MISSILE_TARGETS_TABLE_INTRO}\n\n${buildPromptTableLines(
        ['Target', 'Owner', 'City Cells', 'Airports', 'Seaports', 'Enemy Air Based', 'In Range Of'],
        targetRows
      ).join('\n')}`
    : NO_MISSILE_TARGETS_LINE;
  return [
    topLevelHeading(SECTION_TITLE_MISSILE_FORCES),
    '',
    missileForcesRulesLine(missileRangeHexes()),
    '',
    missileTable.join('\n'),
    '',
    targetBlock,
  ].join('\n');
}

/**
 * Target-table rows, best infrastructure first, cut to the limit.
 *
 * Purpose: Own, Neutral, unexplored, and out-of-range hexes are not launch advice.
 * When to use: After the missile reach sets exist.
 * Expected outcome: At most eight rows, ordered by city cells, then airports, then seaports, then hex index.
 * Exceptions: None.
 */
function missileTargetRows(
  state: GameStateSnapshot,
  ownSeat: string,
  reaches: readonly MissileReachRow[],
  format: (h3Index: string) => string
): string[][] {
  const explored = state.exploredHexes;
  const exploredKnown = Array.isArray(explored);
  const controllerByHex = new Map((state.strategicControl ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));
  const candidates = (state.strategicInfrastructure ?? [])
    .filter((row) => row.urbanHexCount > 0 || row.airportCount > 0 || row.seaportCount > 0)
    .filter((row) => {
      const controller = controllerByHex.get(row.h3Index);
      return controller != null && isSeatId(controller) && controller !== ownSeat;
    })
    .filter((row) => !exploredKnown || explored.includes(row.h3Index))
    .map((row) => ({ row, inRange: reaches.filter((missile) => missile.reach.has(row.h3Index)) }))
    .filter((item) => item.inRange.length > 0)
    .sort((a, b) => {
      const urban = b.row.urbanHexCount - a.row.urbanHexCount;
      if (urban !== 0) return urban;
      const airports = b.row.airportCount - a.row.airportCount;
      if (airports !== 0) return airports;
      const seaports = b.row.seaportCount - a.row.seaportCount;
      if (seaports !== 0) return seaports;
      return a.row.h3Index < b.row.h3Index ? -1 : a.row.h3Index > b.row.h3Index ? 1 : 0;
    })
    .slice(0, MISSILE_BRIEFING_TARGET_LIMIT);
  return candidates.map((item) => {
    const controller = controllerByHex.get(item.row.h3Index) ?? '';
    const owner = state.seats?.find((seat) => seat.seatId === controller)?.homeRegion ?? controller;
    const enemyAir = state.units.filter(
      (unit) => unit.h3Index === item.row.h3Index && unit.unitType === 'air' && unit.player !== ownSeat
    ).length;
    return [
      format(item.row.h3Index),
      owner,
      String(item.row.urbanHexCount),
      String(item.row.airportCount),
      String(item.row.seaportCount),
      String(enemyAir),
      item.inRange.map((missile) => missile.id).join(', '),
    ];
  });
}
