/**
 * Shared types and formatters for consolidated per-player, per-cause loss reporting in popups and AI prompts.
 */

import { isBuildUnitType, type BuildUnitType } from './ipc/productionTypes';

/** Maximum victim count on a prompt loss line before that line uses grouped type totals. */
export const LOSS_ENTRY_LIST_MAX = 5;

/**
 * Maximum count of one unit type that a popup loss line still names one by one.
 *
 * Purpose: A cause line collapses only the types that are crowded, and leaves the others named.
 * When to use: `formatLossEntries` for the map toast. Prompt lines keep {@link LOSS_ENTRY_LIST_MAX}.
 * Expected outcome: 3. A type with this many victims, or fewer, stays a name list.
 * Exceptions: None.
 */
export const LOSS_TYPE_NAME_LIST_MAX = 3;

/**
 * Unit type labels for grouped loss totals.
 */
const GROUP_LABEL_BY_TYPE: Record<LostUnitType, string> = {
  naval: 'Naval',
  air: 'Air',
  armor: 'Armored',
  infantry: 'Infantry',
  missile: 'Missile',
};

/** Order used when emitting grouped type totals on crowded loss lines. */
const GROUP_ORDER: LostUnitType[] = ['naval', 'air', 'armor', 'infantry', 'missile'];

/**
 * Supported unit types for loss grouping and display.
 */
export type LostUnitType = BuildUnitType;

/**
 * One destroyed unit entry on a loss cause line.
 *
 * Purpose: Carries display name and type for list-or-group formatting.
 * When to use: Built by `buildTurnLossSummary` and consumed by formatters in this module.
 * Expected outcome: `unitType` drives grouped totals; `displayName` drives short lists.
 * Exceptions: None.
 */
export interface LostUnit {
  /**
   * Unit type used for grouped totals when a cause line exceeds the list threshold.
   *
   * Contract: One of the four build unit types; unknown types should not reach formatters.
   * When to use: Assigned when normalizing removed-unit snapshots.
   * Expected outcome: Maps to Naval/Air/Armored/Infantry labels in grouped output.
   * Exceptions: None.
   */
  unitType: LostUnitType;
  /**
   * Human-readable unit label for short loss lists.
   *
   * Contract: Stable display string (ordinal/Roman name or tactical sub-unit label).
   * When to use: When `formatLossEntries` lists individual victims of a type at or under the popup cap.
   * Expected outcome: Shown comma-separated in popup loss lines.
   * Exceptions: None.
   */
  displayName: string;
  /**
   * Snapshot unit id for prompt-facing loss lists.
   *
   * Contract: Same id the rest of the AI prompt uses; omit on older persisted rows that only stored a display name.
   * When to use: `formatPlayerLossInline` for recent-turn notes in the system prompt.
   * Expected outcome: Prompt lists ids, never display names.
   * Exceptions: None.
   */
  unitId?: string;
}

/**
 * Per-player loss buckets keyed by combat cause for one resolved turn or beat.
 *
 * Purpose: Canonical structure shared by map toast and AI recent-turn notes.
 * When to use: Output of `buildTurnLossSummary`; input to formatters here.
 * Expected outcome: Each array holds victims for one cause; empty arrays are omitted from formatted output.
 * Exceptions: None.
 */
export interface PlayerLossSummary {
  /**
   * Victims destroyed by ranged direct fire (attacker-initiated ranged phase hits).
   *
   * Contract: Populated from `killsByDirectFire` victim ids.
   * When to use: Serialized to JSON for turn notes and formatted for UI.
   * Expected outcome: Rendered as the `Ranged attack` cause line when non-empty.
   * Exceptions: None.
   */
  ranged: LostUnit[];
  /**
   * Victims destroyed in melee engagements.
   *
   * Contract: Populated from explicit melee kill edges or strategic kill tail after ranged classification.
   * When to use: Serialized to JSON for turn notes and formatted for UI.
   * Expected outcome: Rendered as the `Melee attack` cause line when non-empty.
   * Exceptions: None.
   */
  melee: LostUnit[];
  /**
   * Victims destroyed by return fire during ranged engagements.
   *
   * Contract: Populated from `killsByReturnFire` victim ids.
   * When to use: Serialized to JSON for turn notes and formatted for UI.
   * Expected outcome: Rendered as the `Return fire` cause line when non-empty.
   * Exceptions: None.
   */
  returnFire: LostUnit[];
  /**
   * Victims destroyed by air strikes against enemy units or infrastructure (not counter-fire on the striker).
   *
   * Contract: Populated from air-strike kill edges where the victim is not the lost striker.
   * When to use: Serialized to JSON for turn notes and formatted for UI.
   * Expected outcome: Rendered as the `Air strike` cause line when non-empty.
   * Exceptions: Attacker losses from AA/counter-fire use `returnFire` instead.
   */
  airStrike: LostUnit[];
  /**
   * Air units destroyed on the ground by a missile.
   *
   * Contract: Populated from `missileStrikeRemovedUnits`. A unit also listed as an air-strike loss stays here.
   * When to use: Serialized to JSON for turn notes and formatted for UI.
   * Expected outcome: Rendered as the `Missile strike` cause line when non-empty.
   * Exceptions: The spent missile is never in this bucket.
   */
  missileStrike: LostUnit[];
  /**
   * Victims destroyed outside the four combat causes (transport loss, invalid base, etc.).
   *
   * Contract: Catch-all for removed units not mapped to ranged/melee/return/air strike.
   * When to use: Serialized to JSON for turn notes and formatted for UI.
   * Expected outcome: Rendered as the `Other losses` cause line when non-empty; always last in cause order.
   * Exceptions: None.
   */
  other: LostUnit[];
}

