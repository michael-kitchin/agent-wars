/**
 * Minimal typings for better-sqlite3 (package ships without bundled .d.ts in all versions).
 */
declare module 'better-sqlite3' {
  interface RunResult {
    changes: number;
    lastInsertRowid?: number | bigint;
  }

  interface Statement {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  export default class Database {
    constructor(filename: string, options?: { readonly?: boolean; fileMustExist?: boolean });
    pragma(source: string, options?: { simple?: boolean }): unknown;
    prepare(source: string): Statement;
    exec(source: string): this;
    close(): void;
  }
}
