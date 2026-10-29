import { and, eq, gt, isNull } from 'drizzle-orm';
import { schema, type Database, type Executor } from '@atende/database';

export async function userByEmail(db: Database, email: string) {
  const [user] = await db.select({
    id: schema.users.id, name: schema.users.name, email: schema.users.email,
    status: schema.users.status, passwordHash: schema.authCredentials.passwordHash,
  }).from(schema.users).innerJoin(schema.authCredentials, eq(schema.users.id, schema.authCredentials.userId))
    .where(eq(schema.users.email, email)).limit(1);
  return user;
}

export async function activeReset(db: Executor, hash: string) {
  const [reset] = await db.select().from(schema.passwordResets).where(and(
    eq(schema.passwordResets.tokenHash, hash), isNull(schema.passwordResets.consumedAt),
    gt(schema.passwordResets.expiresAt, new Date()),
  )).limit(1);
  return reset;
}