/**
 * Losses for one resolved strategic turn or tactical beat, filed by the victim's owner.
 *
 * Purpose: A turn can knock out more than one side, so losses are not a human bucket and an AI bucket.
 * When to use: After combat resolution, before the turn report or a commander's note.
 * Expected outcome: `byOwner` has one summary per owner that lost a visible unit.
 * Exceptions: None.
 */
export interface TurnLossSummary {
  /**
   * Cause buckets keyed by the victim's owner id.
   *
   * Contract: Missing keys mean that owner lost nothing visible. Each value has all six cause arrays.
   * When to use: The turn report and a note that still stores one seat's losses apart from everyone else's.
   * Expected outcome: The victim's owner id, including a seat other than the human.
   * Exceptions: None.
   */
  byOwner: Record<string, PlayerLossSummary>;
}

/**
 * Creates an empty per-player loss summary with all cause buckets initialized.
 *
 * Purpose: Shared initializer for normalizer and JSON parse fallbacks.
 * When to use: Start of `buildTurnLossSummary` and when hydrating partial DB rows.
 * Expected outcome: Mutable empty arrays for all six causes.
 * Exceptions: None.
 */
export function emptyPlayerLossSummary(): PlayerLossSummary {
  return { ranged: [], melee: [], returnFire: [], airStrike: [], missileStrike: [], other: [] };
}

/**
 * Creates an empty turn loss summary.
 *
 * Purpose: Shared initializer for normalizer output and tests.
 * When to use: Before populating buckets in `buildTurnLossSummary`.
 * Expected outcome: `byOwner` is empty until a victim is filed.
 * Exceptions: None.
 */
export function emptyTurnLossSummary(): TurnLossSummary {
  return { byOwner: {} };
}

/**
 * Copies several owners' buckets into one summary.
 *
 * Purpose: A commander's note still stores that seat's losses apart from every other owner.
 * When to use: When writing the note's other-owners column.
 * Expected outcome: One summary whose cause arrays hold every input unit.
 * Exceptions: None.
 */
export function mergePlayerLossSummaries(parts: readonly PlayerLossSummary[]): PlayerLossSummary {
  const merged = emptyPlayerLossSummary();
  for (const part of parts) {
    for (const key of LOSS_CAUSE_KEYS) merged[key].push(...part[key]);
  }
  return merged;
}

/**
 * Returns whether a player lost any units across all six cause buckets.
 *
 * Purpose: Tells a caller whether this side's buckets are empty.
 * When to use: Before emitting a loss line for that side.
 * Expected outcome: `true` when any bucket has at least one `LostUnit`.
 * Exceptions: None.
 */
export function playerHasAnyLoss(summary: PlayerLossSummary): boolean {
  return (
    summary.ranged.length > 0 ||
    summary.melee.length > 0 ||
    summary.returnFire.length > 0 ||
    summary.airStrike.length > 0 ||
    summary.missileStrike.length > 0 ||
    summary.other.length > 0
  );
}

/**
 * Whether a victim type is one of the four that can collapse on a popup line.
 *
 * Purpose: An unexpected type stays a name so a loss is not dropped.
 * When to use: `formatLossEntries` only.
 * Expected outcome: True for every build unit type, including missiles.
 * Exceptions: None.
 */
