/**
 * Centralized display-name formatting for units shown to players.
 * Internal unit IDs remain unchanged and are still used for game logic.
 */

export interface UnitDisplayIdentity {
  id: string;
  unitType: string;
  displayOrder?: number;
}

const UNIT_TYPE_NOUN_BY_TYPE: Record<string, string> = {
  infantry: 'Infantry',
  armor: 'Armored',
  naval: 'Fleet',
};

const NATURAL_ID_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function capitalizeWord(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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
 * Why this exists:
 *     Builds ordinal labels with locale-aware grouped numbers while keeping English ordinal suffix rules.
 * When to use:
 *     Any player-facing unit name surface that displays Nth-style numbering.
 * What to expect:
 *     Examples: 1st, 2nd, 3rd, 4th, 12th, 22nd, 1,234th (group separators from runtime locale).
 */
export function formatOrdinalLabel(value: number, locale?: Intl.LocalesArgument): string {
  const normalized = Math.max(1, Math.trunc(value));
  const numberText = new Intl.NumberFormat(locale).format(normalized);
  return `${numberText}${ordinalSuffix(normalized)}`;
}

/**
 * Why this exists:
 *     Maps internal unit-type values to player-facing unit-class nouns.
 * When to use:
 *     Rendering display names in the UI and other player-visible summaries.
 * What to expect:
 *     Known types: Infantry/Armored/Fleet; unknown types are title-cased.
 */
export function getUnitDisplayNoun(unitType: string): string {
  return UNIT_TYPE_NOUN_BY_TYPE[unitType] ?? capitalizeWord(unitType || 'Unit');
}

/**
 * Why this exists:
 *     Generates stable per-unit-type ordinals for the current roster without changing internal IDs.
 * When to use:
 *     Build a lookup for any player-facing panel/toast/list that prints unit names.
 * What to expect:
 *     Numbering starts at 1 per unit type and should use persisted displayOrder when provided.
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
      .filter((u) => typeof u.displayOrder === 'number' && u.displayOrder > 0)
      .sort((a, b) => (a.displayOrder as number) - (b.displayOrder as number) || NATURAL_ID_COLLATOR.compare(a.id, b.id));
    const withoutPersisted = group
      .filter((u) => !(typeof u.displayOrder === 'number' && u.displayOrder > 0))
      .sort((a, b) => NATURAL_ID_COLLATOR.compare(a.id, b.id));
    const noun = getUnitDisplayNoun(unitType);
    for (const unit of withPersisted) {
      result.set(unit.id, `${formatOrdinalLabel(unit.displayOrder as number, locale)} ${noun}`);
    }
    let fallbackOrdinal = withPersisted.reduce((max, u) => Math.max(max, u.displayOrder as number), 0);
    for (const unit of withoutPersisted) {
      fallbackOrdinal += 1;
      result.set(unit.id, `${formatOrdinalLabel(fallbackOrdinal, locale)} ${noun}`);
    }
  }
  return result;
}

/**
 * Best-effort fallback for rare cases where only a raw unit ID is available.
 * Prefers returning the original ID when type/ordinal cannot be inferred.
 */
export function fallbackDisplayNameFromUnitId(unitId: string, locale?: Intl.LocalesArgument): string {
  const typeMatch = unitId.match(/-(infantry|armor|naval)-/);
  const ordinalMatch = unitId.match(/(\d+)(?!.*\d)/);
  if (!typeMatch || !ordinalMatch) return unitId;
  const ordinalValue = Number.parseInt(ordinalMatch[1] ?? '', 10);
  if (!Number.isFinite(ordinalValue) || ordinalValue <= 0) return unitId;
  return `${formatOrdinalLabel(ordinalValue, locale)} ${getUnitDisplayNoun(typeMatch[1] ?? '')}`;
}
