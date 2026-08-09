/**
 * Cardinal direction used for keyboard map pan (matches renderer `PanDirection`).
 *
 * Purpose: Shared vocabulary for key mapping, net-axis resolution, and the hold controller.
 * When to use: Anytime a pan key or held set is represented without DOM types.
 * Expected outcome: One of north/south/west/east.
 * Exceptions: None.
 */
export type PanAxisKey = 'north' | 'south' | 'west' | 'east';

/**
 * Baseline interval (ms) for one hex step when deriving hold speed.
 *
 * Purpose: Documents the pre-1.5× reference rate used to compute the hold interval.
 * When to use: Prefer `MAP_PAN_HOLD_INTERVAL_MS` for the live timer; use this when explaining or testing the 1.5× relationship.
 * Expected outcome: Constant `200`.
 * Exceptions: None.
 */
export const MAP_PAN_BASELINE_INTERVAL_MS = 200;

/**
 * Hold-to-continue pan interval (ms): baseline sped up 1.5×.
 *
 * Purpose: Drives the repeating pan timer while at least one pan key is held with a nonzero net.
 * When to use: Pass to `setInterval` when starting or restarting the hold loop after an immediate pan.
 * Expected outcome: `Math.round(200 / 1.5)` → `133`.
 * Exceptions: None.
 */
export const MAP_PAN_HOLD_INTERVAL_MS = Math.round(MAP_PAN_BASELINE_INTERVAL_MS / 1.5);

/**
 * Net pan axes after opposite-key cancellation.
 *
 * Purpose: Compact signed axes for neighbor scoring and `pan(ns, ew)` calls.
 * When to use: Output of `resolveNetPanAxes`; input to scoring and map pan.
 * Expected outcome: Each component is -1, 0, or 1.
 * Exceptions: None.
 */
export type NetPanAxes = {
  /**
   * North/south component: +1 north, -1 south, 0 none or cancelled.
   *
   * Purpose: Combined with `ew` to pick one hex neighbor per tick.
   * When to use: After resolving the held key set.
   * Expected outcome: -1 | 0 | 1.
   * Exceptions: None.
   */
  ns: -1 | 0 | 1;
  /**
   * East/west component: +1 east, -1 west, 0 none or cancelled.
   *
   * Purpose: Combined with `ns` to pick one hex neighbor per tick.
   * When to use: After resolving the held key set.
   * Expected outcome: -1 | 0 | 1.
   * Exceptions: None.
   */
  ew: -1 | 0 | 1;
};

/**
 * Maps a keyboard `event.key` string to a pan direction, or null if not a pan key.
 *
 * Purpose: Fallback binding when `event.code` is missing; also used by tests and legacy callers.
 * When to use: Prefer `panBindingToDirection(code, key)` at DOM boundaries.
 * Expected outcome: `PanAxisKey` for w/a/s/d and arrow*; otherwise null.
 * Exceptions: None.
 */
export function panKeyToDirection(key: string): PanAxisKey | null {
  switch (key.toLowerCase()) {
    case 'w':
    case 'arrowup':
      return 'north';
    case 's':
    case 'arrowdown':
      return 'south';
    case 'a':
    case 'arrowleft':
      return 'west';
    case 'd':
    case 'arrowright':
      return 'east';
    default:
      return null;
  }
}

/**
 * Maps a keyboard `event.code` string to a pan direction, or null if not a pan binding.
 *
 * Purpose: Layout-stable physical key identity for WASD (KeyW…) and arrows so overlapping
 * keys that share a direction can be tracked independently.
 * When to use: First choice inside `panBindingToDirection`.
 * Expected outcome: Direction for KeyW/A/S/D and Arrow*; otherwise null.
 * Exceptions: None.
 */
export function panCodeToDirection(code: string): PanAxisKey | null {
  switch (code) {
    case 'KeyW':
    case 'ArrowUp':
      return 'north';
    case 'KeyS':
    case 'ArrowDown':
      return 'south';
    case 'KeyA':
    case 'ArrowLeft':
      return 'west';
    case 'KeyD':
    case 'ArrowRight':
      return 'east';
    default:
      return null;
  }
}

/**
 * Resolves a pan direction from a KeyboardEvent's code and key.
 *
 * Purpose: Single DOM-facing binding helper; prefers `code`, falls back to `key`.
 * When to use: Renderer keydown before calling the controller; keyup only needs the physical id.
 * Expected outcome: Direction when either code or key maps; otherwise null.
 * Exceptions: None.
 */
export function panBindingToDirection(code: string, key: string): PanAxisKey | null {
  return panCodeToDirection(code) ?? panKeyToDirection(key);
}

/**
 * Stable id for a physical key press (prefers `event.code`).
 *
 * Purpose: Lets the controller distinguish KeyW from ArrowUp even when both mean north.
 * When to use: Pass into `onPanKeyDown` / `onPanKeyUp` alongside the direction on down.
 * Expected outcome: Non-empty string; `code` when present, otherwise `key`.
 * Exceptions: None.
 */
export function panPhysicalKeyId(code: string, key: string): string {
  return code || key;
}

