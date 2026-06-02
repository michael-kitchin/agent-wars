/**
 * Documents the `UnitDisplayIdentity` interface as a named contract surface (export interface UnitDisplayIdentity).

 * Purpose: Supports maintainability by documenting why `UnitDisplayIdentity` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface UnitDisplayIdentity {
    /**
   * Specifies the contract for the `id` member (id: string;).

   * Contract: Describes stable behavior for callers of `id` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
id: string;
    /**
   * Specifies the contract for the `unitType` member (unitType: string;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitType: string;
    /**
   * Specifies the contract for the `displayOrder` member (displayOrder?: number;).

   * Contract: Describes stable behavior for callers of `displayOrder` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
displayOrder?: number;
}

/**
 * Documents the module-scope binding `UNIT_TYPE_NOUN_BY_TYPE` (UNIT_TYPE_NOUN_BY_TYPE: Record<string, string>).

 * Purpose: Supports maintainability by documenting why `UNIT_TYPE_NOUN_BY_TYPE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const UNIT_TYPE_NOUN_BY_TYPE: Record<string, string> = {
    /**
   * Documents the object literal property `infantry` (infantry: 'Infantry').

   * Purpose: Supports maintainability by documenting why `infantry` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
infantry: 'Infantry',
    /**
   * Documents the object literal property `armor` (armor: 'Armored').

   * Purpose: Supports maintainability by documenting why `armor` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
armor: 'Armored',
    /**
   * Documents the object literal property `naval` (naval: 'Fleet').

   * Purpose: Supports maintainability by documenting why `naval` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
naval: 'Fleet',
    /**
   * Documents the object literal property `air` (air: 'Squadron').

   * Purpose: Supports maintainability by documenting why `air` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
air: 'Squadron',
};

/**
 * Documents the module-scope binding `NATURAL_ID_COLLATOR` (NATURAL_ID_COLLATOR).

 * Purpose: Supports maintainability by documenting why `NATURAL_ID_COLLATOR` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const NATURAL_ID_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Defines the `capitalizeWord` function shape (function capitalizeWord(s: string): string).

 * Purpose: Supports maintainability by documenting why `capitalizeWord` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function capitalizeWord(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Defines the `ordinalSuffix` function shape (function ordinalSuffix(value: number): string).

 * Purpose: Supports maintainability by documenting why `ordinalSuffix` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function ordinalSuffix(value: number): string {
  const abs = Math.abs(Math.trunc(value));
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  const mod10 = abs % 10;
  if (mod10 === 1) return 'st';
  if (mod10 === 2) return 'nd';
  if (mod10 === 3) return 'rd';
  return 'th';
}

/**
 * Defines the `toRomanNumeral` function shape (function toRomanNumeral(value: number): string).

 * Purpose: Supports maintainability by documenting why `toRomanNumeral` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function toRomanNumeral(value: number): string {
  let remaining = Math.max(1, Math.trunc(value));
  const numerals: Array<[number, string]> = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  for (const [unit, symbol] of numerals) {
    while (remaining >= unit) {
      out += symbol;
      remaining -= unit;
    }
  }
  return out;
}

/**
 * Defines the `formatUnitNumberLabel` function shape (function formatUnitNumberLabel().

 * Purpose: Supports maintainability by documenting why `formatUnitNumberLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatUnitNumberLabel(
  unitId: string,
  value: number,
  locale?: Intl.LocalesArgument
): string {
  return unitId.startsWith('opponent-') ? toRomanNumeral(value) : formatOrdinalLabel(value, locale);
}

/**
 * Parses seeded roster ids like `opponent-air-1` into unit type and formation ordinal.
 *
 * Purpose: Restricts id-based fallback labels to scenario seed shapes, not production spawn ids.
 * When to use: `fallbackDisplayNameFromUnitId` when roster lookup is unavailable.
 * Expected outcome: Returns type and ordinal for seed ids; null for production ids and unknown shapes.
 * Exceptions: None.
 */
function parseSeedUnitIdParts(unitId: string): { unitType: string; ordinal: number } | null {
  const match = unitId.match(/^(human|opponent)-(infantry|armor|naval|air)-(\d+)$/);
  if (!match) return null;
  const ordinal = Number.parseInt(match[3]!, 10);
  if (!Number.isFinite(ordinal) || ordinal <= 0) return null;
  return { unitType: match[2]!, ordinal };
}

/**
 * Reads the global production spawn sequence suffix from ids like `opponent-air-prod-3-276`.
 *
 * Purpose: Detects when persisted `displayOrder` was mistakenly aligned with spawn sequence instead of formation ordinal.
 * When to use: `resolvePersistedDisplayOrderForUnitLabel` before applying roster display-order labels.
 * Expected outcome: Returns the trailing spawn sequence integer for production ids; null for seed ids.
 * Exceptions: None.
 */
