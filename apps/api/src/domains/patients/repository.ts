import { and, eq, like, or } from 'drizzle-orm';
import { schema, type Database } from '@atende/database';
import { normalizeName } from './schemas';

export async function findPossibleDuplicates(db: Database, input: { fullName: string; birthDate: string; cpf?: string; cns?: string }, excludeId?: string) {
  const conditions = [and(eq(schema.patients.searchName, normalizeName(input.fullName)), eq(schema.patients.birthDate, input.birthDate))];
  if (input.cpf) conditions.push(eq(schema.patients.cpf, input.cpf));
  if (input.cns) conditions.push(eq(schema.patients.cns, input.cns));
  const rows = await db.select({ id: schema.patients.id, fullName: schema.patients.fullName, birthDate: schema.patients.birthDate, cpf: schema.patients.cpf, cns: schema.patients.cns })
    .from(schema.patients).where(or(...conditions)).limit(10);
  return rows.filter((row) => row.id !== excludeId);
}

export async function searchPatients(db: Database, query: string | undefined, facilityId: string) {
  if (!query) return db.select({ id: schema.patients.id, fullName: schema.patients.fullName, socialName: schema.patients.socialName, birthDate: schema.patients.birthDate })
    .from(schema.patients).where(eq(schema.patients.registeredFacilityId, facilityId)).limit(50);
  const digits = query.replace(/\D/g, '');
  const condition = digits.length === 11 ? eq(schema.patients.cpf, digits)
    : digits.length === 15 ? eq(schema.patients.cns, digits)
      : and(eq(schema.patients.registeredFacilityId, facilityId), like(schema.patients.searchName, `${normalizeName(query).replace(/[\\%_]/g, '\\$&')}%`));
  return db.select({ id: schema.patients.id, fullName: schema.patients.fullName, socialName: schema.patients.socialName, birthDate: schema.patients.birthDate })
    .from(schema.patients).where(condition).limit(20);
}
