import type { OpenAPIHono } from '@hono/zod-openapi';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@atende/database';
import { ApiError, audit, guardMutation, principal, type AppEnv, withDb } from '../../core';

export function registerNotificationRoutes(app: OpenAPIHono<AppEnv>): void {
  app.get('/v1/me/notifications', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    const notifications = await db.select({
      id: schema.notifications.id, type: schema.notifications.type, title: schema.notifications.title,
      message: schema.notifications.message, facilityId: schema.notifications.facilityId,
      resourceType: schema.notifications.resourceType, resourceId: schema.notifications.resourceId,
      readAt: schema.notifications.readAt, createdAt: schema.notifications.createdAt,
    }).from(schema.notifications).where(eq(schema.notifications.userId, actor.userId))
      .orderBy(desc(schema.notifications.createdAt)).limit(50);
    await audit(db, actor, 'NOTIFICATIONS_READ', 'notification', null, null, 'PATIENT_SELF_ACCESS');
    return c.json({ notifications });
  }));
  app.post('/v1/me/notifications/:id/read', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db); guardMutation(c, actor);
    const id = z.string().uuid().parse(c.req.param('id'));
    const [notification] = await db.update(schema.notifications).set({ readAt: new Date() }).where(and(
      eq(schema.notifications.id, id), eq(schema.notifications.userId, actor.userId),
    )).returning({ id: schema.notifications.id });
    if (!notification) throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', 'Notificação não encontrada');
    await audit(db, actor, 'NOTIFICATION_READ', 'notification', notification.id, null, 'CARE_REGISTRATION');
    return c.json({ id: notification.id, readAt: new Date().toISOString() });
  }));
}
