/**
 * Vocabulary, limits, and pure rules for side agreements.
 *
 * Purpose: The store, the talk reply parser, the prompts, and the recorder share one definition of what an agreement is and when it still counts.
 * When to use: Validating a kind, status, intent, or decision, fixing an end turn, and working out an agreement's standing.
 * Expected outcome: Pure values and functions. This module does not read the database or log.
 * Exceptions: None.
 */

/**
 * The five kinds of agreement a commander may record.
 *
 * Purpose: The talk reply, the reply schema, and the table check share one list.
 * When to use: Validating a kind and listing the legal values.
 * Expected outcome: `non_aggression`, `ceasefire_in_place`, `no_entry_zone`, `joint_action`, `information_sharing`.
 * Exceptions: None.
 */
export const SIDE_AGREEMENT_KINDS = ['non_aggression', 'ceasefire_in_place', 'no_entry_zone', 'joint_action', 'information_sharing'] as const;

/**
 * One of the five agreement kinds.
 *
 * Contract: A member of `SIDE_AGREEMENT_KINDS`.
 * When to use: A stored kind and a parsed talk reply.
 * Expected outcome: One of the five words.
 * Exceptions: None.
 */
export type SideAgreementKind = (typeof SIDE_AGREEMENT_KINDS)[number];

/**
 * The stored statuses of an agreement.
 *
 * Purpose: The commander sets the status itself, so the reply, the schema, and the table check share one list.
 * When to use: Validating a status and listing the legal values.
 * Expected outcome: `proposed`, `active`, `ended`, `broken_by_them`, `broken_by_me`.
 * Exceptions: None.
 */
export const SIDE_AGREEMENT_STATUSES = ['proposed', 'active', 'ended', 'broken_by_them', 'broken_by_me'] as const;

/**
 * One of the stored agreement statuses.
 *
 * Contract: A member of `SIDE_AGREEMENT_STATUSES`.
 * When to use: A stored status and a parsed talk reply.
 * Expected outcome: One of the five words.
 * Exceptions: None.
 */
export type SideAgreementStatus = (typeof SIDE_AGREEMENT_STATUSES)[number];

/**
 * The statuses a new agreement may start with.
 *
 * Purpose: A new record is either offered or already agreed. Closing statuses only make sense for an existing record.
 * When to use: Checking a new entry from a talk reply.
 * Expected outcome: `proposed` and `active`.
 * Exceptions: None.
 */
export const SIDE_AGREEMENT_NEW_STATUSES = ['proposed', 'active'] as const;

/**
 * The private plans a commander may hold for an agreement.
 *
 * Purpose: The reply, the schema, and the table check share one list.
 * When to use: Validating an intent and listing the legal values.
 * Expected outcome: `keep`, `opportunistic`, `plan_to_break`.
 * Exceptions: None.
 */
export const SIDE_AGREEMENT_INTENTS = ['keep', 'opportunistic', 'plan_to_break'] as const;

/**
 * One of the three agreement intents.
 *
 * Contract: A member of `SIDE_AGREEMENT_INTENTS`.
 * When to use: A stored intent and a parsed talk reply.
 * Expected outcome: One of the three words.
 * Exceptions: None.
 */
export type SideAgreementIntent = (typeof SIDE_AGREEMENT_INTENTS)[number];

/**
 * The readable name of each agreement kind.
 *
 * Purpose: Screens that show a kind to the player print these words instead of the stored value.
 * When to use: Drawing an agreement kind in a tooltip, a list, or a dropdown.
 * Expected outcome: One non-empty label for each member of `SIDE_AGREEMENT_KINDS`.
 * Exceptions: None.
 */
export const SIDE_AGREEMENT_KIND_LABELS: Readonly<Record<SideAgreementKind, string>> = {
  non_aggression: 'Non-aggression',
  ceasefire_in_place: 'Ceasefire in place',
  no_entry_zone: 'No-entry zone',
  joint_action: 'Joint action',
  information_sharing: 'Information sharing',
};

/**
 * The readable name of each agreement intent.
 *
 * Purpose: Screens that show a commander's private plan print these words instead of the stored value.
 * When to use: Drawing an agreement intent in a tooltip or a list.
 * Expected outcome: One non-empty label for each member of `SIDE_AGREEMENT_INTENTS`.
 * Exceptions: None.
 */
export const SIDE_AGREEMENT_INTENT_LABELS: Readonly<Record<SideAgreementIntent, string>> = {
  keep: 'keep',
  opportunistic: 'opportunistic',
  plan_to_break: 'plan to break',
};

/**
 * The two keep-or-break choices a commander may record for an active agreement.
 *
 * Purpose: The orders reply, its schema, and the table check share one list.
 * When to use: Validating a decision and listing the legal values.
 * Expected outcome: `keep` and `break`.
 * Exceptions: None.
 */
export const SIDE_AGREEMENT_DECISIONS = ['keep', 'break'] as const;

