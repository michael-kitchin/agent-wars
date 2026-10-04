/**
 * Pure res4 terrain-effect strings for the map hex tooltip "Effects:" line.
 *
 * Purpose: Centralizes movement/range symbol rules so tooltip copy matches tactical §12.4 and combat modifiers.
 * When to use: From `formatTerrainTooltipHtml` for the Effects line. Terrain symbols are for res4 cells. Weather stays on the Weather line.
 * Expected outcome: Comma-delimited effect list or `null` when the hex has no applicable effects.
 * Exceptions: None; invalid/unknown kinds fall back through `normalizeDbTerrainKindToTacticalCategory`.
 */

import {
  isInfantryOrArmorTacticalSpawnCell,
  isNavalRes4TacticalCellNavigable,
  normalizeDbTerrainKindToTacticalCategory,
  tacticalEnterHexMovementCost,
} from './tacticalTerrainMovement';
import type { TacticalMovementCategory } from './tacticalTerrainMovement';

/** Effect polarity symbols shown before Movement or Range in tooltip copy. */
type EffectSymbol = 'x' | '-' | '+';

/** High-level effect category paired with a unit label in formatted output. */
type EffectCategory = 'Movement' | 'Range';

/** Title-case unit labels used in formatted effect entries (`All`, `Armored`, etc.). */
type UnitLabel = 'Air' | 'Armored' | 'Infantry' | 'Naval';

/** Internal unit-type keys aligned with tactical movement tables. */
type MovementUnitType = 'infantry' | 'armor' | 'naval';

/** Stable symbol ordering for exception B mixed labels (`x/-/+`). */
const SYMBOL_ORDER: readonly EffectSymbol[] = ['x', '-', '+'];

const MOVEMENT_UNIT_TYPES: readonly MovementUnitType[] = ['infantry', 'armor', 'naval'];

const MOVEMENT_UNIT_LABEL: Readonly<Record<MovementUnitType, UnitLabel>> = {
  infantry: 'Infantry',
  armor: 'Armored',
  naval: 'Naval',
};

/**
 * Snapshot of res4 terrain fields needed to derive tooltip effects without renderer or battle state.
 *
 * Purpose: Keeps `computeTerrainEffectsLine` pure and testable from main-process unit tests.
 * When to use: Built in `terrainStateForPointer` and passed into tooltip HTML formatting.
 * Expected outcome: All boolean flags reflect the hovered res4 cell; `parentTerrain` is res1 passability.
 * Exceptions: None.
 */
