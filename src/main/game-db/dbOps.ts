export interface DbWriteOps {
  run: (sql: string, params?: unknown[]) => void;
}

export interface DbReadOps {
  getOne: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T | undefined;
  getAll: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T[];
}

export interface DbAvailabilityOps {
  hasDb: () => boolean;
}

export type BasicDbOps = DbWriteOps & DbReadOps;
export type GuardedDbOps = BasicDbOps & DbAvailabilityOps;
export type GuardedDbRunAndGetAllOps = DbAvailabilityOps & DbWriteOps & Pick<DbReadOps, 'getAll'>;
export type DbRowRecord = Record<string, unknown>;

export interface DbWriteOps {
  run: (sql: string, params?: unknown[]) => void;
}

export interface DbReadOps {
  getOne: <T extends DbRowRecord>(sql: string, params?: unknown[]) => T | undefined;
  getAll: <T extends DbRowRecord>(sql: string, params?: unknown[]) => T[];
}

export interface DbQueryOps extends DbWriteOps, DbReadOps {}

export interface DbConnectionStateOps {
  hasDb: () => boolean;
}

export interface DbConnectedQueryOps extends DbQueryOps, DbConnectionStateOps {}