function productionSpawnSequenceFromUnitId(unitId: string): number | null {
  const match = unitId.match(/^(human|opponent)-(infantry|armor|naval|air)-prod-\d+-(\d+)$/);
  if (!match) return null;
  const sequence = Number.parseInt(match[3]!, 10);
  return Number.isFinite(sequence) && sequence > 0 ? sequence : null;
}

/**
 * Returns roster `displayOrder` for label lookup, ignoring production ids whose order equals global spawn sequence.
 *
 * Purpose: Prevents `CCLXXVI Squadron`-style labels when `display_order` mirrors the production spawn counter tail.
 * When to use: Inside `buildUnitDisplayNameLookup` when classifying persisted vs fallback ordinals.
 * Expected outcome: Valid per-type formation ordinals pass through; corrupted production rows behave as unset.
 * Exceptions: None.
 */
function resolvePersistedDisplayOrderForUnitLabel(unit: UnitDisplayIdentity): number | undefined {
  if (typeof unit.displayOrder !== 'number' || unit.displayOrder <= 0) return undefined;
  const spawnSequence = productionSpawnSequenceFromUnitId(unit.id);
  if (spawnSequence !== null && unit.displayOrder === spawnSequence) return undefined;
  return unit.displayOrder;
}

/**
 * Defines the `formatOrdinalLabel` function shape (export function formatOrdinalLabel(value: number, locale?: Intl.LocalesArgument): string).

 * Purpose: Supports maintainability by documenting why `formatOrdinalLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatOrdinalLabel(value: number, locale?: Intl.LocalesArgument): string {
  const normalized = Math.max(1, Math.trunc(value));
  const numberText = new Intl.NumberFormat(locale).format(normalized);
  return `${numberText}${ordinalSuffix(normalized)}`;
}

/**
 * Defines the `getUnitDisplayNoun` function shape (export function getUnitDisplayNoun(unitType: string): string).

 * Purpose: Supports maintainability by documenting why `getUnitDisplayNoun` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getUnitDisplayNoun(unitType: string): string {
  return UNIT_TYPE_NOUN_BY_TYPE[unitType] ?? capitalizeWord(unitType || 'Unit');
}

/**
 * Formats a tactical sub-unit label as `N1 Type (N2)` using the parent’s strategic display name plus a two-digit sub-index.
 *
 * Purpose: Keeps milestone-2.1 tactical naming aligned with the execution plan while reusing strategic ordinals/roman labels.
 * When to use: When synthesizing `TacticalSubUnitSnapshot.displayName` from `buildUnitDisplayNameLookup` parent strings.
 * Expected outcome: Strings like `23rd Infantry (01)` or `IV Fleet (12)` for the given parent label and ordinal.
 * Exceptions: None.
 */
export function formatTacticalSubUnitDisplayName(parentStrategicDisplayName: string, subUnitOrdinal1Based: number): string {
  const normalized = Math.max(1, Math.trunc(subUnitOrdinal1Based));
  const two = String(normalized).padStart(2, '0');
  return `${parentStrategicDisplayName} (${two})`;
}

/**
 * Resolves the player-facing label for a tactical sub-unit when composing validation or status strings.
 *
 * Purpose: Tactical orders and IPC payloads key sub-units by opaque ids (`parentUnitId:ordinal`, unique within the active battle); surfaced errors should match sidebar/tooltip naming via `displayName`.
 * When to use: Tactical-mode branches in main-process validation that prefix a unit key in `reason` text (ranged, air, ferry, etc.).
 * Expected outcome: Trims and returns the snapshot row’s `displayName` when present; otherwise returns `subUnitId` for diagnostics.
 * Exceptions: None.
 */
export function tacticalSubUnitLabelForUserMessage(
  subUnits: readonly { id: string; displayName: string }[],
  subUnitId: string
): string {
  const row = subUnits.find((u) => u.id === subUnitId);
  const name = row?.displayName?.trim() ?? '';
  return name.length > 0 ? name : subUnitId;
}

/**
 * Builds a stable `(unitId) => label` resolver for strategic roster rows (ordinal + type noun display names).
 *
 * Purpose: User-facing validation and IPC reasons should never echo raw `human-infantry-1` ids when a proper label exists on the snapshot.
 * When to use: Once per request boundary (submit orders, grouped validation) before iterating units; reuse the returned function for each id.
 * Expected outcome: Same strings as `buildUnitDisplayNameLookup` for known ids; `fallbackDisplayNameFromUnitId` when the id is absent from `units`.
 * Exceptions: None.
 */
export function buildStrategicUnitDisplayLabelResolver(
  units: readonly UnitDisplayIdentity[],
  locale?: Intl.LocalesArgument
): (unitId: string) => string {
  const lookup = buildUnitDisplayNameLookup(units, locale);
  return (unitId: string) => lookup.get(unitId) ?? fallbackDisplayNameFromUnitId(unitId, locale);
}