export interface TerrainEffectsInput {
  /**
   * Effective res4 terrain kind string for the hovered cell.
   *
   * Contract: Child override or inherited res1 kind; fed to `normalizeDbTerrainKindToTacticalCategory`.
   * When to use: Always set from `terrainStateForPointer` res4 branch.
   * Expected outcome: Drives base movement/range classification for the tooltip line.
   * Exceptions: Empty string falls back via parent passability in normalization.
   */
  terrainKind: string;
  /**
   * Res1 passability bucket for the parent strategic hex.
   *
   * Contract: One of `land`, `water`, `coastal`, or `wetlands` from `gameState.hexes[].terrain`.
   * When to use: Second argument to `normalizeDbTerrainKindToTacticalCategory`.
   * Expected outcome: Disambiguates blank child kinds against open water vs land parents.
   * Exceptions: Unknown values behave as land-like plains in normalization.
   */
  parentTerrain: string;
  /**
   * Res1 `terrain_kind` for the parent strategic hex.
   *
   * Contract: Parent kind string used by naval navigability helpers when the child kind is blank.
   * When to use: Passed to `isNavalRes4TacticalCellNavigable` for occupiable-unit checks.
   * Expected outcome: Enables seaport/coastal edge cases on land passability parents.
   * Exceptions: May match `terrainKind` when no child override exists.
   */
  parentTerrainKind: string;
  /**
   * Whether the res4 cell carries the urban overlay flag.
   *
   * Contract: Mutually exclusive with rubble at snapshot build; forces land-unit movement/range caps.
   * When to use: From `res4TerrainOverridesByH3` or tactical snapshot urban map.
   * Expected outcome: Infantry and Armored receive `-` movement and `-` range symbols.
   * Exceptions: None.
   */
  isUrban: boolean;
  /**
   * Whether the res4 cell carries the rubble overlay flag.
   *
   * Contract: Suppresses road/rail movement bonuses; applies urban-like range cap and movement slowdown.
   * When to use: From `res4TerrainOverridesByH3` or tactical snapshot rubble map.
   * Expected outcome: `-` movement/range for land units; no `+` from transport masks.
   * Exceptions: None.
   */
  isRubble: boolean;
  /**
   * Whether the res4 cell is marked as a seaport facility.
   *
   * Contract: Allows naval occupiability on otherwise land-like tiles.
   * When to use: From `terrainInfraRes4Seaport` membership for the hovered child hex.
   * Expected outcome: Naval included in occupiable set without spurious movement symbols on open plains.
   * Exceptions: None.
   */
  isSeaport: boolean;
  /**
   * Whether any road side mask is active on the hovered res4 cell.
   *
   * Contract: True when explored and `res4RoadRailSidesByH3` has any `true` road side.
   * When to use: Together with `hasRail` for exception C transport movement bonus.
   * Expected outcome: Contributes to `(+) All Movement` for Infantry/Armored when not rubble.
   * Exceptions: Ignored when `isRubble` is true.
   */
  hasRoad: boolean;
  /**
   * Whether any rail side mask is active on the hovered res4 cell.
   *
   * Contract: True when explored and `res4RoadRailSidesByH3` has any `true` rail side.
   * When to use: Together with `hasRoad` for exception C transport movement bonus.
   * Expected outcome: Contributes to `(+) All Movement` for Infantry/Armored when not rubble.
   * Exceptions: Ignored when `isRubble` is true.
   */
  hasRail: boolean;
}

/**
 * Wraps a slash-joined symbol set in display parentheses.
 *
 * Purpose: Keeps tooltip polarity glyphs visually distinct from unit parentheticals.
 * When to use: From plain and HTML effect entry formatters after `formatSymbolSet`.
 * Expected outcome: `+` becomes `(+)`; `x/-` becomes `(x/-)`.
 * Exceptions: Returns empty string when `symbols` is empty.
 */
function wrapTerrainEffectSymbolSetForDisplay(symbols: string): string {
  if (!symbols) return '';
  return `(${symbols})`;
}

/**
 * Strips display parentheses from one parenthesized effect symbol prefix.
 *
 * Purpose: Parses plain tooltip entries back into internal slash-joined symbol sets.
 * When to use: `formatTerrainEffectEntryHtml` when converting plain lines to HTML.
 * Expected outcome: `(x/-)` becomes `x/-`; unrecognized values pass through unchanged.
 * Exceptions: None.
 */
function unwrapTerrainEffectSymbolSetFromDisplay(display: string): string {
  const match = /^\(([-x+/]+)\)$/.exec(display);
  return match ? match[1]! : display;
}

/**
 * Builds the unit-and-category label for one effect entry.
 *
 * Purpose: Puts unit scope before the effect name (`Armored Movement`, `All Range`).
 * When to use: From plain and HTML effect entry formatters after resolving collapsed unit scope.
 * Expected outcome: `All Movement` for collapsed occupiable sets; `Infantry Range` for per-unit lines.
 * Exceptions: None.
 */
function formatTerrainEffectLabel(category: EffectCategory, unit: UnitLabel | 'All'): string {
  return unit === 'All' ? `All ${category}` : `${unit} ${category}`;
}

/**
 * Returns the parenthesized effect symbol prefix for tooltip HTML.
 *
 * Purpose: Shared display shape for res4 Effects tooltip symbol prefixes without extra styling.
 * When to use: While assembling res4 Effects tooltip entries from known symbol strings.
 * Expected outcome: `(+)`, `(-)`, or `(x/-)` with no surrounding markup.
 * Exceptions: Returns empty string when `symbols` is empty.
 */
export function formatTerrainEffectSymbolPrefixHtml(symbols: string): string {
  return wrapTerrainEffectSymbolSetForDisplay(symbols);
}

