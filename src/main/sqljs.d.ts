declare module 'sql.js' {
  export interface BindParams {
    [key: string]: unknown;
  }
  export interface Statement {
    bind(values: unknown[] | BindParams): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    get(): unknown[];
    free(): void;
  }
  export interface Database {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string): { columns: string[]; values: unknown[][] }[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }
  export default function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<{
    Database: new (data?: Uint8Array) => Database;
  }>;
}
