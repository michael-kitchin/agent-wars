/**
 * Inputs for the two lines of the top bar's date block.
 *
 * Purpose: Keeps the wording rules in one pure function that tests can cover without a DOM.
 * When to use: Built by the renderer from the latest snapshot and the battle state before each top-bar refresh.
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
   * Contract: Used only outside a battle.
   * When to use: Pass `state.turnNumber`.
   * Expected outcome: Shown as "Turn N".
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The title-cased strategic phase, such as "Planning".
   *
   * Contract: Used only outside a battle.
   * When to use: Pass the snapshot phase after title-casing it.
   * Expected outcome: Shown after the turn number.
   * Exceptions: None.
   */
  readonly strategicPhaseLabel: string;
  /**
   * The tactical beat number while a battle is active, otherwise null.
   *
   * Contract: Non-null exactly while a tactical battle snapshot is set.
   * When to use: Pass the battle snapshot's beat number, or null.
   * Expected outcome: A number switches the second line to the battle wording.
   * Exceptions: None.
   */
  readonly battleBeat: number | null;
  /**
   * Whether a beat is resolving or playing back.
   *
   * Contract: Only read while `battleBeat` is not null.
   * When to use: Pass true while beat playback runs.
   * Expected outcome: True shows "Tactical resolution"; false shows "Tactical planning".
   * Exceptions: None.
   */
  readonly beatPlaybackActive: boolean;
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
   * The second line: turn and phase, or beat and battle phase.
   *
   * Contract: Plain text, never HTML.
   * When to use: Write with `textContent`.
   * Expected outcome: For example "Turn 7 · Planning" or "Beat 2 · Tactical planning".
   * Exceptions: None.
   */
  readonly turnPhase: string;
}

/**
 * Formats the top bar's date block.
 *
 * Purpose: The player reads the date first and the turn and phase second, in both theaters.
 * When to use: Every top-bar refresh.
 * Expected outcome: Em dashes with no snapshot. Outside a battle, the date and "Turn N · Phase". In a battle, the
 *   date and "Beat N · Tactical planning" or "Beat N · Tactical resolution".
 * Exceptions: None.
 */
export function formatTopBarDateBlock(args: TopBarDateBlockArgs): TopBarDateBlockText {
  if (!args.hasGameState) return { date: '—', turnPhase: '—' };
  const date = args.dateLabel.length > 0 ? args.dateLabel : '—';
  if (args.battleBeat !== null) {
    const battlePhase = args.beatPlaybackActive ? 'Tactical resolution' : 'Tactical planning';
    return { date, turnPhase: `Beat ${args.battleBeat} · ${battlePhase}` };
  }
  return { date, turnPhase: `Turn ${args.turnNumber} · ${args.strategicPhaseLabel}` };
}
