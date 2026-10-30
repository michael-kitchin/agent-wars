import { isNeutralBorderHex } from './h3Resolutions';
import type { MercenaryEconomySnapshot, MercenaryFunds } from './ipc/mercenaryTypes';
import { formatCreditsUpkeepSuffix } from './mercenaryRules';
import { getMaxUnitsPerType, parseGameSize } from './gameSize';
import { countControlledHexesInRegion } from './homeRegionRules';
import { ALL_BUILD_UNIT_TYPES, type BuildUnitType } from './ipc/productionTypes';
import { HUMAN_SEAT_ID, type SeatId } from './seatIds';
import { getPlayerUnitCountsByType } from './unitCountsByType';
import { countCityHexesBySeat, rankSeatsByCityHexes, type VictorySettings } from './victoryRules';

/**
 * The parts of a game-state snapshot that the top-bar readouts read.
 *
 * Purpose: A narrow input keeps the totals testable without building a whole snapshot.
 * When to use: Pass the renderer's `GameStateSnapshot`; it satisfies this shape.
 * Expected outcome: Optional lists may be missing on early or partial snapshots and count as empty.
 * Exceptions: None.
 */
export interface TopBarStatsInput {
  /**
   * Every unit in the snapshot.
   *
   * Contract: Each unit names its player and its unit type.
   * When to use: Pass `state.units`.
   * Expected outcome: Units whose player is `human` count toward Forces.
   * Exceptions: None.
   */
  readonly units: ReadonlyArray<{ readonly player: string; readonly unitType: string; readonly isMercenary?: boolean }>;
  /**
   * The match's game size.
   *
   * Contract: Any value `parseGameSize` accepts; unknown values mean Small.
   * When to use: Pass `state.gameSize`.
   * Expected outcome: Sets the per-type caps.
   * Exceptions: None.
   */
  readonly gameSize?: unknown;
  /**
   * Which player controls each strategic hex.
   *
   * Contract: One row per hex the player knows about.
   * When to use: Pass `state.strategicControl`.
   * Expected outcome: Drives Production and both home readouts.
   * Exceptions: None.
   */
  readonly strategicControl?: ReadonlyArray<{ readonly h3Index: string; readonly controllerPlayerId: string | null }>;
  /**
   * Current urban cell counts per strategic hex.
   *
   * Contract: `urbanHexCount` is the hex's present urban count, after any destruction.
   * When to use: Pass `state.strategicInfrastructure`.
   * Expected outcome: Summed for Production.
   * Exceptions: None.
   */
  readonly strategicInfrastructure?: ReadonlyArray<{ readonly h3Index: string; readonly urbanHexCount: number }>;
  /**
   * The seat the readouts are for.
   *
   * Contract: A seat id, null when the match has no active human seat, or omitted to mean the human seat.
   * When to use: Pass null while observing. Omit it for a two-seat snapshot that has no roster.
   * Expected outcome: Null omits Your home and Enemy homes.
   * Exceptions: None.
   */
  readonly viewerSeatId?: string | null;
  /**
   * Seats in the match.
   *
   * Contract: Optional. Each row names its home and whether it is out.
   * When to use: Pass `state.seats`.
   * Expected outcome: Enemy homes use the active seats other than the viewer.
   * Exceptions: None.
   */
  readonly seats?: readonly TopBarSeatRow[];
  /**
   * Home hexes keyed by seat id.
   *
   * Contract: Optional. Missing keys count as no hexes.
   * When to use: Pass `state.homeRegionHexesBySeat`.
   * Expected outcome: Home readouts use these lists when they are present.
   * Exceptions: None.
   */
  readonly homeRegionHexesBySeat?: Readonly<Record<string, readonly string[]>>;
  /**
   * The match's win rule.
   *
   * Contract: Optional. A turn limit shows Cities and hides Enemy homes.
   * When to use: Pass `state.victory`.
   * Expected outcome: Absent means last side standing.
   * Exceptions: None.
   */
  readonly victory?: VictorySettings;
  /**
   * The viewer's treasury, when the snapshot has one.
   *
   * Contract: Absent on observe-all and when the database is closed.
   * When to use: Pass `state.mercenaryEconomy`.
   * Expected outcome: The credits readout. Absent means the readout is hidden.
   * Exceptions: None.
   */
  readonly mercenaryEconomy?: MercenaryEconomySnapshot;
}

