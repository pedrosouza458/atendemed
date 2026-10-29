import { relations } from 'drizzle-orm';
import { boolean, date, doublePrecision, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const userStatus = pgEnum('user_status', ['ACTIVE', 'DISABLED']);
export const membershipStatus = pgEnum('membership_status', ['ACTIVE', 'INACTIVE']);
export const staffRole = pgEnum('staff_role', ['RECEPTIONIST', 'DOCTOR', 'ADMIN']);
export const facilityType = pgEnum('facility_type', ['UBS', 'UPA', 'CLINIC', 'HOSPITAL', 'DIAGNOSTIC_CENTER']);
export const verificationStatus = pgEnum('verification_status', ['PENDING', 'VERIFIED', 'REJECTED']);
export const queueStatus = pgEnum('queue_status', ['WAITING', 'CALLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']);
export const attendanceStatus = pgEnum('attendance_status', ['IN_PROGRESS', 'COMPLETED']);
export const referralStatus = pgEnum('referral_status', ['PENDING', 'ASSIGNED', 'ACCEPTED', 'DECLINED', 'COMPLETED']);

export const facilityArrivals = pgTable('facility_arrivals', {
  id: id(),
  facilityId: uuid('facility_id').notNull().references(() => healthcareFacilities.id, { onDelete: 'restrict' }),
  patientId: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }),
  arrivalDate: date('arrival_date').notNull(),
  code: varchar('code', { length: 8 }).notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
}, (t) => [uniqueIndex('facility_arrivals_code_uq').on(t.facilityId, t.arrivalDate, t.code), index('facility_arrivals_active_idx').on(t.facilityId, t.closedAt), index('facility_arrivals_patient_idx').on(t.patientId)]);

export const notifications = pgTable('notifications', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  facilityId: uuid('facility_id').references(() => healthcareFacilities.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 60 }).notNull(),
  title: varchar('title', { length: 160 }).notNull(),
  message: text('message').notNull(),
  resourceType: varchar('resource_type', { length: 80 }),
  resourceId: uuid('resource_id'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('notifications_user_created_idx').on(t.userId, t.createdAt), index('notifications_resource_idx').on(t.resourceType, t.resourceId)]);

export const queueTickets = pgTable('queue_tickets', {
  id: id(),
  facilityId: uuid('facility_id').notNull().references(() => healthcareFacilities.id, { onDelete: 'restrict' }),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'restrict' }),
  assignedDoctorId: uuid('assigned_doctor_id').references(() => users.id, { onDelete: 'restrict' }),
  department: varchar('department', { length: 80 }).notNull(),
  ticketDate: date('ticket_date').notNull(),
  code: varchar('code', { length: 12 }).notNull(),
  status: queueStatus('status').notNull().default('WAITING'),
  priority: integer('priority').notNull().default(0),
  priorityReason: text('priority_reason'),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  calledAt: timestamp('called_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
}, (t) => [
  uniqueIndex('queue_tickets_code_uq').on(t.facilityId, t.ticketDate, t.department, t.code),
  index('queue_tickets_queue_idx').on(t.facilityId, t.department, t.status, t.priority, t.issuedAt),
  index('queue_tickets_doctor_idx').on(t.assignedDoctorId, t.status),
]);

export const attendances = pgTable('attendances', {
  id: id(),
  queueTicketId: uuid('queue_ticket_id').unique().references(() => queueTickets.id, { onDelete: 'restrict' }),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'restrict' }),
  facilityId: uuid('facility_id').notNull().references(() => healthcareFacilities.id, { onDelete: 'restrict' }),
  doctorId: uuid('doctor_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  draft: jsonb('draft').$type<Record<string, unknown>>().notNull().default({}),
  status: attendanceStatus('status').notNull().default('IN_PROGRESS'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('attendances_patient_idx').on(t.patientId, t.startedAt)]);

