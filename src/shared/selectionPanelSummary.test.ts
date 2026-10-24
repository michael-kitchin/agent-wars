import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSelectionPanelChips, summarizeSelectionPanel, type SelectionPanelUnitInput } from './selectionPanelSummary';

/**
 * Units of both sides in two hexes, as the panel receives them.
 *
 * Purpose: One stack, a unit in another hex, and an enemy unit cover the panel's counting rules.
 * When to use: The tests in this file.
 * Expected outcome: Three player units and one enemy unit in `hexA`, and one player air unit in `hexB`.
 * Exceptions: None.
 */
const UNITS: readonly SelectionPanelUnitInput[] = [
  { id: 'h1-t1', unitType: 'armor', h3Index: 'hexA', player: 'human' },
  { id: 'h1-t2', unitType: 'armor', h3Index: 'hexA', player: 'human' },
  { id: 'h1-i1', unitType: 'infantry', h3Index: 'hexA', player: 'human' },
  { id: 'h1-a1', unitType: 'air', h3Index: 'hexB', player: 'human' },
  { id: 'o1-t1', unitType: 'armor', h3Index: 'hexA', player: 'opponent' },
];

test('summarizeSelectionPanel describes the first selected unit\'s hex and counts the player\'s units there', () => {
  const summary = summarizeSelectionPanel(['h1-t1', 'h1-i1'], UNITS, () => true);
  assert.ok(summary);
  assert.equal(summary.panelHex, 'hexA');
  assert.equal(summary.countText, '2 selected of 3');
  assert.deepEqual(summary.rows.map((row) => row.unitId), ['h1-t1', 'h1-i1']);
});

test('summarizeSelectionPanel marks a unit selected in another hex and leaves out units that cannot be selected', () => {
  const summary = summarizeSelectionPanel(['h1-t1', 'h1-a1'], UNITS, (unitId) => unitId !== 'h1-i1');
  assert.ok(summary);
  assert.equal(summary.countText, '1 selected of 2');
  assert.deepEqual(summary.rows.map((row) => [row.unitId, row.inPanelHex]), [['h1-t1', true], ['h1-a1', false]]);
});

test('summarizeSelectionPanel returns null when no selected id matches a unit', () => {
  assert.equal(summarizeSelectionPanel([], UNITS, () => true), null);
  assert.equal(summarizeSelectionPanel(['gone'], UNITS, () => true), null);
});

test('buildSelectionPanelChips lists the known facts in order', () => {
  const chips = buildSelectionPanelChips({
    terrainKind: 'wetlands',
    weather: 'mild',
    techLevel: 'advanced',
    productionPerTurn: 1094,
    homeChip: { kind: 'home', text: 'Home' },
  });
  assert.deepEqual(chips.map((chip) => chip.kind), ['terrain', 'weather', 'tech', 'production', 'home']);
  assert.match(chips[0].html, /Wetlands$/);
  assert.match(chips[2].html, /Advanced$/);
  assert.equal(chips[3].html, '$1,094/turn');
  assert.equal(chips[4].html, 'Home');
});

test('buildSelectionPanelChips leaves out unknown facts and zero production', () => {
  const chips = buildSelectionPanelChips({
    terrainKind: null,
    weather: null,
    techLevel: null,
    productionPerTurn: 0,
    homeChip: { kind: 'enemy-home', text: 'W. Turkey home' },
  });
  assert.deepEqual(chips, [{ kind: 'enemy-home', html: 'W. Turkey home' }]);
});
