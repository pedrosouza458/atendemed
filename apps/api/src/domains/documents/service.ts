import { and, asc, eq } from 'drizzle-orm';
import { schema, type Database } from '@atende/database';
import { ApiError, audit, type Principal } from '../../core';

export async function canAttachDocument(db: Database, facilityId: string, attendanceId: string, doctorId: string) {
  const [attendance] = await db.select({ patientId: schema.attendances.patientId }).from(schema.attendances).where(and(
    eq(schema.attendances.id, attendanceId), eq(schema.attendances.facilityId, facilityId),
    eq(schema.attendances.doctorId, doctorId), eq(schema.attendances.status, 'IN_PROGRESS'),
  )).limit(1);
  if (!attendance) throw new ApiError(404, 'ATTENDANCE_NOT_FOUND', 'Atendimento ativo não encontrado nesta unidade');
  return attendance.patientId;
}

export async function saveAttendanceDocument(db: Database, actor: Principal, facilityId: string, attendanceId: string, input: {
  objectKey: string; fileName: string; fileSize: number; sha256: string;
}) {
  return db.transaction(async (tx) => {
    const [attendance] = await tx.select({ patientId: schema.attendances.patientId }).from(schema.attendances).where(and(
      eq(schema.attendances.id, attendanceId), eq(schema.attendances.facilityId, facilityId),
      eq(schema.attendances.doctorId, actor.userId), eq(schema.attendances.status, 'IN_PROGRESS'),
    )).limit(1).for('update');
    if (!attendance) throw new ApiError(409, 'ATTENDANCE_NOT_ACTIVE', 'O atendimento não está mais ativo para receber anexos');
    const [document] = await tx.insert(schema.medicalDocuments).values({
      attendanceId, patientId: attendance.patientId, facilityId, authorId: actor.userId, ...input,
    }).returning({ id: schema.medicalDocuments.id, fileName: schema.medicalDocuments.fileName,
      fileSize: schema.medicalDocuments.fileSize, createdAt: schema.medicalDocuments.createdAt });
    await audit(tx, actor, 'ATTENDANCE_DOCUMENT_ATTACHED', 'medical_document', document!.id, facilityId, 'CARE');
    return document!;
  });
}

export async function listAttendanceDocuments(db: Database, actor: Principal, facilityId: string, attendanceId: string) {
  const [attendance] = await db.select({ id: schema.attendances.id }).from(schema.attendances).where(and(
    eq(schema.attendances.id, attendanceId), eq(schema.attendances.facilityId, facilityId), eq(schema.attendances.doctorId, actor.userId),
  )).limit(1);
  if (!attendance) throw new ApiError(404, 'ATTENDANCE_NOT_FOUND', 'Atendimento não encontrado nesta unidade');
  return db.select({ id: schema.medicalDocuments.id, fileName: schema.medicalDocuments.fileName,
    fileSize: schema.medicalDocuments.fileSize, createdAt: schema.medicalDocuments.createdAt,
  }).from(schema.medicalDocuments).where(and(eq(schema.medicalDocuments.attendanceId, attendanceId), eq(schema.medicalDocuments.facilityId, facilityId)))
    .orderBy(asc(schema.medicalDocuments.createdAt));
}

export async function getAttendanceDocument(db: Database, actor: Principal, facilityId: string, documentId: string) {
  const [document] = await db.select({ id: schema.medicalDocuments.id, objectKey: schema.medicalDocuments.objectKey,
    fileName: schema.medicalDocuments.fileName, fileSize: schema.medicalDocuments.fileSize,
    attendanceId: schema.medicalDocuments.attendanceId,
  }).from(schema.medicalDocuments).innerJoin(schema.attendances, eq(schema.attendances.id, schema.medicalDocuments.attendanceId)).where(and(
    eq(schema.medicalDocuments.id, documentId), eq(schema.medicalDocuments.facilityId, facilityId),
    eq(schema.attendances.facilityId, facilityId), eq(schema.attendances.doctorId, actor.userId),
  )).limit(1);
  if (!document) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Documento não encontrado neste atendimento');
  return document;
}