export const triageRecords = pgTable('triage_records', {
  id: id(),
  attendanceId: uuid('attendance_id').notNull().unique().references(() => attendances.id, { onDelete: 'restrict' }),
  doctorId: uuid('doctor_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  reason: text('reason').notNull(),
  notes: text('notes'),
  vitals: jsonb('vitals').$type<Record<string, number | string | null>>().notNull().default({}),
  priority: integer('priority').notNull().default(0),
  priorityReason: text('priority_reason'),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const medicalRecordEntries = pgTable('medical_record_entries', {
  id: id(),
  attendanceId: uuid('attendance_id').notNull().references(() => attendances.id, { onDelete: 'restrict' }),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'restrict' }),
  facilityId: uuid('facility_id').notNull().references(() => healthcareFacilities.id, { onDelete: 'restrict' }),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  evolution: text('evolution').notNull(),
  diagnosis: text('diagnosis'),
  conduct: text('conduct'),
  createdAt: createdAt(),
}, (t) => [index('medical_record_patient_idx').on(t.patientId, t.createdAt)]);

export const medicalDocuments = pgTable('medical_documents', {
  id: id(),
  attendanceId: uuid('attendance_id').notNull().references(() => attendances.id, { onDelete: 'restrict' }),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'restrict' }),
  facilityId: uuid('facility_id').notNull().references(() => healthcareFacilities.id, { onDelete: 'restrict' }),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  objectKey: varchar('object_key', { length: 512 }).notNull().unique(),
  fileName: varchar('file_name', { length: 180 }).notNull(),
  fileSize: integer('file_size').notNull(),
  sha256: varchar('sha256', { length: 64 }).notNull(),
  createdAt: createdAt(),
}, (t) => [index('medical_documents_attendance_idx').on(t.attendanceId, t.createdAt)]);

export const patientReports = pgTable('patient_reports', {
  id: id(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'restrict' }),
  title: varchar('title', { length: 160 }).notNull(),
  description: text('description'),
  objectKey: varchar('object_key', { length: 512 }).notNull().unique(),
  fileName: varchar('file_name', { length: 180 }).notNull(),
  mimeType: varchar('mime_type', { length: 40 }).notNull(),
  fileSize: integer('file_size').notNull(),
  sha256: varchar('sha256', { length: 64 }).notNull(),
  createdAt: createdAt(),
}, (t) => [index('patient_reports_patient_idx').on(t.patientId, t.createdAt)]);

export const referrals = pgTable('referrals', {
  id: id(),
  attendanceId: uuid('attendance_id').notNull().references(() => attendances.id, { onDelete: 'restrict' }),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'restrict' }),
  sourceFacilityId: uuid('source_facility_id').notNull().references(() => healthcareFacilities.id, { onDelete: 'restrict' }),
  targetFacilityId: uuid('target_facility_id').notNull().references(() => healthcareFacilities.id, { onDelete: 'restrict' }),
  targetDoctorId: uuid('target_doctor_id').references(() => users.id, { onDelete: 'restrict' }),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  reason: text('reason').notNull(),
  urgency: varchar('urgency', { length: 20 }).notNull(),
  message: text('message'),
  patientSnapshot: jsonb('patient_snapshot').$type<Record<string, unknown>>().notNull(),
  encounterSnapshot: jsonb('encounter_snapshot').$type<Record<string, unknown>>().notNull(),
  status: referralStatus('status').notNull().default('PENDING'),
  targetAttendanceId: uuid('target_attendance_id').unique().references(() => attendances.id, { onDelete: 'restrict' }),
  createdAt: createdAt(), updatedAt: updatedAt(),
  receivedAt: timestamp('received_at', { withTimezone: true }), completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => [index('referrals_incoming_idx').on(t.targetFacilityId, t.status, t.createdAt), index('referrals_patient_idx').on(t.patientId, t.createdAt)]);

export const users = pgTable('users', {
  id: id(),
  name: varchar('name', { length: 200 }).notNull(),
  email: varchar('email', { length: 320 }).notNull(),
  status: userStatus('status').notNull().default('ACTIVE'),
  isSystemAdmin: boolean('is_system_admin').notNull().default(false),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex('users_email_uq').on(t.email)]);

