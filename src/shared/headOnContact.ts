/**
 * Head-on contact: opposing units that would trade cells meet in one of them.
 *
 * Purpose: Movement resolution writes every destination without comparing sides, so two units ordered onto each other's cells pass and never melee. This module finds those trades before any position is written.
 * When to use: Once per strategic turn and once per tactical beat, with one mover per unit that will actually change cells.
 * Expected outcome: The contacts, and the unit ids whose orders must be dropped so they stay on the held cell.
 */

/**
 * One unit's effective move for this turn or beat.
 *
 * Purpose: The contact rule needs a start cell, an end cell, and an owner, and nothing else about the unit.
 * When to use: Built by the strategic and tactical adapters from the moves they are about to apply.
 * Expected outcome: Callers pass at most one entry per `unitId`, and only when `fromCell` differs from `toCell`.
 */
export interface HeadOnMover {
  /**
   * The unit this move belongs to.
   *
   * Contract: Unique within the mover list. A later duplicate is the caller's bug.
   * When to use: Matching a contact back to the order that should be dropped.
   * Expected outcome: The same id the movement order uses.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * The seat or Neutral owner of the unit.
   *
   * Contract: A seat id or the Neutral owner id. Two different strings are two different owners.
   * When to use: Deciding whether a trade is between enemies.
   * Expected outcome: Same-owner trades are not contacts.
   * Exceptions: None.
   */
  readonly owner: string;
  /**
   * The cell the unit occupies when movement starts.
   *
   * Contract: Differs from `toCell`. A same-cell row is ignored.
   * When to use: One end of the traded pair.
   * Expected outcome: The unit stays here when this cell is the held cell.
   * Exceptions: None.
   */
  readonly fromCell: string;
  /**
   * The cell the unit's order would reach this turn or beat.
   *
   * Contract: The strategic destination, or the tactical first-leg stop. Not a cell partway along a longer path.
   * When to use: The other end of the traded pair.
   * Expected outcome: The unit still moves here when the other cell is the held cell.
   * Exceptions: None.
   */
  readonly toCell: string;
}

/**
 * Picks which of two cells the contact is fought in.
 *
 * Purpose: Keeps the dice out of this module. The caller supplies a seeded 50/50 choice.
 * When to use: Once per contact, with the two cells in either order.
 * Expected outcome: Returns one of the two arguments. The same pair always returns the same cell, and argument order does not matter.
 * Exceptions: A return value that is neither cell is a programming error. `resolveHeadOnContacts` throws.
 */
export type HeadOnHeldCellPicker = (cellA: string, cellB: string) => string;

/**
 * One pair of cells whose movers meet instead of passing.
 *
 * Purpose: Tells the adapter who stays and who completes the move into the held cell.
 * When to use: Read from `HeadOnResolution.contacts`.
 * Expected outcome: Both id lists are sorted ascending, and `heldCell` is `lowCell` or `highCell`.
 */
export interface HeadOnContact {
  /**
   * The lesser of the two cells, compared with `<`.
   *
   * Contract: `lowCell < highCell`.
   * When to use: Stable ordering and logs.
   * Expected outcome: Independent of which unit was listed first.
   * Exceptions: None.
   */
  readonly lowCell: string;
  /**
   * The greater of the two cells, compared with `<`.
   *
   * Contract: `lowCell < highCell`.
   * When to use: Stable ordering and logs.
   * Expected outcome: Independent of which unit was listed first.
   * Exceptions: None.
   */
  readonly highCell: string;
  /**
   * The cell both sides end on.
   *
   * Contract: Equal to `lowCell` or `highCell`. Chosen by the picker.
   * When to use: The cell the existing same-cell melee will see.
   * Expected outcome: Holding units already occupy it. Entering units move into it.
   * Exceptions: None.
   */
  readonly heldCell: string;
  /**
   * Units whose move is cancelled, sorted ascending by id.
   *
   * Contract: Every mover in the pair whose `fromCell` is `heldCell`.
   * When to use: Drop these units' movement orders.
   * Expected outcome: They remain on `heldCell`.
   * Exceptions: None.
   */
  readonly holdingUnitIds: readonly string[];
  /**
   * Units whose orders are kept, sorted ascending by id.
   *
   * Contract: Every other mover in the pair. Their end cell is `heldCell`.
   * When to use: Leave these orders for the normal movement apply.
   * Expected outcome: They arrive on `heldCell`.
   * Exceptions: None.
   */
  readonly enteringUnitIds: readonly string[];
}

/**
 * Every contact found in one movement pass.
 *
 * Purpose: One value for the adapter, so the contact list and the ids to drop cannot get out of step.
 * When to use: The return of `resolveHeadOnContacts`.
 * Expected outcome: `cancelledUnitIds` is exactly the holding ids across `contacts`.
 */