/**
 * Resolves held cardinal directions into signed net axes (opposites cancel).
 *
 * Purpose: Supports diagonals and opposite-key cancel without the renderer encoding the rules.
 * When to use: Before each immediate pan and each hold-interval tick.
 * Expected outcome: `{ ns, ew }` each in {-1,0,1}; both 0 when nothing useful is held.
 * Exceptions: None.
 */
export function resolveNetPanAxes(held: ReadonlySet<PanAxisKey>): NetPanAxes {
  const north = held.has('north');
  const south = held.has('south');
  const east = held.has('east');
  const west = held.has('west');
  const ns: -1 | 0 | 1 = north === south ? 0 : north ? 1 : -1;
  const ew: -1 | 0 | 1 = east === west ? 0 : east ? 1 : -1;
  return { ns, ew };
}

/**
 * Returns true when two net-axis vectors are identical.
 *
 * Purpose: Avoids stuttering immediate pans when a second physical key joins an already-held direction.
 * When to use: After updating the physical-key map, before deciding to pan/restart the interval.
 * Expected outcome: true iff both ns and ew match.
 * Exceptions: None.
 */
export function netPanAxesEqual(a: NetPanAxes, b: NetPanAxes): boolean {
  return a.ns === b.ns && a.ew === b.ew;
}

/**
 * Scores a neighbor's lat/lng delta against desired net axes (higher is better).
 *
 * Purpose: Unified replacement for the old max/min single-axis neighbor pick, and enables diagonals.
 * When to use: When choosing among `gridDisk` neighbors; single-axis cases use (1,0), (-1,0), (0,1), or (0,-1).
 * Expected outcome: `ns * deltaLat + ew * deltaLng`.
 * Exceptions: None.
 */
export function scoreNeighborForPanAxes(
  deltaLat: number,
  deltaLng: number,
  ns: -1 | 0 | 1,
  ew: -1 | 0 | 1
): number {
  return ns * deltaLat + ew * deltaLng;
}

/**
 * Returns true when both axes are zero (no pan this tick).
 *
 * Purpose: Shared guard for controller ticks and map pan entry points.
 * When to use: After `resolveNetPanAxes`.
 * Expected outcome: true iff `ns === 0 && ew === 0`.
 * Exceptions: None.
 */
export function isNetPanAxesZero(axes: NetPanAxes): boolean {
  return axes.ns === 0 && axes.ew === 0;
}

/**
 * Maps a single cardinal direction to net axes for wrapper APIs.
 *
 * Purpose: Lets `getNeighborForPan` / `panMapOneRes1Hex` stay as thin wrappers over the axes API.
 * When to use: When a caller still has a single `PanAxisKey` / `PanDirection`.
 * Expected outcome: Unit vector on one axis.
 * Exceptions: None.
 */
export function panAxisKeyToNetAxes(direction: PanAxisKey): NetPanAxes {
  switch (direction) {
    case 'north':
      return { ns: 1, ew: 0 };
    case 'south':
      return { ns: -1, ew: 0 };
    case 'east':
      return { ns: 0, ew: 1 };
    case 'west':
      return { ns: 0, ew: -1 };
  }
}

/**
 * Dependencies for the hold-to-continue pan controller.
 *
 * Purpose: Injects pan side effects and timers so Node tests can use fakes.
 * When to use: Constructed once in the renderer and once per test suite.
 * Expected outcome: Stable callbacks; timers match browser `setInterval` / `clearInterval` shapes.
 * Exceptions: None.
 */
export type MapKeyboardPanControllerDeps = {
  /**
   * Pans the map one hex toward the given net axes.
   *
   * Purpose: Isolates Leaflet/`setView` from hold-state logic.
   * When to use: Invoked on immediate pans and interval ticks when net is nonzero.
   * Expected outcome: Implementation no-ops when axes are zero or the map is unavailable.
   * Exceptions: Should not throw; swallow map errors inside the implementation.
   */
  pan: (ns: -1 | 0 | 1, ew: -1 | 0 | 1) => void;
  /**
   * Schedules repeating hold ticks.
   *
   * Purpose: Testable substitute for `window.setInterval`.
   * When to use: After an immediate pan when net is nonzero.
   * Expected outcome: Returns a handle suitable for `clearInterval`.
   * Exceptions: None.
   */
  setInterval: (callback: () => void, ms: number) => ReturnType<typeof setInterval>;
  /**
   * Cancels a previously scheduled hold interval.
   *
   * Purpose: Prevents double-fire when restarting after chord changes.
   * When to use: Before starting a new interval, and on clear / net-zero / empty held.
   * Expected outcome: Interval no longer fires.
   * Exceptions: None.
   */
  clearInterval: (handle: ReturnType<typeof setInterval>) => void;
};

/**
 * Public surface of the hold-to-continue pan controller.
 *
 * Purpose: Thin API for renderer key handlers.
 * When to use: Wire keydown/keyup/clear from init; do not call `pan` directly from key handlers.
 * Expected outcome: Physical-key map and timer stay consistent with the keyboard pan contract.
 * Exceptions: None.
 */