export const authCredentials = pgTable('auth_credentials', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const authSessions = pgTable('auth_sessions', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('auth_sessions_token_uq').on(t.tokenHash), index('auth_sessions_user_idx').on(t.userId)]);

export const passwordResets = pgTable('password_resets', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('password_resets_token_uq').on(t.tokenHash), index('password_resets_user_idx').on(t.userId)]);

export const patients = pgTable('patients', {
  id: id(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }),
  registeredFacilityId: uuid('registered_facility_id').references(() => healthcareFacilities.id, { onDelete: 'restrict' }),
  fullName: varchar('full_name', { length: 200 }).notNull(),
  searchName: varchar('search_name', { length: 200 }).notNull(),
  socialName: varchar('social_name', { length: 200 }),
  cpf: varchar('cpf', { length: 11 }),
  cns: varchar('cns', { length: 15 }),
  birthDate: date('birth_date').notNull(),
  phone: varchar('phone', { length: 30 }),
  email: varchar('email', { length: 320 }),
  address: text('address'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('patients_user_uq').on(t.userId), uniqueIndex('patients_cpf_uq').on(t.cpf),
  uniqueIndex('patients_cns_uq').on(t.cns), index('patients_name_birth_idx').on(t.searchName, t.birthDate),
]);

export const healthcareFacilities = pgTable('healthcare_facilities', {
  id: id(),
  name: varchar('name', { length: 200 }).notNull(),
  type: facilityType('type').notNull(),
  ownershipType: varchar('ownership_type', { length: 40 }).notNull(),
  susParticipation: boolean('sus_participation').notNull().default(false),
  cnes: varchar('cnes', { length: 20 }),
  address: text('address').notNull(),
  latitude: doublePrecision('latitude'), longitude: doublePrecision('longitude'),
  phone: varchar('phone', { length: 30 }),
  occupancyCapacity: integer('occupancy_capacity'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex('healthcare_facilities_cnes_uq').on(t.cnes), index('healthcare_facilities_type_idx').on(t.type)]);

export const facilityServices = pgTable('facility_services', {
  id: id(),
  facilityId: uuid('facility_id').notNull().references(() => healthcareFacilities.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 80 }).notNull(),
  name: varchar('name', { length: 160 }).notNull(),
  active: boolean('active').notNull().default(true),
}, (t) => [uniqueIndex('facility_services_uq').on(t.facilityId, t.code), index('facility_services_code_idx').on(t.code)]);

