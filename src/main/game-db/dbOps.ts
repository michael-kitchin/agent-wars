/**
 * Documents the `DbWriteOps` interface as a named contract surface (export interface DbWriteOps).

 * Purpose: Supports maintainability by documenting why `DbWriteOps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface DbWriteOps {
    /**
   * Specifies the contract for the `run` member (run: (sql: string, params?: unknown[]) => void;).

   * Contract: Describes stable behavior for callers of `run` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
run: (sql: string, params?: unknown[]) => void;
}

/**
 * Documents the `DbReadOps` interface as a named contract surface (export interface DbReadOps).

 * Purpose: Supports maintainability by documenting why `DbReadOps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface DbReadOps {
    /**
   * Specifies the contract for the `getOne` member (getOne: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T | undefined;).

   * Contract: Describes stable behavior for callers of `getOne` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getOne: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T | undefined;
    /**
   * Specifies the contract for the `getAll` member (getAll: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T[];).

   * Contract: Describes stable behavior for callers of `getAll` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getAll: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T[];
}

/**
 * Documents the `DbAvailabilityOps` interface as a named contract surface (export interface DbAvailabilityOps).

 * Purpose: Supports maintainability by documenting why `DbAvailabilityOps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface DbAvailabilityOps {
    /**
   * Specifies the contract for the `hasDb` member (hasDb: () => boolean;).

   * Contract: Describes stable behavior for callers of `hasDb` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hasDb: () => boolean;
}

/**
 * Documents the `BasicDbOps` type alias (export type BasicDbOps).

 * Purpose: Supports maintainability by documenting why `BasicDbOps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type BasicDbOps = DbWriteOps & DbReadOps;
/**
 * Documents the `GuardedDbOps` type alias (export type GuardedDbOps).

 * Purpose: Supports maintainability by documenting why `GuardedDbOps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type GuardedDbOps = BasicDbOps & DbAvailabilityOps;
/**
 * Documents the `GuardedDbRunAndGetAllOps` type alias (export type GuardedDbRunAndGetAllOps).

 * Purpose: Supports maintainability by documenting why `GuardedDbRunAndGetAllOps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type GuardedDbRunAndGetAllOps = DbAvailabilityOps & DbWriteOps & Pick<DbReadOps, 'getAll'>;
