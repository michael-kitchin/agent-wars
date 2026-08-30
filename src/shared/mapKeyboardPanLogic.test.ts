/**
 * Contracts for keyboard map pan key mapping, net axes, scoring, and hold controller.
 * Run: `node dist/shared/mapKeyboardPanLogic.test.js` after `npm run build:main`.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAP_PAN_BASELINE_INTERVAL_MS,
  MAP_PAN_HOLD_INTERVAL_MS,
  STRATEGIC_KEYBOARD_PAN_SPEED,
  TACTICAL_KEYBOARD_PAN_SPEED,
  createMapKeyboardPanHandler,
  keyboardPanModeSpeed,
  netAxesToScreenPanDelta,
  panBindingToDirection,
  panCodeToDirection,
  panKeyToDirection,
  panPhysicalKeyId,
  resolveNetPanAxes,
  scoreNeighborForPanAxes,
  type PanAxisKey,
} from './mapKeyboardPanLogic';

test('hold interval is baseline sped up 1.5x', () => {
  assert.equal(MAP_PAN_BASELINE_INTERVAL_MS, 200);
  assert.equal(MAP_PAN_HOLD_INTERVAL_MS, 133);
  assert.equal(MAP_PAN_HOLD_INTERVAL_MS, Math.round(MAP_PAN_BASELINE_INTERVAL_MS / 1.5));
});

test('panKeyToDirection maps WASD and arrows; unknown keys are null', () => {
  assert.equal(panKeyToDirection('w'), 'north');
  assert.equal(panKeyToDirection('W'), 'north');
  assert.equal(panKeyToDirection('ArrowUp'), 'north');
  assert.equal(panKeyToDirection('a'), 'west');
  assert.equal(panKeyToDirection('ArrowLeft'), 'west');
  assert.equal(panKeyToDirection('s'), 'south');
  assert.equal(panKeyToDirection('ArrowDown'), 'south');
  assert.equal(panKeyToDirection('d'), 'east');
  assert.equal(panKeyToDirection('ArrowRight'), 'east');
  assert.equal(panKeyToDirection('t'), null);
  assert.equal(panKeyToDirection('Escape'), null);
});

test('panCodeToDirection and panBindingToDirection prefer physical codes', () => {
  assert.equal(panCodeToDirection('KeyW'), 'north');
  assert.equal(panCodeToDirection('ArrowUp'), 'north');
  assert.equal(panBindingToDirection('KeyW', 'z'), 'north');
  assert.equal(panBindingToDirection('', 'w'), 'north');
  assert.equal(panPhysicalKeyId('KeyW', 'w'), 'KeyW');
  assert.equal(panPhysicalKeyId('', 'w'), 'w');
});

test('resolveNetPanAxes cancels opposites and allows diagonals', () => {
  assert.deepEqual(resolveNetPanAxes(new Set<PanAxisKey>(['north'])), { ns: 1, ew: 0 });
  assert.deepEqual(resolveNetPanAxes(new Set<PanAxisKey>(['north', 'east'])), { ns: 1, ew: 1 });
  assert.deepEqual(resolveNetPanAxes(new Set<PanAxisKey>(['north', 'south'])), { ns: 0, ew: 0 });
  assert.deepEqual(resolveNetPanAxes(new Set<PanAxisKey>(['east', 'west', 'north'])), { ns: 1, ew: 0 });
});

test('scoreNeighborForPanAxes single-axis ordering matches legacy max/min rule', () => {
  const samples = [
    { deltaLat: 2, deltaLng: 0.5 },
    { deltaLat: 1, deltaLng: 2 },
    { deltaLat: -1, deltaLng: -0.5 },
    { deltaLat: 0.5, deltaLng: -2 },
  ];
  const northBest = samples.reduce((a, b) => (a.deltaLat >= b.deltaLat ? a : b));
  const southBest = samples.reduce((a, b) => (a.deltaLat <= b.deltaLat ? a : b));
  const eastBest = samples.reduce((a, b) => (a.deltaLng >= b.deltaLng ? a : b));
  const westBest = samples.reduce((a, b) => (a.deltaLng <= b.deltaLng ? a : b));
  const pick = (ns: -1 | 0 | 1, ew: -1 | 0 | 1) =>
    samples.reduce((best, cur) =>
      scoreNeighborForPanAxes(cur.deltaLat, cur.deltaLng, ns, ew) >
      scoreNeighborForPanAxes(best.deltaLat, best.deltaLng, ns, ew)
        ? cur
        : best
    );
  assert.equal(pick(1, 0), northBest);
  assert.equal(pick(-1, 0), southBest);
  assert.equal(pick(0, 1), eastBest);
  assert.equal(pick(0, -1), westBest);
});

test('scoreNeighborForPanAxes diagonal prefers NE-ish sample over pure north', () => {
  const pureNorth = { deltaLat: 2, deltaLng: 0 };
  const northEast = { deltaLat: 1.5, deltaLng: 1.5 };
  const scoreN = (s: { deltaLat: number; deltaLng: number }) =>
    scoreNeighborForPanAxes(s.deltaLat, s.deltaLng, 1, 0);
  const scoreNE = (s: { deltaLat: number; deltaLng: number }) =>
    scoreNeighborForPanAxes(s.deltaLat, s.deltaLng, 1, 1);
  assert.ok(scoreN(pureNorth) > scoreN(northEast));
  assert.ok(scoreNE(northEast) > scoreNE(pureNorth));
});

/**
 * Builds a fake-timer controller harness for hold-loop contract tests.
 *
 * Purpose: Advances time without real wall clock so interval restart contracts are deterministic.
 * When to use: Each controller test that needs elapsed hold ticks.
 * Expected outcome: `panCalls` records axes; `advance(ms)` fires due intervals.
 * Exceptions: None.
 */
