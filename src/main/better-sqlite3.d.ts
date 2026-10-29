/**
 * Minimal typings for better-sqlite3 (package ships without bundled .d.ts in all versions).
 */
declare module 'better-sqlite3' {
    /**
   * Documents the `RunResult` interface as a named contract surface (interface RunResult).

   * Purpose: Supports maintainability by documenting why `RunResult` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
interface RunResult {
        /**
     * Specifies the contract for the `changes` member (changes: number;).

     * Contract: Describes stable behavior for callers of `changes` in this codebase.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
changes: number;
        /**
     * Specifies the contract for the `lastInsertRowid` member (lastInsertRowid?: number | bigint;).

     * Contract: Describes stable behavior for callers of `lastInsertRowid` in this codebase.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
lastInsertRowid?: number | bigint;
  }

    /**
   * Documents the `Statement` interface as a named contract surface (interface Statement).

   * Purpose: Supports maintainability by documenting why `Statement` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
interface Statement {
        /**
     * Specifies the contract for `run` (run(...params: unknown[]): RunResult;).

     * Contract: Describes stable behavior for callers of `run` in this codebase.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
run(...params: unknown[]): RunResult;
        /**
     * Specifies the contract for `get` (get(...params: unknown[]): unknown;).

     * Contract: Describes stable behavior for callers of `get` in this codebase.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
get(...params: unknown[]): unknown;
        /**
     * Specifies the contract for `all` (all(...params: unknown[]): unknown[];).

     * Contract: Describes stable behavior for callers of `all` in this codebase.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
all(...params: unknown[]): unknown[];
  }

    /**
   * Documents the `Database` class as an ambient type surface (export default class Database).

   * Purpose: Supports maintainability by documenting why `Database` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
export default class Database {
        /**
     * Constructs the instance for `constructor` (constructor(filename: string, options?:).

     * Purpose: Supports maintainability by documenting why `constructor` exists.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
constructor(filename: string, options?: { readonly?: boolean; fileMustExist?: boolean });
        /**
     * The path passed to the constructor.
     *
     * Purpose: Tests copy the open match file without a second path argument.
     * When to use: After the database is open.
     * Expected outcome: The file path, or `:memory:` for an in-memory database.
     * Exceptions: None.
     */
readonly name: string;
        /**
     * True while this connection has an open transaction.
     *
     * Purpose: A save cannot checkpoint the database from inside a transaction.
     * When to use: Before `VACUUM INTO`.
     * Expected outcome: True between `BEGIN` and `COMMIT` or `ROLLBACK`.
     * Exceptions: None.
     */
readonly inTransaction: boolean;
        /**
     * Implements behavior for `pragma` (pragma(source: string, options?:).

     * Purpose: Supports maintainability by documenting why `pragma` exists.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
pragma(source: string, options?: { simple?: boolean }): unknown;
        /**
     * Implements behavior for `prepare` (prepare(source: string): Statement;).

     * Purpose: Supports maintainability by documenting why `prepare` exists.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
prepare(source: string): Statement;
        /**
     * Implements behavior for `exec` (exec(source: string): this;).

     * Purpose: Supports maintainability by documenting why `exec` exists.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
exec(source: string): this;
        /**
     * Implements behavior for `close` (close(): void;).

     * Purpose: Supports maintainability by documenting why `close` exists.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
close(): void;
  }
}
