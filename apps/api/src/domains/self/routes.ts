import type { OpenAPIHono } from '@hono/zod-openapi';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type Database } from '@atende/database';
import { ApiError, audit, guardMutation, principal, type AppEnv, type Principal, withDb } from '../../core';
import { latestPatientFlow } from './journey';

const uuid = z.string().uuid();
const maxBytes = 10 * 1024 * 1024;

async function ownPatient(db: Database, actor: Principal) {
  const [patient] = await db.select({ id: schema.patients.id, fullName: schema.patients.fullName, birthDate: schema.patients.birthDate })
    .from(schema.patients).where(eq(schema.patients.userId, actor.userId)).limit(1);
  if (!patient) throw new ApiError(404, 'PATIENT_NOT_LINKED', 'Vincule seu cadastro presencial para acessar seus dados de saúde');
  return patient;
}

async function ownHistory(db: Database, patientId: string) {
  return db.select({ id: schema.medicalRecordEntries.id, attendanceId: schema.medicalRecordEntries.attendanceId,
    createdAt: schema.medicalRecordEntries.createdAt, facilityName: schema.healthcareFacilities.name,
    doctorName: schema.users.name, evolution: schema.medicalRecordEntries.evolution,
    diagnosis: schema.medicalRecordEntries.diagnosis, conduct: schema.medicalRecordEntries.conduct,
  }).from(schema.medicalRecordEntries)
    .innerJoin(schema.healthcareFacilities, eq(schema.medicalRecordEntries.facilityId, schema.healthcareFacilities.id))
    .innerJoin(schema.users, eq(schema.medicalRecordEntries.authorId, schema.users.id))
    .where(eq(schema.medicalRecordEntries.patientId, patientId)).orderBy(desc(schema.medicalRecordEntries.createdAt));
}