function createFakeTimerController() {
  let nextId = 1;
  const intervals = new Map<number, { callback: () => void; ms: number; nextDue: number }>();
  let now = 0;
  const panCalls: Array<{ ns: number; ew: number }> = [];
  const controller = createMapKeyboardPanHandler({
    pan: (ns, ew) => {
      panCalls.push({ ns, ew });
    },
    setInterval: (callback, ms) => {
      const id = nextId++;
      intervals.set(id, { callback, ms, nextDue: now + ms });
      return id as unknown as ReturnType<typeof setInterval>;
    },
    clearInterval: (handle) => {
      intervals.delete(handle as unknown as number);
    },
  });
  const advance = (ms: number): void => {
    const target = now + ms;
    while (true) {
      let earliest: { id: number; nextDue: number; callback: () => void; ms: number } | null = null;
      for (const [id, entry] of intervals) {
        if (entry.nextDue <= target && (!earliest || entry.nextDue < earliest.nextDue)) {
          earliest = { id, nextDue: entry.nextDue, callback: entry.callback, ms: entry.ms };
        }
      }
      if (!earliest) break;
      now = earliest.nextDue;
      earliest.callback();
      const still = intervals.get(earliest.id);
      if (still) still.nextDue = now + still.ms;
    }
    now = target;
  };
  return { controller, panCalls, advance };
}

test('first keydown pans immediately; hold interval pans again after 133ms', () => {
  const { controller, panCalls, advance } = createFakeTimerController();
  controller.onPanKeyDown('KeyW', 'north');
  assert.deepEqual(panCalls, [{ ns: 1, ew: 0 }]);
  advance(132);
  assert.equal(panCalls.length, 1);
  advance(1);
  assert.deepEqual(panCalls, [
    { ns: 1, ew: 0 },
    { ns: 1, ew: 0 },
  ]);
});

test('releasing all pan keys stops further interval pans', () => {
  const { controller, panCalls, advance } = createFakeTimerController();
  controller.onPanKeyDown('KeyW', 'north');
  controller.onPanKeyUp('KeyW');
  const count = panCalls.length;
  advance(400);
  assert.equal(panCalls.length, count);
});

