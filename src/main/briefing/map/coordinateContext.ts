/**
 * Describes which coordinate namespace applies when translating 2-character briefing codes.
 *
 * Purpose: Keeps strategic res1 codes and tactical res4 codes disjoint while reusing the same wire format.
 * When to use: Pass into hex registry lookups, translators, parsers, and tool arg normalization for the active OpenRouter session.
 * Expected outcome: Callers never mix registries across strategic vs tactical modes.
 * Exceptions: Tactical mode requires `battleId`; omitting it should be rejected by validators.
 */

/**
 * Active map mode for hex-code translation (strategic global vs one tactical battle).
 *
 * Contract: `tactical` requires a non-empty `battleId` matching the active tactical session.
 * When to use: Construct at the start of `requestOrdersFlow` from whether `tacticalAiBattle` is set.
 * Expected outcome: Downstream APIs can select the correct registry without inferring from H3 resolution alone.
 * Exceptions: None.
 */
export type CoordinateContextMode = 'strategic' | 'tactical';

/**
 * Parameters selecting which 2-character code registry is authoritative for this interaction.
 *
 * Contract: `mode === 'tactical'` implies `battleId` is defined and non-empty.
 * When to use: Thread through briefing generation, tool execution, and JSON parsing for the same consultation.
 * Expected outcome: The same context object is reused for the full OpenRouter turn to avoid mismatched translations.
 * Exceptions: None.
 */
export interface CoordinateContext {
  /**
   * Selects strategic res1 vs tactical res4 registry semantics.
   *
   * Contract: Must match the active game mode for the snapshot being briefed or ordered against.
   * When to use: Always pass explicitly; do not infer from H3 string shape.
   * Expected outcome: Registry lookups succeed only for cells belonging to the active namespace.
   * Exceptions: None.
   */
  mode: CoordinateContextMode;
  /**
   * Tactical battle identifier used to key the res4 registry (strategic mode ignores this field).
   *
   * Contract: Present and non-empty when `mode === 'tactical'`.
   * When to use: Populate from `TacticalBattleSnapshot.battleId` for tactical AI consultations.
   * Expected outcome: Multiple battles never share a registry instance.
   * Exceptions: None.
   */
  battleId?: string;
}

/**
 * Regex for valid 2-character briefing codes (A–Z and 0–9 only; lowercase reserved for map overlays).
 *
 * Purpose: Fast validation before registry lookups and LLM JSON normalization.
 * When to use: Shared by parsers, tool arg decoders, and prompt examples.
 * Expected outcome: Strings outside this alphabet fail fast with actionable errors.
 * Exceptions: None.
 */
export const HEX_CODE_PATTERN = /^[A-Z0-9]{2}$/;
