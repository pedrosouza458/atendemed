import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeDb, schema } from '@atende/database';
import { hashPassword, tokenHash, verifyPassword } from '@atende/shared';
import { completeRecovery, login, register, requestRecovery } from '../src/domains/auth/service';
import { normalizeName } from '../src/domains/patients/schemas';
import { app } from '../src/index';
import { openapiSpec } from '../src/openapi';
import { occupancyStatus } from '../src/domains/facilities/occupancy';
import { occupancyCapacityInput } from '../src/domains/facilities/schemas';
import type { AppEnv } from '../src/core';

describe('segurança sem banco', () => {
  it('permite apenas as origens configuradas para os dois frontends locais', async () => {
    const env = { APP_ORIGIN: 'http://localhost:5173', APP_WEB_ORIGIN: 'http://localhost:8082' } as AppEnv['Bindings'];
    for (const origin of [env.APP_ORIGIN, env.APP_WEB_ORIGIN!]) {
      const response = await app.request('/v1/health', { method: 'OPTIONS', headers: { Origin: origin } }, env);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    }
    const rejected = await app.request('/v1/health', { method: 'OPTIONS', headers: { Origin: 'https://outro.example' } }, env);
    expect(rejected.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('PBKDF2 usa sal distinto e rejeita senha errada', async () => {
    const first = await hashPassword('senha-demo-comprida');
    const second = await hashPassword('senha-demo-comprida');
    expect(first).not.toBe(second);
    expect(await verifyPassword('senha-demo-comprida', first)).toBe(true);
    expect(await verifyPassword('senha-errada', first)).toBe(false);
  });

  it('normaliza nomes com acentos para busca', () => {
    expect(normalizeName('  JOÃO   da  Silva ')).toBe('joao da silva');
  });

  it('classifica apenas o estado agregado de lotação', () => {
    expect(occupancyStatus(10, 40)).toBe('NORMAL');
    expect(occupancyStatus(28, 40)).toBe('HIGH');
    expect(occupancyStatus(40, 40)).toBe('FULL');
    expect(occupancyStatus(1, null)).toBe('UNKNOWN');
  });

  it('aceita somente capacidade inteira entre 1 e 10000', () => {
    expect(occupancyCapacityInput.safeParse({ occupancyCapacity: 80 }).success).toBe(true);
    expect(occupancyCapacityInput.safeParse({ occupancyCapacity: 0 }).success).toBe(false);
    expect(occupancyCapacityInput.safeParse({ occupancyCapacity: 12.5 }).success).toBe(false);
    expect(occupancyCapacityInput.safeParse({ occupancyCapacity: 10001 }).success).toBe(false);
  });

  it('documenta todos os endpoints de produto no OpenAPI', () => {
    for (const route of app.routes) {
      if (!route.path.startsWith('/v1/') || route.path === '/v1/openapi.json') continue;
      const path = route.path.replace(/:([A-Za-z]+)/g, '{$1}');
      const method = route.method.toLowerCase();
      expect((openapiSpec.paths as Record<string, Record<string, unknown>>)[path]?.[method], `${route.method} ${route.path}`).toBeDefined();
    }
  });
});

describe.skipIf(!process.env.DATABASE_URL)('recuperação com PostgreSQL', () => {
  const connection = process.env.DATABASE_URL ? makeDb(process.env.DATABASE_URL) : undefined;
  const db = connection?.db;
  let userId: string | undefined;
  afterAll(async () => {
    if (userId && db) await db.delete(schema.users).where(eq(schema.users.id, userId));
    await connection?.close();
  });

  it('consome token uma vez, altera senha e revoga sessões', async () => {
    if (!db) throw new Error('DATABASE_URL ausente');
    const email = `recovery.${crypto.randomUUID()}@atende.com`;
    const original = 'SenhaInicial-2026!';
    const newer = 'SenhaAtualizada-2026!';
    userId = (await register(db, 'Teste Recuperação', email, original)).id;
    const firstLogin = await login(db, email, original);
    let sentToken: string | undefined;
    await requestRecovery(db, email, async (_to, token) => { sentToken = token; });
    expect(sentToken).toBeTruthy();
    await completeRecovery(db, sentToken!, newer);
    await expect(completeRecovery(db, sentToken!, newer)).rejects.toMatchObject({ code: 'INVALID_RESET' });
    await expect(login(db, email, original)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    const secondLogin = await login(db, email, newer);
    expect(secondLogin.user.id).toBe(userId);
    const [session] = await db.select({ revokedAt: schema.authSessions.revokedAt })
      .from(schema.authSessions).where(eq(schema.authSessions.tokenHash, await tokenHash(firstLogin.token))).limit(1);
    expect(session?.revokedAt).not.toBeNull();
  }, 45_000);

  it('solicita recuperação por e-mail sem revelar se a conta existe', async () => {
    if (!db || !process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente');
    const email = `mail.${crypto.randomUUID()}@atende.com`;
    const created = await register(db, 'Teste E-mail', email, 'SenhaInicial-2026!');
    const sent: Array<{ to: string[]; text: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return Response.json({ id: 'demo' });
    }));
    const env = {
      DATABASE_URL: process.env.DATABASE_URL,
      APP_ORIGIN: 'http://localhost:5173',
      RECOVERY_API_KEY: 'test-key', RECOVERY_FROM: 'Atende <no-reply@example.com>',
      AUTH_RATE_LIMIT: { limit: async () => ({ success: true }) },
      SEARCH_RATE_LIMIT: { limit: async () => ({ success: true }) },
    };
    try {
      const request = (address: string) => app.request('/v1/auth/recovery/request', {
        method: 'POST', headers: { Origin: env.APP_ORIGIN, 'X-Atende-Request': '1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address }),
      }, env as unknown as AppEnv['Bindings']);
      expect((await request(email)).status).toBe(202);
      expect((await request(`missing.${crypto.randomUUID()}@atende.com`)).status).toBe(202);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.to).toEqual([email]);
      expect(sent[0]?.text).toContain('15 minutos');
    } finally {
      vi.unstubAllGlobals();
      await db.delete(schema.users).where(eq(schema.users.id, created.id));
    }
  }, 45_000);

  it('nega paciente a conta sem vínculo, vínculo inativo e sessão expirada', async () => {
    if (!db || !process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente');
    const email = `permissoes.${crypto.randomUUID()}@atende.com`;
    const created = await register(db, 'Teste Permissões', email, 'SenhaInicial-2026!');
    const facilityId = '00000000-0000-4000-8000-000000000101';
    try {
      const session = await login(db, email, 'SenhaInicial-2026!');
      const env = {
        DATABASE_URL: process.env.DATABASE_URL,
        APP_ORIGIN: 'http://localhost:5173',
        AUTH_RATE_LIMIT: { limit: async () => ({ success: true }) },
        SEARCH_RATE_LIMIT: { limit: async () => ({ success: true }) },
      };
      const search = () => app.request('/v1/patients?query=Paciente', {
        headers: { Authorization: `Bearer ${session.token}`, 'X-Facility-Id': facilityId },
      }, env as unknown as AppEnv['Bindings']);
      expect((await search()).status).toBe(403);
      await db.insert(schema.receptionists).values({ userId: created.id });
      await db.insert(schema.staffMemberships).values({ userId: created.id, facilityId, role: 'RECEPTIONIST' });
      expect((await search()).status).toBe(200);
      await db.update(schema.staffMemberships).set({ status: 'INACTIVE' }).where(eq(schema.staffMemberships.userId, created.id));
      expect((await search()).status).toBe(403);
      await db.update(schema.authSessions).set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.authSessions.tokenHash, await tokenHash(session.token)));
      expect((await search()).status).toBe(401);
    } finally {
      await db.delete(schema.staffMemberships).where(eq(schema.staffMemberships.userId, created.id));
      await db.delete(schema.receptionists).where(eq(schema.receptionists.userId, created.id));
      await db.delete(schema.users).where(eq(schema.users.id, created.id));
    }
  }, 45_000);
});