export type MapKeyboardPanController = {
  /**
   * Records a newly pressed physical pan key and pans when the net axes change to nonzero.
   *
   * Purpose: Starts or updates hold-to-continue motion without dropping overlapping same-direction keys.
   * When to use: After renderer gates accept a pan keydown; pass `panPhysicalKeyId` + direction.
   * Expected outcome: No-op if that physical key is already tracked; immediate pan + interval restart only when net axes change to nonzero.
   * Exceptions: None.
   */
  onPanKeyDown: (physicalKeyId: string, direction: PanAxisKey) => void;
  /**
   * Releases a physical pan key; may immediate-pan when the remaining net changes.
   *
   * Purpose: Ends one physical key without clearing another key that shares its direction.
   * When to use: On keyup for any pan physical id (even if focus moved into an input).
   * Expected outcome: Removes that physical key; pans/restarts only when net axes change.
   * Exceptions: None.
   */
  onPanKeyUp: (physicalKeyId: string) => void;
  /**
   * Clears all held physical pan keys and stops the hold timer.
   *
   * Purpose: Hard stop for blur, visibility hidden, focusin editable, and modifier keydown.
   * When to use: Whenever pan must not continue without a fresh keydown.
   * Expected outcome: Held empty; no further `pan` calls until a new keydown.
   * Exceptions: None.
   */
  clear: () => void;
};

/**
 * Builds the set of cardinal directions implied by currently held physical keys.
 *
 * Purpose: Bridges physical-key tracking to `resolveNetPanAxes`.
 * When to use: Inside the controller after each physical map mutation.
 * Expected outcome: Set of unique directions still represented by at least one physical key.
 * Exceptions: None.
 */
function directionsFromPhysicalKeys(heldPhysical: ReadonlyMap<string, PanAxisKey>): Set<PanAxisKey> {
  return new Set(heldPhysical.values());
}

/**
 * Creates a hold-to-continue keyboard pan controller with injectable pan and timers.
 *
 * Purpose: Encodes immediate pan, chord-immediate updates, opposite cancel, physical-key overlap, and 1.5× hold rate without DOM.
 * When to use: Once in the renderer wire module; anew in unit tests with fake timers.
 * Expected outcome: Controller methods mutate only internal held/timer state and call `deps.pan` per contract.
 * Exceptions: None.
 */
export function createMapKeyboardPanController(
  deps: MapKeyboardPanControllerDeps
): MapKeyboardPanController {
  const heldPhysical = new Map<string, PanAxisKey>();
  let intervalHandle: ReturnType<typeof setInterval> | null = null;

  const stopInterval = (): void => {
    if (intervalHandle !== null) {
      deps.clearInterval(intervalHandle);
      intervalHandle = null;
    }
  };

  const startInterval = (): void => {
    stopInterval();
    intervalHandle = deps.setInterval(() => {
      if (heldPhysical.size === 0) {
        stopInterval();
        return;
      }
      const axes = resolveNetPanAxes(directionsFromPhysicalKeys(heldPhysical));
      if (isNetPanAxesZero(axes)) {
        stopInterval();
        return;
      }
      deps.pan(axes.ns, axes.ew);
    }, MAP_PAN_HOLD_INTERVAL_MS);
  };

  const panImmediateAndSchedule = (axes: NetPanAxes): void => {
    deps.pan(axes.ns, axes.ew);
    startInterval();
  };

  /**
   * Applies pan/timer updates after the physical-key map changes.
   *
   * Purpose: Immediate pan only when net axes change, so KeyW+ArrowUp does not stutter.
   * When to use: After add/remove of a physical key.
   * Expected outcome: Stop when empty/net-zero; pan+restart when net becomes or changes to nonzero; no-op when net unchanged.
   * Exceptions: None.
   */
  const syncAfterPhysicalChange = (previousAxes: NetPanAxes): void => {
    if (heldPhysical.size === 0) {
      stopInterval();
      return;
    }
    const nextAxes = resolveNetPanAxes(directionsFromPhysicalKeys(heldPhysical));
    if (netPanAxesEqual(previousAxes, nextAxes)) {
      if (!isNetPanAxesZero(nextAxes) && intervalHandle === null) {
        startInterval();
      }
      return;
    }
    if (isNetPanAxesZero(nextAxes)) {
      stopInterval();
      return;
    }
    panImmediateAndSchedule(nextAxes);
  };

  return {
    onPanKeyDown(physicalKeyId: string, direction: PanAxisKey): void {
      if (heldPhysical.has(physicalKeyId)) return;
      const previousAxes = resolveNetPanAxes(directionsFromPhysicalKeys(heldPhysical));
      heldPhysical.set(physicalKeyId, direction);
      syncAfterPhysicalChange(previousAxes);
    },
    onPanKeyUp(physicalKeyId: string): void {
      if (!heldPhysical.has(physicalKeyId)) return;
      const previousAxes = resolveNetPanAxes(directionsFromPhysicalKeys(heldPhysical));
      heldPhysical.delete(physicalKeyId);
      syncAfterPhysicalChange(previousAxes);
    },
    clear(): void {
      heldPhysical.clear();
      stopInterval();
    },
  };
}
