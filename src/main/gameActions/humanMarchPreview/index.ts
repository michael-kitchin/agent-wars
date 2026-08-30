/**
 * Barrel for human march hover preview — re-exports implementation from `humanMarchPreviewResolve.ts`.
 *
 * Purpose: Preserves `import … from './gameActions/humanMarchPreview'` paths after the directory split.
 * When to use: All former consumers of `humanMarchPreview.ts`.
 * Expected outcome: Same public API as before the split.
 * Exceptions: None.
 */

export * from './humanMarchPreviewResolve';
