import { OpenAPIHono } from '@hono/zod-openapi';
import { ZodError } from 'zod';
import { ApiError, allowedBrowserOrigin, type AppEnv } from './core';
import { registerAuthRoutes } from './domains/auth/routes';
import { registerPatientRoutes } from './domains/patients/routes';
import { DuplicatePatientError } from './domains/patients/service';
import { registerFacilityRoutes } from './domains/facilities/routes';
import { registerQueueRoutes } from './domains/queue/routes';
import { registerDocumentRoutes } from './domains/documents/routes';
import { registerNotificationRoutes } from './domains/notifications/routes';
import { registerSelfRoutes } from './domains/self/routes';
import { openapiSpec } from './openapi';

const app = new OpenAPIHono<AppEnv>();

app.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Content-Type-Options', 'nosniff');
  const origin = c.req.header('Origin');
  if (allowedBrowserOrigin(c.env, origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Vary', 'Origin');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Atende-Request, X-Facility-Id');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
  }
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  await next();
});

app.onError((error, c) => {
  c.header('Cache-Control', 'no-store');
  if (error instanceof DuplicatePatientError) return c.json({ error: error.code, message: error.message, candidates: error.candidates }, 409);
  if (error instanceof ApiError) return c.json({ error: error.code, message: error.message }, error.status);
  if (error instanceof ZodError) return c.json({ error: 'VALIDATION_ERROR', message: 'Dados inválidos', fields: error.issues.map((issue) => issue.path.join('.')) }, 400);
  const code = databaseCode(error);
  if (code === '23505') return c.json({ error: 'CONFLICT', message: 'Registro já existente' }, 409);
  if (code === '23503') return c.json({ error: 'NOT_FOUND', message: 'Referência não encontrada' }, 404);
  return c.json({ error: 'INTERNAL_ERROR', message: 'Erro interno' }, 500);
});

function databaseCode(error: unknown): string | undefined {
  let current = error;
  for (let i = 0; i < 3 && current && typeof current === 'object'; i++) {
    if ('code' in current && typeof current.code === 'string') return current.code;
    current = 'cause' in current ? current.cause : undefined;
  }
  return undefined;
}

app.notFound((c) => c.json({ error: 'NOT_FOUND', message: 'Rota não encontrada' }, 404));
app.get('/v1/health', (c) => c.json({ status: 'ok' }));
app.get('/v1/openapi.json', (c) => c.json(openapiSpec));

registerAuthRoutes(app);
registerPatientRoutes(app);
registerFacilityRoutes(app);
registerQueueRoutes(app);
registerDocumentRoutes(app);
registerNotificationRoutes(app);
registerSelfRoutes(app);

export { app };
export default app;
