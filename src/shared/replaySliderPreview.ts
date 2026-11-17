/**
 * Decides when a dragged replay slider shows the step under its thumb.
 *
 * Purpose: Dragging the slider previews steps as the thumb moves, without loading every step it passes. The rules have no DOM, so they live here and are tested with a fake clock.
 * When to use: The replay panel builds one scheduler for its slider.
 * Expected outcome: At most one preview runs at a time, previews start at most once per interval, and the latest position always wins.
 * Exceptions: None. A preview that fails is ignored and later requests go on.
 */

/**
 * Shortest time between the starts of two slider previews.
 *
 * Purpose: The user allowed a slight delay while dragging, so a fast drag loads a step about four times a second instead of every step it passes.
 * When to use: The `intervalMs` the replay panel passes to `createSliderPreviewScheduler`.
 * Expected outcome: 250 milliseconds.
 * Exceptions: None.
 */
export const REPLAY_SLIDER_PREVIEW_INTERVAL_MS = 250;

/**
 * What the scheduler needs from its caller.
 *
 * Purpose: The clock, the timers, and the preview itself are passed in, so tests can drive them by hand.
 * When to use: The argument of `createSliderPreviewScheduler`.
 * Expected outcome: Five members.
 * Exceptions: None.
 */
export interface SliderPreviewSchedulerOptions {
  /**
   * Shortest time between the starts of two previews, in milliseconds.
   *
   * Contract: Zero or more.
   * When to use: Usually `REPLAY_SLIDER_PREVIEW_INTERVAL_MS`.
   * Expected outcome: A request inside the interval waits for its end.
   * Exceptions: None.
   */
  readonly intervalMs: number;
  /**
   * Shows the step at an index.
   *
   * Contract: Called with one index at a time. The scheduler waits for the returned promise before it starts another, and ignores a rejection.
   * When to use: Called by the scheduler only.
   * Expected outcome: Resolves when the step is on screen or was skipped.
   * Exceptions: May reject; the scheduler swallows it.
   */
  readonly show: (index: number) => Promise<void>;
  /**
   * Reads the clock in milliseconds.
   *
   * Contract: Never goes backwards.
   * When to use: Called by the scheduler only.
   * Expected outcome: The current time.
   * Exceptions: None.
   */
  readonly now: () => number;
  /**
   * Starts a one-shot timer.
   *
   * Contract: Calls `fn` once after about `ms` milliseconds unless cleared, like `window.setTimeout`.
   * When to use: Called by the scheduler only.
   * Expected outcome: A handle for `clearTimer`.
   * Exceptions: None.
   */
  readonly setTimer: (fn: () => void, ms: number) => unknown;
  /**
   * Stops a timer `setTimer` started.
   *
   * Contract: Like `window.clearTimeout`. A handle that already fired is ignored.
   * When to use: Called by the scheduler only.
   * Expected outcome: The timer's callback does not run.
   * Exceptions: None.
   */
  readonly clearTimer: (handle: unknown) => void;
}

/**
 * The controls of one slider's preview scheduler.
 *
 * Purpose: The slider asks for previews while it moves and settles them when it is let go.
 * When to use: The value `createSliderPreviewScheduler` returns.
 * Expected outcome: Three methods.
 * Exceptions: None.
 */
export interface SliderPreviewScheduler {
  /**
   * Asks for the step at `index` to be previewed.
   *
   * Contract: Shows it at once when no preview runs and the interval has passed. Otherwise it replaces any waiting request and is shown when the running preview ends and the interval has passed. A request for the index already shown or already waiting does nothing.
   * When to use: On each `input` event of the slider.
   * Expected outcome: The latest index is eventually shown, unless `settle` or `cancel` comes first.
   * Exceptions: None.
   */
  request(index: number): void;
  /**
   * Drops the waiting request and waits for the running preview.
   *
   * Contract: Never starts the waiting request. The next request after it shows at once.
   * When to use: When the slider is let go, before the released step is shown in full.
   * Expected outcome: Resolves once no preview runs.
   * Exceptions: None.
   */
  settle(): Promise<void>;
  /**
   * Drops the waiting request without waiting.
   *
   * Contract: Timer callbacks already queued do nothing afterwards. A running preview is left to finish and starts nothing after it. The next request shows at once.
   * When to use: When replay ends.
   * Expected outcome: No later preview starts from requests made before the call.
   * Exceptions: None.
   */
  cancel(): void;
}

/**
 * Builds a preview scheduler for one slider.
 *
 * Purpose: Keeps one preview running at a time, at most one start per interval, and only the latest waiting position.
 * When to use: Once per slider, with the options described on `SliderPreviewSchedulerOptions`.
 * Expected outcome: A scheduler with no preview running and nothing waiting.
 * Exceptions: None.
 */
export function createSliderPreviewScheduler(options: SliderPreviewSchedulerOptions): SliderPreviewScheduler {
  const { intervalMs, show, now, setTimer, clearTimer } = options;
  let pending: number | null = null;
  let lastShown: number | null = null;
  let lastStartAt: number | null = null;
  let running: Promise<void> | null = null;
  let timer: unknown = null;
  let generation = 0;

  const stopTimer = (): void => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const forget = (): void => {
    stopTimer();
    pending = null;
    lastShown = null;
    lastStartAt = null;
    generation += 1;
  };

  const start = (): void => {
    const index = pending;
    pending = null;
    if (index === null || index === lastShown) return;
    lastShown = index;
    lastStartAt = now();
    const run = (async () => {
      try {
        await show(index);
      } catch {
        // A failed preview is reported by `show` itself; the next request still runs.
      }
    })();
    running = run;
    void run.then(() => {
      if (running === run) running = null;
      schedule();
    });
  };

  const schedule = (): void => {
    if (pending === null || running !== null || timer !== null) return;
    const wait = lastStartAt === null ? 0 : lastStartAt + intervalMs - now();
    if (wait <= 0) {
      start();
      return;
    }
    const scheduledIn = generation;
    timer = setTimer(() => {
      timer = null;
      if (scheduledIn === generation) schedule();
    }, wait);
  };

  return {
    request(index: number): void {
      if (index === (pending ?? lastShown)) return;
      pending = index;
      schedule();
    },
    async settle(): Promise<void> {
      forget();
      while (running !== null) await running;
    },
    cancel(): void {
      forget();
    },
  };
}
