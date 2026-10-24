/**
 * Documents the `SpawnCandidate` interface as a named contract surface (export interface SpawnCandidate).

 * Purpose: Supports maintainability by documenting why `SpawnCandidate` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface SpawnCandidate {
    /**
   * Specifies the contract for the `h3` member (h3: string;).

   * Contract: Describes stable behavior for callers of `h3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3: string;
    /**
   * Specifies the contract for the `lat` member (lat: number;).

   * Contract: Describes stable behavior for callers of `lat` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
lat: number;
    /**
   * Specifies the contract for the `lng` member (lng: number;).

   * Contract: Describes stable behavior for callers of `lng` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
lng: number;
    /**
   * Specifies the contract for the `terrain` member (terrain: string;).

   * Contract: Describes stable behavior for callers of `terrain` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrain: string;
}