/**
 * One roster row the home and city readouts need.
 *
 * Purpose: The top bar does not need a commander's model.
 * When to use: `TopBarStatsInput.seats`.
 * Expected outcome: Enough to tell homes apart and to skip a knocked-out seat.
 * Exceptions: None.
 */
export interface TopBarSeatRow {
  /**
   * The seat id.
   *
   * Contract: A `SeatId`.
   * When to use: Matching homes and city counts.
   * Expected outcome: Unique in the list.
   * Exceptions: None.
   */
  readonly seatId: SeatId;
  /**
   * List order, from 1.
   *
   * Contract: Unique in the roster.
   * When to use: Breaking a city-hex tie.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly seatOrder: number;
  /**
   * Home name.
   *
   * Contract: The side-group display name, or the UN subregion name.
   * When to use: The Cities tooltip.
   * Expected outcome: A non-empty name.
   * Exceptions: None.
   */
  readonly homeRegion: string;
  /**
   * The turn the seat was knocked out, or null while it plays.
   *
   * Contract: Null means the seat is active.
   * When to use: Enemy homes and the city ranking skip a knocked-out seat.
   * Expected outcome: A turn number, or null.
   * Exceptions: None.
   */
  readonly outTurn: number | null;
}

/**
 * Held and total hex counts for one home region.
 *
 * Purpose: Both home readouts share this shape.
 * When to use: Read from `TopBarStats`.
 * Expected outcome: `held` never exceeds `total`.
 * Exceptions: None.
 */
export interface HomeHold {
  /**
   * Hexes of the region the human player controls.
   *
   * Contract: Counts each hex once.
   * When to use: The readout's main number.
   * Expected outcome: Zero or more.
   * Exceptions: None.
   */
  readonly held: number;
  /**
   * Hexes in the region.
   *
   * Contract: Counts each hex once.
   * When to use: The readout's suffix.
   * Expected outcome: Zero when the snapshot has no region list.
   * Exceptions: None.
   */
  readonly total: number;
}

/**
 * Totals shown in the top bar.
 *
 * Purpose: One computed record that the renderer formats and the tests check.
 * When to use: Returned by `computeTopBarStats`.
 * Expected outcome: Plain numbers; formatting happens in `formatTopBarStatParts`.
 * Exceptions: None.
 */
export interface TopBarStats {
  /**
   * Production the human player's cities can add each turn.
   *
   * Contract: Matches the per-turn credit rule: current urban count, human control, no neutral-border hexes.
   * When to use: The Production readout.
   * Expected outcome: Zero or more.
   * Exceptions: None.
   */
  readonly productionPerTurn: number;
  /**
   * Human units fielded, by type.
   *
   * Contract: Only the four buildable types are counted.
   * When to use: The Forces tip.
   * Expected outcome: Zero for a type with no units.
   * Exceptions: None.
   */
  readonly fieldedByType: Readonly<Record<BuildUnitType, number>>;
  /**
   * The game size's cap for each type.
   *
   * Contract: From `getMaxUnitsPerType`.
   * When to use: The Forces tip.
   * Expected outcome: Positive numbers.
   * Exceptions: None.
   */
  readonly capByType: Readonly<Record<BuildUnitType, number>>;
  /**
   * Sum of `fieldedByType`.
   *
   * Contract: Equals the sum of the per-type counts.
   * When to use: The Forces readout's main number.
   * Expected outcome: Zero or more.
   * Exceptions: None.
   */
  readonly unitsFielded: number;
  /**
   * Sum of `capByType`.
   *
   * Contract: Equals the sum of the per-type caps.
   * When to use: The Forces readout's suffix.
   * Expected outcome: 34 for a Small game.
   * Exceptions: None.
   */
  readonly unitCap: number;
  /**
   * The human player's hold on their own home region.
   *
   * Contract: Human control only.
   * When to use: The Your home readout.
   * Expected outcome: See `HomeHold`.
   * Exceptions: None.
   */
  readonly yourHome: HomeHold | null;
  /**
   * The viewer's hold on every active enemy home, taken together.
   *
   * Contract: Null when the viewer is null, or when the match ends on a turn limit.
   * When to use: The Enemy homes readout.
   * Expected outcome: A knocked-out enemy's home is left out of both numbers.
   * Exceptions: None.
   */
  readonly enemyHomes: HomeHold | null;
  /**
   * The viewer's city hexes and place in a turn-limit match.
   *
   * Contract: Null unless the win rule is the turn limit. `summary` is null when the viewer is null.
   * When to use: The Cities readout.
   * Expected outcome: The tooltip lists every active seat, highest first, and marks the viewer with "(you)" when there is one.
   * Exceptions: None.
   */
  readonly cities: { readonly summary: string | null; readonly tooltip: string } | null;
  /**
   * The viewer's credits, or null when this view has no treasury.
   *
   * Contract: `short` is true when credits are below upkeep plus pending hire fees.
   * When to use: The Credits readout. Hide it when this is null.
   * Expected outcome: The funds from `mercenaryEconomy`, plus `short`.
   * Exceptions: None.
   */
  readonly credits: (MercenaryFunds & { readonly short: boolean }) | null;
}

