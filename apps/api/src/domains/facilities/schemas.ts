import { z } from 'zod';
import { facilityTypes, staffRoles } from '@atende/shared';

export const facilityInput = z.strictObject({
  name: z.string().trim().min(2).max(200), type: z.enum(facilityTypes),
  ownershipType: z.string().trim().min(2).max(40), susParticipation: z.boolean(),
  cnes: z.string().trim().max(20).optional(), address: z.string().trim().min(5).max(1000),
  latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(),
  phone: z.string().trim().max(30).optional(),
  occupancyCapacity: z.number().int().min(1).max(10000).optional(),
}).superRefine((value, ctx) => {
  if ((value.type === 'UBS' || value.type === 'UPA') && !value.occupancyCapacity) {
    ctx.addIssue({ code: 'custom', path: ['occupancyCapacity'], message: 'Capacidade de referência necessária para lotação' });
  }
});
export const serviceInput = z.strictObject({ code: z.string().trim().regex(/^[A-Z0-9_]{2,80}$/), name: z.string().trim().min(2).max(160) });
export const occupancyCapacityInput = z.strictObject({ occupancyCapacity: z.number().int().min(1).max(10000) });
export const membershipInput = z.strictObject({ userId: z.string().uuid(), role: z.enum(staffRoles) });
export const membershipUpdate = z.strictObject({ status: z.enum(['ACTIVE', 'INACTIVE']) });
export const arrivalCheckIn = z.strictObject({
  cpf: z.string().transform((value) => value.replace(/\D/g, '')).pipe(z.string().length(11)),
  department: z.string().trim().min(2).max(80),
  doctorId: z.string().uuid(),
});
