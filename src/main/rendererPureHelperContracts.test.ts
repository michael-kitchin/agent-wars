import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRendererSource } from './testSupport/rendererSourceAssertions';

test('terrain tooltip uses shared HTML escaping', () => {
  const assembly = readRendererSource('map', 'terrainTooltipStrategicState.ts');
  const html = readRendererSource('map', 'terrainTooltipHtml.ts');
  assert.ok(!assembly.includes('function escapeHtml('), 'local escapeHtml should be gone');
  assert.ok(!html.includes('function escapeHtml('), 'tooltip HTML should not define a local escapeHtml');
  assert.ok(html.includes('escapeHtmlText'), 'tooltip HTML should import or call escapeHtmlText');
});

test('terrainView imports projectedPolygonOverlapsViewport from renderGeometry', () => {
  const source = readRendererSource('map', 'terrainView.ts');
  assert.ok(!source.includes('export function projectedPolygonOverlapsViewport('));
  assert.ok(source.includes("from '../rendering/renderGeometry'"));
});

test('buildQueuePopupFormatting delegates HTML helpers to shared module', () => {
  const source = readRendererSource('gameplay', 'buildQueuePopupFormatting.ts');
  assert.ok(source.includes('escapeHtmlText'));
  assert.ok(!source.includes("replaceAll('&', '&amp;')"));
});
