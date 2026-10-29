import { z } from 'zod';

const birthDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date <= new Date();
}, 'Data de nascimento inválida');
const digits = (length: number) => z.string().transform((value) => value.replace(/\D/g, '')).pipe(z.string().length(length));

export const patientInput = z.strictObject({
  fullName: z.string().trim().min(2).max(200),
  socialName: z.string().trim().max(200).optional(),
  cpf: digits(11).optional(), cns: digits(15).optional(),
  birthDate,
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(320).optional(),
  address: z.string().trim().max(1000).optional(),
  confirmPossibleDuplicate: z.boolean().optional(),
});

export const patientUpdate = patientInput.omit({ confirmPossibleDuplicate: true }).partial();
export const challengeInput = z.strictObject({ fullName: z.string().trim().min(2).max(200), birthDate, identityVerifiedInPerson: z.literal(true) });
export const consumeChallengeInput = z.strictObject({ code: z.string().min(20).max(256) });
export const normalizeName = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
