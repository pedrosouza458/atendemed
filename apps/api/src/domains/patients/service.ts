import { and, eq, gt, isNull } from 'drizzle-orm';
import { schema, type Database } from '@atende/database';
import { randomToken, tokenHash } from '@atende/shared';
import { ApiError, audit, type Principal } from '../../core';
import { findPossibleDuplicates } from './repository';
import { normalizeName, type patientInput, type patientUpdate } from './schemas';
import type { z } from 'zod';

type PatientInput = z.infer<typeof patientInput>;
type PatientUpdate = z.infer<typeof patientUpdate>;

export class DuplicatePatientError extends ApiError {
  constructor(public candidates: Array<{ id: string; fullName: string; birthDate: string }>) { super(409, 'POSSIBLE_DUPLICATE', 'Possível cadastro duplicado; revise antes de confirmar'); }
}

export async function createPatient(db: Database, actor: Principal, facilityId: string, input: PatientInput) {
  const duplicates = await findPossibleDuplicates(db, input);
  const exactIdentifier = duplicates.some((row) => (input.cpf && row.cpf === input.cpf) || (input.cns && row.cns === input.cns));
  if (exactIdentifier || (duplicates.length && !input.confirmPossibleDuplicate)) throw new DuplicatePatientError(duplicates.map(({ id, fullName, birthDate }) => ({ id, fullName, birthDate })));
  return db.transaction(async (tx) => {
    const [patient] = await tx.insert(schema.patients).values({
      registeredFacilityId: facilityId, fullName: input.fullName, searchName: normalizeName(input.fullName),
      socialName: input.socialName, cpf: input.cpf, cns: input.cns, birthDate: input.birthDate,
      phone: input.phone, email: input.email?.toLowerCase(), address: input.address,
    }).returning({ id: schema.patients.id });
    await audit(tx, actor, 'PATIENT_CREATED', 'patient', patient!.id, facilityId, 'CARE_REGISTRATION');
    return patient!;
  });
}

export async function updatePatient(db: Database, actor: Principal, facilityId: string, patientId: string, input: PatientUpdate) {
  const [existing] = await db.select().from(schema.patients).where(and(eq(schema.patients.id, patientId), eq(schema.patients.registeredFacilityId, facilityId))).limit(1);
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Paciente não encontrado');
  const merged = { fullName: input.fullName ?? existing.fullName, birthDate: input.birthDate ?? existing.birthDate, cpf: input.cpf ?? existing.cpf ?? undefined, cns: input.cns ?? existing.cns ?? undefined };
  const identityChanged = input.fullName !== undefined || input.birthDate !== undefined || input.cpf !== undefined || input.cns !== undefined;
  const duplicates = identityChanged ? await findPossibleDuplicates(db, merged, patientId) : [];
  if (duplicates.length) throw new DuplicatePatientError(duplicates.map(({ id, fullName, birthDate }) => ({ id, fullName, birthDate })));
  return db.transaction(async (tx) => {
    const [updated] = await tx.update(schema.patients).set({
      ...input, searchName: normalizeName(merged.fullName), email: input.email?.toLowerCase(), updatedAt: new Date(),
    }).where(and(eq(schema.patients.id, patientId), eq(schema.patients.registeredFacilityId, facilityId))).returning({ id: schema.patients.id });
    if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Paciente não encontrado');
    await audit(tx, actor, 'PATIENT_UPDATED', 'patient', patientId, facilityId, 'CARE_ADMINISTRATION');
    return updated;
  });
}

export async function issueLinkChallenge(db: Database, actor: Principal, facilityId: string, patientId: string, input: { fullName: string; birthDate: string }) {
  const [patient] = await db.select().from(schema.patients).where(eq(schema.patients.id, patientId)).limit(1);
  if (!patient || patient.userId || patient.registeredFacilityId !== facilityId || patient.searchName !== normalizeName(input.fullName) || patient.birthDate !== input.birthDate) {
    throw new ApiError(404, 'NOT_FOUND', 'Cadastro não disponível para vínculo');
  }
  const code = randomToken();
  await db.transaction(async (tx) => {
    await tx.insert(schema.patientLinkChallenges).values({ patientId, issuedBy: actor.userId, facilityId, codeHash: await tokenHash(code), expiresAt: new Date(Date.now() + 10 * 60_000) });
    await audit(tx, actor, 'PATIENT_LINK_ISSUED', 'patient', patientId, facilityId, 'IDENTITY_VERIFICATION');
  });
  return { code, expiresIn: 600 };
}

export async function consumeLinkChallenge(db: Database, actor: Principal, code: string) {
  const hash = await tokenHash(code);
  return db.transaction(async (tx) => {
    const [challenge] = await tx.select().from(schema.patientLinkChallenges).where(and(
      eq(schema.patientLinkChallenges.codeHash, hash), isNull(schema.patientLinkChallenges.consumedAt),
      gt(schema.patientLinkChallenges.expiresAt, new Date()),
    )).limit(1);
    if (!challenge) throw new ApiError(422, 'INVALID_LINK_CODE', 'Código inválido ou expirado');
    const [claimed] = await tx.update(schema.patientLinkChallenges).set({ consumedAt: new Date() }).where(and(
      eq(schema.patientLinkChallenges.id, challenge.id), isNull(schema.patientLinkChallenges.consumedAt),
      gt(schema.patientLinkChallenges.expiresAt, new Date()),
    )).returning({ id: schema.patientLinkChallenges.id });
    if (!claimed) throw new ApiError(422, 'INVALID_LINK_CODE', 'Código inválido ou expirado');
    const [patient] = await tx.update(schema.patients).set({ userId: actor.userId, updatedAt: new Date() }).where(and(
      eq(schema.patients.id, challenge.patientId), isNull(schema.patients.userId),
    )).returning({ id: schema.patients.id });
    if (!patient) throw new ApiError(409, 'LINK_CONFLICT', 'Cadastro já vinculado');
    await audit(tx, actor, 'PATIENT_LINKED', 'patient', patient.id, challenge.facilityId, 'IDENTITY_VERIFICATION');
    return patient;
  });
}