/**
 * Computes the top-bar totals from a snapshot.
 *
 * Purpose: Display-only totals derived in the renderer; nothing here changes game state.
 * When to use: On every top-bar refresh with a snapshot. Pass `isNeutralBorder` only in tests.
 * Expected outcome: Production and forces are the viewer's. Your home is the viewer's own home.
 *   Enemy homes are the active enemies' homes taken together. A turn-limit match shows Cities instead.
 * Exceptions: None; missing lists count as empty. A null viewer does not throw.
 */
export function computeTopBarStats(
  input: TopBarStatsInput,
  isNeutralBorder: (h3Index: string) => boolean = isNeutralBorderHex
): TopBarStats {
  const viewer = input.viewerSeatId === undefined ? HUMAN_SEAT_ID : input.viewerSeatId;
  const control = input.strategicControl ?? [];
  const heldHexes = new Set(
    viewer === null ? [] : control.filter((row) => row.controllerPlayerId === viewer).map((row) => row.h3Index)
  );
  const productionPerTurn = (input.strategicInfrastructure ?? [])
    .filter((row) => heldHexes.has(row.h3Index) && !isNeutralBorder(row.h3Index))
    .reduce((sum, row) => sum + Math.max(0, Math.trunc(row.urbanHexCount)), 0);
  const fieldedByType = getPlayerUnitCountsByType(Array.from(input.units), viewer ?? '');
  const capByType = getMaxUnitsPerType(parseGameSize(input.gameSize));
  const unitsFielded = ALL_BUILD_UNIT_TYPES.reduce((sum, unitType) => sum + fieldedByType[unitType], 0);
  const unitCap = ALL_BUILD_UNIT_TYPES.reduce((sum, unitType) => sum + capByType[unitType], 0);
  const turnLimit = input.victory?.rule === 'most_city_hexes_at_turn_limit' ? input.victory.turnLimit : null;
  return {
    productionPerTurn,
    fieldedByType,
    capByType,
    unitsFielded,
    unitCap,
    yourHome: viewer === null ? null : holdOf(input, viewer, homeHexesOf(input, viewer)),
    enemyHomes: viewer === null || turnLimit !== null ? null : holdOf(input, viewer, enemyHomeHexesOf(input, viewer)),
    cities: turnLimit === null ? null : citiesReadout(input, viewer, turnLimit),
    credits: creditsReadout(input.mercenaryEconomy),
  };
}

/**
 * The credits readout, or null when this view has no economy.
 *
 * Purpose: Observe-all has no treasury, so the readout stays hidden.
 * When to use: `computeTopBarStats`.
 * Expected outcome: `short` when the balance cannot cover upkeep and pending fees.
 * Exceptions: None.
 */
function creditsReadout(economy: MercenaryEconomySnapshot | undefined): (MercenaryFunds & { readonly short: boolean }) | null {
  if (!economy) return null;
  return {
    credits: economy.credits,
    upkeepPerTurn: economy.upkeepPerTurn,
    pendingHireFees: economy.pendingHireFees,
    mercenaryCount: economy.mercenaryCount,
    short: economy.credits < economy.upkeepPerTurn + economy.pendingHireFees,
  };
}

/**
 * Counts the hexes of a list that the viewer controls.
 *
 * Purpose: Your home and Enemy homes share the same hold shape.
 * When to use: `computeTopBarStats`.
 * Expected outcome: Both numbers are zero when the list is empty.
 * Exceptions: None.
 */
