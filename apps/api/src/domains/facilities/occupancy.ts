import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { schema, type Database, type Transaction } from '@atende/database';
import type { Principal } from '../../core';
import { ApiError, audit } from '../../core';
import { issueTicketInTransaction } from '../queue/service';

const dateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
export type OccupancyStatus = 'NORMAL' | 'HIGH' | 'FULL' | 'UNKNOWN';

export function occupancyStatus(active: number, capacity: number | null): OccupancyStatus {
  if (!capacity) return 'UNKNOWN';
  if (active >= capacity) return 'FULL';
  if (active >= capacity * 0.7) return 'HIGH';
  return 'NORMAL';
}

export async function occupancyByFacility(db: Database, facilities: Array<{ id: string; type: string; occupancyCapacity: number | null }>) {
  const eligible = facilities.filter((facility) => facility.type === 'UBS' || facility.type === 'UPA' || facility.type === 'CLINIC');
  if (!eligible.length) return new Map<string, { status: OccupancyStatus; active: number; updatedAt: Date | null }>();
  const rows = await db.select({
    facilityId: schema.facilityArrivals.facilityId,
    active: sql<number>`count(*) filter (where closed_at is null)::int`,
    updatedAt: sql<Date | null>`max(coalesce(${schema.facilityArrivals.closedAt}, ${schema.facilityArrivals.issuedAt}))`,
  }).from(schema.facilityArrivals).where(and(
    inArray(schema.facilityArrivals.facilityId, eligible.map((facility) => facility.id)),
    eq(schema.facilityArrivals.arrivalDate, dateKey()),
  )).groupBy(schema.facilityArrivals.facilityId);
  const counts = new Map(rows.map((row) => [row.facilityId, row]));
  const clinicIds = eligible.filter((facility) => facility.type === 'CLINIC').map((facility) => facility.id);
  if (clinicIds.length) {
    const clinicRows = await db.select({ facilityId: schema.queueTickets.facilityId,
      active: sql<number>`count(*)::int`, updatedAt: sql<Date | null>`max(${schema.queueTickets.issuedAt})`,
    }).from(schema.queueTickets).where(and(
      inArray(schema.queueTickets.facilityId, clinicIds), eq(schema.queueTickets.ticketDate, dateKey()),
      inArray(schema.queueTickets.status, ['WAITING', 'CALLED', 'IN_PROGRESS']),
    )).groupBy(schema.queueTickets.facilityId);
    for (const row of clinicRows) counts.set(row.facilityId, row);
  }
  return new Map(eligible.map((facility) => {
    const row = counts.get(facility.id);
    return [facility.id, { status: occupancyStatus(row?.active ?? 0, facility.occupancyCapacity), active: row?.active ?? 0, updatedAt: row?.updatedAt ?? null }];
  }));
}

export async function listActiveArrivals(db: Database, facilityId: string) {
  return db.select({ id: schema.facilityArrivals.id, issuedAt: schema.facilityArrivals.issuedAt,
    patientName: schema.patients.fullName,
  }).from(schema.facilityArrivals).leftJoin(schema.patients, eq(schema.patients.id, schema.facilityArrivals.patientId)).where(and(
      eq(schema.facilityArrivals.facilityId, facilityId),
      eq(schema.facilityArrivals.arrivalDate, dateKey()),
      isNull(schema.facilityArrivals.closedAt),
    )).orderBy(schema.facilityArrivals.issuedAt);
}

export async function issueArrivalInTransaction(tx: Transaction, actor: Principal, facilityId: string, cpf: string) {
    const [facility] = await tx.select({ name: schema.healthcareFacilities.name, type: schema.healthcareFacilities.type, capacity: schema.healthcareFacilities.occupancyCapacity })
      .from(schema.healthcareFacilities).where(and(eq(schema.healthcareFacilities.id, facilityId), eq(schema.healthcareFacilities.active, true))).limit(1);
    if (!facility) throw new ApiError(404, 'NOT_FOUND', 'Unidade não encontrada');
    if (facility.type !== 'UBS' && facility.type !== 'UPA') throw new ApiError(422, 'OCCUPANCY_UNSUPPORTED', 'Código de lotação disponível somente para UBS e UPA');
    if (!facility.capacity) throw new ApiError(422, 'OCCUPANCY_CAPACITY_REQUIRED', 'Capacidade de referência não configurada para esta unidade');
    const [patient] = await tx.select({ id: schema.patients.id, userId: schema.users.id }).from(schema.patients)
      .leftJoin(schema.users, and(eq(schema.users.id, schema.patients.userId), eq(schema.users.status, 'ACTIVE')))
      .where(eq(schema.patients.cpf, cpf)).limit(1);
    if (!patient) throw new ApiError(404, 'PATIENT_NOT_FOUND', 'Paciente não encontrado');
    const today = dateKey();
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${facilityId}), hashtext(${today + 'arrival'}))`);
    const [count] = await tx.select({ value: sql<number>`count(*)::int` }).from(schema.facilityArrivals).where(and(
      eq(schema.facilityArrivals.facilityId, facilityId), eq(schema.facilityArrivals.arrivalDate, today),
    ));
    const code = String((count?.value ?? 0) + 1).padStart(3, '0');
    const [arrival] = await tx.insert(schema.facilityArrivals).values({ facilityId, patientId: patient.id, arrivalDate: today, code, createdBy: actor.userId }).returning();
    await audit(tx, actor, 'FACILITY_ARRIVAL_ISSUED', 'facility_arrival', arrival!.id, facilityId, 'OCCUPANCY');
    return { ...arrival!, notified: Boolean(patient.userId), notifyUserId: patient.userId, facilityName: facility.name };
}

export async function registerArrivalAndTicket(db: Database, actor: Principal, facilityId: string, cpf: string, department: string, doctorId: string) {
  return db.transaction(async (tx) => {
    const arrival = await issueArrivalInTransaction(tx, actor, facilityId, cpf);
    const ticket = await issueTicketInTransaction(tx, actor, facilityId, { patientId: arrival.patientId!, department, doctorId }, true);
    if (arrival.notifyUserId) await tx.insert(schema.notifications).values({
      userId: arrival.notifyUserId, facilityId, type: 'ARRIVAL_CODE', title: 'Senha de atendimento',
      message: `Sua senha para atendimento na ${arrival.facilityName} é ${ticket.code}. Aguarde ser chamado no setor ${ticket.department}.`,
      resourceType: 'FACILITY_ARRIVAL', resourceId: arrival.id,
    });
    return { arrival: { id: arrival.id, notified: arrival.notified }, ticket };
  });
}

export async function closeArrival(db: Database, actor: Principal, facilityId: string, arrivalId: string) {
  return db.transaction(async (tx) => {
    const [arrival] = await tx.update(schema.facilityArrivals).set({ closedAt: new Date() }).where(and(
      eq(schema.facilityArrivals.id, arrivalId), eq(schema.facilityArrivals.facilityId, facilityId),
      eq(schema.facilityArrivals.arrivalDate, dateKey()), isNull(schema.facilityArrivals.closedAt),
    )).returning({ id: schema.facilityArrivals.id });
    if (!arrival) throw new ApiError(409, 'ARRIVAL_ALREADY_CLOSED', 'Código ativo não encontrado nesta unidade');
    await audit(tx, actor, 'FACILITY_ARRIVAL_CLOSED', 'facility_arrival', arrival.id, facilityId, 'OCCUPANCY');
    return { id: arrival.id, closed: true as const };
  });
}
