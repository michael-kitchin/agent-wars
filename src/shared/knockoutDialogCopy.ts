/**
 * Sentences for the dialog shown when the human seat is knocked out and the match goes on.
 *
 * Purpose: The dialog and the standings heading take the place ordinal from `formatPlaceOrdinal`.
 * When to use: After Ready, when a knockout names the human seat and the match is not over.
 * Expected outcome: A title, a lead sentence, and a place sentence.
 * Exceptions: None. This module does not import the main-process logger.
 */

import { formatPlaceOrdinal } from './placeOrdinal';

/**
 * Copy for the knocked-out dialog.
 *
 * Purpose: The dialog does not assemble these sentences itself.
 * When to use: `openHumanKnockoutDialog`.
 * Expected outcome: A title, the knockout sentence, and the place sentence.
 * Exceptions: None.
 */
export interface HumanKnockoutDialogCopy {
  /**
   * The dialog title.
   *
   * Contract: "You're out".
   * When to use: The dialog heading.
   * Expected outcome: That exact title.
   * Exceptions: None.
   */
  readonly title: string;
  /**
   * Who knocked the player out, or the reason when nobody is credited.
   *
   * Contract: "{Name} knocked you out on turn N." when a side is credited. Otherwise the reason sentences.
   * When to use: The first body sentence.
   * Expected outcome: One or more sentences.
   * Exceptions: None.
   */
  readonly lead: string;
  /**
   * The player's place.
   *
   * Contract: "You placed {ordinal} of {n}."
   * When to use: The second body sentence.
   * Expected outcome: The place from the knockout and the size of the roster.
   * Exceptions: None.
   */
  readonly placeLine: string;
}

/**
 * Facts for the knocked-out dialog.
 *
 * Purpose: The dialog does not look up the roster.
 * When to use: `formatHumanKnockoutDialog`.
 * Expected outcome: Names and the control share are already words.
 * Exceptions: None.
 */
export interface HumanKnockoutDialogInput {
  /**
   * Full name of the seat credited with the knockout, or null.
   *
   * Contract: Null uses the reason sentences.
   * When to use: The lead sentence.
   * Expected outcome: A home name, or null.
   * Exceptions: None.
   */
  readonly outByName: string | null;
  /**
   * The turn the player was knocked out.
   *
   * Contract: A positive integer.
   * When to use: The lead sentence.
   * Expected outcome: The turn that just resolved.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The player's finishing place.
   *
   * Contract: A positive integer.
   * When to use: The place sentence.
   * Expected outcome: The place stored on the knockout.
   * Exceptions: None.
   */
  readonly place: number;
  /**
   * How many seats are in the match.
   *
   * Contract: At least 1.
   * When to use: "of {n}".
   * Expected outcome: The roster length.
   * Exceptions: None.
   */
  readonly seatCount: number;
  /**
   * Every knockout reason that held.
   *
   * Contract: Reason ids. Used only when `outByName` is null.
   * When to use: The lead sentence.
   * Expected outcome: Known reasons are written in record order.
   * Exceptions: None.
   */
  readonly reasons: readonly string[];
  /**
   * True on the global map, where control means the whole home.
   *
   * Contract: False uses `controlShareLabel`.
   * When to use: A home-control reason with no credited seat.
   * Expected outcome: "all of your home" when true.
   * Exceptions: None.
   */
  readonly globalHome: boolean;
  /**
   * The control share as a percent, such as "75%".
   *
   * Contract: Used only for a regional home-control reason with no credited seat.
   * When to use: A regional map.
   * Expected outcome: "A side holds 75% of your home's cities."
   * Exceptions: None.
   */
  readonly controlShareLabel: string;
}

const REASON_ORDER = ['home_control', 'no_city_hexes', 'home_cities_destroyed'] as const;

/**
 * Writes the knocked-out dialog's sentences.
 *
 * Purpose: The lead names a side when one is credited, and otherwise says why.
 * When to use: When a knockout names the human seat and the match is not over.
 * Expected outcome: Title "You're out", one lead, and the place sentence.
 * Exceptions: None.
 */
export function formatHumanKnockoutDialog(input: HumanKnockoutDialogInput): HumanKnockoutDialogCopy {
  const outByName = input.outByName?.trim() ? input.outByName.trim() : null;
  return {
    title: "You're out",
    lead: outByName ? `${outByName} knocked you out on turn ${input.turnNumber}.` : reasonLead(input),
    placeLine: `You placed ${formatPlaceOrdinal(input.place)} of ${input.seatCount}.`,
  };
}

/**
 * Reason sentences when no seat is credited.
 *
 * Purpose: The dialog still says why the player is out.
 * When to use: `formatHumanKnockoutDialog` when `outByName` is null.
 * Expected outcome: Home control, then no city hexes, then a destroyed home. A missing reason says the player is out.
 * Exceptions: None.
 */
function reasonLead(input: HumanKnockoutDialogInput): string {
  const held = new Set(input.reasons);
  const sentences: string[] = [];
  for (const reason of REASON_ORDER) {
    if (!held.has(reason)) continue;
    if (reason === 'home_control') {
      sentences.push(
        input.globalHome
          ? 'A side holds all of your home.'
          : `A side holds ${input.controlShareLabel} of your home's cities.`
      );
    } else if (reason === 'no_city_hexes') sentences.push('You hold no city hexes.');
    else sentences.push('Your home has no cities left.');
  }
  return sentences.join(' ') || 'You are out of the match.';
}