/**
 * One of the two keep-or-break decisions.
 *
 * Contract: A member of `SIDE_AGREEMENT_DECISIONS`.
 * When to use: A stored decision and a parsed orders reply.
 * Expected outcome: `keep` or `break`.
 * Exceptions: None.
 */
export type SideAgreementDecision = (typeof SIDE_AGREEMENT_DECISIONS)[number];

/**
 * What an agreement is right now.
 *
 * Contract: A stored status, or `expired` (past its end turn) or `lapsed` (the other side left the match). Worked out on read and never stored.
 * When to use: Deciding whether an agreement is open, and printing it in a prompt.
 * Expected outcome: One of seven words.
 * Exceptions: None.
 */
export type SideAgreementStanding = SideAgreementStatus | 'expired' | 'lapsed';

/**
 * The most turns one agreement may cover, counted from the turn it is recorded.
 *
 * Purpose: Keeps every agreement short enough to be revisited.
 * When to use: Fixing an end turn and writing prompt text.
 * Expected outcome: 10.
 * Exceptions: None.
 */
export const SIDE_AGREEMENT_MAX_TURNS = 10;

/**
 * The most proposed or active agreements a commander may hold with one side.
 *
 * Purpose: Stops one pair from piling up overlapping records.
 * When to use: Checking a new entry and writing prompt text.
 * Expected outcome: 3.
 * Exceptions: None.
 */
export const SIDE_AGREEMENT_MAX_OPEN_PER_SIDE = 3;

/**
 * The longest agreement terms stored, in characters.
 *
 * Purpose: Terms stay one short sentence.
 * When to use: Cleaning agreement terms.
 * Expected outcome: 160.
 * Exceptions: None.
 */
export const SIDE_AGREEMENT_TERMS_MAX_CHARS = 160;

/**
 * The most hexes a no-entry zone may name.
 *
 * Purpose: Keeps a zone small enough to print on one line.
 * When to use: Translating zone codes.
 * Expected outcome: 6.
 * Exceptions: None.
 */
export const SIDE_AGREEMENT_ZONE_MAX_HEXES = 6;

/**
 * The most keep-or-break decisions read from one orders reply.
 *
 * Purpose: Bounds the work a single reply can cause.
 * When to use: Parsing the orders reply.
 * Expected outcome: 12.
 * Exceptions: None.
 */
export const SIDE_AGREEMENT_MAX_DECISIONS = 12;

/**
 * How many turns a closed agreement stays in the ledger.
 *
 * Purpose: A commander sees how an agreement ended for a short while, then the ledger forgets it.
 * When to use: Choosing which agreements to show.
 * Expected outcome: 2.
 * Exceptions: None.
 */
export const SIDE_AGREEMENT_RECENTLY_CLOSED_TURNS = 2;

/**
 * The reply's `against` value when an agreement has no third side.
 *
 * Purpose: A closed reply schema needs a string in every entry, so "no third side" is a word.
 * When to use: Building the reply schema and the prompt reply shape.
 * Expected outcome: `none`.
 * Exceptions: None.
 */
export const SIDE_AGREEMENT_NO_THIRD_SIDE = 'none';

/**
 * Tells whether a value is an agreement kind.
 *
 * Purpose: Narrow a parsed reply value to a legal kind.
 * When to use: Parsing a talk reply entry.
 * Expected outcome: True for a member of `SIDE_AGREEMENT_KINDS`.
 * Exceptions: None.
 */
export function isSideAgreementKind(value: unknown): value is SideAgreementKind {
  return typeof value === 'string' && (SIDE_AGREEMENT_KINDS as readonly string[]).includes(value);
}

/**
 * Tells whether a value is a stored agreement status.
 *
 * Purpose: Narrow a parsed reply value to a legal status.
 * When to use: Parsing a talk reply entry.
 * Expected outcome: True for a member of `SIDE_AGREEMENT_STATUSES`.
 * Exceptions: None.
 */
export function isSideAgreementStatus(value: unknown): value is SideAgreementStatus {
  return typeof value === 'string' && (SIDE_AGREEMENT_STATUSES as readonly string[]).includes(value);
}

/**
 * Tells whether a value is an agreement intent.
 *
 * Purpose: Narrow a parsed reply value to a legal intent.
 * When to use: Parsing a talk reply entry.
 * Expected outcome: True for a member of `SIDE_AGREEMENT_INTENTS`.
 * Exceptions: None.
 */
export function isSideAgreementIntent(value: unknown): value is SideAgreementIntent {
  return typeof value === 'string' && (SIDE_AGREEMENT_INTENTS as readonly string[]).includes(value);
}

/**
 * Tells whether a value is a keep-or-break decision.
 *
 * Purpose: Narrow a parsed reply value to a legal decision.
 * When to use: Parsing an orders reply entry.
 * Expected outcome: True for `keep` and `break`.
 * Exceptions: None.
 */
