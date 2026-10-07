/**
 * Documents the `MeleeCandidateRow` interface as a named contract surface (export interface MeleeCandidateRow).

 * Purpose: Carries per-hex melee intercept metadata from main to renderer without duplicating terrain HTML (built client-side).
 * When to use: Populating `ReadyResult.meleeInterceptCandidates` while `awaitingMeleeDecision` is true.
 * Expected outcome: Renderer shows radio row per `h3Index` with summaries and tooltip-equivalent terrain column.
 * Exceptions: None.
 */
export interface MeleeCandidateRow {
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Strategic cell id where melee would resolve.
   * When to use: Row key and tactical auto-start target after Fight.
   * Expected outcome: Valid strategic index present in the strategic map.
   * Exceptions: None.
   */
h3Index: string;
    /**
   * Specifies the contract for the `humanUnitSummary` member (humanUnitSummary: string;).

   * Contract: Non-empty categories only, stable order air → armor → infantry → naval (e.g. "2 infantry, 1 armor").
   * When to use: Human column in the intercept modal.
   * Expected outcome: Plain text suitable for table cell display.
   * Exceptions: None.
   */
humanUnitSummary: string;
    /**
   * Specifies the contract for the `aiUnitSummary` member (aiUnitSummary: string;).

   * Contract: Same formatting rules as `humanUnitSummary` for opponent units in the hex.
   * When to use: AI column in the intercept modal.
   * Expected outcome: Plain text suitable for table cell display.
   * Exceptions: None.
   */
aiUnitSummary: string;
}

/**
 * Documents the `ResolveMeleeInterceptIpcPayload` interface as a named contract surface (export interface ResolveMeleeInterceptIpcPayload).

 * Purpose: IPC body for resuming a paused ready after the player chooses Fight or Ignore on the melee intercept modal.
 * When to use: Renderer calls `game:resolveMeleeIntercept` after `awaitingMeleeDecision` from ready.
 * Expected outcome: Main completes melee and remainder of the turn, returning a normal `ReadyResult` completion payload.
 * Exceptions: Invalid token or phase yields `success: false` with reason.
 */
export interface ResolveMeleeInterceptIpcPayload {
    /**
   * Specifies the contract for the `meleeDecisionToken` member (meleeDecisionToken: string;).

   * Contract: Must match the token issued with `awaitingMeleeDecision`.
   * When to use: Every resolve call.
   * Expected outcome: Rejects stale decisions when token mismatches pending snapshot.
   * Exceptions: None.
   */
meleeDecisionToken: string;
    /**
   * Specifies the contract for the `decision` member (decision: 'fight' | 'ignore';).

   * Contract: Fight skips melee in exactly one selected hex for this turn; Ignore runs stock melee everywhere.
   * When to use: User modal choice.
   * Expected outcome: Fight requires `selectedH3Index` present in the candidate list from the paired ready pause.
   * Exceptions: None.
   */
decision: 'fight' | 'ignore';
    /**
   * Specifies the contract for the `selectedH3Index` member (selectedH3Index?: string;).

   * Contract: Required when `decision` is fight; must be one of the candidate strategic hex ids.
   * When to use: Fight path only.
   * Expected outcome: That hex is excluded from strategic melee resolution for this turn.
   * Exceptions: None.
   */
selectedH3Index?: string;
    /**
   * Specifies the contract for the `useEventDrivenConsultation` member (useEventDrivenConsultation?: boolean;).

   * Contract: When true, runs the same post-resolution AI consultation path as `game:ready`.
   * When to use: Renderer mirrors the flags from the prior ready click.
   * Expected outcome: Optional; defaults to false when omitted.
   * Exceptions: None.
   */
useEventDrivenConsultation?: boolean;
    /**
   * Specifies the contract for the `aiPlanningRunEnabled` member (aiPlanningRunEnabled?: boolean;).

   * Contract: Gates whether after-resolution consultation may call the model.
   * When to use: Renderer mirrors the ready panel toggle.
   * Expected outcome: Optional; defaults to false when omitted.
   * Exceptions: None.
   */
aiPlanningRunEnabled?: boolean;
    /**
   * Specifies the contract for the `enabledToolGroups` member (enabledToolGroups?: string[];).

   * Contract: Tool group ids forwarded into after-resolution consultation.
   * When to use: Renderer mirrors enabled tool groups from the prior ready click.
   * Expected outcome: Optional; IPC handler falls back to defaults when absent.
   * Exceptions: None.
   */
enabledToolGroups?: string[];
}
