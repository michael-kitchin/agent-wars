import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatSidebarPhaseText } from './sidebarPhaseLabel';

test('formatSidebarPhaseText shows an em dash when there is no game state', () => {
  assert.equal(
    formatSidebarPhaseText({
      hasGameState: false,
      strategicPhaseLabel: 'Planning',
      battleActive: true,
      beatPlaybackActive: true,
    }),
    '—'
  );
});

test('formatSidebarPhaseText names tactical resolution while a beat plays back', () => {
  assert.equal(
    formatSidebarPhaseText({
      hasGameState: true,
      strategicPhaseLabel: 'Planning',
      battleActive: true,
      beatPlaybackActive: true,
    }),
    'Phase: Tactical resolution'
  );
});

test('formatSidebarPhaseText names tactical planning while a battle is being drafted', () => {
  assert.equal(
    formatSidebarPhaseText({
      hasGameState: true,
      strategicPhaseLabel: 'Resolution',
      battleActive: true,
      beatPlaybackActive: false,
    }),
    'Phase: Tactical planning'
  );
});

test('formatSidebarPhaseText keeps the strategic label outside a battle', () => {
  assert.equal(
    formatSidebarPhaseText({
      hasGameState: true,
      strategicPhaseLabel: 'Planning',
      battleActive: false,
      beatPlaybackActive: false,
    }),
    'Phase: Planning'
  );
});

test('formatSidebarPhaseText keeps the strategic label when playback has no battle', () => {
  assert.equal(
    formatSidebarPhaseText({
      hasGameState: true,
      strategicPhaseLabel: 'Planning',
      battleActive: false,
      beatPlaybackActive: true,
    }),
    'Phase: Planning'
  );
});
