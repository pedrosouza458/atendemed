import type { OpenAPIHono } from '@hono/zod-openapi';
import { audit, facilityHeader, guardMutation, membership, principal, type AppEnv, withDb, ApiError } from '../../core';
import { getAttendanceDocument, canAttachDocument, listAttendanceDocuments, saveAttendanceDocument } from './service';

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const maxPdfBytes = 10 * 1024 * 1024;

export function registerDocumentRoutes(app: OpenAPIHono<AppEnv>): void {
  app.get('/v1/attendances/:id/documents', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['DOCTOR']);
    const attendanceId = c.req.param('id');
    if (!uuid.test(attendanceId)) throw new ApiError(400, 'INVALID_ID', 'Identificador de atendimento inválido');
    const documents = await listAttendanceDocuments(db, actor, facilityId, attendanceId);
    await audit(db, actor, 'ATTENDANCE_DOCUMENTS_READ', 'attendance', attendanceId, facilityId, 'CARE');
    return c.json({ documents });
  }));

  app.post('/v1/attendances/:id/documents', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    guardMutation(c, actor);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['DOCTOR']);
    const attendanceId = c.req.param('id');
    if (!uuid.test(attendanceId)) throw new ApiError(400, 'INVALID_ID', 'Identificador de atendimento inválido');
    const bucket = c.env.DOCUMENTS;
    if (!bucket) throw new ApiError(503, 'DOCUMENT_STORAGE_UNAVAILABLE', 'Armazenamento de documentos não configurado');
    const contentLength = Number(c.req.header('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxPdfBytes + 32_768) throw new ApiError(422, 'DOCUMENT_TOO_LARGE', 'O PDF deve ter no máximo 10 MB');
    const file = (await c.req.formData()).get('file');
    if (!(file instanceof File)) throw new ApiError(400, 'DOCUMENT_REQUIRED', 'Selecione um arquivo PDF');
    if (file.size < 5 || file.size > maxPdfBytes) throw new ApiError(422, 'DOCUMENT_TOO_LARGE', 'O PDF deve ter entre 1 byte e 10 MB');
    if (file.type && file.type !== 'application/pdf') throw new ApiError(422, 'INVALID_DOCUMENT_TYPE', 'Somente arquivos PDF são aceitos');
    const bytes = await file.arrayBuffer();
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new ApiError(422, 'INVALID_DOCUMENT_TYPE', 'O conteúdo enviado não é um PDF válido');
    await canAttachDocument(db, facilityId, attendanceId, actor.userId);
    const id = crypto.randomUUID();
    const objectKey = `${facilityId}/${attendanceId}/${id}.pdf`;
    const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('');
    const fileName = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || 'documento.pdf';
    await bucket.put(objectKey, bytes, { httpMetadata: { contentType: 'application/pdf' } });
    try {
      const document = await saveAttendanceDocument(db, actor, facilityId, attendanceId, { objectKey, fileName, fileSize: file.size, sha256 });
      return c.json(document, 201);
    } catch (error) {
      await bucket.delete(objectKey);
      throw error;
    }
  }));

  app.get('/v1/attendance-documents/:id', async (c) => withDb(c, async (db) => {
    const actor = await principal(c, db);
    const facilityId = facilityHeader(c);
    await membership(db, actor, facilityId, ['DOCTOR']);
    const documentId = c.req.param('id');
    if (!uuid.test(documentId)) throw new ApiError(400, 'INVALID_ID', 'Identificador de documento inválido');
    const bucket = c.env.DOCUMENTS;
    if (!bucket) throw new ApiError(503, 'DOCUMENT_STORAGE_UNAVAILABLE', 'Armazenamento de documentos não configurado');
    const document = await getAttendanceDocument(db, actor, facilityId, documentId);
    const object = await bucket.get(document.objectKey);
    if (!object) throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'Arquivo não encontrado');
    await audit(db, actor, 'ATTENDANCE_DOCUMENT_READ', 'medical_document', document.id, facilityId, 'CARE');
    const safeName = document.fileName.replace(/["\\\r\n]/g, '_').replace(/[^\x20-\x7e]/g, '_');
    return new Response(object.body, { headers: {
      'Content-Type': 'application/pdf', 'Content-Length': String(document.fileSize),
      'Content-Disposition': `attachment; filename="${safeName}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  }));
}
