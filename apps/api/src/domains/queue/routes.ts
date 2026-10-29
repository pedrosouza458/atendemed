import type { OpenAPIHono } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';
import { schema } from '@atende/database';
import { z } from 'zod';
import { audit, facilityHeader, guardMutation, membership, principal, type AppEnv, withDb } from '../../core';
import { body } from '../../http';
import { attendanceComplete, attendanceDraft, queueDepartment, queueDisposition, queueIssue, queuePriority, referralAssignInput, referralDispatchInput, referralStatusInput, triageInput } from './schemas';
import { assignReferral, callNext, completeAttendance, dispatchReferral, disposeTicket, getAttendance, getReferral, issueTicket, listIncomingReferrals, listPendingReferralDispatches, listQueue, saveAttendanceDraft, setTicketPriority, startAttendance, startReferralAttendance, updateReferralStatus } from './service';

const uuid = z.string().uuid();
export function registerQueueRoutes(app: OpenAPIHono<AppEnv>): void {
  app.get('/v1/queue-tickets', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['RECEPTIONIST', 'DOCTOR']);
    const department = queueDepartment.parse(c.req.query('department'));
    const [doctorMembership] = await db.select({ id: schema.staffMemberships.id }).from(schema.staffMemberships).where(and(
      eq(schema.staffMemberships.userId, actor.userId), eq(schema.staffMemberships.facilityId, facilityId),
      eq(schema.staffMemberships.role, 'DOCTOR'), eq(schema.staffMemberships.status, 'ACTIVE'),
    )).limit(1);
    const tickets = await listQueue(db, facilityId, department, doctorMembership ? actor.userId : undefined);
    await audit(db, actor, 'QUEUE_READ', 'queue', null, facilityId, 'CARE_REGISTRATION');
    return c.json({ tickets, updatedAt: new Date().toISOString() });
  }));
  app.post('/v1/queue-tickets', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db); guardMutation(c, actor);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['RECEPTIONIST']);
    return c.json(await issueTicket(db, actor, facilityId, await body(c, queueIssue)), 201);
  }));
  app.post('/v1/queue-tickets/call-next', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db); guardMutation(c, actor);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['RECEPTIONIST']);
    const department = queueDepartment.parse(c.req.query('department'));
    return c.json(await callNext(db, actor, facilityId, department));
  }));
  app.post('/v1/queue-tickets/:id/disposition', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db); guardMutation(c, actor);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['RECEPTIONIST']);
    const ticketId = uuid.parse(c.req.param('id'));
    await disposeTicket(db, actor, facilityId, ticketId, (await body(c, queueDisposition)).status);
    return c.json({ id: ticketId, ok: true });
  }));
  app.post('/v1/queue-tickets/:id/priority', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db); guardMutation(c, actor);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['DOCTOR']);
    const result = await setTicketPriority(db, actor, facilityId, uuid.parse(c.req.param('id')), await body(c, queuePriority));
    return c.json(result);
  }));
  app.post('/v1/queue-tickets/:id/triage', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db); guardMutation(c, actor);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['DOCTOR']);
    return c.json(await startAttendance(db, actor, facilityId, uuid.parse(c.req.param('id')), await body(c, triageInput)), 201);
  }));
  app.get('/v1/attendances/:id', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['DOCTOR']);
    const attendance = await getAttendance(db, facilityId, uuid.parse(c.req.param('id')), actor.userId);
    await audit(db, actor, 'ATTENDANCE_READ', 'attendance', attendance.id, facilityId, 'CARE');
    return c.json(attendance);
  }));
  app.put('/v1/attendances/:id/draft', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db); guardMutation(c, actor);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['DOCTOR']);
    return c.json(await saveAttendanceDraft(db, actor, facilityId, uuid.parse(c.req.param('id')), await body(c, attendanceDraft)));
  }));
  app.post('/v1/attendances/:id/complete', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db); guardMutation(c, actor);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['DOCTOR']);
    const result = await completeAttendance(db, actor, facilityId, uuid.parse(c.req.param('id')), await body(c, attendanceComplete));
    return c.json(result);
  }));
  app.get('/v1/referrals/to-send', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['RECEPTIONIST']);
    const referrals = await listPendingReferralDispatches(db, facilityId);
    await audit(db, actor, 'REFERRAL_DISPATCH_QUEUE_READ', 'attendance', null, facilityId, 'CARE_REGISTRATION');
    return c.json({ referrals });
  }));
  app.post('/v1/attendances/:id/referral', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db); guardMutation(c, actor);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['RECEPTIONIST']);
    const input = await body(c, referralDispatchInput);
    return c.json(await dispatchReferral(db, actor, facilityId, uuid.parse(c.req.param('id')), input), 201);
  }));
  app.get('/v1/referrals/incoming', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['DOCTOR', 'RECEPTIONIST']);
    const roles = await db.select({ role: schema.staffMemberships.role }).from(schema.staffMemberships).where(and(
      eq(schema.staffMemberships.userId, actor.userId), eq(schema.staffMemberships.facilityId, facilityId), eq(schema.staffMemberships.status, 'ACTIVE'),
    ));
    const receptionist = roles.some((item) => item.role === 'RECEPTIONIST');
    const referrals = await listIncomingReferrals(db, facilityId, actor.userId, receptionist);
    await audit(db, actor, 'REFERRALS_INCOMING_READ', 'referral', null, facilityId, 'CARE');
    return c.json({ referrals });
  }));
  app.get('/v1/referrals/:id', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['DOCTOR']);
    const referral = await getReferral(db, facilityId, actor.userId, uuid.parse(c.req.param('id')));
    await audit(db, actor, 'REFERRAL_READ', 'referral', referral.id, facilityId, 'CARE');
    return c.json(referral);
  }));
  app.post('/v1/referrals/:id/status', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db); guardMutation(c, actor);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['DOCTOR']);
    const { status } = await body(c, referralStatusInput);
    return c.json(await updateReferralStatus(db, actor, facilityId, actor.userId, uuid.parse(c.req.param('id')), status));
  }));
  app.post('/v1/referrals/:id/start', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db); guardMutation(c, actor);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['DOCTOR']);
    const result = await startReferralAttendance(db, actor, facilityId, actor.userId, uuid.parse(c.req.param('id')));
    return c.json(result, result.created ? 201 : 200);
  }));
  app.post('/v1/referrals/:id/assign', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db); guardMutation(c, actor);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['RECEPTIONIST']);
    const input = await body(c, referralAssignInput);
    return c.json(await assignReferral(db, actor, facilityId, uuid.parse(c.req.param('id')), input.doctorId));
  }));
}