/**
 * Collects display-order identity rows for every unit id referenced in kill edges.
 *
 * Purpose: Kill toasts use fog-filtered `GameStateSnapshot.units`, which omits opponent killers outside visible hexes; this roster preserves authoritative names from resolution-time DB rows and casualty snapshots.
 * When to use: Strategic Ready / melee finalize when building `ReadyResult.killLabelUnits`; renderer kill toast formatters merge this roster before `buildUnitDisplayNameLookup`.
 * Expected outcome: One row per kill participant id found in `liveUnits` or `removedUnits`; ids with no row are omitted.
 * Exceptions: None.
 */
export function buildKillLabelUnitRoster(
  killEdges: readonly { victimId: string; killerIds: string[] }[],
  liveUnits: readonly UnitDisplayIdentity[],
  removedUnits: readonly { id: string; unitType: string; displayOrder?: number }[]
): UnitDisplayIdentity[] {
  const participantIds = new Set<string>();
  for (const edge of killEdges) {
    participantIds.add(edge.victimId);
    for (const killerId of edge.killerIds) participantIds.add(killerId);
  }
  if (participantIds.size === 0) return [];

  const byId = new Map<string, UnitDisplayIdentity>();
  for (const unit of liveUnits) {
    byId.set(unit.id, { id: unit.id, unitType: unit.unitType, displayOrder: unit.displayOrder });
  }
  for (const unit of removedUnits) {
    if (byId.has(unit.id)) continue;
    byId.set(unit.id, { id: unit.id, unitType: unit.unitType, displayOrder: unit.displayOrder });
  }

  const out: UnitDisplayIdentity[] = [];
  for (const id of participantIds) {
    const row = byId.get(id);
    if (row) out.push(row);
  }
  return out;
}

/**
 * Defines the `buildUnitDisplayNameLookup` function shape (export function buildUnitDisplayNameLookup().

 * Purpose: Supports maintainability by documenting why `buildUnitDisplayNameLookup` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildUnitDisplayNameLookup(
  units: readonly UnitDisplayIdentity[],
  locale?: Intl.LocalesArgument
): Map<string, string> {
  const byGroup = new Map<string, UnitDisplayIdentity[]>();
  for (const unit of units) {
    const key = unit.unitType;
    const existing = byGroup.get(key);
    if (existing) existing.push(unit);
    else byGroup.set(key, [unit]);
  }

  const result = new Map<string, string>();
  for (const [unitType, group] of byGroup.entries()) {
    const withPersisted = group
      .filter((u) => resolvePersistedDisplayOrderForUnitLabel(u) !== undefined)
      .sort(
        (a, b) =>
          (resolvePersistedDisplayOrderForUnitLabel(a) as number) -
            (resolvePersistedDisplayOrderForUnitLabel(b) as number) ||
          NATURAL_ID_COLLATOR.compare(a.id, b.id)
      );
    const withoutPersisted = group
      .filter((u) => resolvePersistedDisplayOrderForUnitLabel(u) === undefined)
      .sort((a, b) => NATURAL_ID_COLLATOR.compare(a.id, b.id));
    const noun = getUnitDisplayNoun(unitType);
    for (const unit of withPersisted) {
      const ordinal = resolvePersistedDisplayOrderForUnitLabel(unit) as number;
      const numberLabel = formatUnitNumberLabel(unit.id, ordinal, locale);
      result.set(unit.id, `${numberLabel} ${noun}`);
    }
    let fallbackOrdinal = withPersisted.reduce(
      (max, u) => Math.max(max, resolvePersistedDisplayOrderForUnitLabel(u) as number),
      0
    );
    for (const unit of withoutPersisted) {
      fallbackOrdinal += 1;
      const numberLabel = formatUnitNumberLabel(unit.id, fallbackOrdinal, locale);
      result.set(unit.id, `${numberLabel} ${noun}`);
    }
  }
  return result;
}

/**
 * Builds a player-facing label from a unit id when roster lookup is unavailable.
 *
 * Purpose: Last-resort naming for validation toasts and stale renderer caches; must not treat production spawn sequence as formation ordinal.
 * When to use: After `buildUnitDisplayNameLookup` misses an id; production ids without roster context return the raw id.
 * Expected outcome: Seed ids like `opponent-air-1` become roman/ordinal labels; production ids never become `CCLXXVI`-style labels from spawn tails.
 * Exceptions: Unknown id shapes return the id unchanged.
 */
export function fallbackDisplayNameFromUnitId(unitId: string, locale?: Intl.LocalesArgument): string {
  const seed = parseSeedUnitIdParts(unitId);
  if (seed) {
    const numberLabel = formatUnitNumberLabel(unitId, seed.ordinal, locale);
    return `${numberLabel} ${getUnitDisplayNoun(seed.unitType)}`;
  }
  if (productionSpawnSequenceFromUnitId(unitId) !== null) return unitId;
  return unitId;
}
