declare module "better-sqlite3" {
  export type DatabaseRunResult = {
    lastInsertRowid: number | bigint;
  };

  export type DatabaseStatement = {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): DatabaseRunResult;
  };

  export default class Database {
    constructor(filename: string);
    exec(sql: string): this;
    prepare(sql: string): DatabaseStatement;
    close(): void;
  }
}
