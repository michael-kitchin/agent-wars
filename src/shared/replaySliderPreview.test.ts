import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REPLAY_SLIDER_PREVIEW_INTERVAL_MS, createSliderPreviewScheduler, type SliderPreviewScheduler } from './replaySliderPreview';

/**
 * A scheduler wired to a fake clock, fake timers, and a recording `show`.
 *
 * Purpose: The tests move time and finish shows by hand, so each rule is checked without real waits.
 * When to use: `buildHarness` returns one per test.
 * Expected outcome: The scheduler plus the controls that drive it.
 * Exceptions: None.
 */
interface Harness {
  /**
   * The scheduler under test.
   *
   * Contract: Built with an interval of 250 ms over the fake clock and timers.
   * When to use: Each request, settle, and cancel.
   * Expected outcome: The real scheduler.
   * Exceptions: None.
   */
  readonly scheduler: SliderPreviewScheduler;
  /**
   * The indexes `show` was called with, in order.
   *
   * Contract: Appended to when `show` starts.
   * When to use: Assertions.
   * Expected outcome: Every index shown so far.
   * Exceptions: None.
   */
  readonly shown: number[];
  /**
   * Moves the fake clock forward and runs the timers that fall due.
   *
   * Contract: Timers run in due order, each at its due time.
   * When to use: To pass the interval.
   * Expected outcome: The clock reads the new time.
   * Exceptions: None.
   */
  readonly advance: (ms: number) => Promise<void>;
  /**
   * Finishes the oldest `show` that is still running.
   *
   * Contract: Resolves it, or rejects it when `fail` is true, then lets promise callbacks run.
   * When to use: To end a show the test held open.
   * Expected outcome: The scheduler sees the show end.
   * Exceptions: Throws when no show is running.
   */
  readonly finish: (fail?: boolean) => Promise<void>;
  /**
   * The number of timers still waiting.
   *
   * Contract: Cleared timers are not counted.
   * When to use: Assertions about pending work.
   * Expected outcome: A count.
   * Exceptions: None.
   */
  readonly timerCount: () => number;
  /**
   * Runs every waiting timer callback, even ones the scheduler cleared.
   *
   * Contract: Models a callback that fires after it was meant to be dropped.
   * When to use: The cancel test.
   * Expected outcome: Each stored callback has run once.
   * Exceptions: None.
   */
  readonly fireAllTimers: () => void;
}

/**
 * Lets queued promise callbacks run.
 *
 * Purpose: The scheduler reacts to a finished show in promise callbacks.
 * When to use: After resolving a fake show.
 * Expected outcome: Resolves after a few microtask turns.
 * Exceptions: None.
 */
async function flushMicrotasks(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
}

/**
 * Builds a scheduler over a fake clock and fake timers.
 *
 * Purpose: Every test starts from the same controllable world.
 * When to use: At the start of each test.
 * Expected outcome: A fresh harness at time zero with no show running.
 * Exceptions: None.
 */
function buildHarness(): Harness {
  let now = 0;
  let nextHandle = 1;
  const timers = new Map<number, { readonly at: number; readonly fn: () => void }>();
  const cleared: (() => void)[] = [];
  const shown: number[] = [];
  const running: { resolve: () => void; reject: (error: Error) => void }[] = [];
  const scheduler = createSliderPreviewScheduler({
    intervalMs: 250,
    show: (index) => {
      shown.push(index);
      return new Promise<void>((resolve, reject) => {
        running.push({ resolve, reject });
      });
    },
    now: () => now,
    setTimer: (fn, ms) => {
      const handle = nextHandle;
      nextHandle += 1;
      timers.set(handle, { at: now + ms, fn });
      return handle;
    },
    clearTimer: (handle) => {
      const timer = timers.get(handle as number);
      if (timer) cleared.push(timer.fn);
      timers.delete(handle as number);
    },
  });
  return {
    scheduler,
    shown,
    advance: async (ms) => {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        await flushMicrotasks();
      }
      now = end;
    },
    finish: async (fail = false) => {
      const show = running.shift();
      if (!show) throw new Error('no show is running');
      if (fail) show.reject(new Error('show failed'));
      else show.resolve();
      await flushMicrotasks();
    },
    timerCount: () => timers.size,
    fireAllTimers: () => {
      const callbacks = [...cleared, ...[...timers.values()].map((timer) => timer.fn)];
      timers.clear();
      for (const fn of callbacks) fn();
    },
  };
}

test('the preview interval is a quarter second', () => {
  assert.equal(REPLAY_SLIDER_PREVIEW_INTERVAL_MS, 250);
});

test('the first request shows at once', () => {
  const { scheduler, shown } = buildHarness();
  scheduler.request(3);
  assert.deepEqual(shown, [3]);
});

test('requests within the interval collapse to the latest, shown when the interval ends', async () => {
  const h = buildHarness();
  h.scheduler.request(1);
  await h.finish();
  await h.advance(50);
  h.scheduler.request(2);
  h.scheduler.request(3);
  h.scheduler.request(4);
  assert.deepEqual(h.shown, [1]);
  await h.advance(150);
  assert.deepEqual(h.shown, [1], 'nothing shows before the interval ends');
  await h.advance(50);
  assert.deepEqual(h.shown, [1, 4]);
});

test('a request made while a show runs is shown after it finishes, and only the latest', async () => {
  const h = buildHarness();
  h.scheduler.request(1);
  await h.advance(300);
  h.scheduler.request(2);
  h.scheduler.request(5);
  assert.deepEqual(h.shown, [1], 'the running show is not interrupted');
  await h.finish();
  assert.deepEqual(h.shown, [1, 5]);
});

test('a request for the index last shown or last requested does nothing', async () => {
  const h = buildHarness();
  h.scheduler.request(2);
  await h.finish();
  await h.advance(300);
  h.scheduler.request(2);
  assert.deepEqual(h.shown, [2], 'the shown index is not shown again');
  assert.equal(h.timerCount(), 0);
  await h.advance(10);
  h.scheduler.request(3);
  h.scheduler.request(4);
  h.scheduler.request(4);
  assert.deepEqual(h.shown, [2, 3]);
  await h.finish();
  await h.advance(300);
  assert.deepEqual(h.shown, [2, 3, 4], 'the repeated request is shown once');
});

test('settle waits for the running show and never starts the pending one', async () => {
  const h = buildHarness();
  h.scheduler.request(1);
  h.scheduler.request(2);
  let settled = false;
  const settling = h.scheduler.settle().then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false, 'settle waits while the show runs');
  await h.finish();
  await settling;
  assert.equal(settled, true);
  await h.advance(1000);
  assert.deepEqual(h.shown, [1], 'the pending request was dropped');
});

test('settle with nothing running resolves at once', async () => {
  const h = buildHarness();
  await h.scheduler.settle();
  assert.deepEqual(h.shown, []);
});

test('cancel drops the pending request and later timer callbacks do nothing', async () => {
  const h = buildHarness();
  h.scheduler.request(1);
  await h.finish();
  h.scheduler.request(2);
  h.scheduler.cancel();
  h.fireAllTimers();
  await h.advance(1000);
  assert.deepEqual(h.shown, [1]);
  h.scheduler.request(1);
  assert.deepEqual(h.shown, [1, 1], 'after a cancel the next request shows at once, even for the same index');
});

test('a show that rejects does not stop later requests', async () => {
  const h = buildHarness();
  h.scheduler.request(1);
  await h.finish(true);
  await h.advance(300);
  h.scheduler.request(2);
  assert.deepEqual(h.shown, [1, 2]);
});