/**
 * Formats one plain effect entry from grouped parts without regex parsing.
 *
 * Purpose: Shared plain-text shape for tests and `computeTerrainEffectsLine`.
 * When to use: From entry formatters after resolving category, unit, and symbol set.
 * Expected outcome: Strings like `(-) All Movement` or `(x/-) Armored Range`.
 * Exceptions: None.
 */
function formatTerrainEffectEntryPlain(
  symbols: string,
  category: EffectCategory,
  unit: UnitLabel | 'All'
): string {
  return `${wrapTerrainEffectSymbolSetForDisplay(symbols)} ${formatTerrainEffectLabel(category, unit)}`;
}

/**
 * Formats one HTML effect entry from grouped parts without regex parsing.
 *
 * Purpose: Keeps res4 Effects tooltip entries aligned with plain-text formatting rules.
 * When to use: From `formatTerrainEffectEntriesHtml` and `computeTerrainEffectsLineHtml`.
 * Expected outcome: Parenthesized symbol prefix, space, then unit scope and category.
 * Exceptions: None.
 */
function formatTerrainEffectEntryHtmlFromParts(
  symbols: string,
  category: EffectCategory,
  unit: UnitLabel | 'All'
): string {
  return formatTerrainEffectEntryPlain(symbols, category, unit);
}

/**
 * Formats grouped symbol sets into sorted, unique plain effect strings (exported for unit tests).
 *
 * Purpose: Validates exception B ordering and exception E sorting independent of terrain classification.
 * When to use: Tests that pass pre-built `category|unit` → symbol-set maps.
 * Expected outcome: Alphabetically sorted unique strings like `(-) All Movement`.
 * Exceptions: None.
 */
export function formatTerrainEffectEntries(
  grouped: ReadonlyMap<string, ReadonlySet<EffectSymbol>>
): string[] {
  const entries: string[] = [];
  for (const [key, symbols] of grouped) {
    const slash = formatSymbolSet(symbols);
    if (!slash) continue;
    const pipe = key.indexOf('|');
    const category = key.slice(0, pipe) as EffectCategory;
    const unit = key.slice(pipe + 1) as UnitLabel | 'All';
    entries.push(formatTerrainEffectEntryPlain(slash, category, unit));
  }
  return [...new Set(entries)].sort((a, b) => a.localeCompare(b));
}

/**
 * Formats grouped symbol sets into sorted unique HTML effect strings (exported for unit tests).
 *
 * Purpose: Tooltip HTML assembly without round-tripping through plain text and regex.
 * When to use: `computeTerrainEffectsLineHtml` and tests covering symbol prefix formatting.
 * Expected outcome: Same text shape as plain entries.
 * Exceptions: None.
 */
export function formatTerrainEffectEntriesHtml(
  grouped: ReadonlyMap<string, ReadonlySet<EffectSymbol>>
): string[] {
  const entries: string[] = [];
  for (const [key, symbols] of grouped) {
    const slash = formatSymbolSet(symbols);
    if (!slash) continue;
    const pipe = key.indexOf('|');
    const category = key.slice(0, pipe) as EffectCategory;
    const unit = key.slice(pipe + 1) as UnitLabel | 'All';
    entries.push(formatTerrainEffectEntryHtmlFromParts(slash, category, unit));
  }
  return [...new Set(entries)].sort((a, b) => a.localeCompare(b));
}

/**
 * Parses one plain effect entry into the canonical tooltip HTML fragment.
 *
 * Purpose: Converts plain entries (tests or cached plain lines) into tooltip HTML fragments.
 * When to use: `formatTerrainEffectsLineHtml` when only a plain comma-delimited line is available.
 * Expected outcome: Same text as the matched plain entry when formatting succeeds.
 * Exceptions: Returns the entry unchanged when it does not match the expected pattern.
 */
export function formatTerrainEffectEntryHtml(entry: string): string {
  const match = /^(\([-x+/]+\)) (All|Air|Armored|Infantry|Naval) (Movement|Range)$/.exec(entry);
  if (!match) return entry;
  return formatTerrainEffectEntryHtmlFromParts(
    unwrapTerrainEffectSymbolSetFromDisplay(match[1]!),
    match[3] as EffectCategory,
    match[2] as UnitLabel | 'All'
  );
}

