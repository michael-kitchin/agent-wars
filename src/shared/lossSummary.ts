/**
 * Shared types and formatters for consolidated per-player, per-cause loss reporting in popups and AI prompts.
 */

/** Maximum victim count before switching from name lists to grouped type totals. */
export const LOSS_ENTRY_LIST_MAX = 5;

/**
 * Unit type labels for grouped loss totals when a cause line exceeds {@link LOSS_ENTRY_LIST_MAX} entries.
 */
const GROUP_LABEL_BY_TYPE: Record<LostUnitType, string> = {
  naval: 'Naval',
  air: 'Air',
  armor: 'Armored',
  infantry: 'Infantry',
};

/** Order used when emitting grouped type totals on crowded loss lines. */
const GROUP_ORDER: LostUnitType[] = ['naval', 'air', 'armor', 'infantry'];

/**
 * Supported unit types for loss grouping and display.
 */
export type LostUnitType = 'naval' | 'air' | 'armor' | 'infantry';

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
   * When to use: When `formatLossEntries` lists individual victims (≤ threshold).
   * Expected outcome: Shown comma-separated in popup and prompt loss lines.
   * Exceptions: None.
   */
  displayName: string;
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
   * Victims destroyed by air strikes (including AA and infrastructure counterattacks).
   *
   * Contract: Populated from air-strike kill edges and `airStrikeRemovedUnits` without prior classification.
   * When to use: Serialized to JSON for turn notes and formatted for UI.
   * Expected outcome: Rendered as the `Air strike` cause line when non-empty.
   * Exceptions: None.
   */
  airStrike: LostUnit[];
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
 * Human and AI loss summaries for one resolved strategic turn or tactical beat.
 *
 * Purpose: Top-level payload for popup sections and persisted turn notes.
 * When to use: After combat resolution on main or renderer before formatting.
 * Expected outcome: `human` holds human-player buckets; `ai` holds opponent buckets.
 * Exceptions: None.
 */
export interface TurnLossSummary {
  /**
   * Losses suffered by the human player this turn or beat.
   *
   * Contract: All five cause buckets; may be empty arrays when no human casualties.
   * When to use: Popup `Human Losses` section and prompt `Human Losses` bullet.
   * Expected outcome: Formatted only when `playerHasAnyLoss` is true.
   * Exceptions: None.
   */
  human: PlayerLossSummary;
  /**
   * Losses suffered by the AI/opponent this turn or beat.
   *
   * Contract: All five cause buckets; may be empty arrays when no opponent casualties.
   * When to use: Popup `AI Losses` section and prompt `AI Losses` bullet.
   * Expected outcome: Formatted only when `playerHasAnyLoss` is true; popup may fog-filter victims before building.
   * Exceptions: None.
   */
  ai: PlayerLossSummary;
}

/**
 * Creates an empty per-player loss summary with all cause buckets initialized.
 *
 * Purpose: Shared initializer for normalizer and JSON parse fallbacks.
 * When to use: Start of `buildTurnLossSummary` and when hydrating partial DB rows.
 * Expected outcome: Mutable empty arrays for all five causes.
 * Exceptions: None.
 */
export function emptyPlayerLossSummary(): PlayerLossSummary {
  return { ranged: [], melee: [], returnFire: [], airStrike: [], other: [] };
}

/**
 * Creates an empty turn loss summary for both players.
 *
 * Purpose: Shared initializer for normalizer output and tests.
 * When to use: Before populating buckets in `buildTurnLossSummary`.
 * Expected outcome: Both `human` and `ai` have empty cause arrays.
 * Exceptions: None.
 */
export function emptyTurnLossSummary(): TurnLossSummary {
  return { human: emptyPlayerLossSummary(), ai: emptyPlayerLossSummary() };
}

/**
 * Returns whether a player lost any units across all five cause buckets.
 *
 * Purpose: Suppresses empty `Human Losses` / `AI Losses` popup and prompt lines.
 * When to use: Before rendering player-specific sections or bullets.
 * Expected outcome: `true` when any bucket has at least one `LostUnit`.
 * Exceptions: None.
 */
export function playerHasAnyLoss(summary: PlayerLossSummary): boolean {
  return (
    summary.ranged.length > 0 ||
    summary.melee.length > 0 ||
    summary.returnFire.length > 0 ||
    summary.airStrike.length > 0 ||
    summary.other.length > 0
  );
}

/**
 * Formats victim entries for one cause line using list or grouped-type rules.
 *
 * Purpose: Implements the ≤5 name list vs >5 grouped totals contract.
 * When to use: Inside `formatPlayerLossLinesMultiline` and `formatPlayerLossInline`.
 * Expected outcome: Comma-separated names when `units.length <= LOSS_ENTRY_LIST_MAX`; otherwise `N Naval, N Air, ...` with zero groups omitted.
 * Exceptions: None.
 */
export function formatLossEntries(units: readonly LostUnit[]): string {
  if (units.length === 0) return '';
  if (units.length <= LOSS_ENTRY_LIST_MAX) {
    return units.map((u) => u.displayName).join(', ');
  }
  const counts: Record<LostUnitType, number> = { naval: 0, air: 0, armor: 0, infantry: 0 };
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
   * When to use: Popup sub-bullets under `Human Losses` / `AI Losses`.
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
  { key: 'other', label: 'Other losses' },
];

/**
 * Builds non-empty cause lines for one player's losses (multiline popup use).
 *
 * Purpose: Produces ordered cause sub-bullets under a player section header.
 * When to use: `buildConsolidatedTurnUpdateSections` when rendering Human/AI Losses.
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
  const parts = formatPlayerLossLinesMultiline(summary).map((line) => `${line.causeLabel}: ${line.text}`);
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
        }));
    };
    return {
      ranged: readBucket('ranged'),
      melee: readBucket('melee'),
      returnFire: readBucket('returnFire'),
      airStrike: readBucket('airStrike'),
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
