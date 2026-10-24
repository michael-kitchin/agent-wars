/**
 * The model id a consult should use, without importing the Electron OpenRouter module.
 *
 * Purpose: A model change retries with the id the player just saved. Tests can load the consult runner
 * without starting Electron.
 * When to use: `openRouter.ts` registers `getSelectedModel` at load. Consult attempts call `readLiveModelId`.
 * Expected outcome: An empty string until a reader is registered. A non-empty trimmed id replaces the id captured earlier.
 * Exceptions: None.
 */

import type { AiSeatId } from '../../shared/seatIds';
import { logDebug, logTrace } from '../logger';

let readSelectedModel: (seatId: AiSeatId) => string = () => '';

/**
 * Installs the function that reads the saved model id.
 *
 * Purpose: `openRouter.ts` owns the saved id and Electron storage. This module stays free of both.
 * When to use: Once, when the OpenRouter module loads.
 * Expected outcome: Later `readLiveModelId` calls use `reader`.
 * Exceptions: None.
 */
export function registerLiveModelIdReader(reader: (seatId: AiSeatId) => string): void {
  logDebug('liveModelId registerLiveModelIdReader');
  readSelectedModel = reader;
}

/**
 * The model id saved right now.
 *
 * Purpose: A retry after a model change must not keep the id captured when the turn started.
 * When to use: At the start of each consult attempt. Callers use this when `trim()` is non-empty, otherwise the captured id.
 * Expected outcome: The reader's string, or `''` when no reader is registered.
 * Exceptions: None.
 */
export function readLiveModelId(seatId: AiSeatId): string {
  const modelId = readSelectedModel(seatId);
  logTrace('liveModelId readLiveModelId', { seatId, hasModelId: modelId.trim().length > 0 });
  return modelId;
}
