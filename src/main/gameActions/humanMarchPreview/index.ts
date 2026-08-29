/**
 * Barrel for human march hover preview — re-exports implementation from `humanMarchPreviewImpl.ts`.
 *
 * Purpose: Preserves `import … from './gameActions/humanMarchPreview'` paths after the Phase 5 directory split.
 * When to use: All former consumers of `humanMarchPreview.ts`.
 * Expected outcome: Same public API as before the split.
 * Exceptions: None.
 */

export * from './humanMarchPreviewResolve';
