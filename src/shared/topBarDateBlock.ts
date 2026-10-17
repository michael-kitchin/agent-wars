/**
 * Inputs for the two lines of the top bar's date block.
 *
 * Purpose: Keeps the wording rules in one pure function that tests can cover without a DOM.
 * When to use: Built by the renderer from the latest snapshot before each top-bar refresh.
 * Expected outcome: Every field is a plain value; no field is read from renderer state inside the formatter.
 * Exceptions: None.
 */
export interface TopBarDateBlockArgs {
  /**
   * Whether a game-state snapshot exists.
   *
   * Contract: False before the first snapshot arrives.
   * When to use: Pass `state != null`.
   * Expected outcome: False makes both lines an em dash.
   * Exceptions: None.
   */
  readonly hasGameState: boolean;
  /**
   * The match date from the snapshot, such as "March, Year 1".
   *
   * Contract: May be empty when the snapshot has no date.
   * When to use: Pass `state.currentDateLabel ?? ''`.
   * Expected outcome: Shown as the first line; an empty value shows an em dash.
   * Exceptions: None.
   */
  readonly dateLabel: string;
  /**
   * The strategic turn number.
   *
   * Contract: A positive whole number once a match is loaded.
   * When to use: Pass `state.turnNumber`.
   * Expected outcome: Shown as "Turn N".
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The title-cased strategic phase, such as "Planning".
   *
   * Contract: One word, already title-cased.
   * When to use: Pass the snapshot phase after title-casing it.
   * Expected outcome: Shown after the turn number.
   * Exceptions: None.
   */
  readonly strategicPhaseLabel: string;
}

/**
 * The two lines of the date block.
 *
 * Purpose: Lets the renderer write both lines from one call.
 * When to use: Returned by `formatTopBarDateBlock`.
 * Expected outcome: Plain text for each line.
 * Exceptions: None.
 */
export interface TopBarDateBlockText {
  /**
   * The first line: the match date.
   *
   * Contract: Plain text, never HTML.
   * When to use: Write with `textContent`.
   * Expected outcome: The date, or an em dash.
   * Exceptions: None.
   */
  readonly date: string;
  /**
   * The second line: the strategic turn and phase.
   *
   * Contract: Plain text, never HTML.
   * When to use: Write with `textContent`.
   * Expected outcome: For example "Turn 7 · Planning".
   * Exceptions: None.
   */
  readonly turnPhase: string;
}

/**
 * Formats the top bar's date block.
 *
 * Purpose: The player reads the date first and the turn and phase second.
 * When to use: Every top-bar refresh. In a battle the block is hidden and the battle header shows the beat; see
 *   `formatBattleHeaderStatus`.
 * Expected outcome: Em dashes with no snapshot. Otherwise the date and "Turn N · Phase".
 * Exceptions: None.
 */
export function formatTopBarDateBlock(args: TopBarDateBlockArgs): TopBarDateBlockText {
  if (!args.hasGameState) return { date: '—', turnPhase: '—' };
  const date = args.dateLabel.length > 0 ? args.dateLabel : '—';
  return { date, turnPhase: `Turn ${args.turnNumber} · ${args.strategicPhaseLabel}` };
}
