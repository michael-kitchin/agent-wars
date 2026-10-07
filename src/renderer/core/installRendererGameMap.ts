import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { setActiveGameMap } from '../../shared/activeGameMap';
import { setLoadedStrategicFootprint } from '../../shared/loadedStrategicFootprint';
import { setStrategicTerrainFlags } from '../../shared/strategicTerrainFlags';

/**
 * Copies the snapshot's map profile into this process.
 *
 * Purpose: The renderer bundle has its own copy of the active profile and footprint.
 * When to use: When a snapshot arrives, before any draw or code lookup that uses the profile.
 * Expected outcome: The profile matches the snapshot. The global map keeps a null footprint.
 * Exceptions: None. A snapshot without `gameMap` leaves the current profile in place.
 */
export function installRendererGameMap(state: GameStateSnapshot): void {
  if (!state.gameMap) return;
  setActiveGameMap(state.gameMap);
  setStrategicTerrainFlags({
    rugged: state.hexes.filter((hex) => hex.rugged === true).map((hex) => hex.h3Index),
    arctic: state.hexes.filter((hex) => hex.arctic === true).map((hex) => hex.h3Index),
    city: state.hexes.filter((hex) => hex.city === true).map((hex) => hex.h3Index),
  });
  if (state.gameMap.id === 'global') {
    setLoadedStrategicFootprint(null);
    return;
  }
  const roles = new Map<string, string>();
  for (const hex of state.hexes) {
    if (hex.mapRole) roles.set(hex.h3Index, hex.mapRole);
  }
  setLoadedStrategicFootprint(state.hexes.map((hex) => hex.h3Index), roles);
}
