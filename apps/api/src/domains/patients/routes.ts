import type { OpenAPIHono } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@atende/database';
import { ApiError, audit, facilityHeader, guardMutation, limit, membership, principal, type AppEnv, withDb } from '../../core';
import { body } from '../../http';
import { searchPatients } from './repository';
import { challengeInput, consumeChallengeInput, patientInput, patientUpdate } from './schemas';
import { consumeLinkChallenge, createPatient, issueLinkChallenge, updatePatient } from './service';

const uuid = z.string().uuid();
const patientFields = {
  id: schema.patients.id, fullName: schema.patients.fullName, socialName: schema.patients.socialName,
  cpf: schema.patients.cpf, cns: schema.patients.cns, birthDate: schema.patients.birthDate,
  phone: schema.patients.phone, email: schema.patients.email, address: schema.patients.address,
};

export function registerPatientRoutes(app: OpenAPIHono<AppEnv>): void {
  app.get('/v1/patients', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['RECEPTIONIST', 'DOCTOR']);
    await limit(c, 'SEARCH_RATE_LIMIT', `patients:${actor.userId}`);
    const query = z.string().trim().min(3).max(100).optional().parse(c.req.query('query'));
    const results = await searchPatients(db, query, facilityId);
    await audit(db, actor, 'PATIENT_SEARCH', 'patient', null, facilityId, 'CARE_REGISTRATION');
    return c.json({ results });
  }));

  app.post('/v1/patients', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    guardMutation(c, actor);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['RECEPTIONIST', 'DOCTOR']);
    const input = await body(c, patientInput);
    const patient = await createPatient(db, actor, facilityId, input);
    return c.json(patient, 201);
  }));

  app.get('/v1/patients/:id', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    const patientId = uuid.parse(c.req.param('id'));
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['RECEPTIONIST', 'DOCTOR']);
    const [patient] = await db.select(patientFields).from(schema.patients).where(and(
      eq(schema.patients.id, patientId), eq(schema.patients.registeredFacilityId, facilityId),
    )).limit(1);
    if (!patient) throw new ApiError(404, 'NOT_FOUND', 'Paciente não encontrado');
    await audit(db, actor, 'PATIENT_READ', 'patient', patientId, facilityId, 'CARE_ADMINISTRATION');
    return c.json(patient);
  }));

  app.patch('/v1/patients/:id', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    guardMutation(c, actor);
    const patientId = uuid.parse(c.req.param('id'));
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['RECEPTIONIST', 'DOCTOR']);
    const input = await body(c, patientUpdate);
    const patient = await updatePatient(db, actor, facilityId, patientId, input);
    return c.json(patient);
  }));

  app.post('/v1/patients/:id/link-challenges', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    guardMutation(c, actor);
    const patientId = uuid.parse(c.req.param('id'));
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['RECEPTIONIST', 'DOCTOR']);
    await limit(c, 'AUTH_RATE_LIMIT', `issue-link:${actor.userId}`);
    const input = await body(c, challengeInput);
    const result = await issueLinkChallenge(db, actor, facilityId, patientId, input);
    return c.json(result, 201);
  }));

  app.post('/v1/patients/link', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    guardMutation(c, actor);
    await limit(c, 'AUTH_RATE_LIMIT', `consume-link:${actor.userId}`);
    const input = await body(c, consumeChallengeInput);
    const patient = await consumeLinkChallenge(db, actor, input.code);
    return c.json(patient);
  }));

  app.get('/v1/me/patient', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    const [patient] = await db.select(patientFields).from(schema.patients).where(eq(schema.patients.userId, actor.userId)).limit(1);
    if (!patient) throw new ApiError(404, 'NOT_FOUND', 'Nenhum cadastro de paciente vinculado');
    await audit(db, actor, 'PATIENT_SELF_READ', 'patient', patient.id, null, 'PATIENT_SELF_ACCESS');
    return c.json(patient);
  }));
}