/**
 * Converts a comma-delimited plain effects line into tooltip HTML with styled symbol prefixes.
 *
 * Purpose: Keeps `computeTerrainEffectsLine` plain for tests while sharing HTML assembly helpers.
 * When to use: When only a plain effects line is available; prefer `computeTerrainEffectsLineHtml` at source.
 * Expected outcome: Same text as the plain line with comma spacing unchanged.
 * Exceptions: None.
 */
export function formatTerrainEffectsLineHtml(line: string): string {
  return line.split(', ').map(formatTerrainEffectEntryHtml).join(', ');
}

/**
 * Returns the comma-delimited terrain effects list for a res4 hex, or null when empty.
 *
 * Purpose: Single entry for res4 tooltip `Effects:` line assembly.
 * When to use: `formatTerrainTooltipHtml` when `namingTarget.resolution === 4`.
 * Expected outcome: Matches `.spec/terrain-effects-tooltip.md` matrix; `null` for plains/desert/water with no overlays.
 * Exceptions: None.
 */
/**
 * Builds the grouped movement/range symbol map for one res4 tooltip input snapshot.
 *
 * Purpose: Shared intermediate for plain and HTML effect line formatters.
 * When to use: Inside `computeTerrainEffectsLine` and `computeTerrainEffectsLineHtml`.
 * Expected outcome: Map keys like `Movement|All` with symbol sets attached.
 * Exceptions: None.
 */
function buildTerrainEffectGroupedMap(input: TerrainEffectsInput): Map<string, Set<EffectSymbol>> {
  const cat = normalizeDbTerrainKindToTacticalCategory(input.terrainKind, input.parentTerrain);
  const hasTransport = !input.isRubble && (input.hasRoad || input.hasRail);

  const movementByUnit = new Map<UnitLabel, Set<EffectSymbol>>();
  for (const unitType of MOVEMENT_UNIT_TYPES) {
    const label = MOVEMENT_UNIT_LABEL[unitType];
    const symbol = movementSymbolForUnit(unitType, cat, input, hasTransport);
    if (symbol) {
      movementByUnit.set(label, new Set([symbol]));
    }
  }

  const movementOccupiable = [...occupiableMovementUnits(cat, input)];
  if (hasTransport && !movementOccupiable.includes('Infantry')) {
    movementOccupiable.push('Infantry', 'Armored');
  }

  const rangeByUnit = new Map<UnitLabel, Set<EffectSymbol>>();
  applyRangeSymbols(rangeByUnit, cat, input);

  const grouped = new Map<string, Set<EffectSymbol>>();
  collapseCategoryEntries(grouped, 'Movement', movementByUnit, movementOccupiable);
  collapseCategoryEntries(grouped, 'Range', rangeByUnit, occupiableRangeUnits(cat, input));
  return grouped;
}

export function computeTerrainEffectsLine(input: TerrainEffectsInput): string | null {
  const formatted = formatTerrainEffectEntries(buildTerrainEffectGroupedMap(input));
  return formatted.length > 0 ? formatted.join(', ') : null;
}

/**
 * Returns the comma-delimited terrain effects tooltip HTML for a res4 hex, or null when empty.
 *
 * Purpose: Res4 tooltip `Effects:` body without plain-text round-trip so all symbol prefixes render consistently.
 * When to use: `formatTerrainTooltipHtml` when `namingTarget.resolution === 4`.
 * Expected outcome: Same ordering and text as `computeTerrainEffectsLine`.
 * Exceptions: None.
 */
export function computeTerrainEffectsLineHtml(input: TerrainEffectsInput): string | null {
  const formatted = formatTerrainEffectEntriesHtml(buildTerrainEffectGroupedMap(input));
  return formatted.length > 0 ? formatted.join(', ') : null;
}

/**
 * Joins active symbols in `x`, `-`, `+` order for one unit/category pair.
 *
 * Purpose: Implements exception B symbol mixing.
 * When to use: Before emitting a single effect string.
 * Expected outcome: Empty string when the set is empty; otherwise symbols joined by `/`.
 * Exceptions: None.
 */