function isKnownLossType(unitType: string): unitType is LostUnitType {
  return isBuildUnitType(unitType);
}

/**
 * Formats victim entries for one popup cause line.
 *
 * Purpose: Names a type that lost three or fewer units, and collapses a type that lost more.
 * When to use: `formatPlayerLossLinesMultiline` only. Prompt lines use `formatLossEntriesForPrompt`.
 * Expected outcome: Named units first, in input order, then `4x Infantry` groups in naval, air, armor, infantry order.
 *   A type outside those four stays a name. An empty list is an empty string.
 * Exceptions: None.
 */
export function formatLossEntries(units: readonly LostUnit[]): string {
  if (units.length === 0) return '';
  const counts: Record<LostUnitType, number> = { naval: 0, air: 0, armor: 0, infantry: 0, missile: 0 };
  for (const unit of units) {
    if (isKnownLossType(unit.unitType)) counts[unit.unitType] += 1;
  }
  const parts: string[] = [];
  for (const unit of units) {
    if (!isKnownLossType(unit.unitType) || counts[unit.unitType] <= LOSS_TYPE_NAME_LIST_MAX) {
      parts.push(unit.displayName);
    }
  }
  for (const unitType of GROUP_ORDER) {
    const count = counts[unitType];
    if (count > LOSS_TYPE_NAME_LIST_MAX) parts.push(`${String(count)}x ${GROUP_LABEL_BY_TYPE[unitType]}`);
  }
  return parts.join(', ');
}

/**
 * Formats victim entries for AI prompt loss lines using snapshot ids.
 *
 * Purpose: Prompt copy must address units by id; display names are a second handle the model must not see.
 * When to use: `formatPlayerLossInline` only.
 * Expected outcome: Comma-separated ids when every row has `unitId` and the list is short; otherwise grouped type totals.
 * Exceptions: None.
 */
function formatLossEntriesForPrompt(units: readonly LostUnit[]): string {
  if (units.length === 0) return '';
  if (units.length <= LOSS_ENTRY_LIST_MAX) {
    const ids = units.map((u) => u.unitId).filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (ids.length === units.length) return ids.join(', ');
  }
  return formatGroupedTypeTotals(units);
}

/**
 * Groups victims by type for crowded or id-less prompt lines.
 *
 * Purpose: Prompt fallback when a cause line is long or a victim has no id. Popup lines do not use this.
 * When to use: `formatLossEntriesForPrompt` when the line is long or a victim has no id.
 * Expected outcome: `N Naval, N Air, ...` with zero groups omitted.
 * Exceptions: None.
 */
function formatGroupedTypeTotals(units: readonly LostUnit[]): string {
  const counts: Record<LostUnitType, number> = { naval: 0, air: 0, armor: 0, infantry: 0, missile: 0 };
  for (const u of units) {
    if (u.unitType in counts) counts[u.unitType] += 1;
  }
  const parts: string[] = [];
  for (const t of GROUP_ORDER) {
    const n = counts[t];
    if (n > 0) parts.push(`${n.toLocaleString()} ${GROUP_LABEL_BY_TYPE[t]}`);
  }
  return parts.join(', ');
}

/** Cause line label and formatted victim text for multiline popup rendering. */
export interface PlayerLossCauseLine {
  /**
   * Display label for the cause (e.g. `Ranged attack`).
   *
   * Contract: One of the five canonical cause labels defined in this module.
   * When to use: A cause line under a side's loss section.
   * Expected outcome: Shown before `: ` and the formatted victim text.
   * Exceptions: None.
   */
  causeLabel: string;
  /**
   * Formatted victim list or grouped totals for this cause.
   *
   * Contract: Output of `formatLossEntries` for the cause bucket.
   * When to use: Appended after `causeLabel` in popup and prompt formatters.
   * Expected outcome: Non-empty string when the line is emitted.
   * Exceptions: None.
   */
  text: string;
}

const CAUSE_SPECS: ReadonlyArray<{ key: keyof PlayerLossSummary; label: string }> = [
  { key: 'ranged', label: 'Ranged attack' },
  { key: 'melee', label: 'Melee attack' },
  { key: 'returnFire', label: 'Return fire' },
  { key: 'airStrike', label: 'Air strike' },
  { key: 'missileStrike', label: 'Missile strike' },
  { key: 'other', label: 'Other losses' },
];