function holdOf(input: TopBarStatsInput, viewer: string, hexes: readonly string[]): HomeHold {
  const hold = countControlledHexesInRegion(Array.from(input.strategicControl ?? []), hexes, viewer);
  return { held: hold.controlled, total: hold.total };
}

/**
 * The viewer's own home hexes.
 *
 * Purpose: Your home reads the viewer's list from the seat map.
 * When to use: Your home.
 * Expected outcome: An empty list when the viewer has no home.
 * Exceptions: None.
 */
function homeHexesOf(input: TopBarStatsInput, viewer: string): readonly string[] {
  return input.homeRegionHexesBySeat?.[viewer] ?? [];
}

/**
 * Every active enemy home, as one list.
 *
 * Purpose: A knocked-out enemy's home leaves both the held count and the total.
 * When to use: Enemy homes, and only when the match is not on a turn limit.
 * Expected outcome: The hexes of every other active seat. Empty when the seat map is absent.
 * Exceptions: None.
 */
function enemyHomeHexesOf(input: TopBarStatsInput, viewer: string): readonly string[] {
  const enemies = (input.seats ?? []).filter((seat) => seat.seatId !== viewer && seat.outTurn === null);
  return enemies.flatMap((seat) => input.homeRegionHexesBySeat?.[seat.seatId] ?? []);
}

/**
 * The Cities readout and its tip.
 *
 * Purpose: The place comes from the same ranking the match uses at the turn limit.
 * When to use: A turn-limit match.
 * Expected outcome: A null viewer still gets the tip, with no "(you)", and no summary number.
 * Exceptions: None.
 */
function citiesReadout(
  input: TopBarStatsInput,
  viewer: string | null,
  turnLimit: number
): { readonly summary: string | null; readonly tooltip: string } {
  const active = (input.seats ?? []).filter((seat) => seat.outTurn === null);
  const counts = countCityHexesBySeat(input.strategicControl ?? [], input.strategicInfrastructure ?? []);
  const places = rankSeatsByCityHexes(
    active.map((seat) => seat.seatId),
    counts
  );
  const ranked = [...active].sort((left, right) => {
    const byCount = (counts.get(right.seatId) ?? 0) - (counts.get(left.seatId) ?? 0);
    return byCount !== 0 ? byCount : left.seatOrder - right.seatOrder;
  });
  const lines = ranked.map((seat) => {
    const you = viewer !== null && seat.seatId === viewer ? ' (you)' : '';
    return `${seat.homeRegion}${you} ${counts.get(seat.seatId) ?? 0}`;
  });
  const tooltip = `City hexes held. Most at the end of turn ${turnLimit} wins. A tie leaves no single winner. ${lines.join('; ')}`;
  if (viewer === null) return { summary: null, tooltip };
  const held = counts.get(viewer) ?? 0;
  const place = places.get(viewer as SeatId) ?? active.length;
  return { summary: `${formatCount(held)} · ${place} of ${active.length}`, tooltip };
}

/**
 * Display text for each readout: a main value and a muted suffix.
 *
 * Purpose: The renderer writes these strings into fixed elements.
 * When to use: Returned by `formatTopBarStatParts`.
 * Expected outcome: Plain text only.
 * Exceptions: None.
 */
