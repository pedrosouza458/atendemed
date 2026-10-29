import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { schema, type Database } from '@atende/database';

const sourceAttendance = alias(schema.attendances, 'journey_source_attendance');
const targetAttendance = alias(schema.attendances, 'journey_target_attendance');
const sourceFacility = alias(schema.healthcareFacilities, 'journey_source_facility');
const targetFacility = alias(schema.healthcareFacilities, 'journey_target_facility');

export type FlowStage = 'WAITING_CALL' | 'CALLED' | 'SOURCE_CARE' | 'WAITING_DISPATCH' |
  'CLINIC_RECEPTION' | 'CLINIC_ASSIGNED' | 'CLINIC_ACCEPTED' | 'CLINIC_CARE' |
  'COMPLETED' | 'SOURCE_COMPLETED' | 'DECLINED' | 'CANCELLED';

export function flowStage(value: {
  ticketStatus: string; sourceStatus: string | null; disposition: unknown;
  referralStatus: string | null; targetStatus: string | null;
}): FlowStage {
  if (value.referralStatus === 'COMPLETED') return 'COMPLETED';
  if (value.referralStatus === 'DECLINED') return 'DECLINED';
  if (value.referralStatus === 'ACCEPTED' && value.targetStatus === 'IN_PROGRESS') return 'CLINIC_CARE';
  if (value.referralStatus === 'ACCEPTED') return 'CLINIC_ACCEPTED';
  if (value.referralStatus === 'ASSIGNED') return 'CLINIC_ASSIGNED';
  if (value.referralStatus === 'PENDING') return 'CLINIC_RECEPTION';
  if (value.sourceStatus === 'COMPLETED') return value.disposition === 'REFERRAL' ? 'WAITING_DISPATCH' : 'SOURCE_COMPLETED';
  if (value.sourceStatus === 'IN_PROGRESS') return 'SOURCE_CARE';
  if (value.ticketStatus === 'CALLED') return 'CALLED';
  if (value.ticketStatus === 'CANCELLED' || value.ticketStatus === 'NO_SHOW') return 'CANCELLED';
  return 'WAITING_CALL';
}

export async function latestPatientFlow(db: Database, patientId: string) {
  const [item] = await db.select({
    ticketId: schema.queueTickets.id, code: schema.queueTickets.code,
    ticketStatus: schema.queueTickets.status, issuedAt: schema.queueTickets.issuedAt,
    calledAt: schema.queueTickets.calledAt,
    sourceFacilityName: sourceFacility.name,
    sourceStatus: sourceAttendance.status, sourceCompletedAt: sourceAttendance.completedAt,
    disposition: sourceAttendance.draft,
    referralStatus: schema.referrals.status, referralUpdatedAt: schema.referrals.updatedAt,
    targetFacilityId: targetFacility.id, targetFacilityName: targetFacility.name,
    targetStatus: targetAttendance.status, targetStartedAt: targetAttendance.startedAt,
    targetCompletedAt: targetAttendance.completedAt,
  }).from(schema.queueTickets)
    .innerJoin(sourceFacility, eq(schema.queueTickets.facilityId, sourceFacility.id))
    .leftJoin(sourceAttendance, eq(sourceAttendance.queueTicketId, schema.queueTickets.id))
    .leftJoin(schema.referrals, eq(schema.referrals.attendanceId, sourceAttendance.id))
    .leftJoin(targetFacility, eq(schema.referrals.targetFacilityId, targetFacility.id))
    .leftJoin(targetAttendance, eq(schema.referrals.targetAttendanceId, targetAttendance.id))
    .where(eq(schema.queueTickets.patientId, patientId))
    .orderBy(desc(schema.queueTickets.issuedAt)).limit(1);
  if (!item) return null;
  const disposition = item.disposition && typeof item.disposition === 'object' ? item.disposition.disposition : null;
  return {
    ticketId: item.ticketId, code: item.code, sourceFacilityName: item.sourceFacilityName,
    targetFacilityId: item.targetFacilityId, targetFacilityName: item.targetFacilityName,
    stage: flowStage({ ticketStatus: item.ticketStatus, sourceStatus: item.sourceStatus,
      disposition, referralStatus: item.referralStatus, targetStatus: item.targetStatus }),
    updatedAt: item.targetCompletedAt ?? item.targetStartedAt ?? item.referralUpdatedAt ??
      item.sourceCompletedAt ?? item.calledAt ?? item.issuedAt,
  };
}