/**
 * The six loss-cause labels, in display order.
 *
 * Purpose: Lets UI code recognize `<label>: ...` loss lines without restating the label literals.
 * When to use: When parsing formatted loss lines, for example to decorate victim names in the map toast.
 * Expected outcome: `Ranged attack`, `Melee attack`, `Return fire`, `Air strike`, `Missile strike`, `Other losses`.
 * Exceptions: None.
 */
export const LOSS_CAUSE_LABELS: ReadonlyArray<string> = CAUSE_SPECS.map((spec) => spec.label);

/**
 * The five loss-cause bucket keys of `PlayerLossSummary`, in display order.
 *
 * Purpose: Lets callers walk every victim bucket without restating the key list.
 * When to use: When every `LostUnit` of a summary must be visited.
 * Expected outcome: `ranged`, `melee`, `returnFire`, `airStrike`, `other`.
 * Exceptions: None.
 */
export const LOSS_CAUSE_KEYS: ReadonlyArray<keyof PlayerLossSummary> = CAUSE_SPECS.map((spec) => spec.key);

/**
 * Builds non-empty cause lines for one player's losses (multiline popup use).
 *
 * Purpose: Produces ordered cause sub-bullets under a player section header.
 * When to use: `buildTurnLossSections` when rendering one side's loss section.
 * Expected outcome: One entry per non-empty bucket in canonical cause order.
 * Exceptions: None.
 */
export function formatPlayerLossLinesMultiline(summary: PlayerLossSummary): PlayerLossCauseLine[] {
  const lines: PlayerLossCauseLine[] = [];
  for (const spec of CAUSE_SPECS) {
    const units = summary[spec.key];
    if (units.length === 0) continue;
    const text = formatLossEntries(units);
    if (text.length > 0) lines.push({ causeLabel: spec.label, text });
  }
  return lines;
}

/**
 * Builds a single semicolon-separated loss summary for one player (prompt use).
 *
 * Purpose: Compact per-player loss text inside recent-turn prompt bullets.
 * When to use: `buildRecentTurnNotesSection` when formatting `Human Losses:` / `AI Losses:` lines.
 * Expected outcome: Empty string when no losses; otherwise `Ranged attack: ...; Melee attack: ...` with empty causes omitted.
 * Exceptions: None.
 */
export function formatPlayerLossInline(summary: PlayerLossSummary): string {
  const parts: string[] = [];
  for (const spec of CAUSE_SPECS) {
    const units = summary[spec.key];
    if (units.length === 0) continue;
    const text = formatLossEntriesForPrompt(units);
    if (text.length > 0) parts.push(`${spec.label}: ${text}`);
  }
  return parts.join('; ');
}

/**
 * Parses a JSON blob into a {@link PlayerLossSummary}, tolerating partial or invalid data.
 *
 * Purpose: Hydrates persisted turn-note loss columns from SQLite.
 * When to use: `buildRecentTurnNotesSection` when reading `human_loss_json` / `ai_loss_json`.
 * Expected outcome: Returns empty buckets for null/invalid JSON; preserves valid units only.
 * Exceptions: None.
 */
export function parsePlayerLossSummaryJson(raw: string | null | undefined): PlayerLossSummary {
  const empty = emptyPlayerLossSummary();
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof PlayerLossSummary, unknown>>;
    const readBucket = (key: keyof PlayerLossSummary): LostUnit[] => {
      const arr = parsed[key];
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((u): u is LostUnit => {
          if (!u || typeof u !== 'object') return false;
          const row = u as LostUnit;
          return typeof row.displayName === 'string' && typeof row.unitType === 'string';
        })
        .map((u) => ({
          displayName: u.displayName,
          unitType: u.unitType as LostUnitType,
          ...(typeof (u as { unitId?: unknown }).unitId === 'string'
            ? { unitId: (u as { unitId: string }).unitId }
            : {}),
        }));
    };
    return {
      ranged: readBucket('ranged'),
      melee: readBucket('melee'),
      returnFire: readBucket('returnFire'),
      airStrike: readBucket('airStrike'),
      missileStrike: readBucket('missileStrike'),
      other: readBucket('other'),
    };
  } catch {
    return empty;
  }
}

/**
 * Serializes a {@link PlayerLossSummary} for persistence in turn notes.
 *
 * Purpose: Writes loss buckets to SQLite JSON columns.
 * When to use: `upsertTurnLossNote` after `buildTurnLossSummary`.
 * Expected outcome: Stable JSON string with all five bucket keys present.
 * Exceptions: None.
 */
export function serializePlayerLossSummary(summary: PlayerLossSummary): string {
  return JSON.stringify(summary);
}