test('chord change pans immediately toward new net without waiting full interval', () => {
  const { controller, panCalls, advance } = createFakeTimerController();
  controller.onPanKeyDown('KeyW', 'north');
  advance(50);
  controller.onPanKeyDown('KeyD', 'east');
  assert.deepEqual(panCalls[panCalls.length - 1], { ns: 1, ew: 1 });
  assert.equal(panCalls.length, 2);
  advance(132);
  assert.equal(panCalls.length, 2);
  advance(1);
  assert.deepEqual(panCalls[panCalls.length - 1], { ns: 1, ew: 1 });
});

test('opposite keys cancel pan; releasing one side immediate-pans the remaining axis', () => {
  const { controller, panCalls, advance } = createFakeTimerController();
  controller.onPanKeyDown('KeyW', 'north');
  controller.onPanKeyDown('KeyS', 'south');
  const afterCancel = panCalls.length;
  advance(300);
  assert.equal(panCalls.length, afterCancel);
  controller.onPanKeyUp('KeyS');
  assert.deepEqual(panCalls[panCalls.length - 1], { ns: 1, ew: 0 });
});

test('clear stops further pans', () => {
  const { controller, panCalls, advance } = createFakeTimerController();
  controller.onPanKeyDown('KeyW', 'north');
  controller.clear();
  const count = panCalls.length;
  advance(400);
  assert.equal(panCalls.length, count);
});

test('interval restart after immediate pan prevents immediate-plus-tick double fire', () => {
  const { controller, panCalls, advance } = createFakeTimerController();
  controller.onPanKeyDown('KeyW', 'north');
  advance(100);
  controller.onPanKeyDown('KeyD', 'east');
  assert.equal(panCalls.length, 2);
  advance(132);
  assert.equal(panCalls.length, 2, 'pending old tick must have been cancelled by restart');
  advance(1);
  assert.equal(panCalls.length, 3);
});

test('netAxesToScreenPanDelta maps W/S to screen up/down and A/D to left/right', () => {
  assert.deepEqual(netAxesToScreenPanDelta(1, 0, 100), { dx: 0, dy: -100 });
  assert.deepEqual(netAxesToScreenPanDelta(-1, 0, 100), { dx: 0, dy: 100 });
  assert.deepEqual(netAxesToScreenPanDelta(0, -1, 100), { dx: -100, dy: 0 });
  assert.deepEqual(netAxesToScreenPanDelta(0, 1, 100), { dx: 100, dy: 0 });
});

test('netAxesToScreenPanDelta diagonals keep the same pixel travel as a cardinal step', () => {
  const { dx, dy } = netAxesToScreenPanDelta(1, 1, 100);
  assert.ok(dx > 0 && dy < 0);
  assert.ok(Math.abs(Math.hypot(dx, dy) - 100) < 1e-9);
});

test('keyboard pan is 0.5× a current-zoom hex in both modes (res-1 strategic, res-4 tactical)', () => {
  assert.equal(STRATEGIC_KEYBOARD_PAN_SPEED, 0.5);
  assert.equal(TACTICAL_KEYBOARD_PAN_SPEED, STRATEGIC_KEYBOARD_PAN_SPEED);
  assert.equal(keyboardPanModeSpeed(false), 0.5);
  assert.equal(keyboardPanModeSpeed(true), 0.5);
});

test('same-direction physical overlap does not stutter; releasing one key keeps pan', () => {
  const { controller, panCalls, advance } = createFakeTimerController();
  controller.onPanKeyDown('KeyW', 'north');
  assert.equal(panCalls.length, 1);
  controller.onPanKeyDown('ArrowUp', 'north');
  assert.equal(panCalls.length, 1, 'adding ArrowUp must not immediate-pan again');
  advance(133);
  assert.equal(panCalls.length, 2);
  controller.onPanKeyUp('KeyW');
  assert.equal(panCalls.length, 2, 'net still north; must not re-pan or stop');
  advance(133);
  assert.equal(panCalls.length, 3, 'ArrowUp alone must continue hold interval');
  controller.onPanKeyUp('ArrowUp');
  const count = panCalls.length;
  advance(400);
  assert.equal(panCalls.length, count);
});
