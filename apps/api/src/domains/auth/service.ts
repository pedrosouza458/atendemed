import { and, eq, gt, isNull } from 'drizzle-orm';
import { schema, type Database } from '@atende/database';
import { hashPassword, randomToken, tokenHash, verifyPassword } from '@atende/shared';
import { ApiError } from '../../core';
import { activeReset, userByEmail } from './repository';

const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;
const resetDurationMs = 15 * 60 * 1000;

export async function register(db: Database, name: string, email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(schema.users).values({ name: name.trim(), email: normalizedEmail }).returning({ id: schema.users.id });
    await tx.insert(schema.authCredentials).values({ userId: user!.id, passwordHash });
    return { id: user!.id };
  });
}

export async function login(db: Database, email: string, password: string) {
  const user = await userByEmail(db, email.trim().toLowerCase());
  if (!user) {
    await hashPassword(password);
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Credenciais inválidas');
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!user || user.status !== 'ACTIVE' || !valid) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Credenciais inválidas');
  const token = randomToken();
  await db.insert(schema.authSessions).values({ userId: user.id, tokenHash: await tokenHash(token), expiresAt: new Date(Date.now() + sessionDurationMs) });
  return { token, user: { id: user.id, name: user.name, email: user.email }, expiresIn: sessionDurationMs / 1000 };
}

export async function requestRecovery(db: Database, email: string, send: (email: string, token: string) => Promise<void>): Promise<void> {
  const user = await userByEmail(db, email.trim().toLowerCase());
  if (!user || user.status !== 'ACTIVE') return;
  const token = randomToken();
  const [reset] = await db.insert(schema.passwordResets).values({ userId: user.id, tokenHash: await tokenHash(token), expiresAt: new Date(Date.now() + resetDurationMs) }).returning({ id: schema.passwordResets.id });
  try { await send(user.email, token); }
  catch (error) {
    await db.delete(schema.passwordResets).where(eq(schema.passwordResets.id, reset!.id));
    throw error;
  }
}

export async function completeRecovery(db: Database, token: string, newPassword: string): Promise<void> {
  const hash = await tokenHash(token);
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    const reset = await activeReset(tx, hash);
    if (!reset) throw new ApiError(422, 'INVALID_RESET', 'Código inválido ou expirado');
    const [claimed] = await tx.update(schema.passwordResets).set({ consumedAt: new Date() }).where(and(
      eq(schema.passwordResets.id, reset.id), isNull(schema.passwordResets.consumedAt), gt(schema.passwordResets.expiresAt, new Date()),
    )).returning({ id: schema.passwordResets.id });
    if (!claimed) throw new ApiError(422, 'INVALID_RESET', 'Código inválido ou expirado');
    await tx.update(schema.authCredentials).set({ passwordHash, updatedAt: new Date() }).where(eq(schema.authCredentials.userId, reset.userId));
    await tx.update(schema.authSessions).set({ revokedAt: new Date() }).where(and(eq(schema.authSessions.userId, reset.userId), isNull(schema.authSessions.revokedAt)));
  });
}