export interface HeadOnResolution {
  /**
   * Contacts sorted by `lowCell`, then `highCell`.
   *
   * Contract: Empty when no opposing pair would trade cells.
   * When to use: Logging. Movement uses `cancelledUnitIds`.
   * Expected outcome: A ring of three or more cells, and a same-owner trade, contribute nothing.
   * Exceptions: None.
   */
  readonly contacts: readonly HeadOnContact[];
  /**
   * Unit ids whose movement orders are dropped.
   *
   * Contract: The union of every contact's `holdingUnitIds`.
   * When to use: Filter the order list before applying it.
   * Expected outcome: Every other order is applied unchanged.
   * Exceptions: None.
   */
  readonly cancelledUnitIds: ReadonlySet<string>;
}

/**
 * Orders two cells so a pair has one identity.
 *
 * Purpose: A trade from A to B is the same pair as a trade from B to A, and the order must not depend on the machine's locale.
 * When to use: Grouping movers and calling the held-cell picker.
 * Expected outcome: The lesser cell, compared with `<`, then the greater cell.
 * Exceptions: None.
 */
export function headOnCellPair(cellA: string, cellB: string): readonly [string, string] {
  return cellA < cellB ? [cellA, cellB] : [cellB, cellA];
}

/**
 * Sorts ids and cells with `<`, so the order does not depend on locale.
 *
 * Purpose: Contact lists and id lists must be stable for logs and tests.
 * When to use: Sorting holding ids, entering ids, and the contact list.
 * Expected outcome: Negative when `left` is lesser, positive when it is greater, and 0 when they are equal.
 * Exceptions: None.
 */
function compareAscending(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Groups movers that travel between the same two cells.
 *
 * Purpose: A contact is a property of a cell pair, not of one unit.
 * When to use: The first step of `resolveHeadOnContacts`.
 * Expected outcome: A map keyed by `low|high`. Movers that do not change cells are left out.
 * Exceptions: None.
 */
function moversByCellPair(movers: readonly HeadOnMover[]): Map<string, HeadOnMover[]> {
  const groups = new Map<string, HeadOnMover[]>();
  for (const mover of movers) {
    if (mover.fromCell === mover.toCell) continue;
    const [lowCell, highCell] = headOnCellPair(mover.fromCell, mover.toCell);
    const key = `${lowCell}|${highCell}`;
    const group = groups.get(key);
    if (group) group.push(mover);
    else groups.set(key, [mover]);
  }
  return groups;
}

/**
 * Builds the contact for one cell pair, or returns null when the pair is not a meeting.
 *
 * Purpose: Both directions must be present, and two of those movers must have different owners.
 * When to use: Once per group from `moversByCellPair`.
 * Expected outcome: Null when everyone travels the same way, or every mover has the same owner. Otherwise one contact. The picker is called only for a real contact.
 * Exceptions: Throws when the picker returns a cell outside the pair.
 */
function contactForPair(group: readonly HeadOnMover[], pickHeldCell: HeadOnHeldCellPicker): HeadOnContact | null {
  const [lowCell, highCell] = headOnCellPair(group[0]!.fromCell, group[0]!.toCell);
  const forward = group.filter((mover) => mover.fromCell === lowCell);
  const backward = group.filter((mover) => mover.fromCell === highCell);
  const opposed = forward.some((leaving) => backward.some((arriving) => arriving.owner !== leaving.owner));
  if (!opposed) return null;
  const heldCell = pickHeldCell(lowCell, highCell);
  if (heldCell !== lowCell && heldCell !== highCell) {
    throw new Error(`resolveHeadOnContacts: picker returned ${heldCell}, expected ${lowCell} or ${highCell}`);
  }
  const holdingUnitIds = group.filter((mover) => mover.fromCell === heldCell).map((mover) => mover.unitId).sort(compareAscending);
  const enteringUnitIds = group.filter((mover) => mover.fromCell !== heldCell).map((mover) => mover.unitId).sort(compareAscending);
  return { lowCell, highCell, heldCell, holdingUnitIds, enteringUnitIds };
}

/**
 * Finds opposing units that would trade cells and says which of them stay.
 *
 * Purpose: Opposing units that would trade cells must meet instead of passing.
 * When to use: Once per turn or beat, before any movement is applied, with every side's movers.
 * Expected outcome: The contact list and the ids whose moves to drop. A ring of three or more cells, and a trade between units of one owner, are not contacts.
 * Exceptions: Throws only when the picker breaks its contract.
 */
export function resolveHeadOnContacts(
  movers: readonly HeadOnMover[],
  pickHeldCell: HeadOnHeldCellPicker,
): HeadOnResolution {
  const contacts = [...moversByCellPair(movers).values()]
    .flatMap((group) => {
      const contact = contactForPair(group, pickHeldCell);
      return contact ? [contact] : [];
    })
    .sort((left, right) => compareAscending(left.lowCell, right.lowCell) || compareAscending(left.highCell, right.highCell));
  const cancelledUnitIds = new Set(contacts.flatMap((contact) => contact.holdingUnitIds));
  return { contacts, cancelledUnitIds };
}
