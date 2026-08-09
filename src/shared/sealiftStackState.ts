import type { SealiftStackState } from './ipc/sealiftTypes';

/**
 * Builds an empty / unsupported sealift stack state for invalid or inactive contexts.
 *
 * Purpose: Single factory so IPC invalid-payload defaults and tactical “no section” returns cannot drift field-by-field.
 * When to use: When sealift UI must hide controls (`showSealiftSection: false`) for a hex or missing payload.
 * Expected outcome: Stable `SealiftStackState` with empty naval/land lists and `contextMode: 'unsupported'`.
 * Exceptions: None.
 */
export function emptySealiftStackState(h3Index: string = ''): SealiftStackState {
  return {
    h3Index,
    showSealiftSection: false,
    contextMode: 'unsupported',
    controlsDisabled: true,
    hasEmbarkedUnitsInStack: false,
    debarkAllowedAtHex: false,
    navalRows: [],
    landOptions: [],
  };
}
