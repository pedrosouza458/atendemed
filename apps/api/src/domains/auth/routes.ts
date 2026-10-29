import type { OpenAPIHono } from '@hono/zod-openapi';
import { setCookie, deleteCookie } from 'hono/cookie';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@atende/database';
import { ApiError, allowedBrowserOrigin, guardMutation, limit, principal, type AppEnv, withDb } from '../../core';
import { body, browserMutation } from '../../http';
import { completeRecovery, login, register, requestRecovery } from './service';

const email = z.string().trim().email().max(320);
const password = z.string().min(12).max(128);
export const registerBody = z.strictObject({ name: z.string().trim().min(2).max(200), email, password });
export const loginBody = z.strictObject({ email, password: z.string(), client: z.enum(['web', 'mobile']) });
export const recoveryRequestBody = z.strictObject({ email });
export const recoveryCompleteBody = z.strictObject({ token: z.string().min(20).max(256), password });

async function sendRecoveryEmail(env: AppEnv['Bindings'], to: string, token: string): Promise<void> {
  if (!env.RECOVERY_API_KEY || !env.RECOVERY_FROM) throw new ApiError(503, 'RECOVERY_UNAVAILABLE', 'Recuperação não configurada');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RECOVERY_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.RECOVERY_FROM, to: [to], subject: 'Recuperação de acesso — Atende', text: `Seu código de recuperação é ${token}. Ele expira em 15 minutos. Insira o código no fluxo de recuperação do Atende.` }),
  });
  if (!response.ok) throw new ApiError(503, 'RECOVERY_UNAVAILABLE', 'Não foi possível enviar a recuperação');
}

export function registerAuthRoutes(app: OpenAPIHono<AppEnv>): void {
  app.post('/v1/auth/register', async (c) => {
    browserMutation(c);
    const input = await body(c, registerBody);
    await limit(c, 'AUTH_RATE_LIMIT', `register:${input.email.toLowerCase()}`);
    const result = await withDb(c, (db) => register(db, input.name, input.email, input.password));
    return c.json(result, 201);
  });

  app.post('/v1/auth/login', async (c) => {
    const input = await body(c, loginBody);
    if (input.client === 'web' && (!allowedBrowserOrigin(c.env, c.req.header('Origin')) || c.req.header('X-Atende-Request') !== '1')) {
      throw new ApiError(403, 'CSRF_REJECTED', 'Origem da requisição não autorizada');
    }
    await limit(c, 'AUTH_RATE_LIMIT', `login:${input.email.toLowerCase()}`);
    const result = await withDb(c, (db) => login(db, input.email, input.password));
    c.header('Cache-Control', 'no-store');
    if (input.client === 'web') {
      setCookie(c, 'atende_session', result.token, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: result.expiresIn });
      return c.json({ user: result.user, expiresIn: result.expiresIn });
    }
    return c.json(result);
  });

  app.get('/v1/auth/me', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    const [user] = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, isSystemAdmin: schema.users.isSystemAdmin })
      .from(schema.users).where(eq(schema.users.id, actor.userId)).limit(1);
    const memberships = await db.select({ facilityId: schema.staffMemberships.facilityId, role: schema.staffMemberships.role })
      .from(schema.staffMemberships).where(and(eq(schema.staffMemberships.userId, actor.userId), eq(schema.staffMemberships.status, 'ACTIVE')));
    const [patient] = await db.select({ id: schema.patients.id }).from(schema.patients).where(eq(schema.patients.userId, actor.userId)).limit(1);
    return c.json({ user, memberships, patientId: patient?.id ?? null });
  }));

  app.post('/v1/auth/logout', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    guardMutation(c, actor);
    await db.update(schema.authSessions).set({ revokedAt: new Date() }).where(eq(schema.authSessions.id, actor.sessionId));
    if (actor.viaCookie) deleteCookie(c, 'atende_session', { path: '/' });
    return c.json({ ok: true });
  }));

  app.post('/v1/auth/recovery/request', async (c) => {
    browserMutation(c);
    const input = await body(c, recoveryRequestBody);
    await limit(c, 'AUTH_RATE_LIMIT', `recovery:${input.email.toLowerCase()}`);
    if (!c.env.RECOVERY_API_KEY || !c.env.RECOVERY_FROM) throw new ApiError(503, 'RECOVERY_UNAVAILABLE', 'Recuperação não configurada');
    await withDb(c, (db) => requestRecovery(db, input.email, (to, token) => sendRecoveryEmail(c.env, to, token)));
    return c.json({ ok: true }, 202);
  });

  app.post('/v1/auth/recovery/complete', async (c) => {
    browserMutation(c);
    const input = await body(c, recoveryCompleteBody);
    await limit(c, 'AUTH_RATE_LIMIT', `recovery-complete:${input.token.slice(0, 12)}`);
    await withDb(c, (db) => completeRecovery(db, input.token, input.password));
    return c.json({ ok: true });
  });
}