function formatSymbolSet(symbols: ReadonlySet<EffectSymbol>): string {
  return SYMBOL_ORDER.filter((s) => symbols.has(s)).join('/');
}

/**
 * Returns the movement effect symbol for one land/naval unit before All-collapse.
 *
 * Purpose: Encodes base enter cost, urban/rubble overrides, exception D, and exception C transport.
 * When to use: While building the movement symbol map in `computeTerrainEffectsLine`.
 * Expected outcome: `+` on an intact road or rail. Rubble on terrain the unit cannot enter is `x` (hidden on water). Rubble on a road the unit can already enter has no movement symbol. Rubble with no road stays `-`. `null` when no movement effect applies.
 * Exceptions: None.
 */
function movementSymbolForUnit(
  unitType: MovementUnitType,
  cat: TacticalMovementCategory,
  input: TerrainEffectsInput,
  hasTransport: boolean
): EffectSymbol | null {
  if (hasTransport && (unitType === 'infantry' || unitType === 'armor')) {
    return '+';
  }

  if (input.isRubble && (unitType === 'infantry' || unitType === 'armor')) {
    const rubbleCost = tacticalEnterHexMovementCost(unitType, cat);
    if (rubbleCost === Infinity) {
      if (shouldSuppressMovementBlock(unitType, cat)) return null;
      return 'x';
    }
    if (input.hasRoad || input.hasRail) return null;
    return '-';
  }

  if (input.isUrban) {
    if (unitType === 'infantry' || unitType === 'armor') return '-';
    return null;
  }

  const cost = tacticalEnterHexMovementCost(unitType, cat);
  if (cost === Infinity) {
    if (shouldSuppressMovementBlock(unitType, cat)) return null;
    return 'x';
  }
  if (cost === 2) return '-';
  return null;
}

/**
 * Returns true when exception D hides a movement block symbol for the unit/terrain pair.
 *
 * Purpose: Keeps tooltip copy aligned with product rule D (naval-on-land, land-on-water blocks hidden).
 * When to use: Before assigning `x` from infinite enter cost.
 * Expected outcome: True for naval blocked by non-water/non-coastal land and infantry/armor blocked by water.
 * Exceptions: None.
 */
function shouldSuppressMovementBlock(
  unitType: MovementUnitType,
  cat: TacticalMovementCategory
): boolean {
  if (unitType === 'naval') {
    return cat !== 'water' && cat !== 'coastal';
  }
  if (unitType === 'infantry' || unitType === 'armor') {
    return cat === 'water';
  }
  return false;
}

/**
 * Adds range effect symbols per forest/urban/rubble cap and mountain LOS rules.
 *
 * Purpose: Populates the range symbol map alongside movement in `computeTerrainEffectsLine`.
 * When to use: After movement symbols are computed.
 * Expected outcome: Infantry/Armored `-` on forest/urban/rubble; Armored/Naval `x` on mountains. Air strikes and ferry are not blocked by mountains.
 * Exceptions: None.
 */
function applyRangeSymbols(
  rangeByUnit: Map<UnitLabel, Set<EffectSymbol>>,
  cat: TacticalMovementCategory,
  input: TerrainEffectsInput
): void {
  const rangedCap =
    cat === 'forests' || input.isUrban || input.isRubble;
  if (rangedCap) {
    addSymbol(rangeByUnit, 'Infantry', '-');
    addSymbol(rangeByUnit, 'Armored', '-');
  }
  if (cat === 'mountains') {
    addSymbol(rangeByUnit, 'Armored', 'x');
    addSymbol(rangeByUnit, 'Naval', 'x');
  }
}

/**
 * Merges one symbol into a unit's set, creating the set when missing.
 *
 * Purpose: Supports multiple range rules on one unit (e.g. urban mountain → `x` and `-`).
 * When to use: Range symbol assembly only.
 * Expected outcome: Unit entry contains all applicable symbols before exception B formatting.
 * Exceptions: None.
 */
