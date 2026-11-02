import assert from 'node:assert/strict';
import { test } from 'node:test';
import { airStrikeInfrastructureGapReason } from './airStrikeInfrastructure';

const present = { urbanHexCount: 1, airportCount: 1, seaportCount: 1 };
const absent = { urbanHexCount: 0, airportCount: 0, seaportCount: 0 };

test('an infrastructure strike names the missing target', () => {
  assert.equal(airStrikeInfrastructureGapReason('urban', absent), 'Target hex has no urban infrastructure');
  assert.equal(airStrikeInfrastructureGapReason('airport', absent), 'Target hex has no airport');
  assert.equal(airStrikeInfrastructureGapReason('seaport', absent), 'Target hex has no seaport');
});

test('a present target, and a strike on units, has no infrastructure gap', () => {
  assert.equal(airStrikeInfrastructureGapReason('urban', present), null);
  assert.equal(airStrikeInfrastructureGapReason('airport', present), null);
  assert.equal(airStrikeInfrastructureGapReason('seaport', present), null);
  assert.equal(airStrikeInfrastructureGapReason('units', absent), null);
});
