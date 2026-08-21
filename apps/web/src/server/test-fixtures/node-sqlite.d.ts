// Minimal ambient declaration for the small `node:sqlite` surface used by the test-only local D1
// harness. `apps/web` intentionally does not depend on full Node typings, because the production
// code targets the Cloudflare Workers runtime.
declare module "node:sqlite" {
  export interface StatementSync {
    all(...parameters: readonly unknown[]): Array<Record<string, unknown>>;
    get(...parameters: readonly unknown[]): Record<string, unknown> | undefined;
    run(...parameters: readonly unknown[]): { changes: number };
    /** Switches `all()` to positional rows, which is required to read joined SELECTs correctly. */
    setReturnArrays(returnArrays: boolean): void;
  }

  export class DatabaseSync {
    constructor(location: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