function addSymbol(
  map: Map<UnitLabel, Set<EffectSymbol>>,
  unit: UnitLabel,
  symbol: EffectSymbol
): void {
  const existing = map.get(unit) ?? new Set<EffectSymbol>();
  existing.add(symbol);
  map.set(unit, existing);
}

/**
 * Returns land/naval unit labels that may occupy the hex for movement All-collapse.
 *
 * Purpose: Defines the occupiable set for `(All)` aggregation on Movement lines.
 * When to use: `collapseCategoryEntries` for Movement.
 * Expected outcome: Empty when no land/naval placement is legal; otherwise Infantry/Armored and/or Naval.
 * Exceptions: None.
 */
function occupiableMovementUnits(cat: TacticalMovementCategory, input: TerrainEffectsInput): UnitLabel[] {
  const units: UnitLabel[] = [];
  if (isInfantryOrArmorOccupiable(cat, input)) {
    units.push('Infantry', 'Armored');
  }
  if (
    isNavalRes4TacticalCellNavigable({
      resolvedKindForCell: input.terrainKind,
      parentTerrain: input.parentTerrain,
      parentTerrainKind: input.parentTerrainKind,
      isSeaportCell: input.isSeaport,
    })
  ) {
    units.push('Naval');
  }
  return units;
}

/**
 * Returns unit labels used for Range `(All)` collapse (occupiable land/naval only; Air excluded).
 *
 * Purpose: `(All)` on Range applies to Infantry/Armored (and Naval when occupiable), not Air.
 * When to use: `collapseCategoryEntries` for Range.
 * Expected outcome: Subset of movement occupiable units excluding Air.
 * Exceptions: None.
 */
function occupiableRangeUnits(cat: TacticalMovementCategory, input: TerrainEffectsInput): UnitLabel[] {
  return occupiableMovementUnits(cat, input);
}

/**
 * Returns whether infantry or armor may occupy the hex for spawn/placement rules.
 *
 * Purpose: Shared gate for movement/range occupiable sets and `(All)` collapse.
 * When to use: `occupiableMovementUnits` and related helpers.
 * Expected outcome: True on urban/rubble regardless of category; otherwise false on water/arctic.
 * Exceptions: None.
 */
function isInfantryOrArmorOccupiable(cat: TacticalMovementCategory, input: TerrainEffectsInput): boolean {
  if (input.isUrban || input.isRubble) return true;
  return isInfantryOrArmorTacticalSpawnCell({
    resolvedKindForCell: input.terrainKind,
    parentTerrain: input.parentTerrain,
    parentTerrainKind: input.parentTerrainKind,
  });
}

/**
 * Writes per-unit or `(All)` entries for one effect category into the output grouping map.
 *
 * Purpose: Applies `(All)` collapse then emits remaining per-unit lines (including non-occupiable units with symbols, e.g. Air on mountains).
 * When to use: Once movement and range symbol maps are complete.
 * Expected outcome: Keys formatted as `Movement|Infantry` or `Range|All` with symbol sets attached.
 * Exceptions: None.
 */
function collapseCategoryEntries(
  grouped: Map<string, Set<EffectSymbol>>,
  category: EffectCategory,
  byUnit: Map<UnitLabel, Set<EffectSymbol>>,
  occupiable: readonly UnitLabel[]
): void {
  const occupiableWithSymbols = occupiable.filter((u) => {
    const set = byUnit.get(u);
    return set !== undefined && set.size > 0;
  });

  const collapsedUnits = new Set<UnitLabel>();

  if (occupiableWithSymbols.length >= 2) {
    const reference = formatSymbolSet(byUnit.get(occupiableWithSymbols[0])!);
    const allSame = occupiableWithSymbols.every(
      (u) => formatSymbolSet(byUnit.get(u!)!) === reference
    );
    if (allSame && reference.length > 0) {
      grouped.set(`${category}|All`, new Set(byUnit.get(occupiableWithSymbols[0])!));
      for (const u of occupiableWithSymbols) collapsedUnits.add(u);
    }
  }

  for (const [unit, symbols] of byUnit) {
    if (collapsedUnits.has(unit)) continue;
    if (symbols.size === 0) continue;
    grouped.set(`${category}|${unit}`, new Set(symbols));
  }
}
