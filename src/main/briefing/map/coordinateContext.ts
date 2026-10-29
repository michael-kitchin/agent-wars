import { AI_SEAT_IDS, type AiSeatId } from '../../../shared/seatIds';
import { logTrace } from '../../logger';

/**
 * Describes which coordinate namespace applies when translating 2-character briefing codes.
 *
 * Purpose: Keeps strategic codes and tactical codes disjoint while reusing the same wire format.
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
   * Selects strategic vs tactical registry semantics.
   *
   * Contract: Must match the active game mode for the snapshot being briefed or ordered against.
   * When to use: Always pass explicitly; do not infer from H3 string shape.
   * Expected outcome: Registry lookups succeed only for cells belonging to the active namespace.
   * Exceptions: None.
   */
  mode: CoordinateContextMode;
  /**
   * Tactical battle identifier used to key the tactical registry (strategic mode ignores this field).
   *
   * Contract: Present and non-empty when `mode === 'tactical'`.
   * When to use: Populate from `TacticalBattleSnapshot.battleId` for tactical AI consultations.
   * Expected outcome: Multiple battles never share a registry instance.
   * Exceptions: None.
   */
  battleId?: string;
  /**
   * Current tactical beat number for prompt headers (strategic mode ignores this field).
   *
   * Contract: Optional; when present with `mode === 'tactical'`, the system prompt labels Strategic turn vs Tactical beat.
   * When to use: Populate from `TacticalBattleSnapshot.tacticalTurnNumber` for tactical AI consultations.
   * Expected outcome: Models see beat numbering that matches the Commander briefing narrative.
   * Exceptions: None.
   */
  tacticalTurnNumber?: number;
  /**
   * The commander whose tools and standing orders this consultation applies.
   *
   * Contract: An AI seat. Absent only on contexts built before a seat was chosen.
   * When to use: Tool execution and envelope writes during `requestOrders`.
   * Expected outcome: That seat's units are the ones the tools may order.
   * Exceptions: None.
   */
  seatId?: AiSeatId;
  /**
   * Whether the tactical battle has at least one fortified cell.
   *
   * Contract: Omitted means false. Strategic consultations leave it unset.
   * When to use: Set from the battle owner record when the consultation is tactical.
   * Expected outcome: The combat paragraph includes the tactical fortification sentence only when this is true.
   * Exceptions: None.
   */
  hasFortifiedCells?: boolean;
}

/**
 * The commander this coordinate context is ordering for.
 *
 * Purpose: Envelope writes and order tools follow the consultation's seat.
 * When to use: Standing-order, production, and memory tools inside one `requestOrders` call.
 * Expected outcome: `seatId` when it was set. Otherwise the first AI seat, the only AI seat of a two-sided match.
 * Exceptions: None.
 */
export function coordinateContextSeatId(context: CoordinateContext): AiSeatId {
  const seatId = context.seatId ?? AI_SEAT_IDS[0];
  logTrace('coordinateContext coordinateContextSeatId', { seatId, hadSeat: context.seatId !== undefined });
  return seatId;
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
