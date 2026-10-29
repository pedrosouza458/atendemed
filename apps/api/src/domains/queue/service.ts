import { and, asc, desc, eq, isNull, notExists, or, sql, inArray } from 'drizzle-orm';
import { schema, type Database, type Transaction } from '@atende/database';
import type { Principal } from '../../core';
import { ApiError, audit } from '../../core';
import type { z } from 'zod';
import { attendanceDraft } from './schemas';
import type { attendanceComplete, queueIssue, queuePriority, referralDispatchInput, triageInput } from './schemas';

type Issue = z.infer<typeof queueIssue>;
type Triage = z.infer<typeof triageInput>;
type Completion = z.infer<typeof attendanceComplete>;
type Draft = z.infer<typeof attendanceDraft>;
type ReferralDispatch = z.infer<typeof referralDispatchInput>;
type Priority = z.infer<typeof queuePriority>;

const dateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export async function issueTicket(db: Database, actor: Principal, facilityId: string, input: Issue) {
  return db.transaction((tx) => issueTicketInTransaction(tx, actor, facilityId, input));
}

export async function issueTicketInTransaction(tx: Transaction, actor: Principal, facilityId: string, input: Issue, patientLocatedByCpf = false) {
    const [patient] = await tx.select({ id: schema.patients.id }).from(schema.patients)
      .where(and(eq(schema.patients.id, input.patientId),
        ...(patientLocatedByCpf ? [] : [eq(schema.patients.registeredFacilityId, facilityId)]))).limit(1);
    if (!patient) throw new ApiError(404, 'PATIENT_NOT_FOUND', 'Paciente não encontrado nesta unidade');
    if (input.doctorId) {
      const [doctor] = await tx.select({ id: schema.users.id }).from(schema.users)
        .innerJoin(schema.doctors, eq(schema.doctors.userId, schema.users.id))
        .innerJoin(schema.staffMemberships, eq(schema.staffMemberships.userId, schema.users.id))
        .where(and(eq(schema.users.id, input.doctorId), eq(schema.users.status, 'ACTIVE'),
          eq(schema.doctors.verificationStatus, 'VERIFIED'), eq(schema.staffMemberships.facilityId, facilityId),
          eq(schema.staffMemberships.role, 'DOCTOR'), eq(schema.staffMemberships.status, 'ACTIVE'))).limit(1);
      if (!doctor) throw new ApiError(422, 'DOCTOR_UNAVAILABLE', 'Médico não está ativo e habilitado nesta unidade');
    }
    const ticketDate = dateKey();
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${facilityId}), hashtext(${ticketDate + input.department}))`);
    const [count] = await tx.select({ value: sql<number>`count(*)::int` }).from(schema.queueTickets).where(and(
      eq(schema.queueTickets.facilityId, facilityId), eq(schema.queueTickets.department, input.department), eq(schema.queueTickets.ticketDate, ticketDate),
    ));
    const code = String((count?.value ?? 0) + 1).padStart(3, '0');
    const [ticket] = await tx.insert(schema.queueTickets).values({
      facilityId, patientId: patient.id, assignedDoctorId: input.doctorId ?? null, department: input.department, ticketDate, code, createdBy: actor.userId,
    }).returning();
    await audit(tx, actor, 'QUEUE_TICKET_ISSUED', 'queue_ticket', ticket!.id, facilityId, 'CARE_REGISTRATION');
    return ticket!;
}

export async function listQueue(db: Database, facilityId: string, department?: string, doctorId?: string) {
  return db.select({
    id: schema.queueTickets.id, patientId: schema.patients.id, fullName: schema.patients.fullName,
    assignedDoctorId: schema.queueTickets.assignedDoctorId, assignedDoctorName: schema.users.name,
    attendanceId: schema.attendances.id,
    code: schema.queueTickets.code, department: schema.queueTickets.department, status: schema.queueTickets.status,
    priority: schema.queueTickets.priority, priorityReason: schema.queueTickets.priorityReason,
    issuedAt: schema.queueTickets.issuedAt, calledAt: schema.queueTickets.calledAt,
  }).from(schema.queueTickets).innerJoin(schema.patients, eq(schema.queueTickets.patientId, schema.patients.id)).where(and(
    eq(schema.queueTickets.facilityId, facilityId), eq(schema.queueTickets.ticketDate, dateKey()),
    ...(department ? [eq(schema.queueTickets.department, department)] : []),
    ...(doctorId ? [or(isNull(schema.queueTickets.assignedDoctorId), eq(schema.queueTickets.assignedDoctorId, doctorId))!] : []),
  )).leftJoin(schema.attendances, eq(schema.attendances.queueTicketId, schema.queueTickets.id))
    .leftJoin(schema.users, eq(schema.users.id, schema.queueTickets.assignedDoctorId))
    .orderBy(desc(schema.queueTickets.priority), asc(schema.queueTickets.issuedAt));
}

export async function callNext(db: Database, actor: Principal, facilityId: string, department?: string) {
  return db.transaction(async (tx) => {
    const [ticket] = await tx.select().from(schema.queueTickets).where(and(
      eq(schema.queueTickets.facilityId, facilityId), eq(schema.queueTickets.ticketDate, dateKey()),
      eq(schema.queueTickets.status, 'WAITING'), ...(department ? [eq(schema.queueTickets.department, department)] : []),
    )).orderBy(desc(schema.queueTickets.priority), asc(schema.queueTickets.issuedAt)).limit(1).for('update', { skipLocked: true });
    if (!ticket) throw new ApiError(409, 'QUEUE_EMPTY', 'Não há senhas aguardando');
    const [updated] = await tx.update(schema.queueTickets).set({ status: 'CALLED', calledAt: new Date() }).where(and(
      eq(schema.queueTickets.id, ticket.id), eq(schema.queueTickets.status, 'WAITING'),
    )).returning();
    if (!updated) throw new ApiError(409, 'QUEUE_CHANGED', 'A fila mudou; tente novamente');
    await audit(tx, actor, 'QUEUE_TICKET_CALLED', 'queue_ticket', ticket.id, facilityId, 'CARE_REGISTRATION');
    return updated;
  });
}

export async function disposeTicket(db: Database, actor: Principal, facilityId: string, ticketId: string, status: 'CANCELLED' | 'NO_SHOW') {
  return db.transaction(async (tx) => {
    const [ticket] = await tx.update(schema.queueTickets).set({ status, completedAt: new Date() }).where(and(
      eq(schema.queueTickets.id, ticketId), eq(schema.queueTickets.facilityId, facilityId), eq(schema.queueTickets.status, 'WAITING'),
    )).returning({ id: schema.queueTickets.id });
    if (!ticket) throw new ApiError(409, 'INVALID_QUEUE_TRANSITION', 'Apenas senha aguardando pode ser cancelada ou marcada como ausência');
    await audit(tx, actor, status === 'NO_SHOW' ? 'QUEUE_TICKET_NO_SHOW' : 'QUEUE_TICKET_CANCELLED', 'queue_ticket', ticket.id, facilityId, 'CARE_REGISTRATION');
  });
}

export async function setTicketPriority(db: Database, actor: Principal, facilityId: string, ticketId: string, input: Priority) {
  return db.transaction(async (tx) => {
    const [facility] = await tx.select({ type: schema.healthcareFacilities.type }).from(schema.healthcareFacilities).where(eq(schema.healthcareFacilities.id, facilityId)).limit(1);
    if (facility?.type !== 'UPA') throw new ApiError(422, 'PRIORITY_ONLY_UPA', 'A prioridade clínica da fila é exclusiva do fluxo da UPA');
    const [ticket] = await tx.update(schema.queueTickets).set({ priority: input.priority, priorityReason: input.priorityReason })
      .where(and(eq(schema.queueTickets.id, ticketId), eq(schema.queueTickets.facilityId, facilityId), eq(schema.queueTickets.status, 'WAITING')))
      .returning({ id: schema.queueTickets.id });
    if (!ticket) throw new ApiError(409, 'INVALID_QUEUE_TRANSITION', 'Somente senhas aguardando podem receber prioridade');
    await audit(tx, actor, 'QUEUE_PRIORITY_SET', 'queue_ticket', ticket.id, facilityId, 'CLINICAL_TRIAGE');
    return { id: ticket.id, priority: input.priority, priorityReason: input.priorityReason };
  });
}

export async function startAttendance(db: Database, actor: Principal, facilityId: string, ticketId: string, input: Triage) {
  return db.transaction(async (tx) => {
    const { draft, ...triage } = input;
    const [facility] = await tx.select({ type: schema.healthcareFacilities.type }).from(schema.healthcareFacilities).where(eq(schema.healthcareFacilities.id, facilityId)).limit(1);
    if (input.priority > 0 && facility?.type !== 'UPA') throw new ApiError(422, 'PRIORITY_ONLY_UPA', 'A prioridade clínica da fila é exclusiva do fluxo da UPA');
    const [ticket] = await tx.select().from(schema.queueTickets).where(and(
      eq(schema.queueTickets.id, ticketId), eq(schema.queueTickets.facilityId, facilityId),
    )).limit(1).for('update');
    if (!ticket || ticket.status !== 'CALLED') throw new ApiError(409, 'INVALID_QUEUE_TRANSITION', 'A senha precisa estar chamada para iniciar o atendimento');
    if (ticket.assignedDoctorId && ticket.assignedDoctorId !== actor.userId) throw new ApiError(403, 'WRONG_ASSIGNED_DOCTOR', 'Esta senha está atribuída a outro médico');
    const [attendance] = await tx.insert(schema.attendances).values({ queueTicketId: ticket.id, patientId: ticket.patientId, facilityId, doctorId: actor.userId, draft }).returning();
    await tx.insert(schema.triageRecords).values({ attendanceId: attendance!.id, doctorId: actor.userId, ...triage });
    await tx.update(schema.queueTickets).set({ status: 'IN_PROGRESS', priority: triage.priority, priorityReason: triage.priorityReason }).where(eq(schema.queueTickets.id, ticket.id));
    await audit(tx, actor, 'ATTENDANCE_STARTED', 'attendance', attendance!.id, facilityId, 'CARE');
    return attendance!;
  });
}

export async function completeAttendance(db: Database, actor: Principal, facilityId: string, attendanceId: string, input: Completion) {
  return db.transaction(async (tx) => {
    const [attendance] = await tx.select().from(schema.attendances).where(and(
      eq(schema.attendances.id, attendanceId), eq(schema.attendances.facilityId, facilityId), eq(schema.attendances.doctorId, actor.userId),
    )).limit(1).for('update');
    if (!attendance || attendance.status !== 'IN_PROGRESS') throw new ApiError(409, 'INVALID_ATTENDANCE_TRANSITION', 'Atendimento ativo não encontrado');
    if (input.disposition === 'REFERRAL' && (!input.referralUrgency || input.referralReason.trim().length < 3)) {
      throw new ApiError(422, 'REFERRAL_INDICATION_REQUIRED', 'Informe a prioridade e a indicação clínica do encaminhamento');
    }
    const actionLabels: Record<string, string> = { ORIENTATION: 'Orientação', EXAM: 'Exame solicitado', PROCEDURE: 'Procedimento', REFERRAL: 'Encaminhamento' };
    const dispositionLabels: Record<string, string> = { DISCHARGE: 'Alta com orientações', RETURN: 'Retorno programado', REFERRAL: 'Encaminhamento', OBSERVATION: 'Observação' };
    const evolution = [input.subjective && `Motivo e evolução:\n${input.subjective}`, input.objective && `Achados objetivos:\n${input.objective}`, Object.keys(input.vitals).length && `Sinais vitais:\n${Object.entries(input.vitals).filter(([, value]) => value != null && value !== '').map(([key, value]) => `${key}: ${value}`).join(' · ')}`, input.painScore !== null && `Dor: ${input.painScore}/10${input.painLocation ? ` · ${input.painLocation}` : ''}`].filter(Boolean).join('\n\n');
    const diagnosis = [input.assessment, input.diagnosis && `Hipótese/diagnóstico: ${input.diagnosis}`].filter(Boolean).join('\n\n');
    const conduct = [input.actions.length && `Ações: ${input.actions.map((action) => actionLabels[action]).join(', ')}`, input.plan && `Plano e orientações:\n${input.plan}`, input.disposition && `Desfecho: ${dispositionLabels[input.disposition]}`, input.followUp && `Acompanhamento:\n${input.followUp}`].filter(Boolean).join('\n\n');
    const [record] = await tx.insert(schema.medicalRecordEntries).values({
      attendanceId, patientId: attendance.patientId, facilityId, authorId: actor.userId,
      evolution: evolution || 'Evolução não informada.', diagnosis: diagnosis || null, conduct: conduct || null,
    }).returning({ id: schema.medicalRecordEntries.id });
    await tx.update(schema.attendances).set({ status: 'COMPLETED', draft: input, completedAt: new Date(), updatedAt: new Date() }).where(eq(schema.attendances.id, attendanceId));
    if (attendance.queueTicketId) await tx.update(schema.queueTickets).set({ status: 'COMPLETED', completedAt: new Date() }).where(eq(schema.queueTickets.id, attendance.queueTicketId));
    if (!attendance.queueTicketId) {
      const [referral] = await tx.update(schema.referrals).set({ status: 'COMPLETED', completedAt: new Date(), updatedAt: new Date() }).where(and(
        eq(schema.referrals.targetAttendanceId, attendanceId), eq(schema.referrals.targetFacilityId, facilityId),
        eq(schema.referrals.targetDoctorId, actor.userId), eq(schema.referrals.status, 'ACCEPTED'),
      )).returning({ id: schema.referrals.id });
      if (!referral) throw new ApiError(409, 'REFERRAL_NOT_ACTIVE', 'O encaminhamento não está mais em atendimento');
      await audit(tx, actor, 'REFERRAL_COMPLETED', 'referral', referral.id, facilityId, 'CARE');
    }
    await audit(tx, actor, 'ATTENDANCE_COMPLETED', 'attendance', attendanceId, facilityId, 'CARE');
    return { attendanceId, recordId: record!.id, referralPendingDispatch: input.disposition === 'REFERRAL', status: 'COMPLETED' as const };
  });
}

export async function listPendingReferralDispatches(db: Database, facilityId: string) {
  const existingReferral = db.select({ id: schema.referrals.id }).from(schema.referrals)
    .where(eq(schema.referrals.attendanceId, schema.attendances.id)).limit(1);
  return db.select({
    attendanceId: schema.attendances.id, patientName: schema.patients.fullName, ticketCode: schema.queueTickets.code,
    doctorName: schema.users.name, urgency: sql<string>`${schema.attendances.draft}->>'referralUrgency'`,
    reason: sql<string>`${schema.attendances.draft}->>'referralReason'`, completedAt: schema.attendances.completedAt,
  }).from(schema.attendances).innerJoin(schema.patients, eq(schema.patients.id, schema.attendances.patientId))
    .leftJoin(schema.queueTickets, eq(schema.queueTickets.id, schema.attendances.queueTicketId))
    .innerJoin(schema.users, eq(schema.users.id, schema.attendances.doctorId))
    .where(and(eq(schema.attendances.facilityId, facilityId), eq(schema.attendances.status, 'COMPLETED'),
      sql`${schema.attendances.draft}->>'disposition' = 'REFERRAL'`, notExists(existingReferral)))
    .orderBy(desc(schema.attendances.completedAt)).limit(100);
}

export async function dispatchReferral(db: Database, actor: Principal, facilityId: string, attendanceId: string, input: ReferralDispatch) {
  return db.transaction(async (tx) => {
    const [attendance] = await tx.select().from(schema.attendances).where(and(
      eq(schema.attendances.id, attendanceId), eq(schema.attendances.facilityId, facilityId),
    )).limit(1).for('update');
    if (!attendance || attendance.status !== 'COMPLETED') throw new ApiError(404, 'ATTENDANCE_NOT_FOUND', 'Atendimento concluído não encontrado nesta unidade');
    const draft = attendanceDraft.parse(attendance.draft);
    if (draft.disposition !== 'REFERRAL' || !draft.referralUrgency || draft.referralReason.trim().length < 3) {
      throw new ApiError(409, 'REFERRAL_NOT_INDICATED', 'Este atendimento não possui indicação médica de encaminhamento');
    }
    const [existingReferral] = await tx.select({ id: schema.referrals.id }).from(schema.referrals)
      .where(eq(schema.referrals.attendanceId, attendanceId)).limit(1);
    if (existingReferral) throw new ApiError(409, 'REFERRAL_ALREADY_SENT', 'Este encaminhamento já foi enviado');
    const [target] = await tx.select({ id: schema.healthcareFacilities.id }).from(schema.healthcareFacilities).where(and(
      eq(schema.healthcareFacilities.id, input.targetFacilityId), eq(schema.healthcareFacilities.active, true),
    )).limit(1);
    if (!target || target.id === facilityId) throw new ApiError(422, 'INVALID_REFERRAL_TARGET', 'Selecione outra unidade ativa como destino');
    const [context] = await tx.select({ patient: schema.patients, sourceName: schema.healthcareFacilities.name,
      doctorName: schema.users.name, crm: schema.doctors.crm })
      .from(schema.patients).innerJoin(schema.healthcareFacilities, eq(schema.healthcareFacilities.id, facilityId))
      .innerJoin(schema.users, eq(schema.users.id, attendance.doctorId)).leftJoin(schema.doctors, eq(schema.doctors.userId, attendance.doctorId))
      .where(eq(schema.patients.id, attendance.patientId)).limit(1);
    const [record] = await tx.select({ id: schema.medicalRecordEntries.id }).from(schema.medicalRecordEntries)
      .where(eq(schema.medicalRecordEntries.attendanceId, attendanceId)).limit(1);
    if (!context || !record) throw new ApiError(409, 'ATTENDANCE_RECORD_NOT_FOUND', 'O prontuário deste atendimento não está disponível');
    const [triage] = await tx.select({ vitals: schema.triageRecords.vitals }).from(schema.triageRecords)
      .where(eq(schema.triageRecords.attendanceId, attendanceId)).limit(1);
    const p = context.patient;
    const [referral] = await tx.insert(schema.referrals).values({
      attendanceId, patientId: p.id, sourceFacilityId: facilityId, targetFacilityId: input.targetFacilityId, authorId: attendance.doctorId,
      reason: draft.referralReason, urgency: draft.referralUrgency, message: input.message || null,
      patientSnapshot: { fullName: p.fullName, socialName: p.socialName, birthDate: p.birthDate, cpf: p.cpf, cns: p.cns, phone: p.phone, email: p.email, address: p.address },
      encounterSnapshot: { recordId: record.id, attendedAt: attendance.completedAt?.toISOString(), sourceFacility: context.sourceName,
        author: context.doctorName, crm: context.crm, subjective: draft.subjective, objective: draft.objective,
        vitals: { ...(triage?.vitals ?? {}), ...draft.vitals }, painLocation: draft.painLocation, painScore: draft.painScore, assessment: draft.assessment,
        diagnosis: draft.diagnosis, actions: draft.actions, plan: draft.plan, disposition: draft.disposition, followUp: draft.followUp,
        referralReason: draft.referralReason, referralUrgency: draft.referralUrgency, referralMessage: input.message },
    }).returning({ id: schema.referrals.id });
    await audit(tx, actor, 'REFERRAL_SENT', 'referral', referral!.id, input.targetFacilityId, 'CARE_REGISTRATION');
    return { id: referral!.id, attendanceId, targetFacilityId: input.targetFacilityId, status: 'PENDING' as const };
  });
}

export async function listIncomingReferrals(db: Database, facilityId: string, actorId: string, receptionist: boolean) {
  const referrals = await db.select({ id: schema.referrals.id, reason: schema.referrals.reason, urgency: schema.referrals.urgency,
    status: schema.referrals.status, createdAt: schema.referrals.createdAt,
    patientName: sql<string>`${schema.referrals.patientSnapshot}->>'fullName'`,
    sourceFacilityName: schema.healthcareFacilities.name,
    attendanceId: schema.attendances.id, attendanceStatus: schema.attendances.status,
  }).from(schema.referrals).innerJoin(schema.healthcareFacilities, eq(schema.healthcareFacilities.id, schema.referrals.sourceFacilityId))
    .leftJoin(schema.attendances, eq(schema.referrals.targetAttendanceId, schema.attendances.id))
    .where(and(eq(schema.referrals.targetFacilityId, facilityId), receptionist
      ? and(isNull(schema.referrals.targetDoctorId), eq(schema.referrals.status, 'PENDING'))
      : and(eq(schema.referrals.targetDoctorId, actorId), inArray(schema.referrals.status, ['ASSIGNED', 'ACCEPTED']))))
    .orderBy(desc(schema.referrals.createdAt)).limit(100);
  return referrals;
}

export async function getReferral(db: Database, facilityId: string, doctorId: string, referralId: string) {
  const [referral] = await db.select({ id: schema.referrals.id, status: schema.referrals.status, reason: schema.referrals.reason,
    urgency: schema.referrals.urgency, message: schema.referrals.message, patient: schema.referrals.patientSnapshot,
    encounter: schema.referrals.encounterSnapshot, sourceFacilityName: schema.healthcareFacilities.name,
    createdAt: schema.referrals.createdAt, receivedAt: schema.referrals.receivedAt,
  }).from(schema.referrals).innerJoin(schema.healthcareFacilities, eq(schema.healthcareFacilities.id, schema.referrals.sourceFacilityId))
    .where(and(eq(schema.referrals.id, referralId), eq(schema.referrals.targetFacilityId, facilityId), eq(schema.referrals.targetDoctorId, doctorId))).limit(1);
  if (!referral) throw new ApiError(404, 'REFERRAL_NOT_FOUND', 'Encaminhamento não encontrado nesta unidade');
  return referral;
}

export async function assignReferral(db: Database, actor: Principal, facilityId: string, referralId: string, doctorId: string) {
  return db.transaction(async (tx) => {
    const [doctor] = await tx.select({ id: schema.users.id }).from(schema.users)
      .innerJoin(schema.doctors, eq(schema.doctors.userId, schema.users.id))
      .innerJoin(schema.staffMemberships, eq(schema.staffMemberships.userId, schema.users.id)).where(and(
        eq(schema.users.id, doctorId), eq(schema.users.status, 'ACTIVE'), eq(schema.doctors.verificationStatus, 'VERIFIED'),
        eq(schema.staffMemberships.facilityId, facilityId), eq(schema.staffMemberships.role, 'DOCTOR'), eq(schema.staffMemberships.status, 'ACTIVE'),
      )).limit(1);
    if (!doctor) throw new ApiError(422, 'DOCTOR_UNAVAILABLE', 'Médico não está ativo e habilitado nesta unidade');
    const [referral] = await tx.update(schema.referrals).set({ targetDoctorId: doctorId, status: 'ASSIGNED', updatedAt: new Date() }).where(and(
      eq(schema.referrals.id, referralId), eq(schema.referrals.targetFacilityId, facilityId), eq(schema.referrals.status, 'PENDING'), isNull(schema.referrals.targetDoctorId),
    )).returning({ id: schema.referrals.id });
    if (!referral) throw new ApiError(409, 'INVALID_REFERRAL_TRANSITION', 'Encaminhamento não está mais aguardando atribuição');
    const [referralInfo] = await tx.select({ patientSnapshot: schema.referrals.patientSnapshot, urgency: schema.referrals.urgency })
      .from(schema.referrals).where(eq(schema.referrals.id, referralId)).limit(1);
    const patientName = String(referralInfo?.patientSnapshot.fullName ?? 'Paciente');
    const urgencyLabel: Record<string, string> = { ROUTINE: 'Programado', PRIORITY: 'Prioritário', URGENT: 'Urgente' };
    await tx.insert(schema.notifications).values({ userId: doctorId, facilityId, type: 'REFERRAL_ASSIGNED',
      title: `Encaminhamento recebido: ${patientName}`, message: `Prioridade ${urgencyLabel[referralInfo?.urgency ?? ''] ?? referralInfo?.urgency ?? 'não informada'}. Toque para abrir o atendimento.`,
      resourceType: 'referral', resourceId: referralId });
    await audit(tx, actor, 'REFERRAL_ASSIGNED', 'referral', referralId, facilityId, 'CARE_REGISTRATION');
    return { id: referralId, doctorId, status: 'ASSIGNED' as const };
  });
}

export async function updateReferralStatus(db: Database, actor: Principal, facilityId: string, doctorId: string, referralId: string, status: 'ACCEPTED' | 'DECLINED') {
  return db.transaction(async (tx) => {
    const [referral] = await tx.update(schema.referrals).set({ status, receivedAt: status === 'ACCEPTED' ? new Date() : undefined, updatedAt: new Date() }).where(and(
      eq(schema.referrals.id, referralId), eq(schema.referrals.targetFacilityId, facilityId), eq(schema.referrals.targetDoctorId, doctorId), eq(schema.referrals.status, 'ASSIGNED'),
    )).returning({ id: schema.referrals.id });
    if (!referral) throw new ApiError(409, 'INVALID_REFERRAL_TRANSITION', 'Este encaminhamento não está mais pendente');
    await audit(tx, actor, `REFERRAL_${status}`, 'referral', referralId, facilityId, 'CARE');
    return { id: referralId, status };
  });
}

export async function startReferralAttendance(db: Database, actor: Principal, facilityId: string, doctorId: string, referralId: string) {
  return db.transaction(async (tx) => {
    const [referral] = await tx.select().from(schema.referrals).where(and(
      eq(schema.referrals.id, referralId), eq(schema.referrals.targetFacilityId, facilityId),
      eq(schema.referrals.targetDoctorId, doctorId), eq(schema.referrals.status, 'ACCEPTED'),
    )).limit(1).for('update');
    if (!referral) throw new ApiError(409, 'REFERRAL_NOT_ACCEPTED', 'Receba o encaminhamento antes de iniciar o atendimento');
    const [existing] = referral.targetAttendanceId ? await tx.select({ id: schema.attendances.id, status: schema.attendances.status }).from(schema.attendances)
      .where(eq(schema.attendances.id, referral.targetAttendanceId)).limit(1) : [];
    if (existing) {
      if (existing.status !== 'IN_PROGRESS') throw new ApiError(409, 'REFERRAL_ALREADY_COMPLETED', 'Este atendimento já foi concluído');
      return { id: existing.id, referralId, created: false as const };
    }
    const [attendance] = await tx.insert(schema.attendances).values({
      queueTicketId: null, patientId: referral.patientId, facilityId, doctorId,
      draft: attendanceDraft.parse({}),
    }).returning({ id: schema.attendances.id });
    await tx.update(schema.referrals).set({ targetAttendanceId: attendance!.id, updatedAt: new Date() }).where(eq(schema.referrals.id, referralId));
    await audit(tx, actor, 'REFERRAL_ATTENDANCE_STARTED', 'attendance', attendance!.id, facilityId, 'CARE');
    return { id: attendance!.id, referralId, created: true as const };
  });
}

export async function saveAttendanceDraft(db: Database, actor: Principal, facilityId: string, attendanceId: string, draft: Draft) {
  const [attendance] = await db.update(schema.attendances).set({ draft, updatedAt: new Date() }).where(and(
    eq(schema.attendances.id, attendanceId), eq(schema.attendances.facilityId, facilityId),
    eq(schema.attendances.doctorId, actor.userId), eq(schema.attendances.status, 'IN_PROGRESS'),
  )).returning({ id: schema.attendances.id });
  if (!attendance) throw new ApiError(409, 'INVALID_ATTENDANCE_TRANSITION', 'Atendimento ativo não encontrado');
  return { id: attendance.id, saved: true };
}

export async function getAttendance(db: Database, facilityId: string, attendanceId: string, doctorId: string) {
  const [entry] = await db.select({ id: schema.attendances.id, patientId: schema.patients.id, fullName: schema.patients.fullName,
    status: schema.attendances.status, draft: schema.attendances.draft, startedAt: schema.attendances.startedAt, completedAt: schema.attendances.completedAt,
  }).from(schema.attendances).innerJoin(schema.patients, eq(schema.attendances.patientId, schema.patients.id)).where(and(
    eq(schema.attendances.id, attendanceId), eq(schema.attendances.facilityId, facilityId), eq(schema.attendances.doctorId, doctorId),
  )).limit(1);
  if (!entry) throw new ApiError(404, 'ATTENDANCE_NOT_FOUND', 'Atendimento não encontrado');
  const triage = await db.select().from(schema.triageRecords).where(eq(schema.triageRecords.attendanceId, attendanceId)).limit(1);
  const [referral] = await db.select({ reason: schema.referrals.reason, urgency: schema.referrals.urgency,
    sourceFacilityName: schema.healthcareFacilities.name, encounter: schema.referrals.encounterSnapshot,
  }).from(schema.referrals).innerJoin(schema.healthcareFacilities, eq(schema.healthcareFacilities.id, schema.referrals.sourceFacilityId))
    .where(and(eq(schema.referrals.targetAttendanceId, attendanceId), eq(schema.referrals.targetDoctorId, doctorId), eq(schema.referrals.targetFacilityId, facilityId))).limit(1);
  const history = referral ? [] : await db.select({ id: schema.medicalRecordEntries.id, evolution: schema.medicalRecordEntries.evolution,
    diagnosis: schema.medicalRecordEntries.diagnosis, conduct: schema.medicalRecordEntries.conduct, createdAt: schema.medicalRecordEntries.createdAt,
  }).from(schema.medicalRecordEntries).where(and(eq(schema.medicalRecordEntries.patientId, entry.patientId), eq(schema.medicalRecordEntries.facilityId, facilityId))).orderBy(desc(schema.medicalRecordEntries.createdAt)).limit(20);
  return { ...entry, referral: referral ?? null, triage: triage[0] ?? null, history };
}
