declare module 'pg' {
  export interface QueryResult<Row = unknown> {
    rows: Row[];
    rowCount: number;
  }

  export interface QueryConfig<Params extends ReadonlyArray<unknown> = ReadonlyArray<unknown>> {
    text: string;
    values?: Params;
  }

  export interface PoolClient {
    query<Row = unknown, Params extends ReadonlyArray<unknown> = ReadonlyArray<unknown>>(
      queryText: string | QueryConfig<Params>,
      values?: Params,
    ): Promise<QueryResult<Row>>;
    release(err?: Error): void;
  }

  export interface Pool {
    query<Row = unknown, Params extends ReadonlyArray<unknown> = ReadonlyArray<unknown>>(
      queryText: string | QueryConfig<Params>,
      values?: Params,
    ): Promise<QueryResult<Row>>;
    end(): Promise<void>;
    connect(): Promise<PoolClient>;
  }

  export const Pool: {
    new (config?: Record<string, unknown>): Pool;
  };

  export default Pool;
  export { PoolClient };
}
