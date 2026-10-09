import type { GameMapProfile } from './gameMapTypes';

/**
 * Rules and scaleranks for the global world map.
 *
 * Purpose: The default profile, and the numbers existing matches already use.
 * When to use: `resetActiveGameMap` and any caller that needs the global column without swapping the process profile.
 * Expected outcome: Costs 20/40/100/60, armor/air/naval minimums 2/5/10, Advanced 21, 9 urban cells per strategic air strike, and city labels through scalerank 6.
 * Exceptions: None.
 */
export const GLOBAL_GAME_MAP: GameMapProfile = {
  id: 'global',
  displayName: 'Global',
  strategicResolution: 1,
  tacticalResolution: 4,
  controlWinMinUrbanShare: null,
  rules: {
    infantryCost: 20,
    armorCost: 40,
    navalCost: 100,
    airCost: 60,
    armorMinUrbanCells: 2,
    airMinUrbanCells: 5,
    navalMinUrbanCells: 10,
    advancedMinUrbanCells: 21,
    strategicStrikeUrbanCells: 9,
  },
  scaleranks: {
    urbanOverlay: 5,
    airport: 5,
    seaport: 5,
    cityLabel: 6,
  },
};

let activeProfile: GameMapProfile = GLOBAL_GAME_MAP;

const profileResetters: Array<() => void> = [];

/**
 * Registers a cache clear that runs whenever the active profile changes.
 *
 * Purpose: Resolution-derived tables, such as the ordered hex list, must not keep the previous grid.
 * When to use: From a module that owns such a cache, once, when that module loads.
 * Expected outcome: `setActiveGameMap`, `resetActiveGameMap`, and `withGameMap` call `reset` after each change.
 * Exceptions: `reset` must not throw. A throw leaves later caches uncleared.
 */
export function registerActiveGameMapReset(reset: () => void): void {
  profileResetters.push(reset);
}

/**
 * Stores `profile` and clears caches that were built for the previous one.
 *
 * Purpose: Every profile change, including a test restore, goes through one path.
 * When to use: `setActiveGameMap`, `resetActiveGameMap`, and `withGameMap`.
 * Expected outcome: `activeGameMap()` returns `profile`. Registered caches are empty.
 * Exceptions: None from this function. A registered reset that throws propagates.
 */
function assignActiveProfile(profile: GameMapProfile): void {
  activeProfile = profile;
  for (const reset of profileResetters) reset();
}

/**
 * Returns the map profile for this process.
 *
 * Purpose: Resolution and rule helpers read one object. The process starts on the global profile.
 * When to use: Any decision that depends on which map is active. Tests install another profile with `withGameMap`.
 * Expected outcome: `GLOBAL_GAME_MAP` until `setActiveGameMap` replaces it. No production caller does that yet.
 * Exceptions: None.
 */
export function activeGameMap(): GameMapProfile {
  return activeProfile;
}

/**
 * Installs the profile for the map that is loaded in this process.
 *
 * Purpose: Later helper calls must follow the profile that was just installed.
 * When to use: From `withGameMap`, and from a map loader after a successful load. No loader calls this yet.
 * Expected outcome: Later helper calls use `profile` until reset.
 * Exceptions: None.
 */
export function setActiveGameMap(profile: GameMapProfile): void {
  assignActiveProfile(profile);
}

/**
 * Restores the global profile.
 *
 * Purpose: Tests and a failed regional load must not leave a regional profile installed.
 * When to use: In a `finally` after `setActiveGameMap`, and when no match is loaded.
 * Expected outcome: `activeGameMap()` is `GLOBAL_GAME_MAP`.
 * Exceptions: None.
 */
export function resetActiveGameMap(): void {
  assignActiveProfile(GLOBAL_GAME_MAP);
}

/**
 * Runs `fn` with `profile` installed, then restores the previous profile.
 *
 * Purpose: A test can ask for strategic resolution 3 without leaking that choice into the next test.
 * When to use: Around a resolution or rules assertion that is not the global map.
 * Expected outcome: `fn`'s return value. The previous profile is restored when `fn` returns or throws, and also when installing `profile` throws.
 * Exceptions: Re-throws whatever `fn` or the install throws, after the restore.
 */
export function withGameMap<T>(profile: GameMapProfile, fn: () => T): T {
  const previous = activeProfile;
  try {
    assignActiveProfile(profile);
    return fn();
  } finally {
    assignActiveProfile(previous);
  }
}