export const facilityHours = pgTable('facility_hours', {
  id: id(),
  facilityId: uuid('facility_id').notNull().references(() => healthcareFacilities.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(),
  opensAt: varchar('opens_at', { length: 5 }).notNull(),
  closesAt: varchar('closes_at', { length: 5 }).notNull(),
}, (t) => [index('facility_hours_facility_idx').on(t.facilityId)]);

export const doctors = pgTable('doctors', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  crm: varchar('crm', { length: 20 }).notNull(),
  crmState: varchar('crm_state', { length: 2 }).notNull(),
  specialties: text('specialties').array().notNull().default([]),
  rqe: varchar('rqe', { length: 20 }),
  verificationStatus: verificationStatus('verification_status').notNull().default('PENDING'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex('doctors_user_uq').on(t.userId), uniqueIndex('doctors_crm_state_uq').on(t.crm, t.crmState)]);

export const receptionists = pgTable('receptionists', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  employeeCode: varchar('employee_code', { length: 40 }),
  status: membershipStatus('status').notNull().default('ACTIVE'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex('receptionists_user_uq').on(t.userId)]);

export const staffMemberships = pgTable('staff_memberships', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  facilityId: uuid('facility_id').notNull().references(() => healthcareFacilities.id, { onDelete: 'restrict' }),
  role: staffRole('role').notNull(),
  status: membershipStatus('status').notNull().default('ACTIVE'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex('staff_memberships_uq').on(t.userId, t.facilityId, t.role), index('staff_memberships_facility_idx').on(t.facilityId)]);

export const patientLinkChallenges = pgTable('patient_link_challenges', {
  id: id(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  issuedBy: uuid('issued_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  facilityId: uuid('facility_id').notNull().references(() => healthcareFacilities.id, { onDelete: 'restrict' }),
  codeHash: varchar('code_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('patient_link_code_uq').on(t.codeHash), index('patient_link_patient_idx').on(t.patientId)]);

export const auditLogs = pgTable('audit_logs', {
  id: id(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  facilityId: uuid('facility_id').references(() => healthcareFacilities.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 80 }).notNull(),
  resourceType: varchar('resource_type', { length: 80 }).notNull(),
  resourceId: uuid('resource_id'),
  purpose: varchar('purpose', { length: 80 }).notNull(),
  createdAt: createdAt(),
}, (t) => [index('audit_logs_resource_idx').on(t.resourceType, t.resourceId), index('audit_logs_actor_idx').on(t.actorUserId, t.createdAt)]);

export const usersRelations = relations(users, ({ one, many }) => ({
  patient: one(patients), doctor: one(doctors), receptionist: one(receptionists),
  memberships: many(staffMemberships), sessions: many(authSessions), queueTickets: many(queueTickets), attendances: many(attendances), notifications: many(notifications),
}));
export const patientsRelations = relations(patients, ({ one, many }) => ({ user: one(users, { fields: [patients.userId], references: [users.id] }), arrivals: many(facilityArrivals) }));
export const facilitiesRelations = relations(healthcareFacilities, ({ many }) => ({ services: many(facilityServices), hours: many(facilityHours), memberships: many(staffMemberships), arrivals: many(facilityArrivals), notifications: many(notifications) }));
export const membershipsRelations = relations(staffMemberships, ({ one }) => ({ user: one(users, { fields: [staffMemberships.userId], references: [users.id] }), facility: one(healthcareFacilities, { fields: [staffMemberships.facilityId], references: [healthcareFacilities.id] }) }));
export const servicesRelations = relations(facilityServices, ({ one }) => ({ facility: one(healthcareFacilities, { fields: [facilityServices.facilityId], references: [healthcareFacilities.id] }) }));
export const hoursRelations = relations(facilityHours, ({ one }) => ({ facility: one(healthcareFacilities, { fields: [facilityHours.facilityId], references: [healthcareFacilities.id] }) }));
export const facilityArrivalsRelations = relations(facilityArrivals, ({ one }) => ({ facility: one(healthcareFacilities, { fields: [facilityArrivals.facilityId], references: [healthcareFacilities.id] }), patient: one(patients, { fields: [facilityArrivals.patientId], references: [patients.id] }) }));
export const doctorsRelations = relations(doctors, ({ one }) => ({ user: one(users, { fields: [doctors.userId], references: [users.id] }) }));
export const receptionistsRelations = relations(receptionists, ({ one }) => ({ user: one(users, { fields: [receptionists.userId], references: [users.id] }) }));
export const sessionsRelations = relations(authSessions, ({ one }) => ({ user: one(users, { fields: [authSessions.userId], references: [users.id] }) }));
export const notificationsRelations = relations(notifications, ({ one }) => ({ user: one(users, { fields: [notifications.userId], references: [users.id] }), facility: one(healthcareFacilities, { fields: [notifications.facilityId], references: [healthcareFacilities.id] }) }));
export const queueRelations = relations(queueTickets, ({ one }) => ({ patient: one(patients, { fields: [queueTickets.patientId], references: [patients.id] }), facility: one(healthcareFacilities, { fields: [queueTickets.facilityId], references: [healthcareFacilities.id] }) }));
export const attendancesRelations = relations(attendances, ({ one, many }) => ({ patient: one(patients, { fields: [attendances.patientId], references: [patients.id] }), ticket: one(queueTickets, { fields: [attendances.queueTicketId], references: [queueTickets.id] }), records: many(medicalRecordEntries), triage: one(triageRecords) }));
