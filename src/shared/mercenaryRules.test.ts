/**
 * Mercenary prices and the hire-panel labels.
 *
 * Purpose: Upkeep stays on the global prices, and the hire menu shows the compact price.
 * When to use: After changing `mercenaryUpkeepFor`, `mercenaryHireFee`, `raiseCapacityForHex`, `formatHireOptionLabel`, `formatHireOrderLabel`, `formatCreditsUpkeepSuffix`, `hireShortageLabel`, `oneUnitRaiseShortage`, or `mercenaryTooltipValue`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLOBAL_GAME_MAP, withGameMap } from './activeGameMap';
import { formatCompactHireCost, formatCompactRaiseCost, formatCreditsAmount, formatProductionCapacityAmount } from './economySymbols';
import { unitCostFor } from './gameRules';
import {
  HIRE_ALLOCATED_BOTH,
  HIRE_ALLOCATED_CREDITS,
  HIRE_ALLOCATED_PRODUCTION,
  HIRE_SHORT_BOTH,
  HIRE_SHORT_CREDITS,
  HIRE_SHORT_PRODUCTION,
  RAISE_CAPACITY_LABEL,
  hireShortageLabel,
  oneUnitRaiseShortage,
  formatRaiseCapacityValue,
  formatHireEntryLabel,
  formatHireOptionLabel,
  formatHireOrderLabel,
  formatCreditsUpkeepSuffix,
  MERCENARY_TOOLTIP_FOR_HIRE,
  mercenaryHireFee,
  mercenaryTooltipValue,
  mercenaryUpkeepFor,
  neutralUnitOfferedForRehire,
  raiseCapacityForHex,
} from './mercenaryRules';
import { HUMAN_SEAT_ID, NEUTRAL_OWNER_ID } from './seatIds';
import { getPlayerUnitCountsByType } from './unitCountsByType';

const regionalProfile = {
  ...GLOBAL_GAME_MAP,
  id: 'western_europe' as const,
  rules: { ...GLOBAL_GAME_MAP.rules, infantryCost: 60 },
};

test('mercenary upkeep uses the global prices on every map', () => {
  const expectUpkeep = (): void => {
    assert.equal(mercenaryUpkeepFor('infantry', undefined), 3);
    assert.equal(mercenaryUpkeepFor('infantry', 'advanced'), 5);
    assert.equal(mercenaryUpkeepFor('naval', undefined), 13);
    assert.equal(mercenaryUpkeepFor('naval', 'advanced'), 25);
  };
  expectUpkeep();
  withGameMap(regionalProfile, expectUpkeep);
});

test('a rehire costs two turns of upkeep and a neutral border cannot raise', () => {
  assert.equal(mercenaryHireFee('rehire', 5), 10);
  assert.equal(raiseCapacityForHex(12, false), 24);
  assert.equal(raiseCapacityForHex(12, true), 0);
});

test('mercenaries do not count toward unit caps', () => {
  const counts = getPlayerUnitCountsByType(
    [
      { player: 'human', unitType: 'infantry', isMercenary: true },
      { player: 'human', unitType: 'infantry' },
    ],
    'human'
  );
  assert.equal(counts.infantry, 1);
});

test('a raise option shows production and one turn when the fee equals upkeep', () => {
  const label = formatHireOptionLabel({ unitType: 'infantry', unitCost: 20, fee: 3, upkeep: 3 });
  assert.equal(label, `Infantry (${formatCompactRaiseCost(20, 3, 3)})`);
});

test('a raise order uses the active map production cost and one turn of upkeep', () => {
  const label = formatHireOrderLabel({
    kind: 'raise',
    unitType: 'infantry',
    count: 2,
    displayName: null,
    fee: 6,
  });
  assert.equal(label, `2 Infantry (${formatCompactRaiseCost(unitCostFor('infantry'), 3, 3)})`);
});

test('a rehire order shows the extra above one turn', () => {
  const label = formatHireOrderLabel({
    kind: 'rehire',
    unitType: 'infantry',
    count: 1,
    displayName: '4th Infantry',
    fee: 6,
  });
  assert.equal(label, `4th Infantry (${formatCompactHireCost(6, 3)})`);
});

test('a hire marker shows the production figure alone', () => {
  const figure = formatProductionCapacityAmount('12');
  assert.equal(formatHireEntryLabel(figure), figure);
});

test('a mercenary tooltip names the viewer\'s cost, another side, or a unit that can be rehired', () => {
  const offered = {
    ownerId: NEUTRAL_OWNER_ID,
    unitType: 'infantry',
    embarked: false,
    carryingCargo: false,
    fortifiedByAnotherSide: false,
  };
  assert.equal(neutralUnitOfferedForRehire(offered), true);
  assert.equal(neutralUnitOfferedForRehire({ ...offered, embarked: true }), false);
  assert.equal(neutralUnitOfferedForRehire({ ...offered, carryingCargo: true }), false);
  assert.equal(neutralUnitOfferedForRehire({ ...offered, fortifiedByAnotherSide: true }), false);
  assert.equal(neutralUnitOfferedForRehire({ ...offered, unitType: 'missile' }), false);
  assert.equal(neutralUnitOfferedForRehire({ ...offered, ownerId: HUMAN_SEAT_ID }), false);
  assert.equal(mercenaryTooltipValue({
    ownerId: HUMAN_SEAT_ID,
    viewerSeatId: HUMAN_SEAT_ID,
    isMercenary: true,
    forHire: false,
    upkeep: 5,
    ownerShortName: null,
  }), `${formatCreditsAmount('5')}/turn`);
  assert.equal(mercenaryTooltipValue({
    ownerId: 'opponent',
    viewerSeatId: HUMAN_SEAT_ID,
    isMercenary: true,
    forHire: false,
    upkeep: 5,
    ownerShortName: 'N. America',
  }), 'N. America');
  assert.equal(mercenaryTooltipValue({
    ownerId: NEUTRAL_OWNER_ID,
    viewerSeatId: HUMAN_SEAT_ID,
    isMercenary: false,
    forHire: true,
    upkeep: null,
    ownerShortName: null,
  }), MERCENARY_TOOLTIP_FOR_HIRE);
  assert.equal(mercenaryTooltipValue({
    ownerId: 'opponent',
    viewerSeatId: HUMAN_SEAT_ID,
    isMercenary: false,
    forHire: false,
    upkeep: null,
    ownerShortName: 'N. America',
  }), null);
  assert.equal(mercenaryTooltipValue({
    ownerId: 'opponent',
    viewerSeatId: null,
    isMercenary: true,
    forHire: false,
    upkeep: 5,
    ownerShortName: 'N. America',
  }), 'N. America');
  assert.equal(mercenaryTooltipValue({
    ownerId: 'opponent',
    viewerSeatId: HUMAN_SEAT_ID,
    isMercenary: true,
    forHire: true,
    upkeep: 5,
    ownerShortName: '   ',
  }), null);
});

test('the credits suffix joins upkeep with a spaced plus', () => {
  assert.equal(formatCreditsUpkeepSuffix(0), '');
  assert.equal(formatCreditsUpkeepSuffix(3), ` + ${formatCreditsAmount('3')}/turn`);
});

test('hire capacity shows the production amount still available', () => {
  assert.equal(RAISE_CAPACITY_LABEL, 'Production (Hire)');
  assert.equal(formatRaiseCapacityValue(140), formatProductionCapacityAmount('140'));
});

test('the shortage label names only the part of a raise that does not fit', () => {
  assert.equal(hireShortageLabel(0, 5, 20, 40), HIRE_SHORT_CREDITS);
  assert.equal(hireShortageLabel(10, 5, 40, 20), HIRE_SHORT_PRODUCTION);
  assert.equal(hireShortageLabel(0, 5, 40, 20), HIRE_SHORT_BOTH);
  assert.equal(hireShortageLabel(10, 5, 20, 40), null);
  assert.equal(hireShortageLabel(0, 0, 0, 0), null);
});

test('the raise row is offered only when one unit fits both limits', () => {
  const infantry = { unitCost: 20, fee: 3 };
  const armor = { unitCost: 40, fee: 5 };
  assert.equal(oneUnitRaiseShortage([infantry], 20, 3), null);
  assert.equal(oneUnitRaiseShortage([infantry], 0, 3), HIRE_ALLOCATED_PRODUCTION);
  assert.equal(oneUnitRaiseShortage([infantry], 20, 0), HIRE_ALLOCATED_CREDITS);
  assert.equal(oneUnitRaiseShortage([infantry], 0, 0), HIRE_ALLOCATED_BOTH);
  assert.equal(oneUnitRaiseShortage([infantry, armor], 20, 3), null);
  assert.equal(oneUnitRaiseShortage([infantry, armor], 20, 0), HIRE_ALLOCATED_CREDITS);
  assert.equal(oneUnitRaiseShortage([{ unitCost: 20, fee: 5 }, { unitCost: 40, fee: 3 }], 20, 3), HIRE_ALLOCATED_BOTH);
  assert.equal(oneUnitRaiseShortage([], 0, 0), null);
});
