import type { EmbarkOrder, SealiftStackState } from '../../shared/ipcTypes';
import { mergePendingEmbarksIntoSealiftState } from '../../shared/sealiftPendingEmbarks';

/**
 * Applies renderer-local tactical embark drafts on top of committed tactical sealift stack state.
 *
 * Purpose: Stack callouts show pending slot selections before Ready without mutating the main-process tactical snapshot.
 * When to use: After `getTacticalSealiftStackState` returns base rows from `embarkedOnSubUnitId`, before binding `<select>` values.
 * Expected outcome: The shared `mergePendingEmbarksIntoSealiftState` result: pending land ids leave their old slots and join the named carrier's cargo, laid out armor first.
 * Exceptions: None.
 */
export function mergePendingTacticalEmbarkOrdersIntoSealiftState(
  base: SealiftStackState,
  pendingEmbark: readonly EmbarkOrder[]
): SealiftStackState {
  return mergePendingEmbarksIntoSealiftState({ base, pendingEmbark });
}
