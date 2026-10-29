import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export { schema };
export function makeDb(url: string) {
  const pool = new Pool({ connectionString: url });
  return { db: drizzle({ client: pool, schema }), close: () => pool.end() };
}
export type Database = ReturnType<typeof makeDb>['db'];
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Executor = Database | Transaction;
