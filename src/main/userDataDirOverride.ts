import * as fs from 'fs';
import * as path from 'path';
import type { App } from 'electron';
import { logDebug } from './logger';

/**
 * Environment variable that points the app at a different user-data folder.
 *
 * Purpose: Lets the UI smoke run start from a fresh, throwaway folder, so it never reads or changes the player's
 *   saved match, API key, or model choice.
 * When to use: Set it only for automated runs. Players never need it.
 * Expected outcome: Read once by `applyUserDataDirOverride`.
 * Exceptions: None.
 */
export const USER_DATA_DIR_ENV = 'AGENT_WARS_USER_DATA_DIR';

/**
 * Moves Electron's user-data folder when `AGENT_WARS_USER_DATA_DIR` is set.
 *
 * Purpose: The database, the extracted region packs, and the OpenRouter settings all live under `userData`.
 * When to use: Once at startup, before `app.whenReady()`, so every later `app.getPath('userData')` sees the new folder.
 * Expected outcome: With the variable set to a non-blank path, the folder is created when missing and `userData`
 *   becomes its absolute path. Without it, nothing changes. Either way one debug line is logged.
 * Exceptions: Throws when the folder cannot be created; a misconfigured automated run should stop at once.
 */
export function applyUserDataDirOverride(electronApp: App, env: NodeJS.ProcessEnv = process.env): void {
  const requested = env[USER_DATA_DIR_ENV]?.trim() ?? '';
  if (requested.length === 0) {
    logDebug('main applyUserDataDirOverride: not set; userData unchanged');
    return;
  }
  const userDataDir = path.resolve(requested);
  logDebug('main applyUserDataDirOverride', { userDataDir });
  fs.mkdirSync(userDataDir, { recursive: true });
  electronApp.setPath('userData', userDataDir);
}
