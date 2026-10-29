import type { Context } from 'hono';
import type { z } from 'zod';
import type { AppEnv } from './core';
import { ApiError, allowedBrowserOrigin } from './core';

export async function body<T extends z.ZodTypeAny>(c: Context<AppEnv>, schema: T): Promise<z.infer<T>> {
  const size = Number(c.req.header('Content-Length') ?? 0);
  if (size > 16_384) throw new ApiError(400, 'BODY_TOO_LARGE', 'Requisição muito grande');
  const raw = await c.req.text();
  if (raw.length > 16_384) throw new ApiError(400, 'BODY_TOO_LARGE', 'Requisição muito grande');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new ApiError(400, 'INVALID_JSON', 'JSON inválido'); }
  return schema.parse(value);
}

export function browserMutation(c: Context<AppEnv>): void {
  const origin = c.req.header('Origin');
  if (origin && (!allowedBrowserOrigin(c.env, origin) || c.req.header('X-Atende-Request') !== '1')) {
    throw new ApiError(403, 'CSRF_REJECTED', 'Origem da requisição não autorizada');
  }
}
