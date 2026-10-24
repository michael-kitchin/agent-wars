/**
 * The sentence a player reads when a side is knocked out.
 *
 * Purpose: The notice toast and the Reports entry use one wording, including a seat that met more than one reason.
 * When to use: After Ready, once per knocked-out seat.
 * Expected outcome: The opening, the reasons in a fixed order, then what happens to the side's land and units.
 * Exceptions: None.
 */

const REASON_ORDER = ['home_control', 'no_city_hexes', 'home_cities_destroyed'] as const;

/**
 * Facts the notice names.
 *
 * Purpose: The sentence does not look up the roster itself.
 * When to use: `formatKnockoutNotice`.
 * Expected outcome: Names are already the words the player should read.
 * Exceptions: None.
 */
export interface KnockoutNoticeInput {
  /**
   * The side that is out, or the word for the human seat.
   *
   * Contract: A full home name. Ignored when `victimIsHuman` is true.
   * When to use: The opening sentence.
   * Expected outcome: "{name} is out of the match."
   * Exceptions: None.
   */
  readonly victimName: string;
  /**
   * True when the knocked-out seat is the human seat.
   *
   * Contract: A boolean.
   * When to use: The opening sentence.
   * Expected outcome: "You are out of the match."
   * Exceptions: None.
   */
  readonly victimIsHuman: boolean;
  /**
   * The side credited with the knockout.
   *
   * Contract: A full home name, or null when no seat is credited.
   * When to use: The home-control sentence.
   * Expected outcome: The name, or "A side" when null.
   * Exceptions: None.
   */
  readonly outByName: string | null;
  /**
   * Every reason that held.
   *
   * Contract: Reason ids. Unknown ids are skipped. Order in this list does not matter.
   * When to use: The middle sentences.
   * Expected outcome: Known reasons are written in home-control, no-city, destroyed-home order.
   * Exceptions: None.
   */
  readonly reasons: readonly string[];
  /**
   * True on the global map, where control means the whole home.
   *
   * Contract: False uses `controlShareLabel`.
   * When to use: The home-control sentence.
   * Expected outcome: "holds all of its home" when true.
   * Exceptions: None.
   */
  readonly globalHome: boolean;
  /**
   * The control share as a percent, such as "75%".
   *
   * Contract: Used only for a regional home-control sentence.
   * When to use: A regional map.
   * Expected outcome: "{OutBy} holds 75% of its home's cities."
   * Exceptions: None.
   */
  readonly controlShareLabel: string;
  /**
   * Units of that side that still exist.
   *
   * Contract: Zero or a positive whole number.
   * When to use: The garrison sentence.
   * Expected outcome: Zero omits the sentence.
   * Exceptions: None.
   */
  readonly remainingUnits: number;
}

/**
 * Writes one knockout notice.
 *
 * Purpose: Two reasons share one notice.
 * When to use: The notice toast and the Reports entry.
 * Expected outcome: Sentences separated by spaces. The land sentence is always last, or just before the garrison sentence.
 * Exceptions: None.
 */
export function formatKnockoutNotice(input: KnockoutNoticeInput): string {
  const sentences = [input.victimIsHuman ? 'You are out of the match.' : `${input.victimName} is out of the match.`];
  const held = new Set(input.reasons);
  for (const reason of REASON_ORDER) {
    if (!held.has(reason)) continue;
    if (reason === 'home_control') {
      const outBy = input.outByName ?? 'A side';
      sentences.push(
        input.globalHome ? `${outBy} holds all of its home.` : `${outBy} holds ${input.controlShareLabel} of its home's cities.`
      );
    } else if (reason === 'no_city_hexes') sentences.push('It holds no city hexes.');
    else sentences.push('Its home has no cities left.');
  }
  sentences.push('Its land is now neutral and its cities stop building.');
  if (input.remainingUnits > 0) {
    sentences.push(`Its last ${input.remainingUnits} units hold their hexes as neutral garrisons and fire on any unit in range.`);
  }
  return sentences.join(' ');
}
