import {
  createMapKeyboardPanController,
  type PanAxisKey,
} from '../../shared/mapKeyboardPanLogic';
import { panMapByNetAxes } from './mapUtils';

/**
 * Singleton hold-to-continue controller bound to the main Leaflet map.
 *
 * Purpose: Keeps interval/held state out of `initCore` while sharing one pan loop for the window.
 * When to use: Only through the exported key/clear helpers below.
 * Expected outcome: Real timers + `panMapByNetAxes` side effects.
 * Exceptions: None.
 */
const mapKeyboardPanController = createMapKeyboardPanController({
  pan: (ns, ew) => {
    panMapByNetAxes(ns, ew);
  },
  setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
  clearInterval: (handle) => globalThis.clearInterval(handle),
});

/**
 * Forwards a newly pressed physical pan key into the hold controller.
 *
 * Purpose: Starts or updates continuous map pan after renderer gates accept the key.
 * When to use: From `initCore` keydown once `panBindingToDirection` returns a direction.
 * Expected outcome: Immediate pan when net axes change to nonzero; hold interval (re)started then.
 * Exceptions: None.
 */
export function mapPanKeyDown(physicalKeyId: string, direction: PanAxisKey): void {
  mapKeyboardPanController.onPanKeyDown(physicalKeyId, direction);
}

/**
 * Forwards a released physical pan key into the hold controller.
 *
 * Purpose: Ends one physical key; another key sharing its direction can keep panning.
 * When to use: From `initCore` keyup for any pan physical id (even if focus moved into an input).
 * Expected outcome: Physical key removed; timer/pan updated only when net axes change.
 * Exceptions: None.
 */
export function mapPanKeyUp(physicalKeyId: string): void {
  mapKeyboardPanController.onPanKeyUp(physicalKeyId);
}

/**
 * Clears all held physical pan keys and stops the hold timer.
 *
 * Purpose: Hard stop for blur, visibility hidden, focusin editable, and modifier keydown.
 * When to use: Whenever pan must not continue without a fresh pan keydown.
 * Expected outcome: No further pans until `mapPanKeyDown` again.
 * Exceptions: None.
 */
export function clearMapKeyboardPan(): void {
  mapKeyboardPanController.clear();
}
