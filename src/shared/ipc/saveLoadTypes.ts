/**
 * What a save or load call returns to the renderer.
 *
 * Purpose: The menu can tell a saved file, a loaded file, a cancel, and a failure apart.
 * When to use: The return values of `game:saveGame` and `game:loadGame`.
 * Expected outcome: `saved` and `loaded` carry the file's base name. `failed` carries one sentence.
 * Exceptions: None.
 */

/**
 * The outcome of saving the match.
 *
 * Purpose: The caller shows a toast for `saved` and the sentence for `failed`.
 * When to use: The return value of `runSaveGame`.
 * Expected outcome: One of the three statuses.
 * Exceptions: None.
 */
export type SaveGameResult =
  | { readonly status: 'saved'; readonly fileName: string }
  | { readonly status: 'canceled' }
  | { readonly status: 'failed'; readonly message: string };

/**
 * The outcome of loading a match.
 *
 * Purpose: The caller reloads the window for `loaded` and shows the sentence for `failed`.
 * When to use: The return value of `runLoadGame`.
 * Expected outcome: One of the three statuses.
 * Exceptions: None.
 */
export type LoadGameResult =
  | { readonly status: 'loaded'; readonly fileName: string }
  | { readonly status: 'canceled' }
  | { readonly status: 'failed'; readonly message: string };
