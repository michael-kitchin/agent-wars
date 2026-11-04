/**
 * A strategic or tactical order to land embarked infantry from an air unit.
 *
 * Purpose: The air unit stays on its airport. The infantry leaves on the target.
 * When to use: Pending drops, commander orders, and resolution.
 * Expected outcome: One air unit and one target hex or cell.
 * Exceptions: None.
 */

export interface AirDropOrder {
  /**
   * The air unit or air sub-unit that is carrying infantry.
   *
   * Contract: Names the carrier. The infantry is the unit assigned to it.
   * When to use: Every drop order.
   * Expected outcome: An id that exists when the order is validated.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * Where the infantry lands.
   *
   * Contract: A strategic hex or a tactical cell. The air unit does not move there.
   * When to use: Every drop order.
   * Expected outcome: A hex the infantry can occupy, inside the range of that theater.
   * Exceptions: None.
   */
  readonly targetH3Index: string;
}

/**
 * Playback for one air drop.
 *
 * Purpose: The air unit flies to the target and, when it survives, flies back. The infantry stays on the target.
 * When to use: The Ready result and a battle beat.
 * Expected outcome: `returnsToBase` is false when return fire destroyed the air unit. `infantryUnitId` is set only when the infantry landed.
 * Exceptions: None.
 */
export interface AirDropAnimationMove {
  /**
   * The air unit that flew the drop.
   *
   * Contract: Playback finds this unit.
   * When to use: Every drop animation.
   * Expected outcome: The carrier id.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * The owner of the air unit.
   *
   * Contract: Playback and consultation attribute the flight.
   * When to use: Every drop animation.
   * Expected outcome: The seat id stored on the air unit.
   * Exceptions: None.
   */
  readonly player: string;
  /**
   * The airport the air unit occupied.
   *
   * Contract: The outbound leg starts here, and the infantry starts here.
   * When to use: Every drop animation.
   * Expected outcome: The air unit's hex when the drop resolved.
   * Exceptions: None.
   */
  readonly fromH3Index: string;
  /**
   * The hex the infantry was ordered onto.
   *
   * Contract: The outbound leg ends here.
   * When to use: Every drop animation.
   * Expected outcome: The order's target, including a drop that was shot down.
   * Exceptions: None.
   */
  readonly targetH3Index: string;
  /**
   * Whether the air unit flies home.
   *
   * Contract: Return fire that destroys the air unit leaves it at the target in the animation.
   * When to use: Playback of this row.
   * Expected outcome: True when the air unit survived. False when it was shot down.
   * Exceptions: None.
   */
  readonly returnsToBase: boolean;
  /**
   * The infantry that landed, when the drop survived.
   *
   * Contract: Playback draws that unit from the airport to the target and leaves it there.
   * When to use: A drop that was not shot down.
   * Expected outcome: Absent when the air unit was destroyed. The infantry never reaches the target in that case.
   * Exceptions: None.
   */
  readonly infantryUnitId?: string;
}