export function registerSelfRoutes(app: OpenAPIHono<AppEnv>): void {
  app.get('/v1/me/journey', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    const patient = await ownPatient(db, actor);
    const [history, attendances, tickets, referrals, flow] = await Promise.all([
      ownHistory(db, patient.id),
      db.select({ id: schema.attendances.id, facilityName: schema.healthcareFacilities.name,
        startedAt: schema.attendances.startedAt, status: schema.attendances.status })
        .from(schema.attendances).innerJoin(schema.healthcareFacilities, eq(schema.attendances.facilityId, schema.healthcareFacilities.id))
        .where(and(eq(schema.attendances.patientId, patient.id), eq(schema.attendances.status, 'IN_PROGRESS')))
        .orderBy(desc(schema.attendances.startedAt)).limit(10),
      db.select({ id: schema.queueTickets.id, code: schema.queueTickets.code, status: schema.queueTickets.status,
        facilityName: schema.healthcareFacilities.name, issuedAt: schema.queueTickets.issuedAt })
        .from(schema.queueTickets).innerJoin(schema.healthcareFacilities, eq(schema.queueTickets.facilityId, schema.healthcareFacilities.id))
        .where(and(eq(schema.queueTickets.patientId, patient.id), inArray(schema.queueTickets.status, ['WAITING', 'CALLED', 'IN_PROGRESS']),
          inArray(schema.healthcareFacilities.type, ['UBS', 'UPA'])))
        .orderBy(desc(schema.queueTickets.issuedAt)).limit(10),
      db.select({ id: schema.referrals.id, status: schema.referrals.status, reason: schema.referrals.reason,
        createdAt: schema.referrals.createdAt, facilityName: schema.healthcareFacilities.name })
        .from(schema.referrals).innerJoin(schema.healthcareFacilities, eq(schema.referrals.targetFacilityId, schema.healthcareFacilities.id))
        .where(and(eq(schema.referrals.patientId, patient.id), inArray(schema.referrals.status, ['PENDING', 'ASSIGNED', 'ACCEPTED'])))
        .orderBy(desc(schema.referrals.createdAt)).limit(10),
      latestPatientFlow(db, patient.id),
    ]);
    await audit(db, actor, 'PATIENT_JOURNEY_READ', 'patient', patient.id, null, 'PATIENT_SELF_ACCESS');
    return c.json({ patient, history, attendances, tickets, referrals, flow });
  }));

  app.get('/v1/me/reports', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db); const patient = await ownPatient(db, actor);
    const reports = await db.select({ id: schema.patientReports.id, title: schema.patientReports.title,
      description: schema.patientReports.description, fileName: schema.patientReports.fileName,
      mimeType: schema.patientReports.mimeType, fileSize: schema.patientReports.fileSize,
      createdAt: schema.patientReports.createdAt })
      .from(schema.patientReports).where(eq(schema.patientReports.patientId, patient.id))
      .orderBy(desc(schema.patientReports.createdAt));
    await audit(db, actor, 'PATIENT_REPORTS_READ', 'patient', patient.id, null, 'PATIENT_SELF_ACCESS');
    return c.json({ reports });
  }));

  app.post('/v1/me/reports', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db); guardMutation(c, actor); const patient = await ownPatient(db, actor);
    const bucket = c.env.DOCUMENTS;
    if (!bucket) throw new ApiError(503, 'DOCUMENT_STORAGE_UNAVAILABLE', 'Armazenamento de documentos não configurado');
    const length = Number(c.req.header('content-length'));
    if (Number.isFinite(length) && length > maxBytes + 32_768) throw new ApiError(422, 'DOCUMENT_TOO_LARGE', 'O laudo deve ter no máximo 10 MB');
    const form = await c.req.formData();
    const title = z.string().trim().min(3).max(160).parse(form.get('title'));
    const description = z.string().trim().max(2000).optional().parse(form.get('description') || undefined);
    const file = form.get('file');
    if (!(file instanceof File) || file.size < 5 || file.size > maxBytes) throw new ApiError(422, 'INVALID_REPORT', 'Selecione um PDF ou imagem de até 10 MB');
    const bytes = await file.arrayBuffer();
    const header = new Uint8Array(bytes.slice(0, 8));
    const pdf = new TextDecoder().decode(header.slice(0, 5)) === '%PDF-';
    const png = header.slice(0, 8).every((value, index) => value === [137,80,78,71,13,10,26,10][index]);
    const jpg = header[0] === 255 && header[1] === 216 && header[2] === 255;
    const mimeType = pdf ? 'application/pdf' : png ? 'image/png' : jpg ? 'image/jpeg' : null;
    if (!mimeType) throw new ApiError(422, 'INVALID_REPORT_TYPE', 'Envie um PDF, PNG ou JPEG válido');
    const id = crypto.randomUUID();
    const objectKey = `patient-reports/${patient.id}/${id}`;
    const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('');
    const fileName = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || 'laudo';
    await bucket.put(objectKey, bytes, { httpMetadata: { contentType: mimeType } });
    try {
      const [report] = await db.transaction(async (tx) => {
        const rows = await tx.insert(schema.patientReports).values({ id, patientId: patient.id, title, description,
          objectKey, fileName, mimeType, fileSize: file.size, sha256 }).returning({ id: schema.patientReports.id,
          title: schema.patientReports.title, createdAt: schema.patientReports.createdAt });
        await audit(tx, actor, 'PATIENT_REPORT_UPLOADED', 'patient_report', id, null, 'PATIENT_SELF_ACCESS');
        return rows;
      });
      return c.json(report, 201);
    } catch (error) { await bucket.delete(objectKey); throw error; }
  }));

  app.get('/v1/me/reports/:id', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db); const patient = await ownPatient(db, actor);
    const id = uuid.parse(c.req.param('id'));
    const [report] = await db.select().from(schema.patientReports).where(and(
      eq(schema.patientReports.id, id), eq(schema.patientReports.patientId, patient.id))).limit(1);
    if (!report) throw new ApiError(404, 'REPORT_NOT_FOUND', 'Laudo não encontrado');
    const bucket = c.env.DOCUMENTS;
    if (!bucket) throw new ApiError(503, 'DOCUMENT_STORAGE_UNAVAILABLE', 'Armazenamento de documentos não configurado');
    const object = await bucket.get(report.objectKey);
    if (!object) throw new ApiError(404, 'REPORT_NOT_FOUND', 'Arquivo não encontrado');
    await audit(db, actor, 'PATIENT_REPORT_DOWNLOADED', 'patient_report', id, null, 'PATIENT_SELF_ACCESS');
    const safeName = report.fileName.replace(/["\\\r\n]/g, '_').replace(/[^\x20-\x7e]/g, '_');
    return new Response(object.body, { headers: { 'Content-Type': report.mimeType,
      'Content-Disposition': `attachment; filename="${safeName}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }));
}
