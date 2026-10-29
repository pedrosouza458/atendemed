import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import { makeDb, schema, type Database, type Executor } from '@atende/database';
import { tokenHash } from '@atende/shared';

export type Bindings = {
  DATABASE_URL: string;
  HYPERDRIVE?: { connectionString: string };
  APP_ORIGIN: string;
  APP_WEB_ORIGIN?: string;
  AUTH_RATE_LIMIT: RateLimit;
  SEARCH_RATE_LIMIT: RateLimit;
  DOCUMENTS?: R2Bucket;
  RECOVERY_API_KEY?: string;
  RECOVERY_FROM?: string;
};
export type AppEnv = { Bindings: Bindings };
export type Principal = { userId: string; sessionId: string; tokenHash: string; viaCookie: boolean; isSystemAdmin: boolean };
export type Role = 'RECEPTIONIST' | 'DOCTOR' | 'ADMIN';

export class ApiError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 503, public code: string, message: string) { super(message); }
}

export function allowedBrowserOrigin(env: Bindings, origin: string | undefined): boolean {
  return Boolean(origin && (origin === env.APP_ORIGIN || origin === env.APP_WEB_ORIGIN));
}

export async function withDb<T>(c: Context<AppEnv>, run: (db: Database) => Promise<T>): Promise<T> {
  const url = c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL;
  if (!url) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Banco de dados não configurado');
  const connection = makeDb(url);
  try { return await run(connection.db); } finally { await connection.close(); }
}

export async function principal(c: Context<AppEnv>, db: Database): Promise<Principal> {
  const header = c.req.header('Authorization');
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const cookie = getCookie(c, 'atende_session');
  const token = bearer || cookie;
  if (!token || token.length > 256) throw new ApiError(401, 'UNAUTHENTICATED', 'Autenticação necessária');
  const hash = await tokenHash(token);
  const [record] = await db.select({
    sessionId: schema.authSessions.id,
    userId: schema.users.id,
    isSystemAdmin: schema.users.isSystemAdmin,
  }).from(schema.authSessions).innerJoin(schema.users, eq(schema.authSessions.userId, schema.users.id)).where(and(
    eq(schema.authSessions.tokenHash, hash), isNull(schema.authSessions.revokedAt),
    gt(schema.authSessions.expiresAt, new Date()), eq(schema.users.status, 'ACTIVE'),
  )).limit(1);
  if (!record) throw new ApiError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada');
  return { ...record, tokenHash: hash, viaCookie: !bearer };
}

export function guardMutation(c: Context<AppEnv>, actor: Principal): void {
  if (!actor.viaCookie) return;
  if (!allowedBrowserOrigin(c.env, c.req.header('Origin')) || c.req.header('X-Atende-Request') !== '1') {
    throw new ApiError(403, 'CSRF_REJECTED', 'Origem da requisição não autorizada');
  }
}

export async function membership(db: Database, actor: Principal, facilityId: string, allowed: Role[]): Promise<Role> {
  const [record] = await db.select({ role: schema.staffMemberships.role }).from(schema.staffMemberships)
    .innerJoin(schema.healthcareFacilities, eq(schema.staffMemberships.facilityId, schema.healthcareFacilities.id))
    .where(and(eq(schema.staffMemberships.userId, actor.userId), eq(schema.staffMemberships.facilityId, facilityId),
      eq(schema.staffMemberships.status, 'ACTIVE'), eq(schema.healthcareFacilities.active, true), inArray(schema.staffMemberships.role, allowed)))
    .limit(1);
  if (!record) throw new ApiError(403, 'FORBIDDEN', 'Sem permissão nesta unidade');
  if (record.role === 'DOCTOR') {
    const [doctor] = await db.select({ id: schema.doctors.id }).from(schema.doctors).where(and(
      eq(schema.doctors.userId, actor.userId), eq(schema.doctors.verificationStatus, 'VERIFIED'),
    )).limit(1);
    if (!doctor) throw new ApiError(403, 'FORBIDDEN', 'Perfil médico inativo');
  }
  if (record.role === 'RECEPTIONIST') {
    const [receptionist] = await db.select({ id: schema.receptionists.id }).from(schema.receptionists).where(and(
      eq(schema.receptionists.userId, actor.userId), eq(schema.receptionists.status, 'ACTIVE'),
    )).limit(1);
    if (!receptionist) throw new ApiError(403, 'FORBIDDEN', 'Perfil de atendente inativo');
  }
  return record.role;
}

export async function audit(db: Executor, actor: Principal, action: string, resourceType: string, resourceId: string | null, facilityId: string | null, purpose: string): Promise<void> {
  await db.insert(schema.auditLogs).values({ actorUserId: actor.userId, action, resourceType, resourceId, facilityId, purpose });
}

export async function limit(c: Context<AppEnv>, kind: 'AUTH_RATE_LIMIT' | 'SEARCH_RATE_LIMIT', key: string): Promise<void> {
  const binding = c.env[kind];
  if (!binding) throw new ApiError(503, 'RATE_LIMIT_UNAVAILABLE', 'Proteção de acesso indisponível');
  if (!(await binding.limit({ key })).success) throw new ApiError(429, 'RATE_LIMITED', 'Muitas tentativas; tente mais tarde');
}

export function facilityHeader(c: Context<AppEnv>): string {
  const value = c.req.header('X-Facility-Id');
  if (!value || !/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value)) {
    throw new ApiError(400, 'FACILITY_REQUIRED', 'Unidade ativa inválida');
  }
  return value;
}