export interface TopBarStatParts {
  /**
   * Production value, such as "+530".
   *
   * Contract: Always starts with "+".
   * When to use: `#topbar-stat-production`.
   * Expected outcome: Grouped with commas past 999.
   * Exceptions: None.
   */
  readonly production: string;
  /**
   * Units fielded, such as "10".
   *
   * Contract: Digits only, with commas past 999.
   * When to use: `#topbar-stat-forces`.
   * Expected outcome: Never negative.
   * Exceptions: None.
   */
  readonly forces: string;
  /**
   * The cap suffix, such as "/34".
   *
   * Contract: Starts with "/".
   * When to use: `#topbar-stat-forces-cap`.
   * Expected outcome: The game size's total cap.
   * Exceptions: None.
   */
  readonly forcesCap: string;
  /**
   * Your home held, such as "12".
   *
   * Contract: Digits only.
   * When to use: `#topbar-stat-human-home`.
   * Expected outcome: Never negative.
   * Exceptions: None.
   */
  readonly humanHome: string;
  /**
   * Your home total suffix, such as "/15".
   *
   * Contract: Starts with "/".
   * When to use: `#topbar-stat-human-home-total`.
   * Expected outcome: The region's hex count.
   * Exceptions: None.
   */
  readonly humanHomeTotal: string;
  /**
   * Enemy home held, such as "3".
   *
   * Contract: Digits only.
   * When to use: `#topbar-stat-enemy-home`.
   * Expected outcome: Never negative.
   * Exceptions: None.
   */
  readonly enemyHome: string;
  /**
   * Enemy home total suffix, such as "/24".
   *
   * Contract: Starts with "/".
   * When to use: `#topbar-stat-enemy-home-total`.
   * Expected outcome: The region's hex count.
   * Exceptions: None.
   */
  readonly enemyHomeTotal: string;
  /**
   * The Cities value, such as "4 · 2 of 3".
   *
   * Contract: Empty when the match is not on a turn limit, or when there is no viewer.
   * When to use: `#topbar-stat-cities`.
   * Expected outcome: The place is a number, shared when two seats hold the same count.
   * Exceptions: None.
   */
  readonly cities: string;
  /**
   * The Cities tip.
   *
   * Contract: Empty when the match is not on a turn limit.
   * When to use: The Cities readout's tooltip.
   * Expected outcome: Names every active seat, highest first.
   * Exceptions: None.
   */
  readonly citiesTooltip: string;
  /**
   * The credits balance, such as "20".
   *
   * Contract: Empty when the view has no economy.
   * When to use: `#topbar-stat-credits`.
   * Expected outcome: A grouped whole number, or `''`.
   * Exceptions: None.
   */
  readonly credits: string;
  /**
   * The upkeep suffix, such as "−3/turn".
   *
   * Contract: Empty when upkeep is 0 or the view has no economy.
   * When to use: `#topbar-stat-credits-suffix`.
   * Expected outcome: A minus sign, the upkeep, and `/turn`, or `''`.
   * Exceptions: None.
   */
  readonly creditsSuffix: string;
}

/**
 * Formats one whole number for a readout.
 *
 * Purpose: All readouts group thousands the same way, independent of the computer's locale.
 * When to use: Inside `formatTopBarStatParts` and `formatForcesBreakdown`.
 * Expected outcome: For example 1530 becomes "1,530".
 * Exceptions: None.
 */
function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Formats the top-bar totals for display.
 *
 * Purpose: Keeps the number format in one place.
 * When to use: After `computeTopBarStats`.
 * Expected outcome: For example production "+530", forces "10" and "/34", homes "12" and "/15".
 * Exceptions: None.
 */
export function formatTopBarStatParts(stats: TopBarStats): TopBarStatParts {
  return {
    production: `+${formatCount(stats.productionPerTurn)}`,
    forces: formatCount(stats.unitsFielded),
    forcesCap: `/${formatCount(stats.unitCap)}`,
    humanHome: stats.yourHome ? formatCount(stats.yourHome.held) : '—',
    humanHomeTotal: stats.yourHome ? `/${formatCount(stats.yourHome.total)}` : '',
    enemyHome: stats.enemyHomes ? formatCount(stats.enemyHomes.held) : '—',
    enemyHomeTotal: stats.enemyHomes ? `/${formatCount(stats.enemyHomes.total)}` : '',
    cities: stats.cities?.summary ?? '',
    citiesTooltip: stats.cities?.tooltip ?? '',
    credits: stats.credits ? formatCount(stats.credits.credits) : '',
    creditsSuffix: stats.credits ? formatCreditsUpkeepSuffix(stats.credits.upkeepPerTurn) : '',
  };
}

/**
 * Lists fielded units against the cap for each type.
 *
 * Purpose: The Forces tip spells out the total.
 * When to use: Building the Forces tip.
 * Expected outcome: For example "infantry 3 of 12, armor 3 of 8, naval 2 of 8, air 2 of 6".
 * Exceptions: None.
 */
export function formatForcesBreakdown(stats: TopBarStats): string {
  return ALL_BUILD_UNIT_TYPES.map(
    (unitType) => `${unitType} ${formatCount(stats.fieldedByType[unitType])} of ${formatCount(stats.capByType[unitType])}`
  ).join(', ');
}