export function isSideAgreementDecision(value: unknown): value is SideAgreementDecision {
  return typeof value === 'string' && (SIDE_AGREEMENT_DECISIONS as readonly string[]).includes(value);
}

/**
 * Parameters for `resolveSideAgreementEndTurn`.
 *
 * Contract: All three fields are required.
 * When to use: Fixing the end turn of a new or changed agreement.
 * Expected outcome: Read by `resolveSideAgreementEndTurn` only.
 * Exceptions: None.
 */
export interface ResolveSideAgreementEndTurnArgs {
  /**
   * The turn the agreement was first recorded.
   *
   * Contract: An integer turn number.
   * When to use: Capping the end turn at the longest allowed span.
   * Expected outcome: Anchors the span cap.
   * Exceptions: None.
   */
  readonly startTurn: number;
  /**
   * The strategic turn now being played.
   *
   * Contract: An integer turn number.
   * When to use: Rejecting an end turn that is already past.
   * Expected outcome: The earliest end turn that is accepted.
   * Exceptions: None.
   */
  readonly currentTurn: number;
  /**
   * The end turn the commander sent, unchecked.
   *
   * Contract: Any value; only integers are accepted.
   * When to use: Taken straight from the parsed reply.
   * Expected outcome: Returned unchanged unless it exceeds the span cap.
   * Exceptions: None.
   */
  readonly requestedEndTurn: unknown;
}

/**
 * Fixes the end turn of an agreement within the allowed span.
 *
 * Purpose: Every agreement ends within `SIDE_AGREEMENT_MAX_TURNS` of its start, and never in the past.
 * When to use: Storing a new agreement or a change to one.
 * Expected outcome: The requested end turn, cut to the span cap, or null when it is not an integer or the result is before the current turn.
 * Exceptions: None.
 */
export function resolveSideAgreementEndTurn(args: ResolveSideAgreementEndTurnArgs): number | null {
  const { startTurn, currentTurn, requestedEndTurn } = args;
  if (typeof requestedEndTurn !== 'number' || !Number.isInteger(requestedEndTurn)) return null;
  if (requestedEndTurn < currentTurn) return null;
  const capped = Math.min(requestedEndTurn, startTurn + SIDE_AGREEMENT_MAX_TURNS - 1);
  return capped < currentTurn ? null : capped;
}

/**
 * Parameters for `sideAgreementStanding`.
 *
 * Contract: All four fields are required.
 * When to use: Reading an agreement's standing.
 * Expected outcome: Read by `sideAgreementStanding` only.
 * Exceptions: None.
 */
export interface SideAgreementStandingArgs {
  /**
   * The stored status.
   *
   * Contract: A member of `SIDE_AGREEMENT_STATUSES`.
   * When to use: Taken from the stored row.
   * Expected outcome: Returned as the standing for closed statuses.
   * Exceptions: None.
   */
  readonly status: SideAgreementStatus;
  /**
   * The stored end turn.
   *
   * Contract: An integer turn number.
   * When to use: Taken from the stored row.
   * Expected outcome: An open agreement is expired when this is before the current turn.
   * Exceptions: None.
   */
  readonly endTurn: number;
  /**
   * The strategic turn now being played.
   *
   * Contract: An integer turn number.
   * When to use: Compared with the end turn.
   * Expected outcome: Decides expiry.
   * Exceptions: None.
   */
  readonly currentTurn: number;
  /**
   * Whether the other side is still in the match.
   *
   * Contract: False for a side that has left or is unknown.
   * When to use: Taken from the seat roster.
   * Expected outcome: An open agreement with an inactive side is lapsed.
   * Exceptions: None.
   */
  readonly counterpartActive: boolean;
}

/**
 * Works out what an agreement is right now.
 *
 * Purpose: Standing depends on the other side and the clock, so it is computed on read and never stored.
 * When to use: Deciding whether an agreement is open, may be changed, may be decided, or needs evidence.
 * Expected outcome: A closed status is returned as is. An open one is `lapsed` when the other side is out, else `expired` past its end turn, else its stored status.
 * Exceptions: None.
 */
export function sideAgreementStanding(args: SideAgreementStandingArgs): SideAgreementStanding {
  const { status, endTurn, currentTurn, counterpartActive } = args;
  if (status !== 'proposed' && status !== 'active') return status;
  if (!counterpartActive) return 'lapsed';
  if (endTurn < currentTurn) return 'expired';
  return status;
}

/**
 * Tells whether a standing counts as open.
 *
 * Purpose: Only open agreements count toward the per-side limit, can be changed, and get evidence.
 * When to use: Filtering agreements after `sideAgreementStanding`.
 * Expected outcome: True for `proposed` and `active`.
 * Exceptions: None.
 */
export function isOpenSideAgreementStanding(standing: SideAgreementStanding): boolean {
  return standing === 'proposed' || standing === 'active';
}
